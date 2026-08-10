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
    const bar=$("bar");
    if(b>0){
      const pct=Math.min(t/b*100,100);
      bar.style.width=pct+"%"; bar.classList.toggle("over", t>b);
      $("tLeft").textContent = (t>b? "Excedido "+money(t-b) : "Restan "+money(b-t));
    } else { bar.style.width="0"; $("tLeft").textContent=""; }
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
      li.querySelector(".mt").textContent = it.qty+" × "+money(it.price)+" · "+it.code;
      li.querySelector(".flag").textContent = it.granel ? "Código de tienda" : "";
      li.querySelector(".amt").textContent = money(it.price*it.qty);
      li.querySelector(".x").addEventListener("click",()=>{
        state.items.splice(idx,1); save(); render(); totals();
      });
      return li;
    }));
    totals();
  }

  /* ---------- cámara ---------- */
  $("btnStart").addEventListener("click", ()=> running? stop():start());

  async function start(){
    const b=$("btnStart"); b.disabled=true; b.textContent="Iniciando…";
    try{
      if(!("BarcodeDetector" in window)) throw new Error("nodetector");
      const sup = await window.BarcodeDetector.getSupportedFormats();
      const fmt = ["ean_13","ean_8","upc_a","upc_e"].filter(f=>sup.includes(f));
      if(!fmt.length) throw new Error("nodetector");
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
      const msg = err.message==="nodetector"
        ? "Este navegador no trae lector de códigos. Usa Chrome en Android, o la captura manual."
        : "No se pudo abrir la cámara ("+(err.name||"error")+"). Revisa el permiso del sitio.";
      alertEl.innerHTML='<div class="alert">'+msg+'</div>';
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

  /* ---------- panel de precio ---------- */
  function openSheet(code, nameHint){
    pending={code, name:nameHint||code, granel:/^2/.test(code)&&code.length===13};
    pQty=1;
    $("sProd").textContent = pending.name;
    $("sCode").textContent = code;
    $("sFlag").innerHTML = pending.granel
      ? '<div class="alert">Código interno de tienda: el número cambia según el peso. Escribe tú el nombre al exportar.</div>' : "";
    $("sQty").textContent="1"; $("sPrice").value="";
    sheet.classList.add("on");
    setTimeout(()=>{ try{ $("sPrice").focus(); }catch(_){} },120);
    if(/^\d{8,14}$/.test(code)) lookup(code);
  }
  function closeSheet(){ sheet.classList.remove("on"); pending=null; }

  async function lookup(code){
    try{
      const r = await fetch("https://world.openfoodfacts.org/api/v2/product/"+encodeURIComponent(code)+
        ".json?fields=product_name,product_name_es,brands,quantity");
      const d = r.ok? await r.json():null;
      const p = d && d.status===1 ? d.product : null;
      if(p && pending && pending.code===code){
        const nm=[p.product_name_es||p.product_name||"", p.brands||"", p.quantity||""].filter(Boolean).join(" · ");
        if(nm){ pending.name=nm; $("sProd").textContent=nm; }
      }
    }catch(_){}
  }

  $("sPlus").addEventListener("click", ()=>{ pQty++; $("sQty").textContent=pQty; });
  $("sMinus").addEventListener("click", ()=>{ if(pQty>1){pQty--; $("sQty").textContent=pQty;} });
  $("sCancel").addEventListener("click", closeSheet);
  $("sPrice").addEventListener("keydown", e=>{ if(e.key==="Enter") addPending(); });
  $("sAdd").addEventListener("click", addPending);

  function addPending(){
    if(!pending) return;
    const price = parseFloat(String($("sPrice").value).replace(",","."))||0;
    state.items.unshift({code:pending.code, name:pending.name, price, qty:pQty,
      granel:pending.granel, at:new Date().toISOString()});
    save(); render(); closeSheet();
  }

  /* ---------- manual ---------- */
  $("btnManual").addEventListener("click", ()=>{
    const v=$("manual").value.trim(); if(!v) return;
    openSheet(v, /^\d+$/.test(v)? v : v);
    $("manual").value="";
  });

  /* ---------- campos de compra ---------- */
  $("store").addEventListener("input", e=>{ state.store=e.target.value; save(); });
  $("budget").addEventListener("input", e=>{ state.budget=e.target.value; save(); totals(); });

  /* ---------- exportar ---------- */
  function rows(){
    const head=["fecha","tienda","codigo","producto","cantidad","precio_unit","subtotal"];
    const body=state.items.map(i=>[i.at, state.store||"", i.code, i.name, i.qty,
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

  load(); render();
})();
