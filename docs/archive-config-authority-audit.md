# BPA archive config authority and loader audit

> Historical audit: V2 loader and `?configVersion=2` statements below describe the repository at the time of this audit. The active application is now V3-only; unchanged V2 source manifests are in `archive/v2/`. See [the current runtime guide](exhibit-config-v3.md).

Audit date: 2026-09-27. This records the checked-in runtime inventory and the adapter/source policy now used by the browser viewer.

## Runtime scene inventory

`src/data/galleryConfig.ts` registers ten stable gallery slugs and manifest URLs. Each v3 manifest is the default. Its v2 companion remains reachable with `?configVersion=2`; none of the v2 scene configs is obsolete while that rollback route remains supported.

| Gallery slug | V2 rollback config | Default V3 manifest | V3 assets | Nodes / interactions | V3 modules and notable differences from VECT_AI |
| --- | --- | --- | ---: | --- | --- |
| `vectai_krakow_032026` | `vectai_krakow_032026_config_v2.json` | `vectai_krakow_032026_config_v3.json` | 26 | 28 / 21 | Canonical reference; NFT profile, complete video/audio/sculpture/chat modules, portable audio and lighting routes, rich preservation metadata. 18 source paths are local/development paths, 8 are explicit HTTPS sources; its Oracle alternatives and canonical IPFS references are declared per asset. |
| `videopoem_lisbon_112025` | `videopoem_lisbon_112025_config_v2.json` | `videopoem_lisbon_112025_config_v3.json` | 11 | 6 / 5 | Portable profile; video and audio modules, all 11 `sourceUri` values are HTTPS. Source scene renderer and spawn declarations conflict with some old viewer parameters; the v3 adapter now gives the portable scene declarations precedence. Three configured Oracle objects are documented as missing in [migration findings](migrations/missing-assets.md). |
| `cipriani` | `cipriani_config.json` | `cipriani_config_v3.json` | 43 | 47 / 42 | Portable profile; audio module, extensive image/media catalog, 42 IPFS `sourceUri` values and one HTTPS value. It does not declare an Oracle copy for most IPFS media. |
| `bednarczyk` | `bednarczyk_config.json` | `bednarczyk_config_v3.json` | 12 | 14 / 14 | Portable profile; audio module, 10 HTTPS and 2 IPFS sources. Two retained artwork/audio sources explicitly point to the existing `dystopia` Oracle bucket. The v3 manifest ID is `bednarczyk`, while the v2 ID remains `dystopia`. |
| `dystopia` | `dystopia_config.json` | `dystopia_config_v3.json` | 4 | 2 / 4 | Portable profile; sculpture controls and audio; all four sources are IPFS. |
| `identity` | `identity_config.json` | `identity_config_v3.json` | 13 | 15 / 13 | Portable profile; video module; 12 IPFS and one HTTPS source. |
| `wakeupcall` | `wakeup_config.json` | `wakeup_config_v3.json` | 15 | 17 / 13 | Portable profile; 14 IPFS and one HTTPS source. |
| `lockdowns` | `lockdowns_config.json` | `lockdowns_config_v3.json` | 18 | 19 / 16 | Portable profile; 17 IPFS and one HTTPS source. |
| `videopoetry` | `tom_exhibit_config.json` | `tom_exhibit_config_v3.json` | 5 | 4 / 6 | Portable profile; video module; 3 IPFS and 2 HTTPS sources. The manifest ID is `proposedlayout`, distinct from the gallery slug. |
| `prompt_procedural_room` | `prompt_procedural_room_config.json` | `prompt_procedural_room_config_v3.json` | 6 | 5 / 3 | Portable procedural profile; chat and surface-print modules. Six declared sources are HTTPS. Its procedural room recipe, actors, service settings, environment, and model transforms remain in the manifest. |

The root-level `example_of_gallery_config_v2.json` and `example_of_gallery_config_v3.json` are authoring examples, not runtime galleries. `public/configs/schemas/exhibit_manifest_v3.schema.json` is the v3 schema. `scripts/exhibit-migrations.json` is the source inventory used by validation and migration tooling.

The following files beside the VECT_AI manifest are publication/audit artifacts, not viewer inputs: `vectai_krakow_032026_ipfs_upload_manifest.json`, `vectai_krakow_032026_nft_metadata.json`, `vectai_krakow_032026_pinata_upload_summary.json`, and `vectai_krakow_032026_arweave_prepare_report.json`. Runtime references are through the gallery registry, `useExhibitConfig`, `loadExhibitConfigV2/V3`, `normalizeManifestShape`, `loadExhibitConfigV2`, and the shared asset resolver.

