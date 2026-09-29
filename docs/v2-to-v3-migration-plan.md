# Full exhibit migration from v2 to v3

> Historical plan: its V2 runtime retention instructions describe the migration phase and are superseded by the current V3-only runtime. V2 source manifests remain in `archive/v2/` for provenance and offline tooling.

Status: implementation is present locally, including v3 gallery defaults and retained v2 access. Full acceptance remains pending for the issues in [the migration status report](migrations/v3-migration-status.md). The inventory and stages below record the original plan and baseline.

## Objective and boundaries

Use `public/configs/vectai_krakow_032026_config_v3.json` as the reusable structural template for every exhibit. “Theme” means the manifest layout and preservation model, as confirmed by the user. Each exhibit keeps its own content, appearance, navigation, lighting, media behavior, and procedural features.

Keep every existing v2 JSON URL and the v2 loader working throughout this migration and after the gallery defaults move to v3. Removing v2 support is a separate, future decision. Preserve gallery slugs and existing hash links.

The scope includes all ten v2 exhibit manifests, the v2 example, the schema and types, loader adapters, sidebar consumers, gallery selection, validation, documentation, and reusable publishing tooling. Asset uploads, NFT minting, and v2 retirement are separate operations and are not prerequisites for a working v3 viewer.

## Current inventory and rollout order

There are ten gallery entries: VectAI already selects v3, and the other nine select v2. VectAI also retains a v2 manifest. The filenames without a version suffix below are nevertheless schema 2.0.0.

| Wave | Gallery slug | Existing v2 file under `public/configs/` | Proposed v3 file | Features that must survive |
| --- | --- | --- | --- | --- |
| Reference | `vectai_krakow_032026` | `vectai_krakow_032026_config_v2.json` | Existing `vectai_krakow_032026_config_v3.json` | Documents, synchronized video, spatial audio, subtitles, sculpture manipulation, audio and light zones, archival metadata |
| 1 | `lockdowns` | `lockdowns_config.json` | `lockdowns_config_v3.json` | Image panels, background, spawn, exposure, sidebar |
| 1 | `wakeupcall` | `wakeup_config.json` | `wakeup_config_v3.json` | Image panels, room semantics, elevated spawn, renderer settings |
| 2 | `bednarczyk` | `bednarczyk_config.json` | `bednarczyk_config_v3.json` | Audio, image and external link behavior; resolve duplicate manifest ID |
| 2 | `dystopia` | `dystopia_config.json` | `dystopia_config_v3.json` | Audio, image panels, sculpture controls |
| 2 | `cipriani` | `cipriani_config.json` | `cipriani_config_v3.json` | Forty image entries, audio, node mappings, lighting and model history |
| 3 | `identity` | `identity_config.json` | `identity_config_v3.json` | Two video instances, sync behavior, image panels and node semantics |
| 3 | `videopoetry` | `tom_exhibit_config.json` | `tom_exhibit_config_v3.json` | Video, sculpture/image semantics; preserve existing `proposedlayout` manifest ID initially |
| 3 | `videopoem_lisbon_112025` | `videopoem_lisbon_112025_config_v2.json` | `videopoem_lisbon_112025_config_v3.json` | Three videos, audio, viewer media overrides, spawn direction and Cineon renderer settings |
| 4 | `prompt_procedural_room` | `prompt_procedural_room_config.json` | `prompt_procedural_room_config_v3.json` | Generated room, two robot instances, blobs, physics, chat prompts, surface prints, thumbnails |
| Documentation | No gallery route | Root `example_of_gallery_config_v2.json` | Root `example_of_gallery_config_v3.json` | A minimal, valid authoring example with no VectAI-specific content |

Wave order is based on feature coverage and migration risk. A wave moves to default v3 only after every exhibit in that wave meets the acceptance gates below.

## Blockers discovered in the current code

