import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const namespace = 'lrbcisjgkyhb';
const bucket = 'milkmaid-pitchers';
const endpoint = `https://lrbcisjgkyhb.objectstorage.uk-london-1.oci.customer-oci.com/n/${namespace}/b/${bucket}/o`;
const defaultOutput = resolve(dirname(fileURLToPath(import.meta.url)), '../audits/asset-index.json');
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const output = resolve(outputArg ? outputArg.slice('--output='.length) : defaultOutput);

async function listObjects() {
  const objects = [];
  let start;
  do {
    const url = new URL(endpoint);
    url.searchParams.set('limit', '1000');
    url.searchParams.set('fields', 'name,size,md5');
    if (start) url.searchParams.set('start', start);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Oracle Object Storage returned HTTP ${response.status}.`);
    const page = await response.json();
    if (!Array.isArray(page.objects)) throw new Error('Oracle Object Storage response did not contain an objects array.');
    const newObjects = page.objects.filter((object) => !start || object.name > start);
    objects.push(...newObjects);
    if (page.objects.length < 1000) break;
    if (newObjects.length === 0) throw new Error('Object listing pagination did not advance.');
    start = newObjects.at(-1).name;
  } while (true);
  return objects;
}

const objects = await listObjects();
const seen = new Set();
for (const object of objects) {
  if (typeof object.name !== 'string' || !object.name.toLowerCase().endsWith('.glb')) {
    throw new Error(`Unexpected object in model bucket: ${String(object.name)}`);
  }
  if (seen.has(object.name)) throw new Error(`Duplicate object name in listing: ${object.name}`);
  seen.add(object.name);
}
objects.sort((a, b) => a.name.localeCompare(b.name));

const objectBase = `${endpoint}/`;
const index = {
  namespace,
  bucket,
  objectCount: objects.length,
  objects: objects.map(({ name, size, md5 }) => ({
    name,
    size,
    md5,
    sourceUri: `${objectBase}${encodeURIComponent(name)}`
  }))
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(index, null, 2)}\n`);
console.log(`Wrote ${objects.length} objects to ${output}`);
