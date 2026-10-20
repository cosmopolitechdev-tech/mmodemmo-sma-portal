// Admin dashboard, ported from gas/AdminDashboard.html's page script (same functions, in the
// same order, so a change there is easy to find and mirror here). Server calls go through
// callServer() with named fields; template buttons use data-on* actions (portal.js §28).

var ADMIN_TOKEN = "";
var TEACHERS_CACHE = [];
var TEACHERS_PAGE = 1;
var TEACHERS_PER_PAGE = 20;
var TEACHERS_FILTERED = [];
var CURRENT_SECTION = "";
// Stores field configs fetched by buildAddTeacherSection so that
// submitAddTeacher() can run real validation without re-fetching.
var _ADD_TEACHER_FIELD_CONFIGS = [];
// Current academic year as configured by the Tkinter desktop app, fetched from
// getSyncStatus().
var ADMIN_ACADEMIC_YEAR = "";
// Current term, mirrors ADMIN_ACADEMIC_YEAR — used to default the Term filter in Export
// Data instead of leaving it on "All".
var ADMIN_SBA_SUBJECTS_REF = [];
var ADMIN_SBA_GHANAIAN_LANG = "";
var ADMIN_SBA_REF_LOADED = false;
var ADMIN_CURRENT_TERM = "";

// Caches active SBA assignments so doSbaAssign() can duplicate-check client-side
// before its "Subject is required" guard, instead of after a round-trip.
var ADMIN_SBA_ASSIGNMENTS_CACHE = [];

// ───────────────────────────────────────────────────────────────────────────── INIT
// ─────────────────────────────────────────────────────────────────────────────

// ───────────────────────────────────────────────────────────────────────────── SIDEBAR
// ─────────────────────────────────────────────────────────────────────────────

function toggleSidebar() {
  var s = document.getElementById("sidebar");
  var b = document.getElementById("sidebarBackdrop");
  s.classList.toggle("open");
  if (b) b.style.display = s.classList.contains("open") ? "block" : "none";
}

function closeSidebar() {
  var s = document.getElementById("sidebar");
  var b = document.getElementById("sidebarBackdrop");
  s.classList.remove("open");
  if (b) b.style.display = "none";
}

// ───────────────────────────────────────────────────────────────────────────── SECTION ROUTER
// ─────────────────────────────────────────────────────────────────────────────

function showSection(name) {
  closeSidebar();
  CURRENT_SECTION = name;

  // Update active sidebar link
  document.querySelectorAll(".sidebar__link").forEach(function (l) {
    l.classList.remove("active");
    if (
      l.getAttribute("data-onclick") &&
      l.getAttribute("data-onclick").indexOf("'" + name + "'") !== -1
    ) {
      l.classList.add("active");
    }
  });

  var pc = document.getElementById("pageContent");
  setHtml(pc, '<div class="loading-state"><div class="spinner spinner--sm"></div> Loading…</div>');

  var sectionBuilders = {
    allTeachers: buildAllTeachersSection,
    addTeacher: buildAddTeacherSection,
    shareLinks: buildShareLinksSection,
    exportData: buildExportDataSection,
    studentEnrollment: buildStudentEnrollmentSection,
    classAssignments: buildClassAssignmentsSection,
    attendanceRecords: buildAttendanceRecordsSection,
    levyRecords: buildLevyRecordsSection,
    admissionFeeRecords: buildAdmissionFeeRecordsSection,
    tuitionFeeRecords: buildTuitionFeeRecordsSection,
    sbaRecords: buildSbaRecordsSection,
    behaviorStatus: buildBehaviorStatusSection,
    mockExams: buildMockExamsSection,
    purgeLog: buildPurgeLogSection,
    auditLog: buildAuditLogSection,
    settings: buildSettingsSection,
    help: buildHelpSection,
  };

  var builder = sectionBuilders[name];
  if (builder) {
    pc.textContent = "";
    builder(pc);
  } else {
    setHtml(
      pc,
      '<div class="empty-state"><div class="empty-state__title">Section not found</div></div>',
    );
  }
}

// ───────────────────────────────────────────────────────────────────────────── SECTION: ALL TEACHERS
// ─────────────────────────────────────────────────────────────────────────────

function buildAllTeachersSection(container) {
  setHtml(
    container,
    '<div class="section-header">' +
      '<div><div class="section-header__title">All Teachers</div>' +
      '<div class="section-header__subtitle">Manage teacher accounts, PINs, and status</div></div>' +
      "</div>" +
      // Academic Year / Term / Week Number context row — mirrors the Teacher Portal's Attendance
      // tab (attCtxRow in TeacherDashboard.html).
      '<div id="allTeachersCtxRow" style="display:flex;gap:var(--space-5);align-items:center;' +
      'flex-wrap:wrap;margin-bottom:var(--space-4);font-size:var(--font-size-sm);font-weight:600;">' +
      '<span>Academic Year: <strong id="atAcademicYear">—</strong></span>' +
      '<span>Term: <strong id="atTerm">—</strong></span>' +
      '<span>Week: <strong id="atWeekNum">—</strong></span>' +
      "</div>" +
      '<div id="statGrid" class="stat-grid">' +
      '<div class="stat-card stat-card--active"><div class="stat-card__label">Active</div><div class="stat-card__value" id="statActive">…</div></div>' +
      '<div class="stat-card stat-card--error"><div class="stat-card__label">Locked</div><div class="stat-card__value" id="statLocked">…</div></div>' +
      '<div class="stat-card stat-card--warning"><div class="stat-card__label">Pending</div><div class="stat-card__value" id="statPending">…</div></div>' +
      '<div class="stat-card"><div class="stat-card__label">Inactive</div><div class="stat-card__value" id="statInactive">…</div></div>' +
      "</div>" +
      // Male/Female/Total count row for the filtered teacher list — mirrors
      // buildStudentEnrollmentSection()'s #stuEnrollStats pattern.
      '<div id="teacherGenderStats" class="stat-grid" style="margin-bottom:var(--space-4);">' +
      '<div class="stat-card"><div class="stat-card__label">Total</div><div class="stat-card__value" id="teacherStatTotal">…</div></div>' +
      '<div class="stat-card"><div class="stat-card__label">Male</div><div class="stat-card__value" id="teacherStatMale">…</div></div>' +
      '<div class="stat-card"><div class="stat-card__label">Female</div><div class="stat-card__value" id="teacherStatFemale">…</div></div>' +
      "</div>" +
      '<div id="syncMiniCard" class="sync-card"><div class="sync-card__title">Sync Status</div>' +
      '<div class="sync-card__grid" id="syncGrid"><span class="text-muted">Loading…</span></div>' +
      "</div>" +
      '<div id="monitoringPanels">' +
      '<div style="font-weight:600;font-size:var(--font-size-sm);margin:var(--space-4) 0 var(--space-2);">📅 Attendance</div>' +
      '<div class="monitoring-panels">' +
      '<div class="monitoring-panel monitoring-panel--submitted">' +
      '<div class="monitoring-panel__header">✅ Submitted Today</div>' +
      '<div class="monitoring-panel__list" id="attSubmittedTodayList"><div class="monitoring-panel__empty">Loading…</div></div>' +
      "</div>" +
      '<div class="monitoring-panel monitoring-panel--pending">' +
      '<div class="monitoring-panel__header">⏳ Not Yet Submitted Today</div>' +
      '<div class="monitoring-panel__list" id="attNotSubmittedList"><div class="monitoring-panel__empty">Loading…</div></div>' +
      "</div>" +
      "</div>" +
      '<div style="font-weight:600;font-size:var(--font-size-sm);margin:var(--space-4) 0 var(--space-2);">💰 <span id="levyMonitorHeading">' +
      sanitizeDisplayValue(getLevyLabel("Daily Levy")) +
      "</span></div>" +
      '<div class="monitoring-panels">' +
      '<div class="monitoring-panel monitoring-panel--submitted">' +
      '<div class="monitoring-panel__header">✅ Submitted Today</div>' +
      '<div class="monitoring-panel__list" id="levySubmittedTodayList"><div class="monitoring-panel__empty">Loading…</div></div>' +
      "</div>" +
      '<div class="monitoring-panel monitoring-panel--pending">' +
      '<div class="monitoring-panel__header">⏳ Not Yet Submitted Today</div>' +
      '<div class="monitoring-panel__list" id="levyNotSubmittedList"><div class="monitoring-panel__empty">Loading…</div></div>' +
      "</div>" +
      "</div>" +
      '<div style="font-weight:600;font-size:var(--font-size-sm);margin:var(--space-4) 0 var(--space-2);">📊 SBA Marks</div>' +
      '<div class="monitoring-panel monitoring-panel--submitted monitoring-panel--sba">' +
      '<div class="monitoring-panel__header">✅ Submitted SBA Marks</div>' +
      '<div class="monitoring-panel__list" id="sbaSubmittedList"><div class="monitoring-panel__empty">Loading…</div></div>' +
      "</div>" +
      '<div style="font-weight:600;font-size:var(--font-size-sm);margin:var(--space-4) 0 var(--space-2);">🎓 Mock Exams</div>' +
      '<div class="monitoring-panel monitoring-panel--submitted monitoring-panel--sba">' +
      '<div class="monitoring-panel__header">✅ Submitted Mock Exam Marks</div>' +
      '<div class="monitoring-panel__list" id="mockSubmittedList"><div class="monitoring-panel__empty">Loading…</div></div>' +
      "</div>" +
      "</div>" +
      '<div class="filter-row">' +
      searchBoxWithClear(
        '<input type="text" id="teacherSearch" class="search-box__input" placeholder="Search by name or staff ID…" data-oninput="toggleSearchClear(this);debounceTeacherSearch()" />',
        "teacherSearch",
        "300px",
      ) +
      '<select class="filter-select" id="filterStatus" data-onchange="filterAndRenderTeachers()">' +
      '<option value="">All Statuses</option>' +
      '<option value="Active">Active</option>' +
      '<option value="Inactive">Inactive</option>' +
      '<option value="Locked">Locked</option>' +
      '<option value="Pending">Pending</option>' +
      "</select>" +
      '<button class="btn btn--outline" data-onclick="confirmBulkPINs()" title="Make PINs for many teachers at once and save them as a PDF">🔑 PINs for All Teachers (PDF)</button>' +
      "</div>" +
      '<div id="teacherTableWrapper" class="table-wrapper">' +
      '<div class="loading-state"><div class="spinner spinner--sm"></div> Loading teachers…</div>' +
      "</div>" +
      '<div class="pagination" id="teacherPagination"></div>',
  );

  loadAllTeachersData();
}

var _teacherSearchDebounce;
function debounceTeacherSearch() {
  clearTimeout(_teacherSearchDebounce);
  _teacherSearchDebounce = setTimeout(filterAndRenderTeachers, 350);
}

function loadAllTeachersData() {
  // ── Fast path: if cache is warm, render teachers immediately and refresh secondary panels (status /
  // sync) in the background.
  if (TEACHERS_CACHE.length > 0) {
    _applyTeachersToUI(TEACHERS_CACHE);
    _loadSecondaryPanels();
    // Also silently refresh the teacher list in the background so the table picks up any server-side
    // changes (e.g. PIN resets, new teachers added by the desktop app) without blocking the UI.
    _refreshTeacherListSilently();
    return;
  }

  // ── Cold path: no cache — show spinner and fetch everything.
  showSpinner();
  var teachersDone = false;
  var watchdogFired = false;

  var watchdogTimer = setTimeout(function () {
    if (teachersDone) return;
    watchdogFired = true;
    hideSpinner();
    _setText("statActive", "—");
    _setText("statLocked", "—");
    _setText("statPending", "—");
    _setText("statInactive", "—");
    // reset the new gender stat row alongside the existing status stat row on load timeout.
    _setText("teacherStatTotal", "—");
    _setText("teacherStatMale", "—");
    _setText("teacherStatFemale", "—");
    _renderMonitoringPanelsError();
    _renderSyncCardError();
    _showTeachersLoadError(
      "Loading is taking longer than expected. Check your connection and retry.",
    );
  }, 45000);

  // Fetch teachers — primary call; spinner hides when this resolves.
  callServer("getTeachersForAdmin", {}, ADMIN_TOKEN).then(
    function (r) {
      if (watchdogFired) return;
      teachersDone = true;
      clearTimeout(watchdogTimer);
      hideSpinner();
      if (!r || !r.success) {
        if (r && r.code === "UNAUTHORIZED") {
          forceAdminLogout();
          return;
        }
        console.error("getTeachersForAdmin returned failure:", r);
        _setText("statActive", "—");
        _setText("statLocked", "—");
        _setText("statPending", "—");
        _setText("statInactive", "—");
        // reset the new gender stat row alongside the existing status stat row on a failed
        // getTeachersForAdmin() response.
        _setText("teacherStatTotal", "—");
        _setText("teacherStatMale", "—");
        _setText("teacherStatFemale", "—");
        _showTeachersLoadError(
          r && r.message ? r.message : "Could not load teachers. Check your connection and retry.",
        );
        return;
      }
      TEACHERS_CACHE = r.teachers || [];
      _applyTeachersToUI(TEACHERS_CACHE);
    },
    function (e) {
      if (watchdogFired) return;
      teachersDone = true;
      clearTimeout(watchdogTimer);
      hideSpinner();
      _showTeachersLoadError(
        e && e.message ? e.message : "Could not load teachers. Check your connection and retry.",
      );
    },
  );

  // Secondary calls — independent; do not block teachers table.
  _loadSecondaryPanels();
}

// Render the teachers table and stat cards from a given array.
function _applyTeachersToUI(teachers) {
  TEACHERS_PAGE = 1;
  // Stat cards — computed separately so a malformed status value never
  // suppresses the teacher table render.
  try {
    var counts = { Active: 0, Inactive: 0, Locked: 0, Pending: 0 };
    teachers.forEach(function (t) {
      var s = t.account_status || "Pending";
      if (counts[s] !== undefined) counts[s]++;
    });
    _setText("statActive", counts.Active);
    _setText("statLocked", counts.Locked);
    _setText("statPending", counts.Pending);
    _setText("statInactive", counts.Inactive);
  } catch (ex) {
    console.error("_applyTeachersToUI stat-count error:", ex);
    _setText("statActive", "—");
    _setText("statLocked", "—");
    _setText("statPending", "—");
    _setText("statInactive", "—");
  }
  // Teacher table — rendered independently of stat cards. filterAndRenderTeachers() has its own per-row
  // guard so a single bad record never wipes the whole table.
  filterAndRenderTeachers();
}

// Fire the status-counts and sync-status calls independently.
// Each renders (or shows an error) as soon as it resolves.
function _loadSecondaryPanels() {
  callServer("getUpdateStatusCounts", {}, ADMIN_TOKEN).then(
    function (r) {
      if (_checkAuthCode(r)) return;
      if (r && r.success) {
        _renderMonitoringPanels(r);
      } else {
        _renderMonitoringPanelsError();
      }
    },
    function () {
      _renderMonitoringPanelsError();
    },
  );

  callServer("getSyncStatus", {}, ADMIN_TOKEN).then(
    function (r) {
      if (_checkAuthCode(r)) return;
      if (r && r.success) {
        ADMIN_ACADEMIC_YEAR = r.academicYear || "";
        _renderSyncCard(r);
        // populate the Academic Year/Term/Week Number row from this same getSyncStatus() round-trip —
        // no extra network call needed.
        _renderAllTeachersWeekInfo(r);
      } else {
        _renderSyncCardError();
        _renderAllTeachersWeekInfoError();
      }
    },
    function () {
      _renderSyncCardError();
      _renderAllTeachersWeekInfoError();
    },
  );

  // Submitted SBA Marks panel — independent call, renders/errors on its own so a slow or
  // failing SBA fetch never blocks the Attendance/Levy panels or the Sync Status card above.
  callServer("getSbaSubmissionStatusForAdmin", {}, ADMIN_TOKEN).then(
    function (r) {
      if (_checkAuthCode(r)) return;
      if (r && r.success) {
        _renderSbaSubmissionPanel(r);
      } else {
        _renderSbaSubmissionPanelError();
      }
    },
    function () {
      _renderSbaSubmissionPanelError();
    },
  );

  // Submitted Mock Exam Marks panel — independent call, mirrors the SBA Marks call above
  // so a slow or failing Mock fetch never blocks any other panel.
  callServer("getMockSubmissionStatusForAdmin", {}, ADMIN_TOKEN).then(
    function (r) {
      if (_checkAuthCode(r)) return;
      if (r && r.success) {
        _renderMockSubmissionPanel(r);
      } else {
        _renderMockSubmissionPanelError();
      }
    },
    function () {
      _renderMockSubmissionPanelError();
    },
  );
}

// Silent background refresh of the teacher list — updates TEACHERS_CACHE
// and re-renders the table if the section is still visible.
function _refreshTeacherListSilently() {
  callServer("getTeachersForAdmin", {}, ADMIN_TOKEN).then(
    function (r) {
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) return;
      // Only update the UI if the allTeachers section is still mounted.
      if (!document.getElementById("teacherTableWrapper")) return;
      TEACHERS_CACHE = r.teachers || [];
      _applyTeachersToUI(TEACHERS_CACHE);
    },
    function () {
      /* silent — stale cache is fine */
    },
  );
}

// getUpdateStatusCounts() returns { attendance: {...}, levy: {...} }
// rather than one combined pair, so each duty type renders its own panel.
function _renderMonitoringPanels(r) {
  _renderDutyPanel("att", r.attendance);
  _renderDutyPanel("levy", r.levy);
}

function _renderDutyPanel(prefix, dutyData) {
  var subList = document.getElementById(prefix + "SubmittedTodayList");
  var notList = document.getElementById(prefix + "NotSubmittedList");
  if (!subList || !notList) return;

  var d = dutyData || { submittedToday: [], notSubmittedToday: [] };

  function _renderItem(t) {
    return (
      '<div class="monitoring-panel__item">' +
      "<span>" +
      sanitizeDisplayValue(t.fullName) +
      "</span>" +
      '<span class="badge badge--neutral" style="font-size:10px;">' +
      sanitizeDisplayValue(t.staffId) +
      "</span>" +
      "</div>"
    );
  }

  if ((d.submittedToday || []).length === 0) {
    setHtml(subList, '<div class="monitoring-panel__empty">No submissions yet today.</div>');
  } else {
    setHtml(subList, (d.submittedToday || []).map(_renderItem).join(""));
  }

  if ((d.notSubmittedToday || []).length === 0) {
    setHtml(
      notList,
      '<div class="monitoring-panel__empty">All assigned teachers have submitted today.</div>',
    );
  } else {
    setHtml(notList, (d.notSubmittedToday || []).map(_renderItem).join(""));
  }
}

function _renderSyncCard(r) {
  var grid = document.getElementById("syncGrid");
  if (!grid) return;
  var items = [
    {
      label: "Attendance pending",
      value: r.attendancePending || 0,
      warn: (r.attendancePending || 0) > 0,
    },
    {
      label: getLevyLabel("Daily Levy") + " pending",
      value: r.levyPending || 0,
      warn: (r.levyPending || 0) > 0,
    },
    {
      label: "Last attendance pull",
      value: r.lastAttendancePull ? formatTimestamp(r.lastAttendancePull) : "—",
      warn: false,
    },
    {
      label: "Last " + getLevyLabel("Daily Levy") + " pull",
      value: r.lastLevyPull ? formatTimestamp(r.lastLevyPull) : "—",
      warn: false,
    },
    {
      label: "Last teacher sync",
      value: r.lastTeacherSync ? formatTimestamp(r.lastTeacherSync) : "—",
      warn: false,
    },
    {
      label: "Last student sync",
      value: r.lastStudentSync ? formatTimestamp(r.lastStudentSync) : "—",
      warn: false,
    },
  ];
  setHtml(
    grid,
    items
      .map(function (i) {
        return (
          '<div class="sync-card__item">' +
          '<span class="sync-card__dot ' +
          (i.warn ? "sync-card__dot--warn" : "") +
          '"></span>' +
          '<span class="sync-card__label">' +
          sanitizeDisplayValue(i.label) +
          "</span>" +
          '<span class="sync-card__value">' +
          sanitizeDisplayValue(String(i.value)) +
          "</span>" +
          "</div>"
        );
      })
      .join(""),
  );
}

// error+retry renderer for the teacher table area.
// Mirrors the pattern already used by _showShareLinksError() (B13).
function _showTeachersLoadError(msg) {
  var wrapper = document.getElementById("teacherTableWrapper");
  if (wrapper) {
    setHtml(
      wrapper,
      '<div class="empty-state">' +
        '<div class="empty-state__icon">⚠️</div>' +
        '<div class="empty-state__title">' +
        sanitizeDisplayValue(msg) +
        "</div>" +
        '<div class="empty-state__body">' +
        '<button class="btn btn--outline btn--sm" data-onclick="loadAllTeachersData()" style="margin-top:8px;">🔄 Retry</button>' +
        "</div></div>",
    );
  }
  var pagination = document.getElementById("teacherPagination");
  if (pagination) pagination.textContent = "";
}

// Error state for the Submitted Today / Not Submitted panels.
function _renderMonitoringPanelsError() {
  var ids = [
    "attSubmittedTodayList",
    "attNotSubmittedList",
    "levySubmittedTodayList",
    "levyNotSubmittedList",
  ];
  var msg =
    '<div class="monitoring-panel__empty">Could not load. ' +
    '<button class="btn btn--outline btn--sm" data-onclick="loadAllTeachersData()">🔄 Retry</button></div>';
  ids.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) setHtml(el, msg);
  });
}

// Renders the "Submitted SBA Marks" panel — one row per teacher who has submitted at
// least one active SBA assignment's marks.
function _renderSbaSubmissionPanel(r) {
  var list = document.getElementById("sbaSubmittedList");
  if (!list) return;
  var submitted = (r && r.submitted) || [];
  if (submitted.length === 0) {
    setHtml(list, '<div class="monitoring-panel__empty">No SBA marks submitted yet.</div>');
    return;
  }
  setHtml(
    list,
    submitted
      .map(function (t) {
        return (
          '<div class="sba-teacher-row">' +
          '<div class="sba-teacher-name">' +
          sanitizeDisplayValue(t.fullName) +
          "</div>" +
          '<div class="sba-teacher-items-scroll"><div class="sba-teacher-items">' +
          sanitizeDisplayValue((t.items || []).join(", ")) +
          "</div></div>" +
          "</div>"
        );
      })
      .join(""),
  );
}

// Renders the "Submitted Mock Exam Marks" panel — one row per teacher who has submitted
// at least one active Mock-assigned class/subject. Mirrors _renderSbaSubmissionPanel().
function _renderMockSubmissionPanel(r) {
  var list = document.getElementById("mockSubmittedList");
  if (!list) return;
  var submitted = (r && r.submitted) || [];
  if (submitted.length === 0) {
    setHtml(list, '<div class="monitoring-panel__empty">No Mock Exam marks submitted yet.</div>');
    return;
  }
  setHtml(
    list,
    submitted
      .map(function (t) {
        return (
          '<div class="sba-teacher-row">' +
          '<div class="sba-teacher-name">' +
          sanitizeDisplayValue(t.fullName) +
          "</div>" +
          '<div class="sba-teacher-items-scroll"><div class="sba-teacher-items">' +
          sanitizeDisplayValue((t.items || []).join(", ")) +
          "</div></div>" +
          "</div>"
        );
      })
      .join(""),
  );
}

// Error state for the Mock Exam Marks panel — mirrors _renderSbaSubmissionPanelError().
function _renderMockSubmissionPanelError() {
  var list = document.getElementById("mockSubmittedList");
  if (list)
    setHtml(
      list,
      '<div class="monitoring-panel__empty">Could not load. ' +
        '<button class="btn btn--outline btn--sm" data-onclick="loadAllTeachersData()">🔄 Retry</button></div>',
    );
}

// Error state for the SBA Marks panel — mirrors _renderMockSubmissionPanelError().
function _renderSbaSubmissionPanelError() {
  var list = document.getElementById("sbaSubmittedList");
  if (list)
    setHtml(
      list,
      '<div class="monitoring-panel__empty">Could not load. ' +
        '<button class="btn btn--outline btn--sm" data-onclick="loadAllTeachersData()">🔄 Retry</button></div>',
    );
}

// Error state for the Sync Status mini-card.
function _renderSyncCardError() {
  var grid = document.getElementById("syncGrid");
  if (grid) setHtml(grid, '<span class="text-muted">Could not load sync status.</span>');
}

// Renders the Academic Year / Term / Week Number context row in the
// All Teachers section, mirroring the Teacher Portal's Attendance tab.
function _renderAllTeachersWeekInfo(r) {
  var yrEl = document.getElementById("atAcademicYear");
  var tmEl = document.getElementById("atTerm");
  var wkEl = document.getElementById("atWeekNum");
  if (!yrEl || !tmEl || !wkEl) return;
  yrEl.textContent = r.academicYear || "—";
  tmEl.textContent = r.currentTerm || "—";
  if (r.termStartDate) {
    // Passing r.vacationDate freezes this label at the vacation week instead of
    // growing indefinitely — same fix as Code.gs/JavaScript.html/TeacherDashboard.html.
    var wk = calculateWeekNumber(_todayISO(), r.termStartDate, [], r.vacationDate || "");
    wkEl.textContent = wk || "—";
  } else {
    wkEl.textContent = "—";
  }
}

// Error state for the context row — mirrors _renderSyncCardError()/_renderMonitoringPanelsError().
function _renderAllTeachersWeekInfoError() {
  ["atAcademicYear", "atTerm", "atWeekNum"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.textContent = "—";
  });
}

function filterAndRenderTeachers() {
  var query = document.getElementById("teacherSearch")
    ? document.getElementById("teacherSearch").value.toLowerCase()
    : "";
  var status = document.getElementById("filterStatus")
    ? document.getElementById("filterStatus").value
    : "";

  TEACHERS_FILTERED = TEACHERS_CACHE.filter(function (t) {
    if (query) {
      var haystack = (
        (t.first_name || "") +
        " " +
        (t.middle_name || "") +
        " " +
        (t.surname || "") +
        " " +
        (t.staff_id || "")
      ).toLowerCase();
      if (haystack.indexOf(query) === -1) return false;
    }
    if (status && String(t.account_status || "") !== status) return false;
    return true;
  });

  TEACHERS_PAGE = 1;
  // Refresh the Male/Female/Total stat row for the current filtered
  // list, before renderTeacherTable() so it resets to 0/0/0 on no matches.
  _updateTeacherGenderStats(TEACHERS_FILTERED);
  renderTeacherTable();
}

function renderTeacherTable() {
  var wrapper = document.getElementById("teacherTableWrapper");
  var pagination = document.getElementById("teacherPagination");
  if (!wrapper) return;

  var total = TEACHERS_FILTERED.length;
  var pages = Math.max(1, Math.ceil(total / TEACHERS_PER_PAGE));
  var start = (TEACHERS_PAGE - 1) * TEACHERS_PER_PAGE;
  var slice = TEACHERS_FILTERED.slice(start, start + TEACHERS_PER_PAGE);

  if (total === 0) {
    setHtml(
      wrapper,
      '<div class="empty-state"><div class="empty-state__icon">👥</div>' +
        '<div class="empty-state__title">No teachers found</div>' +
        '<div class="empty-state__body">Try adjusting your search or filters.</div></div>',
    );
    if (pagination) pagination.textContent = "";
    return;
  }

  var rows = slice
    .map(function (t) {
      try {
        var status = t.account_status || "Pending";
        var badgeCls =
          {
            Active: "badge--active",
            Inactive: "badge--inactive",
            Locked: "badge--locked",
            Pending: "badge--pending",
          }[status] || "badge--neutral";
        var fullName = [t.first_name, t.middle_name, t.surname].filter(Boolean).join(" ");
        var lastSub = t.last_submission_date || "—";
        var lastLog = t.last_login ? formatTimestamp(t.last_login) : "—";
        var sidSafe = sanitizeDisplayValue(t.staff_id || "");

        // Action buttons
        var toggleBtn = "";
        if (status === "Active" || status === "Pending") {
          toggleBtn =
            '<button class="btn btn--danger btn--sm" data-onclick="deactivateTeacher(\'' +
            sidSafe +
            '\')" title="Deactivate — teacher will not be able to log in and all active sessions will be ended immediately. Use Reactivate to restore access.">Deactivate</button>';
        } else if (status === "Inactive") {
          toggleBtn =
            '<button class="btn btn--success btn--sm" data-onclick="reactivateTeacher(\'' +
            sidSafe +
            '\')" title="Reactivate — restores login access for this teacher. Their existing PIN still works.">Reactivate</button>';
        } else if (status === "Locked") {
          toggleBtn =
            '<button class="btn btn--outline btn--sm" data-onclick="unlockTeacher(\'' +
            sidSafe +
            '\')" title="Unlock — clears failed login attempts and restores access after the account was auto-locked (too many wrong PIN attempts). Their existing PIN still works.">Unlock</button>';
        }

        return (
          "<tr>" +
          '<td style="font-family:var(--font-mono);font-size:var(--font-size-xs);">' +
          sanitizeDisplayValue(t.staff_id || "") +
          "</td>" +
          '<td class="col-sticky-name">' +
          sanitizeDisplayValue(fullName) +
          "</td>" +
          '<td class="text-center">' +
          sanitizeDisplayValue(t.school_level || "—") +
          "</td>" +
          '<td style="font-size:var(--font-size-xs);text-align:center;">' +
          sanitizeDisplayValue(t.current_rank || "—") +
          "</td>" +
          '<td style="font-family:var(--font-mono);font-size:var(--font-size-xs);text-align:center;">' +
          sanitizeDisplayValue(t.staff_contact || "—") +
          "</td>" +
          '<td style="text-align:center;"><span class="badge ' +
          badgeCls +
          '">' +
          sanitizeDisplayValue(status) +
          "</span></td>" +
          '<td style="font-size:var(--font-size-xs);text-align:center;">' +
          sanitizeDisplayValue(lastSub) +
          "</td>" +
          '<td style="font-size:var(--font-size-xs);text-align:center;">' +
          sanitizeDisplayValue(lastLog) +
          "</td>" +
          '<td class="table-actions">' +
          '<button class="btn btn--ghost btn--sm" data-onclick="openEditTeacherModal(\'' +
          sidSafe +
          '\')" title="Edit Profile">✏️ Edit</button>' +
          '<button class="btn btn--outline btn--sm" data-onclick="doResetPIN(\'' +
          sidSafe +
          '\')" title="Reset PIN">🔑 PIN</button>' +
          toggleBtn +
          '<button class="btn btn--outline btn--sm" data-onclick="doCorrectStaffId(\'' +
          sidSafe +
          '\')" title="Correct Staff ID — changes the teacher\'s login ID and updates every duty assignment tied to it. Cannot be undone by editing again.">🆔 Correct ID</button>' +
          '<button class="btn btn--danger btn--sm" data-onclick="doDeleteTeacher(\'' +
          sidSafe +
          '\')" title="Delete permanently — removes this teacher from the portal and from the Desktop Application. Cannot be undone.">🗑 Delete</button>' +
          "</td>" +
          "</tr>"
        );
      } catch (rowEx) {
        console.error(
          "renderTeacherTable: error rendering row for staff_id=" +
            (t && t.staff_id ? t.staff_id : "unknown") +
            ":",
          rowEx,
        );
        // Render a clearly-marked placeholder row so the malformed
        // record is visible to the admin without breaking the rest.
        return (
          '<tr style="opacity:0.6;">' +
          '<td style="font-family:var(--font-mono);font-size:var(--font-size-xs);">' +
          sanitizeDisplayValue(t && t.staff_id ? String(t.staff_id) : "?") +
          "</td>" +
          '<td colspan="7" style="color:var(--color-error);font-size:var(--font-size-xs);">' +
          "⚠️ Could not render this record — check console for details." +
          "</td>" +
          "<td></td>" +
          "</tr>"
        );
      }
    })
    .join("");

  setHtml(
    wrapper,
    '<table class="table table--striped">' +
      "<thead><tr>" +
      '<th>Staff ID</th><th class="col-sticky-name">Full Name</th>' +
      '<th style="text-align:center;">School Level</th>' +
      '<th style="text-align:center;">Rank</th>' +
      '<th style="text-align:center;">Phone</th>' +
      '<th style="text-align:center;">Status</th>' +
      '<th style="text-align:center;">Last Submission</th>' +
      '<th style="text-align:center;">Last Login</th>' +
      "<th>Actions</th>" +
      "</tr></thead>" +
      "<tbody>" +
      rows +
      "</tbody>" +
      "</table>",
  );

  // Pagination
  if (pagination) {
    var html = "";
    if (TEACHERS_PAGE > 1)
      html +=
        '<button class="page-btn" data-onclick="goTeacherPage(' +
        (TEACHERS_PAGE - 1) +
        ')">‹</button>';
    for (var p = Math.max(1, TEACHERS_PAGE - 2); p <= Math.min(pages, TEACHERS_PAGE + 2); p++) {
      html +=
        '<button class="page-btn ' +
        (p === TEACHERS_PAGE ? "active" : "") +
        '" data-onclick="goTeacherPage(' +
        p +
        ')">' +
        p +
        "</button>";
    }
    if (TEACHERS_PAGE < pages)
      html +=
        '<button class="page-btn" data-onclick="goTeacherPage(' +
        (TEACHERS_PAGE + 1) +
        ')">›</button>';
    html += '<span class="page-info">' + total + " teacher" + (total !== 1 ? "s" : "") + "</span>";
    setHtml(pagination, html);
  }
}

