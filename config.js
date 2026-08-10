// Configuración del cliente para la API de Despensa (Apps Script Web App).
// El token es publico de facto una vez desplegado en GitHub Pages (es JS de
// cliente estático, sin build step) — sirve para filtrar bots casuales, no
// como autorización real. Ver nota en BITACORA.md, Tarea 2.
window.DESPENSA_CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbyuzU9Nx8hrzzYHKbjbCuKnkF_znWCCNA83wLfJrBwG_TOYzGgA8qDJSEBCHMQhsQr7gA/exec",
  TOKEN: "Bh5sxva56T2l84lhi6ADQQBF4lMOC6o7L-yh2h4CJ4I"
};
