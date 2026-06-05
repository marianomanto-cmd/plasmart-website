# Handoff — Plasmart · Sitio web (versión “V3 / Signal”)

> **Idioma:** la UI está en español (Argentina). Mantené los textos tal cual.
> **Fidelidad:** **ALTA (hi‑fi)**. Esto es un mockup pixel‑perfect con colores, tipografías,
> espaciados, animaciones e interacciones finales. Recreá la UI tal cual, en desktop **y** mobile.

---

## 0. Qué es este paquete (LEER PRIMERO)

Los archivos `index.html`, `v3.css`, `v3.js` (y `mobile.html` + `ios-frame.jsx`) son una
**referencia de diseño construida en HTML/CSS/JS vanilla**. Son un prototipo que muestra el
**look & feel y el comportamiento finales**, no necesariamente el código a “copiar y pegar” en
producción.

**Tu tarea:** recrear este diseño en el entorno del proyecto destino:
- Si hay un stack (React/Next, Vue/Nuxt, Astro, SvelteKit, WordPress, etc.), reimplementalo con
  los patrones de ese stack. El HTML/CSS aquí es 100% portable: podés tomar el CSS casi tal cual
  y partir el HTML en componentes.
- Si **no** hay stack todavía, podés usar estos archivos directamente como sitio estático
  (es totalmente funcional así) o montarlos en Astro/Next con un componente por sección.

**Sobre “skills” / plugins (aclaración importante):** no existe ninguna dependencia llamada
**“UX IX MAX PRO”, “UI UX MAX PRO”, “Context”, “Context.js”** ni similares. No las busques ni las
instales: **no se usan y no son necesarias**. Todo el movimiento se logra con **3 librerías reales,
gratuitas y de uso comercial libre** (GSAP + ScrollTrigger, Lenis y, opcionalmente, SplitType),
detalladas abajo con sus links. Si en algún momento te ofrecen un plugin **pago** (p. ej. el
`SplitText` de GSAP), **usá la alternativa gratuita indicada**.

---

## 1. Overview

Landing page de **Plasmart** (corte láser y plasma de acero, Córdoba, Argentina). Estética
**ultra‑minimalista / futurista**: negro espacial, tipografía finísima y enorme, mucho aire,
**smooth‑scroll** y animaciones al hacer scroll (revelados, parallax, scrub de texto). CTA
principal: **pedir presupuesto por WhatsApp**.

Secciones, en orden:
1. **Loader** (contador 0→100) → 2. **Hero** (video de fondo + titular) → 3. **Manifiesto**
(texto que se “enciende” al scrollear) → 4. **Aplicaciones** (acordeón automático) →
5. **Capacidades** (lista con descripción al hover / acordeón en mobile) → 6. **Proyectos de
nuestros clientes** (grid con parallax en desktop / carrusel en mobile) → 7. **Contacto** →
8. **Footer**.

---

## 2. Librerías y dependencias (todas GRATIS)

Cárgalas por CDN (o instalalas por npm). Versiones exactas usadas:

| Librería | Versión | Para qué | Licencia | Link |
|---|---|---|---|---|
| **GSAP** (core) | 3.12.5 | Motor de animación (timelines, tweens, `quickTo`) | Standard “No Charge” (gratis, incl. comercial) | https://github.com/greensock/GSAP · https://gsap.com/ |
| **GSAP ScrollTrigger** | 3.12.5 | Animaciones atadas al scroll (reveals, parallax, scrub) | Idem GSAP (gratis) | https://gsap.com/docs/v3/Plugins/ScrollTrigger/ |
| **Lenis** | 1.3.23 | Smooth scroll (el “deslizar” suave) | **MIT** | https://github.com/darkroomengineering/lenis |
| **SplitType** | 0.3.4 | Partir texto en líneas/palabras (alternativa GRATIS al `SplitText` pago de GSAP) | **MIT** | https://github.com/lukePeavey/SplitType |

