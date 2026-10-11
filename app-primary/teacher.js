// Teacher dashboard, ported from gas/TeacherDashboard.html's page script (same functions, in the
// same order, so a change there is easy to find and mirror here). Server calls go through
// callServer() with named fields; independent calls start together because each takes ~3 s.

// ── Globals ──────────────────────────────────────────────────────────────────
var SESSION = {};
var TEACHER_DATA = {};
var FIELD_CONFIGS = [];
var ATT_CONFIG = {};
var ATT_STUDENTS = [];
var LEVY_STUDENTS = [];
var ATT_EXISTING = {};
var LEVY_EXISTING = {};
var LEVY_EXISTING_AMOUNTS = {};
var ATT_WEEKLY = {};
var CURRENT_ATT_DATE = "";
var CURRENT_LEVY_DATE = "";
var LEVY_AMOUNT = 0;
// True once getDailyLevyConfig succeeded (a rate of 0 is a valid, free config).
var LEVY_CONFIGURED = false;
// Location Identity feature: {location_code: rate} for the currently
// loaded class -- {} means no location overrides for this class, so
// every student just uses LEVY_AMOUNT.
var LEVY_LOCATION_RATES = {};
var ATT_SCHOOL_LEVEL = "";
var LEVY_SCHOOL_LEVEL = "";
var SBA_SCHOOL_LEVEL = "";
var SBA_STUDENTS = [];
var SBA_EXISTING = {};
var CURRENT_SBA_CLASS_LEVEL = "";
var CURRENT_SBA_SUBJECT_ID = "";
var CURRENT_SBA_SUBJECT_NAME = "";
var SBA_SUBJECTS_REFERENCE = [];
var SBA_SUBJECTS_REFERENCE_LOADED = false;
var SBA_ASSIGNED_CLASS_TYPES = [];

var BEHAVIOR_STUDENTS = [];
var BEHAVIOR_EXISTING = {};
var BEHAVIOR_CUMULATIVE_AVERAGES = {};
var BEHAVIOR_AGG_POSITION = { title: "", values: {} };
var BEHAVIOR_OPTIONS = {
  attitude: [],
  conduct: [],
  interest: [],
  teacher_remark: [],
};
var BEHAVIOR_OPTIONS_LOADED = false;
// The pending options request, so a student load started before it answers can wait for it.
var BEHAVIOR_OPTIONS_CALL = null;
var CURRENT_BEHAVIOR_CLASS = "";

// card-view controllers captured from renderSbaCardView()/renderBehaviorCardView()
// so the student-name search (below) can jump to a specific card on mobile / card-only tabs.
var SBA_CARD_CONTROLLER = null;
var BEHAVIOR_CARD_CONTROLLER = null;

// ── STUDENT NAME SEARCH ────────────────────────────────────────
// Mirrors AdminDashboard.html's teacher-name search pattern, but
// filters the currently loaded student roster for a tab and jumps
// to/highlights the matched row instead of filling a Staff ID
// field. Shared by SBA Marks and Behaviour Entries via
// prefix "sba"/"behavior" — single source, no duplication.

// Returns the currently loaded student roster array for a given tab prefix.
function _getStudentSearchRoster(prefix) {
  if (prefix === "sba") return SBA_STUDENTS;
  if (prefix === "behavior") return BEHAVIOR_STUDENTS;
  return [];
}

// Builds the student name-search input + suggestion list for a given tab prefix.
function _buildStudentNameSearch(prefix) {
  var input = el("input", {
    type: "text",
    className: "form-control search-box__input",
    id: prefix + "StudentNameSearch",
    placeholder: "Type a student name…",
    autocomplete: "off",
  });
  input.style.cssText = "padding-left:var(--space-4);padding-right:2rem;";
  input.addEventListener("input", function () {
    _filterStudentNameSuggestions(prefix);
  });
  input.addEventListener("focus", function () {
    _filterStudentNameSuggestions(prefix);
  });
  input.addEventListener("blur", function () {
    _hideStudentNameSuggestionsDelayed(prefix);
  });
  var clearBtn = el(
    "button",
    {
      type: "button",
      className: "teacher-search-clear",
      id: prefix + "StudentNameClear",
      title: "Clear search",
      attrs: { "aria-label": "Clear search" },
    },
    ["✕"],
  );
  clearBtn.addEventListener("mousedown", function () {
    _clearStudentNameSearch(prefix);
  });
  var box = el("div", {}, [
    input,
    clearBtn,
    el("div", { id: prefix + "StudentNameSuggestions", className: "teacher-suggest-list" }),
  ]);
  box.style.cssText = "position:relative;max-width:240px;";
  var group = el("div", { className: "form-group" }, [
    el("label", { className: "form-label" }, ["Search Student by Name"]),
    box,
  ]);
  group.style.marginBottom = "0";
  return group;
}

// Filters the currently loaded student roster by the typed name (client-side, no server call)
// and renders a suggestion list under the search box.
function _filterStudentNameSuggestions(prefix) {
  var input = document.getElementById(prefix + "StudentNameSearch");
  var list = document.getElementById(prefix + "StudentNameSuggestions");
  var clearBtn = document.getElementById(prefix + "StudentNameClear");
  if (!input || !list) return;
  if (clearBtn) clearBtn.style.display = input.value ? "flex" : "none";
  var query = input.value.trim().toLowerCase();
  if (!query) {
    list.textContent = "";
    list.style.display = "none";
    return;
  }

  var roster = _getStudentSearchRoster(prefix);
  var matches = roster
    .map(function (s, idx) {
      var fullName = [s.first_name, s.other_name, s.surname].filter(Boolean).join(" ");
      return { student: s, index: idx, fullName: fullName };
    })
    .filter(function (m) {
      return nameSearchKey(m.fullName).indexOf(nameSearchKey(query)) !== -1;
    })
    .slice(0, 8);

  list.textContent = "";
  if (matches.length === 0) {
    list.appendChild(
      el("div", { className: "teacher-suggest-item teacher-suggest-item--empty" }, [
        "No matching students",
      ]),
    );
    list.style.display = "block";
    return;
  }

  matches.forEach(function (m) {
    var displayId = m.student.student_non_usable_id || m.student.student_id || "";
    var item = el("div", { className: "teacher-suggest-item" }, [
      m.fullName + " ",
      el("span", { className: "text-muted text-xs" }, ["(" + displayId + ")"]),
    ]);
    // mousedown, not click: it fires before the search box's blur hides the list.
    item.addEventListener("mousedown", function () {
      _selectStudentNameSuggestion(prefix, m.student.student_id || "", m.index);
    });
    list.appendChild(item);
  });
  list.style.display = "block";
}

// Hides the suggestion list shortly after the search box loses focus — the delay lets the
// onmousedown handler on a suggestion item fire first (mousedown fires before blur completes).
function _hideStudentNameSuggestionsDelayed(prefix) {
  setTimeout(function () {
    var list = document.getElementById(prefix + "StudentNameSuggestions");
    if (list) list.style.display = "none";
  }, 150);
}

// Clears the student-name search box, its suggestion list, and hides the clear button —
// safe to call even if the search box doesn't exist yet in the DOM (each check is guarded).
function _clearStudentNameSearch(prefix) {
  var input = document.getElementById(prefix + "StudentNameSearch");
  var list = document.getElementById(prefix + "StudentNameSuggestions");
  var clearBtn = document.getElementById(prefix + "StudentNameClear");
  if (input) input.value = "";
  if (list) {
    list.textContent = "";
    list.style.display = "none";
  }
  if (clearBtn) clearBtn.style.display = "none";
}

// Handles a suggestion click — resets the search box/list, then jumps to the matched student.
function _selectStudentNameSuggestion(prefix, studentId, rosterIndex) {
  var nameInput = document.getElementById(prefix + "StudentNameSearch");
  var list = document.getElementById(prefix + "StudentNameSuggestions");
  var clearBtn = document.getElementById(prefix + "StudentNameClear");

  var roster = _getStudentSearchRoster(prefix);
  var student = roster[rosterIndex];
  if (nameInput) {
    nameInput.value = student
      ? [student.first_name, student.other_name, student.surname].filter(Boolean).join(" ")
      : "";
  }
  if (clearBtn) {
    clearBtn.style.display = nameInput && nameInput.value ? "flex" : "none";
  }
  if (list) {
    list.textContent = "";
    list.style.display = "none";
  }

  _jumpToStudentRow(prefix, studentId, rosterIndex);
}

// Scrolls to and briefly highlights a student's row (table view) or card (card view),
// whichever is the tab's currently active view.
function _jumpToStudentRow(prefix, studentId, rosterIndex) {
  var gridWrapperId = prefix === "sba" ? "sbaGridWrapper" : null;
  var gridWrapper = gridWrapperId ? document.getElementById(gridWrapperId) : null;

  // Table view — SBA (desktop, always table-only).
  if (gridWrapper && window.getComputedStyle(gridWrapper).display !== "none") {
    var row = gridWrapper.querySelector('[data-sid="' + studentId + '"]');
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      _flashHighlight(row);
      return;
    }
  }

  // Card view — SBA (mobile) and Behaviour Entries (always card-only).
  var controller =
    prefix === "sba"
      ? SBA_CARD_CONTROLLER
      : prefix === "behavior"
        ? BEHAVIOR_CARD_CONTROLLER
        : null;
  if (controller && typeof controller.goToIndex === "function") {
    controller.goToIndex(rosterIndex);
    var cardWrapperId = prefix === "sba" ? "sbaCardWrapper" : "behaviorCardWrapper";
    var cardWrapper = document.getElementById(cardWrapperId);
    if (cardWrapper) {
      cardWrapper.scrollIntoView({ behavior: "smooth", block: "center" });
      var card = cardWrapper.querySelector(".sba-card");
      if (card) _flashHighlight(card);
    }
  }
}

// Applies a brief highlight flash to an element to draw the eye after a search jump.
function _flashHighlight(el) {
  if (!el) return;
  el.style.transition = "background-color 0.3s ease";
  var original = el.style.backgroundColor;
  el.style.backgroundColor = "rgba(201, 162, 39, 0.35)";
  setTimeout(function () {
    el.style.backgroundColor = original || "";
  }, 1200);
}

// Starts a server call at once so independent calls overlap (each takes ~3 s); the reply is
// handled later with .then(), in the order the old page made its calls one after another.
function startCall_(action, payload) {
  var call = callServer(action, payload, SESSION.token);
  call.catch(function (err) {
    console.warn(action + " failed:", err);
  });
  return call;
}

// Reads the session, fills the top bar, then loads the profile and builds the tabs.
function startTeacherDashboard_() {
  applyPublicBranding(["topbarBrandIcon"], " — Teacher Dashboard", toDisplayCaseName);

  var stored = getTeacherSession();
  SESSION.token = stored.token;
  SESSION.staffId = stored.staffId;
  SESSION.teacherName = stored.teacherName;
  SESSION.assignments = stored.assignments;
  SESSION.sbaAssignments = stored.sbaAssignments;

  if (!SESSION.token || !SESSION.staffId) {
    redirectToLogin();
    return;
  }

  document.getElementById("btnLogout").addEventListener("click", doLogout);
  var initials = (SESSION.teacherName || "?")
    .split(" ")
    .filter(Boolean)
    .map(function (w) {
      return w[0];
    })
    .join("")
    .toUpperCase()
    .substring(0, 2);
  document.getElementById("avatarInitials").textContent = initials || "?";

  var urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("error") === "suspended") {
    showToast("Your account has been suspended. Contact the administrator.", "error");
  } else if (urlParams.get("error") === "session_updated") {
    showToast("Your account was updated by an administrator — please log in again.", "error");
  }

  document.addEventListener("change", function (e) {
    if (e.target && e.target.id === "attDate") {
      _validateAttDate(e.target.value);
      _updateAttWeekDisplay(e.target.value);
    }
    if (e.target && e.target.id === "levyDate") {
      _validateLevyDate(e.target.value);
      _updateLevyWeekDisplay(e.target.value);
    }
  });

  showSpinner();
  var initCall = startCall_("getTeacherDashboardInit", { staffId: SESSION.staffId });
  loadLevyLabelOverrides(SESSION.token, function () {
    initCall.then(
      function (initResult) {
        if (!initResult || !initResult.success) {
          if (_handleSessionCodes(initResult)) return;
          hideSpinner();
          showToast(
            (initResult && initResult.message) || "Could not load your profile. Please try again.",
            "error",
          );
          return;
        }

        TEACHER_DATA = initResult.teacherData || {};

        if (initResult.attendanceConfig && initResult.attendanceConfig.success) {
          ATT_CONFIG = initResult.attendanceConfig;
          _populateSharedContextRow();
        }

        FIELD_CONFIGS = Array.isArray(initResult.fieldConfigs) ? initResult.fieldConfigs : [];

        // Mock Exams Fee Collection — gating flag returned by getTeacherDashboardInit() in the
        // same init round trip, so buildTabs() can decide whether to show the "Mock Exams Fee" tab.
        MOCK_FEE_INFO = initResult.mockFeeInfo || {
          isAssigned: false,
          classLevel: "",
          academicYear: "",
        };

        // buildTabs() must run AFTER TEACHER_DATA is populated, or
        // is_form_teacher/form_teacher_class read off an empty {}.
        buildTabs();

        hideSpinner();
        populateProfileInfoCard();
        renderProfileTab();
        activateFirstTab();
      },
      function () {
        hideSpinner();
        showToast("Server error loading profile. Please refresh.", "error");
      },
    );
  });
}

// TAB BUILDING

