import { useEffect, useState, useRef } from 'react';

export function useObjectUrlMap<T>(
  items: T[],
  getKey: (item: T) => string,
  getBlob: (item: T) => Blob,
): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const urlsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const currentUrls = urlsRef.current;
    const nextUrls: Record<string, string> = {};
    const newKeys = new Set(items.map(getKey));
    let changed = false;

    // Create new URLs for items that don't have one
    for (const item of items) {
      const key = getKey(item);
      if (currentUrls[key]) {
        nextUrls[key] = currentUrls[key];
      } else {
        nextUrls[key] = URL.createObjectURL(getBlob(item));
        changed = true;
      }
    }

    // Revoke URLs for items that are no longer present
    for (const key of Object.keys(currentUrls)) {
      if (!newKeys.has(key)) {
        URL.revokeObjectURL(currentUrls[key]);
        changed = true;
      }
    }

    if (changed) {
      urlsRef.current = nextUrls;
      setUrls(nextUrls);
    }
  }, [items, getKey, getBlob]);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      for (const url of Object.values(urlsRef.current)) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  return urls;
}