function goTeacherPage(p) {
  TEACHERS_PAGE = p;
  renderTeacherTable();
}

// ───────────────────────────────────────────────────────────────────────────── TEACHER ACTIONS
// ─────────────────────────────────────────────────────────────────────────────

function doResetPIN(staffId) {
  // Uses showModal() instead of the native confirm() dialog so it can be styled/branded.
  showModal(
    "Generate New PIN",
    "<p>Generate a new PIN for <strong>" +
      sanitizeDisplayValue(_teacherDisplayName(staffId)) +
      "</strong>?</p>" +
      '<p style="margin-top:var(--space-3);color:var(--text-secondary);font-size:var(--font-size-sm);">' +
      "The current PIN will stop working immediately and all active sessions will be ended." +
      "</p>",
    [
      { label: "Cancel", cls: "btn--ghost", action: closeModal },
      {
        label: "Generate New PIN",
        cls: "btn--danger",
        action: function () {
          closeModal(function () {
            _executeResetPIN(staffId);
          });
        },
      },
    ],
  );
}

// Runs only after the admin confirms via the modal above.
function _executeResetPIN(staffId) {
  showSpinner();
  callServer("resetTeacherPIN", { staffId: staffId }, ADMIN_TOKEN).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        showToast(r ? r.message : "Reset failed.", "error");
        return;
      }
      var newPin = String(r.plainPin || "");
      showModal(
        "New PIN for " + _teacherDisplayName(staffId),
        '<p style="margin-bottom:var(--space-3);">Share this PIN with <strong>' +
          sanitizeDisplayValue(_teacherDisplayName(staffId)) +
          "</strong> through a <strong>secure private channel</strong>. It will not be shown again.</p>" +
          '<div class="pin-display">' +
          sanitizeDisplayValue(newPin) +
          "</div>" +
          '<div class="pin-warning">Write it down before closing this dialog. Once dismissed, this PIN cannot be retrieved.</div>',
        [
          {
            label: "📋 Copy PIN",
            cls: "btn--outline",
            action: function () {
              copyTextToClipboard(newPin, "PIN copied.", "Could not copy automatically. PIN: ");
            },
          },
          {
            label: "I have noted this PIN",
            cls: "btn--accent",
            action: closeModal,
          },
        ],
      );
      _refreshTeacherInCache(staffId, r.accountStatus);
      renderTeacherTable();
    },
    function (e) {
      hideSpinner();
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

// Inactive teachers never get a PIN from here; the server applies the same rule.
function confirmBulkPINs() {
  var eligible = TEACHERS_CACHE.filter(function (t) {
    return t.account_status !== "Inactive" && !t._renderError;
  });
  var missing = eligible.filter(function (t) {
    return !t.hasPinSet;
  }).length;
  showModal(
    "Make teacher PINs",
    "<p>Who should get a new PIN?</p>" +
      '<ul style="margin:var(--space-3) 0;padding-left:var(--space-5);">' +
      "<li><strong>Teachers Without a PIN</strong>: " + missing + " teacher(s) who have no PIN yet. Everyone else keeps their PIN.</li>" +
      "<li><strong>All Teachers</strong>: " + eligible.length + " teacher(s) get a new PIN. Their old PINs stop working and they must sign in again.</li>" +
      "</ul>" +
      '<p style="color:var(--text-secondary);font-size:var(--font-size-sm);">The PINs download as a PDF. Print it, cut out the slips and give each teacher their own. Inactive teachers are left out.</p>',
    [
      { label: "Cancel", cls: "btn--ghost", action: closeModal },
      {
        label: "All Teachers",
        cls: "btn--danger",
        action: function () {
          closeModal(function () {
            _executeBulkPINs(false);
          });
        },
      },
      {
        label: "Teachers Without a PIN",
        cls: "btn--accent",
        action: function () {
          closeModal(function () {
            _executeBulkPINs(true);
          });
        },
      },
    ],
  );
}

function _executeBulkPINs(onlyMissing) {
  showSpinner();
  callServer("resetAllTeacherPINs", { onlyMissing: onlyMissing }, ADMIN_TOKEN).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        showToast(r && r.message ? r.message : "Could not generate the PINs.", "error");
        return;
      }
      if (!r.count) {
        showToast(onlyMissing ? "Every teacher already has a PIN." : "No teachers to give a PIN to.", "info");
        return;
      }
      (r.teachers || []).forEach(function (t) {
        _refreshTeacherInCache(t.staffId, t.accountStatus);
        TEACHERS_CACHE.forEach(function (c) {
          if (c.staff_id === t.staffId) c.hasPinSet = true;
        });
      });
      renderTeacherTable();
      _showBulkPINsSaved(r);
    },
    function (e) {
      hideSpinner();
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

function _showBulkPINsSaved(r) {
  if (!r.pdfBase64) {
    showModal(
      "PDF not made",
      "<p>" + r.count + " teacher(s) got a new PIN, but the PDF could not be made, so you cannot see the PINs. " +
        "Try again: click <strong>PINs for All Teachers (PDF)</strong> and choose <strong>All Teachers</strong>.</p>",
      [{ label: "Close", cls: "btn--ghost", action: closeModal }],
    );
    return;
  }
  var save = function () {
    downloadFile(r.pdfBase64, r.pdfFilename || "Teacher_PINs.pdf", "application/pdf");
  };
  save();
  showModal(
    "PINs saved to PDF",
    "<p>The PDF with " + r.count + " PIN(s) is downloading. If you cannot find it, tap <strong>Download Again</strong>.</p>" +
      '<div class="pin-warning">Keep the PDF safe. After you close this box, the PINs cannot be shown again.</div>',
    [
      { label: "📄 Download Again", cls: "btn--outline", action: save },
      { label: "Done", cls: "btn--accent", action: closeModal },
    ],
  );
}

function deactivateTeacher(staffId) {
  showModal(
    "Deactivate Teacher",
    "<p>Deactivate teacher <strong>" +
      sanitizeDisplayValue(_teacherDisplayName(staffId)) +
      "</strong>?</p>" +
      '<p style="margin-top:var(--space-3);color:var(--text-secondary);font-size:var(--font-size-sm);">' +
      "They will not be able to log in. All active sessions will be ended." +
      "</p>",
    [
      { label: "Cancel", cls: "btn--ghost", action: closeModal },
      {
        label: "Deactivate",
        cls: "btn--danger",
        action: function () {
          closeModal(function () {
            _executeDeactivateTeacher(staffId);
          });
        },
      },
    ],
  );
}

// Runs only after the admin confirms via the styled modal above.
function _executeDeactivateTeacher(staffId) {
  showSpinner();
  callServer("deactivateTeacher", { staffId: staffId }, ADMIN_TOKEN).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        showToast(r ? r.message : "Failed.", "error");
        return;
      }
      showToast("Teacher deactivated.", "success");
      _refreshTeacherInCache(staffId, "Inactive");
      renderTeacherTable();
    },
    function (e) {
      hideSpinner();
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

function reactivateTeacher(staffId) {
  showSpinner();
  callServer("reactivateTeacher", { staffId: staffId }, ADMIN_TOKEN).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        showToast(r ? r.message : "Failed.", "error");
        return;
      }
      showToast("Teacher reactivated.", "success");
      _refreshTeacherInCache(staffId, "Active");
      renderTeacherTable();
    },
    function (e) {
      hideSpinner();
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

function unlockTeacher(staffId) {
  showSpinner();
  callServer("unlockTeacher", { staffId: staffId }, ADMIN_TOKEN).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        showToast(r ? r.message : "Failed.", "error");
        return;
      }
      showToast("Teacher unlocked.", "success");
      _refreshTeacherInCache(staffId, "Active");
      renderTeacherTable();
    },
    function (e) {
      hideSpinner();
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

// "Full Name (Staff ID)" so the admin can tell which teacher a dialog is about.
function _teacherDisplayName(staffId) {
  var name = "";
  TEACHERS_CACHE.some(function (t) {
    if (String(t.staff_id) !== String(staffId)) return false;
    name = [t.first_name, t.middle_name, t.surname].filter(Boolean).join(" ");
    return true;
  });
  return name ? name + " (" + staffId + ")" : String(staffId);
}

function _refreshTeacherInCache(staffId, newStatus) {
  TEACHERS_CACHE.forEach(function (t) {
    if (t.staff_id === staffId && newStatus) t.account_status = newStatus;
  });
  TEACHERS_FILTERED.forEach(function (t) {
    if (t.staff_id === staffId && newStatus) t.account_status = newStatus;
  });
}

// Confirm modal for a permanent delete: the admin must type DELETE before onConfirm runs.
function _confirmPermanentDelete(title, whoHtml, consequence, onConfirm) {
  showModal(
    title,
    "<p>Delete <strong>" +
      whoHtml +
      "</strong> permanently?</p>" +
      '<p style="margin-top:var(--space-3);color:var(--text-secondary);font-size:var(--font-size-sm);">' +
      sanitizeDisplayValue(consequence) +
      " This cannot be undone.</p>" +
      '<label class="form-label" for="confirmDeleteInput" style="margin-top:var(--space-4);">Type DELETE to confirm</label>' +
      '<input type="text" id="confirmDeleteInput" class="form-control" autocomplete="off">' +
      '<div id="confirmDeleteError" class="form-hint" style="color:var(--color-error);display:none;">Type DELETE in capital letters.</div>',
    [
      { label: "Cancel", cls: "btn--ghost", action: closeModal },
      {
        label: "🗑 Delete Permanently",
        cls: "btn--danger",
        action: function () {
          var input = document.getElementById("confirmDeleteInput");
          if (!input || input.value.trim() !== "DELETE") {
            var err = document.getElementById("confirmDeleteError");
            if (err) err.style.display = "block";
            return;
          }
          closeModal(onConfirm);
        },
      },
    ],
  );
}

function doDeleteTeacher(staffId) {
  _confirmPermanentDelete(
    "Delete Teacher",
    sanitizeDisplayValue(_teacherDisplayName(staffId)),
    "The teacher is removed from the portal now, together with their PIN and duty assignments, and from the Desktop Application on its next sync.",
    function () {
      showSpinner();
      callServer("adminDeleteTeacher", { staffId: staffId }, ADMIN_TOKEN).then(
        function (r) {
          hideSpinner();
          if (_checkAuthCode(r)) return;
          if (!r || !r.success) {
            showToast(r ? r.message : "Delete failed.", "error");
            return;
          }
          var keep = function (t) {
            return String(t.staff_id) !== String(staffId);
          };
          TEACHERS_CACHE = TEACHERS_CACHE.filter(keep);
          TEACHERS_FILTERED = TEACHERS_FILTERED.filter(keep);
          _updateTeacherGenderStats(TEACHERS_FILTERED);
          renderTeacherTable();
          showToast(r.message, "success");
        },
        function (e) {
          hideSpinner();
          showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
        },
      );
    },
  );
}

function doDeleteStudent(studentId) {
  var s = _findRosterStudent(studentId);
  if (!s) {
    showToast("That student is no longer in the list. Refresh the page.", "error");
    return;
  }
  var name = [s.first_name, s.other_name, s.surname].filter(Boolean).join(" ");
  _confirmPermanentDelete(
    "Delete Student",
    sanitizeDisplayValue(name) +
      (s.student_non_usable_id ? " (" + sanitizeDisplayValue(s.student_non_usable_id) + ")" : ""),
    "The Desktop Application deletes the student and all their attendance, marks, fees and reports on its next sync; the student then disappears from the portal.",
    function () {
      showSpinner();
      callServer(
        "submitStudentChange",
        { action: "DELETE", studentId: studentId, fields: {}, original: {} },
        ADMIN_TOKEN,
      ).then(
        function (r) {
          hideSpinner();
          if (_checkAuthCode(r)) return;
          if (!r || !r.success) {
            showToast((r && r.message) || "Delete failed.", "error");
            return;
          }
          showToast(r.message, "success");
          loadStudentSubmissions();
        },
        function (e) {
          hideSpinner();
          showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
        },
      );
    },
  );
}

// CORRECT STAFF ID (row action, admin-only, separate from Edit)
function doCorrectStaffId(oldStaffId) {
  var bodyHtml =
    "<p>Correct Staff ID for <strong>" +
    sanitizeDisplayValue(oldStaffId) +
    "</strong>?</p>" +
    '<p style="margin-top:var(--space-3);color:var(--text-secondary);font-size:var(--font-size-sm);">' +
    "This changes the teacher's login ID and updates every Attendance, " +
    sanitizeDisplayValue(getLevyLabel("Daily Levy")) +
    ", " +
    sanitizeDisplayValue(getLevyLabel("Admission Fee")) +
    ", " +
    sanitizeDisplayValue(getLevyLabel("Tuition Fee")) +
    ", and SBA duty " +
    "assignment tied to it. This is NOT the same as editing the profile — it cannot be undone by " +
    "editing again. The teacher will be logged out of any active session immediately." +
    "</p>" +
    '<div class="form-group" style="margin-top:var(--space-4);">' +
    '<label class="form-label" for="correctStaffIdInput">New Staff ID</label>' +
    '<input type="text" class="form-control" id="correctStaffIdInput" placeholder="e.g. 23000">' +
    "</div>" +
    '<div id="correctStaffIdError" class="notice notice--error" style="display:none;margin-top:var(--space-3);"></div>';

  showModal("Correct Staff ID", bodyHtml, [
    { label: "Cancel", cls: "btn--ghost", action: closeModal },
    {
      label: "Correct Staff ID",
      cls: "btn--danger",
      action: function () {
        _submitCorrectStaffId(oldStaffId);
      },
    },
  ]);
}

// Shows an inline error inside the modal instead of a toast so the admin doesn't lose context.
function _submitCorrectStaffId(oldStaffId) {
  var input = document.getElementById("correctStaffIdInput");
  var errDiv = document.getElementById("correctStaffIdError");
  var newStaffId = input ? input.value.trim() : "";

  if (!newStaffId) {
    if (errDiv) {
      errDiv.textContent = "New Staff ID is required.";
      errDiv.style.display = "block";
    }
    return;
  }
  // Client-side format check — mirrors the same rule already enforced in
  // doAssign()/doReassign()/submitAddTeacher() via validateStaffIdFormat().
  if (!validateStaffIdFormat(newStaffId)) {
    if (errDiv) {
      errDiv.textContent = "Staff ID must contain digits only (e.g. 23000).";
      errDiv.style.display = "block";
    }
    return;
  }
  if (newStaffId === oldStaffId) {
    if (errDiv) {
      errDiv.textContent = "New Staff ID must be different from the current Staff ID.";
      errDiv.style.display = "block";
    }
    return;
  }
  if (errDiv) errDiv.style.display = "none";

  closeModal(function () {
    _executeCorrectStaffId(oldStaffId, newStaffId);
  });
}

// Runs only after the admin confirms via the styled modal above.
function _executeCorrectStaffId(oldStaffId, newStaffId) {
  showSpinner();
  callServer(
    "adminCorrectStaffId",
    { oldStaffId: oldStaffId, newStaffId: newStaffId },
    ADMIN_TOKEN,
  ).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        showToast(r ? r.message : "Correction failed.", "error");
        return;
      }
      showToast("Staff ID corrected: " + oldStaffId + " → " + newStaffId + ".", "success");
      // Invalidate the client-side cache so All Teachers / Share
      // Links fetch fresh data reflecting the renamed staff_id.
      TEACHERS_CACHE = [];
      TEACHERS_FILTERED = [];
      if (CURRENT_SECTION === "allTeachers") {
        loadAllTeachersData();
      } else if (CURRENT_SECTION === "classAssignments") {
        loadAssignments();
      } else if (CURRENT_SECTION === "sbaRecords") {
        loadSbaAssignments();
      }
    },
    function (e) {
      hideSpinner();
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

// ───────────────────────────────────────────────────────────────────────────── EDIT TEACHER MODAL
// ─────────────────────────────────────────────────────────────────────────────

function openEditTeacherModal(staffId) {
  showSpinner();
  var calls = 0;
  var tData, fCfg;

  function tryRender() {
    calls++;
    if (calls < 2) return;
    hideSpinner();
    if (_checkAuthCode(tData)) return;
    if (!tData || !tData.success) {
      showToast("Could not load teacher data.", "error");
      return;
    }
    var teacher = tData.data || {};
    var configs = fCfg || [];
    var formId = "editTeacherForm";

    // school_level is always "jhs" in this portal — no picker shown.
    var storedLevel = "jhs";

    var bodyHtml =
      // Errors + scrollable form body
      '<div id="editTeacherErrors" class="notice notice--error" style="display:none;margin-bottom:var(--space-4);"></div>' +
      '<div id="' +
      formId +
      '"></div>';

    var teacherName = [teacher.first_name, teacher.middle_name, teacher.surname]
      .filter(Boolean)
      .join(" ");
    showModal(
      "Edit Teacher — " + (teacherName ? teacherName + " (" + staffId + ")" : staffId),
      bodyHtml,
      [
        { label: "Cancel", cls: "btn--ghost", action: closeModal },
        {
          label: "💾 Save Changes",
          cls: "btn--accent",
          action: function () {
            saveEditTeacher(staffId, formId, configs);
          },
        },
      ],
      "center",
    );

    var formEl = document.getElementById(formId);
    if (formEl && configs.length > 0) {
      renderFormFields(formEl, configs, teacher, false);
      // Inject hidden school_level input with stored value
      _injectHiddenSchoolLevelInput(formEl, storedLevel);

      // Rebuild dropdowns and leave all fields enabled (they were
      // enabled by renderFormFields).
      _applySchoolLevelRadio(formEl, storedLevel);
    } else if (formEl) {
      setHtml(formEl, '<p class="text-muted">Field configuration not available.</p>');
    }
  }

  callServer("getTeacherData", { staffId: staffId }, ADMIN_TOKEN).then(
    function (r) {
      tData = r;
      tryRender();
    },
    function () {
      tData = { success: false };
      tryRender();
    },
  );

  callServer("getFieldConfig", {}, "").then(
    function (r) {
      fCfg = r;
      tryRender();
    },
    function () {
      fCfg = [];
      tryRender();
    },
  );
}

function saveEditTeacher(staffId, formId, configs) {
  var formEl = document.getElementById(formId);
  var errDiv = document.getElementById("editTeacherErrors");
  if (!formEl) return;

  // Verify school_level is set (radio must be selected)
  var slInput = formEl.querySelector('[data-field="school_level"]');
  var slValue = slInput ? (slInput.value || "").trim() : "";
  if (!slValue) {
    if (errDiv) {
      setHtml(errDiv, "<strong>Please fix:</strong><ul><li>School Level is required.</li></ul>");
      errDiv.style.display = "block";
    }
    return;
  }

  // Form Teacher Class required when Is Form/Class Teacher = Yes ──
  var _formTcErr = _validateFormTeacherClassRequired(formEl);
  if (_formTcErr) {
    if (errDiv) {
      setHtml(
        errDiv,
        "<strong>Please fix:</strong><ul><li>" + sanitizeDisplayValue(_formTcErr) + "</li></ul>",
      );
      errDiv.style.display = "block";
    }
    return;
  }

  // Required-field pre-validation for Edit Teacher ─────────────── Per
  // Staff_Profile_Field_Reference.docx: first_name and surname are REQUIRED (NOT NULL in teachers_dim_tbl).
  var _editReqErrors = [];
  var _editFnEl = formEl.querySelector('[data-field="first_name"]');
  var _editSnEl = formEl.querySelector('[data-field="surname"]');
  var _editSxEl = formEl.querySelector('[data-field="sex"]');
  if (_editFnEl && !_editFnEl.disabled && !String(_editFnEl.value || "").trim()) {
    _editReqErrors.push("First Name is required.");
  }
  if (_editSnEl && !_editSnEl.disabled && !String(_editSnEl.value || "").trim()) {
    _editReqErrors.push("Surname is required.");
  }
  if (_editSxEl && !_editSxEl.disabled) {
    var _editSxVal = String(_editSxEl.value || "").trim();
    if (!_editSxVal || (_editSxVal !== "Male" && _editSxVal !== "Female")) {
      _editReqErrors.push("Sex is required — select Male or Female.");
    }
  }
  if (_editReqErrors.length > 0) {
    if (errDiv) {
      setHtml(
        errDiv,
        "<strong>Please fix:</strong><ul>" +
          _editReqErrors
            .map(function (e) {
              return "<li>" + sanitizeDisplayValue(e) + "</li>";
            })
            .join("") +
          "</ul>",
      );
      errDiv.style.display = "block";
    }
    return;
  }

  var result = validateFormValues(formEl, configs);
  if (!result.valid) {
    setHtml(
      errDiv,
      "<strong>Please fix:</strong><ul>" +
        result.errors
          .map(function (e) {
            return "<li>" + sanitizeDisplayValue(e) + "</li>";
          })
          .join("") +
        "</ul>",
    );
    errDiv.style.display = "block";
    return;
  }

  var updated = {};
  formEl.querySelectorAll("[data-field][data-original]").forEach(function (el) {
    // disabled fields (e.g.
    if (el.disabled) return;
    var k = el.getAttribute("data-field");
    var o = el.getAttribute("data-original");
    var v = el.value || "";
    if (v !== o) updated[k] = v;
  });

  if (Object.keys(updated).length === 0) {
    closeModal(function () {
      showToast("No changes to save for " + _teacherDisplayName(staffId) + ".", "info");
    });
    return;
  }

  showSpinner();
  callServer("updateTeacherData", { staffId: staffId, updatedFields: updated }, ADMIN_TOKEN).then(
    function (r) {
      hideSpinner();
      // updateTeacherData() returns success:false with code:"UNAUTHORIZED" when the GAS session
      // token has expired.
      if (r && r.code === "UNAUTHORIZED") {
        showToast(
          "⚠️ Your session has expired — please log out and log back in. Your changes were NOT saved.",
          "error",
        );
        return;
      }
      if (!r || !r.success) {
        showToast(r ? r.message : "Save failed.", "error");
        return;
      }
      // capture the post-save Class Teacher state BEFORE the modal is torn down —
      // formEl is no longer queryable once closeModal() removes #globalModal from the DOM.
      // Delay the success toast until closeModal()'s completion callback fires.
      closeModal(function () {
        showToast("Saved changes to " + _teacherDisplayName(staffId) + "'s profile.", "success");
        // Offer to move/revoke any displaced class teacher's auto-tagged SBA subjects.
        _showCascadeSbaModal(r.cascadeCandidates || []);
      });
      // Update cache
      TEACHERS_CACHE.forEach(function (t) {
        if (t.staff_id === staffId) Object.assign(t, updated);
      });
      TEACHERS_FILTERED.forEach(function (t) {
        if (t.staff_id === staffId) Object.assign(t, updated);
      });
      renderTeacherTable();
    },
    function (e) {
      hideSpinner();
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

// ───────────────────────────────────────────────────────────────────────────── SECTION: ADD TEACHER
// ─────────────────────────────────────────────────────────────────────────────

function buildAddTeacherSection(container) {
  // Reset stored configs whenever the section is rebuilt so stale
  // configs from a previous visit don't pollute the new form.
  _ADD_TEACHER_FIELD_CONFIGS = [];

  setHtml(
    container,
    '<div class="section-header"><div>' +
      '<div class="section-header__title">Add Teacher</div>' +
      '<div class="section-header__subtitle">Teachers are normally added via the Desktop Application. Use this form only if the desktop is unavailable.</div>' +
      "</div></div>" +
      '<div class="notice notice--warning" style="margin-bottom:var(--space-5);">⚠️ <strong>Note:</strong> Adding teachers here creates them directly in the system\'s central records. ' +
      "The desktop application will sync and merge on the next cycle.</div>" +
      '<div id="addTeacherErrors" class="notice notice--error" style="display:none;margin-bottom:var(--space-4);"></div>' +
      '<div id="addTeacherForm" style="max-width:900px;"></div>' +
      '<div style="margin-top:var(--space-5);text-align:center;">' +
      '<button class="btn btn--accent" id="btnAddTeacher" data-onclick="submitAddTeacher()">💾 Save Teacher</button>' +
      "</div>",
  );

  showSpinner();
  callServer("getFieldConfig", {}, "").then(
    function (configs) {
      hideSpinner();
      var formEl = document.getElementById("addTeacherForm");
      if (!formEl) return;
      if (Array.isArray(configs) && configs.length > 0) {
        // Store full configs so submitAddTeacher() can validate properly.
        _ADD_TEACHER_FIELD_CONFIGS = configs;
        renderFormFields(formEl, configs, {}, false);
        // Inject the hidden school_level input that renderFormFields()
        // skips, and apply it immediately (JHS is the only level this
        // portal ever operates against — no picker shown).
        _injectHiddenSchoolLevelInput(formEl, "jhs");
        _applySchoolLevelRadio(formEl, "jhs");
      } else {
        setHtml(formEl, '<p class="text-muted">Could not load field configuration.</p>');
      }
    },
    function () {
      hideSpinner();
      var formEl = document.getElementById("addTeacherForm");
      if (formEl) setHtml(formEl, '<p class="text-muted">Could not load field configuration.</p>');
    },
  );
}

function submitAddTeacher() {
  var formEl = document.getElementById("addTeacherForm");
  var errDiv = document.getElementById("addTeacherErrors");
  var btn = document.getElementById("btnAddTeacher");
  if (!formEl || !btn) return;

  // Use the real field configs fetched at section-build time so that email, phone, date, and required
  // validation all work correctly.
  var configs =
    _ADD_TEACHER_FIELD_CONFIGS.length > 0
      ? _ADD_TEACHER_FIELD_CONFIGS
      : (function () {
          var fallback = [];
          formEl.querySelectorAll("[data-field]").forEach(function (el) {
            fallback.push({
              fieldKey: el.getAttribute("data-field"),
              displayLabel: el.getAttribute("data-field"),
              required: el.required || false,
              fieldType: "text",
              active: true,
              editableByTeacher: true,
            });
          });
          return fallback;
        })();

  var result = validateFormValues(formEl, configs);
  if (!result.valid) {
    setHtml(
      errDiv,
      "<strong>Please fix:</strong><ul>" +
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
  errDiv.style.display = "none";

  var teacher = {};
  formEl.querySelectorAll("[data-field]").forEach(function (el) {
    teacher[el.getAttribute("data-field")] = el.value || "";
  });

  // ── Required-field hard validation (client-side) ───────────────── staff_id, first_name, surname, and
  // sex are mandatory for the desktop sync to upsert correctly into teachers_dim_tbl.
  var _requiredErrors = [];

  var _staffId = (teacher.staff_id || "").trim();
  var _firstName = (teacher.first_name || "").trim();
  var _surname = (teacher.surname || "").trim();
  var _sex = (teacher.sex || "").trim();
  var _schoolLevel = (teacher.school_level || "").trim();

  if (!_schoolLevel) {
    _requiredErrors.push("School Level is required.");
  } else if (_schoolLevel !== "jhs") {
    _requiredErrors.push("School Level must be 'jhs'.");
  }
  if (!_staffId) {
    _requiredErrors.push("Staff ID is required.");
  } else if (!/^\d+$/.test(_staffId)) {
    _requiredErrors.push("Staff ID must contain digits only (e.g. 23000).");
  }
  if (!_firstName) {
    _requiredErrors.push("First Name is required.");
  }
  if (!_surname) {
    _requiredErrors.push("Surname is required.");
  }
  if (!_sex) {
    _requiredErrors.push("Sex is required.");
  } else if (_sex !== "Male" && _sex !== "Female") {
    _requiredErrors.push("Sex must be 'Male' or 'Female'.");
  }

  // Form Teacher Class required when Is Form/Class Teacher = Yes ──
  var _formTcErr = _validateFormTeacherClassRequired(formEl);
  if (_formTcErr) {
    _requiredErrors.push(_formTcErr);
  }

  if (_requiredErrors.length > 0) {
    setHtml(
      errDiv,
      "<strong>The following required fields are missing or invalid:</strong><ul>" +
        _requiredErrors
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

  btn.disabled = true;
  btn.textContent = "⏳ Saving…";
  showSpinner();

  callServer("adminPushTeachers", { teacherRoster: [teacher] }, ADMIN_TOKEN).then(
    function (r) {
      hideSpinner();
      btn.disabled = false;
      btn.textContent = "💾 Save Teacher";
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        showToast(r ? r.message : "Save failed.", "error");
        return;
      }
      showToast(
        "Teacher added successfully. Status is Pending — reset PIN to activate.",
        "success",
      );
      // Offer to move/revoke displaced class teacher's auto-tagged SBA subjects
      // while TEACHERS_CACHE is still populated so the modal can resolve names.
      _showCascadeSbaModal(r.cascadeCandidates || [], function () {
        // Invalidate the client-side cache so the All Teachers section fetches fresh data from the server
        // (which now includes the new teacher).
        TEACHERS_CACHE = [];
        TEACHERS_FILTERED = [];
        // Navigate to All Teachers so the admin can see the new record.
        showSection("allTeachers");
      });
    },
    function (e) {
      hideSpinner();
      btn.disabled = false;
      btn.textContent = "💾 Save Teacher";
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

// ───────────────────────────────────────────────────────────────────────────── SECTION: SHARE LINKS
// ─────────────────────────────────────────────────────────────────────────────

function buildShareLinksSection(container) {
  var portalUrl = buildPortalUrl("teacher");

  setHtml(
    container,
    '<div class="section-header"><div>' +
      '<div class="section-header__title">Share Links</div>' +
      '<div class="section-header__subtitle">Share the teacher portal link with each teacher. To reset a PIN, use the All Teachers section.</div>' +
      "</div></div>" +
      '<div class="notice notice--info" style="margin-bottom:var(--space-5);">ℹ️ All teachers use the <strong>same portal URL</strong>. Each teacher logs in with their own Staff ID and PIN.</div>' +
      '<div style="margin-bottom:var(--space-5);">' +
      '<div class="form-label" style="margin-bottom:var(--space-2);">Teacher Portal URL</div>' +
      '<div class="url-display" id="shareLinksPortalUrl" style="word-break:break-all;">' +
      (portalUrl ? sanitizeDisplayValue(portalUrl) : "(Portal URL not available)") +
      "</div>" +
      '<button class="btn btn--outline btn--sm" data-onclick="copyPortalLink(\'teacher\')">📋 Copy This Link</button>' +
      "</div>" +
      '<div id="shareLinksTable" class="table-wrapper">' +
      '<div class="loading-state"><div class="spinner spinner--sm"></div> Loading…</div>' +
      "</div>",
  );

  if (!portalUrl) {
    showToast("Portal URL is not configured. Please contact your system administrator.", "error");
  }

  // always clear the loading state — use cache if available,
  // otherwise fetch; on any failure replace spinner with error message
  function _showShareLinksError(msg) {
    var wrapper = document.getElementById("shareLinksTable");
    if (wrapper) {
      setHtml(
        wrapper,
        '<div class="empty-state">' +
          '<div class="empty-state__icon">⚠️</div>' +
          '<div class="empty-state__title">' +
          sanitizeDisplayValue(msg) +
          "</div>" +
          '<div class="empty-state__body">' +
          '<button class="btn btn--outline btn--sm" data-onclick="showSection(\'shareLinks\')" style="margin-top:8px;">🔄 Retry</button>' +
          "</div></div>",
      );
    }
  }

  if (TEACHERS_CACHE.length > 0) {
    _renderShareLinksTable(TEACHERS_CACHE, portalUrl);
  } else {
    showSpinner();
    callServer("getTeachersForAdmin", {}, ADMIN_TOKEN).then(
      function (r) {
        hideSpinner();
        if (!r || !r.success) {
          if (r && r.code === "UNAUTHORIZED") {
            forceAdminLogout();
            return;
          }
          _showShareLinksError("Could not load teachers. Check your connection and retry.");
          return;
        }
        TEACHERS_CACHE = r.teachers || [];
        _renderShareLinksTable(TEACHERS_CACHE, portalUrl);
      },
      function () {
        hideSpinner();
        _showShareLinksError("Server error loading teachers. Retry or check your connection.");
      },
    );
  }
}

function _renderShareLinksTable(teachers, portalUrl) {
  // Sort alphabetically by first_name then surname
  teachers.sort(function (a, b) {
    var fa = (a.first_name || "").toLowerCase();
    var fb = (b.first_name || "").toLowerCase();
    if (fa !== fb) return fa < fb ? -1 : 1;
    var sa = (a.surname || "").toLowerCase();
    var sb = (b.surname || "").toLowerCase();
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });

  var wrapper = document.getElementById("shareLinksTable");
  if (!wrapper) return;
  if (teachers.length === 0) {
    setHtml(
      wrapper,
      '<div class="empty-state"><div class="empty-state__title">No teachers found</div></div>',
    );
    return;
  }
  var rows = teachers
    .map(function (t) {
      var fullName = [t.first_name, t.middle_name, t.surname].filter(Boolean).join(" ");
      var status = t.account_status || "Pending";
      var badgeCls =
        {
          Active: "badge--active",
          Inactive: "badge--inactive",
          Locked: "badge--locked",
          Pending: "badge--pending",
        }[status] || "badge--neutral";
      var pinStatus = t.hasPinSet ? "🔒 Set" : "⚠️ Not set";
      var waLink =
        "https://wa.me/?text=" +
        encodeURIComponent(
          "Hello " +
            fullName +
            ",\n\nYour Staff ID for the school portal is: " +
            (t.staff_id || "") +
            "\nPortal link: " +
            portalUrl +
            "\n\nContact the administrator for your PIN.",
        );
      return (
        "<tr>" +
        '<td style="font-family:var(--font-mono);font-size:var(--font-size-xs);">' +
        sanitizeDisplayValue(t.staff_id || "") +
        "</td>" +
        "<td>" +
        sanitizeDisplayValue(fullName) +
        "</td>" +
        '<td><span class="badge ' +
        badgeCls +
        '">' +
        sanitizeDisplayValue(status) +
        "</span></td>" +
        '<td style="font-size:var(--font-size-xs);">' +
        sanitizeDisplayValue(pinStatus) +
        "</td>" +
        '<td class="table-actions">' +
        '<a class="btn btn--ghost btn--sm" href="' +
        waLink +
        '" target="_blank" rel="noopener">📱 WhatsApp</a>' +
        '<button class="btn btn--outline btn--sm" data-onclick="printTeacherCard(\'' +
        escapeForJsAttr(t.staff_id || "") +
        "', '" +
        escapeForJsAttr(fullName) +
        "')\">🖨 Card</button>" +
        "</td>" +
        "</tr>"
      );
    })
    .join("");
  setHtml(
    wrapper,
    '<table class="table">' +
      "<thead><tr><th>Staff ID</th><th>Full Name</th><th>Status</th><th>PIN</th><th>Actions</th></tr></thead>" +
      "<tbody>" +
      rows +
      "</tbody>" +
      "</table>",
  );
}

function printTeacherCard(staffId, fullName) {
  var portalUrl = buildPortalUrl("teacher");
  var html =
    '<div style="font-family:sans-serif;border:2px solid #8e1e35;border-radius:10px;padding:20px;max-width:340px;margin:20px auto;background:#faf7f3;color:#1a1a1a;">' +
    '<h3 style="color:#8e1e35;margin:0 0 10px;">School Portal — Login Card</h3>' +
    "<p><strong>Name:</strong> " +
    sanitizeDisplayValue(fullName) +
    "</p>" +
    '<p><strong>Staff ID:</strong> <span style="font-family:monospace;font-size:16px;">' +
    sanitizeDisplayValue(staffId) +
    "</span></p>" +
    '<p><strong>Portal:</strong> <a href="' +
    sanitizeDisplayValue(portalUrl) +
    '">' +
    sanitizeDisplayValue(portalUrl) +
    "</a></p>" +
    '<p style="color:#5e5e5e;font-size:12px;margin-top:16px;">Your PIN will be given to you separately by the administrator.</p>' +
    "</div>";
  var w = window.open("", "_blank", "width=460,height=360");
  if (w) {
    w.document.title = "Login Card";
    setHtml(w.document.body, html);
    w.focus();
    w.print();
  }
}

// ───────────────────────────────────────────────────────────────────────────── SECTION: EXPORT DATA
// ─────────────────────────────────────────────────────────────────────────────

function buildExportDataSection(container) {
  setHtml(
    container,
    '<div class="section-header"><div><div class="section-header__title">Export Data</div></div></div>' +
      '<div class="tabs" id="exportTabs">' +
      '<button class="tab active" data-onclick="switchExportTab(\'expTeachers\')">Export Teachers</button>' +
      '<button class="tab" data-onclick="switchExportTab(\'expAttendance\')">Export Attendance</button>' +
      '<button class="tab" data-onclick="switchExportTab(\'expLevy\')">Export ' +
      sanitizeDisplayValue(getLevyLabel("Daily Levy")) +
      "</button>" +
      '<button class="tab" data-onclick="switchExportTab(\'expMock\')">Export Mock Exams</button>' +
      "</div>" +
      '<div id="expTeachers" class="tab-content active" style="padding-top:var(--space-5);">' +
      '<div class="form-row--2" style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);max-width:600px;">' +
      '<div class="form-group"><label class="form-label">Status</label>' +
      '<select class="form-control" id="expTeacherStatus"><option value="">All</option>' +
      '<option value="Active">Active</option><option value="Inactive">Inactive</option>' +
      '<option value="Locked">Locked</option><option value="Pending">Pending</option></select>' +
      "</div>" +
      "</div>" +
      '<button class="btn btn--accent" data-onclick="doExportTeachers()">📥 Download Teacher List</button>' +
      "</div>" +
      '<div id="expAttendance" class="tab-content" style="padding-top:var(--space-5);">' +
      _buildExportFilterRow("att") +
      '<button class="btn btn--accent" data-onclick="doExportAttendance()">📥 Download Attendance Records</button>' +
      "</div>" +
      '<div id="expLevy" class="tab-content" style="padding-top:var(--space-5);">' +
      _buildExportFilterRow("levy") +
      '<button class="btn btn--accent" data-onclick="doExportLevy()">📥 Download ' +
      sanitizeDisplayValue(getLevyLabel("Daily Levy")) +
      " Records</button>" +
      "</div>" +
      '<div id="expMock" class="tab-content" style="padding-top:var(--space-5);">' +
      _buildMockExportFilterRow() +
      '<button class="btn btn--accent" data-onclick="doExportMockExams()">📥 Download Mock Exam Records</button>' +
      "</div>",
  );

  // Populate the fixed Academic Year labels for both export filter rows.
  ["att", "levy"].forEach(function (prefix) {
    _ensureAcademicYearLoaded(function (year) {
      _applyAcademicYearLabel(prefix + "ExpYear", year);
    });
    // Default the Term filter to the currently configured term
    // instead of "All", so a fresh export matches current submissions.
    _ensureCurrentTermLoaded(function (term) {
      _applyTermLabel(prefix + "ExpTerm", term);
    });
  });

  // Populate the fixed Academic Year/Mock Number labels and the Class Level-dependent
  // Subject dropdown, reusing the shared Subjects_Reference cache.
  _ensureAcademicYearLoaded(function (year) {
    _applyAcademicYearLabel("mockExpYear", year);
  });
  _ensureCurrentMockNumberLoaded(function (mockNum) {
    var mnEl = document.getElementById("mockExpMockNum");
    if (!mnEl) return;
    mnEl.textContent = mockNum || "Not configured";
    mnEl.setAttribute("data-value", mockNum || "");
    mnEl.style.fontStyle = mockNum ? "normal" : "italic";
    mnEl.style.color = mockNum ? "var(--text-primary)" : "var(--text-muted)";
  });
  _loadSbaReferenceDataThen(function () {
    rebuildMockExportSubjectDropdown();
  });
}

// Filter row for the Export Mock Exams tab — Class Level restricted to
// MOCK_CLASS_LEVELS, Academic Year/Mock Number as fixed read-only labels.
function _buildMockExportFilterRow() {
  return (
    '<div class="export-filter-row" style="display:flex;gap:var(--space-4);flex-wrap:wrap;align-items:flex-end;margin-bottom:var(--space-4);">' +
    '<div class="form-group export-filter-group" style="margin-bottom:0;"><label class="form-label">Class Level</label>' +
    '<select class="form-control" id="mockExpClassLevel" style="width:160px;" data-onchange="_onMockExportClassLevelChange()">' +
    '<option value="">All</option>' +
    MOCK_CLASS_LEVELS.map(function (lvl) {
      var safe = sanitizeDisplayValue(lvl);
      return '<option value="' + safe + '">' + safe + "</option>";
    }).join("") +
    "</select></div>" +
    '<div class="form-group export-filter-group" style="margin-bottom:0;"><label class="form-label">Subject</label>' +
    '<select class="form-control" id="mockExpSubject" style="width:210px;"><option value="">All Subjects</option></select></div>' +
    '<div class="form-group export-filter-group" style="margin-bottom:0;"><label class="form-label">Academic Year</label>' +
    '<div class="form-control" id="mockExpYear" data-value="" style="width:150px;background:rgba(0,0,0,0.03);' +
    'cursor:default;display:flex;align-items:center;color:var(--text-muted);font-style:italic;">—</div></div>' +
    '<div class="form-group export-filter-group" style="margin-bottom:0;"><label class="form-label">Mock Number</label>' +
    '<div class="form-control" id="mockExpMockNum" data-value="" style="width:110px;background:rgba(0,0,0,0.03);' +
    'cursor:default;display:flex;align-items:center;color:var(--text-muted);font-style:italic;">—</div></div>' +
    "</div>"
  );
}

// Class Level onchange handler for the Export Mock Exams tab.
function _onMockExportClassLevelChange() {
  rebuildMockExportSubjectDropdown();
}

// Rebuilds the Export Mock Exams tab's Subject dropdown via the shared
// getSubjectsForClassLevel() resolver, same as rebuildMockSubjectDropdown().
function rebuildMockExportSubjectDropdown() {
  var clEl = document.getElementById("mockExpClassLevel");
  var subjEl = document.getElementById("mockExpSubject");
  if (!clEl || !subjEl) return;
  var classLevel = clEl.value;
  var subjects = classLevel
    ? getSubjectsForClassLevel(classLevel, ADMIN_SBA_GHANAIAN_LANG, ADMIN_SBA_SUBJECTS_REF)
    : [];
  var cur = subjEl.value;
  setHtml(subjEl, '<option value="">All Subjects</option>');
  subjects.forEach(function (s) {
    var o = document.createElement("option");
    o.value = s.subjectId !== null && s.subjectId !== undefined ? String(s.subjectId) : "";
    o.textContent = s.displayName;
    subjEl.appendChild(o);
  });
  if (cur) subjEl.value = cur;
}

function _buildExportFilterRow(prefix) {
  return (
    '<div class="export-filter-row" style="display:flex;gap:var(--space-4);flex-wrap:wrap;align-items:flex-end;margin-bottom:var(--space-4);">' +
    // .export-filter-row class hook lets the mobile media query below switch this row to a
    // vertical stacked layout on narrow screens without touching the desktop flex-wrap layout.
    '<div class="form-group export-filter-group" style="margin-bottom:0;"><label class="form-label">Class Level</label>' +
    '<select class="form-control" id="' +
    prefix +
    'ExpClass" style="width:160px;">' +
    _classLevelSelectOptionsForLevel("jhs", true) +
    "</select></div>" +
    '<div class="form-group export-filter-group" style="margin-bottom:0;"><label class="form-label">Academic Year</label>' +
    '<div class="form-control" id="' +
    prefix +
    'ExpYear" data-value="" style="width:160px;background:rgba(0,0,0,0.03);' +
    'cursor:default;display:flex;align-items:center;color:var(--text-muted);font-style:italic;">—</div></div>' +
    '<div class="form-group export-filter-group" style="margin-bottom:0;"><label class="form-label">Term</label>' +
    '<div class="form-control" id="' +
    prefix +
    'ExpTerm" data-value="" style="width:120px;background:rgba(0,0,0,0.03);' +
    'cursor:default;display:flex;align-items:center;color:var(--text-muted);font-style:italic;">—</div></div>' +
    "</div>"
  );
}

// Shared rebuild logic (DRY): rebuilds a Class Level <select>'s
// options for a school level, preserving the selection if still valid.
function _rebuildClassLevelSelectForLevel(selectEl, level) {
  if (!selectEl) return;
  var cur = selectEl.value;
  setHtml(selectEl, _classLevelSelectOptionsForLevel(level, true));
  var found = false;
  for (var i = 0; i < selectEl.options.length; i++) {
    if (selectEl.options[i].value === cur) {
      selectEl.value = cur;
      found = true;
      break;
    }
  }
  if (!found) selectEl.value = "";
}

function switchExportTab(tabId) {
  var ids = ["expTeachers", "expAttendance", "expLevy", "expMock"];
  ids.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle("active", id === tabId);
  });
  document.querySelectorAll("#exportTabs .tab").forEach(function (t, i) {
    t.classList.toggle(
      "active",
      (i === 0 && tabId === "expTeachers") ||
        (i === 1 && tabId === "expAttendance") ||
        (i === 2 && tabId === "expLevy") ||
        (i === 3 && tabId === "expMock"),
    );
  });
}

function doExportTeachers() {
  var status = document.getElementById("expTeacherStatus")
    ? document.getElementById("expTeacherStatus").value
    : "";
  var filters = {};
  if (status) filters.account_status = status;
  showSpinner();
  callServer(
    "exportTeachersData",
    { selectedFields: [], filters: filters, format: "csv" },
    ADMIN_TOKEN,
  ).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        showToast("Export failed.", "error");
        return;
      }
      downloadFile(r.base64, r.filename || "Teachers.csv", r.mimeType || "text/csv");
    },
    function (e) {
      hideSpinner();
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

function doExportAttendance() {
  var cl = document.getElementById("attExpClass").value;
  var yrEl = document.getElementById("attExpYear");
  var yr = yrEl ? yrEl.getAttribute("data-value") || "" : "";
  var tmEl = document.getElementById("attExpTerm");
  var tm = tmEl ? tmEl.getAttribute("data-value") || "" : "";
  showSpinner();
  callServer(
    "exportAttendanceRecords",
    { classLevel: cl, academicYear: yr, term: tm },
    ADMIN_TOKEN,
  ).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        showToast("Export failed.", "error");
        return;
      }
      downloadFile(r.base64, r.filename || "Attendance.csv", "text/csv");
    },
    function (e) {
      hideSpinner();
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

function doExportLevy() {
  var cl = document.getElementById("levyExpClass").value;
  var yrEl = document.getElementById("levyExpYear");
  var yr = yrEl ? yrEl.getAttribute("data-value") || "" : "";
  var tmEl = document.getElementById("levyExpTerm");
  var tm = tmEl ? tmEl.getAttribute("data-value") || "" : "";
  showSpinner();
  callServer(
    "exportDailyLevyRecords",
    { classLevel: cl, academicYear: yr, term: tm },
    ADMIN_TOKEN,
  ).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        showToast("Export failed.", "error");
        return;
      }
      downloadFile(r.base64, r.filename || "DailyLevy.csv", "text/csv");
    },
    function (e) {
      hideSpinner();
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

// Export Mock Exams — respects Class Level/Subject filters; Academic Year and Mock
// Number are fixed (read from the labels populated by buildExportDataSection()).
function doExportMockExams() {
  var cl = document.getElementById("mockExpClassLevel")
    ? document.getElementById("mockExpClassLevel").value
    : "";
  var subjEl = document.getElementById("mockExpSubject");
  var subjectId = subjEl ? subjEl.value : "";
  var yrEl = document.getElementById("mockExpYear");
  var yr = yrEl ? yrEl.getAttribute("data-value") || "" : "";
  var mockNumEl = document.getElementById("mockExpMockNum");
  var mockNum = mockNumEl ? mockNumEl.getAttribute("data-value") || "" : "";
  showSpinner();
  callServer(
    "exportMockExamsData",
    { classLevel: cl, academicYear: yr, subjectId: subjectId, mockNum: mockNum },
    ADMIN_TOKEN,
  ).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        showToast(r ? r.message : "Export failed.", "error");
        return;
      }
      downloadFile(r.base64, r.filename || "MockExams.csv", "text/csv");
    },
    function (e) {
      hideSpinner();
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

// ───────────────────────────────────────────────────────────────────────────── SECTION: STUDENT
// ENROLLMENT ─────────────────────────────────────────────────────────────────────────────

function buildStudentEnrollmentSection(container) {
  setHtml(
    container,
    '<div class="section-header"><div>' +
      '<div class="section-header__title">Student Enrollment</div>' +
      "</div></div>" +
      '<div class="notice notice--info" style="margin-bottom:var(--space-5);">Add or edit a student here and the Desktop Application applies it on its next sync; the list below updates after that. Changes made in the Desktop Application also appear here after the next sync.</div>' +
      // Male/Female + Total enrolment count row — reuses the .stat-grid/.stat-card classes already
      // used by buildAllTeachersSection() (DRY, no new CSS needed).
      '<div id="stuEnrollStats" class="stat-grid" style="margin-bottom:var(--space-8);">' +
      '<div class="stat-card"><div class="stat-card__label">Total</div><div class="stat-card__value" id="stuStatTotal">…</div></div>' +
      '<div class="stat-card"><div class="stat-card__label">Male</div><div class="stat-card__value" id="stuStatMale">…</div></div>' +
      '<div class="stat-card"><div class="stat-card__label">Female</div><div class="stat-card__value" id="stuStatFemale">…</div></div>' +
      "</div>" +
      // Academic Year is a fixed read-only label sourced from Config.ACADEMIC_YEAR, not a
      // per-row filter — Students_Roster's own academic_year/term columns aren't authoritative.
      '<div id="stuEnrollYearRow" style="display:flex;gap:var(--space-3);align-items:center;margin-bottom:var(--space-3);flex-wrap:wrap;">' +
      '<span class="filter-row__label">Academic Year</span>' +
      '<span class="form-control" id="stuEnrollYear" data-value="" style="width:150px;background:rgba(0,0,0,0.03);' +
      'display:inline-flex;align-items:center;color:var(--text-muted);font-style:italic;">—</span>' +
      "</div>" +
      '<div class="filter-row">' +
      searchBoxWithClear(
        '<input type="text" id="stuSearch" class="search-box__input" placeholder="Search by name or ID…" data-oninput="toggleSearchClear(this);filterStudents()">',
        "stuSearch",
        "280px",
      ) +
      '<select class="filter-select" id="stuClassFilter" data-onchange="filterStudents()">' +
      _buildStudentClassOptionsHTML("") +
      "</select>" +
      // Matches the naming convention of doExportTeachers()'s "📥 Download Teacher List" button.
      '<button class="btn btn--accent btn--sm" data-onclick="doExportStudentEnrollment()" title="Download the currently filtered student list (School Level + Class) as a CSV file">📥 Download Student List</button>' +
      '<button class="btn btn--accent btn--sm" data-onclick="openStudentForm(\'ADD\')">➕ Add Student</button>' +
      "</div>" +
      '<div id="stuTableWrapper" class="table-wrapper">' +
      '<div class="loading-state"><div class="spinner spinner--sm"></div> Loading…</div>' +
      "</div>" +
      '<div class="section-header" style="margin-top:var(--space-6);"><div>' +
      '<div class="section-header__title">Recent Web Changes</div>' +
      '<div class="section-header__subtitle">Students added or edited here, and what the Desktop Application did with each.</div>' +
      '</div><button class="btn btn--ghost btn--sm" id="stuRefreshBtn" data-onclick="refreshStudentEnrollment(this)">🔄 Refresh</button></div>' +
      '<div id="stuSubmissionsWrapper" class="table-wrapper">' +
      '<div class="loading-state"><div class="spinner spinner--sm"></div> Loading…</div>' +
      "</div>",
  );

  _loadStudentEnrollmentData(null);
}

// Loads the roster and the web-changes list; done(ok) runs once both have finished.
function _loadStudentEnrollmentData(done) {
  showSpinner();
  callServer("getStudentEnrollmentForAdmin", {}, ADMIN_TOKEN).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        showToast("Could not load students.", "error");
        if (done) done(false);
        return;
      }
      window._allStudents = r.students || [];
      loadStudentSubmissions(done);
      // See buildStudentEnrollmentSection() above for why Academic Year is a fixed label.
      _ensureAcademicYearLoaded(function (year) {
        _applyAcademicYearLabel("stuEnrollYear", year);
        filterStudents();
      });
    },
    function () {
      hideSpinner();
      showToast("Server error.", "error");
      if (done) done(false);
    },
  );
}

// Refresh button: shows both tables loading again, then confirms with a toast.
function refreshStudentEnrollment(btn) {
  if (btn) {
    btn.disabled = true;
    btn.textContent = "⏳ Refreshing…";
  }
  var loading =
    '<div class="loading-state"><div class="spinner spinner--sm"></div> Refreshing…</div>';
  ["stuTableWrapper", "stuSubmissionsWrapper"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) setHtml(el, loading);
  });
  _loadStudentEnrollmentData(function (ok) {
    var b = document.getElementById("stuRefreshBtn");
    if (b) {
      b.disabled = false;
      b.textContent = "🔄 Refresh";
    }
    if (ok) {
      showToast("Student list refreshed.", "success");
    } else {
      filterStudents();
      loadStudentSubmissions();
    }
  });
}

// Builds the <option> list for #stuClassFilter (always JHS class levels).
function _buildStudentClassOptionsHTML(level) {
  return '<option value="">All Classes</option>' + _classLevelSelectOptionsForLevel(level, false);
}

function filterStudents() {
  var all = window._allStudents || [];
  var q = document.getElementById("stuSearch")
    ? nameSearchKey(document.getElementById("stuSearch").value)
    : "";
  var cls = document.getElementById("stuClassFilter")
    ? document.getElementById("stuClassFilter").value
    : "";
  // No Academic Year/Term filter needed — Students_Roster only ever holds the current
  // Attending roster, so class_level + search is sufficient.
  var filtered = all.filter(function (s) {
    if (cls && s.class_level !== cls) return false;
    if (q) {
      var hay = (
        (s.first_name || "") +
        " " +
        (s.other_name || "") +
        " " +
        (s.surname || "") +
        " " +
        (s.student_non_usable_id || "")
      ).toLowerCase();
      if (nameSearchKey(hay).indexOf(q) === -1 && hay.indexOf(q) === -1) return false;
    }
    return true;
  });
  // sort alphabetically by first_name then surname
  filtered.sort(function (a, b) {
    var fa = (a.first_name || "").toLowerCase();
    var fb = (b.first_name || "").toLowerCase();
    if (fa !== fb) return fa < fb ? -1 : 1;
    var sa = (a.surname || "").toLowerCase();
    var sb = (b.surname || "").toLowerCase();
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });

  // refresh the Male/Female/Total stat row for the CURRENT filtered/searched list.
  _updateStudentEnrollmentStats(filtered);

  var wrapper = document.getElementById("stuTableWrapper");
  if (!wrapper) return;
  if (filtered.length === 0) {
    setHtml(
      wrapper,
      '<div class="empty-state"><div class="empty-state__title">No students found</div></div>',
    );
    return;
  }
  // Columns left-aligned (ID/Name/Guardian) vs center-aligned (everything else),
  // mirroring _isCenterAlignedRecordColumn().
  var rows = filtered
    .slice(0, 200)
    .map(function (s) {
      var fullName = [s.first_name, s.other_name, s.surname].filter(Boolean).join(" ");
      return (
        "<tr>" +
        '<td style="font-family:var(--font-mono);font-size:var(--font-size-xs);">' +
        sanitizeDisplayValue(s.student_non_usable_id || "") +
        "</td>" +
        "<td>" +
        sanitizeDisplayValue(fullName) +
        "</td>" +
        '<td class="text-center">' +
        sanitizeDisplayValue(s.sex || "—") +
        "</td>" +
        '<td class="text-center" style="font-size:var(--font-size-xs);">' +
        sanitizeDisplayValue(s.date_of_birth || "—") +
        "</td>" +
        '<td class="text-center">' +
        sanitizeDisplayValue(s.class_level || "—") +
        "</td>" +
        '<td class="text-center" style="font-family:var(--font-mono);font-size:var(--font-size-xs);">' +
        sanitizeDisplayValue(s.admission_number || "—") +
        "</td>" +
        '<td class="text-center" style="font-family:var(--font-mono);font-size:var(--font-size-xs);">' +
        sanitizeDisplayValue(s.index_number || "—") +
        "</td>" +
        "<td>" +
        sanitizeDisplayValue(s.guardian_name || "—") +
        "</td>" +
        '<td class="text-center" style="font-family:var(--font-mono);font-size:var(--font-size-xs);">' +
        sanitizeDisplayValue(s.contact || "—") +
        "</td>" +
        '<td class="text-center" style="font-size:var(--font-size-xs);">' +
        sanitizeDisplayValue(s.date_enroled || "—") +
        "</td>" +
        '<td class="text-center"><span class="badge ' +
        (s.enrolment_status === "Attending" ? "badge--active" : "badge--neutral") +
        '">' +
        sanitizeDisplayValue(s.enrolment_status || "—") +
        "</span></td>" +
        '<td class="text-center"><button class="btn btn--ghost btn--sm" data-sid="' +
        sanitizeDisplayValue(s.student_id || "") +
        "\" data-onclick=\"openStudentForm('EDIT', this.getAttribute('data-sid'))\">✏️ Edit</button>" +
        '<button class="btn btn--danger btn--sm" data-sid="' +
        sanitizeDisplayValue(s.student_id || "") +
        '" data-onclick="doDeleteStudent(this.getAttribute(\'data-sid\'))" title="Delete permanently — the Desktop Application deletes this student and all their records on its next sync. Cannot be undone.">🗑 Delete</button></td>' +
        "</tr>"
      );
    })
    .join("");
  setHtml(
    wrapper,
    '<table class="table table--striped">' +
      "<thead><tr>" +
      "<th>Display ID</th><th>Full Name</th><th>Sex</th><th>Date of Birth</th>" +
      "<th>Class</th><th>Admission No.</th><th>Index No.</th><th>Guardian</th>" +
      "<th>Contact</th><th>Date Enrolled</th><th>Status</th><th>Actions</th>" +
      "</tr></thead>" +
      "<tbody>" +
      rows +
      "</tbody>" +
      "</table>" +
      (filtered.length > 200
        ? '<p style="padding:8px 16px;font-size:var(--font-size-xs);color:var(--text-muted);">Showing first 200 of ' +
          filtered.length +
          " results.</p>"
        : ""),
  );
}

// Export CSV — respects the currently selected Class filter.
function doExportStudentEnrollment() {
  var cls = document.getElementById("stuClassFilter")
    ? document.getElementById("stuClassFilter").value
    : "";
  // Academic Year/Term filters removed from export — see filterStudents()
  // comment above. Export now respects only the Class filter, matching the on-screen table.
  var filters = {};
  if (cls) filters.class_level = cls;
  showSpinner();
  callServer("exportStudentEnrollmentData", { filters: filters }, ADMIN_TOKEN).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        showToast(r ? r.message : "Export failed.", "error");
        return;
      }
      downloadFile(r.base64, r.filename || "Students.csv", r.mimeType || "text/csv");
    },
    function (e) {
      hideSpinner();
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

// ── Student add/edit form (queued for the Desktop Application) ──────────────────────
// Fields mirror the desktop's Add Student Details form; class level is only chosen
// when adding, since moving a student between classes stays a desktop job.
var _STUDENT_LOCATIONS = null;

function _ddmmyyyyToIso(value) {
  var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value || "").trim());
  return m ? m[3] + "-" + m[2] + "-" + m[1] : "";
}

function _isoToDdmmyyyy(value) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  return m ? m[3] + "/" + m[2] + "/" + m[1] : "";
}

