// src/browse/model.js
var TAB_IDS = ["recientes", "series", "generos"];
var MAX_RAILS = 12;
var MAX_RAIL_ITEMS = 20;
var HTTPS = /^https:\/\//;
function cardOf(item) {
  const out = { id: item.id, ref: item.ref, title: item.title, kind: item.kind };
  const poster = item.poster || item.logo;
  if (poster && HTTPS.test(poster)) out.poster = poster;
  if (item.backdrop && HTTPS.test(item.backdrop)) out.backdrop = item.backdrop;
  if (item.rating !== void 0) out.rating = item.rating;
  if (item.year !== void 0) out.year = item.year;
  if (item.ids && item.ids.tmdb) out.ids = { tmdb: item.ids.tmdb };
  if (item.adult === true) out.adult = true;
  return out;
}
function railsOf(rows) {
  return rows.filter((r) => r.items && r.items.length > 0).slice(0, MAX_RAILS).map((r) => ({
    id: r.id,
    title: r.title,
    ...r.ref ? { ref: r.ref } : {},
    items: r.items.slice(0, MAX_RAIL_ITEMS).map(cardOf)
  }));
}
function tabOf(page) {
  const rows = page && Array.isArray(page.rows) ? page.rows : [];
  const rails = railsOf(rows);
  if (rails.length === 0) return null;
  return { slides: [], rails };
}
function playedKey(ref) {
  const r = String(ref || "");
  return /^s:[A-Za-z0-9._~-]+$/.test(r) ? r : "";
}
function recentOf(keys, tabs) {
  if (keys.length === 0) return [];
  const byKey = /* @__PURE__ */ new Map();
  for (const data of tabs) for (const rail2 of data.rails) for (const card of rail2.items) if (!byKey.has(card.ref)) byKey.set(card.ref, card);
  const out = [];
  const used = /* @__PURE__ */ new Set();
  for (const key of keys) {
    const card = byKey.get(key);
    if (card && !used.has(card.id)) {
      used.add(card.id);
      out.push(card);
    }
  }
  return out;
}

// src/browse/words.js
var WORDS = {
  tabRecent: ["Recientes", "Recent"],
  tabSeries: ["Series", "Series"],
  tabGenres: ["G\xE9neros", "Genres"],
  brWatch: ["Ver", "Watch"],
  brInfo: ["M\xE1s informaci\xF3n", "More info"],
  brRecent: ["Continuar viendo", "Continue watching"],
  brSearch: ["Buscar", "Search"],
  brSearchHint: ["Buscar en HentaiMama", "Search HentaiMama"],
  brSearchTitle: ["Buscar", "Search"],
  brSearchedBefore: ["Buscado recientemente", "Recently searched"],
  brNoResults: ["No encontramos nada con esas palabras.", "Nothing matched those words."],
  brSearchFailed: ["No se pudo buscar. Revisa tu conexi\xF3n e int\xE9ntalo de nuevo.", "The search failed. Check your connection and try again."],
  brFailed: ["No se pudo cargar esta secci\xF3n. Revisa tu conexi\xF3n e int\xE9ntalo de nuevo.", "This section could not be loaded. Check your connection and try again."],
  brRetry: ["Reintentar", "Retry"],
  brEmpty: ["A\xFAn no hay nada aqu\xED.", "Nothing here yet."],
  brBack: ["Atr\xE1s", "Back"],
  brClose: ["Cerrar", "Close"],
  brSettings: ["Configuraci\xF3n", "Settings"]
};
var both = (key) => ({ es: WORDS[key][0], en: WORDS[key][1] });
var KEYS = Object.keys(WORDS);

// src/browse/logo.js
var LOGO_ASPECT = "3.33:1";
var LOGO_DATA = "data:image/png;base64,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";

