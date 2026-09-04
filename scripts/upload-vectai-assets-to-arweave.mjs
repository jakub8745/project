import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Arweave from 'arweave';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const configPath = path.join(root, 'public/configs/vectai_krakow_032026_config_v3.json');
const uploadManifestPath = path.join(root, 'public/configs/vectai_krakow_032026_ipfs_upload_manifest.json');
const walletPath = path.join(root, '.secrets/arweave-wallet.json');
const stagingDir = path.join(root, '.arweave-staging/vectai_krakow_032026/assets');
const summaryPath = path.join(root, 'public/configs/vectai_krakow_032026_arweave_asset_upload_summary.json');

const args = new Set(process.argv.slice(2));
const confirmed = args.has('--confirm-upload-assets');
const force = args.has('--force');
const assetArgIndex = process.argv.indexOf('--asset');
const onlyAssetId = assetArgIndex >= 0 ? process.argv[assetArgIndex + 1] : null;

const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https',
  timeout: 120000,
  logging: false
});

function arweaveUri(txId) {
  return `ar://${txId}`;
}

function gatewayUri(txId) {
  return `https://arweave.net/${txId}`;
}

function relative(filePath) {
  return path.relative(root, filePath);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveLocalPath(asset) {
  const stagedPath = asset.stagedLocalPath ? path.join(root, asset.stagedLocalPath) : null;
  if (stagedPath) return stagedPath;
  if (asset.localPath) return path.join(root, asset.localPath);
  if (typeof asset.sourceUri === 'string' && asset.sourceUri.startsWith('/')) {
    return path.join(root, 'public', asset.sourceUri.slice(1));
  }
  return null;
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
  return asset.id;
}

async function downloadRemoteAsset(asset) {
  await fs.mkdir(stagingDir, { recursive: true });
  const filename = `${asset.id}__${filenameForAsset(asset)}`;
  const filePath = path.join(stagingDir, filename);
  if (await fileExists(filePath)) return filePath;

  console.log(`downloading ${asset.id}`);
  const response = await fetch(asset.sourceUri);
  if (!response.ok) {
    throw new Error(`Failed to download ${asset.id} from ${asset.sourceUri}: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  await fs.writeFile(filePath, Buffer.from(arrayBuffer));
  return filePath;
}

async function hashFile(filePath) {
  const buffer = await fs.readFile(filePath);
  return {
    buffer,
    byteSize: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex')
  };
}

function addTags(transaction, asset, integrity) {
  transaction.addTag('Content-Type', asset.mimeType || 'application/octet-stream');
  transaction.addTag('App-Name', 'archivum-v3');
  transaction.addTag('App-Version', '3.0.0-draft');
  transaction.addTag('Exhibit-ID', 'vectai_krakow_032026');
  transaction.addTag('Asset-ID', asset.id);
  transaction.addTag('Asset-Kind', asset.kind || 'asset');
  transaction.addTag('SHA-256', integrity.sha256);
  transaction.addTag('Byte-Size', String(integrity.byteSize));
  transaction.addTag('Archive-Role', 'asset-only-test');
}

function updateConfigAsset(configAsset, asset, txId, integrity) {
  configAsset.arweaveUri = arweaveUri(txId);
  configAsset.byteSize = integrity.byteSize;
  configAsset.sha256 = integrity.sha256;
  configAsset.storageProvider = 'arweave';
  configAsset.gatewayUri = gatewayUri(txId);
  configAsset.preservation.status = 'uploaded_to_arweave';
  configAsset.preservation.storageProvider = 'arweave';
  if (!Array.isArray(configAsset.fallbackUris)) {
    configAsset.fallbackUris = [];
  }
  if (!configAsset.fallbackUris.includes(configAsset.gatewayUri)) {
    configAsset.fallbackUris.push(configAsset.gatewayUri);
  }
  if (asset.localPath && !asset.localPath.startsWith('.arweave-staging/')) {
    configAsset.localPath = asset.localPath;
  }
}

async function uploadAsset(asset, wallet) {
  let filePath = resolveLocalPath(asset);
  if (!filePath || !await fileExists(filePath)) {
    if (typeof asset.sourceUri === 'string' && asset.sourceUri.startsWith('http')) {
      filePath = await downloadRemoteAsset(asset);
      asset.stagedLocalPath = relative(filePath);
    } else {
      throw new Error(`Missing local file for ${asset.id}: ${asset.localPath || asset.sourceUri}`);
    }
  }

  const integrity = await hashFile(filePath);
  const transaction = await arweave.createTransaction({ data: integrity.buffer }, wallet);
  addTags(transaction, asset, integrity);
  await arweave.transactions.sign(transaction, wallet);

  console.log(`uploading ${asset.id}: ${transaction.id}`);
  const uploader = await arweave.transactions.getUploader(transaction);
  while (!uploader.isComplete) {
    await uploader.uploadChunk();
    const pct = uploader.totalChunks === 0 ? 100 : Math.round((uploader.uploadedChunks / uploader.totalChunks) * 100);
    process.stdout.write(`\r${asset.id}: ${pct}% (${uploader.uploadedChunks}/${uploader.totalChunks})`);
  }
  process.stdout.write('\n');

  return {
    txId: transaction.id,
    filePath,
    integrity,
    rewardWinston: transaction.reward
  };
}

async function main() {
  if (!confirmed) {
    throw new Error('Refusing to upload without --confirm-upload-assets. This script permanently uploads asset files and intentionally excludes the v3 manifest/config.');
  }
  if (onlyAssetId === '') {
    throw new Error('--asset requires an asset id.');
  }

  const wallet = JSON.parse(await fs.readFile(walletPath, 'utf8'));
  const walletAddress = await arweave.wallets.jwkToAddress(wallet);
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const uploadManifest = JSON.parse(await fs.readFile(uploadManifestPath, 'utf8'));
  const uploaded = [];
  const skipped = [];

  for (const asset of uploadManifest.assets) {
    if (asset.id === 'manifest_v3_json') continue;
    if (onlyAssetId && asset.id !== onlyAssetId) continue;
    if (asset.arweaveUri && !force) {
      skipped.push({ id: asset.id, arweaveUri: asset.arweaveUri, reason: 'already_has_arweave_uri' });
      continue;
    }

    const result = await uploadAsset(asset, wallet);
    asset.byteSize = result.integrity.byteSize;
    asset.sha256 = result.integrity.sha256;
    asset.arweaveUri = arweaveUri(result.txId);
    asset.arweaveGatewayUri = gatewayUri(result.txId);
    asset.arweave = {
      status: 'uploaded_asset_only',
      txId: result.txId,
      gatewayUri: gatewayUri(result.txId),
      rewardWinston: result.rewardWinston
    };

    const configAsset = config.assets[asset.id];
    if (configAsset) {
      updateConfigAsset(configAsset, asset, result.txId, result.integrity);
    }

    uploaded.push({
      id: asset.id,
      txId: result.txId,
      arweaveUri: arweaveUri(result.txId),
      gatewayUri: gatewayUri(result.txId),
      localPath: relative(result.filePath),
      byteSize: result.integrity.byteSize,
      sha256: result.integrity.sha256,
      rewardWinston: result.rewardWinston
    });
  }

  if (onlyAssetId && uploaded.length === 0 && skipped.length === 0) {
    throw new Error(`No upload-manifest asset matched --asset ${onlyAssetId}`);
  }

  const summary = {
    uploadedAt: new Date().toISOString(),
    provider: 'arweave',
    mode: 'asset-only',
    walletAddress,
    excludes: ['manifest_v3_json', 'nft_metadata'],
    uploaded,
    skipped
  };

  await fs.writeFile(uploadManifestPath, JSON.stringify(uploadManifest, null, 2) + '\n');
  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2) + '\n');

  console.log(`uploaded ${uploaded.length} asset(s), skipped ${skipped.length}`);
  console.log(`summary: ${relative(summaryPath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