// Builds the tab bar and panels for the dashboard.
function buildTabs() {
  var tabsEl = document.getElementById("teacherTabs");
  var panelsEl = document.getElementById("tabPanels");
  tabsEl.textContent = "";
  panelsEl.textContent = "";

  // Attendance & Behaviour Entries tabs are gated on the
  // roster's Is Form/Class Teacher? + Form Teacher Class fields —
  // these are the source of truth (kept in sync with the Attendance
  // duty assignment by Code.gs's assignTeacherToClass()/
  // revokeAssignment() via _syncFormTeacherFieldsForStaffId()).
  var isFormTeacherFlag =
    TEACHER_DATA.is_form_teacher === 1 ||
    TEACHER_DATA.is_form_teacher === "1" ||
    String(TEACHER_DATA.is_form_teacher).toLowerCase() === "yes";
  var hasFormTeacherClass = !!String(TEACHER_DATA.form_teacher_class || "").trim();
  var isFormTeacherWithClass = isFormTeacherFlag && hasFormTeacherClass;

  var hasAttendance =
    isFormTeacherWithClass &&
    SESSION.assignments.some(function (a) {
      return a.assignment_type === "Attendance";
    });
  var hasLevy = SESSION.assignments.some(function (a) {
    return a.assignment_type === "Daily_Levy";
  });
  var hasAdmissionFee = SESSION.assignments.some(function (a) {
    return a.assignment_type === "Admission_Fee";
  });
  var hasTuitionFee = SESSION.assignments.some(function (a) {
    return a.assignment_type === "Tuition_Fee";
  });
  // A teacher with only SBA class/subject assignments (no
  // Attendance/Levy duty) must not be wrongly shown "No Active
  // Class Assignment". Computed once, reused by the SBA tab's own
  // gating check below.
  var hasSbaAssignment = Array.isArray(SESSION.sbaAssignments) && SESSION.sbaAssignments.length > 0;
  var hasAny =
    hasAttendance ||
    hasLevy ||
    hasAdmissionFee ||
    hasTuitionFee ||
    hasSbaAssignment ||
    isFormTeacherWithClass;

  _addTab(tabsEl, panelsEl, "tab-profile", "👤 My Profile");
  _createPanel(panelsEl, "panel-profile");

  if (!hasAny) {
    var noAssignNotice = document.createElement("div");
    noAssignNotice.id = "noAssignmentNotice";
    noAssignNotice.className = "no-assignment-notice";
    setHtml(
      noAssignNotice,
      '<div class="no-assignment-notice__icon">📋</div>' +
        '<div class="no-assignment-notice__title">No Active Subject & Class Assignment</div>' +
        '<div class="no-assignment-notice__body">You have no active subject & class assignment. ' +
        "Contact the administrator if you believe this is an error.</div>",
    );
    document.getElementById("panel-profile").appendChild(noAssignNotice);
  }

  if (hasAttendance) {
    _addTab(tabsEl, panelsEl, "tab-attendance", "📅 Attendance");
    _createPanel(panelsEl, "panel-attendance");
    buildAttendanceTabContent();
  }

  if (hasLevy) {
    _addTab(tabsEl, panelsEl, "tab-levy", "💰 " + getLevyLabel("Daily Levy"));
    _createPanel(panelsEl, "panel-levy");
    buildLevyTabContent();
  }

  // Admission Fee / Tuition Fee collection tabs — gated purely by
  // SESSION.assignments (Teacher_Assignments), same as Daily_Levy above,
  // since Phase B reused that generic mechanism rather than a dedicated
  // table per fee type.
  if (hasAdmissionFee) {
    _addTab(tabsEl, panelsEl, "tab-admfee", "💰 " + getLevyLabel("Admission Fee"));
    _createPanel(panelsEl, "panel-admfee");
    buildTermlyFeeTabContent("Admission_Fee", "admfee");
  }

  if (hasTuitionFee) {
    _addTab(tabsEl, panelsEl, "tab-tuifee", "💰 " + getLevyLabel("Tuition Fee"));
    _createPanel(panelsEl, "panel-tuifee");
    buildTermlyFeeTabContent("Tuition_Fee", "tuifee");
  }

  // SBA Marks tab only renders if the Admin has assigned
  // this teacher at least one class level + subject in "Assign Subjects & Classes".
  // Access is determined SOLELY by Teacher_SBA_Assignments (SESSION.sbaAssignments),
  // never by is_form_teacher / form_teacher_class.
  // hasSbaAssignment is computed once above and reused for the
  // "No Active Class Assignment" notice too.
  if (hasSbaAssignment) {
    _addTab(tabsEl, panelsEl, "tab-sba", "📊 SBA Marks");
    _createPanel(panelsEl, "panel-sba");
    buildSbaTabContent();
  }

  // Behaviour Entries tab now only appears for a current
  // Form/Class Teacher (is_form_teacher='Yes' AND form_teacher_class
  // set) — mirrors the Attendance tab's gating rule above. Was
  // previously always shown, relying only on an internal disabled
  // state to signal "not a form teacher".
  if (isFormTeacherWithClass) {
    _addTab(tabsEl, panelsEl, "tab-behavior", "🧠 Behaviour Entries");
    _createPanel(panelsEl, "panel-behavior");
    buildBehaviorTabContent();
  }
}

// Adds a single tab button to the tab bar.
function _addTab(tabsEl, panelsEl, id, label) {
  var btn = document.createElement("button");
  btn.className = "tab";
  btn.id = id;
  btn.textContent = label;
  btn.setAttribute("data-panel", "panel-" + id.replace("tab-", ""));
  btn.onclick = function () {
    switchTab(id);
  };
  tabsEl.appendChild(btn);
}

// Creates a single tab's content panel element.
function _createPanel(panelsEl, id) {
  var div = document.createElement("div");
  div.id = id;
  div.className = "tab-content";
  panelsEl.appendChild(div);
  return div;
}

// Switches the active tab, showing its panel and hiding the others.
function switchTab(tabId) {
  document.querySelectorAll(".tab").forEach(function (t) {
    t.classList.remove("active");
  });
  document.querySelectorAll(".tab-content").forEach(function (p) {
    p.classList.remove("active");
  });
  var tab = document.getElementById(tabId);
  if (tab) tab.classList.add("active");
  var panelId = tab ? tab.getAttribute("data-panel") : null;
  if (panelId) {
    var panel = document.getElementById(panelId);
    if (panel) panel.classList.add("active");
  }
  if (tabId === "tab-attendance") onAttendanceTabActivated();
  if (tabId === "tab-levy") onLevyTabActivated();
  if (tabId === "tab-admfee") onTermlyFeeTabActivated("Admission_Fee", "admfee");
  if (tabId === "tab-tuifee") onTermlyFeeTabActivated("Tuition_Fee", "tuifee");
  if (tabId === "tab-sba") onSbaTabActivated();
  if (tabId === "tab-behavior") onBehaviorTabActivated();
}

// Activates the first available tab on initial load.
function activateFirstTab() {
  var firstTab = document.querySelector(".tab");
  if (firstTab) firstTab.click();
}

// PROFILE TAB

// Populates the profile info card with the teacher's session details.
function populateProfileInfoCard() {
  var d = TEACHER_DATA;
  var fullName = [d.first_name, d.middle_name, d.surname].filter(Boolean).join(" ");
  document.getElementById("profileFullName").textContent = fullName || SESSION.staffId;
  document.getElementById("profileMeta").textContent =
    "Staff ID: " +
    (d.staff_id || "—") +
    " | " +
    (d.assigned_class || "—") +
    " | " +
    (d.main_subject || "—");
  document.getElementById("profileLastLogin").textContent = d.last_login
    ? formatTimestamp(d.last_login)
    : "—";
  document.getElementById("profileLastSub").textContent = d.last_submission_date
    ? d.last_submission_date
    : "—";

  var badgesEl = document.getElementById("profileBadges");
  badgesEl.textContent = "";
  var status = d.account_status || "Active";
  var badge = document.createElement("span");
  badge.className = "profile-info-badge";
  badge.textContent = status;
  badgesEl.appendChild(badge);

  var initials = (fullName || "?")
    .split(" ")
    .filter(Boolean)
    .map(function (w) {
      return w[0];
    })
    .join("")
    .toUpperCase()
    .substring(0, 2);
  document.getElementById("avatarInitials").textContent = initials || "?";
}

// Builds the Behavior tab's content.
function buildBehaviorTabContent() {
  var panel = document.getElementById("panel-behavior");
  if (!panel) return;
  panel.textContent = "";

  var ctxRow = document.createElement("div");
  ctxRow.id = "behaviorCtxRow";
  ctxRow.style.cssText =
    "display:flex;gap:var(--space-5);align-items:center;flex-wrap:wrap;" +
    "font-size:var(--font-size-sm);font-weight:600;";
  // Academic Year / Term added alongside the Form/Class
  // Teacher Class label, per request — sourced from ATT_CONFIG
  // (already populated by init) in onBehaviorTabActivated() below.
  setHtml(
    ctxRow,
    '<span>Form/Class Teacher Class: <strong id="behaviorClassDisplay">—</strong></span>',
  );

  var loadBtn = document.createElement("button");
  loadBtn.id = "btnLoadBehavior";
  loadBtn.className = "btn btn--primary";
  loadBtn.textContent = "🔄 Load Students";
  loadBtn.onclick = loadBehaviorStudents;

  // the Attendance/Daily Levy/SBA tabs' centered selector rows.
  var behaviorHeaderRow = document.createElement("div");
  behaviorHeaderRow.className = "behavior-header-row";
  behaviorHeaderRow.appendChild(ctxRow);
  behaviorHeaderRow.appendChild(loadBtn);
  panel.appendChild(behaviorHeaderRow);

  // student name search — jumps to a loaded student's card.
  var behaviorSearchRow = document.createElement("div");
  behaviorSearchRow.style.cssText =
    "display:flex;justify-content:center;margin-bottom:var(--space-4);";
  behaviorSearchRow.appendChild(_buildStudentNameSearch("behavior"));
  panel.appendChild(behaviorSearchRow);

  var cardWrapper = document.createElement("div");
  cardWrapper.id = "behaviorCardWrapper";
  cardWrapper.style.marginTop = "var(--space-4)";
  panel.appendChild(cardWrapper);

  var saveRow = document.createElement("div");
  saveRow.className = "btn-row--center";
  var saveBtn = document.createElement("button");
  saveBtn.id = "btnSaveBehavior";
  saveBtn.className = "btn btn--accent btn--lg";
  saveBtn.textContent = "💾 Save Behaviour Entries";
  saveBtn.disabled = true;
  saveBtn.onclick = submitBehavior;
  saveRow.appendChild(saveBtn);
  panel.appendChild(saveRow);
}

// Runs setup when the Behavior tab is activated.
function onBehaviorTabActivated() {
  var classDisplay = document.getElementById("behaviorClassDisplay");
  var isFormTeacher =
    TEACHER_DATA.is_form_teacher === 1 ||
    TEACHER_DATA.is_form_teacher === "1" ||
    String(TEACHER_DATA.is_form_teacher).toLowerCase() === "yes";
  CURRENT_BEHAVIOR_CLASS = isFormTeacher ? String(TEACHER_DATA.form_teacher_class || "") : "";
  if (classDisplay) {
    classDisplay.textContent = CURRENT_BEHAVIOR_CLASS || "Not a Form/Class Teacher";
  }

  var loadBtn = document.getElementById("btnLoadBehavior");
  if (loadBtn) loadBtn.disabled = !CURRENT_BEHAVIOR_CLASS;

  if (!BEHAVIOR_OPTIONS_LOADED && !BEHAVIOR_OPTIONS_CALL) {
    BEHAVIOR_OPTIONS_CALL = callServer("getBehaviorOptionsReference", {}, SESSION.token).then(
      function (res) {
        if (res && res.success) BEHAVIOR_OPTIONS = res.options || BEHAVIOR_OPTIONS;
        BEHAVIOR_OPTIONS_LOADED = true;
      },
      function () {
        BEHAVIOR_OPTIONS_LOADED = true;
      },
    );
  }
}

