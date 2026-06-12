# Plasmart — Sitio web

Sitio de **Plasmart** (corte láser y plasma de acero · Córdoba, Argentina). **Multi‑página**: home +
landings dedicadas de **Arquitectura** e **Industria**. Estética ultra‑minimalista / futurista: negro
espacial, tipografía Sora finísima, smooth‑scroll y animaciones al hacer scroll. CTA principal:
**pedir presupuesto por WhatsApp**. Home **bilingüe ES / EN**; las landings, por ahora, sólo en ES.

> **Sitio estático** (HTML/CSS/JS vanilla, sin build). El handoff de diseño original está en
> [`DESIGN_HANDOFF.md`](./DESIGN_HANDOFF.md) — es la referencia histórica; algunas decisiones
> cambiaron desde entonces (ver **Cambios sobre el handoff**).

## Estructura

```
index.html            Home ES — markup de todas las secciones (header multi-página)
arquitectura/index.html  Landing dedicada · Arquitectura (fachadas, paneles, escaleras)
industria/index.html     Landing dedicada · Industria (plasma 32mm, metalmecánica, agro)
en.html               Home EN — header single-page; sí tiene FAQ, Meta Pixel y SEO absoluto
v3.css                Sistema visual + estados/animaciones compartido (header/footer/tipografía)
landing.css           Estilos de las landings (appcards, timeline + banda de proceso, split
                      diferencial, carrusel de proyectos, hero-soft)
v3.js                 Lenis + GSAP, loader, reveals, scrub, acordeón, marquee vertical de
                      proyectos, carrusel mobile, cursor custom, botones magnéticos, video
                      crossfade, nav backdrop on-scroll, menú hamburguesa, carrusel auto de
                      landings, analytics (dataLayer)
whatsapp/index.html   Página intermedia de tracking (pushea whatsapp_click y redirige a wa.me)
llms.txt              Resumen del sitio para LLMs (formato llmstxt.org)
sitemap.xml · robots.txt · vercel.json (301 www→non-www) · .nojekyll
assets/
  plasmart-logo.png   Logo del cliente (fondo transparente) — usado en nav y footer
  favicon.png · apple-touch-icon.png   Íconos (logo sobre fondo negro de marca)
  og-cover.jpg        Imagen de compartido / OpenGraph (1200×630)
  *.webp              Fotos de proyectos y de aplicaciones (home + curaduría arquitectura)
  arq-*.jpg           Fotos de la landing de Arquitectura (fachadas, escaleras, paneles…)
  ind-*.jpg           Fotos de la landing de Industria (planta, plegadora, piezas cortadas…)
  arq-og.jpg · ind-og.jpg   Imágenes OpenGraph por landing (1200×630 con logo, generadas con ffmpeg)
  arq-hero.mp4 · ind-hero.mp4   Videos de hero de las landings (720p, comprimidos, sin audio)
  ind-planta-loop.mp4   Clip de planta del diferencial "Corte láser"
  transfil-hero-light.mp4   Video del hero (home)
  Catalogo-Plasmart.pdf     Catálogo (botón "Descargar catálogo")
DESIGN_HANDOFF.md     Especificación de diseño original (referencia)
```

## Stack / librerías (gratis, vía CDN en `<head>`)

| Librería | Versión | Para qué | Licencia |
|---|---|---|---|
| GSAP (core) | 3.12.5 | Motor de animación (timelines, quickTo) | "No Charge" (incl. comercial) |
| GSAP ScrollTrigger | 3.12.5 | Animaciones atadas al scroll | Idem GSAP |
| Lenis | 1.3.23 | Smooth scroll | MIT |

Tipografías: **Sora** + **JetBrains Mono** (Google Fonts).

> El titular del hero se anima con **máscaras de línea hechas a mano** (`.ln-mask` / `.ln-in`), sin
> el `SplitText` pago de GSAP. **SplitType se removió** (se cargaba pero no se usaba). No hay ninguna
> dependencia "UX/UI MAX PRO" ni "Context".

