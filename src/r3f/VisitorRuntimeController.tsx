import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Group, Mesh, Object3D, Vector3 } from 'three';
import type { Vector3Tuple } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js';
import Visitor from '../modules/Visitor.js';
import type { ControllerParams } from './visitorControllerConfig';

const XR_SNAP_TURN_RADIANS = Math.PI / 6;
const XR_SNAP_TURN_THRESHOLD = 0.72;
const XR_SNAP_TURN_COOLDOWN_MS = 320;
const XR_JOYSTICK_DEADZONE = 0.16;

type VisitorRuntime = Visitor & {
  dispose?: () => void;
  fwdPressed: boolean;
  bkdPressed: boolean;
  lftPressed: boolean;
  rgtPressed: boolean;
  xrRig: Object3D | null;
  setJoystickInput: (x?: number, y?: number) => void;
};

function coerceVector(source: unknown, fallback: Vector3Tuple = [0, 0, 0]): Vector3Tuple {
  if (Array.isArray(source) && source.length === 3) {
    return [Number(source[0]) || 0, Number(source[1]) || 0, Number(source[2]) || 0];
  }
  if (source && typeof source === 'object') {
    const { x, y, z } = source as { x?: unknown; y?: unknown; z?: unknown };
    return [Number(x) || 0, Number(y) || 0, Number(z) || 0];
  }
  return fallback;
}

function toVector3(source: unknown, fallback: Vector3Tuple = [0, 0, 0]): Vector3 {
  const [x, y, z] = coerceVector(source, fallback);
  return new Vector3(x, y, z);
}

function applyXrAxisDeadzone(value: number) {
  if (!Number.isFinite(value) || Math.abs(value) < XR_JOYSTICK_DEADZONE) {
    return 0;
  }
  const sign = Math.sign(value);
  return sign * ((Math.abs(value) - XR_JOYSTICK_DEADZONE) / (1 - XR_JOYSTICK_DEADZONE));
}

function readGamepadAxes(gamepad?: Gamepad) {
  const axes = gamepad?.axes;
  if (!axes || axes.length < 2) {
    return null;
  }

  const candidates: Array<[number, number]> = [];
  if (axes.length >= 4) {
    candidates.push([2, 3]);
  }
  candidates.push([0, 1]);
  for (let index = 0; index + 1 < axes.length; index += 2) {
    if (!candidates.some(([xIndex, yIndex]) => xIndex === index && yIndex === index + 1)) {
      candidates.push([index, index + 1]);
    }
  }

  let best = { x: 0, y: 0, magnitudeSq: 0 };
  candidates.forEach(([xIndex, yIndex]) => {
    const x = applyXrAxisDeadzone(Number(axes[xIndex]) || 0);
    const y = applyXrAxisDeadzone(Number(axes[yIndex]) || 0);
    const magnitudeSq = x * x + y * y;
    if (magnitudeSq > best.magnitudeSq) {
      best = { x, y, magnitudeSq };
    }
  });

  return best.magnitudeSq > 0 ? { x: best.x, y: best.y } : null;
}

function readXrControllerInput(session: XRSession | null) {
  if (!session?.inputSources) {
    return {
      move: { x: 0, y: 0 },
      turn: 0
    };
  }

  let move: { x: number; y: number } | null = null;
  let fallback: { x: number; y: number } | null = null;
  let right: { x: number; y: number } | null = null;

  for (const inputSource of session.inputSources) {
    const axes = readGamepadAxes(inputSource.gamepad);
    if (!axes) continue;
    if (inputSource.handedness === 'left') {
      move = axes;
    } else if (inputSource.handedness === 'right') {
      right = axes;
    } else {
      fallback ??= axes;
    }
  }

  return {
    move: move ?? fallback ?? { x: 0, y: 0 },
    turn: right?.x ?? 0
  };
}

