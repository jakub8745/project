import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, TouchEvent as ReactTouchEvent } from 'react';
import type Visitor from '../modules/Visitor.js';

interface OnscreenJoystickProps {
  visitor: Visitor | null;
}

export function OnscreenJoystick({ visitor }: OnscreenJoystickProps) {
  const [isTouch, setIsTouch] = useState(false);
  const baseRef = useRef<HTMLDivElement | null>(null);
  const activePointerId = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const hasTouch =
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
      (typeof window !== 'undefined' && 'ontouchstart' in window) ||
      (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
    setIsTouch(Boolean(hasTouch));

    const enableOnTouch = () => setIsTouch(true);
    window.addEventListener('touchstart', enableOnTouch, { passive: true });
    return () => window.removeEventListener('touchstart', enableOnTouch);
  }, []);

  const reset = useCallback(() => {
    activePointerId.current = null;
    setKnob({ x: 0, y: 0 });
    visitor?.setJoystickInput(0, 0);
  }, [visitor]);

  const updateFromEvent = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const base = baseRef.current;
      if (!base) return;
      const rect = base.getBoundingClientRect();
      const radius = Math.max(1, Math.min(rect.width, rect.height) / 2);
      const x = (event.clientX - (rect.left + rect.width / 2)) / radius;
      const y = (event.clientY - (rect.top + rect.height / 2)) / radius;
      const length = Math.hypot(x, y);
      const nx = length > 1 ? x / length : x;
      const ny = length > 1 ? y / length : y;
      setKnob({ x: nx, y: ny });
      // Invert Y so dragging up moves backward and down moves forward
      visitor?.setJoystickInput(nx, -ny);
    },
    [visitor]
  );

  const updateFromTouch = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (!event.touches.length) return;
      const touch = event.touches[0];
      const base = baseRef.current;
      if (!base) return;
      const rect = base.getBoundingClientRect();
      const radius = Math.max(1, Math.min(rect.width, rect.height) / 2);
      const x = (touch.clientX - (rect.left + rect.width / 2)) / radius;
      const y = (touch.clientY - (rect.top + rect.height / 2)) / radius;
      const length = Math.hypot(x, y);
      const nx = length > 1 ? x / length : x;
      const ny = length > 1 ? y / length : y;
      setKnob({ x: nx, y: ny });
      visitor?.setJoystickInput(nx, -ny);
    },
    [visitor]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const base = baseRef.current;
      if (!base) return;
      base.setPointerCapture(event.pointerId);
      activePointerId.current = event.pointerId;
      updateFromEvent(event);
    },
    [updateFromEvent]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (activePointerId.current !== event.pointerId) return;
      updateFromEvent(event);
    },
    [updateFromEvent]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (activePointerId.current !== event.pointerId) return;
      baseRef.current?.releasePointerCapture(event.pointerId);
      reset();
    },
    [reset]
  );

  const handleTouchEnd = useCallback(() => {
    reset();
  }, [reset]);

  useEffect(() => {
    return () => reset();
  }, [reset]);

  const travel = 28; // px offset from center for the knob

  if (!isTouch) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-30 md:bottom-6 md:left-6">
      <div
        ref={baseRef}
        className="pointer-events-auto h-24 w-24 rounded-full border border-white/15 bg-black/40 backdrop-blur touch-none"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onTouchStart={updateFromTouch}
        onTouchMove={updateFromTouch}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div
          className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30 bg-white/25 shadow-md transition-transform duration-50"
          style={{
            transform: `translate(-50%, -50%) translate(${knob.x * travel}px, ${knob.y * travel}px)`
          }}
        />
      </div>
    </div>
  );
}

export default OnscreenJoystick;
