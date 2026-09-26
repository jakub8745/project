import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { sha256 } from './lib/exhibitMigration.mjs';
import { prepareArchive } from './prepare-exhibit-archive.mjs';
import { validateManifest } from './lib/validateManifest.mjs';

// Explicit publishing command. Ordinary migrations never invoke this script.
const {values}=parseArgs({options:{manifest:{type:'string'},'output-dir':{type:'string'},upload:{type:'boolean'},'asset-dir':{type:'string'}}});
if (!values.manifest || !values['output-dir']) throw new Error('Use --manifest <v3.json> --output-dir <directory> [--asset-dir <directory>] [--upload]. Default: prepare only.');
const plan=await prepareArchive(values.manifest,values['output-dir']);
if (!values.upload) {
  console.log(`Prepared ${plan.id}. No uploads performed. Review archive-plan.json; --upload requires PINATA_JWT.`);
} else {
  const jwt=process.env.PINATA_JWT;
  if (!jwt) throw new Error('PINATA_JWT is required for --upload.');
  const source=JSON.parse(await fs.readFile(plan.sourcePath,'utf8'));
  const snapshot=structuredClone(source);
  const selfId=source.nft?.canonicalManifestAsset;
  for (const [id,asset] of Object.entries(snapshot.assets)) if (asset.kind==='manifest' || id===selfId) delete snapshot.assets[id];
  // A fresh archive is not a minted token. Preserve previous publishing claims as history.
  snapshot.profile='portable-exhibit';
  snapshot.provenance={...snapshot.provenance, priorPublishing:{nft:source.nft,exports:source.exports}};
  snapshot.nft={mintable:false};
  delete snapshot.exports;
  const files=[];
  for (const asset of plan.assets) {
    const supplied=values['asset-dir'] ? path.resolve(values['asset-dir'],asset.id) : undefined;
    const localPath=supplied || asset.localPath;
    if (!asset.ipfsUri && !localPath) throw new Error(`Missing immutable URI or local file for ${asset.id}; supply --asset-dir with files named by asset ID.`);
    const bytes=localPath ? await fs.readFile(localPath) : undefined;
    files.push({asset,bytes});
  }
  async function upload(bytes,name,mimeType) {
    const form=new FormData(); form.append('file',new Blob([bytes],{type:mimeType}),name);
    form.append('pinataMetadata',JSON.stringify({name:`${plan.id}/${name}`}));
    const response=await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS',{method:'POST',headers:{Authorization:`Bearer ${jwt}`},body:form});
    if (!response.ok) throw new Error(`Pinata upload failed (${response.status}) for ${name}`);
    const result=await response.json();
    if (typeof result.IpfsHash !== 'string' || !result.IpfsHash) throw new Error(`Missing CID for ${name}`);
    return `ipfs://${result.IpfsHash}`;
  }
  const receipt={id:plan.id,sourceSha256:plan.sourceSha256,assets:[]};
  const receiptPath=path.join(values['output-dir'],'upload-receipt.json');
  for (const {asset,bytes} of files) {
    const uri=bytes ? await upload(bytes,asset.id,asset.mimeType) : asset.ipfsUri;
    const integrity=bytes ? {sha256:sha256(bytes),byteSize:bytes.length} : {};
    Object.assign(snapshot.assets[asset.id],{ipfsUri:uri,...integrity});
    receipt.assets.push({id:asset.id,uri,...integrity});
    await fs.writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');
  }
  const validation=validateManifest(snapshot);
  if (validation.errors.length) throw new Error(validation.errors.join('\n'));
  const bytes=Buffer.from(JSON.stringify(snapshot,null,2)+'\n');
  await fs.writeFile(path.join(values['output-dir'],'manifest.json'),bytes);
  const uri=await upload(bytes,'manifest.json','application/json');
  receipt.manifest={uri,sha256:sha256(bytes),byteSize:bytes.length};
  await fs.writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');
  console.log(`Published ${uri}; immutable bytes and external receipt saved. Source manifest unchanged.`);
}