// src/browse/view.js
var TAB_KEYS = { recientes: "tabRecent", series: "tabSeries", generos: "tabGenres" };
var POLL_MS = 1500;
var SEARCH_CAP = 60;
var twin = (key, field = "text", vars) => {
  const w = both(key, vars);
  return { [field]: w.es, [field + "En"]: w.en };
};
var logo = () => ({
  type: "Image",
  key: "logo",
  url: LOGO_DATA,
  aspect: LOGO_ASPECT,
  fit: "contain",
  h: 40,
  alt: "HentaiMama",
  altEn: "HentaiMama",
  fallback: { type: "Text", text: "HentaiMama", textEn: "HentaiMama", style: "h4" }
});
var tabBar = (active) => ({ type: "TabBar", key: "tabs", divider: false, value: active, onChanged: "tab", tabs: TAB_IDS.map((id) => ({ value: id, ...twin(TAB_KEYS[id], "label") })) });
var railSkeleton = (n) => ({
  type: "Column",
  key: "skel" + n,
  gap: 8,
  children: [
    { type: "Skeleton", shape: "line", width: 120 },
    { type: "Row", gap: 12, sizes: ["compact"], children: [1, 2, 3].map((i) => ({ type: "Skeleton", shape: "card", key: `sk${n}c${i}`, flex: 1 })) },
    { type: "Row", gap: 12, sizes: ["medium", "expanded"], children: [1, 2, 3, 4, 5, 6].map((i) => ({ type: "Skeleton", shape: "card", key: `sk${n}w${i}`, flex: 1 })) }
  ]
});
var gridSkeleton = () => ({
  type: "Column",
  key: "gridSkeleton",
  gap: 12,
  children: [
    ...[1, 2].map((r) => ({ type: "Row", gap: 12, sizes: ["compact"], key: `gc${r}`, children: [1, 2, 3].map((i) => ({ type: "Skeleton", shape: "card", key: `gc${r}-${i}`, flex: 1 })) })),
    ...[1, 2].map((r) => ({ type: "Row", gap: 12, sizes: ["medium", "expanded"], key: `gw${r}`, children: [1, 2, 3, 4, 5, 6].map((i) => ({ type: "Skeleton", shape: "card", key: `gw${r}-${i}`, flex: 1 })) }))
  ]
});
var rail = (r, key, titleOverride, size = "medium") => ({
  type: "titleRail",
  key,
  ...titleOverride || { title: r.title },
  ...r.ref ? { ref: r.ref } : {},
  items: r.items,
  size
});
function browseView({ tab, data, recent, pending, failed, device = "phone" }) {
  const tv = device === "tv";
  const gear = { type: "IconButton", key: "settingsButton", icon: "settings", ...twin("brSettings", "labelText"), ...twin("brSettings", "tooltip"), onPressed: { event: "go", arg: "settings" } };
  const active = TAB_IDS.includes(tab) ? tab : TAB_IDS[0];
  const body = [];
  if (data) {
    if (recent.length > 0) body.push(rail({ items: recent }, "recent", twin("brRecent", "title"), tv ? "small" : "medium"));
    for (const r of data.rails) body.push(rail(r, "rail-" + String(r.id).replace(/[^A-Za-z0-9_-]/g, "_"), null, tv ? "small" : "medium"));
    if (data.rails.length === 0) body.push({ type: "Text", ...twin("brEmpty", "text"), color: "muted" });
  } else if (failed) {
    body.push({
      type: "MaterialBanner",
      key: "loadFailed",
      role: "error",
      ...twin("brFailed"),
      action: { ...twin("brRetry", "label"), onTap: "retry" }
    });
  } else {
    body.push(railSkeleton(1), railSkeleton(2), railSkeleton(3));
  }
  return {
    type: "Scaffold",
    appBar: {
      type: "AppBar",
      // One bar instead of two (Kino 0.9.81+; an older Kino draws its own bar above and this one under it): the close button where
      // Kino's was and the plugin's logo where its name was (its name when the logo cannot be drawn), with no line under it.
      mergeWithKinoBar: true,
      dense: true,
      divider: false,
      leading: { type: "IconButton", key: "close", icon: "close", ...twin("brClose", "labelText"), ...twin("brClose", "tooltip"), onPressed: { go: { close: true } } },
      // On a TV the search is a button of the bar (a floating one is hard to reach with a remote); elsewhere it floats.
      actions: tv ? [{ type: "IconButton", key: "searchButton", icon: "search", ...twin("brSearch", "labelText"), ...twin("brSearch", "tooltip"), onPressed: "openSearch" }, gear] : [gear],
      title: tv ? { type: "Row", key: "titleRow", gap: 24, crossAxisAlignment: "center", children: [logo(), tabBar(active)] } : logo()
    },
    ...tv ? {} : { floatingActionButton: { type: "FloatingActionButton", key: "searchFab", icon: "search", ...twin("brSearch", "tooltip"), onPressed: "openSearch" } },
    // The tabs stay pinned under the bar; only the rows scroll.
    body: { type: "Column", key: "page", children: [
      // The tabs line up with the bar's buttons and the cards below (a wide window and the TV pad their content by 24).
      ...tv ? [] : [{ type: "Column", key: "tabsRow", padding: { compact: 0, expanded: 24 }, children: [tabBar(active)] }],
      { type: "SingleChildScrollView", key: "browse-" + active, flex: 1, children: [{ type: "Column", padding: { compact: 12, expanded: 24 }, gap: 16, children: body }] }
    ] },
    ...pending ? { every: { ms: POLL_MS, event: "tick" } } : {}
  };
}
function settingsView() {
  return {
    type: "Scaffold",
    appBar: {
      type: "AppBar",
      mergeWithKinoBar: true,
      dense: true,
      divider: false,
      leading: { type: "IconButton", key: "back", icon: "arrow_back", ...twin("brBack", "labelText"), ...twin("brBack", "tooltip"), onPressed: "back" },
      title: logo()
    },
    body: { type: "SingleChildScrollView", key: "settings-page", children: [{ type: "Column", padding: { compact: 12, expanded: 24 }, gap: 16, children: [{ type: "settings", key: "form" }] }] }
  };
}
function searchView({ query, status, items, history = [], device = "phone" }) {
  const tv = device === "tv";
  const searchForm = () => ({
    type: "Form",
    key: "searchForm",
    onSubmitted: "search",
    gap: 8,
    children: tv ? [{ type: "Row", key: "searchRow", gap: 16, crossAxisAlignment: "center", children: [
      { type: "TextField", key: "q", kind: "text", value: query, ...twin("brSearchHint", "labelText"), maxLength: 100, autofocus: true, weight: 1 },
      { type: "ElevatedButton", key: "searchGo", ...twin("brSearch", "labelText"), icon: "search", submit: true }
    ] }] : [
      { type: "TextField", key: "q", kind: "text", value: query, ...twin("brSearchHint", "labelText"), maxLength: 100, autofocus: true },
      { type: "ElevatedButton", key: "searchGo", ...twin("brSearch", "labelText"), icon: "search", submit: true }
    ]
  });
  const body = tv ? [] : [searchForm()];
  if (status === "fail") {
    body.push({ type: "MaterialBanner", key: "searchFailed", role: "error", ...twin("brSearchFailed"), action: { ...twin("brRetry", "label"), onTap: "sretry" } });
  } else if (status === "done" && items) {
    if (items.length === 0) body.push({ type: "Text", ...twin("brNoResults", "text"), color: "muted" });
    else body.push({ type: "titleGrid", key: "results", columns: { compact: 3, expanded: 6 }, items: items.slice(0, SEARCH_CAP) });
  } else if (status !== "idle") {
    body.push(gridSkeleton());
  } else if (history.length > 0) {
    body.push({ type: "Text", ...twin("brSearchedBefore", "text"), style: "h4" });
    body.push({ type: "titleGrid", key: "history", columns: { compact: 3, expanded: 6 }, items: history.slice(0, SEARCH_CAP) });
  }
  return {
    type: "Scaffold",
    appBar: {
      type: "AppBar",
      mergeWithKinoBar: true,
      dense: true,
      divider: false,
      leading: { type: "IconButton", key: "back", icon: "arrow_back", ...twin("brBack", "labelText"), ...twin("brBack", "tooltip"), onPressed: "back" },
      ...tv ? { title: searchForm() } : twin("brSearchTitle", "title")
    },
    body: { type: "SingleChildScrollView", key: "search-page", children: [{ type: "Column", padding: { compact: 12, expanded: 24 }, gap: 16, children: body }] },
    ...status === "loading" ? { every: { ms: 1e3, event: "stick" } } : {}
  };
}

