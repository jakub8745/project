# Exhibit Config v2

This document defines the target `v2` exhibit manifest for the archive viewer.

## Goals

- One scene model per exhibit.
- The model contains geometry, transforms, and stable node names only.
- The config is the only source of semantics and runtime behavior.
- Asset references are NFT-ready and can point to IPFS or other external immutable storage.
- A scene/app can be built from config alone when given the model and assets.

## Source Of Truth

The `v2` manifest replaces the hybrid split between:

- main scene GLB
- separate interactives GLB
- node `userData`
- ad hoc runtime config sections

In `v2`:

- `assets` defines every external file.
- `scene` defines global scene setup.
- `nodes` maps named GLB nodes to semantic roles.
- `media` defines reusable media objects.
- `interactions` defines viewer behavior declaratively.
- `modules` turns runtime systems on and attaches them to nodes.

## Canonical Top-Level Shape

```json
{
  "schemaVersion": "2.0.0",
  "id": "vectai_krakow_032026",
  "kind": "exhibit",
  "metadata": {},
  "nft": {},
  "assets": {},
  "scene": {},
  "nodes": {},
  "media": {},
  "interactions": [],
  "modules": {},
  "sidebar": {},
  "thumbnailCapture": {}
}
```

## Section Responsibilities

### `metadata`

Human-facing exhibit metadata:

- title
- description
- authors
- tags
- language
- OG preview image

### `nft`

Publishing and minting metadata:

- canonical config URI
- canonical preview asset
- canonical scene asset
- bundle CID
- integrity hashes

This is where NFT-facing references live. Runtime fallbacks must not replace the canonical URI.

### `assets`

Registry of all external files. Every asset should have a canonical `uri`, typically IPFS.

Recommended pattern:

```json
{
  "left_screen_mp4": {
    "kind": "video",
    "uri": "ipfs://bafy.../left_screen.mp4",
    "fallbackUris": [
      "https://gateway.example/left_screen.mp4",
      "/video/left_screen.mp4"
    ],
    "mimeType": "video/mp4",
    "integrity": {
      "cid": "bafy..."
    }
  }
}
```

### `scene`

Global scene setup:

- scene model
- background / environment
- spawn
- camera
- renderer
- light rig

### `nodes`

Semantics attached to named GLB nodes. The node name is the runtime contract.

Example:

```json
{
  "left_screen": {
    "kind": "video_surface"
  },
  "Visitor_enter": {
    "kind": "spawn_anchor",
    "spawnDirection": "west"
  }
}
```

### `media`

Reusable media objects independent from scene placement.

Examples:

- a document entry reused by both a wall panel and sidebar item
- a triptych video source reused by multiple video runtime modules
- a subtitle asset attached to audio or video

### `interactions`

Declarative user behavior:

- click image
- open document
- play or stop media
- hover to reveal transform controls
- open external link
- emit custom runtime event

These should be enough to build the exhibit interaction layer without model `userData`.

### `modules`

Runtime systems enabled for the exhibit:

- video
- audio
- sculpture controls
- chat
- surface prints

Modules attach behavior to nodes and media. This is where autoplay, sync groups, transform gizmos, subtitles, and chat settings live.

## Migration Rules From Current Hybrid Configs

### Current field -> v2 section

- `modelPath` -> `assets.scene_model` + `scene.model.asset`
- `backgroundTexture` -> `assets.*` + `scene.background.backgroundAsset`
- `environmentTexture` -> `assets.*` + `scene.background.environmentAsset`
- `backgroundColor` -> `scene.background.color`
- `objects` -> `nodes`
- `images` -> `assets` + `media`
- `videos` -> `assets` + `media` + `modules.video`
- `audio` -> `assets` + `media` + `modules.audio`
- `sculptures` -> `media` or node metadata + `modules.sculptureControls`
- `chat` -> `modules.chat`
- `proceduralRoom.chatPrints` -> `modules.surfacePrints`
- `sidebar.items` -> `sidebar.items`
- `thumbnailCapture` -> `thumbnailCapture`

### What Leaves The GLB

Do not rely on GLB `userData` for:

- type classification
- popup target selection
- image or document identity
- video control identity
- link resolution
- transform control options
- chat or collision semantics

The GLB should only provide stable node names and spatial structure.

## VECT AI Migration Map

The current VECT AI config is still hybrid. The table below shows how its existing sections should land in `v2`.

### Scene

- `modelPath: /models/vectai_room_ktx.glb`
  - `assets.scene_model`
  - `scene.model.asset = "scene_model"`
- `interactivesPath: /models/interactives_empty.glb`
  - remove entirely
- `backgroundColor: #000000`
  - `scene.background.color`

### Nodes

Current `objects` entries map directly into `nodes`:

- `Visitor_enter` -> `spawn_anchor`
- `floor_ucieta` -> `floor`
- `dokumentacja_floor` -> `floor`
- `left_screen`, `middle_screen`, `right_screen` -> `video_surface`
- `audio_left`, `audio_right`, `audio_intro` -> `audio_anchor`
- `pdf_manual_pl`, `pdf_manual_en` -> `document_anchor`
- image entries -> `image_anchor`
- scan entries -> `sculpture`

### Media

Current `images` becomes:

- image assets in `assets`
- image / document entries in `media`

Current `videos` becomes:

- poster and source files in `assets`
- media definitions in `media`
- playback settings in `modules.video.instances`

Current `audio` becomes:

- audio files in `assets`
- subtitle transcript files in `assets`
- media definitions in `media`
- playback and spatial settings in `modules.audio.instances`

### Interactions

Descriptions already exist in VECT AI and can be turned into declarative interaction records. For example:

- click `pdf_manual_pl` -> open document
- click `image_text_layer01` -> open image
- hover `scan_baletnica` -> enable transform controls

### Modules

Current VECT AI has:

- triptych synced silent video
- two spatial side audios
- one autoplay intro audio with subtitles
- sculpture transform controls

That should become:

- `modules.video.instances`
- `modules.video.syncGroups`
- `modules.audio.instances`
- `modules.sculptureControls.instances`

## Recommended First Cleanup For VECT AI

1. Remove `interactives_empty.glb`.
2. Move inline intro subtitles into a separate asset file.
3. Convert current `objects` into `nodes`.
4. Move current `images`, `videos`, and `audio` into `assets` + `media`.
5. Re-express sculpture rotation behavior as `interactions` + `modules.sculptureControls`.

## Compatibility Strategy

Do not migrate all exhibits at once.

Use a compatibility loader:

- legacy configs continue to work
- `v2` configs use the new normalized loader
- migrated exhibits can be converted one by one

The first migrated exhibit should be VECT AI.
