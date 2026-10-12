// @ts-check
/// <reference path="./kino.d.ts" />
// Kino plugin: HentaiMama -- 18+ anime with English subtitles, read straight from hentaimama.io (no addon in between).
// Every title and episode is marked `adult`, so Kino shows them only while the person's 18+ code is unlocked.
// Read it top to bottom:
//   1. constants   2. texts   3. cache   4. site client   5. parsing   6. search and paging   7. home, browse, categories
//   8. episodes   9. mirrors and resolve   10. health and settings
// Declared hosts (kino.fetch): hentaimama.io for the pages, gdvid.info to probe a file before offering it. The signed
// copies (hentaidoge.org, javprovider.com) are played, never fetched by the plugin: `streamHosts: "any"` covers the
// servers that rotate.

const SITE = "https://hentaimama.io";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const PAGE_TIMEOUT_MS = 10000;
// resolve has 20 s in all, and the host waits for every request in flight: each step gets what is left of this budget.
const RESOLVE_BUDGET_MS = 17000;
const STEP_PAGE_MS = 5000;
const STEP_AJAX_MS = 4000;
const STEP_EMBED_MS = 5000;
const PROBE_TIMEOUT_MS = 3000;
// A host whose files all answered 403/404/410 is left out for this long (its copies fall back to the signed servers).
const HOST_BAD_MS = 3 * 60 * 1000;
const FAST_HOST = "gdvid.info";
// A signed link (hentaidoge.org, javprovider.com) lives a couple of hours; Kino asks resolve again after this.
const STREAM_EXPIRES_S = 3600;
const MAX_ALTERNATIVES = 8;
// Kino shows at most 24 category tiles.
const MAX_TILES = 24;
const POPULAR_GENRES = ["uncensored", "3d", "big-boobs", "blowjob", "creampie", "ahegao", "anal", "school-girls", "harem", "bdsm", "romance", "fantasy", "comedy", "drama", "milf", "ntr", "bondage", "tentacle", "futanari", "yuri", "incest", "monster", "demon", "action"];

// ---- 1. texts -------------------------------------------------------------------------------------------------

const TEXTS = {
  es: {
    unavailable: "HentaiMama no responde ahora. Intenta de nuevo en un rato.",
    noStreams: "Este episodio no tiene video disponible por ahora. Prueba otro o vuelve más tarde.",
    rowSeries: "Series",
    rowRecent: "Episodios recientes",
    tabSeries: "Series",
    tabRecent: "Recientes",
    cacheStatus: "Caché: {n} entradas, {kb} KB",
    cacheCleared: "Listo: se vació la caché",
    epTitle: "Episodio {n}",
    srvMp4: "{q} · MP4",
    srvHls: "HLS (adaptable)",
    srvOriginal: "Original · MP4",
    srvOriginalShort: "Original",
    copyFailed: "Esta copia no se pudo abrir ahora. Prueba otro servidor del menú.",
    srvSigned: "{q} · Servidor 2",
    probeDone: "Sitio {site} · archivos {files}",
    healthOk: "responde", healthFail: "no responde", healthNone: "sin datos", healthOff: "apagado",
    health: "Estado",
    srvLazy: "{q} · Servidor {n}",
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
    srvMp4: "{q} · MP4",
    srvHls: "HLS (adaptive)",
    srvOriginal: "Original · MP4",
    srvOriginalShort: "Original",
    copyFailed: "This copy could not be opened right now. Try another server from the menu.",
    srvSigned: "{q} · Server 2",
    probeDone: "Site {site} · files {files}",
    healthOk: "answers", healthFail: "not answering", healthNone: "no data", healthOff: "off",
    health: "Status",
    srvLazy: "{q} · Server {n}",
  },
};

function t(key, vars) {
  const lang = String(kino.lang || "").toLowerCase().startsWith("es") ? "es" : "en";
  const template = TEXTS[lang][key] || TEXTS.es[key] || key;
  return vars ? template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] != null ? vars[k] : "")) : template;
}

// ---- 2. cache -------------------------------------------------------------------------------------------------

