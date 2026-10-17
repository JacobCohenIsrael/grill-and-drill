// Geometry shared by the rows, the Focus box and the edges.

import type { Neighbour, NodeInfo } from "../../src/shared/types";
import { orderBySize, sizeRow, type BoxSize, type Row } from "../../src/shared/weight";
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

/** How much bigger or smaller each size draws than a plain box. */
export const SIZE_SCALE: Record<BoxSize, number> = { small: 0.8, medium: 1, large: 1.4 };
/** The edge line to a bigger box is thicker. */
export const EDGE_WIDTH: Record<BoxSize, number> = { small: 1, medium: 1.5, large: 2.5 };

export interface Box {
  n: Neighbour;
  node: NodeInfo;
  size: BoxSize;
  scale: number;
  /** Place and size on the row, scale included. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Width before scaling: the box is drawn at plain size, then scaled. */
  innerW: number;
  name: string;
  label: string;
  /** The previous Focus: clicking it is Back. */
  previous: boolean;
}

export interface RowLayout {
  boxes: Box[];
  width: number;
  height: number;
  /** The tallest box: boxes share the edge that faces the Focus. */
  boxHeight: number;
}

/**
 * Sizes, orders and places one row. Sizes come from the whole row, before
 * the filter, so filtering never resizes a box. Dependencies hang from the
 * row's top edge and Dependents stand on its bottom edge, the sides facing
 * the Focus, so every edge line has the same length.
 */
export function layoutRow(
  items: Neighbour[],
  row: Row,
  keep: (n: Neighbour) => boolean,
  nodes: Map<string, NodeInfo>,
  previousId: string | null,
): RowLayout {
  const sizes = sizeRow(items, row, (id) => nodes.get(id)?.kind === "library");
  const ordered = orderBySize(
    items.map((n, i) => ({ n, size: sizes[i] })),
    previousId,
  );
  const boxHeight = BOX_H * Math.max(SIZE_SCALE.medium, ...sizes.map((s) => SIZE_SCALE[s]));
  const boxes: Box[] = [];
  let x = ROW_PAD;
  for (const { n, size } of ordered) {
    const node = nodes.get(n.id);
    if (!node || !keep(n)) continue;
    const scale = SIZE_SCALE[size];
    const font = node.abstract ? NAME_FONT_ITALIC : NAME_FONT;
    const label = `«${node.label}»`;
    const natural = Math.max(textWidth(node.name, font), textWidth(label, LABEL_FONT)) + 28;
    const innerW = Math.round(Math.min(BOX_MAX, Math.max(BOX_MIN, natural)));
    const w = innerW * scale;
    const h = BOX_H * scale;
    boxes.push({
      n,
      node,
      size,
      scale,
      x,
      y: row === "dependencies" ? ROW_VPAD : ROW_VPAD + boxHeight - h,
      w,
      h,
      innerW,
      name: fitText(node.name, font, innerW - 16),
      label: fitText(label, LABEL_FONT, innerW - 16),
      previous: n.id === previousId,
    });
    x += w + ROW_GAP;
  }
  return { boxes, width: x - ROW_GAP + ROW_PAD, height: boxHeight + 2 * ROW_VPAD, boxHeight };
}
