// The zoom between two screens (round 2): Drill dives into the clicked
// box until it has become the new Focus; Back is the same dive in reverse.
// Both screens hang off one camera: the outer screen holds the box, the
// inner screen holds the Focus that box becomes. Only transform and opacity
// change, so the browser runs it on the compositor at a steady frame rate.

export interface ZoomPlan {
  /** The screen that shows the node as a box in a row. */
  outer: HTMLElement;
  /** The screen that shows the node as the Focus. */
  inner: HTMLElement;
  /** The box, in stage coordinates. */
  box: DOMRect;
  /** The Focus box, in stage coordinates. */
  focus: DOMRect;
  /** "in": outer to inner (Drill). "out": inner to outer (Back). */
  direction: "in" | "out";
}

export const ZOOM_MS = 450;
const SAMPLES = 24;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Starts the zoom; resolves when it has finished (or was finished early). */
export function zoom(plan: ZoomPlan): { done: Promise<void>; finish: () => void } {
  const { box, focus } = plan;
  const cb = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cf = { x: focus.x + focus.width / 2, y: focus.y + focus.height / 2 };
  // how much the box grows to become the Focus; at least a clear dive
  const s = Math.min(6, Math.max(2, focus.width / box.width));

  const outerFrames: Keyframe[] = [];
  const innerFrames: Keyframe[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = easeInOut(i / SAMPLES);
    // u: 0 shows the outer screen as it is, 1 the inner one
    const u = plan.direction === "in" ? t : 1 - t;
    const k = s ** u; // exponential: an even speed of zoom
    const px = cb.x + (cf.x - cb.x) * u;
    const py = cb.y + (cf.y - cb.y) * u;
    outerFrames.push({
      transform: `translate(${px - k * cb.x}px, ${py - k * cb.y}px) scale(${k})`,
      opacity: 1 - smooth(0.3, 0.9, u),
    });
    const ki = k / s;
    innerFrames.push({
      transform: `translate(${px - ki * cf.x}px, ${py - ki * cf.y}px) scale(${ki})`,
      opacity: smooth(0.15, 0.7, u),
    });
  }
  const options: KeyframeAnimationOptions = { duration: ZOOM_MS, easing: "linear", fill: "both" };
  for (const el of [plan.outer, plan.inner]) {
    el.style.transformOrigin = "0 0";
    el.style.willChange = "transform, opacity";
  }
  const animations = [plan.outer.animate(outerFrames, options), plan.inner.animate(innerFrames, options)];
  const finish = () => animations.forEach((a) => a.finish());
  // a hidden tab draws no frames, so its animations never end on their own
  const timer = setTimeout(finish, ZOOM_MS + 250);
  const done = Promise.all(animations.map((a) => a.finished.catch(() => undefined))).then(() => {
    clearTimeout(timer);
    for (const a of animations) a.cancel();
    for (const el of [plan.outer, plan.inner]) el.style.willChange = "";
  });
  return { done, finish };
}

/**
 * The box for `id` in a screen, scrolled into its row's view first when
 * needed. With a cycle the node is in both rows; the first one in view wins.
 */
export function findBox(screen: HTMLElement, id: string): Element | null {
  const boxes = [...screen.querySelectorAll(`.box[data-id="${CSS.escape(id)}"]`)];
  if (!boxes.length) return null;
  const inView = boxes.find((b) => {
    const strip = b.closest(".strip");
    if (!strip) return false;
    const r = b.getBoundingClientRect();
    const s = strip.getBoundingClientRect();
    return r.left >= s.left && r.right <= s.right;
  });
  if (inView) return inView;
  const b = boxes[0];
  const strip = b.closest(".strip");
  if (strip) {
    const r = b.getBoundingClientRect();
    const s = strip.getBoundingClientRect();
    strip.scrollLeft += r.left + r.width / 2 - (s.left + s.width / 2);
  }
  return b;
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
