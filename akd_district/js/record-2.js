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
    if (!attempt) {
      var b = currentButton_(), release = markBusy_(b);
      onOk = withButton_(b, release, onOk);
      onFail = withButton_(b, release, onFail);
      // Pages that say nothing while retrying get a blue note under the button; it goes when the
      // answer comes (the next message replaces it, or the release below removes it).
      if (!onBusy && b) {
        onBusy = function () { if (onScreen_(b)) inlineMessage_(b, "info", "The system is busy — trying again, please wait…"); };
        var clear = function (fn) { return function (x) { var m = b.nextSibling; if (m && m.classList && m.classList.contains("info")) m.parentNode.removeChild(m); fn(x); }; };
        onOk = clear(onOk);
        onFail = clear(onFail);
      }
    }
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
    // The answer belongs to the button that opened the dialog, not to the dialog's own button.
    var opener = currentButton_();
    yes.addEventListener("click", function () { close(); lastClick_ = opener ? { el: opener, at: Date.now() } : null; onYes(); });
    back.addEventListener("click", function (ev) { if (ev.target === back) close(); });
    document.addEventListener("keydown", keys, true);
    document.body.appendChild(back);
    document.body.classList.add("dlg-open");
    (o.danger ? no : yes).focus(); // a risky action is never one Enter away
  }

  /* ---- The button that started an action (owner, 2026-11-10): it shows a spinner while its call
     runs, and the answer appears right under it instead of at the top of the page. Tabs and
     the password Show buttons are not actions. */
  var lastClick_ = null, handlerButton_ = null;
  function actionButton_(node) {
    var b = node && node.closest ? node.closest("button") : null;
    if (!b || b.classList.contains("tab") || b.getAttribute("role") === "tab" || b.classList.contains("show-pw") || b.closest(".pw")) return null;
    return b;
  }
  document.addEventListener("click", function (ev) {
    var b = actionButton_(ev.target);
    if (b && !b.closest(".dlg")) lastClick_ = { el: b, at: Date.now() };
  }, true);
  /* The button this moment belongs to: the one whose answer is being handled, or one just pressed. */
  function currentButton_() {
    if (handlerButton_ && document.body.contains(handlerButton_)) return handlerButton_;
    return lastClick_ && Date.now() - lastClick_.at < 1500 && document.body.contains(lastClick_.el) ? lastClick_.el : null;
  }
  /* Shown on screen now (a button in a section the page has just hidden is not). */
  function onScreen_(node) {
    return !!node && document.body.contains(node) && node.getClientRects().length > 0;
  }
  function markBusy_(b) {
    if (!b) return function () {};
    b.busyCount_ = (b.busyCount_ || 0) + 1;
    if (b.busyCount_ === 1) {
      b.wasDisabled_ = b.disabled;
      b.disabled = true;
      b.classList.add("is-busy");
      b.setAttribute("aria-busy", "true");
    }
    var done = false;
    return function () {
      if (done) return;
      done = true;
      b.busyCount_ -= 1;
      if (b.busyCount_ > 0) return;
      b.classList.remove("is-busy");
      b.removeAttribute("aria-busy");
      b.disabled = !!b.wasDisabled_;
    };
  }
  /* Runs a page's answer handler with its button known, so its messages go under that button. */
  function withButton_(b, release, fn) {
    return function (x) {
      release();
      var before = handlerButton_;
      handlerButton_ = b;
      try { fn(x); } finally { handlerButton_ = before; }
    };
  }

  /* A coloured message right under a button, replacing the one already there. */
  function inlineMessage_(b, kind, text) {
    var msg = b.nextSibling && b.nextSibling.classList && b.nextSibling.classList.contains("inline-msg") ? b.nextSibling : document.createElement("div");
    msg.className = "alert inline-msg " + kind;
    msg.setAttribute("role", kind === "error" ? "alert" : "status");
    msg.textContent = text;
    if (msg.parentNode !== b.parentNode) b.parentNode.insertBefore(msg, b.nextSibling);
    return msg;
  }

  /* Shows a message. A page banner (data-banner) gives way to a message under the button that
     started the action; the banner is used when there is none, or when that button is gone.
     Returns the element shown, for scrolling to it. */
  function showAlert_(node, kind, text) {
    var b = node.hasAttribute("data-banner") ? currentButton_() : null;
    if (b && !onScreen_(b)) b = null;
    [].forEach.call(document.querySelectorAll(".inline-msg"), function (m) { if (m.parentNode) m.parentNode.removeChild(m); });
    node.className = "alert " + kind;
    node.textContent = text;
    if (!b) return node;
    node.classList.add("hidden");
    var msg = inlineMessage_(b, kind, text);
    // A page that redraws the button's card, or moves to another view, right after would take the
    // message out of sight with it: the banner shows it then.
    setTimeout(function () {
      if (!onScreen_(msg)) { node.classList.remove("hidden"); node.scrollIntoView({ block: "nearest" }); }
      else msg.scrollIntoView({ block: "nearest" });
    }, 0);
    return msg;
  }
