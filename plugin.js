// @ts-check
/// <reference path="./kino.d.ts" />
// Kino plugin: HentaiMama -- 18+ anime with English subtitles, read straight from hentaimama.io (no addon in between).
// Every title and episode is marked `adult`, so Kino shows them only while the person's 18+ code is unlocked.
// Read it top to bottom:
//   1. constants   2. texts   3. cache   4. site client   5. parsing   6. items   7. search
//   8. home, browse and categories   9. episodes   10. resolve   11. settings
// Declared host: hentaimama.io (kino.fetch). The video sits on other servers (gdvid.info, hentaidoge.org...), which is the
// manifest's `streamHosts: "any"`, approved by the person at install.

const SITE = "https://hentaimama.io";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const PAGE_TIMEOUT_MS = 10000;
const EMBED_TIMEOUT_MS = 8000;
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
    sectionHero: "Lo más reciente de HentaiMama.",
    tabSeries: "Series",
    tabRecent: "Recientes",
    cacheStatus: "Caché: {n} entradas, {kb} KB",
    cacheCleared: "Listo: se vació la caché",
    epTitle: "Episodio {n}",
    srvMp4: "{q} · MP4",
    srvHls: "HLS (adaptable)",
    srvOriginal: "Original · MP4",
    srvSigned: "{q} · Servidor 2",
    raw: "Sin subtítulos",
  },
  en: {
    unavailable: "HentaiMama is not answering right now. Try again in a while.",
    noStreams: "This episode has no video available right now. Try another or come back later.",
    rowSeries: "Series",
    rowRecent: "Recent episodes",
    sectionHero: "The latest from HentaiMama.",
    tabSeries: "Series",
    tabRecent: "Recent",
    cacheStatus: "Cache: {n} entries, {kb} KB",
    cacheCleared: "Done: the cache is empty",
    epTitle: "Episode {n}",
    srvMp4: "{q} · MP4",
    srvHls: "HLS (adaptive)",
    srvOriginal: "Original · MP4",
    srvSigned: "{q} · Server 2",
    raw: "No subtitles",
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
const CACHE_PREFIX = "c1:";
const HARD_TTL_MS = 24 * 60 * 60 * 1000;
const ENTRY_MAX_CHARS = 48 * 1024;
const FRESH_LIST_MS = 15 * 60 * 1000;
const FRESH_SERIES_MS = 60 * 60 * 1000;
const FRESH_GENRES_MS = 24 * 60 * 60 * 1000;

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

// ---- 5. items, search and paging ------------------------------------------------------------------------------

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
  const q = String(query.q || "").trim();
  if (!q) return { items: [] };
  const page = pageNumber(query.cursor);
  const html = await getPage(searchUrl(q, page));
  const { items, pages } = parseSeriesPage(html);
  return pageOut(items, page, pages);
}

// ---- 6. home, browse and categories ---------------------------------------------------------------------------

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
  if (items.length) {
    const pick = items[Math.floor(Date.now() / 86400000) % items.length];
    answer.hero = { title: pick.title, text: t("sectionHero") };
    if (pick.poster) answer.hero.image = pick.poster;
  }
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

// ---- 7. episodes ----------------------------------------------------------------------------------------------

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

// ---- 8. resolve -----------------------------------------------------------------------------------------------

const QUALITIES = ["1080p", "720p", "480p"];

