import { useState, useEffect } from 'react';

/**
 * Custom hook to debounce rapidly changing values (such as search text).
 *
 * @param {any} value - Value to debounce
 * @param {number} delay - Delay in milliseconds (default: 400ms)
 * @returns {any} - Debounced value
 */
export function useDebounce(value, delay = 400) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
