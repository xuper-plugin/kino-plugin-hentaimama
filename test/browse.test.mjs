// The browse screen: skeletons first, the active tab then the rest as the timer loads them, "Continuar viendo", the search page,
// and a tab that fails. Every title is `adult`, so there is no slider and nothing is asked of Kino's metadata.
import test from "node:test";
import assert from "node:assert/strict";
import { makeBrowse } from "../src/browse/index.js";
import { checkScreenTree, checkScreenAnswer, fakeScreenContext, fakeScreenEvent, childNodes } from "../sdk/screen.mjs";
import manifest from "../kino-plugin.json" with { type: "json" };

const all = (n, out = []) => { if (!n || typeof n !== "object") return out; out.push(n); for (const c of childNodes(n)) all(c, out); return out; };
const byKey = (tree, key) => all(tree).find((n) => n.key === key) ?? null;
const types = (tree) => all(tree).map((n) => n.type);

const item = (kind, n, extra = {}) => ({
  id: `${kind}-${n}`, ref: `s:${kind}-${n}`, title: `Título ${kind} ${n}`, kind: "series", adult: true,
  poster: `https://img.test/${kind}${n}p.jpg`, ...extra,
});
const row = (id, title, kind, count = 8) => ({ id, title, ref: "l:series", items: Array.from({ length: count }, (_, i) => item(kind, i + 1)) });
const pageOf = (tab) => ({ tab, rows: [row(`${tab}-a`, `Lista ${tab}`, tab), row(`${tab}-b`, `Otra ${tab}`, tab, 5)] });

function fakeKino() {
  const store = new Map();
  return { lang: "es-CO", store, storage: { get: (k) => (store.has(k) ? store.get(k) : null), set: (k, v) => { store.set(k, v); } }, log() {} };
}

function harness({ device = "phone", lang = "es", kino = fakeKino(), failing = new Set(), searchFails = false } = {}) {
  const loaded = [];
  const browse = makeBrowse({
    kino,
    loadTab: async (tab) => { loaded.push(tab); if (failing.has(tab)) throw Object.assign(new Error("down"), { code: "timeout" }); return pageOf(tab); },
    searchTitles: async (q) => { if (searchFails) throw new Error("down"); return q === "nada" ? [] : [item("serie", 1), item("serie", 2)]; },
  });
  let state = {};
  const routes = [{ name: "main", params: {} }];
  const route = () => routes[routes.length - 1];
  const render = async () => {
    const raw = browse.view(fakeScreenContext({ state: JSON.parse(JSON.stringify(state)), route: route(), device, lang }));
    const r = checkScreenTree(JSON.parse(JSON.stringify(raw)), lang, undefined, { apiVersion: 19, settings: manifest.settings });
    return { raw, tree: r.tree, dropped: r.dropped, every: r.every };
  };
  const send = async (name, { arg, value, timer = false } = {}) => {
    const raw = await browse.event(fakeScreenEvent(name, { arg, value, state: JSON.parse(JSON.stringify(state)), route: route(), device, lang }));
    const r = checkScreenAnswer(JSON.parse(JSON.stringify(raw ?? null)), lang, { timer });
    assert.deepEqual(r.dropped, [], `${name}: nothing of the answer dropped`);
    if (raw && raw.state) for (const [k, v] of Object.entries(raw.state)) { if (v === null) delete state[k]; else state[k] = v; }
    if (raw && raw.route) { if (raw.route.pop) { if (routes.length > 1) routes.pop(); } else routes.push({ name: raw.route.push, params: {} }); }
    return raw;
  };
  return { browse, render, send, loaded, kino, get state() { return state; }, route: () => route().name, push: (name) => routes.push({ name, params: {} }) };
}

test("before anything is kept: skeletons for the rails, three tabs, no slider, no timer until open", async () => {
  const h = harness();
  const r = await h.render();
  assert.deepEqual(r.dropped, []);
  assert.ok(types(r.tree).includes("skeleton"));
  assert.ok(!types(r.tree).includes("titleRail"));
  assert.deepEqual(byKey(r.tree, "tabs").tabs.map((t) => t.value), ["recientes", "series", "generos"]);
  assert.equal((r.every || []).length, 0);
});

test("open on a phone queues the active tab first then the others; the timer loads one per tick; there is never a slider", async () => {
  const h = harness();
  await h.send("open");
  assert.deepEqual(h.state.pending, ["recientes", "series", "generos"]);
  assert.ok((await h.render()).every.length > 0, "a timer while something is pending");
  await h.send("tick", { timer: true });
  assert.deepEqual(h.loaded, ["recientes"]);
  const r = await h.render();
  assert.deepEqual(r.dropped, []);
  assert.ok(!types(r.tree).includes("pageView") && !types(r.tree).includes("heroCard"), "a slide has no adult mark");
  assert.equal(all(r.tree).filter((n) => n.type === "titleRail").length, 2);
  await h.send("tick", { timer: true });
  await h.send("tick", { timer: true });
  assert.deepEqual(h.loaded, ["recientes", "series", "generos"]);
  assert.equal(((await h.render()).every || []).length, 0, "nothing pending: no timer");
});

test("every card the screen draws keeps its adult mark", async () => {
  const h = harness();
  await h.send("open");
  await h.send("tick", { timer: true });
  const rails = all((await h.render()).tree).filter((n) => n.type === "titleRail");
  assert.ok(rails.length > 0);
  for (const rail of rails) for (const card of rail.items) assert.equal(card.adult, true);
});