// Loads students for the Behavior tab's grid. Its four reads start together; the cards wait for
// the dropdown options as well, which may still be on their way from the tab's activation.
function loadBehaviorStudents() {
  if (!CURRENT_BEHAVIOR_CLASS) {
    showToast("You are not currently set as a Form/Class Teacher.", "warning");
    return;
  }
  var classLevel = CURRENT_BEHAVIOR_CLASS;
  var academicYear = ATT_CONFIG.academicYear || "";
  var term = ATT_CONFIG.currentTerm || "";

  // clear any stale search from a previous load before fetching the new roster.
  _clearStudentNameSearch("behavior");

  showSpinner();
  var studentsCall = startCall_("getStudentsForClass", {
    classLevel: classLevel,
    academicYear: academicYear,
    term: term,
    assignmentType: "Behavior",
  });
  var existingCall = startCall_("getExistingBehaviorEntry", {
    classLevel: classLevel,
    academicYear: academicYear,
    term: term,
  });
  // Each student's Cumulative Average (Term 1-3), shown read-only on every card like the
  // desktop app's Terminal Report tab.
  var averagesCall = startCall_("getCumulativeAveragesForBehavior", {
    classLevel: classLevel,
    academicYear: academicYear,
  });
  var aggPosCall = startCall_("getCurrentTermAggPositionForBehavior", {
    classLevel: classLevel,
    academicYear: academicYear,
    term: term,
  });

  Promise.resolve(BEHAVIOR_OPTIONS_CALL)
    .then(function () {
      return studentsCall;
    })
    .then(
      function (stuResult) {
        if (!stuResult || !stuResult.success) {
          hideSpinner();
          if (_handleSessionCodes(stuResult)) return;
          showToast((stuResult && stuResult.message) || "Could not load students.", "error");
          return;
        }
        BEHAVIOR_STUDENTS = stuResult.students || [];
        if (BEHAVIOR_STUDENTS.length === 0) {
          hideSpinner();
          // card wrapper is the ONLY visible container for this tab (desktop + mobile).
          setHtml(
            document.getElementById("behaviorCardWrapper"),
            '<div class="empty-state"><div class="empty-state__icon">👥</div>' +
              '<div class="empty-state__title">No Students Found</div></div>',
          );
          document.getElementById("btnSaveBehavior").disabled = true;
          // no roster loaded — the search box has nothing to search.
          BEHAVIOR_CARD_CONTROLLER = null;
          _clearStudentNameSearch("behavior");
          return;
        }
        existingCall.then(
          function (existResult) {
            if (existResult && existResult.code === "UNAUTHORIZED") {
              hideSpinner();
              forcedLogout("session_updated");
              return;
            }
            BEHAVIOR_EXISTING = existResult && existResult.records ? existResult.records : {};

            averagesCall.then(
              function (avgResult) {
                BEHAVIOR_CUMULATIVE_AVERAGES =
                  avgResult && avgResult.success && avgResult.averages ? avgResult.averages : {};

                aggPosCall.then(
                  function (aggPosResult) {
                    hideSpinner();
                    BEHAVIOR_AGG_POSITION =
                      aggPosResult && aggPosResult.success
                        ? {
                            title: aggPosResult.title || "",
                            values: aggPosResult.values || {},
                          }
                        : { title: "", values: {} };
                    // capture the card-view controller so student search can jump to it.
                    BEHAVIOR_CARD_CONTROLLER = renderBehaviorCardView(
                      document.getElementById("behaviorCardWrapper"),
                      BEHAVIOR_STUDENTS,
                      BEHAVIOR_EXISTING,
                      BEHAVIOR_OPTIONS,
                      BEHAVIOR_CUMULATIVE_AVERAGES,
                      BEHAVIOR_AGG_POSITION,
                    );
                    document.getElementById("btnSaveBehavior").disabled = false;
                  },
                  function () {
                    hideSpinner();
                    BEHAVIOR_AGG_POSITION = { title: "", values: {} };
                    BEHAVIOR_CARD_CONTROLLER = renderBehaviorCardView(
                      document.getElementById("behaviorCardWrapper"),
                      BEHAVIOR_STUDENTS,
                      BEHAVIOR_EXISTING,
                      BEHAVIOR_OPTIONS,
                      BEHAVIOR_CUMULATIVE_AVERAGES,
                      { title: "", values: {} },
                    );
                    document.getElementById("btnSaveBehavior").disabled = false;
                  },
                );
              },
              function () {
                hideSpinner();
                BEHAVIOR_CUMULATIVE_AVERAGES = {};
                BEHAVIOR_AGG_POSITION = { title: "", values: {} };
                BEHAVIOR_CARD_CONTROLLER = renderBehaviorCardView(
                  document.getElementById("behaviorCardWrapper"),
                  BEHAVIOR_STUDENTS,
                  BEHAVIOR_EXISTING,
                  BEHAVIOR_OPTIONS,
                  {},
                  { title: "", values: {} },
                );
                document.getElementById("btnSaveBehavior").disabled = false;
              },
            );
          },
          function () {
            hideSpinner();
            BEHAVIOR_EXISTING = {};
            BEHAVIOR_CUMULATIVE_AVERAGES = {};
            BEHAVIOR_CARD_CONTROLLER = renderBehaviorCardView(
              document.getElementById("behaviorCardWrapper"),
              BEHAVIOR_STUDENTS,
              {},
              BEHAVIOR_OPTIONS,
              {},
            );
            document.getElementById("btnSaveBehavior").disabled = false;
          },
        );
      },
      function (err) {
        hideSpinner();
        showToast(friendlyErrorFrontend(err ? err.message : ""), "error");
      },
    );
}

// Submits the Behavior grid to the server.
function submitBehavior() {
  var academicYear = ATT_CONFIG.academicYear || "";
  var term = ATT_CONFIG.currentTerm || "";
  var saveBtn = document.getElementById("btnSaveBehavior");
  var cardWrapper = document.getElementById("behaviorCardWrapper");

  if (!CURRENT_BEHAVIOR_CLASS) {
    showToast("Please load students before saving.", "warning");
    return;
  }

  // the card view is now the ONLY container for this tab
  // (desktop + mobile) — no more grid-vs-card visibility check needed.
  var collected = collectBehaviorValues(cardWrapper, BEHAVIOR_STUDENTS);

  if (collected.incomplete.length > 0) {
    if (
      !confirm(
        "The following students have no entries:\n" +
          collected.incomplete.join(", ") +
          "\n\nDo you want to continue saving the rest?",
      )
    )
      return;
  }
  if (collected.records.length === 0) {
    showToast("No entries to save.", "warning");
    return;
  }

  var params = {
    classLevel: CURRENT_BEHAVIOR_CLASS,
    academicYear: academicYear,
    term: term,
    behaviorRecords: collected.records,
  };

  handleSaveWithRetry("saveBehaviorMarks", params, saveBtn, function () {
    BEHAVIOR_EXISTING = {};
    collected.records.forEach(function (r) {
      BEHAVIOR_EXISTING[r.student_id] = r;
    });
  });
}

// Renders the My Profile tab.
function renderProfileTab() {
  var container = document.getElementById("panel-profile");
  if (!container) return;

  var notice = container.querySelector("#noAssignmentNotice");
  container.textContent = "";
  if (notice) container.appendChild(notice);

  var infoBar = document.createElement("div");
  infoBar.style.cssText =
    "display:flex;gap:var(--space-4);flex-wrap:wrap;" +
    "margin-bottom:var(--space-5);font-size:var(--font-size-sm);";
  setHtml(
    infoBar,
    '<span class="badge badge--' +
      _statusClass(TEACHER_DATA.account_status) +
      '">' +
      sanitizeDisplayValue(TEACHER_DATA.account_status || "Active") +
      "</span>" +
      '<span class="text-muted">Last Updated: ' +
      sanitizeDisplayValue(
        TEACHER_DATA.last_login ? formatTimestamp(TEACHER_DATA.last_login) : "—",
      ) +
      "</span>",
  );
  container.appendChild(infoBar);

  // school_level is a system field, always "primary" in this build —
  // no user-facing picker. renderFormFields() skips a visible widget
  // for school_level; inject the hidden input here so
  // collectFormValues()/saveProfile() pick up the fixed value.
  var storedLevel = "primary";

  var form = document.createElement("div");
  form.id = "profileForm";
  container.appendChild(form);

  if (FIELD_CONFIGS.length === 0) {
    setHtml(form, '<p class="text-muted">Field configuration not available.</p>');
  } else {
    try {
      renderFormFields(form, FIELD_CONFIGS, TEACHER_DATA, true);

      _injectHiddenSchoolLevelInput(form, storedLevel);
      _applySchoolLevelRadio(form, storedLevel);
    } catch (renderErr) {
      console.error("renderProfileTab: field rendering failed:", renderErr);
      showToast(
        "Some profile fields could not be displayed. Contact the administrator if this persists.",
        "error",
      );
      try {
        _injectHiddenSchoolLevelInput(form, storedLevel);
      } catch (innerErr) {
        console.error("renderProfileTab: fallback school_level injection failed:", innerErr);
      }
    }
  }

  var errDiv = document.createElement("div");
  errDiv.id = "profileErrors";
  errDiv.style.display = "none";
  errDiv.className = "notice notice--error";
  errDiv.style.marginTop = "var(--space-4)";
  container.appendChild(errDiv);

  var btnRow = document.createElement("div");
  btnRow.className = "btn-row--center";
  var saveBtn = document.createElement("button");
  saveBtn.id = "btnSaveProfile";
  saveBtn.className = "btn btn--accent";
  saveBtn.textContent = "💾 Save Changes";
  saveBtn.onclick = saveProfile;
  btnRow.appendChild(saveBtn);
  container.appendChild(btnRow);
}

// Returns the CSS class for a given status value.
function _statusClass(status) {
  var s = String(status || "").toLowerCase();
  if (s === "active") return "active";
  if (s === "locked") return "locked";
  if (s === "inactive") return "inactive";
  return "pending";
}

