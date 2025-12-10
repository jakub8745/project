export const ORACLE_REGION = "uk-london-1";
export const ORACLE_NAMESPACE = "lrbcisjgkyhb";
// Change this to the bucket that hosts shared/static assets (icons, etc.)
export const ORACLE_ASSETS_BUCKET = "icons";

export function isIpfsUri(uri: string | undefined | null): uri is string {
  return typeof uri === 'string' && uri.startsWith('ipfs://');
}

export function getFilename(uri: string): string {
  const parts = uri.split("/");
  return parts[parts.length - 1];
}

export function resolveOracleUrl(uri: string, bucket: string): string {
  if (!isIpfsUri(uri)) return uri;
  const filename = getFilename(uri);
  return `https://${ORACLE_NAMESPACE}.objectstorage.${ORACLE_REGION}.oci.customer-oci.com/n/${ORACLE_NAMESPACE}/b/${bucket}/o/${filename}`;
}

export function oracleStaticUrl(path: string): string {
  let clean = path.startsWith('/') ? path.slice(1) : path;
  // If caller included bucket folder name in the path, trim it
  if (ORACLE_ASSETS_BUCKET && clean.startsWith(`${ORACLE_ASSETS_BUCKET}/`)) {
    clean = clean.slice(ORACLE_ASSETS_BUCKET.length + 1);
  }
  return `https://${ORACLE_NAMESPACE}.objectstorage.${ORACLE_REGION}.oci.customer-oci.com/n/${ORACLE_NAMESPACE}/b/${ORACLE_ASSETS_BUCKET}/o/${clean}`;
}