test("on a TV only the tab in view is loaded; the others load when selected", async () => {
  const h = harness({ device: "tv" });
  await h.send("open");
  assert.deepEqual(h.state.pending, ["recientes"]);
  await h.send("tick", { timer: true });
  await h.send("tab", { value: "generos" });
  assert.deepEqual(h.state.pending, ["generos"]);
  assert.ok(types((await h.render()).tree).includes("skeleton"));
  await h.send("tick", { timer: true });
  assert.deepEqual(h.loaded, ["recientes", "generos"]);
});

test("a tab loaded before paints at once on the next opening from its kept copy", async () => {
  const kino = fakeKino();
  const first = harness({ kino });
  await first.send("open");
  await first.send("tick", { timer: true });
  assert.ok([...kino.store.keys()].some((k) => k.startsWith("browse1:")));
  const second = harness({ kino });
  await second.send("open");
  const r = await second.render();
  assert.deepEqual(r.dropped, []);
  assert.ok(types(r.tree).includes("titleRail") && !types(r.tree).includes("skeleton"));
});

test("a tab that cannot load is asked again, then says so with a retry; the retry loads it again", async () => {
  const failing = new Set(["recientes"]);
  const h = harness({ failing });
  await h.send("open");
  await h.send("tick", { timer: true });
  assert.ok(!byKey((await h.render()).tree, "loadFailed"), "asked again before the banner shows");
  while (h.state.pending && h.state.pending.includes("recientes")) await h.send("tick", { timer: true });
  const r = await h.render();
  assert.deepEqual(r.dropped, []);
  assert.ok(byKey(r.tree, "loadFailed"));
  failing.clear();
  await h.send("retry");
  assert.equal(h.state.pending[0], "recientes");
  await h.send("tick", { timer: true });
  assert.ok(types((await h.render()).tree).includes("titleRail"));
});

test("Continuar viendo: played series come first, newest first, found by their ref; one not on screen is not shown", async () => {
  const h = harness();
  await h.send("open");
  while ((h.state.pending || []).length > 0) await h.send("tick", { timer: true });
  h.browse.notePlayed("s:recientes-3");
  h.browse.notePlayed("s:series-2");
  h.browse.notePlayed("s:gone-9");
  h.browse.notePlayed("e:some-episode-1"); // an episode ref is not a series
  const r = await h.render();
  assert.deepEqual(r.dropped, []);
  const rail = byKey(r.tree, "recent");
  assert.equal(rail.title, "Continuar viendo");
  assert.deepEqual(rail.items.map((i) => i.id), ["series-2", "recientes-3"]);
  assert.equal(all(r.tree).filter((n) => n.type === "titleRail")[0].key, "recent");
});

test("the floating button opens the search page; results are a grid; adult results are never kept as history; back returns", async () => {
  const h = harness();
  await h.send("open");
  const home = await h.render();
  assert.equal(home.raw.floatingActionButton.icon, "search");
  await h.send("openSearch");
  assert.equal(h.route(), "search");
  assert.ok(byKey((await h.render()).tree, "q"));
  assert.equal(await h.send("search", { value: { q: "   " } }), null);
  await h.send("search", { value: { q: "  uno  " } });
  const loading = await h.render();
  assert.ok(types(loading.tree).includes("skeleton") && (loading.every || []).length > 0);
  await h.send("stick", { timer: true });
  const done = await h.render();
  assert.deepEqual(done.dropped, []);
  assert.equal(byKey(done.tree, "results").items.length, 2);
  await h.send("back");
  assert.equal(h.route(), "main");
  await h.send("openSearch");
  assert.equal(byKey((await h.render()).tree, "history"), null, "an adult find is not kept");
});

test("a search that finds nothing says so; one that fails offers a retry", async () => {
  const h = harness();
  await h.send("open");
  await h.send("openSearch");
  await h.send("search", { value: { q: "nada" } });
  await h.send("stick", { timer: true });
  assert.ok(all((await h.render()).tree).some((n) => n.type === "text" && /encontramos/.test(String(n.text))));
  const bad = harness({ searchFails: true });
  await bad.send("open");
  await bad.send("openSearch");
  await bad.send("search", { value: { q: "otra" } });
  await bad.send("stick", { timer: true });
  assert.ok(byKey((await bad.render()).tree, "searchFailed"));
});

test("in English every tree draws with nothing dropped, on the phone and on the TV", async () => {
  for (const device of ["phone", "tv"]) {
    const h = harness({ device, lang: "en" });
    await h.send("open");
    await h.send("tick", { timer: true });
    const r = await h.render();
    assert.deepEqual(r.dropped, [], device);
    assert.equal(byKey(r.tree, "tabs").tabs[1].label, "Series");
  }
});

test("the gear opens the settings page; back returns, or closes when opened on its own", async () => {
  const h = harness();
  await h.send("open");
  const home = await h.render();
  assert.ok(home.raw.appBar.actions.some((a) => a.key === "settingsButton" && a.icon === "settings"));
  await h.send("go", { arg: "settings" });
  assert.equal(h.route(), "settings");
  assert.deepEqual((await h.render()).dropped, []);
  await h.send("back");
  assert.equal(h.route(), "main");
  const alone = harness();
  alone.push("settings");
  assert.deepEqual(await alone.send("back"), { close: true });
});
