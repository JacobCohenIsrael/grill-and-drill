<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { Meta, NodeInfo, RefWire, Screen } from "../../src/shared/types";
  import { cachedScreen, clearCaches, loadMeta, loadScreens, onIndexUpdate } from "./api";
  import TopBar from "./TopBar.svelte";
  import ScreenView from "./ScreenView.svelte";
  import StartPage from "./StartPage.svelte";
  import SourcePanel from "./SourcePanel.svelte";
  import SetupPage from "./SetupPage.svelte";
  import { findFocus } from "../../src/shared/search";
  import { findBox, prefersReducedMotion, zoom, type ZoomPlan } from "./zoom";

  type MoveKind = "drill" | "back" | "jump" | "open" | "history" | "refresh";
  interface Move {
    kind: MoveKind;
    id: string;
    /** From the move until the new screen is laid out and its first frame can be drawn. */
    ms: number;
    /** From the move to the next animation frame (only when the page is visible). */
    frameMs: number | null;
    cached: boolean;
    /** "in"/"out" for a zoom, "cut" otherwise. */
    motion: "in" | "out" | "cut";
    /** Frame rate and longest frame of the zoom, when the page was visible to measure it. */
    fps: number | null;
    longestFrameMs: number | null;
  }

  /** One screen on the stage. During a zoom there are two. */
  interface Layer {
    key: number;
    id: string;
    screen: Screen;
    previousId: string | null;
    /** The index this screen was drawn from: a newer index never reshuffles it. */
    nodes: Map<string, NodeInfo>;
    files: string[];
  }

  let meta = $state.raw<Meta | null>(null);
  let error = $state<string | null>(null);
  let focusId = $state<string | null>(null);
  let trail = $state.raw<string[]>([]);
  let layers = $state.raw<Layer[]>([]);
  let layerEls = $state<Record<number, HTMLDivElement>>({});
  let stageEl: HTMLDivElement | undefined = $state();
  let zooming = $state(false);
  let sourceOpen = $state(false);
  /** On /setup: show only new assemblies, and where to go after Save. */
  let setupPage = $state.raw<{ onlyNew: boolean; then: string | null } | null>(null);
  let marks = $state.raw<RefWire[] | null>(null);
  const top = $derived(layers[layers.length - 1]);
  let lastMove = $state.raw<Move | null>(null);
  /** Set when the server rebuilt the index after files changed. */
  let indexUpdate = $state.raw<{ changed: string[] } | null>(null);
  let missing = $state(false);
  let initialQuery = $state("");

  const nodes = $derived(new Map<string, NodeInfo>((meta?.nodes ?? []).map((n) => [n.id, n])));
  const previousId = $derived(trail.length > 1 ? trail[trail.length - 2] : null);

  const moves: Move[] = [];
  (window as unknown as { __codezoom: { moves: Move[] } }).__codezoom = { moves };

  const pathFor = (id: string) => `/n/${encodeURIComponent(id)}`;
  const round = (ms: number) => Math.round(ms * 10) / 10;

  let layerSeq = 0;
  let running: { finish: () => void } | null = null;
  /** The box a Drill was clicked on: with a cycle the node shows twice. */
  let clicked: Element | null = null;

  function show(id: string, nextTrail: string[], kind: MoveKind) {
    const t0 = performance.now();
    running?.finish(); // a zoom still running ends at once
    const hit = cachedScreen(id);
    const backward = nextTrail.length < trail.length;
    const apply = async (s: Screen) => {
      missing = false;
      focusId = id;
      const prev = layers[layers.length - 1];
      trail = nextTrail;
      const layer: Layer = {
        key: ++layerSeq,
        id,
        screen: s,
        previousId: nextTrail.length > 1 ? nextTrail[nextTrail.length - 2] : null,
        nodes,
        files: meta?.files ?? [],
      };
      indexUpdate = null; // this screen is drawn from the newest index
      // Jump is a cut (round 2), and so is the first screen
      const mayZoom = !!prev && prev.id !== id && kind !== "jump" && kind !== "open" && !prefersReducedMotion();
      layers = mayZoom ? [prev, layer] : [layer];
      await tick();
      const plan = mayZoom ? planZoom(prev, layer, backward) : null;
      if (mayZoom && !plan) layers = [layer]; // not neighbours: a cut
      await tick();
      document.body.getBoundingClientRect(); // style and layout happen now, not later
      const move: Move = {
        kind,
        id,
        ms: round(performance.now() - t0),
        frameMs: null,
        cached: !!hit,
        motion: plan ? plan.direction : "cut",
        fps: null,
        longestFrameMs: null,
      };
      moves.push(move);
      lastMove = move;
      requestAnimationFrame(() => (move.frameMs = round(performance.now() - t0)));
      // preload every neighbour so the next Drill draws without the server
      loadScreens([...s.dependents, ...s.dependencies].map((n) => n.id));
      if (!plan) return;

      zooming = true;
      const z = zoom(plan);
      running = z;
      const frames: number[] = [];
      const count = (now: number) => {
        frames.push(now);
        if (running === z) requestAnimationFrame(count);
      };
      requestAnimationFrame(count);
      await z.done;
      if (running === z) {
        running = null;
        zooming = false;
      }
      layers = layers.filter((l) => l !== prev);
      if (frames.length > 3) {
        const gaps = frames.slice(1).map((f, i) => f - frames[i]);
        move.fps = Math.round(((frames.length - 1) / (frames[frames.length - 1] - frames[0])) * 1000);
        move.longestFrameMs = round(Math.max(...gaps));
        if (lastMove === move) lastMove = { ...move };
      }
    };
    if (hit) apply(hit);
    else
      loadScreens([id]).then(() => {
        const s = cachedScreen(id);
        if (s) apply(s);
        else {
          focusId = id;
          trail = nextTrail;
          layers = [];
          missing = true;
        }
      });
    document.title = `${nodes.get(id)?.name ?? id} · codezoom`;
  }

  /** How the two screens relate: the new Focus is a box on the old screen (in), or the old Focus is one on the new (out). */
  function planZoom(prev: Layer, next: Layer, backward: boolean): ZoomPlan | null {
    const oldEl = layerEls[prev.key];
    const newEl = layerEls[next.key];
    if (!oldEl || !newEl || !stageEl) return null;
    const stage = stageEl.getBoundingClientRect();
    const rel = (r: DOMRect) => new DOMRect(r.x - stage.x, r.y - stage.y, r.width, r.height);
    const boxRect = (b: Element) => rel((b.querySelector("rect") ?? b).getBoundingClientRect());
    const focusRect = (el: HTMLElement) => {
      const f = el.querySelector(".focus");
      return f ? rel(f.getBoundingClientRect()) : null;
    };
    const inward = (): ZoomPlan | null => {
      const box = clicked && oldEl.contains(clicked) ? clicked : findBox(oldEl, next.id);
      const focus = focusRect(newEl);
      return box && focus ? { outer: oldEl, inner: newEl, box: boxRect(box), focus, direction: "in" } : null;
    };
    const outward = (): ZoomPlan | null => {
      const box = findBox(newEl, prev.id);
      const focus = focusRect(oldEl);
      return box && focus ? { outer: newEl, inner: oldEl, box: boxRect(box), focus, direction: "out" } : null;
    };
    clicked = null;
    return backward ? (outward() ?? inward()) : (inward() ?? outward());
  }

  function drill(id: string, box?: Element) {
    if (id === previousId) return back();
    clicked = box ?? null;
    const next = [...trail, id];
    history.pushState({ trail: next }, "", pathFor(id));
    show(id, next, "drill");
  }

  function jump(id: string) {
    if (id === focusId) return;
    const next = [...trail, id];
    history.pushState({ trail: next }, "", pathFor(id));
    show(id, next, "jump");
  }

  function back() {
    if (trail.length > 1) history.back();
  }

  function goToTrail(index: number) {
    const steps = index - (trail.length - 1);
    if (steps < 0) history.go(steps);
  }

  function fromLocation(kind: MoveKind) {
    const path = location.pathname;
    const params = new URLSearchParams(location.search);
    setupPage = path === "/setup" ? { onlyNew: params.get("new") === "1", then: params.get("then") } : null;
    if (setupPage) {
      document.title = "Setup · codezoom";
      return;
    }
    if (path.startsWith("/n/")) {
      const id = decodeURIComponent(path.slice(3));
      const stateTrail = (history.state as { trail?: string[] } | null)?.trail;
      const t = stateTrail && stateTrail[stateTrail.length - 1] === id ? stateTrail : [id];
      if (!stateTrail) history.replaceState({ trail: t }, "");
      show(id, t, kind);
    } else {
      focusId = null;
      trail = [];
      layers = [];
      initialQuery = new URLSearchParams(location.search).get("q") ?? "";
      document.title = "codezoom";
    }
  }

  function openSetup(onlyNew: boolean) {
    const q = new URLSearchParams();
    if (focusId) q.set("then", focusId);
    if (onlyNew) q.set("new", "1");
    history.pushState(null, "", `/setup${q.size ? `?${q}` : ""}`);
    fromLocation("open");
  }

  /** After Save: the new index, then the Type named on the command line or the Focus setup was opened from. */
  async function afterSetup() {
    const then = setupPage?.then ?? null;
    const next = await loadMeta();
    clearCaches();
    meta = next;
    indexUpdate = null;
    layers = [];
    const found = then ? findFocus(next.nodes, then) : [];
    const target = found.length === 1 ? `/n/${encodeURIComponent(found[0].id)}` : then ? `/?q=${encodeURIComponent(then)}` : "/";
    history.replaceState(null, "", target);
    fromLocation("open");
  }

  function onKey(e: KeyboardEvent) {
    const typing = e.target instanceof HTMLInputElement;
    if (typing) return;
    if (e.key === "Escape" && sourceOpen) {
      sourceOpen = false;
      return;
    }
    if (e.key === "Backspace" || e.key === "b") {
      e.preventDefault();
      back();
    }
  }

  onMount(() => {
    loadMeta()
      .then((m) => {
        meta = m;
        fromLocation("open");
      })
      .catch((e) => (error = String(e)));
    const onPop = () => fromLocation("history");
    window.addEventListener("popstate", onPop);
    // files changed: future moves and search use the new index; the screen on show stays until refreshed
    const stopListening = onIndexUpdate(async (e) => {
      if (e.reason === "setup") return; // the setup page reloads the index itself
      const next = await loadMeta();
      clearCaches();
      meta = next;
      indexUpdate = { changed: e.changed };
      if (focusId) loadScreens([focusId]).then(() => {
        const s = focusId ? cachedScreen(focusId) : undefined;
        if (s) loadScreens([...s.dependents, ...s.dependencies].map((n) => n.id));
      });
    });
    return () => {
      window.removeEventListener("popstate", onPop);
      stopListening();
    };
  });