## Bilingüe (ES / EN)

- `index.html` y `en.html` comparten **el mismo CSS, JS y assets**. El **toggle ES / EN** está en el
  nav (derecha) y enlaza una página con la otra.
- `v3.js` es **locale-aware** vía `<html lang>`: los contadores de stats usan coma o punto decimal
  (12,7 / 12.7).
- SEO: `hreflang` (es / en / x-default) + `canonical` por página.

## Landings segmentadas (Arquitectura · Industria)

Dos landings dedicadas que comparten el sistema visual del home (`v3.css` + `v3.js`) y suman su CSS
propio en `landing.css`.

- **Header multi‑página** (global, en home y landings): `Inicio · Arquitectura · Industria · Proyectos ·
  Contacto` + botón `Presupuesto ↗`. En **mobile** colapsa en **hamburguesa** (overlay full‑screen,
  módulo en `v3.js`). En el home, "Proyectos"/"Contacto" son anclas (`#trabajo` / `#contacto`); en las
  landings apuntan a `/#trabajo` y `/#contacto`. El toggle ES/EN queda sólo en el home.
- **Home → landings**: en la sección Aplicaciones del home, las cards **Arquitectura** e **Industria**
  linkean a `/arquitectura/` y `/industria/`. La card **Paneles decorativos** sigue como ancla a
  `#trabajo`.
- **`/arquitectura/`**: hero con video · Aplicaciones (fachadas / paneles / escaleras) · **¿Por qué
  corte láser?** (3 ventajas para el diseño) · Capacidades · Proceso 01–04 · **Proyectos** (carrusel
  horizontal con auto‑scroll) · Testimoniales (oculto hasta tener contenido) · CTA + contacto.
- **`/industria/`**: hero con video · Capacidades industriales · Aplicaciones (estructuras /
  metalmecánica / producción en serie) · **Diferencial "Corte láser de alta precisión"** (texto +
  video de planta) · Proceso B2B (con banda de foto de planta) · Clientes (oculto) · CTA + contacto.
- **Componentes nuevos** (`landing.css`): `.appcards` (grid de aplicaciones), `.proc-grid` +
  `.proc-media` (timeline + banda), `.split` (diferencial 2 col), `.proj-marquee` (carrusel auto),
  `.hero-soft` (hero menos sombreado vía atributo `data-hero-opacity`).
- **Rutas root‑relative** (`/arquitectura/`, `/assets/…`): el sitio se sirve desde la **raíz** del
  dominio (Vercel / dominio propio), **no** desde una subcarpeta tipo GitHub Pages de proyecto.
- **Videos de hero** comprimidos con ffmpeg (H.264, 720p, sin audio, `+faststart`): ~1,8–2,1 MB cada
  uno. El buffer del crossfade (`#heroVideo3b`) carga en `preload="auto"`.

> **`/en.html`**: conserva el **header single‑page** (no el multi‑página) y no tiene versiones EN de
> las landings — eso queda para una iteración futura. Sí recibió el resto de mejoras: FAQ + `FAQPage`,
> Meta Pixel, canonical/OG **absolutos** y el ruteo del número de contacto por `/whatsapp/`.

## Contacto = WhatsApp

- **Sin formulario ni modal de mail.** **Todos** los caminos a WhatsApp —incluido el **número del
  bloque de contacto** (`?src=contacto-directo`)— pasan por la página intermedia `/whatsapp/` para
  tracking validado. **No queda ningún `wa.me` directo** en las páginas de contenido (sólo en
  `/whatsapp/`, que es el destino). El email queda como dato informativo en Contacto.
- **Envíos**: se coordinan con **Via Cargo o la transportista que prefiera el cliente**, con **pago en
  destino** al recibir (no hay transporte propio).
- Footer / redes: **Instagram · Facebook · LinkedIn**.

## Cambios sobre el handoff

