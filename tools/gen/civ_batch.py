#!/usr/bin/env python3
"""Meshy civilian cast for Glint & Sons (owner: rj-street). Writes one spec per character and stage
under tools/gen/specs/civ/ and runs it through tools/gen/meshy.py (dry run unless --buy).

    py tools/gen/civ_batch.py preview            # dry run: what the previews would cost
    py tools/gen/civ_batch.py preview --buy      # buy the 10 untextured previews (shape check)
    py tools/gen/civ_batch.py refine --buy --only clerk,manager
    py tools/gen/civ_batch.py rig --buy
    py tools/gen/civ_batch.py idle --buy
    py tools/gen/civ_batch.py ziptied --buy

Each stage takes the previous stage's task id from tools/gen/jobs.jsonl, so stages run in order and
nothing is ever bought twice: a character whose job already SUCCEEDED is skipped.
Estimate (pilot charges): preview 5 + refine 10 + rig 5 + idle 3 + ziptied 3 = 26 credits each.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import meshy  # noqa: E402

SPECS = os.path.join(HERE, "specs", "civ")
STYLE = ("stylized low-poly, A-pose with arms held well out from the body, chunky readable silhouette, "
         "slightly oversized head and hands, close-fitting clothes, flat colors, game character, full body, front facing")
NO_RED = "no red, no logos, no text"

# name -> (role, look prompt, texture prompt)
CAST = {
    "clerk": ("staff", "young woman jewelry shop clerk, slim, dark hair in a neat bun, teal blouse with a small gold name badge, "
              "black trousers, black flat shoes, light brown skin",
              "teal blouse, gold badge, black trousers and shoes, dark hair, light brown skin"),
    "manager": ("staff", "older heavy-set man, jewelry store manager, balding with grey hair at the sides, round glasses, "
                "cream shirt under a navy waistcoat, gold tie, grey trousers, brown shoes, pale skin",
                "cream shirt, navy waistcoat, gold tie, grey trousers, brown shoes, grey hair, pale skin"),
    "cust_elder": ("customer", "short stout elderly woman, curly white hair, plum cardigan over a cream blouse, pearl necklace, "
                   "grey skirt to the knee, sensible black shoes, pale skin",
                   "plum cardigan, cream blouse, white pearls, grey skirt, black shoes, white hair"),
    "cust_young": ("customer", "tall slim young man, curly black hair, mustard yellow sweater over a white collar, dark blue jeans, "
                   "white sneakers, dark brown skin",
                   "mustard sweater, white collar, dark blue jeans, white sneakers, black hair, dark brown skin"),
    "cust_coat": ("customer", "middle-aged athletic woman, auburn hair in a ponytail, short sage green jacket, dark grey trousers, "
                  "ankle boots, tan skin",
                  "sage green jacket, dark grey trousers, brown boots, auburn hair, tan skin"),
    "cust_suit": ("customer", "stocky middle-aged man with a short black beard, slate blue blazer, open-collar white shirt, "
                  "charcoal trousers, brown loafers, olive skin",
                  "slate blue blazer, white shirt, charcoal trousers, brown shoes, black beard, olive skin"),
    "ped_teen": ("pedestrian", "skinny teenage boy, navy hoodie, baseball cap worn backwards, headphones around the neck, "
                 "light blue jeans, chunky sneakers, light skin with freckles",
                 "navy hoodie, grey cap, black headphones, light blue jeans, white sneakers"),
    "ped_courier": ("pedestrian", "broad-shouldered delivery courier, teal work jacket with reflective stripes, cargo trousers, "
                    "knit beanie, work boots, dark skin",
                    "teal jacket, silver reflective stripes, khaki cargo trousers, grey beanie, black boots, dark skin"),
    "ped_oldman": ("pedestrian", "thin elderly man, brown flat cap, beige cardigan, brown trousers, white moustache, "
                   "slightly stooped, pale skin",
                   "brown flat cap, beige cardigan, brown trousers, white moustache, pale skin"),
    "ped_woman": ("pedestrian", "young woman with a short black bob haircut, plum turtleneck, short cream jacket, black leggings, "
                  "black boots, east asian features",
                  "plum turtleneck, cream jacket, black leggings and boots, black hair"),
}

STAGES = {
    "preview": ("text-to-3d", None),
    "refine": ("text-to-3d", "preview"),
    "rig": ("rigging", "refine"),
    "idle": ("animations", "rig"),
    "ziptied": ("animations", "rig"),
}
ACTION = {"idle": 0, "ziptied": 363}       # same library actions as the pilots


def jobs():
    out = {}
    if os.path.exists(meshy.JOBS):
        for line in open(meshy.JOBS):
            r = json.loads(line)
            if r.get("status"):
                out[r["job"]] = r          # finished rows carry a status
            elif r["job"] not in out:
                out[r["job"]] = r
    return out


def spec(name, stage, prev_tid):
    role, look, tex = CAST[name]
    job = f"civ-{name}-{stage}"
    if stage == "preview":
        req = {"mode": "preview", "ai_model": "meshy-6-lite", "prompt": f"{look}, {STYLE}, {NO_RED}",
               "art_style": "realistic", "topology": "triangle", "target_polycount": 6000,
               "should_remesh": True, "symmetry_mode": "on", "pose_mode": "a-pose"}
    elif stage == "refine":
        req = {"mode": "refine", "preview_task_id": prev_tid, "ai_model": "meshy-6-lite", "enable_pbr": False,
               "texture_prompt": f"flat stylized colors, {tex}, {NO_RED}"}
    elif stage == "rig":
        req = {"input_task_id": prev_tid, "height_meters": 1.62 if name in ("cust_elder", "ped_teen") else 1.75}
    else:
        req = {"rig_task_id": prev_tid, "action_id": ACTION[stage]}
    kind = STAGES[stage][0]
    s = {"_note": f"Civilian cast ({role}): {name}, stage {stage}. Written by tools/gen/civ_batch.py.",
         "kind": kind, "job": job, "stream": "civilians", "request": req}
    os.makedirs(SPECS, exist_ok=True)
    path = os.path.join(SPECS, f"{name}_{stage}.json")
    json.dump(s, open(path, "w"), indent=2)
    return path, job


def evidence():
    """Markdown rows for ASSETS.md 'Generated-file evidence', one per bought civilian job."""
    charged = {}
    for line in open(meshy.SPEND):
        r = json.loads(line)
        if r.get("kind") == "reconcile" and str(r.get("job", "")).startswith("civ-"):
            charged[r["job"]] = r.get("charged")
    what = {"preview": "untextured shape check (meshy-6-lite)", "refine": "textured mesh (meshy-6-lite, no PBR)",
            "rig": "auto-rig, plus the free walk and run clips", "idle": "`idle` clip (library action 0)",
            "ziptied": "`ziptied` clip (library action 363)"}
    kinds = {"preview": "Meshy text-to-3d preview", "refine": "Meshy text-to-3d", "rig": "Meshy rigging",
             "idle": "Meshy animations", "ziptied": "Meshy animations"}
    for job, r in jobs().items():
        if not job.startswith("civ-") or r.get("status") != "SUCCEEDED":
            continue
        _, name, stage = job.split("-", 2)
        files = ", ".join(f"`{f}`".replace("\\", "/") for f in r.get("files", {}) if f.endswith(".glb"))
        print(f"| {files} | {kinds[stage]} | `{r['task_id']}` | {r['t'][:10]} | {charged.get(job, '?')} credits | "
              f"Civilian `{name}`: {what[stage]} |")


def main():
    args = sys.argv[1:]
    if args and args[0] == "evidence":
        return evidence()
    if not args or args[0] not in STAGES:
        raise SystemExit(__doc__)
    stage, buy = args[0], "--buy" in args
    only = None
    if "--only" in args:
        only = set(args[args.index("--only") + 1].split(","))
    done = jobs()
    for name in CAST:
        if only and name not in only:
            continue
        job = f"civ-{name}-{stage}"
        if done.get(job, {}).get("status") == "SUCCEEDED":
            print(f"skip {job}: already bought"); continue
        if job in done and not done[job].get("status"):
            # bought but the poll was interrupted: recover by polling, never by buying again
            print(f"recover {job}: polling task {done[job]['task_id']}")
            if buy:
                meshy.poll(STAGES[stage][0], done[job]["task_id"], job)
            continue
        prev = STAGES[stage][1]
        tid = None
        if prev:
            r = done.get(f"civ-{name}-{prev}")
            if not r or r.get("status") != "SUCCEEDED":
                print(f"skip {job}: {prev} not done"); continue
            tid = r["task_id"]
        path, _ = spec(name, stage, tid)
        meshy.run(path, buy)


if __name__ == "__main__":
    main()
