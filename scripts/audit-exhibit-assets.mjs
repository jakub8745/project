import fs from 'node:fs/promises';
import { parseArgs } from 'node:util';
const {values} = parseArgs({options:{output:{type:'string'},models:{type:'boolean'}}});
const inventory = JSON.parse(await fs.readFile(new URL('./exhibit-migrations.json',import.meta.url),'utf8'));
const urls = new Map();
for (const exhibit of inventory) {
  const manifest = JSON.parse(await fs.readFile(new URL(`../public/configs/${exhibit.v3}`,import.meta.url),'utf8'));
  for (const [id,asset] of Object.entries(manifest.assets)) {
    if (values.models && asset.kind !== 'model') continue;
    if (asset.kind === 'manifest') continue;
    let url = asset.ipfsUri ? asset.fallbackUris?.[0] : asset.sourceUri || asset.fallbackUris?.[0];
    if (!url && asset.ipfsUri) url = `https://lrbcisjgkyhb.objectstorage.uk-london-1.oci.customer-oci.com/n/lrbcisjgkyhb/b/${manifest.id}/o/${encodeURIComponent(asset.ipfsUri.split('/').pop())}`;
    if (!url) continue;
    const refs = urls.get(url) || []; refs.push(`${exhibit.slug}:${id}`); urls.set(url,refs);
  }
}
const jobs = [...urls]; const results = new Array(jobs.length); let cursor = 0;
async function worker() {
  while (cursor < jobs.length) {
    const index=cursor++; const [url,refs]=jobs[index];
    try {
      if (!/^https?:/.test(url)) { results[index]={url,refs,status:'local_or_non_http'}; continue; }
      const response=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(20000)});
      results[index]={url,refs,status:response.status,ok:response.ok,mimeType:response.headers.get('content-type'),bytes:response.headers.get('content-length')};
    } catch(error) {results[index]={url,refs,status:'network_error',error:error.message};}
  }
}
await Promise.all(Array.from({length:5},worker));
const report={checkedAt:new Date().toISOString(),results};
if (values.output) await fs.writeFile(values.output,JSON.stringify(report,null,2)+'\n');
for (const entry of results.filter((entry)=>entry.ok !== true)) console.log(`${entry.status}: ${entry.refs.join(', ')}`);
console.log(`${results.filter((entry)=>entry.ok).length}/${results.length} HTTP assets available`);
