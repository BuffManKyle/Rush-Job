#!/usr/bin/env python3
"""A plain electronic timer beep, made with code instead of ElevenLabs.

ElevenLabs kept turning "a short beep" into bells, keys or one long tone, and a timer beep is just a
tone, so this writes one. Run with the tools/audio venv (soundfile, numpy):

    tools/audio/.venv/Scripts/python tools/audio/synth_beep.py

Writes into assets/audio/_takes/cue.c4.beep/ as the next free take numbers:
  tNN.ogg  one beep (what the game plays, repeated faster as the fuse runs down)
  tNN.ogg  a 4 s countdown preview built from that beep, only for judging it in context
"""
import json, os, re
import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(os.path.dirname(HERE)), "assets", "audio", "_takes", "cue.c4.beep")
SR = 48000
FREQ = 2400          # Hz: inside the 2-4 kHz cue band from the mix rules
LENGTH = 0.09        # s of tone
ATTACK, RELEASE = 0.003, 0.012


def beep():
    t = np.arange(int(SR * LENGTH)) / SR
    # a sine with a little 3rd harmonic: clearly electronic, softer than a raw square wave
    tone = np.sin(2 * np.pi * FREQ * t) + 0.18 * np.sin(2 * np.pi * 3 * FREQ * t)
    env = np.minimum(1, np.minimum(t / ATTACK, (LENGTH - t) / RELEASE))
    x = tone * np.clip(env, 0, 1)
    return 0.7 * x / np.abs(x).max()


def countdown(b, seconds=4.0):
    out = np.zeros(int(SR * (seconds + 0.5)))
    t, gap = 0.0, 0.8
    while t < seconds:
        i = int(t * SR)
        out[i:i + len(b)] += b
        t += gap
        gap = max(0.08, gap * 0.82)   # beeps get closer together, like the fuse running down
    return out


def next_takes(n):
    have = [int(m[1]) for f in os.listdir(OUT) if (m := re.match(r"t(\d\d)\.(ogg|mp3|opus)$", f))]
    start = max(have, default=0) + 1
    return [f"t{i:02d}" for i in range(start, start + n)]


def main():
    b = beep()
    single = np.concatenate([b, np.zeros(int(SR * 0.2))])
    for take, audio, what in zip(next_takes(2), (single, countdown(b)), ("single beep", "countdown preview")):
        sf.write(os.path.join(OUT, f"{take}.ogg"), audio.astype(np.float32), SR, format="OGG", subtype="VORBIS")
        json.dump({"id": "cue.c4.beep", "take": int(take[1:]), "source": "code (tools/audio/synth_beep.py)",
                   "what": what, "freq_hz": FREQ, "tone_s": LENGTH, "credits": 0},
                  open(os.path.join(OUT, f"{take}.json"), "w", encoding="utf-8"), indent=1)
        print(f"{take}: {what}")


if __name__ == "__main__":
    main()