function _findRosterStudent(studentId) {
  var all = window._allStudents || [];
  for (var i = 0; i < all.length; i++) {
    if (String(all[i].student_id) === String(studentId)) return all[i];
  }
  return null;
}

function openStudentForm(mode, studentId) {
  var student = mode === "EDIT" ? _findRosterStudent(studentId) : null;
  if (mode === "EDIT" && !student) {
    showToast("That student is no longer in the list. Refresh and try again.", "error");
    return;
  }
  if (_STUDENT_LOCATIONS === null) {
    showSpinner();
    callServer("getLocationIdentities", {}, ADMIN_TOKEN).then(
      function (r) {
        hideSpinner();
        if (_checkAuthCode(r)) return;
        _STUDENT_LOCATIONS = (r && r.success && r.locations) || [];
        _showStudentFormModal(mode, student);
      },
      function () {
        hideSpinner();
        _STUDENT_LOCATIONS = [];
        _showStudentFormModal(mode, student);
      },
    );
    return;
  }
  _showStudentFormModal(mode, student);
}

function _studentFormField(label, inputHtml, required) {
  return (
    '<div class="form-group"><label class="form-label">' +
    sanitizeDisplayValue(label) +
    (required ? ' <span class="required" style="color:var(--color-error);">*</span>' : "") +
    "</label>" +
    inputHtml +
    "</div>"
  );
}

function _studentTextInput(id, value, attrs) {
  return (
    '<input type="text" class="form-control" id="' +
    id +
    '" value="' +
    sanitizeDisplayValue(value || "") +
    '" ' +
    (attrs || "") +
    ">"
  );
}

function _studentSelect(id, options, selected) {
  return (
    '<select class="form-control" id="' +
    id +
    '">' +
    options
      .map(function (o) {
        return (
          '<option value="' +
          sanitizeDisplayValue(o.value) +
          '"' +
          (String(o.value) === String(selected || "") ? " selected" : "") +
          ">" +
          sanitizeDisplayValue(o.label) +
          "</option>"
        );
      })
      .join("") +
    "</select>"
  );
}