</script>

<svelte:window onkeydown={onKey} />

{#if error}
  <p class="message">codezoom could not load the index: {error}</p>
{:else if !meta}
  <p class="message">Loading…</p>
{:else}
  <div class="app">
    <TopBar {meta} {nodes} {trail} {lastMove} onJump={jump} onTrail={goToTrail} onSetup={openSetup} />
    {#if setupPage}
      <SetupPage onlyNew={setupPage.onlyNew} onSaved={afterSetup} />
    {:else if focusId === null}
      <StartPage {meta} query={initialQuery} onJump={jump} />
    {:else if layers.length}
      {#if indexUpdate}
        <div class="notice" role="status">
          Index updated: {indexUpdate.changed.length}
          {indexUpdate.changed.length === 1 ? "file" : "files"} changed{indexUpdate.changed.length
            ? ` (${indexUpdate.changed
                .slice(0, 2)
                .map((f) => f.slice(f.lastIndexOf("/") + 1))
                .join(", ")}${indexUpdate.changed.length > 2 ? ", …" : ""})`
            : ""}. This screen still shows the previous index.
          <button onclick={() => focusId && show(focusId, trail, "refresh")}>Refresh</button>
          <button class="dismiss" onclick={() => (indexUpdate = null)} aria-label="Dismiss">×</button>
        </div>
      {/if}
      <div class="main" class:with-source={sourceOpen}>
      <div class="stage" class:zooming bind:this={stageEl}>
        {#each layers as layer (layer.key)}
          {#if layer.nodes.get(layer.id)}
            <div class="layer" bind:this={layerEls[layer.key]}>
              <ScreenView
                screen={layer.screen}
                focus={layer.nodes.get(layer.id)!}
                nodes={layer.nodes}
                files={layer.files}
                previousId={layer.previousId}
                onDrill={drill}
                onBack={back}
                onOpenSource={() => (sourceOpen = !sourceOpen)}
                onHoverRefs={(refs) => (marks = refs)}
              />
            </div>
          {/if}
        {/each}
      </div>
      {#if sourceOpen && top && top.nodes.get(top.id)}
        {#key top.key}
          <SourcePanel
            focus={top.nodes.get(top.id)!}
            box={top.screen.focus}
            files={top.files}
            editor={meta.editor ?? null}
            {marks}
            onClose={() => (sourceOpen = false)}
          />
        {/key}
      {/if}
      </div>
    {:else if missing}
      <p class="message">No node <code>{focusId}</code> in this index. Use the search box to Jump.</p>
    {/if}
  </div>
{/if}

<style>
  .app {
    display: grid;
    grid-template-rows: auto 1fr;
    height: 100vh;
  }
  .notice {
    position: fixed;
    left: 50%;
    top: 52px;
    transform: translateX(-50%);
    z-index: 25;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: calc(100vw - 32px);
    padding: 6px 8px 6px 14px;
    border: 1px solid var(--accent);
    border-radius: 8px;
    background: var(--panel);
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.15);
    font-size: 12px;
  }
  .notice button {
    border: 1px solid var(--accent);
    background: var(--accent-soft);
    border-radius: 5px;
    padding: 2px 10px;
    cursor: pointer;
  }
  .notice .dismiss {
    border: none;
    background: none;
    color: var(--muted);
    font-size: 16px;
    padding: 0 4px;
  }
  .main {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
  }
  .main.with-source {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .stage {
    position: relative;
    min-height: 0;
    overflow: hidden;
  }
  .layer {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
  }
  .stage.zooming .layer {
    pointer-events: none;
  }
  .message {
    margin: 4rem auto;
    max-width: 40rem;
    color: var(--muted);
    text-align: center;
  }
</style>
