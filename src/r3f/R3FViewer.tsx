import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { RootState } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import type { Event, Vector3Tuple } from 'three';
import {
  AudioListener,
  Box3,
  BufferGeometry,
  DoubleSide,
  Euler,
  Vector3,
  Mesh,
  Group,
  Material,
  MeshBasicMaterial,
  Object3D
} from 'three';
import type { WebGLRenderer } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import Visitor from '../modules/Visitor.js';
import type { PhysicsConfig } from '../modules/physicsSystem';
import type { ExhibitConfig } from './useExhibitConfig';
import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { TransformControlsEventMap } from 'three/examples/jsm/controls/TransformControls.js';
import { PointerInteractions } from './PointerInteractions';
import {
  applyVideoMeshes,
  disposeVideoMeshesForLifecycle,
  type VideoMeshConfig
} from '../modules/applyVideoMeshes.js';
import {
  applyObjectRuntimeData,
  normalizeObjectRegistry,
  resolveObjectRuntimeData,
  type ObjectRegistry,
  type ObjectRuntimeData
} from '../modules/objectRegistry.js';
import { MaterialModalProvider } from './Modal';
import type { AudioMeshConfig } from '../modules/audioMeshManager.ts';
import { AudioMeshes } from './AudioMeshes';
import { AudioPlayerControls } from './AudioPlayerControls';
import { AudioSubtitles } from './AudioSubtitles';
import { OnscreenJoystick } from './OnscreenJoystick';
import { ObjectHoldRotation } from './ObjectHoldRotation';
import { ThumbnailRecorderMode, type ThumbnailCaptureConfig } from './ThumbnailRecorderMode';
import {
  SceneBackground,
  SceneEnvironment,
  SceneLightRig,
  type SceneLightSettings
} from './ScenePresentation';
import { AutoExposureControl, RendererTuning } from './RendererTuning';
import { normalizeToneMappingName, type ToneMappingName } from './toneMapping';
import { XrAudioSubtitlePanel } from './XrAudioSubtitlePanel';
import { clearConfiguredGLTF, useConfiguredGLTFs } from './useConfiguredGLTFs';
import { GenerateMeshBVHWorker } from 'three-mesh-bvh/worker';
import { GeneratedExhibitScene } from './proceduralRoom/ProceduralRoomScene';
import {
  getProceduralRoomBounds,
  parseProceduralModels,
  parseProceduralObjects
} from './proceduralRoom/config';
import { FirstPersonController } from './VisitorRuntimeController';
import { isVisitorDirectionInput, type ControllerParams } from './visitorControllerConfig';
import { ScenePhysics } from './ScenePhysics';
import { audioFloorRouteKey, type AudioFloorRoute, useSceneAudioRouting } from './useSceneAudioRouting';
import { useSceneInteractionMetadata } from './useSceneInteractionMetadata';
import { useSceneReadiness } from './useSceneReadiness';
import { useXrSessionControls } from './useXrSessionControls';
import { useModalInteractionState } from './useModalInteractionState';
import { surfaceZoneRouteKey, type LightZoneRoute, useSceneLightZones } from './useSceneLightZones';
import { useSceneVideoConfig } from './useSceneVideoConfig';
import { buildColliderGeometryInWorker } from './buildColliderGeometry';

BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast;

const DEBUG_COLLIDER = false;
let transitionSequence = 0;

function createTransitionId(configUrl: string | null, attempt: number): string {
  transitionSequence += 1;
  return `${configUrl || 'none'}:${attempt}:${transitionSequence}`;
}

interface R3FViewerProps {
  configUrl: string | null;
  config: ExhibitConfig | null;
  loading?: boolean;
  error?: Error | null;
  onRetryConfig?: () => void;
  onRequestSidebarClose?: () => void;
  onVisitorActivity?: () => void;
  onVisitorEntered?: () => void;
  onPhysicsCollision?: (event: {
    a: string;
    b: string;
    point: Vector3Tuple;
    penetration: number;
    timestamp: number;
  }) => void;
}

class SceneErrorBoundary extends Component<
  { onError: (error: Error) => void; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    void info;
    this.props.onError(error);
  }
  render() { return this.state.error ? null : this.props.children; }
}

function coerceVector(source: unknown, fallback: Vector3Tuple = [0, 0, 0]): Vector3Tuple {
  if (Array.isArray(source) && source.length === 3) {
    return [Number(source[0]) || 0, Number(source[1]) || 0, Number(source[2]) || 0];
  }
  if (source && typeof source === 'object') {
    const { x, y, z } = source as Record<string, unknown>;
    return [Number(x) || 0, Number(y) || 0, Number(z) || 0];
  }
  return fallback;
}

function toVector3(source: unknown, fallback: Vector3Tuple = [0, 0, 0]): Vector3 {
  const [x, y, z] = coerceVector(source, fallback);
  return new Vector3(x, y, z);
}

function coercePositiveNumber(source: unknown, fallback: number): number {
  if (typeof source === 'number' && Number.isFinite(source) && source > 0) {
    return source;
  }
  return fallback;
}

type SpatialCandidateBase = {
  box: Box3;
  area: number;
  xPadding: number;
  zPadding: number;
};

type FloorSpatialCandidate = SpatialCandidateBase & {
  floor: Object3D;
  floorKey: string;
};

type RouteSpatialCandidate<Route> = SpatialCandidateBase & {
  route: Route;
  routeKey: string;
};

function getSurfaceRouteNames(surface: Object3D | null): string[] {
  if (!surface) return [];
  const userData = surface.userData && typeof surface.userData === 'object'
    ? (surface.userData as Record<string, unknown>)
    : {};
  return [
    surface.name,
    userData.__objectRegistryKey,
    userData.__objectName,
    userData.__objectRef,
    userData.name,
    userData.id,
    userData.elementID
  ].filter((value): value is string => typeof value === 'string' && Boolean(value.trim()));
}

function getSurfaceType(surface: Object3D | null): string | undefined {
  const type = surface?.userData?.type;
  return typeof type === 'string' && type.trim() ? type.trim() : undefined;
}

function isVisitorLocationSurface(surface: Object3D | null): boolean {
  const type = getSurfaceType(surface);
  return type === 'visitorLocation' || type === 'Room';
}

function createSpatialCandidateBase(box: Box3): SpatialCandidateBase {
  return {
    box,
    area: Math.max(0.0001, (box.max.x - box.min.x) * (box.max.z - box.min.z)),
    xPadding: Math.max(0.2, (box.max.x - box.min.x) * 0.02),
    zPadding: Math.max(0.2, (box.max.z - box.min.z) * 0.02)
  };
}

