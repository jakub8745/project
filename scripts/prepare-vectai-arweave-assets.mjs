import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const configPath = path.join(root, 'public/configs/vectai_krakow_032026_config_v3.json');
const uploadManifestPath = path.join(root, 'public/configs/vectai_krakow_032026_ipfs_upload_manifest.json');
const walletAddressPath = path.join(root, '.secrets/arweave-wallet.address.txt');
const stagingDir = path.join(root, '.arweave-staging/vectai_krakow_032026/assets');
const reportPath = path.join(root, 'public/configs/vectai_krakow_032026_arweave_prepare_report.json');
const gateway = 'https://arweave.net';

const shouldWrite = process.argv.includes('--write');

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

async function hashFile(filePath) {
  const buffer = await fs.readFile(filePath);
  return {
    byteSize: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex')
  };
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

async function getArweavePrice(byteSize) {
  const response = await fetch(`${gateway}/price/${byteSize}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch Arweave price for ${byteSize} bytes: ${response.status} ${response.statusText}`);
  }
  const winston = (await response.text()).trim();
  return BigInt(winston);
}

async function getWalletBalance(address) {
  const response = await fetch(`${gateway}/wallet/${address}/balance`);
  if (!response.ok) {
    throw new Error(`Failed to fetch Arweave balance for ${address}: ${response.status} ${response.statusText}`);
  }
  return BigInt((await response.text()).trim());
}

function winstonToAr(winston) {
  const whole = winston / 1_000_000_000_000n;
  const fractional = (winston % 1_000_000_000_000n).toString().padStart(12, '0').replace(/0+$/, '');
  return fractional ? `${whole}.${fractional}` : `${whole}`;
}

async function main() {
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const uploadManifest = JSON.parse(await fs.readFile(uploadManifestPath, 'utf8'));
  const walletAddress = (await fs.readFile(walletAddressPath, 'utf8')).trim();
  const assets = [];
  let totalBytes = 0;
  let totalPriceWinston = 0n;

  for (const asset of uploadManifest.assets) {
    if (asset.id === 'manifest_v3_json') continue;

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
    const priceWinston = await getArweavePrice(integrity.byteSize);
    totalBytes += integrity.byteSize;
    totalPriceWinston += priceWinston;

    asset.byteSize = integrity.byteSize;
    asset.sha256 = integrity.sha256;
    asset.arweave = {
      status: 'ready_for_asset_upload',
      estimatedPriceWinston: priceWinston.toString(),
      estimatedPriceAR: winstonToAr(priceWinston)
    };

    const configAsset = config.assets[asset.id];
    if (configAsset) {
      configAsset.byteSize = integrity.byteSize;
      configAsset.sha256 = integrity.sha256;
      configAsset.preservation.status = configAsset.arweaveUri ? 'uploaded_to_arweave' : 'ready_for_arweave_upload';
    }

    assets.push({
      id: asset.id,
      kind: asset.kind,
      mimeType: asset.mimeType,
      sourceUri: asset.sourceUri,
      localPath: relative(filePath),
      byteSize: integrity.byteSize,
      sha256: integrity.sha256,
      estimatedPriceWinston: priceWinston.toString(),
      estimatedPriceAR: winstonToAr(priceWinston)
    });

    console.log(`${asset.id}: ${integrity.byteSize} bytes, ${winstonToAr(priceWinston)} AR`);
  }

  const balanceWinston = await getWalletBalance(walletAddress);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: shouldWrite ? 'write' : 'dry-run',
    walletAddress,
    assetCount: assets.length,
    totalBytes,
    estimatedTotalPriceWinston: totalPriceWinston.toString(),
    estimatedTotalPriceAR: winstonToAr(totalPriceWinston),
    walletBalanceWinston: balanceWinston.toString(),
    walletBalanceAR: winstonToAr(balanceWinston),
    hasEnoughBalanceForAssets: balanceWinston >= totalPriceWinston,
    excludes: ['manifest_v3_json', 'nft_metadata'],
    stagingDir: relative(stagingDir),
    assets
  };

  if (shouldWrite) {
    await fs.writeFile(uploadManifestPath, JSON.stringify(uploadManifest, null, 2) + '\n');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.log(`wrote ${relative(reportPath)}`);
  } else {
    console.log('dry run only; pass --write to update local manifests and report');
  }

  console.log(`total: ${totalBytes} bytes, ${winstonToAr(totalPriceWinston)} AR`);
  console.log(`wallet balance: ${winstonToAr(balanceWinston)} AR`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
