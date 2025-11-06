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