// kino.storage keeps 256 KB in all. Every entry is `{ at, v }`; "fresh" for the window the caller gives, kept 24 h as the
// fallback when the site fails (a list a little old beats an empty screen).
const CACHE_PREFIX = "c2:";
const HARD_TTL_MS = 24 * 60 * 60 * 1000;
const ENTRY_MAX_CHARS = 48 * 1024;
const FRESH_LIST_MS = 15 * 60 * 1000;
const FRESH_SERIES_MS = 60 * 60 * 1000;
const FRESH_GENRES_MS = 24 * 60 * 60 * 1000;
// An episode page's player id never changes; the mirror paths it yields are kept briefly.
const FRESH_PID_MS = 24 * 60 * 60 * 1000;
const FRESH_MIRRORS_MS = 10 * 60 * 1000;

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
      // unreadable: the first to go
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

// A cache never fails the call it serves: whatever storage refuses is simply not cached.
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

// ---- 3. site client -------------------------------------------------------------------------------------------

async function getPage(url, opts) {
  const o = opts || {};
  let r;
  try {
    r = await kino.fetch(url, {
      method: o.body ? "POST" : "GET",
      headers: Object.assign({ "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9" }, o.headers || {}),
      body: o.body,
      timeoutMs: o.timeoutMs || PAGE_TIMEOUT_MS,
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

// ---- 4. parsing -----------------------------------------------------------------------------------------------

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”" };

function decode(s) {
  return String(s || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (ENTITIES[n.toLowerCase()] != null ? ENTITIES[n.toLowerCase()] : m));
}

function plain(html) {
  return decode(String(html || "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

const ID_RE = /^[A-Za-z0-9._~-]{1,128}$/;

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

// The poster URL: the first non-lazy src of an <img>, or "".
function imgOf(html) {
  const tag = /<img\b[^>]*>/i.exec(html);
  return tag ? absUrl(attrOf(tag[0], "src") || attrOf(tag[0], "data-src")) : "";
}

// A series grid page (search, genre, series list): the cards and the page count.
function parseSeriesPage(html) {
  const items = [];
  const parts = html.split('<article class="series-card">').slice(1);
  for (const part of parts) {
    const chunk = part.slice(0, part.indexOf("</article>") < 0 ? undefined : part.indexOf("</article>"));
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

// The "recent episodes" page: one card per episode, folded into the series it belongs to (newest first, each series once).
function parseRecentPage(html) {
  const items = [];
  const seen = new Set();
  const parts = html.split('<article class="item ').slice(1);
  for (const part of parts) {
    const chunk = part.slice(0, part.indexOf("</article>") < 0 ? undefined : part.indexOf("</article>"));
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

// A series page: its facts and its episode list.
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

  const episodes = [];
  const list = between(html, 'class="dt-se-list dt-se-page">', "</div></div>");
  const seen = new Set();
  for (const m of list.matchAll(/<a class="dt-se-item" href="https:\/\/hentaimama\.io\/episodes\/([A-Za-z0-9._~-]+)\/">([\s\S]*?)<\/a>/g)) {
    const slug = m[1];
    if (seen.has(slug) || !slug) continue;
    seen.add(slug);
    const body = m[2];
    const numTag = /class="dt-se-num">EP\s*(\d+)/i.exec(body) || /-episode-(\d+)$/.exec(slug);
    const ep = { number: numTag ? Number(numTag[1]) : episodes.length + 1, ref: "e:" + slug };
    const still = imgOf(body);
    if (still) ep.still = still;
    const date = /<span class="dt-se-date">([A-Za-z]{3}) (\d{1,2}), (\d{4})<\/span>/.exec(body);
    if (date) {
      const mo = "JanFebMarAprMayJunJulAugSepOctNovDec".indexOf(date[1]);
      if (mo >= 0) ep.airDate = `${date[3]}-${String(mo / 3 + 1).padStart(2, "0")}-${String(date[2]).padStart(2, "0")}`;
    }
    const synopsis = plain(between(body, '<span class="dt-se-desc">', "</span>"));
    if (synopsis && !/^No synopsis/i.test(synopsis)) ep.overview = synopsis.slice(0, 600);
    episodes.push(ep);
  }
  episodes.sort((a, b) => a.number - b.number);
  return { info, episodes };
}

// ---- 6. search and paging ------------------------------------------------------------------------------

// The cursor is the next page number as text; a page past the last one has no `next`.
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

export async function search(query) {
  const q = kino.rank.shortQuery(String(query.q || "").trim());
  if (!q) return { items: [] };
  const page = pageNumber(query.cursor);
  const titles = [query.q, query.originalTitle].concat(Array.isArray(query.altTitles) ? query.altTitles : []).filter((x) => typeof x === "string" && x.trim());
  const ask = async (text) => {
    const { items, pages } = parseSeriesPage(await getPage(searchUrl(text, page)));
    return { items, pages };
  };
  let res = await ask(q);
  // The typed (or TMDB's) title may be one the site does not use: one more round with the first other title.
  if (!res.items.length && page === 1) {
    const other = titles.map((x) => kino.rank.shortQuery(x.trim())).find((x) => x && x.toLowerCase() !== q.toLowerCase());
    if (other) res = await ask(other);
  }
  const sorted = page === 1 ? kino.rank.sortBySimilarity(res.items, titles) : res.items;
  return pageOut(sorted, page, res.pages);
}

// ---- 7. home, browse and categories ---------------------------------------------------------------------------

const LISTS = {
  series: { path: "hentai-series", parse: parseSeriesPage, title: "rowSeries" },
  recent: { path: "recent-episodes", parse: parseRecentPage, title: "rowRecent" },
};

async function listPage(kind, page) {
  const def = LISTS[kind];
  return cached(`list:${kind}:${page}`, FRESH_LIST_MS, async () => def.parse(await getPage(listUrl(def.path, page))));
}

async function genrePage(slug, page) {
  return cached(`genre:${slug}:${page}`, FRESH_LIST_MS, async () => parseSeriesPage(await getPage(listUrl(`genre/${slug}`, page))));
}

export async function home() {
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

export async function browse(ref, cursor) {
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

export async function section({ tab }) {
  const tabs = [
    { id: "recent", label: t("tabRecent") },
    { id: "series", label: t("tabSeries") },
  ];
  const chosen = tabs.some((x) => x.id === tab) ? tab : "recent";
  let items = [];
  try {
    items = (await listPage(chosen, 1)).items;
  } catch (e) {
    kino.log("section " + chosen + " failed: " + (e && e.message));
  }
  const answer = { tabs, tab: chosen, rows: items.length ? [{ id: "row-" + chosen, title: t(LISTS[chosen].title), items, ref: "l:" + chosen }] : [] };
  // No hero on purpose: a hero has no `adult` mark, so its title and image would show while the 18+ code is locked.
  return answer;
}

// Genre tiles: the site's own filter list (a label and its slug), kept a day. No art: one request per tile is not worth it.
export async function categories() {
  const labels = await cached("genres", FRESH_GENRES_MS, async () => {
    const html = await getPage(`${SITE}/genres-filter/`);
    const select = between(html, 'name="genres_filter[]"', "</select>");
    const out = [];
    for (const m of select.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)) out.push(decode(m[2]).trim());
    return out;
  });
  // Kino keeps 24 tiles. The popular ones first (the site's own order is alphabetical), then the rest in its order.
  const bySlug = new Map();
  for (const label of labels) {
    const slug = label.toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (slug && !bySlug.has(slug)) bySlug.set(slug, label);
  }
  const order = POPULAR_GENRES.filter((s) => bySlug.has(s)).concat([...bySlug.keys()].filter((s) => POPULAR_GENRES.indexOf(s) < 0));
  const tiles = order.slice(0, MAX_TILES).map((slug) => ({ id: slug, title: String(bySlug.get(slug)).slice(0, 40), ref: "g:" + slug, adult: true }));
  return tiles;
}

// ---- 8. episodes ----------------------------------------------------------------------------------------------

export async function episodes(ref) {
  const m = /^s:([A-Za-z0-9._~-]+)$/.exec(String(ref || ""));
  if (!m) throw kino.error("not_found", "not a series ref: " + String(ref).slice(0, 80));
  const html = await cached("series:" + m[1], FRESH_SERIES_MS, async () => {
    const { info, episodes } = parseSeries(await getPage(`${SITE}/tvshows/${m[1]}/`));
    return { info, episodes };
  });
  const out = html.episodes.map((e) => Object.assign({ title: t("epTitle", { n: e.number }) }, e));
  return { series: html.info, episodes: out };
}

// ---- 9. mirrors and resolve -----------------------------------------------------------------------------------

// The site lists five mirrors of an episode, each as an iframe whose `p` parameter is the file's path in base64:
//   rtmp    -> https://gdvid.info/<path>            (the original file)
//   r2-mp4  -> https://gdvid.info/hls/<path>        (1080p, and 720p/480p by the same pattern)
//   hls-mp4, hls, newjav.php -> a signed link that only the iframe's own page reveals (hentaidoge.org, javprovider.com)
// So the two fast, unsigned copies are built without opening any iframe and probed with one tiny ranged request each;
// the signed ones become lazy copies, opened only if the person picks them or the fast ones are gone.
const QUALITIES = ["1080p", "720p", "480p"];
const LAZY_KINDS = ["hls-mp4", "newjav", "hls"];

function mimeOf(url) {
  return /\.m3u8(\?|$)/i.test(url) ? "application/x-mpegURL" : "video/mp4";
}

function hostOf(url) {
  return (/^https:\/\/([^/?#]+)/.exec(url) || [])[1] || "";
}

// The playable files in one embed page: `sources: [{file, label, type}]`, the way every mirror of the site writes them.
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

// Copies of one episode, best first, as { url, label, mime }: the wanted quality, then the closest lower ones, then higher;
// within a quality the fast host first and a plain file before an HLS playlist.
function rankSources(found, preferred) {
  const wantAt = QUALITIES.indexOf(preferred);
  const seen = new Set();
  const list = [];
  for (const s of found) {
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    const known = qualityOf(s);
    const qi = QUALITIES.indexOf(known || "1080p");
    const dist = qi < 0 ? 9 : qi >= wantAt ? qi - wantAt : 3 + (wantAt - qi);
    const fast = hostOf(s.url) === FAST_HOST ? 0 : 1;
    // A file that does not say its quality ("original") goes after the ones that do, at the same distance.
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
    return atob(clean + "=".repeat((4 - (clean.length % 4)) % 4));
  } catch {
    return "";
  }
}

// What a mirror's iframe address says: its kind and, for most, the file's path.
function mirrorOf(src) {
  const kind = /[?&]dt_embed=([a-z0-9-]+)/.exec(src) || (/\/newjav\.php\?/.test(src) ? [null, "newjav"] : null);
  if (!kind) return null;
  const p = /[?&]p=([^&]+)/.exec(src);
  const path = p ? b64decode(p[1]) : "";
  return { kind: kind[1], src, path: /^[\w\-./+ ()%]+$/.test(path) ? path.replace(/^\/+/, "") : "" };
}

// The unsigned files this episode's mirrors imply (never opening an iframe), as embed-like sources.
function directFiles(mirrors) {
  const out = [];
  const seen = new Set();
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

// Whether a file answers: "ok" (200/206), "dead" (the server said no: 403/404/410) or "unknown" (the network did not).
// One byte is asked, so a good file costs nothing.
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
    // not remembering it only costs one probe
  }
}

// An episode's player id: needed once, then kept a day.
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

// An episode's mirrors: one request for the page's player id (once) and one for the list.
async function mirrorsOf(slug, left) {
  return cached("mir:" + slug, FRESH_MIRRORS_MS, async () => {
    const pageUrl = `${SITE}/episodes/${slug}/`;
    const id = await postIdOf(slug, left);
    const raw = await getPage(`${SITE}/wp-admin/admin-ajax.php`, {
      body: { form: { action: "get_player_contents", a: id } },
      headers: { Referer: pageUrl, "X-Requested-With": "XMLHttpRequest" },
      timeoutMs: left(STEP_AJAX_MS),
    });
    let frames;
    try {
      frames = JSON.parse(raw);
    } catch {
      throw kino.error("unavailable", "player list is not JSON", { userMessage: t("noStreams") });
    }
    const mirrors = (Array.isArray(frames) ? frames : [])
      .map((f) => /src="([^"]+)"/.exec(String(f)))
      .filter(Boolean)
      .map((x) => decode(x[1]))
      .filter((u) => /^https:\/\/hentaimama\.io\//.test(u))
      .map(mirrorOf)
      .filter(Boolean);
    if (!mirrors.length) throw kino.error("not_found", "no mirrors for " + slug, { userMessage: t("noStreams") });
    return mirrors;
  });
}

// One try again when the first failed quickly and the budget allows; a missing page is final.
async function withRetry(fn, started) {
  try {
    return await fn();
  } catch (e) {
    if ((e && e.code === "not_found") || Date.now() - started > 6000) throw e;
    return fn();
  }
}

// The signed files of one mirror, read from its own iframe page.
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

export async function resolve(ref) {
  const started = Date.now();
  // What is left of the budget for one step, never below a useful minimum nor above the step's own cap.
  const left = (cap) => Math.max(1500, Math.min(cap, RESOLVE_BUDGET_MS - (Date.now() - started) - PROBE_TIMEOUT_MS));
  const lazy = /^m:([A-Za-z0-9._~-]+):([a-z0-9-]+)$/.exec(String(ref || ""));
  const plain = /^e:([A-Za-z0-9._~-]+)$/.exec(String(ref || ""));
  if (!lazy && !plain) throw kino.error("not_found", "not a playable ref: " + String(ref).slice(0, 80));
  const slug = (lazy || plain)[1];
  const pageUrl = `${SITE}/episodes/${slug}/`;
  let mirrors;
  try {
    mirrors = await withRetry(() => mirrorsOf(slug, left), started);
    recordHealth("site", true);
  } catch (e) {
    if (!e || e.code !== "not_found") recordHealth("site", false);
    throw e;
  }

  // A lazy copy: the signed files of one mirror.
  if (lazy) {
    const mirror = mirrors.find((m) => m.kind === lazy[2]);
    if (!mirror) throw kino.error("not_found", "mirror gone: " + lazy[2], { userMessage: t("copyFailed") });
    const ranked = rankSources(await signedSources(mirror, pageUrl, left), wantedQuality());
    if (!ranked.length) {
      kino.log.report("mirror_empty", lazy[2]);
      throw kino.error("not_found", "mirror " + lazy[2] + " has no file", { userMessage: t("copyFailed") });
    }
    return { url: ranked[0].url, mime: ranked[0].mime, label: ranked[0].label, expiresInSeconds: STREAM_EXPIRES_S };
  }

  // The unsigned copies, each probed in parallel; a dead one is dropped, an unreachable one is kept.
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

  const lazyCopies = LAZY_KINDS.map((kind) => mirrors.find((m) => m.kind === kind))
    .filter(Boolean)
    .map((m, i) => ({
      ref: `m:${slug}:${m.kind}`,
      label: (m.kind === "hls" ? t("srvHls") : t("srvLazy", { q: m.kind === "newjav" ? t("srvOriginalShort") : wantedQuality(), n: i + 2 })).slice(0, 48),
    }));

  if (live.length) return streamOf(rankSources(live, wantedQuality()), lazyCopies);

  // Nothing unsigned works (or it is not offered): open the signed mirrors now, in parallel.
  const opened = await Promise.all(LAZY_KINDS.map((k) => mirrors.find((m) => m.kind === k)).filter(Boolean).map((m) => signedSources(m, pageUrl, left)));
  const ranked = rankSources([].concat(...opened), wantedQuality());
  if (!ranked.length) throw kino.error("not_found", "no video in " + mirrors.length + " mirrors", { userMessage: t("noStreams") });
  return streamOf(ranked);
}

// ---- 10. health and settings ----------------------------------------------------------------------------------

// The last answer of the site and of the video files (true / false / null = not sure), for the status line.
const HEALTH_KEY = "health";

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
    // a status line is never worth a failed call
  }
}

export async function settingsStatus() {
  const keys = cacheKeys();
  let chars = 0;
  for (const k of keys) chars += k.length + (kino.storage.get(k) || "").length;
  const h = readHealth();
  const word = (x) => (!x ? t("healthNone") : x.ok ? t("healthOk") : t("healthFail"));
  return {
    cache: t("cacheStatus", { n: keys.length, kb: Math.ceil(chars / 1024) }),
    health: `${t("probeDone", { site: word(h.site), files: word(h.files) })}`.slice(0, 200),
  };
}

export async function action(key) {
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
          files = direct.length ? (await probe(direct[0].url)) !== "dead" : false;
        }
      }
    } catch (e) {
      kino.log("probe failed: " + (e && e.message));
    }
    recordHealth("site", site);
    recordHealth("files", files);
    const word = (x) => (x ? t("healthOk") : t("healthFail"));
    return { message: t("probeDone", { site: word(site), files: word(files) }) };
  }
  throw kino.error("not_found", "unknown action " + String(key).slice(0, 40));
}
