/* Shared browser helpers. Every page reaches the server through callServer_ (SPEC § 15), and
     writes markup only through setHtml with escaped values (SPEC § 16). */

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value).replace(/[&<>"'`]/g, function (c) {
      return "&#" + c.charCodeAt(0) + ";";
    });
  }

  // The only place markup is written as text; callers escape every value with escapeHtml.
  function setHtml(node, html) {
    if (/\son[a-z]+\s*=/i.test(html)) throw new Error("setHtml: inline handlers are not allowed");
    node.innerHTML = html;
  }

  var BUSY_PATTERN_ = /too many simultaneous|service invoked too many|lock timeout|timed out|try again later|busy/i;

  /* Calls a server function with retries on busy/quota errors: up to 1, 2, 4, 8, 16 s, each a
     random part of that ("full jitter"), so a crowd refused together does not return together.
     onBusy(attempt) lets the page say "the system is busy". Inside Apps Script the call goes
     through google.script.run; on our own domain (window.API_URL set, SPEC § 15) it is a fetch
     POST of {action, args} as text/plain, so the browser sends no CORS preflight. */
  function callServer_(name, args, onOk, onFail, onBusy, attempt) {
    attempt = attempt || 0;
    var retry = function (why) {
      if (attempt >= 5) { onFail({ code: "BUSY", message: "The system is very busy. Please try again in a few minutes." }); return; }
      if (onBusy) onBusy(attempt + 1, why);
      setTimeout(function () { callServer_(name, args, onOk, onFail, onBusy, attempt + 1); }, 300 + Math.floor(Math.random() * Math.pow(2, attempt) * 1000));
    };
    var ok = function (result) {
      if (result && result.code === "BUSY") retry(result.message);
      else onOk(result);
    };
    var failed = function (err) {
      var msg = err && err.message ? err.message : String(err);
      if (BUSY_PATTERN_.test(msg) || (err && err.network)) retry(msg);
      else onFail({ code: "ERROR", message: "Something went wrong. Please try again." });
    };
    if (window.API_URL) {
      fetch(window.API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: name, args: args || [] }) })
        .then(function (r) { return r.json(); }, function () { throw { network: true, message: "network" }; })
        .then(ok, failed);
      return;
    }
    var runner = google.script.run.withSuccessHandler(ok).withFailureHandler(failed);
    runner[name].apply(runner, args || []);
  }

  /* localStorage for lists and drafts; blocked storage just means nothing is remembered. */
  function localGet_(key) {
    try { var v = window.localStorage.getItem(key); return v === null ? null : JSON.parse(v); } catch (e) { return null; }
  }
  function localSet_(key, value) {
    try { if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  /* sessionStorage can be blocked (private mode); the page still works for this visit. */
  var memoryStore_ = {};
  function storeGet_(key) {
    try { return window.sessionStorage.getItem(key); } catch (e) { return memoryStore_[key] || null; }
  }
  function storeSet_(key, value) {
    try { if (value === null) window.sessionStorage.removeItem(key); else window.sessionStorage.setItem(key, value); }
    catch (e) { if (value === null) delete memoryStore_[key]; else memoryStore_[key] = value; }
  }

  /* Opens another page of the portal. PORTAL_URL is set by each page from doGet; the top window
     moves because the page itself runs inside Google's frame. */
  function goToPage_(page) {
    // On our own domain (SPEC § 15) each page is a file: config.js sets PAGE_URLS.
    var url = window.PAGE_URLS ? window.PAGE_URLS[page] || window.PAGE_URLS.login
      : (window.PORTAL_URL || "") + "?page=" + encodeURIComponent(page);
    try { window.top.location.href = url; } catch (e) { window.location.href = url; }
  }

  /* A titled confirmation dialog in the portal's own look, instead of the browser's confirm() (which
     shows a Google address as its title and cannot be styled). o: {title, message, detail, ok,
     cancel, danger}; message may be a list of text parts and {b: "bold part"}. onYes runs after
     the action button; Cancel, Escape or a tap outside closes it. Text only, never markup. */
  function confirmBox_(o, onYes) {
    var old = document.getElementById("dlg-back");
    if (old) old.parentNode.removeChild(old);
    var make = function (tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text !== undefined) n.textContent = text;
      return n;
    };
    var back = make("div", "dlg-back"), box = make("div", "dlg" + (o.danger ? " danger" : ""));
    back.id = "dlg-back";
    box.setAttribute("role", "alertdialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "dlg-title");
    box.setAttribute("aria-describedby", "dlg-message");
    var title = make("h2", "", o.title);
    title.id = "dlg-title";
    var msg = make("p", "dlg-message");
    msg.id = "dlg-message";
    [].concat(o.message || []).forEach(function (part) {
      msg.appendChild(typeof part === "string" ? document.createTextNode(part) : make("strong", "", part.b));
    });
    box.appendChild(title);
    box.appendChild(msg);
    if (o.detail) box.appendChild(make("p", "dlg-detail", o.detail));
    var row = make("div", "dlg-buttons");
    var no = make("button", "btn secondary", o.cancel || "Cancel"), yes = make("button", "btn" + (o.danger ? " danger" : ""), o.ok || "OK");
    no.type = yes.type = "button";
    no.id = "dlg-cancel";
    yes.id = "dlg-ok";
    row.appendChild(no);
    row.appendChild(yes);
    box.appendChild(row);
    back.appendChild(box);
    var before = document.activeElement;
    var close = function () {
      document.removeEventListener("keydown", keys, true);
      if (back.parentNode) back.parentNode.removeChild(back);
      document.body.classList.remove("dlg-open");
      if (before && before.focus) { try { before.focus({ preventScroll: true }); } catch (e) { /* gone */ } }
    };
    var keys = function (ev) {
      if (ev.key === "Escape") { ev.preventDefault(); close(); }
      else if (ev.key === "Tab") { ev.preventDefault(); (document.activeElement === yes ? no : yes).focus(); }
    };
    no.addEventListener("click", close);
    yes.addEventListener("click", function () { close(); onYes(); });
    back.addEventListener("click", function (ev) { if (ev.target === back) close(); });
    document.addEventListener("keydown", keys, true);
    document.body.appendChild(back);
    document.body.classList.add("dlg-open");
    (o.danger ? no : yes).focus(); // a risky action is never one Enter away
  }

  function showAlert_(node, kind, text) {
    node.className = "alert " + kind;
    node.textContent = text;
  }
