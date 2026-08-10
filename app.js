(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const KEY = "despensa.compra.v1";
  const video=$("video"), idle=$("idle"), reticle=$("reticle"), alertEl=$("alert");
  const sheet=$("sheet");

  let state = { store:"", budget:"", items:[] };
  let detector=null, stream=null, track=null, running=false, torchOn=false, wake=null;
  let seenCode="", seenHits=0, lastAdded="", lastAddedAt=0;
  let pending=null, pQty=1;

  /* ---------- persistencia ---------- */
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(_){} }
  function load(){
    try{ const r=localStorage.getItem(KEY); if(r) state=Object.assign(state, JSON.parse(r)); }catch(_){}
    $("store").value=state.store||""; $("budget").value=state.budget||"";
  }

  /* ---------- totales ---------- */
  const money = n => "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,",");
  function totals(){
    const t = state.items.reduce((s,i)=> s + i.price*i.qty, 0);
    const n = state.items.reduce((s,i)=> s + i.qty, 0);
    $("tTotal").textContent = money(t);
    $("tCount").textContent = n + (n===1?" artículo":" artículos");
    const b = parseFloat(String(state.budget).replace(",","."))||0;
    const bar=$("bar"), tLeft=$("tLeft");
    if(b>0){
      const pct=Math.min(t/b*100,100);
      const excedido = t>b;
      bar.style.width=pct+"%"; bar.classList.toggle("over", excedido);
      tLeft.textContent = excedido ? "Excedido "+money(t-b) : "Restan "+money(b-t);
      tLeft.classList.toggle("over", excedido);
    } else { bar.style.width="0"; tLeft.textContent=""; tLeft.classList.remove("over"); }

    // el presupuesto se fija al abrir la compra: una vez que hay artículos, ya no se toca
    $("budget").disabled = state.items.length>0;
  }

  /* ---------- lista ---------- */
  function render(){
    const list=$("list");
    $("listEmpty").hidden = state.items.length>0;
    list.replaceChildren(...state.items.map((it,idx)=>{
      const li=document.createElement("li");
      li.innerHTML='<div><div class="nm"></div><div class="mt"></div><div class="flag"></div></div>'+
                   '<div class="amt"></div><button class="x" aria-label="Quitar">✕</button>';
      li.querySelector(".nm").textContent = it.name;
      li.querySelector(".mt").textContent = it.peso
        ? (it.qty.toFixed(3)+" kg × "+money(it.price)+"/kg")
        : (it.qty+" × "+money(it.price)+" · "+it.code);
      li.querySelector(".flag").textContent = it.granel ? "Código de tienda" : (it.peso ? "Granel" : "");
      li.querySelector(".amt").textContent = money(it.price*it.qty);
      li.querySelector(".x").addEventListener("click",()=>{
        state.items.splice(idx,1); save(); render(); totals();
      });
      return li;
    }));
    totals();
  }

  /* ---------- cámara: modo video (Android/Chrome, BarcodeDetector) ---------- */
  let modoFoto = false;

  // decide una vez al cargar si hay BarcodeDetector con los formatos que nos sirven;
  // si no, esconde el botón de video y muestra "Tomar foto" en su lugar
  async function initEscaner(){
    let ok = false;
    try{
      if("BarcodeDetector" in window){
        const sup = await window.BarcodeDetector.getSupportedFormats();
        ok = ["ean_13","ean_8","upc_a","upc_e"].some(f=>sup.includes(f));
      }
    }catch(_){}
    modoFoto = !ok;
    $("btnStart").hidden = modoFoto;
    $("btnTorch").hidden = modoFoto;
    $("btnPhoto").hidden = !modoFoto;
    if(modoFoto) idle.textContent = "Toca «Tomar foto» para escanear";
  }

  $("btnStart").addEventListener("click", ()=> running? stop():start());

  async function start(){
    const b=$("btnStart"); b.disabled=true; b.textContent="Iniciando…";
    try{
      const sup = await window.BarcodeDetector.getSupportedFormats();
      const fmt = ["ean_13","ean_8","upc_a","upc_e"].filter(f=>sup.includes(f));
      detector = new window.BarcodeDetector({formats:fmt});

      stream = await navigator.mediaDevices.getUserMedia({
        video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:960}}, audio:false});
      video.srcObject=stream; await video.play();
      track=stream.getVideoTracks()[0];
      running=true; idle.hidden=true; reticle.hidden=false;
      b.textContent="Apagar cámara";
      const caps = track.getCapabilities? track.getCapabilities():{};
      $("btnTorch").disabled = !("torch" in caps);
      try{ wake = await navigator.wakeLock.request("screen"); }catch(_){}
      loop();
    }catch(err){
      alertEl.innerHTML='<div class="alert">No se pudo abrir la cámara ('+(err.name||"error")+'). Revisa el permiso del sitio.</div>';
      b.textContent="Encender cámara";
    }
    b.disabled=false;
  }

  function stop(){
    running=false; torchOn=false;
    if(stream) stream.getTracks().forEach(t=>t.stop());
    stream=null; track=null; video.srcObject=null;
    idle.hidden=false; reticle.hidden=true;
    $("btnStart").textContent="Encender cámara"; $("btnTorch").disabled=true;
    if(wake){ try{ wake.release(); }catch(_){} wake=null; }
  }

  $("btnTorch").addEventListener("click", async ()=>{
    if(!track) return; torchOn=!torchOn;
    try{ await track.applyConstraints({advanced:[{torch:torchOn}]}); }
    catch(_){ $("btnTorch").disabled=true; }
  });

  /* ---------- cámara: modo foto (iOS/Safari, sin BarcodeDetector) ----------
   * Safari no enfoca a corta distancia en video continuo (ver CLAUDE.md). La ruta que
   * funciona es <input type=file capture=environment>: abre la cámara nativa con toque
   * para enfocar, y decodificamos la foto resultante con ZXing.
   */
  let zxingCargando = null;
  function cargarZXing(){
    if(window.ZXing) return Promise.resolve(window.ZXing);
    if(zxingCargando) return zxingCargando;
    zxingCargando = new Promise((resolve, reject)=>{
      const s=document.createElement("script");
      s.src="./vendor/zxing.min.js";
      s.onload=()=>resolve(window.ZXing);
      s.onerror=()=>reject(new Error("no se pudo cargar el lector"));
      document.head.appendChild(s);
    });
    return zxingCargando;
  }

  // reimplementa "decodeFromCanvas" (no existe en la version vendorizada de la
  // libreria) a partir de las piezas de bajo nivel que si expone
  function decodeFromCanvas_(reader, canvas, ZX){
    const fuente = new ZX.HTMLCanvasElementLuminanceSource(canvas);
    const bitmap = new ZX.BinaryBitmap(new ZX.HybridBinarizer(fuente));
    return reader.decodeBitmap(bitmap);
  }

  function dibujarEnCanvas(img, maxLado){
    let w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
    if(Math.max(w,h) > maxLado){
      const esc = maxLado/Math.max(w,h);
      w=Math.round(w*esc); h=Math.round(h*esc);
    }
    const c=document.createElement("canvas");
    c.width=w; c.height=h;
    c.getContext("2d").drawImage(img,0,0,w,h);
    return c;
  }

  // segundo intento: recorte central al 50%, ampliado 2x
  function recorteCentral2x(canvas){
    const cw=Math.round(canvas.width*0.5), ch=Math.round(canvas.height*0.5);
    const cx=Math.round((canvas.width-cw)/2), cy=Math.round((canvas.height-ch)/2);
    const out=document.createElement("canvas");
    out.width=cw*2; out.height=ch*2;
    out.getContext("2d").drawImage(canvas, cx,cy,cw,ch, 0,0,cw*2,ch*2);
    return out;
  }

  $("btnPhoto").addEventListener("click", ()=> $("fileCam").click());

  $("fileCam").addEventListener("change", async (e)=>{
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if(file) procesarFoto(file);
  });

  async function procesarFoto(file){
    const b=$("btnPhoto"); b.disabled=true; b.textContent="Leyendo…";
    alertEl.innerHTML="";
    try{
      const ZX = await cargarZXing();
      const hints = new Map();
      hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS,
        [ZX.BarcodeFormat.EAN_13, ZX.BarcodeFormat.EAN_8, ZX.BarcodeFormat.UPC_A, ZX.BarcodeFormat.UPC_E]);
      hints.set(ZX.DecodeHintType.TRY_HARDER, true);
      const reader = new ZX.BrowserMultiFormatReader(hints);

      const url = URL.createObjectURL(file);
      const img = new Image();
      try{
        await new Promise((res,rej)=>{ img.onload=res; img.onerror=rej; img.src=url; });
      } finally { URL.revokeObjectURL(url); }

      const base = dibujarEnCanvas(img, 1600);
      let resultado=null;
      try{ resultado = decodeFromCanvas_(reader, base, ZX); }
      catch(_){
        try{ resultado = decodeFromCanvas_(reader, recorteCentral2x(base), ZX); }
        catch(_){ resultado=null; }
      }

      if(resultado){
        const code = resultado.getText();
        beep();
        const dup = state.items.find(i=>i.code===code);
        if(dup){ dup.qty++; save(); render(); }
        else openSheet(code);
      } else {
        alertEl.innerHTML='<div class="alert">No se pudo leer el código en la foto. Intenta de nuevo o usa la captura manual.</div>';
      }
    }catch(err){
      alertEl.innerHTML='<div class="alert">No se pudo procesar la foto. Intenta de nuevo o usa la captura manual.</div>';
    }
    b.disabled=false; b.textContent="Tomar foto";
  }

  function loop(){
    const tick = async ()=>{
      if(!running) return;
      if(!sheet.classList.contains("on")){
        try{
          const hits = await detector.detect(video);
          if(hits.length) confirm2(hits[0].rawValue);
        }catch(_){}
      }
      setTimeout(tick, 180);
    };
    tick();
  }

  // exige dos lecturas seguidas del mismo código: mata los falsos positivos
  function confirm2(code){
    if(code===seenCode){ seenHits++; } else { seenCode=code; seenHits=1; }
    if(seenHits<2) return;
    seenCode=""; seenHits=0;
    const now=Date.now();
    if(code===lastAdded && now-lastAddedAt<2500) return;
    lastAdded=code; lastAddedAt=now;
    beep();
    const dup = state.items.find(i=>i.code===code);
    if(dup){ dup.qty++; save(); render(); return; }
    openSheet(code);
  }

  function beep(){
    if(navigator.vibrate) navigator.vibrate(45);
    try{
      const c=new (window.AudioContext||window.webkitAudioContext)();
      const o=c.createOscillator(), g=c.createGain();
      o.frequency.value=1180; o.type="square";
      g.gain.setValueAtTime(.05,c.currentTime);
      g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.11);
      o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime+.12);
      setTimeout(()=>c.close(),400);
    }catch(_){}
  }

  /* ---------- catalogo local (semilla hasta que exista IndexedDB, Tarea 9) ---------- */
  const CAT_KEY = "despensa.catalogo.v1";
  function catalogoLocal(){
    try{ return JSON.parse(localStorage.getItem(CAT_KEY)) || {}; }catch(_){ return {}; }
  }
  function catalogoLocalGuardar(gtin, producto){
    try{
      const c = catalogoLocal();
      c[gtin] = producto;
      localStorage.setItem(CAT_KEY, JSON.stringify(c));
    }catch(_){}
  }

  /* ---------- API propia (Apps Script) ---------- */
  async function apiPost(accion, datos){
    const cfg = window.DESPENSA_CONFIG;
    if(!cfg || !cfg.API_URL) return null;
    try{
      const r = await fetch(cfg.API_URL, {
        method:"POST",
        headers:{"Content-Type":"text/plain"}, // evita el preflight OPTIONS que Apps Script no maneja
        body: JSON.stringify(Object.assign({token:cfg.TOKEN, accion}, datos))
      });
      if(!r.ok) return null;
      return await r.json();
    }catch(_){ return null; }
  }

  /* ---------- panel de precio ---------- */
  function openSheet(code, nameHint, peso){
    const granel = !peso && /^2/.test(code) && code.length===13;
    pending={code, name:nameHint||code, granel, peso:!!peso, enCatalogo:false};
    pQty=1;
    $("sProd").value = pending.name;
    $("sCode").textContent = code;
    $("sTienda").value = $("store").value || "";
    $("sFlag").innerHTML = granel
      ? '<div class="alert">Código interno de tienda: el número cambia según el peso. Escribe tú el nombre.</div>' : "";

    $("sPriceLabel").textContent = peso ? "Precio por kilo" : "Precio unitario";
    $("sQtyUnidad").hidden = !!peso;
    $("sQtyPeso").hidden = !peso;
    $("sQty").textContent="1"; $("sPrice").value=""; $("sKg").value="";
    actualizarSubtotalPeso();

    sheet.classList.add("on");
    setTimeout(()=>{
      try{ (granel ? $("sProd") : peso ? $("sKg") : $("sPrice")).focus(); }catch(_){}
    },120);
    // los codigos internos de tienda y los PLU de granel no sirven como identidad de
    // producto en un catalogo global: ni unos ni otros se buscan en local/remoto/OFF
    if(!granel && !peso && /^\d{8,14}$/.test(code)) resolverProducto(code);
    if(peso){
      const local = catalogoLocal()[code];
      if(local && local.producto){ pending.name=local.producto; $("sProd").value=local.producto; }
    }
  }
  function closeSheet(){ sheet.classList.remove("on"); pending=null; }

  function actualizarSubtotalPeso(){
    const kg = parseFloat(String($("sKg").value).replace(",","."))||0;
    const precio = parseFloat(String($("sPrice").value).replace(",","."))||0;
    $("sSubtotal").textContent = (kg>0 && precio>0) ? ("Subtotal: "+money(kg*precio)) : "";
  }
  $("sKg").addEventListener("input", actualizarSubtotalPeso);
  $("sPrice").addEventListener("input", actualizarSubtotalPeso);

  // catalogo local -> tu catalogo remoto -> Open Food Facts como semilla (nunca fuente de verdad)
  async function resolverProducto(code){
    const local = catalogoLocal()[code];
    if(local){ aplicarProducto(code, local, true); return; }

    const remoto = await apiPost("buscarProducto", {gtin:code});
    if(remoto && remoto.ok && remoto.producto){
      aplicarProducto(code, remoto.producto, true);
      catalogoLocalGuardar(code, remoto.producto);
      return;
    }

    try{
      const r = await fetch("https://world.openfoodfacts.org/api/v2/product/"+encodeURIComponent(code)+
        ".json?fields=product_name,product_name_es,brands,quantity");
      const d = r.ok? await r.json():null;
      const p = d && d.status===1 ? d.product : null;
      if(p){
        const nm=[p.product_name_es||p.product_name||"", p.brands||"", p.quantity||""].filter(Boolean).join(" · ");
        if(nm) aplicarProducto(code, {producto:nm, marca:p.brands||"", categoria:"",
          unidad:"", contenido:p.quantity||"", fuente:"off"}, false);
      }
    }catch(_){}
  }

  // enCatalogo=true cuando el hit viene de tu propio catalogo (local o remoto): ya no
  // hace falta volver a escribirlo. false cuando es semilla de OFF o el usuario lo tecleo.
  function aplicarProducto(code, producto, enCatalogo){
    if(!pending || pending.code!==code) return;
    if(producto.producto){ pending.name=producto.producto; $("sProd").value=producto.producto; }
    pending.marca=producto.marca||""; pending.categoria=producto.categoria||"";
    pending.unidad=producto.unidad||""; pending.contenido=producto.contenido||"";
    pending.fuente=producto.fuente||"";
    pending.enCatalogo=enCatalogo;
  }

  $("sPlus").addEventListener("click", ()=>{ pQty++; $("sQty").textContent=pQty; });
  $("sMinus").addEventListener("click", ()=>{ if(pQty>1){pQty--; $("sQty").textContent=pQty;} });
  $("sCancel").addEventListener("click", closeSheet);
  $("sPrice").addEventListener("keydown", e=>{ if(e.key==="Enter") addPending(); });
  $("sAdd").addEventListener("click", addPending);

  function addPending(){
    if(!pending) return;
    const price = parseFloat(String($("sPrice").value).replace(",","."))||0;
    const nombre = ($("sProd").value||"").trim() || pending.code; // el nombre nunca queda vacio
    const tienda = ($("sTienda").value||"").trim();
    const p = pending; // se toma antes de closeSheet(), que limpia "pending"

    const qty = p.peso ? (parseFloat(String($("sKg").value).replace(",","."))||0) : pQty;
    if(p.peso && qty<=0) return; // sin kilos capturados todavia, no se agrega

    state.items.unshift({code:p.code, name:nombre, price, qty,
      granel:p.granel, peso:p.peso, unidad:p.peso?"kg":"", tienda, at:new Date().toISOString()});
    save(); render(); closeSheet();

    if(p.peso){
      // el PLU no es un GTIN: se recuerda solo en este telefono, nunca al Catalogo compartido
      catalogoLocalGuardar(p.code, {producto:nombre, marca:"", categoria:"",
        unidad:"kg", contenido:"", fuente:"granel"});
      return;
    }

    // el catalogo propio se llena solo con el uso: si no estaba ya en tu catalogo, se sube
    if(!p.granel && !p.enCatalogo){
      apiPost("guardarProducto", {producto:{
        gtin:p.code, producto:nombre, marca:p.marca||"", categoria:p.categoria||"",
        unidad:p.unidad||"", contenido:p.contenido||"", fuente:p.fuente||"app"
      }}).then(res=>{
        if(res && res.ok) catalogoLocalGuardar(p.code, {producto:nombre, marca:p.marca||"",
          categoria:p.categoria||"", unidad:p.unidad||"", contenido:p.contenido||"", fuente:"app"});
      });
    }
  }

  /* ---------- manual ---------- */
  $("btnManual").addEventListener("click", ()=>{
    const v=$("manual").value.trim(); if(!v) return;
    $("manual").value="";
    const dup = state.items.find(i=>i.code===v);
    if(dup){ dup.qty++; save(); render(); return; }
    openSheet(v, v);
  });

  /* ---------- granel (peso): lista corta de frecuentes + PLU manual ---------- */
  const GRANEL_FRECUENTES = [
    "Jitomate","Cebolla","Papa","Limón","Aguacate","Plátano","Manzana","Queso","Pechuga de pollo"
  ];
  function slug(s){
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
      .replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"");
  }
  (function initGranelBotones(){
    const cont = $("granelBotones");
    GRANEL_FRECUENTES.forEach(nombre=>{
      const b=document.createElement("button");
      b.className="ghost"; b.textContent=nombre;
      b.addEventListener("click", ()=> openSheet("granel:"+slug(nombre), nombre, true));
      cont.appendChild(b);
    });
  })();

  $("btnPluManual").addEventListener("click", ()=>{
    const v=$("pluManual").value.trim(); if(!v) return;
    $("pluManual").value="";
    openSheet(v, v, true); // cada pesada es su propia fila: no se busca duplicado
  });

  /* ---------- campos de compra ---------- */
  $("store").addEventListener("input", e=>{ state.store=e.target.value; save(); });
  $("budget").addEventListener("input", e=>{ state.budget=e.target.value; save(); totals(); });

  /* ---------- exportar ---------- */
  function rows(){
    const head=["fecha","tienda","codigo","producto","cantidad","precio_unit","subtotal"];
    const body=state.items.map(i=>[i.at, i.tienda||state.store||"", i.code, i.name, i.qty,
      i.price.toFixed(2), (i.price*i.qty).toFixed(2)]);
    return [head, ...body];
  }
  $("btnCsv").addEventListener("click", ()=>{
    const csv = rows().map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(",")).join("\n");
    const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download="compra-"+new Date().toISOString().slice(0,10)+".csv";
    a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  });
  $("btnCopy").addEventListener("click", async ()=>{
    const t = rows().map(r=>r.join("\t")).join("\n");
    const b=$("btnCopy");
    try{ await navigator.clipboard.writeText(t); b.textContent="Copiado"; }
    catch(_){ b.textContent="No se pudo"; }
    setTimeout(()=>b.textContent="Copiar",1600);
  });

  $("btnReset").addEventListener("click", ()=>{
    if(!state.items.length) return;
    if(!window.confirm("¿Vaciar la compra? Descarga el CSV antes si aún no lo tienes.")) return;
    state.items=[]; save(); render();
  });

  document.addEventListener("visibilitychange", ()=>{ if(document.hidden && running) stop(); });
  window.addEventListener("beforeunload", save);

  /* ---------- service worker (shell offline) ---------- */
  if("serviceWorker" in navigator){
    window.addEventListener("load", ()=>{
      navigator.serviceWorker.register("./sw.js").catch(()=>{});
    });
  }

  load(); render(); initEscaner();
})();
