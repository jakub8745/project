import { Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import type { RootState } from '@react-three/fiber';
import { Html, Loader, OrbitControls } from '@react-three/drei';
import type { Event, Vector3Tuple } from 'three';
import {
  AudioListener,
  BufferGeometry,
  BoxGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Euler,
  Vector3,
  Mesh,
  Group,
  Material,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  WebGLRenderTarget,
  Object3D,
  NeutralToneMapping,
  PCFSoftShadowMap,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  EquirectangularReflectionMapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SpotLight
} from 'three';
import type { WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { StaticGeometryGenerator, MeshBVH, acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import Visitor from '../modules/Visitor.js';
import Robot from '../modules/Robot.js';
import { PhysicsSystem, type PhysicsConfig, type PhysicsRuntimeActor } from '../modules/physicsSystem';
import { useExhibitConfig } from './useExhibitConfig';
import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { TransformControlsEventMap } from 'three/examples/jsm/controls/TransformControls.js';
import type { VisitorParams } from '../modules/Visitor.js';
import { PointerInteractions } from './PointerInteractions';
import { applyVideoMeshes, disposeAllVideoMeshes, type VideoMeshConfig } from '../modules/applyVideoMeshes.js';
import { useLegacyModal, type LegacyImageMap } from './useLegacyModal';
import { MaterialModalProvider } from './Modal';
import type { AudioMeshConfig } from '../modules/audioMeshManager.ts';
import { AudioMeshes } from './AudioMeshes';
import { AudioPlayerControls } from './AudioPlayerControls';
import { getKtx2Loader } from '../loaders/ktx2Loader';
import { OnscreenJoystick } from './OnscreenJoystick';

BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast;

const DEBUG_COLLIDER = false;
const DEFAULT_BACKGROUND = '#111827';

let sharedDracoLoader: DRACOLoader | null = null;
let sharedLoaderUsers = 0;
const ktx2SupportedRenderers = new WeakSet<WebGLRenderer>();

type XRSessionConstructor = { new (...args: unknown[]): XRSession };
type XRWebGLBindingConstructor = { new (...args: unknown[]): unknown };

function temporarilyDisableXRWebGLBinding(session: XRSession | null) {
  if (typeof globalThis === 'undefined' || !session) {
    return null;
  }
  const globalWithXR = globalThis as typeof globalThis & {
    XRWebGLBinding?: XRWebGLBindingConstructor;
    XRSession?: XRSessionConstructor;
  };
  const originalBinding = globalWithXR.XRWebGLBinding;
  if (typeof originalBinding !== 'function') {
    return null;
  }

  const sessionCtor = globalWithXR.XRSession;
  let shouldDisable = false;
  if (typeof sessionCtor === 'function') {
    try {
      shouldDisable = !(session instanceof sessionCtor);
    } catch {
      shouldDisable = true;
    }
  } else {
    shouldDisable = true;
  }

  if (!shouldDisable) {
    return null;
  }

  globalWithXR.XRWebGLBinding = undefined;
  return () => {
    globalWithXR.XRWebGLBinding = originalBinding;
  };
}

function ensureKtx2Support(renderer: WebGLRenderer) {
  if (ktx2SupportedRenderers.has(renderer)) return;
  try {
    getKtx2Loader(renderer).detectSupport(renderer);
    ktx2SupportedRenderers.add(renderer);
  } catch (err) {
    console.warn('KTX2 detectSupport failed:', err);
  }
}

function acquireSharedLoaders(renderer: WebGLRenderer) {
  sharedLoaderUsers += 1;
  if (!sharedDracoLoader) {
    sharedDracoLoader = new DRACOLoader().setDecoderPath('/libs/draco/');
  }
  ensureKtx2Support(renderer);
  return {
    draco: sharedDracoLoader,
    ktx2: getKtx2Loader(renderer) as KTX2Loader
  };
}

function releaseSharedLoaders() {
  sharedLoaderUsers = Math.max(0, sharedLoaderUsers - 1);
  if (sharedLoaderUsers === 0) {
    sharedDracoLoader?.dispose?.();
    sharedDracoLoader = null;
  }
}

interface R3FViewerProps {
  configUrl: string | null;
  onRequestSidebarClose?: () => void;
  onVisitorActivity?: () => void;
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

function getBooleanFromQuery(name: string): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  const value = params.get(name);
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function createPatternTexture(
  type: 'chevrons' | 'carpet',
  width = 1024,
  height = 1024
): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  if (type === 'chevrons') {
    ctx.fillStyle = '#d9d1c4';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(120, 105, 90, 0.5)';
    ctx.lineWidth = 10;
    const step = 120;
    for (let y = -step; y < height + step; y += step) {
      for (let x = -step; x < width + step; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, y + step / 2);
        ctx.lineTo(x + step / 2, y);
        ctx.lineTo(x + step, y + step / 2);
        ctx.stroke();
      }
    }
  } else {
    ctx.fillStyle = '#3b2f2b';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(188, 141, 93, 0.2)';
    const band = 64;
    for (let y = 0; y < height; y += band * 2) {
      ctx.fillRect(0, y, width, band);
    }

    ctx.strokeStyle = 'rgba(231, 199, 154, 0.35)';
    ctx.lineWidth = 4;
    for (let x = 0; x < width; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function useConfiguredGLTFs(paths: string[]): GLTF[] {
  const gl = useThree((state) => state.gl);

  const loaders = useMemo(() => acquireSharedLoaders(gl), [gl]);

  useEffect(() => {
    return () => {
      releaseSharedLoaders();
    };
  }, [loaders]);

  const gltfResults = useLoader(
    GLTFLoader,
    paths,
    (loader: GLTFLoader) => {
      loader.setDRACOLoader(loaders.draco!);
      loader.setKTX2Loader(loaders.ktx2!);
      loader.setMeshoptDecoder(MeshoptDecoder);
      return loader;
    }
  ) as GLTF | GLTF[];

  return Array.isArray(gltfResults) ? gltfResults : [gltfResults];
}

function cloneTransparentMaterial(material: Material): Material {
  const cloned = material.clone();
  cloned.transparent = true;
  cloned.opacity = 0;
  cloned.depthWrite = false;
  if ('colorWrite' in cloned) {
    cloned.colorWrite = false;
  }
  return cloned;
}

function enableMaterialDithering(material: Material) {
  material.dithering = true;
}

function ExhibitModel({
  modelPath,
  interactivesPath,
  position,
  rotation,
  scale,
  onColliderReady,
  onSceneReady,
  videosConfig
}: {
  modelPath: string;
  interactivesPath?: string;
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  scale: number;
  onColliderReady?: (collider: Mesh | null) => void;
  onSceneReady?: () => void;
  videosConfig?: VideoMeshConfig[];
}) {
  const loadTargets = useMemo(() => {
    const targets = [modelPath];
    if (interactivesPath) {
      targets.push(interactivesPath);
    }
    return targets;
  }, [interactivesPath, modelPath]);

  const gltfResults = useConfiguredGLTFs(loadTargets);
  const mainGltf = gltfResults[0] as GLTF | undefined;
  const interactivesGltf = gltfResults[1] as GLTF | undefined;
  const camera = useThree((state) => state.camera);

  type InteractiveMesh = Mesh & { interactive?: boolean };

  const { displayScene, collider } = useMemo(() => {
    if (!mainGltf?.scene) {
      const emptyResult: { displayScene: Group | null; collider: Mesh | null } = {
        displayScene: null,
        collider: null
      };
      return emptyResult;
    }

    const display = mainGltf.scene.clone(true) as Group;
    display.name = 'r3f-display-root';
    display.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        if (Array.isArray(object.material)) {
          object.material.forEach((mat) => enableMaterialDithering(mat));
        } else if (object.material) {
          enableMaterialDithering(object.material);
        }
      }
    });

    if (interactivesGltf?.scene) {
      const interactives = interactivesGltf.scene.clone(true);
      interactives.name = 'r3f-interactives-layer';
      interactives.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const mesh = object as InteractiveMesh;
        if (mesh.userData?.type === 'Video') {
          // Preserve original material for video surfaces; applyVideoMeshes will swap it later.
          mesh.interactive = true;
          mesh.userData.interactive = true;
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          return;
        }
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.interactive = true;
        mesh.userData.interactive = true;
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((mat) => cloneTransparentMaterial(mat));
        } else if (mesh.material) {
          mesh.material = cloneTransparentMaterial(mesh.material);
        }
      });
      display.add(interactives);
    }

    const colliderSource = display.clone(true);
    colliderSource.updateMatrixWorld(true);
    const staticGen = new StaticGeometryGenerator(colliderSource);
    staticGen.attributes = ['position', 'normal'];
    const merged = staticGen.generate();
    merged.boundsTree = new MeshBVH(merged);
    const colliderMesh = new Mesh(merged);
    colliderMesh.name = 'r3f-collider';
    colliderMesh.visible = DEBUG_COLLIDER;

    const [px, py, pz] = position;
    const [rx, ry, rz] = rotation;
    colliderMesh.position.set(px, py, pz);
    colliderMesh.rotation.set(rx, ry, rz);
    colliderMesh.scale.setScalar(scale);

    if (DEBUG_COLLIDER) {
      colliderMesh.material = new MeshBasicMaterial({
        color: 0x00ffff,
        wireframe: true,
        transparent: true,
        opacity: 0.2
      });
      colliderMesh.renderOrder = 999;
    }

    colliderMesh.updateMatrixWorld(true);

    return { displayScene: display, collider: colliderMesh };
  }, [interactivesGltf, mainGltf, position, rotation, scale]);

  useEffect(() => {
    onColliderReady?.(collider);
    if (displayScene) {
      onSceneReady?.();
    }
    return () => {
      onColliderReady?.(null);
      collider?.geometry?.dispose?.();
    };
  }, [collider, displayScene, onColliderReady, onSceneReady]);

  useEffect(() => {
    if (!displayScene || !videosConfig || videosConfig.length === 0) {
      disposeAllVideoMeshes();
      return;
    }
    applyVideoMeshes(displayScene, camera, { videos: videosConfig });
    return () => {
      disposeAllVideoMeshes();
    };
  }, [camera, displayScene, videosConfig]);

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