> ⚠️ **No uses el plugin pago `SplitText` de GSAP.** En este proyecto el titular del hero se anima
> con **máscaras de línea hechas a mano** (spans `.ln-mask`/`.ln-in`, ver §6.2), así que **SplitType
> es opcional**: hoy se carga pero no es imprescindible. Si querés partir texto por palabras/líneas,
> usá **SplitType** (MIT) y no `SplitText`.

### CDN exactos (van en `<head>`, en este orden, **antes** del CSS propio para evitar flash):
```html
<!-- Fuentes -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@200;300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">

<!-- Lenis (CSS recomendado + JS) -->
<link rel="stylesheet" href="https://unpkg.com/lenis@1.3.23/dist/lenis.css">
<script src="https://unpkg.com/lenis@1.3.23/dist/lenis.min.js"></script>

<!-- GSAP + ScrollTrigger -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>

<!-- SplitType (opcional) -->
<script src="https://unpkg.com/split-type@0.3.4/umd/index.min.js"></script>
```
npm equivalente: `npm i gsap lenis split-type` · en React, además `@gsap/react` (hook `useGSAP`).

### Wiring GSAP + Lenis (clave para que el scroll y ScrollTrigger estén sincronizados):
```js
const lenis = new Lenis({ lerp: 0.1, duration: 1.2, smoothWheel: true });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);
gsap.registerPlugin(ScrollTrigger);
```

### Accesibilidad / robustez (NO omitir):
- **`prefers-reduced-motion`**: si está activo, **no** inicialices Lenis ni las animaciones; mostrá
  todo el contenido visible (sin estados “ocultos”) y desactivá el cursor custom.
- **Degradación**: los elementos sólo se “esconden” (opacity:0 / clip) cuando GSAP cargó. Esto se
  controla con la clase `html.lib-on` (ver §6.1). Si GSAP no carga, **el contenido se ve igual**,
  sin animación. Reimplementá esa garantía.

---

## 3. Design tokens (exactos)

```css
:root{
  /* Superficies */
  --bg:#08090b; --bg-2:#0d0f13; --panel:#111419;
  /* Texto */
  --text:#eef0f3; --muted:#8a8f99; --faint:#4f545d;
  /* Líneas */
  --line:rgba(255,255,255,.10); --line-2:rgba(255,255,255,.20);
  /* Acento (índigo “señal”, usado con cuentagotas) */
  --accent:#6e7bff; --accent-soft:rgba(110,123,255,.6);
  /* Tipografía */
  --display:"Sora", system-ui, sans-serif;     /* títulos y casi todo */
  --mono:"JetBrains Mono", ui-monospace, monospace; /* etiquetas/datos */
  /* Layout */
  --maxw:1480px; --pad:clamp(20px,4.5vw,80px);
  /* Easing maestro */
  --ease:cubic-bezier(.19,1,.22,1);
}
```
**Pesos de Sora usados:** 200 (titulares grandes — clave del look), 300, 400, 500, 600.
**Escala tipográfica** (todo responsive con `clamp`):
- Hero H1: `clamp(44px, 9vw, 150px)`, weight **200**, `line-height:.94`, `letter-spacing:-.04em`.
- Títulos sección (`.h-l`): `clamp(34px,5.6vw,88px)`, weight 200, `ls:-.035em`.
- Manifiesto: `clamp(28px,4.4vw,72px)`, weight 200, `line-height:1.12`, `ls:-.03em`.
- Nombre de capacidad (`.cn`): `clamp(26px,4vw,60px)`, weight 200.
- Stats número (`.sv`): `clamp(40px,6vw,90px)`, weight 200.
- Contacto H2: `clamp(44px,11vw,200px)`, weight 200, `ls:-.05em`.
- Mono/labels: 11–13px, `letter-spacing:.1–.22em`, `text-transform:uppercase`, color `--muted`.

**Bordes/sombras:** radios chicos (4–6px). Sin sombras dramáticas; el “brillo” es sólo el
`box-shadow:0 0 8–12px var(--accent-soft)` en barras de progreso/acento. Líneas hairline
`1px solid var(--line)`.

**Grano + glow del fondo (en `<body>`):**
- `body::after` → ruido SVG fractal, `opacity:.04`, `position:fixed; inset:-50%`, sobre todo.
- `body::before` → glow radial índigo arriba‑centro: `radial-gradient(120% 70% at 50% -10%, rgba(110,123,255,.12), transparent 60%)`.

