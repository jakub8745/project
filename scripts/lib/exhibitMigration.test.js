import { expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { convertV2ToV3 } from './exhibitMigration.mjs';
import { prepareArchive } from '../prepare-exhibit-archive.mjs';

it('defaults to dry run, protects source files and refuses overwriting curated output', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'exhibit-migration-test-'));
  try {
    const input=path.join(dir,'v2.json'); const output=path.join(dir,'v3.json');
    const text=JSON.stringify({schemaVersion:'2.0.0',id:'fixture',metadata:{title:'Fixture',description:''},assets:{model:{kind:'model',uri:'/fixture.glb',mimeType:'model/gltf-binary'}},scene:{model:{asset:'model'}},nodes:{}});
    await fs.writeFile(input,text);
    const args=['scripts/migrate-exhibit-v2-to-v3.mjs','--input',input,'--output',output];
    execFileSync(process.execPath,args,{stdio:'pipe'});
    await expect(fs.readFile(output)).rejects.toMatchObject({code:'ENOENT'});
    execFileSync(process.execPath,[...args,'--write'],{stdio:'pipe'});
    expect(await fs.readFile(input,'utf8')).toBe(text);
    const generated=await fs.readFile(output,'utf8');
    expect(() => execFileSync(process.execPath,[...args,'--write'],{stdio:'pipe'})).toThrow();
    expect(await fs.readFile(output,'utf8')).toBe(generated);
    const curated=JSON.parse(generated); delete curated.sourceManifest.migration;
    await fs.writeFile(output,JSON.stringify(curated));
    expect(() => execFileSync(process.execPath,[...args,'--write','--overwrite-generated'],{stdio:'pipe'})).toThrow();
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
it('prepares integrity records without modifying the manifest or uploading assets', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'exhibit-archive-test-'));
  try {
    const assetPath=path.join(dir,'artwork.txt'); await fs.writeFile(assetPath,'archive fixture');
    const {manifest}=convertV2ToV3({schemaVersion:'2.0.0',id:'fixture',metadata:{title:'Fixture',description:''},assets:{art:{kind:'data',uri:'https://example.com/art.txt',mimeType:'text/plain',localPath:assetPath}},scene:{},nodes:{}},{sourcePath:'fixture.json'});
    const manifestPath=path.join(dir,'manifest.json'); const text=JSON.stringify(manifest); await fs.writeFile(manifestPath,text);
    const plan=await prepareArchive(manifestPath,path.join(dir,'prepared'));
    expect(plan.assets[0].byteSize).toBe(15);
    expect(plan.assets[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(await fs.readFile(manifestPath,'utf8')).toBe(text);
    expect(JSON.parse(await fs.readFile(path.join(dir,'prepared/archive-plan.json'),'utf8')).sourceSha256).toBe(plan.sourceSha256);
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
