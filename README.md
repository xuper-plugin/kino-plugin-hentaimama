# HentaiMama — plugin de Kino (18+)

Hentai en HD con subtítulos en inglés, leído directo de [hentaimama.io](https://hentaimama.io/). Es un port a Kino del
addon de Stremio [Zen0-99/hentaistream-addon](https://github.com/Zen0-99/hentaistream-addon), pero **sin servidor
intermedio**: el plugin habla con el sitio y no necesita alojar nada.

No está afiliado con el sitio. Solo para mayores de edad.

## Instalar

En Kino: **Plugins ▸ Agregar un plugin ▸ Kino**, y pega la dirección de este repositorio. Requiere Kino 0.9.50 o más.

## 18+

Todo título, episodio y categoría va marcado `adult: true` (manifiesto con categoría `adult`, apiVersion 6): Kino solo
lo muestra con el código 18+ desbloqueado (Ajustes ▸ Adultos) y lo pide de nuevo al volver a bloquear. Con el código
bloqueado el plugin aparece vacío.

Se comprobó contra el sitio en vivo: 191 entradas de búsqueda, Inicio, listas, géneros, sección y categorías, y las 191
llevan la marca. La sección propia **no lleva hero** a propósito: el hero no tiene marca `adult` y mostraría un título
y un póster con el código bloqueado.

## Qué trae

- **Búsqueda** por título (ordenada por parecido, con un segundo intento con el título original).
- **Inicio:** episodios recientes (con el póster de la serie, no la captura del episodio) y la lista de series.
  **Sección propia** con dos pestañas.
- **Categorías:** 24 géneros (los más populares primero), cada uno con el póster de su primer título; los géneros que
  el sitio lista pero no tienen página se omiten.
- **Episodios:** lista con número, captura y fecha.
- **Video:** hasta 8 copias por episodio en el menú **Servidor y calidad** (1080p, 720p, 480p, original y dos
  servidores firmados). El ajuste **Calidad preferida** decide cuál abre primero. Se puede descargar.

## Cómo se resuelve un episodio (y por qué es rápido)

El sitio lista cinco espejos por episodio; cada uno es un iframe cuyo parámetro `p` es la ruta del archivo en base64.

| Espejo | Qué es | Cómo lo usa el plugin |
|---|---|---|
| `rtmp`, `r2-mp4` | `gdvid.info/<ruta>` y `gdvid.info/hls/<ruta>` (1080p/720p/480p), sin firma | **Se arman sin abrir ningún iframe** y se prueban con una petición de 1 byte |
| `hls-mp4`, `newjav`, `hls` | enlaces firmados (`hentaidoge.org`, `javprovider.com`) | Copias **perezosas**: solo se abren si las eliges o si las rápidas no existen |

Pasos de `resolve`: (1) la página del episodio, para el id del reproductor (se recuerda un día); (2) un `POST` a
`admin-ajax.php` con la lista de espejos (se recuerda 10 minutos); (3) una petición `Range: bytes=0-1` por archivo, en
paralelo, para descartar los muertos. Primera vez: 3 peticiones; después, 1 o 2.

Robustez, tomada del plugin AnimES:

- **Presupuesto de 17 s:** cada paso recibe lo que queda, porque el host espera toda petición en vuelo.
- **Un reintento** si el primer intento falló rápido; un 404 de la página es final.
- **Salud:** si todos los archivos sin firma responden 403/404/410, ese host se aparta 3 minutos, se abren los firmados
  de inmediato y se reporta `mirror_dead` (telemetría). Un fallo de red no apaga nada.
- **Sin cabeceras especiales:** no hizo falta `Referer` ni `Sec-Fetch-*` (se probó cada servidor).
- **Caché con respaldo:** si el sitio falla, se sirve la lista vieja (hasta 24 h).
- **Ajustes:** estado del sitio y de los archivos, "Comprobar sitio", "Vaciar caché".

## Mediciones

Fire Stick 4K Max, Wi-Fi 2.4 GHz, `curl` desde el aparato, 6 MB por archivo (2026-10-12):

| Copia | Velocidad | Primer byte |
|---|---|---|
| `gdvid.info` 1080p | **16.8 Mbit/s** (2.1 MB/s) | 0.3–0.5 s |
| `hentaidoge.org` (firmado) | 6.4–8.1 Mbit/s | 0.6–1.2 s |
| `javprovider.com` (firmado) | 5.6 Mbit/s | 0.4 s |

El 1080p de un episodio de 18.8 min pesa 243 MB (**1.7 Mbit/s**), así que la copia principal rinde ~10 veces lo que
necesita. Con 720p son 133 MB y con 480p 81 MB.

Tiempo de `resolve` desde un Mac: ~2 s en frío.

## Qué se verificó y qué no

- **Verificado:** el SDK acepta el plugin (`validate.mjs`); lectura en vivo de búsqueda, Inicio, categorías, episodios
  y `resolve` en 6 series; 11 escenarios simulados (host caído, sin red, calidad muerta, página 404, JSON roto,
  reintento, copia perezosa); los subtítulos son **ingleses quemados en el video** (se extrajo un fotograma).
- **No probado:** reproducción dentro de Kino en un aparato. Con el código 18+ bloqueado no se puede ver el plugin
  desde fuera, y el código es del dueño del aparato.
- **Sin icono.**

## Permisos

- `hosts`: `hentaimama.io` (páginas) y `gdvid.info` / `*.gdvid.info` (solo para comprobar que el archivo responde).
- `streamHosts: "any"`: los servidores firmados rotan (`hentaidoge.org`, `na-01.javprovider.com`); Kino muestra una
  línea roja al instalar.
- `telemetry: true`: Kino recibe los avisos `mirror_dead`, `mirror_empty` y `no_player` (sin datos personales).

## Límites

- Solo HentaiMama. El addon original también usa HentaiTV y HentaiSea; no se portaron.
- Algunos episodios son RAW (sin subtítulos); el sitio lo marca solo en la lista de recientes y no se muestra.
- Si el sitio cambia su tema, lo primero que se rompe es `parseSeriesPage`, la lectura de `p` en `mirrorOf` o la de
  `sources` en `embedSources`; la telemetría lo avisa como `no_player` o `mirror_empty`.
