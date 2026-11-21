#!/usr/bin/env python3
"""Turn chosen ElevenLabs takes into the game's audio files and assets/audio/manifest.json.

    tools/audio/.venv/Scripts/python tools/audio/build.py            # build everything
    tools/audio/.venv/Scripts/python tools/audio/build.py --only cue.c4.beep,sfx.van.honk

Which take(s) per sound, in order of precedence:
  1. takes ticked in the vault's Audio/02 Review.md
  2. tools/audio/picks.json (hand picks, e.g. music chosen by measured tempo)
  3. every take without a rejecting note (redo / cut / "sounds like" ...), newest first,
     up to the number of takes the sound list asks for (variations), else one.

What happens to each:
  one-shot   trim the silence at both ends, 4 ms fade in, 20 ms fade out, peak to -1 dBFS
  slice      one take cut at its silences into N separate hits, each treated as a one-shot
  loop SFX   kept whole (ElevenLabs' loop mode), only levelled
  music      cut to an exact number of bars from the first downbeat after bar 1, with the
             next half-bar mixed over the start so the seam doesn't click; loud stems also
             give up their opening brass hit as the alarm sting
World sounds (sfx.*, cue.*) are mono so the game can place them; ui.*, amb.* and music stay stereo.
Files are normalised; how loud each one plays in the mix lives in the game's audio code.
"""
import argparse, json, os, re, sys
import numpy as np
import soundfile as sf
import pyloudnorm as pyln

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
TAKES = os.path.join(ROOT, "assets", "audio", "_takes")
OUT = os.path.join(ROOT, "assets", "audio")
REVIEW = os.path.join(os.path.dirname(ROOT), "Rush Job Docs", "Audio", "02 Review.md")
SR = 48000
# libsndfile Vorbis compression level per folder (0 = best, 1 = smallest). Measured on a music stem:
# 0.5 = 107 kbps, 0.7 = 84, 0.85 = 64 (stereo). One-shots are short and mono, so they keep more quality.
QUALITY = {"music": 0.72, "amb": 0.85, "sfx": 0.5, "cue": 0.5, "ui": 0.5}

# loop length in bars and tempo for every music loop (01 Music.md)
MUSIC = {
    "mus.glint.stealth": (96, 24), "mus.glint.loud": (96, 24), "mus.glint.tension": (96, 8),
    "mus.bank.stealth": (90, 36), "mus.bank.loud": (90, 36), "mus.bank.tension": (90, 8),
    "mus.gallery.stealth": (80, 32), "mus.gallery.loud": (80, 32), "mus.gallery.tension": (80, 8),
    "mus.menu": (100, 20), "mus.board": (90, 16), "mus.payout": (120, 16), "mus.payout.cuffed": (80, 8),
}
ALARM_STING = {"mus.glint.loud": "mus.sting.alarm_glint", "mus.bank.loud": "mus.sting.alarm_bank",
               "mus.gallery.loud": "mus.sting.alarm_gallery"}
REJECT = re.compile(r"redo|\bcut\b|no good|hurts|sounds like|not a game file|stutter|ping, not|bell too", re.I)
TAKE_LINE = re.compile(r"^- \[(?P<m>[ xX])\] `(?P<id>[a-z0-9_.]+)` (?P<t>t\d\d)\b")


def review_state():
    ticked, rejected, cur = {}, set(), None
    if not os.path.exists(REVIEW):
        return ticked, rejected
    for line in open(REVIEW, encoding="utf-8"):
        m = TAKE_LINE.match(line)
        if m:
            cur = (m["id"], m["t"])
            if m["m"] in "xX":
                ticked.setdefault(m["id"], []).append(m["t"])
            continue
        if cur and re.match(r"^\s+>", line) and REJECT.search(line) and not re.search(r"my pick|best candidate", line, re.I):
            rejected.add(cur)
        elif line.strip() and not line[0].isspace():
            cur = None
    return ticked, rejected


def takes_of(sid):
    d = os.path.join(TAKES, sid)
    return sorted((f[:3] for f in os.listdir(d) if re.match(r"t\d\d\.ogg$", f)), reverse=True) if os.path.isdir(d) else []


def choose(job, ticked, rejected, picks):
    sid = job["id"]
    if sid in ticked:
        return ticked[sid], "approved in review"
    if sid in picks:
        return picks[sid]["takes"], picks[sid].get("why", "picks.json")
    ok = [t for t in takes_of(sid) if (sid, t) not in rejected]
    n = job["takes"] if job["takes"] > 1 and job["slice"] <= 0 and not job["loop"] else 1
    return ok[:n], "unflagged takes"


# ---------- signal helpers ----------

def load(sid, take, mono):
    x, sr = sf.read(os.path.join(TAKES, sid, f"{take}.ogg"), always_2d=True)
    assert sr == SR, (sid, take, sr)
    return x.mean(axis=1, keepdims=True) if mono else x


