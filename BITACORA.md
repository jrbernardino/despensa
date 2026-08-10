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