type ProceduralRoomSpec = Record<string, unknown> | undefined;
type ProceduralRoomBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};
type ProceduralModelAnimationSpec = {
  swayAngle: number;
  swaySpeed: number;
  driftDistance: number;
  driftSpeed: number;
  bobDistance: number;
  bobSpeed: number;
  collisionAware: boolean;
  speed: number;
  boundaryPadding: number;
  turnJitter: number;
  direction: [number, number];
};
type ProceduralModelSpec = {
  id?: string;
  path: string;
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  scale: number;
  collisionRadius: number;
  animation?: ProceduralModelAnimationSpec;
};
type ProceduralActorRefCallback = (id: string, object: Group | null, radius: number) => void;

function AnimatedProceduralModel({
  model,
  sceneRoot,
  roomBounds,
  collider,
  visitor,
  modelRefs,
  modelIndex,
  onActorRef
}: {
  model: ProceduralModelSpec;
  sceneRoot: Group;
  roomBounds?: ProceduralRoomBounds;
  collider: Mesh | null;
  visitor: Visitor | null;
  modelRefs: MutableRefObject<Map<number, Group>>;
  modelIndex: number;
  onActorRef?: ProceduralActorRefCallback;
}) {
  const wrapperRef = useRef<Group | null>(null);
  const basePosition = useMemo(() => new Vector3(...model.position), [model.position]);
  const baseRotation = useMemo(() => new Euler(...model.rotation), [model.rotation]);
  const robotRef = useRef<Robot | null>(null);
  const actorId = model.id || `model_${modelIndex}`;
  const moveDir = useRef<Vector3>(new Vector3(1, 0, 0));
  const seeded = useRef(false);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    modelRefs.current.set(modelIndex, wrapper);
    onActorRef?.(actorId, wrapper, model.collisionRadius);
    return () => {
      modelRefs.current.delete(modelIndex);
      onActorRef?.(actorId, null, model.collisionRadius);
    };
  }, [actorId, model.collisionRadius, modelIndex, modelRefs, onActorRef]);

  useEffect(() => {
    if (!model.animation?.collisionAware) {
      robotRef.current = null;
      return;
    }
    const robot = new Robot({
      direction: model.animation.direction,
      speed: model.animation.speed,
      swayAngle: model.animation.swayAngle,
      swaySpeed: model.animation.swaySpeed,
      bobDistance: model.animation.bobDistance,
      bobSpeed: model.animation.bobSpeed,
      turnJitter: model.animation.turnJitter,
      collisionRadius: model.collisionRadius,
      avoidDistance: model.animation.boundaryPadding + 0.5,
      boundaryPadding: model.animation.boundaryPadding,
      basePosition,
      baseRotation: new Vector3(baseRotation.x, baseRotation.y, baseRotation.z)
    });
    robot.attach(wrapperRef.current);
    robotRef.current = robot;
    return () => {
      robotRef.current = null;
    };
  }, [basePosition, baseRotation, model.animation, model.collisionRadius]);

  useFrame(({ clock }, delta) => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !model.animation) return;
    if (model.animation.collisionAware && robotRef.current) {
      const obstacles: Array<{ position: Vector3; radius: number }> = [];
      for (const [index, ref] of modelRefs.current.entries()) {
        if (index === modelIndex || !ref) continue;
        obstacles.push({ position: ref.position, radius: model.collisionRadius });
      }
      robotRef.current.update(delta, {
        collider,
        visitor,
        obstacles,
        roomBounds: roomBounds || null
      });
      return;
    }
    const t = clock.getElapsedTime();
    const {
      swayAngle,
      swaySpeed,
      driftDistance,
      driftSpeed,
      bobDistance,
      bobSpeed,
      collisionAware,
      speed,
      boundaryPadding,
      turnJitter,
      direction
    } = model.animation;

    if (collisionAware && roomBounds) {
      if (!seeded.current) {
        const [dx, dz] = direction;
        moveDir.current.set(dx, 0, dz);
        if (moveDir.current.lengthSq() < 1e-6) {
          moveDir.current.set(Math.random() > 0.5 ? 1 : -1, 0, Math.random() * 2 - 1);
        }
        moveDir.current.normalize();
        seeded.current = true;
      }

      let nextX = wrapper.position.x + moveDir.current.x * speed * delta;
      let nextZ = wrapper.position.z + moveDir.current.z * speed * delta;
      let collided = false;

      const minX = roomBounds.minX + boundaryPadding;
      const maxX = roomBounds.maxX - boundaryPadding;
      const minZ = roomBounds.minZ + boundaryPadding;
      const maxZ = roomBounds.maxZ - boundaryPadding;

      if (nextX <= minX || nextX >= maxX) {
        moveDir.current.x *= -1;
        collided = true;
        nextX = Math.max(minX, Math.min(maxX, nextX));
      }
      if (nextZ <= minZ || nextZ >= maxZ) {
        moveDir.current.z *= -1;
        collided = true;
        nextZ = Math.max(minZ, Math.min(maxZ, nextZ));
      }

      if (collided && turnJitter > 0) {
        const jitter = (Math.random() * 2 - 1) * turnJitter;
        const c = Math.cos(jitter);
        const s = Math.sin(jitter);
        const x = moveDir.current.x;
        const z = moveDir.current.z;
        moveDir.current.x = x * c - z * s;
        moveDir.current.z = x * s + z * c;
        moveDir.current.normalize();
      }

      wrapper.position.x = nextX;
      wrapper.position.z = nextZ;
      wrapper.position.y = basePosition.y + Math.sin(t * bobSpeed) * bobDistance;
      wrapper.rotation.y = baseRotation.y + Math.atan2(moveDir.current.x, moveDir.current.z);
    } else {
      wrapper.position.x = basePosition.x + Math.sin(t * driftSpeed) * driftDistance;
      wrapper.position.y = basePosition.y + Math.sin(t * bobSpeed) * bobDistance;
      wrapper.position.z = basePosition.z;
      wrapper.rotation.y = baseRotation.y;
    }

    wrapper.rotation.x = baseRotation.x;
    wrapper.rotation.z = baseRotation.z + Math.sin(t * swaySpeed) * swayAngle;
  });

  return (
    <group ref={wrapperRef} position={basePosition} rotation={baseRotation} scale={model.scale}>
      <primitive object={sceneRoot} dispose={null} />
    </group>
  );
}