1. `loadExhibitConfigV3.ts` reconstructs `scene` from only model, background, spawn and camera. It drops `sceneGraph.sourceScene.renderer`; a direct conversion would lose renderer settings in most exhibits.
2. The adapter does not restore top-level v2 `thumbnailCapture` or `metadataExtras`. The procedural config currently also duplicates thumbnail settings inside `viewer`; relying on that duplication would conceal data loss.
3. `InfoButtons.tsx` independently fetches the raw manifest and expects top-level `sidebar`, `media`, and v2 asset `uri` values. V3 moves sidebar and media under `content` and uses `ipfsUri`/`sourceUri`. Updating only the main viewer loader is insufficient.
4. The v2 runtime compiler does not generally interpret top-level `interactions`. Much active behavior comes from nodes, modules and viewer extensions. Moving behavior exclusively into v3 interaction descriptions would disable it.
5. The v3 JSON schema requires NFT fields including a canonical scene asset. The procedural exhibit has no single scene GLB, and not every exhibit has verified NFT or immutable asset metadata.
6. `bednarczyk_config.json` currently has `id: "dystopia"`, as does Dystopia. Runtime URL resolution can depend on the ID. A uniqueness repair must preserve the intended storage URLs and any dependent references.
7. VectAI v3 is already an independently curated reference. For example, its main-room portable light interaction and `r3fCurrent.lightZones` differ. Do not regenerate it blindly from v2 or silently choose which version represents artistic intent.
8. Current unit tests include five failures involving asset URLs changed during the Oracle migration. Establish correct asset expectations before using the suite as a migration gate; do not mask failures with broad or self-referential assertions.
9. Current preservation/upload scripts contain hard-coded VectAI paths. They cannot yet serve as a general migration or publishing workflow.

## Target manifest contract

Keep the VectAI section layout: `schemaVersion`, `manifestType`, `profile`, `id`, `slug`, `sourceManifest`, `metadata`, `provenance`, `rights`, `assets`, `content`, `sceneGraph`, `interactions`, `previews`, `viewerBrief`, `preservation`, and optional publishing sections such as `nft` and `exports`.

Use a pinned v3 contract based on the current draft for the migration. Define a base portable-exhibit profile and an NFT profile that extends it. Tighten nested validation without making VectAI-specific scene assets, media, rights, or minting status mandatory for every exhibit. Any additional runtime theme defaults should be expanded into the emitted manifest so that an archive can be reconstructed without fetching a separate theme file.

| v2 source | v3 destination and rule |
| --- | --- |
| `id`, `metadata` | Preserve directly; review duplicate IDs separately. Keep gallery slug distinct from manifest identity and asset storage location. |
| Whole `scene` | Whole `sceneGraph.sourceScene`, including renderer, model transforms, background, environment, spawn and camera. Avoid selecting only known subfields. |
| `nodes` | `sceneGraph.nodes`; retain stable node names, media links, visibility, collision and transform settings. |
| `modules` | `sceneGraph.modules`; retain instance order, sync groups, target nodes and media references. |
| `media`, `sidebar` | `content.media`, `content.sidebar`, preserving IDs, ordering, document labels and media references. |
| `viewer` | `sceneGraph.viewerProfiles.r3fCurrent`; preserve every existing extension and its precedence during initial conversion. |
| `thumbnailCapture` | Proposed `previews.capture.r3fCurrent`; restore it through the adapter. Keep an existing viewer override as the winning runtime value, matching current behavior. |
| `metadataExtras` and migration history | Proposed `provenance.legacyMetadataExtras`, plus explicit `sourceManifest` provenance; preserve without treating every legacy field as authoritative metadata. |
| Top-level and viewer interactions | Preserve existing records and document supported behavior contracts. Add portable descriptions from known module behavior using stable IDs; report conflicts rather than duplicating executable actions. |
| `assets.*.uri` | IPFS URI becomes `ipfsUri`; retain a usable `sourceUri`. HTTP/local URI becomes `sourceUri`, with `ipfsUri: null` until actually uploaded. |
| `assets.*.fallbackUris` | Preserve explicit order and exact URLs. Do not infer a bucket from the gallery slug or assume that the first fallback is always Oracle. |
| Asset metadata and integrity | Preserve MIME type, rights and existing verified integrity values. Map known fields explicitly; retain unrecognized data in a documented extension and report it. |
| Existing `nft` data | Preserve its meaning with an explicit mapping. Missing publishing data remains absent or pending under the base profile; never copy VectAI CIDs, rights or `mintable: true`. |
| Procedural viewer settings | Preserve in `r3fCurrent` for immediate runtime parity; additionally describe the generated scene recipe and service dependencies in the portable contract. Do not invent a canonical scene GLB. |

Unknown or unmapped fields must appear in the migration report. A converter must never silently discard them.

## Implementation stages

### Stage 0 — Establish a reproducible baseline