function _showStudentFormModal(mode, student) {
  var s = student || {};
  var isAdd = mode !== "EDIT";
  var locationOptions = [{ value: "", label: "None" }].concat(
    (_STUDENT_LOCATIONS || []).map(function (l) {
      return {
        value: l.location_code,
        label: l.location_code + (l.location_name ? " — " + l.location_name : ""),
      };
    }),
  );
  // The class list follows the School Level radio chosen on the Student Enrollment page.
  var levelRadio = document.querySelector('input[name="stuEnrollLevel"]:checked');
  var classField = isAdd
    ? _studentFormField(
        "Class Level",
        '<select class="form-control" id="stuFormClass"><option value="">Select class…</option>' +
          _classLevelSelectOptionsForLevel(levelRadio ? levelRadio.value : "", false) +
          "</select>",
        true,
      )
    : _studentFormField(
        "Class Level",
        '<input type="text" class="form-control" value="' +
          sanitizeDisplayValue(s.class_level || "") +
          '" disabled title="Change a student\'s class in the Desktop Application">',
        false,
      );

  var bodyHtml =
    '<div class="notice notice--info" style="margin-bottom:var(--space-4);font-size:var(--font-size-sm);">' +
    (isAdd
      ? "The Desktop Application creates the student (with its Display ID) on its next sync."
      : "The Desktop Application applies these changes on its next sync.") +
    "</div>" +
    '<div class="form-row--2" style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);">' +
    _studentFormField(
      "First Name",
      _studentTextInput(
        "stuFormFirst",
        s.first_name,
        'maxlength="100" style="text-transform:uppercase;"',
      ),
      true,
    ) +
    _studentFormField(
      "Other Name",
      _studentTextInput(
        "stuFormOther",
        s.other_name,
        'maxlength="100" style="text-transform:uppercase;"',
      ),
      false,
    ) +
    _studentFormField(
      "Surname",
      _studentTextInput(
        "stuFormSurname",
        s.surname,
        'maxlength="100" style="text-transform:uppercase;"',
      ),
      true,
    ) +
    _studentFormField(
      "Sex",
      _studentSelect(
        "stuFormSex",
        [
          { value: "", label: "Select…" },
          { value: "Male", label: "Male" },
          { value: "Female", label: "Female" },
        ],
        s.sex,
      ),
      true,
    ) +
    classField +
    // A new student is always Attending; only an existing student can be set to Stopped.
    _studentFormField(
      "Enrolment Status",
      isAdd
        ? '<input type="text" class="form-control" id="stuFormStatus" value="Attending" readonly>'
        : _studentSelect(
            "stuFormStatus",
            [
              { value: "Attending", label: "Attending" },
              { value: "Stopped", label: "Stopped" },
            ],
            s.enrolment_status || "Attending",
          ),
      false,
    ) +
    _studentFormField(
      "Date of Birth",
      '<input type="date" class="form-control" id="stuFormDob" value="' +
        _ddmmyyyyToIso(s.date_of_birth) +
        '">',
      false,
    ) +
    _studentFormField(
      "Date Enrolled",
      '<input type="date" class="form-control" id="stuFormEnroled" value="' +
        _ddmmyyyyToIso(s.date_enroled) +
        '">',
      false,
    ) +
    _studentFormField(
      "Admission No.",
      _studentTextInput("stuFormAdm", s.admission_number, 'maxlength="20" inputmode="numeric"'),
      false,
    ) +
    _studentFormField(
      "Location Identity",
      _studentSelect("stuFormLocation", locationOptions, s.location_identity_code),
      false,
    ) +
    _studentFormField(
      "Parent/Guardian Name",
      _studentTextInput(
        "stuFormGuardian",
        s.guardian_name,
        'maxlength="100" style="text-transform:uppercase;"',
      ),
      false,
    ) +
    _studentFormField(
      "Parent Contact",
      _studentTextInput(
        "stuFormContact",
        s.contact,
        'maxlength="10" inputmode="numeric" placeholder="e.g. 0244123456"',
      ),
      false,
    ) +
    "</div>" +
    '<div id="stuFormError" class="notice notice--error" style="display:none;margin-top:var(--space-3);"></div>';

  showModal(isAdd ? "Add Student" : "Edit Student", bodyHtml, [
    { label: "Cancel", cls: "btn--ghost", action: closeModal },
    {
      label: isAdd ? "Add Student" : "Save Changes",
      cls: "btn--accent",
      action: function () {
        _submitStudentForm(isAdd ? "ADD" : "EDIT", s);
      },
    },
  ]);
}

function _studentFormValue(id) {
  var el = document.getElementById(id);
  return el ? String(el.value || "").trim() : "";
}

function _submitStudentForm(mode, original) {
  var errDiv = document.getElementById("stuFormError");
  function fail(msg) {
    if (errDiv) {
      errDiv.textContent = msg;
      errDiv.style.display = "block";
    }
  }
  // Names are stored upper-case, as the desktop entry form does.
  var fields = {
    first_name: _studentFormValue("stuFormFirst").toUpperCase(),
    other_name: _studentFormValue("stuFormOther").toUpperCase(),
    surname: _studentFormValue("stuFormSurname").toUpperCase(),
    sex: _studentFormValue("stuFormSex"),
    enrolment_status: _studentFormValue("stuFormStatus"),
    date_of_birth: _isoToDdmmyyyy(_studentFormValue("stuFormDob")),
    date_enroled: _isoToDdmmyyyy(_studentFormValue("stuFormEnroled")),
    admission_number: _studentFormValue("stuFormAdm"),
    location_identity_code: _studentFormValue("stuFormLocation"),
    guardian_name: _studentFormValue("stuFormGuardian").toUpperCase(),
    contact: _studentFormValue("stuFormContact"),
  };
  if (mode === "ADD") {
    fields.class_level = _studentFormValue("stuFormClass");
    fields.enrolment_status = "Attending";
  }

  if (!fields.first_name || !fields.surname) return fail("First Name and Surname are required.");
  if (!fields.sex) return fail("Please select a sex.");
  if (mode === "ADD" && !fields.class_level) return fail("Please select a class level.");
  if (fields.contact && !/^\d{10}$/.test(fields.contact))
    return fail("Parent Contact must be 10 digits (e.g. 0244123456).");
  if (fields.admission_number && !/^\d+$/.test(fields.admission_number))
    return fail("Admission No. must be digits only.");
  if (errDiv) errDiv.style.display = "none";

  // Only the values the admin saw are sent as "original", so the desktop can detect
  // a field that was changed on the desktop in the meantime.
  var seen = {};
  if (mode === "EDIT") {
    Object.keys(fields).forEach(function (k) {
      seen[k] = original[k] === undefined || original[k] === null ? "" : String(original[k]);
    });
  }

  showSpinner();
  callServer(
    "submitStudentChange",
    {
      action: mode,
      studentId: mode === "EDIT" ? original.student_id : "",
      fields: fields,
      original: seen,
    },
    ADMIN_TOKEN,
  ).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) return fail((r && r.message) || "Could not save.");
      closeModal(function () {
        showToast(r.message, "success");
        loadStudentSubmissions();
      });
    },
    function (e) {
      hideSpinner();
      fail(friendlyErrorFrontend(e ? e.message : ""));
    },
  );
}

// Lists recent add/edit requests with the desktop's result for each; done(ok) is optional.
function loadStudentSubmissions(done) {
  var wrapper = document.getElementById("stuSubmissionsWrapper");
  if (!wrapper) {
    if (done) done(false);
    return;
  }
  callServer("getStudentSubmissionsForAdmin", {}, ADMIN_TOKEN).then(
    function (r) {
      if (_checkAuthCode(r)) return;
      if (done) done(true);
      var list = (r && r.success && r.submissions) || [];
      if (list.length === 0) {
        setHtml(
          wrapper,
          '<div class="empty-state"><div class="empty-state__title">No web changes yet</div></div>',
        );
        return;
      }
      var badge = {
        Pending: "badge--pending",
        Received: "badge--pending",
        Applied: "badge--success",
        Rejected: "badge--error",
      };
      var label = {
        Pending: "Waiting for sync",
        Received: "With desktop",
        Applied: "Applied",
        Rejected: "Rejected",
      };
      setHtml(
        wrapper,
        '<table class="table table--striped"><thead><tr>' +
          "<th>Submitted</th><th>Action</th><th>Student</th><th>Status</th><th>Details</th>" +
          "</tr></thead><tbody>" +
          list
            .map(function (x) {
              var f = x.fields || {};
              var name = [f.first_name, f.other_name, f.surname].filter(Boolean).join(" ");
              var who = x.result_display_id || "";
              if (x.action === "EDIT") {
                var rs = _findRosterStudent(x.student_id);
                if (rs) {
                  name = [rs.first_name, rs.other_name, rs.surname].filter(Boolean).join(" ");
                  who = who || rs.student_non_usable_id || "";
                }
              }
              var details =
                x.status_message ||
                (x.action === "EDIT" ? "Changed: " + Object.keys(f).join(", ") : "");
              return (
                "<tr>" +
                '<td style="font-size:var(--font-size-xs);">' +
                sanitizeDisplayValue(x.submitted_at ? formatTimestamp(x.submitted_at) : "—") +
                "</td>" +
                "<td>" +
                ({ ADD: "Add", EDIT: "Edit", DELETE: "Delete" }[x.action] || "Edit") +
                "</td>" +
                "<td>" +
                sanitizeDisplayValue(name || "—") +
                (who
                  ? '<br><span style="font-family:var(--font-mono);font-size:var(--font-size-xs);">' +
                    sanitizeDisplayValue(who) +
                    "</span>"
                  : "") +
                "</td>" +
                '<td><span class="badge ' +
                (badge[x.status] || "badge--neutral") +
                '">' +
                sanitizeDisplayValue(label[x.status] || x.status || "—") +
                "</span></td>" +
                '<td style="font-size:var(--font-size-xs);">' +
                sanitizeDisplayValue(details) +
                "</td>" +
                "</tr>"
              );
            })
            .join("") +
          "</tbody></table>",
      );
    },
    function () {
      setHtml(
        wrapper,
        '<div class="empty-state"><div class="empty-state__title">Could not load web changes</div></div>',
      );
      if (done) done(false);
    },
  );
}

// Computes and renders Male/Female/Total counts for the student list shown by filterStudents().
function _updateStudentEnrollmentStats(students) {
  var list = students || [];
  var total = list.length;
  var male = 0;
  var female = 0;
  list.forEach(function (s) {
    var sex = s.sex || "";
    if (sex === "M" || sex === "Male") male++;
    else if (sex === "F" || sex === "Female") female++;
  });
  _setText("stuStatTotal", total);
  _setText("stuStatMale", male);
  _setText("stuStatFemale", female);
}

// Computes and renders Male / Female / Total counts for the teacher list currently shown
// by filterAndRenderTeachers().
function _updateTeacherGenderStats(teachers) {
  var list = teachers || [];
  var total = list.length;
  var male = 0;
  var female = 0;
  list.forEach(function (t) {
    var sex = t.sex || "";
    if (sex === "M" || sex === "Male") male++;
    else if (sex === "F" || sex === "Female") female++;
  });
  _setText("teacherStatTotal", total);
  _setText("teacherStatMale", male);
  _setText("teacherStatFemale", female);
}

// ───────────────────────────────────────────────────────────────────────────── SECTION: CLASS
// ASSIGNMENTS ─────────────────────────────────────────────────────────────────────────────

function buildClassAssignmentsSection(container) {
  setHtml(
    container,
    '<div class="section-header"><div>' +
      '<div class="section-header__title">Duty Assignments — Attendance, ' +
      getLevyLabel("Daily Levy") +
      ", " +
      getLevyLabel("Admission Fee") +
      " &amp; " +
      getLevyLabel("Tuition Fee") +
      "</div>" +
      '<div class="section-header__subtitle">Assign a teacher to mark Attendance or collect ' +
      getLevyLabel("Daily Levy") +
      ", " +
      getLevyLabel("Admission Fee") +
      ", or " +
      getLevyLabel("Tuition Fee") +
      " for a class.</div>" +
      "</div></div>" +
      '<div class="assignment-panels-stack">' +
      _buildAssignmentPanel("Attendance", "att") +
      _buildAssignmentPanel("Daily_Levy", "levy") +
      _buildAssignmentPanel("Admission_Fee", "admfee") +
      _buildAssignmentPanel("Tuition_Fee", "tuifee") +
      "</div>",
  );
  // SBA Assignments panel (and its "Load Subjects_Reference then rebuild dropdowns" /
  // loadSbaAssignments() init calls) moved to buildSbaRecordsSection() below — see that function.

  loadAssignments();

  // ensure TEACHERS_CACHE is populated so staff-ID auto-select has data to match against,
  // even if the Admin never visited All Teachers first this session.
  if (TEACHERS_CACHE.length === 0) {
    callServer("getTeachersForAdmin", {}, ADMIN_TOKEN).then(
      function (r) {
        if (_checkAuthCode(r)) return;
        if (r && r.success) TEACHERS_CACHE = r.teachers || [];
      },
      function () {
        /* silent — auto-select simply won't fire until cache populates on next visit */
      },
    );
  }
}

// Builds the teacher name-search input + suggestion list markup, shared by
// _buildAssignmentPanel() ("att"/"levy") and buildSbaRecordsSection()'s sbaAssignTab ("sba").
function _buildTeacherNameSearchHTML(prefix) {
  return (
    '<div class="form-group">' +
    '<label class="form-label">Search Teacher by Name</label>' +
    '<div style="position:relative;max-width:220px;margin:0 auto;">' +
    '<input type="text" class="form-control search-box__input" id="' +
    prefix +
    'TeacherNameSearch" placeholder="Type a name…" autocomplete="off" ' +
    "data-oninput=\"_filterTeacherNameSuggestions('" +
    prefix +
    "')\" data-onfocus=\"_filterTeacherNameSuggestions('" +
    prefix +
    "')\" data-onblur=\"_hideTeacherNameSuggestionsDelayed('" +
    prefix +
    '\')" style="padding-left:var(--space-4);padding-right:2rem;text-align:center;">' +
    '<button type="button" class="teacher-search-clear" id="' +
    prefix +
    'TeacherNameClear" aria-label="Clear search" title="Clear search" ' +
    "data-onmousedown=\"_clearTeacherNameSearch('" +
    prefix +
    "')\">✕</button>" +
    '<div id="' +
    prefix +
    'TeacherNameSuggestions" class="teacher-suggest-list"></div>' +
    "</div>" +
    "</div>"
  );
}

// Filters TEACHERS_CACHE by the typed name (client-side) and renders a suggestion list.
// Shared by all three assignment panels.
function _filterTeacherNameSuggestions(prefix) {
  var input = document.getElementById(prefix + "TeacherNameSearch");
  var list = document.getElementById(prefix + "TeacherNameSuggestions");
  var clearBtn = document.getElementById(prefix + "TeacherNameClear");
  if (!input || !list) return;
  if (clearBtn) clearBtn.style.display = input.value ? "flex" : "none";
  var query = input.value.trim().toLowerCase();
  if (!query) {
    list.textContent = "";
    list.style.display = "none";
    return;
  }
  var matches = TEACHERS_CACHE.filter(function (t) {
    var fullName = [t.first_name, t.middle_name, t.surname].filter(Boolean).join(" ");
    return nameSearchKey(fullName).indexOf(nameSearchKey(query)) !== -1;
  }).slice(0, 8);

  if (matches.length === 0) {
    setHtml(
      list,
      '<div class="teacher-suggest-item teacher-suggest-item--empty">No matching teachers</div>',
    );
    list.style.display = "block";
    return;
  }

  setHtml(
    list,
    matches
      .map(function (t) {
        var fullName = [t.first_name, t.middle_name, t.surname].filter(Boolean).join(" ");
        var staffIdJs = escapeForJsAttr(t.staff_id || "");
        var fullNameSafe = sanitizeDisplayValue(fullName);
        return (
          '<div class="teacher-suggest-item" data-onmousedown="_selectTeacherNameSuggestion(\'' +
          prefix +
          "', '" +
          staffIdJs +
          "')\">" +
          fullNameSafe +
          ' <span class="text-muted text-xs">(' +
          sanitizeDisplayValue(t.staff_id || "") +
          ")</span></div>"
        );
      })
      .join(""),
  );
  list.style.display = "block";
}

// hides the suggestion list shortly after the search box loses focus. The delay lets the
// onmousedown handler on a suggestion item fire first (mousedown fires before blur completes).
function _hideTeacherNameSuggestionsDelayed(prefix) {
  setTimeout(function () {
    var list = document.getElementById(prefix + "TeacherNameSuggestions");
    if (list) list.style.display = "none";
  }, 150);
}

// Uses onmousedown (fires before blur) so clicking ✕ works despite the input losing
// focus first — same pattern as _selectTeacherNameSuggestion().
function _clearTeacherNameSearch(prefix) {
  var input = document.getElementById(prefix + "TeacherNameSearch");
  var list = document.getElementById(prefix + "TeacherNameSuggestions");
  var clearBtn = document.getElementById(prefix + "TeacherNameClear");
  if (input) {
    input.value = "";
    input.focus();
  }
  if (list) {
    list.textContent = "";
    list.style.display = "none";
  }
  if (clearBtn) clearBtn.style.display = "none";
}

// Populates the Staff ID field, then invokes the existing school-level auto-select
// helpers so School Level/Class Level update as they would on a manually typed Staff ID.
function _selectTeacherNameSuggestion(prefix, staffId) {
  var nameInput = document.getElementById(prefix + "TeacherNameSearch");
  var list = document.getElementById(prefix + "TeacherNameSuggestions");
  var staffIdFieldId = prefix === "sba" ? "sbaAssignStaff" : prefix + "AssignStaff";
  var staffInput = document.getElementById(staffIdFieldId);

  if (staffInput) staffInput.value = staffId;
  if (nameInput) {
    var match = TEACHERS_CACHE.find(function (t) {
      return String(t.staff_id) === String(staffId);
    });
    nameInput.value = match
      ? [match.first_name, match.middle_name, match.surname].filter(Boolean).join(" ")
      : "";
  }
  var selectClearBtn = document.getElementById(prefix + "TeacherNameClear");
  if (selectClearBtn) {
    selectClearBtn.style.display = nameInput && nameInput.value ? "flex" : "none";
  }
  if (list) {
    list.textContent = "";
    list.style.display = "none";
  }
}

function _selectTeacherNameSuggestion(prefix, staffId) {
  var nameInput = document.getElementById(prefix + "TeacherNameSearch");
  var list = document.getElementById(prefix + "TeacherNameSuggestions");
  // "mock" needs its own explicit mapping ("mockFeeAssignStaff") — the generic
  // prefix + "AssignStaff" pattern used by "att"/"levy" doesn't match it.
  var staffIdFieldId =
    prefix === "sba"
      ? "sbaAssignStaff"
      : prefix === "mock"
        ? "mockFeeAssignStaff"
        : prefix + "AssignStaff";
  var staffInput = document.getElementById(staffIdFieldId);

  if (staffInput) staffInput.value = staffId;
  if (nameInput) {
    var match = TEACHERS_CACHE.find(function (t) {
      return String(t.staff_id) === String(staffId);
    });
    nameInput.value = match
      ? [match.first_name, match.middle_name, match.surname].filter(Boolean).join(" ")
      : "";
  }
  var selectClearBtn = document.getElementById(prefix + "TeacherNameClear");
  if (selectClearBtn) {
    selectClearBtn.style.display = nameInput && nameInput.value ? "flex" : "none";
  }
  if (list) {
    list.textContent = "";
    list.style.display = "none";
  }
}

// type -> display label, used by _buildAssignmentPanel() and anywhere else
// an assignment type needs a human-readable name. Admission Fee/Tuition
// Fee labels go through getLevyLabel() the same way Daily Levy already
// does, so an admin's custom label names apply here too.
function _assignmentTypeLabel(type) {
  if (type === "Attendance") return "Attendance";
  if (type === "Daily_Levy") return getLevyLabel("Daily Levy");
  if (type === "Admission_Fee") return getLevyLabel("Admission Fee");
  if (type === "Tuition_Fee") return getLevyLabel("Tuition Fee");
  return type;
}

function _buildAssignmentPanel(type, prefix) {
  var label = _assignmentTypeLabel(type);
  return (
    '<div class="assignment-panel">' +
    '<div class="assignment-panel__header assignment-panel__header--center">📋 ' +
    label +
    " Assignments</div>" +
    '<div class="assignment-panel__body assignment-panel__body--reflow">' +
    '<div class="assignment-panel__form-col">' +
    '<div class="assignment-panel__add-form">' +
    '<div class="assignment-panel__add-title">Assign Teacher</div>' +
    _buildTeacherNameSearchHTML(prefix) +
    '<div class="form-group">' +
    '<label class="form-label">Staff ID</label>' +
    '<input type="text" class="form-control" id="' +
    prefix +
    'AssignStaff" placeholder="Staff ID" style="max-width:220px;text-align:center;">' +
    "</div>" +
    '<div class="form-group">' +
    '<label class="form-label">Class Type</label>' +
    '<select class="form-control" id="' +
    prefix +
    'ClassType" style="max-width:220px;" data-onchange="rebuildAssignClassLevel(\'' +
    prefix +
    "')\">" +
    '<option value="Normal">Normal</option><option value="A">A</option>' +
    '<option value="B">B</option><option value="C">C</option><option value="D">D</option>' +
    "</select>" +
    "</div>" +
    '<div class="form-group">' +
    '<label class="form-label">Class Level</label>' +
    '<select class="form-control" id="' +
    prefix +
    'ClassLevel" style="max-width:220px;"></select>' +
    "</div>" +
    '<button class="btn btn--primary" style="max-width:220px;width:100%;" data-onclick="doAssign(\'' +
    type +
    "', '" +
    prefix +
    "')\">✅ Assign</button>" +
    "</div>" +
    "</div>" +
    '<div class="assignment-panel__table-col">' +
    '<div id="' +
    prefix +
    'AssignTable"><div class="loading-state"><div class="spinner spinner--sm"></div></div></div>' +
    "</div>" +
    "</div>" +
    "</div>"
  );
}

function rebuildAssignClassLevel(prefix) {
  var typeEl = document.getElementById(prefix + "ClassType");
  var classType = typeEl ? typeEl.value : "Normal";
  var levels = getEffectiveClassLevels("JHS", classType);
  var clEl = document.getElementById(prefix + "ClassLevel");
  if (!clEl) return;
  clEl.textContent = "";
  levels.forEach(function (lvl) {
    var o = document.createElement("option");
    o.value = lvl;
    o.textContent = lvl;
    clEl.appendChild(o);
  });
}

function loadAssignments() {
  // Init dropdowns
  ["att", "levy", "admfee", "tuifee"].forEach(function (p) {
    rebuildAssignClassLevel(p);
  });

  showSpinner();
  callServer("getTeacherAssignments", {}, ADMIN_TOKEN).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        showToast("Could not load assignments.", "error");
        return;
      }
      _renderAssignmentTable(r.assignments || [], "Attendance", "att");
      _renderAssignmentTable(r.assignments || [], "Daily_Levy", "levy");
      _renderAssignmentTable(r.assignments || [], "Admission_Fee", "admfee");
      _renderAssignmentTable(r.assignments || [], "Tuition_Fee", "tuifee");
    },
    function () {
      hideSpinner();
      showToast("Server error.", "error");
    },
  );
}

function _renderAssignmentTable(assignments, type, prefix) {
  var el = document.getElementById(prefix + "AssignTable");
  if (!el) return;
  var filtered = assignments.filter(function (a) {
    return a.assignment_type === type;
  });
  if (filtered.length === 0) {
    setHtml(
      el,
      '<p class="text-muted" style="font-size:var(--font-size-sm);padding:var(--space-3) 0;">No active assignments.</p>',
    );
    return;
  }
  // Combined "Staff ID / Name" column (name truncated, full name on hover) replaces the
  // raw assignment_id UUID column that added no value.
  setHtml(
    el,
    '<div class="table-wrapper" style="margin-bottom:var(--space-4);">' +
      '<table class="table" style="width:100%;min-width:700px;table-layout:fixed;">' +
      "<colgroup>" +
      '<col style="width:220px;">' +
      '<col style="width:120px;">' +
      '<col style="width:130px;">' +
      '<col style="width:230px;">' +
      "</colgroup>" +
      "<thead><tr><th>Staff ID / Name</th><th>Class Level</th><th>Assigned</th><th>Action</th></tr></thead>" +
      "<tbody>" +
      filtered
        .map(function (a) {
          // Display-only escaping — safe for <td> text/title content.
          var staffId = sanitizeDisplayValue(a.staff_id || "");
          var teacherName = sanitizeDisplayValue(a.teacher_name || "");
          var classLevel = sanitizeDisplayValue(a.class_level || "");
          var assignedAt = sanitizeDisplayValue(a.assigned_at || "—");
          // separate JS-string-safe values for data-onclick="..." attributes.
          var aIdJs = escapeForJsAttr(a.assignment_id || "");
          var staffIdJs = escapeForJsAttr(a.staff_id || "");
          var classLevelJs = escapeForJsAttr(a.class_level || "");
          // combined "Staff ID / Name" cell — staff ID on top, truncated teacher name below.
          var staffIdNameCell =
            '<div style="font-family:var(--font-mono);font-size:var(--font-size-xs);">' +
            staffId +
            "</div>" +
            (teacherName
              ? '<div style="font-size:var(--font-size-xs);color:var(--text-secondary);' +
                'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;" title="' +
                teacherName +
                '">' +
                teacherName +
                "</div>"
              : "");
          return (
            "<tr>" +
            '<td style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;">' +
            staffIdNameCell +
            "</td>" +
            "<td>" +
            classLevel +
            "</td>" +
            '<td style="font-size:var(--font-size-xs);white-space:nowrap;' +
            'overflow:hidden;text-overflow:ellipsis;" title="' +
            assignedAt +
            '">' +
            assignedAt +
            "</td>" +
            '<td class="table-actions">' +
            '<button class="btn btn--outline btn--sm" data-onclick="doReassign(\'' +
            aIdJs +
            "', '" +
            classLevelJs +
            "', '" +
            staffIdJs +
            "', '" +
            type +
            "', '" +
            prefix +
            '\')" title="Reassign this duty to a different teacher">Reassign</button>' +
            '<button class="btn btn--danger btn--sm" data-onclick="doRevokeAssignment(\'' +
            aIdJs +
            '\')" title="Revoke — permanently removes this teacher\'s assignment for this class. This cannot be undone; use Assign afterward to give the duty to someone else.">Revoke</button>' +
            "</td>" +
            "</tr>"
          );
        })
        .join("") +
      "</tbody>" +
      "</table>" +
      "</div>",
  );
}

// Looks up a teacher's cached account_status by Staff ID for fast
// client-side feedback, before the authoritative server-side check.
function _getTeacherStatusFromCache(staffId) {
  var match = TEACHERS_CACHE.find(function (t) {
    return String(t.staff_id) === String(staffId);
  });
  return match ? String(match.account_status || "") : "";
}

// SECTION: SBA ASSIGNMENTS

function rebuildSbaAssignClassLevel() {
  var typeEl = document.getElementById("sbaAssignClassType");
  var classType = typeEl ? typeEl.value : "Normal";
  var levels = getEffectiveClassLevels("JHS", classType);
  var clEl = document.getElementById("sbaAssignClassLevel");
  if (!clEl) return;
  clEl.textContent = "";
  levels.forEach(function (lvl) {
    var o = document.createElement("option");
    o.value = lvl;
    o.textContent = lvl;
    clEl.appendChild(o);
  });
  rebuildSbaAssignSubject();
}

// Rebuilds the Subject dropdown for the selected Class Level via
// the shared getSubjectsForClassLevel() resolver.
function rebuildSbaAssignSubject() {
  var clEl = document.getElementById("sbaAssignClassLevel");
  var subjEl = document.getElementById("sbaAssignSubject");
  if (!clEl || !subjEl) return;
  var classLevel = clEl.value;
  var subjects = getSubjectsForClassLevel(
    classLevel,
    ADMIN_SBA_GHANAIAN_LANG,
    ADMIN_SBA_SUBJECTS_REF,
  );
  setHtml(subjEl, '<option value="">— Select —</option>');
  subjects.forEach(function (s) {
    var o = document.createElement("option");
    o.value = s.subjectId !== null && s.subjectId !== undefined ? String(s.subjectId) : "";
    o.textContent = s.displayName;
    subjEl.appendChild(o);
  });
  subjEl.setAttribute("data-has-subjects", subjects.length > 0 ? "1" : "0");
}

function loadSbaAssignments() {
  var el = document.getElementById("sbaAssignTable");
  if (!el) return;
  callServer("getTeacherSbaAssignments", {}, ADMIN_TOKEN).then(
    function (r) {
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        setHtml(
          el,
          '<p class="text-muted" style="font-size:var(--font-size-sm);padding:var(--space-3) 0;">Could not load SBA assignments.</p>',
        );
        return;
      }
      // keep the duplicate-check cache in sync with the live assignment table every time it
      // reloads (after page load, after a successful Assign, and after a Revoke).
      ADMIN_SBA_ASSIGNMENTS_CACHE = r.assignments || [];
      _renderSbaAssignmentTable(r.assignments || []);
    },
    function () {
      setHtml(
        el,
        '<p class="text-muted" style="font-size:var(--font-size-sm);padding:var(--space-3) 0;">Server error loading SBA assignments.</p>',
      );
    },
  );
}

function _renderSbaAssignmentTable(assignments) {
  var el = document.getElementById("sbaAssignTable");
  if (!el) return;
  if (assignments.length === 0) {
    setHtml(
      el,
      '<p class="text-muted" style="font-size:var(--font-size-sm);padding:var(--space-3) 0;">No active SBA assignments.</p>',
    );
    return;
  }
  // Same table-wrapper + fixed-column-width pattern as _renderAssignmentTable() — min-width bumped 850px -> 860px to match.
  setHtml(
    el,
    '<div class="table-wrapper" style="margin-bottom:var(--space-4);">' +
      '<table class="table" style="width:100%;min-width:860px;table-layout:fixed;">' +
      "<colgroup>" +
      '<col style="width:160px;">' +
      '<col style="width:130px;">' +
      '<col style="width:180px;">' +
      '<col style="width:130px;">' +
      // widened from 140px to 230px — mirrors the identical widening already
      // done for _renderAssignmentTable()'s Action column to fit two buttons side by side.
      '<col style="width:230px;">' +
      "</colgroup>" +
      // "Staff ID" -> "Name" (column now shows the teacher's name, staff ID moved to a small
      // sub-line inside the cell below). "Action" -> "Actions" (two buttons render in this column).
      "<thead><tr><th>Name</th><th>Class Level</th><th>Subject</th><th>Assigned</th><th>Actions</th></tr></thead>" +
      "<tbody>" +
      assignments
        .map(function (a) {
          // Display-only escaping — safe for <td> text content.
          var aId = sanitizeDisplayValue(a.assignment_id || "");
          var staffId = sanitizeDisplayValue(a.staff_id || "");
          var classLevel = sanitizeDisplayValue(a.class_level || "");
          var subjectName = sanitizeDisplayValue(
            a.subject_name || "Subject #" + (a.subject_id || "—"),
          );
          var assignedAt = sanitizeDisplayValue(a.assigned_at || "—");
          // JS-string-safe values for the data-onclick="..." attribute below — see
          // _renderAssignmentTable() for full rationale. sanitizeDisplayValue() alone is not safe here.
          var aIdJs = escapeForJsAttr(a.assignment_id || "");
          var staffIdJs = escapeForJsAttr(a.staff_id || "");
          var classLevelJs = escapeForJsAttr(a.class_level || "");
          // JS-string-safe subject_id/subject_name for doReassignSba()'s
          // data-onclick="..." attribute — same rationale as aIdJs/staffIdJs/classLevelJs above.
          var subjectIdJs = escapeForJsAttr(a.subject_id || "");
          var subjectNameJs = escapeForJsAttr(a.subject_name || "");

          // Resolve the teacher's display name from TEACHERS_CACHE — getTeacherSbaAssignments()
          // only returns staff_id, not teacher_name.
          var _teacherMatch = TEACHERS_CACHE.find(function (t) {
            return String(t.staff_id) === String(a.staff_id);
          });
          var teacherName = _teacherMatch
            ? sanitizeDisplayValue(
                [_teacherMatch.first_name, _teacherMatch.middle_name, _teacherMatch.surname]
                  .filter(Boolean)
                  .join(" "),
              )
            : "";
          // Stacked cell, name on top and Staff ID as a muted sub-line — same pattern as
          // _renderAssignmentTable()'s "Staff ID / Name" cell, emphasis flipped.
          var nameCell =
            "<div>" +
            (teacherName || '<span class="text-muted">Unknown Teacher</span>') +
            "</div>" +
            '<div style="font-family:var(--font-mono);font-size:var(--font-size-xs);color:var(--text-secondary);">' +
            staffId +
            "</div>";

          return (
            "<tr>" +
            '<td style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
            nameCell +
            "</td>" +
            "<td>" +
            classLevel +
            "</td>" +
            "<td>" +
            subjectName +
            "</td>" +
            '<td style="font-size:var(--font-size-xs);white-space:nowrap;' +
            'overflow:hidden;text-overflow:ellipsis;" title="' +
            assignedAt +
            '">' +
            assignedAt +
            "</td>" +
            '<td class="table-actions">' +
            // mirrors the Attendance/Daily Levy "Reassign" button pattern in
            // _renderAssignmentTable() — chains revoke -> assign for this class/subject in one confirmation.
            '<button class="btn btn--outline btn--sm" data-onclick="doReassignSba(\'' +
            aIdJs +
            "', '" +
            classLevelJs +
            "', '" +
            subjectIdJs +
            "', '" +
            subjectNameJs +
            "', '" +
            staffIdJs +
            '\')" title="Reassign this SBA duty to a different teacher">Reassign</button>' +
            '<button class="btn btn--danger btn--sm" data-onclick="doRevokeSbaAssignment(\'' +
            aIdJs +
            "', '" +
            staffIdJs +
            "', '" +
            classLevelJs +
            '\')" title="Revoke this teacher\'s SBA access for this class/subject">Revoke</button>' +
            "</td>" +
            "</tr>"
          );
        })
        .join("") +
      "</tbody>" +
      "</table>" +
      "</div>",
  );
}

