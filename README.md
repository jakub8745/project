# Blue Point Art – Virtual Gallery Archive

This repo hosts the React-based virtual gallery for [Blue Point Art](https://bluepointart.uk). Exhibitions are defined by JSON configuration and rendered through a performant [@react-three/fiber](https://github.com/pmndrs/react-three-fiber) viewer that runs entirely inside React.

---

## What’s inside

- **React + Vite app** – all interaction, modals, and overlays are implemented as React components.
- **R3F scene graph** – a single, code-split Three.js viewer handles models, media meshes, audio, and navigation.
- **Config-driven content** – `config.json` files describe assets, transforms, and metadata so new shows require zero code.
- **IPFS-aware loaders** – assets can fall back across multiple gateways; Oracle URLs are resolved automatically where available.
- **Spatial media** – positional audio, video planes, and hotspot interactions are wired through typed helpers.

---

## Getting started

```bash
pnpm install   # or npm / yarn
pnpm dev       # starts Vite on http://localhost:5173

# build for production
pnpm build
```

Drop exhibition configs into `public/configs/` (or host them remotely) and update `src/data/galleryConfig.ts` to register new entries.

---

## Procedural Agents Room

The `prompt_procedural_room` exhibit is a fully config-driven scene generated in code (no room GLB).  
Its config is located at:

- `public/configs/prompt_procedural_room_config.json`

Key features:

- **Procedural room geometry**: floor, walls, optional ceiling (`proceduralRoom.ceiling`).
- **Patterned materials**: chevrons on walls and carpet-like floor.
- **Dynamic actors**: reusable robot objects (`models[]`, e.g. `id: "robot"`).
- **Game-like collisions**:
  - static world collision via BVH room collider,
  - dynamic actor-vs-actor collision via config `physics` block (`actors`, `pairs`, `iterations`).
- **Configurable lights**: ambient, hemisphere, directional, and optional spotlight.

---

## Thumbnail / Recording Mode

Use thumbnail mode to frame and capture videos for sidebar assets from a fixed poster-like camera style.

Open with query param:

```text
http://localhost:5173/?thumbnailMode=1#prompt_procedural_room
```

Runtime controls:

- `K` reset camera to configured thumbnail pose
- `R` start/stop recording (`MediaRecorder`, auto-download on stop)
- `PageUp/PageDown` or `Q/E` raise/lower camera
- `P` print current camera pose to browser console (for copy/paste into config)

Config block:

- `thumbnailCapture` in `public/configs/prompt_procedural_room_config.json`
  - camera pose: `cameraPosition`, `target`, `fov`
  - recording: `fps`, `mimeType`, `bitsPerSecond`, `filename`
  - behavior: `allowOrbit`, `autoRotate`, `autoRotateSpeed`, `backgroundColor`, `showHint`

Note: in thumbnail mode, sidebar/help overlays are hidden for clean capture.

---

## Sidebar video thumbnails

Use this ffmpeg preset to generate lightweight looping thumbnail videos for sidebar tiles:

```bash
ffmpeg -i "INPUT.mp4" -vf "scale=360:360:flags=lanczos,fps=12" \
  -c:v libx264 -crf 26 -preset medium -pix_fmt yuv420p \
  -g 24 -keyint_min 24 -sc_threshold 0 \
  -an "thumb_360_12fps_crf26.mp4"
```

Notes:
- 360x360, 12 fps, H.264, yuv420p, no audio.
- `-g 24` = 2s keyframe interval at 12 fps (smooth looping/seek).

---

## Project structure highlights

- `src/App.tsx` – application shell, sidebar navigation, and lazy-loaded viewer.
- `src/r3f/` – canvas-side logic (viewer, audio system, modal integration, pointer interactions).
- `src/modules/` – shared utilities consumed by both UI and R3F code (e.g. audio manager, visitor controls).

Legacy DOM scaffolding has been removed; the React viewer is the only runtime entry point.

---

## Contributing

Issues and PRs are welcome. If you are planning a larger contribution, please open a discussion first so we can align on approach.

---

## License

MIT

---

## Credits

Developed by [Blue Point Art](https://bluepointart.uk).
Thanks to the pmndrs and Three.js communities for the tooling this archive is built on.
