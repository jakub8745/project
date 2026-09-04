import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const walletPath = path.join(root, '.secrets/arweave-wallet.json');
const addressPath = path.join(root, '.secrets/arweave-wallet.address.txt');
const force = process.argv.includes('--force');

function base64UrlSha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('base64url');
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!force && await exists(walletPath)) {
    throw new Error(`Wallet already exists at ${path.relative(root, walletPath)}. Use --force only if you intentionally want to replace it.`);
  }

  await fs.mkdir(path.dirname(walletPath), { recursive: true, mode: 0o700 });
  await fs.chmod(path.dirname(walletPath), 0o700);

  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicExponent: 0x10001
  });

  const jwk = privateKey.export({ format: 'jwk' });
  const address = base64UrlSha256(Buffer.from(jwk.n, 'base64url'));

  await fs.writeFile(walletPath, JSON.stringify(jwk, null, 2) + '\n', { mode: 0o600, flag: force ? 'w' : 'wx' });
  await fs.chmod(walletPath, 0o600);
  await fs.writeFile(addressPath, `${address}\n`, { mode: 0o644 });

  console.log(`Created private wallet file: ${path.relative(root, walletPath)}`);
  console.log(`Saved public address: ${path.relative(root, addressPath)}`);
  console.log(`Address: ${address}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
