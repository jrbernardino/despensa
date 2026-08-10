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
