# V3 migration status

> Historical migration status: the V2 rollback route described below was subsequently retired. The active application is V3-only, with V2 sources retained in `archive/v2/`. Browser acceptance of the V3-only application remains outstanding.

The local implementation covers all nine previously v2-selected galleries and a neutral v3 authoring example. VectAI's existing curated v3 manifest remains the structural reference. All ten gallery entries select v3 by default; each original v2 file and loader remains available through `?configVersion=2#<gallery-slug>`. Nothing has been deployed or uploaded by this migration.

## Implementation stages

| Stage | Delivered | Remaining acceptance work |
| --- | --- | --- |
| 0: Baseline | Source inventory and hashes, runtime parity comparisons, remote asset and model-node audits | Resolve the existing content issues listed below |
| 1: Contract | Schema, TypeScript types, neutral example, model and procedural support | Complete archive rights, integrity and provenance records |
| 2: Compatibility | Whole-scene adapter, sidebar normalization, shared asset resolution and cancellable manifest cache | Exhaustive interaction and physical XR checks |
| 3: Converter | Deterministic conversion, source preservation, curated-file protection and repair report | None for generation of the current inventory |
| 4: Candidates | Nine sibling manifests; desktop startup comparisons and representative touch checks | VectAI startup investigation; remaining device and media checks |
| 5: Selection | V3 defaults, explicit v2/v3 selector, URL-based caches and history handling | Deployment observation and browser history acceptance checks |
| 6: Documentation/tooling | Authoring guide, conversion/validation commands, generic archive preparation and Pinata publication workflow | Actual publication is separate; legacy provider-specific scripts remain available |

## Recorded checks

- Unit suite: 79 tests passed across 13 files, including generated-manifest parity, schema validation, converter protections, asset resolution and cancellation/cache behavior.
- Lint, TypeScript checks and production build passed. The build still reports a large existing `r3f-vendor` chunk.
- All 11 v3 manifests, including the example, passed structural/reference validation with zero errors. Warnings retain outstanding preservation metadata and the VectAI lighting discrepancy.
- Desktop Chromium: all nine newly migrated galleries reached navigation readiness in both versions (18 successful scenarios). All 20 scenarios reported zero JavaScript errors and one successful manifest response each. See [desktop results](v3-browser-audit.json).
- Touch emulation at 390 × 844: Lockdowns and the procedural room reached readiness without JavaScript errors. The procedural room remained accessible with API calls blocked. See [touch results](v3-mobile-audit.json).
- HTTP audit: 137 of 140 distinct registered asset URLs returned HTTP 200, including three successful retries. All ten required model URLs were available. HEAD availability does not establish decoding or cryptographic integrity.

These checks establish conversion parity and basic browser readiness. They do not establish complete playback/synchronization, sculpture manipulation, thumbnail recording, live chat/print persistence, physical XR behavior or a controlled performance improvement. Startup times were collected under varying network/cache conditions and are not a benchmark.

## Outstanding issues

1. **Videopoetry:** `bg_puno85.ktx2`, `UnrealPlaces.mp4` and `MurzynHeritage.mp4` return HTTP 404 at their configured Oracle runtime locations. Their canonical IPFS references remain unverified because the gateway returned HTTP 429. Exact URLs and repair options are in [missing assets](missing-assets.md). These locations are shared with v2.
2. **Bednarczyk:** the model lacks the declared `Milkmaid` and `dzbanDystopia` scene anchors. The declarations are inherited from v2 and have been retained pending identification of their intended targets. See [model audit](v3-model-audit.json).
   The v3 candidate also has an intentional brighter presentation profile: fixed exposure 1.35, auto exposure disabled, higher ambient/background intensity and a lighter color grade. The original v2 profile remains available for rollback.
3. **VectAI:** both v2 and the existing v3 hit the application's geometry initialization timeout in headless Chromium. Follow-up v3 attempts also timed out. The model URL was available; the cause has not been established. Its existing v3 default was retained.
4. **VectAI archival semantics:** portable `main_room_light` behavior still differs from the `r3fCurrent` profile. The runtime adapter now follows the portable interaction values; the manifest discrepancy remains flagged for archival reconciliation.
5. **Acceptance:** physical XR and exhaustive media/interaction checks remain pending. V3 defaults are local implementation changes, not a claim that every acceptance gate in the original plan has passed.

No v2 retirement date is set. Before retirement, complete these checks, observe a deployed rollout, identify external users of v2 URLs and approve a separate removal change. Keep both manifest families available until then.

See [conversion report](v3-conversion-report.json), [asset audit](v3-asset-audit.json) and [authoring guide](../exhibit-config-v3.md) for reproducible inputs and tooling.
