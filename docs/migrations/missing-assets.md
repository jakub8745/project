# Missing runtime assets

The HTTP audit checked 140 distinct asset URLs from all v3 manifests. Three returned HTTP 404. Three initial network timeouts were retried once and returned HTTP 200. A HEAD response confirms availability only; it does not establish file integrity or successful decoding.

All three missing runtime locations belong to the `videopoetry` gallery (manifest ID `proposedlayout`). These same paths are used by the retained v2 config.

| Asset ID | File | Runtime location | Canonical reference |
| --- | --- | --- | --- |
| `background_texture` | `bg_puno85.ktx2` | [Oracle object](https://lrbcisjgkyhb.objectstorage.uk-london-1.oci.customer-oci.com/n/lrbcisjgkyhb/b/proposedlayout/o/bg_puno85.ktx2) | `ipfs://bafybeidd6t3cnbazishz43pvu4snhlr523fdbplzqnifvoqq7gmpapleoa/bg_puno85.ktx2` |
| `Video_source_1` | `UnrealPlaces.mp4` | [Oracle object](https://lrbcisjgkyhb.objectstorage.uk-london-1.oci.customer-oci.com/n/lrbcisjgkyhb/b/proposedlayout/o/UnrealPlaces.mp4) | `ipfs://bafybeifphj2mogo3gxz7k5klcxp3fn6i3ffzrpupn65qtkamodygclhane/UnrealPlaces.mp4` |
| `Screen_source_1` | `MurzynHeritage.mp4` | [Oracle object](https://lrbcisjgkyhb.objectstorage.uk-london-1.oci.customer-oci.com/n/lrbcisjgkyhb/b/proposedlayout/o/MurzynHeritage.mp4) | `ipfs://bafybeifphj2mogo3gxz7k5klcxp3fn6i3ffzrpupn65qtkamodygclhane/MurzynHeritage.mp4` |

A separate HEAD check through `ipfs.io` returned HTTP 429 for all three canonical references. Their IPFS availability remains unverified; a rate limit is not evidence that the content is missing.

Repair by restoring these objects to their existing Oracle locations, or by adding a verified alternative to `assets.<id>.fallbackUris` in the v3 manifest. Do not substitute guessed media or remove the canonical references. No upload or storage change was performed during migration.

## Other content issues

The Bednarczyk GLB does not contain the declared nodes `Milkmaid` and `dzbanDystopia` (including checked `extras.name` aliases). Both declarations already exist in v2. These are missing scene anchors, not missing asset files. Its `logo_oficyny` link anchor matches. Keep the source declarations until the intended artwork/audio anchors are identified.

The VECT_AI portable `main_room_light` behavior differs from its `r3fCurrent` profile. The runtime uses the portable values; this remains an archival metadata discrepancy, not a missing asset.

See `v3-asset-audit.json`, `missing-asset-ipfs-check.json` and `v3-model-audit.json` for the recorded checks and timestamps.