function doSbaAssign() {
  var staffId = document.getElementById("sbaAssignStaff")
    ? document.getElementById("sbaAssignStaff").value.trim()
    : "";
  var classLevel = document.getElementById("sbaAssignClassLevel")
    ? document.getElementById("sbaAssignClassLevel").value
    : "";
  var subjectEl = document.getElementById("sbaAssignSubject");
  var subjectId = subjectEl ? subjectEl.value : "";
  var subjectName =
    subjectEl && subjectEl.selectedOptions && subjectEl.selectedOptions[0]
      ? subjectEl.selectedOptions[0].textContent
      : "";

  if (!staffId) {
    showToast("Staff ID is required.", "warning");
    return;
  }
  if (!validateStaffIdFormat(staffId)) {
    showToast("Staff ID must contain digits only (e.g. 23000).", "warning");
    return;
  }
  // Fast client-side feedback only — assignTeacherToSbaClass() re-checks live
  // account_status server-side inside the script lock.
  var _statusCheck = _getTeacherStatusFromCache(staffId);
  if (_statusCheck === "Locked" || _statusCheck === "Inactive") {
    showToast(
      "Cannot assign SBA duty — Staff ID " +
        staffId +
        " is " +
        _statusCheck +
        ". " +
        (_statusCheck === "Locked" ? "Unlock the account first." : "Reactivate the account first."),
      "warning",
    );
    return;
  }
  if (!classLevel) {
    showToast("Class Level is required.", "warning");
    return;
  }

  // Check for an already-active duplicate before the "Subject is required" guard below,
  // matching by subject_id when available, else a case-insensitive name match.
  var _dupMatch = (ADMIN_SBA_ASSIGNMENTS_CACHE || []).find(function (a) {
    if (String(a.staff_id) !== staffId) return false;
    if (String(a.class_level) !== classLevel) return false;
    if (subjectId && String(a.subject_id) === String(subjectId)) return true;
    var existingName = String(a.subject_name || "")
      .trim()
      .toLowerCase();
    var pickedName = String(subjectName || "")
      .trim()
      .toLowerCase();
    return existingName !== "" && existingName === pickedName;
  });
  if (_dupMatch) {
    showToast(
      "Staff ID " +
        staffId +
        " is already assigned to " +
        classLevel +
        " for " +
        (subjectName || _dupMatch.subject_name || "this subject") +
        ".",
      "warning",
    );
    return;
  }

  // Block a different staff_id from claiming a combo another teacher already holds.
  // Fast client-side check only — assignTeacherToSbaClass() re-checks this server-side.
  var _coverMatch = (ADMIN_SBA_ASSIGNMENTS_CACHE || []).find(function (a) {
    if (String(a.staff_id) === staffId) return false;
    if (String(a.class_level) !== classLevel) return false;
    if (subjectId) return String(a.subject_id) === String(subjectId);
    var existingName = String(a.subject_name || "")
      .trim()
      .toLowerCase();
    var pickedName = String(subjectName || "")
      .trim()
      .toLowerCase();
    return existingName !== "" && existingName === pickedName;
  });
  if (_coverMatch) {
    var _coverTeacherMatch = TEACHERS_CACHE.find(function (t) {
      return String(t.staff_id) === String(_coverMatch.staff_id);
    });
    var _coverName = _coverTeacherMatch
      ? [_coverTeacherMatch.first_name, _coverTeacherMatch.middle_name, _coverTeacherMatch.surname]
          .filter(Boolean)
          .join(" ")
      : _coverMatch.staff_id;
    showToast(
      classLevel +
        " (" +
        (subjectName || _coverMatch.subject_name || "this subject") +
        ") is already assigned to " +
        _coverName +
        " (Staff ID " +
        _coverMatch.staff_id +
        "). Revoke that assignment first if you want to reassign it.",
      "warning",
    );
    return;
  }

  if (!subjectId) {
    var _sbaAssignHasSubjects = subjectEl && subjectEl.getAttribute("data-has-subjects") === "1";
    showToast(
      _sbaAssignHasSubjects
        ? "Subject is required."
        : "No subjects available for this Class Level. Add subjects to the Subject_Reference sheet first.",
      "warning",
    );
    return;
  }

  showSpinner();
  callServer(
    "assignTeacherToSbaClass",
    { staffId: staffId, classLevel: classLevel, subjectId: subjectId },
    ADMIN_TOKEN,
  ).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        showToast(r ? r.message : "Assignment failed.", "error");
        return;
      }
      showToast("Assigned " + staffId + " to " + classLevel + " (SBA).", "success");
      document.getElementById("sbaAssignStaff").value = "";
      loadSbaAssignments();
    },
    function (e) {
      hideSpinner();
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

function doRevokeSbaAssignment(assignmentId, staffId, classLevel) {
  showModal(
    "Revoke SBA Assignment",
    "<p>Revoke SBA assignment for Staff ID <strong>" +
      sanitizeDisplayValue(staffId) +
      "</strong> (" +
      sanitizeDisplayValue(classLevel) +
      ")?</p>" +
      '<p style="margin-top:var(--space-3);color:var(--text-secondary);font-size:var(--font-size-sm);">This cannot be undone.</p>',
    [
      { label: "Cancel", cls: "btn--ghost", action: closeModal },
      {
        label: "Revoke",
        cls: "btn--danger",
        action: function () {
          closeModal(function () {
            _executeRevokeSbaAssignment(assignmentId);
          });
        },
      },
    ],
  );
}

// Runs only after the admin confirms via the styled modal above.
function _executeRevokeSbaAssignment(assignmentId) {
  showSpinner();
  callServer("revokeSbaAssignment", { assignmentId: assignmentId }, ADMIN_TOKEN).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        showToast(r ? r.message : "Revoke failed.", "error");
        return;
      }
      showToast("SBA assignment revoked.", "success");
      loadSbaAssignments();
    },
    function (e) {
      hideSpinner();
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

// One-click revoke+reassign for a class/subject's assigned teacher — mirrors the
// Attendance/Daily Levy reassign flow, chaining revokeSbaAssignment() -> assignTeacherToSbaClass().

function doReassignSba(assignmentId, classLevel, subjectId, subjectName, currentStaffId) {
  var bodyHtml =
    "<p>Reassign <strong>SBA</strong> duty for <strong>" +
    sanitizeDisplayValue(classLevel) +
    "</strong> — <strong>" +
    sanitizeDisplayValue(subjectName) +
    "</strong>?</p>" +
    '<p style="margin-top:var(--space-3);color:var(--text-secondary);font-size:var(--font-size-sm);">' +
    "This will revoke the current assignment for Staff ID " +
    sanitizeDisplayValue(currentStaffId) +
    " and create a new assignment for a different teacher. This cannot be undone." +
    "</p>" +
    '<div class="form-group" style="margin-top:var(--space-4);">' +
    '<label class="form-label" for="reassignSbaStaffIdInput">New Staff ID</label>' +
    '<input type="text" class="form-control" id="reassignSbaStaffIdInput" placeholder="e.g. 23000">' +
    "</div>" +
    '<div id="reassignSbaStaffIdError" class="notice notice--error" style="display:none;margin-top:var(--space-3);"></div>';

  showModal("Reassign SBA Duty", bodyHtml, [
    { label: "Cancel", cls: "btn--ghost", action: closeModal },
    {
      label: "Reassign",
      cls: "btn--danger",
      action: function () {
        _submitReassignSba(assignmentId, classLevel, subjectId, subjectName);
      },
    },
  ]);
}

// Mirrors _submitReassign()'s format + cached-status pre-checks, plus a duplicate
// pre-check against ADMIN_SBA_ASSIGNMENTS_CACHE (same pattern as doSbaAssign()).
function _submitReassignSba(assignmentId, classLevel, subjectId, subjectName) {
  var input = document.getElementById("reassignSbaStaffIdInput");
  var errDiv = document.getElementById("reassignSbaStaffIdError");
  var newStaffId = input ? input.value.trim() : "";

  if (!newStaffId) {
    if (errDiv) {
      errDiv.textContent = "Staff ID is required.";
      errDiv.style.display = "block";
    }
    return;
  }
  if (!validateStaffIdFormat(newStaffId)) {
    if (errDiv) {
      errDiv.textContent = "Staff ID must contain digits only (e.g. 23000).";
      errDiv.style.display = "block";
    }
    return;
  }
  var _statusCheckReassignSba = _getTeacherStatusFromCache(newStaffId);
  if (_statusCheckReassignSba === "Locked" || _statusCheckReassignSba === "Inactive") {
    if (errDiv) {
      errDiv.textContent =
        "Cannot reassign — Staff ID " +
        newStaffId +
        " is " +
        _statusCheckReassignSba +
        ". " +
        (_statusCheckReassignSba === "Locked"
          ? "Unlock the account first."
          : "Reactivate the account first.");
      errDiv.style.display = "block";
    }
    return;
  }

  // Fast client-side duplicate pre-check only — assignTeacherToSbaClass() in Code.gs remains the
  // authoritative check and cannot be bypassed by a stale client-side cache.
  var _dupMatch = (ADMIN_SBA_ASSIGNMENTS_CACHE || []).find(function (a) {
    if (String(a.staff_id) !== newStaffId) return false;
    if (String(a.class_level) !== classLevel) return false;
    return String(a.subject_id) === String(subjectId);
  });
  if (_dupMatch) {
    if (errDiv) {
      errDiv.textContent =
        "Staff ID " +
        newStaffId +
        " is already assigned to " +
        classLevel +
        " for " +
        subjectName +
        ".";
      errDiv.style.display = "block";
    }
    return;
  }
  if (errDiv) errDiv.style.display = "none";

  closeModal(function () {
    _executeReassignSba(assignmentId, classLevel, subjectId, subjectName, newStaffId);
  });
}

// Revoke -> Assign chaining, mirrors _executeReassign(). If the revoke succeeds but the
// re-assign fails, no rollback is attempted — the admin is told to follow up manually.
function _executeReassignSba(assignmentId, classLevel, subjectId, subjectName, newStaffId) {
  showSpinner();
  callServer("revokeSbaAssignment", { assignmentId: assignmentId }, ADMIN_TOKEN).then(
    function (revokeResult) {
      if (_checkAuthCode(revokeResult)) {
        hideSpinner();
        return;
      }
      if (!revokeResult || !revokeResult.success) {
        hideSpinner();
        showToast(revokeResult ? revokeResult.message : "Revoke failed.", "error");
        return;
      }
      // Revoke succeeded — immediately chain the new assignment.
      callServer(
        "assignTeacherToSbaClass",
        { staffId: newStaffId, classLevel: classLevel, subjectId: subjectId },
        ADMIN_TOKEN,
      ).then(
        function (assignResult) {
          hideSpinner();
          if (_checkAuthCode(assignResult)) return;
          if (!assignResult || !assignResult.success) {
            showToast(
              (assignResult ? assignResult.message : "Reassignment failed after revoke.") +
                " The class/subject is now unassigned — please assign the new teacher manually.",
              "error",
            );
            loadSbaAssignments();
            return;
          }
          showToast(
            "Reassigned " + classLevel + " (" + subjectName + ") to Staff ID " + newStaffId + ".",
            "success",
          );
          loadSbaAssignments();
        },
        function (e) {
          hideSpinner();
          showToast(
            friendlyErrorFrontend(e ? e.message : "") +
              " The class/subject is now unassigned — please assign the new teacher manually.",
            "error",
          );
          loadSbaAssignments();
        },
      );
    },
    function (e) {
      hideSpinner();
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

// Each candidate is a teacher displaced as Class Teacher who still holds "auto"-tagged
// SBA subjects. Offers to move or revoke them one at a time, calling onAllDone() when done.
function _showCascadeSbaModal(candidates, onAllDone) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    if (onAllDone) onAllDone();
    return;
  }

  var candidate = candidates[0];
  var remaining = candidates.slice(1);

  var oldMatch = TEACHERS_CACHE.find(function (t) {
    return String(t.staff_id) === String(candidate.oldStaffId);
  });
  var oldName = oldMatch
    ? [oldMatch.first_name, oldMatch.middle_name, oldMatch.surname].filter(Boolean).join(" ")
    : candidate.oldStaffId;

  var newName = "";
  if (candidate.newStaffId) {
    var newMatch = TEACHERS_CACHE.find(function (t) {
      return String(t.staff_id) === String(candidate.newStaffId);
    });
    newName = newMatch
      ? [newMatch.first_name, newMatch.middle_name, newMatch.surname].filter(Boolean).join(" ")
      : candidate.newStaffId;
  }

  var subjectListHtml = (candidate.autoSubjects || [])
    .map(function (s) {
      return "<li>" + sanitizeDisplayValue(s.subject_name || s.subject_id) + "</li>";
    })
    .join("");

  var bodyHtml =
    "<p><strong>" +
    sanitizeDisplayValue(oldName) +
    "</strong> is no longer the Class Teacher for <strong>" +
    sanitizeDisplayValue(candidate.classLevel) +
    "</strong>, but still holds these auto-assigned SBA subjects for that class:</p>" +
    '<ul style="margin:var(--space-3) 0;">' +
    subjectListHtml +
    "</ul>" +
    (candidate.newStaffId
      ? "<p>Move these subjects to the new Class Teacher, <strong>" +
        sanitizeDisplayValue(newName) +
        "</strong> (" +
        sanitizeDisplayValue(candidate.newStaffId) +
        "), or revoke them instead?</p>"
      : "<p>This class currently has no Class Teacher. Revoke these subjects, or leave them with " +
        sanitizeDisplayValue(oldName) +
        " for now (Skip)?</p>");

  var buttons = [
    {
      label: "Skip",
      cls: "btn--ghost",
      action: function () {
        closeModal(function () {
          _showCascadeSbaModal(remaining, onAllDone);
        });
      },
    },
    {
      label: "Revoke",
      cls: "btn--danger",
      action: function () {
        closeModal(function () {
          _executeCascadeSbaRevoke(candidate, function () {
            _showCascadeSbaModal(remaining, onAllDone);
          });
        });
      },
    },
  ];

  if (candidate.newStaffId) {
    buttons.push({
      label: "Move to New Class Teacher",
      cls: "btn--accent",
      action: function () {
        closeModal(function () {
          _executeCascadeSbaMove(candidate, function () {
            _showCascadeSbaModal(remaining, onAllDone);
          });
        });
      },
    });
  }

  showModal("Class Teacher Changed — SBA Subjects", bodyHtml, buttons, "center");
}

// revokes every auto-tagged subject in a cascade candidate — loops the same single-subject
// revokeSbaAssignment() call already used by _executeRevokeSbaAssignment().
function _executeCascadeSbaRevoke(candidate, onComplete) {
  var subjects = candidate.autoSubjects || [];
  if (subjects.length === 0) {
    if (onComplete) onComplete();
    return;
  }
  showSpinner();
  var remaining = subjects.length;
  var hadError = false;

  function _checkDone() {
    remaining--;
    if (remaining > 0) return;
    hideSpinner();
    showToast(
      hadError
        ? "Some subjects could not be revoked. Please check SBA Records → Assign Subjects & Classes."
        : "SBA subjects revoked.",
      hadError ? "warning" : "success",
    );
    if (CURRENT_SECTION === "sbaRecords") loadSbaAssignments();
    if (onComplete) onComplete();
  }

  subjects.forEach(function (s) {
    callServer("revokeSbaAssignment", { assignmentId: s.assignment_id }, ADMIN_TOKEN).then(
      function (r) {
        if (!r || !r.success) hadError = true;
        _checkDone();
      },
      function () {
        hadError = true;
        _checkDone();
      },
    );
  });
}

// Moves every auto-tagged subject to the new class teacher, writing
// assignmentSource="auto" so it stays distinct from a manual Admin choice.
function _executeCascadeSbaMove(candidate, onComplete) {
  var subjects = candidate.autoSubjects || [];
  if (subjects.length === 0) {
    if (onComplete) onComplete();
    return;
  }
  showSpinner();
  var remaining = subjects.length;
  var hadError = false;

  function _finishCascadeMove() {
    hideSpinner();
    showToast(
      hadError
        ? "Some subjects could not be moved. Please check SBA Records → Assign Subjects & Classes."
        : "SBA subjects moved to the new class teacher.",
      hadError ? "warning" : "success",
    );
    if (CURRENT_SECTION === "sbaRecords") loadSbaAssignments();
    if (onComplete) onComplete();
  }

  subjects.forEach(function (s) {
    callServer("revokeSbaAssignment", { assignmentId: s.assignment_id }, ADMIN_TOKEN).then(
      function (revokeResult) {
        if (!revokeResult || !revokeResult.success) {
          hadError = true;
          remaining--;
          if (remaining === 0) _finishCascadeMove();
          return;
        }
        callServer(
          "assignTeacherToSbaClass",
          {
            staffId: candidate.newStaffId,
            classLevel: candidate.classLevel,
            subjectId: s.subject_id,
            assignmentSource: "auto",
          },
          ADMIN_TOKEN,
        ).then(
          function (assignResult) {
            if (!assignResult || !assignResult.success) hadError = true;
            remaining--;
            if (remaining === 0) _finishCascadeMove();
          },
          function () {
            hadError = true;
            remaining--;
            if (remaining === 0) _finishCascadeMove();
          },
        );
      },
      function () {
        hadError = true;
        remaining--;
        if (remaining === 0) _finishCascadeMove();
      },
    );
  });
}

function doAssign(type, prefix) {
  var staffId = document.getElementById(prefix + "AssignStaff")
    ? document.getElementById(prefix + "AssignStaff").value.trim()
    : "";
  var classLevel = document.getElementById(prefix + "ClassLevel")
    ? document.getElementById(prefix + "ClassLevel").value
    : "";
  if (!staffId) {
    showToast("Staff ID is required.", "warning");
    return;
  }
  // format check before calling the server.
  if (!validateStaffIdFormat(staffId)) {
    showToast("Staff ID must contain digits only (e.g. 23000).", "warning");
    return;
  }
  // client-side pre-check against the cached teacher list for fast feedback.
  var _statusCheck = _getTeacherStatusFromCache(staffId);
  if (_statusCheck === "Locked" || _statusCheck === "Inactive") {
    showToast(
      "Cannot assign duty to Staff ID " +
        staffId +
        " is " +
        _statusCheck +
        ". " +
        (_statusCheck === "Locked" ? "Unlock the account first." : "Reactivate the account first."),
      "warning",
    );
    return;
  }
  if (!classLevel) {
    showToast("Class Level is required.", "warning");
    return;
  }
  showSpinner();
  callServer(
    "assignTeacherToClass",
    { staffId: staffId, assignmentType: type, classLevel: classLevel },
    ADMIN_TOKEN,
  ).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        showToast(r ? r.message : "Assignment failed.", "error");
        return;
      }
      showToast(
        "Assigned " + staffId + " to " + classLevel + " (" + _assignmentTypeLabel(type) + ").",
        "success",
      );
      loadAssignments();
    },
    function (e) {
      hideSpinner();
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

function doRevokeAssignment(assignmentId) {
  showModal(
    "Revoke Assignment",
    "<p>Revoke assignment <strong>" +
      sanitizeDisplayValue(assignmentId) +
      "</strong>?</p>" +
      '<p style="margin-top:var(--space-3);color:var(--text-secondary);font-size:var(--font-size-sm);">This cannot be undone.</p>',
    [
      { label: "Cancel", cls: "btn--ghost", action: closeModal },
      {
        label: "Revoke",
        cls: "btn--danger",
        action: function () {
          closeModal(function () {
            _executeRevokeAssignment(assignmentId);
          });
        },
      },
    ],
  );
}

// Runs only after the admin confirms via the styled modal above.
function _executeRevokeAssignment(assignmentId) {
  showSpinner();
  callServer("revokeAssignment", { assignmentId: assignmentId }, ADMIN_TOKEN).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        showToast("Revoke failed.", "error");
        return;
      }
      showToast("Assignment revoked.", "success");
      loadAssignments();
      // Offer to revoke any auto-tagged SBA subjects the revoked teacher still holds —
      // no replacement is known here, so this only offers Skip/Revoke.
      _showCascadeSbaModal(r.cascadeCandidates || [], function () {});
    },
    function (e) {
      hideSpinner();
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

// Reassign — lets the Admin change which teacher covers a class's duty without manually
// revoking first.
function doReassign(assignmentId, classLevel, currentStaffId, type, prefix) {
  var label = _assignmentTypeLabel(type);

  var bodyHtml =
    "<p>Reassign <strong>" +
    sanitizeDisplayValue(label) +
    "</strong> duty for <strong>" +
    sanitizeDisplayValue(classLevel) +
    "</strong>?</p>" +
    '<p style="margin-top:var(--space-3);color:var(--text-secondary);font-size:var(--font-size-sm);">' +
    "This will revoke the current assignment for Staff ID " +
    sanitizeDisplayValue(currentStaffId) +
    " and create a new assignment for a different teacher. This cannot be undone." +
    "</p>" +
    '<div class="form-group" style="margin-top:var(--space-4);">' +
    '<label class="form-label" for="reassignStaffIdInput">New Staff ID</label>' +
    '<input type="text" class="form-control" id="reassignStaffIdInput" placeholder="e.g. 23000">' +
    "</div>" +
    '<div id="reassignStaffIdError" class="notice notice--error" style="display:none;margin-top:var(--space-3);"></div>';

  showModal("Reassign " + label + " Duty", bodyHtml, [
    { label: "Cancel", cls: "btn--ghost", action: closeModal },
    {
      label: "Reassign",
      cls: "btn--danger",
      action: function () {
        _submitReassign(assignmentId, classLevel, type, label);
      },
    },
  ]);
}

// Shows an inline error inside the modal instead of a toast so the admin doesn't lose context.
function _submitReassign(assignmentId, classLevel, type, label) {
  var input = document.getElementById("reassignStaffIdInput");
  var errDiv = document.getElementById("reassignStaffIdError");
  var newStaffId = input ? input.value.trim() : "";

  if (!newStaffId) {
    if (errDiv) {
      errDiv.textContent = "Staff ID is required.";
      errDiv.style.display = "block";
    }
    return;
  }
  // same digits-only format check as doAssign(), so a
  // reassignment can't be sent with a malformed Staff ID either.
  if (!validateStaffIdFormat(newStaffId)) {
    if (errDiv) {
      errDiv.textContent = "Staff ID must contain digits only (e.g. 23000).";
      errDiv.style.display = "block";
    }
    return;
  }
  // same cached-status pre-check as doAssign() — fast client feedback only;
  // assignTeacherToClass() in Code.gs is still the authoritative check that actually blocks the write.
  var _statusCheckReassign = _getTeacherStatusFromCache(newStaffId);
  if (_statusCheckReassign === "Locked" || _statusCheckReassign === "Inactive") {
    if (errDiv) {
      errDiv.textContent =
        "Cannot reassign — Staff ID " +
        newStaffId +
        " is " +
        _statusCheckReassign +
        ". " +
        (_statusCheckReassign === "Locked"
          ? "Unlock the account first."
          : "Reactivate the account first.");
      errDiv.style.display = "block";
    }
    return;
  }
  if (errDiv) errDiv.style.display = "none";

  closeModal(function () {
    _executeReassign(assignmentId, classLevel, type, label, newStaffId);
  });
}

// Runs only after the admin confirms via the modal above and submits a valid Staff ID.
function _executeReassign(assignmentId, classLevel, type, label, newStaffId) {
  showSpinner();
  callServer("revokeAssignment", { assignmentId: assignmentId }, ADMIN_TOKEN).then(
    function (revokeResult) {
      if (_checkAuthCode(revokeResult)) {
        hideSpinner();
        return;
      }
      if (!revokeResult || !revokeResult.success) {
        hideSpinner();
        showToast(revokeResult ? revokeResult.message : "Revoke failed.", "error");
        return;
      }
      // Candidates from the revoke step; newStaffId is patched in below once the
      // chained assign resolves.
      var _reassignCascadeCandidates = revokeResult.cascadeCandidates || [];

      // Revoke succeeded — immediately chain the new assignment.
      callServer(
        "assignTeacherToClass",
        { staffId: newStaffId, assignmentType: type, classLevel: classLevel },
        ADMIN_TOKEN,
      ).then(
        function (assignResult) {
          hideSpinner();
          if (_checkAuthCode(assignResult)) return;
          if (!assignResult || !assignResult.success) {
            showToast(
              (assignResult ? assignResult.message : "Reassignment failed after revoke.") +
                " The old assignment was already revoked — please assign the new teacher manually.",
              "error",
            );
            loadAssignments();
            // The old teacher's status was still cleared even though the new assignment
            // failed — still offer the cascade (Skip/Revoke only, no known replacement).
            if (type === "Attendance") {
              _showCascadeSbaModal(_reassignCascadeCandidates, function () {});
            }
            return;
          }
          showToast(
            "Reassigned " + classLevel + " (" + label + ") to Staff ID " + newStaffId + ".",
            "success",
          );
          loadAssignments();
          // Patch the now-known new teacher into every candidate so _showCascadeSbaModal()
          // can offer "Move to New Class Teacher" too.
          if (type === "Attendance" && _reassignCascadeCandidates.length > 0) {
            _reassignCascadeCandidates.forEach(function (c) {
              c.newStaffId = newStaffId;
            });
            _showCascadeSbaModal(_reassignCascadeCandidates, function () {});
          }
        },
        function (e) {
          hideSpinner();
          showToast(
            friendlyErrorFrontend(e ? e.message : "") +
              " The old assignment was already revoked — please assign the new teacher manually.",
            "error",
          );
          loadAssignments();
          if (type === "Attendance") {
            _showCascadeSbaModal(_reassignCascadeCandidates, function () {});
          }
        },
      );
    },
    function (e) {
      hideSpinner();
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

// ───────────────────────────────────────────────────────────────────────────── SECTION: ATTENDANCE
// RECORDS ─────────────────────────────────────────────────────────────────────────────

function buildAttendanceRecordsSection(container) {
  // class_level/academic_year/term/attendance_date are omitted from displayCols — they're
  // redundant with the filter controls already selected above.
  _buildRecordsViewSection(
    container,
    "Attendance Records",
    "att",
    "getAttendanceRecordsForAdmin",
    ["record_id", "student_name", "status", "recorded_by", "submitted_at", "sync_pending"],
    "Attendance Date",
    { type: "attendance" },
  );
}

function buildLevyRecordsSection(container) {
  // class_level/academic_year/term/levy_date are omitted from displayCols — they're redundant
  // with the filter controls already selected above.
  _buildRecordsViewSection(
    container,
    getLevyLabel("Daily Levy") + " Records",
    "levy",
    "getDailyLevyRecordsForAdmin",
    [
      "record_id",
      "student_name",
      "location_name",
      "amount_paid",
      "payment_status",
      "recorded_by",
      "submitted_at",
      "sync_pending",
    ],
    getLevyLabel("Daily Levy") + " Date",
    { type: "levy" },
  );
}

// SECTION: ADMISSION FEE / TUITION FEE RECORDS — read-only Admin view.
// No dateFieldLabel passed (last-but-one argument omitted) -- these
// records are termly, not per-date, so _buildRecordsViewSection() skips
// rendering a date filter/requirement entirely for them.

function buildAdmissionFeeRecordsSection(container) {
  // class_level/academic_year/term are omitted from displayCols — they're
  // redundant with the filter controls already selected above.
  _buildRecordsViewSection(
    container,
    getLevyLabel("Admission Fee") + " Records",
    "admfee",
    "getAdmissionFeeRecordsForAdmin",
    ["record_id", "student_name", "amount_paid", "recorded_by", "submitted_at", "sync_pending"],
    null,
    { type: "termlyfee" },
  );
}

function buildTuitionFeeRecordsSection(container) {
  _buildRecordsViewSection(
    container,
    getLevyLabel("Tuition Fee") + " Records",
    "tuifee",
    "getTuitionFeeRecordsForAdmin",
    ["record_id", "student_name", "amount_paid", "recorded_by", "submitted_at", "sync_pending"],
    null,
    { type: "termlyfee" },
  );
}

// SECTION: SBA RECORDS — read-only Admin view.

function buildSbaRecordsSection(container) {
  setHtml(
    container,
    '<div class="section-header"><div><div class="section-header__title">SBA Records</div>' +
      '<div class="section-header__subtitle">View submitted School-Based Assessment marks (read-only) and manage SBA duty assignments.</div></div></div>' +
      // "SBA Marks" / "Assignment" tabs — reuses the .tabs/.tab/
      // .tab-content classes, same pattern as switchExportTab() below.
      '<div class="tabs" id="sbaTabs">' +
      '<button class="tab active" data-onclick="switchSbaTab(\'sbaMarksTab\')">SBA Marks</button>' +
      '<button class="tab" data-onclick="switchSbaTab(\'sbaAssignTab\')">Assign Subjects & Classes</button>' +
      "</div>" +
      '<div id="sbaMarksTab" class="tab-content active" style="padding-top:var(--space-5);">' +
      '<div class="records-filter-row" style="display:flex;gap:var(--space-4);flex-wrap:wrap;align-items:flex-end;margin-bottom:var(--space-4);">' +
      '<div class="form-group records-filter-group" style="margin-bottom:0;"><label class="form-label">Class Type</label>' +
      '<select class="form-control" id="sbaRecClassType" style="width:130px;" data-onchange="_onSbaSchoolLevelChange()">' +
      '<option value="Normal">Normal</option><option value="A">A</option>' +
      '<option value="B">B</option><option value="C">C</option><option value="D">D</option>' +
      "</select></div>" +
      '<div class="form-group records-filter-group" style="margin-bottom:0;"><label class="form-label">Class Level</label>' +
      '<select class="form-control" id="sbaRecClassLevel" style="width:170px;" data-onchange="_onSbaClassLevelChange()"></select></div>' +
      '<div class="form-group records-filter-group" style="margin-bottom:0;"><label class="form-label">Subject</label>' +
      '<select class="form-control" id="sbaRecSubject" style="width:210px;"><option value="">Loading…</option></select></div>' +
      '<div class="form-group records-filter-group" style="margin-bottom:0;"><label class="form-label">Academic Year</label>' +
      '<div class="form-control" id="sbaRecYear" data-value="" style="width:150px;background:rgba(0,0,0,0.03);' +
      'cursor:default;display:flex;align-items:center;color:var(--text-muted);font-style:italic;">—</div></div>' +
      '<div class="form-group records-filter-group" style="margin-bottom:0;"><label class="form-label">Term</label>' +
      '<div class="form-control" id="sbaRecTerm" style="width:100px;background:rgba(0,0,0,0.03);' +
      'cursor:default;display:flex;align-items:center;color:var(--text-muted);font-style:italic;">—</div></div>' +
      '<button class="btn btn--primary records-load-btn" style="align-self:flex-end;" data-onclick="loadSbaRecordsView()">🔍 Load Marks</button>' +
      "</div>" +
      '<div id="sbaGridContainer" class="sba-grid-wrapper sba-grid-wrapper--admin-readonly">' +
      '<div class="empty-state"><div class="empty-state__body">Select Class Type, Class Level, and Subject, then click Load Marks.</div></div>' +
      "</div>" +
      "</div>" +
      '<div id="sbaAssignTab" class="tab-content" style="padding-top:var(--space-5);">' +
      '<div class="section-header" style="margin-top:0;"><div>' +
      '<div class="section-header__title">SBA Assignments</div>' +
      '<div class="section-header__subtitle">Assign a teacher to enter SBA marks for a class + subject. ' +
      "Multiple teachers can be assigned to the same class for different subjects.</div>" +
      "</div></div>" +
      '<div class="assignment-panel" style="max-width:100%;">' +
      '<div class="assignment-panel__header assignment-panel__header--center">📊 SBA Assignments</div>' +
      '<div class="assignment-panel__body assignment-panel__body--reflow">' +
      '<div class="assignment-panel__form-col">' +
      '<div class="assignment-panel__add-form">' +
      '<div class="assignment-panel__add-title">Assign Teacher</div>' +
      _buildTeacherNameSearchHTML("sba") +
      '<div class="form-group">' +
      '<label class="form-label">Staff ID</label>' +
      '<input type="text" class="form-control" id="sbaAssignStaff" placeholder="Staff ID" style="max-width:220px;text-align:center;">' +
      "</div>" +
      '<div class="form-group">' +
      '<label class="form-label">Class Type</label>' +
      '<select class="form-control" id="sbaAssignClassType" style="max-width:220px;" data-onchange="rebuildSbaAssignClassLevel()">' +
      '<option value="Normal">Normal</option><option value="A">A</option>' +
      '<option value="B">B</option><option value="C">C</option><option value="D">D</option>' +
      "</select>" +
      "</div>" +
      '<div class="form-group">' +
      '<label class="form-label">Class Level</label>' +
      '<select class="form-control" id="sbaAssignClassLevel" style="max-width:220px;" data-onchange="rebuildSbaAssignSubject()"></select>' +
      "</div>" +
      '<div class="form-group">' +
      '<label class="form-label">Subject</label>' +
      '<select class="form-control" id="sbaAssignSubject" style="max-width:220px;"><option value="">Loading…</option></select>' +
      "</div>" +
      '<button class="btn btn--primary" style="max-width:220px;width:100%;" data-onclick="doSbaAssign()">✅ Assign</button>' +
      "</div>" +
      "</div>" +
      '<div class="assignment-panel__table-col">' +
      '<div id="sbaAssignTable"><div class="loading-state"><div class="spinner spinner--sm"></div></div></div>' +
      "</div>" +
      "</div>" +
      "</div>",
  );

  // Fixed Academic Year / Term labels — reuses the existing
  // getSyncStatus()-backed loaders, no new endpoint.
  _ensureAcademicYearLoaded(function (year) {
    _applyAcademicYearLabel("sbaRecYear", year);
  });
  _ensureCurrentTermLoaded(function (term) {
    var termEl = document.getElementById("sbaRecTerm");
    if (!termEl) return;
    termEl.textContent = term || "Not configured";
    termEl.style.fontStyle = term ? "normal" : "italic";
    termEl.style.color = term ? "var(--text-primary)" : "var(--text-muted)";
  });

  // Load Subjects_Reference + Ghanaian Language display name (once
  // per session), then build the initial Class Level/Subject dropdowns.
  _loadSbaReferenceDataThen(function () {
    rebuildSbaClassLevelDropdown();
    rebuildSbaAssignClassLevel();
  });
  // moved here from buildClassAssignmentsSection().
  loadSbaAssignments();

  // same cache-priming guard as buildClassAssignmentsSection() above.
  if (TEACHERS_CACHE.length === 0) {
    callServer("getTeachersForAdmin", {}, ADMIN_TOKEN).then(
      function (r) {
        if (r && r.success) TEACHERS_CACHE = r.teachers || [];
      },
      function () {
        /* silent */
      },
    );
  }
}

// SECTION: BEHAVIOUR STATUS

function buildBehaviorStatusSection(container) {
  setHtml(
    container,
    '<div class="section-header"><div><div class="section-header__title">Behaviour Status</div>' +
      '<div class="section-header__subtitle">Live submission status for Student Behaviour Entries — one row per class level.</div></div></div>' +
      '<div class="records-filter-row" style="display:flex;gap:var(--space-4);flex-wrap:wrap;align-items:flex-end;margin-bottom:var(--space-4);">' +
      '<div class="form-group records-filter-group" style="margin-bottom:0;"><label class="form-label">Class Type</label>' +
      '<select class="form-control" id="bsClassType" style="width:130px;">' +
      '<option value="Normal">Normal</option><option value="A">A</option>' +
      '<option value="B">B</option><option value="C">C</option><option value="D">D</option>' +
      "</select></div>" +
      '<div class="form-group records-filter-group" style="margin-bottom:0;"><label class="form-label">Academic Year</label>' +
      '<div class="form-control" id="bsYear" style="width:150px;background:rgba(0,0,0,0.03);' +
      'cursor:default;display:flex;align-items:center;color:var(--text-muted);font-style:italic;">—</div></div>' +
      '<div class="form-group records-filter-group" style="margin-bottom:0;"><label class="form-label">Term</label>' +
      '<div class="form-control" id="bsTerm" style="width:100px;background:rgba(0,0,0,0.03);' +
      'cursor:default;display:flex;align-items:center;color:var(--text-muted);font-style:italic;">—</div></div>' +
      '<button class="btn btn--primary records-load-btn" style="align-self:flex-end;" data-onclick="loadBehaviorStatusView()">🔍 Load Status</button>' +
      "</div>" +
      '<div id="bsTableWrapper" class="table-wrapper">' +
      '<div class="empty-state"><div class="empty-state__body">Select Class Type, then click Load Status.</div></div>' +
      "</div>",
  );

  loadBehaviorStatusView();
}

function loadBehaviorStatusView() {
  var schoolLevel = "JHS";
  var classTypeEl = document.getElementById("bsClassType");
  var classType = classTypeEl ? classTypeEl.value : "Normal";

  var el = document.getElementById("bsTableWrapper");
  if (el)
    setHtml(
      el,
      '<div class="loading-state"><div class="spinner spinner--sm"></div> Loading…</div>',
    );
  showSpinner();

  callServer("getBehaviorRecordsStatusForAdmin", {}, ADMIN_TOKEN).then(
    function (r) {
      hideSpinner();
      if (!r || !r.success) {
        if (r && r.code === "UNAUTHORIZED") {
          forceAdminLogout();
          return;
        }
        if (el)
          setHtml(
            el,
            '<div class="empty-state"><div class="empty-state__title">Could not load status</div></div>',
          );
        return;
      }

      var yrEl = document.getElementById("bsYear");
      var tmEl = document.getElementById("bsTerm");
      if (yrEl) {
        yrEl.textContent = r.academicYear || "Not configured";
        yrEl.style.fontStyle = r.academicYear ? "normal" : "italic";
        yrEl.style.color = r.academicYear ? "var(--text-primary)" : "var(--text-muted)";
      }
      if (tmEl) {
        tmEl.textContent = r.currentTerm || "Not configured";
        tmEl.style.fontStyle = r.currentTerm ? "normal" : "italic";
        tmEl.style.color = r.currentTerm ? "var(--text-primary)" : "var(--text-muted)";
      }

      var classLevels = getEffectiveClassLevels(schoolLevel, classType);
      var statusByClass = r.statusByClass || {};

      if (!el) return;
      if (classLevels.length === 0) {
        setHtml(
          el,
          '<div class="empty-state"><div class="empty-state__title">No class levels found</div></div>',
        );
        return;
      }

      var rows = classLevels
        .map(function (cl) {
          var status = statusByClass[cl];
          var submitted = !!status;
          return (
            "<tr>" +
            "<td>" +
            sanitizeDisplayValue(cl) +
            "</td>" +
            "<td>" +
            sanitizeDisplayValue(status ? status.submittedBy : "—") +
            "</td>" +
            '<td style="font-size:var(--font-size-xs);">' +
            sanitizeDisplayValue(status ? status.submittedAt : "—") +
            "</td>" +
            '<td style="text-align:center;"><span class="badge ' +
            (submitted ? "badge--active" : "badge--neutral") +
            '">' +
            (submitted ? "Yes" : "No") +
            "</span></td>" +
            "</tr>"
          );
        })
        .join("");

      setHtml(
        el,
        '<table class="table table--striped">' +
          "<thead><tr><th>Class Level</th><th>Submitted By</th><th>Submitted At</th>" +
          '<th style="text-align:center;">Submitted</th></tr></thead>' +
          "<tbody>" +
          rows +
          "</tbody>" +
          "</table>",
      );
    },
    function (e) {
      hideSpinner();
      if (el)
        setHtml(
          el,
          '<div class="empty-state"><div class="empty-state__title">' +
            sanitizeDisplayValue(friendlyErrorFrontend(e ? e.message : "")) +
            "</div></div>",
        );
    },
  );
}

// Tab switcher for the SBA Record Interface — mirrors
// switchExportTab()'s .tabs/.tab/.tab-content toggle pattern.
function switchSbaTab(tabId) {
  var ids = ["sbaMarksTab", "sbaAssignTab"];
  ids.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle("active", id === tabId);
  });
  document.querySelectorAll("#sbaTabs .tab").forEach(function (t, i) {
    t.classList.toggle(
      "active",
      (i === 0 && tabId === "sbaMarksTab") || (i === 1 && tabId === "sbaAssignTab"),
    );
  });
}

// Loads Subjects_Reference and the configured Ghanaian Language
// display name exactly once per admin session.
function _loadSbaReferenceDataThen(callback) {
  if (ADMIN_SBA_REF_LOADED) {
    if (callback) callback();
    return;
  }
  var callsDone = 0;
  function _checkDone() {
    callsDone++;
    if (callsDone >= 2) {
      ADMIN_SBA_REF_LOADED = true;
      if (callback) callback();
    }
  }
  callServer("getSubjectsReference", {}, ADMIN_TOKEN).then(
    function (r) {
      if (r && r.success) {
        ADMIN_SBA_SUBJECTS_REF = r.subjects || [];
        setSubjectRegistry(r.registry);
      }
      _checkDone();
    },
    function () {
      _checkDone();
    },
  );

  callServer("getAttendanceConfig", {}, ADMIN_TOKEN).then(
    function (r) {
      if (r && r.success) ADMIN_SBA_GHANAIAN_LANG = r.ghanaianLanguageName || "";
      _checkDone();
    },
    function () {
      _checkDone();
    },
  );
}

// Class Type onchange handler — rebuilds Class Level (via
// getEffectiveClassLevels(), same helper the Duty Assignments panel uses) then cascades into the Subject rebuild.
function _onSbaSchoolLevelChange() {
  rebuildSbaClassLevelDropdown();
}

function rebuildSbaClassLevelDropdown() {
  var typeEl = document.getElementById("sbaRecClassType");
  var classType = typeEl ? typeEl.value : "Normal";
  var levels = getEffectiveClassLevels("JHS", classType);
  var clEl = document.getElementById("sbaRecClassLevel");
  if (!clEl) return;
  var cur = clEl.value;
  clEl.textContent = "";
  levels.forEach(function (lvl) {
    var o = document.createElement("option");
    o.value = lvl;
    o.textContent = lvl;
    clEl.appendChild(o);
  });
  if (levels.indexOf(cur) !== -1) clEl.value = cur;
  rebuildSbaSubjectDropdown();
}

// Class Level onchange handler — rebuilds the Subject dropdown via
// the shared getSubjectsForClassLevel() resolver.
function _onSbaClassLevelChange() {
  rebuildSbaSubjectDropdown();
}

function rebuildSbaSubjectDropdown() {
  var clEl = document.getElementById("sbaRecClassLevel");
  var subjEl = document.getElementById("sbaRecSubject");
  if (!clEl || !subjEl) return;
  var classLevel = clEl.value;
  var subjects = getSubjectsForClassLevel(
    classLevel,
    ADMIN_SBA_GHANAIAN_LANG,
    ADMIN_SBA_SUBJECTS_REF,
  );
  var cur = subjEl.value;
  setHtml(subjEl, '<option value="">— Select —</option>');
  subjects.forEach(function (s) {
    var o = document.createElement("option");
    o.value = s.subjectId !== null && s.subjectId !== undefined ? String(s.subjectId) : "";
    o.textContent = s.displayName;
    subjEl.appendChild(o);
  });
  if (cur) subjEl.value = cur;
  subjEl.setAttribute("data-has-subjects", subjects.length > 0 ? "1" : "0");
}

// Load Marks — fetches the class roster; admin sessions bypass the
// SBA_ASSIGN_ gating check entirely inside getStudentsForClass().
function loadSbaRecordsView() {
  var classLevel = document.getElementById("sbaRecClassLevel")
    ? document.getElementById("sbaRecClassLevel").value
    : "";
  var subjectId = document.getElementById("sbaRecSubject")
    ? document.getElementById("sbaRecSubject").value
    : "";
  var yearEl = document.getElementById("sbaRecYear");
  var academicYear = yearEl ? yearEl.getAttribute("data-value") || "" : "";
  var term = ADMIN_CURRENT_TERM || "";

  if (!classLevel) {
    showToast("Select a Class Level first.", "warning");
    return;
  }
  if (!subjectId) {
    var _sbaSubjEl = document.getElementById("sbaRecSubject");
    var _sbaHasSubjects = _sbaSubjEl && _sbaSubjEl.getAttribute("data-has-subjects") === "1";
    showToast(_sbaHasSubjects ? "Select a Subject first." : "No records available.", "warning");
    return;
  }
  if (!academicYear || !term) {
    showToast("Academic Year/Term is not configured yet. Sync the desktop app first.", "warning");
    return;
  }

  var el = document.getElementById("sbaGridContainer");
  if (el)
    setHtml(
      el,
      '<div class="loading-state"><div class="spinner spinner--sm"></div> Loading…</div>',
    );
  showSpinner();

  var studentsResult = null;
  var marksResult = null;
  var callsDone = 0;

  function _tryRender() {
    callsDone++;
    if (callsDone < 2) return;
    hideSpinner();
    if (_checkAuthCode(studentsResult) || _checkAuthCode(marksResult)) return;
    if (!el) return;

    if (!studentsResult || !studentsResult.success) {
      setHtml(
        el,
        '<div class="empty-state"><div class="empty-state__title">Could not load students</div>' +
          '<div class="empty-state__body">' +
          sanitizeDisplayValue(
            (studentsResult && studentsResult.message) || "Check filters and try again.",
          ) +
          "</div></div>",
      );
      return;
    }

    var students = studentsResult.students || [];
    if (students.length === 0) {
      setHtml(
        el,
        '<div class="empty-state"><div class="empty-state__title">No students found</div>' +
          '<div class="empty-state__body">' +
          sanitizeDisplayValue(
            studentsResult.message ||
              "No students are enrolled in this class for the current academic year/term.",
          ) +
          "</div></div>",
      );
      return;
    }

    var records = marksResult && marksResult.success ? marksResult.records || {} : {};
    renderSbaGrid(el, students, records, true);
  }

  callServer(
    "getStudentsForClass",
    {
      classLevel: classLevel,
      academicYear: academicYear,
      term: term,
      assignmentType: "SBA",
      subjectId: subjectId,
    },
    ADMIN_TOKEN,
  ).then(
    function (r) {
      studentsResult = r;
      _tryRender();
    },
    function (e) {
      studentsResult = {
        success: false,
        message: friendlyErrorFrontend(e ? e.message : ""),
      };
      _tryRender();
    },
  );

  callServer(
    "getExistingSbaMarks",
    { classLevel: classLevel, academicYear: academicYear, term: term, subjectId: subjectId },
    ADMIN_TOKEN,
  ).then(
    function (r) {
      marksResult = r;
      _tryRender();
    },
    function () {
      marksResult = { success: false, records: {} };
      _tryRender();
    },
  );
}

// SECTION: MOCK EXAMS — read-only Admin view.

// Only the class-level variants that Teacher_SBA_Assignments can actually hold, per the Duty
// Assignment / SBA Assignment class-type dropdown (Normal + A–D — no "E" suffix is ever assignable there).
var MOCK_CLASS_LEVELS = ["Basic 9", "Basic 9A", "Basic 9B", "Basic 9C", "Basic 9D"];

function buildMockExamsSection(container) {
  setHtml(
    container,
    '<div class="section-header"><div><div class="section-header__title">Mock Exams</div>' +
      '<div class="section-header__subtitle">View submitted Mock Exam marks (read-only) for Basic 9 and its variants.</div></div></div>' +
      // Admin-facing control to explicitly activate a mock number for
      // teachers/admin on the portal — independent of any marks sync.
      '<div class="records-filter-row" style="display:flex;gap:var(--space-4);align-items:flex-end;margin-bottom:var(--space-4);">' +
      '<div class="form-group records-filter-group" style="margin-bottom:0;"><label class="form-label">Set Active Mock Number</label>' +
      '<select class="form-control" id="mockSetActiveSelector" style="width:120px;">' +
      '<option value="1">1</option><option value="2">2</option><option value="3">3</option>' +
      '<option value="4">4</option><option value="5">5</option><option value="6">6</option>' +
      '<option value="7">7</option><option value="8">8</option><option value="9">9</option>' +
      '<option value="10">10</option>' +
      "</select></div>" +
      '<button class="btn btn--primary" id="mockSetActiveBtn" data-onclick="setActiveMockNumber()">✅ Set Active Mock</button>' +
      "</div>" +
      // Mock Exams Fee Collection reassign/revoke panel, mirroring the Duty/SBA Assignment
      // panel layout, scoped to a single Basic 9 (or variant) collector for the live academic year.
      '<div class="assignment-panel" style="max-width:100%;margin-bottom:var(--space-5);">' +
      '<div class="assignment-panel__header assignment-panel__header--center">💰 Mock Exams Fee Collection</div>' +
      '<div class="assignment-panel__body assignment-panel__body--reflow">' +
      '<div class="assignment-panel__form-col">' +
      '<div class="assignment-panel__add-form">' +
      '<div class="assignment-panel__add-title">Reassign Collector</div>' +
      _buildTeacherNameSearchHTML("mock") +
      '<div class="form-group">' +
      '<label class="form-label">Staff ID</label>' +
      '<input type="text" class="form-control" id="mockFeeAssignStaff" placeholder="Staff ID" style="max-width:220px;text-align:center;">' +
      "</div>" +
      '<div class="form-group">' +
      '<label class="form-label">Class Level</label>' +
      '<select class="form-control" id="mockFeeAssignClassLevel" style="max-width:220px;">' +
      '<option value="">— Select —</option>' +
      MOCK_CLASS_LEVELS.map(function (lvl) {
        var safe = sanitizeDisplayValue(lvl);
        return '<option value="' + safe + '">' + safe + "</option>";
      }).join("") +
      "</select>" +
      "</div>" +
      '<button class="btn btn--primary" style="max-width:220px;width:100%;" data-onclick="doReassignMockFeeCollection()">✅ Reassign</button>' +
      "</div>" +
      "</div>" +
      '<div class="assignment-panel__table-col">' +
      '<div id="mockFeeAssignInfo"><div class="loading-state"><div class="spinner spinner--sm"></div></div></div>' +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="section-header" style="margin-bottom:var(--space-3);"><div><div class="section-header__title" style="font-size:var(--font-size-lg);">View Mock Exams Scores</div></div></div>' +
      '<div class="records-filter-row" style="display:flex;gap:var(--space-4);flex-wrap:wrap;align-items:flex-end;margin-bottom:var(--space-4);">' +
      '<div class="form-group records-filter-group" style="margin-bottom:0;"><label class="form-label">Class Level ' +
      '<span class="required" style="color:var(--color-error);">*</span></label>' +
      '<select class="form-control" id="mockRecClassLevel" style="width:160px;" data-onchange="rebuildMockSubjectDropdown()">' +
      '<option value="">— Select —</option>' +
      MOCK_CLASS_LEVELS.map(function (lvl) {
        var safe = sanitizeDisplayValue(lvl);
        return '<option value="' + safe + '">' + safe + "</option>";
      }).join("") +
      "</select></div>" +
      '<div class="form-group records-filter-group" style="margin-bottom:0;"><label class="form-label">Subject</label>' +
      '<select class="form-control" id="mockRecSubject" style="width:210px;"><option value="">Loading…</option></select></div>' +
      '<div class="form-group records-filter-group" style="margin-bottom:0;"><label class="form-label">Academic Year</label>' +
      '<div class="form-control" id="mockRecYear" data-value="" style="width:150px;background:rgba(0,0,0,0.03);' +
      'cursor:default;display:flex;align-items:center;color:var(--text-muted);font-style:italic;">—</div></div>' +
      '<div class="form-group records-filter-group" style="margin-bottom:0;"><label class="form-label">Mock Number</label>' +
      '<div class="form-control" id="mockRecMockNum" data-value="" style="width:110px;background:rgba(0,0,0,0.03);' +
      'cursor:default;display:flex;align-items:center;color:var(--text-muted);font-style:italic;">—</div></div>' +
      '<button class="btn btn--primary records-load-btn" style="align-self:flex-end;" data-onclick="loadMockRecordsView()">🔍 Load Marks</button>' +
      "</div>" +
      '<div id="mockGridContainer" class="sba-grid-wrapper sba-grid-wrapper--admin-readonly">' +
      '<div class="empty-state"><div class="empty-state__body">Select Class Level and Subject, then click Load Marks.</div></div>' +
      "</div>",
  );

  // Fixed Academic Year label — reuses the existing getSyncStatus()-backed loader, no new endpoint.
  _ensureAcademicYearLoaded(function (year) {
    _applyAcademicYearLabel("mockRecYear", year);
  });

  callServer("getAttendanceConfig", {}, ADMIN_TOKEN).then(
    function (r) {
      var el = document.getElementById("mockRecMockNum");
      if (!el) return;
      var mockNum = r && r.success ? r.currentMockNumber || "" : "";
      el.textContent = mockNum || "Not configured";
      el.setAttribute("data-value", mockNum || "");
      el.style.fontStyle = mockNum ? "normal" : "italic";
      el.style.color = mockNum ? "var(--text-primary)" : "var(--text-muted)";
      // keep the new setter combo in sync with the current value.
      var setSel = document.getElementById("mockSetActiveSelector");
      if (setSel && mockNum) setSel.value = mockNum;
    },
    function () {
      var el = document.getElementById("mockRecMockNum");
      if (el) el.textContent = "—";
    },
  );

  // Load Subjects_Reference + Ghanaian Language display name (once per admin session — idempotent via
  // ADMIN_SBA_REF_LOADED), then build the initial Subject dropdown for the currently empty Class Level.
  _loadSbaReferenceDataThen(function () {
    rebuildMockSubjectDropdown();
  });

  // load the current Mock Exams Fee collector into the new panel above.
  loadMockFeeAssignment();
}

// Reassign/revoke panel logic, mirroring the Duty/SBA Assignment load-and-render pattern.

function loadMockFeeAssignment() {
  var el = document.getElementById("mockFeeAssignInfo");
  if (el) setHtml(el, '<div class="loading-state"><div class="spinner spinner--sm"></div></div>');
  callServer("getMockFeeAssignmentForAdmin", {}, ADMIN_TOKEN).then(
    function (r) {
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        if (el)
          setHtml(
            el,
            '<p class="text-muted" style="font-size:var(--font-size-sm);padding:var(--space-3) 0;">Could not load Mock Exams Fee collector.</p>',
          );
        return;
      }
      _renderMockFeeAssignmentPanel(r);
    },
    function () {
      if (el)
        setHtml(
          el,
          '<p class="text-muted" style="font-size:var(--font-size-sm);padding:var(--space-3) 0;">Server error loading Mock Exams Fee collector.</p>',
        );
    },
  );
}

// Renders every active Mock Exams Fee collector for the academic year — one row per
// class level, since Basic 9A/9B/9C/9D can each hold their own.
function _renderMockFeeAssignmentPanel(r) {
  var el = document.getElementById("mockFeeAssignInfo");
  if (!el) return;

  var assignments = r.assignments || [];

  if (assignments.length === 0) {
    setHtml(
      el,
      '<p class="text-muted" style="font-size:var(--font-size-sm);padding:var(--space-3) 0;">' +
        "No teacher is currently assigned to collect Mock Exams Fee for " +
        sanitizeDisplayValue(r.academicYear || "the current academic year") +
        ". This is normally set automatically from the Basic 9 (or variant) Form/Class Teacher.</p>",
    );
    return;
  }

  var rows = assignments
    .map(function (a) {
      var sourceLabel =
        a.assignmentSource === "manual"
          ? '<span class="badge badge--neutral" style="font-size:10px;">Manually Assigned</span>'
          : '<span class="badge badge--neutral" style="font-size:10px;">Auto (Form/Class Teacher)</span>';
      return (
        "<tr>" +
        '<td style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
        "<div>" +
        sanitizeDisplayValue(a.teacherName || a.staffId) +
        "</div>" +
        '<div style="font-family:var(--font-mono);font-size:var(--font-size-xs);color:var(--text-secondary);">' +
        sanitizeDisplayValue(a.staffId || "") +
        "</div>" +
        "</td>" +
        "<td>" +
        sanitizeDisplayValue(a.classLevel || "") +
        "</td>" +
        "<td>" +
        sourceLabel +
        "</td>" +
        '<td class="table-actions">' +
        '<button class="btn btn--danger btn--sm" data-onclick="doRevokeMockFeeCollection(\'' +
        escapeForJsAttr(a.assignmentId || "") +
        '\')" title="Revoke — the teacher immediately loses access to the Mock Exams Fee tab on next check.">Revoke</button>' +
        "</td>" +
        "</tr>"
      );
    })
    .join("");

  setHtml(
    el,
    '<div class="table-wrapper" style="margin-bottom:var(--space-4);">' +
      '<table class="table" style="width:100%;min-width:700px;table-layout:fixed;">' +
      "<colgroup>" +
      '<col style="width:280px;">' +
      '<col style="width:150px;">' +
      '<col style="width:160px;">' +
      '<col style="width:110px;">' +
      "</colgroup>" +
      "<thead><tr><th>Teacher</th><th>Class Level</th><th>Source</th><th>Action</th></tr></thead>" +
      "<tbody>" +
      rows +
      "</tbody></table></div>",
  );
}

// Revokes any existing active row and creates a new assignment_source="manual" row,
// which _syncMockFeeAssignmentForFormTeacher() never auto-supersedes.
function doReassignMockFeeCollection() {
  var staffId = document.getElementById("mockFeeAssignStaff")
    ? document.getElementById("mockFeeAssignStaff").value.trim()
    : "";
  var classLevel = document.getElementById("mockFeeAssignClassLevel")
    ? document.getElementById("mockFeeAssignClassLevel").value
    : "";

  if (!staffId) {
    showToast("Staff ID is required.", "warning");
    return;
  }
  if (!validateStaffIdFormat(staffId)) {
    showToast("Staff ID must contain digits only (e.g. 23000).", "warning");
    return;
  }
  var _statusCheck = _getTeacherStatusFromCache(staffId);
  if (_statusCheck === "Locked" || _statusCheck === "Inactive") {
    showToast(
      "Cannot assign Mock Exams Fee collection — Staff ID " +
        staffId +
        " is " +
        _statusCheck +
        ". " +
        (_statusCheck === "Locked" ? "Unlock the account first." : "Reactivate the account first."),
      "warning",
    );
    return;
  }
  if (!classLevel) {
    showToast("Class Level is required.", "warning");
    return;
  }

  showModal(
    "Reassign Mock Exams Fee Collection",
    "<p>Assign Staff ID <strong>" +
      sanitizeDisplayValue(staffId) +
      "</strong> to collect Mock Exams Fee for <strong>" +
      sanitizeDisplayValue(classLevel) +
      "</strong>?</p>" +
      '<p style="margin-top:var(--space-3);color:var(--text-secondary);font-size:var(--font-size-sm);">' +
      "This replaces any teacher currently collecting Mock Exams Fee for this class, and sticks even if this teacher is not the Form/Class Teacher." +
      "</p>",
    [
      { label: "Cancel", cls: "btn--ghost", action: closeModal },
      {
        label: "Reassign",
        cls: "btn--accent",
        action: function () {
          closeModal(function () {
            _executeReassignMockFeeCollection(staffId, classLevel);
          });
        },
      },
    ],
  );
}

function _executeReassignMockFeeCollection(staffId, classLevel) {
  showSpinner();
  callServer(
    "adminReassignMockFeeCollection",
    { staffId: staffId, classLevel: classLevel },
    ADMIN_TOKEN,
  ).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        showToast(r ? r.message : "Assignment failed.", "error");
        return;
      }
      showToast(
        "Assigned " + staffId + " to collect Mock Exams Fee for " + classLevel + ".",
        "success",
      );
      var staffInput = document.getElementById("mockFeeAssignStaff");
      if (staffInput) staffInput.value = "";
      loadMockFeeAssignment();
    },
    function (e) {
      hideSpinner();
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

// Revoke — the teacher loses Teacher Portal access to the Mock Exams Fee tab
// immediately on their next getMockFeeCollectionInfo() check.
function doRevokeMockFeeCollection(assignmentId) {
  showModal(
    "Revoke Mock Exams Fee Collection",
    "<p>Revoke this teacher's Mock Exams Fee collection access?</p>" +
      '<p style="margin-top:var(--space-3);color:var(--text-secondary);font-size:var(--font-size-sm);">' +
      "They will lose access to the Mock Exams Fee tab immediately. This cannot be undone — use Reassign afterward to give the duty to someone else." +
      "</p>",
    [
      { label: "Cancel", cls: "btn--ghost", action: closeModal },
      {
        label: "Revoke",
        cls: "btn--danger",
        action: function () {
          closeModal(function () {
            _executeRevokeMockFeeCollection(assignmentId);
          });
        },
      },
    ],
  );
}

function _executeRevokeMockFeeCollection(assignmentId) {
  showSpinner();
  callServer("adminRevokeMockFeeCollection", { assignmentId: assignmentId }, ADMIN_TOKEN).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        showToast(r ? r.message : "Revoke failed.", "error");
        return;
      }
      showToast("Mock Exams Fee collection revoked.", "success");
      loadMockFeeAssignment();
    },
    function (e) {
      hideSpinner();
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

// Writes Config.CURRENT_MOCK_NUMBER directly — read by teachers' Mock Exams tab via
// getAttendanceConfig(), independent of any marks sync.
function setActiveMockNumber() {
  var sel = document.getElementById("mockSetActiveSelector");
  var mockNum = sel ? sel.value : "";
  if (!mockNum) {
    showToast("Select a mock number first.", "warning");
    return;
  }

  showModal(
    "Set Active Mock Number",
    "<p>Set Mock <strong>" +
      sanitizeDisplayValue(mockNum) +
      "</strong> as the active mock number for teachers and admin?</p>" +
      '<p style="margin-top:var(--space-3);color:var(--text-secondary);font-size:var(--font-size-sm);">' +
      "Teachers will now enter marks for this mock number in the Mock Exams tab." +
      "</p>",
    [
      { label: "Cancel", cls: "btn--ghost", action: closeModal },
      {
        label: "Set Active",
        cls: "btn--accent",
        action: function () {
          closeModal(function () {
            showSpinner();
            callServer("adminSetCurrentMockNumber", { mockNumber: mockNum }, ADMIN_TOKEN).then(
              function (r) {
                hideSpinner();
                if (_checkAuthCode(r)) return;
                if (!r || !r.success) {
                  showToast(r ? r.message : "Failed to set mock number.", "error");
                  return;
                }
                showToast("Mock " + r.currentMockNumber + " is now active.", "success");
                ADMIN_CURRENT_MOCK_NUM = r.currentMockNumber;
                var el = document.getElementById("mockRecMockNum");
                if (el) {
                  el.textContent = r.currentMockNumber;
                  el.setAttribute("data-value", r.currentMockNumber);
                  el.style.fontStyle = "normal";
                  el.style.color = "var(--text-primary)";
                }
              },
              function (e) {
                hideSpinner();
                showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
              },
            );
          });
        },
      },
    ],
  );
}

// Class Level onchange handler — rebuilds the Subject dropdown via
// the shared resolver, exactly like rebuildSbaSubjectDropdown() does for SBA.
function rebuildMockSubjectDropdown() {
  var clEl = document.getElementById("mockRecClassLevel");
  var subjEl = document.getElementById("mockRecSubject");
  if (!clEl || !subjEl) return;
  var classLevel = clEl.value;
  var subjects = getSubjectsForClassLevel(
    classLevel,
    ADMIN_SBA_GHANAIAN_LANG,
    ADMIN_SBA_SUBJECTS_REF,
  );
  var cur = subjEl.value;
  setHtml(subjEl, '<option value="">— Select —</option>');
  subjects.forEach(function (s) {
    var o = document.createElement("option");
    o.value = s.subjectId !== null && s.subjectId !== undefined ? String(s.subjectId) : "";
    o.textContent = s.displayName;
    subjEl.appendChild(o);
  });
  if (cur) subjEl.value = cur;
  subjEl.setAttribute("data-has-subjects", subjects.length > 0 ? "1" : "0");
}

// Load Marks — admin sessions bypass the SBA_ASSIGN_ gating check
// entirely inside getStudentsForClass(), same as the SBA Records view.
function loadMockRecordsView() {
  var clEl = document.getElementById("mockRecClassLevel");
  var subjEl = document.getElementById("mockRecSubject");
  var classLevel = clEl ? clEl.value : "";
  var subjectId = subjEl ? subjEl.value : "";
  var yearEl = document.getElementById("mockRecYear");
  var academicYear = yearEl ? yearEl.getAttribute("data-value") || "" : "";
  var mockNumEl = document.getElementById("mockRecMockNum");
  var mockNum = mockNumEl ? mockNumEl.getAttribute("data-value") || "" : "";
  var term = ADMIN_CURRENT_TERM || "";

  if (!classLevel) {
    showToast("Select a Class Level first.", "warning");
    return;
  }
  if (!subjectId) {
    var _mockHasSubjects = subjEl && subjEl.getAttribute("data-has-subjects") === "1";
    showToast(_mockHasSubjects ? "Select a Subject first." : "No records available.", "warning");
    return;
  }
  if (!academicYear) {
    showToast("Academic Year is not configured yet. Sync the desktop app first.", "warning");
    return;
  }
  if (!mockNum) {
    showToast("Current Mock Number is not configured yet. Sync the desktop app first.", "warning");
    return;
  }
  if (!term) {
    _ensureCurrentTermLoaded(function (t) {
      if (!t) {
        showToast("Current Term is not configured yet. Sync the desktop app first.", "warning");
        return;
      }
      loadMockRecordsView();
    });
    return;
  }

  var el = document.getElementById("mockGridContainer");
  if (el)
    setHtml(
      el,
      '<div class="loading-state"><div class="spinner spinner--sm"></div> Loading…</div>',
    );
  showSpinner();

  var studentsResult = null;
  var marksResult = null;
  var callsDone = 0;

  function _tryRender() {
    callsDone++;
    if (callsDone < 2) return;
    hideSpinner();
    if (_checkAuthCode(studentsResult) || _checkAuthCode(marksResult)) return;
    if (!el) return;

    if (!studentsResult || !studentsResult.success) {
      setHtml(
        el,
        '<div class="empty-state"><div class="empty-state__title">Could not load students</div>' +
          '<div class="empty-state__body">' +
          sanitizeDisplayValue(
            (studentsResult && studentsResult.message) || "Check filters and try again.",
          ) +
          "</div></div>",
      );
      return;
    }

    var students = studentsResult.students || [];
    if (students.length === 0) {
      setHtml(
        el,
        '<div class="empty-state"><div class="empty-state__title">No students found</div>' +
          '<div class="empty-state__body">' +
          sanitizeDisplayValue(
            studentsResult.message ||
              "No students are enrolled in this class for the current academic year/term.",
          ) +
          "</div></div>",
      );
      return;
    }

    var records = marksResult && marksResult.success ? marksResult.records || {} : {};
    renderMockGrid(el, students, records, true);
  }

  callServer(
    "getStudentsForClass",
    {
      classLevel: classLevel,
      academicYear: academicYear,
      term: term,
      assignmentType: "Mock",
      subjectId: subjectId,
    },
    ADMIN_TOKEN,
  ).then(
    function (r) {
      studentsResult = r;
      _tryRender();
    },
    function (e) {
      studentsResult = {
        success: false,
        message: friendlyErrorFrontend(e ? e.message : ""),
      };
      _tryRender();
    },
  );

  callServer(
    "getExistingMockMarks",
    { classLevel: classLevel, academicYear: academicYear, subjectId: subjectId, mockNum: mockNum },
    ADMIN_TOKEN,
  ).then(
    function (r) {
      marksResult = r;
      _tryRender();
    },
    function () {
      marksResult = { success: false, records: {} };
      _tryRender();
    },
  );
}

// SHARED HELPERS — CANONICAL CLASS LEVEL + ACADEMIC YEAR

/* Returns <option> HTML for the class-level list (always JHS: Basic 7-9). */
function _classLevelSelectOptionsForLevel(_level, includeAllOption) {
  // This portal only ever operates against JHS (Basic 7-9).
  var baseClasses = ["Basic 7", "Basic 8", "Basic 9"];

  var suffixes = ["A", "B", "C", "D", "E"];
  var options = [];
  baseClasses.forEach(function (cl) {
    options.push(cl);
    suffixes.forEach(function (s) {
      options.push(cl + s);
    });
  });
  var html = includeAllOption ? '<option value="">All</option>' : "";
  html += options
    .map(function (o) {
      var safe = sanitizeDisplayValue(o);
      return '<option value="' + safe + '">' + safe + "</option>";
    })
    .join("");
  return html;
}

/* Returns <option> HTML for the canonical class level list — the
   same 14-base-class x (Normal + A-E suffix) set used to build the
   Form Teacher Class dropdown. */
function _classLevelSelectOptions(includeAllOption) {
  return _classLevelSelectOptionsForLevel("", includeAllOption);
}

/* Ensures ADMIN_ACADEMIC_YEAR is populated before rendering a fixed Academic Year label. */
function _ensureAcademicYearLoaded(onReady) {
  if (ADMIN_ACADEMIC_YEAR) {
    if (onReady) onReady(ADMIN_ACADEMIC_YEAR);
    return;
  }
  callServer("getSyncStatus", {}, ADMIN_TOKEN).then(
    function (r) {
      if (r && r.success) {
        ADMIN_ACADEMIC_YEAR = r.academicYear || "";
        // piggyback the term fetch onto this same getSyncStatus() round-trip so
        // _ensureCurrentTermLoaded() below rarely needs its own network call.
        ADMIN_CURRENT_TERM = r.currentTerm || "";
      }
      if (onReady) onReady(ADMIN_ACADEMIC_YEAR);
    },
    function () {
      if (onReady) onReady(ADMIN_ACADEMIC_YEAR);
    },
  );
}

// mirrors _ensureAcademicYearLoaded() but for CURRENT_TERM.
function _ensureCurrentTermLoaded(onReady) {
  if (ADMIN_CURRENT_TERM) {
    if (onReady) onReady(ADMIN_CURRENT_TERM);
    return;
  }
  // previously delegated to _ensureAcademicYearLoaded(), which short-circuits and skips its
  // network call whenever ADMIN_ACADEMIC_YEAR is already cached (e.g.
  callServer("getSyncStatus", {}, ADMIN_TOKEN).then(
    function (r) {
      if (r && r.success) {
        ADMIN_ACADEMIC_YEAR = r.academicYear || ADMIN_ACADEMIC_YEAR;
        ADMIN_CURRENT_TERM = r.currentTerm || "";
      }
      if (onReady) onReady(ADMIN_CURRENT_TERM);
    },
    function () {
      if (onReady) onReady(ADMIN_CURRENT_TERM);
    },
  );
}

// Current Mock Number, sourced from getAttendanceConfig()'s currentMockNumber field —
// mirrors _ensureAcademicYearLoaded()/_ensureCurrentTermLoaded().
var ADMIN_CURRENT_MOCK_NUM = "";

function _ensureCurrentMockNumberLoaded(onReady) {
  if (ADMIN_CURRENT_MOCK_NUM) {
    if (onReady) onReady(ADMIN_CURRENT_MOCK_NUM);
    return;
  }
  callServer("getAttendanceConfig", {}, ADMIN_TOKEN).then(
    function (r) {
      if (r && r.success) {
        ADMIN_CURRENT_MOCK_NUM = r.currentMockNumber || "";
      }
      if (onReady) onReady(ADMIN_CURRENT_MOCK_NUM);
    },
    function () {
      if (onReady) onReady(ADMIN_CURRENT_MOCK_NUM);
    },
  );
}

/* Applies the loaded academic year value to a fixed read-only label div rendered by
   _buildRecordsViewSection / _buildExportFilterRow. */
function _applyAcademicYearLabel(elId, year) {
  var yrEl = document.getElementById(elId);
  if (!yrEl) return;
  yrEl.textContent = year || "Not configured";
  yrEl.setAttribute("data-value", year || "");
  yrEl.style.fontStyle = year ? "normal" : "italic";
  yrEl.style.color = year ? "var(--text-primary)" : "var(--text-muted)";
}

// Records-view statistics block builder.
function _buildRecordsStatsBlockHtml(prefix, statsConfig) {
  if (!statsConfig || !statsConfig.type) return "";

  if (statsConfig.type === "attendance") {
    return (
      '<div id="' +
      prefix +
      'RecStats" class="stat-grid" style="display:none;margin-bottom:var(--space-4);">' +
      '<div class="stat-card stat-card--active">' +
      '<div class="stat-card__label">Boys Present</div>' +
      '<div class="stat-card__value" id="' +
      prefix +
      'StatBoysPresent">0</div></div>' +
      '<div class="stat-card stat-card--active">' +
      '<div class="stat-card__label">Girls Present</div>' +
      '<div class="stat-card__value" id="' +
      prefix +
      'StatGirlsPresent">0</div></div>' +
      '<div class="stat-card stat-card--error">' +
      '<div class="stat-card__label">Boys Absent</div>' +
      '<div class="stat-card__value" id="' +
      prefix +
      'StatBoysAbsent">0</div></div>' +
      '<div class="stat-card stat-card--error">' +
      '<div class="stat-card__label">Girls Absent</div>' +
      '<div class="stat-card__value" id="' +
      prefix +
      'StatGirlsAbsent">0</div></div>' +
      // Total Present / Total Absent cards.
      '<div class="stat-card stat-card--active">' +
      '<div class="stat-card__label">Total Present</div>' +
      '<div class="stat-card__value" id="' +
      prefix +
      'StatTotalPresent">0</div></div>' +
      '<div class="stat-card stat-card--error">' +
      '<div class="stat-card__label">Total Absent</div>' +
      '<div class="stat-card__value" id="' +
      prefix +
      'StatTotalAbsent">0</div></div>' +
      "</div>"
    );
  }

  // Paid/Absent/Not Paid/Total Collected stat cards for buildLevyRecordsSection() — same
  // .stat-grid/.stat-card classes as the "attendance" branch above (DRY, no new CSS needed).
  if (statsConfig.type === "levy") {
    return (
      '<div id="' +
      prefix +
      'RecStats" class="stat-grid" style="display:none;margin-bottom:var(--space-4);">' +
      '<div class="stat-card stat-card--active">' +
      '<div class="stat-card__label">Paid</div>' +
      '<div class="stat-card__value" id="' +
      prefix +
      'StatPaid">0</div></div>' +
      '<div class="stat-card stat-card--warning">' +
      '<div class="stat-card__label">Absent</div>' +
      '<div class="stat-card__value" id="' +
      prefix +
      'StatAbsent">0</div></div>' +
      '<div class="stat-card stat-card--error">' +
      '<div class="stat-card__label">Not Paid</div>' +
      '<div class="stat-card__value" id="' +
      prefix +
      'StatNotPaid">0</div></div>' +
      '<div class="stat-card">' +
      '<div class="stat-card__label">Total Collected</div>' +
      '<div class="stat-card__value" id="' +
      prefix +
      'StatTotalCollected">GH₵ 0.00</div></div>' +
      "</div>"
    );
  }

  // Fully Paid/Outstanding/Total Collected/Total Outstanding stat cards for
  // buildAdmissionFeeRecordsSection()/buildTuitionFeeRecordsSection() -- amount_paid is a
  // running total against the rate, so a student is either fully paid or not yet.
  if (statsConfig.type === "termlyfee") {
    return (
      '<div id="' +
      prefix +
      'RecStats" class="stat-grid" style="display:none;margin-bottom:var(--space-4);">' +
      '<div class="stat-card stat-card--active">' +
      '<div class="stat-card__label">Fully Paid</div>' +
      '<div class="stat-card__value" id="' +
      prefix +
      'StatFullyPaid">0</div></div>' +
      '<div class="stat-card stat-card--warning">' +
      '<div class="stat-card__label">Outstanding</div>' +
      '<div class="stat-card__value" id="' +
      prefix +
      'StatOutstanding">0</div></div>' +
      '<div class="stat-card">' +
      '<div class="stat-card__label">Total Collected</div>' +
      '<div class="stat-card__value" id="' +
      prefix +
      'StatTotalCollected">GH₵ 0.00</div></div>' +
      '<div class="stat-card">' +
      '<div class="stat-card__label">Total Outstanding</div>' +
      '<div class="stat-card__value" id="' +
      prefix +
      'StatTotalOutstanding">GH₵ 0.00</div></div>' +
      "</div>"
    );
  }

  return "";
}

function _buildRecordsViewSection(
  container,
  title,
  prefix,
  gasFn,
  displayCols,
  dateFieldLabel,
  statsConfig,
) {
  // Location Identity feature: Levy Records only (Attendance is
  // unaffected -- only Daily Levy ever varies by location). Not
  // gated by School Level like Class Level is -- populated once,
  // left enabled, default "All Locations".
  var locationFilterHtml =
    prefix === "levy"
      ? '<div class="form-group records-filter-group" style="margin-bottom:0;"><label class="form-label">Location</label>' +
        '<select class="form-control" id="' +
        prefix +
        'RecLocation" style="width:160px;">' +
        '<option value="">All Locations</option>' +
        "</select></div>"
      : "";

  setHtml(
    container,
    '<div class="section-header"><div><div class="section-header__title">' +
      title +
      "</div></div></div>" +
      '<div class="records-filter-row" style="display:flex;gap:var(--space-4);flex-wrap:wrap;align-items:flex-end;margin-bottom:var(--space-2);">' +
      '<div class="form-group records-filter-group" style="margin-bottom:0;"><label class="form-label">Class Level</label>' +
      '<select class="form-control" id="' +
      prefix +
      'RecClass" style="width:160px;">' +
      _classLevelSelectOptions(true) +
      "</select></div>" +
      '<div class="form-group records-filter-group" style="margin-bottom:0;"><label class="form-label">Academic Year</label>' +
      '<div class="form-control" id="' +
      prefix +
      'RecYear" data-value="" style="width:150px;background:rgba(0,0,0,0.03);' +
      'cursor:default;display:flex;align-items:center;color:var(--text-muted);font-style:italic;">—</div></div>' +
      '<div class="form-group records-filter-group" style="margin-bottom:0;"><label class="form-label">Term</label>' +
      '<div class="form-control" id="' +
      prefix +
      'RecTerm" data-value="" style="width:110px;background:rgba(0,0,0,0.03);' +
      'cursor:default;display:flex;align-items:center;color:var(--text-muted);font-style:italic;">—</div></div>' +
      // Date-picker filter, placed after Term. Omitted entirely when
      // dateFieldLabel is falsy (Admission Fee/Tuition Fee Records --
      // termly, not per-date).
      (dateFieldLabel
        ? '<div class="form-group records-filter-group" style="margin-bottom:0;"><label class="form-label">' +
          sanitizeDisplayValue(dateFieldLabel) +
          "</label>" +
          '<input type="date" class="form-control" id="' +
          prefix +
          'RecDate" style="width:160px;">' +
          "</div>"
        : "") +
      locationFilterHtml +
      "</div>" +
      // Statistics block renders directly above the "Load Records" button and the records table.
      _buildRecordsStatsBlockHtml(prefix, statsConfig) +
      '<div class="btn-row--center" style="margin-bottom:var(--space-4);">' +
      '<button class="btn btn--primary records-load-btn" data-onclick="loadRecordsView(\'' +
      prefix +
      "', '" +
      gasFn +
      "', " +
      JSON.stringify(displayCols).replace(/"/g, "&quot;") +
      ')">🔍 Load Records</button>' +
      "</div>" +
      '<div id="' +
      prefix +
      'RecTable" class="table-wrapper">' +
      '<div class="empty-state"><div class="empty-state__body">Select filters and click Load Records.</div></div>' +
      "</div>",
  );

  // Populate the fixed Academic Year label, fetching it if not already loaded this session.
  _ensureAcademicYearLoaded(function (year) {
    _applyAcademicYearLabel(prefix + "RecYear", year);
  });
  // Term is no longer an admin-editable filter — it always reflects CURRENT_TERM.
  _ensureCurrentTermLoaded(function (term) {
    _applyTermLabel(prefix + "RecTerm", term);
  });

  // Location Identity feature: populate the Location filter once,
  // left enabled the whole time (unlike Class Level, not gated by
  // School Level).
  if (prefix === "levy") {
    callServer("getLocationIdentities", {}, ADMIN_TOKEN).then(
      function (res) {
        var locEl = document.getElementById(prefix + "RecLocation");
        if (!locEl || !res || !res.success) return;
        (res.locations || []).forEach(function (loc) {
          var opt = document.createElement("option");
          opt.value = loc.location_code;
          opt.textContent = loc.location_code + " - " + (loc.location_name || "");
          locEl.appendChild(opt);
        });
      },
      function () {},
    );
  }
}

/* Applies the loaded CURRENT_TERM value to a fixed read-only label div, mirroring
   _applyAcademicYearLabel() exactly. */
function _applyTermLabel(elId, term) {
  var termEl = document.getElementById(elId);
  if (!termEl) return;
  termEl.textContent = term || "Not configured";
  termEl.setAttribute("data-value", term || "");
  termEl.style.fontStyle = term ? "normal" : "italic";
  termEl.style.color = term ? "var(--text-primary)" : "var(--text-muted)";
}

// Determines whether a given displayCols column key should be center-aligned in the Records
// tables (Attendance / Daily Levy).
function _isCenterAlignedRecordColumn(colKey) {
  return colKey !== "record_id" && colKey !== "student_name";
}

// Attendance Records — statistics fetch/render.
function _loadAttendanceRecordStats(classLevel, academicYear, term, date) {
  var statsEl = document.getElementById("attRecStats");
  if (!statsEl) return;
  if (!classLevel) {
    // Stats are only meaningful for a single selected Class Level — same constraint the Teacher Portal's
    // summary panel has (it only ever shows one class at a time).
    statsEl.style.display = "none";
    return;
  }
  callServer(
    "getAttendanceSummary",
    { classLevel: classLevel, academicYear: academicYear, term: term, attendanceDate: date },
    ADMIN_TOKEN,
  ).then(
    function (r) {
      if (_checkAuthCode(r)) {
        statsEl.style.display = "none";
        return;
      }
      if (!r || !r.success) {
        statsEl.style.display = "none";
        return;
      }
      var s = r.summary || {};
      _setText("attStatBoysPresent", s.boysPresent || 0);
      _setText("attStatGirlsPresent", s.girlsPresent || 0);
      _setText("attStatBoysAbsent", s.boysAbsent || 0);
      _setText("attStatGirlsAbsent", s.girlsAbsent || 0);
      // getAttendanceSummary() already computes these — fall back to boys+girls only if an older
      // cached response (pre-existing field) somehow lacks them.
      _setText(
        "attStatTotalPresent",
        s.grandTotalPresent !== undefined
          ? s.grandTotalPresent
          : (s.boysPresent || 0) + (s.girlsPresent || 0),
      );
      _setText(
        "attStatTotalAbsent",
        s.grandTotalAbsent !== undefined
          ? s.grandTotalAbsent
          : (s.boysAbsent || 0) + (s.girlsAbsent || 0),
      );
      statsEl.style.display = "grid";
    },
    function () {
      statsEl.style.display = "none";
    },
  );
}

// Daily Levy Records — statistics fetch/render.
function _loadLevyRecordStats(classLevel, academicYear, term, date) {
  var statsEl = document.getElementById("levyRecStats");
  if (!statsEl) return;
  if (!classLevel) {
    // Same constraint as the Attendance stats block — only meaningful for a single selected Class Level.
    statsEl.style.display = "none";
    return;
  }
  callServer(
    "getDailyLevySummary",
    {
      classLevel: classLevel,
      academicYear: academicYear,
      term: term,
      levyDate: date,
      locationCode: (function () {
        var locFilterEl = document.getElementById("levyRecLocation");
        return locFilterEl ? locFilterEl.value : "";
      })(),
    },
    ADMIN_TOKEN,
  ).then(
    function (r) {
      if (_checkAuthCode(r)) {
        statsEl.style.display = "none";
        return;
      }
      if (!r || !r.success) {
        statsEl.style.display = "none";
        return;
      }
      _setText("levyStatPaid", r.paidCount || 0);
      _setText("levyStatAbsent", r.absentCount || 0);
      _setText("levyStatNotPaid", r.notPaidCount || 0);
      _setText("levyStatTotalCollected", "GH₵ " + (r.totalCollected || 0).toFixed(2));
      statsEl.style.display = "grid";
    },
    function () {
      statsEl.style.display = "none";
    },
  );
}

// Admission Fee / Tuition Fee Records — statistics fetch/render. Shared
// by both, dispatched by feeType, mirroring _loadLevyRecordStats()'s
// shape minus the date/location parameters (termly, not per-date; never
// location-varying).
function _loadTermlyFeeRecordStats(prefix, feeType, classLevel, academicYear, term) {
  var statsEl = document.getElementById(prefix + "RecStats");
  if (!statsEl) return;
  if (!classLevel) {
    // Same constraint as the Attendance/Levy stats blocks — only
    // meaningful for a single selected Class Level.
    statsEl.style.display = "none";
    return;
  }
  var summaryFn = feeType === "Admission_Fee" ? "getAdmissionFeeSummary" : "getTuitionFeeSummary";
  callServer(
    summaryFn,
    { classLevel: classLevel, academicYear: academicYear, term: term },
    ADMIN_TOKEN,
  ).then(
    function (r) {
      if (_checkAuthCode(r)) {
        statsEl.style.display = "none";
        return;
      }
      if (!r || !r.success) {
        statsEl.style.display = "none";
        return;
      }
      _setText(prefix + "StatFullyPaid", r.fullyPaidCount || 0);
      _setText(prefix + "StatOutstanding", r.notFullyPaidCount || 0);
      _setText(prefix + "StatTotalCollected", "GH₵ " + (r.totalCollected || 0).toFixed(2));
      _setText(prefix + "StatTotalOutstanding", "GH₵ " + (r.totalOutstanding || 0).toFixed(2));
      statsEl.style.display = "grid";
    },
    function () {
      statsEl.style.display = "none";
    },
  );
}

function loadRecordsView(prefix, gasFn, displayCols) {
  var clEl = document.getElementById(prefix + "RecClass");
  var yrEl = document.getElementById(prefix + "RecYear");
  var cl = clEl ? clEl.value : "";
  var yr = yrEl ? yrEl.getAttribute("data-value") || "" : "";
  var tmEl = document.getElementById(prefix + "RecTerm");
  var tm = tmEl ? tmEl.getAttribute("data-value") || "" : "";
  // Date-picker filter value (YYYY-MM-DD from <input type="date">, or "" if left
  // blank / not yet enabled). dateEl is null for a section built with no
  // dateFieldLabel (Admission Fee/Tuition Fee Records -- termly, not
  // per-date), in which case there's nothing to require or send.
  var dateEl = document.getElementById(prefix + "RecDate");
  var dt = dateEl ? dateEl.value : "";
  // Require a date before loading records -- only when this section
  // actually has a date filter.
  if (dateEl && !dt) {
    showToast("Select a date before loading records.", "warning");
    return;
  }
  // Refresh whichever statistics block applies alongside the records table.
  if (prefix === "att") {
    _loadAttendanceRecordStats(cl, yr, tm, dt);
  } else if (prefix === "levy") {
    _loadLevyRecordStats(cl, yr, tm, dt);
  } else if (prefix === "admfee") {
    _loadTermlyFeeRecordStats(prefix, "Admission_Fee", cl, yr, tm);
  } else if (prefix === "tuifee") {
    _loadTermlyFeeRecordStats(prefix, "Tuition_Fee", cl, yr, tm);
  } else {
    var _statsElHide = document.getElementById(prefix + "RecStats");
    if (_statsElHide) _statsElHide.style.display = "none";
  }
  var el = document.getElementById(prefix + "RecTable");
  if (el)
    setHtml(
      el,
      '<div class="loading-state"><div class="spinner spinner--sm"></div> Loading…</div>',
    );
  // Date is only included for sections that have a date filter (see dateEl
  // above). Location filter only exists on the Levy records section.
  var callArgs = [cl, yr, tm];
  if (dateEl) callArgs.push(dt);
  callArgs.push(ADMIN_TOKEN);
  if (prefix === "levy") {
    var locFilterEl = document.getElementById(prefix + "RecLocation");
    callArgs.push(locFilterEl ? locFilterEl.value : "");
  }
  showSpinner();
  callServer(gasFn, _recordCallPayload(gasFn, callArgs), ADMIN_TOKEN).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        showToast("Could not load records.", "error");
        return;
      }
      var records = r.records || [];
      if (!el) return;
      if (records.length === 0) {
        setHtml(
          el,
          '<div class="empty-state"><div class="empty-state__title">No records found</div>' +
            '<div class="empty-state__body">Try adjusting the filters.</div></div>',
        );
        return;
      }
      var headers = displayCols
        .map(function (c) {
          // label the Amount Paid header with its currency unit.
          var headerText = c === "amount_paid" ? "Amount Paid (GH₵)" : c.replace(/_/g, " ");
          return (
            '<th style="' +
            (_isCenterAlignedRecordColumn(c) ? "text-align:center;" : "") +
            '">' +
            sanitizeDisplayValue(headerText) +
            "</th>"
          );
        })
        .join("");
      var rows = records
        .slice(0, 500)
        .map(function (rec) {
          return (
            "<tr>" +
            displayCols
              .map(function (c) {
                var v = rec[c];
                // shared alignment rule — see _isCenterAlignedRecordColumn() above.
                var centerStyle = _isCenterAlignedRecordColumn(c) ? "text-align:center;" : "";
                if (c === "sync_pending") {
                  return (
                    '<td style="' +
                    centerStyle +
                    '"><span class="badge ' +
                    (v == 1 ? "badge--unsynced" : "badge--synced") +
                    '">' +
                    (v == 1 ? "Pending" : "Synced") +
                    "</span></td>"
                  );
                }
                // format amount_paid with the GH₵ currency prefix and 2 decimal places for the on-screen Daily
                // Levy Records table only.
                if (c === "amount_paid") {
                  var amtNum = parseFloat(v);
                  var amtDisplay = !isNaN(amtNum) ? "GH₵ " + amtNum.toFixed(2) : "—";
                  return (
                    '<td style="font-size:var(--font-size-xs);' +
                    centerStyle +
                    '">' +
                    sanitizeDisplayValue(amtDisplay) +
                    "</td>"
                  );
                }
                return (
                  '<td style="font-size:var(--font-size-xs);' +
                  centerStyle +
                  '">' +
                  sanitizeDisplayValue(v !== undefined && v !== null ? String(v) : "—") +
                  "</td>"
                );
              })
              .join("") +
            "</tr>"
          );
        })
        .join("");
      setHtml(
        el,
        '<table class="table table--striped"><thead><tr>' +
          headers +
          "</tr></thead>" +
          "<tbody>" +
          rows +
          "</tbody></table>" +
          (records.length > 500
            ? '<p style="padding:8px 16px;font-size:var(--font-size-xs);color:var(--text-muted);">Showing first 500 of ' +
              records.length +
              "</p>"
            : ""),
      );
    },
    function (e) {
      hideSpinner();
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

// Parameter names of the record functions loadRecordsView() builds positional arguments for
// ("token" marks the session token's place); tests check them against Code.gs.
var RECORD_FN_PARAMS = {
  getAttendanceRecordsForAdmin: ["classLevel", "academicYear", "term", "dateFilter", "token"],
  getDailyLevyRecordsForAdmin: [
    "classLevel",
    "academicYear",
    "term",
    "dateFilter",
    "token",
    "locationCode",
  ],
  getAdmissionFeeRecordsForAdmin: ["classLevel", "academicYear", "term", "token"],
  getTuitionFeeRecordsForAdmin: ["classLevel", "academicYear", "term", "token"],
};

// Turns loadRecordsView()'s positional arguments into the web API's named fields.
function _recordCallPayload(fn, args) {
  var payload = {};
  (RECORD_FN_PARAMS[fn] || []).forEach(function (name, i) {
    if (name !== "token") payload[name] = args[i];
  });
  return payload;
}

// ───────────────────────────────────────────────────────────────────────────── SECTION: PURGE LOG
// ─────────────────────────────────────────────────────────────────────────────

function buildPurgeLogSection(container) {
  setHtml(
    container,
    '<div class="section-header"><div>' +
      '<div class="section-header__title">Purge Log</div>' +
      '<div class="section-header__subtitle">Nightly purge removes already-synced records. Unsynced records are never deleted.</div>' +
      "</div></div>" +
      '<div id="purgeLogTable"><div class="loading-state"><div class="spinner spinner--sm"></div> Loading…</div></div>',
  );

  showSpinner();
  callServer("getPurgeLog", {}, ADMIN_TOKEN).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        showToast("Could not load purge log.", "error");
        return;
      }
      var rows = r.rows || [];
      var el = document.getElementById("purgeLogTable");
      if (!el) return;
      if (rows.length === 0) {
        setHtml(
          el,
          '<div class="empty-state"><div class="empty-state__title">No purge runs recorded yet.</div></div>',
        );
        return;
      }
      setHtml(
        el,
        '<div class="table-wrapper">' +
          '<table class="purge-log-table">' +
          "<thead><tr>" +
          "<th>Timestamp</th>" +
          "<th>Attendance Deleted</th>" +
          "<th>" +
          sanitizeDisplayValue(getLevyLabel("Daily Levy")) +
          " Deleted</th>" +
          "<th>Attendance Pending</th>" +
          "<th>" +
          sanitizeDisplayValue(getLevyLabel("Daily Levy")) +
          " Pending</th>" +
          "</tr></thead>" +
          "<tbody>" +
          rows
            .map(function (r) {
              return (
                "<tr>" +
                "<td>" +
                sanitizeDisplayValue(r.Timestamp || "—") +
                "</td>" +
                '<td class="col-deleted">' +
                sanitizeDisplayValue(r.Attendance_Rows_Deleted || 0) +
                "</td>" +
                '<td class="col-deleted">' +
                sanitizeDisplayValue(r.Levy_Rows_Deleted || 0) +
                "</td>" +
                '<td class="col-pending">' +
                sanitizeDisplayValue(r.Attendance_Pending_Remaining || 0) +
                "</td>" +
                '<td class="col-pending">' +
                sanitizeDisplayValue(r.Levy_Pending_Remaining || 0) +
                "</td>" +
                "</tr>"
              );
            })
            .join("") +
          "</tbody>" +
          "</table>" +
          "</div>",
      );
    },
    function () {
      hideSpinner();
      showToast("Server error.", "error");
    },
  );
}

