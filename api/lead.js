/* ============================================================
   PLASMART — Consultas del estimador (Vercel Serverless Function)

   Guarda en Plasmart OT lo que el visitante cargo en el estimador,
   apenas completa sus datos y ANTES de abrir WhatsApp. Si abandona en
   la pantalla del numero, el contacto igual queda: hasta ahora se
   perdia entero.

   Tabla: public.cotizaciones_web
     accion 'estimado'   -> inserta la fila y devuelve { id }
     accion 'enviado_wa' -> marca esa fila como enviada (pide id + token)

   El token lo genera el navegador y viaja en el insert. Sin el no se
   puede tocar una fila: es lo unico que impide que cualquiera marque
   como enviadas las consultas de otros.

   Variables de entorno (las mismas que /api/tarifa):
     SUPABASE_URL      https://xgoopnjklodmqxopjafv.supabase.co
     SUPABASE_API_KEY  key con permiso de escritura (service_role)

   Aca si hace falta la secreta: cotizaciones_web tiene RLS activo y
   ninguna policy para anon, justamente para que la lista de contactos
   no quede colgada de la key publica.
   ============================================================ */
'use strict';

var TABLA = 'cotizaciones_web';
var MAX_BODY = 24 * 1024; // un estimado de 20 items no llega ni a la mitad
var MAX_ITEMS = 20;

/* ---------- utilidades de saneo ----------
   Todo lo que entra es de un formulario publico. Nada se guarda como
   viene: se recorta, se convierte y se descarta lo que no reconocemos. */
function texto(v, max) {
  if (v === null || v === undefined) return null;
  /* fuera saltos de linea y caracteres de control: ensucian el WhatsApp
     del vendedor y no aportan nada a un nombre ni a un telefono */
  var s = String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.slice(0, max || 120);
}
function numero(v, min, max) {
  var n = Number(v);
  if (!isFinite(n)) return 0;
  if (n < min) return min;
  if (n > max) return max;
  return Math.round(n * 1e4) / 1e4;
}
function bool(v) { return v === true || v === 'true' || v === 1; }

function itemLimpio(x) {
  if (!x || typeof x !== 'object') return null;
  var modo = texto(x.modo, 10);
  return {
    modo: (modo === 'm2' || modo === 'dxf') ? modo : 'medidas',
    espesor_mm: numero(x.espesor_mm, 0, 100),
    ancho_mm: numero(x.ancho_mm, 0, 100000),
    largo_mm: numero(x.largo_mm, 0, 100000),
    m2: numero(x.m2, 0, 100000),
    cantidad: Math.round(numero(x.cantidad, 0, 100000)),
    plegado: bool(x.plegado),
    pliegues: Math.round(numero(x.pliegues, 0, 999)),
    dxf: texto(x.dxf, 160),
    peso_kg: numero(x.peso_kg, 0, 1e7),
    subtotal: numero(x.subtotal, 0, 1e9),
    revision: bool(x.revision)
  };
}

/* El body llega como text/plain a proposito: un POST con
   Content-Type: application/json dispara un preflight OPTIONS, y el
   preflight NO sigue redirecciones. Como vercel.json manda www al apex
   con un 308, ese preflight moriria ahi. Con text/plain el pedido es
   "simple", no hay preflight, y el 308 se sigue sin drama. */