- **Proyectos (desktop):** en vez del parallax atado al scroll, la grilla es un **marquee vertical
  infinito** (cada columna a distinta velocidad, **acoplado a la velocidad del scroll**). Las
  tarjetas se envuelven en `.wg-track` y `.wg-col` se recorta a un set para no alterar el flujo de la
  página. **Mobile**: galería tipo **marquesina** — auto‑scroll lento + swipe libre + tap para
  pausar/reanudar (loop sin corte duplicando el set; respeta `reduced-motion`).
- **Logo real del cliente** en nav (44px) y footer (PNG con fondo transparente).
- **Hero CTAs en mobile** más chicos (44px, mínimo táctil) para dejar ver el video.
- **Nav con backdrop + sombra al scrollear** (`.nav.scrolled`): deja de mezclarse con el contenido.
- **Multi‑página**: el sitio pasó de single‑landing a **home + landings** de Arquitectura e Industria,
  con **header multi‑página + hamburguesa** en mobile (ver *Landings segmentadas*).

## Analytics / Tracking (GTM)

Adaptado al **stack estático** (mismo container y eventos que el sitio anterior). GA4 / Google Ads se
configuran **dentro de GTM**, no en el código.

- **GTM `GTM-T6GRB89`**: snippet async en `<head>` + `<noscript>` tras `<body>` en `index.html`,
  `arquitectura/index.html`, `industria/index.html`, `en.html` y `whatsapp/index.html`.
- **`/whatsapp/`** (intermedia): los CTA apuntan a `whatsapp/?src=...` (hero / nav / contacto /
  floating). Las **landings** suman sources propios — `arquitectura-hero`, `arquitectura-fachadas`,
  `arquitectura-estructuras`, `arquitectura-cta`, `industria-hero`, `industria-estructuras`,
  `industria-metalmecanica`, `industria-serie`, `industria-cta` — todos llegan como `wa_source`. La
  página **redirige siempre** a wa.me por un `setTimeout` de 1200 ms (la UX no depende del tracking) y
  **sólo pushea `whatsapp_click`** si pasa 6 chequeos de legitimidad (anti‑inflado de conversiones). El
  evento lleva `wa_source`, `lead_value`/`value` 50000 ARS, `page_referrer` (sin
  `eventCallback`/`eventTimeout`).
  - **Chequeos:** `bot_ua` (regex de User‑Agent) · `not_visible` (`document.visibilityState`, descarta
    prefetch / pestañas en background) · `no_source` (sin `?src` o `unknown`) · `already_fired_session`
    (dedup por `sessionStorage` `pm_wa_fired`) · `no_languages` · `webdriver`.
  - Si **algún** chequeo falla, en vez del evento principal se pushea **`whatsapp_click_blocked`** con
    `block_reasons` (IDs separados por coma) — sirve para auditar en GA4 cuánto/por qué se filtró.
- **`whatsapp_direct_click`** (legado): el listener de `v3.js` lo pushea si se clickea un link
  **directo** a `wa.me`. **Desde el fix de inflado, TODOS los links de WhatsApp (incluido el número de
  contacto) pasan por `/whatsapp/`** (`src=contacto-directo`), así que ya **no hay links `wa.me`
  directos** en las páginas de contenido y este evento queda dormido. ⚠️ La conversión de Ads y
  `generate_lead` deben disparar **sólo con `whatsapp_click`**, **nunca** con `whatsapp_direct_click`
  (ese segundo trigger, sin los 6 chequeos ni dedup, era el origen del ~67% inflado en la home).
- **`social_click`**: listener global en `v3.js` para clicks salientes a IG/FB/LinkedIn/etc.
- `generate_lead` / form **no aplica** (se quitó el formulario).
- **Landings (Arquitectura / Industria)**: **no** agregan ninguna conversión propia. Todos los CTA
  de presupuesto pasan por `/whatsapp/`, así que los **6 chequeos anti‑inflado** y la dedup por sesión
  (`pm_wa_fired`) **siguen aplicando sin cambios** — no hay nuevas vías de conversión que inflar.
