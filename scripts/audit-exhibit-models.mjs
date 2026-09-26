import fs from 'node:fs/promises';
const inventory=JSON.parse(await fs.readFile(new URL('./exhibit-migrations.json',import.meta.url),'utf8'));
const results=[];
for (const job of inventory) {
  const manifest=JSON.parse(await fs.readFile(new URL(`../public/configs/${job.v3}`,import.meta.url),'utf8'));
  const modelId=manifest.sceneGraph.sourceScene.model?.asset;
  if (!modelId) {results.push({slug:job.slug,status:'procedural_scene',nodes:Object.keys(manifest.sceneGraph.nodes)});continue;}
  const asset=manifest.assets[modelId];
  const url=asset.ipfsUri ? asset.fallbackUris?.[0] || `https://lrbcisjgkyhb.objectstorage.uk-london-1.oci.customer-oci.com/n/lrbcisjgkyhb/b/${manifest.id}/o/${encodeURIComponent(asset.ipfsUri.split('/').pop())}` : asset.sourceUri;
  try {
    const head=await fetch(url,{headers:{Range:'bytes=0-19'},signal:AbortSignal.timeout(30000)});
    if (!head.ok) throw new Error(`HTTP ${head.status}`);
    let data=Buffer.from(await head.arrayBuffer());
    if (data.readUInt32LE(0)!==0x46546c67 || data.readUInt32LE(16)!==0x4e4f534a) throw new Error('Expected a GLB JSON chunk');
    const length=data.readUInt32LE(12);
    let jsonBytes=data.subarray(20,20+length);
    if (jsonBytes.length<length) {
      const response=await fetch(url,{headers:{Range:`bytes=20-${19+length}`},signal:AbortSignal.timeout(30000)});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data=Buffer.from(await response.arrayBuffer());
      jsonBytes=response.status===206 ? data : data.subarray(20,20+length);
    }
    const gltf=JSON.parse(jsonBytes.toString('utf8').trim());
    const names=new Set((gltf.nodes || []).flatMap(node=>[node.name,node.extras?.name].filter(Boolean)));
    const missing=Object.entries(manifest.sceneGraph.nodes).filter(([id,node])=>!names.has(id)&&!names.has(node.ref)).map(([id])=>id);
    results.push({slug:job.slug,status:'inspected',url,modelNodeCount:gltf.nodes?.length || 0,missingDeclaredNodes:missing});
    console.log(`${job.slug}: inspected, ${missing.length} unmatched declarations`);
  } catch(error) {results.push({slug:job.slug,status:'error',url,error:error.message}); console.log(`${job.slug}: ${error.message}`);}
}
await fs.writeFile(new URL('../docs/migrations/v3-model-audit.json',import.meta.url),JSON.stringify({checkedAt:new Date().toISOString(),results},null,2)+'\n');
