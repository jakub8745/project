import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  AmbientLight,
  Color,
  DirectionalLight,
  EquirectangularReflectionMapping,
  HemisphereLight,
  LinearFilter,
  LinearMipmapLinearFilter,
  SpotLight,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  type Vector3Tuple,
  type WebGLRenderer
} from 'three';

import { getKtx2Loader } from '../loaders/ktx2Loader';

const DEFAULT_BACKGROUND = '#111827';
const ktx2SupportedRenderers = new WeakSet<WebGLRenderer>();

export type SceneLightSettings = {
  ambientColor: string;
  ambientIntensity: number;
  hemisphereSkyColor: string;
  hemisphereGroundColor: string;
  hemisphereIntensity: number;
  directionalColor: string;
  directionalIntensity: number;
  directionalPosition: Vector3Tuple;
  directionalCastShadow: boolean;
  directionalShadowMapSize: number;
  directionalShadowBias: number;
  directionalShadowNormalBias: number;
  directionalShadowCameraSize: number;
  spotColor: string;
  spotIntensity: number;
  spotPosition: Vector3Tuple;
  spotTarget: Vector3Tuple;
  spotAngle: number;
  spotPenumbra: number;
  spotDistance: number;
  spotDecay: number;
  spotCastShadow: boolean;
  spotShadowMapSize: number;
  spotShadowBias: number;
  spotShadowNormalBias: number;
  transitionSeconds: number;
};

function ensureKtx2Support(renderer: WebGLRenderer) {
  if (ktx2SupportedRenderers.has(renderer)) return;
  try {
    getKtx2Loader(renderer).detectSupport(renderer);
    ktx2SupportedRenderers.add(renderer);
  } catch (err) {
    console.warn('KTX2 detectSupport failed:', err);
  }
}

async function loadEquirectTexture(textureUrl: string, gl: WebGLRenderer): Promise<Texture> {
  let texture: Texture;
  const isKtx2 = textureUrl.toLowerCase().endsWith('.ktx2');
  if (isKtx2) {
    ensureKtx2Support(gl);
    texture = await getKtx2Loader(gl).loadAsync(textureUrl);
  } else {
    const loader = new TextureLoader();
    texture = await loader.loadAsync(textureUrl);
  }
  texture.colorSpace = SRGBColorSpace;
  texture.mapping = EquirectangularReflectionMapping;
  if (!(texture as Texture & { isCompressedTexture?: boolean }).isCompressedTexture) {
    texture.magFilter = LinearFilter;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
  }
  texture.needsUpdate = true;
  return texture;
}

type SharedEquirectTextureEntry = {
  refs: number;
  texture: Texture | null;
  promise: Promise<Texture> | null;
};

const sharedEquirectTextureCache = new WeakMap<WebGLRenderer, Map<string, SharedEquirectTextureEntry>>();

function getSharedEquirectTextureMap(gl: WebGLRenderer): Map<string, SharedEquirectTextureEntry> {
  let cache = sharedEquirectTextureCache.get(gl);
  if (!cache) {
    cache = new Map<string, SharedEquirectTextureEntry>();
    sharedEquirectTextureCache.set(gl, cache);
  }
  return cache;
}

async function acquireSharedEquirectTexture(textureUrl: string, gl: WebGLRenderer): Promise<Texture> {
  const cache = getSharedEquirectTextureMap(gl);
  let entry = cache.get(textureUrl);
  if (!entry) {
    entry = {
      refs: 0,
      texture: null,
      promise: null
    };
    cache.set(textureUrl, entry);
  }

  entry.refs += 1;
  if (entry.texture) {
    return entry.texture;
  }

  if (!entry.promise) {
    entry.promise = loadEquirectTexture(textureUrl, gl)
      .then((texture) => {
        entry!.texture = texture;
        entry!.promise = null;
        if (entry!.refs <= 0) {
          cache.delete(textureUrl);
          texture.dispose();
        }
        return texture;
      })
      .catch((error) => {
        if (cache.get(textureUrl) === entry) {
          cache.delete(textureUrl);
        }
        entry!.promise = null;
        throw error;
      });
  }

  return entry.promise;
}

