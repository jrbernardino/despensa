# BITACORA.md — Proyecto Despensa

Registro append-only de lo hecho. No se edita ni se borra lo ya anotado.

---

## 2026-08-09 · Tarea 1 · Crear el Spreadsheet y las cuatro hojas · HECHO

- Se creó el Google Sheet `Despensa` vía script de Apps Script (`SpreadsheetApp.create`)
  corrido una vez en script.new bajo la cuenta del usuario.
- **Spreadsheet ID:** `1-v6QWwe3t6Fjq8m34myqMMRk1gPPzhIxndVe-QLO9vs`
- **URL:** https://docs.google.com/spreadsheets/d/1-v6QWwe3t6Fjq8m34myqMMRk1gPPzhIxndVe-QLO9vs/edit
- Hojas creadas con encabezados exactos de `TAREAS.md`: `Catalogo`, `Compras`, `Partidas`,
  `Presupuesto`.
- Columnas `gtin` (Catalogo y Partidas) y `cod_tienda` (Partidas) formateadas como texto
  plano (`@`) en la columna completa, no solo en el rango con datos.
- Verificado por log de ejecución de Apps Script (inicio 6:57:19 p.m., fin 6:57:26 p.m.,
  sin errores).

---

## 2026-08-09 · Tarea 2 · Web App de Apps Script como API · HECHO

- Proyecto de Apps Script bound al Sheet `Despensa`, gestionado con `clasp` (cuenta
  `akrodashboards@gmail.com`, la misma dueña del Sheet) y versionado en el repo bajo
  `apps-script/` (`Code.gs`, `appsscript.json`, `.clasp.json`).
- **Script ID:** `100jvsK9KQj2ihuuQKFJIWZmoOyswJCWWwcIqlslJVdKX3Q1P-C5rwBCD`
- **Deployment ID (Web App):** `AKfycbyuzU9Nx8hrzzYHKbjbCuKnkF_znWCCNA83wLfJrBwG_TOYzGgA8qDJSEBCHMQhsQr7gA`
- **URL /exec:** guardada en `config.js` (raíz del repo, `window.DESPENSA_CONFIG.API_URL`).
- Cuatro acciones vía `doPost` + campo `accion`: `guardarCompra`, `buscarProducto`,
  `guardarProducto` (upsert por gtin), `resumen` (total + desglose por categoría vs
  hoja `Presupuesto`, periodo `YYYY-MM`).
- Token compartido en `PropertiesService.getScriptProperties()` del proyecto (no vive en
  el código fuente); validado antes de tocar el Sheet. Copia del lado cliente en
  `config.js`.
- Los cuatro endpoints se probaron con `curl` contra el deployment real: `resumen`,
  `buscarProducto` (con y sin resultado), `guardarProducto` (alta y upsert), `guardarCompra`
  (con partidas), y rechazo con token inválido. Se usaron filas marcadas
  `fuente:"curl-test"` / `notas:"prueba curl"` y se borraron después de verificar.

**Hallazgos / decisiones técnicas que se apartan de la letra de la tarea:**

1. **"Responder 403" no es literal.** `ContentService` de Apps Script no permite fijar
   código de estado HTTP — todo `doPost` responde 200 a nivel de transporte. El rechazo
   por token inválido se implementó como `{ok:false, error:"forbidden"}` en el body con
   200 HTTP. Cualquier cliente debe checar el body, no el status code.
2. **Bug encontrado y corregido: `gtin`/`cod_tienda` volvían como número, no texto**,
   pese al formato de columna Plain Text (`@`) fijado en la Tarea 1 — el formato de
   columna no basta cuando se escribe vía `setValues`/`appendRow` desde Apps Script. Se
   corrigió forzando cada valor con el truco del apóstrofo inicial (`"'" + valor`) antes
   de escribir. Verificado con gtin `0041789001956` (ceros a la izquierda intactos).
3. **CORS:** el frontend debe mandar el body como `Content-Type: text/plain` (no
   `application/json`) para evitar el preflight `OPTIONS`, que Apps Script Web Apps no
   manejan.