- **Meta Pixel `2982494008617961`** (hardcodeado, no por GTM): base **PageView** en `<head>` de todas
  las páginas (+ `<noscript>` tras `<body>`). El evento **`Lead`** (`value: 50000`, `currency: ARS`) se
  dispara **sólo dentro del bloque validado de `/whatsapp/`** —junto al `whatsapp_click`—, así que
  **hereda los mismos 6 chequeos anti‑inflado** (nunca en `whatsapp_click_blocked` ni en cada visita).
  Para mayor robustez a futuro: **Conversions API** (server‑side) con `event_id` para deduplicar.

> **Resuelto (2026‑06):** el tag de Ads **"Ads - Conv WhatsApp"** y el de **"GA4 - Event Lead"** estaban
> disparando con **`whatsapp_click` OR `whatsapp_direct_click`**; ese segundo trigger contaba cada click
> a un `wa.me` directo (sin chequeos ni dedup) e inflaba la home (~67% vs 13‑15% sano de las landings).
> Se **quitó `whatsapp_direct_click`** de ambos tags en GTM y, del lado del código, **el número de
> contacto se ruteó por `/whatsapp/`** (no quedan `wa.me` directos). La conversión cuenta sólo el lead
> validado y deduplicado.
>
> **Falta del lado de GTM / Ads (panel, no código):**
> - Trigger de conversión que escuche **sólo** `event = whatsapp_click` (NO `whatsapp_click_blocked` ni
>   `whatsapp_direct_click`), y mapearlo como key event (`generate_lead`), ya que no hay formulario.
> - Mandar `whatsapp_click_blocked` a **GA4 como evento de auditoría** (con `block_reasons` / `wa_source`).
> - En Google Ads, contar la conversión como **"Una"** por interacción (no "Cada").

## SEO / LLM

- **Home / EN**: títulos keyword‑rich, `canonical`, `robots`, OpenGraph/Twitter con `og-cover.jpg`,
  `hreflang` (es / en / x‑default), JSON‑LD **`LocalBusiness`**.
- **Landings**: cada una con su `title` / `meta description` / OG / Twitter propios, `canonical` a sí
  misma y **URLs absolutas** (`https://plasmartcba.com/…`) en canonical / OG / JSON‑LD — evita que el
  preview de Vercel (u otro staging) se indexe como contenido duplicado. JSON‑LD **`Service`** (con
  `provider` `LocalBusiness`) + **`BreadcrumbList`** por landing, y `og:image:alt`.