function StaticProceduralModel({
  model,
  sceneRoot,
  modelIndex,
  onActorRef
}: {
  model: ProceduralModelSpec;
  sceneRoot: Group;
  modelIndex: number;
  onActorRef?: ProceduralActorRefCallback;
}) {
  const wrapperRef = useRef<Group | null>(null);
  const actorId = model.id || `model_${modelIndex}`;
  const basePosition = useMemo(() => new Vector3(...model.position), [model.position]);
  const baseRotation = useMemo(() => new Euler(...model.rotation), [model.rotation]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    onActorRef?.(actorId, wrapper, model.collisionRadius);
    return () => {
      onActorRef?.(actorId, null, model.collisionRadius);
    };
  }, [actorId, model.collisionRadius, onActorRef]);

  return (
    <group ref={wrapperRef} position={basePosition} rotation={baseRotation} scale={model.scale}>
      <primitive object={sceneRoot} dispose={null} />
    </group>
  );
}

function ProceduralRoomModels({
  models,
  roomBounds,
  collider,
  visitor,
  onActorRef
}: {
  models: ProceduralModelSpec[];
  roomBounds?: ProceduralRoomBounds;
  collider: Mesh | null;
  visitor: Visitor | null;
  onActorRef?: ProceduralActorRefCallback;
}) {
  const gltfs = useConfiguredGLTFs(models.map((item) => item.path));
  const modelRefs = useRef<Map<number, Group>>(new Map());

  return (
    <>
      {models.map((item, index) => {
        const gltf = gltfs[index] as GLTF | undefined;
        if (!gltf?.scene) return null;
        const clone = gltf.scene.clone(true);
        clone.traverse((object) => {
          if (object instanceof Mesh) {
            object.castShadow = true;
            object.receiveShadow = true;
            if (Array.isArray(object.material)) {
              object.material.forEach((mat) => enableMaterialDithering(mat));
            } else if (object.material) {
              enableMaterialDithering(object.material);
            }
          }
        });
        const hasAnimation = Boolean(item.animation);
        return (
          hasAnimation ? (
            <AnimatedProceduralModel
              key={`${item.id || item.path}-${index}`}
              model={item}
              sceneRoot={clone}
              roomBounds={roomBounds}
              collider={collider}
              visitor={visitor}
              modelRefs={modelRefs}
              modelIndex={index}
              onActorRef={onActorRef}
            />
          ) : (
            <StaticProceduralModel
              key={`${item.id || item.path}-${index}`}
              model={item}
              sceneRoot={clone}
              modelIndex={index}
              onActorRef={onActorRef}
            />
          )
        );
      })}
    </>
  );
}

function ProceduralRoomModel({
  roomSpec,
  models,
  visitor,
  onActorRef,
  position,
  rotation,
  scale,
  onColliderReady,
  onSceneReady
}: {
  roomSpec?: ProceduralRoomSpec;
  models?: ProceduralModelSpec[];
  visitor: Visitor | null;
  onActorRef?: ProceduralActorRefCallback;
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  scale: number;
  onColliderReady?: (collider: Mesh | null) => void;
  onSceneReady?: () => void;
}) {
  const width = coercePositiveNumber(roomSpec?.width, 16);
  const depth = coercePositiveNumber(roomSpec?.depth, 16);
  const roomBounds = useMemo<ProceduralRoomBounds>(() => {
    return {
      minX: -width / 2,
      maxX: width / 2,
      minZ: -depth / 2,
      maxZ: depth / 2
    };
  }, [depth, width]);

  const { displayScene, collider } = useMemo(() => {
    const height = coercePositiveNumber(roomSpec?.height, 4);
    const wallThickness = coercePositiveNumber(roomSpec?.wallThickness, 0.2);
    const floorY = typeof roomSpec?.floorY === 'number' && Number.isFinite(roomSpec.floorY) ? roomSpec.floorY : 0;
    const floorColor = typeof roomSpec?.floorColor === 'string' ? roomSpec.floorColor : '#2a2a2a';
    const wallColor = typeof roomSpec?.wallColor === 'string' ? roomSpec.wallColor : '#ece6dc';
    const ceilingColor = typeof roomSpec?.ceilingColor === 'string' ? roomSpec.ceilingColor : '#e6e6e6';
    const hasCeiling = roomSpec?.ceiling !== false;
    const roughness = typeof roomSpec?.roughness === 'number' ? roomSpec.roughness : 0.9;
    const metalness = typeof roomSpec?.metalness === 'number' ? roomSpec.metalness : 0.05;
    const wallPatternScale = coercePositiveNumber(roomSpec?.wallPatternScale, 4);
    const floorPatternScale = coercePositiveNumber(roomSpec?.floorPatternScale, 6);
    const wallPattern = createPatternTexture('chevrons');
    const floorPattern = createPatternTexture('carpet');
    if (wallPattern) {
      wallPattern.repeat.set(wallPatternScale, wallPatternScale * Math.max(0.5, height / 4));
    }
    if (floorPattern) {
      floorPattern.repeat.set(floorPatternScale, floorPatternScale * Math.max(0.75, depth / 14));
    }

    const display = new Group();
    display.name = 'r3f-procedural-room';

    const floorMaterial = new MeshStandardMaterial({ color: floorColor, roughness, metalness, map: floorPattern || null });
    const wallMaterial = new MeshStandardMaterial({ color: wallColor, roughness, metalness, map: wallPattern || null });
    const ceilingMaterial = new MeshStandardMaterial({ color: ceilingColor, roughness, metalness, side: DoubleSide });

    const floor = new Mesh(new PlaneGeometry(width, depth), floorMaterial);
    floor.name = 'Floor';
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = floorY;
    floor.receiveShadow = true;
    floor.userData.type = 'Floor';
    display.add(floor);

    const wallHeightCenter = floorY + height / 2;
    const halfW = width / 2;
    const halfD = depth / 2;

    const northWall = new Mesh(new BoxGeometry(width, height, wallThickness), wallMaterial.clone());
    northWall.name = 'NorthWall';
    northWall.position.set(0, wallHeightCenter, -halfD);
    northWall.castShadow = true;
    northWall.receiveShadow = true;
    northWall.userData.type = 'Wall';
    display.add(northWall);

    const southWall = new Mesh(new BoxGeometry(width, height, wallThickness), wallMaterial.clone());
    southWall.name = 'SouthWall';
    southWall.position.set(0, wallHeightCenter, halfD);
    southWall.castShadow = true;
    southWall.receiveShadow = true;
    southWall.userData.type = 'Wall';
    display.add(southWall);

    const westWall = new Mesh(new BoxGeometry(wallThickness, height, depth), wallMaterial.clone());
    westWall.name = 'WestWall';
    westWall.position.set(-halfW, wallHeightCenter, 0);
    westWall.castShadow = true;
    westWall.receiveShadow = true;
    westWall.userData.type = 'Wall';
    display.add(westWall);

    const eastWall = new Mesh(new BoxGeometry(wallThickness, height, depth), wallMaterial.clone());
    eastWall.name = 'EastWall';
    eastWall.position.set(halfW, wallHeightCenter, 0);
    eastWall.castShadow = true;
    eastWall.receiveShadow = true;
    eastWall.userData.type = 'Wall';
    display.add(eastWall);

    if (hasCeiling) {
      const ceiling = new Mesh(new PlaneGeometry(width, depth), ceilingMaterial);
      ceiling.name = 'Ceiling';
      ceiling.rotation.x = Math.PI / 2;
      ceiling.position.y = floorY + height;
      ceiling.receiveShadow = true;
      ceiling.userData.type = 'Room';
      display.add(ceiling);
    }

    const colliderSource = display.clone(true);
    colliderSource.updateMatrixWorld(true);
    const staticGen = new StaticGeometryGenerator(colliderSource);
    staticGen.attributes = ['position', 'normal'];
    const merged = staticGen.generate();
    merged.boundsTree = new MeshBVH(merged);
    const colliderMesh = new Mesh(merged);
    colliderMesh.name = 'r3f-procedural-collider';
    colliderMesh.visible = DEBUG_COLLIDER;

    const [px, py, pz] = position;
    const [rx, ry, rz] = rotation;
    colliderMesh.position.set(px, py, pz);
    colliderMesh.rotation.set(rx, ry, rz);
    colliderMesh.scale.setScalar(scale);
    colliderMesh.updateMatrixWorld(true);

    if (DEBUG_COLLIDER) {
      colliderMesh.material = new MeshBasicMaterial({
        color: 0x00ffff,
        wireframe: true,
        transparent: true,
        opacity: 0.2
      });
      colliderMesh.renderOrder = 999;
    }

    return { displayScene: display, collider: colliderMesh };
  }, [depth, position, roomSpec, rotation, scale, width]);

  useEffect(() => {
    onColliderReady?.(collider);
    onSceneReady?.();
    return () => {
      onColliderReady?.(null);
      collider?.geometry?.dispose?.();
    };
  }, [collider, onColliderReady, onSceneReady]);

  const [rx, ry, rz] = rotation;

  return (
    <group position={new Vector3(...position)} rotation={new Euler(rx, ry, rz)} scale={scale}>
      <primitive object={displayScene} dispose={null} />
      {models && models.length > 0 ? (
        <ProceduralRoomModels
          models={models}
          roomBounds={roomBounds}
          collider={collider}
          visitor={visitor}
          onActorRef={onActorRef}
        />
      ) : null}
    </group>
  );
}

