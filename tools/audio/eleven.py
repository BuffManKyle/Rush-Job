#!/usr/bin/env python3
"""ElevenLabs batch generator for Rush Job's sound effects and music. DRY RUN BY DEFAULT.

    py tools/audio/export_list.py                          # vault notes -> tools/audio/sounds.json
    py tools/audio/eleven.py balance                       # free: plan tier and credits used / limit
    py tools/audio/eleven.py plan [filters]                # free: what would be bought, seconds, credits
    py tools/audio/eleven.py run  [filters] --buy          # generate every missing take under the cap
    py tools/audio/eleven.py redo <id> [--takes N] --buy   # add N new takes of one sound (old takes kept)
    py tools/audio/eleven.py review                        # copy takes into the vault, (re)write 02 Review.md
    py tools/audio/eleven.py rates                         # measured credits per second from the ledger

Filters: --priority P1[,P2]  --kind sfx|music  --only id1,id2  --group "Weapons"  --limit N  --max-takes N

Rules (same as tools/gen/meshy.py):
  * The key comes from ELEVENLABS_API_KEY, or else ~/.rushjob/elevenlabs.key (outside the repo).
    It is never printed, logged or written anywhere.
  * Nothing is bought without --buy. Every paid call is appended to tools/audio/spend.jsonl BEFORE
    it's made, and refused if it would cross the cap in tools/audio/caps.json (null = Kyle hasn't
    set one, so nothing is bought).
  * A take that exists on disk is never bought again. Takes live in assets/audio/_takes/<id>/tNN.*
    with a tNN.json sidecar holding the exact request, so any take can be traced and reproduced.
  * Credit costs are ESTIMATES until reconciled: after each call the script reads the account's
    used-credit counter and records the real delta. `rates` turns those into measured costs.
"""
import argparse, json, os, re, shutil, ssl, sys, threading, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

try:
    import certifi
    CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    CTX = ssl.create_default_context()

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
VAULT = os.path.join(os.path.dirname(ROOT), "Rush Job Docs")
SOUNDS = os.path.join(HERE, "sounds.json")
SPEND = os.path.join(HERE, "spend.jsonl")
CAPS = os.path.join(HERE, "caps.json")
TAKES = os.path.join(ROOT, "assets", "audio", "_takes")
REVIEW = os.path.join(VAULT, "Audio", "02 Review.md")
VAULT_TAKES = os.path.join(VAULT, "Audio", "takes")
API = "https://api.elevenlabs.io"
KEY_FILE = os.path.join(os.path.expanduser("~"), ".rushjob", "elevenlabs.key")

# Estimates until `rates` has real numbers from the ledger. Deliberately on the high side.
EST_CREDITS_PER_SEC = {"sfx": 40.0, "music": 60.0}
FORMATS = {"sfx": "opus_48000_128", "music": "opus_48000_192"}
FALLBACK_FORMAT = "mp3_44100_128"
LOCK = threading.Lock()


# ---------- plumbing ----------

def key():
    k = os.environ.get("ELEVENLABS_API_KEY")
    if not k and os.path.exists(KEY_FILE):
        k = open(KEY_FILE, encoding="utf-8").read().strip()
    if not k:
        raise SystemExit(f"No ElevenLabs key: set ELEVENLABS_API_KEY or save it in {KEY_FILE} (never in the repo)")
    return k


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def append(path, row):
    with LOCK:
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(row) + "\n")