def env(x, ms=5):
    a = np.abs(x).max(axis=1)
    w = int(SR * ms / 1000)
    n = len(a) // w
    return a[: n * w].reshape(n, w).max(axis=1), w


def fade(x, fin=0.004, fout=0.02):
    x = x.copy()
    a, b = int(SR * fin), int(SR * fout)
    if a:
        x[:a] *= np.linspace(0, 1, a)[:, None]
    if b and len(x) > b:
        x[-b:] *= np.linspace(1, 0, b)[:, None]
    return x


def peak(x, db=-1.0):
    p = np.abs(x).max()
    return x * (10 ** (db / 20) / p) if p > 0 else x


def lufs(x, target):
    meter = pyln.Meter(SR)
    if len(x) < SR * 0.5:
        return peak(x, -3)
    l = meter.integrated_loudness(x if x.shape[1] > 1 else x[:, 0])
    if not np.isfinite(l):
        return peak(x, -3)
    y = x * 10 ** ((target - l) / 20)
    return y if np.abs(y).max() <= 0.97 else peak(y, -0.3)


def trim(x, floor=0.02, tail=0.004):
    e, w = env(x)
    pk = e.max()
    on = np.where(e > pk * floor)[0]
    if not len(on):
        return x
    start = max(0, on[0] * w - int(SR * 0.003))
    after = np.where(e > pk * tail)[0]
    end = min(len(x), (after[-1] + 1) * w + int(SR * 0.02))
    return fade(x[start:end])


def slices(x, n):
    """Cut a clip of n hits at each hit's attack. Hits often ring into each other, so this looks for
    sharp rises in level (onsets), not for silence, and cuts each hit just before the next one."""
    from scipy.signal import find_peaks
    e, w = env(x, 5)
    db = 20 * np.log10(e + 1e-6)
    rise = np.maximum(0, np.diff(db, prepend=db[0]))
    rise = np.convolve(rise, np.ones(3), "same")
    loud = db > db.max() - 30                      # ignore rises in the noise floor
    peaks, props = find_peaks(np.where(loud, rise, 0), height=6, distance=int(0.12 * SR / w))
    if not len(peaks):
        return [peak(trim(x))]
    keep = sorted(sorted(range(len(peaks)), key=lambda i: -props["peak_heights"][i] - 0.1 * db[peaks[i]])[:n])
    starts = [peaks[i] for i in keep]
    out = []
    for i, a in enumerate(starts):
        later = [p for p in peaks if p > a]
        b = later[0] if later else len(e)
        seg = x[max(0, (a - 2) * w): min(len(x), b * w - int(SR * 0.005))]
        if len(seg) > SR * 0.03:
            out.append(peak(trim(seg)))
    return out


# ---------- music ----------

def onset_env(x, hop=512):
    m = x.mean(axis=1)
    n, wnd = 2048, np.hanning(2048)
    frames = np.lib.stride_tricks.sliding_window_view(m, n)[::hop] * wnd
    S = np.log1p(np.abs(np.fft.rfft(frames, axis=1)))
    flux = np.maximum(0, np.diff(S, axis=0)).sum(axis=1)
    flux -= np.convolve(flux, np.ones(16) / 16, "same")
    return np.maximum(flux, 0), SR / hop


def downbeat(x, bpm):
    """Time of the first downbeat: best beat phase, then the strongest of the 4 beats in a bar."""
    e, fps = onset_env(x)
    period = fps * 60 / bpm
    best = (-1, 0.0)
    for ph in np.linspace(0, period, 48, endpoint=False):
        idx = (ph + np.arange(int(len(e) / period) - 1) * period).astype(int)
        sc = e[idx].mean()
        if sc > best[0]:
            best = (sc, ph)
    ph = best[1]
    beats = (ph + np.arange(int(len(e) / period) - 1) * period).astype(int)
    strength = [e[beats[i::4]].mean() for i in range(4)]
    first = beats[int(np.argmax(strength))]
    return first / fps


def offset(a, b, bpm):
    """How many seconds b's beats sit after a's (onset cross-correlation within +-2 beats)."""
    ea, fps = onset_env(a)
    eb, _ = onset_env(b)
    n = min(len(ea), len(eb))
    ea, eb = ea[:n] - ea[:n].mean(), eb[:n] - eb[:n].mean()
    span = int(fps * 120 / bpm)
    lags = list(range(-span, span + 1))
    cc = [np.dot(ea[max(0, l):n + min(0, l)], eb[max(0, -l):n - max(0, l)]) for l in lags]
    return -lags[int(np.argmax(cc))] / fps


def music_loop(x, bpm, bars, start=None):
    bar = 4 * 60 / bpm
    if start is None:
        start = downbeat(x, bpm)
        while start < bar * 0.9:                  # skip bar 0 (intro, or the loud stem's brass hit)
            start += bar
    n = int(round(bars * bar * SR))
    s = int(round(start * SR))
    over = int(round(bar / 2 * SR))
    if s + n + over > len(x):
        s = max(0, len(x) - n - over)
    loop = x[s:s + n].copy()
    tail = x[s + n:s + n + over]
    loop[:len(tail)] += tail * np.linspace(1, 0, len(tail))[:, None]   # carry the reverb over the seam
    k = int(SR * 0.005)
    loop[:k] *= np.linspace(0, 1, k)[:, None]
    loop[-k:] *= np.linspace(1, 0, k)[:, None]
    return loop, s / SR


