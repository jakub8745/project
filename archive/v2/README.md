# Historical V2 exhibit sources

These JSON files are the unchanged V2 migration inputs and authoring example formerly stored in `public/configs/` and the repository root. They are outside the public runtime directory and are not gallery choices. V3 manifests retain their original `sourceManifest.path` and hashes as historical provenance; moving these files does not rewrite that record.

`npm run configs:migrate -- --all` reads these archived inputs for an offline comparison. Runtime rollback now uses Git or deployment rollback, not V2 selection in the application.

`exhibitSchemaV2.ts` records the historical V2 TypeScript contract. Active V3 scene structures use `src/types/exhibitSceneTypes.ts`.
