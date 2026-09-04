import { useEffect, useState } from 'react';
import { loadExhibitConfig } from '../config/loaders/loadExhibitConfig';
import type { ExhibitConfig } from '../config/runtimeTypes';

const configCache = new Map<string, ExhibitConfig>();

interface UseExhibitConfigResult {
  config: ExhibitConfig | null;
  resolvedUrl: string | null;
  loading: boolean;
  error: Error | null;
  retry: () => void;
}

export function useExhibitConfig(configUrl: string | null): UseExhibitConfigResult {
  const [config, setConfig] = useState<ExhibitConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!configUrl) {
      setConfig(null);
      setResolvedUrl(null);
      setLoading(false);
      setError(null);
      return;
    }

    const cached = configCache.get(configUrl);
    if (cached) {
      setConfig(cached);
      setResolvedUrl(configUrl);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setConfig(null);
    setResolvedUrl(null);

    fetch(configUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load config ${response.status}: ${response.statusText}`);
        }
        const raw = await response.json();
        const normalised = await loadExhibitConfig(raw, controller.signal, (updated) => {
          if (controller.signal.aborted) return;
          configCache.set(configUrl, updated);
          setConfig(updated);
        });
        configCache.set(configUrl, normalised);
        if (!controller.signal.aborted) {
          setConfig(normalised);
          setResolvedUrl(configUrl);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const errorObject = err instanceof Error ? err : new Error(String(err));
        setError(errorObject);
        setConfig(null);
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [configUrl, attempt]);

  return {
    config,
    resolvedUrl,
    loading,
    error,
    retry: () => setAttempt((value) => value + 1)
  };
}

export type { ExhibitConfig };