function findMappedRoute<Route>(names: string[], routeBySurface: Map<string, Route>): Route | undefined {
  for (const name of names) {
    const route = routeBySurface.get(name);
    if (route) {
      return route;
    }
  }
  return undefined;
}

function pickBestSpatialCandidate<T extends SpatialCandidateBase>(candidates: T[], position: Vector3): T | null {
  let best: T | null = null;
  let bestYDistance = Number.POSITIVE_INFINITY;
  let bestArea = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const { box, xPadding, zPadding, area } = candidate;
    if (
      position.x < box.min.x - xPadding ||
      position.x > box.max.x + xPadding ||
      position.z < box.min.z - zPadding ||
      position.z > box.max.z + zPadding
    ) {
      continue;
    }

    const yDistance = position.y < box.min.y
      ? box.min.y - position.y
      : position.y > box.max.y
        ? position.y - box.max.y
        : 0;
    if (yDistance < bestYDistance || (yDistance === bestYDistance && area < bestArea)) {
      best = candidate;
      bestYDistance = yDistance;
      bestArea = area;
    }
  }

  return best;
}

function getBooleanFromQuery(name: string): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  const value = params.get(name);
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function detectIPadLikeDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouch = navigator.maxTouchPoints || 0;
  return /iPad/i.test(ua) || (platform === 'MacIntel' && maxTouch > 1);
}

function cloneTransparentMaterial(material: Material): Material {
  const cloned = material.clone();
  cloned.transparent = true;
  cloned.opacity = 0;
  cloned.depthWrite = false;
  cloned.side = DoubleSide;
  if ('colorWrite' in cloned) {
    cloned.colorWrite = false;
  }
  return cloned;
}

function createTransparentMaterial(): Material {
  return cloneTransparentMaterial(new MeshBasicMaterial());
}

const TRANSPARENT_INTERACTIVE_TYPES = new Set(['Audio', 'Enter', 'Image', 'Link', 'VideoControl']);

function isCollisionOnlyRuntimeObject(runtimeData: ObjectRuntimeData | null | undefined): boolean {
  const entry = runtimeData?.entry;
  return entry?.collisionOnly === true || entry?.collision === 'only';
}

function isTransparentInteractionProxy(runtimeData: ObjectRuntimeData | null | undefined): boolean {
  const entry = runtimeData?.entry;
  return entry?.visible === false;
}

function applyTransparentInteractionProxy(mesh: Mesh) {
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.interactive = true;
  if (Array.isArray(mesh.material)) {
    mesh.material = mesh.material.length > 0 ? mesh.material.map((mat) => cloneTransparentMaterial(mat)) : [createTransparentMaterial()];
  } else if (mesh.material) {
    mesh.material = cloneTransparentMaterial(mesh.material);
  } else {
    mesh.material = createTransparentMaterial();
  }
}

function applyCollisionOnlyProxy(mesh: Mesh) {
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.collisionOnly = true;
  mesh.userData.interactive = false;
  if (Array.isArray(mesh.material)) {
    mesh.material = mesh.material.length > 0 ? mesh.material.map((mat) => cloneTransparentMaterial(mat)) : [createTransparentMaterial()];
  } else if (mesh.material) {
    mesh.material = cloneTransparentMaterial(mesh.material);
  } else {
    mesh.material = createTransparentMaterial();
  }
}

function enableMaterialDithering(material: Material) {
  material.dithering = true;
}

const COLLIDER_EXCLUDED_TYPES = new Set(['Audio', 'Enter', 'Image', 'Link', 'Video', 'VideoControl']);

function materialIsCollisionHidden(material: Material | Material[] | undefined): boolean {
  if (!material) return false;
  const materials = Array.isArray(material) ? material : [material];
  return materials.length > 0 && materials.every((mat) => {
    const opacity = typeof mat.opacity === 'number' ? mat.opacity : 1;
    const colorWrite = 'colorWrite' in mat ? mat.colorWrite : true;
    return opacity <= 0.001 || colorWrite === false;
  });
}

function isColliderMeshIncluded(object: Mesh, objectRegistry?: ObjectRegistry): boolean {
  const runtimeData = resolveObjectRuntimeData(object, objectRegistry);
  const type = runtimeData?.type || (typeof object.userData?.type === 'string' ? object.userData.type : undefined);
  const collisionOnly = isCollisionOnlyRuntimeObject(runtimeData) || object.userData?.collisionOnly === true;
  let ancestor: Object3D | null = object;
  while (ancestor) {
    if (!ancestor.visible) return false;
    ancestor = ancestor.parent;
  }
  return (
    collisionOnly || !((type && COLLIDER_EXCLUDED_TYPES.has(type)) || materialIsCollisionHidden(object.material))
  );
}

