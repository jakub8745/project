# Exhibit manifests v3

V3 is the preferred authoring format. Its structural template is the existing VectAI portable archive. It preserves each exhibit's appearance and behavior rather than applying VectAI's lighting or content to other exhibits.

Start with `example_of_gallery_config_v3.json`. The schema is `public/configs/schemas/exhibit_manifest_v3.schema.json`, and TypeScript interfaces are in `src/types/exhibitSchemaV3.ts`. The contract remains `3.0.0-draft` during this compatibility rollout.

## Structure

| Section | Purpose |
| --- | --- |
| `metadata`, `provenance`, `rights` | Description, source history and rights review |
| `assets` | Stable asset IDs, `sourceUri`, optional canonical `ipfsUri`, ordered fallback URLs, MIME type and integrity |
| `content.media`, `content.sidebar` | Media catalog and sidebar presentation |
| `sceneGraph.sourceScene` | Whole scene definition, including model transforms, spawn, camera, background and renderer |
| `sceneGraph.nodes`, `sceneGraph.modules` | Scene semantics and runtime module settings |
| `sceneGraph.viewerProfiles.r3fCurrent` | Settings required by the current viewer implementation |
| `sceneGraph.proceduralRecipe` | Generated room, actors, physics and external service requirements, where applicable |
| `interactions` | Portable behavior descriptions; retained legacy actions remain available for archival reconstruction |
| `previews.capture.r3fCurrent` | Thumbnail/recording settings consumed by viewers that support capture |
| `viewerBrief`, `preservation` | Reconstruction guidance and outstanding archival work |

`portable-exhibit` supports ordinary and procedural exhibits without requiring a single canonical GLB or NFT token metadata. `portable-exhibit-nft` additionally requires the publishing fields used by the existing VectAI archive. Conversion does not certify rights or minting readiness: original NFT declarations are preserved under `provenance.legacyNft`, and newly migrated archives start with `nft.mintable: false`.

## Runtime compatibility

The manifest is the authority for exhibit identity, asset locations, scene semantics, media relationships, interactions, and preservation metadata. The viewer adapts these declarations into its current rendering and input systems. `viewerProfiles.r3fCurrent` carries implementation-specific settings; portable interaction declarations take precedence when both sections describe the same audio or lighting zone. Other viewers can interpret the portable records without reproducing the R3F profile.

Both the scene and sidebar use `normalizeManifestShape` and the shared asset resolver. They share one raw manifest request without waiting for optional subtitle/media loading. Aborting one reader does not cancel another reader's request. The selected manifest URL identifies each version's cache entry.

The global production source policy is Oracle Object Storage → canonical IPFS through the ordered BPA gateway list → other configured immutable/archive URLs → local/development paths. The manifest must declare Oracle locations in `sourceUri` or `fallbackUris`; the viewer does not derive an Oracle bucket from the exhibit ID or guess a filename. Canonical IPFS references remain intact in the archive JSON. The shared resolver supplies browser gateway URLs and per-asset loaders try those sources in order with bounded waits. Model failure produces a retryable scene error; optional background, environment, image, audio, subtitle, and video failures do not prevent scene navigation.

## Conversion and validation

```sh
# Report what would change, without writing files
npm run configs:migrate -- --all

# Create sibling v3 files and a deterministic source/hash report
npm run configs:migrate -- --all --write --report docs/migrations/v3-conversion-report.json

# Regenerate only converter-owned files after an intentional source change
npm run configs:migrate -- --all --write --overwrite-generated --report docs/migrations/v3-conversion-report.json

# Convert a single new exhibit
npm run configs:migrate -- --input public/configs/new_config.json --output public/configs/new_config_v3.json --slug new --write

npm run configs:validate
npm run unit
npm run typecheck
npm run build
```

Existing curated v3 files are protected from overwrite. The converter records source hashes, preserves unknown top-level fields in `extensions.legacy`, and reports every repair. The report and unit tests detect stale generated manifests. A source or generated manifest hash change requires reviewing the migration report before rollout.

Missing sidebar IDs receive deterministic `sidebar_<index>` IDs. Missing sidebar text records are materialized from their existing inline content. Existing sculpture descriptions referenced as media are materialized from their existing node metadata. These changes repair references without inventing exhibit content.

## Gallery versions and rollback

Gallery entries record `configUrls` for both versions and a `defaultConfigVersion`. `configUrl` mirrors the default for existing consumers; tests enforce consistency.

```text
/?configVersion=3#lockdowns
/?configVersion=2#lockdowns
```

The version selection persists when changing galleries and supports browser history. Invalid version values use the registered default. Every original v2 JSON URL and the v2 loader remain available. To roll back a gallery default, change `defaultConfigVersion` and its mirrored `configUrl` to the v2 entry. Do not delete the v3 candidate or silently fall back after a v3 error.

## Archival preparation and publication

```sh
node scripts/prepare-exhibit-archive.mjs --manifest public/configs/lockdowns_config_v3.json --output-dir /tmp/lockdowns-archive

# Also defaults to preparation only; performs no upload
node scripts/publish-exhibit-ipfs.mjs --manifest public/configs/lockdowns_config_v3.json --output-dir /tmp/lockdowns-archive
```

Preparation writes a plan of local files, existing immutable URIs and outstanding metadata. Actual publication is a separate explicit operation: set `PINATA_JWT` and pass `--upload`. For assets without a local file or an existing IPFS URI, supply `--asset-dir` containing files named exactly by asset ID. All required files are checked before the first upload. Remote HTTP assets are not silently copied or published.

Publication writes a new archival snapshot and an external upload receipt. It does not modify the source manifest. The snapshot excludes a self-referencing manifest asset, preserves prior NFT/export records as publishing history, and uses the base portable profile with minting disabled. Its final CID/hash exists only in the external receipt, so inserting a CID cannot invalidate the bytes just uploaded. Asset receipts are saved progressively to support recovery after an interrupted upload. Minting and token metadata export require a separate rights/integrity review.

The previous VectAI provider scripts remain available for their existing workflow. Use the manifest-parameterized preparation and Pinata script for new exhibits; legacy provider scripts are not the general v3 migration interface.

## Known archive dependencies

Current implementation evidence and remaining acceptance work are recorded in [migration status](migrations/v3-migration-status.md). Exact unavailable runtime URLs are listed in [missing assets](migrations/missing-assets.md).

- Bednarczyk's v3 ID is `bednarczyk`; its v2 ID remains `dystopia`. Its IPFS-backed image/audio assets explicitly retain their existing Dystopia storage locations.
- Tom's exhibit retains manifest ID `proposedlayout` and gallery slug `videopoetry`.
- VECT_AI's portable `main_room_light` values still differ from its `r3fCurrent` profile. The runtime now follows the portable interaction values; the validator continues to report the manifest-level discrepancy for archival review.
- The generated room's live chat and persisted prints depend on the configured API. Browser smoke checks do not send messages or create prints. Optional service failures must not prevent room entry.
- Retiring v2 requires a separate decision after deployment observation, hardware checks and verification of external consumers. This migration does not remove it.