function SceneBackground({
  textureUrl,
  blurriness,
  intensity,
  fallbackColorHex
}: {
  textureUrl?: string | null;
  blurriness?: number;
  intensity?: number;
  fallbackColorHex?: string;
}) {
  const { scene, gl } = useThree();
  const fallbackColor = useMemo(() => new Color(fallbackColorHex || DEFAULT_BACKGROUND), [fallbackColorHex]);

  useEffect(() => {
    let disposed = false;
    let loadedTexture: Texture | null = null;
    const previousBlurriness = scene.backgroundBlurriness ?? 0;
    const previousIntensity = scene.backgroundIntensity ?? 1;
    const targetBlurriness = typeof blurriness === 'number' ? blurriness : 0;
    const targetIntensity = typeof intensity === 'number' ? intensity : 1;

    const applyFallback = () => {
      scene.background = fallbackColor;
    };

    applyFallback();
    scene.backgroundBlurriness = targetBlurriness;
    scene.backgroundIntensity = targetIntensity;

    if (!textureUrl) {
      return () => {
        if (scene.background === fallbackColor) {
          scene.background = null;
        }
        scene.backgroundBlurriness = previousBlurriness;
        scene.backgroundIntensity = previousIntensity;
      };
    }

    const loadBackground = async () => {
      try {
        let texture: Texture;
        const isKtx2 = textureUrl.toLowerCase().endsWith('.ktx2');
        if (isKtx2) {
          ensureKtx2Support(gl as WebGLRenderer);
          texture = await getKtx2Loader(gl as WebGLRenderer).loadAsync(textureUrl);
        } else {
          const loader = new TextureLoader();
          texture = await loader.loadAsync(textureUrl);
        }
        if (disposed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = SRGBColorSpace;
        texture.mapping = EquirectangularReflectionMapping;
        if (!('isCompressedTexture' in texture && texture.isCompressedTexture)) {
          texture.magFilter = LinearFilter;
          texture.minFilter = LinearMipmapLinearFilter;
          texture.generateMipmaps = true;
        }
        texture.needsUpdate = true;
        loadedTexture = texture;
        scene.background = texture;
        scene.backgroundBlurriness = targetBlurriness;
        scene.backgroundIntensity = targetIntensity;
      } catch (err) {
        if (!disposed) {
          console.warn('Failed to load background texture:', textureUrl, err);
          applyFallback();
        }
      }
    };

    loadBackground();

    return () => {
      disposed = true;
      if (loadedTexture) {
        if (scene.background === loadedTexture) {
          scene.background = null;
        }
        loadedTexture.dispose();
      } else if (scene.background === fallbackColor) {
        scene.background = null;
      }
      scene.backgroundBlurriness = previousBlurriness;
      scene.backgroundIntensity = previousIntensity;
    };
  }, [textureUrl, blurriness, intensity, scene, gl, fallbackColor]);

  return null;
}

function ConfiguredSpotLight({
  color,
  position,
  target,
  intensity,
  angle,
  penumbra,
  distance,
  decay,
  castShadow,
  shadowMapSize,
  shadowBias,
  shadowNormalBias
}: {
  color: string;
  position: Vector3Tuple;
  target: Vector3Tuple;
  intensity: number;
  angle: number;
  penumbra: number;
  distance: number;
  decay: number;
  castShadow: boolean;
  shadowMapSize: number;
  shadowBias: number;
  shadowNormalBias: number;
}) {
  const lightRef = useRef<SpotLight | null>(null);
  const { scene } = useThree();

  useEffect(() => {
    const light = lightRef.current;
    if (!light) return;
    light.target.position.set(...target);
    scene.add(light.target);
    light.target.updateMatrixWorld();
    return () => {
      scene.remove(light.target);
    };
  }, [scene, target]);

  return (
    <spotLight
      ref={lightRef}
      color={color}
      position={position}
      intensity={intensity}
      angle={angle}
      penumbra={penumbra}
      distance={distance}
      decay={decay}
      castShadow={castShadow}
      shadow-mapSize-width={shadowMapSize}
      shadow-mapSize-height={shadowMapSize}
      shadow-bias={shadowBias}
      shadow-normalBias={shadowNormalBias}
    />
  );
}

type ThumbnailCaptureConfig = {
  enabled: boolean;
  cameraPosition: Vector3Tuple;
  target: Vector3Tuple;
  fov: number;
  allowOrbit: boolean;
  heightStep: number;
  autoRotate: boolean;
  autoRotateSpeed: number;
  showHint: boolean;
  fps: number;
  mimeType: string;
  bitsPerSecond: number;
  filename: string;
  preset?: string;
};

function ThumbnailRecorderMode({
  config,
  active
}: {
  config: ThumbnailCaptureConfig;
  active: boolean;
}) {
  const { camera, gl } = useThree();
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | undefined;
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [isRecording, setIsRecording] = useState(false);

  const applyCameraPose = useCallback(() => {
    let pose = {
      cameraPosition: config.cameraPosition,
      target: config.target,
      fov: config.fov
    };
    if (config.preset === 'lockdownsPoster') {
      pose = {
        cameraPosition: [-12.5, 11.5, 10.2],
        target: [0.6, 1.1, -1.4],
        fov: 34
      };
    }
    camera.position.set(...pose.cameraPosition);
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.set(...pose.target);
      controls.enabled = config.allowOrbit;
      controls.update();
    }
  }, [camera, config.allowOrbit, config.cameraPosition, config.fov, config.preset, config.target, controls]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
  }, []);

  const startRecording = useCallback(() => {
    if (typeof window === 'undefined') return;
    const mediaStream = gl.domElement.captureStream(config.fps);
    const recorder = new MediaRecorder(mediaStream, {
      mimeType: config.mimeType,
      videoBitsPerSecond: config.bitsPerSecond
    });
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    recorder.onstop = () => {
      setIsRecording(false);
      const blob = new Blob(chunksRef.current, { type: config.mimeType });
      chunksRef.current = [];
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = config.filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      mediaStream.getTracks().forEach((track) => track.stop());
      recorderRef.current = null;
    };
    recorder.start();
    recorderRef.current = recorder;
    setIsRecording(true);
  }, [config.bitsPerSecond, config.filename, config.fps, config.mimeType, gl.domElement]);

  useEffect(() => {
    if (!active || !config.enabled) {
      stopRecording();
      if (controls) controls.enabled = true;
      return;
    }
    applyCameraPose();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k') {
        applyCameraPose();
      }
      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        if (isRecording) {
          stopRecording();
        } else {
          startRecording();
        }
      }
      const raiseKeys = new Set(['PageUp', 'q', 'Q', ']', '=', '+']);
      const lowerKeys = new Set(['PageDown', 'e', 'E', '[', '-', '_']);
      if (raiseKeys.has(event.key) || lowerKeys.has(event.key)) {
        event.preventDefault();
        const dir = raiseKeys.has(event.key) ? 1 : -1;
        camera.position.y += dir * config.heightStep;
        if (controls) {
          controls.target.y += dir * config.heightStep * 0.35;
          controls.update();
        }
      }
      if (event.key.toLowerCase() === 'p') {
        const payload = {
          cameraPosition: [camera.position.x, camera.position.y, camera.position.z].map((n) => Number(n.toFixed(3))),
          target: controls
            ? [controls.target.x, controls.target.y, controls.target.z].map((n) => Number(n.toFixed(3)))
            : [0, 0, 0],
          fov: Number(camera.fov.toFixed(3))
        };
        console.log('thumbnailCapture camera snapshot', payload);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      stopRecording();
      if (controls) controls.enabled = true;
    };
  }, [active, applyCameraPose, camera, config.enabled, config.heightStep, controls, isRecording, startRecording, stopRecording]);

  if (!active || !config.enabled || !config.showHint) return null;

  return (
    <Html position={[0, 0, 0]} center>
      <div className="pointer-events-none rounded-md bg-black/60 px-2 py-1 text-xs text-white">
        Thumbnail mode: `K` reset, `R` record, `PgUp/PgDn` or `Q/E` height, `P` print pose {isRecording ? '(REC)' : ''}
      </div>
    </Html>
  );
}