def request(method, path, body=None, timeout=300):
    req = urllib.request.Request(API + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"xi-api-key": key(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
            headers = {k.lower(): v for k, v in r.headers.items()
                       if any(s in k.lower() for s in ("cost", "character", "request-id", "history"))}
            return r.read(), headers
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"ElevenLabs {e.code} on {method} {path.split('?')[0]}: "
                           f"{e.read().decode(errors='replace')[:400]}")


def subscription():
    data, _ = request("GET", "/v1/user/subscription", timeout=30)
    return json.loads(data)


def used_credits():
    try:
        return subscription().get("character_count")
    except Exception:
        return None


def ledger():
    if not os.path.exists(SPEND):
        return []
    return [json.loads(l) for l in open(SPEND, encoding="utf-8") if l.strip()]


def measured_rates():
    rows = [r for r in ledger() if r.get("status") == "ok" and r.get("credits_actual") is not None]
    out = {}
    for kind in ("sfx", "music"):
        rs = [r for r in rows if r["kind"] == kind]
        secs = sum(r["seconds"] for r in rs)
        if secs:
            out[kind] = sum(r["credits_actual"] for r in rs) / secs
    return out


def rate(kind):
    return measured_rates().get(kind, EST_CREDITS_PER_SEC[kind])


def spent():
    last = {}   # (id, take) -> the call's latest row: pending, then ok or failed
    for r in ledger():
        if r.get("status") in ("pending", "ok", "failed"):
            last[(r["id"], r["take"])] = r
    total = 0.0
    for r in last.values():
        if r["status"] == "ok":
            total += r["credits_actual"] if r.get("credits_actual") is not None else r["credits_est"]
        elif r["status"] == "pending":     # crashed mid-call: assume it was charged
            total += r["credits_est"]
    return total


def cap():
    if not os.path.exists(CAPS):
        return None
    return json.load(open(CAPS, encoding="utf-8")).get("elevenlabs_credits")


# ---------- jobs and takes ----------

def jobs():
    if not os.path.exists(SOUNDS):
        raise SystemExit("No tools/audio/sounds.json: run tools/audio/export_list.py first")
    return json.load(open(SOUNDS, encoding="utf-8"))["jobs"]


def take_files(sid):
    d = os.path.join(TAKES, sid)
    if not os.path.isdir(d):
        return []
    return sorted(f for f in os.listdir(d) if re.match(r"t\d\d\.(ogg|mp3|opus)$", f))


def filtered(a):
    js = jobs()
    if a.priority:
        ps = set(a.priority.split(","))
        js = [j for j in js if j["priority"] in ps]
    if a.kind:
        js = [j for j in js if j["kind"] == a.kind]
    if a.only:
        ids = a.only.split(",")
        unknown = set(ids) - {j["id"] for j in js}
        if unknown:
            raise SystemExit(f"unknown ids: {sorted(unknown)}")
        js = [j for j in js if j["id"] in ids]
    if a.group:
        js = [j for j in js if a.group.lower() in j["group"].lower()]
    return js


def todo(js, extra=None, max_takes=None):
    """(job, take number, prompt) for every take not yet on disk."""
    out = []
    for j in js:
        have = len(take_files(j["id"]))
        want = j["takes"] if extra is None else have + extra
        if max_takes:
            want = min(want, max_takes)
        for n in range(have + 1, want + 1):
            prompts = j.get("take_prompts")
            prompt = prompts[(n - 1) % len(prompts)] if prompts else j["prompt"]
            out.append((j, n, prompt))
    return out


def body_for(j, prompt):
    if j["kind"] == "sfx":
        return "/v1/sound-generation", {"text": prompt, "duration_seconds": j["seconds"],
                                        "prompt_influence": 0.5, "loop": j["loop"], "model_id": j["model_id"]}
    return "/v1/music", {"prompt": prompt, "music_length_ms": int(j["seconds"] * 1000),
                         "model_id": j["model_id"], "force_instrumental": True}


def ext_for(data):
    if data[:4] == b"OggS":
        return "ogg"
    if data[:3] == b"ID3" or (len(data) > 1 and data[0] == 0xFF and data[1] & 0xE0 == 0xE0):
        return "mp3"
    return "opus"


def buy_one(j, n, prompt):
    path, body = body_for(j, prompt)
    est = j["seconds"] * rate(j["kind"])
    with LOCK:
        c = cap()
        if c is None:
            raise SystemExit("refusing: no ElevenLabs cap in tools/audio/caps.json (Kyle sets it)")
        if spent() + est > c:
            raise RuntimeError(f"cap: {j['id']} t{n:02d} (~{est:.0f}) would cross the cap of {c}")
        row = {"t": now(), "id": j["id"], "take": n, "kind": j["kind"], "seconds": j["seconds"],
               "credits_est": round(est, 1), "status": "pending"}
        with open(SPEND, "a", encoding="utf-8") as f:
            f.write(json.dumps(row) + "\n")
    fmt = FORMATS[j["kind"]]
    try:
        try:
            data, headers = request("POST", f"{path}?output_format={fmt}", body)
        except RuntimeError as e:
            if " 422 " in str(e) and "output_format" in str(e):   # validation errors aren't billed
                fmt = FALLBACK_FORMAT
                data, headers = request("POST", f"{path}?output_format={fmt}", body)
            else:
                raise
    except Exception as e:
        append(SPEND, {**row, "t": now(), "status": "failed", "error": str(e)[:300], "credits_est": 0})
        raise
    ext = ext_for(data)
    d = os.path.join(TAKES, j["id"])
    os.makedirs(d, exist_ok=True)
    out = os.path.join(d, f"t{n:02d}.{ext}")
    open(out, "wb").write(data)
    json.dump({"id": j["id"], "take": n, "t": now(), "endpoint": path, "output_format": fmt,
               "request": body, "response_headers": headers, "bytes": len(data)},
              open(os.path.join(d, f"t{n:02d}.json"), "w", encoding="utf-8"), indent=1)
    cost = headers.get("character-cost") or headers.get("x-character-cost")
    append(SPEND, {**row, "t": now(), "status": "ok", "file": os.path.relpath(out, ROOT).replace("\\", "/"),
                   "credits_actual": float(cost) if cost else None})
    return out


def reconcile(before, rows):
    """Spread the account's real credit delta over this run's calls that had no per-call cost."""
    after = used_credits()
    if before is None or after is None or not rows:
        return None
    delta = after - before
    est_total = sum(r[1] for r in rows) or 1
    for (sid, est, n, kind, secs) in [(r[0], r[1], r[2], r[3], r[4]) for r in rows]:
        append(SPEND, {"t": now(), "id": sid, "take": n, "kind": kind, "seconds": secs, "status": "reconcile",
                       "credits_est": 0, "credits_share": round(delta * est / est_total, 1)})
    return delta


# ---------- commands ----------

def cmd_balance(a):
    try:
        s = subscription()
    except RuntimeError as e:
        if "user_read" in str(e):
            raise SystemExit("This API key can't read the account (no user_read permission). Generation still "
                             "works; costs come from response headers. Enable 'User: read' on the key to see the balance.")
        raise
    print(f"tier {s.get('tier')}  credits used {s.get('character_count')} of {s.get('character_limit')}  "
          f"resets {datetime.fromtimestamp(s['next_character_count_reset_unix']).date() if s.get('next_character_count_reset_unix') else '?'}")


def summarize(items, label):
    by = {}
    for j, n, _ in items:
        k = (j["kind"], j["priority"])
        b = by.setdefault(k, [0, 0.0, 0.0])
        b[0] += 1
        b[1] += j["seconds"]
        b[2] += j["seconds"] * rate(j["kind"])
    tot = [0, 0.0, 0.0]
    print(f"{label}:")
    for k in sorted(by):
        n, s, c = by[k]
        tot = [tot[0] + n, tot[1] + s, tot[2] + c]
        print(f"  {k[0]:5} {k[1]}  {n:4} takes  {s:7.0f} s  ~{c:8.0f} credits")
    print(f"  total       {tot[0]:4} takes  {tot[1]:7.0f} s  ~{tot[2]:8.0f} credits")
    r = measured_rates()
    print(f"  rates: sfx {rate('sfx'):.1f}/s ({'measured' if 'sfx' in r else 'estimate'}), "
          f"music {rate('music'):.1f}/s ({'measured' if 'music' in r else 'estimate'})")
    print(f"  spent so far ~{spent():.0f} of cap {cap()}")
    return tot


def cmd_plan(a):
    js = filtered(a)
    items = todo(js, max_takes=a.max_takes)
    if a.limit:
        items = items[:a.limit]
    done = sum(len(take_files(j["id"])) for j in js)
    print(f"{len(js)} sounds selected, {done} takes already on disk (never re-bought)")
    summarize(items, "would buy")
    if a.verbose:
        for j, n, p in items:
            print(f"  {j['id']} t{n:02d}  {j['seconds']} s{' loop' if j['loop'] else ''}  {p[:70]}")


def run_items(items, workers):
    if not items:
        print("nothing to buy: every selected take is already on disk"); return
    if cap() is None:
        raise SystemExit("refusing: no ElevenLabs cap in tools/audio/caps.json (Kyle sets it)")
    before = used_credits()
    ok, failed, rows = 0, [], []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(buy_one, j, n, p): (j, n) for j, n, p in items}
        for f in as_completed(futs):
            j, n = futs[f]
            try:
                out = f.result()
                ok += 1
                rows.append((j["id"], j["seconds"] * rate(j["kind"]), n, j["kind"], j["seconds"]))
                print(f"  ok   {j['id']} t{n:02d} -> {os.path.relpath(out, ROOT)}")
            except SystemExit:
                raise
            except Exception as e:
                failed.append((j["id"], n, str(e)))
                print(f"  FAIL {j['id']} t{n:02d}: {str(e)[:200]}")
    delta = reconcile(before, rows)
    print(f"done: {ok} ok, {len(failed)} failed. Account credits used this run: "
          f"{delta if delta is not None else 'unknown'}")


