import { useCallback, useEffect, useRef, useState } from 'react';
import type { Object3D, WebGLRenderer } from 'three';
import { playAudioByIds } from '../modules/audioMeshManager.ts';

const XR_EXIT_HOLD_MS = 1200;
const XR_INTRO_DELAY_MS = 3000;

type XRSessionConstructor = { new (...args: unknown[]): XRSession };
type XRWebGLBindingConstructor = { new (...args: unknown[]): unknown };

function temporarilyDisableXRWebGLBinding(session: XRSession | null) {
  if (typeof globalThis === 'undefined' || !session) {
    return null;
  }
  const globalWithXR = globalThis as typeof globalThis & {
    XRWebGLBinding?: XRWebGLBindingConstructor;
    XRSession?: XRSessionConstructor;
  };
  const originalBinding = globalWithXR.XRWebGLBinding;
  if (typeof originalBinding !== 'function') {
    return null;
  }

  const sessionCtor = globalWithXR.XRSession;
  let shouldDisable = false;
  if (typeof sessionCtor === 'function') {
    try {
      shouldDisable = !(session instanceof sessionCtor);
    } catch {
      shouldDisable = true;
    }
  } else {
    shouldDisable = true;
  }

  if (!shouldDisable) {
    return null;
  }

  globalWithXR.XRWebGLBinding = undefined;
  return () => {
    globalWithXR.XRWebGLBinding = originalBinding;
  };
}

export function useXrSessionControls({
  renderer,
  introAudioIds
}: {
  renderer: WebGLRenderer | null;
  introAudioIds: string[];
}) {
  const [xrSupported, setXrSupported] = useState(false);
  const [xrSessionActive, setXrSessionActive] = useState(false);
  const [xrError, setXrError] = useState<string | null>(null);
  const xrSessionRef = useRef<XRSession | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function detectXrSupport() {
      if (typeof navigator === 'undefined') {
        if (!cancelled) {
          setXrSupported(false);
        }
        return;
      }
      const xrSystem = navigator.xr;
      if (!xrSystem?.isSessionSupported) {
        if (!cancelled) {
          setXrSupported(false);
        }
        return;
      }
      try {
        const supported = await xrSystem.isSessionSupported('immersive-vr');
        if (!cancelled) {
          setXrSupported(Boolean(supported));
          if (supported) {
            setXrError(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setXrSupported(false);
          setXrError(err instanceof Error ? err.message : 'Unable to detect WebXR support.');
        }
      }
    }

    detectXrSupport();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!renderer) return;
    const xrManager = renderer.xr;
    let activeIntroTimer: number | null = null;
    const handleSessionStart = () => {
      if (activeIntroTimer !== null) {
        window.clearTimeout(activeIntroTimer);
        activeIntroTimer = null;
      }
      setXrSessionActive(true);
      setXrError(null);
      const session = xrSessionRef.current;
      activeIntroTimer = window.setTimeout(() => {
        if (xrSessionRef.current === session && introAudioIds.length > 0) {
          void playAudioByIds(introAudioIds);
        }
        activeIntroTimer = null;
      }, XR_INTRO_DELAY_MS);
      session?.addEventListener('end', () => {
        if (activeIntroTimer !== null) window.clearTimeout(activeIntroTimer);
        activeIntroTimer = null;
      }, { once: true });
    };
    const handleSessionEnd = () => {
      setXrSessionActive(false);
      xrSessionRef.current = null;
      if (activeIntroTimer !== null) {
        window.clearTimeout(activeIntroTimer);
        activeIntroTimer = null;
      }
    };
    xrManager.addEventListener('sessionstart', handleSessionStart);
    xrManager.addEventListener('sessionend', handleSessionEnd);
    return () => {
      xrManager.removeEventListener('sessionstart', handleSessionStart);
      xrManager.removeEventListener('sessionend', handleSessionEnd);
      if (activeIntroTimer !== null) {
        window.clearTimeout(activeIntroTimer);
      }
    };
  }, [renderer, introAudioIds]);

  useEffect(() => {
    if (!renderer) return;
    renderer.xr.enabled = xrSupported;
    if (xrSupported) {
      renderer.xr.setReferenceSpaceType('local-floor');
    }
  }, [renderer, xrSupported]);

  useEffect(() => {
    return () => {
      const session = xrSessionRef.current;
      if (session && typeof session.end === 'function') {
        session.end().catch(() => undefined);
      }
      xrSessionRef.current = null;
    };
  }, []);

  const requestVrSession = useCallback(async () => {
    if (!renderer) return;
    if (typeof navigator === 'undefined') {
      setXrError('Navigator is not available in this environment.');
      return;
    }
    const xrSystem = navigator.xr;
    if (!xrSystem?.requestSession) {
      setXrError('WebXR is not available on this device.');
      return;
    }
    try {
      const session = await xrSystem.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor']
      });
      xrSessionRef.current = session;
      const handleEnd = () => {
        xrSessionRef.current = null;
        session.removeEventListener('end', handleEnd);
      };
      session.addEventListener('end', handleEnd);
      const restoreBinding = temporarilyDisableXRWebGLBinding(session);
      try {
        await renderer.xr.setSession(session);
      } finally {
        restoreBinding?.();
      }
      setXrError(null);
    } catch (err) {
      console.error('Failed to start VR session', err);
      setXrError(err instanceof Error ? err.message : 'Failed to start VR session.');
    }
  }, [renderer]);

  const exitVrSession = useCallback(async () => {
    if (!xrSessionRef.current) return;
    try {
      await xrSessionRef.current.end();
    } catch (err) {
      console.warn('Failed to end XR session', err);
    } finally {
      xrSessionRef.current = null;
    }
  }, []);

  const exitVrSessionAndReload = useCallback(async () => {
    await exitVrSession();
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }, [exitVrSession]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!xrSessionRef.current) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        void exitVrSession();
      } else if (event.key.toLowerCase() === 'r' && event.shiftKey) {
        event.preventDefault();
        void exitVrSessionAndReload();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [exitVrSession, exitVrSessionAndReload]);

  useEffect(() => {
    if (!renderer || !xrSupported) return undefined;
    const xrControllers = [renderer.xr.getController(0), renderer.xr.getController(1)];
    const exitTimers = new Map<Object3D, number>();

    const clearExitTimer = (controller: Object3D) => {
      const timer = exitTimers.get(controller);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        exitTimers.delete(controller);
      }
    };

    const startExitTimer = (event: { target?: unknown }) => {
      if (!xrSessionRef.current) return;
      const controller = event.target as Object3D | undefined;
      if (!controller || exitTimers.has(controller)) return;
      const timer = window.setTimeout(() => {
        exitTimers.delete(controller);
        void exitVrSession();
      }, XR_EXIT_HOLD_MS);
      exitTimers.set(controller, timer);
    };

    const stopExitTimer = (event: { target?: unknown }) => {
      const controller = event.target as Object3D | undefined;
      if (controller) {
        clearExitTimer(controller);
      }
    };

    xrControllers.forEach((controller) => {
      controller.addEventListener('squeezestart', startExitTimer);
      controller.addEventListener('squeezeend', stopExitTimer);
    });

    return () => {
      xrControllers.forEach((controller) => {
        controller.removeEventListener('squeezestart', startExitTimer);
        controller.removeEventListener('squeezeend', stopExitTimer);
        clearExitTimer(controller);
      });
      exitTimers.clear();
    };
  }, [exitVrSession, renderer, xrSupported]);

  return {
    xrSupported,
    xrSessionActive,
    xrError,
    requestVrSession,
    exitVrSession
  };
}