// src/browse/index.js
var TAB_KEY = "browseTab";
var SNAP_PREFIX = "browse1:";
var SNAP_TTL_MS = 12 * 3600 * 1e3;
var SNAP_MAX = 20 * 1024;
var RECENT_KEY = "recent1";
var RECENT_MAX = 12;
var HIST_KEY = "searchHist1";
var HIST_MAX = 24;
var MAX_LOAD_TRIES = 3;
function makeBrowse({ kino: kino2, loadTab, searchTitles }) {
  const memo = /* @__PURE__ */ new Map();
  const log = (...a) => {
    try {
      kino2.log("[animes]", ...a);
    } catch (_) {
    }
  };
  const get = (k) => {
    try {
      return kino2.storage.get(k);
    } catch (_) {
      return null;
    }
  };
  const set = (k, v, opts) => {
    try {
      kino2.storage.set(k, v, opts);
    } catch (_) {
    }
  };
  function readSnap(tab) {
    try {
      const o = JSON.parse(get(SNAP_PREFIX + tab) || "null");
      return o && Date.now() - o.at < SNAP_TTL_MS && o.data && Array.isArray(o.data.rails) ? o.data : null;
    } catch (_) {
      return null;
    }
  }
  function writeSnap(tab, data) {
    for (let per = 10; per >= 3; per -= 2) {
      const slim2 = { slides: data.slides.slice(0, 4), rails: data.rails.map((r) => ({ ...r, items: r.items.slice(0, per) })) };
      const text = JSON.stringify({ at: Date.now(), data: slim2 });
      if (text.length <= SNAP_MAX) {
        set(SNAP_PREFIX + tab, text, { ttlMs: SNAP_TTL_MS });
        return;
      }
    }
  }
  const stored = () => {
    const t2 = get(TAB_KEY);
    return TAB_IDS.includes(t2) ? t2 : null;
  };
  const remember = (tab) => set(TAB_KEY, tab);
  function dataOf(tab) {
    if (memo.has(tab)) return memo.get(tab).data;
    const snap = readSnap(tab);
    if (snap) {
      memo.set(tab, { data: snap, whole: false });
      return snap;
    }
    return null;
  }
  const readKeys = () => {
    try {
      const a = JSON.parse(get(RECENT_KEY) || "[]");
      return Array.isArray(a) ? a.filter((k) => typeof k === "string") : [];
    } catch (_) {
      return [];
    }
  };
  function notePlayed(ref) {
    try {
      const key = playedKey(ref);
      if (key === "") return;
      const keys = readKeys();
      if (keys[0] === key) return;
      set(RECENT_KEY, JSON.stringify([key, ...keys.filter((k) => k !== key)].slice(0, RECENT_MAX)));
    } catch (_) {
    }
  }
  const slim = (c) => ({ id: c.id, ref: c.ref, title: c.title, kind: c.kind, ...c.poster ? { poster: c.poster } : {} });
  function readHistory() {
    try {
      const a = JSON.parse(get(HIST_KEY) || "[]");
      return Array.isArray(a) ? a.filter((c) => c && typeof c.id === "string" && typeof c.ref === "string" && typeof c.title === "string").slice(0, HIST_MAX) : [];
    } catch (_) {
      return [];
    }
  }
  function rememberFound(cards) {
    try {
      const fresh = cards.filter((c) => c.adult !== true).slice(0, 12).map(slim);
      const ids = new Set(fresh.map((c) => c.id));
      set(HIST_KEY, JSON.stringify([...fresh, ...readHistory().filter((c) => !ids.has(c.id))].slice(0, HIST_MAX)));
    } catch (_) {
    }
  }
  let found = null;
  const tabFromArgs = (route) => {
    const a = route && route.args && typeof route.args === "object" ? route.args : {};
    return TAB_IDS.includes(a.tab) ? a.tab : null;
  };
  function needed(tab, device) {
    const order = [tab, ...TAB_IDS.filter((t2) => t2 !== tab)];
    return order.filter((t2, i) => (i === 0 || device !== "tv") && !(memo.get(t2) && memo.get(t2).whole));
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
    const tab = TAB_IDS.includes(st.tab) ? st.tab : tabFromArgs(ctx.route) ?? stored() ?? TAB_IDS[0];
    const data = dataOf(tab);
    const loaded = TAB_IDS.map((t2) => memo.get(t2)).filter(Boolean).map((m) => m.data);
    const pending = Array.isArray(st.pending) && st.pending.length > 0;
    return browseView({ tab, data, recent: recentOf(readKeys(), loaded), pending, failed: !!(st.failed && st.failed[tab]), device: ctx.device });
  }
  async function load(tab) {
    const page = await loadTab(tab);
    const data = tabOf(page);
    if (data) {
      memo.set(tab, { data, whole: true });
      writeSnap(tab, data);
    }
    return data !== null;
  }
  const loadTries = /* @__PURE__ */ new Map();
  function failLoad(tab, rest, failed) {
    const n = (loadTries.get(tab) || 0) + 1;
    loadTries.set(tab, n);
    if (n < MAX_LOAD_TRIES) rest.push(tab);
    else {
      failed[tab] = true;
      loadTries.delete(tab);
    }
  }
  const events = {
    open({ route, state, device }) {
      const tab = tabFromArgs(route) ?? (TAB_IDS.includes(state.tab) ? state.tab : stored() ?? TAB_IDS[0]);
      for (const t2 of TAB_IDS) dataOf(t2);
      return { state: { tab, pending: needed(tab, device), failed: null } };
    },
    tab({ value, arg, state }) {
      const tab = TAB_IDS.includes(value) ? value : TAB_IDS.includes(arg) ? arg : null;
      if (!tab) return null;
      remember(tab);
      dataOf(tab);
      const failed = { ...state.failed || {} };
      delete failed[tab];
      const pending = [tab, ...Array.isArray(state.pending) ? state.pending.filter((t2) => t2 !== tab) : []];
      return { state: { tab, pending: memo.get(tab) && memo.get(tab).whole ? pending.slice(1) : pending, failed } };
    },
    retry({ state, device }) {
      const tab = TAB_IDS.includes(state.tab) ? state.tab : TAB_IDS[0];
      return { state: { failed: null, pending: [tab, ...needed(tab, device).filter((t2) => t2 !== tab)] } };
    },
    async tick({ state }) {
      const pending = Array.isArray(state.pending) ? state.pending : [];
      if (pending.length === 0) return null;
      const [next, ...rest] = pending;
      const failed = { ...state.failed || {} };
      try {
        const ok = await load(next);
        if (!ok) failLoad(next, rest, failed);
        else delete failed[next];
      } catch (e) {
        log("browse tab", e && e.code || "error");
        failLoad(next, rest, failed);
      }
      return { state: { pending: rest, failed } };
    },
    // The floating button: straight to the search page, empty and ready for the words.
    openSearch() {
      return { route: { push: "search" }, state: { sq: "", sstate: null } };
    },
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
        log("browse search", e && e.code || "error");
        return { state: { sstate: "fail" } };
      }
    },
    sretry({ state }) {
      return typeof state.sq === "string" && state.sq !== "" ? { state: { sstate: "loading" } } : null;
    },
    // The gear: the plugin's settings are a page of their own, one Back away.
    go({ arg }) {
      return arg === "settings" ? { route: { push: "settings" }, state: { fromBrowse: true } } : null;
    },
    back({ state, route }) {
      if (route && route.name === "settings" && !state.fromBrowse) return { close: true };
      return { route: { pop: true }, state: { sq: null, sstate: null } };
    }
  };
  async function event(ev) {
    const handler = Object.hasOwn(events, ev.name) ? events[ev.name] : null;
    return handler ? await handler({ ...ev, state: ev.state || {} }) ?? null : null;
  }
  return { view, event, notePlayed };
}