- **`sitemap.xml`** (home · arquitectura · industria · en) + línea `Sitemap:` en `robots.txt`.
- **`llms.txt`** con el resumen del negocio (incluye las landings, diferenciales y un mini‑FAQ).
- **AEO / motores de respuesta** (ChatGPT Search, Perplexity, AI Overviews, Copilot): sección **FAQ**
  visible (acordeón nativo `<details>`) + JSON‑LD **`FAQPage`** en home, `arquitectura`, `industria` y
  `en.html` — el texto del schema **coincide** con el visible. `robots.txt` da bienvenida explícita a
  los bots de citación (`OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `ClaudeBot`,
  `Google-Extended`, `Applebot-Extended`, etc.). El sitio es **HTML estático** → el contenido está en
  el HTML (sin render JS), ideal para que los crawlers de IA lo extraigan.

> 💡 **Off‑site (no es código, alto impacto para IA local)**: completar **Google Business Profile** +
> reseñas, citaciones en directorios con NAP idéntico, y menciones/enlaces desde sitios relevantes.

> **Dominio primario: `https://plasmartcba.com` (non‑www)** — Search Console no tiene la propiedad
> `www`. **Todo** el sitio (home, `en.html` y landings) usa `canonical` / `og:url` / `og:image` /
> `hreflang` **absolutos non‑www**, el `sitemap.xml`/`robots.txt` idem, y `vercel.json` hace el **301
> de `www` → non‑www**. Las `LocalBusiness` comparten `@id` (`#localbusiness`) para unificar la entidad.
> Las landings tienen **OG image propia** (`arq-og.jpg` / `ind-og.jpg`, 1200×630 con logo).
> Pendiente del lado de Vercel: marcar **non‑www como dominio primario** y **eliminar `tienda.`**.

## Accesibilidad / robustez

- `prefers-reduced-motion`: no se inicializan Lenis ni las animaciones; el contenido se ve completo y
  el cursor custom se desactiva.
- **Degradación**: los elementos sólo se ocultan para animar cuando GSAP cargó (`html.lib-on`). Si
  GSAP no carga, el contenido se ve igual, sin animación. Hay failsafes por timeout (loader, reveals,
  contadores). El manifiesto queda legible aun sin scrub.
- Foco de teclado visible (`:focus-visible`), **skip-link**, `color-scheme: dark`, scrollbar temático.

## Performance

- Imágenes del home en **WebP** (≤ 1400px) con `loading="lazy"` + `decoding="async"` bajo el fold (el
  marquee / carrusel fuerza *eager* para que los clones no queden en blanco).
- **Videos de hero** de las landings comprimidos con ffmpeg (H.264 720p, sin audio, `+faststart`): de
  ~11 MB a **~1,8–2,1 MB** cada uno.
- ⚠️ Las **fotos nuevas de las landings van en `.jpg`** (no había herramientas de conversión en el
  entorno al crearlas). Pendiente: pasarlas a **WebP** y redimensionar a ~1200px para igualar al resto.

## Correr localmente

Servir por HTTP (el video y las fuentes no cargan bien con `file://`):

```bash
npx serve .      # o:  python3 -m http.server 8080
```

## Deploy

Hosting estático desde la raíz, sin build:

- **GitHub Pages**: Settings → Pages → branch `main` / root (incluye `.nojekyll`).
- **Vercel / Netlify / Cloudflare Pages**: sin build command; output = raíz del repo.

## Pendientes / próximos pasos

### Sitio
- [ ] **Logo en SVG.** Hoy es PNG (derivado de la imagen provista, recortada a fondo transparente).
      Con el SVG vectorial quedaría nítido a cualquier tamaño.
- [x] **Dominio non‑www unificado** (canonical/og/hreflang/sitemap absolutos + `vercel.json` 301).
      Falta en Vercel/DNS: **dominio primario = non‑www** y **borrar el subdominio `tienda.`**.
- [ ] **Optimizar el catálogo PDF** (~35 MB, pesado para mobile).
- [x] **GTM — inflado de conversión resuelto** (jun 2026): se quitó `whatsapp_direct_click` de los tags
      "Ads - Conv WhatsApp" y "GA4 - Event Lead"; la conversión cuenta sólo `whatsapp_click` validado.
      Quedan los ajustes de auditoría del bloque *Analytics / Tracking* (mandar `whatsapp_click_blocked`
      a GA4, contar "Una" por interacción en Ads).

### Landings — contenido / assets que faltan (para Mariano)
- [ ] **Fotos de las landings → WebP** (~1200px). Hoy son `.jpg`.
- [x] **Imagen OG propia** por landing (`arq-og.jpg` / `ind-og.jpg`, 1200×630 con logo).
- [ ] **Arquitectura · Proyectos**: galería curada de obras reales (con nombre de proyecto/estudio).
      Hoy mezcla fotos ilustrativas con proyectos reales del portfolio (códigos descriptivos).
- [ ] **Arquitectura · Testimoniales**: 2–3 testimonios de arquitectos (texto + nombre + estudio +
      foto). Sección maquetada y **comentada** en `arquitectura/index.html`.
- [ ] **Industria · Clientes**: logos/nombres (6–10) o grid de sectores. Sección **comentada** en
      `industria/index.html`.
- [ ] **Industria · Diferencial**: idealmente un close‑up de plasma cortando chapa de 25–32 mm
      (hoy usa un clip de planta como placeholder).
- [ ] **Heroes**: opcional servir las **variantes verticales** en mobile (existen en 1080×1920).
