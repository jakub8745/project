import type {
  ColliderGeometryRequest,
  ColliderGeometryResponse
} from './colliderGeometryProtocol';
import { mergeColliderSnapshots } from './mergeColliderSnapshots';

type WorkerScope = {
  onmessage: ((event: MessageEvent<ColliderGeometryRequest>) => void) | null;
  postMessage: (message: ColliderGeometryResponse, transfer: Transferable[]) => void;
};

const workerScope = self as unknown as WorkerScope;

workerScope.onmessage = ({ data }) => {
  try {
    const { positions, indices } = mergeColliderSnapshots(data.meshes);

    workerScope.postMessage(
      { id: data.id, ok: true, positions, indices },
      [positions.buffer, indices.buffer]
    );
  } catch (error) {
    workerScope.postMessage({
      id: data.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }, []);
  }
};
