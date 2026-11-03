// What the browse screen shows, from the section pages the plugin builds (tabPage in plugin.js): the featured slides, the rails of
// a tab and the cards. Pure functions; index.js keeps the results and view.js draws them.

export const TAB_IDS = ["recientes", "series", "generos"];
export const MAX_RAILS = 12;
export const MAX_RAIL_ITEMS = 20;
const HTTPS = /^https:\/\//;

/** The card Kino draws: the fields a rail needs and nothing else (the tree and the stored copy stay small). */
export function cardOf(item) {
  const out = { id: item.id, ref: item.ref, title: item.title, kind: item.kind };
  const poster = item.poster || item.logo; // a live channel carries a logo
  if (poster && HTTPS.test(poster)) out.poster = poster;
  if (item.backdrop && HTTPS.test(item.backdrop)) out.backdrop = item.backdrop;
  if (item.rating !== undefined) out.rating = item.rating;
  if (item.year !== undefined) out.year = item.year;
  if (item.ids && item.ids.tmdb) out.ids = { tmdb: item.ids.tmdb };
  if (item.adult === true) out.adult = true; // Kino shows it only while the 18+ code is unlocked
  return out;
}

/** The tab's rails: its rows trimmed to what a screen draws. */
export function railsOf(rows) {
  return rows.filter((r) => r.items && r.items.length > 0).slice(0, MAX_RAILS).map((r) => ({
    id: r.id, title: r.title, ...(r.ref ? { ref: r.ref } : {}), items: r.items.slice(0, MAX_RAIL_ITEMS).map(cardOf),
  }));
}

/** One tab as the screen draws it, from a section page (`{ rows }`); null when it has no row. */
export function tabOf(page) {
  const rows = page && Array.isArray(page.rows) ? page.rows : [];
  const rails = railsOf(rows);
  if (rails.length === 0) return null;
  return { slides: [], rails };
}

/** The key a played series is remembered under: its ref ("s:<slug>"). Anything else is not a series. */
export function playedKey(ref) {
  const r = String(ref || "");
  return /^s:[A-Za-z0-9._~-]+$/.test(r) ? r : "";
}

/** The series played, newest first, found in [tabs] (the loaded tab data) by their ref; one not on screen is not shown. */
export function recentOf(keys, tabs) {
  if (keys.length === 0) return [];
  const byKey = new Map();
  for (const data of tabs) for (const rail of data.rails) for (const card of rail.items) if (!byKey.has(card.ref)) byKey.set(card.ref, card);
  const out = [];
  const used = new Set();
  for (const key of keys) {
    const card = byKey.get(key);
    if (card && !used.has(card.id)) { used.add(card.id); out.push(card); }
  }
  return out;
}
