import { useEffect, useMemo, useState } from 'react';
import type { Vector3Tuple } from 'three';
import type { ExhibitConfig } from './useExhibitConfig';
import type { SceneLightSettings } from './ScenePresentation';
import type { ToneMappingName } from './toneMapping';

export type LightZoneRoute = {
  id?: string;
  surfaces: string[];
  lights?: Record<string, unknown>;
  params?: Record<string, unknown>;
  transitionSeconds?: number;
};

export function surfaceZoneRouteKey(route: { id?: string; surfaces: string[] }): string {
  return route.id || route.surfaces.join('|');
}

function coerceStringList(source: unknown): string[] {
  if (Array.isArray(source)) {
    return source
      .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      .map((value) => value.trim());
  }
  return typeof source === 'string' && source.trim() ? [source.trim()] : [];
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

function coercePositiveNumber(source: unknown, fallback: number): number {
  if (typeof source === 'number' && Number.isFinite(source) && source > 0) {
    return source;
  }
  return fallback;
}

function coerceOptionalNumber(source: unknown): number | undefined {
  return typeof source === 'number' && Number.isFinite(source) ? source : undefined;
}

function coerceNonNegativeNumber(source: unknown): number | undefined {
  return typeof source === 'number' && Number.isFinite(source) ? Math.max(0, source) : undefined;
}

function mergeZoneExposureParams(params: Record<string, unknown>, exposure: unknown): Record<string, unknown> {
  if (!exposure || typeof exposure !== 'object' || Array.isArray(exposure)) return params;
  const record = exposure as Record<string, unknown>;
  const result = { ...params };
  if (typeof record.value === 'number') result.exposure = record.value;
  if (typeof record.exposure === 'number') result.exposure = record.exposure;
  if (typeof record.target === 'number') result.exposureTarget = record.target;
  if (typeof record.exposureTarget === 'number') result.exposureTarget = record.exposureTarget;
  if (typeof record.min === 'number') result.exposureMin = record.min;
  if (typeof record.exposureMin === 'number') result.exposureMin = record.exposureMin;
  if (typeof record.max === 'number') result.exposureMax = record.max;
  if (typeof record.exposureMax === 'number') result.exposureMax = record.exposureMax;
  if (typeof record.sampleInterval === 'number') result.exposureSampleInterval = record.sampleInterval;
  if (typeof record.exposureSampleInterval === 'number') result.exposureSampleInterval = record.exposureSampleInterval;
  if (typeof record.autoExposure === 'boolean') result.autoExposure = record.autoExposure;
  return result;
}

export function parseLightZoneRoutes(config: ExhibitConfig | null): LightZoneRoute[] {
  if (!Array.isArray(config?.lightZones)) {
    return [];
  }
  return config.lightZones
    .map((entry): LightZoneRoute | null => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const surfaces = [
        ...coerceStringList(record.surface),
        ...coerceStringList(record.surfaces),
        ...coerceStringList(record.object),
        ...coerceStringList(record.objects),
        ...coerceStringList(record.floor),
        ...coerceStringList(record.floors)
      ];
      if (surfaces.length === 0) return null;
      const lights = record.lights && typeof record.lights === 'object' && !Array.isArray(record.lights)
        ? record.lights as Record<string, unknown>
        : undefined;
      const paramsSource = record.params && typeof record.params === 'object' && !Array.isArray(record.params)
        ? record.params as Record<string, unknown>
        : {};
      const params = mergeZoneExposureParams(paramsSource, record.exposure);
      const transitionSeconds =
        typeof record.transitionSeconds === 'number' && Number.isFinite(record.transitionSeconds)
          ? Math.max(0, record.transitionSeconds)
          : typeof record.transitionMs === 'number' && Number.isFinite(record.transitionMs)
            ? Math.max(0, record.transitionMs / 1000)
            : undefined;
      return {
        id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : undefined,
        surfaces,
        lights,
        params: Object.keys(params).length > 0 ? params : undefined,
        transitionSeconds
      };
    })
    .filter((route): route is LightZoneRoute => route !== null);
}

