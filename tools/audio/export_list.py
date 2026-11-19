#!/usr/bin/env python3
"""Turn the vault's audio notes into tools/audio/sounds.json (the generator's input).

    py tools/audio/export_list.py              # reads the vault next to this repo
    py tools/audio/export_list.py --vault "C:/path/to/Rush Job Docs"

Sources (edit these, not the JSON):
  Rush Job Docs/Audio/00 Sound list.md   one checkbox entry per SFX / cue / UI / ambience sound
  Rush Job Docs/Audio/01 Music.md        one ### heading + > prompt per music piece

Each job in the JSON is one ElevenLabs request type with a number of takes:
  kind "sfx"   -> POST /v1/sound-generation (text, duration_seconds, loop)
  kind "music" -> POST /v1/music (prompt, music_length_ms, force_instrumental)
"Search" entries can't search the ElevenLabs library through the API, so they're generated from
their fallback prompt. "slice into N" entries are one generation, cut into N files at build time.
"""
import argparse, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
DEFAULT_VAULT = os.path.join(os.path.dirname(ROOT), "Rush Job Docs")
OUT = os.path.join(HERE, "sounds.json")

SFX_MODEL = "eleven_text_to_sound_v2"
MUSIC_MODEL = "music_v1"
SEARCH_DEFAULT_SECONDS = {"ui": 1.0, "sfx": 1.5}

ENTRY = re.compile(r"^- \[[ xX]\] `(?P<id>[a-z0-9_.]+)` · (?P<rest>.+)$")
PROMPT = re.compile(r'^\s+- \*\*(?P<label>Prompt|Fallback prompt)[^*]*:\*\* "(?P<text>.+)"\s*$')
WHEN = re.compile(r"^\s+- \*\*When:\*\* (?P<text>.+)$")

# Music: generation length per piece = loop + overhang (see 01 Music.md "How to make a pair").
# (seconds to generate, takes)
MUSIC_GEN = {
    "mus.glint.stealth": (65.0, 2),   "mus.glint.loud": (67.5, 3),   "mus.glint.tension": (25.0, 2),
    "mus.bank.stealth": (101.4, 2),   "mus.bank.loud": (104.0, 3),   "mus.bank.tension": (26.7, 2),
    "mus.gallery.stealth": (102.0, 2), "mus.gallery.loud": (105.0, 3), "mus.gallery.tension": (30.0, 2),
    "mus.menu": (52.8, 2), "mus.board": (48.0, 2), "mus.payout": (36.0, 2), "mus.payout.cuffed": (30.0, 1),
    "mus.sting.mask_up": (10.0, 2), "mus.sting.escaped": (10.0, 2), "mus.sting.cuffed": (10.0, 2),
    "mus.sting.unlock": (10.0, 2),
}


def parse_sfx(path):
    jobs, cur, group = [], None, ""
    for raw in open(path, encoding="utf-8"):
        line = raw.rstrip("\n")
        if line.startswith("## "):
            group = line[3:].strip()
        m = ENTRY.match(line)
        if m:
            cur = None
            sid, rest = m["id"], m["rest"]
            if sid.startswith("mus.") or group.startswith("How to read"):
                continue
            target = re.search(r"→ `([^`]+)`", rest)
            prio = re.search(r"· (P[123])\b", rest)
            gen = re.search(r"\*\*gen\*\* ([\d.]+) s", rest)
            search = re.search(r'\*\*search\*\* "([^"]+)"', rest)
            takes = re.search(r"· (\d+) takes?\b", rest)
            slice_n = re.search(r"slice(?: into)? (\d+)", rest)
            cur = {
                "id": sid, "kind": "sfx", "group": group,
                "priority": prio[1] if prio else "P2",
                "target": target[1] if target else None,
                "seconds": max(0.5, float(gen[1])) if gen else SEARCH_DEFAULT_SECONDS["ui" if sid.startswith("ui.") else "sfx"],
                "loop": "· loop" in rest,
                "takes": int(takes[1]) if takes else 1,
                "slice": int(slice_n[1]) if slice_n else (0 if "slice" not in rest else -1),
                "source": "search-fallback" if search else "generate",
                "search_terms": search[1] if search else None,
                "prompt": None, "when": None, "model_id": SFX_MODEL,
            }
            if search:   # library entries carry no duration: size it to what's asked for
                if cur["slice"] > 0:
                    cur["seconds"] = max(3.0, 0.6 * cur["slice"])
                elif cur["loop"]:
                    cur["seconds"] = 4.0
            jobs.append(cur)
            continue
        if cur is None:
            continue
        w = WHEN.match(line)
        if w:
            cur["when"] = w["text"]
        p = PROMPT.match(line)
        if p:
            cur["prompt"] = p["text"]
    # "[a / b / c / d]" in a prompt = one take per option (cue.heat.up)
    for j in jobs:
        opt = re.search(r"\[([^\]]+/[^\]]+)\]", j["prompt"] or "")
        if opt:
            words = [w.strip() for w in opt[1].split("/")]
            j["take_prompts"] = [j["prompt"].replace(opt[0], w) for w in words]
            j["takes"] = len(words)
    return jobs


def parse_music(path):
    jobs, cur = [], None
    for raw in open(path, encoding="utf-8"):
        line = raw.rstrip("\n")
        h = re.match(r"^### `(mus\.[a-z0-9_.]+)` → `([^`]+)` · (P[123])", line)
        if h:
            sid = h[1]
            secs, takes = MUSIC_GEN[sid]
            cur = {"id": sid, "kind": "music", "group": "Music", "priority": h[3], "target": h[2],
                   "seconds": secs, "loop": not sid.startswith("mus.sting"), "takes": takes, "slice": 0,
                   "source": "generate", "prompt": None, "model_id": MUSIC_MODEL, "force_instrumental": True}
            jobs.append(cur)
            continue
        if cur is not None and line.startswith("> ") and cur["prompt"] is None:
            cur["prompt"] = line[2:].strip()
    return jobs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vault", default=DEFAULT_VAULT)
    a = ap.parse_args()
    sfx = parse_sfx(os.path.join(a.vault, "Audio", "00 Sound list.md"))
    mus = parse_music(os.path.join(a.vault, "Audio", "01 Music.md"))
    jobs = sfx + mus
    problems = [j["id"] for j in jobs if not j["prompt"] or not j["target"]]
    ids = [j["id"] for j in jobs]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if problems or dupes:
        sys.exit(f"export refused: missing prompt/target {problems}, duplicate ids {dupes}")
    missing_music = sorted(set(MUSIC_GEN) - {j["id"] for j in mus})
    if missing_music:
        sys.exit(f"export refused: no prompt found for {missing_music}")
    json.dump({"_note": "Generated by export_list.py from the vault's Audio notes. Edit the notes, not this file.",
               "jobs": jobs}, open(OUT, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print(f"wrote {os.path.relpath(OUT, ROOT)}: {len(sfx)} sfx jobs, {len(mus)} music jobs")


if __name__ == "__main__":
    main()
