import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Matrix4, Object3D, Raycaster, Vector2, Vector3 } from 'three';
import { resolveObjectRuntimeData, type ObjectRegistry, type ObjectRegistryEntry } from '../modules/objectRegistry.js';

const HOLD_DELAY_MS = 450;
const MOVE_CANCEL_THRESHOLD_PX = 8;
const DEFAULT_CLOCKWISE_Y_RADIANS_PER_SECOND = -0.45;

interface ObjectHoldRotationProps {
  enabled: boolean;
  objectRegistry?: ObjectRegistry;
}

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

export function ObjectHoldRotation({ enabled, objectRegistry }: ObjectHoldRotationProps) {
  const { camera, scene, gl } = useThree();
  const raycaster = useMemo(() => new Raycaster(), []);
  const pointer = useMemo(() => new Vector2(), []);
  const candidateRef = useRef<Object3D | null>(null);
  const rotatingRef = useRef<Object3D | null>(null);
  const speedRef = useRef(DEFAULT_CLOCKWISE_Y_RADIANS_PER_SECOND);
  const holdTimerRef = useRef<number | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startRef = useRef({ x: 0, y: 0 });

  const clearHold = useCallback((source?: unknown) => {
    const wasRotating = Boolean(rotatingRef.current);
    const hadCandidate = Boolean(candidateRef.current);
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    candidateRef.current = null;
    rotatingRef.current = null;
    pointerIdRef.current = null;
    speedRef.current = DEFAULT_CLOCKWISE_Y_RADIANS_PER_SECOND;
    if ((wasRotating || hadCandidate) && source instanceof Object3D) {
      source.userData.__xrHoldRotationSuppressSelectUntil = performance.now() + 350;
    }
  }, []);

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

  const pickHoldRotationTargetFromCurrentRay = useCallback(() => {
    raycaster.firstHitOnly = true;
    const hit = raycaster
      .intersectObjects(scene.children, true)
      .find((intersection) => findHoldRotationTarget(intersection.object));

    return hit ? findHoldRotationTarget(hit.object) : null;
  }, [findHoldRotationTarget, raycaster, scene]);

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
    const setRayFromController = (controller: Object3D) => {
      controller.updateMatrixWorld(true);
      controllerRayOrigin.setFromMatrixPosition(controller.matrixWorld);
      controllerRotation.extractRotation(controller.matrixWorld);
      controllerRayDirection.set(0, 0, -1).applyMatrix4(controllerRotation).normalize();
      raycaster.set(controllerRayOrigin, controllerRayDirection);
    };

    const onXrSelectStart = (event: { target?: unknown }) => {
      const controller = event.target instanceof Object3D ? event.target : null;
      if (!controller) return;
      setRayFromController(controller);
      const target = pickHoldRotationTargetFromCurrentRay();
      if (!target) return;

      clearHold();
      candidateRef.current = target.object;
      speedRef.current = target.speed;
      holdTimerRef.current = window.setTimeout(() => {
        rotatingRef.current = candidateRef.current;
        holdTimerRef.current = null;
      }, HOLD_DELAY_MS);
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
    xrControllers.forEach((controller) => {
      controller.addEventListener('selectstart', onXrSelectStart);
      controller.addEventListener('selectend', onXrSelectEnd);
      if (!controller.parent) {
        scene.add(controller);
        addedControllers.push(controller);
      }
    });

    return () => {
      clearHold();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerEnd);
      canvas.removeEventListener('pointercancel', onPointerEnd);
      canvas.removeEventListener('mouseleave', clearHold);
      xrControllers.forEach((controller) => {
        controller.removeEventListener('selectstart', onXrSelectStart);
        controller.removeEventListener('selectend', onXrSelectEnd);
      });
      addedControllers.forEach((controller) => {
        scene.remove(controller);
      });
    };
  }, [clearHold, enabled, gl, pickHoldRotationTarget, pickHoldRotationTargetFromCurrentRay, raycaster, scene]);

  useFrame((_, delta) => {
    if (!enabled || !rotatingRef.current) return;
    rotatingRef.current.rotation.y += speedRef.current * delta;
  });

  return null;
}

export default ObjectHoldRotation;