---

## 4. Assets

**Tipografías:** Google Fonts (Sora, JetBrains Mono) — ver CDN.

**Video del hero:** archivo local `assets/transfil-hero-light.mp4` (incluido en este zip, en
`assets/`). 1280×720, ~18,6 s. Se muestra **muy atenuado** (opacity ~.40) detrás del titular, en
**loop con crossfade** (ver §6.3). *Tip:* podés exportar también un `.webm` para mejor compresión.

**Imágenes de proyectos / aplicaciones:** hoy se referencian por URL del sitio actual del cliente
(`https://plasmartcba.com/wp-content/uploads/...`). **Recomendado:** descargarlas y servirlas
localmente/optimizadas (WebP) desde el proyecto. Lista de imágenes usadas:

- Aplicaciones: `2025/02/portfolio-cuad-09-1024x1024.jpg` (Arquitectura),
  `2025/07/industria-img-opt-1024x1024.jpeg` (Industria),
  `2025/03/portfolio-cuad-16-1024x1024.jpg` (Paneles).
- Proyectos (12): `portfolio-cuad-02, -15, -14c(2025/08), -13, -12, -11, -10, -09, -08, -07, -06, -05.jpg`
  (todos bajo `2025/02/` salvo `-14c` que está en `2025/08/`).
- **Logo Plasmart (blanco, PNG transparente):**
  `https://plasmartcba.com/wp-content/uploads/2025/02/plasmart-logo-w-500.png` (500×500).
  Va en el nav (alto 26px) y en el footer (alto `clamp(40px,7vw,84px)`). **Pedí al cliente el SVG**
  para nitidez perfecta.

**Iconos:** son SVG inline simples (flechas, WhatsApp, descarga). Están en el HTML; reutilizalos.

---

## 5. Estructura de secciones (layout + contenido exacto)

Contenedor base `.wrap{max-width:1480px;margin-inline:auto;padding-inline:var(--pad)}`.

### 5.1 Top bar / Nav  (`.nav`, fixed, `mix-blend-mode:difference`)
- Izquierda: **logo Plasmart** (img, 26px) link a `#top`.
- Centro: links `Aplicaciones · Capacidades · Proyectos · Contacto` (ocultos < 900px).
- Derecha: link **“Presupuesto ↗”** (mono, subrayado índigo) a WhatsApp (oculto < 560px).
- Barra de progreso de scroll: `.progress` fixed top, 2px, `background:var(--accent)`, ancho = % scrolleado.
- **NO** hay selector de versiones (se eliminó; quedamos sólo con esta versión).

### 5.2 Hero (`#top.hero`, `min-height:100svh`, contenido alineado abajo)
- Fondo: `<video>` (ver §6.3) con overlay degradado para legibilidad + grilla/glow.
- Kicker mono arriba: `● Córdoba · AR — Desde 2006` (el `●` es un dot índigo con glow) y a la
  derecha `Nº/ 03 — SIGNAL`.
- **H1** (3 líneas, mayúscula/minúscula, weight 200):
  “**Precisión y / tecnología en / corte de acero**”, con **“corte de acero” en color `--accent`**.
- CTAs (`.hero-cta`): **“Pedí tu presupuesto →”** (botón sólido) + **“Descargar catálogo ↓”**
  (botón outline). Ambos con efecto **magnético** (ver §6.7) y “fill” índigo que sube en hover.
  - *Catálogo:* hoy el botón abre WhatsApp con texto pidiendo el catálogo. **Cuando el cliente
    entregue el PDF, cambiá el `href` por la descarga directa del PDF** (`download`).
- Pie: línea mono (servicios) + indicador “Scroll” con barrita animada.

### 5.3 Manifiesto (`.mani`)
- Un párrafo grande (weight 200). Cada palabra va en `<span class="w">`. **Las palabras arrancan en
  gris (`--faint`) y se vuelven blancas a medida que scrolleás** (scrub). Las últimas (`"con
  precisión absoluta"`) tienen `.accent` y terminan en índigo.
