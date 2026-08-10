# CLAUDE.md — Proyecto Despensa

## Qué es esto

App personal de captura de compras de súper. Se usa **dentro de la tienda**, con el
carrito enfrente: se escanea el código del producto, se teclea el precio del anaquel y
se lleva un total corriendo contra un presupuesto. De ahí salen tres cosas: control de
gasto, historial de precios propio y planeación semanal/mensual.

**El caso de uso NO es inventariar la despensa en casa.** Registrar 40 productos el
domingo en la cocina es una tarea que se abandona. Toda decisión de diseño se juzga
contra la pregunta: ¿esto funciona con una mano, en un pasillo, con prisa?

## Arquitectura

| Pieza | Decisión |
|---|---|
| Frontend | PWA estática, HTML/CSS/JS vanilla, sin build step |
| Hosting | GitHub Pages, repo `jrbernardino/despensa`, rama `main`, raíz |
| Backend | Google Apps Script Web App (`doGet`/`doPost`) como API |
| Datos | Google Sheets, escrituras **append-only** |
| Local | IndexedDB primero, sincroniza después (la señal en el súper es mala) |

No se usa Apps Script HtmlService para servir la PWA: corre en un iframe sandbox de
Google y `getUserMedia` da problemas de permisos. El origen HTTPS propio es requisito.

## Lectura de códigos

Validado en campo el 2026-08-09 con 18 productos reales:

- **Android/Chrome:** `BarcodeDetector` nativo. Rápido y confiable. Es la ruta principal.
- **iOS/Safari:** no existe `BarcodeDetector`. El escaneo continuo con ZXing **falla**
  porque Safari no enfoca a corta distancia y no expone control de enfoque. La ruta que
  sí funciona es **foto fija**: `<input type="file" accept="image/*" capture="environment">`
  abre la cámara nativa (con toque para enfocar) y se decodifica esa imagen.
- Siempre debe existir **alta manual** sin código. Nunca dejar al usuario atorado.

## Reglas de datos aprendidas en campo

1. **Los códigos se guardan como TEXTO.** Al abrir un CSV en Excel, `041789001956`
   se convierte en `41789001956` y el producto deja de empatar consigo mismo entre
   compras. Normalizar todo a GTIN-13 con ceros a la izquierda.
2. **`gtin` y `cod_tienda` son columnas distintas.** La papa trae `7503060303003` del
   empacador pero Walmart la cobra como PLU `32285`. El PLU solo vale en esa cadena.
3. **Los EAN que empiezan con 2 (13 dígitos) son códigos internos de tienda** y suelen
   codificar peso o precio dentro del número. No sirven como identidad del producto.
4. **Doble lectura obligatoria:** aceptar un código solo tras dos detecciones seguidas
   iguales. Se observó un falso positivo que pasaba el dígito verificador.
5. **Precio de anaquel ≠ precio cobrado.** En la prueba, un arroz marcado a $28 se cobró
   a $37. Se guardan ambos y se concilia contra el ticket.
6. **Una "compra" puede abarcar varias tiendas el mismo día.** La tienda es atributo de
   la partida, no solo del encabezado.

## Convenciones de trabajo

- `TAREAS.md` es la fuente de verdad del backlog. Una tarea a la vez, en orden.
- `BITACORA.md` registra qué se hizo, append-only, con fecha.
- **Discovery gate:** antes de implementar cualquier tarea, leer el código existente y
  proponer el plan. No escribir código en la misma respuesta que el descubrimiento.
- Escrituras a Sheets siempre append-only. Nunca sobrescribir filas históricas.
- Sin frameworks, sin bundler. Un archivo por pantalla mientras se pueda.
- Español en UI y comentarios.

## Caso de prueba con respuesta conocida

Compra del 2026-08-09 (archivo `compra-2026-08-09.xlsx`):
- Walmart: 25 unidades, **$1,242.93** (conciliado contra ticket, diferencia cero)
- Pollería: 1 unidad, **$229.00**
- Total: **$1,471.93**

Incluye los tres casos difíciles: producto pesado por PLU sin código de barras
(jitomate, `40877`), código de empacador distinto al de la caja (papa) y discrepancia
de precio anaquel/cobrado (arroz).

## Cobertura de Open Food Facts

Medida sobre productos mexicanos reales: **56–75%**. Bien las transnacionales y marcas
nacionales grandes (Bimbo, Kellogg's, Quaker, McCormick, Del Monte, Tajín, Valentina).
Mal los fabricantes chicos. Se usa como **semilla**, nunca como fuente de verdad: el
catálogo propio manda y se llena solo con el uso.