function ExhibitModel({
  modelPath,
  position,
  rotation,
  scale,
  onColliderReady,
  onSceneReady,
  videosConfig,
  objectRegistry,
  lifecycleId
}: {
  modelPath: string;
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  scale: number;
  onColliderReady?: (collider: Mesh | null) => void;
  onSceneReady?: () => void;
  videosConfig?: VideoMeshConfig[];
  objectRegistry?: ObjectRegistry;
  lifecycleId: string;
}) {
  const loadTargets = useMemo(() => [modelPath], [modelPath]);
  const gltfResults = useConfiguredGLTFs(loadTargets);
  const mainGltf = gltfResults[0] as GLTF | undefined;
  const camera = useThree((state) => state.camera);
  const [buildError, setBuildError] = useState<Error | null>(null);

  const displayScene = useMemo(() => {
    if (!mainGltf?.scene) {
      return null;
    }

    const display = mainGltf.scene.clone(true) as Group;
    display.name = 'r3f-display-root';
    display.traverse((object) => {
      const runtimeData = applyObjectRuntimeData(object, objectRegistry);
      if (object instanceof Mesh) {
        const type = runtimeData?.type || (typeof object.userData?.type === 'string' ? object.userData.type : undefined);
        if (isCollisionOnlyRuntimeObject(runtimeData)) {
          applyCollisionOnlyProxy(object);
          return;
        }
        if (type && TRANSPARENT_INTERACTIVE_TYPES.has(type) && isTransparentInteractionProxy(runtimeData)) {
          applyTransparentInteractionProxy(object);
          return;
        }
        object.castShadow = true;
        object.receiveShadow = true;
        if (Array.isArray(object.material)) {
          object.material.forEach((mat) => enableMaterialDithering(mat));
        } else if (object.material) {
          enableMaterialDithering(object.material);
        }
      }
    });

    return display;
  }, [mainGltf, objectRegistry]);

  useEffect(() => {
    if (!displayScene) return undefined;
    let stale = false;
    let idleHandle: number | null = null;
    let timerHandle: ReturnType<typeof setTimeout> | null = null;
    let generatedGeometry: BufferGeometry | null = null;
    let bvhWorker: GenerateMeshBVHWorker | null = null;

    const buildCollider = async () => {
      const merged = await buildColliderGeometryInWorker(
        displayScene,
        (mesh) => isColliderMeshIncluded(mesh, objectRegistry),
        () => stale
      );
      generatedGeometry = merged;
      if (stale) {
        merged.dispose();
        return;
      }
      bvhWorker = new GenerateMeshBVHWorker();
      merged.boundsTree = await bvhWorker.generate(merged, { verbose: false });
      if (stale) {
        merged.dispose();
        return;
      }
      const colliderMesh = new Mesh(merged);
      colliderMesh.name = 'r3f-collider';
      colliderMesh.visible = DEBUG_COLLIDER;
      const [px, py, pz] = position;
      const [rx, ry, rz] = rotation;
      colliderMesh.position.set(px, py, pz);
      colliderMesh.rotation.set(rx, ry, rz);
      colliderMesh.scale.setScalar(scale);
      if (DEBUG_COLLIDER) {
        colliderMesh.material = new MeshBasicMaterial({ color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.2 });
        colliderMesh.renderOrder = 999;
      }
      colliderMesh.updateMatrixWorld(true);
      onColliderReady?.(colliderMesh);
      onSceneReady?.();
    };

    const schedule = () => void buildCollider().catch((error: unknown) => {
      if (!stale && !(error instanceof DOMException && error.name === 'AbortError')) {
        setBuildError(error instanceof Error ? error : new Error(String(error)));
      }
    });
    if (typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(schedule, { timeout: 250 });
    } else {
      timerHandle = globalThis.setTimeout(schedule, 0);
    }
    return () => {
      stale = true;
      if (idleHandle !== null) window.cancelIdleCallback(idleHandle);
      if (timerHandle !== null) globalThis.clearTimeout(timerHandle);
      (bvhWorker as (GenerateMeshBVHWorker & { dispose?: () => void }) | null)?.dispose?.();
      onColliderReady?.(null);
      generatedGeometry?.dispose();
    };
  }, [displayScene, objectRegistry, onColliderReady, onSceneReady, position, rotation, scale]);

  if (buildError) throw buildError;

  useEffect(() => {
    if (!displayScene || !videosConfig || videosConfig.length === 0) {
      disposeVideoMeshesForLifecycle(lifecycleId);
      return;
    }
    applyVideoMeshes(displayScene, camera, { videos: videosConfig, objectRegistry, lifecycleId });
    return () => {
      disposeVideoMeshesForLifecycle(lifecycleId);
    };
  }, [camera, displayScene, lifecycleId, objectRegistry, videosConfig]);

  if (!displayScene) {
    return null;
  }

  const [rx, ry, rz] = rotation;

  return (
    <primitive
      object={displayScene}
      position={new Vector3(...position)}
      rotation={new Euler(rx, ry, rz)}
      scale={scale}
      dispose={null}
    />
  );
}

function SceneLoadingOverlay({
  visible,
  label = 'Loading exhibit',
  detail
}: {
  visible: boolean;
  label?: string;
  detail?: string;
}) {
  if (!visible) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[900] flex items-center justify-center bg-slate-950/90 text-white">
      <div className="w-64 max-w-[70vw]">
        <div className="mb-3 text-center text-sm font-semibold tracking-wide text-white/80">
          {label}
        </div>
        {detail ? (
          <div className="mb-3 truncate text-center text-xs text-white/55" title={detail}>
            {detail}
          </div>
        ) : null}
        <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-sky-300" />
        </div>
      </div>
    </div>
  );
}

function SceneFailureOverlay({
  title,
  message,
  onRetry
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[2147483647] flex items-center justify-center overflow-hidden bg-slate-950/95 p-4 text-white"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="scene-failure-title"
      aria-describedby="scene-failure-message"
    >
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg min-h-0 flex-col rounded-xl border border-white/15 bg-slate-900 p-5 text-center shadow-2xl">
        <h2 id="scene-failure-title" className="shrink-0 text-lg font-semibold">
          {title}
        </h2>
        <p
          id="scene-failure-message"
          className="my-4 min-h-0 overflow-y-auto overscroll-contain break-words text-sm text-red-200"
        >
          {message}
        </p>
        <div className="shrink-0 border-t border-white/10 pt-4">
          <button
            type="button"
            autoFocus
            className="min-h-11 rounded-lg bg-sky-300 px-5 py-2 font-semibold text-slate-950 shadow-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-100"
            onClick={onRetry}
          >
            Retry exhibit
          </button>
        </div>
      </div>
    </div>
  );
}