function R3FViewerInner({ configUrl, onRequestSidebarClose, onVisitorActivity }: R3FViewerProps) {
  const { config, loading, error } = useExhibitConfig(configUrl);

  const modelPath = config?.modelPath;
  const proceduralRoom = config?.proceduralRoom as Record<string, unknown> | undefined;
  const useProceduralRoom = !modelPath && Boolean(proceduralRoom);
  const proceduralModels = useMemo<ProceduralModelSpec[] | undefined>(() => {
    if (!Array.isArray(config?.models)) return undefined;
    const mapped = config.models
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const record = entry as Record<string, unknown>;
        const path = typeof record.path === 'string' ? record.path : undefined;
        if (!path) return null;
        return {
          id: typeof record.id === 'string' ? record.id : undefined,
          path,
          position: coerceVector(record.position),
          rotation: coerceVector(record.rotation),
          scale: typeof record.scale === 'number' && Number.isFinite(record.scale) ? record.scale : 1,
          collisionRadius:
            typeof record.collisionRadius === 'number' && Number.isFinite(record.collisionRadius)
              ? record.collisionRadius
              : 0.85,
          animation:
            record.animation && typeof record.animation === 'object'
              ? {
                  swayAngle:
                    typeof (record.animation as Record<string, unknown>).swayAngle === 'number'
                      ? ((record.animation as Record<string, unknown>).swayAngle as number)
                      : 0,
                  swaySpeed:
                    typeof (record.animation as Record<string, unknown>).swaySpeed === 'number'
                      ? ((record.animation as Record<string, unknown>).swaySpeed as number)
                      : 0.8,
                  driftDistance:
                    typeof (record.animation as Record<string, unknown>).driftDistance === 'number'
                      ? ((record.animation as Record<string, unknown>).driftDistance as number)
                      : 0,
                  driftSpeed:
                    typeof (record.animation as Record<string, unknown>).driftSpeed === 'number'
                      ? ((record.animation as Record<string, unknown>).driftSpeed as number)
                      : 0.35,
                  bobDistance:
                    typeof (record.animation as Record<string, unknown>).bobDistance === 'number'
                      ? ((record.animation as Record<string, unknown>).bobDistance as number)
                      : 0,
                  bobSpeed:
                    typeof (record.animation as Record<string, unknown>).bobSpeed === 'number'
                      ? ((record.animation as Record<string, unknown>).bobSpeed as number)
                      : 0.5,
                  collisionAware:
                    typeof (record.animation as Record<string, unknown>).collisionAware === 'boolean'
                      ? ((record.animation as Record<string, unknown>).collisionAware as boolean)
                      : false,
                  speed:
                    typeof (record.animation as Record<string, unknown>).speed === 'number'
                      ? ((record.animation as Record<string, unknown>).speed as number)
                      : 0.45,
                  boundaryPadding:
                    typeof (record.animation as Record<string, unknown>).boundaryPadding === 'number'
                      ? ((record.animation as Record<string, unknown>).boundaryPadding as number)
                      : 0.8,
                  turnJitter:
                    typeof (record.animation as Record<string, unknown>).turnJitter === 'number'
                      ? ((record.animation as Record<string, unknown>).turnJitter as number)
                      : 0.35,
                  direction:
                    Array.isArray((record.animation as Record<string, unknown>).direction) &&
                    (record.animation as Record<string, unknown>).direction.length >= 2
                      ? [
                          Number(((record.animation as Record<string, unknown>).direction as unknown[])[0]) || 1,
                          Number(((record.animation as Record<string, unknown>).direction as unknown[])[1]) || 0
                        ]
                      : [1, 0]
                }
              : undefined
        } as ProceduralModelSpec;
      })
      .filter((entry): entry is ProceduralModelSpec => entry !== null);
    return mapped.length > 0 ? mapped : undefined;
  }, [config?.models]);
  const interactivesPath = config?.interactivesPath;
  const position = useMemo(() => coerceVector(config?.position), [config?.position]);
  const rotation = useMemo(() => coerceVector(config?.rotation), [config?.rotation]);
  const scale = typeof config?.scale === 'number' ? config.scale : 1;
  const rawParams = config?.params as Record<string, unknown> | undefined;
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
  const lightIntensity = typeof rawParams?.lightIntensity === 'number' && Number.isFinite(rawParams.lightIntensity) ? rawParams.lightIntensity : 1;
  const lights = config?.lights && typeof config.lights === 'object' ? (config.lights as Record<string, unknown>) : undefined;
  const ambientLightColor = typeof lights?.ambientColor === 'string' ? lights.ambientColor : '#ffffff';
  const ambientLightIntensity = typeof lights?.ambientIntensity === 'number'
    ? lights.ambientIntensity
    : 0.55 * lightIntensity;
  const hemisphereSkyColor = typeof lights?.hemisphereSkyColor === 'string' ? lights.hemisphereSkyColor : '#e8eeff';
  const hemisphereGroundColor = typeof lights?.hemisphereGroundColor === 'string' ? lights.hemisphereGroundColor : '#3b4352';
  const hemisphereIntensity = typeof lights?.hemisphereIntensity === 'number'
    ? lights.hemisphereIntensity
    : 0.65 * lightIntensity;
  const directionalColor = typeof lights?.directionalColor === 'string' ? lights.directionalColor : '#ffffff';
  const directionalIntensity = typeof lights?.directionalIntensity === 'number'
    ? lights.directionalIntensity
    : 0.25 * lightIntensity;
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
  const thumbnailBackgroundColor = thumbnailModeActive
    ? typeof thumbnailCaptureRecord?.backgroundColor === 'string'
      ? thumbnailCaptureRecord.backgroundColor
      : '#c8ced6'
    : undefined;
  const [collider, setCollider] = useState<Mesh | null>(null);
  const [sceneVersion, bumpSceneVersion] = useReducer((value: number) => value + 1, 0);
  const [visitorInstance, setVisitorInstance] = useState<Visitor | null>(null);
  const dynamicActorsRef = useRef<Map<string, { object: Group; radius: number }>>(new Map());
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
  const handleProceduralActorRef = useCallback((id: string, object: Group | null, radius: number) => {
    if (!object) {
      dynamicActorsRef.current.delete(id);
      return;
    }
    dynamicActorsRef.current.set(id, { object, radius });
  }, []);

  const linkMap = useMemo(() => {
    if (config?.links && typeof config.links === 'object') {
      return config.links as Record<string, unknown>;
    }
    return undefined;
  }, [config?.links]);

  const imagesMeta = useMemo(() => {
    if (config?.images && typeof config.images === 'object') {
      return config.images as Record<string, Record<string, unknown>>;
    }
    return undefined;
  }, [config?.images]);

  const videosMeta = useMemo(() => {
    if (!Array.isArray(config?.videos)) return undefined;
    const map: Record<string, Record<string, unknown>> = {};
    for (const entry of config.videos) {
      if (entry && typeof entry === 'object') {
        const id = (entry as Record<string, unknown>).id;
        if (typeof id === 'string') {
          map[id] = entry as Record<string, unknown>;
        }
      }
    }
    return map;
  }, [config?.videos]);

  const sculpturesMeta = useMemo(() => {
    if (config?.sculptures && typeof config.sculptures === 'object') {
      return config.sculptures as Record<string, Record<string, unknown>>;
    }
    return undefined;
  }, [config?.sculptures]);

  const legacyImages = useMemo<LegacyImageMap | undefined>(() => {
    if (!config?.images || typeof config.images !== 'object') {
      return undefined;
    }
    const result: LegacyImageMap = {};
    for (const [key, value] of Object.entries(config.images as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const record = value as Record<string, unknown>;
      const title = typeof record.title === 'string' ? record.title : undefined;
      if (!title) continue;
      const author = typeof record.author === 'string' ? record.author : undefined;
      const description = typeof record.description === 'string' ? record.description : undefined;
      const imagePath = typeof record.imagePath === 'string' ? record.imagePath : undefined;
      const oracleImagePath = typeof record.oracleImagePath === 'string' ? record.oracleImagePath : undefined;
      const ipfsImagePath = typeof record.ipfsImagePath === 'string' ? record.ipfsImagePath : undefined;
      let img;
      if (record.img && typeof record.img === 'object') {
        const src = (record.img as Record<string, unknown>).src;
        if (typeof src === 'string') {
          img = { src };
        }
      }
      result[key] = {
        title,
        ...(author ? { author } : {}),
        ...(description ? { description } : {}),
        ...(imagePath ? { imagePath } : {}),
        ...(oracleImagePath ? { oracleImagePath } : {}),
        ...(ipfsImagePath ? { ipfsImagePath } : {}),
        ...(img ? { img } : {})
      };
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }, [config?.images]);

  const showLegacyModal = useLegacyModal(legacyImages);

  const [renderer, setRenderer] = useState<WebGLRenderer | null>(null);
  const [xrSupported, setXrSupported] = useState(false);
  const [xrSessionActive, setXrSessionActive] = useState(false);
  const [xrError, setXrError] = useState<string | null>(null);
  const xrSessionRef = useRef<XRSession | null>(null);
  const handleCanvasCreated = useCallback((state: RootState) => {
    setRenderer(state.gl);
  }, []);

  const audioConfig = useMemo<AudioMeshConfig[] | undefined>(() => {
    if (!Array.isArray(config?.audio)) return undefined;
    const sanitized = config.audio
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const record = entry as Record<string, unknown>;
        const id = typeof record.id === 'string'
          ? record.id
          : typeof record.name === 'string'
            ? record.name
            : undefined;
        if (!id) return null;
        const url = typeof record.url === 'string' ? record.url : undefined;
        const ipfsUrl = typeof record.ipfsUrl === 'string' ? record.ipfsUrl : undefined;
        if (!url && !ipfsUrl) return null;
        let directionalCone: [number, number, number] | undefined;
        if (Array.isArray(record.directionalCone)) {
          const cone = (record.directionalCone as unknown[])
            .slice(0, 3)
            .map((value) => (typeof value === 'number' ? value : Number(value)))
            .filter((value) => Number.isFinite(value)) as number[];
          if (cone.length === 3) {
            directionalCone = [cone[0], cone[1], cone[2]];
          }
        }
        const sanitized: AudioMeshConfig = {
          id,
          name: typeof record.name === 'string' ? record.name : undefined,
          url,
          ipfsUrl,
          loop: typeof record.loop === 'boolean' ? record.loop : undefined,
          refDistance: typeof record.refDistance === 'number' ? record.refDistance : undefined,
          rolloff: typeof record.rolloff === 'number' ? record.rolloff : undefined,
          maxDistance: typeof record.maxDistance === 'number' ? record.maxDistance : undefined,
          distanceModel: typeof record.distanceModel === 'string' ? record.distanceModel : undefined,
          volume: typeof record.volume === 'number' ? record.volume : undefined,
          directionalCone
        };
        return sanitized;
      })
      .filter((cfg): cfg is AudioMeshConfig => cfg !== null);
    return sanitized.length ? sanitized : undefined;
  }, [config?.audio]);

  const videosConfig = useMemo<VideoMeshConfig[] | undefined>(() => {
    if (!Array.isArray(config?.videos)) {
      return undefined;
    }
    const filtered: VideoMeshConfig[] = [];
    for (const entry of config.videos as Array<Record<string, unknown>>) {
      if (!entry || typeof entry !== 'object') continue;
      const id = typeof entry.id === 'string' ? entry.id : undefined;
      const rawSources = Array.isArray(entry.sources) ? entry.sources : [];
      if (!id || rawSources.length === 0) continue;
      const mappedSources: VideoMeshConfig['sources'] = [];
      for (const srcEntry of rawSources) {
        if (!srcEntry || typeof srcEntry !== 'object') continue;
        const record = srcEntry as Record<string, unknown>;
        const srcUrl = typeof record.src === 'string' ? record.src : undefined;
        if (!srcUrl) continue;
        const mapped = {
          src: srcUrl,
          type: typeof record.type === 'string' ? record.type : undefined,
          ipfsSrc: typeof record.ipfsSrc === 'string' ? record.ipfsSrc : undefined
        };
        mappedSources.push(mapped);
      }
      if (mappedSources.length === 0) continue;
      filtered.push({
        id,
        sources: mappedSources,
        loop: typeof entry.loop === 'boolean' ? entry.loop : undefined,
        muted: typeof entry.muted === 'boolean' ? entry.muted : undefined,
        preload: typeof entry.preload === 'string' ? entry.preload : undefined,
        poster:
          typeof entry.poster === 'string'
            ? entry.poster
            : typeof entry.oraclePoster === 'string'
              ? entry.oraclePoster
              : undefined,
        ipfsPoster: typeof entry.ipfsPoster === 'string' ? entry.ipfsPoster : undefined
      });
    }
    return filtered.length > 0 ? filtered : undefined;
  }, [config?.videos]);

  useEffect(() => {
    let cancelled = false;

    async function detectXrSupport() {
      if (typeof navigator === 'undefined') {
        if (!cancelled) {
          setXrSupported(false);
        }
        return;
      }
      const xrSystem = navigator.xr;
      if (!xrSystem?.isSessionSupported) {
        if (!cancelled) {
          setXrSupported(false);
        }
        return;
      }
      try {
        const supported = await xrSystem.isSessionSupported('immersive-vr');
        if (!cancelled) {
          setXrSupported(Boolean(supported));
          if (supported) {
            setXrError(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setXrSupported(false);
          setXrError(err instanceof Error ? err.message : 'Unable to detect WebXR support.');
        }
      }
    }

    detectXrSupport();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!renderer) return;
    const xrManager = renderer.xr;
    const handleSessionStart = () => {
      setXrSessionActive(true);
      setXrError(null);
    };
    const handleSessionEnd = () => {
      setXrSessionActive(false);
      xrSessionRef.current = null;
    };
    xrManager.addEventListener('sessionstart', handleSessionStart);
    xrManager.addEventListener('sessionend', handleSessionEnd);
    return () => {
      xrManager.removeEventListener('sessionstart', handleSessionStart);
      xrManager.removeEventListener('sessionend', handleSessionEnd);
    };
  }, [renderer]);

  useEffect(() => {
    if (!renderer) return;
    renderer.xr.enabled = xrSupported;
    if (xrSupported) {
      renderer.xr.setReferenceSpaceType('local-floor');
    }
  }, [renderer, xrSupported]);

  useEffect(() => {
    return () => {
      const session = xrSessionRef.current;
      if (session && typeof session.end === 'function') {
        session.end().catch(() => undefined);
      }
      xrSessionRef.current = null;
    };
  }, []);

  const requestVrSession = useCallback(async () => {
    if (!renderer) return;
    if (typeof navigator === 'undefined') {
      setXrError('Navigator is not available in this environment.');
      return;
    }
    const xrSystem = navigator.xr;
    if (!xrSystem?.requestSession) {
      setXrError('WebXR is not available on this device.');
      return;
    }
    try {
      const session = await xrSystem.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor']
      });
      xrSessionRef.current = session;
      const handleEnd = () => {
        xrSessionRef.current = null;
        session.removeEventListener('end', handleEnd);
      };
      session.addEventListener('end', handleEnd);
      const restoreBinding = temporarilyDisableXRWebGLBinding(session);
      try {
        await renderer.xr.setSession(session);
      } finally {
        restoreBinding?.();
      }
      setXrError(null);
    } catch (err) {
      console.error('Failed to start VR session', err);
      setXrError(err instanceof Error ? err.message : 'Failed to start VR session.');
    }
  }, [renderer]);

  const exitVrSession = useCallback(async () => {
    if (!xrSessionRef.current) return;
    try {
      await xrSessionRef.current.end();
    } catch (err) {
      console.warn('Failed to end XR session', err);
    } finally {
      xrSessionRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!modelPath && !useProceduralRoom) {
      setCollider(null);
    }
  }, [modelPath, useProceduralRoom]);

  return (
    <div className="relative h-full w-full bg-gallery-dark">
      <Canvas
        shadows
        camera={{ position: [10, 6, -10], fov: 60, near: 0.1, far: 2000 }}
        dpr={typeof window !== 'undefined' ? [1, Math.min(1.5, window.devicePixelRatio || 1)] : [1, 1.5]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'low-power',
          logarithmicDepthBuffer: true,
          stencil: false
        }}
        onCreated={handleCanvasCreated}
      >
        <RendererTuning />
        <SceneBackground
          textureUrl={config?.backgroundTexture}
          blurriness={backgroundBlurriness}
          intensity={backgroundIntensity}
          fallbackColorHex={thumbnailBackgroundColor}
        />
        <ambientLight color={ambientLightColor} intensity={ambientLightIntensity} />
        <hemisphereLight args={[new Color(hemisphereSkyColor), new Color(hemisphereGroundColor), hemisphereIntensity]} />
        <directionalLight
          color={directionalColor}
          position={directionalPosition}
          intensity={directionalIntensity}
          castShadow={directionalCastShadow}
          shadow-mapSize-width={directionalShadowMapSize}
          shadow-mapSize-height={directionalShadowMapSize}
          shadow-bias={directionalShadowBias}
          shadow-normalBias={directionalShadowNormalBias}
          shadow-camera-near={0.1}
          shadow-camera-far={80}
          shadow-camera-left={-directionalShadowCameraSize}
          shadow-camera-right={directionalShadowCameraSize}
          shadow-camera-top={directionalShadowCameraSize}
          shadow-camera-bottom={-directionalShadowCameraSize}
        />
        {spotIntensity > 0 ? (
          <ConfiguredSpotLight
            color={spotColor}
            position={spotPosition}
            target={spotTarget}
            intensity={spotIntensity}
            angle={spotAngle}
            penumbra={spotPenumbra}
            distance={spotDistance}
            decay={spotDecay}
            castShadow={spotCastShadow}
            shadowMapSize={spotShadowMapSize}
            shadowBias={spotShadowBias}
            shadowNormalBias={spotShadowNormalBias}
          />
        ) : null}


        <Suspense fallback={<Html center className="text-white">Loading exhibit…</Html>}>
          {modelPath ? (
            <ExhibitModel
              modelPath={modelPath}
              interactivesPath={interactivesPath}
              position={position}
              rotation={rotation}
              scale={scale}
              onColliderReady={setCollider}
              onSceneReady={bumpSceneVersion}
              videosConfig={videosConfig}
            />
          ) : useProceduralRoom ? (
            <ProceduralRoomModel
              roomSpec={proceduralRoom}
              models={proceduralModels}
              visitor={visitorInstance}
              onActorRef={handleProceduralActorRef}
              position={position}
              rotation={rotation}
              scale={scale}
              onColliderReady={setCollider}
              onSceneReady={bumpSceneVersion}
            />
          ) : (
            <Html center className="text-white">Missing modelPath or proceduralRoom in config</Html>
          )}
        </Suspense>

        {DEBUG_COLLIDER && collider ? <primitive object={collider} /> : null}

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.05}
          autoRotate={thumbnailModeActive && thumbnailCapture.autoRotate}
          autoRotateSpeed={thumbnailCapture.autoRotateSpeed}
          enablePan={thumbnailModeActive}
          enableZoom={thumbnailModeActive}
          minDistance={thumbnailModeActive ? 2 : 1e-4}
          maxDistance={thumbnailModeActive ? 80 : 1e-4}
          maxPolarAngle={Math.PI}
        />
        <PointerInteractions
          visitor={visitorInstance}
          onCloseSidebar={onRequestSidebarClose}
          popupCallback={(payload) => {
            if (payload.type === 'Image') {
              showLegacyModal(payload.userData);
            }
          }}
          links={linkMap}
          imagesMeta={imagesMeta}
          videosMeta={videosMeta}
          sculpturesMeta={sculpturesMeta}
        />
        <FirstPersonController
          collider={collider}
          params={controllerParams}
          enabled={!thumbnailModeActive}
          onVisitorReady={setVisitorInstance}
          onVisitorActivity={onVisitorActivity}
        />
        <ScenePhysics config={physicsConfig} visitor={visitorInstance} actorRefs={dynamicActorsRef} />
        <ThumbnailRecorderMode config={thumbnailCapture} active={thumbnailModeActive} />
        <AudioSystem audioConfig={audioConfig} ready={Boolean(collider)} sceneVersion={sceneVersion} />
        <AutoExposureControl params={rawParams} />
      </Canvas>
      <AudioPlayerControls />
      <OnscreenJoystick visitor={visitorInstance} />
      {!thumbnailModeActive ? <Loader /> : null}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-white bg-black/40">
          Loading configuration…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-red-200 bg-black/60">
          Failed to load config: {error.message}
        </div>
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
  return (
    <MaterialModalProvider>
      <R3FViewerInner {...props} />
    </MaterialModalProvider>
  );
}

