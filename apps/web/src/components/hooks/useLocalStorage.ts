'use client';

import { useEffect, useState } from 'react';

export function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);

  // hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
      if (stored !== null) {
        setValue(JSON.parse(stored) as T);
      }
    } catch {
      // ignore — corrupted entry, fall back to initial
    }
  }, [key]);

  const update = (v: T): void => {
    setValue(v);
    try {
      window.localStorage.setItem(key, JSON.stringify(v));
    } catch {
      // ignore quota issues
    }
  };

  return [value, update];
}
