import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const INPUT = process.argv[2];
const OUTPUT = process.argv[3];

if (!INPUT || !OUTPUT) {
  console.error('Usage: node scripts/compress-glb-textures.mjs <input.glb> <output.glb>');
  process.exit(1);
}

const KTX2_EXTENSION = 'KHR_texture_basisu';

function align4(value) {
  return (value + 3) & ~3;
}

function sanitizeFileName(value, fallback) {
  const cleaned = String(value || '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}

function extensionForImage(image, fallback = '.bin') {
  const mimeType = typeof image?.mimeType === 'string' ? image.mimeType.toLowerCase() : '';
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'image/ktx2') return '.ktx2';
  const uri = typeof image?.uri === 'string' ? image.uri : '';
  const ext = path.extname(uri).toLowerCase();
  return ext || fallback;
}

function readGlb(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const length = view.getUint32(8, true);
  if (magic !== 0x46546c67 || version !== 2 || length !== buffer.byteLength) {
    throw new Error('Input file is not a valid GLB 2.0 file.');
  }

  let offset = 12;
  let json = null;
  let bin = null;

  while (offset < buffer.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    const chunk = buffer.slice(chunkStart, chunkEnd);

    if (chunkType === 0x4e4f534a) {
      json = JSON.parse(chunk.toString('utf8'));
    } else if (chunkType === 0x004e4942) {
      bin = chunk;
    }

    offset = align4(chunkEnd);
  }

  if (!json || !bin) {
    throw new Error('GLB must contain both JSON and BIN chunks.');
  }

  return { json, bin };
}

async function writeTempFile(dir, name, bytes) {
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, bytes);
  return filePath;
}

function runToktx(outputFile, inputFile) {
  const encoder = (process.env.KTX2_ENCODER || 'uastc').toLowerCase();
  const baseArgs = [
    '--t2',
    '--assign_oetf',
    'srgb',
    '--target_type',
    'RGBA'
  ];

  if (encoder === 'etc1s') {
    baseArgs.push('--encode', 'etc1s', '--clevel', '1', '--qlevel', '128');
  } else {
    baseArgs.push('--encode', 'uastc', '--uastc_quality', '0', '--zcmp', '1');
  }

  if (process.env.KTX2_MIPMAPS !== '0') {
    baseArgs.push('--genmipmap');
  }

  const result = spawnSync(
    'toktx',
    [...baseArgs, outputFile, inputFile],
    { encoding: 'utf8' }
  );

  if (result.status !== 0) {
    throw new Error(
      `toktx failed for ${inputFile}\n${result.stdout || ''}${result.stderr || ''}`.trim()
    );
  }
}

function runFfmpeg(inputFile, outputFile) {
  const result = spawnSync(
    'ffmpeg',
    ['-y', '-i', inputFile, outputFile],
    { encoding: 'utf8' }
  );

  if (result.status !== 0) {
    throw new Error(
      `ffmpeg failed for ${inputFile}\n${result.stdout || ''}${result.stderr || ''}`.trim()
    );
  }
}

function prepareInputForToktx(sourcePath, image, tempDir, index, sourceName) {
  const mimeType = typeof image?.mimeType === 'string' ? image.mimeType.toLowerCase() : '';
  if (mimeType !== 'image/webp') {
    return sourcePath;
  }
  const normalizedPath = path.join(tempDir, `${String(index).padStart(2, '0')}_${sourceName}_normalized.png`);
  runFfmpeg(sourcePath, normalizedPath);
  return normalizedPath;
}

function buildGlb(json, bin) {
  const jsonText = JSON.stringify(json);
  const jsonBytes = Buffer.from(jsonText, 'utf8');
  const jsonPaddedLength = align4(jsonBytes.length);
  const jsonChunk = Buffer.alloc(jsonPaddedLength, 0x20);
  jsonBytes.copy(jsonChunk);

  const binPaddedLength = align4(bin.length);
  const binChunk = Buffer.alloc(binPaddedLength);
  bin.copy(binChunk);

  const totalLength = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const out = Buffer.alloc(totalLength);
  let offset = 0;

  out.writeUInt32LE(0x46546c67, offset); offset += 4;
  out.writeUInt32LE(2, offset); offset += 4;
  out.writeUInt32LE(totalLength, offset); offset += 4;

  out.writeUInt32LE(jsonChunk.length, offset); offset += 4;
  out.writeUInt32LE(0x4e4f534a, offset); offset += 4;
  jsonChunk.copy(out, offset); offset += jsonChunk.length;

  out.writeUInt32LE(binChunk.length, offset); offset += 4;
  out.writeUInt32LE(0x004e4942, offset); offset += 4;
  binChunk.copy(out, offset);

  return out;
}