- Texto: “Unimos ingeniería y diseño para fabricar exactamente la pieza que tu proyecto necesita.
  **Con precisión absoluta.**”

### 5.4 Aplicaciones (`#aplicaciones`) — **acordeón automático**
- 3 paneles horizontales (Arquitectura / Industria / Paneles decorativos). El **activo se expande**
  (flex‑grow 1→4.4, transición .8s `--ease`) mostrando imagen a color + título (weight 200) +
  párrafo + link; los inactivos quedan angostos con **etiqueta vertical** (`writing-mode:vertical-rl`)
  y la imagen en grayscale/oscurecida.
- **Auto‑rotación** cada **5200 ms** con **barra de progreso** índigo abajo. Hover/tap fija un panel
  y pausa; al salir, retoma.
- En **mobile (<760px)** se apila vertical: paneles de 84px que crecen a 380px al activarse; etiqueta
  pasa a horizontal.
- Copys:
  - **Arquitectura** — “Fachadas, cerramientos y escaleras que vuelven único un espacio, combinando
    tecnología de corte y diseño contemporáneo.” → link “Diseñemos tu fachada”.
  - **Industria** — “Corte y plegado de alta precisión para producción industrial, con procesos
    consistentes y más de 20 años de oficio.” → “Cotizar producción”.
  - **Paneles decorativos** — “Paños decorativos que elevan el estilo de cualquier ambiente, con una
    dosis de creatividad y modernidad, interior o exterior.” → “Ver proyectos”.

### 5.5 Capacidades (`#capacidades`) — lista
- Encabezado `Capacidades` + mono `[ 06 procesos · planta propia ]`.
- 6 filas (`.cap-row`), grid `70px auto 1fr auto`: índice mono · **nombre grande** · **descripción** ·
  spec mono a la derecha. Al pasar la línea: aparece una marca índigo a la izquierda, el nombre
  pasa de `--muted` a `--text`, y la fila se indenta 28px.
- **Comportamiento de la descripción (IMPORTANTE):**
  - **Desktop:** la descripción (`.cdesc`) está **dentro de la misma fila** (columna `1fr` del medio),
    oculta (`opacity:0`); **aparece al hacer hover y QUEDA visible** (clase `.seen`, persiste mientras
    seguís scrolleando). *No* es un tooltip flotante.
  - **Mobile (<760px):** la fila se vuelve **acordeón**: la descripción colapsada (`max-height:0`);
    **tap** en la fila la expande (cerrando las demás). Hay un indicador **“+”** (`.cap-plus`) que rota
    45° (a “×”) cuando está abierta.
- Filas (nombre · spec · descripción):
  1. **Corte láser** · `↳ hasta 12,7 mm` · “Tecnología avanzada para cortes finos y detallados en
     acero, garantizando máxima calidad y exactitud hasta 12,7 mm.”
  2. **Corte plasma** · `↳ hasta 32 mm` · “Trabajamos con materiales de calidad en espesores hasta 32 mm.”
  3. **Plegado CNC** · `↳ hasta 3 m` · “Máxima precisión en plegados de hasta 3 metros.”
  4. **Metalúrgica general** · `↳ servicios integrales` · “20 años de experiencia en acero,
     resolviendo tu proyecto de punta a punta.”
  5. **Asesoramiento** · `↳ a medida` · “Diseñadores a tu disposición para darle un toque único a tu
     espacio.”
  6. **Envíos al país** · `↳ logística nacional` · “Coordinamos con las mejores empresas de transporte
     para hacerte llegar tu producto.”
- **Stats** (debajo, grid 4 col / 2 col mobile), con **contador animado** al entrar en viewport:
  **20+ años** · **12,7 mm** (láser) · **32 mm** (plasma) · **3 m** (plegado). Formato es‑AR (coma decimal).

