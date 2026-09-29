# Exhibit manifests v3

V3 is the only active runtime manifest format. Its structural template is the existing VectAI portable archive. It preserves each exhibit's appearance and behavior rather than applying VectAI's lighting or content to other exhibits.

Start with `example_of_gallery_config_v3.json`. The schema is `public/configs/schemas/exhibit_manifest_v3.schema.json`, and TypeScript interfaces are in `src/types/exhibitSchemaV3.ts`. The contract remains `3.0.0-draft`.

## Structure

| Section | Purpose |
| --- | --- |
| `metadata`, `provenance`, `rights` | Description, source history and rights review |
| `assets` | Stable asset IDs, delivery `sourceUri`, optional canonical `ipfsUri`, alternate `fallbackUris`, MIME type and integrity |
| `content.media`, `content.sidebar` | Media catalog and sidebar presentation |
| `sceneGraph.sourceScene` | Whole scene definition, including model transforms, spawn, camera, background and renderer |
| `sceneGraph.nodes`, `sceneGraph.modules` | Scene semantics and runtime module settings |
| `sceneGraph.viewerProfiles.r3fCurrent` | Settings required by the current viewer implementation |
| `sceneGraph.proceduralRecipe` | Generated room, actors, physics and external service requirements, where applicable |
| `interactions` | Portable behavior descriptions; retained legacy actions remain available for archival reconstruction |
| `previews.capture.r3fCurrent` | Thumbnail/recording settings consumed by viewers that support capture |
| `viewerBrief`, `preservation` | Reconstruction guidance and outstanding archival work |

`portable-exhibit` supports ordinary and procedural exhibits without requiring a single canonical GLB or NFT token metadata. `portable-exhibit-nft` additionally requires the publishing fields used by the existing VectAI archive. Conversion does not certify rights or minting readiness: original NFT declarations are preserved under `provenance.legacyNft`, and newly migrated archives start with `nft.mintable: false`.

## Runtime compilation

The manifest is the authority for exhibit identity, asset locations, scene semantics, media relationships, interactions, and preservation metadata. The viewer adapts these declarations into its current rendering and input systems. `viewerProfiles.r3fCurrent` carries implementation-specific settings; portable interaction declarations take precedence when both sections describe the same audio or lighting zone. Other viewers can interpret the portable records without reproducing the R3F profile.

The native V3 compiler validates runtime references and compiles the scene and contextual actions into one `CompiledExhibitSnapshot`. `InfoButtons` renders those compiled actions; it does not fetch or reinterpret the manifest. Optional subtitle loading does not block the base scene. A V3 compilation failure is surfaced to the viewer and never selects an archived V2 manifest.

The global production delivery policy is declared Oracle Object Storage URLs first, other declared HTTP delivery URLs next, canonical IPFS through the BPA gateway list after that, followed by Arweave and local/development paths. This policy applies regardless of whether the HTTP delivery URL is in `sourceUri` or `fallbackUris`. The viewer does not derive an Oracle bucket from the exhibit ID or guess a filename. Canonical IPFS references remain intact in the archive JSON for provenance and reconstruction. The shared resolver supplies the ordered browser URLs; format-specific loaders consume that order and try later candidates after failure. Model failure produces a retryable scene error; optional background, environment, image, audio, subtitle, and video failures do not prevent scene navigation.

## Conversion and validation

```sh
# Report what would change, without writing files
npm run configs:migrate -- --all

# Regenerate v3 files from the archived V2 sources and a deterministic source/hash report
npm run configs:migrate -- --all --write --report docs/migrations/v3-conversion-report.json

# Regenerate only converter-owned files after an intentional source change
npm run configs:migrate -- --all --write --overwrite-generated --report docs/migrations/v3-conversion-report.json

# Convert a single archived source
npm run configs:migrate -- --input archive/v2/new_config.json --output public/configs/new_config_v3.json --slug new --write

npm run configs:validate
npm run unit
npm run typecheck
npm run build
```

Existing curated v3 files are protected from overwrite. The converter records source hashes, preserves unknown top-level fields in `extensions.legacy`, and reports every repair. The report and unit tests detect stale generated manifests. A source or generated manifest hash change requires reviewing the migration report before rollout.

Missing sidebar IDs receive deterministic `sidebar_<index>` IDs. Missing sidebar text records are materialized from their existing inline content. Existing sculpture descriptions referenced as media are materialized from their existing node metadata. These changes repair references without inventing exhibit content.

## Gallery selection and rollback

Each gallery entry records one authoritative V3 `configUrl`. Historical V2 manifests are kept in `archive/v2/`, outside the runtime public directory. The `configVersion` query parameter is ignored by gallery selection.

```text
/#lockdowns
```

Future rollback uses Git or deployment rollback. There is no in-application V2 fallback. Archived V2 sources remain available for migration and provenance review, not browser gallery selection.

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
- V2 runtime support was deliberately retired before browser acceptance. Browser acceptance remains outstanding; archival V2 sources are still available in `archive/v2/`.
