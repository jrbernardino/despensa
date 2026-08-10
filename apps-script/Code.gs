/**
 * API de Despensa. Bound al Spreadsheet "Despensa" (Tarea 1).
 * Desplegar como Web App: ejecutar como "Yo", acceso "Cualquier persona".
 */

var HOJAS = {
  CATALOGO: 'Catalogo',
  COMPRAS: 'Compras',
  PARTIDAS: 'Partidas',
  PRESUPUESTO: 'Presupuesto'
};

/* ---------- correr a mano desde el editor para fijar/rotar el token ----------
 * El token vive solo en Script Properties del proyecto, nunca en este archivo
 * (que se versiona en git). Para rotarlo: pon el valor nuevo aqui, Run, y
 * borra el valor de este archivo otra vez antes de subirlo.
 */
function configurarToken() {
  var token = 'CAMBIA_ESTO_ANTES_DE_CORRER';
  PropertiesService.getScriptProperties().setProperty('TOKEN', token);
  Logger.log('Token guardado.');
}

/* ---------- entrypoints ---------- */
function doGet(e) {
  return json_({ ok: true, msg: 'Despensa API viva' });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'body invalido' });
  }

  var tokenGuardado = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!tokenGuardado || body.token !== tokenGuardado) {
    return json_({ ok: false, error: 'forbidden' });
  }

  try {
    switch (body.accion) {
      case 'guardarCompra':
        return json_(guardarCompra_(body));
      case 'buscarProducto':
        return json_(buscarProducto_(body));
      case 'guardarProducto':
        return json_(guardarProducto_(body));
      case 'resumen':
        return json_(resumen_(body));
      default:
        return json_({ ok: false, error: 'accion desconocida' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- helpers de hoja ---------- */
function hoja_(nombre) {
  var sh = SpreadsheetApp.getActive().getSheetByName(nombre);
  if (!sh) throw new Error('hoja no encontrada: ' + nombre);
  return sh;
}

function tabla_(nombre) {
  var sh = hoja_(nombre);
  var vals = sh.getDataRange().getValues();
  var headers = vals[0];
  var filas = vals.slice(1).map(function (row, i) {
    var obj = {};
    headers.forEach(function (h, j) { obj[h] = row[j]; });
    obj._fila = i + 2; // fila real en la hoja (1-based, +1 por encabezado)
    return obj;
  });
  return { sh: sh, headers: headers, filas: filas };
}

function isoAhora_() {
  return new Date().toISOString();
}

// fuerza texto en la celda aunque parezca numero (el formato @ de columna no basta con setValues/appendRow)
function texto_(v) {
  var s = String(v || '');
  return s ? "'" + s : '';
}

/* ---------- guardarCompra (idempotente por compra_id / partida_id) ---------- */
function guardarCompra_(body) {
  var compra = body.compra || {};
  var partidas = body.partidas || [];
  if (!partidas.length) throw new Error('compra sin partidas');

  var compraId = compra.compra_id;
  if (!compraId) throw new Error('compra_id requerido');
  partidas.forEach(function (p) {
    if (!p.partida_id) throw new Error('partida_id requerido en cada partida');
  });

  var fecha = compra.fecha || isoAhora_().slice(0, 10);
  var creadoEn = isoAhora_();

  var total = partidas.reduce(function (s, p) {
    var sub = (p.subtotal != null) ? Number(p.subtotal)
      : Number(p.precio_cobrado || 0) * Number(p.cantidad || 0);
    return s + sub;
  }, 0);

  // idempotencia de la cabecera: un reintento con el mismo compra_id no duplica la fila
  var comprasT = tabla_(HOJAS.COMPRAS);
  var compraYaExiste = comprasT.filas.some(function (f) { return String(f.compra_id) === String(compraId); });
  if (!compraYaExiste) {
    comprasT.sh.appendRow([
      compraId, fecha, compra.presupuesto || '', total, compra.notas || '', creadoEn
    ]);
  }

  // idempotencia por partida: cubre tambien el caso de una senal perdida a medio envio,
  // donde algunas partidas de un intento anterior ya quedaron escritas y otras no
  var partidasT = tabla_(HOJAS.PARTIDAS);
  var idsExistentes = {};
  partidasT.filas.forEach(function (f) { idsExistentes[String(f.partida_id)] = true; });

  var agregadas = 0;
  partidas.forEach(function (p) {
    if (idsExistentes[String(p.partida_id)]) return; // ya escrita en un intento previo, se ignora
    var sub = (p.subtotal != null) ? Number(p.subtotal)
      : Number(p.precio_cobrado || 0) * Number(p.cantidad || 0);
    partidasT.sh.appendRow([
      p.partida_id,
      compraId,
      p.fecha || fecha,
      p.tienda || '',
      texto_(p.gtin),
      texto_(p.cod_tienda),
      p.producto || '',
      Number(p.cantidad || 0),
      p.unidad || '',
      Number(p.precio_anaquel || 0),
      Number(p.precio_cobrado || 0),
      sub,
      p.promo || '',
      creadoEn
    ]);
    agregadas++;
  });

  return { ok: true, compra_id: compraId, total: total, partidas_agregadas: agregadas };
}

/* ---------- buscarProducto ---------- */
function buscarProducto_(body) {
  var gtin = String(body.gtin || '');
  if (!gtin) throw new Error('gtin requerido');
  var t = tabla_(HOJAS.CATALOGO);
  var fila = t.filas.find(function (f) { return String(f.gtin) === gtin; });
  if (!fila) return { ok: true, producto: null };
  delete fila._fila;
  return { ok: true, producto: fila };
}

/* ---------- guardarProducto (upsert por gtin) ---------- */
function guardarProducto_(body) {
  var p = body.producto || {};
  var gtin = String(p.gtin || '');
  if (!gtin) throw new Error('gtin requerido');

  var t = tabla_(HOJAS.CATALOGO);
  var existente = t.filas.find(function (f) { return String(f.gtin) === gtin; });

  var creadoEn = existente ? existente.creado_en : isoAhora_();
  var fila = [
    texto_(gtin),
    p.producto || (existente && existente.producto) || '',
    p.marca || (existente && existente.marca) || '',
    p.categoria || (existente && existente.categoria) || '',
    p.unidad || (existente && existente.unidad) || '',
    p.contenido || (existente && existente.contenido) || '',
    creadoEn,
    p.fuente || (existente && existente.fuente) || ''
  ];

  if (existente) {
    t.sh.getRange(existente._fila, 1, 1, fila.length).setValues([fila]);
  } else {
    t.sh.appendRow(fila);
  }
  return { ok: true, gtin: gtin, actualizado: !!existente };
}

/* ---------- resumen ---------- */
function resumen_(body) {
  var periodo = String(body.periodo || ''); // "YYYY-MM"
  if (!/^\d{4}-\d{2}$/.test(periodo)) throw new Error('periodo invalido, usa YYYY-MM');

  var catalogo = tabla_(HOJAS.CATALOGO);
  var gtinACategoria = {};
  catalogo.filas.forEach(function (f) { gtinACategoria[String(f.gtin)] = f.categoria; });

  var partidas = tabla_(HOJAS.PARTIDAS).filas.filter(function (f) {
    return String(f.fecha).slice(0, 7) === periodo;
  });

  var gastoPorCategoria = {};
  var totalGastado = 0;
  partidas.forEach(function (f) {
    var cat = gtinACategoria[String(f.gtin)] || 'Sin categoria';
    var sub = Number(f.subtotal || 0);
    gastoPorCategoria[cat] = (gastoPorCategoria[cat] || 0) + sub;
    totalGastado += sub;
  });

  var presupuestos = tabla_(HOJAS.PRESUPUESTO).filas.filter(function (f) {
    return String(f.periodo) === periodo;
  });
  var presupuestoPorCategoria = {};
  var presupuestoTotal = 0;
  presupuestos.forEach(function (f) {
    var monto = Number(f.monto || 0);
    presupuestoPorCategoria[f.categoria] = (presupuestoPorCategoria[f.categoria] || 0) + monto;
    presupuestoTotal += monto;
  });

  var categorias = {};
  Object.keys(gastoPorCategoria).forEach(function (c) { categorias[c] = true; });
  Object.keys(presupuestoPorCategoria).forEach(function (c) { categorias[c] = true; });

  var porCategoria = Object.keys(categorias).map(function (c) {
    return {
      categoria: c,
      monto_presupuesto: presupuestoPorCategoria[c] || 0,
      monto_gastado: gastoPorCategoria[c] || 0
    };
  });

  return {
    ok: true,
    periodo: periodo,
    total_gastado: totalGastado,
    presupuesto_total: presupuestoTotal,
    por_categoria: porCategoria
  };
}
