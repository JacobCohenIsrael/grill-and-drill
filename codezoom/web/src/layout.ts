// Geometry shared by the rows, the Focus box and the edges.

import type { Neighbour, NodeInfo } from "../../src/shared/types";
import { FONT_UI, fitText, textWidth } from "./measure";

export const BOX_H = 44;
export const ROW_VPAD = 10;
export const ROW_PAD = 16;
export const ROW_GAP = 12;
const BOX_MIN = 96;
const BOX_MAX = 230;
export const NAME_FONT = `600 13px ${FONT_UI}`;
export const NAME_FONT_ITALIC = `italic 600 13px ${FONT_UI}`;
export const LABEL_FONT = `11px ${FONT_UI}`;

export interface Box {
  n: Neighbour;
  node: NodeInfo;
  x: number;
  w: number;
  name: string;
  label: string;
  /** The previous Focus: clicking it is Back. */
  previous: boolean;
}

/** Orders a row: the previous Focus is pinned first, then the index's order. */
export function orderRow(items: Neighbour[], previousId: string | null): Neighbour[] {
  if (!previousId) return items;
  const i = items.findIndex((n) => n.id === previousId);
  if (i <= 0) return items;
  return [items[i], ...items.slice(0, i), ...items.slice(i + 1)];
}

export function layoutRow(items: Neighbour[], nodes: Map<string, NodeInfo>, previousId: string | null): { boxes: Box[]; width: number } {
  const boxes: Box[] = [];
  let x = ROW_PAD;
  for (const n of items) {
    const node = nodes.get(n.id);
    if (!node) continue;
    const font = node.abstract ? NAME_FONT_ITALIC : NAME_FONT;
    const label = `«${node.label}»`;
    const natural = Math.max(textWidth(node.name, font), textWidth(label, LABEL_FONT)) + 28;
    const w = Math.round(Math.min(BOX_MAX, Math.max(BOX_MIN, natural)));
    boxes.push({
      n,
      node,
      x,
      w,
      name: fitText(node.name, font, w - 16),
      label: fitText(label, LABEL_FONT, w - 16),
      previous: n.id === previousId,
    });
    x += w + ROW_GAP;
  }
  return { boxes, width: x - ROW_GAP + ROW_PAD };
}
