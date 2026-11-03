// The browse screen: it paints at once from what is kept, then fills each tab as the sources answer.
//
// - `open` reads no network: the active tab is drawn from its kept copy (skeletons if none) and the tabs that still need their
//   rows become `pending` in the state.
// - A timer (`every`, only while something is pending) loads ONE tab per tick, the active one first, with the section page the
//   catalog already builds. Each tab is kept (kino.storage, 12 h) the moment it arrives, so a slow source never holds the others
//   back and a later opening paints from the copy first.
// - Tabs other than the active one are prefetched except on a TV (a weak box pays for every row it builds): there they load when
//   selected.
// The state holds only `tab`, `pending` and `failed` (a few bytes); the trees live here, in memory.
import { tabOf, recentOf, cardOf, playedKey, TAB_IDS } from "./model.js";
import { browseView, searchView, settingsView } from "./view.js";

const TAB_KEY = "browseTab";
const SNAP_PREFIX = "browse1:";
const SNAP_TTL_MS = 12 * 3600 * 1000;
const SNAP_MAX = 20 * 1024;
const RECENT_KEY = "recent1";
const RECENT_MAX = 12;
const HIST_KEY = "searchHist1";
const HIST_MAX = 24;
const MAX_LOAD_TRIES = 3;

/**
 * `kino`: the host; `loadTab(tab)` → the section page of that tab (`{ rows }`); `searchTitles(q)` → the cards a search finds;
 */