export function FirstPersonController({
  collider,
  params,
  enabled,
  interactionLocked = false,
  onVisitorReady,
  onVisitorActivity
}: {
  collider: Mesh | null;
  params?: ControllerParams;
  enabled?: boolean;
  interactionLocked?: boolean;
  onVisitorReady?: (visitor: Visitor | null) => void;
  onVisitorActivity?: () => void;
}) {
  const { camera, gl, scene } = useThree();
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | undefined;
  const xrRig = useMemo(() => {
    const rig = new Group();
    rig.name = 'xr-visitor-rig';
    return rig;
  }, []);

  const visitor = useMemo<VisitorRuntime | null>(() => {
    if (enabled === false) return null;
    if (!controls) return null;
    const heightOffsetVec = toVector3(params?.heightOffset, [0, 1.05, 0]);
    const visitorEnterVec = toVector3(params?.visitorEnter, [0, 10, 0]);
    const defaults = {
      visitorSpeed: typeof params?.visitorSpeed === 'number' ? params.visitorSpeed : 2.5,
      gravity: typeof params?.gravity === 'number' ? params.gravity : -9,
      heightOffset: heightOffsetVec,
      rotateOrbit: typeof params?.rotateOrbit === 'number' ? params.rotateOrbit : 15,
      visitorEnter: visitorEnterVec,
      autoMoveSpeed: typeof params?.autoMoveSpeed === 'number' ? params.autoMoveSpeed : 5,
      movementAcceleration: typeof params?.movementAcceleration === 'number' ? params.movementAcceleration : 18,
      movementDeceleration: typeof params?.movementDeceleration === 'number' ? params.movementDeceleration : 30,
      spawnDirection: params?.spawnDirection,
      visitorDirection: params?.visitorDirection
    };
    return new Visitor({
      camera,
      controls,
      params: defaults,
      renderer: gl,
      xrRig: null
    }) as VisitorRuntime;
  }, [camera, controls, enabled, gl, params]);

  const lastPosition = useRef<Vector3 | null>(null);
  const lastAngle = useRef<number | null>(null);
  const lastActivityStamp = useRef(0);
  const lastXrSnapTurnAt = useRef(0);
  const xrTurnReady = useRef(true);

  useEffect(() => {
    if (!visitor) return undefined;
    onVisitorReady?.(visitor);
    scene.add(visitor);
    if (controls) {
      controls.enablePan = false;
      controls.enableZoom = false;
      controls.minDistance = 1e-4;
      controls.maxDistance = 1e-4;
      camera.position.copy(controls.target).add(new Vector3(0, 0, 1e-4));
      controls.update();
    }
    visitor.reset?.();

    return () => {
      visitor.dispose?.();
      scene.remove(visitor);
      onVisitorReady?.(null);
    };
  }, [camera, controls, onVisitorReady, params, scene, visitor]);

  useEffect(() => {
    if (!visitor) return;
    if (interactionLocked) {
      visitor.fwdPressed = false;
      visitor.bkdPressed = false;
      visitor.lftPressed = false;
      visitor.rgtPressed = false;
      visitor.setJoystickInput(0, 0);
      visitor.isAutoMoving = false;
    }
  }, [interactionLocked, visitor]);

  useEffect(() => {
    if (!visitor) return undefined;
    const xrControllerObjects = [
      gl.xr.getController(0),
      gl.xr.getController(1),
      gl.xr.getControllerGrip(0),
      gl.xr.getControllerGrip(1)
    ];
    const parentXrControllersToRig = () => {
      xrControllerObjects.forEach((controller) => {
        xrRig.add(controller);
      });
    };
    const parentXrControllersToScene = () => {
      xrControllerObjects.forEach((controller) => {
        scene.add(controller);
      });
    };
    const updateRigReference = () => {
      if (!xrRig.parent) {
        scene.add(xrRig);
      }
      xrRig.attach(camera);
      camera.position.set(0, 0, 0);
      camera.rotation.set(0, 0, 0);
      camera.scale.set(1, 1, 1);
      parentXrControllersToRig();
      visitor.xrRig = xrRig;
      xrRig.position.copy(visitor.position);
    };
    const handleSessionStart = () => {
      if (controls) {
        controls.enabled = false;
      }
      updateRigReference();
    };
    const handleSessionEnd = () => {
      parentXrControllersToScene();
      scene.attach(camera);
      if (xrRig.parent === scene) {
        scene.remove(xrRig);
      }
      xrRig.position.set(0, 0, 0);
      xrRig.rotation.set(0, 0, 0);
      visitor.xrRig = null;
      visitor.setJoystickInput(0, 0);
      if (controls) {
        controls.enabled = true;
      }
    };

    gl.xr.addEventListener('sessionstart', handleSessionStart);
    gl.xr.addEventListener('sessionend', handleSessionEnd);

    return () => {
      gl.xr.removeEventListener('sessionstart', handleSessionStart);
      gl.xr.removeEventListener('sessionend', handleSessionEnd);
      parentXrControllersToScene();
      scene.attach(camera);
      if (xrRig.parent === scene) {
        scene.remove(xrRig);
      }
      xrRig.position.set(0, 0, 0);
      xrRig.rotation.set(0, 0, 0);
      visitor.xrRig = null;
      visitor.setJoystickInput(0, 0);
      if (controls) {
        controls.enabled = true;
      }
    };
  }, [camera, controls, gl, scene, visitor, xrRig]);

  useFrame((_, delta) => {
    if (!visitor || !collider) return;
    if (controls) {
      controls.enabled = !interactionLocked && !gl.xr.isPresenting;
    }
    if (gl.xr.isPresenting && !interactionLocked) {
      const input = readXrControllerInput(gl.xr.getSession());
      visitor.setJoystickInput(input.move.x, -input.move.y);
      const now = performance.now();
      if (Math.abs(input.turn) < 0.35) {
        xrTurnReady.current = true;
      } else if (
        xrTurnReady.current &&
        Math.abs(input.turn) >= XR_SNAP_TURN_THRESHOLD &&
        now - lastXrSnapTurnAt.current >= XR_SNAP_TURN_COOLDOWN_MS
      ) {
        const turnAmount = input.turn > 0 ? -XR_SNAP_TURN_RADIANS : XR_SNAP_TURN_RADIANS;
        if (visitor.xrRig) {
          visitor.xrRig.rotation.y += turnAmount;
        }
        visitor.rotation.y += turnAmount;
        lastXrSnapTurnAt.current = now;
        xrTurnReady.current = false;
      }
    } else if (gl.xr.isPresenting) {
      visitor.setJoystickInput(0, 0);
    }
    if (interactionLocked) return;
    visitor.update(delta, collider);

    const now = performance.now();
    if (!lastPosition.current) {
      lastPosition.current = visitor.position.clone();
    }
    const angle = controls?.getAzimuthalAngle?.();
    const angleChanged =
      typeof angle === 'number' &&
      (lastAngle.current === null || Math.abs(angle - lastAngle.current) > 0.01);
    const moved = lastPosition.current.distanceToSquared(visitor.position) > 1e-4 || visitor.isAutoMoving;

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