- Record the source paths and hashes of all ten manifests and the authoring example, plus current gallery route selections.
- Capture normalized runtime outputs for each exhibit, including final optional subtitle updates. Mock network resources in automated parity checks so the comparisons are deterministic.
- Record the current precedence rules: renderer settings, spawn-derived parameters, viewer parameters; generated media versus viewer overrides; top-level versus viewer thumbnail settings.
- Audit manifest identity and asset locations, including Bednarczyk's duplicate ID, Tom's `proposedlayout` ID and storage buckets that differ from gallery slugs.
- Resolve existing asset test expectations against intended configs and known asset locations. Verify required remote assets separately; distinguish inaccessible assets from adapter defects.
- Baseline VectAI against its current v3 runtime, with explicit documentation of existing v2/v3 differences. It is not a strict v2 round-trip fixture.

Deliverable: baseline fixtures, a source inventory and an exceptions list. Gate: every known discrepancy is classified before conversion starts.

### Stage 1 — Define the reusable v3 template

- Add v3 TypeScript types and strengthen the existing schema for the fields actually consumed by adapters and UI.
- Create a neutral v3 example from the VectAI structure, removing exhibit-specific assets, people, coordinates, descriptions, licensing claims and publishing values.
- Define model-based and procedural scene variants, including how a procedural recipe, imported models, external prompts and live services are represented.
- Specify required versus optional resources: a missing required scene asset is an error; optional audio, subtitles and decorative assets must not prevent navigation.
- Separate viewer readiness from archival/publishing readiness. A valid, usable v3 exhibit can still have pending hashes, CIDs or rights records.
- Choose one authoritative source for duplicated behavior. Initially retain the existing runtime profile behavior and flag mismatched portable descriptions for review; resolve those mismatches before declaring the archive semantically complete.

Deliverable: versioned schema/types, field mapping and `example_of_gallery_config_v3.json`. Gate: existing VectAI and representative model/procedural fixtures are supported without silently weakening required fields.

### Stage 2 — Complete v2/v3 compatibility and consumers

- Keep `loadExhibitConfig.ts` dispatching both schema families. V3 may continue adapting into the existing v2 runtime compiler for this rollout; extracting a neutral compiler is a later cleanup and must not block migration.
- Make the v3 adapter preserve the complete source scene, preview capture settings, extensions and provenance needed by the agreed contract.
- Centralize asset resolution so viewer and sidebar honor the same explicit fallback order while retaining canonical IPFS references for archival use. Handle missing values with actionable diagnostics.
- Update sidebar normalization to accept both manifest shapes. Reuse a shared fetch/manifest normalization layer rather than triggering a second full runtime/subtitle compilation for the sidebar.
- Preserve asynchronous subtitle loading, abort handling, retry and cache invalidation. Cache by selected manifest URL/version so v2 and v3 cannot overwrite each other's results.
- Keep all existing v2 files and exports available. Introduce no automatic fallback that conceals a broken v3 manifest.

Deliverable: compatible adapters and UI consumers. Gate: v2 regression checks and synthetic v3 cases cover renderer settings, transforms, sidebar images/PDF/video, asset URLs, thumbnails and procedural extensions.

### Stage 3 — Build a deterministic converter

- Add `scripts/migrate-exhibit-v2-to-v3.mjs` with explicit input/output arguments, dry-run output and a machine-readable migration report.
- Emit new sibling `_config_v3.json` files. Refuse overwriting an existing curated v3 file by default, especially VectAI.
- Preserve every node, asset, media, module and sidebar ID. Generate new interaction IDs deterministically and check for collisions.
- Preserve the original source and source hash in provenance. Avoid timestamps or ordering changes that make identical inputs produce different outputs unless supplied explicitly.
- Report unresolved asset references, MIME types, storage dependencies, ID collisions, rights gaps, unsupported interactions and unmapped extensions.
- Handle VectAI as a reference/reconciliation case. Do not overwrite its uploaded asset registry, token metadata or hand-authored preservation records with generated output.

Deliverable: converter plus conversion reports for the full inventory. Gate: repeat runs are deterministic, source files are untouched, and losses or ambiguities prevent rollout of the affected exhibit.

### Stage 4 — Generate and verify each rollout wave

Generate candidates for all exhibits, then review and activate them in the inventory order.