export default R3FViewer;

type ControllerParams = Partial<VisitorParams> & Record<string, unknown>;

function FirstPersonController({
  collider,
  params,
  enabled,
  onVisitorReady,
  onVisitorActivity
}: {
  collider: Mesh | null;
  params?: ControllerParams;
  enabled?: boolean;
  onVisitorReady?: (visitor: Visitor | null) => void;
  onVisitorActivity?: () => void;
}) {
  const { camera, gl, scene } = useThree();
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | undefined;

  const visitor = useMemo(() => {
    if (enabled === false) return null;
    if (!controls) return null;
    const heightOffsetVec = toVector3(params?.heightOffset, [0, 1.05, 0]);
    const visitorEnterVec = toVector3(params?.visitorEnter, [0, 10, 0]);
    const defaults = {
      visitorSpeed: typeof params?.visitorSpeed === 'number' ? params.visitorSpeed : 2.5,
      gravity: typeof params?.gravity === 'number' ? params.gravity : -9,
      heightOffset: heightOffsetVec,
      rotateOrbit: typeof params?.rotateOrbit === 'number' ? params.rotateOrbit : 15,
      visitorEnter: visitorEnterVec
    };
    return new Visitor({
      camera,
      controls,
      params: defaults,
      renderer: gl,
      xrRig: null
    });
  }, [camera, controls, enabled, gl, params]);

  const lastPosition = useRef<Vector3 | null>(null);
  const lastAngle = useRef<number | null>(null);
  const lastActivityStamp = useRef(0);

  useEffect(() => {
    if (!visitor) return undefined;
    onVisitorReady?.(visitor);
    scene.add(visitor);
    visitor.reset?.();

    if (controls) {
      controls.enablePan = false;
      controls.enableZoom = false;
      controls.minDistance = 1e-4;
      controls.maxDistance = 1e-4;

      const offset = toVector3(params?.heightOffset, [0, 1.05, 0]);
      const headPosition = visitor.position.clone().add(offset);
      controls.target.copy(headPosition);
      camera.position.copy(headPosition).add(new Vector3(0, 0, 1e-4));

      controls.update();
    }

    return () => {
      visitor.dispose?.();
      scene.remove(visitor);
      onVisitorReady?.(null);
    };
  }, [camera, controls, onVisitorReady, params, scene, visitor]);

  useEffect(() => {
    if (!visitor) return undefined;
    const updateRigReference = () => {
      const xrCamera = gl.xr.getCamera(camera);
      const rigObject = (xrCamera?.parent ?? xrCamera ?? null) as Object3D | null;
      visitor.xrRig = rigObject;
      if (rigObject) {
        const offset = toVector3(params?.heightOffset, [0, 1.05, 0]);
        const targetPosition = visitor.position.clone().add(offset);
        rigObject.position.copy(targetPosition);
      }
    };
    const handleSessionStart = () => {
      if (controls) {
        controls.enabled = false;
      }
      updateRigReference();
    };
    const handleSessionEnd = () => {
      visitor.xrRig = null;
      if (controls) {
        controls.enabled = true;
      }
    };

    gl.xr.addEventListener('sessionstart', handleSessionStart);
    gl.xr.addEventListener('sessionend', handleSessionEnd);

    return () => {
      gl.xr.removeEventListener('sessionstart', handleSessionStart);
      gl.xr.removeEventListener('sessionend', handleSessionEnd);
      visitor.xrRig = null;
      if (controls) {
        controls.enabled = true;
      }
    };
  }, [camera, controls, gl, params?.heightOffset, visitor]);

  useFrame((_, delta) => {
    if (!visitor || !collider) return;
    visitor.update(delta, collider);

    const now = performance.now();
    if (!lastPosition.current) {
      lastPosition.current = visitor.position.clone();
    }
    const angle = controls?.getAzimuthalAngle?.();
    const angleChanged =
      typeof angle === 'number' &&
      (lastAngle.current === null || Math.abs(angle - lastAngle.current) > 0.01);
    const moved =
      lastPosition.current.distanceToSquared(visitor.position) > 1e-4 || visitor.isAutoMoving;

    if (moved || angleChanged) {
      lastPosition.current.copy(visitor.position);
      if (typeof angle === 'number') {
        lastAngle.current = angle;
      }
      if (onVisitorActivity && now - lastActivityStamp.current > 500) {
        lastActivityStamp.current = now;
        onVisitorActivity();
      }
    }
  });

  return null;
}

