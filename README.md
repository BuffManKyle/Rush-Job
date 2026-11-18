# Rush Job

Single-player, top-down 3D heist game for the browser. three.js + TypeScript + Vite.
Built for the opengameio jam, Nov 18 – Dec 18, 2026. See `DESIGN.md`.

## Layout
- `src/` — game code (simulation at 30 Hz, renderer/audio/HUD read-only). Owned by the systems session.
- `tools/blender/` — headless Blender 5.2 build scripts (`*_build.py`) → GLB. Owned by the assets session.
- `assets/` — exported GLB/KTX2 and textures. Tracked in `ASSETS.md`.
- `levels/` — Tiled maps.
- `reference-images/` — concept art and model sheets.
- Writing and voice script source lives in the Obsidian vault: `../Rush Job Docs/Writing/`.
