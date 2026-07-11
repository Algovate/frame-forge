import { useCallback, useEffect, useRef } from 'react';
import type { MouseEvent } from 'react';

/** Delayed hover-to-play for a preview <video>.
 *
 *  A short delay avoids kicking off playback on a quick pointer swipe; on
 *  leave or unmount the pending timer is cleared so a tile that disappears
 *  (filter/search change, panel collapse, selection toggle) never fires
 *  `play()` on a detached element. Returns stable handlers safe to spread
 *  onto a <video>. */
export function useHoverPlay(delay = 500) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const onMouseEnter = useCallback((event: MouseEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    timeoutRef.current = setTimeout(() => {
      void video.play();
    }, delay);
  }, [delay]);

  const onMouseLeave = useCallback((event: MouseEvent<HTMLVideoElement>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const video = event.currentTarget;
    video.pause();
    video.currentTime = 0;
  }, []);

  return { onMouseEnter, onMouseLeave };
}
