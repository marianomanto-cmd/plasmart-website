# Plasmart — Sitio web (V3 · "Signal")

Landing page de **Plasmart** (corte láser y plasma de acero · Córdoba, Argentina).
Estética ultra‑minimalista / futurista: negro espacial, tipografía Sora finísima,
smooth‑scroll y animaciones al hacer scroll. CTA principal: pedir presupuesto por WhatsApp.

> Implementado como **sitio estático** (HTML/CSS/JS vanilla), fiel 1:1 al handoff de diseño.
> El detalle completo del diseño, tokens y animaciones está en [`DESIGN_HANDOFF.md`](./DESIGN_HANDOFF.md).

## Estructura

```
index.html          Markup de todas las secciones
v3.css              Sistema visual + estados/animaciones (fuente de verdad del estilo)
v3.js               Lenis + GSAP wiring, loader, reveals, scrub, acordeón, parallax,
                    carrusel mobile, cursor custom, botones magnéticos, modal, video crossfade
assets/             Video del hero + 6 fotos de proyectos provistas por el cliente
DESIGN_HANDOFF.md   Especificación de diseño completa (referencia)
```

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

- [ ] **Localizar imágenes externas.** Hoy 12 fotos de proyectos + 3 de aplicaciones + el logo se
      cargan por URL desde `plasmartcba.com`. Conviene descargarlas y servirlas localmente
      (idealmente WebP) para velocidad y para no depender de un host externo. *(No se pudieron
      descargar en este entorno porque la red sólo permite hosts del allowlist.)*
- [ ] **Logo en SVG.** Pedir al cliente el SVG del logo (hoy se usa el PNG 500×500).
- [ ] **Catálogo PDF.** El botón "Descargar catálogo" hoy abre WhatsApp pidiendo el catálogo.
      Cuando exista el PDF, cambiar el `href` por la descarga directa (`download`).
- [ ] **Backend de contacto (opcional).** El modal de mail arma un `mailto:`. Si hay endpoint,
      reemplazar por un `POST`.