function R3FViewerInner({
  transitionId,
  onRetry,
  configUrl,
  config,
  loading = false,
  error = null,
  onRequestSidebarClose,
  onVisitorActivity,
  onVisitorEntered,
  onPhysicsCollision
}: R3FViewerProps & { transitionId: string; onRetry: () => void }) {
  const modelPath = config?.modelPath;
  const proceduralRoom = config?.proceduralRoom as Record<string, unknown> | undefined;
  const useProceduralRoom = !modelPath && Boolean(proceduralRoom);
  const objectRegistry = useMemo(
    () => normalizeObjectRegistry(config?.objects ?? config?.objectRegistry),
    [config?.objects, config?.objectRegistry]
  );
  const proceduralModels = useMemo(() => parseProceduralModels(config?.models), [config?.models]);
  const proceduralObjects = useMemo(
    () => parseProceduralObjects(config?.proceduralObjects),
    [config?.proceduralObjects]
  );
  const proceduralRoomBounds = useMemo(() => getProceduralRoomBounds(proceduralRoom), [proceduralRoom]);
  const position = useMemo(() => coerceVector(config?.position), [config?.position]);
  const rotation = useMemo(() => coerceVector(config?.rotation), [config?.rotation]);
  const scale = typeof config?.scale === 'number' ? config.scale : 1;
  const rawParams = config?.params as Record<string, unknown> | undefined;
  const orbitRotateSpeed =
    typeof rawParams?.orbitRotateSpeed === 'number' && Number.isFinite(rawParams.orbitRotateSpeed)
      ? Math.max(0.05, rawParams.orbitRotateSpeed)
      : 0.65;
  const configuredToneMapping = normalizeToneMappingName(rawParams?.toneMapping);
  const [toneMappingName, setToneMappingName] = useState<ToneMappingName>(configuredToneMapping);
  useEffect(() => {
    setToneMappingName(configuredToneMapping);
  }, [configUrl, configuredToneMapping]);
  const heightOffsetVector = useMemo(() => toVector3(rawParams?.heightOffset, [0, 1.05, 0]), [rawParams?.heightOffset]);
  const visitorEnterVector = useMemo(() => toVector3(rawParams?.visitorEnter, [0, 2, 0]), [rawParams?.visitorEnter]);
  const controllerParams = useMemo<ControllerParams | undefined>(() => {
    if (!rawParams) return undefined;
    const result: ControllerParams = {};
    if (typeof rawParams.visitorSpeed === 'number' && Number.isFinite(rawParams.visitorSpeed)) {
      result.visitorSpeed = rawParams.visitorSpeed;
    }
    if (typeof rawParams.gravity === 'number' && Number.isFinite(rawParams.gravity)) {
      result.gravity = rawParams.gravity;
    }
    if (typeof rawParams.rotateOrbit === 'number' && Number.isFinite(rawParams.rotateOrbit)) {
      result.rotateOrbit = rawParams.rotateOrbit;
    }
    if (typeof rawParams.autoMoveSpeed === 'number' && Number.isFinite(rawParams.autoMoveSpeed)) {
      result.autoMoveSpeed = rawParams.autoMoveSpeed;
    }
    if (typeof rawParams.movementAcceleration === 'number' && Number.isFinite(rawParams.movementAcceleration)) {
      result.movementAcceleration = rawParams.movementAcceleration;
    }
    if (typeof rawParams.movementDeceleration === 'number' && Number.isFinite(rawParams.movementDeceleration)) {
      result.movementDeceleration = rawParams.movementDeceleration;
    }
    if (isVisitorDirectionInput(rawParams.spawnDirection)) {
      result.spawnDirection = rawParams.spawnDirection;
    }
    if (isVisitorDirectionInput(rawParams.visitorDirection)) {
      result.visitorDirection = rawParams.visitorDirection;
    }
    if (rawParams.heightOffset !== undefined) {
      result.heightOffset = heightOffsetVector.clone();
    }
    if (rawParams.visitorEnter !== undefined) {
      result.visitorEnter = visitorEnterVector.clone();
    }
    return result;
  }, [rawParams, heightOffsetVector, visitorEnterVector]);
  const backgroundBlurriness = typeof rawParams?.backgroundBlurriness === 'number' ? rawParams.backgroundBlurriness : undefined;
  const backgroundIntensity = typeof rawParams?.backgroundIntensity === 'number' ? rawParams.backgroundIntensity : undefined;
  const environmentTexture = typeof config?.environmentTexture === 'string' && config.environmentTexture
    ? config.environmentTexture
    : rawParams?.environmentFromBackground === true
      ? config?.backgroundTexture
      : undefined;
  const environmentIntensity = typeof rawParams?.environmentIntensity === 'number' ? rawParams.environmentIntensity : 1;
  const lightIntensity = typeof rawParams?.lightIntensity === 'number' && Number.isFinite(rawParams.lightIntensity) ? rawParams.lightIntensity : 1;
  const lights = config?.lights && typeof config.lights === 'object' ? (config.lights as Record<string, unknown>) : undefined;
  const ambientLightColor = typeof lights?.ambientColor === 'string' ? lights.ambientColor : '#ffffff';
  const ambientLightIntensity = typeof lights?.ambientIntensity === 'number'
    ? lights.ambientIntensity
    : lightIntensity;
  const hemisphereSkyColor = typeof lights?.hemisphereSkyColor === 'string' ? lights.hemisphereSkyColor : '#e8eeff';
  const hemisphereGroundColor = typeof lights?.hemisphereGroundColor === 'string' ? lights.hemisphereGroundColor : '#3b4352';
  const hemisphereIntensity = typeof lights?.hemisphereIntensity === 'number'
    ? lights.hemisphereIntensity
    : 0;
  const directionalColor = typeof lights?.directionalColor === 'string' ? lights.directionalColor : '#ffffff';
  const directionalIntensity = typeof lights?.directionalIntensity === 'number'
    ? lights.directionalIntensity
    : 0;
  const directionalPosition = coerceVector(lights?.directionalPosition, [4, 8, 2]);
  const directionalCastShadow = typeof lights?.directionalCastShadow === 'boolean' ? lights.directionalCastShadow : true;
  const directionalShadowMapSize = coercePositiveNumber(lights?.directionalShadowMapSize, 2048);
  const directionalShadowBias = typeof lights?.directionalShadowBias === 'number' ? lights.directionalShadowBias : -0.00015;
  const directionalShadowNormalBias = typeof lights?.directionalShadowNormalBias === 'number'
    ? lights.directionalShadowNormalBias
    : 0.02;
  const directionalShadowCameraSize = coercePositiveNumber(lights?.directionalShadowCameraSize, 18);
  const spotColor = typeof lights?.spotColor === 'string' ? lights.spotColor : '#fff1d6';
  const spotIntensity = typeof lights?.spotIntensity === 'number' ? lights.spotIntensity : 0;
  const spotPosition = coerceVector(lights?.spotPosition, [0, 6, 0]);
  const spotTarget = coerceVector(lights?.spotTarget, [0, 0, 0]);
  const spotAngle = typeof lights?.spotAngle === 'number' ? lights.spotAngle : 0.65;
  const spotPenumbra = typeof lights?.spotPenumbra === 'number' ? lights.spotPenumbra : 0.45;
  const spotDistance = typeof lights?.spotDistance === 'number' ? lights.spotDistance : 40;
  const spotDecay = typeof lights?.spotDecay === 'number' ? lights.spotDecay : 1.5;
  const spotCastShadow = typeof lights?.spotCastShadow === 'boolean' ? lights.spotCastShadow : true;
  const spotShadowMapSize = coercePositiveNumber(lights?.spotShadowMapSize, 2048);
  const spotShadowBias = typeof lights?.spotShadowBias === 'number' ? lights.spotShadowBias : -0.00015;
  const spotShadowNormalBias = typeof lights?.spotShadowNormalBias === 'number' ? lights.spotShadowNormalBias : 0.02;
  const thumbnailCaptureRecord = config?.thumbnailCapture && typeof config.thumbnailCapture === 'object'
    ? (config.thumbnailCapture as Record<string, unknown>)
    : undefined;
  const thumbnailCapture = useMemo<ThumbnailCaptureConfig>(() => {
    return {
      enabled: thumbnailCaptureRecord?.enabled !== false,
      cameraPosition: coerceVector(thumbnailCaptureRecord?.cameraPosition, [-12.5, 11.5, 10.2]),
      target: coerceVector(thumbnailCaptureRecord?.target, [0.6, 1.1, -1.4]),
      fov: typeof thumbnailCaptureRecord?.fov === 'number' ? thumbnailCaptureRecord.fov : 34,
      allowOrbit: thumbnailCaptureRecord?.allowOrbit !== false,
      heightStep: typeof thumbnailCaptureRecord?.heightStep === 'number' ? thumbnailCaptureRecord.heightStep : 0.6,
      autoRotate: thumbnailCaptureRecord?.autoRotate !== false,
      autoRotateSpeed: typeof thumbnailCaptureRecord?.autoRotateSpeed === 'number' ? thumbnailCaptureRecord.autoRotateSpeed : 0.35,
      showHint: thumbnailCaptureRecord?.showHint === true,
      fps: typeof thumbnailCaptureRecord?.fps === 'number' ? thumbnailCaptureRecord.fps : 30,
      mimeType: typeof thumbnailCaptureRecord?.mimeType === 'string' ? thumbnailCaptureRecord.mimeType : 'video/webm;codecs=vp9',
      bitsPerSecond:
        typeof thumbnailCaptureRecord?.bitsPerSecond === 'number' ? thumbnailCaptureRecord.bitsPerSecond : 6_000_000,
      filename:
        typeof thumbnailCaptureRecord?.filename === 'string' ? thumbnailCaptureRecord.filename : 'thumbnail_capture.webm',
      preset: typeof thumbnailCaptureRecord?.preset === 'string' ? thumbnailCaptureRecord.preset : undefined
    };
  }, [thumbnailCaptureRecord]);
  const thumbnailModeActive = getBooleanFromQuery('thumbnailMode') || getBooleanFromQuery('recordThumb');
  const debugLoading = getBooleanFromQuery('debugLoading') || getBooleanFromQuery('loadingDebug');
  const thumbnailBackgroundColor = thumbnailModeActive
    ? typeof thumbnailCaptureRecord?.backgroundColor === 'string'
      ? thumbnailCaptureRecord.backgroundColor
      : '#c8ced6'
    : typeof config?.backgroundColor === 'string'
      ? config.backgroundColor
      : undefined;
  const [collider, setCollider] = useState<Mesh | null>(null);
  const [visitorInstance, setVisitorInstance] = useState<Visitor | null>(null);
  const {
    sceneVersion,
    sceneLoadArmed,
    sceneReadyForVisitor,
    visitorEntryReady,
    timedOut,
    handleSceneReady
  } = useSceneReadiness({
    transitionId,
    configUrl,
    modelPath,
    useProceduralRoom,
    collider,
    visitor: visitorInstance,
    thumbnailModeActive,
    loading,
    error,
    debugLoading,
    onVisitorEntered
  });
  const dynamicActorsRef = useRef<Map<string, { object: Object3D; radius: number }>>(new Map());
  const physicsConfig = useMemo<PhysicsConfig | undefined>(() => {
    if (!config?.physics || typeof config.physics !== 'object') return undefined;
    const record = config.physics as Record<string, unknown>;
    const mapped: PhysicsConfig = {
      enabled: record.enabled !== false,
      iterations: typeof record.iterations === 'number' && Number.isFinite(record.iterations) ? record.iterations : 2
    };
    if (record.actors && typeof record.actors === 'object') {
      mapped.actors = {};
      for (const [id, value] of Object.entries(record.actors as Record<string, unknown>)) {
        if (!value || typeof value !== 'object') continue;
        const actor = value as Record<string, unknown>;
        mapped.actors[id] = {
          enabled: actor.enabled !== false,
          radius: typeof actor.radius === 'number' ? actor.radius : undefined,
          mass: typeof actor.mass === 'number' ? actor.mass : undefined,
          pushable: typeof actor.pushable === 'boolean' ? actor.pushable : undefined
        };
      }
    }
    if (Array.isArray(record.pairs)) {
      mapped.pairs = (record.pairs as Array<Record<string, unknown>>)
        .map((pair) => {
          const a = typeof pair.a === 'string' ? pair.a : '';
          const b = typeof pair.b === 'string' ? pair.b : '';
          if (!a || !b) return null;
          return { a, b, enabled: pair.enabled !== false };
        })
        .filter((pair): pair is { a: string; b: string; enabled: boolean } => pair !== null);
    }
    return mapped;
  }, [config?.physics]);
  const handleProceduralActorRef = useCallback((id: string, object: Object3D | null, radius: number) => {
    if (!object) {
      dynamicActorsRef.current.delete(id);
      return;
    }
    dynamicActorsRef.current.set(id, { object, radius });
  }, []);

  const {
    linkMap,
    imagesMeta,
    videosMeta,
    videosInteraction,
    sculpturesMeta,
    showLegacyModal
  } = useSceneInteractionMetadata(config);

  const isIPadLike = useMemo(() => detectIPadLikeDevice(), []);
  const configPerformanceMode = rawParams?.performanceMode === true || rawParams?.lowQuality === true;
  const forceLowQuality = getBooleanFromQuery('lowQuality') || getBooleanFromQuery('performance') || configPerformanceMode;
  const highQualityMode = !isIPadLike && !forceLowQuality;
  const configuredMaxDpr =
    typeof rawParams?.maxDpr === 'number' && Number.isFinite(rawParams.maxDpr)
      ? Math.max(0.5, Math.min(2, rawParams.maxDpr))
      : undefined;
  const effectiveMaxDpr = configuredMaxDpr ?? (highQualityMode ? 2 : 1);
  const useLogDepth = !isIPadLike && rawParams?.logarithmicDepthBuffer !== false && rawParams?.logDepth !== false;
  const useAntialias = rawParams?.antialias !== false && highQualityMode;
  const useShadows = rawParams?.shadows !== false && !isIPadLike && highQualityMode;

  const [renderer, setRenderer] = useState<WebGLRenderer | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const { isVideoPlayerModalOpen, isMaterialModalOpen } = useModalInteractionState();
  const handleCanvasCreated = useCallback((state: RootState) => {
    setRenderer(state.gl);
  }, []);

  useEffect(() => {
    const canvas = renderer?.domElement;
    if (!canvas) return undefined;
    const handleLost = (event: globalThis.Event) => {
      event.preventDefault();
      setContextLost(true);
    };
    const handleRestored = () => onRetry();
    canvas.addEventListener('webglcontextlost', handleLost);
    canvas.addEventListener('webglcontextrestored', handleRestored);
    return () => {
      canvas.removeEventListener('webglcontextlost', handleLost);
      canvas.removeEventListener('webglcontextrestored', handleRestored);
    };
  }, [onRetry, renderer]);

  const {
    audioConfig,
    audioControlLabels,
    xrIntroAudioIds,
    subtitleLanguageOptions,
    subtitleLanguage,
    setSubtitleLanguage,
    audioFloorRoutes,
    applyAudioFloorRoute
  } = useSceneAudioRouting(config);
  const {
    xrSupported,
    xrSessionActive,
    xrError,
    requestVrSession,
    exitVrSession
  } = useXrSessionControls({
    renderer,
    introAudioIds: xrIntroAudioIds
  });

  const lightDefaults = useMemo<Omit<SceneLightSettings, 'transitionSeconds'>>(() => ({
    ambientColor: ambientLightColor,
    ambientIntensity: ambientLightIntensity,
    hemisphereSkyColor,
    hemisphereGroundColor,
    hemisphereIntensity,
    directionalColor,
    directionalIntensity,
    directionalPosition,
    directionalCastShadow,
    directionalShadowMapSize,
    directionalShadowBias,
    directionalShadowNormalBias,
    directionalShadowCameraSize,
    spotColor,
    spotIntensity,
    spotPosition,
    spotTarget,
    spotAngle,
    spotPenumbra,
    spotDistance,
    spotDecay,
    spotCastShadow,
    spotShadowMapSize,
    spotShadowBias,
    spotShadowNormalBias
  }), [
    ambientLightColor,
    ambientLightIntensity,
    directionalCastShadow,
    directionalColor,
    directionalIntensity,
    directionalPosition,
    directionalShadowBias,
    directionalShadowCameraSize,
    directionalShadowMapSize,
    directionalShadowNormalBias,
    hemisphereGroundColor,
    hemisphereIntensity,
    hemisphereSkyColor,
    spotAngle,
    spotCastShadow,
    spotColor,
    spotDecay,
    spotDistance,
    spotIntensity,
    spotPenumbra,
    spotPosition,
    spotShadowBias,
    spotShadowMapSize,
    spotShadowNormalBias,
    spotTarget
  ]);
  const {
    lightZoneRoutes,
    setActiveLightZone,
    activeRendererParams,
    lightRigSettings
  } = useSceneLightZones({
    config,
    rawParams,
    toneMappingName,
    defaults: lightDefaults
  });
  const videosConfig = useSceneVideoConfig(config);

  useEffect(() => {
    if (!modelPath && !useProceduralRoom) {
      setCollider(null);
    }
  }, [modelPath, useProceduralRoom]);

  const sceneInteractionsLocked = !sceneReadyForVisitor || isVideoPlayerModalOpen || isMaterialModalOpen;
  const missingSceneDefinition = Boolean(config) && !loading && !error && !modelPath && !useProceduralRoom;

  return (
    <div className="relative h-full w-full bg-gallery-dark">
      <Canvas
        shadows={useShadows}
        camera={{ position: [10, 6, -10], fov: 60, near: 0.1, far: 2000 }}
        dpr={typeof window !== 'undefined' ? [1, Math.min(effectiveMaxDpr, window.devicePixelRatio || 1)] : [1, effectiveMaxDpr]}
        gl={{
          antialias: useAntialias,
          alpha: false,
          powerPreference: highQualityMode ? 'high-performance' : 'low-power',
          logarithmicDepthBuffer: useLogDepth,
          stencil: false
        }}
        onCreated={handleCanvasCreated}
      >
        <RendererTuning highQualityMode={highQualityMode} maxDpr={effectiveMaxDpr} params={activeRendererParams} />
        <SceneBackground
          textureUrl={config?.backgroundTexture}
          blurriness={backgroundBlurriness}
          intensity={backgroundIntensity}
          fallbackColorHex={thumbnailBackgroundColor}
        />
        <SceneEnvironment textureUrl={environmentTexture} intensity={environmentIntensity} />
        <SceneLightRig settings={lightRigSettings} />


        <Suspense fallback={null}>
          {!sceneLoadArmed ? null : modelPath ? (
            <ExhibitModel
              modelPath={modelPath}
              position={position}
              rotation={rotation}
              scale={scale}
              onColliderReady={setCollider}
              onSceneReady={handleSceneReady}
              videosConfig={videosConfig}
              objectRegistry={objectRegistry}
              lifecycleId={transitionId}
            />
          ) : useProceduralRoom ? (
            <GeneratedExhibitScene
              roomSpec={proceduralRoom}
              models={proceduralModels}
              objects={proceduralObjects}
              roomBounds={proceduralRoomBounds}
              visitor={visitorInstance}
              onActorRef={handleProceduralActorRef}
              position={position}
              rotation={rotation}
              scale={scale}
              onColliderReady={setCollider}
              onSceneReady={handleSceneReady}
              objectRegistry={objectRegistry}
            />
          ) : (
            <Html center className="text-white">Missing modelPath or proceduralRoom in config</Html>
          )}
        </Suspense>

        {DEBUG_COLLIDER && collider ? <primitive object={collider} /> : null}

        <OrbitControls
          makeDefault
          enabled={!sceneInteractionsLocked}
          enableDamping={thumbnailModeActive}
          dampingFactor={0.02}
          autoRotate={thumbnailModeActive && thumbnailCapture.autoRotate}
          autoRotateSpeed={thumbnailCapture.autoRotateSpeed}
          enablePan={thumbnailModeActive}
          enableZoom={thumbnailModeActive}
          rotateSpeed={orbitRotateSpeed}
          minDistance={thumbnailModeActive ? 2 : 1e-4}
          maxDistance={thumbnailModeActive ? 80 : 1e-4}
          maxPolarAngle={Math.PI}
        />
        <PointerInteractions
          visitor={sceneReadyForVisitor ? visitorInstance : null}
          collider={collider}
          disabled={sceneInteractionsLocked}
          onCloseSidebar={onRequestSidebarClose}
          popupCallback={(payload) => {
            if (payload.type === 'Image') {
              showLegacyModal({
                ...payload.userData,
                name: payload.key
              });
            }
          }}
          links={linkMap}
          imagesMeta={imagesMeta}
          videosMeta={videosMeta}
          videosInteraction={videosInteraction}
          sculpturesMeta={sculpturesMeta}
          objectRegistry={objectRegistry}
        />
        <ObjectHoldRotation
          enabled={!sceneInteractionsLocked}
          objectRegistry={objectRegistry}
        />
        <FirstPersonController
          collider={collider}
          params={controllerParams}
          enabled={!thumbnailModeActive && visitorEntryReady}
          interactionLocked={sceneInteractionsLocked}
          onVisitorReady={setVisitorInstance}
          onVisitorActivity={onVisitorActivity}
        />
        <VisitorSpatialSensor
          visitor={sceneReadyForVisitor ? visitorInstance : null}
          audioRoutes={audioFloorRoutes}
          lightRoutes={lightZoneRoutes}
          sceneVersion={sceneVersion}
          onAudioRouteChange={applyAudioFloorRoute}
          onLightRouteChange={setActiveLightZone}
        />
        <ScenePhysics
          config={physicsConfig}
          visitor={visitorInstance}
          actorRefs={dynamicActorsRef}
          onCollision={onPhysicsCollision}
        />
        <ThumbnailRecorderMode config={thumbnailCapture} active={thumbnailModeActive} />
        <AudioSystem
          audioConfig={audioConfig}
          ready={sceneReadyForVisitor}
          sceneVersion={sceneVersion}
          objectRegistry={objectRegistry}
        />
        <XrAudioSubtitlePanel tracks={audioConfig} language={xrSessionActive ? null : subtitleLanguage} />
        <AutoExposureControl params={activeRendererParams} />
      </Canvas>
      <AudioPlayerControls
        labelPlaying={audioControlLabels?.labelPlaying}
        labelPaused={audioControlLabels?.labelPaused}
        subtitleLanguages={subtitleLanguageOptions}
        subtitleLanguage={subtitleLanguage}
        onSubtitleLanguageChange={(language) => setSubtitleLanguage(language)}
      />
      <AudioSubtitles tracks={audioConfig} language={xrSessionActive ? null : subtitleLanguage} />
      <OnscreenJoystick visitor={sceneReadyForVisitor ? visitorInstance : null} />
      <SceneLoadingOverlay
        visible={!thumbnailModeActive && !missingSceneDefinition && !timedOut && !contextLost && (!sceneLoadArmed || !sceneReadyForVisitor)}
        label={sceneLoadArmed ? 'Loading exhibit' : 'Preparing exhibit'}
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-white bg-black/40">
          Loading configuration…
        </div>
      )}
      {error && (
        <SceneFailureOverlay
          title="The exhibit configuration could not be loaded"
          message={error.message}
          onRetry={onRetry}
        />
      )}
      {!error && (timedOut || contextLost) && (
        <SceneFailureOverlay
          title={contextLost ? 'The 3D renderer stopped responding' : 'This exhibit is taking too long to initialise'}
          message={contextLost ? 'Graphics resources will be recreated.' : 'An essential model or collider did not become ready.'}
          onRetry={onRetry}
        />
      )}
      {!error && missingSceneDefinition && (
        <SceneFailureOverlay
          title="The exhibit has no scene to display"
          message="The configuration does not define a model or procedural room."
          onRetry={onRetry}
        />
      )}
      {xrSupported && (
        <div className="absolute bottom-4 inset-x-0 flex flex-col items-center gap-2 text-white text-center">
          <button
            type="button"
            className="rounded-lg border border-white/40 bg-slate-900/70 px-4 py-2 text-sm font-semibold shadow-lg backdrop-blur-sm transition hover:bg-slate-800/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={xrSessionActive ? exitVrSession : requestVrSession}
            disabled={!renderer}
          >
            {xrSessionActive ? 'Exit VR' : 'Enter VR'}
          </button>
          {xrError ? (
            <p className="max-w-[16rem] rounded-md bg-red-900/70 px-3 py-1 text-xs text-red-100 shadow-lg">
              {xrError}
            </p>
          ) : (
            <p className="text-xs text-white/70">VR headset detected</p>
          )}
        </div>
      )}
    </div>
  );
}

