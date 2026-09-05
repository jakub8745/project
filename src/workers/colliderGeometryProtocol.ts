export interface ColliderMeshSnapshot {
  positions: Float32Array;
  indices: Uint32Array | null;
  matrices: number[][];
}

export interface ColliderGeometryRequest {
  id: number;
  meshes: ColliderMeshSnapshot[];
}

export interface ColliderGeometrySuccess {
  id: number;
  ok: true;
  positions: Float32Array;
  indices: Uint32Array;
}

export interface ColliderGeometryFailure {
  id: number;
  ok: false;
  error: string;
}

export type ColliderGeometryResponse = ColliderGeometrySuccess | ColliderGeometryFailure;
