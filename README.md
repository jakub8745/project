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

Target schema artifacts for the normalized manifest live at:

- `src/types/exhibitSchemaV2.ts`
- `docs/exhibit-config-v2.md`
- `example_of_gallery_config_v2.json`

---

## Procedural Agents Room

The `prompt_procedural_room` exhibit is a fully config-driven scene generated in code (no room GLB).  
Its config is located at:

- `public/configs/prompt_procedural_room_config.json`

Key features:

- **Procedural room geometry**: floor, walls, optional ceiling (`proceduralRoom.ceiling`).
- **Patterned materials**: chevrons on walls and carpet-like floor.
- **Dynamic actors**: reusable robot objects (`models[]`, e.g. `id: "robot"`).
- **Envmap objects**: reflective/refractive primitives via `proceduralObjects[]` + `environmentTexture`.
  - Supports `shape: "blob"` for lava-lamp-style deformations on top of sphere geometry.
  - Tune blob motion with `blobAmplitude`, `blobFrequency`, `blobSpeed`.
  - Enable real-time reflections per object with `material.realtimeEnvMap: true` (cube camera).
  - Tune quality/perf with `material.envMapResolution` and `material.envMapRefreshFrames`.
  - Reuse robot-like roaming with `proceduralObjects[].animation` (`collisionAware`, `speed`, `direction`, etc.).
- **Game-like collisions**:
  - static world collision via BVH room collider,
  - dynamic actor-vs-actor collision via config `physics` block (`actors`, `pairs`, `iterations`).
- **Persistent surface prints**:
  - room pulls shared `/api/prints` records and projects chat fragments onto walls/floor,
  - includes both visitor and blob messages,
  - tune via `proceduralRoom.chatPrints` (`enabled`, `pollMs`, `fetchLimit`, `maxVisible`).
- **Multi-blob chat personas**:
  - define multiple blobs in `chat.blobs` with distinct `id`, `label`, and prompts,
  - load persona prompts from files via `systemPromptPath` (for example, per-blob SOUL files in `public/prompts/`),
  - collision-triggered replies continue the ongoing discussion theme and answer the latest chat line.
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

## Audio subtitles

Narrated audio entries can carry timed subtitle cues in the exhibit config. Cue times are seconds on the same audio timeline as the track:

```json
{
  "audio": [
    {
      "id": "introduction_audio",
      "url": "/audio/introduction.mp3",
      "subtitleTracks": [
        {
          "language": "en",
          "label": "EN",
          "cues": [
            {
              "start": 0.4,
              "end": 4.8,
              "text": "This virtual exhibition brings together\nthree videopoems."
            }
          ]
        }
      ]
    }
  ]
}
```

The viewer shows the active cue while that audio track is playing. Multiple tracks expose language choices in the audio player CC control. Use a transcript with checked timestamps for lector recordings so the text follows pauses and sentence pacing.

---

## Project structure highlights

- `src/App.tsx` – application shell, sidebar navigation, and lazy-loaded viewer.
- `src/r3f/` – canvas-side logic (viewer, audio system, modal integration, pointer interactions).
- `src/modules/` – shared utilities consumed by both UI and R3F code (e.g. audio manager, visitor controls).

---

## Chat Backend Modes

The room chat is now backend-agnostic and supports two API modes:

- Local bridge (`server/chat-bridge.mjs`) for local development.
- Cloudflare Worker API (`worker/`) for production/static IPFS deployments.

Frontend hook: `src/hooks/useBlobChatBridge.ts`

### Frontend env

```bash
# For deployed static site on IPFS/custom domain:
VITE_CHAT_API_BASE=https://your-worker-api.example.com

# Optional default base for static/IPFS hosts when VITE_CHAT_API_BASE is not set:
VITE_DEFAULT_IPFS_CHAT_API_BASE=https://your-worker-api.example.com

# Optional local dev proxy target (Vite only):
VITE_CHAT_PROXY_TARGET=http://localhost:8787

# Optional comma-separated host allowlist for Vite dev server:
VITE_DEV_ALLOWED_HOSTS=example.ngrok-free.app
```

Notes:
- If `VITE_CHAT_API_BASE` is empty, frontend uses relative paths (good with local proxy).
- If `VITE_CHAT_PROXY_TARGET` is empty, Vite does not proxy `/api/chat`.

### Local bridge mode (dev)

```bash
npm run bridge
npm run dev
```

Bridge env vars:

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_TIMEOUT_MS=45000
CHAT_BRIDGE_PORT=8787
CHAT_UNLOCK_PHRASE=two secret words
CHAT_UNLOCK_TTL_MS=28800000
RATE_LIMIT_CHAT_PER_MIN=24
RATE_LIMIT_UNLOCK_PER_MIN=12
MAX_CHAT_TEXT_LENGTH=2400
CORS_ALLOW_ORIGINS=http://localhost:5173,https://archive.bluepointart.uk

# Optional Telegram mirror:
MIRROR_TO_TELEGRAM=false
TELEGRAM_BOT_TOKEN=123456:abcDEF...
TELEGRAM_CHAT_ID=123456789
TELEGRAM_THREAD_ID=42
```

### Cloudflare Worker mode (prod)

Worker project: `worker/`

Stack:
- Worker API routes
- D1 (`chat_messages`, `surface_prints`)
- KV (`prints:latest:*` cache)
- R2 (texture object storage)

Required GitHub secrets for `.github/workflows/worker-api.yml`:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `OPENAI_API_KEY`
- `CHAT_UNLOCK_PHRASE` (optional; enables visitor phrase gate for `/api/chat/*`)
- `CHAT_UNLOCK_TTL_SEC` (optional; session unlock lifetime, default 28800)
- `TEXTURE_WRITE_TOKEN` (required for `PUT /api/textures/:key`)

One-time setup:

1. Create D1 DB, KV namespace, and R2 bucket in Cloudflare.
2. Put real IDs into `worker/wrangler.toml`:
   - `database_id`
   - `kv_namespaces.id`
3. Optionally set `SOUL_PROMPT` in `worker/wrangler.toml` (global fallback framing).  
   Per-blob personas can override this from frontend config via `chat.blobs[].systemPrompt` or `chat.blobs[].systemPromptPath`.
4. Configure origin/rate/upload controls in Worker vars:
   - `CORS_ALLOW_ORIGINS` (comma-separated allowlist; empty = allow all)
   - `RATE_LIMIT_CHAT_PER_MIN`, `RATE_LIMIT_UNLOCK_PER_MIN`, `RATE_LIMIT_TEXTURE_PUT_PER_MIN`
   - `MAX_CHAT_TEXT_LENGTH`, `MAX_SYSTEM_PROMPT_LENGTH`, `MAX_TEXTURE_UPLOAD_BYTES`
5. Run Worker deploy workflow.
6. Set `VITE_CHAT_API_BASE` in frontend build environment to your Worker domain.

Current chat endpoints (compatible with existing app):

- `GET /api/chat/health`
- `POST /api/chat/unlock`
- `POST /api/chat/send`

Additional Worker routes:

- `GET /api/prints`
- `PUT /api/textures/:key`
- `GET /api/textures/:key`

This keeps the frontend static while enabling persistent, evolving room data via Cloudflare services.

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
