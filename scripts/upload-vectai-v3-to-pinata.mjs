import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const configPath = path.join(root, 'public/configs/vectai_krakow_032026_config_v3.json');
const uploadManifestPath = path.join(root, 'public/configs/vectai_krakow_032026_ipfs_upload_manifest.json');
const nftMetadataPath = path.join(root, 'public/configs/vectai_krakow_032026_nft_metadata.json');

function readSecretLine() {
  return new Promise((resolve, reject) => {
    let data = '';
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off('data', onData);
      process.stdin.off('error', reject);
    };
    const onData = (chunk) => {
      const text = chunk.toString('utf8');
      for (const char of text) {
        if (char === '\u0003') {
          cleanup();
          process.stdout.write('\n');
          reject(new Error('Input cancelled.'));
          return;
        }
        if (char === '\r' || char === '\n' || char === '\u0004') {
          cleanup();
          process.stdout.write('\n');
          resolve(data.trim());
          return;
        }
        data += char;
      }
    };
    process.stdout.write('Pinata JWT: ');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', onData);
    process.stdin.on('error', reject);
  });
}

function readStdin() {
  if (process.stdin.isTTY) {
    return readSecretLine();
  }
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data.trim()));
    process.stdin.on('error', reject);
  });
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

async function uploadFileToPinata({ jwt, filePath, pinName, metadata = {} }) {
  const form = new FormData();
  const bytes = await fs.readFile(filePath);
  const blob = new Blob([bytes]);
  form.append('file', blob, path.basename(filePath));
  form.append('pinataMetadata', JSON.stringify({
    name: pinName,
    keyvalues: metadata
  }));
  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`
    },
    body: form
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Pinata upload failed for ${pinName}: ${response.status} ${text}`);
  }
  const payload = JSON.parse(text);
  if (!payload.IpfsHash) {
    throw new Error(`Pinata upload response for ${pinName} did not include IpfsHash: ${text}`);
  }
  return payload;
}

