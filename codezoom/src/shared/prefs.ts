// The page's per-browser switches, kept in localStorage as "1" or "0".
// Shared so the defaults can be tested away from a browser.

/** A stored switch, or the fallback when the reader never set it. */
export function storedFlag(stored: string | null, fallback: boolean): boolean {
  return stored === "1" ? true : stored === "0" ? false : fallback;
}

/** Moves zoom unless the system asks for reduced motion; the reader's own choice always wins. */
export function animationsOn(stored: string | null, reducedMotion: boolean): boolean {
  return storedFlag(stored, !reducedMotion);
}