def write(rel, x):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    y = np.clip(x, -1, 1).astype(np.float32)
    # libsndfile's Vorbis encoder crashes on one big write (anything past ~20 s of stereo): write in blocks
    with sf.SoundFile(path, "w", SR, y.shape[1], format="OGG", subtype="VORBIS", compression_level=QUALITY[rel.split("/")[0]]) as f:
        for i in range(0, len(y), 8192):
            f.write(y[i:i + 8192])
    return rel.replace("\\", "/")


def targets(pattern, count):
    m = re.match(r"(.+)_(\d\d)\.\.(\d\d)\.ogg$", pattern)
    if m:
        return [f"{m[1]}_{i + 1:02d}.ogg" for i in range(count)]
    if count == 1:
        return [pattern]
    stem = pattern[:-4]
    return [f"{stem}_{i + 1:02d}.ogg" for i in range(count)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only")
    a = ap.parse_args()
    jobs = json.load(open(os.path.join(HERE, "sounds.json"), encoding="utf-8"))["jobs"]
    picks = json.load(open(os.path.join(HERE, "picks.json"), encoding="utf-8"))
    ticked, rejected = review_state()
    man_path = os.path.join(OUT, "manifest.json")
    manifest = json.load(open(man_path, encoding="utf-8")) if a.only and os.path.exists(man_path) else {}
    only = set(a.only.split(",")) if a.only else None
    report = []
    stems = {}
    for j in jobs:
        sid = j["id"]
        if only and sid not in only:
            continue
        chosen, why = choose(j, ticked, rejected, picks)
        if not chosen:
            report.append(f"MISSING {sid}: no usable take ({why})")
            continue
        mono = sid.startswith(("sfx.", "cue."))
        entry = {"files": [], "loop": j["loop"], "takes": chosen, "why": why}
        if j["kind"] == "music":
            x = load(sid, chosen[0], False)
            if sid in MUSIC:
                bpm, bars = MUSIC[sid]
                loop, start = music_loop(x, bpm, bars)
                stealth = stems.get(sid.replace(".loud", ".stealth")) if sid.endswith(".loud") else None
                if stealth is not None:            # line the loud stem's beats up with the stealth stem's
                    for _ in range(2):
                        d = offset(stealth, loop, bpm)
                        if abs(d) < 0.01:
                            break
                        loop, start = music_loop(x, bpm, bars, start + d)
                    entry["alignedMs"] = round(offset(stealth, loop, bpm) * 1000)
                stems[sid] = loop
                entry["files"].append(write(j["target"], lufs(loop, -16)))
                entry.update(bpm=bpm, bars=bars, loopSeconds=round(bars * 240 / bpm, 4), cutAt=round(start, 3))
                if sid in ALARM_STING:
                    hit = fade(x[: int(SR * (start + 0.6))], 0.002, 0.6)
                    sting = ALARM_STING[sid]
                    rel = write(f"music/{sting.split('.')[-1].replace('alarm_', 'sting_alarm_')}.ogg", lufs(hit, -14))
                    manifest[sting] = {"files": [rel], "loop": False, "takes": chosen, "why": f"bar 0 of {sid}"}
            else:                                          # stings
                s = trim(x, floor=0.01, tail=0.002)
                s = fade(s[: int(SR * 4.5)], 0.002, 0.5)
                entry["files"].append(write(j["target"], lufs(s, -14)))
                entry["loop"] = False
        elif j["slice"] > 0:
            x = load(sid, chosen[0], mono)
            hits = slices(x, j["slice"])
            if len(hits) < j["slice"]:
                report.append(f"short   {sid}: wanted {j['slice']} hits, found {len(hits)}")
            for rel, h in zip(targets(j["target"], len(hits)), hits):
                entry["files"].append(write(rel, h))
        else:
            rels = targets(j["target"], len(chosen))
            for rel, t in zip(rels, chosen):
                x = load(sid, t, mono)
                if j["loop"]:
                    y = lufs(x, -20 if sid.startswith("amb.") else -16)
                else:
                    y = peak(trim(x))
                entry["files"].append(write(rel, y))
        manifest[sid] = entry
    json.dump(dict(sorted(manifest.items())), open(man_path, "w", encoding="utf-8"), indent=1)
    files = sum(len(v["files"]) for v in manifest.values())
    size = sum(os.path.getsize(os.path.join(OUT, f)) for v in manifest.values() for f in v["files"])
    print(f"manifest: {len(manifest)} sounds, {files} files, {size / 1e6:.1f} MB")
    for r in report:
        print(" ", r)


if __name__ == "__main__":
    main()