### 5.6 Proyectos de nuestros clientes (`#trabajo.work`)
- Encabezado `Proyectos de / nuestros clientes` + mono `18 registros`.
- **Desktop:** **grid de 3 columnas** (`.work-grid`) con **parallax por columna** (cada `.wg-col`
  se desplaza en Y a distinta velocidad según `data-speed`, atado al scroll con `scrub`). La columna
  del medio arranca offset hacia abajo. Cada tarjeta (`.wcard`) **se revela** (fade‑up) al entrar.
  - Tarjeta: imagen `aspect-ratio:4/5`, radius 4px, **grayscale que se quita en hover** + leve zoom;
    debajo, **sólo número + apellido** (p. ej. `01 · Gómez`). **NO** mostrar tipo de obra.
  - Distribución (interleaved) col1: 01,04,07,10,13,16 · col2: 02,05,08,11,14,17 · col3: 03,06,09,12,15,18.
    `data-speed` usados: col1 `0.06`, col2 `0.16`, col3 `0.02`. (18 proyectos, 6 por columna.)
- **Mobile (<760px):** se oculta el grid y se muestra un **carrusel auto‑rotativo** (`.work-mobile`,
  generado por JS a partir de las mismas tarjetas, ordenado por número): una imagen grande
  `aspect-ratio:3/4` con **crossfade** entre proyectos + leve **Ken Burns** (zoom), nombre + índice
  `NN / 18`, **barra de progreso** y **dots**. Auto‑avanza cada **3400 ms**; tap en la imagen o en un
  dot avanza/salta. Sólo corre el timer si el viewport es mobile.
- 18 proyectos (número · apellido): 01 Gómez · 02 Arévalo · 03 Follis · 04 Campi · 05 Bianchi ·
  06 Pérez · 07 Arrutia · 08 Marchetti · 09 López · 10 Uano · 11 Benavidez · 12 Plasmart · 13 López · 14 Gutierrez · 15 Amadeo · 16 Guinea · 17 Soto · 18 Aspitia.

### 5.7 Contacto (`#contacto.contact`, centrado)
- Kicker `● Hablemos de tu proyecto`.
- H2 gigante (weight 200): “Construyamos / algo **preciso.**” (“preciso.” en índigo).
- CTAs: **“Pedí tu presupuesto”** (sólido, a WhatsApp) + **“Escribinos un mail”** (outline →
  **abre un modal**, ver §6.8). Ambos magnéticos.
- Línea mono de datos: **WA (351) 382 0321** · **ventasplasmart@transfil.com.ar** ·
  Francisco de Arteaga 2895, Córdoba · Lun–Vie 08–17 h.

### 5.8 Footer (`.foot`)
- **Marquee** infinito arriba: “Pedí tu presupuesto → Corte de acero → Córdoba · AR →” (loop).
- **Logo Plasmart** grande (img) + 2 columnas de links (Índice, Seguinos). **Sin** columna “Versiones”.
- Bottom: © 2026 Plasmart · ubicación.

### 5.9 WhatsApp flotante (global)
- `.wa-float` fixed abajo‑derecha (58px, círculo, borde `--line-2`, icono WhatsApp, **dot verde
  `#25d366`** arriba‑derecha). Hover: se llena de índigo y sube. Link a `https://wa.me/5493513820321`.
  Visible en **todo** el sitio (desktop y mobile).

---

## 6. Animaciones e interacciones (detalle por detalle)

> Easing por defecto en CSS: `--ease: cubic-bezier(.19,1,.22,1)`. En GSAP se usan `power2/3/4.out`,
> `expo.inOut`, `power3`. Respetá las **duraciones** y **triggers** indicados.

### 6.1 Sistema de “reveal” (anti‑flash + degradación)
- Un `<script>` en `<head>` agrega `html.lib-on` **sólo si** `window.gsap` existe y NO hay
  reduced‑motion. El CSS oculta los elementos a animar **únicamente** bajo `html.lib-on`:
  `[data-rv]{opacity:0}`, `[data-rv="up"]{transform:translateY(40px)}`, `[data-clip]{clip-path:inset(100% 0 0 0)}`.
- Con GSAP presente: por cada `[data-rv]` → `gsap.to(el,{opacity:1,y:0,duration:1,ease:'power3.out',
  scrollTrigger:{trigger:el,start:'top 86%'}})`. Por cada `[data-clip]` → animar `clip-path` a
  `inset(0% 0 0 0)` (`start:'top 84%'`).
