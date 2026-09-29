import { useEffect, useState } from 'react';
import { fetchManifest, invalidateManifest } from '../config/manifestRepository';
import { normalizeConfigUrl } from '../utils/url';
import { compileExhibitSnapshot, type CompiledExhibitSnapshot } from '../config/compiledExhibitSnapshot';
import type { ExhibitConfig } from '../config/runtimeTypes';

const configCache = new Map<string, CompiledExhibitSnapshot>();
const CONFIG_LOAD_TIMEOUT_MS = 20_000;

function isLoadingDiagnosticsEnabled(): boolean {
  return typeof window !== 'undefined' && ['debugLoading', 'loadingDebug'].some((key) => {
    const value = new URLSearchParams(window.location.search).get(key);
    return value === '1' || value === 'true';
  });
}

interface UseExhibitConfigResult {
  config: ExhibitConfig | null;
  snapshot: CompiledExhibitSnapshot | null;
  resolvedUrl: string | null;
  loading: boolean;
  error: Error | null;
  retry: () => void;
}

export function useExhibitConfig(configUrl: string | null): UseExhibitConfigResult {
  configUrl = configUrl ? normalizeConfigUrl(configUrl) : null;
  const [snapshot, setSnapshot] = useState<CompiledExhibitSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!configUrl) {
      setSnapshot(null);
      setResolvedUrl(null);
      setLoading(false);
      setError(null);
      return;
    }

    const cached = configCache.get(configUrl);
    if (cached) {
      if (isLoadingDiagnosticsEnabled()) console.info('[SceneLoader]', { event: 'manifest_cache_hit', configUrl });
      setSnapshot(cached);
      setResolvedUrl(configUrl);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    if (isLoadingDiagnosticsEnabled()) console.info('[SceneLoader]', { event: 'scene_requested', configUrl });
    let didTimeOut = false;
    const timeout = window.setTimeout(() => {
      didTimeOut = true;
      controller.abort();
    }, CONFIG_LOAD_TIMEOUT_MS);
    setLoading(true);
    setError(null);
    setSnapshot(null);
    setResolvedUrl(null);

    let latestOptionalSnapshot: CompiledExhibitSnapshot | null = null;
    fetchManifest(configUrl, controller.signal)
      .then(async (raw) => {
        if (isLoadingDiagnosticsEnabled()) console.info('[SceneLoader]', { event: 'manifest_loaded', configUrl });
        const normalised = await compileExhibitSnapshot(raw, configUrl, controller.signal, (updated) => {
          if (controller.signal.aborted) return;
          latestOptionalSnapshot = updated;
          configCache.set(configUrl, updated);
          setSnapshot(updated);
        });
        if (!controller.signal.aborted) {
          const current = latestOptionalSnapshot ?? normalised;
          configCache.set(configUrl, current);
          setSnapshot(current);
          setResolvedUrl(configUrl);
          setLoading(false);
          if (isLoadingDiagnosticsEnabled()) console.info('[SceneLoader]', { event: 'scene_config_ready', configUrl, exhibitId: current.scene.id });
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted && !didTimeOut) return;
        const errorObject = didTimeOut
          ? new Error(`The exhibit configuration did not respond within ${CONFIG_LOAD_TIMEOUT_MS / 1000} seconds.`)
          : err instanceof Error ? err : new Error(String(err));
        console.error('[SceneLoader]', { event: 'scene_config_failed', configUrl, message: errorObject.message });
        setError(errorObject);
        setSnapshot(null);
        setResolvedUrl(null);
        setLoading(false);
      })
      .finally(() => {
        window.clearTimeout(timeout);
      });

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [configUrl, attempt]);

  return {
    config: snapshot?.scene ?? null,
    snapshot,
    resolvedUrl,
    loading,
    error,
    retry: () => {
      if (configUrl) {
        configCache.delete(configUrl);
        invalidateManifest(configUrl);
      }
      setAttempt((value) => value + 1);
    }
  };
}

export type { ExhibitConfig };
