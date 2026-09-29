import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { convertV2ToV3, sha256, MIGRATION } from './lib/exhibitMigration.mjs';
import { validateManifest } from './lib/validateManifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: {
  all:{type:'boolean'},input:{type:'string'},output:{type:'string'},id:{type:'string'},slug:{type:'string'},
  write:{type:'boolean'},'dry-run':{type:'boolean'},report:{type:'string'},'overwrite-generated':{type:'boolean'}
} });
if (!values.all && (!values.input || !values.output)) throw new Error('Use --all or --input <v2.json> --output <v3.json>. Default: dry run. Add --write to save.');
const inventory = JSON.parse(await fs.readFile(path.join(root, 'scripts/exhibit-migrations.json'), 'utf8'));
const jobs = values.all ? inventory.map((job) => ({ ...job, input:`archive/v2/${job.v2}`, sourcePath:`public/configs/${job.v2}`, output:`public/configs/${job.v3}` })) : [{ input:values.input, output:values.output, id:values.id, slug:values.slug }];
if (values.all) jobs.push({ input:'archive/v2/example_of_gallery_config_v2.json',sourcePath:'example_of_gallery_config_v2.json',output:'example_of_gallery_config_v3.json',slug:'example_exhibit',wave:'documentation' });
const report = [];
const outputs = [];
for (const job of jobs) {
  const text = await fs.readFile(path.resolve(root,job.input),'utf8');
  const source = JSON.parse(text);
  const baseline = { input:job.input, sourceId:source.id, sourceSha256:sha256(text), output:job.output, wave:job.wave };
  if (job.curated) {
    const existing = await fs.readFile(path.resolve(root,job.output),'utf8');
    report.push({ ...baseline, status:'curated_v3_retained', outputSha256:sha256(existing), warnings:['Compare portable lighting descriptions with active viewer profiles; current runtime is authoritative for rollout.'] });
    continue;
  }
  const result = convertV2ToV3(source,{ sourcePath:job.sourcePath || job.input, sourceHash:sha256(text), id:job.id || source.id, slug:job.slug || source.id });
  const validation = validateManifest(result.manifest);
  if (validation.errors.length) throw new Error(`${job.input}: ${validation.errors.join('; ')}`);
  const output = JSON.stringify(result.manifest,null,2)+'\n';
  const outputPath = path.resolve(root,job.output);
  if (outputPath === path.resolve(root,job.input)) throw new Error('The v2 source cannot be overwritten.');
  const previous = await fs.readFile(outputPath,'utf8').catch((error) => { if (error.code !== 'ENOENT') throw error; return null; });
  if (values.write && !values['dry-run'] && previous && !(values['overwrite-generated'] && JSON.parse(previous).sourceManifest?.migration === MIGRATION)) throw new Error(`Refusing to overwrite ${job.output}; use --overwrite-generated only for generated files.`);
  outputs.push({ outputPath,output });
  report.push({ ...baseline, id:result.manifest.id, status:'generated', outputSha256:sha256(output), warnings:result.warnings, unmappedFields:result.unmappedFields,
    archivalBacklog:Object.entries(result.manifest.assets).map(([id,asset]) => ({ id, needsImmutableUri:!asset.ipfsUri, needsIntegrity:!asset.sha256, needsRights:!asset.rights })) });
}
if (values.write && !values['dry-run']) {
  for (const { outputPath,output } of outputs) await fs.writeFile(outputPath,output);
}
const reportText = JSON.stringify({ migration:MIGRATION, exhibits:report },null,2)+'\n';
if (values.report && values.write && !values['dry-run']) await fs.writeFile(path.resolve(root,values.report),reportText);
else process.stdout.write(reportText);
console.error(`${outputs.length} candidate manifests ${values.write && !values['dry-run'] ? 'written' : 'prepared (dry run)' }; curated VectAI and v2 sources retained.`);
