import { useEffect, useState, useRef } from 'react';

/**
 * Lightweight IntersectionObserver hook to know when an element enters the viewport.
 */
export function useInViewport<T extends HTMLElement>(
  threshold: number | number[] = 0.25
): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const target = ref.current;
    if (!target || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setInView(entry.isIntersecting || entry.intersectionRatio > 0);
      },
      { threshold }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [threshold]);

  return [ref, inView];
}

export default useInViewport;