// src/plugin.js
var SITE = "https://hentaimama.io";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var PAGE_TIMEOUT_MS = 1e4;
var RESOLVE_BUDGET_MS = 17e3;
var STEP_PAGE_MS = 5e3;
var STEP_AJAX_MS = 4e3;
var STEP_EMBED_MS = 5e3;
var PROBE_TIMEOUT_MS = 3e3;
var HOST_BAD_MS = 3 * 60 * 1e3;
var FAST_HOST = "gdvid.info";
var STREAM_EXPIRES_S = 3600;
var MAX_ALTERNATIVES = 8;
var MAX_TILES = 24;
var POSTER_PARALLEL = 6;
var SPARE_TILES = 6;
var ART_CANDIDATES = 8;
var POPULAR_GENRES = ["uncensored", "3d", "big-boobs", "blowjob", "creampie", "ahegao", "anal", "school-girls", "harem", "bdsm", "romance", "fantasy", "comedy", "drama", "milf", "ntr", "bondage", "tentacle", "futanari", "yuri", "incest", "monster", "demon", "action"];
var TEXTS = {
  es: {
    unavailable: "HentaiMama no responde ahora. Intenta de nuevo en un rato.",
    noStreams: "Este episodio no tiene video disponible por ahora. Prueba otro o vuelve m\xE1s tarde.",
    rowSeries: "Series",
    rowRecent: "Episodios recientes",
    tabSeries: "Series",
    tabRecent: "Recientes",
    cacheStatus: "Cach\xE9: {n} entradas, {kb} KB",
    cacheCleared: "Listo: se vaci\xF3 la cach\xE9",
    epTitle: "Episodio {n}",
    srvMp4: "{q} \xB7 MP4",
    srvHls: "HLS (adaptable)",
    srvOriginal: "Original \xB7 MP4",
    srvOriginalShort: "Original",
    copyFailed: "Esta copia no se pudo abrir ahora. Prueba otro servidor del men\xFA.",
    srvSigned: "{q} \xB7 Servidor 2",
    probeDone: "Sitio {site} \xB7 archivos {files}",
    healthOk: "responde",
    healthFail: "no responde",
    healthNone: "sin datos",
    healthOff: "apagado",
    health: "Estado",
    srvLazy: "{q} \xB7 Servidor {n}"
  },
  en: {
    unavailable: "HentaiMama is not answering right now. Try again in a while.",
    noStreams: "This episode has no video available right now. Try another or come back later.",
    rowSeries: "Series",
    rowRecent: "Recent episodes",
    tabSeries: "Series",
    tabRecent: "Recent",
    cacheStatus: "Cache: {n} entries, {kb} KB",
    cacheCleared: "Done: the cache is empty",
    epTitle: "Episode {n}",
    srvMp4: "{q} \xB7 MP4",
    srvHls: "HLS (adaptive)",
    srvOriginal: "Original \xB7 MP4",
    srvOriginalShort: "Original",
    copyFailed: "This copy could not be opened right now. Try another server from the menu.",
    srvSigned: "{q} \xB7 Server 2",
    probeDone: "Site {site} \xB7 files {files}",
    healthOk: "answers",
    healthFail: "not answering",
    healthNone: "no data",
    healthOff: "off",
    health: "Status",
    srvLazy: "{q} \xB7 Server {n}"
  }
};
function t(key, vars) {
  const lang = String(kino.lang || "").toLowerCase().startsWith("es") ? "es" : "en";
  const template = TEXTS[lang][key] || TEXTS.es[key] || key;
  return vars ? template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] != null ? vars[k] : "")) : template;
}
var CACHE_PREFIX = "c2:";
var HARD_TTL_MS = 24 * 60 * 60 * 1e3;
var ENTRY_MAX_CHARS = 48 * 1024;
var FRESH_LIST_MS = 15 * 60 * 1e3;
var FRESH_SERIES_MS = 60 * 60 * 1e3;
var FRESH_GENRES_MS = 24 * 60 * 60 * 1e3;
var FRESH_ART_MS = 24 * 60 * 60 * 1e3;
var FRESH_PID_MS = 24 * 60 * 60 * 1e3;
var FRESH_MIRRORS_MS = 10 * 60 * 1e3;
function cacheKeys() {
  return kino.storage.keys().filter((k) => k.startsWith(CACHE_PREFIX));
}
function cacheRead(key) {
  const raw = kino.storage.get(CACHE_PREFIX + key);
  if (!raw) return null;
  try {
    const e = JSON.parse(raw);
    return e && typeof e.at === "number" ? e : null;
  } catch {
    kino.storage.remove(CACHE_PREFIX + key);
    return null;
  }
}
function evictOldest() {
  let victim = null;
  let oldest = Infinity;
  for (const k of cacheKeys()) {
    let at = 0;
    try {
      at = JSON.parse(kino.storage.get(k) || "{}").at || 0;
    } catch {
    }
    if (at < oldest) {
      oldest = at;
      victim = k;
    }
  }
  if (!victim) return false;
  kino.storage.remove(victim);
  return true;
}
function cacheWrite(key, v) {
  const raw = JSON.stringify({ at: Date.now(), v });
  if (raw.length > ENTRY_MAX_CHARS) return;
  for (let tries = 0; tries < 20; tries++) {
    try {
      kino.storage.set(CACHE_PREFIX + key, raw, { ttlMs: HARD_TTL_MS });
      return;
    } catch (e) {
      if (!e || e.code !== "too_large" || !evictOldest()) return;
    }
  }
}
async function cached(key, freshMs, load) {
  const hit = cacheRead(key);
  if (hit && Date.now() - hit.at < freshMs) return hit.v;
  try {
    const v = await load();
    cacheWrite(key, v);
    return v;
  } catch (e) {
    if (hit) {
      kino.log("serving stale " + key + ": " + (e && e.message));
      return hit.v;
    }
    throw e;
  }
}
async function getPage(url, opts) {
  const o = opts || {};
  let r;
  try {
    r = await kino.fetch(url, {
      method: o.body ? "POST" : "GET",
      headers: Object.assign({ "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9" }, o.headers || {}),
      body: o.body,
      timeoutMs: o.timeoutMs || PAGE_TIMEOUT_MS
    });
  } catch (e) {
    throw kino.error("unavailable", "hentaimama: " + (e && e.message), { userMessage: t("unavailable") });
  }
  if (r.status === 404) throw kino.error("not_found", "hentaimama: 404 " + url.slice(0, 100));
  if (!r.ok) throw kino.error("unavailable", "hentaimama answered " + r.status, { userMessage: t("unavailable") });
  return r.text();
}
async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const i = next++;
      out[i] = await fn(list[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
  return out;
}
var ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "\u2026", ndash: "\u2013", mdash: "\u2014", rsquo: "\u2019", lsquo: "\u2018", ldquo: "\u201C", rdquo: "\u201D" };
function decode(s) {
  return String(s || "").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] != null ? ENTITIES[n.toLowerCase()] : m);
}
function plain(html) {
  return decode(String(html || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}
var ID_RE = /^[A-Za-z0-9._~-]{1,128}$/;
function between(html, open, close) {
  const i = html.indexOf(open);
  if (i < 0) return "";
  const j = html.indexOf(close, i + open.length);
  return j < 0 ? "" : html.slice(i + open.length, j);
}
function attrOf(tag, name) {
  const m = new RegExp("\\b" + name + '="([^"]*)"').exec(tag);
  return m ? decode(m[1]) : "";
}
function absUrl(u) {
  if (!u) return "";
  if (u.startsWith("//")) return "https:" + u;
  return u.startsWith("/") ? SITE + u : u;
}
function imgOf(html) {
  const tag = /<img\b[^>]*>/i.exec(html);
  return tag ? absUrl(attrOf(tag[0], "src") || attrOf(tag[0], "data-src")) : "";
}
function parseSeriesPage(html) {
  const items = [];
  const parts = html.split('<article class="series-card">').slice(1);
  for (const part of parts) {
    const chunk = part.slice(0, part.indexOf("</article>") < 0 ? void 0 : part.indexOf("</article>"));
    const link = /href="https:\/\/hentaimama\.io\/tvshows\/([A-Za-z0-9._~-]+)\/"/.exec(chunk);
    if (!link || !ID_RE.test(link[1])) continue;
    const slug = link[1];
    const titleHtml = between(chunk, '<h3 class="sc-title">', "</h3>");
    const title = plain(titleHtml);
    if (!title) continue;
    const item = { id: slug, ref: "s:" + slug, title, kind: "series", adult: true };
    const poster = imgOf(chunk);
    if (poster) item.poster = poster;
    const rating = /icon-star2"><\/span>\s*([0-9.]+)/.exec(chunk);
    if (rating && Number(rating[1]) > 0) item.rating = Math.min(10, Number(rating[1]));
    const year = /<span class="sc-tag">((?:19|20)\d\d)<\/span>/.exec(chunk);
    if (year) item.year = year[1];
    const desc = plain(between(chunk, '<p class="sc-desc">', "</p>"));
    if (desc) item.overview = desc.slice(0, 600);
    const genres = [];
    const gBlock = between(chunk, '<div class="sc-genres">', "</div>");
    for (const g of gBlock.matchAll(/<a [^>]*>([^<]+)<\/a>/g)) genres.push(decode(g[1]).slice(0, 30));
    if (genres.length) item.genres = genres.slice(0, 5);
    const alt = plain(between(chunk, '<div class="sc-alt">', "</div>"));
    if (alt && alt !== title) item.originalTitle = alt.slice(0, 200);
    items.push(item);
  }
  const pages = /data-pages="(\d+)"/.exec(html);
  return { items, pages: pages ? Number(pages[1]) : 0 };
}
function parseRecentPage(html) {
  const items = [];
  const seen = /* @__PURE__ */ new Set();
  const parts = html.split('<article class="item ').slice(1);
  for (const part of parts) {
    const chunk = part.slice(0, part.indexOf("</article>") < 0 ? void 0 : part.indexOf("</article>"));
    const link = /href="https:\/\/hentaimama\.io\/episodes\/([A-Za-z0-9._~-]+?)(?:-episode-\d+)?\/"/.exec(chunk);
    if (!link || !ID_RE.test(link[1]) || seen.has(link[1])) continue;
    const title = plain(between(chunk, '<span class="b">', "</span>"));
    if (!title) continue;
    seen.add(link[1]);
    const item = { id: link[1], ref: "s:" + link[1], title, kind: "series", adult: true };
    const poster = imgOf(chunk);
    if (poster) item.poster = poster;
    const rating = /icon-star2"><\/span>\s*([0-9.]+)/.exec(chunk);
    if (rating && Number(rating[1]) > 0) item.rating = Math.min(10, Number(rating[1]));
    items.push(item);
  }
  const pages = /data-pages="(\d+)"/.exec(html);
  return { items, pages: pages ? Number(pages[1]) : 0 };
}
function parseSeries(html) {
  const info = {};
  const title = plain(between(html, '<h1 class="dsc-title">', "</h1>"));
  if (title) info.title = title;
  const og = /property="og:image"\s+content="([^"]+)"/.exec(html);
  if (og) info.poster = decode(og[1]);
  const overview = plain(between(html, '<div class="dsc-desc">', "</div>"));
  if (overview) info.overview = overview.slice(0, 1500);
  const gBlock = between(html, '<div class="dsc-genres">', "</div>") || between(html, '<div class="sc-genres">', "</div>");
  const genres = [];
  for (const g of gBlock.matchAll(/<a [^>]*rel="tag"[^>]*>([^<]+)<\/a>/g)) genres.push(decode(g[1]).slice(0, 30));
  if (genres.length) info.genres = genres.slice(0, 5);
  const score = /class="dsc-score"[^>]*><span class="icon-star2"><\/span>\s*([0-9.]+)/.exec(html);
  if (score && Number(score[1]) > 0) info.rating = Math.min(10, Number(score[1]));
  const aired = /<span>Aired<\/span><b>[^<]*?((?:19|20)\d\d)<\/b>/.exec(html);
  if (aired) info.year = aired[1];
  const episodes2 = [];
  const list = between(html, 'class="dt-se-list dt-se-page">', "</div></div>");
  const seen = /* @__PURE__ */ new Set();
  for (const m of list.matchAll(/<a class="dt-se-item" href="https:\/\/hentaimama\.io\/episodes\/([A-Za-z0-9._~-]+)\/">([\s\S]*?)<\/a>/g)) {
    const slug = m[1];
    if (seen.has(slug) || !slug) continue;
    seen.add(slug);
    const body = m[2];
    const numTag = /class="dt-se-num">EP\s*(\d+)/i.exec(body) || /-episode-(\d+)$/.exec(slug);
    const ep = { number: numTag ? Number(numTag[1]) : episodes2.length + 1, ref: "e:" + slug };
    const still = imgOf(body);
    if (still) ep.still = still;
    const date = /<span class="dt-se-date">([A-Za-z]{3}) (\d{1,2}), (\d{4})<\/span>/.exec(body);
    if (date) {
      const mo = "JanFebMarAprMayJunJulAugSepOctNovDec".indexOf(date[1]);
      if (mo >= 0) ep.airDate = `${date[3]}-${String(mo / 3 + 1).padStart(2, "0")}-${String(date[2]).padStart(2, "0")}`;
    }
    const synopsis = plain(between(body, '<span class="dt-se-desc">', "</span>"));
    if (synopsis && !/^No synopsis/i.test(synopsis)) ep.overview = synopsis.slice(0, 600);
    episodes2.push(ep);
  }
  episodes2.sort((a, b) => a.number - b.number);
  return { info, episodes: episodes2 };
}
function pageOut(items, page, pages) {
  const out = { items };
  if (pages && page < pages) out.next = String(page + 1);
  else if (!pages && items.length >= 20) out.next = String(page + 1);
  return out;
}
function pageNumber(cursor) {
  const n = Number(cursor);
  return Number.isInteger(n) && n >= 1 && n <= 500 ? n : 1;
}
function listUrl(path, page) {
  return page > 1 ? `${SITE}/${path}/page/${page}/` : `${SITE}/${path}/`;
}
function searchUrl(q, page) {
  const enc = encodeURIComponent(q);
  return page > 1 ? `${SITE}/page/${page}/?s=${enc}` : `${SITE}/?s=${enc}`;
}
async function search(query) {
  const q = kino.rank.shortQuery(String(query.q || "").trim());
  if (!q) return { items: [] };
  const page = pageNumber(query.cursor);
  const titles = [query.q, query.originalTitle].concat(Array.isArray(query.altTitles) ? query.altTitles : []).filter((x) => typeof x === "string" && x.trim());
  const ask = async (text) => {
    const { items, pages } = parseSeriesPage(await getPage(searchUrl(text, page)));
    return { items, pages };
  };
  let res = await ask(q);
  if (!res.items.length && page === 1) {
    const other = titles.map((x) => kino.rank.shortQuery(x.trim())).find((x) => x && x.toLowerCase() !== q.toLowerCase());
    if (other) res = await ask(other);
  }
  const sorted = page === 1 ? kino.rank.sortBySimilarity(res.items, titles) : res.items;
  return pageOut(sorted, page, res.pages);
}
var LISTS = {
  series: { path: "hentai-series", parse: parseSeriesPage, title: "rowSeries" },
  recent: { path: "recent-episodes", parse: parseRecentPage, title: "rowRecent" }
};
async function withSeriesPosters(items) {
  await mapLimit(items, POSTER_PARALLEL, async (item) => {
    const still = item.poster;
    try {
      const { info } = await loadSeries(item.id);
      if (info && info.poster) {
        item.poster = info.poster;
        if (still) item.backdrop = still;
      }
    } catch (e) {
      kino.log("poster " + item.id + " failed: " + (e && e.message));
    }
  });
  return items;
}
async function listPage(kind, page) {
  const def = LISTS[kind];
  return cached(`list:${kind}:${page}`, FRESH_LIST_MS, async () => {
    const out = def.parse(await getPage(listUrl(def.path, page)));
    if (kind === "recent") out.items = await withSeriesPosters(out.items);
    return out;
  });
}
async function genrePage(slug, page) {
  return cached(`genre:${slug}:${page}`, FRESH_LIST_MS, async () => parseSeriesPage(await getPage(listUrl(`genre/${slug}`, page))));
}
async function home() {
  if (kino.config.get("homeRows") === false) return [];
  const rows = await mapLimit(["recent", "series"], 2, async (kind) => {
    try {
      const { items } = await listPage(kind, 1);
      return items.length ? { id: "row-" + kind, title: t(LISTS[kind].title), items, ref: "l:" + kind } : null;
    } catch (e) {
      kino.log("home " + kind + " failed: " + (e && e.message));
      return null;
    }
  });
  return rows.filter(Boolean);
}
async function browse(ref, cursor) {
  const page = pageNumber(cursor);
  const list = /^l:(series|recent)$/.exec(String(ref || ""));
  if (list) {
    const { items, pages } = await listPage(list[1], page);
    return pageOut(items, page, pages);
  }
  const genre = /^g:([a-z0-9-]+)$/.exec(String(ref || ""));
  if (genre) {
    const { items, pages } = await genrePage(genre[1], page);
    return pageOut(items, page, pages);
  }
  throw kino.error("not_found", "unknown browse ref: " + String(ref).slice(0, 60));
}
var SCREEN_GENRES = ["uncensored", "harem", "romance", "fantasy", "comedy", "drama", "school-girls", "milf", "3d", "bdsm", "ntr", "bondage"];
var SCREEN_LIST_PAGES = 5;
async function tabPage(tab) {
  if (tab === "recientes" || tab === "series") {
    const kind = tab === "recientes" ? "recent" : "series";
    const pages = await mapLimit(Array.from({ length: SCREEN_LIST_PAGES }, (_, i) => i + 1), 3, async (page) => {
      try {
        return (await listPage(kind, page)).items;
      } catch (e) {
        kino.log("list " + kind + " " + page + " failed: " + (e && e.message));
        return [];
      }
    });
    const letter = (item) => (String(item.title).trim()[0] || "").toUpperCase();
    return {
      rows: pages.map((items, i) => {
        if (!items.length) return null;
        const title = kind === "recent" ? `${t(LISTS[kind].title)} \xB7 ${i + 1}` : `${t(LISTS[kind].title)} \xB7 ${letter(items[0])}\u2013${letter(items[items.length - 1])}`;
        return { id: `row-${kind}-${i + 1}`, title, ref: "l:" + kind, items };
      }).filter(Boolean)
    };
  }
  const rows = await mapLimit(SCREEN_GENRES, 4, async (slug) => {
    try {
      const { items } = await genrePage(slug, 1);
      const title = slug.replace(/(^|-)([a-z])/g, (_, a, c) => (a ? " " : "") + c.toUpperCase());
      return items.length ? { id: "genre-" + slug, title, ref: "g:" + slug, items } : null;
    } catch (e) {
      kino.log("genre row " + slug + " failed: " + (e && e.message));
      return null;
    }
  });
  return { rows: rows.filter(Boolean) };
}
var browseInstance = null;
var browseScreen = () => browseInstance ?? (browseInstance = makeBrowse({
  kino,
  loadTab: (tab) => tabPage(tab),
  searchTitles: async (q) => (await search({ q })).items
}));
async function screen(ctx) {
  await null;
  return browseScreen().view(ctx && typeof ctx === "object" ? ctx : {});
}
async function screenEvent(ev) {
  await null;
  return browseScreen().event(ev && typeof ev === "object" ? ev : {});
}
var LAST_EPISODES_KEY = "lastEpisodes";
function rememberEpisodes(seriesRef, episodeRefs) {
  try {
    kino.storage.set(LAST_EPISODES_KEY, JSON.stringify({ series: seriesRef, eps: episodeRefs.slice(0, 400) }));
  } catch {
  }
}
function seriesOfEpisode(ref) {
  try {
    const o = JSON.parse(kino.storage.get(LAST_EPISODES_KEY) || "null");
    return o && Array.isArray(o.eps) && o.eps.includes(ref) ? o.series : "";
  } catch {
    return "";
  }
}
async function section({ tab }) {
  const tabs = [
    { id: "recent", label: t("tabRecent") },
    { id: "series", label: t("tabSeries") }
  ];
  const chosen = tabs.some((x) => x.id === tab) ? tab : "recent";
  let items = [];
  try {
    items = (await listPage(chosen, 1)).items;
  } catch (e) {
    kino.log("section " + chosen + " failed: " + (e && e.message));
  }
  const answer = { tabs, tab: chosen, rows: items.length ? [{ id: "row-" + chosen, title: t(LISTS[chosen].title), items, ref: "l:" + chosen }] : [] };
  return answer;
}
async function categories() {
  const labels = await cached("genres", FRESH_GENRES_MS, async () => {
    const html = await getPage(`${SITE}/genres-filter/`);
    const select = between(html, 'name="genres_filter[]"', "</select>");
    const out = [];
    for (const m of select.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)) out.push(decode(m[2]).trim());
    return out;
  });
  const bySlug = /* @__PURE__ */ new Map();
  for (const label of labels) {
    const slug = label.toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (slug && !bySlug.has(slug)) bySlug.set(slug, label);
  }
  const order = POPULAR_GENRES.filter((s) => bySlug.has(s)).concat([...bySlug.keys()].filter((s) => POPULAR_GENRES.indexOf(s) < 0));
  const DEAD = "-";
  const asked = await mapLimit(order.slice(0, MAX_TILES + SPARE_TILES), POSTER_PARALLEL, async (slug) => {
    let posters = [];
    try {
      posters = await cached("art2:" + slug, FRESH_ART_MS, async () => {
        try {
          return (await genrePage(slug, 1)).items.map((i) => i.poster).filter(Boolean).slice(0, ART_CANDIDATES);
        } catch (e) {
          if (e && e.code === "not_found") return DEAD;
          throw e;
        }
      });
    } catch (e) {
      kino.log("genre " + slug + " art failed: " + (e && e.message));
    }
    return posters === DEAD ? null : { slug, posters: Array.isArray(posters) ? posters : [] };
  });
  const used = /* @__PURE__ */ new Set();
  const tiles = asked.filter(Boolean).slice(0, MAX_TILES).map(({ slug, posters }) => {
    const art = posters.find((u) => !used.has(u)) || posters[0] || "";
    if (art) used.add(art);
    const tile = { id: slug, title: String(bySlug.get(slug)).slice(0, 40), ref: "g:" + slug, adult: true };
    if (art) tile.art = art;
    return tile;
  });
  return tiles;
}
async function seriesSlugFromEpisode(slug) {
  const html = await getPage(`${SITE}/episodes/${slug}-episode-1/`);
  const counts = /* @__PURE__ */ new Map();
  for (const m of html.matchAll(/hentaimama\.io\/tvshows\/([A-Za-z0-9._~-]+)\//g)) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  const common = (a) => {
    let i = 0;
    while (i < a.length && i < slug.length && a[i] === slug[i]) i++;
    return i;
  };
  let best = "";
  let bestScore = 0;
  for (const [cand, n] of counts) {
    const score = common(cand) * 10 + n;
    if (common(cand) >= 5 && score > bestScore) {
      best = cand;
      bestScore = score;
    }
  }
  if (!best) throw kino.error("not_found", "no series page for " + slug);
  return best;
}
async function loadSeries(slug) {
  return cached("series:" + slug, FRESH_SERIES_MS, async () => {
    let page;
    try {
      page = await getPage(`${SITE}/tvshows/${slug}/`);
    } catch (e) {
      if (!e || e.code !== "not_found") throw e;
      const real = await seriesSlugFromEpisode(slug);
      page = await getPage(`${SITE}/tvshows/${real}/`);
    }
    return parseSeries(page);
  });
}
async function episodes(ref) {
  const m = /^s:([A-Za-z0-9._~-]+)$/.exec(String(ref || ""));
  if (!m) throw kino.error("not_found", "not a series ref: " + String(ref).slice(0, 80));
  const data = await loadSeries(m[1]);
  const out = data.episodes.map((e) => Object.assign({ title: t("epTitle", { n: e.number }) }, e));
  rememberEpisodes(ref, out.map((e) => e.ref));
  return { series: data.info, episodes: out };
}
var QUALITIES = ["1080p", "720p", "480p"];
var LAZY_KINDS = ["hls-mp4", "newjav", "hls"];
function mimeOf(url) {
  return /\.m3u8(\?|$)/i.test(url) ? "application/x-mpegURL" : "video/mp4";
}
function hostOf(url) {
  return (/^https:\/\/([^/?#]+)/.exec(url) || [])[1] || "";
}
function embedSources(html) {
  const out = [];
  const arr = /sources:\s*(\[[\s\S]*?\])\s*,\s*(?:tracks|advertising|\w+\s*:)/.exec(html) || /sources:\s*(\[[\s\S]*?\])/.exec(html);
  if (!arr) return out;
  for (const m of arr[1].matchAll(/\{[^{}]*\}/g)) {
    const file = /["']?file["']?\s*:\s*["']([^"']+)["']/.exec(m[0]);
    if (!file) continue;
    const url = file[1].replace(/\\\//g, "/");
    if (!/^https:\/\//.test(url)) continue;
    const label = /["']?label["']?\s*:\s*["']([^"']+)["']/.exec(m[0]);
    out.push({ url, label: label ? label[1] : "", hls: /\.m3u8(\?|$)/i.test(url) });
  }
  return out;
}
function qualityOf(src) {
  const fromLabel = /(\d{3,4})p/.exec(src.label);
  if (fromLabel) return fromLabel[1] + "p";
  const fromUrl = /\/(\d{3,4})p\//.exec(src.url);
  return fromUrl ? fromUrl[1] + "p" : "";
}
function wantedQuality() {
  const q = kino.config.get("quality");
  return QUALITIES.indexOf(q) >= 0 ? q : "1080p";
}
function rankSources(found, preferred) {
  const wantAt = QUALITIES.indexOf(preferred);
  const seen = /* @__PURE__ */ new Set();
  const list = [];
  for (const s of found) {
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    const known = qualityOf(s);
    const qi = QUALITIES.indexOf(known || "1080p");
    const dist = qi < 0 ? 9 : qi >= wantAt ? qi - wantAt : 3 + (wantAt - qi);
    const fast = hostOf(s.url) === FAST_HOST ? 0 : 1;
    list.push({ s, known, key: dist * 100 + (s.hls ? 50 : 0) + fast * 10 + (known ? 0 : 5) });
  }
  list.sort((a, b) => a.key - b.key);
  return list.map(({ s, known }) => {
    let label;
    if (s.hls) label = t("srvHls");
    else if (!known) label = t("srvOriginal");
    else if (hostOf(s.url) === FAST_HOST) label = t("srvMp4", { q: known });
    else label = t("srvSigned", { q: known });
    return { url: s.url, label: label.slice(0, 48), mime: mimeOf(s.url) };
  });
}
function b64decode(s) {
  try {
    const clean = decodeURIComponent(s).replace(/-/g, "+").replace(/_/g, "/");
    return atob(clean + "=".repeat((4 - clean.length % 4) % 4));
  } catch {
    return "";
  }
}
function mirrorOf(src) {
  const kind = /[?&]dt_embed=([a-z0-9-]+)/.exec(src) || (/\/newjav\.php\?/.test(src) ? [null, "newjav"] : null);
  if (!kind) return null;
  const p = /[?&]p=([^&]+)/.exec(src);
  const path = p ? b64decode(p[1]) : "";
  return { kind: kind[1], src, path: /^[\w\-./+ ()%]+$/.test(path) ? path.replace(/^\/+/, "") : "" };
}
function directFiles(mirrors) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const add = (url, label) => {
    if (!seen.has(url)) {
      seen.add(url);
      out.push({ url, label, hls: false });
    }
  };
  for (const m of mirrors) {
    if (!m.path) continue;
    if (m.kind === "rtmp") add(`https://${FAST_HOST}/${m.path}`, "");
    if (m.kind === "r2-mp4") {
      const at = /(\d{3,4})p/.exec(m.path);
      for (const q of at ? QUALITIES : [""]) {
        const path = at ? m.path.split(at[1] + "p").join(q) : m.path;
        add(`https://${FAST_HOST}/hls/${path}`, q);
      }
    }
  }
  return out;
}
async function probe(url) {
  try {
    const r = await kino.fetch(url, { headers: { Range: "bytes=0-1", "User-Agent": UA }, timeoutMs: PROBE_TIMEOUT_MS });
    if (r.status === 200 || r.status === 206) return "ok";
    return r.status === 403 || r.status === 404 || r.status === 410 ? "dead" : "unknown";
  } catch {
    return "unknown";
  }
}
function hostBad(host) {
  const at = Number(kino.storage.get("bad:" + host) || 0);
  return at > 0 && Date.now() - at < HOST_BAD_MS;
}
function markHostBad(host) {
  try {
    kino.storage.set("bad:" + host, String(Date.now()), { ttlMs: HOST_BAD_MS });
  } catch {
  }
}
async function postIdOf(slug, left) {
  return cached("pid:" + slug, FRESH_PID_MS, async () => {
    const pageUrl = `${SITE}/episodes/${slug}/`;
    const html = await getPage(pageUrl, { timeoutMs: left(STEP_PAGE_MS) });
    const id = /\ba:\s*['"]?(\d+)/.exec(html);
    if (!/get_player_contents/.test(html) || !id) {
      kino.log.report("no_player", slug.slice(0, 40));
      throw kino.error("not_found", "no player on " + pageUrl, { userMessage: t("noStreams") });
    }
    return id[1];
  });
}
async function mirrorsOf(slug, left) {
  return cached("mir:" + slug, FRESH_MIRRORS_MS, async () => {
    const pageUrl = `${SITE}/episodes/${slug}/`;
    const id = await postIdOf(slug, left);
    const raw = await getPage(`${SITE}/wp-admin/admin-ajax.php`, {
      body: { form: { action: "get_player_contents", a: id } },
      headers: { Referer: pageUrl, "X-Requested-With": "XMLHttpRequest" },
      timeoutMs: left(STEP_AJAX_MS)
    });
    let frames;
    try {
      frames = JSON.parse(raw);
    } catch {
      throw kino.error("unavailable", "player list is not JSON", { userMessage: t("noStreams") });
    }
    const mirrors = (Array.isArray(frames) ? frames : []).map((f) => /src="([^"]+)"/.exec(String(f))).filter(Boolean).map((x) => decode(x[1])).filter((u) => /^https:\/\/hentaimama\.io\//.test(u)).map(mirrorOf).filter(Boolean);
    if (!mirrors.length) throw kino.error("not_found", "no mirrors for " + slug, { userMessage: t("noStreams") });
    return mirrors;
  });
}
async function withRetry(fn, started) {
  try {
    return await fn();
  } catch (e) {
    if (e && e.code === "not_found" || Date.now() - started > 6e3) throw e;
    return fn();
  }
}
async function signedSources(mirror, pageUrl, left) {
  try {
    const html = await getPage(mirror.src, { headers: { Referer: pageUrl }, timeoutMs: left(STEP_EMBED_MS) });
    return embedSources(html);
  } catch (e) {
    kino.log("mirror " + mirror.kind + " failed: " + (e && e.message));
    return [];
  }
}
function streamOf(ranked, extra) {
  const [first, ...rest] = ranked;
  const stream = { url: first.url, mime: first.mime, label: first.label, expiresInSeconds: STREAM_EXPIRES_S };
  const alts = rest.concat(extra || []).slice(0, MAX_ALTERNATIVES);
  if (alts.length) stream.alternatives = alts;
  return stream;
}
async function resolveRef(ref) {
  const started = Date.now();
  const left = (cap) => Math.max(1500, Math.min(cap, RESOLVE_BUDGET_MS - (Date.now() - started) - PROBE_TIMEOUT_MS));
  const lazy = /^m:([A-Za-z0-9._~-]+):([a-z0-9-]+)$/.exec(String(ref || ""));
  const plain2 = /^e:([A-Za-z0-9._~-]+)$/.exec(String(ref || ""));
  if (!lazy && !plain2) throw kino.error("not_found", "not a playable ref: " + String(ref).slice(0, 80));
  const slug = (lazy || plain2)[1];
  const pageUrl = `${SITE}/episodes/${slug}/`;
  let mirrors;
  try {
    mirrors = await withRetry(() => mirrorsOf(slug, left), started);
    recordHealth("site", true);
  } catch (e) {
    if (!e || e.code !== "not_found") recordHealth("site", false);
    throw e;
  }
  if (lazy) {
    const mirror = mirrors.find((m) => m.kind === lazy[2]);
    if (!mirror) throw kino.error("not_found", "mirror gone: " + lazy[2], { userMessage: t("copyFailed") });
    const ranked2 = rankSources(await signedSources(mirror, pageUrl, left), wantedQuality());
    if (!ranked2.length) {
      kino.log.report("mirror_empty", lazy[2]);
      throw kino.error("not_found", "mirror " + lazy[2] + " has no file", { userMessage: t("copyFailed") });
    }
    const checks = await Promise.all(ranked2.slice(0, 3).map((r) => probe(r.url)));
    const at = checks.findIndex((v) => v !== "dead");
    if (at < 0) {
      kino.log.report("mirror_dead", lazy[2]);
      throw kino.error("not_found", "mirror " + lazy[2] + " answers no for its files", { userMessage: t("copyFailed") });
    }
    return { url: ranked2[at].url, mime: ranked2[at].mime, label: ranked2[at].label, expiresInSeconds: STREAM_EXPIRES_S };
  }
  const direct = directFiles(mirrors);
  let live = [];
  if (direct.length && !hostBad(FAST_HOST)) {
    const verdicts = await Promise.all(direct.map((d) => probe(d.url)));
    live = direct.filter((_, i) => verdicts[i] !== "dead");
    if (!live.length) {
      markHostBad(FAST_HOST);
      kino.log.report("mirror_dead", FAST_HOST);
    }
    recordHealth("files", verdicts.some((v) => v === "ok") ? true : verdicts.every((v) => v === "dead") ? false : null);
  }
  const lazyCopies = LAZY_KINDS.map((kind) => mirrors.find((m) => m.kind === kind)).filter(Boolean).map((m, i) => ({
    ref: `m:${slug}:${m.kind}`,
    label: (m.kind === "hls" ? t("srvHls") : t("srvLazy", { q: m.kind === "newjav" ? t("srvOriginalShort") : wantedQuality(), n: i + 2 })).slice(0, 48)
  }));
  if (live.length) return streamOf(rankSources(live, wantedQuality()), lazyCopies);
  const opened = await Promise.all(LAZY_KINDS.map((k) => mirrors.find((m) => m.kind === k)).filter(Boolean).map((m) => signedSources(m, pageUrl, left)));
  const ranked = rankSources([].concat(...opened), wantedQuality());
  if (!ranked.length) throw kino.error("not_found", "no video in " + mirrors.length + " mirrors", { userMessage: t("noStreams") });
  return streamOf(ranked);
}
var HEALTH_KEY = "health";
function readHealth() {
  try {
    return JSON.parse(kino.storage.get(HEALTH_KEY) || "{}") || {};
  } catch {
    return {};
  }
}
function recordHealth(what, ok) {
  if (ok === null) return;
  try {
    const h = readHealth();
    h[what] = { ok, at: Date.now() };
    kino.storage.set(HEALTH_KEY, JSON.stringify(h));
  } catch {
  }
}
async function settingsStatus() {
  const keys = cacheKeys();
  let chars = 0;
  for (const k of keys) chars += k.length + (kino.storage.get(k) || "").length;
  const h = readHealth();
  const word = (x) => !x ? t("healthNone") : x.ok ? t("healthOk") : t("healthFail");
  return {
    cache: t("cacheStatus", { n: keys.length, kb: Math.ceil(chars / 1024) }),
    health: `${t("probeDone", { site: word(h.site), files: word(h.files) })}`.slice(0, 200)
  };
}
async function action(key) {
  if (key === "clearCache") {
    for (const k of cacheKeys()) kino.storage.remove(k);
    return { message: t("cacheCleared") };
  }
  if (key === "probe") {
    let site = false;
    let files = false;
    try {
      const { items } = await listPage("recent", 1);
      site = items.length > 0;
      const first = items[0];
      if (first) {
        const eps = await episodes(first.ref);
        const ep = eps.episodes[0];
        if (ep) {
          const slug = ep.ref.slice(2);
          const mirrors = await mirrorsOf(slug, (cap) => cap);
          const direct = directFiles(mirrors);
          files = direct.length ? await probe(direct[0].url) !== "dead" : false;
        }
      }
    } catch (e) {
      kino.log("probe failed: " + (e && e.message));
    }
    recordHealth("site", site);
    recordHealth("files", files);
    const word = (x) => x ? t("healthOk") : t("healthFail");
    return { message: t("probeDone", { site: word(site), files: word(files) }) };
  }
  throw kino.error("not_found", "unknown action " + String(key).slice(0, 40));
}
async function resolve(ref) {
  const out = await resolveRef(ref);
  try {
    const series = seriesOfEpisode(String(ref || ""));
    if (series) browseScreen().notePlayed(series);
  } catch {
  }
  return out;
}
export {
  action,
  browse,
  categories,
  episodes,
  home,
  resolve,
  screen,
  screenEvent,
  search,
  section,
  settingsStatus
};