function leerBody(req) {
  return new Promise(function (resolve) {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    if (typeof req.body === 'string') {
      try { return resolve(JSON.parse(req.body)); } catch (e) { return resolve(null); }
    }
    var crudo = '';
    var corto = false;
    req.on('data', function (c) {
      if (corto) return;
      crudo += c;
      if (crudo.length > MAX_BODY) { corto = true; crudo = ''; }
    });
    req.on('end', function () {
      if (corto || !crudo) return resolve(null);
      try { resolve(JSON.parse(crudo)); } catch (e) { resolve(null); }
    });
    req.on('error', function () { resolve(null); });
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');

  /* Mismo criterio que /api/tarifa: solo se refleja el origen si es uno
     de los nuestros. Nunca "*". */
  var ORIGENES = [
    'https://plasmartcba.com',
    'https://www.plasmartcba.com',
    'https://plasmart-website.vercel.app'
  ];
  var origen = req.headers.origin;
  var propio = !!origen && (ORIGENES.indexOf(origen) >= 0 ||
    /^https:\/\/plasmart-website-[\w-]+\.vercel\.app$/.test(origen));
  if (propio) {
    res.setHeader('Access-Control-Allow-Origin', origen);
    res.setHeader('Vary', 'Origin');
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, motivo: 'metodo' });

  function log(o) {
    try { console.log('[lead] ' + JSON.stringify(o)); } catch (e) {}
  }

  var url = process.env.SUPABASE_URL;
  var key = process.env.SUPABASE_API_KEY;
  if (!url || !key) {
    log({ ok: false, motivo: 'sin_credenciales' });
    /* 200 a proposito: el visitante no tiene por que enterarse ni ver un
       error en consola. Guardar el lead es asunto nuestro, no suyo. */
    return res.status(200).json({ ok: false, motivo: 'sin_credenciales' });
  }
  var base = url.replace(/\/+$/, '') + '/rest/v1/' + TABLA;
  var headers = {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json'
  };

  var body = await leerBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(200).json({ ok: false, motivo: 'body' });
  }

  try {
    /* ---- marcar una consulta ya guardada como enviada por WhatsApp ---- */
    if (body.accion === 'enviado_wa') {
      var id = parseInt(body.id, 10);
      var token = texto(body.token, 64);
      if (!id || !token) return res.status(200).json({ ok: false, motivo: 'faltan_datos' });

      var q = base + '?id=eq.' + encodeURIComponent(id) +
              '&token=eq.' + encodeURIComponent(token) + '&estado=eq.estimado';
      var ru = await fetch(q, {
        method: 'PATCH',
        headers: Object.assign({}, headers, { 'Prefer': 'return=minimal' }),
        body: JSON.stringify({ estado: 'enviado_wa', enviado_wa_at: new Date().toISOString() })
      });
      if (!ru.ok) throw new Error('patch ' + ru.status + ' ' + (await ru.text()).slice(0, 200));
      log({ ok: true, accion: 'enviado_wa', id: id });
      return res.status(200).json({ ok: true });
    }

    /* ---- guardar la consulta ---- */
    var nombre = texto(body.nombre, 120);
    var telefono = texto(body.telefono, 60);
    var mail = texto(body.mail, 120);
    var tok = texto(body.token, 64);

    /* La misma puerta que la del navegador, revalidada del lado del
       servidor: nombre + (telefono o mail). Sin eso no es un lead. */
    if (!nombre || (!telefono && !mail) || !tok) {
      return res.status(200).json({ ok: false, motivo: 'faltan_datos' });
    }

    var items = Array.isArray(body.items)
      ? body.items.slice(0, MAX_ITEMS).map(itemLimpio).filter(Boolean)
      : [];

    var fila = {
      nombre: nombre,
      telefono: telefono,
      mail: mail,
      ciudad: texto(body.ciudad, 120),
      items: items,
      material: texto(body.material, 60) || 'Chapa negra',
      peso_total_kg: numero(body.peso_total_kg, 0, 1e7),
      chapa: texto(body.chapa, 40),
      chapas: Math.round(numero(body.chapas, 0, 9999)),
      aprovechamiento_pct: (body.aprovechamiento_pct === null ||
                            body.aprovechamiento_pct === undefined)
        ? null : numero(body.aprovechamiento_pct, 0, 100),
      precio_kg: numero(body.precio_kg, 0, 1e7),
      total_sin_iva: numero(body.total_sin_iva, 0, 1e11),
      minimo_aplicado: bool(body.minimo_aplicado),
      requiere_revision: bool(body.requiere_revision),
      estado: 'estimado',
      origen: texto(body.origen, 80),
      /* Identificadores de click: son la unica forma de cruzar despues el
         lead con la campaña que lo trajo y de subir la venta a Google Ads
         como conversion offline cuando la cotizacion se confirma. */
      gclid: texto(body.gclid, 200),
      fbclid: texto(body.fbclid, 200),
      referer: texto(req.headers.referer, 300),
      user_agent: texto(req.headers['user-agent'], 300),
      token: tok
    };

    var ri = await fetch(base, {
      method: 'POST',
      headers: Object.assign({}, headers, { 'Prefer': 'return=representation' }),
      body: JSON.stringify(fila)
    });
    if (!ri.ok) throw new Error('insert ' + ri.status + ' ' + (await ri.text()).slice(0, 200));

    var creada = await ri.json();
    var nuevoId = Array.isArray(creada) && creada[0] ? creada[0].id : null;
    log({ ok: true, accion: 'estimado', id: nuevoId, items: items.length, total: fila.total_sin_iva });
    return res.status(200).json({ ok: true, id: nuevoId });
  } catch (e) {
    /* Que no se pueda guardar el lead no puede romperle el estimado a
       nadie: se loguea y el sitio sigue como si nada. */
    log({ ok: false, motivo: 'base_no_disponible', error: String((e && e.message) || e) });
    return res.status(200).json({ ok: false, motivo: 'base_no_disponible' });
  }
};
