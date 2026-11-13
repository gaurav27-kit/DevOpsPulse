import { useEffect, useRef, useState } from 'react';

/**
 * Custom hook to detect when an element scrolls into the viewport.
 * Honors `prefers-reduced-motion` by revealing instantly without animation.
 *
 * @param {object} options
 * @param {number} [options.threshold=0.15]
 * @param {string} [options.rootMargin='0px 0px -50px 0px']
 * @returns {[React.RefObject, boolean]} [ref, isVisible]
 */
export function useScrollReveal({ threshold = 0.15, rootMargin = '0px 0px -40px 0px' } = {}) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(() => {
    // If in SSR or prefers-reduced-motion is active, mark visible immediately
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (isVisible) return;

    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setIsVisible(true);
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold, rootMargin }
    );

    const currentElem = ref.current;
    if (currentElem) {
      observer.observe(currentElem);
    }

    return () => {
      if (currentElem) observer.unobserve(currentElem);
    };
  }, [threshold, rootMargin, isVisible]);

  return [ref, isVisible];
}

