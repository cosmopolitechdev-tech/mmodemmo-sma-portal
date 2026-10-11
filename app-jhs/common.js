// Helpers every screen shares, ported from gas/JavaScript.html as screens move to this site.
// Differences from the Apps Script page: server calls go through callServer() (api.js), the
// session lives under a per-school key, HTML templates go through setHtml(), and nothing builds
// inline event handlers (CSP).

var PORTAL_CONFIG = window.MMODEMMO_CONFIG || {};
// Every school shares this site's origin, so stored values are kept apart by school folder.
var PORTAL_FOLDER = window.location.pathname.split("/")[1] || "root";
var DEFAULT_SYSTEM_NAME = "School Management System";

/* Calls a WEB_ROUTES_ action; resolves with the server function's own reply, rejects on a
   transport or API error (the old withFailureHandler path). */
function callServer(action, payload, token) {
  return MmodemmoApi.request(PORTAL_CONFIG.API_URL, action, payload, token).then(function (reply) {
    if (reply.ok) return reply.data;
    var err = new Error(reply.error && reply.error.message ? reply.error.message : "Server error.");
    err.code = reply.error && reply.error.code;
    throw err;
  });
}

// SESSION

function storageKey_(name) {
  return "mmodemmo." + PORTAL_FOLDER + "." + name;
}

function sessionGet(name) {
  try {
    return sessionStorage.getItem(storageKey_(name)) || "";
  } catch (e) {
    console.warn("sessionStorage unavailable", e);
    return "";
  }
}

function sessionSet(name, value) {
  try {
    sessionStorage.setItem(storageKey_(name), value);
  } catch (e) {
    console.warn("sessionStorage unavailable", e);
  }
}

function sessionGetJsonList_(name) {
  try {
    var list = JSON.parse(sessionGet(name) || "[]");
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.warn("bad stored " + name, e);
    return [];
  }
}

function getTeacherSession() {
  return {
    token: sessionGet("teacherToken"),
    staffId: sessionGet("staffId"),
    assignments: sessionGetJsonList_("teacherAssignments"),
    sbaAssignments: sessionGetJsonList_("teacherSbaAssignments"),
    teacherName: sessionGet("teacherName"),
  };
}

function getAdminSession() {
  return { token: sessionGet("adminToken") };
}

function clearSession() {
  [
    "teacherToken",
    "staffId",
    "teacherAssignments",
    "teacherSbaAssignments",
    "teacherName",
    "adminToken",
  ].forEach(function (name) {
    try {
      sessionStorage.removeItem(storageKey_(name));
    } catch (e) {
      console.warn("sessionStorage unavailable", e);
    }
  });
}

// NAVIGATION: one page per school folder; the hash picks the screen (see boot.js).

/* Opens a screen ("login", "teacher", "admin"), optionally with a query such as "error=suspended". */
function goToScreen(screen, query) {
  var search = query ? "?" + query : "";
  var url = window.location.pathname + search + "#" + screen;
  if (search === window.location.search) {
    // Only the hash differs, which would not reload the page by itself.
    window.location.replace(url);
    window.location.reload();
  } else {
    window.location.replace(url);
  }
}

function redirectToLogin(query) {
  clearSession();
  goToScreen("login", query);
}

function logout(token) {
  callServer("logoutUser", {}, token).then(
    function () {
      redirectToLogin();
    },
    function () {
      redirectToLogin();
    },
  );
}

// DISPLAY