export function makeBrowse({ kino, loadTab, searchTitles }) {
  const memo = new Map(); // tab -> { data, whole: loaded in this sandbox }
  const log = (...a) => { try { kino.log("[animes]", ...a); } catch (_) { /* no log */ } };
  const get = (k) => { try { return kino.storage.get(k); } catch (_) { return null; } };
  const set = (k, v, opts) => { try { kino.storage.set(k, v, opts); } catch (_) { /* full storage: no copy */ } };

  // ---- the kept copy of a tab ----
  function readSnap(tab) {
    try {
      const o = JSON.parse(get(SNAP_PREFIX + tab) || "null");
      return o && Date.now() - o.at < SNAP_TTL_MS && o.data && Array.isArray(o.data.rails) ? o.data : null;
    } catch (_) { return null; }
  }
  function writeSnap(tab, data) {
    // Trimmed until it fits: the 256 KB of storage are shared with the TMDB, match and health caches and the Home copy.
    for (let per = 10; per >= 3; per -= 2) {
      const slim = { slides: data.slides.slice(0, 4), rails: data.rails.map((r) => ({ ...r, items: r.items.slice(0, per) })) };
      const text = JSON.stringify({ at: Date.now(), data: slim });
      if (text.length <= SNAP_MAX) { set(SNAP_PREFIX + tab, text, { ttlMs: SNAP_TTL_MS }); return; }
    }
  }

  const stored = () => { const t = get(TAB_KEY); return TAB_IDS.includes(t) ? t : null; };
  const remember = (tab) => set(TAB_KEY, tab);

  /** [tab]'s data for drawing: this sandbox's, else its kept copy (not "whole": the next tick refreshes it). */
  function dataOf(tab) {
    if (memo.has(tab)) return memo.get(tab).data;
    const snap = readSnap(tab);
    if (snap) { memo.set(tab, { data: snap, whole: false }); return snap; }
    return null;
  }

  // ---- what was played ----
  const readKeys = () => { try { const a = JSON.parse(get(RECENT_KEY) || "[]"); return Array.isArray(a) ? a.filter((k) => typeof k === "string") : []; } catch (_) { return []; } };
  /** Notes that [ref] was played now (the title is remembered by its TMDB id when it has one). Never throws. */
  function notePlayed(ref) {
    try {
      const key = playedKey(ref);
      if (key === "") return;
      const keys = readKeys();
      if (keys[0] === key) return;
      set(RECENT_KEY, JSON.stringify([key, ...keys.filter((k) => k !== key)].slice(0, RECENT_MAX)));
    } catch (_) { /* the row just misses a title */ }
  }

  // ---- earlier searches ----
  const slim = (c) => ({ id: c.id, ref: c.ref, title: c.title, kind: c.kind, ...(c.poster ? { poster: c.poster } : {}) });
  function readHistory() {
    try {
      const a = JSON.parse(get(HIST_KEY) || "[]");
      return Array.isArray(a) ? a.filter((c) => c && typeof c.id === "string" && typeof c.ref === "string" && typeof c.title === "string").slice(0, HIST_MAX) : [];
    } catch (_) { return []; }
  }
  function rememberFound(cards) {
    try {
      const fresh = cards.filter((c) => c.adult !== true).slice(0, 12).map(slim);
      const ids = new Set(fresh.map((c) => c.id));
      set(HIST_KEY, JSON.stringify([...fresh, ...readHistory().filter((c) => !ids.has(c.id))].slice(0, HIST_MAX)));
    } catch (_) { /* the page just has no history */ }
  }

  let found = null; // { q, items }: the last search

  const tabFromArgs = (route) => {
    const a = route && route.args && typeof route.args === "object" ? route.args : {};
    return TAB_IDS.includes(a.tab) ? a.tab : null;
  };

  /** The tabs to load: the active one if it is not whole yet, then the rest (not on a TV). */
  function needed(tab, device) {
    const order = [tab, ...TAB_IDS.filter((t) => t !== tab)];
    return order.filter((t, i) => (i === 0 || device !== "tv") && !(memo.get(t) && memo.get(t).whole));
  }

  function view(ctx) {
    const st = ctx.state && typeof ctx.state === "object" ? ctx.state : {};
    if (ctx.route && ctx.route.name === "settings") return settingsView();
    if (ctx.route && ctx.route.name === "search") {
      const query = typeof st.sq === "string" ? st.sq : "";
      const items = found && found.q === query ? found.items : null;
      const status = query === "" ? "idle" : st.sstate === "fail" ? "fail" : items ? "done" : "loading";
      return searchView({ query, status, items, history: query === "" ? readHistory() : [], device: ctx.device });
    }
    const tab = TAB_IDS.includes(st.tab) ? st.tab : (tabFromArgs(ctx.route) ?? stored() ?? TAB_IDS[0]);
    const data = dataOf(tab);
    const loaded = TAB_IDS.map((t) => memo.get(t)).filter(Boolean).map((m) => m.data);
    const pending = Array.isArray(st.pending) && st.pending.length > 0;
    return browseView({ tab, data, recent: recentOf(readKeys(), loaded), pending, failed: !!(st.failed && st.failed[tab]), device: ctx.device });
  }

  async function load(tab) {
    const page = await loadTab(tab);
    const data = tabOf(page);
    if (data) { memo.set(tab, { data, whole: true }); writeSnap(tab, data); }
    return data !== null;
  }

  // The bridge keeps scraping after a request ends, so a tab that did not load is asked again (twice) before the retry banner shows.
  const loadTries = new Map();
  function failLoad(tab, rest, failed) {
    const n = (loadTries.get(tab) || 0) + 1;
    loadTries.set(tab, n);
    if (n < MAX_LOAD_TRIES) rest.push(tab); else { failed[tab] = true; loadTries.delete(tab); }
  }

  const events = {
    open({ route, state, device }) {
      const tab = tabFromArgs(route) ?? (TAB_IDS.includes(state.tab) ? state.tab : stored() ?? TAB_IDS[0]);
      for (const t of TAB_IDS) dataOf(t); // the kept copies, so a played title is found whichever tab it was on
      return { state: { tab, pending: needed(tab, device), failed: null } };
    },
    tab({ value, arg, state }) {
      const tab = TAB_IDS.includes(value) ? value : TAB_IDS.includes(arg) ? arg : null;
      if (!tab) return null;
      remember(tab);
      dataOf(tab);
      const failed = { ...(state.failed || {}) };
      delete failed[tab];
      const pending = [tab, ...(Array.isArray(state.pending) ? state.pending.filter((t) => t !== tab) : [])];
      return { state: { tab, pending: memo.get(tab) && memo.get(tab).whole ? pending.slice(1) : pending, failed } };
    },
    retry({ state, device }) {
      const tab = TAB_IDS.includes(state.tab) ? state.tab : TAB_IDS[0];
      return { state: { failed: null, pending: [tab, ...needed(tab, device).filter((t) => t !== tab)] } };
    },
    async tick({ state }) {
      const pending = Array.isArray(state.pending) ? state.pending : [];
      if (pending.length === 0) return null;
      const [next, ...rest] = pending;
      const failed = { ...(state.failed || {}) };
      try {
        const ok = await load(next);
        if (!ok) failLoad(next, rest, failed); else delete failed[next];
      } catch (e) {
        log("browse tab", (e && e.code) || "error");
        failLoad(next, rest, failed);
      }
      return { state: { pending: rest, failed } };
    },
    // The floating button: straight to the search page, empty and ready for the words.
    openSearch() { return { route: { push: "search" }, state: { sq: "", sstate: null } }; },
    search({ value, route }) {
      const q = value && typeof value.q === "string" ? value.q.trim().slice(0, 100) : "";
      if (q === "") return null;
      const state = { sq: q, sstate: "loading" };
      return route && route.name === "search" ? { state } : { route: { push: "search" }, state };
    },
    // The search page's timer: one search per press, then no timer.
    async stick({ state }) {
      const q = typeof state.sq === "string" ? state.sq : "";
      if (q === "" || state.sstate !== "loading") return null;
      try {
        const out = await searchTitles(q);
        found = { q, items: (Array.isArray(out) ? out : []).slice(0, 60).map(cardOf) };
        rememberFound(found.items);
        return { state: { sstate: "done" } };
      } catch (e) {
        log("browse search", (e && e.code) || "error");
        return { state: { sstate: "fail" } };
      }
    },
    sretry({ state }) { return typeof state.sq === "string" && state.sq !== "" ? { state: { sstate: "loading" } } : null; },
    // The gear: the plugin's settings are a page of their own, one Back away.
    go({ arg }) {
      return arg === "settings" ? { route: { push: "settings" }, state: { fromBrowse: true } } : null;
    },
    back({ state, route }) {
      // The settings page opened on its own (from the settings button) closes; pushed from the gear, or the search page, it pops.
      if (route && route.name === "settings" && !state.fromBrowse) return { close: true };
      return { route: { pop: true }, state: { sq: null, sstate: null } };
    },
  };

  async function event(ev) {
    const handler = Object.hasOwn(events, ev.name) ? events[ev.name] : null;
    return handler ? (await handler({ ...ev, state: ev.state || {} })) ?? null : null;
  }

  return { view, event, notePlayed };
}