- **Failsafe** (porque iframes en background “congelan” rAF): a ~2.5–4 s, forzar visibles los
  `[data-rv]` que aún estén ocultos, y “snapear” contadores a su valor final. Reimplementá esto.

### 6.2 Loader
- Overlay full‑screen negro con número gigante que **cuenta 0→100** (~1.7 s, easing cúbico) y una
  barra inferior que se llena. Al terminar, sale hacia arriba con `gsap.to(loader,{yPercent:-100,
  duration:1, ease:'expo.inOut'})` y se elimina. **Hard fallback** a 2.6 s (siempre se va, aunque algo falle).

### 6.3 Hero — titular + video
- **Titular (máscara por línea):** cada línea es `.ln-mask{overflow:hidden}` con `.ln-in{display:block}`.
  Timeline de entrada (tras el loader): `tl.from('.ln-in',{yPercent:115,duration:1.1,ease:'power4.out',
  stagger:.1})`, luego `.hero-top`, `.hero-cta` y `.hero-foot` con `opacity/y` escalonado.
  (No requiere SplitType.)
- **Video crossfade (loop sin corte):** **dos** `<video>` apilados con la misma fuente. Se reproduce
  uno (opacity .40); ~1.1 s antes de terminar, arranca el otro desde 0 y se **cruza** la opacidad
  (fade .9 s). Así el loop no “salta”. (Atributos: `autoplay muted loop playsinline`; igualmente se
  hace `.play()` en `pointerdown`/`scroll` por políticas de autoplay.)

### 6.4 Manifiesto (scrub de palabras)
- `gsap.to('.mani .w:not(.accent)',{color:'#eef0f3',stagger:.5,ease:'none',scrollTrigger:{trigger:'.mani',
  start:'top 80%',end:'bottom 60%',scrub:.6}})` y otro tween para `.accent` → `#6e7bff`.

### 6.5 Aplicaciones (acordeón)
- Estado `is-active` controla `flex-grow` (transición `.8s var(--ease)`), opacidad del cuerpo, y la
  imagen (grayscale/scale). `setInterval` 5200 ms avanza; barra `.acc3-prog` se llena vía transición
  `width 5200ms linear`. `mouseenter` en un panel → pausa + activa ese; `mouseleave` del contenedor → reanuda.

### 6.6 Capacidades
- Desktop: `mouseenter` en `.cap-row` → `.cdesc.add('seen')` (persistente) + CSS `:hover .cdesc{opacity:1}`.
- Mobile: `click` → toggle `.open` (cierra hermanas); CSS anima `max-height`/`opacity` y rota el `+`.
- Stats: contador con rAF; formato `toLocaleString('es-AR')` para enteros y coma decimal para 12,7.

### 6.7 Botones magnéticos
- En `[data-magnet]`: en `mousemove`, trasladar el botón hacia el cursor con factor **.4** usando
  `gsap.quickTo(el,'x'/'y',{duration:.5,ease:'power3'})`; en `mouseleave`, volver a 0.
- Visual: cada botón tiene un `<span class="fill">` que sube (translateY 101%→0) en hover (relleno índigo).

### 6.8 Modal “Escribinos un mail”
- Trigger `[data-modal="mail"]`. Abre `.modal.open` (fade del fondo blur + card que sube/escala).
  Campos: Nombre, Email, Teléfono, “Tu proyecto”. Inputs minimalistas (sin caja, sólo borde inferior
  que se vuelve índigo en focus).
- Al abrir: `lenis.stop()` + `body.overflow:hidden` + focus al primer input. Cierra con **✕**, click
  en backdrop o **Esc**. En `submit`: arma un `mailto:ventasplasmart@transfil.com.ar` con asunto/cuerpo
  desde los campos (sin backend) y cierra. *(Si hay backend disponible en el proyecto, reemplazá el
  `mailto` por un POST al endpoint de contacto.)*

