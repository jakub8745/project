import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BufferGeometry,
  Color,
  Line,
  LineBasicMaterial,
  Matrix4,
  Material,
  Mesh,
  Object3D,
  Raycaster,
  Vector2,
  Vector3
} from 'three';
import { resolveObjectRuntimeData, type ObjectRegistry, type ObjectRegistryEntry } from '../modules/objectRegistry.js';

const HOLD_DELAY_MS = 450;
const MOVE_CANCEL_THRESHOLD_PX = 8;
const DEFAULT_CLOCKWISE_Y_RADIANS_PER_SECOND = -0.45;
const XR_RAY_MAX_DISTANCE = 5;
const XR_RAY_HELPER_KEY = '__xrControllerRayHelper';
const HOVER_HIGHLIGHT_COLOR = new Color(0xff4081);
const DRAG_HIGHLIGHT_COLOR = new Color(0x38bdf8);

interface ObjectHoldRotationProps {
  enabled: boolean;
  objectRegistry?: ObjectRegistry;
}

type HighlightRecord = {
  mesh: Mesh;
  originalMaterial: Mesh['material'];
  highlightMaterial: Mesh['material'];
};

type HighlightMode = 'hover' | 'drag';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readHoldRotateConfig(entry: ObjectRegistryEntry | undefined) {
  if (!entry) return null;
  const interactions = asRecord(entry.interactions);
  const holdRotate =
    entry.holdRotate === true ||
    entry.holdRotation === true ||
    interactions?.holdRotate === true ||
    interactions?.holdRotation === true;

  if (!holdRotate) return null;

  const configuredSpeed =
    typeof entry.holdRotateSpeed === 'number'
      ? entry.holdRotateSpeed
      : typeof interactions?.holdRotateSpeed === 'number'
        ? interactions.holdRotateSpeed
        : undefined;

  return {
    speed:
      typeof configuredSpeed === 'number' && Number.isFinite(configuredSpeed)
        ? configuredSpeed
        : DEFAULT_CLOCKWISE_Y_RADIANS_PER_SECOND
  };
}

function getRegistryEntryForObject(object: Object3D, objectRegistry?: ObjectRegistry) {
  if (!objectRegistry) return undefined;
  const runtimeData = resolveObjectRuntimeData(object, objectRegistry);
  if (runtimeData?.entry) {
    return runtimeData.entry;
  }
  const userData = asRecord(object.userData) || {};
  const candidates = [
    asString(object.name),
    asString(userData.__objectRegistryKey),
    asString(userData.objectName),
    asString(userData.__objectName),
    asString(userData.name),
    asString(userData.__objectRef),
    asString(runtimeData?.ref),
    asString(userData.elementID),
    asString(userData.id)
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const entry = objectRegistry.get(candidate);
    if (entry) return entry;
  }
  return undefined;
}

function isXrRayHelper(object: Object3D | null) {
  let current: Object3D | null = object;
  while (current) {
    if (current.userData?.[XR_RAY_HELPER_KEY] === true) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function isVisibleInHierarchy(object: Object3D | null) {
  let current: Object3D | null = object;
  while (current) {
    if (current.visible === false) {
      return false;
    }
    current = current.parent;
  }
  return true;
}

function createXrControllerRay() {
  const geometry = new BufferGeometry().setFromPoints([
    new Vector3(0, 0, 0),
    new Vector3(0, 0, -1)
  ]);
  const material = new LineBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.9,
    depthTest: false
  });
  const line = new Line(geometry, material);
  line.name = 'line';
  line.scale.z = XR_RAY_MAX_DISTANCE;
  line.renderOrder = 1000;
  line.userData[XR_RAY_HELPER_KEY] = true;
  return line;
}

function cloneHighlightedMaterial(material: Material, color: Color, intensity: number) {
  const clone = material.clone();
  const highlightable = clone as Material & {
    color?: Color;
    emissive?: Color;
    emissiveIntensity?: number;
  };
  if (highlightable.emissive) {
    highlightable.emissive.copy(color);
    highlightable.emissiveIntensity = Math.max(intensity, highlightable.emissiveIntensity ?? 0);
  } else if (highlightable.color) {
    highlightable.color.lerp(color, intensity);
  }
  clone.needsUpdate = true;
  return clone;
}