export function R3FViewer(props: R3FViewerProps) {
  const [attempt, setAttempt] = useState(0);
  const [sceneError, setSceneError] = useState<Error | null>(null);
  const [failurePreview, setFailurePreview] = useState(() => getBooleanFromQuery('previewSceneFailure'));
  const transitionId = useMemo(
    () => createTransitionId(props.configUrl, attempt),
    [props.configUrl, attempt]
  );
  const retryModelPath = props.config?.modelPath;
  const retryConfig = props.onRetryConfig;
  const retry = useCallback(() => {
    if (retryModelPath) clearConfiguredGLTF(retryModelPath);
    setSceneError(null);
    setFailurePreview(false);
    setAttempt((value) => value + 1);
    retryConfig?.();
  }, [retryConfig, retryModelPath]);

  useEffect(() => {
    setSceneError(null);
  }, [props.configUrl]);

  return (
    <MaterialModalProvider>
      <SceneErrorBoundary key={transitionId} onError={setSceneError}>
        <R3FViewerInner key={transitionId} {...props} transitionId={transitionId} onRetry={retry} />
      </SceneErrorBoundary>
      {(sceneError || failurePreview) && (
        <SceneFailureOverlay
          title="The exhibit could not be initialised"
          message={sceneError?.message || 'Failure preview: this deliberately long diagnostic area can scroll independently while the Retry exhibit button remains fixed, visible, keyboard-focusable, and accessible on small screens. Use Retry exhibit to dismiss this preview and continue into the exhibition.'}
          onRetry={retry}
        />
      )}
    </MaterialModalProvider>
  );
}

