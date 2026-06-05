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
v3.js               Lenis + GSAP wiring, loader, reveals, scrub, acordeón, marquee vertical
                    de proyectos, carrusel mobile, cursor custom, botones magnéticos, modal, video
favicon.svg         Favicon (monograma blanco sobre negro — placeholder hasta el logo real)
assets/             Video del hero + fotos de proyectos (locales)
DESIGN_HANDOFF.md   Especificación de diseño completa (referencia)
```

### Notas de comportamiento (cambios pedidos sobre el handoff)

- **Proyectos (desktop):** en lugar del parallax atado al scroll del handoff, la grilla es ahora un
  **marquee vertical infinito** (tipo "tragamonedas"): cada columna se desplaza sola y a distinta
  velocidad, y **acopla su velocidad a la del scroll** de la página. Implementado en `v3.js` (módulo
  "infinite vertical marquee") envolviendo las tarjetas en `.wg-track` y recortando `.wg-col` a la
  altura de un set para que el flujo de la página no se altere. Mobile sigue usando el carrusel.
- **Logo del nav:** agrandado (38px).
- **Hero CTAs en mobile:** reducidos para dejar ver mejor el video.

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
      `assets/app-*.jpg` (la foto de Industria venía en 16320×9180/10 MB → reescalada a 1600×900/116 KB).
- [ ] **Sólo queda externo el logo** (`plasmart-logo-w-500.png`, en nav/footer/OG). Pendiente el
      SVG/PNG del logo para localizarlo y rehacer el favicon con la marca real. *(Tip: WebP para todo.)*
- [ ] **Favicon real.** Hoy es un monograma "P" blanco sobre negro generado como placeholder
      (`favicon.svg`), porque el logo real no se pudo traer en este entorno. Con el logo en SVG/PNG
      lo reemplazo por la marca real sobre fondo negro.
- [ ] **Logo en SVG.** Pedir al cliente el SVG del logo (hoy se usa el PNG 500×500).
- [x] **Catálogo PDF.** El botón "Descargar catálogo" del hero ahora descarga
      `assets/Catalogo-Plasmart.pdf` (45 págs, ~35 MB) directo con `download`.
      *(Pendiente opcional: comprimir/optimizar el PDF — pesa bastante para mobile.)*
- [ ] **Backend de contacto (opcional).** El modal de mail arma un `mailto:`. Si hay endpoint,
      reemplazar por un `POST`.