/* HTML-escapes a value so it is safe inside an HTML string. */
function sanitizeDisplayValue(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/`/g, "&#x60;")
    .replace(/=/g, "&#x3D;");
}

/* Fills `node` from one of this site's own HTML templates. Every sheet or user value in the
   template must already be escaped with sanitizeDisplayValue(), which also turns "=" into an
   entity; inline handlers are refused (the CSP blocks them), so wire events with addEventListener. */
function setHtml(node, html) {
  html = String(html);
  if (/\son[a-z]+\s*=/i.test(html)) throw new Error("inline event handler in an HTML template");
  node.innerHTML = html;
}

/* Builds an element: el("div", {className: "x"}, ["text", childNode]). Text is never parsed as HTML. */
function el(tag, props, children) {
  var node = document.createElement(tag);
  Object.keys(props || {}).forEach(function (key) {
    if (key === "dataset") {
      Object.assign(node.dataset, props.dataset);
    } else if (key === "attrs") {
      Object.keys(props.attrs).forEach(function (name) {
        node.setAttribute(name, props.attrs[name]);
      });
    } else {
      node[key] = props[key];
    }
  });
  (children || []).forEach(function (child) {
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  });
  return node;
}

function showSpinner() {
  var overlay = document.getElementById("spinnerOverlay");
  if (overlay) overlay.classList.add("visible");
}

function hideSpinner() {
  var overlay = document.getElementById("spinnerOverlay");
  if (overlay) overlay.classList.remove("visible");
}

function showToast(message, type) {
  type = type || "info";
  var container = document.getElementById("toastContainer");
  if (!container) {
    container = el("div", { id: "toastContainer", className: "toast-container" });
    document.body.appendChild(container);
  }
  var iconMap = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };
  var close = el("button", { className: "toast__close", type: "button" }, ["✕"]);
  var toast = el("div", { className: "toast toast--" + type }, [
    el("span", { className: "toast__icon" }, [iconMap[type] || "ℹ️"]),
    el("span", { className: "toast__msg" }, [String(message)]),
    close,
  ]);
  close.addEventListener("click", function () {
    toast.remove();
  });
  container.appendChild(toast);
  setTimeout(function () {
    if (toast.parentElement) toast.remove();
  }, 5500);
}

/* Shows a modal. `body` is a DOM node or an escaped HTML template (see setHtml); buttons are
   [{label, cls, action}]. */
function showModal(title, body, buttons, footerAlign) {
  var existing = document.getElementById("globalModal");
  if (existing) existing.remove();

  var closeBtn = el("button", { className: "modal__close", type: "button" }, ["✕"]);
  closeBtn.addEventListener("click", function () {
    closeModal();
  });
  var modal = el("div", { className: "modal", attrs: { role: "dialog", "aria-modal": "true" } }, [
    el("div", { className: "modal__header" }, [
      el("span", { className: "modal__title" }, [String(title)]),
      closeBtn,
    ]),
    el("div", { className: "modal__body" }, [
      typeof body === "string" ? htmlFragment_(body) : body,
    ]),
  ]);
  if (Array.isArray(buttons) && buttons.length) {
    var footer = el("div", {
      className: "modal__footer" + (footerAlign === "center" ? " modal__footer--center" : ""),
    });
    buttons.forEach(function (btn) {
      var b = el("button", { className: "btn " + (btn.cls || "btn--ghost"), type: "button" }, [
        String(btn.label),
      ]);
      if (typeof btn.action === "function") b.addEventListener("click", btn.action);
      footer.appendChild(b);
    });
    modal.appendChild(footer);
  }
  var overlay = el("div", { id: "globalModal", className: "modal-overlay" }, [modal]);
  document.body.appendChild(overlay);
  requestAnimationFrame(function () {
    overlay.classList.add("open");
  });
}

function htmlFragment_(html) {
  var box = el("div");
  setHtml(box, html);
  var frag = document.createDocumentFragment();
  while (box.firstChild) frag.appendChild(box.firstChild);
  return frag;
}

function closeModal(onClosed) {
  var overlay = document.getElementById("globalModal");
  if (overlay) {
    overlay.classList.remove("open");
    setTimeout(function () {
      if (overlay.parentElement) overlay.remove();
      if (typeof onClosed === "function") onClosed();
    }, 300);
  } else if (typeof onClosed === "function") {
    onClosed();
  }
}

function copyTextToClipboard(text, successMsg, failMsgPrefix) {
  successMsg = successMsg || "Copied to clipboard.";
  failMsgPrefix = failMsgPrefix || "Could not copy automatically. Value: ";
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      function () {
        showToast(successMsg, "success");
      },
      function () {
        fallbackCopyToClipboard_(text, successMsg, failMsgPrefix);
      },
    );
  } else {
    fallbackCopyToClipboard_(text, successMsg, failMsgPrefix);
  }
}

function fallbackCopyToClipboard_(text, successMsg, failMsgPrefix) {
  var ta = el("textarea", { value: text });
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    showToast(successMsg, "success");
  } catch (e) {
    console.warn("copy failed", e);
    showToast(failMsgPrefix + text, "warning");
  }
  document.body.removeChild(ta);
}

/* Replaces the emoji placeholder with the school's logo; built as an element, never HTML text. */
function renderBrandIcon(elementId, base64Data, mimeType) {
  var target = document.getElementById(elementId);
  if (!target || !base64Data || !mimeType) return;
  if (!/^image\/(png|jpeg)$/.test(String(mimeType))) return;
  if (!/^[A-Za-z0-9+/=\s]+$/.test(String(base64Data))) return;
  var img = el("img", {
    src: "data:" + mimeType + ";base64," + String(base64Data).replace(/\s/g, ""),
    alt: "School Logo",
  });
  img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:inherit;";
  target.textContent = "";
  target.appendChild(img);
}

/* Shows the configured names at once, then the server's names and logo when they arrive.
   titleSuffix (optional) follows the system name in the browser tab, e.g. " — Teacher Dashboard". */
function applyPublicBranding(logoIds, titleSuffix) {
  var setNames = function (systemName, schoolName) {
    document.title = systemName + (titleSuffix || "");
    var nameEl = document.getElementById("systemName");
    if (nameEl) nameEl.textContent = systemName;
    var schoolEl = document.getElementById("schoolName");
    if (schoolEl) schoolEl.textContent = schoolName || "";
  };
  var apply = function (cfg) {
    setNames(cfg.systemName || PORTAL_CONFIG.SYSTEM_NAME || DEFAULT_SYSTEM_NAME, cfg.schoolName);
    (logoIds || []).forEach(function (id) {
      renderBrandIcon(id, cfg.schoolLogoBase64, cfg.schoolLogoMime);
    });
  };
  setNames(PORTAL_CONFIG.SYSTEM_NAME || DEFAULT_SYSTEM_NAME, PORTAL_CONFIG.SCHOOL_NAME);
  // Last reply from this session first: each request takes ~3 s, so the next screen shows the
  // school's name and logo at once instead of the defaults.
  try {
    var saved = JSON.parse(sessionGet("branding") || "null");
    if (saved) apply(saved);
  } catch (e) {
    console.warn("bad stored branding", e);
  }
  callServer("getPublicConfig", {}).then(
    function (cfg) {
      if (!cfg) return;
      apply(cfg);
      sessionSet(
        "branding",
        JSON.stringify({
          systemName: cfg.systemName,
          schoolName: cfg.schoolName,
          schoolLogoBase64: cfg.schoolLogoBase64,
          schoolLogoMime: cfg.schoolLogoMime,
        }),
      );
    },
    function (err) {
      console.warn("getPublicConfig failed", err);
    },
  );
}