4. **El token es público de facto** una vez el sitio está en GitHub Pages (JS de cliente
   sin build step) — filtra bots casuales, no es autorización real. Se documentó y se
   decidió aceptar tal cual por ser app personal.
5. **Ejecución vía `clasp`** en vez de copiar/pegar manual: encontré que `clasp login`
   ya tenía sesión de `akrodashboards@gmail.com` (la cuenta real usada para crear el
   Sheet en la Tarea 1), así que pude automatizar creación del script vinculado, push,
   deploy y pruebas por CLI. El único paso manual irreducible fue la autorización OAuth
   del script (Google la exige interactivamente, una vez, sin importar la herramienta).
   Nota: un primer intento con `clasp create-script --type sheets --parentId <id>` creó
   por error un spreadsheet nuevo en vez de vincularse al existente; quedó identificado,
   mandado a la papelera de Drive (recuperable) y corregido usando `--parentId` sin
   `--type`.

---

## 2026-08-09 · Tarea 3 · Idempotencia en la escritura · HECHO

- `guardarCompra_` ahora exige `compra_id` y `partida_id` en el payload (ya no hay
  fallback a `Utilities.getUuid()` del lado servidor) — sin un ID fijo generado por el
  cliente, un reintento no se puede distinguir de una compra nueva.
- Antes de escribir la cabecera: si ya existe una fila en `Compras` con ese `compra_id`,
  no se vuelve a insertar. Antes de escribir cada partida: se arma un set de
  `partida_id` ya existentes en `Partidas` y solo se agregan las que faltan — esto cubre
  no solo el reintento completo, sino también el caso de una señal perdida a medio envío
  (algunas partidas del intento anterior ya escritas, otras no).
- La respuesta agrega el campo `partidas_agregadas` (cuántas partidas de esa llamada se
  insertaron de verdad), útil para depurar reintentos sin romper el contrato de la
  Tarea 2.
- **Probado contra el deploy real:** mismo payload de `guardarCompra` (2 partidas)
  enviado 3 veces seguidas por `curl`. Resultado: `partidas_agregadas` fue 2, luego 0, 0.
  Verificado además contando filas directamente: exactamente 1 fila en `Compras` y 2 en
  `Partidas` para ese `compra_id`, pese a los tres envíos. Datos de prueba borrados
  después con una acción temporal (igual que en la Tarea 2).
- **Efecto colateral no relacionado, resuelto en el camino:** Node había desaparecido de
  Homebrew a mitad de esta tarea (posible efecto secundario de instalar `gh` para el
  push de la Tarea 2), lo que rompió `clasp`. Se reinstaló con `brew install node` con
  permiso explícito del usuario antes de continuar.

---

## 2026-08-09 · Tarea 4 · Estructura base y manifest · HECHO

- `index.html` se partió en `index.html` + `styles.css` + `app.js` (contenido extraído
  programáticamente, sin cambios de lógica) + `manifest.webmanifest` + `sw.js` nuevos.
- **Rutas relativas en todo:** no hay `CNAME` en el repo, así que GitHub Pages
  probablemente sirve desde `jrbernardino.github.io/despensa/` (subpath, no raíz). Se
  usó `./` en manifest (`start_url`, `scope`), íconos, `sw.js` y su registro para que no
  se rompa en ese subpath.