function disposeHighlightMaterial(material: Mesh['material']) {
  const materials = Array.isArray(material) ? material : [material];
  materials.forEach((entry) => entry.dispose());
}

export function ObjectHoldRotation({ enabled, objectRegistry }: ObjectHoldRotationProps) {
  const { camera, scene, gl } = useThree();
  const raycaster = useMemo(() => new Raycaster(), []);
  const visualRaycaster = useMemo(() => new Raycaster(), []);
  const pointer = useMemo(() => new Vector2(), []);
  const candidateRef = useRef<Object3D | null>(null);
  const rotatingRef = useRef<Object3D | null>(null);
  const speedRef = useRef(DEFAULT_CLOCKWISE_Y_RADIANS_PER_SECOND);
  const holdTimerRef = useRef<number | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startRef = useRef({ x: 0, y: 0 });
  const xrControllerRef = useRef<Object3D | null>(null);
  const xrDraggedOriginalParentRef = useRef<Object3D | null>(null);
  const xrControllerRaysRef = useRef<Array<{ controller: Object3D; ray: Line }>>([]);
  const highlightRecordsRef = useRef<HighlightRecord[]>([]);
  const highlightedObjectRef = useRef<Object3D | null>(null);
  const highlightModeRef = useRef<HighlightMode | null>(null);

  const clearHighlight = useCallback(() => {
    highlightRecordsRef.current.forEach(({ mesh, originalMaterial, highlightMaterial }) => {
      mesh.material = originalMaterial;
      disposeHighlightMaterial(highlightMaterial);
    });
    highlightRecordsRef.current = [];
    highlightedObjectRef.current = null;
    highlightModeRef.current = null;
  }, []);

  const highlightObject = useCallback((object: Object3D | null, mode: HighlightMode) => {
    if (highlightedObjectRef.current === object && highlightModeRef.current === mode) return;
    clearHighlight();
    if (!object) return;

    const color = mode === 'drag' ? DRAG_HIGHLIGHT_COLOR : HOVER_HIGHLIGHT_COLOR;
    const intensity = mode === 'drag' ? 0.75 : 0.5;
    const records: HighlightRecord[] = [];
    object.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const originalMaterial = node.material;
      const highlightMaterial = Array.isArray(originalMaterial)
        ? originalMaterial.map((material) => cloneHighlightedMaterial(material, color, intensity))
        : cloneHighlightedMaterial(originalMaterial, color, intensity);
      node.material = highlightMaterial;
      records.push({ mesh: node, originalMaterial, highlightMaterial });
    });
    highlightRecordsRef.current = records;
    highlightedObjectRef.current = object;
    highlightModeRef.current = mode;
  }, [clearHighlight]);

  const clearHold = useCallback((source?: unknown) => {
    const wasRotating = Boolean(rotatingRef.current);
    const hadCandidate = Boolean(candidateRef.current);
    const object = rotatingRef.current;
    const originalParent = xrDraggedOriginalParentRef.current;
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (object && xrControllerRef.current) {
      if (originalParent) {
        originalParent.attach(object);
      } else {
        scene.attach(object);
      }
    }
    candidateRef.current = null;
    rotatingRef.current = null;
    xrControllerRef.current = null;
    xrDraggedOriginalParentRef.current = null;
    clearHighlight();
    pointerIdRef.current = null;
    speedRef.current = DEFAULT_CLOCKWISE_Y_RADIANS_PER_SECOND;
    if ((wasRotating || hadCandidate) && source instanceof Object3D) {
      source.userData.selected = undefined;
      source.userData.__xrHoldRotationSuppressSelectUntil = performance.now() + 350;
    }
  }, [clearHighlight, scene]);

  const findHoldRotationTarget = useCallback((object: Object3D) => {
    let current: Object3D | null = object;
    while (current) {
      const config = readHoldRotateConfig(getRegistryEntryForObject(current, objectRegistry));
      if (config) {
        return { object: current, speed: config.speed };
      }
      current = current.parent;
    }
    return null;
  }, [objectRegistry]);

  const collectHoldRotationRoots = useCallback(() => {
    const roots: Object3D[] = [];
    scene.traverse((object) => {
      if (object === scene || isXrRayHelper(object) || !isVisibleInHierarchy(object)) return;
      const target = findHoldRotationTarget(object);
      if (target?.object === object) {
        roots.push(object);
      }
    });
    return roots;
  }, [findHoldRotationTarget, scene]);

  const pickHoldRotationIntersectionFromRaycaster = useCallback((targetRaycaster: Raycaster, roots = collectHoldRotationRoots()) => {
    if (roots.length === 0) return null;

    const previousFirstHitOnly = targetRaycaster.firstHitOnly;
    targetRaycaster.firstHitOnly = false;
    try {
      return targetRaycaster
        .intersectObjects(roots, true)
        .find((intersection) => {
          if (isXrRayHelper(intersection.object) || !isVisibleInHierarchy(intersection.object)) return false;
          return Boolean(findHoldRotationTarget(intersection.object));
        }) ?? null;
    } finally {
      targetRaycaster.firstHitOnly = previousFirstHitOnly;
    }
  }, [collectHoldRotationRoots, findHoldRotationTarget]);

  const pickHoldRotationTargetFromCurrentRay = useCallback(() => {
    const hit = pickHoldRotationIntersectionFromRaycaster(raycaster);
    return hit ? findHoldRotationTarget(hit.object) : null;
  }, [findHoldRotationTarget, pickHoldRotationIntersectionFromRaycaster, raycaster]);

  const pickHoldRotationTarget = useCallback((event: PointerEvent) => {
    const bounds = gl.domElement.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    const y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    pointer.set(x, y);

    raycaster.setFromCamera(pointer, camera);
    return pickHoldRotationTargetFromCurrentRay();
  }, [camera, gl, pickHoldRotationTargetFromCurrentRay, pointer, raycaster]);

  useEffect(() => {
    if (!enabled) {
      clearHold();
      return undefined;
    }

    const canvas = gl.domElement;

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const target = pickHoldRotationTarget(event);
      if (!target) return;

      clearHold();
      candidateRef.current = target.object;
      speedRef.current = target.speed;
      pointerIdRef.current = event.pointerId;
      startRef.current = { x: event.clientX, y: event.clientY };
      holdTimerRef.current = window.setTimeout(() => {
        rotatingRef.current = candidateRef.current;
        highlightObject(rotatingRef.current, 'drag');
        holdTimerRef.current = null;
      }, HOLD_DELAY_MS);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (pointerIdRef.current !== event.pointerId || rotatingRef.current) return;
      const start = startRef.current;
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (moved > MOVE_CANCEL_THRESHOLD_PX) {
        clearHold();
      }
    };

    const onPointerEnd = (event: PointerEvent) => {
      if (pointerIdRef.current !== event.pointerId) return;
      clearHold();
    };

    const controllerRayOrigin = new Vector3();
    const controllerRayDirection = new Vector3();
    const controllerRotation = new Matrix4();
    const setRayFromController = (targetRaycaster: Raycaster, controller: Object3D) => {
      controller.updateMatrixWorld(true);
      const xrRaycaster = targetRaycaster as Raycaster & {
        setFromXRController?: (controller: Object3D) => void;
      };
      if (typeof xrRaycaster.setFromXRController === 'function') {
        xrRaycaster.setFromXRController(controller);
      } else {
        controllerRayOrigin.setFromMatrixPosition(controller.matrixWorld);
        controllerRotation.extractRotation(controller.matrixWorld);
        controllerRayDirection.set(0, 0, -1).applyMatrix4(controllerRotation).normalize();
        targetRaycaster.set(controllerRayOrigin, controllerRayDirection);
      }
    };

    const onXrSelectStart = (event: { target?: unknown; data?: { targetRayMode?: string } }) => {
      const controller = event.target instanceof Object3D ? event.target : null;
      if (!controller) return;
      setRayFromController(raycaster, controller);
      const target = pickHoldRotationTargetFromCurrentRay();
      if (!target) return;

      clearHold();
      const targetObject = target.object;
      candidateRef.current = targetObject;
      rotatingRef.current = targetObject;
      xrControllerRef.current = controller;
      xrDraggedOriginalParentRef.current = targetObject.parent;
      controller.attach(targetObject);
      highlightObject(targetObject, 'drag');
      controller.userData.selected = targetObject;
      controller.userData.targetRayMode = event.data?.targetRayMode;
    };

    const onXrSelectEnd = (event: { target?: unknown }) => {
      const controller = event.target instanceof Object3D ? event.target : null;
      clearHold(controller);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerEnd);
    canvas.addEventListener('pointercancel', onPointerEnd);
    canvas.addEventListener('mouseleave', clearHold);
    const xrControllers = [gl.xr.getController(0), gl.xr.getController(1)];
    const addedControllers: Object3D[] = [];
    const controllerRays: Array<{ controller: Object3D; ray: Line }> = [];
    xrControllers.forEach((controller) => {
      controller.addEventListener('selectstart', onXrSelectStart);
      controller.addEventListener('selectend', onXrSelectEnd);
      const ray = createXrControllerRay();
      ray.visible = false;
      controller.add(ray);
      controllerRays.push({ controller, ray });
      if (!controller.parent) {
        scene.add(controller);
        addedControllers.push(controller);
      }
    });
    xrControllerRaysRef.current = controllerRays;

    return () => {
      clearHold();
      xrControllerRaysRef.current = [];
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerEnd);
      canvas.removeEventListener('pointercancel', onPointerEnd);
      canvas.removeEventListener('mouseleave', clearHold);
      xrControllers.forEach((controller) => {
        controller.removeEventListener('selectstart', onXrSelectStart);
        controller.removeEventListener('selectend', onXrSelectEnd);
      });
      controllerRays.forEach(({ controller, ray }) => {
        controller.remove(ray);
        ray.traverse((object) => {
          const maybeMesh = object as Mesh;
          maybeMesh.geometry?.dispose?.();
          const material = maybeMesh.material;
          if (Array.isArray(material)) {
            material.forEach((entry) => entry.dispose?.());
          } else {
            material?.dispose?.();
          }
        });
      });
      addedControllers.forEach((controller) => {
        scene.remove(controller);
      });
    };
  }, [clearHold, enabled, gl, highlightObject, pickHoldRotationTarget, pickHoldRotationTargetFromCurrentRay, raycaster, scene, visualRaycaster]);

  useFrame((_, delta) => {
    let hoverTarget: Object3D | null = null;
    const xrPresenting = enabled && gl.xr.isPresenting;
    const holdRotationRoots = xrPresenting ? collectHoldRotationRoots() : [];
    xrControllerRaysRef.current.forEach(({ controller, ray }) => {
      if (!xrPresenting) {
        ray.visible = false;
        return;
      }
      const xrRaycaster = visualRaycaster as Raycaster & {
        setFromXRController?: (controller: Object3D) => void;
      };
      if (typeof xrRaycaster.setFromXRController === 'function') {
        xrRaycaster.setFromXRController(controller);
      } else {
        const rayOrigin = visualRaycaster.ray.origin;
        const rayDirection = visualRaycaster.ray.direction;
        const rayRotation = new Matrix4();
        controller.updateMatrixWorld(true);
        rayOrigin.setFromMatrixPosition(controller.matrixWorld);
        rayRotation.extractRotation(controller.matrixWorld);
        rayDirection.set(0, 0, -1).applyMatrix4(rayRotation).normalize();
      }
      const hit = pickHoldRotationIntersectionFromRaycaster(visualRaycaster, holdRotationRoots);
      ray.visible = true;
      ray.scale.z = hit ? hit.distance : XR_RAY_MAX_DISTANCE;

      if (!xrControllerRef.current && !hoverTarget && hit) {
        hoverTarget = findHoldRotationTarget(hit.object)?.object ?? null;
      }
    });
    if (!xrControllerRef.current) {
      if (hoverTarget) {
        highlightObject(hoverTarget, 'hover');
      } else if (highlightModeRef.current === 'hover') {
        clearHighlight();
      }
    }

    if (!enabled || !rotatingRef.current) return;
    if (xrControllerRef.current) {
      return;
    }
    rotatingRef.current.rotation.y += speedRef.current * delta;
  });

  return null;
}

export default ObjectHoldRotation;
