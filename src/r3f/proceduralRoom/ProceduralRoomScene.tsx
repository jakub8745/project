import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import type { Vector3Tuple } from 'three';
import {
  BoxGeometry,
  BufferAttribute,
  CanvasTexture,
  Color,
  DoubleSide,
  Euler,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  WebGLCubeRenderTarget,
  CubeCamera
} from 'three';
import type { SphereGeometry } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { StaticGeometryGenerator, MeshBVH } from 'three-mesh-bvh';
import Visitor from '../../modules/Visitor.js';
import Robot from '../../modules/Robot.js';
import { applyObjectRuntimeData, type ObjectRegistry } from '../../modules/objectRegistry.js';
import { chatApiUrl } from '../../utils/chatApi';
import { useConfiguredGLTFs } from '../useConfiguredGLTFs';
import { coercePositiveNumber } from './config';

const DEBUG_COLLIDER = false;

function enableMaterialDithering(material: Material) {
  material.dithering = true;
}

type ProceduralPatternType = 'chevrons' | 'carpet' | 'silhouettes' | 'concrete' | 'plaster';
type SurfacePrint = {
  id: number;
  text: string;
  surface: 'north' | 'south' | 'east' | 'west' | 'floor';
  u: number;
  v: number;
  rotation: number;
  scale: number;
  color: string;
  opacity: number;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampValue(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function createPatternTexture(type: ProceduralPatternType, width = 1024, height = 1024): CanvasTexture | null {
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
  } else if (type === 'carpet') {
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
  } else if (type === 'silhouettes') {
    ctx.fillStyle = '#dcd4c7';
    ctx.fillRect(0, 0, width, height);

    // subtle paper grain so repeated tiles are less obvious
    for (let i = 0; i < 1400; i += 1) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const alpha = 0.02 + Math.random() * 0.03;
      ctx.fillStyle = `rgba(78, 68, 58, ${alpha})`;
      ctx.fillRect(x, y, 2, 2);
    }

    const motifW = 150;
    const motifH = 210;
    const offsetX = 28;
    const offsetY = 24;
    const colorA = 'rgba(58, 47, 41, 0.34)';
    const colorB = 'rgba(90, 74, 64, 0.24)';

    const drawSilhouette = (x: number, y: number, scale: number, color: string) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.fillStyle = color;

      // simple profile-like blob
      ctx.beginPath();
      ctx.moveTo(0, 165);
      ctx.bezierCurveTo(14, 102, 28, 88, 52, 77);
      ctx.bezierCurveTo(70, 66, 82, 50, 80, 33);
      ctx.bezierCurveTo(78, 16, 64, 2, 47, 2);
      ctx.bezierCurveTo(24, 2, 7, 19, 8, 42);
      ctx.bezierCurveTo(9, 62, 20, 75, 33, 84);
      ctx.bezierCurveTo(18, 96, 7, 112, 0, 165);
      ctx.closePath();
      ctx.fill();

      // shoulder block to read as wallpaper silhouette
      ctx.beginPath();
      ctx.moveTo(-8, 165);
      ctx.lineTo(65, 165);
      ctx.lineTo(65, 204);
      ctx.lineTo(-8, 204);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    for (let y = -motifH; y < height + motifH; y += motifH) {
      for (let x = -motifW; x < width + motifW; x += motifW) {
        const evenRow = Math.round(y / motifH) % 2 === 0;
        const motifX = evenRow ? x : x + offsetX;
        drawSilhouette(motifX + 28, y + offsetY, 0.86, colorA);
        drawSilhouette(motifX + 88, y + offsetY + 10, 0.7, colorB);
      }
    }
  } else if (type === 'concrete') {
    ctx.fillStyle = '#8d8f92';
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < 3600; i += 1) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const s = 1 + Math.floor(Math.random() * 3);
      const shade = 95 + Math.floor(Math.random() * 65);
      const alpha = 0.04 + Math.random() * 0.1;
      ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${alpha})`;
      ctx.fillRect(x, y, s, s);
    }

    for (let i = 0; i < 180; i += 1) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const len = 8 + Math.random() * 24;
      const angle = Math.random() * Math.PI * 2;
      ctx.strokeStyle = `rgba(40, 42, 45, ${0.03 + Math.random() * 0.07})`;
      ctx.lineWidth = 0.8 + Math.random() * 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
      ctx.stroke();
    }
  } else {
    // plaster
    ctx.fillStyle = '#f6f1e8';
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < 2800; i += 1) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const s = 1 + Math.floor(Math.random() * 2);
      const tone = 210 + Math.floor(Math.random() * 35);
      const alpha = 0.03 + Math.random() * 0.08;
      ctx.fillStyle = `rgba(${tone}, ${tone - 5}, ${tone - 10}, ${alpha})`;
      ctx.fillRect(x, y, s, s);
    }

    for (let i = 0; i < 70; i += 1) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const r = 10 + Math.random() * 26;
      const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.13)');
      g.addColorStop(1, 'rgba(210,198,180,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}


type ProceduralObjectShape = 'sphere' | 'box' | 'torusKnot' | 'icosahedron' | 'blob';
type ProceduralObjectMaterialSpec = {
  color: string;
  metalness: number;
  roughness: number;
  emissive: string;
  emissiveIntensity: number;
  envMapIntensity: number;
  texture?: string;
  textureRepeat: [number, number];
  transmission: number;
  thickness: number;
  ior: number;
  clearcoat: number;
  clearcoatRoughness: number;
  reflectivity: number;
  opacity: number;
  realtimeEnvMap: boolean;
  envMapResolution: number;
  envMapRefreshFrames: number;
};
type ProceduralObjectAnimationSpec = {
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
type ProceduralObjectSpec = {
  id?: string;
  shape: ProceduralObjectShape;
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  scale: Vector3Tuple;
  size: Vector3Tuple;
  radius: number;
  detail: number;
  tube: number;
  tubularSegments: number;
  radialSegments: number;
  p: number;
  q: number;
  blobAmplitude: number;
  blobFrequency: number;
  blobSpeed: number;
  collisionRadius: number;
  castShadow: boolean;
  receiveShadow: boolean;
  userData?: {
    type?: string;
    name?: string;
  };
  animation?: ProceduralObjectAnimationSpec;
  material: ProceduralObjectMaterialSpec;
};

function AnimatedProceduralObject({
  object,
  objectIndex,
  roomBounds,
  collider,
  visitor,
  objectRefs,
  onActorRef,
  objectRegistry
}: {
  object: ProceduralObjectSpec;
  objectIndex: number;
  roomBounds?: ProceduralRoomBounds;
  collider: Mesh | null;
  visitor: Visitor | null;
  objectRefs: MutableRefObject<Map<number, { mesh: Mesh; radius: number }>>;
  onActorRef?: ProceduralActorRefCallback;
  objectRegistry?: ObjectRegistry;
}) {
  const { gl, scene } = useThree();
  const meshRef = useRef<Mesh | null>(null);
  const materialRef = useRef<MeshPhysicalMaterial | null>(null);
  const textureRef = useRef<Texture | null>(null);
  const basePosition = useMemo(() => new Vector3(...object.position), [object.position]);
  const baseRotation = useMemo(() => new Euler(...object.rotation), [object.rotation]);
  const robotRef = useRef<Robot | null>(null);
  const moveDir = useRef<Vector3>(new Vector3(1, 0, 0));
  const seeded = useRef(false);
  const frameCounter = useRef(0);
  const geometryRef = useRef<SphereGeometry | null>(null);
  const blobBasePositionsRef = useRef<Float32Array | null>(null);
  const blobPhaseRef = useRef<Float32Array | null>(null);
  const blobNormalFrameCounter = useRef(0);
  const cubeOrigin = useMemo(() => new Vector3(), []);
  const actorId = object.id || `object_${objectIndex}`;
  const cubeRenderTarget = useMemo(() => {
    if (!object.material.realtimeEnvMap) return null;
    return new WebGLCubeRenderTarget(Math.max(64, Math.floor(object.material.envMapResolution)));
  }, [object.material.envMapResolution, object.material.realtimeEnvMap]);
  const cubeCamera = useMemo(() => {
    if (!cubeRenderTarget) return null;
    return new CubeCamera(0.05, 1000, cubeRenderTarget);
  }, [cubeRenderTarget]);

  useEffect(() => {
    return () => {
      cubeRenderTarget?.dispose();
    };
  }, [cubeRenderTarget]);

  useEffect(() => {
    if (!cubeCamera) return;
    scene.add(cubeCamera);
    return () => {
      scene.remove(cubeCamera);
    };
  }, [cubeCamera, scene]);

  useEffect(() => {
    const material = materialRef.current;
    const texturePath = object.material.texture;
    if (!material) return undefined;

    const disposeTexture = () => {
      if (textureRef.current) {
        if (material.map === textureRef.current) {
          material.map = null;
          material.needsUpdate = true;
        }
        textureRef.current.dispose();
        textureRef.current = null;
      }
    };

    disposeTexture();

    if (!texturePath) {
      return undefined;
    }

    const loader = new TextureLoader();
    let cancelled = false;
    loader.load(
      texturePath,
      (loaded) => {
        if (cancelled) {
          loaded.dispose();
          return;
        }
        loaded.colorSpace = SRGBColorSpace;
        loaded.wrapS = RepeatWrapping;
        loaded.wrapT = RepeatWrapping;
        loaded.repeat.set(
          Math.max(0.01, object.material.textureRepeat[0]),
          Math.max(0.01, object.material.textureRepeat[1])
        );
        textureRef.current = loaded;
        material.map = loaded;
        material.needsUpdate = true;
      },
      undefined,
      () => {
        if (!cancelled) {
          console.warn(`Failed to load procedural object texture: ${texturePath}`);
        }
      }
    );

    return () => {
      cancelled = true;
      disposeTexture();
    };
  }, [object.material.texture, object.material.textureRepeat]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    applyObjectRuntimeData(mesh, objectRegistry);
    const refs = objectRefs.current;
    refs.set(objectIndex, { mesh, radius: object.collisionRadius });
    onActorRef?.(actorId, mesh, object.collisionRadius);
    return () => {
      refs.delete(objectIndex);
      onActorRef?.(actorId, null, object.collisionRadius);
    };
  }, [actorId, object.collisionRadius, objectIndex, objectRefs, objectRegistry, onActorRef]);

  useEffect(() => {
    if (!object.animation?.collisionAware) {
      robotRef.current = null;
      return;
    }
    const robot = new Robot({
      direction: object.animation.direction,
      speed: object.animation.speed,
      swayAngle: object.animation.swayAngle,
      swaySpeed: object.animation.swaySpeed,
      bobDistance: object.animation.bobDistance,
      bobSpeed: object.animation.bobSpeed,
      turnJitter: object.animation.turnJitter,
      collisionRadius: object.collisionRadius,
      avoidDistance: object.animation.boundaryPadding + 0.5,
      boundaryPadding: object.animation.boundaryPadding,
      basePosition,
      baseRotation: new Vector3(baseRotation.x, baseRotation.y, baseRotation.z)
    });
    robot.attach(meshRef.current);
    robotRef.current = robot;
    return () => {
      robotRef.current = null;
    };
  }, [basePosition, baseRotation, object.animation, object.collisionRadius]);

  useEffect(() => {
    if (object.shape !== 'blob') {
      blobBasePositionsRef.current = null;
      blobPhaseRef.current = null;
      return;
    }
    const geometry = geometryRef.current;
    if (!geometry) return;
    const positionAttr = geometry.getAttribute('position');
    if (!positionAttr || !('array' in positionAttr)) return;
    const positionArray = positionAttr.array;
    if (!(positionArray instanceof Float32Array)) return;

    const basePositions = new Float32Array(positionArray.length);
    basePositions.set(positionArray);
    const phase = new Float32Array(positionArray.length / 3);
    for (let i = 0; i < phase.length; i += 1) {
      const x = basePositions[i * 3];
      const y = basePositions[i * 3 + 1];
      const z = basePositions[i * 3 + 2];
      const hash = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
      phase[i] = (hash - Math.floor(hash)) * Math.PI * 2;
    }
    blobBasePositionsRef.current = basePositions;
    blobPhaseRef.current = phase;
  }, [object.shape, object.radius, object.tubularSegments, object.radialSegments]);

  useFrame(({ clock }, delta) => {
    const mesh = meshRef.current;
    const material = materialRef.current;
    if (!mesh || !material) return;

    if (object.animation) {
      if (object.animation.collisionAware && robotRef.current) {
        const obstacles: Array<{ position: Vector3; radius: number }> = [];
        for (const [index, entry] of objectRefs.current.entries()) {
          if (index === objectIndex || !entry?.mesh) continue;
          obstacles.push({ position: entry.mesh.position, radius: entry.radius });
        }
        robotRef.current.update(delta, {
          collider,
          visitor,
          obstacles,
          roomBounds: roomBounds || null
        });
      } else {
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
        } = object.animation;

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

          let nextX = mesh.position.x + moveDir.current.x * speed * delta;
          let nextZ = mesh.position.z + moveDir.current.z * speed * delta;
          let collidedWithBounds = false;

          const minX = roomBounds.minX + boundaryPadding;
          const maxX = roomBounds.maxX - boundaryPadding;
          const minZ = roomBounds.minZ + boundaryPadding;
          const maxZ = roomBounds.maxZ - boundaryPadding;

          if (nextX <= minX || nextX >= maxX) {
            moveDir.current.x *= -1;
            collidedWithBounds = true;
            nextX = Math.max(minX, Math.min(maxX, nextX));
          }
          if (nextZ <= minZ || nextZ >= maxZ) {
            moveDir.current.z *= -1;
            collidedWithBounds = true;
            nextZ = Math.max(minZ, Math.min(maxZ, nextZ));
          }

          if (collidedWithBounds && turnJitter > 0) {
            const jitter = (Math.random() * 2 - 1) * turnJitter;
            const c = Math.cos(jitter);
            const s = Math.sin(jitter);
            const x = moveDir.current.x;
            const z = moveDir.current.z;
            moveDir.current.x = x * c - z * s;
            moveDir.current.z = x * s + z * c;
            moveDir.current.normalize();
          }

          mesh.position.x = nextX;
          mesh.position.z = nextZ;
          mesh.position.y = basePosition.y + Math.sin(t * bobSpeed) * bobDistance;
          mesh.rotation.y = baseRotation.y + Math.atan2(moveDir.current.x, moveDir.current.z);
        } else {
          mesh.position.x = basePosition.x + Math.sin(t * driftSpeed) * driftDistance;
          mesh.position.y = basePosition.y + Math.sin(t * bobSpeed) * bobDistance;
          mesh.position.z = basePosition.z;
          mesh.rotation.y = baseRotation.y;
        }

        mesh.rotation.x = baseRotation.x;
        mesh.rotation.z = baseRotation.z + Math.sin(t * swaySpeed) * swayAngle;
      }
    }

    if (object.shape === 'blob') {
      const geometry = geometryRef.current;
      const basePositions = blobBasePositionsRef.current;
      const phase = blobPhaseRef.current;
      if (geometry && basePositions && phase) {
        const positionAttr = geometry.getAttribute('position');
        if (positionAttr && 'array' in positionAttr && positionAttr.array instanceof Float32Array) {
          const positions = positionAttr.array;
          const t = clock.getElapsedTime() * object.blobSpeed;
          const amplitude = object.blobAmplitude;
          const frequency = object.blobFrequency;
          // Blob deformation: radial displacement from base sphere to mimic lava-lamp motion.
          for (let i = 0; i < phase.length; i += 1) {
            const idx = i * 3;
            const bx = basePositions[idx];
            const by = basePositions[idx + 1];
            const bz = basePositions[idx + 2];
            const length = Math.max(1e-6, Math.hypot(bx, by, bz));
            const nx = bx / length;
            const ny = by / length;
            const nz = bz / length;
            const p = phase[i];
            const waveA = Math.sin(t + p + length * frequency);
            const waveB = Math.sin(t * 1.7 + p * 0.7 + (bx + by + bz) * frequency * 0.55);
            const offset = amplitude * (waveA * 0.65 + waveB * 0.35);
            positions[idx] = bx + nx * offset;
            positions[idx + 1] = by + ny * offset;
            positions[idx + 2] = bz + nz * offset;
          }
          positionAttr.needsUpdate = true;
          blobNormalFrameCounter.current += 1;
          if (blobNormalFrameCounter.current % 2 === 0) {
            geometry.computeVertexNormals();
          }
        }
      }
    }

    if (object.material.realtimeEnvMap && cubeCamera && cubeRenderTarget) {
      frameCounter.current += 1;
      const refreshFrames = Math.max(1, object.material.envMapRefreshFrames);
      if (frameCounter.current % refreshFrames === 0) {
        mesh.getWorldPosition(cubeOrigin);
        const wasVisible = mesh.visible;
        mesh.visible = false;
        cubeCamera.position.copy(cubeOrigin);
        cubeCamera.update(gl, scene);
        mesh.visible = wasVisible;
      }
      if (material.envMap !== cubeRenderTarget.texture) {
        material.envMap = cubeRenderTarget.texture;
        material.needsUpdate = true;
      }
    }
  });

  return (
    <mesh
      ref={meshRef}
      name={actorId}
      position={object.position}
      rotation={object.rotation}
      scale={object.scale}
      userData={object.userData}
      castShadow={object.castShadow}
      receiveShadow={object.receiveShadow}
    >
      {object.shape === 'box' ? (
        <boxGeometry args={object.size} />
      ) : object.shape === 'torusKnot' ? (
        <torusKnotGeometry
          args={[
            object.radius,
            object.tube,
            Math.max(16, object.tubularSegments),
            Math.max(8, object.radialSegments),
            Math.max(2, object.p),
            Math.max(2, object.q)
          ]}
        />
      ) : object.shape === 'icosahedron' ? (
        <icosahedronGeometry args={[object.radius, Math.max(0, object.detail)]} />
      ) : object.shape === 'blob' ? (
        <sphereGeometry
          ref={geometryRef}
          args={[object.radius, Math.max(24, object.tubularSegments), Math.max(16, object.radialSegments)]}
        />
      ) : (
        <sphereGeometry args={[object.radius, Math.max(16, object.tubularSegments), Math.max(8, object.radialSegments)]} />
      )}
      <meshPhysicalMaterial
        ref={materialRef}
        color={object.material.color}
        metalness={object.material.metalness}
        roughness={object.material.roughness}
        emissive={object.material.emissive}
        emissiveIntensity={object.material.emissiveIntensity}
        envMapIntensity={object.material.envMapIntensity}
        transmission={object.material.transmission}
        thickness={object.material.thickness}
        ior={object.material.ior}
        clearcoat={object.material.clearcoat}
        clearcoatRoughness={object.material.clearcoatRoughness}
        reflectivity={object.material.reflectivity}
        opacity={object.material.opacity}
        transparent={object.material.opacity < 1 || object.material.transmission > 0}
      />
    </mesh>
  );
}

export function ProceduralObjects({
  objects,
  roomBounds,
  collider,
  visitor,
  onActorRef,
  objectRegistry
}: {
  objects: ProceduralObjectSpec[];
  roomBounds?: ProceduralRoomBounds;
  collider: Mesh | null;
  visitor: Visitor | null;
  onActorRef?: ProceduralActorRefCallback;
  objectRegistry?: ObjectRegistry;
}) {
  const objectRefs = useRef<Map<number, { mesh: Mesh; radius: number }>>(new Map());
  return (
    <>
      {objects.map((item, index) => {
        const key = item.id || `${item.shape}_${index}`;
        return (
          <AnimatedProceduralObject
            key={key}
            object={item}
            objectIndex={index}
            roomBounds={roomBounds}
            collider={collider}
            visitor={visitor}
            objectRefs={objectRefs}
            onActorRef={onActorRef}
            objectRegistry={objectRegistry}
          />
        );
      })}
    </>
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
type ProceduralActorRefCallback = (id: string, object: Object3D | null, radius: number) => void;

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
    const refs = modelRefs.current;
    refs.set(modelIndex, wrapper);
    onActorRef?.(actorId, wrapper, model.collisionRadius);
    return () => {
      refs.delete(modelIndex);
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

export function ProceduralRoomModels({
  models,
  roomBounds,
  collider,
  visitor,
  onActorRef,
  objectRegistry
}: {
  models: ProceduralModelSpec[];
  roomBounds?: ProceduralRoomBounds;
  collider: Mesh | null;
  visitor: Visitor | null;
  onActorRef?: ProceduralActorRefCallback;
  objectRegistry?: ObjectRegistry;
}) {
  const gltfs = useConfiguredGLTFs(models.map((item) => item.path));
  const modelRefs = useRef<Map<number, Group>>(new Map());

  return (
    <>
      {models.map((item, index) => {
        const gltf = gltfs[index] as GLTF | undefined;
        if (!gltf?.scene) return null;
        const clone = gltf.scene.clone(true);
        clone.name = item.id || clone.name;
        clone.traverse((object) => {
          applyObjectRuntimeData(object, objectRegistry);
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

export function ProceduralRoomModel({
  roomSpec,
  models,
  visitor,
  onActorRef,
  position,
  rotation,
  scale,
  onColliderReady,
  onSceneReady,
  objectRegistry
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
  objectRegistry?: ObjectRegistry;
}) {
  const wallBendRef = useRef<{
    speed: number;
    walls: Array<{
      mesh: Mesh;
      positionAttr: BufferAttribute;
      basePositions: Float32Array;
      bendAxis: 'x' | 'z';
      span: number;
      height: number;
      amplitude: number;
      frequency: number;
      phase: number;
      direction: 1 | -1;
    }>;
  } | null>(null);
  const wallTextureAnimationRef = useRef<{
    texture: Texture;
    speedX: number;
    speedY: number;
  } | null>(null);
  const animatedWallOverlayRef = useRef<{
    texture: CanvasTexture;
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
    speed: number;
    blobs: Array<{
      x: number;
      y: number;
      radius: number;
      ampX: number;
      ampY: number;
      phase: number;
      drift: number;
    }>;
  } | null>(null);

  const width = coercePositiveNumber(roomSpec?.width, 16);
  const depth = coercePositiveNumber(roomSpec?.depth, 16);
  const height = coercePositiveNumber(roomSpec?.height, 4);
  const wallThickness = coercePositiveNumber(roomSpec?.wallThickness, 0.2);
  const floorY = typeof roomSpec?.floorY === 'number' && Number.isFinite(roomSpec.floorY) ? roomSpec.floorY : 0;
  const chatPrintsConfig = roomSpec?.chatPrints && typeof roomSpec.chatPrints === 'object'
    ? (roomSpec.chatPrints as Record<string, unknown>)
    : undefined;
  const chatPrintsEnabled = chatPrintsConfig?.enabled !== false;
  const chatPrintsPollMs = Math.max(
    3_000,
    typeof chatPrintsConfig?.pollMs === 'number' && Number.isFinite(chatPrintsConfig.pollMs)
      ? chatPrintsConfig.pollMs
      : 12_000
  );
  const chatPrintsFetchLimit = Math.max(
    5,
    Math.floor(
      typeof chatPrintsConfig?.fetchLimit === 'number' && Number.isFinite(chatPrintsConfig.fetchLimit)
        ? chatPrintsConfig.fetchLimit
        : 180
    )
  );
  const chatPrintsMaxVisible = Math.max(
    5,
    Math.floor(
      typeof chatPrintsConfig?.maxVisible === 'number' && Number.isFinite(chatPrintsConfig.maxVisible)
        ? chatPrintsConfig.maxVisible
        : 72
    )
  );
  const chatPrintsBackgroundOpacity = clampValue(
    typeof chatPrintsConfig?.backgroundOpacity === 'number' && Number.isFinite(chatPrintsConfig.backgroundOpacity)
      ? chatPrintsConfig.backgroundOpacity
      : 0,
    0,
    1
  );
  const chatPrintsBackgroundColor =
    typeof chatPrintsConfig?.backgroundColor === 'string' ? chatPrintsConfig.backgroundColor : '#0e0e0e';
  const [surfacePrints, setSurfacePrints] = useState<SurfacePrint[]>([]);
  const fetchSurfacePrints = useCallback(async () => {
    if (!chatPrintsEnabled) {
      setSurfacePrints([]);
      return;
    }
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      return;
    }
    try {
      const response = await fetch(chatApiUrl(`/api/prints?limit=${chatPrintsFetchLimit}`));
      if (!response.ok) return;
      const payload = (await response.json()) as { ok?: boolean; prints?: Array<Record<string, unknown>> };
      if (!payload.ok || !Array.isArray(payload.prints)) return;
      const mapped = payload.prints
        .map((entry) => {
          const rawSurface = typeof entry.surface === 'string' ? entry.surface.toLowerCase() : '';
          const surface = ['north', 'south', 'east', 'west', 'floor'].includes(rawSurface)
            ? (rawSurface as SurfacePrint['surface'])
            : null;
          const text = typeof entry.text === 'string' ? entry.text.trim() : '';
          if (!surface || !text) return null;
          return {
            id: typeof entry.id === 'number' && Number.isFinite(entry.id) ? entry.id : Math.floor(Math.random() * 1_000_000_000),
            text,
            surface,
            u: clamp01(typeof entry.u === 'number' ? entry.u : 0.5),
            v: clamp01(typeof entry.v === 'number' ? entry.v : 0.5),
            rotation: typeof entry.rotation === 'number' && Number.isFinite(entry.rotation) ? entry.rotation : 0,
            scale: clampValue(typeof entry.scale === 'number' ? entry.scale : 1, 0.55, 1.9),
            color: typeof entry.color === 'string' ? entry.color : '#ece6dc',
            opacity: clampValue(typeof entry.opacity === 'number' ? entry.opacity : 0.85, 0.45, 0.98)
          } as SurfacePrint;
        })
        .filter((entry): entry is SurfacePrint => entry !== null)
        .slice(0, chatPrintsMaxVisible);
      setSurfacePrints(mapped);
    } catch {
      // Ignore transient API errors; existing prints stay visible.
    }
  }, [chatPrintsEnabled, chatPrintsFetchLimit, chatPrintsMaxVisible]);

  useEffect(() => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') {
      void fetchSurfacePrints();
    }
    if (!chatPrintsEnabled) return undefined;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchSurfacePrints();
      }
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchSurfacePrints();
      }
    }, chatPrintsPollMs);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [chatPrintsEnabled, chatPrintsPollMs, fetchSurfacePrints]);

  const renderedSurfacePrints = useMemo(() => {
    const halfW = width / 2;
    const halfD = depth / 2;
    const surfaceGap = 0.01;
    const wallInnerInset = wallThickness / 2;
    const seededUnit = (seed: number, salt: number) => {
      const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    return surfacePrints.map((print, idx) => {
      const styleSeed = Number.isFinite(print.id) ? print.id : idx + 1;
      const fontScaleJitter = 0.82 + seededUnit(styleSeed, 1) * 0.42; // 0.82..1.24
      const shadeJitter = (seededUnit(styleSeed, 2) - 0.5) * 0.28; // -0.14..0.14
      const layerDepth = idx * 0.0012;
      const panelWidth = clampValue(1.8 * print.scale, 0.45, 4.2);
      const panelHeight = clampValue(0.48 * print.scale, 0.2, 1.25);
      const fontSize = clampValue(0.11 * print.scale * fontScaleJitter, 0.05, 0.24);
      const localRotation = print.rotation;
      // Keep prints away from corners/edges so they don't intersect adjacent walls.
      const uMarginWall = clampValue(panelWidth / (2 * Math.max(width, depth)) + 0.015, 0, 0.45);
      const vMarginWall = clampValue(panelHeight / (2 * height) + 0.015, 0, 0.45);
      const uWall = clampValue(print.u, uMarginWall, 1 - uMarginWall);
      const vWall = clampValue(print.v, vMarginWall, 1 - vMarginWall);
      const uMarginFloor = clampValue(panelWidth / (2 * width) + 0.015, 0, 0.45);
      const vMarginFloor = clampValue(panelHeight / (2 * depth) + 0.015, 0, 0.45);
      const uFloor = clampValue(print.u, uMarginFloor, 1 - uMarginFloor);
      const vFloor = clampValue(print.v, vMarginFloor, 1 - vMarginFloor);
      const variedColor = new Color(print.color);
      variedColor.offsetHSL(0, 0, shadeJitter);
      let px = 0;
      let py = floorY + height * 0.5;
      let pz = 0;
      let rx = 0;
      let ry = 0;
      let rz = 0;

      if (print.surface === 'north') {
        px = -halfW + uWall * width;
        py = floorY + vWall * height;
        pz = -halfD + wallInnerInset + surfaceGap + layerDepth;
      } else if (print.surface === 'south') {
        px = -halfW + uWall * width;
        py = floorY + vWall * height;
        pz = halfD - wallInnerInset - surfaceGap - layerDepth;
        ry = Math.PI;
      } else if (print.surface === 'west') {
        px = -halfW + wallInnerInset + surfaceGap + layerDepth;
        py = floorY + vWall * height;
        pz = -halfD + uWall * depth;
        ry = Math.PI / 2;
      } else if (print.surface === 'east') {
        px = halfW - wallInnerInset - surfaceGap - layerDepth;
        py = floorY + vWall * height;
        pz = -halfD + uWall * depth;
        ry = -Math.PI / 2;
      } else {
        px = -halfW + uFloor * width;
        py = floorY + surfaceGap + layerDepth;
        pz = -halfD + vFloor * depth;
        rx = -Math.PI / 2;
      }

      rz += localRotation;
      return {
        id: print.id,
        text: print.text,
        panelWidth,
        panelHeight,
        fontSize,
        color: `#${variedColor.getHexString()}`,
        opacity: print.opacity,
        panelOpacity: chatPrintsBackgroundOpacity,
        panelColor: chatPrintsBackgroundColor,
        position: [px, py, pz] as Vector3Tuple,
        rotation: [rx, ry, rz] as Vector3Tuple
      };
    });
  }, [
    chatPrintsBackgroundColor,
    chatPrintsBackgroundOpacity,
    depth,
    floorY,
    height,
    wallThickness,
    surfacePrints,
    width
  ]);
  const roomBounds = useMemo<ProceduralRoomBounds>(() => {
    return {
      minX: -width / 2,
      maxX: width / 2,
      minZ: -depth / 2,
      maxZ: depth / 2
    };
  }, [depth, width]);

  const { displayScene, collider } = useMemo(() => {
    const wallThickness = coercePositiveNumber(roomSpec?.wallThickness, 0.2);
    const floorColor = typeof roomSpec?.floorColor === 'string' ? roomSpec.floorColor : '#2a2a2a';
    const wallColor = typeof roomSpec?.wallColor === 'string' ? roomSpec.wallColor : '#ece6dc';
    const ceilingColor = typeof roomSpec?.ceilingColor === 'string' ? roomSpec.ceilingColor : '#e6e6e6';
    const hasCeiling = roomSpec?.ceiling !== false;
    const roughness = typeof roomSpec?.roughness === 'number' ? roomSpec.roughness : 0.9;
    const metalness = typeof roomSpec?.metalness === 'number' ? roomSpec.metalness : 0.05;
    const wallPatternScale = coercePositiveNumber(roomSpec?.wallPatternScale, 4);
    const floorPatternScale = coercePositiveNumber(roomSpec?.floorPatternScale, 6);
    const wallTextureUrl = typeof roomSpec?.wallTexture === 'string' ? roomSpec.wallTexture : null;
    const wallTextureRepeatX = coercePositiveNumber(roomSpec?.wallTextureRepeatX, wallPatternScale);
    const wallTextureRepeatY = coercePositiveNumber(roomSpec?.wallTextureRepeatY, wallPatternScale * Math.max(0.5, height / 4));
    // Global performance guard: keep wall systems static on all devices.
    const wallTextureScrollX = 0;
    const wallTextureScrollY = 0;
    const wallBendEnabled = false;
    const wallBendAmplitude = coercePositiveNumber(roomSpec?.wallBendAmplitude, 0.18);
    const wallBendFrequency = coercePositiveNumber(roomSpec?.wallBendFrequency, 1.1);
    const wallBendSpeed = coercePositiveNumber(roomSpec?.wallBendSpeed, 0.9);
    const wallBendSegments = Math.max(2, Math.floor(coercePositiveNumber(roomSpec?.wallBendSegments, 20)));
    const animatedWallOverlay = false;
    const wallBlobOverlaySpeed = coercePositiveNumber(roomSpec?.wallBlobOverlaySpeed, 0.5);
    const wallBlobOverlayIntensity = coercePositiveNumber(roomSpec?.wallBlobOverlayIntensity, 0.22);
    const wallBlobOverlayScale = coercePositiveNumber(roomSpec?.wallBlobOverlayScale, wallPatternScale);
    const wallBlobOverlayColor =
      typeof roomSpec?.wallBlobOverlayColor === 'string' ? roomSpec.wallBlobOverlayColor : '#556b8f';
    const wallPatternTypeRaw = typeof roomSpec?.wallPatternType === 'string' ? roomSpec.wallPatternType : 'chevrons';
    const wallPatternType: ProceduralPatternType =
      ['chevrons', 'carpet', 'silhouettes', 'concrete', 'plaster'].includes(wallPatternTypeRaw)
        ? (wallPatternTypeRaw as ProceduralPatternType)
        : 'chevrons';
    const floorPatternTypeRaw = typeof roomSpec?.floorPatternType === 'string' ? roomSpec.floorPatternType : 'carpet';
    const floorPatternType: ProceduralPatternType =
      ['chevrons', 'carpet', 'silhouettes', 'concrete', 'plaster'].includes(floorPatternTypeRaw)
        ? (floorPatternTypeRaw as ProceduralPatternType)
        : 'carpet';
    const wallPattern = createPatternTexture(wallPatternType);
    const floorPattern = createPatternTexture(floorPatternType);
    if (wallPattern) {
      wallPattern.repeat.set(wallPatternScale, wallPatternScale * Math.max(0.5, height / 4));
    }
    if (floorPattern) {
      floorPattern.repeat.set(floorPatternScale, floorPatternScale * Math.max(0.75, depth / 14));
    }
    if (animatedWallOverlayRef.current?.texture) {
      animatedWallOverlayRef.current.texture.dispose();
      animatedWallOverlayRef.current = null;
    }
    if (wallTextureAnimationRef.current?.texture) {
      wallTextureAnimationRef.current.texture.dispose();
      wallTextureAnimationRef.current = null;
    }
    wallBendRef.current = null;

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

    const northWall = new Mesh(
      new BoxGeometry(width, height, wallThickness, wallBendSegments, wallBendSegments, 1),
      wallMaterial.clone()
    );
    northWall.name = 'NorthWall';
    northWall.position.set(0, wallHeightCenter, -halfD);
    northWall.castShadow = true;
    northWall.receiveShadow = true;
    northWall.userData.type = 'Wall';
    display.add(northWall);

    const southWall = new Mesh(
      new BoxGeometry(width, height, wallThickness, wallBendSegments, wallBendSegments, 1),
      wallMaterial.clone()
    );
    southWall.name = 'SouthWall';
    southWall.position.set(0, wallHeightCenter, halfD);
    southWall.castShadow = true;
    southWall.receiveShadow = true;
    southWall.userData.type = 'Wall';
    display.add(southWall);

    const westWall = new Mesh(
      new BoxGeometry(wallThickness, height, depth, 1, wallBendSegments, wallBendSegments),
      wallMaterial.clone()
    );
    westWall.name = 'WestWall';
    westWall.position.set(-halfW, wallHeightCenter, 0);
    westWall.castShadow = true;
    westWall.receiveShadow = true;
    westWall.userData.type = 'Wall';
    display.add(westWall);

    const eastWall = new Mesh(
      new BoxGeometry(wallThickness, height, depth, 1, wallBendSegments, wallBendSegments),
      wallMaterial.clone()
    );
    eastWall.name = 'EastWall';
    eastWall.position.set(halfW, wallHeightCenter, 0);
    eastWall.castShadow = true;
    eastWall.receiveShadow = true;
    eastWall.userData.type = 'Wall';
    display.add(eastWall);

    const wallMaterials = [northWall, southWall, westWall, eastWall]
      .map((wall) => wall.material)
      .filter((mat): mat is MeshStandardMaterial => mat instanceof MeshStandardMaterial);

    if (wallBendEnabled) {
      const createWallBendData = (
        mesh: Mesh,
        bendAxis: 'x' | 'z',
        span: number,
        direction: 1 | -1,
        phase: number
      ) => {
        const positionAttr = mesh.geometry.getAttribute('position');
        if (!(positionAttr instanceof BufferAttribute)) return null;
        const basePositions = new Float32Array(positionAttr.array.length);
        basePositions.set(positionAttr.array as ArrayLike<number>);
        return {
          mesh,
          positionAttr,
          basePositions,
          bendAxis,
          span,
          height,
          amplitude: wallBendAmplitude,
          frequency: wallBendFrequency,
          phase,
          direction
        };
      };

      const bendWalls = [
        createWallBendData(northWall, 'z', width, -1, 0),
        createWallBendData(southWall, 'z', width, 1, 1.2),
        createWallBendData(westWall, 'x', depth, -1, 2.4),
        createWallBendData(eastWall, 'x', depth, 1, 3.6)
      ].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

      wallBendRef.current = {
        speed: wallBendSpeed,
        walls: bendWalls
      };
    }

    if (wallTextureUrl) {
      const loader = new TextureLoader();
      loader.load(
        wallTextureUrl,
        (loaded) => {
          loaded.colorSpace = SRGBColorSpace;
          loaded.wrapS = RepeatWrapping;
          loaded.wrapT = RepeatWrapping;
          loaded.repeat.set(wallTextureRepeatX, wallTextureRepeatY);
          loaded.needsUpdate = true;
          wallTextureAnimationRef.current = {
            texture: loaded,
            speedX: wallTextureScrollX,
            speedY: wallTextureScrollY
          };
          wallMaterials.forEach((material) => {
            material.map = loaded;
            material.needsUpdate = true;
          });
        },
        undefined,
        (err) => {
          console.warn('Failed to load wall texture:', wallTextureUrl, err);
        }
      );
    }

    if (animatedWallOverlay && typeof document !== 'undefined') {
      const overlayCanvas = document.createElement('canvas');
      overlayCanvas.width = 1024;
      overlayCanvas.height = 1024;
      const overlayCtx = overlayCanvas.getContext('2d');
      if (overlayCtx) {
        const overlayTexture = new CanvasTexture(overlayCanvas);
        overlayTexture.wrapS = RepeatWrapping;
        overlayTexture.wrapT = RepeatWrapping;
        overlayTexture.repeat.set(wallBlobOverlayScale, wallBlobOverlayScale * Math.max(0.5, height / 4));
        overlayTexture.needsUpdate = true;
        const blobs = Array.from({ length: 8 }).map((_, idx) => ({
          x: 120 + idx * 110,
          y: 140 + (idx % 3) * 230,
          radius: 90 + (idx % 4) * 20,
          ampX: 22 + (idx % 3) * 10,
          ampY: 18 + (idx % 2) * 8,
          phase: idx * 0.9,
          drift: 0.35 + idx * 0.05
        }));
        animatedWallOverlayRef.current = {
          texture: overlayTexture,
          ctx: overlayCtx,
          width: overlayCanvas.width,
          height: overlayCanvas.height,
          speed: wallBlobOverlaySpeed,
          blobs
        };
        wallMaterials.forEach((material) => {
          material.emissive = new Color(wallBlobOverlayColor);
          material.emissiveIntensity = wallBlobOverlayIntensity;
          material.emissiveMap = overlayTexture;
          material.needsUpdate = true;
        });
      }
    }

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
  }, [depth, floorY, height, position, roomSpec, rotation, scale, width]);

  useFrame(({ clock }) => {
    const bendState = wallBendRef.current;
    if (bendState) {
      const t = clock.elapsedTime * bendState.speed;
      bendState.walls.forEach((wall) => {
        const arr = wall.positionAttr.array as Float32Array;
        const base = wall.basePositions;
        const axisIndex = wall.bendAxis === 'x' ? 0 : 2;
        for (let i = 0; i < arr.length; i += 3) {
          const bx = base[i];
          const by = base[i + 1];
          const bz = base[i + 2];
          const lateral = wall.bendAxis === 'z' ? bx : bz;
          const yNorm = Math.max(0, Math.min(1, by / wall.height + 0.5));
          const strength = 0.35 + 0.65 * yNorm;
          const wave = Math.sin((lateral / wall.span) * Math.PI * wall.frequency + t + wall.phase);
          const bend = wave * wall.amplitude * strength * wall.direction;
          arr[i] = bx;
          arr[i + 1] = by;
          arr[i + 2] = bz;
          arr[i + axisIndex] = base[i + axisIndex] + bend;
        }
        wall.positionAttr.needsUpdate = true;
        wall.mesh.geometry.computeVertexNormals();
      });
    }

    const movingWallTexture = wallTextureAnimationRef.current;
    if (movingWallTexture && (movingWallTexture.speedX !== 0 || movingWallTexture.speedY !== 0)) {
      const elapsed = clock.elapsedTime;
      movingWallTexture.texture.offset.set(
        elapsed * movingWallTexture.speedX,
        elapsed * movingWallTexture.speedY
      );
      movingWallTexture.texture.needsUpdate = true;
    }

    const overlay = animatedWallOverlayRef.current;
    if (!overlay) return;
    const t = clock.elapsedTime * overlay.speed;
    const { ctx, width: canvasW, height: canvasH, blobs, texture } = overlay;
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    blobs.forEach((blob) => {
      const x = blob.x + Math.sin(t + blob.phase) * blob.ampX + Math.cos(t * blob.drift) * blob.ampY;
      const y = blob.y + Math.cos(t + blob.phase * 1.7) * blob.ampY + Math.sin(t * blob.drift) * blob.ampX;
      const radius = blob.radius * (0.85 + 0.25 * Math.sin(t * 1.4 + blob.phase));
      const gradient = ctx.createRadialGradient(x, y, radius * 0.18, x, y, radius);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.42)');
      gradient.addColorStop(0.5, 'rgba(198, 210, 255, 0.2)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    });
    texture.needsUpdate = true;
  });

  useEffect(() => {
    onColliderReady?.(collider);
    onSceneReady?.();
    return () => {
      onColliderReady?.(null);
      wallTextureAnimationRef.current?.texture?.dispose?.();
      wallTextureAnimationRef.current = null;
      animatedWallOverlayRef.current?.texture?.dispose?.();
      animatedWallOverlayRef.current = null;
      collider?.geometry?.dispose?.();
    };
  }, [collider, onColliderReady, onSceneReady]);

  const [rx, ry, rz] = rotation;

  return (
    <group position={new Vector3(...position)} rotation={new Euler(rx, ry, rz)} scale={scale}>
      <primitive object={displayScene} dispose={null} />
      {chatPrintsEnabled ? (
        <group name="SurfacePrints">
          {renderedSurfacePrints.map((item, idx) => (
            <group
              key={`surface_print_${item.id}_${idx}`}
              position={new Vector3(...item.position)}
              rotation={new Euler(...item.rotation)}
            >
              {item.panelOpacity > 0 ? (
                <mesh renderOrder={40 + (idx % 40)}>
                  <planeGeometry args={[item.panelWidth, item.panelHeight]} />
                  <meshBasicMaterial
                    color={item.panelColor}
                    transparent
                    opacity={item.panelOpacity}
                    depthWrite={false}
                  />
                </mesh>
              ) : null}
              <Text
                position={[0, 0, 0.002]}
                fontSize={item.fontSize}
                maxWidth={item.panelWidth * 0.84}
                color={item.color}
                anchorX="center"
                anchorY="middle"
                textAlign="center"
                lineHeight={1.15}
              >
                {item.text}
              </Text>
            </group>
          ))}
        </group>
      ) : null}
      {models && models.length > 0 ? (
        <ProceduralRoomModels
          models={models}
          roomBounds={roomBounds}
          collider={collider}
          visitor={visitor}
          onActorRef={onActorRef}
          objectRegistry={objectRegistry}
        />
      ) : null}
    </group>
  );
}

export function GeneratedExhibitScene({
  roomSpec,
  models,
  objects,
  roomBounds,
  visitor,
  onActorRef,
  position,
  rotation,
  scale,
  onColliderReady,
  onSceneReady,
  objectRegistry
}: {
  roomSpec?: ProceduralRoomSpec;
  models?: ProceduralModelSpec[];
  objects?: ProceduralObjectSpec[];
  roomBounds?: ProceduralRoomBounds;
  visitor: Visitor | null;
  onActorRef?: ProceduralActorRefCallback;
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  scale: number;
  onColliderReady?: (collider: Mesh | null) => void;
  onSceneReady?: () => void;
  objectRegistry?: ObjectRegistry;
}) {
  const [roomCollider, setRoomCollider] = useState<Mesh | null>(null);
  const handleColliderReady = useCallback((nextCollider: Mesh | null) => {
    setRoomCollider(nextCollider);
    onColliderReady?.(nextCollider);
  }, [onColliderReady]);

  return (
    <>
      <ProceduralRoomModel
        roomSpec={roomSpec}
        models={models}
        visitor={visitor}
        onActorRef={onActorRef}
        position={position}
        rotation={rotation}
        scale={scale}
        onColliderReady={handleColliderReady}
        onSceneReady={onSceneReady}
        objectRegistry={objectRegistry}
      />
      {objects && objects.length > 0 ? (
        <ProceduralObjects
          objects={objects}
          roomBounds={roomBounds}
          collider={roomCollider}
          visitor={visitor}
          onActorRef={onActorRef}
          objectRegistry={objectRegistry}
        />
      ) : null}
    </>
  );
}
