import { BufferAttribute, BufferGeometry, InstancedMesh, Matrix4, Mesh, type Object3D } from 'three';
import type {
  ColliderGeometryRequest,
  ColliderGeometryResponse,
  ColliderMeshSnapshot
} from '../workers/colliderGeometryProtocol';

let requestSequence = 0;
const COPY_BATCH_SIZE = 32_768;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

async function copyMeshGeometry(mesh: Mesh, isStale: () => boolean): Promise<ColliderMeshSnapshot | null> {
  const position = mesh.geometry.getAttribute('position');
  if (!position || position.count < 3) return null;

  const positions = new Float32Array(position.count * 3);
  for (let start = 0; start < position.count; start += COPY_BATCH_SIZE) {
    const end = Math.min(position.count, start + COPY_BATCH_SIZE);
    for (let index = start; index < end; index += 1) {
      const offset = index * 3;
      positions[offset] = position.getX(index);
      positions[offset + 1] = position.getY(index);
      positions[offset + 2] = position.getZ(index);
    }
    if (end < position.count) {
      await nextFrame();
      if (isStale()) return null;
    }
  }

  const sourceIndex = mesh.geometry.getIndex();
  const indices = sourceIndex ? new Uint32Array(sourceIndex.count) : null;
  if (sourceIndex && indices) {
    for (let start = 0; start < sourceIndex.count; start += COPY_BATCH_SIZE) {
      const end = Math.min(sourceIndex.count, start + COPY_BATCH_SIZE);
      for (let index = start; index < end; index += 1) {
        indices[index] = sourceIndex.getX(index);
      }
      if (end < sourceIndex.count) {
        await nextFrame();
        if (isStale()) return null;
      }
    }
  }

  return {
    positions,
    indices,
    matrices: mesh instanceof InstancedMesh
      ? Array.from({ length: mesh.count }, (_, instanceIndex) => {
          const instanceMatrix = new Matrix4();
          mesh.getMatrixAt(instanceIndex, instanceMatrix);
          return new Matrix4().multiplyMatrices(mesh.matrixWorld, instanceMatrix).toArray();
        })
      : [mesh.matrixWorld.toArray()]
  };
}

export async function buildColliderGeometryInWorker(
  root: Object3D,
  includeMesh: (mesh: Mesh) => boolean,
  isStale: () => boolean
): Promise<BufferGeometry> {
  root.updateMatrixWorld(true);
  const meshes: Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof Mesh && includeMesh(object)) meshes.push(object);
  });

  const snapshots: ColliderMeshSnapshot[] = [];
  for (const mesh of meshes) {
    if (isStale()) throw new DOMException('Collider build aborted', 'AbortError');
    const snapshot = await copyMeshGeometry(mesh, isStale);
    if (snapshot) snapshots.push(snapshot);
    await nextFrame();
  }
  if (isStale()) throw new DOMException('Collider build aborted', 'AbortError');

  const worker = new Worker(new URL('../workers/colliderGeometry.worker.ts', import.meta.url), { type: 'module' });
  const id = ++requestSequence;
  const transfer: Transferable[] = [];
  snapshots.forEach((snapshot) => {
    transfer.push(snapshot.positions.buffer);
    if (snapshot.indices) transfer.push(snapshot.indices.buffer);
  });

  let response: ColliderGeometryResponse;
  try {
    response = await new Promise<ColliderGeometryResponse>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<ColliderGeometryResponse>) => {
        if (event.data.id === id) resolve(event.data);
      };
      worker.onerror = (event) => reject(new Error(event.message || 'Collider geometry worker failed.'));
      const request: ColliderGeometryRequest = { id, meshes: snapshots };
      worker.postMessage(request, transfer);
    });
  } catch (error) {
    worker.terminate();
    throw error;
  }
  worker.terminate();

  if (!response.ok) {
    throw new Error(response.error);
  }
  if (isStale()) {
    throw new DOMException('Collider build aborted', 'AbortError');
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(response.positions, 3));
  geometry.setIndex(new BufferAttribute(response.indices, 1));
  return geometry;
}
