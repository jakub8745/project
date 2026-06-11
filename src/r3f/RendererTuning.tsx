import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  PCFShadowMap,
  SRGBColorSpace
} from 'three';

import { toneMappingValueForName } from './toneMapping';

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function coerceColorGradeValue(source: unknown, fallback: number, min: number, max: number): number {
  if (typeof source === 'number' && Number.isFinite(source)) {
    return clampValue(source, min, max);
  }
  return fallback;
}

function createColorGradeFilter(params?: Record<string, unknown>): string {
  const colorGrade = params?.colorGrade && typeof params.colorGrade === 'object'
    ? params.colorGrade as Record<string, unknown>
    : undefined;
  if (!colorGrade) return '';

  const brightness = coerceColorGradeValue(colorGrade.brightness, 1, 0.25, 3);
  const contrast = coerceColorGradeValue(colorGrade.contrast, 1, 0.25, 3);
  const saturate = coerceColorGradeValue(colorGrade.saturate, 1, 0, 3);
  const hueRotate = coerceColorGradeValue(colorGrade.hueRotate, 0, -180, 180);
  const filters = [
    contrast !== 1 ? `contrast(${contrast})` : '',
    brightness !== 1 ? `brightness(${brightness})` : '',
    saturate !== 1 ? `saturate(${saturate})` : '',
    hueRotate !== 0 ? `hue-rotate(${hueRotate}deg)` : ''
  ].filter(Boolean);

  return filters.join(' ');
}

export function RendererTuning({
  highQualityMode = true,
  maxDpr = highQualityMode ? 2 : 1,
  params
}: {
  highQualityMode?: boolean;
  maxDpr?: number;
  params?: Record<string, unknown>;
}) {
  const { gl } = useThree();
  const colorGradeFilter = useMemo(() => createColorGradeFilter(params), [params]);
  const toneMapping = toneMappingValueForName(params?.toneMapping);

  useEffect(() => {
    gl.outputColorSpace = SRGBColorSpace;
    gl.shadowMap.enabled = highQualityMode;
    if (highQualityMode) {
      gl.shadowMap.type = PCFShadowMap;
    }
    if (typeof window !== 'undefined' && !gl.xr.isPresenting) {
      gl.setPixelRatio(Math.min(maxDpr, window.devicePixelRatio || 1));
    }
  }, [gl, highQualityMode, maxDpr]);

  useEffect(() => {
    gl.toneMapping = toneMapping;
  }, [gl, toneMapping]);

  useEffect(() => {
    const canvas = gl.domElement;
    const previousFilter = canvas.style.filter;
    const previousWillChange = canvas.style.willChange;
    canvas.style.filter = colorGradeFilter;
    canvas.style.willChange = colorGradeFilter ? 'filter' : previousWillChange;
    return () => {
      canvas.style.filter = previousFilter;
      canvas.style.willChange = previousWillChange;
    };
  }, [colorGradeFilter, gl]);

  return null;
}

export function AutoExposureControl({ params }: { params?: Record<string, unknown> }) {
  const { gl } = useThree();
  const targetExposure = typeof params?.exposure === 'number' && Number.isFinite(params.exposure)
    ? params.exposure
    : 1.1;
  const exposureTransitionSeconds =
    typeof params?.exposureTransitionSeconds === 'number' && Number.isFinite(params.exposureTransitionSeconds)
      ? Math.max(0, params.exposureTransitionSeconds)
      : 0;
  const initializedExposureRef = useRef(false);

  useEffect(() => {
    if (!initializedExposureRef.current || exposureTransitionSeconds <= 0) {
      gl.toneMappingExposure = targetExposure;
      initializedExposureRef.current = true;
    }
  }, [exposureTransitionSeconds, gl, targetExposure]);

  useFrame((_, delta) => {
    if (exposureTransitionSeconds <= 0) {
      if (gl.toneMappingExposure !== targetExposure) {
        gl.toneMappingExposure = targetExposure;
      }
      return;
    }
    const factor = 1 - Math.exp(-delta / exposureTransitionSeconds);
    const currentExposure = gl.toneMappingExposure ?? targetExposure;
    const nextExposure = currentExposure + (targetExposure - currentExposure) * factor;
    gl.toneMappingExposure = Math.abs(nextExposure - targetExposure) < 1e-4 ? targetExposure : nextExposure;
  });

  return null;
}