function mimeOf(url) {
  return /\.m3u8(\?|$)/i.test(url) ? "application/x-mpegURL" : "video/mp4";
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

// The site's mirrors, best first, as { url, label, mime }. The file name says the quality; the host says the server
// (gdvid.info answered ~12 Mbit/s, hentaidoge.org ~4 in the first measurement), so gdvid.info goes first within a quality.
function rankSources(found, preferred) {
  const want = QUALITIES.indexOf(preferred) >= 0 ? preferred : "1080p";
  const wantAt = QUALITIES.indexOf(want);
  const seen = new Set();
  const list = [];
  for (const s of found) {
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    const known = qualityOf(s);
    const q = known || "1080p";
    const host = (/^https:\/\/([^/]+)/.exec(s.url) || [])[1] || "";
    const fast = /gdvid\.info$/.test(host) ? 0 : 1;
    // Quality closest to the wanted one first (equal or lower before higher), then fast server, then plain files over HLS.
    const qi = QUALITIES.indexOf(q);
    const dist = qi < 0 ? 9 : qi >= wantAt ? qi - wantAt : 3 + (wantAt - qi);
    list.push({ s, q, known, host, key: dist * 100 + (s.hls ? 50 : 0) + fast * 10 });
  }
  list.sort((a, b) => a.key - b.key);
  return list.map(({ s, q, known, host }) => {
    let label;
    if (s.hls) label = t("srvHls");
    else if (!known) label = t("srvOriginal");
    else if (/gdvid\.info$/.test(host)) label = t("srvMp4", { q });
    else label = t("srvSigned", { q });
    return { url: s.url, label: label.slice(0, 48), mime: mimeOf(s.url) };
  });
}

export async function resolve(ref) {
  const m = /^e:([A-Za-z0-9._~-]+)$/.exec(String(ref || ""));
  if (!m) throw kino.error("not_found", "not a playable ref: " + String(ref).slice(0, 80));
  const pageUrl = `${SITE}/episodes/${m[1]}/`;
  const html = await getPage(pageUrl);
  const action = /action:\s*['"]get_player_contents['"]/.test(html) ? "get_player_contents" : "";
  const post = /\ba:\s*['"]?(\d+)/.exec(html);
  if (!action || !post) throw kino.error("not_found", "no player on " + pageUrl, { userMessage: t("noStreams") });

  // One request answers every mirror's iframe; each iframe's page then names its files.
  const raw = await getPage(`${SITE}/wp-admin/admin-ajax.php`, {
    body: { form: { action, a: post[1] } },
    headers: { Referer: pageUrl, "X-Requested-With": "XMLHttpRequest" },
  });
  let frames;
  try {
    frames = JSON.parse(raw);
  } catch {
    throw kino.error("unavailable", "player list is not JSON", { userMessage: t("noStreams") });
  }
  const srcs = (Array.isArray(frames) ? frames : [])
    .map((f) => /src="([^"]+)"/.exec(String(f)))
    .filter(Boolean)
    .map((x) => decode(x[1]))
    .filter((u) => /^https:\/\/hentaimama\.io\//.test(u));
  const pages = await mapLimit(srcs, 5, async (u) => {
    try {
      return embedSources(await getPage(u, { headers: { Referer: pageUrl }, timeoutMs: EMBED_TIMEOUT_MS }));
    } catch (e) {
      kino.log("embed failed: " + (e && e.message));
      return [];
    }
  });
  const ranked = rankSources([].concat(...pages), kino.config.get("quality"));
  if (!ranked.length) throw kino.error("not_found", "no video in " + srcs.length + " mirrors", { userMessage: t("noStreams") });

  const [first, ...rest] = ranked;
  const stream = { url: first.url, mime: first.mime, label: first.label, expiresInSeconds: STREAM_EXPIRES_S };
  if (rest.length) stream.alternatives = rest.slice(0, MAX_ALTERNATIVES).map((a) => ({ url: a.url, mime: a.mime, label: a.label }));
  return stream;
}

// ---- 9. settings ----------------------------------------------------------------------------------------------

export async function settingsStatus() {
  const keys = cacheKeys();
  let chars = 0;
  for (const k of keys) chars += k.length + (kino.storage.get(k) || "").length;
  return { cache: t("cacheStatus", { n: keys.length, kb: Math.ceil(chars / 1024) }) };
}

export async function action(key) {
  if (key === "clearCache") {
    for (const k of cacheKeys()) kino.storage.remove(k);
    return { message: t("cacheCleared") };
  }
  throw kino.error("not_found", "unknown action " + String(key).slice(0, 40));
}