def cmd_run(a):
    items = todo(filtered(a), max_takes=a.max_takes)
    if a.limit:
        items = items[:a.limit]
    summarize(items, "BUY" if a.buy else "DRY RUN")
    if not a.buy:
        print("nothing bought; add --buy to spend"); return
    run_items(items, a.workers)


def cmd_redo(a):
    js = [j for j in jobs() if j["id"] == a.id]
    if not js:
        raise SystemExit(f"unknown id {a.id}")
    items = todo(js, extra=a.takes)
    summarize(items, "BUY" if a.buy else "DRY RUN")
    if not a.buy:
        print("nothing bought; add --buy to spend"); return
    run_items(items, 1)


def cmd_rates(a):
    r = measured_rates()
    print("measured credits per second:", {k: round(v, 1) for k, v in r.items()} or "none yet")
    print(f"spent ~{spent():.0f} of cap {cap()}")


# ---------- review page ----------

REVIEW_LINE = re.compile(r"^- \[(?P<mark>[ xX])\] `(?P<id>[a-z0-9_.]+)` (?P<take>t\d\d)\b")


def existing_review():
    """Keep Kyle's ticks and notes when the page is rebuilt."""
    keep = {}
    if not os.path.exists(REVIEW):
        return keep
    cur = None
    for line in open(REVIEW, encoding="utf-8"):
        m = REVIEW_LINE.match(line)
        if m:
            cur = (m["id"], m["take"])
            keep[cur] = {"mark": m["mark"], "notes": []}
            continue
        if cur and re.match(r"^\s+>", line):
            keep[cur]["notes"].append(line.rstrip("\n"))
        elif cur and line.strip() and not line.startswith("\t- ") and not line.startswith("    "):
            cur = None
    return keep