function ScenePhysics({
  config,
  visitor,
  actorRefs
}: {
  config?: PhysicsConfig;
  visitor: Visitor | null;
  actorRefs: MutableRefObject<Map<string, { object: Group; radius: number }>>;
}) {
  const physicsSystemRef = useRef<PhysicsSystem | null>(null);

  if (!physicsSystemRef.current) {
    physicsSystemRef.current = new PhysicsSystem();
  }

  useEffect(() => {
    physicsSystemRef.current?.configure(config);
  }, [config]);

  useFrame(() => {
    if (!physicsSystemRef.current || config?.enabled === false) return;
    const actors: PhysicsRuntimeActor[] = [];
    if (visitor) {
      actors.push({ id: 'visitor', object: visitor, radius: 0.55 });
    }
    for (const [id, entry] of actorRefs.current.entries()) {
      actors.push({
        id,
        object: entry.object,
        radius: entry.radius
      });
    }
    physicsSystemRef.current.step(config, actors);
  });

  return null;
}

function AudioSystem({
  audioConfig,
  ready,
  sceneVersion
}: {
  audioConfig: AudioMeshConfig[] | undefined;
  ready: boolean;
  sceneVersion: number;
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
    />
  );
}

function RendererTuning() {
  const { gl } = useThree();

  useEffect(() => {
    //gl.physicallyCorrectLights = true;
    gl.outputColorSpace = SRGBColorSpace;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = PCFSoftShadowMap;
    if (typeof window !== 'undefined') {
      gl.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    }
  }, [gl]);

  return null;
}

