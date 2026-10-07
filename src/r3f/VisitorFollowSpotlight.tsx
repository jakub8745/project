import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Object3D, SpotLight, Vector3 } from 'three';

export interface VisitorFollowSpotlightSettings {
  enabled: boolean;
  color: string;
  intensity: number;
  rangeMeters: number;
  coneAngleRadians: number;
  penumbra: number;
  attenuationExponent: number;
  castsShadows: boolean;
  aimDistanceMeters: number;
}

/** A configured light whose position and aim follow the active visitor view. */
export function VisitorFollowSpotlight({ settings, active }: {
  settings?: VisitorFollowSpotlightSettings;
  active: boolean;
}) {
  const { camera, scene } = useThree();
  const lightRef = useRef<SpotLight | null>(null);
  const targetRef = useRef<Object3D | null>(null);
  const direction = useRef(new Vector3());
  const position = useRef(new Vector3());

  useEffect(() => {
    if (!active || !settings?.enabled) return undefined;

    const target = new Object3D();
    target.name = 'visitor-follow-spotlight-target';

    const light = new SpotLight(
      settings.color,
      settings.intensity,
      settings.rangeMeters,
      settings.coneAngleRadians,
      settings.penumbra,
      settings.attenuationExponent
    );
    light.name = 'visitor-follow-spotlight';
    light.castShadow = settings.castsShadows;
    light.target = target;

    // Keep the light in the render scene. The active camera is not guaranteed to be
    // a child of the scene, so camera parenting can leave Three.js unaware of it.
    scene.add(target, light);
    targetRef.current = target;
    lightRef.current = light;
    return () => {
      scene.remove(target, light);
      targetRef.current = null;
      lightRef.current = null;
    };
  }, [active, scene, settings]);

  useFrame(() => {
    if (!active || !settings?.enabled) return;
    const light = lightRef.current;
    const target = targetRef.current;
    if (!light || !target) return;

    camera.updateMatrixWorld(true);
    camera.getWorldPosition(position.current);
    camera.getWorldDirection(direction.current);
    light.position.copy(position.current);
    target.position.copy(position.current).addScaledVector(direction.current, settings.aimDistanceMeters);
    light.updateMatrixWorld(true);
    target.updateMatrixWorld(true);
  });

  return null;
}