def cmd_review(a):
    keep = existing_review()
    os.makedirs(VAULT_TAKES, exist_ok=True)
    js = jobs()
    lines = ["# Review", "",
             "Every ElevenLabs take, to listen to and judge. Back to [[00 Sound list]] · [[01 Music]] · [[03 ElevenLabs log]].",
             "", "Built by `tools/audio/eleven.py review` in the game repo. Rebuilding keeps your ticks and notes.",
             "", "- **Approve a take:** tick its box. One approved take per sound is enough (for sliced sounds, the clip they're cut from).",
             "- **Redo:** leave it unticked and add a note on the next line, indented, starting with `>`, e.g. `> too clicky, wants more body`. Tell me in chat and I'll regenerate.",
             "- **Cut a sound entirely:** `> cut`.", ""]
    total = approved = 0
    group = None
    for j in js:
        files = take_files(j["id"])
        if not files:
            continue
        if j["group"] != group:
            group = j["group"]
            lines += ["", f"## {group}", ""]
        meta = f"{j['seconds']:g} s" + (" · loop" if j["loop"] else "") + \
               (f" · slice into {j['slice']}" if j["slice"] > 0 else "") + f" · {j['priority']} → `{j['target']}`"
        for f in files:
            take = f.split(".")[0]
            vault_name = f"{j['id']}__{f}"
            src = os.path.join(TAKES, j["id"], f)
            dst = os.path.join(VAULT_TAKES, vault_name)
            if not os.path.exists(dst) or os.path.getsize(dst) != os.path.getsize(src):
                shutil.copyfile(src, dst)
            k = keep.get((j["id"], take), {"mark": " ", "notes": []})
            total += 1
            approved += k["mark"] in "xX"
            lines.append(f"- [{k['mark']}] `{j['id']}` {take} · {meta}")
            lines.append(f"\t![[{vault_name}]]")
            if j.get("when") and take == "t01":
                lines.append(f"\t*When:* {j['when']}")
            lines += k["notes"]
    lines[4:4] = [f"**{approved} of {total} takes approved.**", ""]
    open(REVIEW, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print(f"wrote {REVIEW} ({total} takes, {approved} approved); takes copied to {VAULT_TAKES}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def filters(p):
        p.add_argument("--priority"); p.add_argument("--kind", choices=["sfx", "music"])
        p.add_argument("--only"); p.add_argument("--group"); p.add_argument("--limit", type=int)
        p.add_argument("--max-takes", type=int, help="buy at most this many takes per sound (pilots)")
        p.add_argument("-v", "--verbose", action="store_true")

    sub.add_parser("balance")
    filters(sub.add_parser("plan"))
    p = sub.add_parser("run"); filters(p); p.add_argument("--buy", action="store_true")
    p.add_argument("--workers", type=int, default=3)
    p = sub.add_parser("redo"); p.add_argument("id"); p.add_argument("--takes", type=int, default=1)
    p.add_argument("--buy", action="store_true")
    sub.add_parser("review")
    sub.add_parser("rates")
    a = ap.parse_args()
    {"balance": cmd_balance, "plan": cmd_plan, "run": cmd_run, "redo": cmd_redo,
     "review": cmd_review, "rates": cmd_rates}[a.cmd](a)


if __name__ == "__main__":
    main()