// ───────────────────────────────────────────────────────────────────────────── SECTION: AUDIT LOG
// ─────────────────────────────────────────────────────────────────────────────

function buildAuditLogSection(container) {
  var actionOptions = [
    "LOGIN",
    "LOGIN_FAILED",
    "LOGOUT",
    "UPDATE_PROFILE",
    "RESET_PIN",
    "DEACTIVATE",
    "REACTIVATE",
    "UNLOCK",
    "EXPORT",
    "ADMIN_PASSWORD_CHANGE",
    "ADMIN_CONFIG_CHANGE",
    "SYNC_PUSH",
    "SYNC_PULL",
    "ATTENDANCE_SAVE",
    "DAILY_LEVY_SAVE",
    "ASSIGN_ATTENDANCE",
    "ASSIGN_DAILY_LEVY",
    "REVOKE_ASSIGNMENT",
    "FIELD_CONFIG_CHANGE",
    "PURGE_RUN",
  ]
    .map(function (a) {
      return '<option value="' + a + '">' + a + "</option>";
    })
    .join("");

  setHtml(
    container,
    '<div class="section-header"><div><div class="section-header__title">Audit Log</div></div></div>' +
      '<div style="display:flex;gap:var(--space-4);flex-wrap:wrap;align-items:flex-end;margin-bottom:var(--space-4);">' +
      '<div class="form-group" style="margin-bottom:0;"><label class="form-label">Staff ID</label>' +
      '<input type="text" class="form-control" id="auditStaffId" placeholder="Optional" style="width:140px;"></div>' +
      '<div class="form-group" style="margin-bottom:0;"><label class="form-label">From Date</label>' +
      '<input type="date" class="form-control" id="auditFrom" style="width:160px;"></div>' +
      '<div class="form-group" style="margin-bottom:0;"><label class="form-label">To Date</label>' +
      '<input type="date" class="form-control" id="auditTo" style="width:160px;"></div>' +
      '<div class="form-group" style="margin-bottom:0;"><label class="form-label">Action</label>' +
      '<select class="form-control" id="auditAction" style="width:200px;"><option value="">All Actions</option>' +
      actionOptions +
      "</select></div>" +
      '<button class="btn btn--primary" style="align-self:flex-end;" data-onclick="loadAuditLog()">🔍 Load</button>' +
      '<button class="btn btn--outline btn--sm" style="align-self:flex-end;" data-onclick="exportAuditLog()">📥 Export CSV</button>' +
      "</div>" +
      '<div id="auditLogTable" class="table-wrapper">' +
      '<div class="empty-state"><div class="empty-state__body">Set filters and click Load.</div></div>' +
      "</div>",
  );
}

