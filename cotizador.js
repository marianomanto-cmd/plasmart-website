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

  /* Lo que la etiqueta de conversion de Google Ads necesita para pujar por
     valor y no solo por cantidad: value y currency arriba de todo. El resto
     son dimensiones para segmentar despues.

     OJO al configurar el tROAS: este value es el estimado que vio la
     persona, no facturacion. Historicamente cierra el 43,6% de las
     cotizaciones y el margen bruto es 66,4%, asi que el margen esperado de
     una de estas conversiones ronda el 29% del value. */
  function datosConversion(t) {
    var prom = null;
    if (t.nest && t.nest.aprovechamiento.length) {
      prom = Math.round(t.nest.aprovechamiento.reduce(function (a, v) { return a + v; }, 0) /
                        t.nest.aprovechamiento.length);
    }
    return {
      value: t.total ? Math.round(t.total) : 0,
      currency: 'ARS',
      items: (t.items || []).length,
      peso_kg: Math.round((t.peso || 0) * 10) / 10,
      chapas: t.chapas || 0,
      aprovechamiento: prom,
      requiere_revision: !!t.revision,
      origen: origenSrc(),
      gclid: clickId('gclid')
    };
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

  /* Una chapa no mezcla espesores: el 3 mm y el 8 mm no comparten placa.
     Es una restriccion fisica, no una preferencia, y hasta ahora el dibujo
     la ignoraba: metia todo en la misma placa y mostraba menos chapas de
     las que el pedido realmente necesita. Se anida cada espesor por
     separado, del mas fino al mas grueso, y despues se juntan los
     resultados. */
  function nestPedido(entradas, chapa) {
    var porEsp = {};
    entradas.forEach(function (e) {
      var k = String(e.espesor || 0);
      if (!porEsp[k]) porEsp[k] = [];
      porEsp[k].push(e);
    });
    var claves = Object.keys(porEsp).sort(function (a, b) { return Number(a) - Number(b); });

    var out = { chapa: chapa, puestosPorChapa: [], chapas: 0,
                aprovechamiento: [], espesores: [], noEntra: [] };
    claves.forEach(function (k) {
      var n = nestGrupo(porEsp[k], chapa);
      n.puestosPorChapa.forEach(function (puestos, i) {
        out.puestosPorChapa.push(puestos);
        out.aprovechamiento.push(n.aprovechamiento[i]);
        out.espesores.push(Number(k));
      });
      out.chapas += n.chapas;
      n.noEntra.forEach(function (id) {
        if (out.noEntra.indexOf(id) < 0) out.noEntra.push(id);
      });
    });
    return out;
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
      espesor: num(it.espesor),
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
      entradas.push({ id: m.id, color: COLORES[i % COLORES.length], espesor: m.espesor,
                      ancho: m.anchoP, largo: m.largoP, cantidad: m.cantidad });
    });
    t.nest = entradas.length ? nestPedido(entradas, chapaDe(st.chapa)) : null;
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
    if (!st.telefono.trim() && !st.email.trim()) f.push('un teléfono o un email');
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
      /* Desglose por espesor: es lo que el vendedor tiene que pedir a
         compras, y una chapa no mezcla espesores. */
      if (t.nest.espesores && t.nest.espesores.length) {
        var porEsp = {};
        t.nest.espesores.forEach(function (e) { porEsp[e] = (porEsp[e] || 0) + 1; });
        var det = Object.keys(porEsp).sort(function (a, b) { return Number(a) - Number(b); })
          .map(function (e) { return porEsp[e] + ' de ' + e + ' mm'; });
        if (det.length > 1) L.push('Por espesor: ' + det.join(', '));
      }
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
  /* =========================================================
     GUARDAR LA CONSULTA

     El lead se escribe en Plasmart OT (cotizaciones_web) apenas se cruza
     la puerta de datos, ANTES de abrir WhatsApp. Si el visitante se cae
     ahi —y muchos se caen ahi— el contacto igual queda y ventas lo puede
     levantar. Despues, si aprieta "Enviar al vendedor", la misma fila
     pasa a 'enviado_wa': asi se distingue el que se fue del que llego.

     Nada de esto puede romperle el estimado a nadie: se manda y se
     olvida, sin await, sin bloquear la pantalla y sin mostrar errores.
     ========================================================= */
  var lead = { id: null, token: null, guardando: false };

  function nuevoToken() {
    try {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
      if (window.crypto && crypto.getRandomValues) {
        var a = new Uint8Array(16); crypto.getRandomValues(a);
        return Array.prototype.map.call(a, function (b) {
          return ('0' + b.toString(16)).slice(-2);
        }).join('');
      }
    } catch (e) {}
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }

  /* text/plain a proposito: evita el preflight OPTIONS, que no sigue el
     308 de www -> apex. Ver el comentario largo en api/lead.js. */
  function postLead(payload) {
    try {
      fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload),
        keepalive: true
      }).then(function (r) { return r.json(); })
        .then(function (r) {
          if (r && r.ok && r.id) { lead.id = r.id; vaciarPendientes(); }
        })
        .catch(function () {});
    } catch (e) {}
  }

  /* Marcar la fila necesita el id, y el id vuelve del insert. Si alguien
     aprieta WhatsApp o PDF antes de que llegue, la marca se perdia en
     silencio: ahora espera al id en vez de descartarse. */
  var pendientes = [];
  function marcar(accion) {
    if (!lead.token) return;
    if (!lead.id) {
      if (pendientes.indexOf(accion) < 0) pendientes.push(accion);
      return;
    }
    postLead({ accion: accion, id: lead.id, token: lead.token });
  }
  function vaciarPendientes() {
    var cola = pendientes; pendientes = [];
    cola.forEach(function (a) {
      postLead({ accion: a, id: lead.id, token: lead.token });
    });
  }

  function guardarConsulta(st, t) {
    if (lead.id || lead.guardando) return;   // una fila por sesion del estimador
    if (!st.nombre || (!st.telefono && !st.email)) return;
    lead.guardando = true;
    lead.token = lead.token || nuevoToken();

    var prom = null;
    if (t.nest && t.nest.aprovechamiento.length) {
      prom = t.nest.aprovechamiento.reduce(function (a, v) { return a + v; }, 0) /
             t.nest.aprovechamiento.length;
      prom = Math.round(prom * 10) / 10;
    }

    postLead({
      accion: 'estimado',
      token: lead.token,
      nombre: st.nombre,
      telefono: st.telefono,
      mail: st.email,
      ciudad: st.ciudad,
      material: MATERIAL,
      items: st.items.map(function (it, i) {
        var m = t.items[i] || {};
        return {
          modo: it.modo,
          espesor_mm: num(it.espesor),
          ancho_mm: it.modo === 'm2' ? 0 : num(it.ancho),
          largo_mm: it.modo === 'm2' ? 0 : num(it.largo),
          m2: it.modo === 'm2' ? num(it.m2) : 0,
          cantidad: m.cantidad,
          plegado: !!it.plegado,
          pliegues: it.plegado ? num(it.pliegues) : 0,
          dxf: it.dxfNombre || null,
          peso_kg: m.peso || 0,
          subtotal: m.subtotal || 0,
          revision: !!m.revision
        };
      }),
      peso_total_kg: t.peso || 0,
      chapa: chapaDe(st.chapa).label,
      chapas: t.chapas || 0,
      aprovechamiento_pct: prom,
      precio_kg: t.precioKg || 0,
      total_sin_iva: t.total || 0,
      minimo_aplicado: !!t.minimoPedido || (t.items || []).some(function (m) { return m.minimoItem; }),
      requiere_revision: !!t.revision || !!t.sinPrecio,
      origen: origenSrc(),
      gclid: clickId('gclid'),
      fbclid: clickId('fbclid')
    });
  }

  function marcarEnviado() { marcar('enviado_wa'); }

  /* Descargar el PDF no cambia el estado de la fila: se puede bajar la hoja
     sin mandar el WhatsApp y al reves, asi que va en su propia marca. */
  function marcarPdf() { marcar('pdf'); }

  /* De donde vino: el ?src= que traen los CTA del sitio. */
  function origenSrc() {
    return param('src', 80);
  }

  /* El gclid de Google Ads. Es lo unico que permite despues cruzar un lead
     con la campaña, el anuncio y la palabra que lo trajo, y subir la venta
     como conversion offline cuando la cotizacion se confirma. Se guarda en
     sessionStorage porque el parametro vive en la URL de entrada y se
     pierde en cuanto la persona navega. Idem fbclid, para Meta. */
  function param(nombre, max) {
    try {
      var v = new URLSearchParams(location.search).get(nombre);
      return v ? String(v).slice(0, max || 200) : null;
    } catch (e) { return null; }
  }
  function clickId(nombre) {
    var v = param(nombre, 200);
    try {
      if (v) sessionStorage.setItem('pm_' + nombre, v);
      else v = sessionStorage.getItem('pm_' + nombre);
    } catch (e) {}
    return v || null;
  }

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
     Cada chapa a escala, en vertical y en fila horizontal: asi entran
     varias a la vez y se comparan de un vistazo. El empaquetador trabaja
     con x sobre el largo e y sobre el ancho; al dibujar se intercambian
     los ejes para que la placa quede parada como en el taller.
     Es la misma salida que usa el calculo, asi que lo que se ve es lo que
     se cuenta. Se dibujan hasta MAX_CHAPAS para no volar el DOM en pedidos
     grandes; el resto se resume en una linea. */
  var MAX_CHAPAS = 6;

  function svgChapas(t) {
    if (!t.nest || !t.nest.chapas) return '';
    var n = t.nest, ch = n.chapa;
    var mostrar = Math.min(n.chapas, MAX_CHAPAS);
    var h = '<div class="est-chapas" data-n="' + n.chapas + '">';

    for (var c = 0; c < mostrar; c++) {
      var puestos = n.puestosPorChapa[c] || [];
      var piezas = '';
      puestos.forEach(function (p) {
        var dib = 0;
        for (var r = 0; r < p.ny && dib < p.count; r++) {
          for (var k = 0; k < p.nx && dib < p.count; k++) {
            /* ejes intercambiados: la placa se dibuja parada */
            var x = MARGEN_MM + p.y + r * (p.ph + SEPARACION_MM);
            var y = MARGEN_MM + p.x + k * (p.pw + SEPARACION_MM);
            piezas += '<rect x="' + x + '" y="' + y + '" width="' + p.ph + '" height="' + p.pw +
                      '" fill="' + p.color + '" fill-opacity="0.22" stroke="' + p.color +
                      '" stroke-width="5" />';
            dib++;
          }
        }
      });
      var esp = n.espesores && n.espesores[c];
      h += '<figure class="est-chapa">' +
        '<svg viewBox="0 0 ' + ch.ancho + ' ' + ch.largo + '" preserveAspectRatio="xMidYMid meet" ' +
          'role="img" aria-label="Chapa ' + (c + 1) + ' de ' + n.chapas +
          (esp ? ', ' + esp + ' milimetros' : '') + ', ' +
          Math.round(n.aprovechamiento[c]) + ' por ciento ocupada">' +
          '<rect x="0" y="0" width="' + ch.ancho + '" height="' + ch.largo + '" class="est-chapa-bg" />' +
          piezas +
        '</svg>' +
        '<figcaption class="est-chapa-pie mono">' +
          'Chapa ' + String(c + 1).padStart(2, '0') + (esp ? ' · ' + espTexto(esp) : '') + '<br />' +
          '<b>' + Math.round(n.aprovechamiento[c]) + '%</b> ocupado' +
        '</figcaption>' +
      '</figure>';
    }
    if (n.chapas > mostrar) {
      h += '<p class="est-chapa-mas mono">+ ' + (n.chapas - mostrar) + '<br />chapa' +
           (n.chapas - mostrar === 1 ? '' : 's') + '<br />más</p>';
    }
    return h + '</div>';
  }

  /* 4.75 -> "4,75 mm". El herrero lee coma decimal, no punto. */
  function espTexto(e) {
    return espNum(e) + ' mm';
  }
  /* Sin unidad, para las pills: son quince y repetir "mm" en cada una las
     hacia el doble de anchas y las tiraba a tres filas. La unidad va una
     sola vez, en la etiqueta del grupo. */
  function espNum(e) {
    return num(e).toLocaleString('es-AR', { maximumFractionDigits: 2 });
  }

  /* =========================================================
     LA HOJA IMPRIMIBLE

     Se arma el mismo A4 que se aprobo en la maqueta y se manda a imprimir.
     Todo pasa en el navegador: los datos del cliente no salen a ningun
     lado para generar el PDF. El navegador ofrece "Guardar como PDF" en
     el dialogo de impresion, que es como se descarga.

     El dibujo de las chapas es el mismo SVG que se ve en pantalla, asi
     que la hoja no puede contradecir lo que la persona vio.
     ========================================================= */
  /* La frase obligatoria, verbatim. Una sola copia en todo el archivo: la
     usan la pantalla y la hoja imprimible. */
  function canonica() {
    return 'Precio orientativo. No es un presupuesto cerrado. Se confirma con plano, ' +
      'nesting real y disponibilidad. Puede variar según forma, calados, piercing y aprovechamiento de chapa.';
  }

  function fechaLarga(d) {
    var meses = ['enero','febrero','marzo','abril','mayo','junio','julio',
                 'agosto','septiembre','octubre','noviembre','diciembre'];
    return d.getDate() + ' de ' + meses[d.getMonth()] + ' de ' + d.getFullYear();
  }

  function svgChapaPdf(t, c) {
    var n = t.nest, ch = n.chapa;
    var puestos = n.puestosPorChapa[c] || [];
    var piezas = '';
    puestos.forEach(function (p) {
      var dib = 0;
      for (var r = 0; r < p.ny && dib < p.count; r++) {
        for (var k = 0; k < p.nx && dib < p.count; k++) {
          /* mismos ejes intercambiados que en pantalla: la placa va parada */
          var x = MARGEN_MM + p.y + r * (p.ph + SEPARACION_MM);
          var y = MARGEN_MM + p.x + k * (p.pw + SEPARACION_MM);
          piezas += '<rect x="' + x + '" y="' + y + '" width="' + p.ph + '" height="' + p.pw +
                    '" fill="#4a55d6" fill-opacity="0.20" stroke="#4a55d6" stroke-width="6" />';
          dib++;
        }
      }
    });
    var esp = n.espesores && n.espesores[c];
    var unidades = puestos.reduce(function (a, p) { return a + p.count; }, 0);
    return '<figure class="pdf-chapa">' +
      '<svg viewBox="0 0 ' + ch.ancho + ' ' + ch.largo + '" preserveAspectRatio="xMidYMid meet">' +
        '<rect x="0" y="0" width="' + ch.ancho + '" height="' + ch.largo + '" fill="#fafbfc" />' +
        piezas +
      '</svg>' +
      '<figcaption>Chapa ' + String(c + 1).padStart(2, '0') +
        (esp ? ' · ' + espTexto(esp) : '') + '<br />' +
        '<b>' + Math.round(n.aprovechamiento[c]) + '%</b> ocupado · ' + unidades + ' u' +
      '</figcaption>' +
    '</figure>';
  }

  function hojaPdf(st, t) {
    var hoy = new Date();
    var filas = '';
    st.items.forEach(function (it, i) {
      var m = t.items[i] || {};
      var detalle = [MATERIAL];
      /* Dos decimales y no uno: a 2,4 kg contra 2,36 kg le sobra medio kilo
         cada diez piezas, y esta hoja se la lleva alguien a discutir. */
      if (!m.revision && m.cantidad) {
        detalle.push((m.peso / m.cantidad).toLocaleString('es-AR',
          { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kg por unidad');
      }
      if (it.plegado) detalle.push('lleva plegado');
      filas += '<tr>' +
        '<td class="pdf-idx">' + String(i + 1).padStart(2, '0') + '</td>' +
        '<td class="pdf-pieza">' + resumenPdf(it) +
          '<small>' + detalle.join(' · ') + '</small></td>' +
        '<td class="pdf-num pdf-kg">' + m.cantidad + ' u</td>' +
        '<td class="pdf-num pdf-kg">' + (m.revision ? '—' : kg(m.peso)) + '</td>' +
        '<td class="pdf-num pdf-plata">' +
          (m.revision ? 'a revisar' : m.subtotal ? money(m.subtotal) : '—') + '</td>' +
      '</tr>';
    });

    var chapas = '';
    if (t.nest && t.nest.chapas) {
      var mostrar = Math.min(t.nest.chapas, 4);
      for (var c = 0; c < mostrar; c++) chapas += svgChapaPdf(t, c);
      if (t.nest.chapas > mostrar) {
        chapas += '<p class="pdf-chapa-mas">+ ' + (t.nest.chapas - mostrar) +
                  '<br />chapa' + (t.nest.chapas - mostrar === 1 ? '' : 's') + '<br />más</p>';
      }
    }

    /* Con un plano a revisar no se imprime total ni subtotales: un numero
       creible sobre un plano dudoso es peor que no tener numero. */
    var bloqueTotal;
    if (t.revision || t.sinPrecio) {
      bloqueTotal =
        '<div class="pdf-totales"><div class="pdf-resumen">' +
          '<div><dt>Peso total</dt><dd>' + kg(t.peso) + '</dd></div>' +
          (t.chapas ? '<div><dt>Chapas</dt><dd>' + t.chapas + '</dd></div>' : '') +
        '</div><dl class="pdf-monto"><dt>Total estimado</dt>' +
          '<dd class="pdf-sin">' + (t.revision ? 'A revisar' : 'A cotizar') + '</dd></dl></div>' +
        '<p class="pdf-revision">' + (t.revision
          ? 'No calculamos un precio porque hay un plano que necesita revisión. Un número construido sobre un plano dudoso no se sostiene: preferimos que lo mire un asesor y te lo pase revisado.'
          : 'No pudimos calcular el precio en el momento. Contactanos con esta referencia y te lo pasamos.') + '</p>';
    } else {
      var minimo = '';
      if (t.minimoPedido) {
        minimo = '<p class="pdf-min">El pedido queda por debajo del mínimo: se aplicó el mínimo de ' +
                 money(t.minimoPedidoMonto) + '.</p>';
      } else if (t.items.some(function (m) { return m.minimoItem; })) {
        minimo = '<p class="pdf-min">Hay ítems por debajo del mínimo por ítem: se aplicó el mínimo en esos.</p>';
      }
      bloqueTotal =
        '<div class="pdf-totales"><div class="pdf-resumen">' +
          '<div><dt>Peso total</dt><dd>' + kg(t.peso) + '</dd></div>' +
          '<div><dt>Chapas</dt><dd>' + (t.chapas || '—') + '</dd></div>' +
          '<div><dt>$/kg aplicado</dt><dd>$ ' + Math.round(t.precioKg).toLocaleString('es-AR') + '</dd></div>' +
        '</div>' +
        '<dl class="pdf-monto"><dt>Total estimado</dt>' +
          '<dd>' + money(t.total) + '<i>.</i></dd>' +
          '<span class="pdf-siniva">Sin IVA</span></dl></div>' + minimo;
    }

    return '<article class="pdf-hoja">' +
      '<header class="pdf-membrete">' +
        '<img src="/assets/plasmart-logo-negro.png" alt="Plasmart" />' +
        '<address class="pdf-emisor"><b>Plasmart</b>' +
          'Francisco de Arteaga 2895 · Córdoba, Argentina<br />' +
          '(351) 382 0321 · ventasplasmart@transfil.com.ar<br />' +
          'Lunes a viernes, 08 a 17 h · plasmartcba.com</address>' +
      '</header>' +
      '<div class="pdf-regla pdf-regla-fuerte"></div>' +

      '<div class="pdf-cabeza">' +
        '<h2>Estimado <span>preliminar</span></h2>' +
        '<div class="pdf-ref"><b>' + esc(st.ref) + '</b><br />' +
          fechaLarga(hoy) + '<br />Corte láser · chapa negra</div>' +
      '</div>' +

      '<dl class="pdf-cliente">' +
        '<div><dt>Cliente</dt><dd>' + esc(st.nombre.trim()) + '</dd></div>' +
        '<div><dt>Teléfono</dt><dd>' + (esc(st.telefono.trim()) || '—') + '</dd></div>' +
        '<div><dt>Email</dt><dd>' + (esc(st.email.trim()) || '—') + '</dd></div>' +
        '<div><dt>Ciudad de entrega</dt><dd>' + esc(st.ciudad.trim()) + '</dd></div>' +
      '</dl>' +

      '<div class="pdf-regla"></div>' +
      '<p class="pdf-rotulo">Detalle de piezas</p>' +
      '<table><thead><tr><th></th><th>Pieza</th>' +
        '<th class="pdf-num">Cantidad</th><th class="pdf-num">Peso</th>' +
        '<th class="pdf-num">Subtotal</th></tr></thead>' +
        '<tbody>' + filas + '</tbody></table>' +

      (chapas
        ? '<div class="pdf-regla"></div>' +
          '<p class="pdf-rotulo">Cómo entran en la chapa · ' + esc(t.nest.chapa.label) + '</p>' +
          '<div class="pdf-chapas">' + chapas + '</div>' +
          '<p class="pdf-nota-chapa"><b>Se dibuja la chapa entera para mostrar cómo entran ' +
          'las piezas, pero el precio es solo por las piezas cortadas.</b> Una chapa nunca ' +
          'mezcla espesores. El anidado real del taller suele aprovechar más que esta ' +
          'estimación.</p>'
        : '') +

      '<div class="pdf-regla"></div>' +
      bloqueTotal +

      '<div class="pdf-avisos">' +
        '<div class="pdf-clave"><span class="pdf-marca">Precio preliminar</span>' +
          '<p>Para una <b>oferta definitiva</b> contactá a nuestro vendedor <b>Santi</b>: ' +
          '(351) 382 0321. Mostrale este número de referencia y retoma desde acá.</p></div>' +
        '<div class="pdf-excluye"><span>No incluye plegado</span>' +
          '<span>No incluye IVA</span><span>Flete a cotizar</span></div>' +
        '<p class="pdf-legal">' + canonica() +
          ' El valor por kilo es el vigente al ' + fechaLarga(hoy) + ' y se actualiza periódicamente.</p>' +
        '<div class="pdf-pie"><span>Plasmart · corte y plegado de acero desde 2006</span>' +
          '<span>' + esc(st.ref) + '</span></div>' +
      '</div>' +
    '</article>';
  }

  /* El resumen de la fila, sin el <em> de la cantidad que usa la pantalla. */
  function resumenPdf(it) {
    var p = [espTexto(it.espesor)];
    if (it.modo === 'm2') p.push(mm(it.m2) + ' m² por pieza');
    else if (it.modo === 'dxf') p.push(it.dxfNombre ? esc(it.dxfNombre) : 'plano sin cargar');
    else p.push(mm(it.ancho) + ' × ' + mm(it.largo) + ' mm');
    return p.join(' · ');
  }

  /* =========================================================
     RENDER

     Una sola pantalla. La lista de piezas ES la progresion: se abre una
     fila, se edita en el lugar, se cierra. No hay pasos.

     La puerta de datos sigue en pie — es regla comercial, no adorno: sin
     nombre + (telefono o email) + ciudad el monto no se muestra y el
     boton de WhatsApp no se habilita. Lo que si se ve desde el arranque
     es el peso, las chapas y el dibujo: eso es lo que engancha y es lo
     que se gana el dato de contacto.
     ========================================================= */
  function mount(root) {
    var st = nuevoEstado();
    root.innerHTML = '<div class="cot-load mono">Cargando…</div>';
    cargarTarifa(function () { pintar(); });

    function pintar() {
      var t = calcTotal(st);
      root.innerHTML =
        '<div class="est">' +
          '<span class="est-glow" aria-hidden="true"></span>' +
          '<div class="est-col est-col-piezas">' + columnaPiezas(t) + '</div>' +
          '<aside class="est-col est-col-nest">' + columnaNesting(t) + '</aside>' +
        '</div>';
      wire();
    }

    /* ---------------- columna izquierda ---------------- */

    function columnaPiezas(t) {
      var h = '<div class="est-hd">' +
        '<span class="est-kicker mono"><i aria-hidden="true"></i>Corte láser · chapa negra</span>' +
        '<h2 class="est-h1">Cargá tus piezas y mirá el <span>precio.</span></h2>' +
      '</div>';

      h += '<div class="est-lista">';
      st.items.forEach(function (it, i) { h += fila(it, i, t); });
      h += '<button type="button" class="est-fila est-fila-add" data-add="1">' +
             '<span class="est-n mono" aria-hidden="true">+</span>' +
             '<span class="est-desc">Agregar otra pieza</span>' +
           '</button>';
      h += '</div>';

      h += datos(t);
      h += total(t);
      return h;
    }

    /* ---- una pieza: resumen o editor, nunca los dos ---- */
    function fila(it, i, t) {
      var m = t.items[i] || {};
      var n = String(i + 1).padStart(2, '0');
      if (st.abierto !== it.id) {
        return '<button type="button" class="est-fila" data-abrir="' + it.id + '">' +
          '<span class="est-n mono">' + n + '</span>' +
          '<span class="est-desc">' + resumenItem(it) + '</span>' +
          '<span class="est-sub mono">' + (m.revision ? 'a revisar' : m.subtotal ? money(m.subtotal) : '—') + '</span>' +
          '<span class="est-edit mono" aria-hidden="true">editar ↗</span>' +
        '</button>';
      }
      return '<div class="est-fila est-fila-ed" data-item="' + it.id + '">' +
        '<span class="est-guia" aria-hidden="true"></span>' +
        '<div class="est-ed">' + editor(it, n, m) + '</div>' +
      '</div>';
    }

    function editor(it, n, m) {
      var h = '<div class="est-ed-hd">' +
        '<span class="mono est-ed-n">Ítem ' + n + '</span>' +
        '<span class="mono est-ed-unit">' +
          (m.revision ? 'sin precio hasta revisar el plano'
            : m.subtotal ? money(m.subtotal / m.cantidad) + ' / u' : '') +
        '</span>' +
      '</div>';

      /* Espesor en pills. Nunca un <select>: el sistema no usa dropdowns
         nativos, y con el catalogo completo de OT una lista de pills se
         escanea mas rapido que un desplegable. */
      var esp = (tarifa && tarifa.espesores) || [1.2, 2, 3, 4.75, 6, 9.5];
      h += grupo('Espesor (mm)',
        '<div class="est-pills est-pills-num" role="radiogroup" aria-label="Espesor en milímetros">' +
          esp.map(function (e) {
            var on = num(it.espesor) === e;
            return '<button type="button" class="est-pill' + (on ? ' on' : '') + '" role="radio" ' +
              'aria-checked="' + on + '" aria-label="' + espTexto(e) + '" ' +
              'data-f="espesor" data-v="' + e + '" data-id="' + it.id + '">' +
              espNum(e) + '</button>';
          }).join('') +
        '</div>');

      h += grupo('Cómo lo das',
        '<div class="est-pills" role="radiogroup" aria-label="Cómo das la medida">' +
          [['medidas', 'Por medidas'], ['m2', 'Por m²'], ['dxf', 'Plano DXF']].map(function (o) {
            var on = it.modo === o[0];
            return '<button type="button" class="est-pill est-pill-sm' + (on ? ' on' : '') + '" role="radio" ' +
              'aria-checked="' + on + '" data-modo="' + o[0] + '" data-id="' + it.id + '">' + o[1] + '</button>';
          }).join('') +
        '</div>');

      if (it.modo === 'medidas') {
        h += '<div class="est-medidas">' +
          campo('an-' + it.id, 'Ancho (mm)', it.ancho, 'ancho', it.id) +
          campo('la-' + it.id, 'Largo (mm)', it.largo, 'largo', it.id) +
        '</div>';
      } else if (it.modo === 'm2') {
        h += '<div class="est-medidas">' +
          campo('m2-' + it.id, 'Superficie por pieza (m²)', it.m2, 'm2', it.id, '0.01') +
        '</div>';
      } else {
        h += bloqueDxf(it);
      }

      /* Cantidad con − / +: en celular un stepper de 44px se usa con el
         pulgar; el spinner nativo de <input type=number> no. */
      h += grupo('Cantidad',
        '<div class="est-step">' +
          '<button type="button" class="est-stepb" data-step="-1" data-id="' + it.id + '" aria-label="Quitar una unidad">−</button>' +
          '<input id="cant-' + it.id + '" class="est-stepi" type="text" inputmode="numeric" ' +
            'aria-label="Cantidad" data-f="cantidad" data-id="' + it.id + '" value="' + esc(it.cantidad) + '" />' +
          '<button type="button" class="est-stepb" data-step="1" data-id="' + it.id + '" aria-label="Sumar una unidad">+</button>' +
        '</div>');

      h += '<div class="est-acciones">' +
        '<button type="button" class="est-chip' + (it.plegado ? ' on' : '') + '" data-op="plegado" ' +
          'data-id="' + it.id + '" aria-pressed="' + it.plegado + '">' +
          (it.plegado ? '✓ Lleva plegado — lo suma el vendedor' : 'Lleva plegado') + '</button>' +
        (it.plegado
          ? '<div class="est-pliegues">' +
              campo('pl-' + it.id, 'Pliegues', it.pliegues, 'pliegues', it.id, '1', true) +
            '</div>'
          : '') +
        '<button type="button" class="est-listo mono" data-cerrar="1">Listo</button>' +
        (st.items.length > 1
          ? '<button type="button" class="est-borrar mono" data-del="' + it.id + '">Eliminar</button>'
          : '') +
      '</div>';

      var f = st.tocado ? faltaItem(it) : [];
      if (f.length) h += '<p class="est-err mono" role="alert">Falta ' + f.join(' y ') + '.</p>';
      return h;
    }

    function grupo(label, contenido) {
      return '<div class="est-grupo"><span class="est-lbl mono">' + label + '</span>' + contenido + '</div>';
    }
    function campo(id, label, valor, f, itemId, step, chico) {
      return '<div class="est-campo' + (chico ? ' est-campo-sm' : '') + '">' +
        '<label class="est-lbl mono" for="' + id + '">' + label + '</label>' +
        '<input id="' + id + '" type="text" inputmode="' + (step === '0.01' ? 'decimal' : 'numeric') + '" ' +
          'data-f="' + f + '" data-id="' + itemId + '" value="' + esc(valor) + '" />' +
      '</div>';
    }

    function resumenItem(it) {
      var partes = [espTexto(it.espesor)];
      if (it.modo === 'm2') partes.push(mm(it.m2) + ' m²');
      else if (it.modo === 'dxf') partes.push(it.dxfNombre ? esc(it.dxfNombre) : 'plano sin cargar');
      else partes.push(mm(it.ancho) + ' × ' + mm(it.largo));
      var q = '<em>' + Math.max(1, Math.floor(num(it.cantidad)) || 1) + ' u</em>';
      if (it.plegado) q += ' <em>· plegado</em>';
      return partes.join(' · ') + ' · ' + q;
    }

    /* ---- Bloque DXF ----
       Un plano puede venir bien (medidas leidas) o no (motivos). En el
       segundo caso el estimador ya no va a mostrar precio, y conviene
       decirlo aca y no al final. */
    function bloqueDxf(it) {
      var h = '<div class="est-file">' +
        '<input id="dxf-' + it.id + '" type="file" accept=".dxf,application/dxf,image/vnd.dxf" data-dxf="' + it.id + '" />' +
        '<label class="est-pill est-pill-sm" for="dxf-' + it.id + '">' +
          (it.dxfNombre ? 'Elegir otro plano' : 'Elegir archivo DXF') + '</label>' +
        (it.dxfNombre ? '<span class="est-filename mono">' + esc(it.dxfNombre) + '</span>' : '') +
      '</div>';

      if (it.dxfLeyendo) return h + '<p class="est-nota mono">Leyendo el plano…</p>';

      if (it.dxfOk) {
        h += '<p class="est-ok mono"><b>Leímos ' + mm(it.ancho) + ' × ' + mm(it.largo) + ' mm.</b> ' +
             'Si no coincide con tu pieza, cargala por medidas.</p>';
      } else if (it.dxfMotivos) {
        h += '<div class="est-warn"><b>No podemos estimar este plano con confianza.</b><ul>' +
             it.dxfMotivos.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') +
             '</ul>Podés seguir igual: la consulta viaja con el plano marcado ' +
             'para que un asesor lo revise y te pase el número.</div>';
      } else {
        h += '<p class="est-nota mono">DXF en milímetros, contornos cerrados, sin bloques.</p>';
      }
      return h;
    }

    /* ---- la puerta ----
       Regla comercial: sin nombre + (telefono o email) + ciudad no se
       muestra el total ni se habilita WhatsApp. Va aca abajo, pegada al
       numero, para que se lea como el ultimo campo del pedido y no como
       un formulario aparte. */
    function datos(t) {
      var f = falta(st);
      var listo = !f.length;
      return '<div class="est-datos' + (listo ? ' listo' : '') + '">' +
        '<span class="est-lbl mono est-datos-lbl">' +
          (listo ? '✓ Tus datos' : 'Tus datos — para mostrarte el número') + '</span>' +
        '<div class="est-datos-campos">' +
          '<div class="est-campo est-campo-ancho">' +
            '<label class="est-lbl mono" for="cot-nom">Nombre o empresa</label>' +
            '<input id="cot-nom" type="text" autocomplete="organization" data-d="nombre" value="' + esc(st.nombre) + '" /></div>' +
          '<div class="est-campo">' +
            '<label class="est-lbl mono" for="cot-tel">Teléfono</label>' +
            '<input id="cot-tel" type="tel" inputmode="tel" autocomplete="tel" data-d="telefono" value="' + esc(st.telefono) + '" /></div>' +
          '<div class="est-campo">' +
            '<label class="est-lbl mono" for="cot-mail">Email</label>' +
            '<input id="cot-mail" type="email" inputmode="email" autocomplete="email" data-d="email" value="' + esc(st.email) + '" /></div>' +
          '<div class="est-campo est-campo-ancho">' +
            '<label class="est-lbl mono" for="cot-ciu">Ciudad de entrega</label>' +
            '<input id="cot-ciu" type="text" autocomplete="address-level2" data-d="ciudad" value="' + esc(st.ciudad) + '" /></div>' +
        '</div>' +
        '<p class="est-nota mono">Con el teléfono o el email alcanza. Es para que el vendedor pueda responderte.</p>' +
      '</div>';
    }

    /* ---- total y salida ---- */
    function total(t) {
      var f = falta(st);
      var abierto = !f.length;
      var piezas = st.items.length;

      var meta = [piezas + ' ítem' + (piezas === 1 ? '' : 's')];
      if (t.peso > 0) meta.push(kg(t.peso));
      if (t.chapas) meta.push(t.chapas + ' chapa' + (t.chapas === 1 ? '' : 's'));

      var h = '<div class="est-total">' +
        '<span class="est-lbl mono est-total-lbl">Estimado orientativo · ' + meta.join(' · ') + '</span>';

      /* monto + boton juntos: en celular este bloque se despega y queda
         fijo abajo, para que el numero y la salida esten siempre a mano */
      var monto, avisos = '';
      if (t.revision) {
        monto = '<p class="est-monto est-monto-off">A revisar</p>';
        avisos = '<div class="est-warn"><b>No te mostramos un precio porque hay un plano a revisar.</b><br />' +
          'Preferimos no darte un número que después no se sostenga. Mandá la consulta y te lo devolvemos revisado.</div>';
      } else if (t.sinPrecio) {
        monto = '<p class="est-monto est-monto-off">' + (t.peso > 0 ? 'A cotizar' : '—') + '</p>';
        avisos = '<div class="est-warn"><b>' + (t.peso > 0
            ? 'No podemos mostrarte un precio ahora mismo.'
            : 'Con estas medidas la pieza no tiene peso.') + '</b><br />' +
          (t.peso > 0
            ? 'Mandanos igual la consulta: ya lleva las piezas cargadas y un asesor te pasa el número.'
            : 'Revisá el ancho, el largo o la superficie.') +
          (t.peso > 0 && tarifaDiag ? '<span class="est-diag mono">' + esc(tarifaDiag) + '</span>' : '') +
          '</div>';
      } else if (!abierto) {
        monto = '<p class="est-monto est-monto-off" aria-label="El precio se muestra al completar tus datos">' +
            '$&nbsp;<span class="est-tapado">•••.•••</span></p>';
        avisos = '<p class="est-abrir mono">Completá ' + f.join(', ') + ' y te mostramos el número.</p>';
      } else {
        monto = '<p class="est-monto">' + money(t.total) + '<span class="est-punto">.</span></p>';
        if (t.minimoPedido) {
          avisos = '<p class="est-nota mono">El pedido queda por debajo del mínimo: se aplicó el mínimo de ' +
            money(t.minimoPedidoMonto) + '.</p>';
        } else if (t.items.some(function (m) { return m.minimoItem; })) {
          avisos = '<p class="est-nota mono">Hay ítems por debajo del mínimo por ítem: se aplicó el mínimo en esos.</p>';
        }
      }

      h += '<div class="est-accion">' + monto + cta(t, abierto) + '</div>' + avisos;

      /* Letra chica. El orden importa: primero lo que cambia el numero
         (IVA, plegado), despues la frase canonica. */
      h += '<div class="est-legal">' +
        '<p><b>IVA no incluido en el precio cotizado.</b> Se agrega al precio final luego de la consulta con el vendedor.</p>' +
        (st.items.some(function (it) { return it.plegado; })
          ? '<p>El plegado <b>no está incluido</b> en este estimado: viaja en la consulta y el vendedor lo suma al armar el presupuesto final.</p>'
          : '<p>El plegado no está incluido · inoxidable y aluminio se cotizan a mano.</p>') +
        '<p>' + canonica() + '</p>' +
      '</div>';

      return h + '</div>';
    }

    function pdfIco() {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M12 3v11M8 11l4 4 4-4M5 20h14"/></svg>';
    }

    function cta(t, abierto) {
      var ico = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="est-wa">' +
        '<path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.82 11.82 0 018.413 3.488 11.82 11.82 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zM6.597 20.13c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.042z"/></svg>';
      /* Con la puerta cerrada los dos botones se ven igual, apagados: si el
         del PDF aparece recien junto con el numero, para el que todavia no
         cargo sus datos la funcion no existe. Apretar cualquiera de los dos
         lleva a los campos que faltan. */
      if (!abierto) {
        return '<div class="est-botones">' +
          '<button type="button" class="btn btn-solid est-cta" data-cta="1">' +
            ico + '<span class="est-cta-largo">Mandar al vendedor</span>' +
            '<span class="est-cta-corto">Enviar</span><span class="fill"></span></button>' +
          '<button type="button" class="btn est-cta est-cta-pdf" data-cta="1" ' +
            'aria-label="Descargar el estimado en PDF: completá tus datos primero">' +
            pdfIco() + '<span class="est-cta-txt">Descargar PDF</span>' +
            '<span class="fill"></span></button>' +
        '</div>';
      }
      var href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent(waMessage(st, t));
      return '<div class="est-botones">' +
        '<a class="btn btn-solid est-cta" href="' + href + '" target="_blank" rel="noopener" data-nav="wa">' +
          ico + '<span class="est-cta-largo">Mandar al vendedor</span>' +
          '<span class="est-cta-corto">Enviar</span><span class="fill"></span></a>' +
        '<button type="button" class="btn est-cta est-cta-pdf" data-nav="pdf" ' +
          'aria-label="Descargar el estimado en PDF">' +
          pdfIco() + '<span class="est-cta-txt">Descargar PDF</span><span class="fill"></span></button>' +
      '</div>';
    }

    /* ---------------- columna derecha: el nesting ---------------- */

    function columnaNesting(t) {
      var res = '—';
      if (t.nest && t.nest.chapas) {
        var prom = t.nest.aprovechamiento.reduce(function (a, v) { return a + v; }, 0) /
                   t.nest.aprovechamiento.length;
        res = t.nest.chapas + ' chapa' + (t.nest.chapas === 1 ? '' : 's') + ' · ' + Math.round(prom) + '% ocupado';
      }

      /* Envuelto para poder pegarlo: en escritorio el panel sigue a la
         vista mientras se scrollea la lista de piezas, que es larga. */
      var h = '<div class="est-nest-in">' +
        '<div class="est-nest-hd">' +
          '<span class="est-lbl mono">Nesting</span>' +
          '<span class="est-nest-res mono">' + res + '</span>' +
        '</div>';

      if (t.nest && t.nest.chapas) {
        h += svgChapas(t);
        h += leyenda(t);
      } else {
        h += '<p class="est-nest-vacio mono">Cargá medidas y cantidad y acá vas a ver ' +
             'cómo entran tus piezas en la chapa.</p>';
      }

      if (t.nest && t.nest.noEntra.length) {
        h += '<div class="est-warn"><b>Hay piezas que no entran en la chapa elegida.</b><br />' +
             'Probá una chapa más grande o consultanos: puede ir en varias partes.</div>';
      }

      h += '<div class="est-nest-pie">' +
        '<span class="est-lbl mono">Chapa</span>' +
        '<div class="est-pills" role="radiogroup" aria-label="Medida de chapa">' +
          CHAPAS.map(function (c) {
            var on = st.chapa === c.key;
            return '<button type="button" class="est-pill est-pill-sm' + (on ? ' on' : '') + '" ' +
              'role="radio" aria-checked="' + on + '" data-chapa="' + c.key + '">' + c.label + '</button>';
          }).join('') +
        '</div>' +
      '</div>';

      h += '<p class="est-nest-nota mono">' +
        '<b>Se dibuja la chapa entera para mostrar cómo entran las piezas, ' +
        'pero el precio es solo por las piezas cortadas.</b><br />' +
        'Una chapa por espesor: el 3 mm y el 8 mm no comparten placa.<br />' +
        'Estimación de anidado — el taller optimiza y suele entrar más.' +
      '</p>';
      return h + '</div>';
    }

    function leyenda(t) {
      var chips = [];
      st.items.forEach(function (it, i) {
        var m = t.items[i];
        if (!m || !m.nesteable) return;
        chips.push('<span class="est-leg-i mono"><i style="background:' + COLORES[i % COLORES.length] + '"></i>' +
                   String(i + 1).padStart(2, '0') + '</span>');
      });
      if (chips.length < 2) return '';
      return '<div class="est-leg">' + chips.join('') + '</div>';
    }

    /* ---------------- eventos ---------------- */

    function itemPorId(id) {
      for (var i = 0; i < st.items.length; i++) if (st.items[i].id === id) return st.items[i];
      return null;
    }

    function wire() {
      function on(sel, ev, fn) { var el = root.querySelector(sel); if (el) el.addEventListener(ev, fn); }
      function todos(sel, ev, fn) { root.querySelectorAll(sel).forEach(function (el) { el.addEventListener(ev, fn); }); }

      /* Campos de item: se guardan sin repintar todo, para no perder el
         foco a mitad de un numero. Solo se redibuja lo que depende del
         valor: la chapa, el resumen de la fila y el monto. */
      todos('input[data-f]', 'input', function (e) {
        var it = itemPorId(parseInt(e.target.getAttribute('data-id'), 10));
        if (!it) return;
        it[e.target.getAttribute('data-f')] = e.target.value;
        refrescar();
      });

      /* Pills de espesor y de modo */
      todos('[data-f="espesor"]', 'click', function (e) {
        var b = e.currentTarget;
        var it = itemPorId(parseInt(b.getAttribute('data-id'), 10));
        if (!it) return;
        it.espesor = num(b.getAttribute('data-v'));
        pintar();
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

      /* Stepper de cantidad */
      todos('[data-step]', 'click', function (e) {
        var b = e.currentTarget;
        var it = itemPorId(parseInt(b.getAttribute('data-id'), 10));
        if (!it) return;
        var v = Math.max(1, Math.floor(num(it.cantidad)) || 1) + parseInt(b.getAttribute('data-step'), 10);
        it.cantidad = Math.min(500, Math.max(1, v));
        var campo = root.querySelector('#cant-' + it.id);
        if (campo) campo.value = it.cantidad;
        refrescar();
      });

      /* Abrir / cerrar la fila. Una sola abierta a la vez. */
      todos('[data-abrir]', 'click', function (e) {
        var id = parseInt(e.currentTarget.getAttribute('data-abrir'), 10);
        var f = faltaPiezas(st);
        if (f && st.items[f.idx].id !== id) { st.tocado = true; }
        st.abierto = id;
        pintar();
      });
      todos('[data-cerrar]', 'click', function () {
        var f = faltaPiezas(st);
        if (f) { st.tocado = true; st.abierto = st.items[f.idx].id; pintar(); return; }
        st.abierto = null; st.tocado = false; pintar();
      });
      todos('[data-del]', 'click', function (e) {
        var id = parseInt(e.currentTarget.getAttribute('data-del'), 10);
        st.items = st.items.filter(function (x) { return x.id !== id; });
        if (st.abierto === id) st.abierto = null;
        pintar();
      });
      on('[data-add]', 'click', function () {
        var it = nuevoItem();
        st.items.push(it);
        st.abierto = it.id;
        st.tocado = false;
        track('estimador_item_agregado', { items: st.items.length });
        pintar();
        var nuevo = root.querySelector('.est-fila-ed');
        if (nuevo && nuevo.scrollIntoView) nuevo.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });

      todos('[data-op]', 'click', function (e) {
        var b = e.currentTarget;
        var it = itemPorId(parseInt(b.getAttribute('data-id'), 10));
        if (!it) return;
        it[b.getAttribute('data-op')] = !it[b.getAttribute('data-op')];
        pintar();
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

      todos('[data-chapa]', 'click', function (e) {
        st.chapa = e.currentTarget.getAttribute('data-chapa');
        track('estimador_chapa', { chapa: st.chapa });
        pintar();
      });

      /* Datos de contacto: al completarse la puerta hay que repintar para
         destapar el monto y habilitar el boton, pero repintar en cada
         tecla tira el foco. Se repinta solo cuando cambia el estado de la
         puerta (cerrada -> abierta o al reves). */
      todos('input[data-d]', 'input', function (e) {
        var antes = !falta(st).length;
        st[e.target.getAttribute('data-d')] = e.target.value;
        var ahora = !falta(st).length;
        if (antes !== ahora) {
          var id = e.target.id, pos = e.target.selectionStart;
          pintar();
          var vuelto = root.querySelector('#' + id);
          if (vuelto) {
            vuelto.focus();
            try { vuelto.setSelectionRange(pos, pos); } catch (err) {}
          }
          if (ahora) {
            track('estimador_total', datosConversion(calcTotal(st)));
            guardarConsulta(st, calcTotal(st));
          }
        } else {
          refrescar();
        }
      });

      /* Boton apagado: en vez de no hacer nada, lleva a lo que falta. */
      todos('[data-cta]', 'click', function () {
        var el = root.querySelector('.est-datos input');
        if (el) { el.focus(); if (el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        var caja = root.querySelector('.est-datos');
        if (caja) { caja.classList.remove('pide'); void caja.offsetWidth; caja.classList.add('pide'); }
      });

      on('[data-nav="wa"]', 'click', function () {
        track('estimador_whatsapp', datosConversion(calcTotal(st)));
        guardarConsulta(st, calcTotal(st));
        marcarEnviado();
      });
      on('[data-nav="pdf"]', 'click', function () { bajarPdf(); });
    }

    /* Descargar la hoja. Guarda el lead igual que el WhatsApp: el que se
       lleva el PDF muchas veces se lo pasa a SU cliente y no escribe nunca,
       asi que si no lo registramos acá se pierde igual que antes.
       El guardado es idempotente —una fila por sesion del estimador— y no
       bloquea la impresion: si la base no responde, el PDF sale igual. */
    function bajarPdf() {
      var t = calcTotal(st);
      if (falta(st).length) return;
      track('estimador_pdf', datosConversion(t));
      guardarConsulta(st, t);
      marcarPdf();

      var caja = document.getElementById('cot-pdf');
      if (!caja) {
        caja = document.createElement('div');
        caja.id = 'cot-pdf';
        caja.setAttribute('aria-hidden', 'true');
        document.body.appendChild(caja);
      }
      caja.innerHTML = hojaPdf(st, t);
      document.documentElement.classList.add('cot-imprimiendo');

      /* Un frame para que el navegador aplique los estilos y decodifique el
         logo antes de abrir el dialogo; si no, sale la hoja sin membrete. */
      var listo = function () {
        window.print();
        document.documentElement.classList.remove('cot-imprimiendo');
      };
      var img = caja.querySelector('img');
      if (img && !img.complete) {
        img.addEventListener('load', listo, { once: true });
        img.addEventListener('error', listo, { once: true });
        setTimeout(listo, 1500);   // si la imagen nunca resuelve, igual se imprime
      } else {
        requestAnimationFrame(function () { requestAnimationFrame(listo); });
      }
    }

    /* Repinta lo que depende de los numeros sin tocar los campos que se
       estan tipeando: el dibujo de la chapa, el resumen de cada fila
       cerrada y el bloque del total. */
    var pendiente = null;
    function refrescar() {
      if (pendiente) clearTimeout(pendiente);
      pendiente = setTimeout(function () {
        pendiente = null;
        var t = calcTotal(st);

        var nest = root.querySelector('.est-col-nest');
        if (nest) {
          nest.innerHTML = columnaNesting(t);
          nest.querySelectorAll('[data-chapa]').forEach(function (b) {
            b.addEventListener('click', function () {
              st.chapa = b.getAttribute('data-chapa');
              track('estimador_chapa', { chapa: st.chapa });
              pintar();
            });
          });
        }

        var viejo = root.querySelector('.est-total');
        if (viejo) {
          var tmp = document.createElement('div');
          tmp.innerHTML = total(t);
          viejo.replaceWith(tmp.firstChild);
          root.querySelectorAll('[data-cta]').forEach(function (c) {
            c.addEventListener('click', function () {
              var el = root.querySelector('.est-datos input');
              if (el) { el.focus(); if (el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
              var caja = root.querySelector('.est-datos');
              if (caja) { caja.classList.remove('pide'); void caja.offsetWidth; caja.classList.add('pide'); }
            });
          });
          var wa = root.querySelector('[data-nav="wa"]');
          if (wa) wa.addEventListener('click', function () {
            track('estimador_whatsapp', datosConversion(calcTotal(st)));
            guardarConsulta(st, calcTotal(st));
            marcarEnviado();
          });
          var bpdf = root.querySelector('[data-nav="pdf"]');
          if (bpdf) bpdf.addEventListener('click', function () { bajarPdf(); });
        }

        /* el resumen de las filas cerradas tambien cambia */
        st.items.forEach(function (it, i) {
          if (st.abierto === it.id) return;
          var b = root.querySelector('[data-abrir="' + it.id + '"]');
          if (!b) return;
          var m = t.items[i] || {};
          var d = b.querySelector('.est-desc');
          var s = b.querySelector('.est-sub');
          if (d) d.innerHTML = resumenItem(it);
          if (s) s.textContent = m.revision ? 'a revisar' : m.subtotal ? money(m.subtotal) : '—';
        });

        /* y el precio unitario del item abierto */
        var abierto = st.items.filter(function (x) { return x.id === st.abierto; })[0];
        if (abierto) {
          var idx = st.items.indexOf(abierto);
          var m2 = t.items[idx] || {};
          var u = root.querySelector('.est-ed-unit');
          if (u) u.textContent = m2.revision ? 'sin precio hasta revisar el plano'
            : m2.subtotal ? money(m2.subtotal / m2.cantidad) + ' / u' : '';
        }
      }, 90);
    }
  }

  window.PlasmartCotizador = { mount: mount };
})();
