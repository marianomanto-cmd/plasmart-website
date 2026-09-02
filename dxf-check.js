/* ============================================================
   PLASMART — Lectura de DXF para el estimador

   Esto NO dibuja el plano ni genera trayectoria de corte: decide si el
   archivo es lo bastante confiable como para poner un precio. Ante la
   duda devuelve motivos y el estimador pasa a "requiere revision", que
   no muestra ningun numero.

   Lo hace a proposito con poca ambicion: un DXF real llega mal seguido
   (escala, pulgadas, bloques, contornos abiertos) y un numero equivocado
   que parece verdadero es peor que no tener numero — el cliente se lo
   pasa a SU cliente y despues hay que explicarlo.

   Sin dependencias: el DXF ASCII son pares de lineas (codigo / valor).
   ============================================================ */
(function () {
  'use strict';

  /* Limites de lo que Plasmart puede cortar. Fuera de esto, casi siempre
     es un error de unidades y no una pieza real. */
  var LADO_MIN_MM = 10;
  var LADO_MAX_MM = 6000;

  /* $INSUNITS del header. Solo mm y cm los damos por buenos; el resto
     obliga a revision, incluido el 0 (sin declarar). */
  var UNIDADES = {
    0: { nombre: 'sin declarar', factor: null },
    1: { nombre: 'pulgadas', factor: 25.4 },
    2: { nombre: 'pies', factor: 304.8 },
    4: { nombre: 'milimetros', factor: 1 },
    5: { nombre: 'centimetros', factor: 10 },
    6: { nombre: 'metros', factor: 1000 }
  };

  /* Entidades de las que sabemos sacar puntos con confianza. */
  var GEOMETRIA = ['LINE', 'LWPOLYLINE', 'POLYLINE', 'VERTEX', 'CIRCLE', 'ARC', 'SPLINE', 'ELLIPSE'];

  function pares(texto) {
    /* Normaliza saltos de linea y arma [codigo, valor]. */
    var l = texto.split(/\r\n|\r|\n/);
    var out = [];
    for (var i = 0; i + 1 < l.length; i += 2) {
      var c = parseInt(l[i].trim(), 10);
      if (isNaN(c)) { i -= 1; continue; } // desfasaje: reintenta alineando
      out.push([c, l[i + 1]]);
    }
    return out;
  }

  function leer(texto) {
    var p = pares(texto);
    var seccion = '', entidad = '', varName = '';
    var enBloques = false;

    var insunits = null;
    var inserts = 0, abiertas = 0, cerradas = 0, conGeometria = 0;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    var cx = null, cy = null, radio = null;
    var px = null, px2 = null; // X pendiente de su Y (codigos 10/20 y 11/21)
    /* La spec dice que el codigo 70 de una polilinea es opcional y su
       default es ABIERTA. Si la entidad termina sin haberlo visto, cuenta
       como abierta: un contorno abierto que omite la bandera no puede
       pasar como pieza cerrada. */
    var polySin70 = false;

    function punto(x, y) {
      if (!isFinite(x) || !isFinite(y)) return;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    /* CIRCLE y ARC no dan sus extremos: hay que cerrarlos con el radio
       cuando termina la entidad. */
    function cerrarCirculo() {
      if (cx !== null && cy !== null && radio !== null && isFinite(radio)) {
        punto(cx - radio, cy - radio);
        punto(cx + radio, cy + radio);
      }
      cx = cy = radio = null;
    }

    for (var i = 0; i < p.length; i++) {
      var code = p[i][0];
      var val = p[i][1] === undefined ? '' : String(p[i][1]).trim();

      if (code === 0) {
        cerrarCirculo();
        px = px2 = null;
        if (polySin70) { abiertas++; polySin70 = false; }
        if (val === 'SECTION') { seccion = ''; entidad = ''; continue; }
        if (val === 'ENDSEC') { seccion = ''; enBloques = false; entidad = ''; continue; }
        entidad = val;
        if (seccion === 'ENTITIES' && !enBloques) {
          if (val === 'INSERT') inserts++;
          if (GEOMETRIA.indexOf(val) >= 0) conGeometria++;
          if (val === 'LWPOLYLINE' || val === 'POLYLINE') polySin70 = true;
        }
        continue;
      }

      if (code === 2 && seccion === '') {
        seccion = val;
        if (val === 'BLOCKS') enBloques = true;
        continue;
      }

      if (seccion === 'HEADER') {
        if (code === 9) { varName = val; continue; }
        if (code === 70 && varName === '$INSUNITS') insunits = parseInt(val, 10);
        continue;
      }

      /* Solo medimos la geometria colocada en ENTITIES. Lo que vive en
         BLOCKS se dibuja via INSERT, que ya obliga a revision. */
      if (seccion !== 'ENTITIES' || enBloques) continue;

      /* bit 1 del codigo 70 = polilinea cerrada */
      if (code === 70 && (entidad === 'LWPOLYLINE' || entidad === 'POLYLINE')) {
        polySin70 = false;
        if (parseInt(val, 10) & 1) cerradas++; else abiertas++;
        continue;
      }

      var n = parseFloat(val);
      if (!isFinite(n)) continue;

      if (code === 10) {
        if (entidad === 'CIRCLE' || entidad === 'ARC') cx = n; else px = n;
      } else if (code === 20) {
        if (entidad === 'CIRCLE' || entidad === 'ARC') cy = n;
        else if (px !== null) { punto(px, n); px = null; }
      } else if (code === 40 && (entidad === 'CIRCLE' || entidad === 'ARC')) {
        radio = n;
      } else if (code === 11) {
        px2 = n;
      } else if (code === 21) {
        if (px2 !== null) { punto(px2, n); px2 = null; }
      }
    }
    cerrarCirculo();
    if (polySin70) abiertas++;

    return {
      insunits: insunits,
      inserts: inserts, abiertas: abiertas, cerradas: cerradas,
      conGeometria: conGeometria,
      bbox: (isFinite(minX) && isFinite(maxX) && isFinite(minY) && isFinite(maxY))
        ? { ancho: maxX - minX, largo: maxY - minY } : null
    };
  }

  /* ---------- veredicto ----------
     Devuelve { ok, ancho, largo, unidad, motivos[] }. Con ok=false el
     estimador entra en "requiere revision" y no muestra precio. */
  function revisar(texto) {
    var motivos = [];
    var d;
    try { d = leer(texto); }
    catch (e) { return { ok: false, motivos: ['No pudimos leer el archivo. ¿Es un DXF en formato ASCII?'] }; }

    if (!d.conGeometria || !d.bbox) {
      return { ok: false, motivos: ['No encontramos geometría reconocible en el plano.'] };
    }

    /* 1. Unidades. Es el error mas caro: un plano en pulgadas da un
       precio 25,4 veces mas bajo. */
    var u = UNIDADES[d.insunits];
    var factor = u ? u.factor : null;
    if (d.insunits === null || d.insunits === 0 || !u) {
      motivos.push('El plano no declara en qué unidades está dibujado.');
    } else if (d.insunits === 1 || d.insunits === 2) {
      motivos.push('El plano está en ' + u.nombre + ', no en milímetros.');
    }

    /* 2. Bloques: la geometria real vive en BLOCKS y lo que medimos queda
       incompleto. */
    if (d.inserts > 0) {
      motivos.push('El plano usa bloques (' + d.inserts + '), así que la medida que leemos queda incompleta.');
    }

    /* 3. Contornos abiertos: no hay pieza que cortar. */
    if (d.abiertas > 0) {
      motivos.push('Hay ' + d.abiertas + ' contorno(s) sin cerrar.');
    }

    /* 4. Escala. Se evalua con el factor declarado; si no hay factor,
       asumimos mm solo para poder chequear el orden de magnitud. */
    var f = factor || 1;
    var ancho = d.bbox.ancho * f;
    var largo = d.bbox.largo * f;
    var lado = Math.max(ancho, largo);
    var chico = Math.min(ancho, largo);
    if (!(lado > 0) || chico <= 0) {
      motivos.push('El plano mide cero en alguno de sus lados.');
    } else if (chico < LADO_MIN_MM || lado > LADO_MAX_MM) {
      motivos.push('Las medidas que leemos (' + Math.round(ancho) + ' × ' + Math.round(largo) +
                   ' mm) están fuera de lo que cortamos.');
    }

    if (motivos.length) return { ok: false, motivos: motivos, ancho: ancho, largo: largo };

    return {
      ok: true,
      ancho: Math.round(ancho * 10) / 10,
      largo: Math.round(largo * 10) / 10,
      unidad: u.nombre,
      motivos: []
    };
  }

  window.PlasmartDxf = { revisar: revisar };
})();