export default R3FViewer;

function VisitorSpatialSensor({
  visitor,
  audioRoutes,
  lightRoutes,
  sceneVersion,
  onAudioRouteChange,
  onLightRouteChange,
  onFloorChange
}: {
  visitor: Visitor | null;
  audioRoutes: AudioFloorRoute[];
  lightRoutes: LightZoneRoute[];
  sceneVersion: number;
  onAudioRouteChange: (route: AudioFloorRoute) => void;
  onLightRouteChange: (route: LightZoneRoute) => void;
  onFloorChange?: (floor: Object3D | null) => void;
}) {
  const { scene } = useThree();
  const activeAudioRouteKeyRef = useRef<string | null>(null);
  const activeLightRouteKeyRef = useRef<string | null>(null);
  const activeFloorKeyRef = useRef<string | null>(null);
  const lastSamplePositionRef = useRef<Vector3 | null>(null);

  const spatialCache = useMemo(() => {
    void sceneVersion;
    const audioRouteBySurface = new Map<string, AudioFloorRoute>();
    const lightRouteBySurface = new Map<string, LightZoneRoute>();

    audioRoutes.forEach((route) => {
      route.surfaces.forEach((surfaceName) => audioRouteBySurface.set(surfaceName, route));
    });
    lightRoutes.forEach((route) => {
      route.surfaces.forEach((surfaceName) => lightRouteBySurface.set(surfaceName, route));
    });

    const floors: FloorSpatialCandidate[] = [];
    const audioZones: RouteSpatialCandidate<AudioFloorRoute>[] = [];
    const lightZones: RouteSpatialCandidate<LightZoneRoute>[] = [];

    scene.updateMatrixWorld(true);
    scene.traverse((object) => {
      const names = getSurfaceRouteNames(object);
      const floorSurface = isVisitorLocationSurface(object);
      const audioRoute = names.length > 0 ? findMappedRoute(names, audioRouteBySurface) : undefined;
      const lightRoute = names.length > 0 ? findMappedRoute(names, lightRouteBySurface) : undefined;
      if (!floorSurface && !audioRoute && !lightRoute) return;

      const box = new Box3().setFromObject(object);
      if (box.isEmpty()) return;
      const base = createSpatialCandidateBase(box);

      if (floorSurface) {
        floors.push({
          ...base,
          floor: object,
          floorKey: object.uuid
        });
      }
      if (audioRoute) {
        audioZones.push({
          ...base,
          route: audioRoute,
          routeKey: audioFloorRouteKey(audioRoute)
        });
      }
      if (lightRoute) {
        lightZones.push({
          ...base,
          route: lightRoute,
          routeKey: surfaceZoneRouteKey(lightRoute)
        });
      }
    });

    return { floors, audioZones, lightZones };
  }, [audioRoutes, lightRoutes, scene, sceneVersion]);

  useEffect(() => {
    activeAudioRouteKeyRef.current = null;
    activeLightRouteKeyRef.current = null;
    activeFloorKeyRef.current = null;
    lastSamplePositionRef.current = null;
  }, [sceneVersion, spatialCache]);

  useFrame(() => {
    if (!visitor) return;
    const position = visitor.position;
    const lastPosition = lastSamplePositionRef.current;
    if (lastPosition && lastPosition.distanceToSquared(position) < 0.0025) {
      return;
    }
    if (!lastPosition) {
      lastSamplePositionRef.current = position.clone();
    } else {
      lastPosition.copy(position);
    }

    const activeFloor = pickBestSpatialCandidate(spatialCache.floors, position);
    const nextFloorKey = activeFloor?.floorKey ?? null;
    if (nextFloorKey !== activeFloorKeyRef.current) {
      activeFloorKeyRef.current = nextFloorKey;
      onFloorChange?.(activeFloor?.floor ?? null);
    }

    const activeAudioRoute = pickBestSpatialCandidate(spatialCache.audioZones, position);
    if (activeAudioRoute && activeAudioRoute.routeKey !== activeAudioRouteKeyRef.current) {
      activeAudioRouteKeyRef.current = activeAudioRoute.routeKey;
      onAudioRouteChange(activeAudioRoute.route);
    }

    const activeLightRoute = pickBestSpatialCandidate(spatialCache.lightZones, position);
    if (activeLightRoute && activeLightRoute.routeKey !== activeLightRouteKeyRef.current) {
      activeLightRouteKeyRef.current = activeLightRoute.routeKey;
      onLightRouteChange(activeLightRoute.route);
    }
  });

  return null;
}

