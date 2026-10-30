var $ = function (id) { return document.getElementById(id); };
      var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      var S = { token: storeGet_("token"), form: null, fields: {}, rec: {}, saved: {}, version: 0, required: null, errors: {}, open: {},
        role: storeGet_("role"), me: storeGet_("staffId") || "", subject: null, summary: null };
      S.coordinator = S.role === "coordinator" || S.role === "circuit";
      S.circuitRole = S.role === "circuit";
      S.admin = S.role === "admin";

      if (!S.token) goToPage_("login");

      /* ---- Template rules, as on the server (Record.gs) so progress updates while typing. */
      /* "29 Oct 2026" (and the time): one order everywhere, whatever language the phone is set to. */
      function dayText(d, withTime) {
        var t = d.getDate() + " " + MONTHS[d.getMonth()].slice(0, 3) + " " + d.getFullYear();
        if (!withTime) return t;
        var two = function (n) { return (n < 10 ? "0" : "") + n; };
        return t + ", " + two(d.getHours()) + ":" + two(d.getMinutes());
      }

      function val(k) { var v = S.rec[k]; return v === undefined || v === null ? "" : String(v); }

      function holds(cond) {
        if (!cond) return true;
        if (cond.all) return cond.all.every(holds);
        if (cond.any) return cond.any.some(holds);
        return cond.op === "<>" ? val(cond.field) !== String(cond.value) : val(cond.field) === String(cond.value);
      }

      function editable(f) { return !f.auto && f.key !== "staff_id"; }

      function required(f) {
        if (!editable(f) && f.key !== "staff_id") return false;
        var marked = S.required ? !!S.required[f.key] : !!f.required;
        return marked && holds(f.open_when) && holds(f.required_when);
      }

      function choices(f) {
        if (f.input !== "select") return null;
        if (f.depends_on) {
          var list = (S.form.dependents[f.key] || {})[val(f.depends_on)];
          return list ? S.form.lists[list].map(String) : [];
        }
        return f.list ? S.form.lists[f.list].map(String) : null;
      }

      /* Format checks (Validation.gs): instant messages; the server checks again before saving. */
      function ghanaCardProblem(v) {
        var p = v.split("-");
        if (p.length !== 3 || p[0] !== "GHA") return "Format must be GHA-XXXXXXXXX-X (e.g. GHA-712014214-2).";
        if (!/^\d+$/.test(p[1])) return "The middle segment must contain digits only (e.g. GHA-712014214-2).";
        if (p[1].length < 9) return "The middle segment needs " + (9 - p[1].length) + " more digit(s) — must be exactly 9 digits.";
        if (p[1].length > 9) return "The middle segment has " + (p[1].length - 9) + " too many digit(s) — must be exactly 9 digits.";
        if (!p[2].length) return "The last segment is missing — must be exactly 1 digit.";
        if (!/^\d+$/.test(p[2])) return "The last segment must be a single digit.";
        if (p[2].length > 1) return "The last segment has " + (p[2].length - 1) + " too many digit(s) — must be exactly 1 digit.";
        return "";
      }

      function formatProblem(f, raw) {
        var v = String(raw).trim();
        if (!v) return "";
        switch (f.kind) {
          case "staff_id": return /^\d{1,15}$/.test(v.replace(/\s+/g, "")) ? "" : "The Staff ID has digits only.";
          case "name": return /^[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F .'\-]{0,59}$/.test(v) ? "" : "Use letters only (spaces, hyphens and apostrophes are fine), no digits or symbols.";
          case "ghana_card": return ghanaCardProblem(v.replace(/\s+/g, "").toUpperCase());
          case "phone":
            v = v.replace(/[\s\-+()]/g, "").replace(/^233(?=[2-9]\d{8}$)/, "0").replace(/^(?=[2-9]\d{8}$)/, "0");
            return /^0[2-9]\d{8}$/.test(v) ? "" : "A phone number has 10 digits: 0, then 2 to 9, e.g. 0244123456.";
          case "ssnit": return /^[A-Z]\d{12}$/.test(v.replace(/\s+/g, "").toUpperCase()) ? "" : "The SSNIT number is one letter and 12 digits, e.g. C123456789012.";
          case "ntc": return /^PT\/\d{6}\/\d{4}$/.test(v.replace(/\s+/g, "").toUpperCase()) ? "" : "The NTC number looks like PT/123456/2015 (6 digits, then 4).";
          case "email": return /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(v.replace(/\s+/g, "").toLowerCase()) ? "" : "That email address does not look right, e.g. name@example.com.";
          default: return "";
        }
      }

      /* ---- Building the form from the field definitions. */
      function el(tag, attrs, text) {
        var n = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
        if (text !== undefined) n.textContent = text;
        return n;
      }

      function fillOptions(sel, list, current, placeholder) {
        while (sel.firstChild) sel.removeChild(sel.firstChild);
        sel.appendChild(el("option", { value: "" }, placeholder || "— choose —"));
        list.forEach(function (c) { var o = el("option", { value: c }, c); sel.appendChild(o); });
        sel.value = list.indexOf(current) === -1 ? "" : current;
      }

      function fieldShell(f, labelText, forId) {
        var w = el("div", { "class": "field", id: "w-" + f.key });
        var lab = el("label", forId ? { "for": forId } : {}, labelText);
        lab.appendChild(el("span", { "class": "req hidden", id: "q-" + f.key, "aria-hidden": "true" }, " *"));
        w.appendChild(lab);
        return w;
      }

      /* The template's hints speak of spreadsheet cells; on the web some of that wording is wrong. */
      function webHint(f) {
        if (f.kind === "ntc") return "Format: PT/123456/2015 (PT / 6 digits / 4 digits).";
        var h = String(f.hint || "").replace(/Click the arrow on the right of the cell and choose one answer\.?/g, "");
        if (f.multi) h = h.replace(/Choose one( [a-z]+)?;?\s*for more, type them separated by commas\.?/i, "Tick all that apply.");
        return h.replace(/\s+/g, " ").trim();
      }

      function addHintAndError(w, f) {
        var hint = f.key === "staff_id" ? f.hint : webHint(f);
        if (hint) w.appendChild(el("div", { "class": "hint" }, hint));
        w.appendChild(el("div", { "class": "err", id: "e-" + f.key, role: "alert" }));
      }

      function control(f) {
        var id = "f-" + f.key;
        if (f.input === "select" && f.multi) {
          var box = el("fieldset", { "class": "multi", id: id });
          box.setAttribute("aria-label", f.label);
          return box;
        }
        if (f.input === "select" && !f.allow_typed) {
          var sel = el("select", { id: id });
          sel.addEventListener("change", function () { setValue(f.key, sel.value); });
          return sel;
        }
        var input = el("input", { id: id, type: "text", maxlength: "200", autocomplete: "off" });
        if (f.kind === "phone") { input.type = "tel"; input.setAttribute("inputmode", "tel"); }
        else if (f.kind === "email") { input.type = "email"; input.setAttribute("autocapitalize", "none"); }
        else if (f.kind === "staff_id") input.setAttribute("inputmode", "numeric");
        else if (f.kind === "ghana_card" || f.kind === "ssnit" || f.kind === "ntc" || f["case"] === "upper") input.setAttribute("autocapitalize", "characters");
        if (f.allow_typed && f.list) {
          var dl = el("datalist", { id: "d-" + f.key });
          S.form.lists[f.list].forEach(function (c) { dl.appendChild(el("option", { value: String(c) })); });
          input.setAttribute("list", "d-" + f.key);
          input.appendChild(dl);
        }
        input.addEventListener("input", function () { setValue(f.key, input.value, true); });
        input.addEventListener("blur", function () { showError(f.key, formatProblem(f, input.value)); });
        return input;
      }

      function buildMulti(f) {
        var box = $("f-" + f.key);
        var list = choices(f) || [];
        var chosen = val(f.key) ? val(f.key).split(", ") : [];
        while (box.firstChild) box.removeChild(box.firstChild);
        if (!list.length) box.appendChild(el("span", { "class": "hint" }, "Choose " + S.fields[f.depends_on].label + " first."));
        list.forEach(function (c, i) {
          var lab = el("label");
          var cb = el("input", { type: "checkbox", value: c, id: "f-" + f.key + "-" + i });
          cb.checked = chosen.indexOf(c) !== -1;
          cb.addEventListener("change", function () {
            var picked = [];
            box.querySelectorAll("input:checked").forEach(function (x) { picked.push(x.value); });
            setValue(f.key, picked.join(", "));
          });
          lab.appendChild(cb);
          lab.appendChild(document.createTextNode(c));
          box.appendChild(lab);
        });
        box.setAttribute("data-for", f.depends_on ? val(f.depends_on) : "");
      }

      function buildDateGroup(fields) {
        var first = fields[0];
        var name = first.label.split(":")[0];
        var w = fieldShell(first, name, "f-" + first.key);
        w.id = "w-" + first.date_group;
        var row = el("div", { "class": "date-row" });
        fields.forEach(function (f) {
          var sel = control(f);
          sel.setAttribute("aria-label", f.label);
          if (f.date_part === "month") sel.className = "month";
          row.appendChild(sel);
          w.setAttribute("data-keys", (w.getAttribute("data-keys") ? w.getAttribute("data-keys") + "," : "") + f.key);
        });
        w.appendChild(row);
        var dateHint = webHint(first).replace(/^Day /, "Date ");
        if (dateHint) w.appendChild(el("div", { "class": "hint" }, dateHint));
        fields.forEach(function (f) { w.appendChild(el("div", { "class": "err", id: "e-" + f.key, role: "alert" })); });
        return w;
      }

      function buildForm() {
        var form = $("record");
        while (form.firstChild) form.removeChild(form.firstChild);
        S.form.sections.forEach(function (sec) {
          var d = el("details", { "class": "section", id: "s-" + sec.key });
          if (S.open[sec.key]) d.open = true;
          d.addEventListener("toggle", function () { S.open[sec.key] = d.open; });
          var sum = el("summary");
          sum.appendChild(el("span", { "class": "t" }, titleOf(sec.title)));
          sum.appendChild(el("span", { "class": "n", id: "n-" + sec.key }));
          var bar = el("div", { "class": "bar small", "aria-hidden": "true" });
          bar.appendChild(el("span", { id: "b-" + sec.key }));
          sum.appendChild(bar);
          d.appendChild(sum);
          var body = el("div", { "class": "body" });
          if (sec.auto) {
            var dl = el("dl", { "class": "readonly" });
            sec.fields.forEach(function (k) {
              dl.appendChild(el("dt", {}, S.fields[k].label));
              dl.appendChild(el("dd", {}, val(k) || "—"));
            });
            body.appendChild(dl);
            sum.querySelector(".bar").classList.add("hidden");
          } else {
            var keys = sec.fields;
            for (var i = 0; i < keys.length; i++) {
              var f = S.fields[keys[i]];
              if (f.date_group) {
                var group = keys.slice(i).map(function (k) { return S.fields[k]; }).filter(function (g) { return g.date_group === f.date_group; });
                body.appendChild(buildDateGroup(group));
                i += group.length - 1;
                continue;
              }
              var w = fieldShell(f, f.label, f.multi ? "" : "f-" + f.key);
              if (f.key === "staff_id") {
                w.appendChild(el("div", { "class": "readonly" }, val("staff_id")));
                w.lastChild.style.fontWeight = "600";
                addHintAndError(w, { key: f.key, hint: "Your Staff ID is your sign-in; an admin changes it if it is wrong." });
              } else {
                w.appendChild(control(f));
                addHintAndError(w, f);
              }
              body.appendChild(w);
            }
          }
          d.appendChild(body);
          form.appendChild(d);
        });
        editableKeys().forEach(function (k) { putValue(S.fields[k]); });
        refresh();
      }

      function editableKeys() {
        return S.form.fields.filter(function (f) { return editable(f); }).map(function (f) { return f.key; });
      }

      function titleOf(t) {
        return String(t).toLowerCase().replace(/(^|[\s\/(])([a-z])/g, function (m, p, c) { return p + c.toUpperCase(); }).replace(/\b(Jhs|Shs|Id)\b/g, function (w) { return w.toUpperCase(); });
      }

      /* Shows the stored value in a field's control. */
      function putValue(f) {
        var c = $("f-" + f.key);
        if (!c) return;
        if (f.multi) { buildMulti(f); return; }
        if (c.tagName === "SELECT") {
          var list = choices(f) || [];
          fillOptions(c, list, val(f.key), f.date_part ? f.date_part.charAt(0).toUpperCase() + f.date_part.slice(1) : "");
          c.setAttribute("data-for", f.depends_on ? val(f.depends_on) : "");
        } else if (c.value !== val(f.key)) c.value = val(f.key);
      }

      /* ---- Changes, the template's opening/closing rules, and progress. */
      function setValue(key, value, typing) {
        S.rec[key] = value;
        if (!typing) showError(key, "");
        refresh();
      }

      function refresh() {
        S.form.fields.forEach(function (f) {
          if (!editable(f)) return;
          var open = holds(f.open_when);
          var wrapId = f.date_group ? "w-" + f.date_group : "w-" + f.key;
          var w = $(wrapId);
          if (w && !f.date_group) w.classList.toggle("hidden", !open);
          if (!open && val(f.key)) { S.rec[f.key] = ""; putValue(f); }
          // A dependent list follows its parent: rebuild it, dropping choices the parent no longer offers.
          if (f.depends_on) {
            var c = $("f-" + f.key);
            if (c && c.getAttribute("data-for") !== val(f.depends_on)) {
              var list = choices(f) || [];
              var kept = val(f.key) ? val(f.key).split(f.multi ? ", " : "\u0000").filter(function (v) { return list.indexOf(v) !== -1; }).join(", ") : "";
              S.rec[f.key] = kept;
              putValue(f);
            }
          }
        });
        progress();
        dirty();
      }

      function progress() {
        var total = 0, done = 0, missing = [];
        S.form.sections.forEach(function (sec) {
          var t = 0, d = 0;
          sec.fields.forEach(function (k) {
            var f = S.fields[k];
            var req = required(f);
            var q = $("q-" + k); // a date group shows its star on the Day box
            if (q) q.classList.toggle("hidden", !req);
            if (!req) return;
            t++;
            if (val(k)) d++;
            else missing.push(f);
          });
          total += t; done += d;
          var n = $("n-" + sec.key);
          if (n && !sec.auto) {
            n.textContent = t ? d + " of " + t : "optional";
            n.classList.toggle("done", t > 0 && d === t);
            $("b-" + sec.key).style.width = (t ? Math.floor(d * 100 / t) : 0) + "%";
          }
        });
        var pct = total ? Math.floor(done * 100 / total) : 100;
        $("pct").textContent = pct + "%";
        $("pct-bar").style.width = pct + "%";
        $("status-text").textContent = pct === 100 ? "complete" : "complete — " + missing.length + " box" + (missing.length === 1 ? "" : "es") + " still to fill";
        var ul = $("missing");
        while (ul.firstChild) ul.removeChild(ul.firstChild);
        // One chip per date (not Day, Month and Year), and only the first few until asked.
        var chips = [], groups = {};
        missing.forEach(function (f) {
          if (!f.date_group) { chips.push({ key: f.key, label: f.label }); return; }
          if (groups[f.date_group]) return;
          groups[f.date_group] = true;
          chips.push({ key: f.key, label: f.label.split(":")[0] + " date" });
        });
        var shown = S.showAllMissing ? chips : chips.slice(0, 8);
        shown.forEach(function (c) {
          var li = el("li");
          var b = el("button", { type: "button" }, c.label);
          b.addEventListener("click", function () { jumpTo(c.key); });
          li.appendChild(b);
          ul.appendChild(li);
        });
        if (shown.length < chips.length) {
          var li2 = el("li");
          var more = el("button", { type: "button", "class": "link" }, "Show all " + chips.length);
          more.addEventListener("click", function () { S.showAllMissing = true; progress(); });
          li2.appendChild(more);
          ul.appendChild(li2);
        }
        $("missing-box").classList.toggle("hidden", !missing.length);
        var needsConfirm = !S.subject && pct === 100 && !!S.confirmLabel && String(S.confirmedTerm || "").slice(0, 9) !== S.confirmLabel;
        $("confirm-box").classList.toggle("hidden", !needsConfirm || changedKeys().length > 0);
      }

      function jumpTo(key) {
        var f = S.fields[key];
        var sec = S.form.sections.filter(function (s) { return s.fields.indexOf(key) !== -1; })[0];
        if (sec) { $("s-" + sec.key).open = true; S.open[sec.key] = true; }
        var w = $(f && f.date_group ? "w-" + f.date_group : "w-" + key);
        var c = $("f-" + key) || w;
        if (w) {
          w.scrollIntoView({ block: "center" });
          w.classList.remove("flash");
          void w.offsetWidth;
          w.classList.add("flash");
        }
        if (c && c.focus) { var focusable = c.tagName === "FIELDSET" ? c.querySelector("input") : c; if (focusable) focusable.focus({ preventScroll: true }); }
      }

      function showError(key, message) {
        var e = $("e-" + key);
        if (!e) return;
        e.textContent = message || "";
        var f = S.fields[key];
        var w = $(f && f.date_group ? "w-" + f.date_group : "w-" + key);
        if (w) w.classList.toggle("bad", !!message || !!w.querySelector(".err:not(:empty)"));
        if (message) S.errors[key] = message; else delete S.errors[key];
      }

      function changedKeys() {
        return editableKeys().filter(function (k) { return val(k) !== (S.saved[k] === undefined || S.saved[k] === null ? "" : String(S.saved[k])); });
      }

      function dirty() {
        var keys = changedKeys();
        $("save-msg").textContent = keys.length ? keys.length + " unsaved change" + (keys.length === 1 ? "" : "s") : "All changes saved.";
        $("save").disabled = !keys.length;
        // Unsaved changes stay on this device until saved, so a closed tab or a dead battery loses nothing.
        if (!S.draftKey) return;
        if (!keys.length) { localSet_(S.draftKey, null); $("draft-box").classList.add("hidden"); return; }
        var changes = {};
        keys.forEach(function (k) { changes[k] = val(k); });
        localSet_(S.draftKey, { version: S.version, changes: changes, at: new Date().toISOString() });
      }

      /* Puts back unsaved changes kept on this device (also how a "changed elsewhere" reload keeps them). */
      function restoreDraft() {
        var d = localGet_(S.draftKey);
        if (!d || !d.changes) return;
        var keys = Object.keys(d.changes).filter(function (k) { return S.fields[k] && editable(S.fields[k]); });
        if (!keys.length) { localSet_(S.draftKey, null); return; }
        keys.forEach(function (k) { S.rec[k] = String(d.changes[k]); });
        editableKeys().forEach(function (k) { putValue(S.fields[k]); });
        refresh();
        var when = new Date(d.at);
        $("draft-text").textContent = keys.length + " unsaved change" + (keys.length === 1 ? " is" : "s are") + " back from " +
          (isNaN(when.getTime()) ? "earlier" : dayText(when, true)) + "." +
          (d.version !== S.version ? " Your record was also changed since then — check them, then press Save." : " Press Save to keep them.");
        $("draft-box").classList.remove("hidden");
      }

      /* ---- Server calls. */
      function fail(r) {
        if (r && (r.code === "SESSION_EXPIRED" || r.code === "MUST_CHANGE_PASSWORD")) { storeSet_("token", null); goToPage_("login"); return; }
        showAlert_($("alert"), "error", (r && r.message) || "Something went wrong. Please try again.");
        $("alert").scrollIntoView({ block: "center" });
      }

      function applyInit(r) {
        $("loading").classList.add("hidden");
        if (!r || !r.ok) { fail(r); return; }
        if (r.form) {
          S.form = r.form;
          S.listsVersion = r.listsVersion;
          localSet_("SR_FORM", { version: r.listsVersion, form: r.form });
        }
        if (!S.form) { S.listsVersion = ""; load(); return; } // the device copy vanished meanwhile
        S.fields = {};
        S.form.fields.forEach(function (f) { S.fields[f.key] = f; });
        S.rec = r.record;
        S.saved = JSON.parse(JSON.stringify(r.record));
        S.version = r.version;
        S.required = r.required;
        S.termLabel = r.termLabel;
        S.confirmLabel = r.confirmLabel;
        S.confirmedTerm = r.confirmedTerm;
        var name = [val("first_name"), val("surname")].filter(Boolean).join(" ");
        $("alert").classList.add("hidden");
        if (S.subject) {
          $("editing-text").textContent = "You are editing " + name + "'s record (Staff ID " + S.subject + ") on their behalf. Your Staff ID is recorded as the one who changed it.";
        } else {
          showWho(val("school_name"), [val("academic_year"), val("term")].filter(Boolean).join(" "));
          if (r.serviceStatus && r.serviceStatus !== "Active") showAlert_($("alert"), "warn", "Your school lists you as not at post (" + r.serviceStatus + "). You can still update your record.");
          else if (r.updatedBy && S.me && r.updatedBy !== S.me) {
            var when = r.updatedAt ? new Date(r.updatedAt) : null;
            showAlert_($("alert"), "warn", "Your ICT coordinator (Staff ID " + r.updatedBy + ") last changed your record" +
              (when && !isNaN(when.getTime()) ? " on " + dayText(when) : "") + ". Please check it.");
          }
        }
        $("editing-box").classList.toggle("hidden", !S.subject);
        $("editing-back").textContent = S.fromTeachers ? "Back to the search" : S.admin || S.circuitRole ? "Back to the school" : "Back to My School";
        if (r.schools && !S.subject) { showSchoolPicker(r.schools); return; }
        $("school-pick").classList.add("hidden");
        $("summary").classList.remove("hidden");
        $("record").classList.remove("hidden");
        $("savebar").classList.remove("hidden");
        $("conflict-box").classList.add("hidden");
        S.draftKey = null; // building the form must not overwrite the kept draft before it is read
        buildForm();
        S.readOnly = !!S.subject && !canEditRecords();
        if (S.readOnly) {
          // Viewing only (an admin without teachers.edit): nothing to type into, nothing to save.
          [].forEach.call($("record").querySelectorAll("input, select, textarea"), function (x) { x.disabled = true; });
          $("savebar").classList.add("hidden");
          $("editing-text").textContent = "You are viewing " + [val("first_name"), val("surname")].join(" ") + "'s record (Staff ID " + S.subject + "). You cannot change it.";
          return;
        }
        S.draftKey = "SR_DRAFT_" + val("staff_id");
        restoreDraft();
      }

      function showSchoolPicker(schools) {
        var circuits = [];
        schools.forEach(function (s) { if (circuits.indexOf(s.circuit) === -1) circuits.push(s.circuit); });
        circuits.sort();
        fillOptions($("pick-circuit"), circuits, "");
        var pickSchool = function () {
          var inCircuit = schools.filter(function (s) { return s.circuit === $("pick-circuit").value; })
            .sort(function (a, b) { return a.name < b.name ? -1 : 1; });
          var sel = $("pick-school");
          while (sel.firstChild) sel.removeChild(sel.firstChild);
          sel.appendChild(el("option", { value: "" }, inCircuit.length ? "— choose —" : "Choose the circuit first"));
          inCircuit.forEach(function (s) { sel.appendChild(el("option", { value: s.emis }, s.name + " (" + s.emis + ")")); });
        };
        $("pick-circuit").addEventListener("change", pickSchool);
        pickSchool();
        $("school-pick").classList.remove("hidden");
      }

      /* The ~70 lists download once per device: the copy kept here is sent back by version. */
      function load() {
        if (!S.form) {
          var kept = localGet_("SR_FORM");
          if (kept && kept.version && kept.form && kept.form.fields) { S.form = kept.form; S.listsVersion = kept.version; }
        }
        var lists = S.form ? S.listsVersion : "";
        // Each call is written out so the static checks can see the server functions it uses.
        if (S.subject) callServer_("getColleagueRecord", [S.token, S.subject, lists], applyInit, fail);
        else callServer_("getMyRecordInit", [S.token, lists], applyInit, fail);
      }

      function save() {
        var keys = changedKeys();
        if (!keys.length) return;
        var firstBad = null;
        keys.forEach(function (k) {
          var p = formatProblem(S.fields[k], val(k));
          showError(k, p);
          if (p && !firstBad) firstBad = k;
        });
        if (firstBad) { $("save-msg").textContent = "Please correct the boxes marked in red."; jumpTo(firstBad); return; }
        var changes = {};
        keys.forEach(function (k) { changes[k] = val(k); });
        $("save").disabled = true;
        $("save-msg").textContent = "Saving…";
        var saved = function (r) {
          if (r && r.ok) {
            // The server's cleaned values (capitals, phone forms, emptied boxes) replace what was typed.
            keys.concat(r.saved || []).forEach(function (k) { if (r.record[k] !== undefined) S.rec[k] = r.record[k]; });
            S.saved = JSON.parse(JSON.stringify(r.record));
            S.version = r.version;
            if (r.status === "Complete") S.confirmedTerm = S.confirmLabel;
            editableKeys().forEach(function (k) { showError(k, ""); putValue(S.fields[k]); });
            $("alert").classList.add("hidden");
            refresh();
            $("save-msg").textContent = "Saved.";
            return;
          }
          dirty();
          if (r && r.code === "INVALID") {
            var bad = Object.keys(r.errors || {});
            bad.forEach(function (k) { showError(k, r.errors[k]); });
            $("save-msg").textContent = "Please correct the boxes marked in red.";
            if (bad.length) jumpTo(bad[0]);
          } else if (r && r.code === "CONFLICT") {
            // The page keeps the changes, so it says so instead of the server's "make your change again".
            $("conflict-text").textContent = "This record was changed elsewhere (another tab or an admin) after you opened it. " +
              "Load the latest version: your changes stay, then check them and press Save.";
            $("conflict-box").classList.remove("hidden");
            $("conflict-box").scrollIntoView({ block: "center" });
          } else fail(r);
        };
        var failed = function (e) { dirty(); fail(e); };
        var busy = function () { $("save-msg").textContent = "Saving… the system is busy, retrying."; };
        if (S.subject) callServer_("saveColleagueRecord", [S.token, S.subject, changes, S.version], saved, failed, busy);
        else callServer_("saveMyRecord", [S.token, changes, S.version], saved, failed, busy);
      }

      $("save").addEventListener("click", save);
      $("conflict-reload").addEventListener("click", function () {
        dirty(); // the changes are in the draft, so the reload puts them back on the latest version
        load();
      });
      $("draft-discard").addEventListener("click", function () {
        S.rec = JSON.parse(JSON.stringify(S.saved));
        localSet_(S.draftKey, null);
        editableKeys().forEach(function (k) { showError(k, ""); putValue(S.fields[k]); });
        refresh();
        $("draft-box").classList.add("hidden");
      });
      $("record").addEventListener("submit", function (ev) { ev.preventDefault(); save(); });
      $("confirm").addEventListener("click", function () {
        $("confirm").disabled = true;
        callServer_("confirmMyRecord", [S.token, S.version], function (r) {
          $("confirm").disabled = false;
          if (!r || !r.ok) { fail(r); return; }
          S.version = r.version;
          S.confirmedTerm = r.confirmedTerm;
          refresh();
          showAlert_($("alert"), "ok", "Thank you. Your record is confirmed for " + r.confirmedTerm + ".");
        }, function (e) { $("confirm").disabled = false; fail(e); });
      });
      $("pick-save").addEventListener("click", function () {
        if (!$("pick-school").value) { showAlert_($("alert"), "error", "Choose your circuit, then your school."); return; }
        $("pick-save").disabled = true;
        callServer_("saveMyRecord", [S.token, { school_emis_code: $("pick-school").value }, S.version], function (r) {
          $("pick-save").disabled = false;
          if (!r || !r.ok) { fail(r && r.code === "INVALID" ? { message: r.errors.school_emis_code || r.message } : r); return; }
          load();
        }, function (e) { $("pick-save").disabled = false; fail(e); });
      });
      $("signout").addEventListener("click", function () {
        if (S.form && changedKeys().length) {
          confirmBox_({ title: "Sign out without saving?", message: "Some of your changes are not saved yet.",
            detail: "If you sign out now, those changes are lost. Choose \"Stay and save\" to go back to the form.",
            ok: "Sign out anyway", cancel: "Stay and save", danger: true }, signOutNow);
          return;
        }
        signOutNow();
      });
      function signOutNow() {
        callServer_("signOut", [S.token], function () {}, function () {});
        // A shared phone keeps no one's unsaved record, the user's own or a colleague's.
        try {
          for (var i = window.localStorage.length - 1; i >= 0; i--) {
            var k = window.localStorage.key(i);
            if (k && k.indexOf("SR_DRAFT_") === 0) window.localStorage.removeItem(k);
          }
        } catch (e) { /* storage blocked: nothing was kept */ }
        ["token", "role", "name", "staffId"].forEach(function (k) { storeSet_(k, null); });
        goToPage_("login");
      }

      /* ---- My School (coordinators). Only what the server allowed is shown; it checks again on every call. */
      function showWho(school, term) {
        $("top-who").textContent = [storeGet_("name") || "", school, term].filter(Boolean).join(" · ");
      }

      function showView(view) {
        // A message belongs to the screen it was shown on; reloading the same screen keeps it.
        if (S.view && S.view !== view) $("alert").classList.add("hidden");
        S.view = view;
        $("setup-view").classList.toggle("hidden", view !== "setup");
        $("school-view").classList.toggle("hidden", view !== "school");
        $("circuit-view").classList.toggle("hidden", view !== "circuit");
        $("overview-view").classList.toggle("hidden", view !== "overview");
        $("teachers-view").classList.toggle("hidden", view !== "teachers");
        $("import-view").classList.toggle("hidden", view !== "import");
        $("admins-view").classList.toggle("hidden", view !== "admins");
        $("settings-view").classList.toggle("hidden", view !== "settings");
        $("audit-view").classList.toggle("hidden", view !== "audit");
        $("tab-audit").setAttribute("aria-selected", String(view === "audit"));
        $("tab-settings").setAttribute("aria-selected", String(view === "settings"));
        $("tab-admins").setAttribute("aria-selected", String(view === "admins"));
        $("tab-import").setAttribute("aria-selected", String(view === "import"));
        $("tab-teachers").setAttribute("aria-selected", String(view === "teachers"));
        $("tab-circuit").setAttribute("aria-selected", String(view === "circuit" && S.circuitRole));
        $("tab-overview").setAttribute("aria-selected", String(view === "overview"));
        $("back-circuit-row").classList.toggle("hidden", !((S.circuitRole || S.admin) && view === "school"));
        $("back-circuit").textContent = S.circuitRole || S.circuitName ? "← Back to the circuit" : "← Back to the overview";
        $("back-overview-row").classList.toggle("hidden", !(S.admin && view === "circuit"));
        $("record-view").classList.toggle("hidden", view !== "record");
        $("savebar").classList.toggle("hidden", view !== "record" || $("record").classList.contains("hidden"));
        $("tab-school").setAttribute("aria-selected", String(view === "school" && !S.circuitRole));
        $("tab-record").setAttribute("aria-selected", String(view === "record" && !S.subject));
        $("top-title").textContent = view === "audit" ? "Audit log" : view === "settings" ? "Settings" : view === "admins" ? "Admins" : view === "import" ? "Import teachers" : view === "teachers" ? "Teachers" : view === "overview" ? "Overview" : view === "setup" ? "Set up your school" : view === "circuit" ? (S.admin ? "Circuit" : "My Circuit")
          : view === "school" ? (S.circuitRole || S.admin ? "School" : "My School")
          : S.subject ? "Colleague's record" : "My staff record";
        window.scrollTo(0, 0);
      }

      function openRecord(staffId) {
        S.subject = staffId || null;
        S.rec = {};
        S.saved = {};
        ["record", "summary", "savebar", "draft-box", "conflict-box"].forEach(function (id) { $(id).classList.add("hidden"); });
        $("loading").classList.remove("hidden");
        showView("record");
        load();
      }

      function loadSchool() {
        $("loading").classList.remove("hidden");
        showView("school");
        callServer_("getMySchoolSummary", [S.token, S.schoolEmis || ""], function (r) {
          $("loading").classList.add("hidden");
          if (!r || !r.ok) { fail(r); return; }
          S.summary = r;
          if (r.needsSetup) { showView("setup"); $("setup-emis").focus(); return; }
          renderSchool();
        }, fail);
      }

      function titleWords(s) {
        return String(s || "").toLowerCase().replace(/(^|[\s\/(-])([a-z])/g, function (m, p, c) { return p + c.toUpperCase(); })
          .replace(/\b(Jhs|Shs|Id|Ntc|Ssnit)\b/g, function (w) { return w.toUpperCase(); });
      }

      function fullName(t) { return [t.firstName, t.otherNames, t.surname].filter(Boolean).join(" "); }

      /* wa.me wants the number in international form without "+": 0244123456 -> 233244123456. */
      function waLink(phone, text) {
        var p = String(phone || "").replace(/\D/g, "");
        if (!/^0[2-9]\d{8}$/.test(p)) return "";
        return "https://wa.me/233" + p.slice(1) + "?text=" + encodeURIComponent(text);
      }

      function reminderFor(t) {
        var missing = t.missingSections.length ? t.missingSections.map(titleWords).join(", ")
          : t.status === "Needs confirming" ? "only your confirmation for this year" : "nothing";
        return String(S.summary.reminder || "").replace(/\{first_name\}/g, titleWords(t.firstName)).replace(/\{percent\}/g, String(t.pct))
          .replace(/\{missing\}/g, missing).replace(/\{link\}/g, S.summary.link || "");
      }

      function unfinished(t) { return t.serviceStatus === "Active" && t.status !== "Complete"; }

      function renderSchool() {
        var r = S.summary, c = r.counts;
        $("school-name").textContent = r.school.name || r.school.emis;
        $("rename-row").classList.toggle("hidden", !r.canRename);
        $("rename-box").classList.add("hidden");
        if (!S.admin) showWho(r.school.name, r.termLabel); // an admin's header stays on the district
        $("school-pct").textContent = r.pct + "%";
        $("school-bar").style.width = r.pct + "%";
        $("school-pct-text").textContent = "of " + c.active + " teacher" + (c.active === 1 ? "" : "s") + " complete · average " + r.averagePct + "%";
        var ul = $("school-counts");
        while (ul.firstChild) ul.removeChild(ul.firstChild);
        [["Complete", c.complete], ["Needs confirming", c.needsConfirming], ["Partial", c.partial], ["Not started", c.notStarted], ["Not at post", c.notActive]]
          .forEach(function (x) { if (x[1]) ul.appendChild(el("li", {}, x[0] + ": " + x[1])); });
        renderList();
      }

      function renderList() {
        var list = S.summary.teachers.slice();
        if ($("only-incomplete").checked) list = list.filter(unfinished);
        var by = $("sort").value;
        list.sort(function (a, b) {
          if (by === "name") return fullName(a) < fullName(b) ? -1 : 1;
          if (by === "updated") return (a.updatedAt || "") < (b.updatedAt || "") ? -1 : 1;
          return a.pct - b.pct || (fullName(a) < fullName(b) ? -1 : 1);
        });
        var ul = $("teacher-list");
        while (ul.firstChild) ul.removeChild(ul.firstChild);
        if (!list.length) ul.appendChild(el("li", { "class": "hint" }, $("only-incomplete").checked ? "Everyone has finished. Well done!" : "No teachers in this school yet."));
        list.forEach(function (t) { ul.appendChild(teacherCard(t)); });
      }

      function teacherCard(t) {
        var li = el("li", { id: "t-" + t.staffId });
        var head = el("div", { "class": "head" });
        head.appendChild(el("strong", {}, fullName(t) || "(no name yet)"));
        head.appendChild(el("span", { "class": "meta" }, "Staff ID " + t.staffId));
        li.appendChild(head);
        var bar = el("div", { "class": "bar small", "aria-hidden": "true" });
        var fill = el("span");
        fill.style.width = t.pct + "%";
        bar.appendChild(fill);
        li.appendChild(bar);
        li.appendChild(el("div", { "class": "meta" }, t.pct + "% · " + t.status +
          (t.serviceStatus !== "Active" ? " · not at post" + (t.serviceReason ? " (" + t.serviceReason + ")" : "") : "")));
        if (t.signIn !== "Active") li.appendChild(el("div", { "class": "meta warnline" }, t.signIn === "Inactive" ? "Sign-in switched off"
          : t.signIn === "Locked" ? "Sign-in locked by an admin" : "No sign-in account yet"));
        if (t.missingSections.length) li.appendChild(el("div", { "class": "meta" }, "Missing: " + t.missingSections.map(titleWords).join(", ")));
        var when = t.updatedAt ? new Date(t.updatedAt) : null;
        li.appendChild(el("div", { "class": "meta" }, when && !isNaN(when.getTime())
          ? "Last updated " + dayText(when) + (t.updatedBy && t.updatedBy !== t.staffId ? " by " + (t.updatedBy === S.me ? "you" : "Staff ID " + t.updatedBy) : "")
          : "Not updated yet"));
        var actions = el("div", { "class": "actions" });
        var link = waLink(t.phone, reminderFor(t));
        var wa = el("a", { "class": "sbtn wa", target: "_blank", rel: "noopener", href: link || "#" }, link ? "WhatsApp" : "No phone number");
        if (!link) wa.setAttribute("aria-disabled", "true");
        actions.appendChild(wa);
        var mine = t.staffId === S.me;
        var edit = el("button", { type: "button", "class": "sbtn" }, mine ? "My record" : S.summary.can.records ? "Edit record" : "View record");
        edit.addEventListener("click", function () { openRecord(mine ? null : t.staffId); });
        actions.appendChild(edit);
        if (S.summary.canResetPasswords && !mine) {
          var pw = el("button", { type: "button", "class": "sbtn" }, "Temporary password");
          pw.addEventListener("click", function () { issueTemp(t); });
          actions.appendChild(pw);
        }
        li.appendChild(actions);
        if (S.summary.can.service) li.appendChild(serviceSelect(t));
        if (!mine && S.summary.can.access) li.appendChild(accessButtons(t, li));
        return li;
      }

      /* Sign-in off/on and "left this school"; the server refuses what this person may not do. */
      function accessButtons(t, li) {
        var more = el("div", { "class": "more" });
        if (t.signIn === "Active" || t.signIn === "Inactive") {
          var on = t.signIn !== "Active";
          var b = el("button", { type: "button", "class": "sbtn" }, on ? "Switch sign-in back on" : "Switch sign-in off");
          b.addEventListener("click", function () {
            var go = function () {
              b.disabled = true;
              callServer_("setColleagueSignIn", [S.token, t.staffId, on], function (r) {
                b.disabled = false;
                if (!r || !r.ok) { fail(r); return; }
                loadSchool();
              }, function (e) { b.disabled = false; fail(e); });
            };
            if (on) { go(); return; }
            confirmBox_({ title: "Switch off sign-in", message: ["Switch off sign-in for ", { b: fullName(t) }, "?"],
              detail: "They are signed out at once and cannot sign in until you switch it back on. Their record is kept.",
              ok: "Switch off sign-in", danger: true }, go);
          });
          more.appendChild(b);
        }
        var leave = el("button", { type: "button", "class": "sbtn" }, "Left this school…");
        leave.addEventListener("click", function () {
          if (li.querySelector(".leave")) return;
          var box = el("div", { "class": "leave" });
          box.appendChild(el("label", { "for": "why-" + t.staffId }, "Why is " + fullName(t) + " leaving the school?"));
          var why = el("select", { id: "why-" + t.staffId });
          why.appendChild(el("option", { value: "" }, "— choose —"));
          S.summary.removeReasons.forEach(function (x) { why.appendChild(el("option", { value: x }, x)); });
          box.appendChild(why);
          box.appendChild(el("p", { "class": "hint" }, "Their record stays. They leave this list, and choose their new school the next time they sign in."));
          var row = el("div", { "class": "more" });
          var ok = el("button", { type: "button", "class": "sbtn" }, "Remove from this school");
          var cancel = el("button", { type: "button", "class": "sbtn" }, "Cancel");
          ok.addEventListener("click", function () {
            if (!why.value) { why.focus(); return; }
            ok.disabled = true;
            callServer_("removeFromSchool", [S.token, t.staffId, why.value], function (r) {
              ok.disabled = false;
              if (!r || !r.ok) { fail(r); return; }
              showAlert_($("alert"), "ok", fullName(t) + " was removed from the school's list.");
              loadSchool();
            }, function (e) { ok.disabled = false; fail(e); });
          });
          cancel.addEventListener("click", function () { li.removeChild(box); });
          row.appendChild(ok);
          row.appendChild(cancel);
          box.appendChild(row);
          li.appendChild(box);
          why.focus();
        });
        more.appendChild(leave);
        return more;
      }

      function serviceSelect(t) {
        var sel = el("select", { "aria-label": "Service status of " + fullName(t) });
        sel.appendChild(el("option", { value: "Active" }, "At post (Active)"));
        S.summary.serviceReasons.forEach(function (why) { sel.appendChild(el("option", { value: "Not Active|" + why }, "Not at post — " + why)); });
        var current = t.serviceStatus === "Active" ? "Active" : "Not Active|" + t.serviceReason;
        sel.value = current;
        sel.addEventListener("change", function () {
          var parts = sel.value.split("|");
          sel.disabled = true;
          callServer_("setServiceStatus", [S.token, t.staffId, parts[0], parts[1] || ""], function (r) {
            sel.disabled = false;
            if (!r || !r.ok) { sel.value = current; fail(r); return; }
            loadSchool(); // the counts and the school % change with it
          }, function (e) { sel.disabled = false; sel.value = current; fail(e); });
        });
        return sel;
      }

      function issueTemp(t) {
        confirmBox_({ title: "New temporary password", message: ["Give ", { b: t.name || fullName(t) }, " a new temporary password?"],
          detail: "Their current password stops working at once and they are signed out on every device. The next screen shows the new password for you to give them.",
          ok: "Create the password" }, function () { issueTempNow(t); });
      }

      function issueTempNow(t) {
        callServer_("issueColleagueTempPassword", [S.token, t.staffId], function (r) {
          if (!r || !r.ok) { fail(r); return; }
          $("temp-for").textContent = "For " + r.name + " (Staff ID " + r.staffId + "). It works for " + r.expiresInDays + " days.";
          $("temp-key").textContent = r.temporaryPassword;
          var msg = "Hello " + titleWords(t.firstName || String(t.name || "").split(" ")[0]) + ", your temporary password for the staff records portal is " + r.temporaryPassword +
            " — sign in at " + (portalLink() || "the portal") + " with your Staff ID and this password, then choose your own password.";
          var link = waLink(r.phone, msg);
          $("temp-wa").href = link || "#";
          $("temp-wa").setAttribute("aria-disabled", link ? "false" : "true");
          $("temp-copy").textContent = "Copy";
          $("temp-box").classList.remove("hidden");
          $("temp-box").scrollIntoView({ block: "center" });
        }, fail);
      }

      function groupMessage() {
        var r = S.summary;
        var todo = r.teachers.filter(unfinished).sort(function (a, b) { return a.pct - b.pct; });
        var lines = ["Staff records — " + (r.school.name || r.school.emis) + ": " + r.pct + "% complete."];
        if (!todo.length) lines.push("Everyone has finished. Thank you all!");
        else {
          lines.push("Still to finish:");
          todo.forEach(function (t) { lines.push("• " + titleWords(fullName(t)) + " — " + t.pct + "%"); });
          if (r.link) lines.push("Please sign in at " + r.link);
        }
        return lines.join("\n");
      }

      /* Copies to the clipboard; where that is blocked, shows the text selected for copying by hand. */
      function copyText(text, button, box) {
        if (box) { box.value = text; box.classList.remove("hidden"); }
        var manual = function () {
          if (box) box.select();
          button.textContent = "Select the text and copy it";
        };
        try { navigator.clipboard.writeText(text).then(function () { button.textContent = "Copied"; }, manual); } catch (e) { manual(); }
      }

      $("setup-save").addEventListener("click", function () {
        ["e-setup-emis", "e-setup-name"].forEach(function (id) { $(id).textContent = ""; });
        $("setup-save").disabled = true;
        callServer_("setUpMySchool", [S.token, $("setup-emis").value, $("setup-name").value], function (r) {
          $("setup-save").disabled = false;
          if (r && r.ok) {
            // The session moves to the school's new code: keep the fresh token.
            S.token = r.token;
            storeSet_("token", r.token);
            loadSchool();
            showAlert_($("alert"), "ok", "Your school is set up: " + r.school.name + " (" + r.school.emis + ").");
            return;
          }
          if (r && r.code === "INVALID") {
            $("e-setup-emis").textContent = (r.errors && r.errors.schoolEmis) || "";
            $("e-setup-name").textContent = (r.errors && r.errors.schoolName) || "";
          } else fail(r);
        }, function (e) { $("setup-save").disabled = false; fail(e); });
      });
      $("rename-open").addEventListener("click", function () {
        $("rename-name").value = S.summary.school.name;
        $("e-rename").textContent = "";
        $("rename-box").classList.remove("hidden");
        $("rename-name").focus();
      });
      $("rename-cancel").addEventListener("click", function () { $("rename-box").classList.add("hidden"); });
      $("rename-save").addEventListener("click", function () {
        callServer_("renameMySchool", [S.token, $("rename-name").value], function (r) {
          if (r && r.ok) { loadSchool(); return; }
          if (r && r.code === "INVALID") $("e-rename").textContent = r.message;
          else fail(r);
        }, fail);
      });

      /* ---- My Circuit (circuit coordinators). The server keeps them inside their circuit. */
      function loadCircuit() {
        S.schoolEmis = null; // S.circuitName stays: the circuit an admin opened
        S.subject = null;
        $("loading").classList.remove("hidden");
        showView("circuit");
        callServer_("getMyCircuitSummary", [S.token, S.circuitName || ""], function (r) {
          $("loading").classList.add("hidden");
          if (!r || !r.ok) { fail(r); return; }
          S.circuitSummary = r;
          renderCircuit();
        }, fail);
      }

      function renderCircuit() {
        var r = S.circuitSummary, c = r.counts;
        $("circuit-name").textContent = r.circuit + " circuit";
        if (!S.admin) showWho(r.circuit + " circuit", r.termLabel);
        $("name-panel").classList.toggle("hidden", !r.canManage);
        var cx = $("circuit-export");
        while (cx.firstChild) cx.removeChild(cx.firstChild);
        if (canExport()) {
          cx.appendChild(exportButton("Download the circuit's staff list", { kind: "circuit", circuit: r.circuit }));
          cx.appendChild(exportButton("Staff list (CSV)", { kind: "circuit", circuit: r.circuit }, true));
        }
        $("circuit-pct").textContent = r.pct + "%";
        $("circuit-bar").style.width = r.pct + "%";
        $("circuit-pct-text").textContent = "of " + c.active + " teacher" + (c.active === 1 ? "" : "s") + " complete · average " + r.averagePct + "% · " + r.schools.length + " school" + (r.schools.length === 1 ? "" : "s");
        renderSchoolList();
      }

      function circuitFilter(s) {
        var f = $("circuit-filter").value;
        if (f === "todo") return s.pending || !s.coordinator;
        if (f === "under") return !s.pending && s.pct < 100;
        if (f === "under50") return !s.pending && s.pct < 50;
        return true;
      }

      function renderSchoolList() {
        var ul = $("school-list");
        while (ul.firstChild) ul.removeChild(ul.firstChild);
        var list = S.circuitSummary.schools.filter(circuitFilter);
        if (!list.length) ul.appendChild(el("li", { "class": "hint" }, "No schools here."));
        list.forEach(function (s) { ul.appendChild(schoolCard(s)); });
      }

      function schoolCard(s) {
        var li = el("li", { id: "c-" + s.emis });
        var head = el("div", { "class": "head" });
        head.appendChild(el("strong", {}, s.pending ? "School to be set up" : s.name));
        head.appendChild(el("span", { "class": "meta" }, s.pending ? "" : "EMIS " + s.emis));
        li.appendChild(head);
        var co = s.coordinator;
        li.appendChild(el("div", { "class": "meta" + (co ? "" : " warnline") }, co
          ? "ICT coordinator: " + (co.name || "Staff ID " + co.staffId) + (co.status !== "Active" ? " (" + co.status.toLowerCase() + ")" : "")
          : "No ICT coordinator yet"));
        if (s.pending) {
          li.appendChild(el("div", { "class": "meta warnline" }, "Waiting for " + (co && co.name ? titleWords(co.name) : "the coordinator") + " to sign in and enter the school's code and name."));
        } else {
          var bar = el("div", { "class": "bar small", "aria-hidden": "true" });
          var fill = el("span");
          fill.style.width = s.pct + "%";
          bar.appendChild(fill);
          li.appendChild(bar);
          li.appendChild(el("div", { "class": "meta" }, s.pct + "% complete · " + s.counts.active + " teacher" + (s.counts.active === 1 ? "" : "s") +
            (s.counts.notActive ? " · " + s.counts.notActive + " not at post" : "") +
            (s.lastActivity ? " · last activity " + dayText(new Date(s.lastActivity)) : "")));
        }
        var actions = el("div", { "class": "actions" });
        if (!s.pending) {
          var open = el("button", { type: "button", "class": "sbtn" }, "Open school");
          open.addEventListener("click", function () { S.schoolEmis = s.emis; loadSchool(); });
          actions.appendChild(open);
          if (canExport()) actions.appendChild(exportButton("Staff list", { kind: "school", emis: s.emis }));
        }
        if (co) {
          var link = waLink(co.phone, coordinatorMessage(s));
          var wa = el("a", { "class": "sbtn wa", target: "_blank", rel: "noopener", href: link || "#" }, link ? "WhatsApp coordinator" : "No phone number");
          if (!link) wa.setAttribute("aria-disabled", "true");
          actions.appendChild(wa);
        }
        li.appendChild(actions);
        if (!S.circuitSummary.canManage) return li;
        if (co) li.appendChild(coordinatorStatusSelect(s));
        var more = el("div", { "class": "more" });
        var replace = el("button", { type: "button", "class": "sbtn" }, co ? "Replace coordinator…" : "Name coordinator…");
        replace.addEventListener("click", function () { inlineForm(li, "replace", [["Staff ID of the new ICT coordinator", "numeric", ""]], function (v, done) {
          callServer_("setSchoolCoordinator", [S.token, s.emis, v[0]], done, fail);
        }); });
        more.appendChild(replace);
        var correct = el("button", { type: "button", "class": "sbtn" }, s.pending ? "Enter the school's code…" : "Correct code or name…");
        correct.addEventListener("click", function () { inlineForm(li, "correct", [["School EMIS Code", "numeric", s.pending ? "" : s.emis], ["School name", "text", s.pending ? "" : s.name]], function (v, done) {
          callServer_("correctSchool", [S.token, s.emis, v[0], v[1]], done, fail);
        }); });
        more.appendChild(correct);
        li.appendChild(more);
        return li;
      }

      /* A small form inside a card; send(values, done) calls the server, done(result) closes it and
         reloads the page section (after, default: the circuit). */
      function inlineForm(li, kind, fields, send, after) {
        var old = li.querySelector(".leave");
        if (old) li.removeChild(old);
        var box = el("div", { "class": "leave", "data-kind": kind });
        var inputs = fields.map(function (f, i) {
          var id = kind + "-" + li.id + "-" + i;
          box.appendChild(el("label", { "for": id }, f[0]));
          var input = el("input", { type: "text", id: id, inputmode: f[1] === "numeric" ? "numeric" : "text", maxlength: "120", autocomplete: "off" });
          input.value = f[2];
          box.appendChild(input);
          return input;
        });
        var err = el("div", { "class": "err", role: "alert" });
        box.appendChild(err);
        var row = el("div", { "class": "more" });
        var ok = el("button", { type: "button", "class": "sbtn" }, "Save");
        var cancel = el("button", { type: "button", "class": "sbtn" }, "Cancel");
        ok.addEventListener("click", function () {
          ok.disabled = true;
          send(inputs.map(function (x) { return x.value; }), function (r) {
            ok.disabled = false;
            if (r && r.ok) { (after || loadCircuit)(); return; }
            err.textContent = (r && r.errors && (r.errors.schoolEmis || r.errors.schoolName)) || (r && r.message) || "Could not save.";
          });
        });
        cancel.addEventListener("click", function () { li.removeChild(box); });
        row.appendChild(ok);
        row.appendChild(cancel);
        box.appendChild(row);
        li.appendChild(box);
        inputs[0].focus();
      }

      function coordinatorStatusSelect(s) {
        var sel = el("select", { "aria-label": "Access of the ICT coordinator of " + (s.name || "this school") });
        [["Active", "Coordinator access: on"], ["Deactivated", "Coordinator access: switched off"], ["Locked", "Coordinator access: locked"]]
          .forEach(function (x) { sel.appendChild(el("option", { value: x[0] }, x[1])); });
        sel.value = s.coordinator.status || "Active";
        sel.addEventListener("change", function () {
          var was = s.coordinator.status;
          sel.disabled = true;
          callServer_("setSchoolCoordinatorStatus", [S.token, s.emis, sel.value], function (r) {
            sel.disabled = false;
            if (!r || !r.ok) { sel.value = was; fail(r); return; }
            loadCircuit();
          }, function (e) { sel.disabled = false; sel.value = was; fail(e); });
        });
        return sel;
      }

      function coordinatorMessage(s) {
        var name = s.coordinator && s.coordinator.name ? titleWords(s.coordinator.name.split(" ")[0]) : "";
        if (s.pending) return "Hello " + name + ", please sign in to the staff records portal at " + (S.circuitSummary.link || "the portal") +
          " (ICT Coordinator tab, your Staff ID and password) and enter your school's EMIS code and name.";
        return "Hello " + name + ", " + s.name + " is " + s.pct + "% complete on the staff records portal. Please remind the teachers who have not finished. " +
          (S.circuitSummary.link || "");
      }

      function circuitMessage() {
        var r = S.circuitSummary;
        var todo = r.schools.filter(function (s) { return s.pending || s.pct < 100; });
        var lines = ["Staff records — " + r.circuit + " circuit: " + r.pct + "% complete."];
        if (!todo.length) lines.push("Every school has finished. Thank you all!");
        else {
          lines.push("Still to finish:");
          todo.forEach(function (s) { lines.push("• " + (s.pending ? "(school to be set up)" : s.name + " — " + s.pct + "%")); });
          if (r.link) lines.push("Portal: " + r.link);
        }
        return lines.join("\n");
      }

      $("tab-circuit").addEventListener("click", loadCircuit);
      $("back-circuit").addEventListener("click", goBack);
      $("circuit-filter").addEventListener("change", renderSchoolList);
      $("circuit-msg").addEventListener("click", function () { copyText(circuitMessage(), $("circuit-msg"), $("circuit-text")); });
      $("name-save").addEventListener("click", function () {
        $("e-name").textContent = "";
        $("name-save").disabled = true;
        callServer_("nameSchoolCoordinator", [S.token, $("name-id").value, S.circuitName || ""], function (r) {
          $("name-save").disabled = false;
          if (!r || !r.ok) { $("e-name").textContent = (r && r.message) || "Could not name the coordinator."; return; }
          $("name-id").value = "";
          showAlert_($("alert"), "ok", r.name + (r.needsSetup ? " is named. They now sign in on the ICT Coordinator tab and enter their school's code and name." : " is now the ICT coordinator of their school."));
          loadCircuit();
        }, function (e) { $("name-save").disabled = false; fail(e); });
      });

      /* ---- Official staff list downloads (admins with `exports`, circuit coordinators for their circuit). */
      function canExport() { return S.circuitRole || !!(S.adminCan && S.adminCan.exports); }

      function saveBase64(r) {
        var bin = atob(r.base64), bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        var link = el("a", { download: r.fileName, href: URL.createObjectURL(new Blob([bytes], { type: r.mimeType })) });
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      /* csv: the teachers' records CSV for the desktop staff_list_tool instead of the official workbook. */
      function exportButton(label, scope, csv) {
        var b = el("button", { type: "button", "class": "sbtn export-btn" }, label);
        b.addEventListener("click", function () {
          b.disabled = true;
          var was = b.textContent;
          b.textContent = "Preparing the file…";
          var done = function (r) {
            b.disabled = false;
            b.textContent = was;
            if (!r || !r.ok) { fail(r); return; }
            S.lastExport = { fileName: r.fileName, teachers: r.teachers };
            saveBase64(r);
            showAlert_($("alert"), "ok", r.fileName + " — " + r.teachers + " teacher" + (r.teachers === 1 ? "" : "s") + ".");
          };
          var failed = function (e) { b.disabled = false; b.textContent = was; fail(e); };
          if (csv) callServer_("exportRecordsCsv", [S.token, scope], done, failed);
          else callServer_("exportStaffList", [S.token, scope], done, failed);
        });
        return b;
      }

      /* ---- Admin Overview (SPEC § 10). Circuits and schools open in the coordinators' views. */
      function loadOverview() {
        S.circuitName = null;
        S.schoolEmis = null;
        S.subject = null;
        $("loading").classList.remove("hidden");
        showView("overview");
        callServer_("getAdminOverview", [S.token], function (r) {
          $("loading").classList.add("hidden");
          if (!r || !r.ok) { fail(r); return; }
          S.overview = r;
          S.adminCan = r.can;
          $("tab-teachers").classList.toggle("hidden", !r.can["teachers.view"]);
          $("tab-import").classList.toggle("hidden", !r.can["teachers.import"]);
          $("tab-admins").classList.toggle("hidden", !r.can["admins.manage"]);
          $("tab-settings").classList.toggle("hidden", !r.can["settings"]);
          $("tab-audit").classList.toggle("hidden", !r.can["audit.view"]);
          $("schools-add").classList.toggle("hidden", !r.can["schools.manage"]);
          renderOverview();
        }, fail);
      }

      function renderOverview() {
        var r = S.overview, c = r.counts;
        showWho((r.district.mmda || "District") + (r.main ? " · Main Admin" : " · Admin"), r.termLabel);
        $("district-name").textContent = r.district.mmda || "District";
        $("district-pct").textContent = r.pct + "%";
        $("district-bar").style.width = r.pct + "%";
        $("district-pct-text").textContent = "of " + c.active + " teachers complete · average " + r.averagePct + "% · " + r.signInsToday + " sign-in" + (r.signInsToday === 1 ? "" : "s") + " today";
        var ul = $("district-counts");
        while (ul.firstChild) ul.removeChild(ul.firstChild);
        [["Complete", c.complete], ["Needs confirming", c.needsConfirming], ["Partial", c.partial], ["Not started", c.notStarted], ["Not at post", c.notActive]]
          .forEach(function (x) { if (x[1]) ul.appendChild(el("li", {}, x[0] + ": " + x[1])); });
        var w = $("district-warnings");
        while (w.firstChild) w.removeChild(w.firstChild);
        r.warnings.forEach(function (msg) { w.appendChild(el("div", { "class": "alert warn" }, msg)); });
        var dx = $("district-export");
        while (dx.firstChild) dx.removeChild(dx.firstChild);
        if (canExport()) {
          dx.appendChild(exportButton("Download the district's staff list", { kind: "district" }));
          dx.appendChild(exportButton("Staff list (CSV)", { kind: "district" }, true));
        }
        var cl = $("circuit-list");
        while (cl.firstChild) cl.removeChild(cl.firstChild);
        r.circuits.forEach(function (x) { cl.appendChild(circuitCard(x)); });
        var sel = $("school-circuit-filter");
        var keep = sel.value;
        while (sel.firstChild) sel.removeChild(sel.firstChild);
        sel.appendChild(el("option", { value: "" }, "All circuits"));
        r.circuits.forEach(function (x) { sel.appendChild(el("option", { value: x.circuit }, x.circuit)); });
        sel.value = keep;
        renderDistrictSchools();
      }

      function circuitCard(x) {
        var li = el("li", { id: "k-" + x.circuit });
        var head = el("div", { "class": "head" });
        head.appendChild(el("strong", {}, x.circuit));
        head.appendChild(el("span", { "class": "meta" }, x.schools + " school" + (x.schools === 1 ? "" : "s")));
        li.appendChild(head);
        li.appendChild(el("div", { "class": "meta" + (x.coordinator ? "" : " warnline") }, x.coordinator
          ? "Circuit coordinator: " + (x.coordinator.name || "Staff ID " + x.coordinator.staffId) + (x.coordinator.status !== "Active" ? " (" + x.coordinator.status.toLowerCase() + ")" : "")
          : "No circuit coordinator yet"));
        var bar = el("div", { "class": "bar small", "aria-hidden": "true" });
        var fill = el("span");
        fill.style.width = x.pct + "%";
        bar.appendChild(fill);
        li.appendChild(bar);
        var todo = [];
        if (x.toSetUp) todo.push(x.toSetUp + " to be set up");
        if (x.noCoordinator) todo.push(x.noCoordinator + " without a coordinator");
        li.appendChild(el("div", { "class": "meta" }, x.pct + "% complete · " + x.counts.active + " teacher" + (x.counts.active === 1 ? "" : "s") + (todo.length ? " · " + todo.join(", ") : "")));
        var actions = el("div", { "class": "actions" });
        var open = el("button", { type: "button", "class": "sbtn" }, "Open circuit");
        open.addEventListener("click", function () { S.circuitName = x.circuit; loadCircuit(); });
        actions.appendChild(open);
        if (canExport()) actions.appendChild(exportButton("Staff list", { kind: "circuit", circuit: x.circuit }));
        if (x.coordinator) {
          var link = waLink(x.coordinator.phone, "Hello " + titleWords((x.coordinator.name || "").split(" ")[0]) + ", " + x.circuit +
            " circuit is " + x.pct + "% complete on the staff records portal. " + (S.overview.link || ""));
          var wa = el("a", { "class": "sbtn wa", target: "_blank", rel: "noopener", href: link || "#" }, link ? "WhatsApp" : "No phone number");
          if (!link) wa.setAttribute("aria-disabled", "true");
          actions.appendChild(wa);
        }
        li.appendChild(actions);
        if (!S.adminCan["coordinators.manage"]) return li;
        if (x.coordinator) {
          var sel = el("select", { "aria-label": "Access of the circuit coordinator of " + x.circuit });
          [["Active", "Coordinator access: on"], ["Deactivated", "Coordinator access: switched off"], ["Locked", "Coordinator access: locked"]]
            .forEach(function (o) { sel.appendChild(el("option", { value: o[0] }, o[1])); });
          sel.value = x.coordinator.status || "Active";
          sel.addEventListener("change", function () {
            sel.disabled = true;
            callServer_("setCircuitCoordinatorStatus", [S.token, x.circuit, sel.value], function (r) {
              sel.disabled = false;
              if (!r || !r.ok) { sel.value = x.coordinator.status; fail(r); return; }
              loadOverview();
            }, function (e) { sel.disabled = false; fail(e); });
          });
          li.appendChild(sel);
        }
        var more = el("div", { "class": "more" });
        var name = el("button", { type: "button", "class": "sbtn" }, x.coordinator ? "Replace circuit coordinator…" : "Name circuit coordinator…");
        name.addEventListener("click", function () {
          inlineForm(li, "circ", [["Staff ID of a teacher in " + x.circuit + " circuit", "numeric", ""]], function (v, done) {
            callServer_("setCircuitCoordinator", [S.token, x.circuit, v[0]], done, fail);
          }, loadOverview);
        });
        more.appendChild(name);
        li.appendChild(more);
        return li;
      }

      function renderDistrictSchools() {
        var circuit = $("school-circuit-filter").value;
        var list = S.overview.schools.filter(function (s) { return !circuit || s.circuit === circuit; });
        var by = $("school-sort").value;
        list.sort(function (a, b) {
          if (by === "name") return (a.name || "") < (b.name || "") ? -1 : 1;
          return a.pct - b.pct || ((a.name || "") < (b.name || "") ? -1 : 1);
        });
        var ul = $("district-schools");
        while (ul.firstChild) ul.removeChild(ul.firstChild);
        if (!list.length) ul.appendChild(el("li", { "class": "hint" }, "No schools yet."));
        list.forEach(function (s) {
          var li = el("li", { id: "d-" + s.emis });
          var head = el("div", { "class": "head" });
          head.appendChild(el("strong", {}, s.pending ? "School to be set up" : s.name));
          head.appendChild(el("span", { "class": "meta" }, s.circuit));
          li.appendChild(head);
          li.appendChild(el("div", { "class": "meta" + (s.coordinator ? "" : " warnline") }, s.coordinator
            ? "ICT coordinator: " + (s.coordinator.name || "Staff ID " + s.coordinator.staffId) + (s.coordinator.status !== "Active" ? " (" + s.coordinator.status.toLowerCase() + ")" : "")
            : "No ICT coordinator yet"));
          if (!s.pending) {
            li.appendChild(el("div", { "class": "meta" }, s.pct + "% complete · " + s.counts.active + " teacher" + (s.counts.active === 1 ? "" : "s") +
              " · complete " + s.counts.complete + ", partial " + s.counts.partial + ", not started " + s.counts.notStarted + (s.counts.notActive ? ", not at post " + s.counts.notActive : "")));
            var open = el("button", { type: "button", "class": "sbtn" }, "Open school");
            open.addEventListener("click", function () { S.circuitName = null; S.schoolEmis = s.emis; loadSchool(); });
            var actions = el("div", { "class": "actions" });
            actions.appendChild(open);
            if (canExport()) actions.appendChild(exportButton("Staff list", { kind: "school", emis: s.emis }));
            li.appendChild(actions);
          }
          ul.appendChild(li);
        });
      }

      /* Back from a school: to its circuit when opened from there, else to the admin overview. */
      function goBack() {
        if (S.circuitRole || S.circuitName) loadCircuit();
        else loadOverview();
      }

      /* ---- Admin Teachers tab: search the district and act on one teacher (SPEC § 10). */
      function portalLink() { return (S.summary && S.summary.link) || (S.overview && S.overview.link) || ""; }

      function canEditRecords() { return S.admin ? !!(S.adminCan && S.adminCan["teachers.edit"]) : !!(S.summary && S.summary.can && S.summary.can.records); }

      function showTeachers() {
        S.subject = null;
        S.fromTeachers = false;
        showView("teachers");
        $("find-q").focus();
      }

      function findTeachers() {
        var q = $("find-q").value;
        $("e-find").textContent = "";
        $("find-go").disabled = true;
        callServer_("searchTeachers", [S.token, q], function (r) {
          $("find-go").disabled = false;
          if (!r || !r.ok) { $("e-find").textContent = (r && r.message) || "Could not search."; return; }
          S.found = r;
          renderFound();
        }, function (e) { $("find-go").disabled = false; fail(e); });
      }

      function renderFound() {
        var ul = $("found-list");
        while (ul.firstChild) ul.removeChild(ul.firstChild);
        var r = S.found;
        if (!r.teachers.length) ul.appendChild(el("li", { "class": "hint" }, "Nobody found. Check the spelling or the Staff ID."));
        r.teachers.forEach(function (t) { ul.appendChild(foundCard(t)); });
        if (r.more) ul.appendChild(el("li", { "class": "hint" }, "Only the first 50 are shown. Type more of the name."));
      }

      function foundCard(t) {
        var can = S.adminCan || {};
        var li = el("li", { id: "f-" + t.staffId });
        var head = el("div", { "class": "head" });
        head.appendChild(el("strong", {}, t.name || "(no name yet)"));
        head.appendChild(el("span", { "class": "meta" }, "Staff ID " + t.staffId));
        li.appendChild(head);
        li.appendChild(el("div", { "class": "meta" + (t.school ? "" : " warnline") }, t.school ? t.school + " · " + t.circuit : "No school yet"));
        li.appendChild(el("div", { "class": "meta" }, t.pct + "% · " + t.status + (t.serviceStatus !== "Active" ? " · not at post" : "")));
        if (t.signIn !== "Active") li.appendChild(el("div", { "class": "meta warnline" }, t.signIn === "Inactive" ? "Sign-in switched off"
          : t.signIn === "Locked" ? "Sign-in locked" : "No sign-in account yet"));
        var actions = el("div", { "class": "actions" });
        var open = el("button", { type: "button", "class": "sbtn" }, can["teachers.edit"] ? "Edit record" : "View record");
        open.addEventListener("click", function () { S.fromTeachers = true; S.summary = null; openRecord(t.staffId); });
        actions.appendChild(open);
        if (can["teachers.passwords"] && t.signIn !== "No account") {
          var pw = el("button", { type: "button", "class": "sbtn" }, "Temporary password");
          pw.addEventListener("click", function () { issueTemp(t); });
          actions.appendChild(pw);
        }
        li.appendChild(actions);
        if (can["teachers.access"] && t.signIn !== "No account") {
          var sel = el("select", { "aria-label": "Sign-in of " + t.name });
          [["Active", "Sign-in: on"], ["Inactive", "Sign-in: switched off"], ["Locked", "Sign-in: locked"]].forEach(function (x) { sel.appendChild(el("option", { value: x[0] }, x[1])); });
          sel.value = t.signIn;
          sel.addEventListener("change", function () {
            sel.disabled = true;
            callServer_("setTeacherSignIn", [S.token, t.staffId, sel.value], function (r) {
              sel.disabled = false;
              if (!r || !r.ok) { sel.value = t.signIn; fail(r); return; }
              t.signIn = r.signIn;
              li.parentNode.replaceChild(foundCard(t), li);
            }, function (e) { sel.disabled = false; sel.value = t.signIn; fail(e); });
          });
          li.appendChild(sel);
        }
        if (can["teachers.import"]) {
          var more = el("div", { "class": "more" });
          var move = el("button", { type: "button", "class": "sbtn" }, "Transfer to another school…");
          move.addEventListener("click", function () { transferForm(t, li); });
          more.appendChild(move);
          li.appendChild(more);
        }
        return li;
      }

      function transferForm(t, li) {
        if (li.querySelector(".leave")) return;
        var box = el("div", { "class": "leave" });
        box.appendChild(el("label", { "for": "to-" + t.staffId }, "New school for " + t.name));
        var sel = el("select", { id: "to-" + t.staffId });
        sel.appendChild(el("option", { value: "" }, "— choose —"));
        (S.overview ? S.overview.schools : []).filter(function (s) { return !s.pending && s.emis !== t.schoolEmis; })
          .sort(function (a, b) { return a.circuit + a.name < b.circuit + b.name ? -1 : 1; })
          .forEach(function (s) { sel.appendChild(el("option", { value: s.emis }, s.name + " (" + s.circuit + ")")); });
        box.appendChild(sel);
        var err = el("div", { "class": "err", role: "alert" });
        box.appendChild(err);
        var row = el("div", { "class": "more" });
        var ok = el("button", { type: "button", "class": "sbtn" }, "Transfer");
        var cancel = el("button", { type: "button", "class": "sbtn" }, "Cancel");
        ok.addEventListener("click", function () {
          if (!sel.value) { sel.focus(); return; }
          ok.disabled = true;
          callServer_("transferTeacher", [S.token, t.staffId, sel.value], function (r) {
            ok.disabled = false;
            if (!r || !r.ok) { err.textContent = (r && r.message) || "Could not transfer."; return; }
            t.schoolEmis = r.to; t.school = r.school;
            t.circuit = ((S.overview.schools.filter(function (s) { return s.emis === r.to; })[0]) || {}).circuit || "";
            showAlert_($("alert"), "ok", t.name + " now belongs to " + r.school + ".");
            li.parentNode.replaceChild(foundCard(t), li);
          }, function (e) { ok.disabled = false; fail(e); });
        });
        cancel.addEventListener("click", function () { li.removeChild(box); });
        row.appendChild(ok);
        row.appendChild(cancel);
        box.appendChild(row);
        li.appendChild(box);
        sel.focus();
      }

      $("tab-teachers").addEventListener("click", showTeachers);
      $("find-go").addEventListener("click", findTeachers);
      $("find-q").addEventListener("keydown", function (ev) { if (ev.key === "Enter") { ev.preventDefault(); findTeachers(); } });

      /* ---- Admin Import tab: template → filled file → check → add, or one teacher from a form;
         slips per school to print (or save as PDF). The server checks every row again. */
      var IMPORT_MAX_BYTES = 1000000;

      function openImport() {
        S.subject = null;
        showView("import");
        callServer_("getImportOptions", [S.token], function (r) {
          if (!r || !r.ok) { fail(r); return; }
          fillOptions($("one-school_emis_code"), [], "", "— not known yet —");
          r.schools.forEach(function (x) { $("one-school_emis_code").appendChild(el("option", { value: x.emis }, x.name + " (" + x.circuit + ")")); });
        }, fail);
      }

      function downloadTemplate() {
        var b = $("import-template"), was = b.textContent;
        b.disabled = true;
        b.textContent = "Preparing the file…";
        callServer_("getImportTemplate", [S.token], function (r) {
          b.disabled = false;
          b.textContent = was;
          if (!r || !r.ok) { fail(r); return; }
          saveBase64(r);
          showAlert_($("alert"), "ok", r.fileName + " — with " + r.schools + " school" + (r.schools === 1 ? "" : "s") + " in its drop-down.");
        }, function (e) { b.disabled = false; b.textContent = was; fail(e); });
      }

      /* The chosen file as {fileName, base64}, or null with the reason shown. */
      function readImportFile(then) {
        var f = $("import-file").files && $("import-file").files[0];
        if (!f) { $("e-import").textContent = "Choose the filled template file first."; return; }
        if (!/\.(xlsx|csv)$/i.test(f.name)) { $("e-import").textContent = "Choose an .xlsx (the template) or .csv file."; return; }
        if (f.size > IMPORT_MAX_BYTES) { $("e-import").textContent = "The file is too big. Keep at most 1,000 teachers in one file."; return; }
        var reader = new FileReader();
        reader.onload = function () { then({ fileName: f.name, base64: String(reader.result).replace(/^data:[^,]*,/, "") }); };
        reader.onerror = function () { $("e-import").textContent = "The file could not be read. Choose it again."; };
        reader.readAsDataURL(f);
      }

      function importRowText(row, word) {
        var v = row.values;
        return word + " " + row.line + ": " + [v.staff_id, [v.surname, v.first_name, v.other_middle_names].filter(Boolean).join(" "), row.school, v.phone_number].filter(Boolean).join(" · ") +
          " — " + (row.status === "error" ? row.problems.join("; ") : row.status === "exists" ? "already in the portal (left as it is)" : "will be added");
      }

      function checkImport() {
        $("e-import").textContent = "";
        $("import-add").classList.add("hidden");
        $("import-preview").classList.add("hidden");
        S.importFile = null;
        readImportFile(function (file) {
          $("import-check").disabled = true;
          callServer_("previewImport", [S.token, file], function (r) {
            $("import-check").disabled = false;
            if (!r || !r.ok) { $("e-import").textContent = (r && r.message) || "Could not check the file."; return; }
            S.importFile = file;
            var ul = $("import-rows");
            while (ul.firstChild) ul.removeChild(ul.firstChild);
            $("import-counts").textContent = r.counts.add + " to add · " + r.counts.exists + " already in the portal · " + r.counts.errors + " with problems" +
              (r.tooMany ? " · more than " + r.max + " rows: split the file" : "");
            $("import-fix").classList.toggle("hidden", !r.counts.errors);
            // Problems first, so they are seen without scrolling.
            r.rows.slice().sort(function (a, b) { return (a.status === "error" ? 0 : 1) - (b.status === "error" ? 0 : 1) || a.line - b.line; }).forEach(function (row) {
              ul.appendChild(el("li", { "class": "meta" + (row.status === "error" ? " warnline" : "") }, importRowText(row, r.rowWord || "Row")));
            });
            $("import-preview").classList.remove("hidden");
            S.importCount = r.counts.add;
            if (r.counts.add && !r.tooMany) {
              $("import-add").textContent = "Add " + r.counts.add + " teacher" + (r.counts.add === 1 ? "" : "s");
              $("import-add").classList.remove("hidden");
            }
          }, function (e) { $("import-check").disabled = false; fail(e); });
        });
      }

      function importDone(r) {
        S.imported = r;
        renderSlips();
        showAlert_($("alert"), "ok", r.added.length + " teacher" + (r.added.length === 1 ? " was" : "s were") + " added. Print the slips now: the passwords are shown only once.");
      }

      function addImport() {
        if (!S.importFile) return;
        var n = S.importCount, who = n + " teacher" + (n === 1 ? "" : "s");
        confirmBox_({ title: "Add teachers to the portal", message: ["Add ", { b: who }, " to the portal?"],
          detail: "Each one gets a temporary password. The next screen shows their password slips: print them or save them as PDF straight away, because the passwords are shown only once.",
          ok: "Yes, add " + who }, addImportNow);
      }

      function addImportNow() {
        $("import-add").disabled = true;
        callServer_("importTeachers", [S.token, S.importFile], function (r) {
          $("import-add").disabled = false;
          if (!r || !r.ok) { fail(r); return; }
          $("import-add").classList.add("hidden");
          $("import-preview").classList.add("hidden");
          $("import-file").value = "";
          S.importFile = null;
          importDone(r);
        }, function (e) { $("import-add").disabled = false; fail(e); });
      }

      var ONE_FIELDS = ["staff_id", "surname", "first_name", "other_middle_names", "school_emis_code", "phone_number"];
      var ONE_KINDS = { staff_id: "staff_id", surname: "name", first_name: "name", other_middle_names: "name", phone_number: "phone" };

      function addOne() {
        var t = {}, bad = false;
        $("e-one").textContent = "";
        ONE_FIELDS.forEach(function (k) {
          t[k] = $("one-" + k).value.trim();
          if (!ONE_KINDS[k]) return;
          var why = !t[k] ? (k === "surname" || k === "first_name" || k === "staff_id" ? "Fill this in." : "") : formatProblem({ kind: ONE_KINDS[k] }, t[k]);
          $("e-one-" + k).textContent = why;
          if (why) bad = true;
        });
        if (bad) { $("e-one").textContent = "Please correct the boxes marked in red."; return; }
        $("one-add").disabled = true;
        callServer_("importTeachers", [S.token, { teacher: t }], function (r) {
          $("one-add").disabled = false;
          if (!r || !r.ok) { fail(r); return; }
          if (!r.added.length) {
            $("e-one").textContent = "Not added: " + ((r.skippedRows[0] && r.skippedRows[0].problems.join("; ")) || "please check the boxes") + ".";
            return;
          }
          ONE_FIELDS.forEach(function (k) { $("one-" + k).value = ""; });
          importDone(r);
        }, function (e) { $("one-add").disabled = false; fail(e); });
      }

      /* One slip per teacher, grouped by school, for the coordinator to hand out. */
      function renderSlips() {
        var r = S.imported, box = $("slips");
        while (box.firstChild) box.removeChild(box.firstChild);
        var bySchool = {};
        r.added.forEach(function (a) { var k = a.school || "No school yet (they choose it when they sign in)"; (bySchool[k] = bySchool[k] || []).push(a); });
        Object.keys(bySchool).sort().forEach(function (school) {
          var sec = el("section", { "class": "slip-school" });
          sec.appendChild(el("h3", {}, school + " — " + bySchool[school].length + " slip" + (bySchool[school].length === 1 ? "" : "s")));
          bySchool[school].forEach(function (a) {
            var slip = el("div", { "class": "slip" });
            slip.appendChild(el("strong", {}, a.name));
            slip.appendChild(el("div", {}, "Staff ID: " + a.staffId + (a.school ? " · " + a.school : "")));
            slip.appendChild(el("div", { "class": "key" }, a.temporaryPassword));
            slip.appendChild(el("div", { "class": "hint" }, "Sign in at " + (r.link || "the staff records portal") + " (Teacher tab) with your Staff ID and this temporary password, then choose your own password. It works for " +
              r.expiresInDays + " days."));
            sec.appendChild(slip);
          });
          box.appendChild(sec);
        });
        $("slips-panel").classList.remove("hidden");
      }

      function csvCell(v) { return /[",\n]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v); }

      function downloadSlips() {
        var lines = [["Staff ID", "Name", "School", "Temporary password"].join(",")];
        S.imported.added.forEach(function (a) { lines.push([a.staffId, a.name, a.school, a.temporaryPassword].map(csvCell).join(",")); });
        var link = el("a", { download: "temporary-passwords.csv", href: URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/csv" })) });
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      $("tab-import").addEventListener("click", openImport);
      $("import-template").addEventListener("click", downloadTemplate);
      $("import-file").addEventListener("change", function () { $("e-import").textContent = ""; $("import-preview").classList.add("hidden"); S.importFile = null; });
      $("one-add").addEventListener("click", addOne);
      $("import-check").addEventListener("click", checkImport);
      $("import-add").addEventListener("click", addImport);
      $("slips-print").addEventListener("click", function () { window.print(); });
      $("slips-csv").addEventListener("click", downloadSlips);
      $("slips-done").addEventListener("click", function () {
        confirmBox_({ title: "Close the password slips?", message: "Have you printed or saved the slips?",
          detail: "The temporary passwords cannot be shown again once you close this. If a slip is lost later, give that teacher a new temporary password.",
          ok: "Yes, close the slips", cancel: "Not yet" }, function () {
          S.imported = null;
          var box = $("slips");
          while (box.firstChild) box.removeChild(box.firstChild);
          $("slips-panel").classList.add("hidden");
        });
      });

      /* ---- Admins tab (Main Admin only) and adding schools / circuits (schools.manage). */
      var PERMISSION_LABELS = {
        "teachers.view": "See teachers and records", "teachers.edit": "Edit teachers' records", "teachers.passwords": "Give temporary passwords",
        "teachers.access": "Switch sign-in on / off, lock", "teachers.service_status": "Set service status", "teachers.import": "Import and transfer teachers",
        "schools.manage": "Add schools and circuits", "coordinators.manage": "Manage coordinators", "exports": "Download staff lists", "audit.view": "See the audit log"
      };

      function loadAdmins() {
        S.subject = null;
        showView("admins");
        callServer_("listAdmins", [S.token], function (r) {
          if (!r || !r.ok) { fail(r); return; }
          S.admins = r;
          renderAdmins();
          loadHandover();
        }, fail);
      }

      function permissionBoxes(container, prefix, chosen) {
        while (container.firstChild) container.removeChild(container.firstChild);
        S.admins.permissions.forEach(function (p) {
          var lab = el("label", { "class": "check" });
          var cb = el("input", { type: "checkbox", value: p, id: prefix + p });
          cb.checked = chosen.indexOf(p) !== -1;
          lab.appendChild(cb);
          lab.appendChild(document.createTextNode(PERMISSION_LABELS[p] || p));
          container.appendChild(lab);
        });
      }

      function ticked(container) {
        return [].filter.call(container.querySelectorAll("input:checked"), function () { return true; }).map(function (x) { return x.value; });
      }

      function renderAdmins() {
        var ul = $("admin-list");
        while (ul.firstChild) ul.removeChild(ul.firstChild);
        S.admins.admins.forEach(function (a) {
          var li = el("li", { id: "a-" + a.username });
          var head = el("div", { "class": "head" });
          head.appendChild(el("strong", {}, a.displayName || a.username));
          head.appendChild(el("span", { "class": "meta" }, a.role === "main" ? "Main Admin" : "Sub-admin"));
          li.appendChild(head);
          li.appendChild(el("div", { "class": "meta" + (a.status === "Active" ? "" : " warnline") }, "Username " + a.username + " · " + (a.status === "Active" ? "on" : "switched off") +
            (a.lastLogin ? " · last sign-in " + dayText(new Date(a.lastLogin)) : " · not signed in yet")));
          if (a.role === "main") { ul.appendChild(li); return; }
          var boxes = el("div", { "class": "perm-boxes" });
          li.appendChild(boxes);
          permissionBoxes(boxes, "p-" + a.username + "-", a.permissions);
          var row = el("div", { "class": "more" });
          var save = el("button", { type: "button", "class": "sbtn" }, "Save permissions");
          save.addEventListener("click", function () {
            callServer_("setSubAdminPermissions", [S.token, a.username, ticked(boxes)], function (r) {
              if (!r || !r.ok) { fail(r); return; }
              showAlert_($("alert"), "ok", (a.displayName || a.username) + "'s permissions are saved. They sign in again to use them.");
              loadAdmins();
            }, fail);
          });
          var onOff = el("button", { type: "button", "class": "sbtn" }, a.status === "Active" ? "Switch off" : "Switch on");
          onOff.addEventListener("click", function () { adminStatus(a, a.status === "Active" ? "Inactive" : "Active"); });
          var pw = el("button", { type: "button", "class": "sbtn" }, "Temporary password");
          pw.addEventListener("click", function () {
            confirmBox_({ title: "New temporary password", message: ["Give ", { b: a.displayName || a.username }, " a new temporary password?"],
              detail: "Their current password stops working at once and they are signed out. The next screen shows the new password for you to give them.",
              ok: "Create the password" }, function () {
              callServer_("issueAdminTempPassword", [S.token, a.username], function (r) {
                if (!r || !r.ok) { fail(r); return; }
                showTempPassword(a.displayName || a.username, a.username, r.temporaryPassword, a.whatsapp, "Your admin username is " + a.username + ".");
              }, fail);
            });
          });
          var remove = el("button", { type: "button", "class": "sbtn" }, "Remove");
          remove.addEventListener("click", function () {
            confirmBox_({ title: "Remove sub-admin", message: ["Remove ", { b: a.displayName || a.username }, " as a sub-admin?"],
              detail: "They can no longer sign in to the admin pages. You can add a sub-admin again later.", ok: "Remove", danger: true },
              function () { adminStatus(a, "Removed"); });
          });
          [save, onOff, pw, remove].forEach(function (b) { row.appendChild(b); });
          li.appendChild(row);
          ul.appendChild(li);
        });
        var subs = S.admins.admins.filter(function (a) { return a.role === "sub"; }).length;
        $("add-admin").classList.toggle("hidden", subs >= S.admins.max);
        $("admins-full").classList.toggle("hidden", subs < S.admins.max);
        permissionBoxes($("new-perms"), "np-", []);
      }

      function adminStatus(a, status) {
        callServer_("setSubAdminStatus", [S.token, a.username, status], function (r) {
          if (!r || !r.ok) { fail(r); return; }
          loadAdmins();
        }, fail);
      }

      /* The shared temporary-password panel, for admins (no school record behind them). */
      function showTempPassword(name, username, temp, whatsapp, extra) {
        $("temp-for").textContent = "For " + name + ". " + (extra || "");
        $("temp-key").textContent = temp;
        var link = waLink(whatsapp, "Hello " + name + ", your temporary password for the staff records portal is " + temp + " — " + (extra || "") +
          " Sign in on the Admin tab at " + (portalLink() || "the portal") + ", then choose your own password.");
        $("temp-wa").href = link || "#";
        $("temp-wa").setAttribute("aria-disabled", link ? "false" : "true");
        $("temp-copy").textContent = "Copy";
        $("temp-box").classList.remove("hidden");
        $("temp-box").scrollIntoView({ block: "center" });
      }

      /* ---- Hand over Main Admin (SPEC § 2): only the Main Admin sees this panel. */
      function loadHandover() {
        if (!S.adminCan || !S.adminCan.handover) { $("handover-panel").classList.add("hidden"); return; }
        $("handover-panel").classList.remove("hidden");
        callServer_("getHandover", [S.token], function (r) {
          if (!r || !r.ok) { fail(r); return; }
          if (r.notice) showAlert_($("alert"), "warn", "Your handover was cancelled: " + r.notice);
          renderHandover(r.pending, null);
        }, fail);
      }

      function renderHandover(pending, started) {
        $("handover-pending").classList.toggle("hidden", !pending);
        $("handover-form").classList.toggle("hidden", !!pending);
        $("handover-code-box").classList.toggle("hidden", !started);
        if (pending) $("handover-pending-text").textContent = "Handover waiting for " + pending.name + " (username " + pending.to + "), until " +
          dayText(new Date(pending.expiresAt), true) + ". Nothing changes until they accept.";
        if (started) {
          $("handover-code").textContent = started.code;
          $("handover-emailed").textContent = started.emailed ? "The code was emailed to " + started.pending.email + "." : "No email was sent: send the code by WhatsApp.";
          var link = waLink(started.pending.whatsapp, "Hello " + started.pending.name + ", I am handing over the Main Admin role of the staff records portal to you. Open " +
            (started.link || "the portal") + ", choose the Admin tab, then \"I have a handover code\". Username: " + started.pending.to + " · Code: " + started.code +
            " (works once, for 72 hours). You will choose your own password.");
          $("handover-wa").href = link || "#";
          $("handover-wa").setAttribute("aria-disabled", link ? "false" : "true");
        }
        var sel = $("handover-successor");
        while (sel.firstChild) sel.removeChild(sel.firstChild);
        sel.appendChild(el("option", { value: "" }, "— choose —"));
        ((S.admins && S.admins.admins) || []).filter(function (a) { return a.role === "sub" && a.status === "Active"; })
          .forEach(function (a) { sel.appendChild(el("option", { value: a.username }, (a.displayName || a.username) + " (sub-admin)")); });
        sel.appendChild(el("option", { value: "new" }, "A new person"));
        $("handover-new").classList.add("hidden");
      }

      function handoverStarted(r) {
        $("handover-password").value = "";
        $("handover-resend-password").value = "";
        if (!r || !r.ok) {
          if (r && r.errors) Object.keys(r.errors).forEach(function (k) { if ($("e-ho-" + k)) $("e-ho-" + k).textContent = r.errors[k]; });
          showAlert_($("alert"), "error", (r && r.message) || "Could not start the handover.");
          return;
        }
        renderHandover(r.pending, r);
        $("handover-code-box").scrollIntoView({ block: "center" });
      }

      $("handover-successor").addEventListener("change", function () { $("handover-new").classList.toggle("hidden", $("handover-successor").value !== "new"); });
      $("handover-start").addEventListener("click", function () {
        ["successor", "username", "displayName", "whatsapp", "email", "outgoing"].forEach(function (k) { $("e-ho-" + k).textContent = ""; });
        var form = { successor: $("handover-successor").value, username: $("ho-username").value, displayName: $("ho-displayName").value,
          whatsapp: $("ho-whatsapp").value, email: $("ho-email").value,
          outgoing: document.querySelector("input[name=ho-outgoing]:checked").value };
        if (!form.successor) { $("e-ho-successor").textContent = "Choose the successor."; return; }
        callServer_("startHandover", [S.token, form, $("handover-password").value], handoverStarted, fail);
      });
      $("handover-resend").addEventListener("click", function () {
        callServer_("resendHandover", [S.token, $("handover-resend-password").value], handoverStarted, fail);
      });
      $("handover-cancel").addEventListener("click", function () {
        confirmBox_({ title: "Cancel the handover", message: "Stop handing over the Main Admin role?",
          detail: "The handover code stops working at once. You stay the Main Admin.", ok: "Cancel the handover", cancel: "Keep it", danger: true }, function () {
          callServer_("cancelHandover", [S.token], function (r) {
            if (!r || !r.ok) { fail(r); return; }
            renderHandover(null, null);
          }, fail);
        });
      });

      /* ---- Settings tab (Main Admin): every value checked on the server before anything is saved. */
      function loadSettings() {
        S.subject = null;
        showView("settings");
        callServer_("getSettings", [S.token], function (r) {
          if (!r || !r.ok) { fail(r); return; }
          S.settings = r;
          renderSettings();
        }, fail);
      }

      function renderSettings() {
        var r = S.settings, v = r.values;
        fillOptions($("set-REGION"), r.regions, v.REGION);
        $("set-MMDA").value = v.MMDA;
        var dl = $("set-mmdas");
        while (dl.firstChild) dl.removeChild(dl.firstChild);
        r.mmdas.forEach(function (m) { dl.appendChild(el("option", { value: m })); });
        $("set-REMINDER_MESSAGE").value = v.REMINDER_MESSAGE;
        $("set-MAINTENANCE_MODE").checked = v.MAINTENANCE_MODE === "true";
        $("set-MAINTENANCE_MESSAGE").value = v.MAINTENANCE_MESSAGE;
        $("set-COORDINATOR_PASSWORD_RESETS").checked = v.COORDINATOR_PASSWORD_RESETS !== "false";
        ["TEMP_PASSWORD_DAYS", "SESSION_IDLE_MINUTES", "SESSION_MAX_HOURS"].forEach(function (k) { $("set-" + k).value = v[k]; });
        var waves = $("set-waves"), open = v.ALLOWED_CIRCUITS ? v.ALLOWED_CIRCUITS.split(",") : [];
        while (waves.firstChild) waves.removeChild(waves.firstChild);
        r.circuits.forEach(function (c) {
          var lab = el("label", { "class": "check" });
          var cb = el("input", { type: "checkbox", value: c });
          cb.checked = open.indexOf(c) !== -1;
          lab.appendChild(cb);
          lab.appendChild(document.createTextNode(c));
          waves.appendChild(lab);
        });
        var req = v.REQUIRED_FIELDS ? v.REQUIRED_FIELDS.split(",") : null;
        $("set-req-template").checked = !req;
        var box = $("set-required");
        while (box.firstChild) box.removeChild(box.firstChild);
        var section = "";
        r.fields.forEach(function (f) {
          if (f.section !== section) { section = f.section; box.appendChild(el("p", { "class": "hint", style: "margin:10px 0 0;font-weight:700" }, titleWords(section))); }
          var lab = el("label", { "class": "check" });
          var cb = el("input", { type: "checkbox", value: f.key });
          cb.checked = req ? req.indexOf(f.key) !== -1 : f.templateRequired;
          cb.disabled = !req;
          lab.appendChild(cb);
          lab.appendChild(document.createTextNode(f.label + (f.conditional ? " (when it applies)" : "")));
          box.appendChild(lab);
        });
        fillOptions($("set-ACADEMIC_YEAR"), r.years, v.ACADEMIC_YEAR);
        fillOptions($("set-TERM"), r.termNames, v.TERM);
        var w = $("set-warnings");
        while (w.firstChild) w.removeChild(w.firstChild);
        r.warnings.forEach(function (msg) { w.appendChild(el("div", { "class": "alert warn" }, msg)); });
      }

      function collectSettings() {
        var ticked = function (box) { return [].map.call(box.querySelectorAll("input:checked"), function (x) { return x.value; }); };
        var out = {
          REGION: $("set-REGION").value, MMDA: $("set-MMDA").value, ACADEMIC_YEAR: $("set-ACADEMIC_YEAR").value, TERM: $("set-TERM").value, REMINDER_MESSAGE: $("set-REMINDER_MESSAGE").value,
          MAINTENANCE_MODE: String($("set-MAINTENANCE_MODE").checked), MAINTENANCE_MESSAGE: $("set-MAINTENANCE_MESSAGE").value,
          COORDINATOR_PASSWORD_RESETS: String($("set-COORDINATOR_PASSWORD_RESETS").checked), ALLOWED_CIRCUITS: ticked($("set-waves")).join(","),
          REQUIRED_FIELDS: $("set-req-template").checked ? "" : ticked($("set-required")).join(",")
        };
        ["TEMP_PASSWORD_DAYS", "SESSION_IDLE_MINUTES", "SESSION_MAX_HOURS"].forEach(function (k) { out[k] = $("set-" + k).value; });
        return out;
      }

      /* ---- Audit log (audit.view): newest first, a page at a time. */
      function loadAudit(more) {
        if (!more) {
          S.subject = null;
          showView("audit");
          var ul = $("audit-list");
          while (ul.firstChild) ul.removeChild(ul.firstChild);
          S.auditBefore = "";
        }
        callServer_("getAuditLog", [S.token, $("audit-q").value, S.auditBefore], function (r) {
          if (!r || !r.ok) { fail(r); return; }
          var ul = $("audit-list");
          if (!r.rows.length && !more) ul.appendChild(el("li", { "class": "hint" }, "Nothing found."));
          r.rows.forEach(function (x) {
            var li = el("li");
            var when = new Date(x.at);
            li.appendChild(el("div", { "class": "head" }, ""));
            li.firstChild.appendChild(el("strong", {}, x.action));
            li.firstChild.appendChild(el("span", { "class": "meta" }, isNaN(when.getTime()) ? x.at : dayText(when, true)));
            li.appendChild(el("div", { "class": "meta" }, "By " + x.actor + " (" + x.role + ")" + (x.target ? " · " + x.target : "")));
            if (x.details && x.details !== '""') li.appendChild(el("div", { "class": "meta" }, x.details));
            ul.appendChild(li);
          });
          S.auditBefore = r.before;
          $("audit-more").classList.toggle("hidden", !r.more);
        }, fail);
      }
      $("tab-audit").addEventListener("click", function () { loadAudit(false); });
      $("audit-go").addEventListener("click", function () { loadAudit(false); });
      $("audit-more").addEventListener("click", function () { loadAudit(true); });
      $("tab-settings").addEventListener("click", loadSettings);
      $("set-req-template").addEventListener("change", function () {
        [].forEach.call($("set-required").querySelectorAll("input"), function (x) { x.disabled = $("set-req-template").checked; });
      });
      $("set-save").addEventListener("click", function () {
        [].forEach.call(document.querySelectorAll("#settings-view .err[id^=e-set-]"), function (x) { x.textContent = ""; });
        callServer_("saveSettings", [S.token, collectSettings()], function (r) {
          if (r && r.ok) { showAlert_($("alert"), "ok", "Settings saved."); loadSettings(); window.scrollTo(0, 0); return; }
          if (r && r.errors) Object.keys(r.errors).forEach(function (k) { if ($("e-set-" + k)) $("e-set-" + k).textContent = r.errors[k]; });
          showAlert_($("alert"), "error", (r && r.message) || "Could not save.");
          window.scrollTo(0, 0);
        }, fail);
      });
      $("tab-admins").addEventListener("click", loadAdmins);
      $("new-admin-save").addEventListener("click", function () {
        ["username", "displayName", "whatsapp", "email"].forEach(function (k) { $("e-new-" + k).textContent = ""; });
        var form = { username: $("new-username").value, displayName: $("new-displayName").value, whatsapp: $("new-whatsapp").value,
          email: $("new-email").value, permissions: ticked($("new-perms")) };
        callServer_("addSubAdmin", [S.token, form], function (r) {
          if (r && r.ok) {
            ["new-username", "new-displayName", "new-whatsapp", "new-email"].forEach(function (id) { $(id).value = ""; });
            loadAdmins();
            showTempPassword(form.displayName, r.username, r.temporaryPassword, r.whatsapp, "Your admin username is " + r.username + ".");
            return;
          }
          if (r && r.code === "INVALID" && r.errors) Object.keys(r.errors).forEach(function (k) { if ($("e-new-" + k)) $("e-new-" + k).textContent = r.errors[k]; });
          else fail(r);
        }, fail);
      });
      $("add-circuit").addEventListener("click", function () {
        callServer_("addCircuit", [S.token, $("new-circuit").value], function (r) {
          if (!r || !r.ok) { $("e-schools-add").textContent = (r && r.message) || "Could not add."; return; }
          $("new-circuit").value = "";
          showAlert_($("alert"), "ok", r.circuit + " circuit was added.");
          loadOverview();
        }, fail);
      });
      $("add-schools").addEventListener("click", function () {
        $("e-schools-add").textContent = "";
        callServer_("addSchools", [S.token, $("new-schools").value], function (r) {
          if (r && r.problems && r.problems.length) $("e-schools-add").textContent = r.problems.join(" · ");
          if (!r || !r.ok) { if (!(r && r.problems)) fail(r); return; }
          $("new-schools").value = "";
          showAlert_($("alert"), "ok", r.added.length + " school" + (r.added.length === 1 ? " was" : "s were") + " added.");
          loadOverview();
        }, fail);
      });

      $("tab-overview").addEventListener("click", loadOverview);
      $("back-overview").addEventListener("click", loadOverview);
      $("school-circuit-filter").addEventListener("change", renderDistrictSchools);
      $("school-sort").addEventListener("change", renderDistrictSchools);

      $("tab-school").addEventListener("click", function () { S.subject = null; loadSchool(); });
      $("tab-record").addEventListener("click", function () { openRecord(null); });
      $("editing-back").addEventListener("click", function () {
        S.subject = null;
        if (S.fromTeachers) { S.fromTeachers = false; showView("teachers"); return; } // the search results are still there
        loadSchool();
      });
      $("tab-record").textContent = "My record";
      $("only-incomplete").addEventListener("change", renderList);
      $("sort").addEventListener("change", renderList);
      $("group-msg").addEventListener("click", function () { copyText(groupMessage(), $("group-msg"), $("group-text")); });
      $("temp-copy").addEventListener("click", function () { copyText($("temp-key").textContent, $("temp-copy"), null); });
      $("temp-done").addEventListener("click", function () { $("temp-key").textContent = ""; $("temp-box").classList.add("hidden"); });

      if (S.token) {
        if (S.admin) {
          $("tabs").classList.remove("hidden");
          $("tab-overview").classList.remove("hidden");
          $("tab-teachers").classList.remove("hidden");
          ["tab-school", "tab-record"].forEach(function (id) { $(id).classList.add("hidden"); });
          loadOverview();
        } else if (S.circuitRole) {
          $("tabs").classList.remove("hidden");
          $("tab-circuit").classList.remove("hidden");
          $("tab-school").classList.add("hidden");
          loadCircuit();
        } else if (S.coordinator) { $("tabs").classList.remove("hidden"); loadSchool(); }
        else load();
      }
