import type { PaddingOptions } from "maplibre-gl";
import { useSyncExternalStore } from "react";

/** Below this width the card becomes a bottom sheet and the layout switches to phone mode. */
const MOBILE_QUERY = window.matchMedia("(max-width: 767px)");
export const isMobile = () => MOBILE_QUERY.matches;

export function useMobile() {
  return useSyncExternalStore(
    (cb) => {
      MOBILE_QUERY.addEventListener("change", cb);
      return () => MOBILE_QUERY.removeEventListener("change", cb);
    },
    isMobile,
  );
}

/** Map padding that keeps a fitted feature clear of the card (side panel or bottom sheet). */
export function cardPadding(extra = 0): PaddingOptions {
  if (!isMobile()) return { left: 460 + extra, top: 90 + extra, right: 100 + extra, bottom: 90 + extra };
  return { left: 24 + extra, top: 110 + extra, right: 60 + extra, bottom: Math.round(window.innerHeight * 0.46) + extra };
}

/** Padding for the whole-island view: phones leave room for the search bar and controls only. */
export function homePadding(): PaddingOptions | number {
  return isMobile() ? { top: 90, bottom: 60, left: 12, right: 64 } : 80;
}
