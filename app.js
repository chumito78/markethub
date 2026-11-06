// MarketHub: panel de precios cripto con alertas.
// Usa la API pública y gratuita de CoinGecko (sin clave). Las alertas se guardan en el navegador.
(function () {
  "use strict";

  const API = "https://api.coingecko.com/api/v3/coins/markets";
  const NUM_MONEDAS = 30;
  const INTERVALO_MS = 60 * 1000;
  const CLAVE_ALERTAS = "markethub.alertas";
  const CLAVE_MONEDA = "markethub.moneda";

  const $ = (id) => document.getElementById(id);
  const el = {
    moneda: $("moneda"), actualizar: $("actualizar"), buscar: $("buscar"),
    estado: $("estado"), cuerpo: $("cuerpo"), avisos: $("avisos"),
    form: $("form-alerta"), alertaMoneda: $("alerta-moneda"),
    alertaCondicion: $("alerta-condicion"), alertaPrecio: $("alerta-precio"),
    lista: $("lista-alertas"), permiso: $("permiso-notif"),
  };

  let datos = [];
  let temporizador = null;

  // ---------- Almacenamiento seguro ----------
  function leer(clave, porDefecto) {
    try {
      const v = localStorage.getItem(clave);
      return v === null ? porDefecto : JSON.parse(v);
    } catch (e) { return porDefecto; }
  }
  function guardar(clave, valor) {
    try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) { /* sin almacenamiento */ }
  }

  let alertas = leer(CLAVE_ALERTAS, []);
  el.moneda.value = leer(CLAVE_MONEDA, "eur") === "usd" ? "usd" : "eur";

  // ---------- Formato ----------
  function divisa() { return el.moneda.value === "usd" ? "USD" : "EUR"; }
  function fmtPrecio(n, cod) {
    if (n === null || n === undefined) return "—";
    const dec = n >= 1 ? 2 : n >= 0.01 ? 4 : 8;
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: cod || divisa(), minimumFractionDigits: dec > 2 ? 2 : dec, maximumFractionDigits: dec }).format(n);
  }
  function fmtCompacto(n) {
    if (n === null || n === undefined) return "—";
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: divisa(), notation: "compact", maximumFractionDigits: 2 }).format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined) return "—";
    const signo = n > 0 ? "+" : "";
    return signo + new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(n) + " %";
  }
  function escapar(t) {
    return String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- Datos ----------
  async function cargar() {
    el.estado.textContent = "Actualizando precios…";
    const url = `${API}?vs_currency=${el.moneda.value}&order=market_cap_desc&per_page=${NUM_MONEDAS}&page=1&price_change_percentage=24h`;
    try {
      const r = await fetch(url);
      if (r.status === 429) throw new Error("Demasiadas consultas seguidas. Espera un minuto y vuelve a intentarlo.");
      if (!r.ok) throw new Error("El servicio de precios no respondió (código " + r.status + ").");
      datos = await r.json();
      pintarTabla();
      pintarSelectorAlertas();
      comprobarAlertas();
      el.estado.textContent = "Última actualización: " + new Date().toLocaleTimeString("es-ES") + ". Se actualiza solo cada minuto.";
    } catch (e) {
      const msg = e instanceof TypeError ? "No se pudo conectar con el servicio de precios. Revisa tu conexión." : e.message;
      el.estado.textContent = msg;
    }
  }

  function pintarTabla() {
    const filtro = el.buscar.value.trim().toLowerCase();
    const filas = datos.filter((m) => !filtro || m.name.toLowerCase().includes(filtro) || m.symbol.toLowerCase().includes(filtro));
    if (!filas.length) {
      el.cuerpo.innerHTML = `<tr><td colspan="6" class="estado">No hay monedas que coincidan con la búsqueda.</td></tr>`;
      return;
    }
    el.cuerpo.innerHTML = filas.map((m) => {
      const var24 = m.price_change_percentage_24h;
      const clase = var24 > 0 ? "sube" : var24 < 0 ? "baja" : "";
      return `<tr>
        <td class="num ocultar-movil">${m.market_cap_rank ?? ""}</td>
        <td><div class="moneda"><img src="${escapar(m.image)}" alt="" loading="lazy"><span>${escapar(m.name)}</span><span class="simbolo">${escapar(m.symbol)}</span></div></td>
        <td class="num">${fmtPrecio(m.current_price)}</td>
        <td class="num ${clase}">${fmtPct(var24)}</td>
        <td class="num ocultar-movil">${fmtCompacto(m.market_cap)}</td>
        <td class="num ocultar-movil">${fmtCompacto(m.total_volume)}</td>
      </tr>`;
    }).join("");
  }

  function pintarSelectorAlertas() {
    const actual = el.alertaMoneda.value;
    el.alertaMoneda.innerHTML = datos.map((m) => `<option value="${escapar(m.id)}">${escapar(m.name)} (${escapar(m.symbol.toUpperCase())})</option>`).join("");
    if (actual && datos.some((m) => m.id === actual)) el.alertaMoneda.value = actual;
  }

  // ---------- Alertas ----------
  function pintarAlertas() {
    if (!alertas.length) {
      el.lista.innerHTML = `<li class="estado">Aún no tienes alertas.</li>`;
    } else {
      el.lista.innerHTML = alertas.map((a, i) => {
        const texto = `${escapar(a.nombre)} ${a.condicion === "encima" ? "sube por encima de" : "baja por debajo de"} ${fmtPrecio(a.precio, a.divisa)}`;
        const marca = a.disparada ? `<span class="etiqueta">Avisada</span>` : `<span class="etiqueta">Activa</span>`;
        return `<li><span class="${a.disparada ? "disparada" : ""}">${texto}</span><span>${marca}<button class="borrar" data-i="${i}" title="Borrar alerta" aria-label="Borrar alerta">✕</button></span></li>`;
      }).join("");
    }
    el.permiso.hidden = !("Notification" in window) || Notification.permission !== "default" || !alertas.length;
  }

  function comprobarAlertas() {
    let cambio = false;
    alertas.forEach((a) => {
      if (a.disparada || a.divisa !== divisa()) return;
      const m = datos.find((d) => d.id === a.id);
      if (!m || m.current_price == null) return;
      const cruza = a.condicion === "encima" ? m.current_price >= a.precio : m.current_price <= a.precio;
      if (cruza) {
        a.disparada = true;
        cambio = true;
        avisar(`${a.nombre} ${a.condicion === "encima" ? "ha subido por encima de" : "ha bajado por debajo de"} ${fmtPrecio(a.precio, a.divisa)}. Precio actual: ${fmtPrecio(m.current_price, a.divisa)}.`);
      }
    });
    if (cambio) { guardar(CLAVE_ALERTAS, alertas); pintarAlertas(); }
  }

  function avisar(texto) {
    const caja = document.createElement("div");
    caja.className = "aviso";
    caja.setAttribute("role", "alert");
    caja.innerHTML = `<span>🔔 ${escapar(texto)}</span><button type="button" aria-label="Cerrar aviso">✕</button>`;
    caja.querySelector("button").addEventListener("click", () => caja.remove());
    el.avisos.appendChild(caja);
    try {
      if ("Notification" in window && Notification.permission === "granted") new Notification("MarketHub", { body: texto });
    } catch (e) { /* algunos navegadores no permiten avisos */ }
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      osc.frequency.value = 880;
      osc.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) { /* sin sonido */ }
  }

  // ---------- Eventos ----------
  el.form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const m = datos.find((d) => d.id === el.alertaMoneda.value);
    const precio = parseFloat(el.alertaPrecio.value);
    if (!m || !(precio > 0)) return;
    alertas.push({ id: m.id, nombre: m.name, condicion: el.alertaCondicion.value, precio, divisa: divisa(), disparada: false });
    guardar(CLAVE_ALERTAS, alertas);
    el.alertaPrecio.value = "";
    pintarAlertas();
    comprobarAlertas();
  });

  el.lista.addEventListener("click", (ev) => {
    const b = ev.target.closest("button.borrar");
    if (!b) return;
    alertas.splice(Number(b.dataset.i), 1);
    guardar(CLAVE_ALERTAS, alertas);
    pintarAlertas();
  });

  el.permiso.addEventListener("click", async () => {
    try { await Notification.requestPermission(); } catch (e) { /* ignorar */ }
    pintarAlertas();
  });

  el.buscar.addEventListener("input", pintarTabla);
  el.moneda.addEventListener("change", () => { guardar(CLAVE_MONEDA, el.moneda.value); reiniciar(); });
  el.actualizar.addEventListener("click", reiniciar);

  function reiniciar() {
    clearInterval(temporizador);
    cargar();
    temporizador = setInterval(cargar, INTERVALO_MS);
  }

  pintarAlertas();
  reiniciar();
})();