function releaseSharedEquirectTexture(textureUrl: string, gl: WebGLRenderer) {
  const cache = sharedEquirectTextureCache.get(gl);
  if (!cache) return;
  const entry = cache.get(textureUrl);
  if (!entry) return;

  entry.refs = Math.max(0, entry.refs - 1);
  if (entry.refs > 0) {
    return;
  }
  if (entry.texture) {
    cache.delete(textureUrl);
    entry.texture.dispose();
    entry.texture = null;
    return;
  }
  if (!entry.promise) {
    cache.delete(textureUrl);
  }
}

export function SceneBackground({
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
    let acquiredTextureUrl: string | null = null;
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
        const texture = await acquireSharedEquirectTexture(textureUrl, gl);
        if (disposed) {
          releaseSharedEquirectTexture(textureUrl, gl);
          return;
        }
        loadedTexture = texture;
        acquiredTextureUrl = textureUrl;
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

    void loadBackground();

    return () => {
      disposed = true;
      if (loadedTexture) {
        if (scene.background === loadedTexture) {
          scene.background = null;
        }
        if (acquiredTextureUrl) {
          releaseSharedEquirectTexture(acquiredTextureUrl, gl);
        }
      } else if (scene.background === fallbackColor) {
        scene.background = null;
      }
      scene.backgroundBlurriness = previousBlurriness;
      scene.backgroundIntensity = previousIntensity;
    };
  }, [textureUrl, blurriness, intensity, scene, gl, fallbackColor]);

  return null;
}

export function SceneEnvironment({
  textureUrl,
  intensity
}: {
  textureUrl?: string | null;
  intensity?: number;
}) {
  const { scene, gl } = useThree();

  useEffect(() => {
    if (!textureUrl) return undefined;

    let disposed = false;
    let loadedTexture: Texture | null = null;
    let acquiredTextureUrl: string | null = null;
    const previousEnvironment = scene.environment;
    const previousIntensity = scene.environmentIntensity ?? 1;
    const targetIntensity = typeof intensity === 'number' ? intensity : 1;

    const loadEnvironment = async () => {
      try {
        const texture = await acquireSharedEquirectTexture(textureUrl, gl);
        if (disposed) {
          releaseSharedEquirectTexture(textureUrl, gl);
          return;
        }
        loadedTexture = texture;
        acquiredTextureUrl = textureUrl;
        scene.environment = texture;
        scene.environmentIntensity = targetIntensity;
      } catch (err) {
        if (!disposed) {
          console.warn('Failed to load environment texture:', textureUrl, err);
        }
      }
    };

    void loadEnvironment();

    return () => {
      disposed = true;
      if (loadedTexture) {
        if (scene.environment === loadedTexture) {
          scene.environment = previousEnvironment;
        }
        if (acquiredTextureUrl) {
          releaseSharedEquirectTexture(acquiredTextureUrl, gl);
        }
      } else if (scene.environment !== previousEnvironment) {
        scene.environment = previousEnvironment;
      }
      scene.environmentIntensity = previousIntensity;
    };
  }, [textureUrl, intensity, scene, gl]);

  return null;
}

