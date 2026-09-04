import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Mesh } from 'three';
import Visitor from '../modules/Visitor.js';
import { setVideoScenePlaybackEnabled } from '../modules/applyVideoMeshes.js';

export function useSceneReadiness({
  transitionId,
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
  transitionId: string;
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
  const [sceneLoadArmed, setSceneLoadArmed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const lastSceneVersionRef = useRef(sceneVersion);
  const lastLoadingLogRef = useRef<string | null>(null);

  useEffect(() => {
    setSceneAssetsReady(false);
    setSceneLoadArmed(false);
    setTimedOut(false);
    let raf = 0;
    const timeout = window.setTimeout(() => {
      raf = window.requestAnimationFrame(() => setSceneLoadArmed(true));
    }, 80);
    return () => {
      window.clearTimeout(timeout);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [configUrl, modelPath, transitionId, useProceduralRoom]);

  useEffect(() => {
    if (!sceneLoadArmed || sceneAssetsReady || loading || error) return undefined;
    const timeout = window.setTimeout(() => setTimedOut(true), 30_000);
    return () => window.clearTimeout(timeout);
  }, [error, loading, sceneAssetsReady, sceneLoadArmed, transitionId]);

  useEffect(() => {
    if (!debugLoading) return;
    const loadingKey = `${transitionId}:${sceneLoadArmed}:${sceneAssetsReady}:${Boolean(collider)}:${Boolean(visitor)}`;
    if (lastLoadingLogRef.current === loadingKey) return;
    lastLoadingLogRef.current = loadingKey;
    console.info('[SceneLoader]', {
      transitionId,
      armed: sceneLoadArmed,
      essentialAssetsReady: sceneAssetsReady,
      colliderReady: Boolean(collider),
      visitorReady: Boolean(visitor)
    });
  }, [collider, debugLoading, sceneAssetsReady, sceneLoadArmed, transitionId, visitor]);

  const handleSceneReady = useCallback(() => {
    setSceneAssetsReady(true);
    bumpSceneVersion();
  }, []);

  const sceneReadyForVisitor =
    sceneAssetsReady &&
    Boolean(collider) &&
    (thumbnailModeActive || Boolean(visitor)) &&
    !loading &&
    !error;
  const visitorEntryReady =
    sceneAssetsReady &&
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
    timedOut,
    handleSceneReady
  };
}
