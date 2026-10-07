import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';

const indexPath = new URL('../audits/asset-index.json', import.meta.url);
const manifestPath = new URL('../../../public/configs/milkmaid_pitchers_config_v3.json', import.meta.url);
const reportPath = new URL('../audits/integrity-report.json', import.meta.url);
const index = JSON.parse(await fs.readFile(indexPath, 'utf8'));
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const sceneAssets = Object.values(manifest.assets).filter((asset) => asset.kind === 'model');
const sceneSourceNames = new Set(sceneAssets.map((asset) => asset.originalFileName));
const sourceObjects = index.objects.filter((entry) => sceneSourceNames.has(entry.name));
const results = new Array(sourceObjects.length);
function inspectGlb(bytes, name) {
  if (bytes.toString('ascii', 0, 4) !== 'glTF') throw new Error(`${name}: missing GLB magic.`);
  const jsonLength = bytes.readUInt32LE(12);
  const document = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength).replace(/\0+$/, '').trim());
  const bounds = new Box3().makeEmpty();
  const nodes = document.nodes || [];
  const accessors = document.accessors || [];
  const scenes = document.scenes || [];
  const roots = scenes[document.scene ?? 0]?.nodes || nodes.map((node, i) => i).filter((i) => !nodes.some((node) => node.children?.includes(i)));
  const visit = (nodeIndex, parent) => {
    const node = nodes[nodeIndex];
    const local = node.matrix
      ? new Matrix4().fromArray(node.matrix)
      : new Matrix4().compose(new Vector3(...(node.translation || [0, 0, 0])), new Quaternion(...(node.rotation || [0, 0, 0, 1])), new Vector3(...(node.scale || [1, 1, 1])));
    const world = parent.clone().multiply(local);
    for (const primitive of document.meshes?.[node.mesh]?.primitives || []) {
      const accessor = accessors[primitive.attributes?.POSITION];
      if (!accessor?.min || !accessor?.max) throw new Error(`${name}: POSITION accessor lacks bounds.`);
      for (const x of [accessor.min[0], accessor.max[0]]) for (const y of [accessor.min[1], accessor.max[1]]) for (const z of [accessor.min[2], accessor.max[2]]) {
        bounds.expandByPoint(new Vector3(x, y, z).applyMatrix4(world));
      }
    }
    for (const child of node.children || []) visit(child, world);
  };
  for (const rootNode of roots) visit(rootNode, new Matrix4());
  if (bounds.isEmpty()) return { status: 'no-scene-mesh-geometry' };
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  const radius = Math.hypot(size.x / 2, size.y / 2, size.z / 2);
  return { status: radius > 0 ? 'bounded-static-position-geometry' : 'degenerate-zero-size-geometry', min: bounds.min.toArray(), max: bounds.max.toArray(), center: center.toArray(), size: size.toArray(), centeredGroundedBoundingSphereRadius: radius };
}
let cursor = 0;
const worker = async () => {
  while (cursor < index.objects.length) {
    const i = cursor++;
    const entry = sourceObjects[i];
    const response = await fetch(entry.sourceUri, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`${entry.name}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const md5 = createHash('md5').update(bytes).digest('base64');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (bytes.byteLength !== entry.size) throw new Error(`${entry.name}: size ${bytes.byteLength} != ${entry.size}`);
    if (md5 !== entry.md5) throw new Error(`${entry.name}: MD5 ${md5} != listing ${entry.md5}`);
    results[i] = { name: entry.name, byteSize: bytes.byteLength, oracleMd5Base64: md5, sha256, geometryBounds: inspectGlb(bytes, entry.name) };
  }
};
await Promise.all(Array.from({ length: 6 }, worker));
if (results.length !== sceneAssets.length || results.some((entry) => !entry)) throw new Error(`Did not verify all ${sceneAssets.length} selected scene models.`);
for (const result of results) {
  const id = Object.keys(manifest.assets).find((assetId) => manifest.assets[assetId].originalFileName === result.name);
  if (!id) throw new Error(`Manifest has no identity for ${result.name}`);
  const asset = manifest.assets[id];
  if (asset.byteSize !== result.byteSize || asset.preservation.sourceChecksum.value !== result.oracleMd5Base64) throw new Error(`${result.name}: manifest inventory metadata differs from the current index.`);
  asset.sha256 = result.sha256;
  if (result.geometryBounds.status === 'bounded-static-position-geometry') asset.geometryBounds = result.geometryBounds;
  else {
    delete asset.geometryBounds;
    asset.preservation.geometryStatus = result.geometryBounds.status;
  }
  const model = manifest.sceneGraph.proceduralRecipe.infiniteWorld.models.find((entry) => entry.asset === id);
  if (!model) throw new Error(`Manifest has no procedural model entry for ${result.name}`);
  delete model.collisionRadius;
  asset.preservation.contentChecksum = { algorithm: 'sha256', encoding: 'hex', value: result.sha256, verifiedFromDownloadedBytes: true };
  asset.preservation.status = 'public-source-bytes-size-md5-sha256-verified; immutable archival copy not created';
}
manifest.preservation.integrity.status = 'source-bytes-verified';
manifest.preservation.integrity.note = 'SHA-256 values were computed from downloaded source bytes after matching every indexed byte size and Oracle-reported MD5.';
manifest.preservation.requiredBeforeMinting = manifest.preservation.requiredBeforeMinting.filter((task) => !task.startsWith('Compute and record SHA-256') && !task.startsWith('Create immutable preservation copies'));
manifest.preservation.requiredBeforeMinting.unshift('Create immutable preservation copies and record real IPFS or Arweave URIs.');
const groups = new Map();
for (const entry of results) groups.set(entry.sha256, [...(groups.get(entry.sha256) || []), entry.name]);
const bounded = results.filter((entry) => entry.geometryBounds.status === 'bounded-static-position-geometry').map((entry) => entry.geometryBounds.centeredGroundedBoundingSphereRadius).sort((a, b) => a - b);
const geometryExceptions = results.filter((entry) => entry.geometryBounds.status !== 'bounded-static-position-geometry').map((entry) => ({ name: entry.name, status: entry.geometryBounds.status }));
const geometrySummary = { units: 'glTF metres', boundedObjectCount: bounded.length, minimumBoundingRadius: bounded[0], medianBoundingRadius: bounded[Math.floor(bounded.length / 2)], maximumBoundingRadius: bounded.at(-1), geometryExceptions };
manifest.preservation.integrity.geometryAudit = { reportPath: 'archive/milkmaid_pitchers/audits/integrity-report.json', ...geometrySummary };
if (geometryExceptions.length > 0 && !manifest.preservation.knownLimitations.some((note) => note.includes('indexed GLBs lack non-degenerate scene mesh geometry'))) {
  manifest.preservation.knownLimitations.push(`${geometryExceptions.length} indexed GLBs lack non-degenerate scene mesh geometry; their asset identities are preserved, but the files cannot currently contribute a visible sculpture.`);
}
const report = { schemaVersion: '1.0', manifestId: manifest.id, source: { namespace: index.namespace, bucket: index.bucket, inventoryObjectCount: index.objects.length, selectedSceneObjectCount: results.length }, method: 'Downloaded the selected models declared by the scene manifest; verified HTTP success, byteSize, and base64 MD5 against the Oracle listing; computed SHA-256 hex and static transformed POSITION bounds from downloaded GLB bytes.', verifiedObjectCount: results.length, distinctSha256ContentGroups: groups.size, duplicateContentGroups: [...groups.entries()].filter(([, names]) => names.length > 1).map(([sha256, names]) => ({ sha256, names })), geometrySummary, objects: results };
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Verified ${results.length} GLBs; recorded byte sizes, Oracle MD5 matches, SHA-256 values, and static geometry bounds.`);