- `display: "standalone"` (no `fullscreen`) — decisión confirmada con el usuario: mejor
  soporte cross-device, coincide con el criterio de aceptación ("sin barra de
  navegador") sin ocultar la barra de estado del sistema.
- **Íconos generados sin dependencias externas:** no había PIL/ImageMagick en la
  máquina; se escribió un generador de PNG puro con `zlib`+`struct` de stdlib
  (`gen_icons.py`, no versionado — vivió en el scratchpad). Diseño: fondo `--ink`
  (#14110E) con barras verticales tipo código de barras en `--paper` (#E9E6DF),
  coherente con la estética de recibo/monospace existente y con el escáner como función
  central. Salidas: `icons/icon-192.png`, `icons/icon-512.png`,
  `icons/apple-touch-icon.png` (180px), `icons/favicon-32.png`.
- `sw.js`: cachea el shell (`index.html`, `styles.css`, `app.js`, manifest, íconos) en
  `install`, cache-first con fallback a red para esos archivos same-origin, limpia
  caches viejos en `activate`. Las llamadas cross-origin (Open Food Facts, la API de
  Apps Script) se dejan pasar sin interceptar — no se cachean, para no servir precios o
  productos obsoletos.
- Metadatos iOS agregados en `<head>` (`apple-mobile-web-app-capable`,
  `apple-mobile-web-app-title`, `apple-touch-icon`) porque Safari no lee el manifest
  para eso.
- **Verificado sin navegador real** (la extensión de Chrome no conectó en esta sesión):
  manifest es JSON válido, `app.js`/`sw.js` pasan `node --check`, y los seis archivos
  del shell responden 200 con el content-type correcto sirviendo el sitio local con
  `python3 -m http.server`.
- **Confirmado por el usuario en Android real** (2026-08-09, sobre
  https://jrbernardino.github.io/despensa/): instala desde "Agregar a pantalla de
  inicio" con el ícono de barras correcto, abre sin barra de navegador, y en modo avión
  carga el shell (vacío, sin poder escanear — esperado, solo cachea la cáscara).

---

## 2026-08-09 · Tarea 5 · Escáner con doble ruta · HECHO

- La ruta Android (`BarcodeDetector`, video continuo cada 180ms, doble lectura,
  cooldown 2.5s, linterna, wake lock) ya venía del prototipo original y no se tocó —
  ya estaba validada en campo el 2026-08-09 con 18 productos reales (ver sección
  "Lectura de códigos" en `CLAUDE.md`).
- **Nueva ruta iOS/Safari (modo foto):** `initEscaner()` corre una vez al cargar,
  detecta si `BarcodeDetector` existe con formatos usables; si no, esconde
  "Encender cámara"/"Luz" y muestra "Tomar foto" en su lugar, que dispara un
  `<input type="file" accept="image/*" capture="environment">` (la única ruta que
  funciona en Safari, según `CLAUDE.md` — abre la cámara nativa con toque para
  enfocar).
- **`@zxing/library` 0.21.3 vendorizada** en `vendor/zxing.min.js` (336KB), no CDN:
  el `sw.js` de la Tarea 4 no cachea peticiones cross-origin a propósito, así que un
  CDN nunca quedaría disponible offline. Se carga perezosamente (inyección de
  `<script>` dinámica) solo cuando `initEscaner()` detecta que hace falta — Android con
  Chrome nunca la descarga.
- **`decodeFromCanvas` no existe en la build vendorizada** (`TAREAS.md` lo nombra, pero
  no está en ninguna versión publicada que encontré). Se reconstruyó el mismo
  comportamiento con las piezas de bajo nivel que sí expone la librería:
  `HTMLCanvasElementLuminanceSource` → `HybridBinarizer` → `BinaryBitmap` →
  `reader.decodeBitmap(...)`. Verificado por grep contra el bundle que las cuatro clases
  están exportadas antes de escribir el código contra ellas.
- Flujo: foto → canvas con downscale a máx. 1600px de lado largo → intento de decode →
  si falla, recorte central al 50%, ampliado 2x, segundo intento → si ambos fallan,
  mensaje de error y queda la opción de repetir o usar la captura manual (ya existía).
  Hints restringidos a EAN-13/EAN-8/UPC-A/UPC-E, igual que la ruta Android, más
  `TRY_HARDER` (aceptable en foto única, no en video continuo).
- **Doble lectura no aplica al modo foto** — se interpretó "doble lectura obligatoria en
  el modo continuo" (texto literal de la tarea) como exclusivo del modo video: una foto
  ya es una acción deliberada, no un stream con falsos positivos.
- **Verificado sin navegador real** (la extensión de Chrome sigue sin conectar en esta
  sesión): `node --check` en `app.js`, manifest sigue válido, los tres archivos nuevos
  (incluyendo `vendor/zxing.min.js`) sirven 200 en las rutas relativas correctas contra
  un servidor local. Confirmé por grep contra el bundle que cada clase/método de ZXing
  que uso (`BrowserMultiFormatReader`, `DecodeHintType`, `BarcodeFormat`,
  `HTMLCanvasElementLuminanceSource`, `BinaryBitmap`, `HybridBinarizer`, `decodeBitmap`)
  existe y está exportada — pero no pude ejecutar un decode real de extremo a extremo
  (necesitaría un canvas/DOM real; no hay navegador headless disponible en esta sesión).
- **Confirmado por el usuario en iPhone real:** aparece "Tomar foto", abre la cámara
  nativa, y al fotografiar un código de barras real lo lee y abre el panel de precio
  con el código correcto.

---

## 2026-08-09 · Tarea 6 · Alta de partida · HECHO

- **`config.js` finalmente conectado al frontend.** Se creó en la Tarea 2 pero
  `index.html` nunca lo cargaba — el panel no podía llamar a la API propia hasta ahora.
  Se agregó también al precache de `sw.js` (subido a `despensa-shell-v3`, aprendiendo de
  el bug de caché de la Tarea 5: si toco el shell, subo el número).
- **Cadena de búsqueda real:** catálogo local (nuevo, `localStorage` bajo
  `despensa.catalogo.v1` — interino hasta que exista IndexedDB en la Tarea 9) → tu
  catálogo remoto (`buscarProducto`) → Open Food Facts como semilla. El primer hit llena
  el nombre; los hits de remoto/OFF se guardan en la caché local para que la próxima vez
  ese código resuelva instantáneo y sin señal.
- **Escritura de vuelta al catálogo compartido** (decisión confirmada con el usuario):
  al tocar "Agregar", si la partida no venía ya de tu catálogo (ni local ni remoto) —
  o sea, es semilla de OFF o el usuario la tecleó a mano — se llama `guardarProducto` en
  paralelo, sin bloquear el guardado de la partida si falla. Así el catálogo "se llena
  solo con el uso", como describe `CLAUDE.md`. Los códigos internos de tienda (empiezan
  con 2, 13 dígitos) se saltan toda la cadena de búsqueda y nunca se escriben a
  `Catalogo`, como ya establecía la regla existente.
- **Panel editable:** `#sProd` pasó de `<div>` a `<input>` (mismo estilo visual,
  `input.prod` con más especificidad que la regla genérica de `input`). Se agregó un
  campo "Tienda" al panel (precargado del campo global de la compra, editable por
  partida) — hasta ahora la tienda solo existía a nivel de toda la compra, pese a que
  `CLAUDE.md` ya documentaba que es atributo de la partida. El CSV (`rows()`) ahora usa
  la tienda de cada ítem si existe, con fallback al campo global.
- Para códigos internos de tienda, el foco al abrir el panel va al nombre (hay que
  escribirlo) en vez del precio.
- **Captura manual ahora también incrementa cantidad** en duplicados, igual que el modo
  escáner — antes solo el escáner lo hacía, la captura a mano siempre abría el panel
  como si fuera nuevo.
- **Verificado:** sintaxis de `app.js`/`sw.js`, manifest sigue válido, los cinco archivos
  del shell sirven 200 en local. El contrato `buscarProducto`/`guardarProducto` de la
  Tarea 2 se probó de nuevo contra el deploy real con el mismo payload que ahora manda
  `app.js` (confirma que no hay drift entre lo que el frontend envía y lo que el backend
  espera). Dato de prueba borrado después.
- **Confirmado por el usuario en dispositivo real:** panel con nombre editable y campo
  Tienda visibles, y re-escanear/re-teclear un código ya agregado sube la cantidad en
  vez de duplicar la fila. Se probó un subconjunto representativo (no los 20 del caso de
  prueba completo, que incluye productos pesados por PLU sin código de barras —
  eso es la Tarea 7, todavía no construida).

---

## 2026-08-09 · Tarea 7 · Modo pesado / granel · EN CURSO

- **Hallazgo de esquema, confirmado con el usuario:** `Catalogo` solo tiene columna
  `gtin`, no `cod_tienda`. Un PLU (ej. `40877`) no es un GTIN real — por la regla 2 de
  `CLAUDE.md` (el PLU solo vale en esa cadena, no es identidad global de producto). Por
  eso los ítems a granel **nunca** se escriben al `Catalogo` compartido vía
  `guardarProducto` (a diferencia del patrón de la Tarea 6) ni se buscan contra
  `buscarProducto`/Open Food Facts — solo se recuerdan en la caché local del teléfono
  (reutilizando el mismo `catalogoLocal` de la Tarea 6, que es agnóstico al tipo de
  código).
- **Nueva sección "Producto a granel"** con dos rutas de alta, ambas confirmadas con el
  usuario: botones de una lista corta de frecuentes (`Jitomate, Cebolla, Papa, Limón,
  Aguacate, Plátano, Manzana, Queso, Pechuga de pollo`, editable a mano en `app.js` si no
  calza con lo real) que abren el panel ya con el nombre puesto, y un campo de PLU
  manual para lo que no esté en la lista.
- **Cada pesada es su propia fila** (decisión confirmada): a diferencia de un código de
  barras, agregar el mismo PLU dos veces no fusiona cantidades — cada pesada es un
  evento físico distinto con su propio kg y subtotal.
- **El panel (`#sheet`) ahora tiene modo:** en modo peso, el stepper entero se esconde y
  se muestra un input decimal de kilos con subtotal en vivo (kg × precio/kg, recalculado
  en cada tecleo) para verificar antes de confirmar. La etiqueta de precio cambia a
  "Precio por kilo".
- **Verificado el caso de aceptación exacto en aritmética real de JS antes de
  implementar:** `0.195 * 15 = 2.9250000000000003` en punto flotante, pero
  `toFixed(2)` (la misma función `money()` que ya usa el resto del código) da
  `"2.93"` correctamente — no hizo falta ninguna librería de precisión decimal nueva.
  Tracé el flujo completo a mano (PLU manual "40877" → 0.195 kg × $15.00/kg) contra el
  código final: el subtotal mostrado y el guardado en el ítem coinciden en `$2.93`.
- Lista/artículo en pantalla ahora distingue formato: los ítems a granel muestran
  "0.195 kg × $15.00/kg" en vez de "3 × $28.00 · código", con una etiqueta "Granel".
- `sw.js` subido a `despensa-shell-v4` (index.html/app.js cambiaron).
- **Verificado sin navegador real** (la extensión de Chrome sigue sin conectar):
  sintaxis de `app.js`/`sw.js`, la función `slug()` probada por separado contra la lista
  real de frecuentes (acentos fuera, espacios a guiones), y los tres archivos sirven 200
  en local.
- **Pendiente de confirmar por el usuario en dispositivo real:** el flujo completo —
  tocar un botón de la lista corta, y por separado teclear un PLU a mano — verificando
  que el caso `40877 · 0.195 kg × $15.00/kg` cuadre en $2.93 tanto en el panel como en la
  lista de artículos.
- **Bug encontrado por el usuario y corregido:** el usuario reportó ver la app vieja
  tanto en Android como iPhone después del deploy. Causa: `sw.js` usa cache-first, y el
  navegador solo reinstala el service worker cuando cambian los bytes de `sw.js` mismo
  — al modificar `index.html`/`app.js` en esta tarea sin tocar `sw.js`, el shell viejo
  (cacheado desde la Tarea 4) se siguió sirviendo indefinidamente sin importar lo que
  hubiera en el servidor. Se corrigió subiendo `CACHE` de `despensa-shell-v1` a
  `despensa-shell-v2`. **Pendiente para el futuro:** acordarme de subir ese número en
  cada tarea que toque el shell (`index.html`, `styles.css`, `app.js`,
  `manifest.webmanifest`, íconos) — es fácil olvidarlo porque `sw.js` mismo casi nunca
  cambia.
