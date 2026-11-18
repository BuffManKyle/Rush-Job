#!/usr/bin/env python3
"""Meshy client for Rush Job. DRY RUN BY DEFAULT: it only spends with --buy.

    py tools/gen/meshy.py balance                     # free: show the credit balance
    py tools/gen/meshy.py run tools/gen/specs/x.json  # dry run: prints what it would buy and the cost
    py tools/gen/meshy.py run tools/gen/specs/x.json --buy
    py tools/gen/meshy.py poll <endpoint> <task_id>   # free: re-poll a job (never re-buy on a timeout)

Rules (see the opengame-assets skill):
  * The key comes from MESHY_API_KEY, or else from ~/.rushjob/meshy.key (outside the repo).
    Never commit it, never ship it.
  * Every paid call is appended to tools/gen/spend.jsonl BEFORE it is made, and the call is refused
    when it would cross the cap in tools/gen/caps.json. A null cap means "Kyle hasn't set one", and
    nothing is bought.
  * Every job is journalled (request, task id, file hashes) in tools/gen/jobs.jsonl, and results are
    downloaded to assets/gen/meshy/ as soon as they finish, because Meshy deletes them after 3 days.
  * Unknown spec fields are refused (a misspelt parameter is silently ignored by the API and still
    billed), and the model version is pinned in every spec.

Endpoints and credit costs are from Meshy's public API docs as of late 2026. CHECK THEM against
the dashboard on the first real call; costs below are estimates until reconciled.
"""
import base64, hashlib, json, os, sys, time, urllib.request, urllib.error
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
API = "https://api.meshy.ai/openapi"
SPEND = os.path.join(HERE, "spend.jsonl")
JOBS = os.path.join(HERE, "jobs.jsonl")
CAPS = os.path.join(HERE, "caps.json")
OUT = os.path.join(ROOT, "assets", "gen", "meshy")
USD_PER_CREDIT = 0.02          # estimate (30 credits ~ $0.60); reconcile with the dashboard

# endpoint -> (path, allowed request fields, estimated credits)
KINDS = {
    "image-to-3d": ("/v1/image-to-3d", {"image_url", "ai_model", "topology", "target_polycount",
                                         "should_remesh", "should_texture", "enable_pbr", "texture_prompt",
                                         "symmetry_mode", "pose_mode"}, 30),
    "text-to-3d":  ("/v2/text-to-3d", {"mode", "prompt", "art_style", "ai_model", "topology",
                                        "target_polycount", "should_remesh", "symmetry_mode", "pose_mode",
                                        "preview_task_id", "enable_pbr", "texture_prompt"}, 20),
    "rigging":     ("/v1/rigging", {"input_task_id", "model_url", "height_meters"}, 5),
    "animations":  ("/v1/animations", {"rig_task_id", "action_id", "post_process"}, 3),
}


KEY_FILE = os.path.join(os.path.expanduser("~"), ".rushjob", "meshy.key")   # outside the repo


def key():
    k = os.environ.get("MESHY_API_KEY")
    if not k and os.path.exists(KEY_FILE):
        k = open(KEY_FILE).read().strip()
    if not k:
        raise SystemExit(f"No Meshy key: set MESHY_API_KEY or save it in {KEY_FILE} (never in the repo)")
    return k


def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {key()}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def spent(provider="meshy"):
    if not os.path.exists(SPEND):
        return 0.0
    return sum(json.loads(l)["usd"] for l in open(SPEND) if l.strip() and json.loads(l)["provider"] == provider)


def append(path, row):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "a") as f:
        f.write(json.dumps(row) + "\n")


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def run(spec_path, buy):
    spec = json.load(open(spec_path))
    kind, job, req = spec["kind"], spec["job"], dict(spec["request"])
    path, allowed, credits = KINDS[kind]
    bad = set(req) - allowed
    if bad:
        raise SystemExit(f"refusing: unknown request fields {sorted(bad)} for {kind}")
    if kind in ("image-to-3d", "text-to-3d") and "ai_model" not in req:
        raise SystemExit("refusing: pin ai_model in the spec")
    if str(req.get("image_url", "")).startswith("file:"):
        img = os.path.join(ROOT, req["image_url"][5:])
        req["image_url"] = "data:image/png;base64," + base64.b64encode(open(img, "rb").read()).decode()
    usd = credits * USD_PER_CREDIT
    caps = json.load(open(CAPS))
    cap = caps.get("meshy")
    total = spent()
    print(f"{'BUY' if buy else 'DRY RUN'}  {kind}  {job}  ~{credits} credits (~${usd:.2f})  "
          f"meshy ${total:.2f} -> ${total + usd:.2f} of cap {cap}")
    if not buy:
        print("  nothing bought; add --buy to spend"); return
    if cap is None:
        raise SystemExit("refusing: no Meshy cap set in tools/gen/caps.json (Kyle sets it)")
    if total + usd > cap:
        raise SystemExit("refusing: this call would cross the Meshy cap")
    append(SPEND, {"t": now(), "provider": "meshy", "stream": spec.get("stream", "chars"), "job": job,
                   "kind": kind, "usd": usd, "credits_est": credits, "provider_total": round(total + usd, 2), "cap": cap})
    res = call("POST", path, req)
    tid = res.get("result")
    append(JOBS, {"t": now(), "job": job, "kind": kind, "task_id": tid, "spec": os.path.relpath(spec_path, ROOT)})
    print(f"  task {tid}; polling")
    poll(kind, tid, job)


def poll(kind, tid, job=None):
    path = KINDS[kind][0]
    while True:
        r = call("GET", f"{path}/{tid}")
        st = r.get("status")
        print(f"  {st} {r.get('progress', '')}")
        if st in ("SUCCEEDED", "FAILED", "CANCELED", "EXPIRED"):
            break
        time.sleep(10)
    if st != "SUCCEEDED":
        raise SystemExit(f"job {tid} ended {st}: {r.get('task_error')}")
    files = {}
    urls = dict(r.get("model_urls") or {})
    urls.update({k: v for k, v in (r.get("result") or {}).items() if isinstance(v, str) and v.startswith("http")})
    for name, url in urls.items():
        if not url:
            continue
        ext = url.split("?")[0].rsplit(".", 1)[-1][:5]
        dst = os.path.join(OUT, f"{job or tid}_{name}.{ext}")
        os.makedirs(OUT, exist_ok=True)
        data = urllib.request.urlopen(url, timeout=120).read()
        open(dst, "wb").write(data)
        files[os.path.relpath(dst, ROOT)] = hashlib.sha256(data).hexdigest()[:16]
        print(f"  saved {os.path.relpath(dst, ROOT)}")
    append(JOBS, {"t": now(), "job": job, "kind": kind, "task_id": tid, "status": st, "files": files})


def main():
    a = sys.argv[1:]
    if not a or a[0] in ("-h", "--help", "help"):
        print(__doc__); return            # --help never buys anything
    if a[0] == "balance":
        print(call("GET", "/v1/balance"))
    elif a[0] == "run" and len(a) >= 2:
        unknown = [x for x in a[2:] if x != "--buy"]
        if unknown:
            raise SystemExit(f"unknown flags {unknown}; nothing bought")
        run(a[1], "--buy" in a[2:])
    elif a[0] == "poll" and len(a) == 3:
        poll(a[1], a[2])
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