async function downloadRemoteAsset(asset, tempDir) {
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

function ipfsUri(cid) {
  return `ipfs://${cid}`;
}

async function main() {
  const jwt = await readStdin();
  if (!jwt) {
    throw new Error('Pinata JWT is required on stdin.');
  }

  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const uploadManifest = JSON.parse(await fs.readFile(uploadManifestPath, 'utf8'));
  const tempDir = path.join(root, '.tmp-pinata-vectai');
  await fs.mkdir(tempDir, { recursive: true });

  const uploadResults = [];

  for (const asset of uploadManifest.assets) {
    if (asset.id === 'manifest_v3_json') continue;
    const localPath = resolveLocalPath(asset.sourceUri, asset.localPath);
    let filePath = localPath && await fileExists(localPath) ? localPath : null;
    if (!filePath) {
      filePath = await downloadRemoteAsset(asset, tempDir);
      asset.localPath = path.relative(root, filePath);
      asset.availableLocal = true;
    }
    const integrity = await hashFile(filePath);
    asset.byteSize = integrity.byteSize;
    asset.sha256 = integrity.sha256;
    const result = await uploadFileToPinata({
      jwt,
      filePath,
      pinName: `vectai_krakow_032026/${asset.id}/${path.basename(filePath)}`,
      metadata: {
        exhibit: 'vectai_krakow_032026',
        assetId: asset.id,
        kind: asset.kind
      }
    });
    asset.ipfsUri = ipfsUri(result.IpfsHash);
    uploadResults.push({ id: asset.id, cid: result.IpfsHash });
    if (config.assets[asset.id]) {
      config.assets[asset.id].ipfsUri = asset.ipfsUri;
      config.assets[asset.id].byteSize = asset.byteSize;
      config.assets[asset.id].sha256 = asset.sha256;
      config.assets[asset.id].availableLocal = true;
      config.assets[asset.id].preservation.status = 'uploaded_to_ipfs';
      if (asset.localPath) config.assets[asset.id].localPath = asset.localPath;
    }
    console.log(`uploaded ${asset.id}: ${asset.ipfsUri}`);
  }

  config.nft.tokenMetadataTemplate.image = config.assets.og_image.ipfsUri;
  config.nft.tokenMetadataTemplate.animation_url = config.assets.scene_model.ipfsUri;
  config.nft.tokenMetadataTemplate.properties.files = Object.keys(config.assets).map((id) => ({
    id,
    uri: config.assets[id].ipfsUri || `ipfs://CID_FOR_${id}`,
    type: config.assets[id].mimeType
  }));

  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n');

  const manifestIntegrityBeforeUpload = await hashFile(configPath);
  const manifestUpload = uploadManifest.assets.find((asset) => asset.id === 'manifest_v3_json');
  const manifestResult = await uploadFileToPinata({
    jwt,
    filePath: configPath,
    pinName: 'vectai_krakow_032026/manifest_v3/vectai_krakow_032026_config_v3.json',
    metadata: {
      exhibit: 'vectai_krakow_032026',
      assetId: 'manifest_v3_json',
      kind: 'manifest'
    }
  });
  const manifestIpfs = ipfsUri(manifestResult.IpfsHash);
  if (manifestUpload) {
    manifestUpload.byteSize = manifestIntegrityBeforeUpload.byteSize;
    manifestUpload.sha256 = manifestIntegrityBeforeUpload.sha256;
    manifestUpload.ipfsUri = manifestIpfs;
  }
  config.assets.manifest_v3_json.ipfsUri = manifestIpfs;
  config.assets.manifest_v3_json.byteSize = manifestIntegrityBeforeUpload.byteSize;
  config.assets.manifest_v3_json.sha256 = manifestIntegrityBeforeUpload.sha256;
  config.assets.manifest_v3_json.preservation.status = 'uploaded_to_ipfs';
  config.nft.tokenMetadataTemplate.properties.manifest = manifestIpfs;
  config.nft.tokenMetadataTemplate.properties.files = Object.keys(config.assets).map((id) => ({
    id,
    uri: config.assets[id].ipfsUri || `ipfs://CID_FOR_${id}`,
    type: config.assets[id].mimeType
  }));

  const nftMetadata = config.nft.tokenMetadataTemplate;
  await fs.writeFile(nftMetadataPath, JSON.stringify(nftMetadata, null, 2) + '\n');
  const nftResult = await uploadFileToPinata({
    jwt,
    filePath: nftMetadataPath,
    pinName: 'vectai_krakow_032026/nft_metadata/vectai_krakow_032026_nft_metadata.json',
    metadata: {
      exhibit: 'vectai_krakow_032026',
      assetId: 'nft_metadata',
      kind: 'nft_metadata'
    }
  });

  config.exports.nftMetadata = {
    status: 'uploaded_to_ipfs',
    outputPath: '/configs/vectai_krakow_032026_nft_metadata.json',
    ipfsUri: ipfsUri(nftResult.IpfsHash)
  };
  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
  await fs.writeFile(uploadManifestPath, JSON.stringify(uploadManifest, null, 2) + '\n');

  const summaryPath = path.join(root, 'public/configs/vectai_krakow_032026_pinata_upload_summary.json');
  await fs.writeFile(summaryPath, JSON.stringify({
    uploadedAt: new Date().toISOString(),
    assets: uploadResults,
    manifest: { cid: manifestResult.IpfsHash, uri: manifestIpfs },
    nftMetadata: { cid: nftResult.IpfsHash, uri: ipfsUri(nftResult.IpfsHash) }
  }, null, 2) + '\n');

  await fs.rm(tempDir, { recursive: true, force: true });
  console.log(`uploaded manifest_v3_json: ${manifestIpfs}`);
  console.log(`uploaded nft_metadata: ${ipfsUri(nftResult.IpfsHash)}`);
  console.log(`summary: ${path.relative(root, summaryPath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
