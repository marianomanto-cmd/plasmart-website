# Plasmart — Sitio web (V3 · "Signal")

Landing page de **Plasmart** (corte láser y plasma de acero · Córdoba, Argentina).
Estética ultra‑minimalista / futurista: negro espacial, tipografía Sora finísima,
smooth‑scroll y animaciones al hacer scroll. CTA principal: pedir presupuesto por WhatsApp.

> Implementado como **sitio estático** (HTML/CSS/JS vanilla), fiel 1:1 al handoff de diseño.
> El detalle completo del diseño, tokens y animaciones está en [`DESIGN_HANDOFF.md`](./DESIGN_HANDOFF.md).

## Estructura

```
index.html          Página en español (ES) — markup de todas las secciones
en.html             Página en inglés (EN) — misma estructura, textos traducidos
v3.css              Sistema visual + estados/animaciones (fuente de verdad del estilo)
v3.js               Lenis + GSAP wiring, loader, reveals, scrub, acordeón, marquee vertical
                    de proyectos, carrusel mobile, cursor custom, botones magnéticos, video,
                    listeners de analytics (dataLayer), nav backdrop on-scroll
whatsapp/index.html Página intermedia de tracking → pushea whatsapp_click y redirige a wa.me
favicon.svg         Favicon (monograma blanco sobre negro — placeholder hasta el logo real)
llms.txt            Resumen del sitio para LLMs (formato llmstxt.org)
robots.txt          Crawlers
assets/             Video del hero + fotos (WebP) + catálogo PDF + og-cover.jpg
DESIGN_HANDOFF.md   Especificación de diseño completa (referencia)
```

### Bilingüe (ES / EN)

- `index.html` (es) y `en.html` (en) comparten **el mismo CSS, JS y assets**. El **toggle ES / EN**
  está en el nav (esquina derecha) y enlaza una página con la otra.
- `v3.js` es **locale-aware** vía `<html lang>`: los contadores de stats usan coma o punto decimal
  (12,7 / 12.7) y el `mailto:` del modal arma asunto/cuerpo en el idioma correcto.
- SEO: cada página declara `hreflang` (es / en / x-default).

### Notas de comportamiento (cambios pedidos sobre el handoff)

- **Proyectos (desktop):** en lugar del parallax atado al scroll del handoff, la grilla es ahora un
  **marquee vertical infinito** (tipo "tragamonedas"): cada columna se desplaza sola y a distinta
  velocidad, y **acopla su velocidad a la del scroll** de la página. Implementado en `v3.js` (módulo
  "infinite vertical marquee") envolviendo las tarjetas en `.wg-track` y recortando `.wg-col` a la
  altura de un set para que el flujo de la página no se altere. Mobile sigue usando el carrusel.
- **Logo del nav:** agrandado (38px).
- **Hero CTAs en mobile:** reducidos (44px, mínimo táctil) para dejar ver mejor el video.

### Auditoría UX aplicada (rúbrica "UI UX Pro Max")

Mejoras de accesibilidad / performance pasadas sobre la guía:
- **Imágenes → WebP** (redimensionadas a máx. 1400px): payload de imágenes **-55%** (~9,5 MB → ~4,2 MB),
  + `loading="lazy"` y `decoding="async"` en todo lo que está bajo el fold.
- **Manifiesto legible** cuando no corre el scrub (sin GSAP o con `reduced-motion`): antes quedaba en
  gris casi ilegible.
- **Foco de teclado visible** (`:focus-visible`) — importante porque el cursor custom oculta el puntero.
- **Skip-link** "Saltar al contenido" para teclado/lectores de pantalla.
- **Formulario:** labels asociados (`for`/`id`), `type="tel"`/`email` + `inputmode` + `autocomplete`.
- **Se quitó SplitType** (se cargaba pero no se usaba) → un request bloqueante menos.

### Contacto: solo WhatsApp

- Se eliminó el botón/modal de "Escribinos un mail" y su formulario. Todos los CTA de presupuesto
  van a WhatsApp. (El email queda como dato de contacto informativo en la sección Contacto.)
- Redes en el footer: **Instagram**, **Facebook**, **LinkedIn** (URLs actualizadas).

### SEO / LLM

- **Títulos** keyword-rich + **canonical** + `robots` por página, **OpenGraph/Twitter** con imagen
  generada (`assets/og-cover.jpg`, 1200×630) y `hreflang` es/en/x-default.
- **JSON-LD `LocalBusiness`** en ambas páginas (dirección, horario, teléfono, `sameAs`, servicios) —
  rich results + comprensión por LLMs.
- **`llms.txt`** (formato llmstxt.org) con el resumen del negocio, servicios, contacto y páginas.
- **Nav con backdrop al scrollear** (`.nav.scrolled`): deja de mezclarse con el contenido.
- Cosmético: `color-scheme: dark`, scrollbar temático, sin flash de tap en mobile.

