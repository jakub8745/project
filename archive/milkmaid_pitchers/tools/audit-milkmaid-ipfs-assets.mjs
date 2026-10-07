import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const manifestPath = new URL('../../../public/configs/milkmaid_pitchers_config_v3.json', import.meta.url);
const reportPath = new URL('../audits/ipfs-verification.json', import.meta.url);
const checkedAt = new Date().toISOString();
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const assets = Object.values(manifest.assets).filter((asset) => asset.kind === 'model');
const assetByFileName = new Map(assets.map((asset) => [asset.originalFileName, asset]));
let previousReport;
try { previousReport = JSON.parse(await readFile(reportPath, 'utf8')); } catch { previousReport = null; }
const priorResults = new Map((previousReport?.results || []).map((entry) => [entry.originalFileName, entry]));
const concurrency = 2;
const gateways = [
  (cid) => `https://ipfs.filebase.io/ipfs/${cid}`,
  (cid) => `https://${cid}.ipfs.dweb.link/`,
  (cid) => `https://${cid}.ipfs.w3s.link/`
];

function decodeBase32Cid(cid) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const character of cid.slice(1)) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error('CID is not lowercase base32.');
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

function readVarint(bytes, start) {
  let value = 0;
  let shift = 0;
  let offset = start;
  while (offset < bytes.length) {
    const byte = bytes[offset++];
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return { value, offset };
    shift += 7;
  }
  throw new Error('CID contains a truncated varint.');
}

function inspectCid(cid) {
  if (!cid.startsWith('baf') || !/^[a-z2-7]+$/.test(cid)) throw new Error('Unsupported CIDv1 base32 asset key.');
  const bytes = decodeBase32Cid(cid);
  const version = readVarint(bytes, 0);
  const codec = readVarint(bytes, version.offset);
  const hashCode = readVarint(bytes, codec.offset);
  const hashLength = readVarint(bytes, hashCode.offset);
  const digest = bytes.subarray(hashLength.offset, hashLength.offset + hashLength.value);
  if (version.value !== 1 || digest.length !== hashLength.value || hashCode.value !== 0x12 || digest.length !== 32) {
    throw new Error('CID is not a CIDv1 SHA-256 multihash.');
  }
  return { codec: codec.value, digestHex: digest.toString('hex') };
}

async function fetchAsset(asset) {
  let cid = asset.originalFileName.replace(/\.glb$/i, '');
  let duplicateAlias = false;
  let cidInfo;
  try {
    cidInfo = inspectCid(cid);
  } catch {
    const duplicateGroup = asset.preservation.duplicateContentGroup;
    const siblings = assets.filter((candidate) => candidate !== asset
      && duplicateGroup
      && candidate.preservation.duplicateContentGroup === duplicateGroup
      && candidate.sha256 === asset.sha256
      && candidate.byteSize === asset.byteSize
      && (() => {
        try { inspectCid(candidate.originalFileName.replace(/\.glb$/i, '')); return true; }
        catch { return false; }
      })());
    if (siblings.length !== 1) {
      return { cid, originalFileName: asset.originalFileName, duplicateAlias, status: 'unavailable-or-unverified', errors: ['Filename is not a valid CID and has no unique matching-CID duplicate sibling.'] };
    }
    cid = siblings[0].originalFileName.replace(/\.glb$/i, '');
    cidInfo = inspectCid(cid);
    duplicateAlias = true;
  }
  const expectedMd5 = asset.preservation.sourceChecksum.value;
  const errors = [];
  for (const makeUrl of gateways) {
    const url = makeUrl(cid);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(url, {
          headers: { Accept: 'model/gltf-binary, application/octet-stream' },
          signal: AbortSignal.timeout(60_000)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        const md5 = createHash('md5').update(bytes).digest('base64');
        const failures = [];
        if (bytes.length !== asset.byteSize) failures.push(`size ${bytes.length} != ${asset.byteSize}`);
        if (sha256 !== asset.sha256) failures.push('SHA-256 differs from Oracle-verified manifest bytes');
        if (md5 !== expectedMd5) failures.push('MD5 differs from Oracle-reported source checksum');
        if (cidInfo.codec === 0x55 && cidInfo.digestHex !== sha256) failures.push('raw CID multihash differs from response SHA-256');
        const returnedRoot = response.headers.get('x-ipfs-roots');
        if (returnedRoot && !returnedRoot.split(',').map((part) => part.trim()).includes(cid)) {
          failures.push(`gateway root header does not include requested CID: ${returnedRoot}`);
        }
        if (failures.length) return { cid, originalFileName: asset.originalFileName, duplicateAlias, status: 'integrity-mismatch', url, httpStatus: response.status, byteSize: bytes.length, sha256, md5, codec: cidInfo.codec, returnedRoot, errors: failures };
        return {
          cid, originalFileName: asset.originalFileName, duplicateAlias, status: 'verified', url, httpStatus: response.status, byteSize: bytes.length,
          sha256, md5, codec: cidInfo.codec, returnedRoot,
          cidDigestVerifiedDirectly: cidInfo.codec === 0x55,
          pinningProviderAndRetentionGuarantee: 'unknown'
        };
      } catch (error) {
        errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 750));
      }
    }
  }
  return {
    cid, originalFileName: asset.originalFileName, duplicateAlias, status: 'unavailable-or-unverified', errors,
    codec: cidInfo.codec,
    cidDigestVerifiedDirectly: cidInfo.codec === 0x55 && cidInfo.digestHex === asset.sha256
  };
}