## Schema comparison and findings

VECT_AI is the only current `portable-exhibit-nft` manifest and the most complete schema example. The nine other v3 scene manifests use the common `portable-exhibit` profile, preserve identity and source history, and carry a v3 `sceneGraph`, asset registry, media/sidebar content, and interactions. Their asset counts and module declarations differ because they describe different works; they should not copy VECT_AI media, lights, rights, CIDs, or NFT metadata.

The main structural differences are:

- VECT_AI has the richest module set (video, audio, sculpture controls, chat), a portable scene graph, renderer compatibility profile, archival rights/integrity records, and explicit portable location audio/light behaviors. Other scenes use the modules they need; the procedural room keeps its generated-room recipe in its own manifest profile.
- Most converted scenes contain more rendering/controller values in `sceneGraph.viewerProfiles.r3fCurrent.params` than in portable `sourceScene`. Where `sourceScene.renderer`, `sourceScene.spawn`, or `sourceScene.background` does declare a value, the v3 adapter now lets that value win. Older v2 viewer-profile precedence remains for compatibility.
- VECT_AI duplicates two lighting/audio routes in portable `interactions` and `r3fCurrent`. Before this change, the viewer consumed only the R3F copy. `normalizeManifestShape` now compiles portable `location_audio_route` and `location_light_profile` records first and uses profile arrays only when a manifest has no portable route of that kind. In particular, `main_room_light` now uses the portable ambient intensity `0.65` and the follow-up brighter exposure `1.24`; the conflicting profile values remain flagged for archival reconciliation.
- VECT_AI declares local development paths, Oracle fallbacks, and IPFS CIDs together. Several older converted manifests have an IPFS `sourceUri` and no explicit Oracle source. Those assets now load through configured IPFS gateways; the viewer no longer guesses an Oracle bucket or object name from an exhibit ID and filename.
- Bednarczyk and Tom retain IDs/storage identities that differ from their gallery slugs. The resolver uses each asset's declared URLs, not a slug-derived bucket convention.

Known content/network findings remain recorded in [v3 migration status](migrations/v3-migration-status.md) and [missing assets](migrations/missing-assets.md): three Tom/Videopoetry Oracle objects return 404, Bednarczyk's GLB lacks two declared artwork/audio anchors, and VECT_AI has a previously observed headless geometry initialization timeout. These findings were not repaired by inventing replacement media or changing public identifiers.

## Runtime loading path

Archive selection resolves a registered manifest URL. `fetchManifest` shares the raw JSON response between scene and sidebar readers. Version/schema validation and `normalizeManifestShape` adapt v3 into the existing runtime compiler. Node/module/media semantics and viewer implementation settings remain separate fields during that conversion.

The global source policy is **Oracle Object Storage → IPFS → other configured immutable/archive source → local/development source**. It is centralized in `src/config/assetResolution.ts` and uses this ordered gateway list: `ipfs.io`, `dweb.link`, `gateway.pinata.cloud`, then `cloudflare-ipfs.com`. Manifest-declared Oracle URLs are required for Oracle to be attempted. Raw `ipfs://` values are translated by the shared policy; no archive asset's Oracle location is synthesized from the manifest ID or basename.

Candidates are tried sequentially per asset. The GLTF adapter fetches each declared source in turn with a 20-second abort timeout, parses the first valid model, and passes a terminal error to the scene boundary for a retryable error overlay. Audio uses abortable per-source fetches with a 20-second timeout. Video uses ordered source candidates and a timeout before moving to the next source. Background/environment textures now use abortable 8-second fetch attempts before decode; a failed source advances to the next configured source, and failure leaves the manifest's configured background color or no environment. Image/document modals cycle through their declared source candidates. Subtitle loading remains asynchronous and optional. A missing optional resource does not hold up scene initialization.

For XR playback, audio is no longer selected by searching exhibit IDs or labels for the word “intro”. A manifest can opt an audio module into session-start playback with `autoplayOnXrSessionStart`; absent that declaration, the viewer does not infer an exhibition-specific action.

## Files and checks