> ⚠️ `canonical` / `og:image` / JSON-LD `url` están en rutas **relativas** porque aún no hay dominio
> final. Cuando se defina el dominio, conviene pasarlas a absolutas y agregar `sitemap.xml` +
> `Sitemap:` en `robots.txt`.

### Analytics / Tracking (GTM)

Adaptado del brief de Next.js al **stack estático actual** (mismo container, mismos eventos):

- **GTM `GTM-T6GRB89`** cargado (snippet async en `<head>` + `<noscript>` tras `<body>`) en
  `index.html`, `en.html` y la página intermedia de WhatsApp. GA4/Google Ads se configuran dentro
  de GTM (no en el código).
- **Página intermedia `/whatsapp/`**: los CTA de presupuesto (hero/nav/contacto/flotante) apuntan a
  `whatsapp/?src=...`; esa página pushea `whatsapp_click` al `dataLayer` (con `wa_source`,
  `lead_value`/`value` 50000 ARS, `eventCallback` + timeout de 1500 ms) y recién ahí redirige a wa.me.
- **`whatsapp_direct_click`**: el link directo a wa.me del bloque de contacto.
- **`social_click`**: listener global (en `v3.js`) para clicks salientes a IG/FB/LinkedIn/etc.
- `generate_lead`/form **no aplica**: se quitó el formulario (todo va por WhatsApp).
- `src` por CTA: `hero`, `nav`, `contacto`, `floating` → se reporta como `wa_source` en GA4.

## Librerías (todas gratis, vía CDN, cargadas en `<head>`)

| Librería | Versión | Para qué | Licencia |
|---|---|---|---|
| GSAP (core) | 3.12.5 | Motor de animación | "No Charge" (gratis, incl. comercial) |
| GSAP ScrollTrigger | 3.12.5 | Animaciones atadas al scroll | Idem GSAP |
| Lenis | 1.3.23 | Smooth scroll | MIT |
| SplitType | 0.3.4 | Partir texto (opcional) | MIT |

Tipografías: **Sora** + **JetBrains Mono** (Google Fonts).

> No se usa el plugin pago `SplitText` de GSAP. El titular del hero se anima con máscaras de
> línea hechas a mano (`.ln-mask` / `.ln-in`). No existe ninguna dependencia "UX/UI MAX PRO" ni
> "Context": no se necesitan.

## Accesibilidad / robustez

- `prefers-reduced-motion`: si está activo, no se inicializan Lenis ni las animaciones; el contenido
  se muestra completo y el cursor custom se desactiva.
- Degradación: los elementos sólo se ocultan para animar cuando GSAP cargó (clase `html.lib-on`).
  Si GSAP no carga, el contenido se ve igual, sin animación. Hay failsafes por timeout para el
  loader, los reveals y los contadores.

## Correr localmente

Es un sitio estático; servilo por HTTP (el video y las fuentes no cargan bien con `file://`):

```bash
npx serve .
# o
python3 -m http.server 8080
```

Luego abrí http://localhost:8080.

## Deploy

Cualquier hosting estático sirve el repo tal cual desde la raíz:

- **GitHub Pages**: Settings → Pages → Deploy from branch `main` / `root`. (Se incluye `.nojekyll`.)
- **Netlify / Vercel / Cloudflare Pages**: sin build command; publish directory = raíz del repo.

## Pendientes / próximos pasos

- [x] **Imágenes de proyectos localizadas.** Las 12 fotos de proyectos ya se sirven desde `assets/`
      (más las 6 que ya venían del cliente = 18 en total).
- [x] **Imágenes de Aplicaciones localizadas.** Arquitectura / Industria / Paneles ahora usan
      `assets/app-*.webp` (la foto de Industria venía en 16320×9180/10 MB → reescalada y comprimida).
- [x] **Todas las imágenes pasadas a WebP** (máx. 1400px) → payload de imágenes -55%.
- [ ] **Sólo queda externo el logo** (`plasmart-logo-w-500.png`, en nav/footer/OG). Pendiente el
      SVG/PNG del logo para localizarlo y rehacer el favicon con la marca real.
- [ ] **Favicon real.** Hoy es un monograma "P" blanco sobre negro generado como placeholder
      (`favicon.svg`), porque el logo real no se pudo traer en este entorno. Con el logo en SVG/PNG
      lo reemplazo por la marca real sobre fondo negro.
- [ ] **Logo en SVG.** Pedir al cliente el SVG del logo (hoy se usa el PNG 500×500).
- [x] **Catálogo PDF.** El botón "Descargar catálogo" del hero ahora descarga
      `assets/Catalogo-Plasmart.pdf` (45 págs, ~35 MB) directo con `download`.
      *(Pendiente opcional: comprimir/optimizar el PDF — pesa bastante para mobile.)*
- [ ] **Backend de contacto (opcional).** El modal de mail arma un `mailto:`. Si hay endpoint,
      reemplazar por un `POST`.