- Wave 1 proves image panels, background and spawn behavior without complex media modules.
- Wave 2 proves audio, links, sculpture controls and a larger image registry. Resolve Bednarczyk's ID before activation; explicit asset URLs must preserve its existing storage locations.
- Wave 3 proves video sync, audio/video overrides, subtitles where configured and renderer differences. Preserve Lisbon's viewer overrides until their equivalence to portable modules has been demonstrated.
- Wave 4 proves the generated room, robot instances, collision behavior, prompt loading, chat service configuration, persisted surface prints and thumbnail recording. Document live service requirements and behavior when those services are unavailable.
- For every wave, compare normalized v2 and converted-v3 outputs, then inspect actual desktop, touch and XR behavior where supported. Any intended difference needs an explicit entry in the report.

Deliverable: all sibling v3 manifests plus per-exhibit acceptance records. Gate: structural validation and runtime parity pass; required asset problems and visible regressions are resolved before activation.

### Stage 5 — Switch gallery defaults with explicit rollback

- Extend gallery registration to record both config URLs and the selected default version. Preserve the existing slug and hash route.
- Add a deliberate preview/debug version selector, for example `?configVersion=2` or `?configVersion=3`, applied only to registered configs. This selector does not exist today.
- Keep the main viewer, sidebar, page metadata and thumbnail tooling on the same selected URL. Audit code that currently looks up galleries by `configUrl` equality.
- Move each accepted wave's default to v3. VectAI remains on its existing v3 default throughout.
- Rollback consists of selecting v2 for the affected gallery, with the original JSON file and loader still present. Confirm both retained URLs remain accessible in the deployment artifact.

Deliverable: all ten gallery defaults on validated v3 configs, with explicit v2 access and rollback. Gate: both version selections work for each route, including reloads, retries and switching between exhibits.

### Stage 6 — Finish documentation and archival tooling

- Update README and authoring documentation to recommend v3, link the v3 example and explain the retained v2 compatibility path. Label the existing v2 documentation as supported legacy authoring guidance.
- Parameterize preservation/upload scripts by manifest path and output location while keeping existing VectAI entry points usable.
- Keep upload receipts and the final manifest CID in external publishing metadata. Do not require a manifest to contain its own final CID/hash, which would change the bytes being addressed.
- Record missing CIDs, hashes, provenance and rights as a publishing backlog. Do not fabricate values or block viewer migration on minting work.
- Create a separate future v2-retirement checklist; this migration does not execute it or set an automatic removal date.

Deliverable: documented v3 workflow, reusable tooling and a tracked archival backlog. Gate: a new exhibit can be authored and validated from the example without copying VectAI-specific data.

## Acceptance checks

1. Every manifest passes its selected schema/profile, cross-reference validation and uniqueness checks. Asset references, module targets and interaction IDs resolve; model node names are checked against the actual GLB where applicable.
2. V2 remains loadable. For each newly converted exhibit, effective v3 runtime values match the v2 baseline, excluding approved identity fixes and new archival-only metadata.
3. Validate both initial runtime output and later optional subtitle updates. Include empty and failed optional resources, abort/retry behavior and version-specific caches.
4. Confirm model transform, spawn, movement, collision, appearance, lights/exposure, environment, media playback/sync, controls, modals, sidebar, links, page metadata and thumbnail capture for the features each exhibit uses.
5. For the procedural room, validate generated geometry, model instance identity, physics actor IDs and rules, chat prompts, collision-triggered chat, prints and service-unavailable behavior.
6. Use typecheck, focused adapter/sidebar/converter tests, the full unit suite and a production build as implementation gates. Existing asset migration failures must be resolved rather than excluded from the final result.
7. Compare navigation-ready time, media request counts and scene-switch behavior against the baseline under the same cache/network conditions. A format migration should not duplicate config fetching, make optional media block entry or increase unnecessary asset loads.
8. Verify the v2 selector/rollback and retained public config URLs after each rollout wave. No v2 file, loader or example is deleted.

## Completion definition

All ten gallery entries default to validated v3 manifests using the VectAI structural template; all nine previously v2-selected galleries have reviewed sibling v3 files; VectAI's curated v3 archive remains intact; the v3 example and documentation cover both model and procedural exhibits; sidebar and runtime consumers support both shapes; each original v2 URL and loader remains usable. Archival upload/rights gaps are recorded separately from runtime migration status.