const results = assets.map((asset) => {
  const previous = priorResults.get(asset.originalFileName);
  return previous?.status === 'verified' ? previous : undefined;
});
const pendingIndices = results.map((result, index) => result ? -1 : index).filter((index) => index >= 0);
let nextIndex = 0;
async function worker() {
  while (nextIndex < pendingIndices.length) {
    const index = pendingIndices[nextIndex++];
    results[index] = await fetchAsset(assets[index]);
    console.log(`${index + 1}/${assets.length} ${results[index].status} ${results[index].cid}`);
  }
}
console.log(`Retrying ${pendingIndices.length} assets; retaining ${assets.length - pendingIndices.length} previously verified results.`);
await Promise.all(Array.from({ length: Math.min(concurrency, pendingIndices.length) }, () => worker()));

for (const [index, asset] of assets.entries()) {
  const result = results[index];
  const duplicateGroup = asset.preservation.duplicateContentGroup;
  if (result.status !== 'unavailable-or-unverified' || !duplicateGroup) continue;
  const verifiedSibling = assets
    .map((candidate, candidateIndex) => ({ candidate, candidateIndex, result: results[candidateIndex] }))
    .find(({ candidate, result: siblingResult }) => candidate !== asset
      && candidate.preservation.duplicateContentGroup === duplicateGroup
      && candidate.sha256 === asset.sha256
      && candidate.byteSize === asset.byteSize
      && siblingResult.status === 'verified');
  if (!verifiedSibling) continue;
  results[index] = {
    ...verifiedSibling.result,
    originalFileName: asset.originalFileName,
    duplicateAlias: true,
    aliasedFromOriginalFileName: verifiedSibling.candidate.originalFileName,
    aliasReason: 'The source filename CID was unavailable, but a duplicate-group sibling with matching SHA-256, byte size, and Oracle MD5 was retrieved and verified.'
  };
}

for (const [index, asset] of assets.entries()) {
  const result = results[index];
  const cid = result.cid;
  if (result.status !== 'verified') {
    if (result.cidDigestVerifiedDirectly) {
      asset.ipfsUri = `ipfs://${cid}`;
      asset.preservation.retrievalVerification = {
        status: 'raw-cid-matches-oracle-content; public-gateway-retrieval-unverified',
        checkedAt,
        cidCodec: 'raw',
        cidDigestVerifiedDirectly: true,
        sha256: asset.sha256,
        errors: result.errors,
        pinningProviderAndRetentionGuarantee: 'unknown',
        note: 'The raw CID digest matches the Oracle-verified asset bytes, but public gateways did not return the object during this check. CID identity is valid; current IPFS retrieval and durable pinning remain unverified.'
      };
    }
    continue;
  }
  asset.ipfsUri = `ipfs://${cid}`;
  asset.preservation.retrievalVerification = {
    status: 'public-ipfs-gateway-retrieval-and-byte-match-verified',
    checkedAt,
    gateway: new URL(result.url).origin,
    gatewayUri: result.url,
    sourceObjectName: result.originalFileName,
    cidDerivedFromIdenticalDuplicateSibling: result.duplicateAlias,
    ...(result.aliasedFromOriginalFileName ? { aliasedFromOriginalFileName: result.aliasedFromOriginalFileName } : {}),
    httpStatus: result.httpStatus,
    byteSize: result.byteSize,
    sha256: result.sha256,
    md5: result.md5,
    byteIdentity: 'matches Oracle-verified SHA-256 and Oracle-reported MD5',
    cidCodec: result.codec === 0x55 ? 'raw' : result.codec === 0x70 ? 'dag-pb' : `multicodec-${result.codec}`,
    cidDigestVerifiedDirectly: result.cidDigestVerifiedDirectly,
    gatewayReportedRoot: result.returnedRoot || null,
    pinningProviderAndRetentionGuarantee: 'unknown',
    note: result.cidDigestVerifiedDirectly
      ? 'The raw CID SHA-256 multihash and retrieved object bytes match. Retrieval at check time does not establish a named provider or durable pin.'
      : 'The CID resolves through a public IPFS gateway, and retrieved bytes match Oracle-verified size, SHA-256, and MD5. The DAG-PB CID commits to an IPFS root block rather than the concatenated file bytes; retrieval at check time does not establish a named provider or durable pin.'
  };
}

const report = {
  checkedAt,
  method: 'Fetch each filename CID through public IPFS gateways; verify byte size, SHA-256, and Oracle-reported MD5; verify raw CID multihashes directly where the CID codec is raw.',
  pinningNote: 'Gateway retrieval proves availability at check time, not durable pinning by a named provider.',
  total: results.length,
  verifiedCount: results.filter((entry) => entry.status === 'verified').length,
  unavailableOrUnverifiedCount: results.filter((entry) => entry.status !== 'verified').length,
  ipfsUriCount: assets.filter((asset) => typeof asset.ipfsUri === 'string' && asset.ipfsUri.startsWith('ipfs://')).length,
  results
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ verified: report.verifiedCount, unavailableOrUnverified: report.unavailableOrUnverifiedCount, manifestPath: manifestPath.pathname, reportPath: reportPath.pathname }));
