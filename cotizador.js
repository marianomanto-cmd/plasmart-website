/* ============================================================
   PLASMART — Estimador de corte laser

   Da un numero orientativo y lo manda al vendedor por WhatsApp con los
   importes ya calculados, para que las dos partes arranquen con parte
   del trabajo hecho.

   NO es un presupuesto. Un humano confirma plano, nesting y material.

   Los precios NO estan aca: salen de /api/tarifa, que los lee de
   Plasmart OT. Si el endpoint no responde, el estimador pasa a modo
   "consultar" y no muestra ningun numero.

   El IVA NO se calcula: se suma al presupuesto final, despues de hablar
   con el vendedor. El flete tampoco aparece.

   Vive en /cotizador/, que es una pagina propia y no un modal: con
   multi-item y la vista de chapa no entra en una ventanita.
   ============================================================ */
(function () {
  'use strict';

  var WA = '5493513820321';
  var DENSIDAD = 7850;              // fallback si /api/tarifa no llega
  var MATERIAL = 'Chapa negra';     // el sitio solo estima negra

  /* Nesting: margen al borde y separacion entre piezas, en mm. Son los
     mismos valores del cotizador interno. */
  var MARGEN_MM = 10;
  var SEPARACION_MM = 5;

  /* Un color por item para poder distinguirlos en la chapa. Arranca por el
     acento del sitio y sigue con tonos que se leen sobre el fondo oscuro. */
  var COLORES = ['#6e7bff', '#5fd0e0', '#e8a45c', '#5cb98a', '#e8798c', '#b39ddb'];

  var CHAPAS = [
    { key: '1200x2400', label: '1200 × 2400 mm', largo: 2400, ancho: 1200 },
    { key: '1250x2500', label: '1250 × 2500 mm', largo: 2500, ancho: 1250 },
    { key: '1000x2000', label: '1000 × 2000 mm', largo: 2000, ancho: 1000 },
    { key: '1500x3000', label: '1500 × 3000 mm', largo: 3000, ancho: 1500 }
  ];

  var tarifa = null;                // lo que devuelve /api/tarifa
  var tarifaDiag = null;            // por que no hay precio, si no lo hay
  var cargando = false;
  var enEspera = [];
  var uid = 1;

  /* ---------- helpers ---------- */
  function num(v) { var n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; }
  function esc(s) { return String(s).replace(/[<>&"]/g, function (c) {
    return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); }
  function money(n) {
    return isFinite(n) ? n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }) : '—';
  }
  function kg(n) { return n.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' kg'; }
  function mm(v) { return num(v).toLocaleString('es-AR', { maximumFractionDigits: 1 }); }
  function track(ev, extra) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Object.assign({ event: ev }, extra || {}));
  }
  function chapaDe(key) {
    for (var i = 0; i < CHAPAS.length; i++) if (CHAPAS[i].key === key) return CHAPAS[i];
    return CHAPAS[0];
  }

  /* ---------- nesting del pedido ----------
     Portado del modo avanzado del cotizador interno. En vez de apilar filas
     fijas, la chapa se representa como una lista de rectangulos libres que
     se van partiendo cada vez que se coloca algo. En cada paso se evalua,
     entre TODOS los rectangulos libres y TODOS los items pendientes (en sus
     dos orientaciones), cual combinacion aprovecha mas area, sin importar
     el orden en que se cargaron. Asi se reaprovechan los huecos que quedan
     al costado o debajo de lo ya ubicado.

     Sigue siendo una heuristica — el nesting rectangular optimo es
     NP-dificil — y esta pensada para presupuestar, no como trayectoria de
     corte. Por eso la pantalla lo dice. */
  function nestGrupo(entradas, chapa) {
    var usableL = Math.max(0, chapa.largo - 2 * MARGEN_MM);
    var usableW = Math.max(0, chapa.ancho - 2 * MARGEN_MM);
    var gap = SEPARACION_MM;
    var noEntra = [];

    var pend = entradas.filter(function (e) { return e.cantidad > 0; }).map(function (e) {
      return { id: e.id, color: e.color, ancho: e.ancho, largo: e.largo, restante: e.cantidad };
    });
    pend.forEach(function (e) {
      var ok = (e.ancho <= usableL && e.largo <= usableW) || (e.largo <= usableL && e.ancho <= usableW);
      if (!ok) { noEntra.push(e.id); e.restante = 0; }
    });

    /* Cuantas piezas entran en el hueco. Si lo que queda del pedido no llena
       la grilla, se reservan solo filas completas (o una fila parcial), asi
       el rectangulo ocupado es exactamente el usado y el resto queda libre
       de verdad para otro item. */
    function fitCount(fr, pw, ph, restante) {
      if (pw <= 0 || ph <= 0 || pw > fr.w + 0.01 || ph > fr.h + 0.01) return null;
      var nx = Math.max(1, Math.floor((fr.w + gap) / (pw + gap)));
      var ny = Math.max(1, Math.floor((fr.h + gap) / (ph + gap)));
      var filas = Math.min(ny, Math.floor(restante / nx));
      if (filas >= 1) {
        return { nx: nx, ny: filas, count: nx * filas,
                 w: nx * pw + (nx - 1) * gap, h: filas * ph + (filas - 1) * gap };
      }
      var count = Math.min(restante, nx);
      if (count <= 0) return null;
      return { nx: count, ny: 1, count: count, w: count * pw + (count - 1) * gap, h: ph };
    }

    /* Parte un hueco en lo que sobra alrededor de lo recien colocado. */
    function partir(fr, puesto) {
      var ix = Math.max(fr.x, puesto.x), iy = Math.max(fr.y, puesto.y);
      var iw = Math.min(fr.x + fr.w, puesto.x + puesto.w) - ix;
      var ih = Math.min(fr.y + fr.h, puesto.y + puesto.h) - iy;
      if (iw <= 1e-6 || ih <= 1e-6) return [fr];
      var out = [];
      if (puesto.x > fr.x) out.push({ x: fr.x, y: fr.y, w: puesto.x - fr.x, h: fr.h });
      if (puesto.x + puesto.w < fr.x + fr.w)
        out.push({ x: puesto.x + puesto.w, y: fr.y, w: fr.x + fr.w - (puesto.x + puesto.w), h: fr.h });
      if (puesto.y > fr.y) out.push({ x: fr.x, y: fr.y, w: fr.w, h: puesto.y - fr.y });
      if (puesto.y + puesto.h < fr.y + fr.h)
        out.push({ x: fr.x, y: puesto.y + puesto.h, w: fr.w, h: fr.y + fr.h - (puesto.y + puesto.h) });
      return out.filter(function (r) { return r.w > 0.5 && r.h > 0.5; });
    }

    function dentro(a, b) {
      return a.x >= b.x - 0.01 && a.y >= b.y - 0.01 &&
             a.x + a.w <= b.x + b.w + 0.01 && a.y + a.h <= b.y + b.h + 0.01;
    }
    function podar(lista) {
      var out = [];
      for (var i = 0; i < lista.length; i++) {
        var red = false;
        for (var j = 0; j < lista.length; j++) {
          if (i === j) continue;
          if (dentro(lista[i], lista[j]) && (i > j || !dentro(lista[j], lista[i]))) { red = true; break; }
        }
        if (!red) out.push(lista[i]);
      }
      return out;
    }

    var chapas = [];
    var guardaG = 0;
    while (pend.some(function (e) { return e.restante > 0; }) && guardaG < 200) {
      guardaG++;
      var act = { libres: [{ x: 0, y: 0, w: usableL, h: usableW }], puestos: [] };
      chapas.push(act);
      var guardaC = 0;
      while (guardaC < 2000) {
        guardaC++;
        var mejor = null;
        act.libres.forEach(function (fr, frIdx) {
          pend.forEach(function (e) {
            if (e.restante <= 0) return;
            [{ pw: e.ancho, ph: e.largo }, { pw: e.largo, ph: e.ancho }].forEach(function (o) {
              var fit = fitCount(fr, o.pw, o.ph, e.restante);
              if (!fit) return;
              var area = fit.count * o.pw * o.ph;
              if (!mejor || area > mejor.area) mejor = { frIdx: frIdx, e: e, pw: o.pw, ph: o.ph, fit: fit, area: area };
            });
          });
        });
        if (!mejor) break;
        var fr0 = act.libres[mejor.frIdx];
        var puesto = { x: fr0.x, y: fr0.y, w: mejor.fit.w, h: mejor.fit.h };
        act.puestos.push({ id: mejor.e.id, color: mejor.e.color, x: fr0.x, y: fr0.y,
                           nx: mejor.fit.nx, ny: mejor.fit.ny, pw: mejor.pw, ph: mejor.ph, count: mejor.fit.count });
        var sig = [];
        act.libres.forEach(function (f) { sig = sig.concat(partir(f, puesto)); });
        act.libres = podar(sig);
        mejor.e.restante -= mejor.fit.count;
      }
    }
    pend.forEach(function (e) { if (e.restante > 0 && noEntra.indexOf(e.id) < 0) noEntra.push(e.id); });

    var areaChapaM2 = (chapa.largo * chapa.ancho) / 1e6;
    return {
      chapa: chapa,
      puestosPorChapa: chapas.map(function (c) { return c.puestos; }),
      chapas: chapas.length,
      aprovechamiento: chapas.map(function (c) {
        var usada = c.puestos.reduce(function (a, p) { return a + (p.count * p.pw * p.ph) / 1e6; }, 0);
        return areaChapaM2 > 0 ? (usada / areaChapaM2) * 100 : 0;
      }),
      noEntra: noEntra
    };
  }

  /* ---------- estado ---------- */
  function nuevoItem() {
    return {
      id: uid++,
      espesor: 3,
      modo: 'medidas',            // 'medidas' | 'm2' | 'dxf'
      ancho: 400, largo: 250, m2: 1,
      cantidad: 10,
      plegado: false, pliegues: 2,
      dxfNombre: null, dxfOk: false, dxfMotivos: null, dxfLeyendo: false
    };
  }
  function nuevoEstado() {
    var it = nuevoItem();
    return {
      paso: 1,
      items: [it],
      chapa: '1200x2400',      // la chapa es del pedido: se nestean todos juntos
      abierto: it.id,             // acordeon: un item editable por vez
      nombre: '', telefono: '', email: '', ciudad: '',
      tocado: false,
      ref: 'EST-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' +
           String(Date.now()).slice(-4)
    };
  }

  /* ---------- calculo de un item ----------
     Peso = superficie x espesor x densidad x cantidad. El precio es
     peso x $/kg y nada mas: el plegado NO esta contemplado, lo suma el
     vendedor. El IVA tampoco: va despues de la consulta.

     El nesting es el mismo del cotizador interno: cuantas piezas entran
     en una chapa acomodadas en grilla, probando las dos orientaciones y
     quedandose con la mejor. Es una estimacion: el nesting real anida
     piezas distintas y aprovecha mas. */
  function calcItem(it) {
    var esM2 = it.modo === 'm2';
    var anchoP = esM2 ? 0 : num(it.ancho);
    var largoP = esM2 ? 0 : num(it.largo);
    var areaPieza = esM2 ? num(it.m2) : (anchoP * largoP) / 1e6;
    var cant = Math.max(1, Math.floor(num(it.cantidad)) || 1);
    var dens = (tarifa && tarifa.densidad) || DENSIDAD;
    var peso = areaPieza * (num(it.espesor) / 1000) * dens * cant;

    var revision = it.modo === 'dxf' && !!it.dxfMotivos;
    var precioKg = tarifa && tarifa.precio_kg_sin_iva;
    var sinPrecio = revision || !precioKg || !(peso > 0);

    var m = {
      id: it.id, cantidad: cant, areaPieza: areaPieza, peso: peso,
      anchoP: anchoP, largoP: largoP, esM2: esM2,
      revision: revision, sinPrecio: sinPrecio
    };

    /* Medidas rectangulares utiles para el nesting del pedido. Por m² no
       sabemos la forma, asi que ese item no se dibuja: mejor no mostrar
       nada que mostrar una pieza inventada. */
    m.nesteable = !esM2 && anchoP > 0 && largoP > 0 && !revision;

    if (sinPrecio) return m;

    var bruto = peso * precioKg;
    var minItem = (tarifa.minimo_item_sin_iva || 0);
    m.bruto = bruto;
    m.minimoItem = bruto < minItem;
    m.subtotal = m.minimoItem ? minItem : bruto;
    m.precioKg = precioKg;
    return m;
  }

  /* Totales del pedido: suma de los items mas el minimo por pedido. */
  function calcTotal(st) {
    var ms = st.items.map(calcItem);
    var algunoSinPrecio = ms.some(function (m) { return m.sinPrecio; });
    var t = {
      items: ms,
      peso: ms.reduce(function (a, m) { return a + m.peso; }, 0),
      sinPrecio: algunoSinPrecio,
      revision: ms.some(function (m) { return m.revision; })
    };

    /* Todas las piezas rectangulares del pedido van a la misma chapa: es la
       unica forma de que el aprovechamiento se parezca al real, porque el
       nesting de verdad mezcla items. */
    var entradas = [];
    ms.forEach(function (m, i) {
      if (!m.nesteable) return;
      entradas.push({ id: m.id, color: COLORES[i % COLORES.length],
                      ancho: m.anchoP, largo: m.largoP, cantidad: m.cantidad });
    });
    t.nest = entradas.length ? nestGrupo(entradas, chapaDe(st.chapa)) : null;
    t.chapas = t.nest ? t.nest.chapas : 0;
    if (algunoSinPrecio) return t;

    var suma = ms.reduce(function (a, m) { return a + m.subtotal; }, 0);
    var minPedido = (tarifa.minimo_pedido_sin_iva || 0);
    t.suma = suma;
    t.minimoPedido = suma < minPedido;
    t.total = t.minimoPedido ? minPedido : suma;
    t.minimoPedidoMonto = minPedido;
    t.precioKg = tarifa.precio_kg_sin_iva;
    return t;
  }

  /* ---------- validaciones ---------- */
  function faltaItem(it) {
    var f = [];
    if (it.modo === 'medidas' && !(num(it.ancho) > 0 && num(it.largo) > 0)) f.push('el ancho y el largo');
    if (it.modo === 'm2' && !(num(it.m2) > 0)) f.push('la superficie por pieza');
    if (it.modo === 'dxf' && !it.dxfNombre) f.push('el archivo DXF');
    if (!(Math.floor(num(it.cantidad)) >= 1)) f.push('una cantidad de 1 o más');
    return f;
  }
  function faltaPiezas(st) {
    for (var i = 0; i < st.items.length; i++) {
      var f = faltaItem(st.items[i]);
      if (f.length) return { idx: i, falta: f };
    }
    return null;
  }
  /* Sin nombre + (telefono o email) + ciudad no se muestra el total. */
  function falta(st) {
    var f = [];
    if (!st.nombre.trim()) f.push('tu nombre');
    if (!st.telefono.trim() && !st.email.trim()) f.push('un telefono o un email');
    if (!st.ciudad.trim()) f.push('la ciudad de entrega');
    return f;
  }

  /* ---------- mensaje de WhatsApp ----------
     Parseable, no literario: el vendedor tiene que poder leerlo de un
     vistazo y responder, no descifrarlo. */
  function waMessage(st, t) {
    var L = [];
    L.push('ESTIMADO WEB · Plasmart');
    L.push('Ref: ' + st.ref);
    L.push('');
    L.push('— Contacto —');
    L.push('Nombre: ' + st.nombre.trim());
    if (st.telefono.trim()) L.push('Telefono: ' + st.telefono.trim());
    if (st.email.trim()) L.push('Email: ' + st.email.trim());
    L.push('Ciudad: ' + st.ciudad.trim());
    L.push('');

    st.items.forEach(function (it, i) {
      var m = t.items[i];
      L.push('— Item ' + (i + 1) + ' —');
      L.push('Material: ' + MATERIAL + ', espesor ' + it.espesor + ' mm');
      if (it.modo === 'm2') {
        L.push('Superficie: ' + mm(it.m2) + ' m2 por pieza');
      } else if (it.modo === 'dxf') {
        L.push('Plano: ' + (it.dxfNombre || '—'));
        if (it.dxfOk) L.push('Medidas leidas del plano: ' + mm(it.ancho) + ' x ' + mm(it.largo) + ' mm');
      } else {
        L.push('Medidas: ' + mm(it.ancho) + ' x ' + mm(it.largo) + ' mm');
      }
      L.push('Cantidad: ' + m.cantidad + ' u');
      L.push('Plegado: ' + (it.plegado
        ? 'si, ' + Math.max(1, Math.floor(num(it.pliegues)) || 1) + ' pliegues (NO incluido en el precio)'
        : 'no'));
      L.push('Peso estimado: ' + kg(m.peso));
      if (m.revision) {
        L.push('*** REQUIERE REVISION DE PLANO ***');
        (it.dxfMotivos || []).forEach(function (mot) { L.push('- ' + mot); });
      }
      if (!t.sinPrecio && m.subtotal) {
        L.push('Subtotal: ' + money(m.subtotal) + (m.minimoItem ? ' (minimo por item)' : ''));
      }
      L.push('');
    });

    L.push('— Estimado —');
    L.push('Peso total: ' + kg(t.peso));
    if (t.nest && t.nest.chapas) {
      var prom = t.nest.aprovechamiento.reduce(function (a, v) { return a + v; }, 0) / t.nest.aprovechamiento.length;
      L.push('Nesting estimado: ' + t.nest.chapas + ' chapa(s) de ' + t.nest.chapa.label +
             ' · ' + Math.round(prom) + '% de aprovechamiento promedio');
      if (t.nest.noEntra.length) L.push('OJO: hay piezas que no entran en esa chapa.');
    }
    if (t.revision) {
      L.push('NO SE CALCULO PRECIO: hay un plano que requiere revision.');
    } else if (t.sinPrecio) {
      L.push('SIN PRECIO: la tarifa no estaba disponible. A cotizar por el vendedor.');
    } else {
      L.push('$/kg aplicado: ' + Math.round(t.precioKg).toLocaleString('es-AR') +
             (tarifa.vigencia ? '  (tarifa al ' + tarifa.vigencia + ')' : ''));
      if (t.minimoPedido) L.push('Se aplico el minimo por pedido (' + money(t.minimoPedidoMonto) + ')');
      L.push('TOTAL: ' + money(t.total));
      L.push('IVA NO incluido: se agrega al presupuesto final.');
    }
    L.push('');
    L.push('Precio orientativo. No es un presupuesto cerrado.');
    return L.join('\n');
  }

  /* ---------- carga de tarifa ----------
     Si el modal se abre, se cierra y se reabre antes de que responda la
     API, el segundo mount espera al mismo fetch en vez de pintar "sin
     precio" con tarifa vacia. */
  function cargarTarifa(cb) {
    if (tarifa) { cb(); return; }
    enEspera.push(cb);
    if (cargando) return;
    cargando = true;
    /* El mes en la URL no es un truco anti-cache al azar: la tarifa cambia
       una vez por mes, asi que esa es su clave natural. */
    var mes = new Date().toISOString().slice(0, 7);
    fetch('/api/tarifa?m=' + mes)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (t) {
        tarifa = t;
        tarifaDiag = t && t.precio_kg_sin_iva
          ? null
          : 'la tarifa llego sin precio' + (t && t.motivo ? ' (' + t.motivo + ')' : '');
      })
      .catch(function (e) {
        tarifa = { precio_kg_sin_iva: null };
        tarifaDiag = 'no se pudo leer la tarifa: ' + String(e && e.message || e) +
                     ' · desde ' + location.origin;
      })
      .then(function () {
        cargando = false;
        var fns = enEspera; enEspera = [];
        fns.forEach(function (fn) { fn(); });
      });
  }

  /* ---------- lector de DXF (se baja recien al elegir el modo) ---------- */
  function cargarDxf(cb) {
    if (window.PlasmartDxf) { cb(true); return; }
    var js = document.createElement('script');
    js.src = '/dxf-check.js';
    js.onload = function () { cb(true); };
    js.onerror = function () { cb(false); };
    document.body.appendChild(js);
  }

  /* ---------- dibujo de las chapas ----------
     Cada chapa a escala con las piezas donde el nesting las puso. Es la
     misma salida que usa el calculo, asi que lo que se ve es lo que se
     cuenta. Se dibujan hasta MAX_CHAPAS para no volar el DOM en pedidos
     grandes; el resto se resume en una linea. */
  var MAX_CHAPAS = 4;

  function svgChapas(t, items) {
    if (!t.nest || !t.nest.chapas) return '';
    var n = t.nest, ch = n.chapa;
    var h = '<div class="cot-chapas">';

    /* Referencia de colores: sin esto la chapa es un mosaico sin sentido. */
    h += '<div class="cot-legend">';
    items.forEach(function (it, i) {
      var m = t.items[i];
      if (!m.nesteable) return;
      h += '<span class="cot-legend-i"><i style="background:' + COLORES[i % COLORES.length] + '"></i>' +
           'Ítem ' + (i + 1) + '</span>';
    });
    h += '</div>';

    var mostrar = Math.min(n.chapas, MAX_CHAPAS);
    for (var c = 0; c < mostrar; c++) {
      var puestos = n.puestosPorChapa[c] || [];
      var piezas = '';
      puestos.forEach(function (p) {
        var dib = 0;
        for (var r = 0; r < p.ny && dib < p.count; r++) {
          for (var k = 0; k < p.nx && dib < p.count; k++) {
            var x = MARGEN_MM + p.x + k * (p.pw + SEPARACION_MM);
            var y = MARGEN_MM + p.y + r * (p.ph + SEPARACION_MM);
            piezas += '<rect x="' + x + '" y="' + y + '" width="' + p.pw + '" height="' + p.ph +
                      '" fill="' + p.color + '" fill-opacity="0.32" stroke="' + p.color +
                      '" stroke-width="4" />';
            dib++;
          }
        }
      });
      h += '<figure class="cot-chapa">' +
        '<svg viewBox="0 0 ' + ch.largo + ' ' + ch.ancho + '" preserveAspectRatio="xMidYMid meet" ' +
          'role="img" aria-label="Chapa ' + (c + 1) + ' de ' + n.chapas + ', ' +
          Math.round(n.aprovechamiento[c]) + ' por ciento ocupada">' +
          '<rect x="0" y="0" width="' + ch.largo + '" height="' + ch.ancho + '" class="cot-chapa-bg" />' +
          piezas +
        '</svg>' +
        '<figcaption class="cot-chapa-datos mono">' +
          '<span>Chapa ' + (c + 1) + '/' + n.chapas + '</span>' +
          '<span>' + esc(ch.label) + '</span>' +
          '<span>' + Math.round(n.aprovechamiento[c]) + '% ocupado</span>' +
        '</figcaption>' +
      '</figure>';
    }
    if (n.chapas > mostrar) {
      h += '<p class="cot-hint mono">+ ' + (n.chapas - mostrar) + ' chapa(s) más con el mismo criterio.</p>';
    }
    return h + '</div>';
  }

  /* =========================================================
     RENDER
     ========================================================= */
  function mount(root) {
    var st = nuevoEstado();
    root.innerHTML = '<div class="cot-load mono">Cargando…</div>';
    cargarTarifa(function () { pintar(); });

    function pintar() {
      var t = calcTotal(st);
      root.innerHTML =
        head() +
        '<div class="cot-body">' +
          (st.paso === 1 ? paso1() : st.paso === 2 ? paso2() : paso3(t)) +
        '</div>' +
        pie(t);
      wire();
    }

    function head() {
      var titulos = ['Tus piezas', 'Tus datos', 'Tu estimado'];
      var subs = [
        'Chapa negra, corte láser. Podés cargar varias.',
        'Para poder pasarte el número.',
        'Orientativo, para arrancar.'
      ];
      var bar = '';
      for (var i = 1; i <= 3; i++) bar += '<span class="cot-dot' + (i <= st.paso ? ' on' : '') + '"></span>';
      return '<div class="cot-head">' +
        '<div class="cot-steps"><span class="mono">Paso ' + st.paso + '/3</span>' +
        '<div class="cot-bar">' + bar + '</div></div>' +
        '<h2 class="cot-title">' + titulos[st.paso - 1] + '</h2>' +
        '<p class="cot-sub">' + subs[st.paso - 1] + '</p>' +
      '</div>';
    }

    /* ---- Como entra en la chapa ----
       Va en el paso 1 (en vivo, mientras se cargan las piezas) y otra vez
       en el estimado. Ver la ocupacion es lo que engancha: esconderlo
       detras del pedido de datos era desperdiciarlo. */
    function bloqueNesting(t) {
      if (!t.nest || !t.nest.chapas) return '';
      var chapaOpts = CHAPAS.map(function (c) {
        return '<option value="' + c.key + '"' + (st.chapa === c.key ? ' selected' : '') + '>' + c.label + '</option>';
      }).join('');
      var prom = t.nest.aprovechamiento.reduce(function (a, v) { return a + v; }, 0) / t.nest.aprovechamiento.length;
      var h = '<div class="cot-nesting">' +
        '<div class="cot-nesting-hd">' +
          '<div>' +
            '<h3 class="cot-h3">Cómo entra en la chapa</h3>' +
            '<p class="cot-nesting-res mono">' + t.nest.chapas + ' chapa' + (t.nest.chapas === 1 ? '' : 's') +
              ' · ' + Math.round(prom) + '% de aprovechamiento</p>' +
          '</div>' +
          '<div class="mf-row cot-nesting-sel"><label for="cot-chapa">Chapa</label>' +
            '<select id="cot-chapa" class="cot-select">' + chapaOpts + '</select></div>' +
        '</div>' +
        svgChapas(t, st.items) +
        '<p class="cot-note cot-nesting-nota">Es una estimación: el nesting real anida las piezas ' +
        'y suele aprovechar más. Se confirma con los planos antes de producir.</p>' +
      '</div>';
      if (t.nest.noEntra.length) {
        h += '<div class="cot-warn"><b>Hay piezas que no entran en la chapa elegida.</b><br />' +
             'Probá una chapa más grande o consultanos: puede ir en varias partes.</div>';
      }
      return h;
    }

    /* ---- Paso 1: las piezas (acordeon) ---- */
    function paso1() {
      var h = '<div class="cot-items">';
      st.items.forEach(function (it, i) { h += tarjetaItem(it, i); });
      h += '</div>';

      h += '<button type="button" class="cot-add" data-add="1">' +
             '<span aria-hidden="true">+</span> Agregar otra pieza</button>';

      h += bloqueNesting(calcTotal(st));

      h += '<p class="cot-note">El plegado <b>no está incluido</b> en este estimado. ' +
           'Marcalo igual: viaja en la consulta y el vendedor lo suma cuando arme el presupuesto final.</p>';

      var f = st.tocado && faltaPiezas(st);
      if (f) h += '<p class="cot-err" role="alert">En el ítem ' + (f.idx + 1) +
                  ' falta ' + f.falta.join(' y ') + '.</p>';

      h += '<p class="cot-note cot-note-alt">¿Inoxidable, aluminio u otro material? No los estimamos online porque ' +
           'el precio varía mucho según disponibilidad. ' +
           '<a href="/whatsapp/?src=cotizador-material" target="_blank" rel="noopener">Consultanos directo</a>.</p>';
      return h;
    }

    function resumenItem(it) {
      var partes = [esc(it.espesor) + ' mm'];
      if (it.modo === 'm2') partes.push(mm(it.m2) + ' m²');
      else if (it.modo === 'dxf') partes.push(it.dxfNombre ? esc(it.dxfNombre) : 'plano sin cargar');
      else partes.push(mm(it.ancho) + ' × ' + mm(it.largo) + ' mm');
      partes.push(Math.max(1, Math.floor(num(it.cantidad)) || 1) + ' u');
      if (it.plegado) partes.push('plegado');
      return partes.join(' · ');
    }

    function tarjetaItem(it, i) {
      var abierto = st.abierto === it.id;
      var h = '<div class="cot-item' + (abierto ? ' abierto' : '') + '" data-item="' + it.id + '">' +
        '<div class="cot-item-hd">' +
          '<button type="button" class="cot-item-tog" data-toggle="' + it.id + '" aria-expanded="' + abierto + '">' +
            '<span class="cot-item-n mono">Ítem ' + (i + 1) + '</span>' +
            '<span class="cot-item-res">' + resumenItem(it) + '</span>' +
          '</button>' +
          (st.items.length > 1
            ? '<button type="button" class="cot-item-del" data-del="' + it.id + '" ' +
              'aria-label="Quitar ítem ' + (i + 1) + '">✕</button>'
            : '') +
        '</div>';

      if (!abierto) return h + '</div>';

      var esp = (tarifa && tarifa.espesores) || [1.2, 2, 3, 4.75, 6, 9.5];
      var opts = esp.map(function (e) {
        return '<option value="' + e + '"' + (num(it.espesor) === e ? ' selected' : '') + '>' + e + ' mm</option>';
      }).join('');

      h += '<div class="cot-item-body">' +
        '<div class="cot-grid">' +
          '<div class="mf-row"><label for="esp-' + it.id + '">Espesor</label>' +
            '<select id="esp-' + it.id + '" class="cot-select" data-f="espesor" data-id="' + it.id + '">' + opts + '</select></div>' +
          '<div class="mf-row"><label for="cant-' + it.id + '">Cantidad (u)</label>' +
            '<input id="cant-' + it.id + '" type="number" inputmode="numeric" min="1" step="1" ' +
            'data-f="cantidad" data-id="' + it.id + '" value="' + esc(it.cantidad) + '" /></div>' +
        '</div>' +

        '<div class="cot-seg" role="group" aria-label="Cómo das la medida">' +
          '<button type="button" class="cot-segb' + (it.modo === 'medidas' ? ' on' : '') + '" data-modo="medidas" data-id="' + it.id + '">Por medidas</button>' +
          '<button type="button" class="cot-segb' + (it.modo === 'm2' ? ' on' : '') + '" data-modo="m2" data-id="' + it.id + '">Por m²</button>' +
          '<button type="button" class="cot-segb' + (it.modo === 'dxf' ? ' on' : '') + '" data-modo="dxf" data-id="' + it.id + '">Plano DXF</button>' +
        '</div>' +

        (it.modo === 'medidas'
          ? '<div class="cot-grid">' +
              '<div class="mf-row"><label for="an-' + it.id + '">Ancho (mm)</label>' +
                '<input id="an-' + it.id + '" type="number" inputmode="numeric" min="1" ' +
                'data-f="ancho" data-id="' + it.id + '" value="' + esc(it.ancho) + '" /></div>' +
              '<div class="mf-row"><label for="la-' + it.id + '">Largo (mm)</label>' +
                '<input id="la-' + it.id + '" type="number" inputmode="numeric" min="1" ' +
                'data-f="largo" data-id="' + it.id + '" value="' + esc(it.largo) + '" /></div>' +
            '</div>'
          : it.modo === 'm2'
          ? '<div class="mf-row"><label for="m2-' + it.id + '">Superficie por pieza (m²)</label>' +
              '<input id="m2-' + it.id + '" type="number" inputmode="decimal" min="0.01" step="0.01" ' +
              'data-f="m2" data-id="' + it.id + '" value="' + esc(it.m2) + '" /></div>'
          : bloqueDxf(it)) +

        '<div class="cot-ops">' +
          '<button type="button" class="cot-chk' + (it.plegado ? ' on' : '') + '" data-op="plegado" data-id="' + it.id + '" aria-pressed="' + it.plegado + '">' +
            '<span class="cot-box"></span>Lleva plegado</button>' +
          (it.plegado
            ? '<div class="mf-row cot-inline"><label for="pl-' + it.id + '">Pliegues</label>' +
              '<input id="pl-' + it.id + '" type="number" inputmode="numeric" min="1" step="1" ' +
              'data-f="pliegues" data-id="' + it.id + '" value="' + esc(it.pliegues) + '" /></div>'
            : '') +
        '</div>' +
      '</div>';
      return h + '</div>';
    }

    /* ---- Bloque DXF ----
       Un plano puede venir bien (medidas leidas) o no (motivos). En el
       segundo caso el estimador ya no va a mostrar precio, y conviene
       decirlo aca y no al final. */
    function bloqueDxf(it) {
      var h = '<div class="cot-file">' +
        '<input id="dxf-' + it.id + '" type="file" accept=".dxf,application/dxf,image/vnd.dxf" data-dxf="' + it.id + '" />' +
        '<label class="cot-filebtn" for="dxf-' + it.id + '">' +
          '<span>' + (it.dxfNombre ? 'Elegir otro plano' : 'Elegir archivo DXF') + '</span>' +
        '</label>' +
        (it.dxfNombre ? '<span class="cot-filename mono">' + esc(it.dxfNombre) + '</span>' : '') +
      '</div>';

      if (it.dxfLeyendo) return h + '<p class="cot-hint mono">Leyendo el plano…</p>';

      if (it.dxfOk) {
        h += '<div class="cot-ok"><b>Leímos ' + mm(it.ancho) + ' × ' + mm(it.largo) + ' mm</b>' +
             '<br />Si no coincide con tu pieza, cargala por medidas.</div>';
      } else if (it.dxfMotivos) {
        h += '<div class="cot-warn"><b>No podemos estimar este plano con confianza.</b><ul>';
        it.dxfMotivos.forEach(function (x) { h += '<li>' + esc(x) + '</li>'; });
        h += '</ul>Podés seguir igual: mandamos la consulta con el plano marcado ' +
             'para que un asesor lo revise y te pase el número.</div>';
      } else {
        h += '<p class="cot-hint mono">DXF en milímetros, contornos cerrados, sin bloques.</p>';
      }
      return h;
    }

    /* ---- Paso 2: lead gate ---- */
    function paso2() {
      var f = falta(st);
      return '' +
      '<div class="mf-row"><label for="cot-nom">Nombre o empresa</label>' +
        '<input id="cot-nom" type="text" autocomplete="organization" value="' + esc(st.nombre) + '" /></div>' +
      '<div class="cot-grid">' +
        '<div class="mf-row"><label for="cot-tel">Teléfono</label>' +
          '<input id="cot-tel" type="tel" inputmode="tel" autocomplete="tel" value="' + esc(st.telefono) + '" /></div>' +
        '<div class="mf-row"><label for="cot-mail">Email</label>' +
          '<input id="cot-mail" type="email" inputmode="email" autocomplete="email" value="' + esc(st.email) + '" /></div>' +
      '</div>' +
      '<p class="cot-hint mono">Con uno de los dos alcanza.</p>' +
      '<div class="mf-row"><label for="cot-ciu">Ciudad de entrega</label>' +
        '<input id="cot-ciu" type="text" autocomplete="address-level2" value="' + esc(st.ciudad) + '" /></div>' +
      (st.tocado && f.length
        ? '<p class="cot-err" role="alert">Falta ' + f.join(', ') + '.</p>'
        : '');
    }

    /* ---- Paso 3: el estimado ---- */
    function paso3(t) {
      function fila(k, v, nota, fuerte) {
        return '<div class="cot-row' + (fuerte ? ' strong' : '') + '">' +
          '<span class="cot-k">' + k + '</span>' +
          '<span class="cot-v">' + v + '</span>' +
          (nota ? '<span class="cot-n">' + nota + '</span>' : '') + '</div>';
      }

      var h = '';

      /* Un bloque por item: que se ve, cuanto pesa, como se acomoda. */
      st.items.forEach(function (it, i) {
        var m = t.items[i];
        h += '<div class="cot-res-item">' +
          '<div class="cot-res-hd">' +
            '<span class="cot-item-n mono">Ítem ' + (i + 1) + '</span>' +
            '<span class="cot-res-desc">' + esc(MATERIAL) + ' · ' + resumenItem(it) + '</span>' +
          '</div>' +
          '<div class="cot-est">' +
            fila('Peso estimado', m.revision ? '—' : kg(m.peso)) +
            (!t.sinPrecio && m.subtotal
              ? fila('Subtotal', money(m.subtotal), m.minimoItem ? 'Se aplicó el mínimo por ítem.' : null)
              : '') +
          '</div>' +
          (m.revision
            ? '<div class="cot-warn"><b>Este plano necesita que lo revise un asesor.</b><ul>' +
              (it.dxfMotivos || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') +
              '</ul></div>'
            : '') +
        '</div>';
      });

      h += bloqueNesting(t);

      if (t.revision) {
        return h + '<div class="cot-warn"><b>No te mostramos un precio porque hay un plano a revisar.</b><br />' +
          'Preferimos no darte un número que después no se sostenga. Mandá la consulta y te lo devolvemos revisado.</div>' +
          canonica();
      }

      if (t.sinPrecio) {
        return h + '<div class="cot-warn"><b>' + (t.peso > 0
            ? 'No podemos mostrarte un precio ahora mismo.'
            : 'Con estas medidas la pieza no tiene peso.') + '</b><br />' +
          (t.peso > 0
            ? 'Mandanos igual la consulta: ya lleva las piezas cargadas y un asesor te pasa el número.'
            : 'Volvé al paso 1 y revisá el ancho, el largo o la superficie.') +
          (t.peso > 0 && tarifaDiag
            ? '<span class="cot-diag mono">' + esc(tarifaDiag) + '</span>' : '') +
          '</div>' + canonica();
      }

      h += '<div class="cot-est cot-total">' +
        fila('Peso total', kg(t.peso) + (t.chapas ? ' · ' + t.chapas + ' chapa' + (t.chapas === 1 ? '' : 's') : '')) +
        (t.minimoPedido
          ? fila('Mínimo de pedido', money(t.minimoPedidoMonto), 'El pedido queda por debajo del mínimo.')
          : '') +
        fila('Total', money(t.total), null, true) +
      '</div>';

      h += '<p class="cot-note cot-iva"><b>IVA no incluido en el precio cotizado.</b> ' +
           'Se agrega al precio final luego de la consulta con el vendedor.</p>';

      if (st.items.some(function (it) { return it.plegado; })) {
        h += '<p class="cot-note">Este total <b>no incluye el plegado</b>. ' +
             'El vendedor lo suma al armar el presupuesto final.</p>';
      }

      return h + canonica();
    }

    function canonica() {
      return '<p class="cot-legal">Precio orientativo. No es un presupuesto cerrado. Se confirma con plano, ' +
        'nesting real y disponibilidad. Puede variar según forma, calados, piercing y aprovechamiento de chapa.</p>';
    }

    /* ---- pie con navegacion ---- */
    function pie(t) {
      if (st.paso < 3) {
        return '<div class="cot-foot">' +
          (st.paso > 1 ? '<button type="button" class="cot-back mono" data-nav="atras">← Atrás</button>' : '<span></span>') +
          '<button type="button" class="btn btn-solid" data-nav="seguir"><span>' +
          (st.paso === 2 ? 'Ver mi estimado' : 'Seguir') +
          '</span><span class="fill"></span></button>' +
        '</div>';
      }
      var href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent(waMessage(st, t));
      return '<div class="cot-foot">' +
        '<button type="button" class="cot-back mono" data-nav="atras">← Atrás</button>' +
        '<a class="btn btn-solid" href="' + href + '" target="_blank" rel="noopener" data-nav="wa">' +
        '<span>Enviar al vendedor</span><span class="fill"></span></a>' +
      '</div>';
    }

    /* ---- eventos ---- */
    function itemPorId(id) {
      for (var i = 0; i < st.items.length; i++) if (st.items[i].id === id) return st.items[i];
      return null;
    }
    function wire() {
      function on(sel, ev, fn) { var el = root.querySelector(sel); if (el) el.addEventListener(ev, fn); }
      function todos(sel, ev, fn) { root.querySelectorAll(sel).forEach(function (el) { el.addEventListener(ev, fn); }); }

      /* Campos de item: se guardan sin repintar, para no perder el foco
         mientras se escribe. Pero en el paso 1 la chapa se dibuja en vivo,
         asi que se redibuja SOLO esa parte — repintar todo tiraria el foco
         del input a mitad de un numero. */
      todos('[data-f]', 'input', function (e) {
        var it = itemPorId(parseInt(e.target.getAttribute('data-id'), 10));
        if (!it) return;
        it[e.target.getAttribute('data-f')] = e.target.value;
        if (st.paso === 1) redibujarChapa();
      });
      todos('select[data-f]', 'change', function (e) {
        var it = itemPorId(parseInt(e.target.getAttribute('data-id'), 10));
        if (!it) return;
        it[e.target.getAttribute('data-f')] = e.target.value;
        if (e.target.getAttribute('data-f') === 'chapa') pintar();
      });

      /* Datos de contacto */
      [['#cot-nom', 'nombre'], ['#cot-tel', 'telefono'], ['#cot-mail', 'email'], ['#cot-ciu', 'ciudad']]
        .forEach(function (p) {
          on(p[0], 'input', function (e) { st[p[1]] = e.target.value; });
        });

      todos('[data-toggle]', 'click', function (e) {
        var id = parseInt(e.currentTarget.getAttribute('data-toggle'), 10);
        st.abierto = (st.abierto === id) ? null : id;
        pintar();
      });
      todos('[data-del]', 'click', function (e) {
        var id = parseInt(e.currentTarget.getAttribute('data-del'), 10);
        st.items = st.items.filter(function (x) { return x.id !== id; });
        if (st.abierto === id) st.abierto = st.items.length ? st.items[0].id : null;
        pintar();
      });
      on('[data-add]', 'click', function () {
        var it = nuevoItem();
        st.items.push(it);
        st.abierto = it.id;
        st.tocado = false;
        track('estimador_item_agregado', { items: st.items.length });
        pintar();
        var nuevo = root.querySelector('.cot-item.abierto');
        if (nuevo && nuevo.scrollIntoView) nuevo.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });

      todos('[data-modo]', 'click', function (e) {
        var b = e.currentTarget;
        var it = itemPorId(parseInt(b.getAttribute('data-id'), 10));
        if (!it) return;
        var modo = b.getAttribute('data-modo');
        if (modo === 'dxf' && !window.PlasmartDxf) {
          it.modo = modo; it.dxfLeyendo = true; pintar();
          cargarDxf(function (ok) {
            it.dxfLeyendo = false;
            if (!ok) it.dxfMotivos = ['No pudimos cargar el lector de planos. Cargá la pieza por medidas.'];
            pintar();
          });
          return;
        }
        it.modo = modo; pintar();
      });

      /* Lectura del plano: pase lo que pase, el resultado se guarda en el
         estado y se vuelve a pintar. Nunca tira una excepcion a la cara. */
      todos('[data-dxf]', 'change', function (e) {
        var it = itemPorId(parseInt(e.target.getAttribute('data-dxf'), 10));
        var file = e.target.files && e.target.files[0];
        if (!it || !file) return;
        it.dxfNombre = file.name;
        it.dxfOk = false; it.dxfMotivos = null; it.dxfLeyendo = true;
        pintar();

        var fr = new FileReader();
        fr.onload = function () {
          var r;
          try { r = window.PlasmartDxf.revisar(String(fr.result)); }
          catch (err) { r = { ok: false, motivos: ['No pudimos leer el archivo.'] }; }
          it.dxfLeyendo = false;
          if (r.ok) {
            it.dxfOk = true; it.dxfMotivos = null;
            it.ancho = r.ancho; it.largo = r.largo;
            track('estimador_dxf_ok');
          } else {
            it.dxfOk = false; it.dxfMotivos = r.motivos;
            track('estimador_dxf_revision');
          }
          pintar();
        };
        fr.onerror = function () {
          it.dxfLeyendo = false;
          it.dxfMotivos = ['No pudimos leer el archivo.'];
          pintar();
        };
        fr.readAsText(file);
      });

      todos('[data-op]', 'click', function (e) {
        var b = e.currentTarget;
        var it = itemPorId(parseInt(b.getAttribute('data-id'), 10));
        if (!it) return;
        var k = b.getAttribute('data-op');
        it[k] = !it[k];
        pintar();
      });

      on('#cot-chapa', 'change', function (e) {
        st.chapa = e.target.value;
        track('estimador_chapa', { chapa: st.chapa });
        pintar();
      });

      on('[data-nav="atras"]', 'click', function () {
        st.paso--; st.tocado = false; pintar(); arriba();
      });
      on('[data-nav="seguir"]', 'click', function () {
        if (st.paso === 1) {
          var f = faltaPiezas(st);
          if (f) { st.tocado = true; st.abierto = st.items[f.idx].id; pintar(); return; }
        }
        if (st.paso === 2 && falta(st).length) { st.tocado = true; pintar(); return; }
        st.paso++;
        if (st.paso === 2) track('estimador_lead_form', { items: st.items.length });
        if (st.paso === 3) {
          var t = calcTotal(st);
          track(t.sinPrecio ? 'estimador_sin_precio' : 'estimador_total', { items: st.items.length });
        }
        pintar(); arriba();
      });
      on('[data-nav="wa"]', 'click', function () {
        track('estimador_whatsapp', { items: st.items.length });
      });
    }

    /* Redibuja solo el bloque de chapa, sin tocar el resto del DOM: asi el
       input que se esta tipeando conserva el foco y el cursor. */
    var redibujando = null;
    function redibujarChapa() {
      if (redibujando) clearTimeout(redibujando);
      redibujando = setTimeout(function () {
        redibujando = null;
        var viejo = root.querySelector('.cot-nesting');
        var html = bloqueNesting(calcTotal(st));
        var cont = root.querySelector('.cot-body');
        if (!cont) return;
        if (viejo) {
          var aviso = viejo.nextElementSibling;
          if (aviso && aviso.classList.contains('cot-warn')) aviso.remove();
          if (!html) { viejo.remove(); return; }
          var tmp = document.createElement('div');
          tmp.innerHTML = html;
          viejo.replaceWith.apply(viejo, Array.prototype.slice.call(tmp.childNodes));
        } else if (html) {
          /* No estaba (por ejemplo se paso de m² a medidas): va donde
             corresponde, justo despues del boton de agregar. */
          var add = root.querySelector('.cot-add');
          if (!add) return;
          var tmp2 = document.createElement('div');
          tmp2.innerHTML = html;
          var nodos = Array.prototype.slice.call(tmp2.childNodes);
          nodos.reverse().forEach(function (n) { add.after(n); });
        }
        var sel = root.querySelector('#cot-chapa');
        if (sel) sel.addEventListener('change', function (e) {
          st.chapa = e.target.value;
          track('estimador_chapa', { chapa: st.chapa });
          pintar();
        });
      }, 220);
    }

    function arriba() {
      if (root.scrollIntoView) root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  window.PlasmartCotizador = { mount: mount };
})();
