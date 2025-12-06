export {};

declare global {
  type XRSessionMode = 'inline' | 'immersive-vr' | 'immersive-ar';
  type XRReferenceSpaceType = 'viewer' | 'local' | 'local-floor' | 'bounded-floor' | 'unbounded';

  interface XRSessionInit {
    optionalFeatures?: string[];
    requiredFeatures?: string[];
  }

  interface XRSession extends EventTarget {
    end(): Promise<void>;
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions
    ): void;
    removeEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions
    ): void;
  }

  interface XRSystem {
    isSessionSupported?: (mode: XRSessionMode) => Promise<boolean>;
    requestSession?: (mode: XRSessionMode, options?: XRSessionInit) => Promise<XRSession>;
  }

  interface Navigator {
    xr?: XRSystem;
  }
}
