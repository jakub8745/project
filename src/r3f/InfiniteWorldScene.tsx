import { Component, Suspense, useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Box3, Color, Fog, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Sphere, Vector3 } from 'three';
import type { ObjectRegistry } from '../modules/objectRegistry.js';
import { applyObjectRuntimeData } from '../modules/objectRegistry.js';
import Visitor from '../modules/Visitor.js';
import { runtimeAssetCandidates } from '../config/assetResolution';
import { useConfiguredGLTFs } from './useConfiguredGLTFs';
import { createWorldPositions, parseInfiniteWorld, seededRandom } from './infiniteWorld';
import type { ProceduralModelSpec } from './proceduralRoom/types';

export function InfiniteWorldScene({ source, models, visitor, onColliderReady, onSceneReady, objectRegistry }: {
  source: unknown; models: ProceduralModelSpec[]; visitor: Visitor | null;
  onColliderReady?: (collider: Mesh | null) => void; onSceneReady?: () => void; objectRegistry?: ObjectRegistry;
}) {
  const config = useMemo(() => parseInfiniteWorld(source), [source]);
  const { camera, scene } = useThree();
  const objects = useRef<Array<{ group: Group; radius: number }>>([]);
  const modelRadii = useRef<number[]>([]);
  const cameraForward = useRef(new Vector3());
  const recycleRandom = useMemo(() => seededRandom(config ? config.seed ^ config.recycleSeedXor : 1), [config]);
  const positions = useMemo(
    () => config ? createWorldPositions(models.length, config, models.map((model) => model.collisionRadius)) : [],
    [config, models]
  );
  useEffect(() => {
    if (!config) return;
    const oldFog = scene.fog;
    const fog = new Fog(new Color(config.fogColor), config.fogStart, config.fogEnd);
    scene.fog = fog;
    const geometry = new PlaneGeometry(1_000_000, 1_000_000);
    geometry.rotateX(-Math.PI / 2);
    const collider = new Mesh(geometry, new MeshBasicMaterial({ visible: false }));
    collider.name = 'infinite-world-collision-floor';
    collider.position.y = config.floorY;
    collider.visible = false;
    collider.updateMatrixWorld(true);
    geometry.computeBoundsTree?.();
    onColliderReady?.(config.floorCollision ? collider : null);
    // Model downloads are progressive and may be slow or unavailable. The field
    // is navigable once its configured floor/collider exists; one remote asset
    // must not hold the whole exhibit behind the global initialization timeout.
    onSceneReady?.();
    return () => {
      onColliderReady?.(null);
      scene.fog = oldFog;
      geometry.disposeBoundsTree?.();
      geometry.dispose();
      collider.material.dispose();
    };
  }, [config, scene, onColliderReady, onSceneReady]);

  useFrame((_, delta) => {
    if (!config || !visitor) return;
    const visitorPosition = visitor.position;
    for (let i = 0; i < objects.current.length; i += 1) {
      const object = objects.current[i];
      if (!object) continue;
      const group = object.group;
      const distance = Math.hypot(group.position.x - visitorPosition.x, group.position.z - visitorPosition.z) - object.radius;
      // Keep models alive beyond the fog end so Three.js fog, rather than a hard
      // visibility toggle, controls their gradual reveal.
      group.visible = distance <= config.recycleRadius;
      if (group.visible && config.visibleYawRadiansPerSecond !== 0) {
        group.rotation.y += config.visibleYawRadiansPerSecond * delta;
      }
    }
    if (!config.recyclingEnabled || models.length === 0) return;
    for (let recycled = 0; recycled < config.maxReplacementsPerFrame; recycled += 1) {
      let recycleIndex = -1;
      let greatestBehindDistance = 0;
      let fallbackIndex = -1;
      let furthest = config.recycleRadius;
      camera.getWorldDirection(cameraForward.current);
      cameraForward.current.y = 0;
      if (cameraForward.current.lengthSq() < 1e-8) break;
      cameraForward.current.normalize();
      const forwardX = cameraForward.current.x;
      const forwardZ = cameraForward.current.z;
      for (let i = 0; i < objects.current.length; i += 1) {
        const object = objects.current[i];
        if (!object) continue;
        const relativeX = object.group.position.x - visitorPosition.x;
        const relativeZ = object.group.position.z - visitorPosition.z;
        const distance = Math.hypot(relativeX, relativeZ) - object.radius;
        if (distance <= config.recycleRadius) continue;
        const behindDistance = -(relativeX * forwardX + relativeZ * forwardZ);
        if (behindDistance > greatestBehindDistance) {
          greatestBehindDistance = behindDistance;
          recycleIndex = i;
        }
        if (distance > furthest) {
          furthest = distance;
          fallbackIndex = i;
        }
      }
      if (recycleIndex < 0) recycleIndex = fallbackIndex;
      if (recycleIndex < 0) break;
      const entry = objects.current[recycleIndex];
      const forward = Math.atan2(forwardX, forwardZ);
      const offset = recycleRandom() < config.forwardBiasProbability
        ? (recycleRandom() * 2 - 1) * config.forwardBiasHalfAngleRadians
        : recycleRandom() * Math.PI * 2;
      const angle = forward + offset;
      const fogRear = Math.max(
        config.clearRadius + entry.radius + config.hiddenSafetyMarginMeters,
        config.fogEnd + entry.radius + config.hiddenSafetyMarginMeters
      );
      const hiddenLimit = Math.max(fogRear, config.recycleRadius - entry.radius - config.hiddenSafetyMarginMeters);
      const radius = fogRear + recycleRandom() * Math.min(config.destinationSearchDepthMeters, hiddenLimit - fogRear);
      entry.group.position.set(visitorPosition.x + Math.sin(angle) * radius, config.floorY, visitorPosition.z + Math.cos(angle) * radius);
      entry.group.rotation.y += config.replacementYawIncrementRadians;
      entry.group.visible = false;
    }
  });

  if (!config) return null;
  return <group name="infinite-world-models">
    {config.floorVisible ? <mesh position={[0, config.floorY, 0]} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
      <planeGeometry args={[1_000_000, 1_000_000]} />
      <meshStandardMaterial color={config.floorColor} />
    </mesh> : null}
    {config.debug ? [
      { radius: config.clearRadius, color: '#22c55e' },
      { radius: config.fogStart, color: '#eab308' },
      { radius: config.fogEnd, color: '#f97316' },
      { radius: config.recycleRadius, color: '#ef4444' }
    ].map(({ radius, color }) => <mesh key={radius} position={[0, config.floorY + 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false}>
      <ringGeometry args={[radius - 0.08, radius, 96]} />
      <meshBasicMaterial color={color} wireframe transparent opacity={0.55} depthWrite={false} />
    </mesh>) : null}
    {models.map((model, index) => {
      const placement = positions[index];
      return <group key={`${models[index]?.id || models[index]?.path}-${index}`} ref={(group) => {
        if (!group) { delete objects.current[index]; return; }
        objects.current[index] = { group, radius: (modelRadii.current[index] || 1) * Math.abs(group.scale.x) };
      }} position={placement?.position || [0, config.floorY, 0]} rotation={placement?.rotation || [0, 0, 0]} scale={placement?.scale || 1}>
        <AssetErrorBoundary key={model.path}>
          <Suspense fallback={null}>
            <WorldModel model={model} objectRegistry={objectRegistry} modelRadii={modelRadii} objects={objects} index={index} />
          </Suspense>
        </AssetErrorBoundary>
      </group>;
    })}
  </group>;
}

function WorldModel({ model, objectRegistry, modelRadii, objects, index }: {
  model: ProceduralModelSpec; objectRegistry?: ObjectRegistry; modelRadii: MutableRefObject<number[]>;
  objects: MutableRefObject<Array<{ group: Group; radius: number }>>; index: number;
}) {
  const candidates = useMemo(() => model.pathCandidates || runtimeAssetCandidates(model.asset), [model]);
  const paths = useMemo(() => [model.path], [model.path]);
  const candidateLists = useMemo(() => [candidates], [candidates]);
  const [gltf] = useConfiguredGLTFs(paths, candidateLists);
  const clone = useMemo(() => {
    const root = gltf.scene.clone(true) as Group;
    root.name = model.id || root.name;
    root.traverse((object) => {
      const mesh = object as Mesh;
      if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
      if (objectRegistry) applyObjectRuntimeData(object, objectRegistry);
    });
    const bounds = new Box3().setFromObject(root);
    if (!bounds.isEmpty()) {
      root.position.x -= (bounds.min.x + bounds.max.x) / 2;
      root.position.y -= bounds.min.y;
      root.position.z -= (bounds.min.z + bounds.max.z) / 2;
    }
    root.scale.setScalar(model.scale);
    return root;
  }, [gltf, model.id, model.scale, objectRegistry]);
  useEffect(() => {
    const bounds = new Box3().setFromObject(clone);
    const radius = bounds.getBoundingSphere(new Sphere()).radius;
    modelRadii.current[index] = radius;
    const entry = objects.current[index];
    if (entry) entry.radius = radius * Math.abs(entry.group.scale.x);
  }, [clone, index, model.scale, modelRadii, objects]);
  return <primitive object={clone} dispose={null} />;
}

class AssetErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) {
    console.warn('[InfiniteWorld] Model unavailable; continuing with remaining loaded assets.', error);
  }
  render() { return this.state.error ? null : this.props.children; }
}
