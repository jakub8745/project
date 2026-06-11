import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useProgress } from '@react-three/drei';
import type { Mesh } from 'three';
import Visitor from '../modules/Visitor.js';
import { setVideoScenePlaybackEnabled } from '../modules/applyVideoMeshes.js';

export function useSceneReadiness({
  configUrl,
  modelPath,
  useProceduralRoom,
  collider,
  visitor,
  thumbnailModeActive,
  loading,
  error,
  debugLoading,
  onVisitorEntered
}: {
  configUrl: string | null;
  modelPath?: string;
  useProceduralRoom: boolean;
  collider: Mesh | null;
  visitor: Visitor | null;
  thumbnailModeActive: boolean;
  loading: boolean;
  error: Error | null;
  debugLoading: boolean;
  onVisitorEntered?: () => void;
}) {
  const [sceneVersion, bumpSceneVersion] = useReducer((value: number) => value + 1, 0);
  const [sceneAssetsReady, setSceneAssetsReady] = useState(false);
  const [sceneAssetLoadsSettled, setSceneAssetLoadsSettled] = useState(false);
  const [sceneLoadArmed, setSceneLoadArmed] = useState(false);
  const {
    active: sceneAssetsLoading,
    item: sceneLoadingItem,
    loaded: sceneLoadedCount,
    total: sceneTotalCount,
    progress: sceneLoadProgress
  } = useProgress();
  const lastSceneVersionRef = useRef(sceneVersion);
  const lastLoadingLogRef = useRef<string | null>(null);

  useEffect(() => {
    setSceneAssetsReady(false);
    setSceneAssetLoadsSettled(false);
    setSceneLoadArmed(false);
    let raf = 0;
    const timeout = window.setTimeout(() => {
      raf = window.requestAnimationFrame(() => setSceneLoadArmed(true));
    }, 80);
    return () => {
      window.clearTimeout(timeout);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [configUrl, modelPath, useProceduralRoom]);

  useEffect(() => {
    if (!sceneAssetsReady || sceneAssetsLoading || sceneAssetLoadsSettled) return undefined;
    const raf = window.requestAnimationFrame(() => {
      setSceneAssetLoadsSettled(true);
    });
    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [sceneAssetLoadsSettled, sceneAssetsLoading, sceneAssetsReady]);

  useEffect(() => {
    if (!debugLoading) return;
    const percentage = Number.isFinite(sceneLoadProgress) ? Math.round(sceneLoadProgress) : 0;
    const loadingKey = `${sceneAssetsLoading}:${sceneLoadedCount}:${sceneTotalCount}:${percentage}:${sceneLoadingItem || ''}`;
    if (lastLoadingLogRef.current === loadingKey) return;
    lastLoadingLogRef.current = loadingKey;
    const status = sceneAssetsLoading ? 'loading' : 'settled';
    console.info(
      `[SceneLoader] ${status} ${sceneLoadedCount}/${sceneTotalCount} ${percentage}%`,
      sceneLoadingItem || '(no active item)'
    );
  }, [debugLoading, sceneAssetsLoading, sceneLoadedCount, sceneLoadingItem, sceneLoadProgress, sceneTotalCount]);

  const handleSceneReady = useCallback(() => {
    setSceneAssetsReady(true);
    bumpSceneVersion();
  }, []);

  const sceneReadyForVisitor =
    sceneAssetsReady &&
    sceneAssetLoadsSettled &&
    Boolean(collider) &&
    (thumbnailModeActive || Boolean(visitor)) &&
    !loading &&
    !error;
  const visitorEntryReady =
    sceneAssetsReady &&
    sceneAssetLoadsSettled &&
    Boolean(collider) &&
    !loading &&
    !error;

  useEffect(() => {
    setVideoScenePlaybackEnabled(sceneReadyForVisitor);
    return () => {
      setVideoScenePlaybackEnabled(false);
    };
  }, [sceneReadyForVisitor, configUrl]);

  useEffect(() => {
    if (!sceneReadyForVisitor) return;
    onVisitorEntered?.();
  }, [onVisitorEntered, sceneReadyForVisitor]);

  useEffect(() => {
    if (!visitor) {
      return;
    }
    if (lastSceneVersionRef.current === sceneVersion) {
      return;
    }
    lastSceneVersionRef.current = sceneVersion;
    visitor.reset?.();
  }, [sceneVersion, visitor]);

  return {
    sceneVersion,
    sceneLoadArmed,
    sceneReadyForVisitor,
    visitorEntryReady,
    sceneLoadingItem,
    handleSceneReady
  };
}