function AutoExposureControl({ params }: { params?: Record<string, unknown> }) {
  const { gl, scene, camera } = useThree();
  const autoExposure = params?.autoExposure !== false;
  const targetGray = typeof params?.exposureTarget === 'number' ? params.exposureTarget : 0.6;
  const exposureMin = typeof params?.exposureMin === 'number' ? params.exposureMin : 0.75;
  const exposureMax = typeof params?.exposureMax === 'number' ? params.exposureMax : 1.6;
  const sampleInterval = typeof params?.exposureSampleInterval === 'number' ? Math.max(1, params.exposureSampleInterval) : 20;
  const sampleSize = 64;

  const targetRef = useMemo(() => ({ current: null as WebGLRenderTarget | null }), []);
  const bufferRef = useMemo(() => ({ current: null as Uint8Array | null }), []);
  const frameRef = useMemo(() => ({ current: 0 }), []);

  useEffect(() => {
    gl.toneMapping = NeutralToneMapping;
    if (typeof params?.exposure === 'number' && Number.isFinite(params.exposure)) {
      gl.toneMappingExposure = params.exposure;
    } else {
      gl.toneMappingExposure = 1.1;
    }
  }, [gl, params?.exposure]);

  useEffect(() => {
    if (!autoExposure) {
      targetRef.current?.dispose();
      targetRef.current = null;
      bufferRef.current = null;
      return;
    }
    const rt = new WebGLRenderTarget(sampleSize, sampleSize, { depthBuffer: false, stencilBuffer: false });
    targetRef.current = rt;
    bufferRef.current = new Uint8Array(sampleSize * sampleSize * 4);
    return () => {
      rt.dispose();
      targetRef.current = null;
      bufferRef.current = null;
    };
  }, [autoExposure, sampleSize, targetRef, bufferRef]);

  useFrame(() => {
    if (!autoExposure) return;
    const target = targetRef.current;
    const pixels = bufferRef.current;
    if (!target || !pixels) return;

    frameRef.current += 1;
    if (frameRef.current % sampleInterval !== 0) return;

    const prevRenderTarget = gl.getRenderTarget();
    try {
      gl.setRenderTarget(target);
      gl.render(scene, camera);
      gl.readRenderTargetPixels(target, 0, 0, sampleSize, sampleSize, pixels);
    } catch {
      // ignore sampling errors
    } finally {
      gl.setRenderTarget(prevRenderTarget);
    }

    let sum = 0;
    const inv255 = 1 / 255;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i] * inv255;
      const g = pixels[i + 1] * inv255;
      const b = pixels[i + 2] * inv255;
      sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    const avg = sum / (sampleSize * sampleSize);
    if (!Number.isFinite(avg) || avg <= 0) return;

    const currentExposure = gl.toneMappingExposure ?? 1;
    const desired = currentExposure * Math.sqrt(Math.max(0.001, targetGray) / Math.max(0.001, Math.min(1, avg)));
    const clamped = Math.min(exposureMax, Math.max(exposureMin, desired));
    gl.toneMappingExposure = currentExposure + (clamped - currentExposure) * 0.15;
  });

  return null;
}
