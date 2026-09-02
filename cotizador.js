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
  var enEspera = [];                // mounts que pidieron la tarifa mientras bajaba

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
      modo: 'medidas',            // 'medidas' | 'm2' | 'dxf'
      ancho: 400, largo: 250, m2: 1,
      dxfNombre: null, dxfOk: false, dxfMotivos: null, dxfLeyendo: false,
      cantidad: 10,
      plegado: false, pliegues: 2,
      nombre: '', telefono: '', email: '', ciudad: '',
      tocado: false,
      ref: 'EST-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' +
           String(Date.now()).slice(-4)
    };
  }

  /* ---------- calculo ----------
     Peso = superficie x espesor x densidad x cantidad. El precio es
     peso x $/kg y nada mas: el plegado NO esta contemplado, lo suma el
     vendedor. Despues se aplican los minimos. */
  function calc(st) {
    var areaPieza = st.modo === 'm2' ? num(st.m2) : (num(st.ancho) * num(st.largo)) / 1e6;
    var cant = Math.max(1, Math.floor(num(st.cantidad)) || 1);
    var dens = (tarifa && tarifa.densidad) || DENSIDAD;
    var peso = areaPieza * (num(st.espesor) / 1000) * dens * cant;

    /* Un plano que no podemos leer con confianza no produce numero: ni
       aproximado, ni tachado, ni entre parentesis. */
    var revision = st.modo === 'dxf' && !!st.dxfMotivos;
    var precioKg = tarifa && tarifa.precio_kg_sin_iva;
    var sinPrecio = revision || !precioKg || !(peso > 0);

    if (sinPrecio) {
      return { peso: peso, cantidad: cant, sinPrecio: true, revision: revision };
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
      peso: peso, cantidad: cant, sinPrecio: false, revision: false,
      precioKg: precioKg, bruto: bruto,
      subtotal: subtotal, minimoAplicado: minimoAplicado,
      minimoMonto: minimoAplicado === 'pedido' ? minPedido : minItem,
      iva: iva, ivaPct: (tarifa.iva_pct || 21), total: subtotal + iva
    };
  }

  /* ---------- gate del paso 1 ----------
     Medidas o superficie en cero no son "sin tarifa": son un dato que
     falta, y hay que decirlo aca y no en el paso 3 culpando al sistema. */
  function faltaPieza(st) {
    var f = [];
    if (st.modo === 'medidas' && !(num(st.ancho) > 0 && num(st.largo) > 0)) f.push('el ancho y el largo');
    if (st.modo === 'm2' && !(num(st.m2) > 0)) f.push('la superficie por pieza');
    if (st.modo === 'dxf' && !st.dxfNombre) f.push('el archivo DXF');
    if (!(Math.floor(num(st.cantidad)) >= 1)) f.push('una cantidad de 1 o más');
    return f;
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
    if (st.modo === 'm2') {
      L.push('Superficie: ' + num(st.m2).toLocaleString('es-AR') + ' m2 por pieza');
    } else if (st.modo === 'dxf') {
      L.push('Plano: ' + (st.dxfNombre || '—'));
      if (st.dxfOk) L.push('Medidas leidas del plano: ' + num(st.ancho) + ' x ' + num(st.largo) + ' mm');
    } else {
      L.push('Medidas: ' + num(st.ancho) + ' x ' + num(st.largo) + ' mm');
    }
    L.push('Cantidad: ' + m.cantidad + ' u');
    L.push('Proceso: Corte laser');
    L.push('Plegado: ' + (st.plegado
      ? 'si, ' + Math.max(1, Math.floor(num(st.pliegues)) || 1) + ' pliegues (NO incluido en el precio)'
      : 'no'));
    L.push('Peso estimado: ' + kg(m.peso));
    L.push('');

    if (m.revision) {
      L.push('*** REQUIERE REVISION DE PLANO ***');
      L.push('Archivo: ' + (st.dxfNombre || '—'));
      (st.dxfMotivos || []).forEach(function (mot) { L.push('- ' + mot); });
      L.push('No se calculo precio. A cotizar por el vendedor con el plano a la vista.');
    } else if (m.sinPrecio) {
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
  /* Si el modal se abre, se cierra y se reabre antes de que responda la
     API, el segundo mount espera al mismo fetch en vez de pintar "sin
     precio" con tarifa vacia. */
  function cargarTarifa(cb) {
    if (tarifa) { cb(); return; }
    enEspera.push(cb);
    if (cargando) return;
    cargando = true;
    /* El mes en la URL no es un truco anti-cache al azar: la tarifa cambia
       una vez por mes, asi que esa es su clave natural. De paso evita que
       una copia guardada de un mes anterior (o de un fallo viejo) se pueda
       servir en lugar de la respuesta real. */
    var mes = new Date().toISOString().slice(0, 7);
    fetch('/api/tarifa?m=' + mes)
      .then(function (r) { return r.json(); })
      .then(function (t) { tarifa = t; })
      .catch(function () { tarifa = { precio_kg_sin_iva: null }; })
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
        '<button type="button" class="cot-segb' + (st.modo === 'dxf' ? ' on' : '') + '" data-modo="dxf">Plano DXF</button>' +
      '</div>' +

      (st.modo === 'medidas'
        ? '<div class="cot-grid">' +
            '<div class="mf-row"><label for="cot-an">Ancho (mm)</label>' +
              '<input id="cot-an" type="number" inputmode="numeric" min="1" value="' + esc(st.ancho) + '" /></div>' +
            '<div class="mf-row"><label for="cot-la">Largo (mm)</label>' +
              '<input id="cot-la" type="number" inputmode="numeric" min="1" value="' + esc(st.largo) + '" /></div>' +
          '</div>'
        : st.modo === 'm2'
        ? '<div class="mf-row"><label for="cot-m2">Superficie por pieza (m²)</label>' +
            '<input id="cot-m2" type="number" inputmode="decimal" min="0.01" step="0.01" value="' + esc(st.m2) + '" /></div>'
        : bloqueDxf()) +

      '<div class="cot-ops">' +
        '<button type="button" class="cot-chk' + (st.plegado ? ' on' : '') + '" data-op="plegado" aria-pressed="' + st.plegado + '">' +
          '<span class="cot-box"></span>Lleva plegado</button>' +
        (st.plegado
          ? '<div class="mf-row cot-inline"><label for="cot-pl">Pliegues</label>' +
            '<input id="cot-pl" type="number" inputmode="numeric" min="1" step="1" value="' + esc(st.pliegues) + '" /></div>'
          : '') +
      '</div>' +

      '<p class="cot-note">El plegado <b>no está incluido</b> en este estimado. ' +
      'Marcalo igual: viaja en la consulta y el vendedor lo suma cuando arme el presupuesto final.</p>' +

      (st.tocado && faltaPieza(st).length
        ? '<p class="cot-err" role="alert">Falta ' + faltaPieza(st).join(' y ') + '.</p>' : '') +

      '<p class="cot-note cot-note-alt">¿Inoxidable, aluminio u otro material? No los estimamos online porque ' +
      'el precio varía mucho según disponibilidad. ' +
      '<a href="/whatsapp/?src=cotizador-material" target="_blank" rel="noopener">Consultanos directo</a>.</p>';
    }

    /* ---- Bloque DXF del Paso 1 ----
       Un plano puede venir bien (medidas leidas) o no (motivos). En el
       segundo caso el estimador ya no va a mostrar precio, y conviene
       decirlo aca y no al final. */
    function bloqueDxf() {
      var h = '<div class="cot-file">' +
        '<input id="cot-dxf" type="file" accept=".dxf,application/dxf,image/vnd.dxf" />' +
        '<label class="cot-filebtn" for="cot-dxf">' +
          '<span>' + (st.dxfNombre ? 'Elegir otro plano' : 'Elegir archivo DXF') + '</span>' +
        '</label>' +
        (st.dxfNombre ? '<span class="cot-filename mono">' + esc(st.dxfNombre) + '</span>' : '') +
      '</div>';

      if (st.dxfLeyendo) return h + '<p class="cot-hint mono">Leyendo el plano…</p>';

      if (st.dxfOk) {
        h += '<div class="cot-ok"><b>Leímos ' + fmtMm(st.ancho) + ' × ' + fmtMm(st.largo) + ' mm</b>' +
             '<br />Si no coincide con tu pieza, cargala por medidas.</div>';
      } else if (st.dxfMotivos) {
        h += '<div class="cot-warn"><b>No podemos estimar este plano con confianza.</b><ul>';
        st.dxfMotivos.forEach(function (m) { h += '<li>' + esc(m) + '</li>'; });
        h += '</ul>Podés seguir igual: mandamos la consulta con el plano marcado ' +
             'para que un asesor lo revise y te pase el número.</div>';
      } else {
        h += '<p class="cot-hint mono">DXF en milímetros, contornos cerrados, sin bloques.</p>';
      }
      return h;
    }

    function fmtMm(v) { return num(v).toLocaleString('es-AR', { maximumFractionDigits: 1 }); }

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
          : st.modo === 'dxf'
          ? esc(st.dxfNombre || 'plano') + (st.dxfOk ? ' · ' + num(st.ancho) + ' × ' + num(st.largo) + ' mm' : '') +
            ' × ' + m.cantidad + ' u'
          : num(st.ancho) + ' × ' + num(st.largo) + ' mm × ' + m.cantidad + ' u');
      filas += fila('Peso estimado', m.revision ? '—' : kg(m.peso));

      if (m.revision) {
        var li = '';
        (st.dxfMotivos || []).forEach(function (x) { li += '<li>' + esc(x) + '</li>'; });
        return '<div class="cot-est">' + filas + '</div>' +
          '<div class="cot-warn"><b>Este plano necesita que lo revise un asesor.</b><ul>' + li + '</ul>' +
          'Por eso no te mostramos un precio: preferimos no darte un número que después no se sostenga. ' +
          'Mandá la consulta y te lo devolvemos revisado.</div>' +
          canonica();
      }

      if (m.sinPrecio) {
        return '<div class="cot-est">' + filas + '</div>' +
          '<div class="cot-warn"><b>' + (m.peso > 0
            ? 'No podemos mostrarte un precio ahora mismo.'
            : 'Con estas medidas la pieza no tiene peso.') + '</b><br />' +
          (m.peso > 0
            ? 'Mandanos igual la consulta: ya lleva la pieza cargada y un asesor te pasa el número.'
            : 'Volvé al paso 1 y revisá el ancho, el largo o la superficie.') + '</div>' +
          canonica();
      }

      filas += fila('Subtotal (sin IVA)', money(m.subtotal),
        m.minimoAplicado ? 'Se aplicó el mínimo por ' + m.minimoAplicado + '.' : null);
      filas += fila('IVA ' + m.ivaPct + '%', money(m.iva));
      filas += fila('Flete', 'A cotizar', 'Según la ciudad de entrega.');
      filas += fila('Total', money(m.total), 'No incluye flete.', true);

      return '<div class="cot-est">' + filas + '</div>' +
        (st.plegado
          ? '<p class="cot-note">Este total <b>no incluye el plegado</b>. ' +
            'El vendedor lo suma al armar el presupuesto final.</p>'
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
        b.addEventListener('click', function () {
          var modo = b.getAttribute('data-modo');
          if (modo === 'dxf' && !window.PlasmartDxf) {
            set('modo', modo); set('dxfLeyendo', true); pintar();
            cargarDxf(function (ok) {
              set('dxfLeyendo', false);
              if (!ok) set('dxfMotivos', ['No pudimos cargar el lector de planos. Cargá la pieza por medidas.']);
              pintar();
            });
            return;
          }
          set('modo', modo); pintar();
        });
      });

      /* Lectura del plano: pase lo que pase, el resultado se guarda en el
         estado y se vuelve a pintar. Nunca tira una excepcion a la cara. */
      on('#cot-dxf', 'change', function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        set('dxfNombre', file.name);
        set('dxfOk', false); set('dxfMotivos', null); set('dxfLeyendo', true);
        pintar();

        var fr = new FileReader();
        fr.onload = function () {
          var r;
          try { r = window.PlasmartDxf.revisar(String(fr.result)); }
          catch (err) { r = { ok: false, motivos: ['No pudimos leer el archivo.'] }; }
          set('dxfLeyendo', false);
          if (r.ok) {
            set('dxfOk', true); set('dxfMotivos', null);
            set('ancho', r.ancho); set('largo', r.largo);
            track('estimador_dxf_ok');
          } else {
            set('dxfOk', false); set('dxfMotivos', r.motivos);
            track('estimador_dxf_revision');
          }
          pintar();
        };
        fr.onerror = function () {
          set('dxfLeyendo', false);
          set('dxfMotivos', ['No pudimos leer el archivo.']);
          pintar();
        };
        fr.readAsText(file);
      });
      root.querySelectorAll('[data-op]').forEach(function (b) {
        b.addEventListener('click', function () {
          var k = b.getAttribute('data-op'); set(k, !st[k]); pintar();
        });
      });

      on('[data-nav="atras"]', 'click', function () { st.paso--; st.tocado = false; pintar(); scrollTop(); });
      on('[data-nav="seguir"]', 'click', function () {
        if (st.paso === 1 && faltaPieza(st).length) { st.tocado = true; pintar(); return; }
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
