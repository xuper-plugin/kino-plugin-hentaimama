# HentaiMama — plugin de Kino (18+)

Hentai en HD con subtítulos en inglés, leído directo de [hentaimama.io](https://hentaimama.io/). Es un port a Kino del
addon de Stremio [Zen0-99/hentaistream-addon](https://github.com/Zen0-99/hentaistream-addon), pero **sin servidor
intermedio**: el plugin habla con el sitio y no necesita alojar nada.

No está afiliado con el sitio. Solo para mayores de edad.

## Instalar

En Kino: **Plugins ▸ Agregar un plugin ▸ Kino**, y pega la dirección de este repositorio. Requiere Kino 0.9.50 o más.

## 18+

Todo título, episodio y categoría va marcado `adult`: Kino solo lo muestra con el código 18+ desbloqueado
(Ajustes ▸ Adultos). Con el código bloqueado el plugin aparece vacío.

## Qué trae

- **Búsqueda** por título.
- **Inicio:** episodios recientes y la lista de series.
- **Categorías:** 24 géneros (los más populares primero).
- **Episodios:** lista con número, captura y fecha.
- **Video:** hasta 9 copias por episodio en el menú **Servidor y calidad** (1080p, 720p, 480p, HLS). El ajuste
  **Calidad preferida** decide cuál abre primero. Se puede descargar.

## Cómo funciona

1. La página del episodio trae el id del reproductor (`action: 'get_player_contents'`, `a: <id>`).
2. Un `POST` a `/wp-admin/admin-ajax.php` devuelve los cinco espejos (`<iframe>`).
3. Cada espejo trae un `sources: [{file, label}]` con la URL del archivo; el plugin los ordena por calidad y servidor.

Medido el 2026-10-12 desde un Mac, sin cabeceras especiales (ni `Referer`): `gdvid.info` ~12 Mbit/s,
`na-01.javprovider.com` ~7, `hentaidoge.org` ~4. Todos responden `206` a un `Range`. Los enlaces de `hentaidoge.org` y
`javprovider.com` son firmados y caducan en unas horas; Kino vuelve a llamar a `resolve` cuando eso pasa.

## Permisos

- `hosts`: `hentaimama.io` (catálogo y páginas).
- `streamHosts: "any"`: el video está en servidores que rotan (`gdvid.info`, `hentaidoge.org`, `javprovider.com`); Kino
  muestra una línea roja al instalar.

## Límites

- Solo HentaiMama. El addon original también usa HentaiTV y HentaiSea; no se portaron todavía.
- Sin icono ni medición en un aparato Android: lo probado fue el contrato con el SDK (`validate.mjs`) y la lectura en
  vivo del sitio.
- Los subtítulos van quemados en inglés; los episodios marcados RAW no tienen.
- Si el sitio cambia su tema, lo primero que se rompe es el análisis de tarjetas (`parseSeriesPage`) y la lectura de
  `sources` (`embedSources`).