export function useSceneLightZones({
  config,
  rawParams,
  toneMappingName,
  defaults
}: {
  config: ExhibitConfig | null;
  rawParams?: Record<string, unknown>;
  toneMappingName: ToneMappingName;
  defaults: Omit<SceneLightSettings, 'transitionSeconds'>;
}) {
  const lightZoneRoutes = useMemo(() => parseLightZoneRoutes(config), [config]);
  const [activeLightZone, setActiveLightZone] = useState<LightZoneRoute | null>(null);

  useEffect(() => {
    setActiveLightZone(null);
  }, [config?.lightZones]);

  const activeRendererParams = useMemo<Record<string, unknown> | undefined>(() => {
    const base = {
      ...(rawParams || {}),
      toneMapping: toneMappingName
    };
    if (!activeLightZone?.params) {
      return base;
    }
    return {
      ...base,
      ...activeLightZone.params,
      exposureTransitionSeconds: activeLightZone.transitionSeconds
    };
  }, [activeLightZone?.params, activeLightZone?.transitionSeconds, rawParams, toneMappingName]);

  const lightRigSettings = useMemo<SceneLightSettings>(() => {
    const zoneLights = activeLightZone?.lights;
    const transitionSeconds =
      typeof activeLightZone?.transitionSeconds === 'number'
        ? activeLightZone.transitionSeconds
        : 0.65;
    return {
      ambientColor: typeof zoneLights?.ambientColor === 'string' ? zoneLights.ambientColor : defaults.ambientColor,
      ambientIntensity: coerceOptionalNumber(zoneLights?.ambientIntensity) ?? defaults.ambientIntensity,
      hemisphereSkyColor: typeof zoneLights?.hemisphereSkyColor === 'string' ? zoneLights.hemisphereSkyColor : defaults.hemisphereSkyColor,
      hemisphereGroundColor: typeof zoneLights?.hemisphereGroundColor === 'string' ? zoneLights.hemisphereGroundColor : defaults.hemisphereGroundColor,
      hemisphereIntensity: coerceOptionalNumber(zoneLights?.hemisphereIntensity) ?? defaults.hemisphereIntensity,
      directionalColor: typeof zoneLights?.directionalColor === 'string' ? zoneLights.directionalColor : defaults.directionalColor,
      directionalIntensity: coerceOptionalNumber(zoneLights?.directionalIntensity) ?? defaults.directionalIntensity,
      directionalPosition: zoneLights?.directionalPosition !== undefined
        ? coerceVector(zoneLights.directionalPosition, defaults.directionalPosition)
        : defaults.directionalPosition,
      directionalCastShadow:
        typeof zoneLights?.directionalCastShadow === 'boolean'
          ? zoneLights.directionalCastShadow
          : defaults.directionalCastShadow,
      directionalShadowMapSize: coercePositiveNumber(zoneLights?.directionalShadowMapSize, defaults.directionalShadowMapSize),
      directionalShadowBias: coerceOptionalNumber(zoneLights?.directionalShadowBias) ?? defaults.directionalShadowBias,
      directionalShadowNormalBias:
        coerceOptionalNumber(zoneLights?.directionalShadowNormalBias) ?? defaults.directionalShadowNormalBias,
      directionalShadowCameraSize:
        coercePositiveNumber(zoneLights?.directionalShadowCameraSize, defaults.directionalShadowCameraSize),
      spotColor: typeof zoneLights?.spotColor === 'string' ? zoneLights.spotColor : defaults.spotColor,
      spotIntensity: coerceOptionalNumber(zoneLights?.spotIntensity) ?? defaults.spotIntensity,
      spotPosition: zoneLights?.spotPosition !== undefined
        ? coerceVector(zoneLights.spotPosition, defaults.spotPosition)
        : defaults.spotPosition,
      spotTarget: zoneLights?.spotTarget !== undefined
        ? coerceVector(zoneLights.spotTarget, defaults.spotTarget)
        : defaults.spotTarget,
      spotAngle: coerceOptionalNumber(zoneLights?.spotAngle) ?? defaults.spotAngle,
      spotPenumbra: coerceOptionalNumber(zoneLights?.spotPenumbra) ?? defaults.spotPenumbra,
      spotDistance: coerceNonNegativeNumber(zoneLights?.spotDistance) ?? defaults.spotDistance,
      spotDecay: coerceOptionalNumber(zoneLights?.spotDecay) ?? defaults.spotDecay,
      spotCastShadow: typeof zoneLights?.spotCastShadow === 'boolean' ? zoneLights.spotCastShadow : defaults.spotCastShadow,
      spotShadowMapSize: coercePositiveNumber(zoneLights?.spotShadowMapSize, defaults.spotShadowMapSize),
      spotShadowBias: coerceOptionalNumber(zoneLights?.spotShadowBias) ?? defaults.spotShadowBias,
      spotShadowNormalBias: coerceOptionalNumber(zoneLights?.spotShadowNormalBias) ?? defaults.spotShadowNormalBias,
      transitionSeconds
    };
  }, [activeLightZone, defaults]);

  return {
    lightZoneRoutes,
    setActiveLightZone,
    activeRendererParams,
    lightRigSettings
  };
}