// Saves the teacher's profile changes to the server.
function saveProfile() {
  var form = document.getElementById("profileForm");
  var errDiv = document.getElementById("profileErrors");
  var btn = document.getElementById("btnSaveProfile");

  errDiv.style.display = "none";
  errDiv.textContent = "";

  // first_name, surname and sex are required (NOT NULL on the desktop); only fields present and
  // enabled in the form are checked.
  var _profileReqErrors = [];
  var _fnEl = form.querySelector('[data-field="first_name"]');
  var _snEl = form.querySelector('[data-field="surname"]');
  var _sxEl = form.querySelector('[data-field="sex"]');
  if (_fnEl && !_fnEl.disabled) {
    if (!String(_fnEl.value || "").trim()) {
      _profileReqErrors.push("First Name is required.");
    }
  }
  if (_snEl && !_snEl.disabled) {
    if (!String(_snEl.value || "").trim()) {
      _profileReqErrors.push("Surname is required.");
    }
  }
  if (_sxEl && !_sxEl.disabled) {
    var _sxVal = String(_sxEl.value || "").trim();
    if (!_sxVal || (_sxVal !== "Male" && _sxVal !== "Female")) {
      _profileReqErrors.push("Sex is required — select Male or Female.");
    }
  }
  if (_profileReqErrors.length > 0) {
    setHtml(
      errDiv,
      "<strong>Please fix the following:</strong><ul>" +
        _profileReqErrors
          .map(function (e) {
            return "<li>" + sanitizeDisplayValue(e) + "</li>";
          })
          .join("") +
        "</ul>",
    );
    errDiv.style.display = "block";
    errDiv.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  var _formTcErr = _validateFormTeacherClassRequired(form);
  if (_formTcErr) {
    setHtml(
      errDiv,
      "<strong>Please fix the following:</strong><ul><li>" +
        sanitizeDisplayValue(_formTcErr) +
        "</li></ul>",
    );
    errDiv.style.display = "block";
    errDiv.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  var result = validateFormValues(
    form,
    FIELD_CONFIGS.filter(function (f) {
      return f.editableByTeacher;
    }),
  );

  if (!result.valid) {
    setHtml(
      errDiv,
      "<strong>Please fix the following:</strong><ul>" +
        result.errors
          .map(function (e) {
            return "<li>" + sanitizeDisplayValue(e) + "</li>";
          })
          .join("") +
        "</ul>",
    );
    errDiv.style.display = "block";
    errDiv.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (result.warnings.length > 0) {
    if (!confirm("Warnings:\n" + result.warnings.join("\n") + "\n\nContinue saving?")) {
      return;
    }
  }

  var updatedFields = {};
  form.querySelectorAll("[data-field][data-original]").forEach(function (el) {
    if (el.disabled) return;
    var key = el.getAttribute("data-field");
    var original = el.getAttribute("data-original");
    var current = el.value !== undefined ? el.value : "";
    if (current !== original) {
      updatedFields[key] = current;
    }
  });

  if (Object.keys(updatedFields).length === 0) {
    showToast("No changes detected.", "info");
    return;
  }

  btn.disabled = true;
  btn.textContent = "⏳ Saving…";

  callServer(
    "updateTeacherData",
    { staffId: SESSION.staffId, updatedFields: updatedFields },
    SESSION.token,
  ).then(
    function (res) {
      btn.disabled = false;
      btn.textContent = "💾 Save Changes";
      if (!res || !res.success) {
        if (res && res.code === "INACTIVE") {
          forcedLogout();
          return;
        }
        if (res && res.code === "UNAUTHORIZED") {
          forcedLogout();
          return;
        }
        showToast(
          (res && res.message) || "Could not save your profile. Please try again.",
          "error",
        );
        return;
      }
      showToast("Profile updated successfully!", "success");
      form.querySelectorAll("[data-field]").forEach(function (el) {
        el.setAttribute("data-original", el.value || "");
      });
      Object.keys(updatedFields).forEach(function (k) {
        TEACHER_DATA[k] = updatedFields[k];
      });
      populateProfileInfoCard();
    },
    function (err) {
      btn.disabled = false;
      btn.textContent = "💾 Save Changes";
      showToast(friendlyErrorFrontend(err ? err.message : ""), "error");
    },
  );
}

// ATTENDANCE TAB — CONTENT STRUCTURE

// Builds the Attendance tab's content.
function buildAttendanceTabContent() {
  var panel = document.getElementById("panel-attendance");
  if (!panel) return;
  panel.textContent = "";

  var selectorRow = document.createElement("div");
  selectorRow.className = "duty-selector-row attendance-selector-row";

  var typeGroup = document.createElement("div");
  typeGroup.className = "form-group";
  typeGroup.style.marginBottom = "0";
  setHtml(
    typeGroup,
    '<label class="form-label" for="attClassType">Class Type</label>' +
      '<select id="attClassType" class="form-control">' +
      '<option value="Normal">Normal</option>' +
      '<option value="A">A</option>' +
      '<option value="B">B</option>' +
      '<option value="C">C</option>' +
      '<option value="D">D</option>' +
      "</select>",
  );
  selectorRow.appendChild(typeGroup);

  var clGroup = document.createElement("div");
  clGroup.className = "form-group";
  clGroup.style.marginBottom = "0";
  setHtml(
    clGroup,
    '<label class="form-label" for="attClassLevel">Class Level</label>' +
      '<select id="attClassLevel" class="form-control"></select>',
  );
  selectorRow.appendChild(clGroup);

  var dateGroup = document.createElement("div");
  dateGroup.className = "form-group";
  dateGroup.style.marginBottom = "0";
  setHtml(
    dateGroup,
    '<label class="form-label" for="attDate">Attendance Date</label>' +
      '<input type="date" id="attDate" class="form-control">',
  );
  selectorRow.appendChild(dateGroup);

  var loadBtn = document.createElement("button");
  loadBtn.id = "btnLoadAttendance";
  loadBtn.className = "btn btn--primary";
  loadBtn.style.alignSelf = "flex-end";
  loadBtn.textContent = "🔄 Load Students";
  loadBtn.onclick = loadAttendanceStudents;
  selectorRow.appendChild(loadBtn);

  panel.appendChild(selectorRow);

  var dateWarn = document.createElement("div");
  dateWarn.id = "attDateWarning";
  dateWarn.className = "notice notice--error";
  dateWarn.style.display = "none";
  panel.appendChild(dateWarn);

  var progressBar = document.createElement("div");
  progressBar.className = "progress-indicator";
  progressBar.style.display = "none";
  progressBar.id = "attProgressWrapper";
  setHtml(
    progressBar,
    '<div class="progress-bar-track"><div class="progress-bar-fill" id="attProgressFill"></div></div>' +
      '<div class="progress-indicator__text" id="attProgress">Marked 0 of 0 students</div>',
  );
  panel.appendChild(progressBar);

  var summary = document.createElement("div");
  summary.id = "attSummary";
  summary.className = "summary-panel";
  summary.style.display = "none";
  setHtml(
    summary,
    '<div class="summary-cell summary-cell--present">' +
      '<div class="summary-cell__label">Boys Present</div>' +
      '<div class="summary-cell__value" id="sumBoysPresent">0</div></div>' +
      '<div class="summary-cell">' +
      '<div class="summary-cell__label">Boys Absent</div>' +
      '<div class="summary-cell__value" id="sumBoysAbsent">0</div></div>' +
      '<div class="summary-cell summary-cell--present">' +
      '<div class="summary-cell__label">Girls Present</div>' +
      '<div class="summary-cell__value" id="sumGirlsPresent">0</div></div>' +
      '<div class="summary-cell">' +
      '<div class="summary-cell__label">Girls Absent</div>' +
      '<div class="summary-cell__value" id="sumGirlsAbsent">0</div></div>' +
      '<div class="summary-cell summary-cell--total">' +
      '<div class="summary-cell__label">Total Present</div>' +
      '<div class="summary-cell__value" id="sumTotalPresent">0</div></div>' +
      '<div class="summary-cell summary-cell--absent">' +
      '<div class="summary-cell__label">Total Absent</div>' +
      '<div class="summary-cell__value" id="sumTotalAbsent">0</div></div>',
  );
  panel.appendChild(summary);

  var gridWrapper = document.createElement("div");
  gridWrapper.id = "attGridWrapper";
  gridWrapper.style.cssText = "margin-top:var(--space-4);overflow-x:auto;";
  panel.appendChild(gridWrapper);

  var saveRow = document.createElement("div");
  saveRow.className = "btn-row--center";
  var saveBtn = document.createElement("button");
  saveBtn.id = "btnSaveAttendance";
  saveBtn.className = "btn btn--accent btn--lg";
  saveBtn.textContent = "💾 Save Attendance";
  saveBtn.disabled = true;
  saveBtn.onclick = submitAttendance;
  saveRow.appendChild(saveBtn);
  panel.appendChild(saveRow);

  document.getElementById("attClassType").addEventListener("change", rebuildAttClassLevelDropdown);
}

// ATTENDANCE — PRE-SELECT BASED ON ASSIGNMENT

// Runs setup when the Attendance tab is activated.
function onAttendanceTabActivated() {
  if (!ATT_CONFIG.academicYear) {
    showSpinner();

    callServer("getAttendanceConfig", {}, SESSION.token).then(
      function (cfg) {
        hideSpinner();
        if (!cfg || !cfg.success) {
          if (_handleSessionCodes(cfg)) return;
          showToast("Could not load attendance configuration.", "error");
          return;
        }
        ATT_CONFIG = cfg;
        _populateSharedContextRow();
        preSelectAttendanceClass();
        var today = _latestSchoolDayISO();
        document.getElementById("attDate").value = today;
        _validateAttDate(today);
        _updateAttWeekDisplay(today);
      },
      function () {
        hideSpinner();
        showToast("Server error loading attendance config.", "error");
      },
    );
  } else {
    preSelectAttendanceClass();
    var _existingDate = document.getElementById("attDate")
      ? document.getElementById("attDate").value
      : "";
    if (_existingDate) _updateAttWeekDisplay(_existingDate);
  }
}

// Pre-selects the teacher's assigned class in the Attendance tab, if only one exists.
function preSelectAttendanceClass() {
  var attAssign = SESSION.assignments.find(function (a) {
    return a.assignment_type === "Attendance";
  });
  if (!attAssign) return;

  var assignedClass = attAssign.class_level || "";
  ATT_SCHOOL_LEVEL = "Primary";

  var classType = "Normal";
  if (/[ABCDE]$/.test(assignedClass)) {
    classType = assignedClass.slice(-1);
  }
  var classTypeEl = document.getElementById("attClassType");
  if (classTypeEl) classTypeEl.value = classType;

  rebuildAttClassLevelDropdown();

  var clEl = document.getElementById("attClassLevel");
  if (clEl) {
    for (var i = 0; i < clEl.options.length; i++) {
      if (clEl.options[i].value === assignedClass) {
        clEl.selectedIndex = i;
        break;
      }
    }
  }

  if (classTypeEl) classTypeEl.disabled = true;
  if (clEl) clEl.disabled = true;
}

// Rebuilds the Attendance tab's Class Level dropdown.
function rebuildAttClassLevelDropdown() {
  var schoolLevel = ATT_SCHOOL_LEVEL || "Primary";

  var classTypeEl = document.getElementById("attClassType");
  var classType = classTypeEl ? classTypeEl.value : "Normal";

  var levels = getEffectiveClassLevels(schoolLevel, classType);
  var clEl = document.getElementById("attClassLevel");
  if (!clEl) return;
  clEl.textContent = "";
  levels.forEach(function (lvl) {
    var opt = document.createElement("option");
    opt.value = lvl;
    opt.textContent = lvl;
    clEl.appendChild(opt);
  });
}
// ATTENDANCE — WEEK NUMBER DISPLAY

// Computes and displays the term week number for a date into a target element.
function _updateWeekDisplay(dateStr, weekElId) {
  if (!dateStr || !ATT_CONFIG.termStartDate) {
    var weekElBlank = document.getElementById(weekElId);
    if (weekElBlank) weekElBlank.textContent = "—";
    return null;
  }
  // pass ATT_CONFIG.vacationDate (already returned by
  // getAttendanceConfig()) as the new 4th arg so the displayed week
  // number freezes after vacation instead of continuing to climb.
  var weekNum = calculateWeekNumber(
    dateStr,
    ATT_CONFIG.termStartDate || "",
    [],
    ATT_CONFIG.vacationDate || "",
  );
  var weekEl = document.getElementById(weekElId);
  if (weekEl) weekEl.textContent = weekNum || "—";
  return weekNum;
}

// Attendance tab wrapper around _updateWeekDisplay().
function _updateAttWeekDisplay(dateStr) {
  return _updateWeekDisplay(dateStr, "attWeekNum");
}

// Daily Levy tab wrapper around _updateWeekDisplay().
function _updateLevyWeekDisplay(dateStr) {
  return _updateWeekDisplay(dateStr, "levyWeekNum");
}

// Populates the shared Academic Year/Term/Week header shown above the tab bar.
function _populateSharedContextRow() {
  var yrEl = document.getElementById("sharedAcademicYear");
  var tmEl = document.getElementById("sharedTerm");
  var wkEl = document.getElementById("sharedWeekNum");
  if (yrEl) yrEl.textContent = ATT_CONFIG.academicYear || "—";
  if (tmEl) tmEl.textContent = ATT_CONFIG.currentTerm || "—";
  if (wkEl) {
    if (ATT_CONFIG.termStartDate) {
      // same vacationDate clamp as _updateWeekDisplay().
      var wk = calculateWeekNumber(
        _todayISO(),
        ATT_CONFIG.termStartDate,
        [],
        ATT_CONFIG.vacationDate || "",
      );
      wkEl.textContent = wk || "—";
    } else {
      wkEl.textContent = "—";
    }
  }
}

// Clears a stale students grid and its cached state when the date selection becomes invalid.
function _clearAttendanceGridState() {
  ATT_STUDENTS = [];
  ATT_EXISTING = {};
  ATT_WEEKLY = {};
  CURRENT_ATT_DATE = "";
  var gridWrapper = document.getElementById("attGridWrapper");
  if (gridWrapper) gridWrapper.textContent = "";
  var progressWrapper = document.getElementById("attProgressWrapper");
  if (progressWrapper) progressWrapper.style.display = "none";
  var summary = document.getElementById("attSummary");
  if (summary) summary.style.display = "none";
  var saveBtn = document.getElementById("btnSaveAttendance");
  if (saveBtn) saveBtn.disabled = true;
}

// Clears a stale Daily Levy grid and its cached state.
function _clearLevyGridState() {
  LEVY_STUDENTS = [];
  LEVY_EXISTING = {};
  CURRENT_LEVY_DATE = "";
  var gridWrapper = document.getElementById("levyGridWrapper");
  if (gridWrapper) gridWrapper.textContent = "";
  var progressWrapper = document.getElementById("levyProgressWrapper");
  if (progressWrapper) progressWrapper.style.display = "none";
  var summary = document.getElementById("levySummary");
  if (summary) summary.style.display = "none";
  var saveBtn = document.getElementById("btnSaveLevy");
  if (saveBtn) saveBtn.disabled = true;
}

// Validates the selected Attendance date (not weekend/holiday/future).
function _validateAttDate(dateStr) {
  var warnEl = document.getElementById("attDateWarning");
  var loadBtn = document.getElementById("btnLoadAttendance");
  if (!warnEl) return;
  var msg = _getDateError(dateStr, ATT_CONFIG.holidayDates || []);
  if (msg) {
    warnEl.textContent = msg;
    warnEl.style.display = "block";
    if (loadBtn) loadBtn.disabled = true;
    if (ATT_STUDENTS.length > 0) {
      _clearAttendanceGridState();
    }
  } else {
    warnEl.style.display = "none";
    if (loadBtn) loadBtn.disabled = false;
  }
}

// Validates the selected Daily Levy date (not weekend/holiday/future).
function _validateLevyDate(dateStr) {
  var warnEl = document.getElementById("levyDateWarning");
  var loadBtn = document.getElementById("btnLoadLevy");
  if (!warnEl) return;
  var msg = _getDateError(dateStr, ATT_CONFIG.holidayDates || []);
  if (msg) {
    warnEl.textContent = msg;
    warnEl.style.display = "block";
    if (loadBtn) loadBtn.disabled = true;
    if (LEVY_STUDENTS.length > 0) {
      _clearLevyGridState();
    }
  } else {
    warnEl.style.display = "none";
    if (loadBtn) loadBtn.disabled = false;
  }
}

// Today when it is a school day, otherwise the most recent school day in the term
// (skips weekends and holidays); today if none is found within a month.
function _latestSchoolDayISO() {
  var d = new Date();
  for (var i = 0; i < 31; i++) {
    var iso =
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0");
    if (!_getDateError(iso, ATT_CONFIG.holidayDates || [])) return iso;
    d.setDate(d.getDate() - 1);
  }
  return _todayISO();
}

// Returns an error message for an invalid date, or null if valid.
function _getDateError(dateStr, holidayDates) {
  if (!dateStr) return "Please select a date.";
  if (isFutureDate(dateStr))
    return "Future dates are not allowed. Please select today or a past school day.";
  if (isWeekend(dateStr)) return "Weekends are not allowed. Please select a weekday.";
  if ((holidayDates || []).indexOf(dateStr) !== -1) {
    return "The selected date is a public holiday. Attendance cannot be recorded on holidays.";
  }
  // Block entry outside the configured term window. Reads the
  // global ATT_CONFIG directly rather than adding new parameters,
  // so every call site gets this enforcement automatically.
  if (ATT_CONFIG.termStartDate && dateStr < ATT_CONFIG.termStartDate) {
    return (
      "This date is before the start of the current term (" +
      formatDateForDisplay(ATT_CONFIG.termStartDate) +
      "). Please select a date within the current term."
    );
  }
  if (ATT_CONFIG.vacationDate && dateStr > ATT_CONFIG.vacationDate) {
    return (
      "This date is after the term's vacation date (" +
      formatDateForDisplay(ATT_CONFIG.vacationDate) +
      "). Please select a date within the current term."
    );
  }
  return "";
}

// _todayISO() moved to JavaScript.html (shared SECTION 12) so AdminDashboard.html's All Teachers Week Number label can reuse it too, instead of duplicating this helper here (DRY). All existing call sites below (onAttendanceTabActivated, _initLevyTab, the attDate/levyDate change listener) are unaffected — _todayISO() remains a global function. ATTENDANCE — LOAD STUDENTS

// Loads students into the Attendance grid for the selected class and date.
function loadAttendanceStudents() {
  var classLevel = document.getElementById("attClassLevel").value;
  var dateStr = document.getElementById("attDate").value;
  var academicYear = ATT_CONFIG.academicYear || "";
  var term = ATT_CONFIG.currentTerm || "";

  if (!classLevel) {
    showToast("Please select a class level.", "warning");
    return;
  }
  if (!dateStr) {
    showToast("Please select a date.", "warning");
    return;
  }

  var errMsg = _getDateError(dateStr, ATT_CONFIG.holidayDates || []);
  if (errMsg) {
    showToast(errMsg, "warning");
    return;
  }

  CURRENT_ATT_DATE = dateStr;

  var weekNum = _updateAttWeekDisplay(dateStr);

  var expectedDays = weekNum
    ? getExpectedSchoolDaysInWeek(
        weekNum,
        ATT_CONFIG.termStartDate || "",
        ATT_CONFIG.holidayDates || [],
      )
    : 5;

  showSpinner();

  var studentsCall = startCall_("getStudentsForClass", {
    classLevel: classLevel,
    academicYear: academicYear,
    term: term,
    assignmentType: "Attendance",
  });
  var existingCall = startCall_("getExistingAttendance", {
    classLevel: classLevel,
    academicYear: academicYear,
    term: term,
    attendanceDate: dateStr,
  });
  var weeklyCall = startCall_("getWeeklyAttendanceSummary", {
    classLevel: classLevel,
    academicYear: academicYear,
    term: term,
    attendanceDate: dateStr,
  });

  studentsCall.then(
    function (stuResult) {
      if (!stuResult || !stuResult.success) {
        if (_handleSessionCodes(stuResult)) return;
        hideSpinner();
        showToast(
          (stuResult && stuResult.message) || "Could not load students. Please try again.",
          "error",
        );
        return;
      }
      ATT_STUDENTS = stuResult.students || [];

      if (ATT_STUDENTS.length === 0) {
        hideSpinner();
        setHtml(
          document.getElementById("attGridWrapper"),
          '<div class="empty-state">' +
            '<div class="empty-state__icon">👥</div>' +
            '<div class="empty-state__title">No Students Found</div>' +
            '<div class="empty-state__body">' +
            sanitizeDisplayValue(stuResult.message || "") +
            "</div>" +
            "</div>",
        );
        document.getElementById("attProgressWrapper").style.display = "none";
        document.getElementById("attSummary").style.display = "none";
        return;
      }

      existingCall.then(
        function (existResult) {
          if (existResult && existResult.code === "UNAUTHORIZED") {
            hideSpinner();
            forcedLogout("session_updated");
            return;
          }
          ATT_EXISTING = existResult && existResult.records ? existResult.records : {};

          weeklyCall.then(
            function (weekResult) {
              hideSpinner();
              if (weekResult && weekResult.code === "UNAUTHORIZED") {
                forcedLogout("session_updated");
                return;
              }
              ATT_WEEKLY = weekResult && weekResult.summary ? weekResult.summary : {};
              renderAttendanceGrid(
                document.getElementById("attGridWrapper"),
                ATT_STUDENTS,
                ATT_EXISTING,
                ATT_WEEKLY,
                expectedDays,
                true,
              );
              document.getElementById("attProgressWrapper").style.display = "flex";
              document.getElementById("attSummary").style.display = "grid";
              updateProgressIndicator(
                document.getElementById("attGridWrapper"),
                ATT_STUDENTS.length,
                document.getElementById("attProgress"),
                document.getElementById("btnSaveAttendance"),
              );
              updateAttendanceSummary(
                document.getElementById("attSummary"),
                document.getElementById("attGridWrapper"),
                ATT_STUDENTS,
              );
            },
            function () {
              hideSpinner();
              ATT_WEEKLY = {};
              renderAttendanceGrid(
                document.getElementById("attGridWrapper"),
                ATT_STUDENTS,
                ATT_EXISTING,
                {},
                expectedDays,
                true,
              );
              document.getElementById("attProgressWrapper").style.display = "flex";
              document.getElementById("attSummary").style.display = "grid";
              updateProgressIndicator(
                document.getElementById("attGridWrapper"),
                ATT_STUDENTS.length,
                document.getElementById("attProgress"),
                document.getElementById("btnSaveAttendance"),
              );
            },
          );
        },
        function () {
          ATT_EXISTING = {};
          hideSpinner();
          renderAttendanceGrid(
            document.getElementById("attGridWrapper"),
            ATT_STUDENTS,
            {},
            {},
            expectedDays,
            true,
          );
          document.getElementById("attProgressWrapper").style.display = "flex";
          document.getElementById("attSummary").style.display = "grid";
        },
      );
    },
    function (err) {
      hideSpinner();
      showToast(friendlyErrorFrontend(err ? err.message : ""), "error");
    },
  );
}

// ATTENDANCE — SUBMIT

// Submits the Attendance grid to the server.
function submitAttendance() {
  var classLevel = document.getElementById("attClassLevel").value;
  var dateStr =
    CURRENT_ATT_DATE ||
    (document.getElementById("attDate") ? document.getElementById("attDate").value : "");
  var academicYear = ATT_CONFIG.academicYear || "";
  var term = ATT_CONFIG.currentTerm || "";
  var saveBtn = document.getElementById("btnSaveAttendance");
  var gridWrapper = document.getElementById("attGridWrapper");

  if (!classLevel || !dateStr) {
    showToast("Please load students before saving.", "warning");
    return;
  }

  // re-validate the date against the term window at save
  // time too — not just at load time — in case config changed (e.g.
  // vacation date set) after students were already loaded.
  var _attDateErr = _getDateError(dateStr, ATT_CONFIG.holidayDates || []);
  if (_attDateErr) {
    showToast(_attDateErr, "error");
    return;
  }

  var collected = collectAttendanceValues(gridWrapper, ATT_STUDENTS);

  if (collected.incomplete.length > 0) {
    if (
      !confirm(
        "The following students have not been marked:\n" +
          collected.incomplete.join(", ") +
          "\n\nDo you want to submit a partial record?",
      )
    ) {
      return;
    }
  }

  var params = {
    classLevel: classLevel,
    academicYear: academicYear,
    term: term,
    attendanceDate: dateStr,
    attendanceRecords: collected.records,
    isOverride: false, // set to true by handleSaveWithRetry on duplicate confirm
  };

  handleSaveWithRetry("saveAttendance", params, saveBtn, function (res) {
    ATT_EXISTING = {};
    collected.records.forEach(function (r) {
      ATT_EXISTING[r.student_id] = r.status;
    });
    updateAttendanceSummary(document.getElementById("attSummary"), gridWrapper, ATT_STUDENTS);
  });
}

// DAILY LEVY TAB — CONTENT STRUCTURE

// Builds the Daily Levy tab's content.
function buildLevyTabContent() {
  var panel = document.getElementById("panel-levy");
  if (!panel) return;
  panel.textContent = "";

  var ctxRow = document.createElement("div");
  ctxRow.style.cssText =
    "display:flex;gap:var(--space-5);align-items:center;" +
    "flex-wrap:wrap;font-size:var(--font-size-sm);font-weight:600;";
  setHtml(ctxRow, '<span id="levyBadgeWrapper"></span>');
  panel.appendChild(ctxRow);

  var selectorRow = document.createElement("div");
  selectorRow.className = "duty-selector-row";

  var typeGroup = document.createElement("div");
  typeGroup.className = "form-group";
  typeGroup.style.marginBottom = "0";
  setHtml(
    typeGroup,
    '<label class="form-label" for="levyClassType">Class Type</label>' +
      '<select id="levyClassType" class="form-control">' +
      '<option value="Normal">Normal</option>' +
      '<option value="A">A</option>' +
      '<option value="B">B</option>' +
      '<option value="C">C</option>' +
      '<option value="D">D</option>' +
      "</select>",
  );
  selectorRow.appendChild(typeGroup);

  var clGroup = document.createElement("div");
  clGroup.className = "form-group";
  clGroup.style.marginBottom = "0";
  setHtml(
    clGroup,
    '<label class="form-label" for="levyClassLevel">Class Level</label>' +
      '<select id="levyClassLevel" class="form-control"></select>',
  );
  selectorRow.appendChild(clGroup);

  var dateGroup = document.createElement("div");
  dateGroup.className = "form-group";
  dateGroup.style.marginBottom = "0";
  setHtml(
    dateGroup,
    '<label class="form-label" for="levyDate">Date</label>' +
      '<input type="date" id="levyDate" class="form-control">',
  );
  selectorRow.appendChild(dateGroup);

  var loadBtn = document.createElement("button");
  loadBtn.id = "btnLoadLevy";
  loadBtn.className = "btn btn--primary";
  loadBtn.style.alignSelf = "flex-end";
  loadBtn.textContent = "🔄 Load Students";
  loadBtn.onclick = loadLevyStudents;
  selectorRow.appendChild(loadBtn);

  panel.appendChild(selectorRow);

  var dateWarn = document.createElement("div");
  dateWarn.id = "levyDateWarning";
  dateWarn.className = "notice notice--error";
  dateWarn.style.display = "none";
  panel.appendChild(dateWarn);

  var progressBar = document.createElement("div");
  progressBar.className = "progress-indicator";
  progressBar.style.display = "none";
  progressBar.id = "levyProgressWrapper";
  setHtml(
    progressBar,
    '<div class="progress-bar-track">' +
      '<div class="progress-bar-fill" id="levyProgressFill"></div></div>' +
      '<div class="progress-indicator__text" id="levyProgress">Marked 0 of 0 students</div>',
  );
  panel.appendChild(progressBar);

  var summary = document.createElement("div");
  summary.id = "levySummary";
  summary.className = "summary-panel";
  summary.style.display = "none";
  setHtml(
    summary,
    '<div class="summary-cell summary-cell--paid">' +
      '<div class="summary-cell__label">Paid</div>' +
      '<div class="summary-cell__value" id="sumPaidCount">0</div></div>' +
      '<div class="summary-cell summary-cell--partial">' +
      '<div class="summary-cell__label">Partial</div>' +
      '<div class="summary-cell__value" id="sumPartialCount">0</div></div>' +
      '<div class="summary-cell summary-cell--notpaid">' +
      '<div class="summary-cell__label">Not Paid</div>' +
      '<div class="summary-cell__value" id="sumNotPaidCount">0</div></div>' +
      '<div class="summary-cell summary-cell--money">' +
      '<div class="summary-cell__label">Total Collected</div>' +
      '<div class="summary-cell__value" id="sumTotalCollected">GH₵ 0.00</div></div>',
  );
  panel.appendChild(summary);

  var gridWrapper = document.createElement("div");
  gridWrapper.id = "levyGridWrapper";
  gridWrapper.style.cssText = "margin-top:var(--space-4);overflow-x:auto;";
  panel.appendChild(gridWrapper);

  var saveRow = document.createElement("div");
  saveRow.className = "btn-row--center";
  var saveBtn = document.createElement("button");
  saveBtn.id = "btnSaveLevy";
  saveBtn.className = "btn btn--accent btn--lg";
  // saveBtn.textContent = "💾 Save Daily Levy";
  saveBtn.textContent = "💾 Save " + getLevyLabel("Daily Levy");
  saveBtn.disabled = true;
  saveBtn.onclick = submitLevy;
  saveRow.appendChild(saveBtn);
  panel.appendChild(saveRow);

  document
    .getElementById("levyClassType")
    .addEventListener("change", rebuildLevyClassLevelDropdown);
}

// LEVY — PRE-SELECT & ACTIVATE

// Runs setup when the Daily Levy tab is activated.
function onLevyTabActivated() {
  if (!ATT_CONFIG.academicYear) {
    showSpinner();

    callServer("getAttendanceConfig", {}, SESSION.token).then(
      function (cfg) {
        hideSpinner();
        if (!cfg || !cfg.success) {
          if (_handleSessionCodes(cfg)) return;
          showToast("Could not load " + getLevyLabel("Daily Levy") + " configuration.", "error");
          return;
        }
        ATT_CONFIG = cfg;
        _initLevyTab();
      },
      function () {
        hideSpinner();
        showToast("Server error loading " + getLevyLabel("Daily Levy") + " config.", "error");
      },
    );
  } else {
    _initLevyTab();
  }
}

// Returns the teacher's assigned class for Daily Levy, if only one exists.
function _getLevyAssignedClass() {
  var levyAssign = SESSION.assignments.find(function (a) {
    return a.assignment_type === "Daily_Levy";
  });
  return levyAssign ? levyAssign.class_level || "" : "";
}

// Initializes the Daily Levy tab's dropdowns and state.
function _initLevyTab() {
  _populateSharedContextRow();

  var assignedClass = _getLevyAssignedClass();

  callServer("getDailyLevyConfig", { classLevel: assignedClass }, SESSION.token).then(
    function (res) {
      if (res && res.code === "UNAUTHORIZED") {
        forcedLogout();
        return;
      }
      if (!res || !res.success) {
        showToast(
          res
            ? res.message
            : "The " +
                getLevyLabel("Daily Levy") +
                " amount has not been set up yet for this class. " +
                "Please tell the school administrator to set it in the " +
                "Desktop Application under Admission & Daily Fees → Levy Rate Setup.",
          "warning",
        );
        return;
      }
      LEVY_AMOUNT = res.levyAmount || 0;
      LEVY_CONFIGURED = true;
      LEVY_LOCATION_RATES = res.locationRates || {};
      var badgeEl = document.getElementById("levyBadgeWrapper");
      if (badgeEl) {
        setHtml(
          badgeEl,
          '<span class="levy-badge">' +
            '<span class="levy-badge__label">' +
            sanitizeDisplayValue(getLevyLabel("Daily Levy")) +
            "</span>" +
            "GH₵ " +
            LEVY_AMOUNT.toFixed(2) +
            "</span>",
        );
      }
    },
    function () {
      showToast("Could not load " + getLevyLabel("Daily Levy") + " amount.", "warning");
    },
  );

  preSelectLevyClass();

  var today = _latestSchoolDayISO();
  document.getElementById("levyDate").value = today;
  _validateLevyDate(today);
  _updateLevyWeekDisplay(today);
}

// Pre-selects the teacher's assigned class in the Daily Levy tab, if only one exists.
function preSelectLevyClass() {
  var assignedClass = _getLevyAssignedClass();
  if (!assignedClass) return;
  LEVY_SCHOOL_LEVEL = "Primary";

  var classType = "Normal";
  if (/[ABCDE]$/.test(assignedClass)) classType = assignedClass.slice(-1);
  var ctEl = document.getElementById("levyClassType");
  if (ctEl) ctEl.value = classType;

  rebuildLevyClassLevelDropdown();

  var clEl = document.getElementById("levyClassLevel");
  if (clEl) {
    for (var i = 0; i < clEl.options.length; i++) {
      if (clEl.options[i].value === assignedClass) {
        clEl.selectedIndex = i;
        break;
      }
    }
  }

  if (ctEl) ctEl.disabled = true;
  if (clEl) clEl.disabled = true;
}

// Rebuilds the Daily Levy tab's Class Level dropdown.
function rebuildLevyClassLevelDropdown() {
  var schoolLevel = LEVY_SCHOOL_LEVEL || "Primary";
  var classTypeEl = document.getElementById("levyClassType");
  var classType = classTypeEl ? classTypeEl.value : "Normal";
  var levels = getEffectiveClassLevels(schoolLevel, classType);
  var clEl = document.getElementById("levyClassLevel");
  if (!clEl) return;
  clEl.textContent = "";
  levels.forEach(function (lvl) {
    var opt = document.createElement("option");
    opt.value = lvl;
    opt.textContent = lvl;
    clEl.appendChild(opt);
  });
}

// LEVY — LOAD STUDENTS

// Loads students into the Daily Levy grid for the selected class and date.
function loadLevyStudents() {
  var classLevel = document.getElementById("levyClassLevel").value;
  var dateStr = document.getElementById("levyDate").value;
  var academicYear = ATT_CONFIG.academicYear || "";
  var term = ATT_CONFIG.currentTerm || "";

  if (!classLevel) {
    showToast("Please select a class level.", "warning");
    return;
  }
  if (!dateStr) {
    showToast("Please select a date.", "warning");
    return;
  }

  var errMsg = _getDateError(dateStr, ATT_CONFIG.holidayDates || []);
  if (errMsg) {
    showToast(errMsg, "warning");
    return;
  }

  if (!LEVY_CONFIGURED) {
    showToast(
      "The " +
        getLevyLabel("Daily Levy") +
        " amount has not been set up yet for this term. " +
        "Please contact the school administrator to set it in " +
        "Admission & Daily Fees → Levy Rate Setup.",
      "error",
    );
    return;
  }

  CURRENT_LEVY_DATE = dateStr;
  showSpinner();

  var studentsCall = startCall_("getStudentsForClass", {
    classLevel: classLevel,
    academicYear: academicYear,
    term: term,
    assignmentType: "Daily_Levy",
  });
  var existingCall = startCall_("getExistingDailyLevy", {
    classLevel: classLevel,
    academicYear: academicYear,
    term: term,
    levyDate: dateStr,
  });

  studentsCall.then(
    function (stuResult) {
      if (!stuResult || !stuResult.success) {
        if (stuResult && stuResult.code === "INACTIVE") {
          forcedLogout();
          return;
        }
        if (stuResult && stuResult.code === "UNAUTHORIZED") {
          forcedLogout();
          return;
        }
        hideSpinner();
        showToast(
          (stuResult && stuResult.message) || "Could not load students. Please try again.",
          "error",
        );
        return;
      }
      LEVY_STUDENTS = stuResult.students || [];

      if (LEVY_STUDENTS.length === 0) {
        hideSpinner();
        setHtml(
          document.getElementById("levyGridWrapper"),
          '<div class="empty-state">' +
            '<div class="empty-state__icon">👥</div>' +
            '<div class="empty-state__title">No Students Found</div>' +
            '<div class="empty-state__body">' +
            sanitizeDisplayValue(stuResult.message || "") +
            "</div>" +
            "</div>",
        );
        document.getElementById("levyProgressWrapper").style.display = "none";
        document.getElementById("levySummary").style.display = "none";
        return;
      }

      existingCall.then(
        function (existResult) {
          hideSpinner();
          if (existResult && existResult.code === "UNAUTHORIZED") {
            forcedLogout("session_updated");
            return;
          }
          LEVY_EXISTING = existResult && existResult.records ? existResult.records : {};
          LEVY_EXISTING_AMOUNTS = existResult && existResult.amounts ? existResult.amounts : {};
          renderDailyLevyGrid(
            document.getElementById("levyGridWrapper"),
            LEVY_STUDENTS,
            LEVY_EXISTING,
            LEVY_AMOUNT,
            LEVY_LOCATION_RATES,
            LEVY_EXISTING_AMOUNTS,
          );
          document.getElementById("levyProgressWrapper").style.display = "flex";
          document.getElementById("levySummary").style.display = "grid";
          updateProgressIndicator(
            document.getElementById("levyGridWrapper"),
            LEVY_STUDENTS.length,
            document.getElementById("levyProgress"),
            document.getElementById("btnSaveLevy"),
          );
          updateDailyLevySummary(
            document.getElementById("levySummary"),
            document.getElementById("levyGridWrapper"),
            LEVY_AMOUNT,
            LEVY_STUDENTS,
          );
        },
        function () {
          hideSpinner();
          LEVY_EXISTING = {};
          LEVY_EXISTING_AMOUNTS = {};
          renderDailyLevyGrid(
            document.getElementById("levyGridWrapper"),
            LEVY_STUDENTS,
            {},
            LEVY_AMOUNT,
            LEVY_LOCATION_RATES,
          );
          document.getElementById("levyProgressWrapper").style.display = "flex";
          document.getElementById("levySummary").style.display = "grid";
          updateProgressIndicator(
            document.getElementById("levyGridWrapper"),
            LEVY_STUDENTS.length,
            document.getElementById("levyProgress"),
            document.getElementById("btnSaveLevy"),
          );
        },
      );
    },
    function (err) {
      hideSpinner();
      showToast(friendlyErrorFrontend(err ? err.message : ""), "error");
    },
  );
}

// LEVY — SUBMIT

// Submits the Daily Levy grid to the server.
function submitLevy() {
  var classLevel = document.getElementById("levyClassLevel").value;
  var dateStr =
    CURRENT_LEVY_DATE ||
    (document.getElementById("levyDate") ? document.getElementById("levyDate").value : "");
  var academicYear = ATT_CONFIG.academicYear || "";
  var term = ATT_CONFIG.currentTerm || "";
  var saveBtn = document.getElementById("btnSaveLevy");
  var gridWrapper = document.getElementById("levyGridWrapper");

  if (!classLevel || !dateStr) {
    showToast("Please load students before saving.", "warning");
    return;
  }

  // re-validate the date against the term window at save
  // time too — mirrors submitAttendance()'s identical fix.
  var _levyDateErr = _getDateError(dateStr, ATT_CONFIG.holidayDates || []);
  if (_levyDateErr) {
    showToast(_levyDateErr, "error");
    return;
  }

  var collected = collectDailyLevyValues(gridWrapper, LEVY_STUDENTS);

  if (collected.incomplete.length > 0) {
    if (
      !confirm(
        "The following students have not been marked:\n" +
          collected.incomplete.join(", ") +
          "\n\nDo you want to submit a partial record?",
      )
    )
      return;
  }

  // Location Identity feature: each student may have their own rate
  // (a location override), so this cap check is per-student now
  // instead of comparing every record against one flat LEVY_AMOUNT.
  // Server-side saveDailyLevy() remains the authoritative check
  // either way.
  var studentRateMap = {};
  LEVY_STUDENTS.forEach(function (s) {
    var loc = s.location_identity_code || "";
    var override =
      loc && Object.prototype.hasOwnProperty.call(LEVY_LOCATION_RATES, loc)
        ? parseFloat(LEVY_LOCATION_RATES[loc])
        : NaN;
    studentRateMap[s.student_id] = !isNaN(override) ? override : LEVY_AMOUNT;
  });

  var overLimit = collected.records.filter(function (r) {
    var rate = Object.prototype.hasOwnProperty.call(studentRateMap, r.student_id)
      ? studentRateMap[r.student_id]
      : LEVY_AMOUNT;
    return r.payment_status === "Partial" && r.amount_paid !== null && r.amount_paid > rate;
  });
  if (overLimit.length > 0) {
    showToast(
      "One or more Amount Paid values exceed that student's " +
        getLevyLabel("Daily Levy") +
        " rate. Please correct before saving.",
      "error",
    );
    return;
  }

  var params = {
    classLevel: classLevel,
    academicYear: academicYear,
    term: term,
    levyDate: dateStr,
    levyRecords: collected.records,
    isOverride: false,
  };

  handleSaveWithRetry("saveDailyLevy", params, saveBtn, function () {
    LEVY_EXISTING = {};
    LEVY_EXISTING_AMOUNTS = {};
    collected.records.forEach(function (r) {
      LEVY_EXISTING[r.student_id] = r.payment_status;
      // Mirrors what the server just stored for each status.
      LEVY_EXISTING_AMOUNTS[r.student_id] =
        r.payment_status === "Paid"
          ? studentRateMap[r.student_id]
          : r.payment_status === "Partial"
            ? r.amount_paid
            : 0;
    });
    updateDailyLevySummary(
      document.getElementById("levySummary"),
      gridWrapper,
      LEVY_AMOUNT,
      LEVY_STUDENTS,
    );
  });
}

// Returns the distinct class-type suffixes this teacher holds an active SBA assignment for.
function _deriveSbaAssignedClassTypes() {
  var types = {};
  (SESSION.sbaAssignments || []).forEach(function (a) {
    var cl = a.class_level || "";
    var classType = /[ABCDE]$/.test(cl) ? cl.slice(-1) : "Normal";
    types[classType] = true;
  });
  return Object.keys(types);
}

// Returns the class levels this teacher is SBA-assigned to for a given class type.
function _getSbaAssignedClassLevelsForType(classType) {
  var levels = {};
  (SESSION.sbaAssignments || []).forEach(function (a) {
    var cl = a.class_level || "";
    var suffix = /[ABCDE]$/.test(cl) ? cl.slice(-1) : "Normal";
    if (suffix === classType) levels[cl] = true;
  });
  return Object.keys(levels);
}

// SBA TAB — CONTENT STRUCTURE

// Builds the SBA Marks tab's content.
function buildSbaTabContent() {
  var panel = document.getElementById("panel-sba");
  if (!panel) return;
  panel.textContent = "";

  var ctxRow = document.createElement("div");
  ctxRow.id = "sbaCtxRow";
  ctxRow.style.cssText =
    "display:flex;gap:var(--space-5);align-items:center;" +
    "flex-wrap:wrap;margin-bottom:var(--space-5);font-size:var(--font-size-sm);font-weight:600;";
  setHtml(ctxRow, '<span>School Level: <strong id="sbaSchoolLevel">—</strong></span>');

  var selectorRow = document.createElement("div");
  selectorRow.className = "duty-selector-row sba-selector-row";

  SBA_ASSIGNED_CLASS_TYPES = _deriveSbaAssignedClassTypes();
  var _allSbaClassTypes = ["Normal", "A", "B", "C", "D"];
  var _sbaClassTypeOptions =
    SBA_ASSIGNED_CLASS_TYPES.length > 0
      ? _allSbaClassTypes.filter(function (t) {
          return SBA_ASSIGNED_CLASS_TYPES.indexOf(t) !== -1;
        })
      : _allSbaClassTypes;

  var typeGroup = document.createElement("div");
  typeGroup.className = "form-group";
  typeGroup.style.marginBottom = "0";
  setHtml(
    typeGroup,
    '<label class="form-label" for="sbaClassType">Class Type</label>' +
      '<select id="sbaClassType" class="form-control">' +
      _sbaClassTypeOptions
        .map(function (t) {
          return '<option value="' + t + '">' + t + "</option>";
        })
        .join("") +
      "</select>",
  );
  selectorRow.appendChild(typeGroup);

  var clGroup = document.createElement("div");
  clGroup.className = "form-group";
  clGroup.style.marginBottom = "0";
  setHtml(
    clGroup,
    '<label class="form-label" for="sbaClassLevel">Class Level</label>' +
      '<select id="sbaClassLevel" class="form-control"></select>',
  );
  selectorRow.appendChild(clGroup);

  var subjGroup = document.createElement("div");
  subjGroup.className = "form-group";
  subjGroup.style.marginBottom = "0";
  setHtml(
    subjGroup,
    '<label class="form-label" for="sbaSubject">Subject</label>' +
      '<select id="sbaSubject" class="form-control"></select>',
  );
  selectorRow.appendChild(subjGroup);

  var loadBtn = document.createElement("button");
  loadBtn.id = "btnLoadSba";
  loadBtn.className = "btn btn--primary";
  loadBtn.style.alignSelf = "flex-end";
  loadBtn.textContent = "🔄 Load Students";
  loadBtn.onclick = loadSbaStudents;
  selectorRow.appendChild(loadBtn);

  var sbaHeaderRow = document.createElement("div");
  sbaHeaderRow.className = "sba-header-row";
  sbaHeaderRow.appendChild(ctxRow);
  sbaHeaderRow.appendChild(selectorRow);
  panel.appendChild(sbaHeaderRow);

  // student name search — jumps to a loaded student's row/card.
  var sbaSearchRow = document.createElement("div");
  sbaSearchRow.style.cssText = "display:flex;justify-content:center;margin-bottom:var(--space-4);";
  sbaSearchRow.appendChild(_buildStudentNameSearch("sba"));
  panel.appendChild(sbaSearchRow);

  var gridWrapper = document.createElement("div");
  gridWrapper.id = "sbaGridWrapper";
  gridWrapper.className = "sba-grid-wrapper";
  gridWrapper.style.marginTop = "var(--space-4)";
  panel.appendChild(gridWrapper);

  var cardWrapper = document.createElement("div");
  cardWrapper.id = "sbaCardWrapper";
  cardWrapper.style.marginTop = "var(--space-4)";
  panel.appendChild(cardWrapper);

  var saveRow = document.createElement("div");
  saveRow.className = "btn-row--center";
  var deleteSbaBtn = document.createElement("button");
  deleteSbaBtn.id = "btnDeleteSba";
  deleteSbaBtn.className = "btn btn--danger btn--lg";
  deleteSbaBtn.textContent = "🗑️ Delete SBA Marks";
  deleteSbaBtn.disabled = true;
  deleteSbaBtn.onclick = deleteSbaClassMarksHandler;
  saveRow.appendChild(deleteSbaBtn);
  var saveBtn = document.createElement("button");
  saveBtn.id = "btnSaveSba";
  saveBtn.className = "btn btn--accent btn--lg";
  saveBtn.textContent = "💾 Save SBA Marks";
  saveBtn.disabled = true;
  saveBtn.onclick = submitSba;
  saveRow.appendChild(saveBtn);
  panel.appendChild(saveRow);

  document.getElementById("sbaClassType").addEventListener("change", function () {
    rebuildSbaClassLevelDropdown();
    rebuildSbaSubjectDropdown();
  });
  document.getElementById("sbaClassLevel").addEventListener("change", rebuildSbaSubjectDropdown);
}

// ADMISSION FEE & TUITION FEE COLLECTION (shared parameterized implementation)
//
// feeType is "Admission_Fee" or "Tuition_Fee"; prefix is "admfee"/"tuifee",
// used to build every element id. TERMLY_FEE_STATE holds separate
// per-fee-type state so both tabs can be loaded/active independently --
// a teacher can be assigned to collect BOTH fee types at once.
var TERMLY_FEE_STATE = {
  Admission_Fee: { students: [], rate: 0, assignedClass: "" },
  Tuition_Fee: { students: [], rate: 0, assignedClass: "" },
};

function _termlyFeeLabelKey(feeType) {
  return feeType === "Admission_Fee" ? "Admission Fee" : "Tuition Fee";
}

// Returns the teacher's assigned class for a termly fee duty, if any --
// mirrors _getLevyAssignedClass()'s "read straight from
// SESSION.assignments, no extra round trip" pattern, since Phase B put
// Admission_Fee/Tuition_Fee in the same Teacher_Assignments table
// Daily_Levy already uses.
function _getTermlyFeeAssignedClass(feeType) {
  var found = SESSION.assignments.find(function (a) {
    return a.assignment_type === feeType;
  });
  return found ? found.class_level || "" : "";
}

function buildTermlyFeeTabContent(feeType, prefix) {
  var panel = document.getElementById("panel-" + prefix);
  if (!panel) return;
  panel.textContent = "";

  var ctxRow = document.createElement("div");
  ctxRow.id = prefix + "CtxRow";
  ctxRow.style.cssText =
    "display:flex;gap:var(--space-5);align-items:center;justify-content:center;" +
    "flex-wrap:wrap;margin-bottom:var(--space-4);font-size:var(--font-size-sm);font-weight:600;";
  setHtml(
    ctxRow,
    '<span>Class: <strong id="' +
      prefix +
      'ClassDisplay">—</strong></span>' +
      '<span>Rate: <strong id="' +
      prefix +
      'RateDisplay">—</strong></span>',
  );
  panel.appendChild(ctxRow);

  var loadRow = document.createElement("div");
  loadRow.className = "btn-row--center";
  loadRow.style.marginBottom = "var(--space-4)";
  var loadBtn = document.createElement("button");
  loadBtn.id = "btnLoad" + prefix;
  loadBtn.className = "btn btn--primary";
  loadBtn.textContent = "🔄 Load Students";
  loadBtn.onclick = function () {
    loadTermlyFeeStudents(feeType, prefix);
  };
  loadRow.appendChild(loadBtn);
  panel.appendChild(loadRow);

  var gridWrapper = document.createElement("div");
  gridWrapper.id = prefix + "GridWrapper";
  gridWrapper.style.marginTop = "var(--space-2)";
  panel.appendChild(gridWrapper);

  var saveRow = document.createElement("div");
  saveRow.className = "btn-row--center";
  var saveBtn = document.createElement("button");
  saveBtn.id = "btnSave" + prefix;
  saveBtn.className = "btn btn--accent btn--lg";
  saveBtn.textContent = "💾 Save Payments";
  saveBtn.disabled = true;
  saveBtn.onclick = function () {
    submitTermlyFeePayments(feeType, prefix);
  };
  saveRow.appendChild(saveBtn);
  panel.appendChild(saveRow);
}

// Runs setup when an Admission Fee / Tuition Fee tab is activated.
function onTermlyFeeTabActivated(feeType, prefix) {
  var assignedClass = _getTermlyFeeAssignedClass(feeType);
  TERMLY_FEE_STATE[feeType].assignedClass = assignedClass;
  var classDisplay = document.getElementById(prefix + "ClassDisplay");
  if (classDisplay) {
    classDisplay.textContent = assignedClass || "Not assigned";
  }
  var loadBtn = document.getElementById("btnLoad" + prefix);
  if (loadBtn) loadBtn.disabled = !assignedClass;
}

// Loads students + existing payments for an Admission Fee / Tuition Fee tab.
function loadTermlyFeeStudents(feeType, prefix) {
  var state = TERMLY_FEE_STATE[feeType];
  var assignedClass = state.assignedClass;
  var label = getLevyLabel(_termlyFeeLabelKey(feeType));

  if (!assignedClass) {
    showToast("You are not currently assigned to collect " + label + ".", "warning");
    return;
  }

  showSpinner();
  callServer(
    "getStudentsForTermlyFeeCollection",
    { classLevel: assignedClass, feeType: feeType },
    SESSION.token,
  ).then(
    function (res) {
      hideSpinner();
      if (!res || !res.success) {
        if (_handleSessionCodes(res)) return;
        showToast(
          (res && res.message) || "You are not assigned to collect " + label + " for this class.",
          "error",
        );
        document.getElementById(prefix + "GridWrapper").textContent = "";
        document.getElementById("btnSave" + prefix).disabled = true;
        return;
      }
      state.students = res.students || [];
      state.rate = res.rate || 0;
      var rateDisplay = document.getElementById(prefix + "RateDisplay");
      if (rateDisplay) {
        rateDisplay.textContent =
          state.rate > 0 ? "GH₵ " + state.rate.toFixed(2) : "Not configured";
      }
      if (state.students.length === 0) {
        setHtml(
          document.getElementById(prefix + "GridWrapper"),
          '<div class="empty-state"><div class="empty-state__icon">👥</div>' +
            '<div class="empty-state__title">No Students Found</div></div>',
        );
        document.getElementById("btnSave" + prefix).disabled = true;
        return;
      }
      renderTermlyFeeGrid(
        document.getElementById(prefix + "GridWrapper"),
        state.students,
        state.rate,
        prefix,
      );
      document.getElementById("btnSave" + prefix).disabled = !(state.rate > 0);
      if (!(state.rate > 0)) {
        showToast(
          "The " +
            label +
            " rate has not been set up yet for this class. " +
            "Please contact the school administrator.",
          "warning",
        );
      }
    },
    function (err) {
      hideSpinner();
      showToast(friendlyErrorFrontend(err ? err.message : ""), "error");
    },
  );
}

// Renders an Admission Fee / Tuition Fee collection grid — one row per
// student with a live-computed balance. Mirrors renderMockFeeGrid()
// exactly, parameterized by prefix so the two tabs' DOM/CSS classes
// never collide; each row's input listener reads its own rate (the input's max).
function renderTermlyFeeGrid(container, students, rate, prefix) {
  if (!container) return;
  var rows = students
    .map(function (s) {
      var fullName = [s.first_name, s.other_name, s.surname].filter(Boolean).join(" ");
      var displayId = s.student_non_usable_id || s.student_id;
      var paid = parseFloat(s.amount_paid) || 0;
      var balance = Math.max(0, rate - paid);
      return (
        '<tr data-sid="' +
        sanitizeDisplayValue(s.student_id) +
        '">' +
        "<td>" +
        sanitizeDisplayValue(fullName) +
        ' <span class="text-muted text-xs">(' +
        sanitizeDisplayValue(displayId) +
        ")</span></td>" +
        '<td style="text-align:center;">' +
        '<input type="number" min="0" max="' +
        rate +
        '" step="0.01" class="form-control ' +
        prefix +
        '-amount-input" ' +
        'data-sid="' +
        sanitizeDisplayValue(s.student_id) +
        '" value="' +
        paid.toFixed(2) +
        '" style="width:110px;text-align:center;">' +
        "</td>" +
        '<td style="text-align:center;" class="' +
        prefix +
        '-balance-cell">GH₵ ' +
        balance.toFixed(2) +
        "</td>" +
        "</tr>"
      );
    })
    .join("");

  setHtml(
    container,
    '<div style="overflow-x:auto;">' +
      '<table class="table table--striped">' +
      "<thead><tr>" +
      "<th>Student</th>" +
      '<th style="text-align:center;">Amount Paid (GH₵)</th>' +
      '<th style="text-align:center;">Balance</th>' +
      "</tr></thead>" +
      "<tbody>" +
      rows +
      "</tbody></table></div>",
  );
  container.querySelectorAll("." + prefix + "-amount-input").forEach(function (input) {
    input.addEventListener("input", function () {
      _updateTermlyFeeRowBalance(input, prefix, parseFloat(input.getAttribute("max")) || 0);
    });
  });
}

// Recomputes and displays a single row's balance live, as the teacher types an amount. rate is
// that row's own rate, passed in rather than read from shared state.
function _updateTermlyFeeRowBalance(inputEl, prefix, rate) {
  var row = inputEl.closest("tr");
  if (!row) return;
  var balanceCell = row.querySelector("." + prefix + "-balance-cell");
  if (!balanceCell) return;
  var paid = parseFloat(inputEl.value);
  if (isNaN(paid) || paid < 0) paid = 0;
  var balance = Math.max(0, rate - paid);
  balanceCell.textContent = "GH₵ " + balance.toFixed(2);
}

// Submits an Admission Fee / Tuition Fee collection grid to the server.
function submitTermlyFeePayments(feeType, prefix) {
  var state = TERMLY_FEE_STATE[feeType];
  var label = getLevyLabel(_termlyFeeLabelKey(feeType));

  if (!state.assignedClass) {
    showToast("Please load students before saving.", "warning");
    return;
  }
  var gridWrapper = document.getElementById(prefix + "GridWrapper");
  if (!gridWrapper) return;

  var inputs = gridWrapper.querySelectorAll("." + prefix + "-amount-input");
  var records = [];
  var invalid = [];
  inputs.forEach(function (inp) {
    var sid = inp.getAttribute("data-sid");
    var raw = inp.value;
    var amt = parseFloat(raw);
    if (raw === "" || isNaN(amt) || amt < 0 || amt > state.rate) {
      invalid.push(sid);
      return;
    }
    records.push({ student_id: sid, amount_paid: amt });
  });

  if (invalid.length > 0) {
    showToast(
      "One or more Amount Paid values are invalid — they must be between 0 and GH₵ " +
        state.rate.toFixed(2) +
        ".",
      "error",
    );
    return;
  }

  if (records.length === 0) {
    showToast("No students to save.", "warning");
    return;
  }

  var saveBtn = document.getElementById("btnSave" + prefix);
  var params = {
    classLevel: state.assignedClass,
    feeType: feeType,
    paymentRecords: records,
  };

  handleSaveWithRetry("saveTermlyFeePayments", params, saveBtn, function () {
    records.forEach(function (r) {
      var s = state.students.find(function (x) {
        return x.student_id === r.student_id;
      });
      if (s) s.amount_paid = r.amount_paid;
    });
  });
}

// SBA TAB — ACTIVATION & CONFIG

// Runs setup when the SBA Marks tab is activated.
function onSbaTabActivated() {
  if (!ATT_CONFIG.academicYear) {
    showSpinner();
    callServer("getAttendanceConfig", {}, SESSION.token).then(
      function (cfg) {
        hideSpinner();
        if (!cfg || !cfg.success) {
          if (_handleSessionCodes(cfg)) return;
          showToast("Could not load SBA configuration.", "error");
          return;
        }
        ATT_CONFIG = cfg;
        _loadSbaSubjectsReferenceThen(_initSbaTab);
      },
      function () {
        hideSpinner();
        showToast("Server error loading SBA configuration.", "error");
      },
    );
  } else {
    _loadSbaSubjectsReferenceThen(_initSbaTab);
  }
}

// Loads (and caches) the subjects reference list once per session, then runs a callback.
function _loadSbaSubjectsReferenceThen(cb) {
  if (SBA_SUBJECTS_REFERENCE_LOADED) {
    if (cb) cb();
    return;
  }
  callServer("getSubjectsReference", {}, SESSION.token).then(
    function (res) {
      SBA_SUBJECTS_REFERENCE =
        res && res.success && Array.isArray(res.subjects) ? res.subjects : [];
      setSubjectRegistry(res && res.success ? res.registry : []);
      SBA_SUBJECTS_REFERENCE_LOADED = true;
      if (cb) cb();
    },
    function () {
      SBA_SUBJECTS_REFERENCE = [];
      SBA_SUBJECTS_REFERENCE_LOADED = true;
      if (cb) cb();
    },
  );
}

// Initializes the SBA Marks tab's dropdowns and state.
function _initSbaTab() {
  _populateSharedContextRow();

  SBA_SCHOOL_LEVEL = "Primary";
  document.getElementById("sbaSchoolLevel").textContent = SBA_SCHOOL_LEVEL;

  rebuildSbaClassLevelDropdown();
  rebuildSbaSubjectDropdown();

  var sbaClassTypeEl = document.getElementById("sbaClassType");
  if (sbaClassTypeEl) {
    if (SBA_ASSIGNED_CLASS_TYPES.length === 1) {
      sbaClassTypeEl.value = SBA_ASSIGNED_CLASS_TYPES[0];
      sbaClassTypeEl.disabled = true;
      rebuildSbaClassLevelDropdown();
      rebuildSbaSubjectDropdown();
    } else {
      sbaClassTypeEl.disabled = false;
    }
  }
}

// Rebuilds the SBA Marks tab's Class Level dropdown.
function rebuildSbaClassLevelDropdown() {
  var classTypeEl = document.getElementById("sbaClassType");
  var classType = classTypeEl ? classTypeEl.value : "Normal";

  var assignedLevelsForType = _getSbaAssignedClassLevelsForType(classType);

  var filteredLevels;
  if (assignedLevelsForType.length > 0) {
    filteredLevels = assignedLevelsForType.slice().sort();
  } else {
    var schoolLevel = SBA_SCHOOL_LEVEL || "Primary";
    filteredLevels = getEffectiveClassLevels(schoolLevel, classType);
  }

  var clEl = document.getElementById("sbaClassLevel");
  if (!clEl) return;
  clEl.textContent = "";
  filteredLevels.forEach(function (lvl) {
    var opt = document.createElement("option");
    opt.value = lvl;
    opt.textContent = lvl;
    clEl.appendChild(opt);
  });

  if (assignedLevelsForType.length === 1 && filteredLevels.length === 1) {
    clEl.value = filteredLevels[0];
    clEl.disabled = true;
  } else {
    clEl.disabled = false;
  }
}

// Returns the subject IDs this teacher is SBA-assigned to within a given class level.
function _getSbaAssignedSubjectIdsForClassLevel(classLevel) {
  var ids = {};
  (SESSION.sbaAssignments || []).forEach(function (a) {
    if (a.class_level === classLevel) {
      ids[String(a.subject_id)] = true;
    }
  });
  return Object.keys(ids);
}

// Rebuilds the SBA Marks tab's Subject dropdown.
function rebuildSbaSubjectDropdown() {
  var clEl = document.getElementById("sbaClassLevel");
  var classLevel = clEl ? clEl.value : "";
  var subjEl = document.getElementById("sbaSubject");
  if (!subjEl) return;
  subjEl.textContent = "";
  var subjects = getSubjectsForClassLevel(
    classLevel,
    ATT_CONFIG.ghanaianLanguageName || "",
    SBA_SUBJECTS_REFERENCE || [],
  );

  var assignedSubjectIds = _getSbaAssignedSubjectIdsForClassLevel(classLevel);
  var filteredSubjects =
    assignedSubjectIds.length > 0
      ? subjects.filter(function (s) {
          var sid = s.subjectId !== null && s.subjectId !== undefined ? String(s.subjectId) : "";
          return sid !== "" && assignedSubjectIds.indexOf(sid) !== -1;
        })
      : subjects;
  if (filteredSubjects.length === 0) filteredSubjects = subjects;

  filteredSubjects.forEach(function (s) {
    var opt = document.createElement("option");
    opt.value = s.subjectId !== null && s.subjectId !== undefined ? String(s.subjectId) : "";
    opt.textContent = s.displayName;
    opt.setAttribute("data-subject-name", s.displayName);
    subjEl.appendChild(opt);
  });

  if (assignedSubjectIds.length === 1 && filteredSubjects.length === 1) {
    var onlySubj = filteredSubjects[0];
    subjEl.value =
      onlySubj.subjectId !== null && onlySubj.subjectId !== undefined
        ? String(onlySubj.subjectId)
        : "";
    subjEl.disabled = true;
  } else {
    subjEl.disabled = false;
  }

  _clearSbaGridState();
}

// Clears a stale SBA Marks grid and its cached state.
function _clearSbaGridState() {
  SBA_STUDENTS = [];
  SBA_EXISTING = {};
  CURRENT_SBA_CLASS_LEVEL = "";
  CURRENT_SBA_SUBJECT_ID = "";
  CURRENT_SBA_SUBJECT_NAME = "";
  SBA_CARD_CONTROLLER = null;
  var gridWrapper = document.getElementById("sbaGridWrapper");
  if (gridWrapper) gridWrapper.textContent = "";
  var cardWrapperEl = document.getElementById("sbaCardWrapper");
  if (cardWrapperEl) cardWrapperEl.textContent = "";
  var saveBtn = document.getElementById("btnSaveSba");
  if (saveBtn) saveBtn.disabled = true;
  var deleteBtn = document.getElementById("btnDeleteSba");
  if (deleteBtn) deleteBtn.disabled = true;
  _clearStudentNameSearch("sba");
}

// SBA TAB — LOAD STUDENTS (load-for-update)

// Loads students into the SBA Marks grid for the selected class and subject.
function loadSbaStudents() {
  var classLevel = document.getElementById("sbaClassLevel").value;
  var subjectEl = document.getElementById("sbaSubject");
  var subjectId = subjectEl ? subjectEl.value : "";
  var subjectName =
    subjectEl && subjectEl.selectedOptions && subjectEl.selectedOptions[0]
      ? subjectEl.selectedOptions[0].getAttribute("data-subject-name") ||
        subjectEl.selectedOptions[0].textContent
      : "";
  var academicYear = ATT_CONFIG.academicYear || "";
  var term = ATT_CONFIG.currentTerm || "";

  if (!classLevel) {
    showToast("Please select a class level.", "warning");
    return;
  }
  if (!subjectId) {
    showToast(
      "This subject does not have a Subject ID yet. Ask the administrator " +
        "to sync the desktop application, then reload this page.",
      "warning",
    );
    return;
  }

  CURRENT_SBA_CLASS_LEVEL = classLevel;
  CURRENT_SBA_SUBJECT_ID = subjectId;
  CURRENT_SBA_SUBJECT_NAME = subjectName;

  showSpinner();

  var studentsCall = startCall_("getStudentsForClass", {
    classLevel: classLevel,
    academicYear: academicYear,
    term: term,
    assignmentType: "SBA",
    subjectId: subjectId,
  });
  var existingCall = startCall_("getExistingSbaMarks", {
    classLevel: classLevel,
    academicYear: academicYear,
    term: term,
    subjectId: subjectId,
  });

  studentsCall.then(
    function (stuResult) {
      if (!stuResult || !stuResult.success) {
        hideSpinner();
        if (_handleSessionCodes(stuResult)) return;
        if (stuResult && stuResult.code === "NOT_ASSIGNED") {
          showToast(
            stuResult.message || "You are not assigned to enter SBA marks for this class/subject.",
            "error",
          );
          document.getElementById("sbaGridWrapper").textContent = "";
          document.getElementById("sbaCardWrapper").textContent = "";
          document.getElementById("btnSaveSba").disabled = true;
          document.getElementById("btnDeleteSba").disabled = true;
          return;
        }
        showToast(
          (stuResult && stuResult.message) || "Could not load students. Please try again.",
          "error",
        );
        return;
      }
      SBA_STUDENTS = stuResult.students || [];

      if (SBA_STUDENTS.length === 0) {
        hideSpinner();
        var _sbaEmptyHtml =
          '<div class="empty-state">' +
          '<div class="empty-state__icon">👥</div>' +
          '<div class="empty-state__title">No Students Found</div>' +
          '<div class="empty-state__body">' +
          sanitizeDisplayValue(stuResult.message || "") +
          "</div>" +
          "</div>";
        setHtml(document.getElementById("sbaGridWrapper"), _sbaEmptyHtml);
        setHtml(document.getElementById("sbaCardWrapper"), _sbaEmptyHtml);
        document.getElementById("btnSaveSba").disabled = true;
        document.getElementById("btnDeleteSba").disabled = true;
        return;
      }

      existingCall.then(
        function (existResult) {
          hideSpinner();
          if (existResult && existResult.code === "UNAUTHORIZED") {
            forcedLogout("session_updated");
            return;
          }
          if (existResult && existResult.code === "NOT_ASSIGNED") {
            showToast(
              existResult.message ||
                "You are not assigned to enter SBA marks for this class/subject.",
              "error",
            );
            document.getElementById("sbaGridWrapper").textContent = "";
            document.getElementById("sbaCardWrapper").textContent = "";
            document.getElementById("btnSaveSba").disabled = true;
            document.getElementById("btnDeleteSba").disabled = true;
            return;
          }
          SBA_EXISTING = existResult && existResult.records ? existResult.records : {};
          renderSbaGrid(
            document.getElementById("sbaGridWrapper"),
            SBA_STUDENTS,
            SBA_EXISTING,
            false,
          );
          // capture the card-view controller so student search can jump to it.
          SBA_CARD_CONTROLLER = renderSbaCardView(
            document.getElementById("sbaCardWrapper"),
            SBA_STUDENTS,
            SBA_EXISTING,
            false,
          );
          document.getElementById("btnSaveSba").disabled = false;
          document.getElementById("btnDeleteSba").disabled = false;
        },
        function () {
          hideSpinner();
          SBA_EXISTING = {};
          renderSbaGrid(document.getElementById("sbaGridWrapper"), SBA_STUDENTS, {}, false);
          // capture the card-view controller so student search can jump to it.
          SBA_CARD_CONTROLLER = renderSbaCardView(
            document.getElementById("sbaCardWrapper"),
            SBA_STUDENTS,
            {},
            false,
          );
          document.getElementById("btnSaveSba").disabled = false;
          document.getElementById("btnDeleteSba").disabled = false;
        },
      );
    },
    function (err) {
      hideSpinner();
      showToast(friendlyErrorFrontend(err ? err.message : ""), "error");
    },
  );
}

// SBA TAB — SUBMIT

// Submits the SBA Marks grid to the server.
function submitSba() {
  var classLevel =
    CURRENT_SBA_CLASS_LEVEL ||
    (document.getElementById("sbaClassLevel")
      ? document.getElementById("sbaClassLevel").value
      : "");
  var subjectId =
    CURRENT_SBA_SUBJECT_ID ||
    (document.getElementById("sbaSubject") ? document.getElementById("sbaSubject").value : "");
  var subjectName = CURRENT_SBA_SUBJECT_NAME || "";
  var academicYear = ATT_CONFIG.academicYear || "";
  var term = ATT_CONFIG.currentTerm || "";
  var saveBtn = document.getElementById("btnSaveSba");
  var gridWrapper = document.getElementById("sbaGridWrapper");
  var cardWrapper = document.getElementById("sbaCardWrapper");

  if (!classLevel || !subjectId) {
    showToast("Please load students before saving.", "warning");
    return;
  }

  var activeSbaContainer = gridWrapper;
  if (gridWrapper && window.getComputedStyle(gridWrapper).display === "none") {
    activeSbaContainer = cardWrapper;
  }

  var collected = collectSbaValues(activeSbaContainer, SBA_STUDENTS);

  if (collected.errors.length > 0) {
    showToast(collected.errors[0], "error");
    return;
  }

  if (collected.records.length === 0) {
    showToast(
      "No marks entered. Please enter at least one student's marks before saving.",
      "warning",
    );
    return;
  }

  // Confirms via modal, then proceeds with saving SBA marks.
  function _proceedSbaSave() {
    var params = {
      classLevel: classLevel,
      academicYear: academicYear,
      term: term,
      subjectId: subjectId,
      subjectName: subjectName,
      sbaRecords: collected.records,
    };

    handleSaveWithRetry("saveSbaMarks", params, saveBtn, function () {
      SBA_EXISTING = {};
      collected.records.forEach(function (r) {
        SBA_EXISTING[r.student_id] = r;
      });
    });
  }

  if (collected.incomplete.length > 0) {
    showModal(
      "Some Students Not Marked",
      "<p>The following students have no marks entered and will be skipped:</p>" +
        "<p><strong>" +
        sanitizeDisplayValue(collected.incomplete.join(", ")) +
        "</strong></p>" +
        "<p>Do you want to continue saving the rest?</p>",
      [
        {
          label: "Cancel",
          cls: "btn--ghost",
          action: function () {
            closeModal();
          },
        },
        {
          label: "Continue",
          cls: "btn--accent",
          action: function () {
            closeModal(_proceedSbaSave);
          },
        },
      ],
    );
    return;
  }

  _proceedSbaSave();
}

// Confirms and deletes an entire class's SBA marks (with Behaviour Entries cascade).
function deleteSbaClassMarksHandler() {
  var classLevel = CURRENT_SBA_CLASS_LEVEL;
  var subjectId = CURRENT_SBA_SUBJECT_ID;
  var subjectName = CURRENT_SBA_SUBJECT_NAME;
  var academicYear = ATT_CONFIG.academicYear || "";
  var term = ATT_CONFIG.currentTerm || "";

  if (!classLevel || !subjectId) {
    showToast("Please load students before deleting.", "warning");
    return;
  }

  showModal(
    "Delete SBA Marks",
    "<p>This will permanently delete <strong>all SBA marks</strong> for <strong>" +
      sanitizeDisplayValue(classLevel) +
      "</strong> — <strong>" +
      sanitizeDisplayValue(subjectName) +
      "</strong> (" +
      sanitizeDisplayValue(term) +
      ", " +
      sanitizeDisplayValue(academicYear) +
      "), along with the corresponding Behaviour Entries for the affected " +
      "students in this class/term.</p><p><strong>This action cannot be undone.</strong></p>",
    [
      {
        label: "Cancel",
        cls: "btn--ghost",
        action: function () {
          closeModal();
        },
      },
      {
        label: "Delete Permanently",
        cls: "btn--danger",
        action: function () {
          closeModal(function () {
            _confirmDeleteSbaClassMarks(classLevel, academicYear, term, subjectId);
          });
        },
      },
    ],
  );
}

// Performs the actual delete-class-marks server call for SBA.
function _confirmDeleteSbaClassMarks(classLevel, academicYear, term, subjectId) {
  showSpinner();
  callServer(
    "deleteSbaClassMarks",
    { classLevel: classLevel, academicYear: academicYear, term: term, subjectId: subjectId },
    SESSION.token,
  ).then(
    function (result) {
      hideSpinner();
      if (!result) {
        showToast("Delete failed. Please try again.", "error");
        return;
      }
      if (_handleSessionCodes(result)) return;
      if (!result.success) {
        showToast(result.message || "Could not delete class marks.", "error");
        return;
      }
      showToast(result.message || "Class marks deleted.", "success");
      SBA_EXISTING = {};
      renderSbaGrid(document.getElementById("sbaGridWrapper"), SBA_STUDENTS, {}, false);
      // re-capture the card-view controller after re-render (old one is now stale).
      SBA_CARD_CONTROLLER = renderSbaCardView(
        document.getElementById("sbaCardWrapper"),
        SBA_STUDENTS,
        {},
        false,
      );
    },
    function (err) {
      hideSpinner();
      showToast(friendlyErrorFrontend(err ? err.message : ""), "error");
    },
  );
}

// Returns true (after forcing logout) if the result carries an INACTIVE/UNAUTHORIZED code.
function _handleSessionCodes(result) {
  if (result && result.code === "INACTIVE") {
    forcedLogout();
    return true;
  }
  if (result && result.code === "UNAUTHORIZED") {
    forcedLogout("session_updated");
    return true;
  }
  return false;
}

// Logs the teacher out and redirects to Login.
function doLogout() {
  var btn = document.getElementById("btnLogout");
  if (btn) btn.disabled = true;
  logout(SESSION.token || getTeacherSession().token);
}

// Clears the session and redirects to Login, with an optional suspension reason.
function forcedLogout(reason) {
  redirectToLogin("error=" + (reason || "suspended"));
}

startTeacherDashboard_();