The implementation changes are in `src/config/assetResolution.ts`, `src/config/manifestShape.ts`, `src/config/loaders/loadExhibitConfigV2.ts`, `src/config/loaders/shared.ts`, `src/r3f/useConfiguredGLTFs.ts`, `src/r3f/ScenePresentation.tsx`, audio/video runtime adapters, and the gallery metadata adapter. `docs/exhibit-config-v3.md` documents the source policy and precedence.

## Verification and remaining limits

On 2026-09-27, `npm run configs:validate` reported zero structural errors for all ten runtime v3 manifests. It also reported archival/semantic warnings for unresolved source records or profile duplication (VECT_AI 1, Lockdowns 18, Wakeup 15, Bednarczyk 12, Dystopia 4, Cipriani 43, Identity 13, Tom 5, Lisbon 11, procedural room 6); these are retained as findings rather than hidden by the viewer.

`npm run typecheck`, `npm run unit -- --reporter=dot`, `npm run lint`, and `npm run build` passed. The 113-test unit suite covers compilation of each registered v2 rollback and v3 runtime scene, portable VECT_AI routing precedence, manifest-wide Oracle/IPFS candidate ordering, a simulated VECT_AI subtitle Oracle failure followed by successful IPFS loading, and the current background/exposure declarations across all ten v3 manifests. The loading-timeout diagnostic effect now tracks `configUrl`, so it resets with a scene change. The production build still emits the 1.13 MB R3F vendor chunk warning.

The requested real-scene network/decoder smoke matrix could not run in this environment. The repository script `scripts/smoke-exhibit-configs.mjs` requires the `playwright` package, which is not installed, and no in-app browser execution tool is exposed in this session. Therefore normal remote Oracle loads, live Oracle-to-IPFS recovery for every asset type, GPU/decoder initialization, and controlled total-network-failure UI remain unverified. The unit checks validate config compilation and source ordering, not successful responses from the external storage providers. Existing known missing objects and geometry initialization issue remain documented in [migration findings](migrations/missing-assets.md) and [migration status](migrations/v3-migration-status.md).

## Follow-up visual adjustment

The ten default v3 manifests now use a light neutral (`#e2ddd1`) background fallback, raise their exposure ranges by 15%, and set image-background intensity to at least `1.15`. The `cipriani`, `identity`, and `lockdowns` manifests already referenced IPFS KTX2 backgrounds; they now also have explicit fallback colors and use the bounded multi-gateway loader path. This follow-up visual adjustment has not had a browser/render verification pass. The current shell could not resolve `ipfs.io`, so the remote KTX2 availability could not be checked here.

## Implementation files changed

- Runtime config semantics and compatibility: `src/config/manifestShape.ts`, `src/config/loaders/loadExhibitConfigV2.ts`, `src/config/loaders/loadExhibitConfigV3.test.ts`, `src/config/loaders/shared.ts`, `src/config/v3Migration.test.js`, `src/types/exhibitSchemaV2.ts`, `src/r3f/proceduralRoom/ProceduralRoomScene.tsx`, `src/r3f/proceduralRoom/config.ts`, `src/r3f/proceduralRoom/types.ts`, `src/r3f/sceneConfigParsers.test.ts`.
- Asset resolution and scene/media loading: `src/config/assetResolution.ts`, `src/config/assetResolution.test.ts`, `src/utils/ipfs.ts`, `src/r3f/useConfiguredGLTFs.ts`, `src/r3f/ScenePresentation.tsx`, `src/r3f/Modal.tsx`, `src/r3f/useSceneInteractionMetadata.ts`, `src/modules/audioMeshManager.ts`, `src/modules/applyVideoMeshes.js`.
- Viewer behavior and archive metadata: `src/App.tsx`, `src/components/GalleryGrid.tsx`, `src/components/InfoButtons.tsx`, `src/data/galleryConfig.ts`, `src/r3f/R3FViewer.tsx`, `src/r3f/ThumbnailRecorderMode.tsx`, `src/r3f/useExhibitConfig.ts`, `src/r3f/useSceneAudioRouting.ts`, `src/r3f/useSceneReadiness.ts`, `src/r3f/useXrSessionControls.ts`.
- Schema, validation, and documentation: `public/configs/schemas/exhibit_manifest_v3.schema.json`, `scripts/lib/validateManifest.mjs`, `README.md`, `docs/exhibit-config-v3.md`, `docs/migrations/missing-assets.md`, `docs/migrations/v3-migration-status.md`, and this audit.
