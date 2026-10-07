import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateManifest } from './lib/validateManifest.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configDirectory = path.join(root, 'public/configs');
const activeManifests = (await fs.readdir(configDirectory))
  .filter((name) => name.endsWith('_config_v3.json'))
  .map((name) => `public/configs/${name}`)
  .sort();
const files = process.argv.slice(2).length ? process.argv.slice(2) : [...activeManifests, 'example_of_gallery_config_v3.json'];
const seen = new Set();
let failures = 0;
for (const file of files) {
  const manifest = JSON.parse(await fs.readFile(path.resolve(root,file),'utf8'));
  const result = validateManifest(manifest);
  if (seen.has(manifest.id)) result.errors.push(`Duplicate manifest ID: ${manifest.id}`);
  seen.add(manifest.id);
  failures += result.errors.length;
  console.log(`${file}: ${result.errors.length} errors, ${result.warnings.length} archival/semantic warnings`);
  for (const error of result.errors) console.error(`  ${error}`);
}
process.exitCode = failures ? 1 : 0;
