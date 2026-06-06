# Plasmart — Sitio web

Landing de **Plasmart** (corte láser y plasma de acero · Córdoba, Argentina). Estética
ultra‑minimalista / futurista: negro espacial, tipografía Sora finísima, smooth‑scroll y
animaciones al hacer scroll. CTA principal: **pedir presupuesto por WhatsApp**. **Bilingüe ES / EN.**

> **Sitio estático** (HTML/CSS/JS vanilla, sin build). El handoff de diseño original está en
> [`DESIGN_HANDOFF.md`](./DESIGN_HANDOFF.md) — es la referencia histórica; algunas decisiones
> cambiaron desde entonces (ver **Cambios sobre el handoff**).

## Estructura

```
index.html            Página ES — markup de todas las secciones
en.html               Página EN — misma estructura, textos traducidos
v3.css                Sistema visual + estados/animaciones (fuente de verdad del estilo)
v3.js                 Lenis + GSAP, loader, reveals, scrub, acordeón, marquee vertical de
                      proyectos, carrusel mobile, cursor custom, botones magnéticos, video
                      crossfade, nav backdrop on-scroll, listeners de analytics (dataLayer)
whatsapp/index.html   Página intermedia de tracking (pushea whatsapp_click y redirige a wa.me)
llms.txt              Resumen del sitio para LLMs (formato llmstxt.org)
robots.txt · .nojekyll
assets/
  plasmart-logo.png   Logo del cliente (fondo transparente) — usado en nav y footer
  favicon.png · apple-touch-icon.png   Íconos (logo sobre fondo negro de marca)
  og-cover.jpg        Imagen de compartido / OpenGraph (1200×630)
  *.webp              Fotos de proyectos y de aplicaciones
  transfil-hero-light.mp4   Video del hero
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

## Contacto = WhatsApp

- **Sin formulario ni modal de mail.** Todos los CTA de presupuesto van a WhatsApp a través de la
  página intermedia `/whatsapp/` (para tracking). El email queda como dato informativo en Contacto.
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

## Analytics / Tracking (GTM)

Adaptado al **stack estático** (mismo container y eventos que el sitio anterior). GA4 / Google Ads se
configuran **dentro de GTM**, no en el código.

- **GTM `GTM-T6GRB89`**: snippet async en `<head>` + `<noscript>` tras `<body>` en `index.html`,
  `en.html` y `whatsapp/index.html`.
- **`/whatsapp/`** (intermedia): los CTA apuntan a `whatsapp/?src=...` (hero / nav / contacto /
  floating). La página **redirige siempre** a wa.me por un `setTimeout` de 1200 ms (la UX no depende
  del tracking) y **sólo pushea `whatsapp_click`** si pasa 6 chequeos de legitimidad (anti‑inflado de
  conversiones). El evento lleva `wa_source`, `lead_value`/`value` 50000 ARS, `page_referrer` (sin
  `eventCallback`/`eventTimeout`).
  - **Chequeos:** `bot_ua` (regex de User‑Agent) · `not_visible` (`document.visibilityState`, descarta
    prefetch / pestañas en background) · `no_source` (sin `?src` o `unknown`) · `already_fired_session`
    (dedup por `sessionStorage` `pm_wa_fired`) · `no_languages` · `webdriver`.
  - Si **algún** chequeo falla, en vez del evento principal se pushea **`whatsapp_click_blocked`** con
    `block_reasons` (IDs separados por coma) — sirve para auditar en GA4 cuánto/por qué se filtró.
- **`whatsapp_direct_click`**: link directo a wa.me del bloque de contacto.
- **`social_click`**: listener global en `v3.js` para clicks salientes a IG/FB/LinkedIn/etc.
- `generate_lead` / form **no aplica** (se quitó el formulario).

> **Falta del lado de GTM / Ads (panel, no código):**
> - Trigger de conversión que escuche **sólo** `event = whatsapp_click` (NO `whatsapp_click_blocked`),
>   y mapearlo como key event (`generate_lead`), ya que no hay formulario.
> - Mandar `whatsapp_click_blocked` a **GA4 como evento de auditoría** (con `block_reasons` / `wa_source`).
> - En Google Ads, contar la conversión como **"Una"** por interacción (no "Cada").

## SEO / LLM

- Títulos keyword-rich, `canonical`, `robots`, **OpenGraph/Twitter** con `assets/og-cover.jpg`,
  `hreflang`.
- **JSON-LD `LocalBusiness`** en ambas páginas (dirección, horario, teléfono, `sameAs`, servicios).
- **`llms.txt`** con el resumen del negocio.

> ⚠️ `canonical` / `og:image` / JSON-LD `url` están en rutas **relativas** porque aún no hay dominio
> final. Al definirlo, conviene pasarlas a absolutas y agregar `sitemap.xml` + `Sitemap:` en
> `robots.txt`.

## Accesibilidad / robustez

- `prefers-reduced-motion`: no se inicializan Lenis ni las animaciones; el contenido se ve completo y
  el cursor custom se desactiva.
- **Degradación**: los elementos sólo se ocultan para animar cuando GSAP cargó (`html.lib-on`). Si
  GSAP no carga, el contenido se ve igual, sin animación. Hay failsafes por timeout (loader, reveals,
  contadores). El manifiesto queda legible aun sin scrub.
- Foco de teclado visible (`:focus-visible`), **skip-link**, `color-scheme: dark`, scrollbar temático.

## Performance

- Todas las imágenes en **WebP** (≤ 1400px) con `loading="lazy"` + `decoding="async"` bajo el fold
  (el marquee fuerza *eager* para que los clones no queden en blanco).

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

- [ ] **Logo en SVG.** Hoy es PNG (derivado de la imagen provista, recortada a fondo transparente).
      Con el SVG vectorial quedaría nítido a cualquier tamaño.
- [ ] **Dominio final** → pasar `canonical` / `og:image` / JSON-LD `url` a **absolutas**, agregar
      `sitemap.xml` y la línea `Sitemap:` en `robots.txt`.
- [ ] **Optimizar el catálogo PDF** (~35 MB, pesado para mobile).
- [ ] **GTM (panel):** crear los triggers/tags de los eventos y el mapeo a `generate_lead`.
