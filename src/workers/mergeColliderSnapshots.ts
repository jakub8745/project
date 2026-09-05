import type { ColliderMeshSnapshot } from './colliderGeometryProtocol';

export function mergeColliderSnapshots(meshes: ColliderMeshSnapshot[]): {
  positions: Float32Array;
  indices: Uint32Array;
} {
  let vertexCount = 0;
  let indexCount = 0;
  for (const mesh of meshes) {
    vertexCount += (mesh.positions.length / 3) * mesh.matrices.length;
    indexCount += (mesh.indices?.length ?? mesh.positions.length / 3) * mesh.matrices.length;
  }
  if (vertexCount === 0 || indexCount === 0) {
    throw new Error('No triangle geometry was available for the scene collider.');
  }

  const positions = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(indexCount);
  let vertexOffset = 0;
  let indexOffset = 0;

  for (const mesh of meshes) {
    for (const matrix of mesh.matrices) {
      const source = mesh.positions;
      const meshVertexCount = source.length / 3;
      for (let vertex = 0; vertex < meshVertexCount; vertex += 1) {
        const sourceOffset = vertex * 3;
        const targetOffset = (vertexOffset + vertex) * 3;
        const x = source[sourceOffset];
        const y = source[sourceOffset + 1];
        const z = source[sourceOffset + 2];
        positions[targetOffset] = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
        positions[targetOffset + 1] = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
        positions[targetOffset + 2] = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
      }

      if (mesh.indices) {
        for (let index = 0; index < mesh.indices.length; index += 1) {
          indices[indexOffset + index] = vertexOffset + mesh.indices[index];
        }
        indexOffset += mesh.indices.length;
      } else {
        for (let index = 0; index < meshVertexCount; index += 1) {
          indices[indexOffset + index] = vertexOffset + index;
        }
        indexOffset += meshVertexCount;
      }
      vertexOffset += meshVertexCount;
    }
  }

  return { positions, indices };
}
