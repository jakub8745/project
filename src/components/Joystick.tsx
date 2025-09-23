import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface JoystickProps {
  onChange?: (x: number, y: number) => void;
  size?: number;
  disabled?: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const Joystick: React.FC<JoystickProps> = ({ onChange, size = 120, disabled }) => {
  const radius = size / 2;
  const [active, setActive] = useState(false);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const baseRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  const baseStyle = useMemo(() => ({
    width: size,
    height: size,
  }), [size]);

  const updateFromEvent = useCallback((event: PointerEvent) => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const clampedDistance = Math.min(distance, radius);
    const angle = Math.atan2(dy, dx);
    const offsetX = clampedDistance * Math.cos(angle);
    const offsetY = clampedDistance * Math.sin(angle);
    const normalizedX = clamp(offsetX / radius, -1, 1);
    const normalizedY = clamp(offsetY / radius, -1, 1);
    setStick({ x: offsetX, y: offsetY });
    onChange?.(normalizedX, -normalizedY);
  }, [onChange, radius]);

  useEffect(() => {
    if (!active) return;
    const handleMove = (event: PointerEvent) => {
      if (pointerIdRef.current !== null && event.pointerId !== pointerIdRef.current) return;
      event.preventDefault();
      updateFromEvent(event);
    };
    const handleEnd = (event: PointerEvent) => {
      if (pointerIdRef.current !== null && event.pointerId !== pointerIdRef.current) return;
      pointerIdRef.current = null;
      setActive(false);
      setStick({ x: 0, y: 0 });
      onChange?.(0, 0);
    };
    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleEnd, { passive: true });
    window.addEventListener('pointercancel', handleEnd, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
    };
  }, [active, onChange, updateFromEvent]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.pointerType === 'mouse') return;
    event.preventDefault();
    pointerIdRef.current = event.pointerId;
    setActive(true);
    updateFromEvent(event.nativeEvent);
  };

  const translate = `translate(-50%, -50%) translate(${stick.x}px, ${stick.y}px)`;

  return (
    <div className="fixed bottom-6 left-6 z-50 touch-none select-none" aria-hidden={disabled ? 'true' : 'false'}>
      <div
        ref={baseRef}
        data-joystick-base
        className={`relative rounded-full border border-white/30 bg-white/10 backdrop-blur-md ${disabled ? 'opacity-40' : 'opacity-100'}`}
        style={baseStyle}
        onPointerDown={handlePointerDown}
      >
        <div
          className="absolute top-1/2 left-1/2 h-14 w-14 rounded-full bg-sky-400/80 border border-white/40 shadow-inner"
          style={{ transform: translate }}
        />
      </div>
    </div>
  );
};

export default Joystick;
