var $ = function (id) { return document.getElementById(id); };
      var TABS = ["teacher", "coordinator", "admin"];
      var config = { maintenance: false, circuits: [], openCircuits: [] };

      function selectTab(name) {
        TABS.forEach(function (t) {
          $("tab-" + t).setAttribute("aria-selected", String(t === name));
          $("panel-" + t).classList.toggle("hidden", t !== name);
        });
        $("message").classList.add("hidden");
        if (config.maintenance && name !== "admin") showAlert_($("message"), "warn", "Only admins can sign in while the portal is being updated.");
      }

      function coordinatorKind() {
        return document.querySelector("input[name=c-kind]:checked").value;
      }

      function busy(form, on) {
        var btn = form.querySelector("button[type=submit]");
        btn.disabled = on;
        btn.textContent = on ? "Signing in…" : (form.id === "change" ? "Save my password" : "Sign in");
      }

      function onBusy(form) {
        return function () { form.querySelector("button[type=submit]").textContent = "The system is busy — retrying…"; };
      }

      function showKey(key, then) {
        ["signin", "recover", "accept", "change", "done"].forEach(function (id) { $(id).classList.add("hidden"); });
        $("keybox").classList.remove("hidden");
        $("key-text").textContent = key;
        $("key-done").onclick = function () { $("keybox").classList.add("hidden"); $("key-text").textContent = ""; then(); };
      }

      function afterSignIn(result, form, password) {
        busy(form, false);
        if (!result || !result.ok) {
          showAlert_($("message"), result && result.code === "NOT_OPEN_YET" ? "warn" : "error", (result && result.message) || "Sign-in failed.");
          return;
        }
        storeSet_("token", result.token);
        storeSet_("role", result.role);
        storeSet_("name", result.name || "");
        storeSet_("staffId", result.staffId || "");
        if (result.recoveryKey) {
          var key = result.recoveryKey;
          result.recoveryKey = "";
          showKey(key, function () { afterSignIn(result, form, password); });
          return;
        }
        if (result.mustChange) {
          $("signin").classList.add("hidden");
          $("change").classList.remove("hidden");
          $("n-current").value = password;
          $("n-new").focus();
          return;
        }
        showDone(result.name);
      }

      function showDone(name) {
        // Everyone goes on to the portal page: staff to their record, admins to the overview.
        if (storeGet_("role")) { goToPage_("record"); return; }
        $("signin").classList.add("hidden");
        $("change").classList.add("hidden");
        $("done").classList.remove("hidden");
        $("welcome").textContent = "Welcome" + (name ? ", " + name : "") + ". You are signed in.";
      }

      function submitSignIn(ev) {
        ev.preventDefault();
        var form = ev.currentTarget;
        var call, args, password;
        if (form.id === "panel-teacher") {
          password = $("t-pass").value;
          call = "teacherLogin"; args = [$("t-staff").value, password];
        } else if (form.id === "panel-admin") {
          password = $("a-pass").value;
          call = "adminLogin"; args = [$("a-user").value, password];
        } else if (coordinatorKind() === "circuit") {
          password = $("c-pass").value;
          call = "circuitCoordinatorLogin"; args = [$("c-circuit").value, $("c-staff").value, password];
        } else {
          password = $("c-pass").value;
          // No EMIS code: the portal knows each coordinator's school (SPEC § 6).
          call = "coordinatorLogin"; args = ["", $("c-staff").value, password];
        }
        if (args.slice(-2).some(function (a) { return !String(a).trim(); }) || (call === "circuitCoordinatorLogin" && !args[0])) {
          showAlert_($("message"), "error", "Please fill in every box.");
          return;
        }
        busy(form, true);
        var done = function (r) { afterSignIn(r, form, password); };
        var failed = function (e) { busy(form, false); showAlert_($("message"), "error", e.message); };
        // Each call is written out so the tests can check the server function exists.
        if (call === "teacherLogin") callServer_("teacherLogin", args, done, failed, onBusy(form));
        else if (call === "adminLogin") callServer_("adminLogin", args, done, failed, onBusy(form));
        else if (call === "circuitCoordinatorLogin") callServer_("circuitCoordinatorLogin", args, done, failed, onBusy(form));
        else callServer_("coordinatorLogin", args, done, failed, onBusy(form));
      }

      function submitChange(ev) {
        ev.preventDefault();
        var form = $("change");
        if ($("n-new").value !== $("n-again").value) {
          showAlert_($("change-message"), "error", "The two new passwords are not the same.");
          return;
        }
        busy(form, true);
        callServer_("changePassword", [storeGet_("token"), $("n-current").value, $("n-new").value], function (r) {
          busy(form, false);
          if (!r || !r.ok) { showAlert_($("change-message"), "error", (r && r.message) || "Could not save."); return; }
          storeSet_("token", r.token);
          showDone("");
        }, function (e) { busy(form, false); showAlert_($("change-message"), "error", e.message); }, onBusy(form));
      }

      function applyConfig(c) {
        if (!c || !c.ok) return;
        config = c;
        if (c.title) { $("title").textContent = c.title; document.title = c.title; }
        $("foot").textContent = [c.mmda, c.region].filter(Boolean).join(", ");
        if (c.maintenance) showAlert_($("maintenance"), "warn", c.maintenanceMessage || "The portal is being updated.");
        if (c.openCircuits.length) showAlert_($("waves"), "warn", "The portal is opening circuit by circuit. Open now: " + c.openCircuits.join(", ") + ".");
        var sel = $("c-circuit");
        var first = document.createElement("option");
        first.value = ""; first.textContent = "— choose your circuit —";
        sel.appendChild(first);
        c.circuits.forEach(function (name) {
          var o = document.createElement("option");
          o.value = name; o.textContent = name;
          sel.appendChild(o);
        });
        if (c.mode === "school") $("tab-coordinator").textContent = "ICT Coordinator";
        selectTab("teacher");
      }

      TABS.forEach(function (t) {
        $("tab-" + t).addEventListener("click", function () { selectTab(t); });
        $("panel-" + t).addEventListener("submit", submitSignIn);
      });
      document.querySelectorAll("input[name=c-kind]").forEach(function (r) {
        r.addEventListener("change", function () {
          var circuit = coordinatorKind() === "circuit";
          $("c-circuit-field").classList.toggle("hidden", !circuit);
        });
      });
      document.querySelectorAll(".show-pw").forEach(function (b) {
        b.addEventListener("click", function () {
          var input = $(b.getAttribute("aria-controls"));
          var show = input.type === "password";
          input.type = show ? "text" : "password";
          b.textContent = show ? "Hide" : "Show";
        });
      });
      $("change").addEventListener("submit", submitChange);
      $("forgot").addEventListener("click", function () { $("signin").classList.add("hidden"); $("recover").classList.remove("hidden"); $("r-user").value = $("a-user").value; });
      $("have-code").addEventListener("click", function () { $("signin").classList.add("hidden"); $("accept").classList.remove("hidden"); });
      $("accept-back").addEventListener("click", function () { $("accept").classList.add("hidden"); $("signin").classList.remove("hidden"); });
      $("accept").addEventListener("submit", function (ev) {
        ev.preventDefault();
        var form = $("accept");
        busy(form, true);
        callServer_("acceptHandover", [$("h-user").value, $("h-code").value, $("h-new").value, $("h-again").value], function (r) {
          busy(form, false);
          form.querySelector("button[type=submit]").textContent = "Become Main Admin";
          if (!r || !r.ok) { showAlert_($("accept-message"), "error", (r && r.message) || "Could not accept."); return; }
          ["h-code", "h-new", "h-again"].forEach(function (id) { $(id).value = ""; });
          showKey(r.recoveryKey, function () {
            $("signin").classList.remove("hidden");
            selectTab("admin");
            $("a-user").value = r.username;
            showAlert_($("message"), "ok", "You are now the Main Admin. Sign in with your new password.");
          });
        }, function (e) { busy(form, false); showAlert_($("accept-message"), "error", e.message); });
      });
      $("recover-back").addEventListener("click", function () { $("recover").classList.add("hidden"); $("signin").classList.remove("hidden"); });
      $("key-copy").addEventListener("click", function () {
        try { navigator.clipboard.writeText($("key-text").textContent); $("key-copy").textContent = "Copied"; } catch (e) { $("key-copy").textContent = "Select and copy it by hand"; }
      });
      $("recover").addEventListener("submit", function (ev) {
        ev.preventDefault();
        var form = $("recover");
        busy(form, true);
        callServer_("recoverAdminAccess", [$("r-user").value, $("r-key").value, $("r-new").value, $("r-again").value], function (r) {
          busy(form, false);
          form.querySelector("button[type=submit]").textContent = "Set my new password";
          if (!r || !r.ok) { showAlert_($("recover-message"), "error", (r && r.message) || "Could not reset."); return; }
          ["r-key", "r-new", "r-again"].forEach(function (id) { $(id).value = ""; });
          showKey(r.recoveryKey, function () {
            $("signin").classList.remove("hidden");
            selectTab("admin");
            showAlert_($("message"), "ok", "Your password is changed. Sign in with it now.");
          });
        }, function (e) { busy(form, false); showAlert_($("recover-message"), "error", e.message); });
      });
      $("signout").addEventListener("click", function () {
        callServer_("signOut", [storeGet_("token")], function () {}, function () {});
        storeSet_("token", null);
        storeSet_("role", null);
        window.location.reload();
      });
      callServer_("getPublicConfig", [], applyConfig, function () {});
