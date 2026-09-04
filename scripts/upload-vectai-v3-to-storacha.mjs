import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCallback);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const configPath = path.join(root, 'public/configs/vectai_krakow_032026_config_v3.json');
const uploadManifestPath = path.join(root, 'public/configs/vectai_krakow_032026_ipfs_upload_manifest.json');
const nftMetadataPath = path.join(root, 'public/configs/vectai_krakow_032026_nft_metadata.json');
const summaryPath = path.join(root, 'public/configs/vectai_krakow_032026_storacha_upload_summary.json');
const tempDir = path.join(root, '.tmp-storacha-vectai');

function ipfsUri(cid) {
  return `ipfs://${cid}`;
}

function gatewayUri(cid) {
  return `https://storacha.link/ipfs/${cid}`;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveLocalPath(sourceUri, explicitLocalPath) {
  if (explicitLocalPath) return path.join(root, explicitLocalPath);
  if (typeof sourceUri === 'string' && sourceUri.startsWith('/')) {
    return path.join(root, 'public', sourceUri.slice(1));
  }
  return null;
}

async function hashFile(filePath) {
  const buffer = await fs.readFile(filePath);
  return {
    byteSize: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex')
  };
}

function filenameForAsset(asset) {
  if (asset.sourceUri && typeof asset.sourceUri === 'string') {
    try {
      const url = new URL(asset.sourceUri, 'http://local');
      const name = decodeURIComponent(path.basename(url.pathname));
      if (name && name !== '/') return name;
    } catch {
      const name = path.basename(asset.sourceUri);
      if (name) return name;
    }
  }
  return `${asset.id}`;
}

async function downloadRemoteAsset(asset) {
  const response = await fetch(asset.sourceUri);
  if (!response.ok) {
    throw new Error(`Failed to download ${asset.id} from ${asset.sourceUri}: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const filename = filenameForAsset(asset);
  const filePath = path.join(tempDir, filename);
  await fs.writeFile(filePath, Buffer.from(arrayBuffer));
  return filePath;
}

function parseStorachaCid(stdout) {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines.toReversed()) {
    try {
      const parsed = JSON.parse(line);
      const rootValue = parsed.root?.['/'] ?? parsed.root?.toString?.() ?? parsed.root;
      if (typeof rootValue === 'string' && rootValue.startsWith('b')) {
        return rootValue;
      }
    } catch {
      const match = line.match(/(?:ipfs\/|ipfs:\/\/)?(b[a-z0-9]{20,})/i);
      if (match) return match[1];
    }
  }

  throw new Error(`Could not parse Storacha CID from output:\n${stdout}`);
}

async function uploadFileToStoracha(filePath) {
  const { stdout } = await execFile('storacha', ['up', '--json', '--no-wrap', filePath], {
    cwd: root,
    maxBuffer: 1024 * 1024
  });
  return parseStorachaCid(stdout);
}

function isRealIpfsUri(uri) {
  return typeof uri === 'string' && uri.startsWith('ipfs://') && !uri.startsWith('ipfs://CID_FOR_');
}

function updateConfigAsset(configAsset, asset, cid) {
  const uri = ipfsUri(cid);
  configAsset.ipfsUri = uri;
  configAsset.byteSize = asset.byteSize;
  configAsset.sha256 = asset.sha256;
  configAsset.availableLocal = true;
  configAsset.storageProvider = 'storacha';
  configAsset.gatewayUri = gatewayUri(cid);
  configAsset.preservation.status = 'uploaded_to_ipfs';
  configAsset.preservation.storageProvider = 'storacha';
  if (asset.localPath) configAsset.localPath = asset.localPath;
  if (!configAsset.fallbackUris.includes(configAsset.gatewayUri)) {
    configAsset.fallbackUris.push(configAsset.gatewayUri);
  }
}

function buildNftMetadata(config, manifestIpfs) {
  const metadata = structuredClone(config.nft.tokenMetadataTemplate);
  metadata.image = config.assets.og_image.ipfsUri;
  metadata.animation_url = config.assets.scene_model.ipfsUri;
  metadata.properties = {
    ...metadata.properties,
    manifest: manifestIpfs,
    files: Object.keys(config.assets).map((id) => ({
      id,
      uri: id === 'manifest_v3_json' ? manifestIpfs : config.assets[id].ipfsUri,
      type: config.assets[id].mimeType
    }))
  };
  return metadata;
}

async function main() {
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const uploadManifest = JSON.parse(await fs.readFile(uploadManifestPath, 'utf8'));
  const uploadResults = [];

  await fs.mkdir(tempDir, { recursive: true });

  for (const asset of uploadManifest.assets) {
    if (asset.id === 'manifest_v3_json') continue;
    if (isRealIpfsUri(asset.ipfsUri)) {
      uploadResults.push({ id: asset.id, uri: asset.ipfsUri, skipped: true });
      continue;
    }

    const localPath = resolveLocalPath(asset.sourceUri, asset.localPath);
    let filePath = localPath && await fileExists(localPath) ? localPath : null;
    if (!filePath) {
      console.log(`downloading ${asset.id}`);
      filePath = await downloadRemoteAsset(asset);
      asset.localPath = path.relative(root, filePath);
      asset.availableLocal = true;
    }

    const integrity = await hashFile(filePath);
    asset.byteSize = integrity.byteSize;
    asset.sha256 = integrity.sha256;

    console.log(`uploading ${asset.id} (${path.relative(root, filePath)})`);
    const cid = await uploadFileToStoracha(filePath);
    asset.ipfsUri = ipfsUri(cid);
    asset.gatewayUri = gatewayUri(cid);
    asset.provider = 'storacha';
    uploadResults.push({ id: asset.id, cid, uri: asset.ipfsUri, gatewayUri: asset.gatewayUri });

    if (config.assets[asset.id]) {
      updateConfigAsset(config.assets[asset.id], asset, cid);
    }
    console.log(`uploaded ${asset.id}: ${asset.ipfsUri}`);
  }

  config.nft.tokenMetadataTemplate.image = config.assets.og_image.ipfsUri;
  config.nft.tokenMetadataTemplate.animation_url = config.assets.scene_model.ipfsUri;
  config.nft.tokenMetadataTemplate.properties.files = Object.keys(config.assets)
    .filter((id) => id !== 'manifest_v3_json')
    .map((id) => ({
      id,
      uri: config.assets[id].ipfsUri,
      type: config.assets[id].mimeType
    }));

  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n');

  const manifestIntegrity = await hashFile(configPath);
  console.log(`uploading manifest_v3_json (${path.relative(root, configPath)})`);
  const manifestCid = await uploadFileToStoracha(configPath);
  const manifestIpfs = ipfsUri(manifestCid);
  const manifestUpload = uploadManifest.assets.find((asset) => asset.id === 'manifest_v3_json');
  if (manifestUpload) {
    manifestUpload.byteSize = manifestIntegrity.byteSize;
    manifestUpload.sha256 = manifestIntegrity.sha256;
    manifestUpload.ipfsUri = manifestIpfs;
    manifestUpload.gatewayUri = gatewayUri(manifestCid);
    manifestUpload.provider = 'storacha';
  }

  config.assets.manifest_v3_json.ipfsUri = manifestIpfs;
  config.assets.manifest_v3_json.byteSize = manifestIntegrity.byteSize;
  config.assets.manifest_v3_json.sha256 = manifestIntegrity.sha256;
  config.assets.manifest_v3_json.storageProvider = 'storacha';
  config.assets.manifest_v3_json.gatewayUri = gatewayUri(manifestCid);
  config.assets.manifest_v3_json.preservation.status = 'uploaded_to_ipfs';
  config.assets.manifest_v3_json.preservation.storageProvider = 'storacha';

  const nftMetadata = buildNftMetadata(config, manifestIpfs);
  await fs.writeFile(nftMetadataPath, JSON.stringify(nftMetadata, null, 2) + '\n');
  const nftIntegrity = await hashFile(nftMetadataPath);
  console.log(`uploading nft_metadata (${path.relative(root, nftMetadataPath)})`);
  const nftCid = await uploadFileToStoracha(nftMetadataPath);
  const nftIpfs = ipfsUri(nftCid);

  config.exports.storacha = {
    status: 'uploaded_to_ipfs',
    space: 'did:key:z6Mkq7DagKgJiidA9yM6AVLwA4nkENfb7pS6YiWyHXBxrLiU',
    manifest: {
      ipfsUri: manifestIpfs,
      gatewayUri: gatewayUri(manifestCid),
      byteSize: manifestIntegrity.byteSize,
      sha256: manifestIntegrity.sha256
    },
    nftMetadata: {
      ipfsUri: nftIpfs,
      gatewayUri: gatewayUri(nftCid),
      byteSize: nftIntegrity.byteSize,
      sha256: nftIntegrity.sha256
    }
  };
  config.exports.nftMetadata = {
    status: 'uploaded_to_ipfs',
    outputPath: '/configs/vectai_krakow_032026_nft_metadata.json',
    ipfsUri: nftIpfs,
    gatewayUri: gatewayUri(nftCid)
  };

  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
  await fs.writeFile(uploadManifestPath, JSON.stringify(uploadManifest, null, 2) + '\n');
  await fs.writeFile(summaryPath, JSON.stringify({
    uploadedAt: new Date().toISOString(),
    provider: 'storacha',
    space: 'did:key:z6Mkq7DagKgJiidA9yM6AVLwA4nkENfb7pS6YiWyHXBxrLiU',
    assets: uploadResults,
    manifest: { cid: manifestCid, uri: manifestIpfs, gatewayUri: gatewayUri(manifestCid) },
    nftMetadata: { cid: nftCid, uri: nftIpfs, gatewayUri: gatewayUri(nftCid) }
  }, null, 2) + '\n');

  await fs.rm(tempDir, { recursive: true, force: true });
  console.log(`uploaded manifest_v3_json: ${manifestIpfs}`);
  console.log(`uploaded nft_metadata: ${nftIpfs}`);
  console.log(`summary: ${path.relative(root, summaryPath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
