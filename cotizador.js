/* ============================================================
   PLASMART — Estimador de corte laser (modo rapido)

   Da un numero orientativo en menos de un minuto y lo manda al vendedor
   por WhatsApp con los importes ya calculados, para que las dos partes
   arranquen con parte del trabajo hecho.

   NO es un presupuesto. Un humano confirma plano, nesting y material.

   Los precios NO estan aca: salen de /api/tarifa, que los lee de
   Plasmart OT. Si el endpoint no responde, el estimador pasa a modo
   "consultar" y no muestra ningun numero.

   Se monta con PlasmartCotizador.mount(elemento) — lo usan tanto
   /cotizador/ como el modal del home.
   ============================================================ */
(function () {
  'use strict';

  var WA = '5493513820321';
  var DENSIDAD = 7850;              // fallback si /api/tarifa no llega
  var MATERIAL = 'Chapa negra';     // el sitio solo estima negra

  var tarifa = null;                // lo que devuelve /api/tarifa
  var cargando = false;

  /* ---------- helpers ---------- */
  function num(v) { var n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; }
  function esc(s) { return String(s).replace(/[<>&"]/g, function (c) {
    return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); }
  function money(n) {
    return isFinite(n) ? n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }) : '—';
  }
  function kg(n) { return n.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' kg'; }
  function track(ev) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: ev });
  }

  /* ---------- estado ---------- */
  function nuevoEstado() {
    return {
      paso: 1,
      espesor: 3,
      modo: 'medidas',            // 'medidas' | 'm2'
      ancho: 400, largo: 250, m2: 1,
      cantidad: 10,
      plegado: false, pliegues: 2,
      calado: false,
      nombre: '', telefono: '', email: '', ciudad: '',
      tocado: false,
      ref: 'EST-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' +
           String(Date.now()).slice(-4)
    };
  }

  /* ---------- calculo ----------
     Peso = superficie x espesor x densidad x cantidad. El precio es
     peso x $/kg y nada mas: plegado y calado NO estan contemplados,
     los suma el vendedor. Despues se aplican los minimos. */
  function calc(st) {
    var areaPieza = st.modo === 'm2' ? num(st.m2) : (num(st.ancho) * num(st.largo)) / 1e6;
    var cant = Math.max(1, Math.floor(num(st.cantidad)) || 1);
    var dens = (tarifa && tarifa.densidad) || DENSIDAD;
    var peso = areaPieza * (num(st.espesor) / 1000) * dens * cant;

    var precioKg = tarifa && tarifa.precio_kg_sin_iva;
    var sinPrecio = !precioKg || !(peso > 0);

    if (sinPrecio) {
      return { peso: peso, cantidad: cant, sinPrecio: true };
    }

    var bruto = peso * precioKg;
    var minItem = (tarifa.minimo_item_sin_iva || 0);
    var minPedido = (tarifa.minimo_pedido_sin_iva || 0);

    var subtotal = bruto;
    var minimoAplicado = null;
    if (subtotal < minItem) { subtotal = minItem; minimoAplicado = 'item'; }
    if (subtotal < minPedido) { subtotal = minPedido; minimoAplicado = 'pedido'; }

    var iva = subtotal * ((tarifa.iva_pct || 21) / 100);

    return {
      peso: peso, cantidad: cant, sinPrecio: false,
      precioKg: precioKg, bruto: bruto,
      subtotal: subtotal, minimoAplicado: minimoAplicado,
      minimoMonto: minimoAplicado === 'pedido' ? minPedido : minItem,
      iva: iva, ivaPct: (tarifa.iva_pct || 21), total: subtotal + iva
    };
  }

  /* ---------- lead gate ----------
     Sin nombre + (telefono o email) + ciudad no se muestra el total
     ni se habilita WhatsApp. */
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
  function waMessage(st, m) {
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
    L.push('— Pieza —');
    L.push('Material: ' + MATERIAL);
    L.push('Espesor: ' + st.espesor + ' mm');
    L.push(st.modo === 'm2'
      ? 'Superficie: ' + num(st.m2).toLocaleString('es-AR') + ' m2 por pieza'
      : 'Medidas: ' + num(st.ancho) + ' x ' + num(st.largo) + ' mm');
    L.push('Cantidad: ' + m.cantidad + ' u');
    L.push('Proceso: Corte laser');
    L.push('Plegado: ' + (st.plegado
      ? 'si, ' + Math.max(1, Math.floor(num(st.pliegues)) || 1) + ' pliegues (NO incluido en el precio)'
      : 'no'));
    L.push('Calado/perforado: ' + (st.calado ? 'si (NO incluido en el precio)' : 'no'));
    L.push('Peso estimado: ' + kg(m.peso));
    L.push('');

    if (m.sinPrecio) {
      L.push('— Estimado —');
      L.push('SIN PRECIO: la tarifa no estaba disponible. A cotizar por el vendedor.');
    } else {
      L.push('— Estimado —');
      L.push('$/kg aplicado: ' + Math.round(m.precioKg).toLocaleString('es-AR') +
             (tarifa.vigencia ? '  (vigencia ' + tarifa.vigencia + ')' : ''));
      L.push('Subtotal s/IVA: ' + money(m.subtotal));
      L.push('Minimo: ' + (m.minimoAplicado
        ? 'se aplico el minimo por ' + m.minimoAplicado + ' (' + money(m.minimoMonto) + ')'
        : 'no aplica'));
      L.push('IVA ' + m.ivaPct + '%: ' + money(m.iva));
      L.push('TOTAL: ' + money(m.total));
      L.push('Flete: a cotizar');
    }
    L.push('');
    L.push('Precio orientativo. No es un presupuesto cerrado.');
    return L.join('\n');
  }

  /* ---------- carga de tarifa ---------- */
  function cargarTarifa(cb) {
    if (tarifa || cargando) { cb(); return; }
    cargando = true;
    fetch('/api/tarifa')
      .then(function (r) { return r.json(); })
      .then(function (t) { tarifa = t; })
      .catch(function () { tarifa = { precio_kg_sin_iva: null }; })
      .then(function () { cargando = false; cb(); });
  }

  /* =========================================================
     RENDER
     ========================================================= */
  function mount(root) {
    var st = nuevoEstado();
    root.innerHTML = '<div class="cot-load mono">Cargando…</div>';
    cargarTarifa(function () { pintar(); });

    function set(k, v) { st[k] = v; }

    function pintar() {
      var m = calc(st);
      root.innerHTML =
        head() +
        '<div class="cot-body">' +
          (st.paso === 1 ? paso1() : st.paso === 2 ? paso2() : paso3(m)) +
        '</div>' +
        pie(m);
      wire(m);
    }

    function head() {
      var titulos = ['Tu pieza', 'Tus datos', 'Tu estimado'];
      var subs = ['Chapa negra, corte laser.', 'Para poder pasarte el numero.', 'Orientativo, para arrancar.'];
      var bar = '';
      for (var i = 1; i <= 3; i++) bar += '<span class="cot-dot' + (i <= st.paso ? ' on' : '') + '"></span>';
      return '<div class="cot-head">' +
        '<div class="cot-steps"><span class="mono">Paso ' + st.paso + '/3</span>' +
        '<div class="cot-bar">' + bar + '</div></div>' +
        '<h2 class="cot-title">' + titulos[st.paso - 1] + '</h2>' +
        '<p class="cot-sub">' + subs[st.paso - 1] + '</p>' +
      '</div>';
    }

    /* ---- Paso 1: la pieza ---- */
    function paso1() {
      var esp = (tarifa && tarifa.espesores) || [1.2, 2, 3, 4.75, 6, 9.5];
      var opts = esp.map(function (e) {
        return '<option value="' + e + '"' + (num(st.espesor) === e ? ' selected' : '') + '>' + e + ' mm</option>';
      }).join('');

      return '' +
      '<div class="cot-grid">' +
        '<div class="mf-row"><label for="cot-esp">Espesor</label>' +
          '<select id="cot-esp" class="cot-select">' + opts + '</select></div>' +
        '<div class="mf-row"><label for="cot-cant">Cantidad (u)</label>' +
          '<input id="cot-cant" type="number" inputmode="numeric" min="1" step="1" value="' + esc(st.cantidad) + '" /></div>' +
      '</div>' +

      '<div class="cot-seg" role="group" aria-label="Como das la medida">' +
        '<button type="button" class="cot-segb' + (st.modo === 'medidas' ? ' on' : '') + '" data-modo="medidas">Por medidas</button>' +
        '<button type="button" class="cot-segb' + (st.modo === 'm2' ? ' on' : '') + '" data-modo="m2">Por m²</button>' +
      '</div>' +

      (st.modo === 'medidas'
        ? '<div class="cot-grid">' +
            '<div class="mf-row"><label for="cot-an">Ancho (mm)</label>' +
              '<input id="cot-an" type="number" inputmode="numeric" min="1" value="' + esc(st.ancho) + '" /></div>' +
            '<div class="mf-row"><label for="cot-la">Largo (mm)</label>' +
              '<input id="cot-la" type="number" inputmode="numeric" min="1" value="' + esc(st.largo) + '" /></div>' +
          '</div>'
        : '<div class="mf-row"><label for="cot-m2">Superficie por pieza (m²)</label>' +
            '<input id="cot-m2" type="number" inputmode="decimal" min="0.01" step="0.01" value="' + esc(st.m2) + '" /></div>') +

      '<div class="cot-ops">' +
        '<button type="button" class="cot-chk' + (st.plegado ? ' on' : '') + '" data-op="plegado" aria-pressed="' + st.plegado + '">' +
          '<span class="cot-box"></span>Lleva plegado</button>' +
        (st.plegado
          ? '<div class="mf-row cot-inline"><label for="cot-pl">Pliegues</label>' +
            '<input id="cot-pl" type="number" inputmode="numeric" min="1" step="1" value="' + esc(st.pliegues) + '" /></div>'
          : '') +
        '<button type="button" class="cot-chk' + (st.calado ? ' on' : '') + '" data-op="calado" aria-pressed="' + st.calado + '">' +
          '<span class="cot-box"></span>Es calada o perforada</button>' +
      '</div>' +

      '<p class="cot-note">El plegado y el calado <b>no están incluidos</b> en este estimado. ' +
      'Marcalos igual: viajan en la consulta y el vendedor los suma cuando arme el presupuesto final.</p>' +

      '<p class="cot-note cot-note-alt">¿Inoxidable, aluminio u otro material? No los estimamos online porque ' +
      'el precio varía mucho según disponibilidad. ' +
      '<a href="/whatsapp/?src=cotizador-material" target="_blank" rel="noopener">Consultanos directo</a>.</p>';
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
      '<p class="cot-hint mono">Sirve para cotizarte el flete después.</p>' +
      (st.tocado && f.length
        ? '<p class="cot-err" role="alert">Falta ' + f.join(', ') + '.</p>'
        : '');
    }

    /* ---- Paso 3: el estimado ---- */
    function paso3(m) {
      var filas = '';
      function fila(k, v, nota, fuerte) {
        return '<div class="cot-row' + (fuerte ? ' strong' : '') + '">' +
          '<span class="cot-k">' + k + '</span>' +
          '<span class="cot-v">' + v + '</span>' +
          (nota ? '<span class="cot-n">' + nota + '</span>' : '') + '</div>';
      }

      filas += fila('Pieza', esc(MATERIAL) + ' · ' + esc(st.espesor) + ' mm',
        st.modo === 'm2'
          ? num(st.m2).toLocaleString('es-AR') + ' m² × ' + m.cantidad + ' u'
          : num(st.ancho) + ' × ' + num(st.largo) + ' mm × ' + m.cantidad + ' u');
      filas += fila('Peso estimado', kg(m.peso));

      if (m.sinPrecio) {
        return '<div class="cot-est">' + filas + '</div>' +
          '<div class="cot-warn"><b>No podemos mostrarte un precio ahora mismo.</b><br />' +
          'Mandanos igual la consulta: ya lleva la pieza cargada y un asesor te pasa el número.</div>' +
          canonica();
      }

      filas += fila('Subtotal (sin IVA)', money(m.subtotal),
        m.minimoAplicado ? 'Se aplicó el mínimo por ' + m.minimoAplicado + '.' : null);
      filas += fila('IVA ' + m.ivaPct + '%', money(m.iva));
      filas += fila('Flete', 'A cotizar', 'Según la ciudad de entrega.');
      filas += fila('Total', money(m.total), 'No incluye flete.', true);

      return '<div class="cot-est">' + filas + '</div>' +
        (st.plegado || st.calado
          ? '<p class="cot-note">Este total <b>no incluye ' +
            (st.plegado && st.calado ? 'el plegado ni el calado' : st.plegado ? 'el plegado' : 'el calado') +
            '</b>. El vendedor lo suma al armar el presupuesto final.</p>'
          : '') +
        canonica();
    }

    function canonica() {
      return '<p class="cot-legal">Precio orientativo. No es un presupuesto cerrado. Se confirma con plano, ' +
        'nesting real y disponibilidad. Puede variar según forma, calados, piercing y aprovechamiento de chapa. ' +
        'Flete a cotizar.</p>';
    }

    /* ---- pie con navegacion ---- */
    function pie(m) {
      if (st.paso < 3) {
        return '<div class="cot-foot">' +
          (st.paso > 1 ? '<button type="button" class="cot-back mono" data-nav="atras">← Atrás</button>' : '<span></span>') +
          '<button type="button" class="btn btn-solid" data-nav="seguir"><span>' +
          (st.paso === 2 ? 'Ver mi estimado' : 'Seguir') +
          '</span><span class="fill"></span></button>' +
        '</div>';
      }
      var href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent(waMessage(st, m));
      return '<div class="cot-foot">' +
        '<button type="button" class="cot-back mono" data-nav="atras">← Atrás</button>' +
        '<a class="btn btn-solid" href="' + href + '" target="_blank" rel="noopener" data-nav="wa">' +
        '<span>Enviar al vendedor</span><span class="fill"></span></a>' +
      '</div>';
    }

    /* ---- eventos ---- */
    function wire(m) {
      function on(sel, ev, fn) {
        var el = root.querySelector(sel); if (el) el.addEventListener(ev, fn);
      }
      function bind(sel, key, entero) {
        on(sel, 'input', function (e) { set(key, entero ? e.target.value : e.target.value); });
      }

      bind('#cot-esp', 'espesor'); on('#cot-esp', 'change', function (e) { set('espesor', e.target.value); });
      bind('#cot-cant', 'cantidad'); bind('#cot-an', 'ancho'); bind('#cot-la', 'largo');
      bind('#cot-m2', 'm2'); bind('#cot-pl', 'pliegues');
      bind('#cot-nom', 'nombre'); bind('#cot-tel', 'telefono');
      bind('#cot-mail', 'email'); bind('#cot-ciu', 'ciudad');

      root.querySelectorAll('[data-modo]').forEach(function (b) {
        b.addEventListener('click', function () { set('modo', b.getAttribute('data-modo')); pintar(); });
      });
      root.querySelectorAll('[data-op]').forEach(function (b) {
        b.addEventListener('click', function () {
          var k = b.getAttribute('data-op'); set(k, !st[k]); pintar();
        });
      });

      on('[data-nav="atras"]', 'click', function () { st.paso--; st.tocado = false; pintar(); scrollTop(); });
      on('[data-nav="seguir"]', 'click', function () {
        if (st.paso === 2 && falta(st).length) { st.tocado = true; pintar(); return; }
        st.paso++;
        if (st.paso === 2) track('estimador_lead_form');
        if (st.paso === 3) track(calc(st).sinPrecio ? 'estimador_sin_precio' : 'estimador_total');
        pintar(); scrollTop();
      });
      on('[data-nav="wa"]', 'click', function () { track('estimador_whatsapp'); });
    }

    function scrollTop() {
      var sc = root.closest('.modal-card') || root;
      if (sc && sc.scrollTo) sc.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  window.PlasmartCotizador = { mount: mount };
})();