### 6.9 Cursor custom + barra de progreso
- En punteros finos (no touch) y sin reduced‑motion: anillo (30px, `mix-blend-mode:difference`) que
  sigue al cursor con `gsap.quickTo` + un punto. Se agranda (`.hot`) sobre `a, button, .btn, .cap-row,
  .wcard, .arrow-link`. **Inputs/textarea** vuelven a cursor `text`. Ocultar todo el sistema en touch
  y en reduced‑motion.
- `.progress` (top, 2px índigo) refleja el % de scroll (vía evento de Lenis y/o `scroll`).

### 6.10 Parallax de proyectos (desktop)
- Por cada `.wg-col`: `gsap.to(col,{y:()=> -dataSpeed*window.innerHeight, ease:'none',
  scrollTrigger:{trigger:'.work',start:'top bottom',end:'bottom top',scrub:1,invalidateOnRefresh:true}})`.

### 6.11 Breakpoints
- **≤ 900px:** se ocultan los links centrales del nav.
- **≤ 760px:** Aplicaciones apila; Capacidades pasa a acordeón; Proyectos cambia grid→carrusel;
  stats 2 columnas; cursor custom off (touch).
- **≤ 560px:** se oculta el “Presupuesto ↗” del nav (queda el WhatsApp flotante).

---

## 7. Datos de contacto (verificados)
- **WhatsApp/Tel:** (351) 382 0321 → `https://wa.me/5493513820321`
- **Email:** **ventasplasmart@transfil.com.ar**
- **Dirección:** Francisco de Arteaga 2895, Córdoba, Argentina
- **Horario:** Lun a Vie, 08–17 h
- **Instagram:** https://www.instagram.com/plasmart_cba · **Facebook:** https://www.facebook.com/plasmartCba/

---

## 8. Archivos incluidos en este zip
- `index.html` — markup completo de la página (todas las secciones).
- `v3.css` — sistema visual + todas las animaciones/estados (≈ fuente de verdad del estilo).
- `v3.js` — Lenis+GSAP wiring, loader, reveals, scrub, acordeón, grid parallax, carrusel mobile,
  cursor, magnético, modal, video crossfade. (Vanilla, sin build.)
- `mobile.html` + `ios-frame.jsx` — **sólo para previsualizar** el sitio dentro de un iPhone (no es
  parte del producto; es una herramienta de review). `ios-frame.jsx` necesita React + Babel (ver el head de `mobile.html`).
- `assets/transfil-hero-light.mp4` — video del hero.
- `assets/proj-lopez.jpg`, `proj-gutierrez.jpg`, `proj-amadeo.jpg`, `proj-guinea.jpg`, `proj-soto.jpg`, `proj-aspitia.jpg` — 6 fotos de proyectos provistas por el cliente (las otras 12 son URLs externas).

### Cómo correrlo tal cual (sitio estático)
Serví la carpeta con cualquier server estático (las fuentes/CDN cargan de internet):
```
npx serve .      # o: python3 -m http.server
```
Abrí `index.html`. (El video y las fuentes necesitan estar servidos por http, no `file://`.)

---

## 9. Checklist de “quedó igual”
- [ ] Smooth scroll (Lenis) activo; ScrollTrigger sincronizado.
- [ ] Loader 0→100 y salida; nunca queda pegado.
- [ ] Hero: titular revela por líneas; video en loop **sin corte**; “corte de acero” en índigo.
- [ ] Manifiesto: palabras gris→blanco con el scroll.
- [ ] Aplicaciones: acordeón auto‑rotando con barra de progreso (apila en mobile).
- [ ] Capacidades: hover revela descripción **en la fila** y queda; en mobile es acordeón con “+”.
- [ ] Stats cuentan (20 / 12,7 / 32 / 3) con coma decimal.
- [ ] Proyectos: **grid + parallax** en desktop, **carrusel** en mobile; sólo número + apellido.
- [ ] Botones magnéticos + relleno índigo en hover.
- [ ] Modal de mail abre/cierra (✕/Esc/backdrop) y arma el `mailto`.
- [ ] WhatsApp flotante en todas las vistas.
- [ ] `prefers-reduced-motion` respetado; sin librerías “fantasma” (UX IX MAX PRO/Context).
