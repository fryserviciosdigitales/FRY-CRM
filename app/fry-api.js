/*
 * FRY CRM - Adaptador para GitHub Pages.
 * Sustituye a google.script.run: envía cada llamada por fetch() a la API de Apps Script,
 * incluyendo el token de "Iniciar sesión con Google" para que el servidor identifique al usuario.
 * Si la página se ejecuta dentro de Apps Script (google.script.run ya existe), no hace nada.
 */
(function () {
  "use strict";
  if (window.google && window.google.script && window.google.script.run) return;

  var CFG = window.FRY_CONFIG || {};
  var CLIENT_ID = String(CFG.GOOGLE_CLIENT_ID || "");

  /*
   * Qué servidor (API) usa esta página:
   *  - Formato nuevo: config.js trae una lista CLIENTES {codigo: url}. El enlace elige la empresa con ?c=codigo
   *    (o se usa CLIENTE_POR_DEFECTO). Solo se aceptan URLs de esa lista: así nadie puede crear un enlace que
   *    envíe el inicio de sesión de un usuario a un servidor ajeno.
   *  - Formato antiguo: una sola API_URL.
   */
  function resolverApi() {
    var clientes = CFG.CLIENTES;
    if (clientes && typeof clientes === "object") {
      var codigo = "";
      try { codigo = new URLSearchParams((window.location && window.location.search) || "").get("c") || ""; } catch (e) {}
      if (!codigo) codigo = String(CFG.CLIENTE_POR_DEFECTO || "");
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(codigo) || !Object.prototype.hasOwnProperty.call(clientes, codigo)) {
        return { url: "", error: "No se reconoce la empresa de este enlace. Pide a FRY el enlace correcto." };
      }
      return { url: String(clientes[codigo] || ""), error: "" };
    }
    return { url: String(CFG.API_URL || ""), error: "" };
  }
  var API = resolverApi();
  var API_URL = API.url;
  var CLAVE_TOKEN = "fry_crm_token";
  var esperandoLogin = null;
  var cargandoGis = null;
  var overlay = null;
  var botonSalir = null;

  function configurado() {
    return API_URL.indexOf("https://script.google.com/") === 0 && API_URL.indexOf("PEGA_AQUI") === -1 &&
      CLIENT_ID.indexOf(".apps.googleusercontent.com") > 0 && CLIENT_ID.indexOf("PEGA_AQUI") === -1;
  }

  /* ---------- token ---------- */
  function leerToken() { try { return sessionStorage.getItem(CLAVE_TOKEN) || null; } catch (e) { return null; } }
  function guardarToken(t) {
    try { if (t) sessionStorage.setItem(CLAVE_TOKEN, t); else sessionStorage.removeItem(CLAVE_TOKEN); } catch (e) {}
  }
  function expiracion(token) {
    try {
      var p = String(token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      while (p.length % 4) p += "=";
      var json = decodeURIComponent(atob(p).split("").map(function (c) {
        return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(""));
      return Number(JSON.parse(json).exp) * 1000 || 0;
    } catch (e) { return 0; }
  }
  function tokenVigente(t) { return !!t && expiracion(t) > Date.now() + 60000; }

  /* ---------- pantalla de acceso ---------- */
  function crearOverlay() {
    var ov = document.createElement("div");
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    ov.setAttribute("aria-label", "Iniciar sesión");
    ov.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.92);display:flex;" +
      "align-items:center;justify-content:center;padding:20px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    var caja = document.createElement("div");
    caja.style.cssText = "background:#fff;color:#111827;max-width:380px;width:100%;padding:32px 24px;" +
      "border-radius:16px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.35)";
    var titulo = document.createElement("h1");
    titulo.textContent = "FRY CRM";
    titulo.style.cssText = "margin:0 0 8px;font-size:26px";
    var msg = document.createElement("p");
    msg.setAttribute("aria-live", "polite");
    msg.style.cssText = "margin:0 0 20px;color:#4b5563;line-height:1.45;font-size:15px";
    var zona = document.createElement("div");
    zona.style.cssText = "display:flex;justify-content:center;min-height:44px";
    caja.appendChild(titulo); caja.appendChild(msg); caja.appendChild(zona);
    ov.appendChild(caja);
    (document.body || document.documentElement).appendChild(ov);
    return { ov: ov, msg: msg, zona: zona };
  }
  function mostrarOverlay(texto) {
    if (!overlay) overlay = crearOverlay();
    overlay.msg.textContent = texto;
    overlay.ov.style.display = "flex";
    return overlay;
  }
  function ocultarOverlay() { if (overlay) overlay.ov.style.display = "none"; }

  function mostrarBotonSalir() {
    if (botonSalir || !document.body) return;
    botonSalir = document.createElement("button");
    botonSalir.type = "button";
    botonSalir.textContent = "Cerrar sesión";
    botonSalir.style.cssText = "position:fixed;right:10px;bottom:10px;z-index:2147482000;opacity:.75;border:0;" +
      "border-radius:8px;padding:6px 10px;font-size:12px;background:#1f2937;color:#fff;cursor:pointer";
    botonSalir.addEventListener("click", cerrarSesion);
    document.body.appendChild(botonSalir);
  }
  function cerrarSesion() {
    guardarToken(null);
    try { window.google.accounts.id.disableAutoSelect(); } catch (e) {}
    location.reload();
  }
  window.cerrarSesionCRM = cerrarSesion;

  /* ---------- Google Identity Services ---------- */
  var SCRIPT_SHIM = null;
  function asegurarShim() {
    window.google = window.google || {};
    if (!window.google.script) window.google.script = SCRIPT_SHIM;
  }
  function cargarGis() {
    if (window.google && window.google.accounts && window.google.accounts.id) { asegurarShim(); return Promise.resolve(); }
    if (cargandoGis) return cargandoGis;
    cargandoGis = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.defer = true;
      s.onload = function () { asegurarShim(); resolve(); };
      s.onerror = function () { cargandoGis = null; reject(new Error("No se pudo cargar el inicio de sesión de Google. Comprueba tu conexión.")); };
      document.head.appendChild(s);
    });
    return cargandoGis;
  }

  function pedirLogin(texto) {
    if (esperandoLogin) return esperandoLogin;
    esperandoLogin = new Promise(function (resolve, reject) {
      var ov = mostrarOverlay(texto || "Inicia sesión con tu cuenta de Google para continuar.");
      cargarGis().then(function () {
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          auto_select: true,
          cancel_on_tap_outside: false,
          callback: function (r) {
            if (r && r.credential) {
              guardarToken(r.credential);
              ocultarOverlay();
              mostrarBotonSalir();
              esperandoLogin = null;
              resolve(r.credential);
            }
          }
        });
        ov.zona.textContent = "";
        window.google.accounts.id.renderButton(ov.zona, { theme: "outline", size: "large", text: "signin_with", locale: "es", width: 280 });
        try { window.google.accounts.id.prompt(); } catch (e) {}
      }).catch(function (error) {
        ov.msg.textContent = error.message;
        esperandoLogin = null;
        reject(error);
      });
    });
    return esperandoLogin;
  }

  function obtenerToken(texto) {
    var t = leerToken();
    if (tokenVigente(t)) { mostrarBotonSalir(); return Promise.resolve(t); }
    guardarToken(null);
    return pedirLogin(texto);
  }

  /* ---------- llamadas al servidor ---------- */
  function llamar(fn, args, reintento) {
    if (API.error) return Promise.reject(new Error(API.error));
    if (!configurado()) {
      return Promise.reject(new Error("Falta configurar API_URL y GOOGLE_CLIENT_ID en config.js."));
    }
    return obtenerToken(reintento ? "Tu sesión ha caducado. Inicia sesión de nuevo." : "")
      .then(function (token) {
        return fetch(API_URL, {
          method: "POST",
          redirect: "follow",
          credentials: "omit",
          body: JSON.stringify({ fn: fn, args: args, token: token })
        });
      })
      .then(function (resp) {
        return resp.text().then(function (texto) {
          try { return JSON.parse(texto); } catch (e) {
            throw new Error("Respuesta no válida del servidor. Revisa que la API esté desplegada para \"Cualquier persona\".");
          }
        });
      })
      .then(function (datos) {
        if (datos && datos.ok) return datos.result;
        if (datos && datos.code === "AUTH" && !reintento) {
          guardarToken(null);
          return llamar(fn, args, true);
        }
        var error = new Error((datos && datos.error) || "Error desconocido del servidor.");
        error.code = datos && datos.code;
        throw error;
      });
  }

  function crearEjecutor(ok, fallo, usuario) {
    return new Proxy({}, {
      get: function (_, prop) {
        if (prop === "withSuccessHandler") return function (f) { return crearEjecutor(f, fallo, usuario); };
        if (prop === "withFailureHandler") return function (f) { return crearEjecutor(ok, f, usuario); };
        if (prop === "withUserObject") return function (o) { return crearEjecutor(ok, fallo, o); };
        if (typeof prop !== "string") return undefined;
        return function () {
          var args = Array.prototype.slice.call(arguments);
          llamar(prop, args, false).then(function (resultado) {
            if (typeof ok === "function") ok(resultado, usuario);
          }, function (error) {
            if (typeof fallo === "function") fallo(error, usuario);
            else if (window.console) console.error("[FRY CRM] " + prop + ": " + error.message);
          });
        };
      }
    });
  }

  SCRIPT_SHIM = { run: crearEjecutor(null, null, undefined) };
  asegurarShim();
})();
