import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { sha256 } from './lib/exhibitMigration.mjs';
import { validateManifest } from './lib/validateManifest.mjs';

export async function prepareArchive(manifestPath, outputDir) {
  const sourcePath = path.resolve(manifestPath);
  const sourceText = await fs.readFile(sourcePath,'utf8');
  const manifest = JSON.parse(sourceText);
  const validation = validateManifest(manifest);
  if (validation.errors.length) throw new Error(validation.errors.join('\n'));
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const assets = [];
  for (const [id,asset] of Object.entries(manifest.assets)) {
    if (asset.kind === 'manifest' || id === manifest.nft?.canonicalManifestAsset) continue;
    let localPath = asset.localPath ? path.resolve(root,asset.localPath) : undefined;
    if (!localPath && asset.sourceUri.startsWith('/') && !asset.sourceUri.startsWith('//')) localPath = path.join(root,'public',asset.sourceUri.slice(1));
    let integrity = {};
    if (localPath) {
      try { const bytes=await fs.readFile(localPath); integrity={sha256:sha256(bytes),byteSize:bytes.length}; }
      catch(error) { if (error.code !== 'ENOENT') throw error; localPath=undefined; }
    }
    assets.push({id,mimeType:asset.mimeType,ipfsUri:asset.ipfsUri,sourceUri:asset.sourceUri,fallbackUris:asset.fallbackUris,localPath,...integrity});
  }
  const plan={id:manifest.id,sourcePath,sourceSha256:sha256(sourceText),assets,warnings:validation.warnings};
  await fs.mkdir(outputDir,{recursive:true});
  await fs.writeFile(path.join(outputDir,'archive-plan.json'),JSON.stringify(plan,null,2)+'\n');
  return plan;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {values}=parseArgs({options:{manifest:{type:'string'},'output-dir':{type:'string'}}});
  if (!values.manifest || !values['output-dir']) throw new Error('Use --manifest <v3.json> --output-dir <directory>. No uploads are performed.');
  const plan=await prepareArchive(values.manifest,values['output-dir']);
  console.log(`${plan.id}: ${plan.assets.length} assets; plan saved to ${values['output-dir']}/archive-plan.json`);
}