export function SceneLightRig({ settings }: { settings: SceneLightSettings }) {
  const ambientRef = useRef<AmbientLight | null>(null);
  const hemisphereRef = useRef<HemisphereLight | null>(null);
  const directionalRef = useRef<DirectionalLight | null>(null);
  const spotRef = useRef<SpotLight | null>(null);
  const { scene } = useThree();
  const currentRef = useRef({
    ambientColor: new Color(settings.ambientColor),
    ambientIntensity: settings.ambientIntensity,
    hemisphereSkyColor: new Color(settings.hemisphereSkyColor),
    hemisphereGroundColor: new Color(settings.hemisphereGroundColor),
    hemisphereIntensity: settings.hemisphereIntensity,
    directionalColor: new Color(settings.directionalColor),
    directionalIntensity: settings.directionalIntensity,
    directionalPosition: new Vector3(...settings.directionalPosition),
    spotColor: new Color(settings.spotColor),
    spotIntensity: settings.spotIntensity,
    spotPosition: new Vector3(...settings.spotPosition),
    spotTarget: new Vector3(...settings.spotTarget),
    spotAngle: settings.spotAngle,
    spotPenumbra: settings.spotPenumbra,
    spotDistance: settings.spotDistance,
    spotDecay: settings.spotDecay
  });

  useEffect(() => {
    const light = spotRef.current;
    if (!light) return;
    scene.add(light.target);
    return () => {
      scene.remove(light.target);
    };
  }, [scene]);

  useFrame((_, delta) => {
    const transition = Math.max(0, settings.transitionSeconds);
    const factor = transition <= 0 ? 1 : 1 - Math.exp(-delta / transition);
    const current = currentRef.current;

    current.ambientColor.lerp(new Color(settings.ambientColor), factor);
    current.ambientIntensity += (settings.ambientIntensity - current.ambientIntensity) * factor;
    current.hemisphereSkyColor.lerp(new Color(settings.hemisphereSkyColor), factor);
    current.hemisphereGroundColor.lerp(new Color(settings.hemisphereGroundColor), factor);
    current.hemisphereIntensity += (settings.hemisphereIntensity - current.hemisphereIntensity) * factor;
    current.directionalColor.lerp(new Color(settings.directionalColor), factor);
    current.directionalIntensity += (settings.directionalIntensity - current.directionalIntensity) * factor;
    current.directionalPosition.lerp(new Vector3(...settings.directionalPosition), factor);
    current.spotColor.lerp(new Color(settings.spotColor), factor);
    current.spotIntensity += (settings.spotIntensity - current.spotIntensity) * factor;
    current.spotPosition.lerp(new Vector3(...settings.spotPosition), factor);
    current.spotTarget.lerp(new Vector3(...settings.spotTarget), factor);
    current.spotAngle += (settings.spotAngle - current.spotAngle) * factor;
    current.spotPenumbra += (settings.spotPenumbra - current.spotPenumbra) * factor;
    current.spotDistance += (settings.spotDistance - current.spotDistance) * factor;
    current.spotDecay += (settings.spotDecay - current.spotDecay) * factor;

    const ambient = ambientRef.current;
    if (ambient) {
      ambient.color.copy(current.ambientColor);
      ambient.intensity = current.ambientIntensity;
    }
    const hemisphere = hemisphereRef.current;
    if (hemisphere) {
      hemisphere.color.copy(current.hemisphereSkyColor);
      hemisphere.groundColor.copy(current.hemisphereGroundColor);
      hemisphere.intensity = current.hemisphereIntensity;
    }
    const directional = directionalRef.current;
    if (directional) {
      directional.color.copy(current.directionalColor);
      directional.intensity = current.directionalIntensity;
      directional.position.copy(current.directionalPosition);
      directional.updateMatrixWorld();
    }
    const spot = spotRef.current;
    if (spot) {
      spot.color.copy(current.spotColor);
      spot.intensity = current.spotIntensity;
      spot.position.copy(current.spotPosition);
      spot.angle = current.spotAngle;
      spot.penumbra = current.spotPenumbra;
      spot.distance = current.spotDistance;
      spot.decay = current.spotDecay;
      spot.target.position.copy(current.spotTarget);
      spot.target.updateMatrixWorld();
      spot.updateMatrixWorld();
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef} />
      <hemisphereLight ref={hemisphereRef} />
      <directionalLight
        ref={directionalRef}
        castShadow={settings.directionalCastShadow}
        shadow-mapSize-width={settings.directionalShadowMapSize}
        shadow-mapSize-height={settings.directionalShadowMapSize}
        shadow-bias={settings.directionalShadowBias}
        shadow-normalBias={settings.directionalShadowNormalBias}
        shadow-camera-near={0.1}
        shadow-camera-far={80}
        shadow-camera-left={-settings.directionalShadowCameraSize}
        shadow-camera-right={settings.directionalShadowCameraSize}
        shadow-camera-top={settings.directionalShadowCameraSize}
        shadow-camera-bottom={-settings.directionalShadowCameraSize}
      />
      <spotLight
        ref={spotRef}
        castShadow={settings.spotCastShadow}
        shadow-mapSize-width={settings.spotShadowMapSize}
        shadow-mapSize-height={settings.spotShadowMapSize}
        shadow-bias={settings.spotShadowBias}
        shadow-normalBias={settings.spotShadowNormalBias}
      />
    </>
  );
}