function loadAuditLog() {
  var sid = document.getElementById("auditStaffId")
    ? document.getElementById("auditStaffId").value.trim()
    : "";
  var from = document.getElementById("auditFrom") ? document.getElementById("auditFrom").value : "";
  var to = document.getElementById("auditTo") ? document.getElementById("auditTo").value : "";
  var action = document.getElementById("auditAction")
    ? document.getElementById("auditAction").value
    : "";
  var el = document.getElementById("auditLogTable");
  if (el) setHtml(el, '<div class="loading-state"><div class="spinner spinner--sm"></div></div>');
  showSpinner();
  callServer(
    "getAuditLog",
    { staffId: sid, dateFrom: from, dateTo: to, action: action },
    ADMIN_TOKEN,
  ).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        showToast("Could not load audit log.", "error");
        return;
      }
      var rows = r.rows || [];
      if (!el) return;
      if (rows.length === 0) {
        setHtml(
          el,
          '<div class="empty-state"><div class="empty-state__title">No log entries found</div></div>',
        );
        return;
      }
      setHtml(
        el,
        '<table class="table table--striped">' +
          "<thead><tr><th>Timestamp</th><th>Staff ID</th><th>Action</th><th>Field Changed</th><th>Old Value</th><th>New Value</th></tr></thead>" +
          "<tbody>" +
          rows
            .map(function (row) {
              return (
                "<tr>" +
                '<td style="font-size:var(--font-size-xs);">' +
                sanitizeDisplayValue(row.Timestamp || "—") +
                "</td>" +
                '<td style="font-family:var(--font-mono);font-size:var(--font-size-xs);">' +
                sanitizeDisplayValue(row["Staff ID"] || "—") +
                "</td>" +
                '<td><span class="badge badge--neutral" style="font-size:10px;">' +
                sanitizeDisplayValue(row.Action || "—") +
                "</span></td>" +
                '<td style="font-size:var(--font-size-xs);">' +
                sanitizeDisplayValue(row["Field Changed"] || "—") +
                "</td>" +
                '<td style="font-size:var(--font-size-xs);max-width:120px;overflow:hidden;text-overflow:ellipsis;">' +
                sanitizeDisplayValue(row["Old Value"] || "—") +
                "</td>" +
                '<td style="font-size:var(--font-size-xs);max-width:120px;overflow:hidden;text-overflow:ellipsis;">' +
                sanitizeDisplayValue(row["New Value"] || "—") +
                "</td>" +
                "</tr>"
              );
            })
            .join("") +
          "</tbody></table>",
      );
    },
    function (e) {
      hideSpinner();
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

function exportAuditLog() {
  var sid = document.getElementById("auditStaffId")
    ? document.getElementById("auditStaffId").value.trim()
    : "";
  var from = document.getElementById("auditFrom") ? document.getElementById("auditFrom").value : "";
  var to = document.getElementById("auditTo") ? document.getElementById("auditTo").value : "";
  var action = document.getElementById("auditAction")
    ? document.getElementById("auditAction").value
    : "";
  showSpinner();
  callServer(
    "exportAuditLog",
    { staffId: sid, dateFrom: from, dateTo: to, action: action },
    ADMIN_TOKEN,
  ).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        showToast("Export failed.", "error");
        return;
      }
      downloadFile(r.base64, r.filename || "AuditLog.csv", "text/csv");
    },
    function (e) {
      hideSpinner();
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

// ───────────────────────────────────────────────────────────────────────────── SECTION: SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

function buildSettingsSection(container) {
  setHtml(
    container,
    '<div class="section-header"><div><div class="section-header__title">Settings</div></div></div>' +
      "<!-- System Info -->" +
      '<div class="card" style="margin-bottom:var(--space-5);max-width:600px;">' +
      '<div class="card__header"><span class="card__title">System Info</span></div>' +
      '<div class="card__body">' +
      '<div class="form-group"><label class="form-label">System Name</label>' +
      '<input type="text" class="form-control" id="cfgSystemName" placeholder="School Management System"></div>' +
      '<div class="form-group"><label class="form-label">School Name</label>' +
      '<input type="text" class="form-control" id="cfgSchoolName" placeholder="Your school name"></div>' +
      '<button class="btn btn--accent" data-onclick="saveSystemInfo()">💾 Save</button>' +
      "</div>" +
      "</div>" +
      "<!-- Admin Profile -->" +
      '<div class="card" style="margin-bottom:var(--space-5);max-width:600px;">' +
      '<div class="card__header"><span class="card__title">Admin Profile</span></div>' +
      '<div class="card__body">' +
      '<div class="form-group"><label class="form-label">Admin Name</label>' +
      '<input type="text" class="form-control" id="cfgAdminName" placeholder="e.g. John Mensah"></div>' +
      '<div class="form-group"><label class="form-label">Admin Staff ID</label>' +
      '<input type="text" class="form-control" id="cfgAdminStaffId" placeholder="e.g. 10001"></div>' +
      '<button class="btn btn--accent" data-onclick="saveAdminProfile()">💾 Save</button>' +
      "</div>" +
      "</div>" +
      "<!-- Change Password -->" +
      '<div class="card" style="margin-bottom:var(--space-5);max-width:600px;">' +
      '<div class="card__header"><span class="card__title">Change Admin Password</span></div>' +
      '<div class="card__body">' +
      '<div id="pwdErrors" class="notice notice--error" style="display:none;margin-bottom:var(--space-3);"></div>' +
      '<div class="form-group"><label class="form-label">Current Password</label>' +
      '<div class="pwd-field"><input type="password" class="form-control" id="pwdCurrent">' +
      '<button type="button" class="pwd-toggle-btn" data-onclick="togglePasswordVisibility(\'pwdCurrent\', this)" aria-label="Show password">👁</button></div></div>' +
      '<div class="form-group"><label class="form-label">New Password (min 8 chars)</label>' +
      '<div class="pwd-field"><input type="password" class="form-control" id="pwdNew">' +
      '<button type="button" class="pwd-toggle-btn" data-onclick="togglePasswordVisibility(\'pwdNew\', this)" aria-label="Show password">👁</button></div></div>' +
      '<div class="form-group"><label class="form-label">Confirm New Password</label>' +
      '<div class="pwd-field"><input type="password" class="form-control" id="pwdConfirm">' +
      '<button type="button" class="pwd-toggle-btn" data-onclick="togglePasswordVisibility(\'pwdConfirm\', this)" aria-label="Show password">👁</button></div></div>' +
      '<button class="btn btn--accent" data-onclick="changeAdminPassword()">🔑 Change Password</button>' +
      "</div>" +
      "</div>" +
      "<!-- Recovery Key -->" +
      '<div class="card" style="margin-bottom:var(--space-5);max-width:600px;">' +
      '<div class="card__header"><span class="card__title">Recovery Key</span></div>' +
      '<div class="card__body">' +
      '<p class="text-muted" style="font-size:var(--font-size-sm);">To generate a new recovery key, use the "Lost access? Use your recovery key." link on the login page. A new key is generated automatically when you reset via recovery.</p>' +
      "</div>" +
      "</div>" +
      "<!-- Desktop sync code -->" +
      '<div class="card" style="margin-bottom:var(--space-5);max-width:600px;">' +
      '<div class="card__header"><span class="card__title">Desktop Sync Code</span></div>' +
      '<div class="card__body">' +
      '<p class="text-muted" style="font-size:var(--font-size-sm);">Use this only when the school computer was replaced, reinstalled or lost. ' +
      "It issues a new sync code: the old computer stops syncing at once, and you paste the code into " +
      "<strong>Connect to Portal</strong> in the Desktop Application on the new computer. " +
      "To simply change the code on a working computer, use <strong>Change Sync Code</strong> in the Desktop Application instead.</p>" +
      '<button class="btn btn--danger" data-onclick="confirmIssueSyncCode()">🔐 Issue New Sync Code</button>' +
      "</div>" +
      "</div>" +
      "<!-- Sync Status -->" +
      '<div class="card" style="margin-bottom:var(--space-5);max-width:800px;">' +
      '<div class="card__header"><span class="card__title">Sync Status</span></div>' +
      '<div class="card__body">' +
      '<div id="settingsSyncStatus"><div class="loading-state"><div class="spinner spinner--sm"></div></div></div>' +
      '<div class="notice notice--info" style="margin-top:var(--space-4);">' +
      "<strong>Sync direction:</strong> Reference data (students, teachers, assignments, config) flows from the Desktop Application to this web portal. " +
      "Attendance, " +
      sanitizeDisplayValue(getLevyLabel("Daily Levy")) +
      ", " +
      sanitizeDisplayValue(getLevyLabel("Admission Fee")) +
      " and " +
      sanitizeDisplayValue(getLevyLabel("Tuition Fee")) +
      " records flow from this web portal to the Desktop Application." +
      "</div>" +
      "</div>" +
      "</div>",
  );

  // Load current system info and sync status
  showSpinner();
  var callsDone = 0;
  function checkDone() {
    callsDone++;
    if (callsDone >= 2) hideSpinner();
  }

  callServer("getAdminConfigAll", {}, ADMIN_TOKEN).then(function (r) {
    checkDone();
    if (_checkAuthCode(r)) return;
    if (!r || !r.success) return;
    var cfg = r.config || {};
    if (document.getElementById("cfgSystemName"))
      document.getElementById("cfgSystemName").value = cfg.SYSTEM_NAME || "";
    if (document.getElementById("cfgSchoolName"))
      document.getElementById("cfgSchoolName").value = cfg.SCHOOL_NAME || "";
    // Admin Profile fields — Admin_Config keys, already returned by
    // getAdminConfigAll() since they aren't in its EXCLUDED list.
    if (document.getElementById("cfgAdminName"))
      document.getElementById("cfgAdminName").value = cfg.ADMIN_NAME || "";
    if (document.getElementById("cfgAdminStaffId"))
      document.getElementById("cfgAdminStaffId").value = cfg.ADMIN_STAFF_ID || "";
  }, checkDone);

  callServer("getSyncStatus", {}, ADMIN_TOKEN).then(function (r) {
    checkDone();
    if (_checkAuthCode(r)) return;
    if (!r || !r.success) return;
    ADMIN_ACADEMIC_YEAR = r.academicYear || "";
    var el = document.getElementById("settingsSyncStatus");
    if (!el) return;
    setHtml(
      el,
      '<div class="sync-card__grid">' +
        [
          { label: "Attendance pending", val: r.attendancePending || 0 },
          {
            label: getLevyLabel("Daily Levy") + " pending",
            val: r.levyPending || 0,
          },
          {
            label: "Last student sync",
            val: r.lastStudentSync ? formatTimestamp(r.lastStudentSync) : "—",
          },
          {
            label: "Last teacher sync",
            val: r.lastTeacherSync ? formatTimestamp(r.lastTeacherSync) : "—",
          },
          {
            label: "Last assignment sync",
            val: r.lastAssignmentSync ? formatTimestamp(r.lastAssignmentSync) : "—",
          },
          {
            label: "Last attendance pull",
            val: r.lastAttendancePull ? formatTimestamp(r.lastAttendancePull) : "—",
          },
          {
            label: "Last " + getLevyLabel("Daily Levy") + " pull",
            val: r.lastLevyPull ? formatTimestamp(r.lastLevyPull) : "—",
          },
        ]
          .map(function (i) {
            return (
              '<div class="sync-card__item">' +
              '<span class="sync-card__dot"></span>' +
              '<span class="sync-card__label">' +
              sanitizeDisplayValue(i.label) +
              "</span>" +
              '<span class="sync-card__value">' +
              sanitizeDisplayValue(String(i.val)) +
              "</span>" +
              "</div>"
            );
          })
          .join("") +
        "</div>",
    );
  }, checkDone);
}

function saveSystemInfo() {
  var sysName = document.getElementById("cfgSystemName")
    ? document.getElementById("cfgSystemName").value.trim()
    : "";
  var sclName = document.getElementById("cfgSchoolName")
    ? document.getElementById("cfgSchoolName").value.trim()
    : "";
  if (!sysName) {
    showToast("System name cannot be empty.", "warning");
    return;
  }
  showSpinner();
  callServer(
    "updateAdminConfigBulk",
    { configObject: { SYSTEM_NAME: sysName, SCHOOL_NAME: sclName } },
    ADMIN_TOKEN,
  ).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        showToast("Save failed.", "error");
        return;
      }
      showToast("System info saved.", "success");
    },
    function (e) {
      hideSpinner();
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

// Saves the Admin's display name & staff ID (Admin_Config), then refreshes the topbar
// label so the change is reflected immediately without a page reload.
function saveAdminProfile() {
  var name = document.getElementById("cfgAdminName")
    ? document.getElementById("cfgAdminName").value.trim()
    : "";
  var staffId = document.getElementById("cfgAdminStaffId")
    ? document.getElementById("cfgAdminStaffId").value.trim()
    : "";
  showSpinner();
  callServer(
    "updateAdminConfigBulk",
    { configObject: { ADMIN_NAME: name, ADMIN_STAFF_ID: staffId } },
    ADMIN_TOKEN,
  ).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        showToast("Save failed.", "error");
        return;
      }
      showToast("Admin profile saved.", "success");
      loadAdminIdentity();
    },
    function (e) {
      hideSpinner();
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

function togglePasswordVisibility(inputId, btn) {
  var input = document.getElementById(inputId);
  if (!input) return;
  var showing = input.type === "text";
  input.type = showing ? "password" : "text";
  btn.textContent = showing ? "👁" : "🙈";
  btn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
}

function changeAdminPassword() {
  var curr = document.getElementById("pwdCurrent")
    ? document.getElementById("pwdCurrent").value
    : "";
  var newPwd = document.getElementById("pwdNew") ? document.getElementById("pwdNew").value : "";
  var confirm = document.getElementById("pwdConfirm")
    ? document.getElementById("pwdConfirm").value
    : "";
  var errDiv = document.getElementById("pwdErrors");
  if (!curr || !newPwd || !confirm) {
    if (errDiv) {
      errDiv.textContent = "All fields are required.";
      errDiv.style.display = "block";
    }
    return;
  }
  if (newPwd.length < 8) {
    if (errDiv) {
      errDiv.textContent = "New password must be at least 8 characters.";
      errDiv.style.display = "block";
    }
    return;
  }
  if (newPwd !== confirm) {
    if (errDiv) {
      errDiv.textContent = "New passwords do not match.";
      errDiv.style.display = "block";
    }
    return;
  }
  if (errDiv) errDiv.style.display = "none";
  showSpinner();
  callServer(
    "changeAdminPassword",
    { currentPassword: curr, newPassword: newPwd, confirmNewPassword: confirm },
    ADMIN_TOKEN,
  ).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        if (errDiv) {
          errDiv.textContent = r ? r.message : "Failed.";
          errDiv.style.display = "block";
        }
        return;
      }
      showToast("Password changed successfully.", "success");
      ["pwdCurrent", "pwdNew", "pwdConfirm"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = "";
      });
    },
    function (e) {
      hideSpinner();
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

// ───────────────────────────────────────────────────────────────────────────── SECTION: HELP
// ─────────────────────────────────────────────────────────────────────────────

function buildHelpSection(container) {
  // Resolve the current Daily Levy display name once, so the guide entries below
  // reflect any "Edit Label Names" override instead of a hardcoded string.
  var _levyLabel = getLevyLabel("Daily Levy");
  var _feeLabels =
    _levyLabel + ", " + getLevyLabel("Admission Fee") + " and " + getLevyLabel("Tuition Fee");
  var guides = [
    {
      icon: "👥",
      title: "Managing teacher records",
      body: "Add, edit, or deactivate teachers from the All Teachers section. PINs are system-generated only — teachers cannot choose their own PINs. Use the Edit button to update any of a teacher's 52 profile fields.",
    },
    {
      icon: "🔑",
      title: "Resetting a teacher PIN",
      body: "Go to All Teachers → find the teacher → click the 🔑 PIN button. The system generates a new 8-character PIN automatically. Write it down and share it with the teacher through a secure private channel. The old PIN stops working immediately and all active sessions are ended.",
    },
    {
      icon: "🔗",
      title: "Sharing login links",
      body: "Go to Share Links. Use the WhatsApp or Card button per teacher. All teachers use the same portal web address — each teacher identifies themselves with their own Staff ID and PIN at login. The portal URL never changes when you update the code.",
    },
    {
      icon: "📋",
      title:
        "Assigning duties (Attendance / " +
        _levyLabel +
        " / " +
        getLevyLabel("Admission Fee") +
        " / " +
        getLevyLabel("Tuition Fee") +
        ")",
      body:
        "Go to Duty Assignments → select the teacher's Staff ID and class level → click Assign. Create separate assignments for Attendance, " +
        _feeLabels +
        " duties. To change which teacher covers a class, revoke the current assignment and create a new one.",
    },

    {
      icon: "🔁",
      title: "Deactivate / Reactivate / Unlock",
      body: "Deactivate blocks login immediately and ends all active sessions — use this when a teacher leaves or should temporarily lose access. Reactivate restores access for a Deactivated or Pending account, keeping the existing PIN. Unlock is different: it clears an automatic lockout caused by too many wrong PIN attempts (5 by default) — it does not change anything an admin did on purpose. Unlock also keeps the existing PIN.",
    },
    {
      icon: "🔄",
      title: "Reassign vs Revoke (Duty Assignments)",
      body:
        "Revoke permanently removes a teacher's Attendance, " +
        _feeLabels +
        " duty for a class, with no replacement — use it when a class no longer needs that duty covered right away. Reassign is a shortcut that revokes the current teacher's assignment AND immediately creates a new assignment for a different Staff ID you enter, in one step — use it when you're simply swapping which teacher covers a class. Neither action can be undone automatically; you would need to re-assign manually if you make a mistake.",
    },
    {
      icon: "📥",
      title: "Downloading records",
      body:
        "Go to Export Data → choose the data type (teachers, attendance, or " +
        _levyLabel +
        ") → set filters if needed → click Download. All exports are delivered as CSV files. Attendance and " +
        _levyLabel +
        " records can be filtered by class level, academic year, and term.",
    },
    {
      icon: "🎓",
      title: "Student enrollment",
      body: "Go to Student Enrollment → ➕ Add Student, or ✏️ Edit on a student's row. Each change waits for the Desktop Application, which creates the student (with its Display ID) or applies the edit on its next sync — see Recent Web Changes for the result. A student's class can only be changed in the desktop app. Changes made in the desktop app appear here after the next sync cycle (within 15 seconds when the desktop is online).",
    },
    {
      icon: "📅",
      title: "Teacher login guide",
      body: "The teacher opens the portal URL and clicks the Teacher Login tab. They enter their Staff ID and PIN. After login they see only the tabs they are permitted to use. They must mark every student before the Save button becomes active. Future dates are blocked; past school days are allowed.",
    },
    {
      icon: "📊",
      title: 'Understanding the "Week X/Y" pill',
      body: "On the teacher's Attendance tab, each student's row shows a pill like \"2/5\". X is how many days that student has already been marked (Present or Absent) so far this school week (Monday–Friday, excluding holidays). Y is the total number of school days expected this week. Once X reaches Y, that student's row locks for the rest of the week so the same student can't be marked twice for one day or marked on days that don't exist in the week. This is separate from the \"Week: N\" label at the top of the tab, which is just the term week number.",
    },
    {
      icon: "🔄",
      title: "Syncing with the desktop",
      body:
        "Reference data (students, teachers, assignments, config) flows from the Desktop Application to this portal every ~15 seconds when online. Transaction records (attendance, " +
        _feeLabels +
        ") flow from this portal to the desktop on the same cycle. Check the Purge Log section to monitor nightly cleanup. Only already-synced records are ever purged — unsynced records are never deleted.",
    },
  ];

  setHtml(
    container,
    '<div class="section-header"><div><div class="section-header__title">Help</div>' +
      '<div class="section-header__subtitle">Administrator operations guide</div></div></div>' +
      '<div class="help-grid">' +
      guides
        .map(function (g) {
          return (
            '<div class="help-card">' +
            '<div class="help-card__icon">' +
            g.icon +
            "</div>" +
            '<div class="help-card__title">' +
            sanitizeDisplayValue(g.title) +
            "</div>" +
            '<div class="help-card__body">' +
            sanitizeDisplayValue(g.body) +
            "</div>" +
            "</div>"
          );
        })
        .join("") +
      "</div>",
  );
}

// ───────────────────────────────────────────────────────────────────────────── UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function _setText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

// Fetches and renders the Admin's display name & staff ID in the topbar.
function loadAdminIdentity() {
  callServer("getAdminProfile", {}, ADMIN_TOKEN).then(
    function (r) {
      if (_checkAuthCode(r)) return;
      var el = document.getElementById("topbarAdminIdentity");
      if (!el) return;
      if (r && r.success && (r.name || r.staffId)) {
        var parts = [];
        if (r.name) parts.push(r.name);
        if (r.staffId) parts.push("(" + r.staffId + ")");
        el.textContent = parts.join(" ");
      }
    },
    function () {
      /* silent — topbar keeps its default "Administrator" label */
    },
  );
}

function confirmIssueSyncCode() {
  showModal(
    "Issue a new sync code?",
    "<p>The computer that syncs now will <strong>stop syncing</strong> until it is connected again with the new code.</p>" +
      "<p>Continue only if you are setting up a new or reinstalled computer.</p>",
    [
      { label: "Cancel", cls: "btn--ghost", action: closeModal },
      {
        label: "Issue New Code",
        cls: "btn--danger",
        action: function () {
          closeModal(issueSyncCode);
        },
      },
    ],
  );
}

// The code is shown once only; the server keeps just a hash of the secret inside it.
function issueSyncCode() {
  showSpinner();
  callServer("adminIssueSyncCode", {}, ADMIN_TOKEN).then(
    function (r) {
      hideSpinner();
      if (_checkAuthCode(r)) return;
      if (!r || !r.success) {
        showToast("Could not issue a new sync code.", "error");
        return;
      }
      var buttons = [
        {
          label: "📋 Copy Code",
          cls: "btn--accent",
          action: function () {
            copyTextToClipboard(
              r.connectionCode,
              "Sync code copied.",
              "Could not copy automatically. Select the code and copy it.",
            );
          },
        },
      ];
      // On a phone, a PDF is easier to send to the school computer than pasted text.
      if (r.pdfBase64) {
        buttons.push({
          label: "📄 Save to PDF",
          cls: "btn--outline",
          action: function () {
            downloadFile(r.pdfBase64, r.pdfFilename || "Desktop_Sync_Code.pdf", "application/pdf");
          },
        });
      }
      buttons.push({ label: "Close", cls: "btn--ghost", action: closeModal });
      showModal(
        "New sync code",
        "<p>In the Desktop Application on the new computer, open <strong>Connect to Portal</strong> and paste this code. " +
          "It is shown only once. Do not share it with anyone else.</p>" +
          '<textarea class="form-control" id="newSyncCodeBox" readonly rows="4" style="font-family:var(--font-mono);font-size:var(--font-size-xs);word-break:break-all;">' +
          sanitizeDisplayValue(r.connectionCode) +
          "</textarea>",
        buttons,
      );
    },
    function (e) {
      hideSpinner();
      showToast(friendlyErrorFrontend(e ? e.message : ""), "error");
    },
  );
}

function copyPortalLink(page) {
  var url = page ? buildPortalUrl(page) : getPortalBaseUrl();
  if (!url) {
    showToast("Portal URL is not available. Please contact your system administrator.", "error");
    return;
  }
  copyTextToClipboard(
    url,
    "Portal link copied to clipboard.",
    "Could not copy automatically. Portal link: ",
  );
}

function maybeShowBookmarkNotice() {
  var seen = sessionGet("bookmarkNoticeShown");
  if (seen) return;
  sessionSet("bookmarkNoticeShown", "1");

  var url = getPortalBaseUrl();
  var urlDisplay = url ? sanitizeDisplayValue(url) : "(Portal URL not available)";

  // word-break on URL so it never overflows on narrow mobile screens
  showModal(
    "📌 Bookmark This Page",
    '<p style="margin-bottom:var(--space-4);">Save this link so you can return to the portal quickly next time, ' +
      "instead of retyping it.</p>" +
      '<div class="url-display" style="word-break:break-all;overflow-wrap:anywhere;max-width:100%;box-sizing:border-box;">' +
      urlDisplay +
      "</div>" +
      '<p style="margin-top:var(--space-4);font-size:var(--font-size-sm);color:var(--text-secondary);">' +
      "Press <strong>Ctrl+D</strong> (Windows) or <strong>Cmd+D</strong> (Mac) now to bookmark this page, " +
      "or use the 🔗 Copy Portal Link button in the top bar any time to copy this link." +
      "</p>" +
      '<button class="btn btn--outline btn--sm" style="margin-top:var(--space-3);width:100%;" ' +
      'data-onclick="copyPortalLink()">📋 Copy Link</button>',
    [
      {
        label: "Got it",
        cls: "btn--accent",
        action: closeModal,
      },
    ],
  );
}

function doAdminLogout() {
  var token = ADMIN_TOKEN || getAdminSession().token;
  callServer("logoutUser", {}, token).then(
    function () {
      forceAdminLogout();
    },
    function () {
      forceAdminLogout();
    },
  );
}

function _checkAuthCode(r) {
  if (r && r.code === "UNAUTHORIZED") {
    forceAdminLogout();
    return true;
  }
  return false;
}

function forceAdminLogout() {
  sessionSet("recoveryKey", "");
  redirectToLogin();
}

// Reads the session, then loads the admin's identity, labels and the first section.
function startAdminDashboard_() {
  // School name and logo (the emoji stays when none is set).
  applyPublicBranding(["topbarBrandIcon"], " — Admin Dashboard", toDisplayCaseName);

  ADMIN_TOKEN = getAdminSession().token;
  if (!ADMIN_TOKEN) {
    redirectToLogin();
    return;
  }

  // Load and display the Admin's name & staff ID in the topbar; must run after the
  // ADMIN_TOKEN assignment above, since it reads that global synchronously.
  loadAdminIdentity();

  // Load the admin's custom levy labels and apply them to static sidebar text once resolved.
  loadLevyLabelOverrides(ADMIN_TOKEN, function () {
    var lbl = document.getElementById("sidebarLevyLabel");
    if (lbl) lbl.textContent = getLevyLabel("Daily Levy") + " Records";
    var admFeeLbl = document.getElementById("sidebarAdmissionFeeLabel");
    if (admFeeLbl) admFeeLbl.textContent = getLevyLabel("Admission Fee") + " Records";
    var tuiFeeLbl = document.getElementById("sidebarTuitionFeeLabel");
    if (tuiFeeLbl) tuiFeeLbl.textContent = getLevyLabel("Tuition Fee") + " Records";
    // The "Attendance/Levy Assig.." sidebar link mirrors the sidebarLevyLabel update above.
    var classAssignLbl = document.getElementById("sidebarClassAssignLabel");
    if (classAssignLbl)
      classAssignLbl.textContent = "Attendance/" + getLevyLabel("Daily Levy") + " Assig..";
    // The dashboard is usually drawn before the labels arrive.
    var levyMonitorHeading = document.getElementById("levyMonitorHeading");
    if (levyMonitorHeading) levyMonitorHeading.textContent = getLevyLabel("Daily Levy");
  });

  // Idle-warning timer — 25 min idle warns, 30 min
  // idle force-logs-out, matching Config's default SESSION_TIMEOUT_MINUTES.
  initIdleSessionMonitor({
    idleMinutes: 25,
    warnBeforeMinutes: 5,
    onKeepAlive: function () {
      callServer("getAdminProfile", {}, ADMIN_TOKEN).then(
        function (r) {
          _checkAuthCode(r);
        },
        function () {},
      );
    },
    onForceLogout: function () {
      forceAdminLogout();
    },
  });

  // Show recovery key if first login
  var rk = sessionGet("recoveryKey");
  if (rk) {
    sessionSet("recoveryKey", "");
    showModal(
      "One-Time Recovery Key",
      '<p style="margin-bottom:var(--space-4);">This is your one-time recovery key. ' +
        "Write it down and store it in a physically secure place. " +
        "It will <strong>never be shown again</strong>.</p>" +
        '<div class="pin-display">' +
        sanitizeDisplayValue(rk) +
        "</div>" +
        '<div class="pin-warning">Store this key offline. If you lose access to the admin account, ' +
        "this key is the only way to recover it.</div>",
      [
        {
          label: "I have saved this key",
          cls: "btn--accent",
          action: function () {
            closeModal();
            // Safe to show immediately — showModal() tears down #globalModal first.
            maybeShowBookmarkNotice();
          },
        },
      ],
    );
  } else {
    maybeShowBookmarkNotice();
  }

  showSection("allTeachers");
}

// Functions the page's data-on* template actions may call (portal.js §28).
registerPageActions({
  _clearTeacherNameSearch: _clearTeacherNameSearch,
  _filterTeacherNameSuggestions: _filterTeacherNameSuggestions,
  _hideTeacherNameSuggestionsDelayed: _hideTeacherNameSuggestionsDelayed,
  _onMockExportClassLevelChange: _onMockExportClassLevelChange,
  _onSbaClassLevelChange: _onSbaClassLevelChange,
  _onSbaSchoolLevelChange: _onSbaSchoolLevelChange,
  _selectTeacherNameSuggestion: _selectTeacherNameSuggestion,
  changeAdminPassword: changeAdminPassword,
  clearSearchBox: clearSearchBox,
  closeSidebar: closeSidebar,
  confirmBulkPINs: confirmBulkPINs,
  confirmIssueSyncCode: confirmIssueSyncCode,
  copyPortalLink: copyPortalLink,
  deactivateTeacher: deactivateTeacher,
  debounceTeacherSearch: debounceTeacherSearch,
  doAdminLogout: doAdminLogout,
  doAssign: doAssign,
  doCorrectStaffId: doCorrectStaffId,
  doDeleteStudent: doDeleteStudent,
  doDeleteTeacher: doDeleteTeacher,
  doExportAttendance: doExportAttendance,
  doExportLevy: doExportLevy,
  doExportMockExams: doExportMockExams,
  doExportStudentEnrollment: doExportStudentEnrollment,
  doExportTeachers: doExportTeachers,
  doReassign: doReassign,
  doReassignMockFeeCollection: doReassignMockFeeCollection,
  doReassignSba: doReassignSba,
  doResetPIN: doResetPIN,
  doRevokeAssignment: doRevokeAssignment,
  doRevokeMockFeeCollection: doRevokeMockFeeCollection,
  doRevokeSbaAssignment: doRevokeSbaAssignment,
  doSbaAssign: doSbaAssign,
  exportAuditLog: exportAuditLog,
  filterAndRenderTeachers: filterAndRenderTeachers,
  filterStudents: filterStudents,
  goTeacherPage: goTeacherPage,
  loadAllTeachersData: loadAllTeachersData,
  loadAuditLog: loadAuditLog,
  loadBehaviorStatusView: loadBehaviorStatusView,
  loadMockRecordsView: loadMockRecordsView,
  loadRecordsView: loadRecordsView,
  loadSbaRecordsView: loadSbaRecordsView,
  openEditTeacherModal: openEditTeacherModal,
  openStudentForm: openStudentForm,
  printTeacherCard: printTeacherCard,
  reactivateTeacher: reactivateTeacher,
  rebuildAssignClassLevel: rebuildAssignClassLevel,
  rebuildMockSubjectDropdown: rebuildMockSubjectDropdown,
  rebuildSbaAssignClassLevel: rebuildSbaAssignClassLevel,
  rebuildSbaAssignSubject: rebuildSbaAssignSubject,
  refreshStudentEnrollment: refreshStudentEnrollment,
  saveAdminProfile: saveAdminProfile,
  saveSystemInfo: saveSystemInfo,
  setActiveMockNumber: setActiveMockNumber,
  showSection: showSection,
  submitAddTeacher: submitAddTeacher,
  switchExportTab: switchExportTab,
  switchSbaTab: switchSbaTab,
  togglePasswordVisibility: togglePasswordVisibility,
  toggleSearchClear: toggleSearchClear,
  toggleSidebar: toggleSidebar,
  unlockTeacher: unlockTeacher,
});

startAdminDashboard_();
