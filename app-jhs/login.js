// Sign-in screen, ported from gas/Login.html's page script. Same server calls and messages; the
// buttons are wired here instead of through inline onclick attributes.
(function () {
  var params = new URLSearchParams(window.location.search || "");
  var errParam = params.get("error");

  function byId(id) {
    return document.getElementById(id);
  }

  function switchTab(tab) {
    var isTeacher = tab === "teacher";
    byId("tabTeacher").classList.toggle("active", isTeacher);
    byId("tabTeacher").setAttribute("aria-selected", String(isTeacher));
    byId("tabAdmin").classList.toggle("active", !isTeacher);
    byId("tabAdmin").setAttribute("aria-selected", String(!isTeacher));
    byId("panelTeacher").classList.toggle("active", isTeacher);
    byId("panelAdmin").classList.toggle("active", !isTeacher);
    clearAlerts();
    byId(isTeacher ? "teacherStaffId" : "adminPassword").focus();
  }

  function showAlert(id, msg, type) {
    var box = byId(id);
    if (!box) return;
    box.className = "login-alert login-alert--" + (type || "error") + " visible";
    box.textContent = msg;
  }

  function clearAlerts() {
    ["teacherAlert", "adminAlert", "recoveryAlert"].forEach(function (id) {
      var box = byId(id);
      if (box) {
        box.className = "login-alert login-alert--error";
        box.textContent = "";
      }
    });
  }

  function setBtnLoading(btnId, loading) {
    var btn = byId(btnId);
    if (!btn) return;
    btn.classList.toggle("loading", loading);
    btn.disabled = loading;
  }

  function teacherLogin() {
    clearAlerts();
    var staffId = (byId("teacherStaffId").value || "").trim();
    var pin = (byId("teacherPin").value || "").trim();
    if (!staffId) {
      showAlert("teacherAlert", "Please enter your Staff ID.");
      return;
    }
    if (!pin) {
      showAlert("teacherAlert", "Please enter your PIN.");
      return;
    }
    setBtnLoading("btnTeacherLogin", true);
    callServer("teacherLogin", { staffId: staffId, pin: pin }).then(
      function (result) {
        setBtnLoading("btnTeacherLogin", false);
        if (!result || !result.success) {
          var msg = result && result.message ? result.message : "Login failed. Please try again.";
          var code = result && result.code;
          if (code === "LOCKED") showAlert("teacherAlert", "🔒 " + msg, "error");
          else if (code === "INACTIVE") showAlert("teacherAlert", "⛔ " + msg, "warn");
          else if (code === "PENDING") showAlert("teacherAlert", "ℹ️ " + msg, "info");
          else showAlert("teacherAlert", msg, "error");
          byId("teacherPin").value = "";
          return;
        }
        sessionSet("teacherToken", result.token || "");
        sessionSet("staffId", result.staffId || "");
        sessionSet("teacherAssignments", JSON.stringify(result.assignments || []));
        sessionSet("teacherSbaAssignments", JSON.stringify(result.sbaAssignments || []));
        sessionSet("teacherName", result.teacherName || "");
        goToScreen("teacher");
      },
      function (err) {
        setBtnLoading("btnTeacherLogin", false);
        showAlert("teacherAlert", serverErrorText(err, true), "error");
        console.error("teacherLogin failure:", err);
      },
    );
  }

  function adminLogin() {
    clearAlerts();
    var password = (byId("adminPassword").value || "").trim();
    if (!password) {
      showAlert("adminAlert", "Please enter the administrator password.", "error");
      return;
    }
    setBtnLoading("btnAdminLogin", true);
    callServer("adminLogin", { password: password }).then(
      function (result) {
        setBtnLoading("btnAdminLogin", false);
        if (!result || !result.success) {
          showAlert("adminAlert", result ? result.message : "Login failed.", "error");
          byId("adminPassword").value = "";
          return;
        }
        if (result.mustChangePassword) {
          showForcedChange(password, result.changeToken);
          return;
        }
        finishAdminLogin(result);
      },
      function (err) {
        setBtnLoading("btnAdminLogin", false);
        showAlert("adminAlert", serverErrorText(err, true), "error");
        console.error("adminLogin failure:", err);
      },
    );
  }

  function finishAdminLogin(result) {
    sessionSet("adminToken", result.token || "");
    if (result.firstLogin && result.recoveryKey) {
      showRecoveryKeyModal(result.recoveryKey, function () {
        goToScreen("admin");
      });
    } else {
      goToScreen("admin");
    }
  }

  // Held in memory only, for the one changeAdminPassword call that follows.
  var forcedChange = { current: "", token: "" };

  function showForcedChange(currentPassword, changeToken) {
    forcedChange = { current: currentPassword, token: changeToken || "" };
    var sec = byId("forcedChangeSection");
    sec.classList.add("visible");
    sec.setAttribute("aria-hidden", "false");
    showAlert(
      "forcedChangeAlert",
      "You signed in with a starting or temporary password. Choose your own password to continue.",
      "info",
    );
    byId("forcedNewPassword").focus();
  }

  function forcedPasswordChange() {
    var newPwd = byId("forcedNewPassword").value || "";
    var confPwd = byId("forcedConfirmPassword").value || "";
    if (newPwd.length < 8) {
      showAlert("forcedChangeAlert", "New password must be at least 8 characters.", "error");
      return;
    }
    if (newPwd !== confPwd) {
      showAlert("forcedChangeAlert", "Passwords do not match.", "error");
      return;
    }
    setBtnLoading("btnForcedChange", true);
    callServer(
      "changeAdminPassword",
      { currentPassword: forcedChange.current, newPassword: newPwd, confirmNewPassword: confPwd },
      forcedChange.token,
    ).then(
      function (result) {
        setBtnLoading("btnForcedChange", false);
        if (result && result.success && result.token) {
          forcedChange = { current: "", token: "" };
          finishAdminLogin(result);
          return;
        }
        if (result && result.code === "UNAUTHORIZED") {
          // The 15-minute change window ran out: start again from the password box.
          byId("forcedChangeSection").classList.remove("visible");
          byId("adminPassword").value = "";
          showAlert("adminAlert", "That took too long. Please sign in again.", "error");
          return;
        }
        showAlert(
          "forcedChangeAlert",
          result && result.message ? result.message : "Could not save the password.",
          "error",
        );
      },
      function (err) {
        setBtnLoading("btnForcedChange", false);
        showAlert("forcedChangeAlert", serverErrorText(err, true), "error");
        console.error("changeAdminPassword failure:", err);
      },
    );
  }

  function toggleRecovery(evt) {
    if (evt) evt.preventDefault();
    var sec = byId("recoverySection");
    var show = !sec.classList.contains("visible");
    sec.classList.toggle("visible", show);
    sec.setAttribute("aria-hidden", String(!show));
    if (show) byId("recoveryKey").focus();
  }

  function recoverAdmin() {
    clearAlerts();
    var key = (byId("recoveryKey").value || "").trim();
    var newPwd = byId("newPassword").value || "";
    var confPwd = byId("confirmPassword").value || "";
    if (!key) {
      showAlert("recoveryAlert", "Please enter your recovery key.", "error");
      return;
    }
    if (!newPwd) {
      showAlert("recoveryAlert", "Please enter a new password.", "error");
      return;
    }
    if (newPwd.length < 8) {
      showAlert("recoveryAlert", "New password must be at least 8 characters.", "error");
      return;
    }
    if (newPwd !== confPwd) {
      showAlert("recoveryAlert", "Passwords do not match.", "error");
      return;
    }
    setBtnLoading("btnRecover", true);
    callServer("recoverAdminAccess", {
      recoveryKey: key,
      newPassword: newPwd,
      confirmPassword: confPwd,
    }).then(
      function (result) {
        setBtnLoading("btnRecover", false);
        if (!result || !result.success) {
          showAlert(
            "recoveryAlert",
            result ? result.message : "Recovery failed. Please check your key.",
            "error",
          );
          return;
        }
        showRecoveryKeyModal(result.newRecoveryKey, function () {
          byId("recoverySection").classList.remove("visible");
          byId("recoveryKey").value = "";
          byId("newPassword").value = "";
          byId("confirmPassword").value = "";
          showAlert(
            "adminAlert",
            "✅ Password reset successfully. Please log in with your new password.",
            "info",
          );
        });
      },
      function (err) {
        setBtnLoading("btnRecover", false);
        showAlert("recoveryAlert", serverErrorText(err, false), "error");
        console.error("recoverAdminAccess failure:", err);
      },
    );
  }

  /* The old page's fixed wording, or the API's own message when it is more specific. */
  function serverErrorText(err, mentionConnection) {
    if (err && (err.code === "NOT_CONFIGURED" || err.code === "RATE_LIMITED" || err.code === "TIMEOUT")) {
      return err.message;
    }
    return mentionConnection
      ? "Server error. Please check your connection and try again."
      : "Server error. Please try again.";
  }

  function showRecoveryKeyModal(key, onDismiss) {
    var strong = function (text) {
      var s = el("strong", {}, [text]);
      s.style.color = "var(--text-primary)";
      return s;
    };
    var intro = el("p", {}, [
      "This is your ",
      strong("one-time recovery key"),
      ". Write it down and store it in a physically secure location. It will ",
      strong("never be shown again"),
      ".",
    ]);
    intro.style.cssText = "font-size:.9rem;color:var(--text-secondary);margin-bottom:12px;";
    var copyBtn = el("button", { className: "lc-btn", type: "button" }, [
      "📋 Click Here to Copy Recovery Key",
    ]);
    copyBtn.style.cssText =
      "margin-top:16px;width:100%;background:var(--accent);color:#ffffff;font-weight:600;box-shadow:none;";
    copyBtn.addEventListener("click", function () {
      copyTextToClipboard(
        String(key || ""),
        "Recovery key copied to clipboard.",
        "Could not copy automatically. Recovery key: ",
      );
    });
    var body = el("div", {}, [
      intro,
      el("div", { className: "rk-box", id: "rkDisplay" }, [String(key || "")]),
      el("div", { className: "rk-warn" }, [
        "⚠️ If you lose this key and forget your password you will be permanently locked out. " +
          "Store it somewhere safe — not on this computer.",
      ]),
      copyBtn,
    ]);
    showModal("🔑 Your Recovery Key", body, [
      {
        label: "I have saved it — Continue",
        cls: "btn--accent",
        action: function () {
          closeModal();
          if (onDismiss) onDismiss();
        },
      },
    ]);
  }

  function togglePwVisibility(inputId, btn) {
    var input = byId(inputId);
    if (!input) return;
    var show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.textContent = show ? "🙈" : "👁";
    btn.setAttribute("aria-label", show ? "Hide" : "Show");
  }

  var ACTIONS = {
    teacherLogin: teacherLogin,
    adminLogin: adminLogin,
    forcedPasswordChange: forcedPasswordChange,
    recoverAdmin: recoverAdmin,
    toggleRecovery: toggleRecovery,
  };

  document.querySelectorAll("[data-tab]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      switchTab(btn.dataset.tab);
    });
  });
  document.querySelectorAll("[data-action]").forEach(function (node) {
    node.addEventListener("click", function (evt) {
      ACTIONS[node.dataset.action](evt);
    });
  });
  document.querySelectorAll("[data-enter]").forEach(function (input) {
    input.addEventListener("keydown", function (evt) {
      if (evt.key === "Enter") ACTIONS[input.dataset.enter]();
    });
  });
  document.querySelectorAll("[data-toggle-pw]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      togglePwVisibility(btn.dataset.togglePw, btn);
    });
  });

  // Banner for a session an admin ended or suspended (same query values as the old portal).
  var banner = byId("suspendedBanner");
  if (errParam === "suspended") {
    banner.classList.add("visible");
    switchTab("teacher");
  } else if (errParam === "session_updated") {
    banner.textContent = "ℹ️ Your account was updated by an administrator — please log in again.";
    banner.classList.add("visible");
    switchTab("teacher");
  } else {
    byId("teacherStaffId").focus();
  }

  applyPublicBranding(["lcHeaderLogo"]);
})();
