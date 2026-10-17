// Text measuring for SVG layout: boxes are sized to their names.

const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d")!;
const widths = new Map<string, number>();

export const FONT_UI = getComputedStyle(document.documentElement).getPropertyValue("--font-ui") || "system-ui, sans-serif";
export const FONT_CODE = getComputedStyle(document.documentElement).getPropertyValue("--font-code") || "monospace";

export function textWidth(text: string, font: string): number {
  const key = font + "\u0000" + text;
  let w = widths.get(key);
  if (w === undefined) {
    ctx.font = font;
    w = ctx.measureText(text).width;
    widths.set(key, w);
  }
  return w;
}

/** The text, cut with an ellipsis so it fits in maxWidth. */
export function fitText(text: string, font: string, maxWidth: number): string {
  if (textWidth(text, font) <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (textWidth(text.slice(0, mid) + "…", font) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + "…";
}
