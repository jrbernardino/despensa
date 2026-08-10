# TAREAS.md — Proyecto Despensa

Estado: `PENDIENTE` · `EN CURSO` · `HECHO` · `BLOQUEADA`

Una tarea a la vez, en orden. Antes de implementar: **discovery gate** — leer el código
existente, proponer el plan, esperar confirmación. Al terminar cada tarea, anotar en
`BITACORA.md`.

---

## FASE 1 — Backend y modelo de datos

### Tarea 1 · Crear el Spreadsheet y las cuatro hojas · HECHO

Crear un Google Sheet llamado `Despensa` con estas hojas y encabezados exactos:

**`Catalogo`** — un renglón por producto conocido
```
gtin | producto | marca | categoria | unidad | contenido | creado_en | fuente
```

**`Compras`** — un renglón por evento de compra
```
compra_id | fecha | presupuesto | total | notas | creado_en
```

**`Partidas`** — un renglón por producto comprado (el corazón del sistema)
```
partida_id | compra_id | fecha | tienda | gtin | cod_tienda | producto |
cantidad | unidad | precio_anaquel | precio_cobrado | subtotal | promo | creado_en
```

**`Presupuesto`** — metas por periodo
```
periodo | categoria | monto | notas
```

Aceptación: las cuatro hojas existen, la columna `gtin` y `cod_tienda` están formateadas
como texto en toda la columna, y el ID del spreadsheet queda anotado en `BITACORA.md`.

---

### Tarea 2 · Web App de Apps Script como API · HECHO

Proyecto de Apps Script vinculado al Sheet, desplegado como Web App con acceso
"cualquier persona". Endpoints vía `doPost` con un campo `accion`:

- `guardarCompra` — recibe una compra completa con sus partidas, escribe **append-only**
  en `Compras` y `Partidas`. Devuelve `compra_id`.
- `buscarProducto` — recibe `gtin`, devuelve el renglón de `Catalogo` o `null`.
- `guardarProducto` — alta o actualización en `Catalogo`.
- `resumen` — devuelve totales del periodo para la pantalla de planeación.

Autenticación: token compartido en el cuerpo del request, validado en `doPost`. Si no
coincide, responder 403 sin tocar el Sheet. El token va en un archivo `config.js` del
frontend, no incrustado en el HTML.

Aceptación: `curl` contra cada endpoint responde correctamente y el Sheet recibe las
filas sin sobrescribir nada.

---

### Tarea 3 · Idempotencia en la escritura · HECHO

El celular puede reintentar un envío tras perder señal. Cada partida lleva un
`partida_id` generado en el cliente (UUID). `guardarCompra` ignora los IDs ya presentes
en lugar de duplicarlos.

Aceptación: enviar el mismo payload tres veces deja exactamente un juego de filas.

---

## FASE 2 — PWA de captura

### Tarea 4 · Estructura base y manifest · HECHO

`index.html` + `app.js` + `styles.css` + `manifest.webmanifest` + `sw.js`.
La app debe instalarse desde "Agregar a pantalla de inicio" con ícono propio y arrancar
en pantalla completa. Service Worker cachea el shell para que abra sin señal.

Aceptación: instalada en Android, abre sin barra de navegador y carga en modo avión.

---

### Tarea 5 · Escáner con doble ruta · HECHO

- Si existe `BarcodeDetector`: video continuo, ciclo cada ~180 ms.
- Si no existe: modo foto fija con ZXing sobre la imagen (`decodeFromCanvas`),
  con segundo intento sobre recorte central ampliado 2x.
- Botón de linterna cuando `torch` esté en las capabilities del track.
- Wake lock mientras el escáner esté activo.

**Doble lectura obligatoria** en el modo continuo: dos detecciones seguidas del mismo
código antes de aceptar. Cooldown de 2.5 s para no re-agregar por accidente.

Aceptación: lee EAN-13, EAN-8, UPC-A y UPC-E en Android; en iOS lee por foto; en ambos
existe la salida manual.

---

### Tarea 6 · Alta de partida · HECHO

Al aceptar un código: buscar en `Catalogo` local, luego en el remoto, luego en Open Food
Facts como semilla. Panel de captura con nombre editable, precio, cantidad y tienda.

- Si el `gtin` empieza con 2 y tiene 13 dígitos: marcar como código interno de tienda,
  pedir nombre al usuario y **no** guardarlo en `Catalogo`.
- Escanear un producto ya presente en la compra incrementa la cantidad.
- El nombre nunca queda vacío: si no hay nada, se usa el código.

Aceptación: los 20 productos del caso de prueba se capturan sin bloqueos.

---

### Tarea 7 · Modo pesado / granel · HECHO

Para frutas, verduras, carnes y quesos que se venden por peso y no traen código de
barras utilizable. Alta por PLU o por selección de una lista corta de productos
frecuentes, con captura de **kilos** y **precio por kilo**; el subtotal se calcula.

Aceptación: el caso `40877 · jitomate · 0.195 kg × $15.00/kg = $2.93` se captura y
cuadra al centavo.

---

### Tarea 8 · Total corriente y presupuesto · PENDIENTE

Encabezado fijo con total, número de artículos, barra de avance contra el presupuesto y
monto restante. En rojo al excederse. El presupuesto se fija al abrir la compra.

Aceptación: los totales cuadran contra el caso de prueba ($1,471.93 en dos tiendas).

---

### Tarea 9 · Persistencia local y sincronización · PENDIENTE

Toda la compra vive en IndexedDB y se guarda en cada cambio. Botón explícito de
"Cerrar compra" que envía a Sheets. Si falla el envío, la compra queda marcada como
pendiente y se reintenta al abrir la app con conexión.

Aceptación: cerrar la pestaña a media compra y reabrir no pierde nada; cerrar en modo
avión deja la compra pendiente y sincroniza sola al recuperar señal.

---

## FASE 3 — Conciliación y análisis

### Tarea 10 · Conciliación contra ticket · PENDIENTE

Pantalla que compara lo capturado contra el total real del ticket. Permite capturar el
total cobrado, muestra la diferencia y deja ajustar `precio_cobrado` por partida.

Aceptación: reproduce la diferencia de $11.93 del caso de prueba y la explica por
partida (arroz $9, jitomate $2.93).

---

### Tarea 11 · Historial de precios · PENDIENTE

Por producto: precio a lo largo del tiempo y por tienda. Marcar variaciones relevantes.
Esta es la función que ninguna app comercial da, porque requiere datos propios.

Aceptación: con dos compras cargadas, muestra la variación de al menos un producto.

---

### Tarea 12 · Frecuencia de consumo y proyección · PENDIENTE

Calcular cada cuántos días se recompra cada producto y proyectar el gasto mensual con
base en el consumo real, no en promedios. Sugerir lista de compra para la semana.

Aceptación: con tres compras cargadas, genera una lista sugerida con fechas estimadas.

---

## FASE 4 — Carga inicial

### Tarea 13 · Importar la compra del 2026-08-09 · PENDIENTE

Cargar `compra-2026-08-09.xlsx` como primera compra histórica y sembrar `Catalogo` con
sus 20 productos identificados.

Aceptación: el total en `Compras` da $1,471.93 y `Catalogo` arranca con 20 renglones.

---

## Fuera de alcance por ahora

- OCR de tickets. Papel térmico, columnas irregulares y abreviaturas de cadena lo hacen
  un proyecto aparte. Mientras tanto: foto del ticket y conciliación manual (Tarea 10).
- Multiusuario. Es una app personal.
- Escaneo en iOS con video continuo. Descartado por limitaciones de enfoque en Safari.