async function main() {
  const inputBuffer = await fs.readFile(INPUT);
  const { json, bin } = readGlb(inputBuffer);

  if (!Array.isArray(json.images) || json.images.length === 0) {
    throw new Error('No images were found in the GLB.');
  }
  if (!Array.isArray(json.bufferViews)) {
    throw new Error('GLB is missing bufferViews.');
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'videopoems-ktx2-'));
  try {
    const imageKtx2ByIndex = new Map();

    for (let i = 0; i < json.images.length; i += 1) {
      const image = json.images[i];
      if (typeof image.bufferView !== 'number') {
        throw new Error(`Image ${i} is not stored in a bufferView; this script only handles embedded images.`);
      }
      const view = json.bufferViews[image.bufferView];
      if (!view || typeof view.byteOffset !== 'number' || typeof view.byteLength !== 'number') {
        throw new Error(`Invalid bufferView for image ${i}.`);
      }

      const sourceBytes = bin.subarray(view.byteOffset, view.byteOffset + view.byteLength);
      const sourceName = sanitizeFileName(image.name, `image_${i}`);
      const sourceExtension = extensionForImage(image);
      console.log(`Compressing image ${i + 1}/${json.images.length}: ${sourceName}`);
      const sourcePath = await writeTempFile(
        tempDir,
        `${String(i).padStart(2, '0')}_${sourceName}${sourceExtension}`,
        sourceBytes
      );
      const encoderInputPath = prepareInputForToktx(sourcePath, image, tempDir, i, sourceName);
      const ktx2Path = path.join(tempDir, `${String(i).padStart(2, '0')}_${sourceName}.ktx2`);
      runToktx(ktx2Path, encoderInputPath);
      imageKtx2ByIndex.set(i, await fs.readFile(ktx2Path));
    }

    const newBufferViews = json.bufferViews.map((view, index) => {
      if (typeof view.buffer !== 'number' || view.buffer !== 0) {
        throw new Error(`Unsupported bufferView.buffer value at index ${index}.`);
      }
      return { ...view };
    });
    json.bufferViews = newBufferViews;

    const rebuiltParts = [];
    let cursor = 0;

    for (let i = 0; i < newBufferViews.length; i += 1) {
      const view = newBufferViews[i];
      const start = typeof view.byteOffset === 'number' ? view.byteOffset : 0;
      const length = typeof view.byteLength === 'number' ? view.byteLength : 0;
      const original = bin.subarray(start, start + length);
      const imageIndex = json.images.findIndex((image) => image.bufferView === i);
      const replacement = imageIndex >= 0 ? imageKtx2ByIndex.get(imageIndex) : null;
      const bytes = replacement || original;

      const aligned = align4(cursor);
      if (aligned > cursor) {
        rebuiltParts.push(Buffer.alloc(aligned - cursor));
        cursor = aligned;
      }

      view.byteOffset = cursor;
      view.byteLength = bytes.length;
      rebuiltParts.push(Buffer.from(bytes));
      cursor += bytes.length;
    }

    const rebuiltBin = Buffer.concat(rebuiltParts);

    for (let i = 0; i < json.images.length; i += 1) {
      json.images[i] = {
        ...json.images[i],
        mimeType: 'image/ktx2'
      };
    }

    const textures = Array.isArray(json.textures) ? json.textures : [];
    for (let i = 0; i < textures.length; i += 1) {
      const texture = textures[i];
      if (!texture || typeof texture !== 'object') continue;
      const source = texture.source;
      if (typeof source !== 'number') continue;
      texture.extensions = {
        ...(texture.extensions || {}),
        [KTX2_EXTENSION]: { source }
      };
    }

    json.extensionsUsed = Array.from(new Set([...(json.extensionsUsed || []), KTX2_EXTENSION]));
    json.extensionsRequired = Array.from(
      new Set([...(json.extensionsRequired || []), KTX2_EXTENSION])
    );

    if (!Array.isArray(json.buffers) || json.buffers.length === 0) {
      json.buffers = [{ byteLength: rebuiltBin.length }];
    } else {
      json.buffers[0] = {
        ...json.buffers[0],
        byteLength: rebuiltBin.length
      };
    }

    const outputGlb = buildGlb(json, rebuiltBin);
    await fs.writeFile(OUTPUT, outputGlb);
    console.log(`Wrote ${OUTPUT}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
