<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { Meta, NodeInfo, Screen } from "../../src/shared/types";
  import { cachedScreen, loadMeta, loadScreens } from "./api";
  import TopBar from "./TopBar.svelte";
  import ScreenView from "./ScreenView.svelte";
  import StartPage from "./StartPage.svelte";

  type MoveKind = "drill" | "back" | "jump" | "open" | "history";
  interface Move {
    kind: MoveKind;
    id: string;
    /** From the move until the new screen is laid out and ready to paint. */
    ms: number;
    /** From the move to the next animation frame (only when the page is visible). */
    frameMs: number | null;
    cached: boolean;
  }

  let meta = $state.raw<Meta | null>(null);
  let error = $state<string | null>(null);
  let focusId = $state<string | null>(null);
  let trail = $state.raw<string[]>([]);
  let screen = $state.raw<Screen | null>(null);
  let lastMove = $state.raw<Move | null>(null);
  let missing = $state(false);
  let initialQuery = $state("");

  const nodes = $derived(new Map<string, NodeInfo>((meta?.nodes ?? []).map((n) => [n.id, n])));
  const previousId = $derived(trail.length > 1 ? trail[trail.length - 2] : null);

  const moves: Move[] = [];
  (window as unknown as { __codezoom: { moves: Move[] } }).__codezoom = { moves };

  const pathFor = (id: string) => `/n/${encodeURIComponent(id)}`;

  function show(id: string, nextTrail: string[], kind: MoveKind) {
    const t0 = performance.now();
    const hit = cachedScreen(id);
    const apply = (s: Screen) => {
      missing = false;
      focusId = id;
      trail = nextTrail;
      screen = s;
      const round = (ms: number) => Math.round(ms * 10) / 10;
      tick().then(() => {
        document.body.getBoundingClientRect(); // style and layout happen now, not later
        const move: Move = { kind, id, ms: round(performance.now() - t0), frameMs: null, cached: !!hit };
        moves.push(move);
        lastMove = move;
        requestAnimationFrame(() => (move.frameMs = round(performance.now() - t0)));
      });
      // preload every neighbour so the next Drill draws without the server
      loadScreens([...s.dependents, ...s.dependencies].map((n) => n.id));
    };
    if (hit) apply(hit);
    else
      loadScreens([id]).then(() => {
        const s = cachedScreen(id);
        if (s) apply(s);
        else {
          focusId = id;
          trail = nextTrail;
          screen = null;
          missing = true;
        }
      });
    document.title = `${nodes.get(id)?.name ?? id} · codezoom`;
  }

  function drill(id: string) {
    if (id === previousId) return back();
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
    if (path.startsWith("/n/")) {
      const id = decodeURIComponent(path.slice(3));
      const stateTrail = (history.state as { trail?: string[] } | null)?.trail;
      const t = stateTrail && stateTrail[stateTrail.length - 1] === id ? stateTrail : [id];
      if (!stateTrail) history.replaceState({ trail: t }, "");
      show(id, t, kind);
    } else {
      focusId = null;
      trail = [];
      screen = null;
      initialQuery = new URLSearchParams(location.search).get("q") ?? "";
      document.title = "codezoom";
    }
  }

  function onKey(e: KeyboardEvent) {
    const typing = e.target instanceof HTMLInputElement;
    if (typing) return;
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
    return () => window.removeEventListener("popstate", onPop);
  });
</script>

<svelte:window onkeydown={onKey} />

{#if error}
  <p class="message">codezoom could not load the index: {error}</p>
{:else if !meta}
  <p class="message">Loading…</p>
{:else}
  <div class="app">
    <TopBar {meta} {nodes} {trail} {lastMove} onJump={jump} onTrail={goToTrail} />
    {#if focusId === null}
      <StartPage {meta} query={initialQuery} onJump={jump} />
    {:else if screen && nodes.get(focusId)}
      {#key focusId}
        <ScreenView {screen} focus={nodes.get(focusId)!} {nodes} files={meta.files} {previousId} onDrill={drill} onBack={back} />
      {/key}
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
  .message {
    margin: 4rem auto;
    max-width: 40rem;
    color: var(--muted);
    text-align: center;
  }
</style>