function AudioSystem({
  audioConfig,
  ready,
  sceneVersion,
  objectRegistry
}: {
  audioConfig: AudioMeshConfig[] | undefined;
  ready: boolean;
  sceneVersion: number;
  objectRegistry?: ObjectRegistry;
}) {
  const { camera, controls: orbitControls, gl, scene } = useThree();
  const listener = useMemo(() => new AudioListener(), []);
  const controls = orbitControls as OrbitControlsImpl | undefined;
  const transform = useMemo(() => {
    const ctrl = new TransformControls(camera, gl.domElement);
    ctrl.enabled = false;
    ctrl.setSize(0.1);
    const helper = ctrl.getHelper?.();
    if (helper) {
      helper.visible = false;
    }
    return ctrl;
  }, [camera, gl]);
  const helper = useMemo(() => {
    return typeof transform.getHelper === 'function' ? transform.getHelper() : null;
  }, [transform]);

  useEffect(() => {
    camera.add(listener);
    return () => {
      camera.remove(listener);
    };
  }, [camera, listener]);

  useEffect(() => {
    if (!helper) return;
    helper.visible = false;
    if (helper.parent !== scene) {

      scene.add(helper);

    }
    return () => {
      transform.detach();
      if (helper.parent === scene) {
        scene.remove(helper);
      }
      transform.dispose?.();
    };
  }, [helper, scene, transform]);

  useEffect(() => {
    if (!controls) return;
    type DraggingChangedEvent = TransformControlsEventMap['dragging-changed'] & Event<'dragging-changed', TransformControls>;
    const handleDraggingChange = (event: DraggingChangedEvent) => {
      const isDragging = event.value === true;
      controls.enabled = !isDragging;
    };
    transform.addEventListener('dragging-changed', handleDraggingChange);
    return () => {
      transform.removeEventListener('dragging-changed', handleDraggingChange);
      controls.enabled = true;
    };
  }, [controls, transform]);

  useEffect(() => {
    if (!ready || !audioConfig || audioConfig.length === 0) {
      transform.detach();
      transform.enabled = false;
      if (helper) {
        helper.visible = false;
      }
      return;
    }

    transform.enabled = false;
    if (helper) {
      helper.visible = false;
    }

    return () => {
      transform.detach();
      transform.enabled = false;
      if (helper) {
        helper.visible = false;
      }
    };
  }, [audioConfig, ready, transform, helper]);

  if (!ready || !audioConfig || audioConfig.length === 0) {
    return null;
  }

  return (
    <AudioMeshes
      audioConfig={audioConfig}
      listener={listener}
      transform={transform}
      ready={ready}
      sceneVersion={sceneVersion}
      objectRegistry={objectRegistry}
    />
  );
}
