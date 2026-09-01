/* ============================================================
   PLASMART — Tarifa del estimador (Vercel Serverless Function)

   Unico lugar donde viven los numeros del cotizador. Corre en el
   servidor: ni la key de Supabase ni los minimos llegan al navegador,
   asi que la tarifa no queda publicada para la competencia.

   El $/kg NO esta escrito aca: sale de Plasmart OT, de la funcion
   public.tarifa_web() — promedio de chapa negra del mes anterior + 10%.

   Variables de entorno (Vercel · Settings > Environment Variables):
     SUPABASE_URL          https://xgoopnjklodmqxopjafv.supabase.co
     SUPABASE_SERVICE_KEY  service_role key del proyecto Plasmart OT
   Sin prefijo publico. Si Vercel las expusiera al cliente, se filtra la base.
   ============================================================ */
'use strict';

/* Reglas comerciales. Se editan aca y en ningun otro lado. */
var IVA_PCT = 21;
var MINIMO_PEDIDO_SIN_IVA = 35000; // PENDIENTE de confirmacion comercial
var MINIMO_ITEM_SIN_IVA = 12000;   // PENDIENTE de confirmacion comercial

/* Espesores que Plasmart tiene en catalogo (espesores_chapa en OT). */
var ESPESORES = [0.7, 0.9, 1, 1.2, 1.5, 1.9, 2, 2.5, 3, 4, 4.75, 6, 8, 9.5, 12.7];

var DENSIDAD_ACERO = 7850; // kg/m3, chapa negra

module.exports = async function handler(req, res) {
  /* El estimador consulta esto una vez por sesion; la tarifa cambia una vez
     por mes. Cacheamos en el edge para no pegarle a la base en cada visita. */
  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');

  var base = {
    iva_pct: IVA_PCT,
    minimo_pedido_sin_iva: MINIMO_PEDIDO_SIN_IVA,
    minimo_item_sin_iva: MINIMO_ITEM_SIN_IVA,
    espesores: ESPESORES,
    densidad: DENSIDAD_ACERO
  };

  var url = process.env.SUPABASE_URL;
  var key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    /* Sin credenciales no inventamos un precio: el sitio pasa a "consultar". */
    return res.status(200).json(Object.assign({}, base, {
      precio_kg_sin_iva: null,
      motivo: 'sin_credenciales'
    }));
  }

  try {
    var r = await fetch(url.replace(/\/+$/, '') + '/rest/v1/rpc/tarifa_web', {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: '{}'
    });

    if (!r.ok) throw new Error('rpc ' + r.status);

    var t = await r.json();

    /* tarifa_web() devuelve precio_kg_sin_iva = null si el mes anterior no
       junta al menos 5 items. Preferimos no mostrar numero antes que mostrar
       uno construido sobre dos cotizaciones sueltas. */
    if (!t || !t.precio_kg_sin_iva) {
      return res.status(200).json(Object.assign({}, base, {
        precio_kg_sin_iva: null,
        motivo: 'sin_datos_suficientes'
      }));
    }

    return res.status(200).json(Object.assign({}, base, {
      precio_kg_sin_iva: Number(t.precio_kg_sin_iva),
      vigencia: t.vigencia,
      mes_base: t.mes_base,
      items_base: t.items
    }));
  } catch (e) {
    /* Si la base no responde, el estimador no cae a un precio viejo: manda a
       consultar. Un numero desactualizado es peor que no tener numero. */
    return res.status(200).json(Object.assign({}, base, {
      precio_kg_sin_iva: null,
      motivo: 'base_no_disponible'
    }));
  }
};
