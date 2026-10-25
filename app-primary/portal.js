// Helpers for the signed-in screens, ported from gas/JavaScript.html (same section names, so a
// change there is easy to find and mirror here). Spinner, toast, modal, session and display
// helpers live in common.js. Differences: server calls go through callServer(), HTML templates
// go through setHtml() with every value escaped, and events are wired with addEventListener.

// SECTION 4: FILE DOWNLOAD

// Decodes a base64 payload and triggers a browser download of it as a file.
function downloadFile(base64Content, filename, mimeType) {
  try {
    var byteChars = atob(base64Content);
    var byteArrays = [];
    for (var offset = 0; offset < byteChars.length; offset += 512) {
      var slice = byteChars.slice(offset, offset + 512);
      var byteNums = new Array(slice.length);
      for (var i = 0; i < slice.length; i++) {
        byteNums[i] = slice.charCodeAt(i);
      }
      byteArrays.push(new Uint8Array(byteNums));
    }
    var blob = new Blob(byteArrays, {
      type: mimeType || "application/octet-stream",
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename || "download";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    showToast("Download failed: " + err.message, "error");
  }
}

// SECTION 7: VALIDATION HELPERS

// Validates that a string is a well-formed email address.
function validateEmail(email) {
  if (!email) return false;
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(String(email).trim());
}

// Validates a Ghana phone number format.
function validateGhanaPhoneFrontend(value) {
  if (!value) return false;
  var cleaned = String(value).replace(/[\s\-\+]/g, "");
  return /^0[2-9]\d{8}$/.test(cleaned);
}

// Validates that a Staff ID is digits-only, matching the server-side rule.
function validateStaffIdFormat(value) {
  if (!value) return false;
  return /^\d+$/.test(String(value).trim());
}

// Validates the overall format of a Ghana Card number.
function validateGhanaCard(value) {
  if (!value) return false;
  return /^GHA-\d{9}-\d$/.test(String(value).trim());
}

// Returns a specific error naming which Ghana Card segment is invalid, or null if valid.
function _getGhanaCardErrorDetail(value) {
  var v = String(value || "").trim();
  if (!v) return null; // required-check (if any) handled separately
  var parts = v.split("-");
  if (parts.length !== 3 || parts[0] !== "GHA") {
    return "Format must be GHA-XXXXXXXXX-X (e.g. GHA-712014214-2).";
  }
  var seg1 = parts[1];
  var seg2 = parts[2];
  if (!/^\d+$/.test(seg1)) {
    return "The middle segment must contain digits only (e.g. GHA-712014214-2).";
  }
  if (seg1.length !== 9) {
    return seg1.length < 9
      ? "The middle segment needs " +
          (9 - seg1.length) +
          " more digit(s) — must be exactly 9 digits."
      : "The middle segment has " +
          (seg1.length - 9) +
          " too many digit(s) — must be exactly 9 digits.";
  }
  if (!/^\d+$/.test(seg2)) {
    return "The last segment must be a single digit.";
  }
  if (seg2.length !== 1) {
    return seg2.length < 1
      ? "The last segment is missing — must be exactly 1 digit."
      : "The last segment has " +
          (seg2.length - 1) +
          " too many digit(s) — must be exactly 1 digit.";
  }
  return null;
}

// Validates an SSNIT number format.
function validateSsnitNo(value) {
  if (!value) return false;
  return /^[A-Z]\d{12}$/.test(String(value).trim());
}

// Validates an NTC number format.
function validateNtcNo(value) {
  if (!value) return false;
  return /^PT\/\d{6}\/\d{4}$/.test(String(value).trim());
}

// SECTION 9: DATE & TIME FORMATTING

// Formats a timestamp for display.
function formatTimestamp(value) {
  if (!value) return "—";
  try {
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return (
      d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }) +
      " " +
      d.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  } catch (e) {
    return String(value);
  }
}

// Formats a YYYY-MM-DD date string as dd/mm/yyyy for display.
function formatDateForDisplay(dateString) {
  if (!dateString) return "";
  var parts = String(dateString).split("-");
  if (parts.length !== 3) return dateString;
  return parts[2] + "/" + parts[1] + "/" + parts[0];
}

// Formats a date value for use in a date <input>.
function formatDateForInput(dateString) {
  if (!dateString) return "";
  var parts = String(dateString).split("/");
  if (parts.length !== 3) return dateString;
  return parts[2] + "-" + parts[1] + "-" + parts[0];
}

// Returns a status label/class describing how recently a record was updated.
function getUpdateStatus(lastUpdatedString) {
  if (!lastUpdatedString) return "Never updated";
  try {
    var d = new Date(lastUpdatedString);
    var diff = Date.now() - d.getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return mins + " min ago";
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + " hr ago";
    var days = Math.floor(hrs / 24);
    return days + " day" + (days > 1 ? "s" : "") + " ago";
  } catch (e) {
    return String(lastUpdatedString);
  }
}

// Lower-case form for comparing person names: hyphens count as spaces and apostrophes
// are ignored, so "kojo osei" finds "KOJO-OSEI" (mirrors utils/name_utils.py).
function nameSearchKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// SECTION 11: FRIENDLY ERROR (FRONTEND)

// Translates a raw technical/network error into a friendly message for the teacher.
function friendlyErrorFrontend(msg) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "You appear to be offline. Please check your internet connection and try again.";
  }

  if (!msg) return "An unexpected error occurred. Please try again.";
  var m = String(msg).toLowerCase();

  if (
    m.indexOf("failed to fetch") !== -1 ||
    m.indexOf("networkerror") !== -1 ||
    m.indexOf("net::err") !== -1 ||
    m.indexOf("internet") !== -1 ||
    m.indexOf("offline") !== -1
  ) {
    return "Network error. Please check your internet connection and try again.";
  }

  if (m.indexOf("timed out") !== -1 || m.indexOf("lock") !== -1) {
    return "Another user is saving at the same time. Please wait a moment and try again.";
  }
  if (m.indexOf("quota") !== -1) {
    return "The system is busy. Please try again in a minute.";
  }
  if (m.indexOf("not found") !== -1) {
    return "The requested record was not found.";
  }
  if (m.indexOf("duplicate") !== -1 || m.indexOf("unique") !== -1) {
    return "A record for this student on this date already exists.";
  }
  if (m.indexOf("network") !== -1 || m.indexOf("fetch") !== -1) {
    return "Network error. Please check your connection and try again.";
  }
  return "An unexpected error occurred. Please try again or contact the administrator.";
}

// SECTION 12: DATE CALCULATIONS

// Calculates age in years from a date of birth.
function calculateAgeFrontend(dobString) {
  if (!dobString) return null;
  var d;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dobString)) {
    var p = dobString.split("/");
    d = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(dobString)) {
    var q = dobString.split("-");
    d = new Date(parseInt(q[0]), parseInt(q[1]) - 1, parseInt(q[2]));
  } else {
    return null;
  }
  if (isNaN(d.getTime())) return null;
  var today = new Date();
  var age = today.getFullYear() - d.getFullYear();
  var m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  if (age < 0 || age > 110) return null;
  return age;
}

// Returns true if the given date falls on a weekend.
function isWeekend(dateString) {
  if (!dateString) return false;
  var d = new Date(dateString + "T00:00:00");
  var day = d.getDay();
  return day === 0 || day === 6;
}

// Returns true if the given date is after today.
function isFutureDate(dateString) {
  if (!dateString) return false;
  var today = new Date();
  var todayStr =
    today.getFullYear() +
    "-" +
    String(today.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(today.getDate()).padStart(2, "0");
  return String(dateString) > todayStr;
}

// Returns today's date as an ISO YYYY-MM-DD string.
function _todayISO() {
  var d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

// Calculates the academic term week number for a given date.
// holidayDates (3rd param) is unused here but kept for call-site
// compatibility, mirroring Code.gs's signature so both stay in sync.
function calculateWeekNumber(dateString, termStartDateString, holidayDates, vacationDateString) {
  if (!dateString || !termStartDateString) return null;
  try {
    var dp = dateString.split("-");
    var sp = termStartDateString.split("-");
    var d = new Date(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2]));
    var start = new Date(parseInt(sp[0]), parseInt(sp[1]) - 1, parseInt(sp[2]));
    if (d < start) return null;
    var startDow = start.getDay();
    var daysFromMon = startDow === 0 ? 6 : startDow - 1;
    var week1Monday = new Date(start.getTime() - daysFromMon * 86400000);

    // Clamp at VACATION_DATE so the week number freezes once
    // school has ended, instead of growing indefinitely.
    var effectiveDate = d;
    if (vacationDateString) {
      var vp = String(vacationDateString).split("-");
      if (vp.length === 3) {
        var vacation = new Date(parseInt(vp[0]), parseInt(vp[1]) - 1, parseInt(vp[2]));
        if (!isNaN(vacation.getTime()) && vacation >= start && d > vacation) {
          effectiveDate = vacation;
        }
      }
    }

    var diffDays = Math.floor((effectiveDate.getTime() - week1Monday.getTime()) / 86400000);
    return Math.max(1, Math.floor(diffDays / 7) + 1);
  } catch (e) {
    return null;
  }
}

// Returns the number of school days expected in the week containing a given date.
function getExpectedSchoolDaysInWeek(weekNumber, termStartDateString, holidayDates) {
  if (!termStartDateString || !weekNumber) return 5;
  try {
    var sp = termStartDateString.split("-");
    var start = new Date(parseInt(sp[0]), parseInt(sp[1]) - 1, parseInt(sp[2]));
    var startDow = start.getDay();
    var daysFromM = startDow === 0 ? 6 : startDow - 1;
    var week1Mon = new Date(start.getTime() - daysFromM * 86400000);
    var weekMon = new Date(week1Mon.getTime() + (weekNumber - 1) * 7 * 86400000);
    var weekFri = new Date(weekMon.getTime() + 4 * 86400000);
    var holidays = {};
    (holidayDates || []).forEach(function (h) {
      holidays[h] = true;
    });
    var count = 0;
    for (
      var curr = new Date(weekMon);
      curr <= weekFri;
      curr = new Date(curr.getTime() + 86400000)
    ) {
      var dow = curr.getDay();
      if (dow >= 1 && dow <= 5) {
        var iso =
          curr.getFullYear() +
          "-" +
          String(curr.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(curr.getDate()).padStart(2, "0");
        if (!holidays[iso]) count++;
      }
    }
    return Math.max(1, count);
  } catch (e) {
    return 5;
  }
}

// SECTION 13: AUTO-COMPUTED FIELDS

// Derives Salary Grade from grade_and_level only (grade_type is never used).
function autoComputeSalaryGrade(gradeAndLevelValue) {
  if (!gradeAndLevelValue) return "";
  var match = String(gradeAndLevelValue).match(/Grade\s+(\d+)/i);
  if (match) return "SS_Grade_" + match[1];
  return "";
}

// Auto-computes years-at-station from a station start date.
function autoComputeYearsAtStation(datePostedString) {
  if (!datePostedString) return 0;
  var d;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(datePostedString)) {
    var p = datePostedString.split("/");
    d = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(datePostedString)) {
    var q = datePostedString.split("-");
    d = new Date(parseInt(q[0]), parseInt(q[1]) - 1, parseInt(q[2]));
  } else {
    return 0;
  }
  if (isNaN(d.getTime())) return 0;
  var today = new Date();
  if (d > today) return 0;
  return Math.floor((today.getTime() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
}

// Converts a string to Title Case.
function toTitleCaseFrontend(value) {
  if (!value) return "";
  return String(value)
    .trim()
    .split(/\s+/)
    .map(function (word) {
      if (!word) return "";
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

// SECTION 14: CLASS LEVEL HELPERS

// Returns the canonical ordered list of class levels. Primary is the
// only school level in this build, so schoolLevel is accepted for
// call-site signature compatibility but no longer branches on it.
function getEffectiveClassLevels(schoolLevel, classType) {
  var base = [
    "Creche",
    "Nursery1",
    "Nursery2",
    "KG1",
    "KG2",
    "Basic 1",
    "Basic 2",
    "Basic 3",
    "Basic 4",
    "Basic 5",
    "Basic 6",
  ];

  if (!classType || classType === "Normal") return base;
  return base.map(function (level) {
    return level + classType;
  });
}

// Strips the A-D class-type suffix from a class level, returning its base level.
function getBaseClassLevel(classLevel) {
  var known = new Set([
    "Creche",
    "Nursery1",
    "Nursery2",
    "KG1",
    "KG2",
    "Basic 1",
    "Basic 2",
    "Basic 3",
    "Basic 4",
    "Basic 5",
    "Basic 6",
  ]);
  if (classLevel && "ABCD".indexOf(classLevel.slice(-1)) !== -1) {
    var candidate = classLevel.slice(0, -1).replace(/\s+$/, "");
    if (known.has(candidate)) return candidate;
  }
  return classLevel;
}

// SECTION 14b: SBA SUBJECTS MAP — single shared source of subjects
// per class-level band. Both dashboards must call
// getSubjectsForClassLevel() below rather than copy-pasting these
// arrays. Ghanaian Language is stored as a placeholder token,
// resolved at call-time via ghanaianLanguageName so it reflects
// whatever the Admin has customized it to — never hardcode the
// display name or match this subject by name.
var SBA_GHANAIAN_LANGUAGE_TOKEN = "__GHANAIAN_LANGUAGE__";

var SBA_SUBJECTS_MAP = {
  "Basic 4 - 6": [
    "English Language",
    "Mathematics",
    "Science",
    "Reli & Moral Edu",
    "History",
    "Creative Arts",
    "Computing",
    SBA_GHANAIAN_LANGUAGE_TOKEN,
    "Our World Our Pe.",
    "French",
  ],
  "Basic 1 - 3": [
    "Lang. & Literacy",
    "Numeracy",
    "Science",
    "Reli & Moral Edu",
    "History",
    "Creative Arts",
    SBA_GHANAIAN_LANGUAGE_TOKEN,
    "Our World Our Pe.",
  ],
  "Nursery, KG1 & KG2": [
    "Lang. & Literacy",
    "Numeracy",
    "Our World Our Pe.",
    "Creative Arts",
    "Writing",
  ],
};

// Maps a class level to its SBA_SUBJECTS_MAP band key, or null if unrecognised.
function _getSbaSubjectBandKey(classLevel) {
  var base = getBaseClassLevel(classLevel);
  var normalized = String(base || "")
    .replace(/\s+/g, "")
    .toLowerCase();

  if (normalized === "basic4" || normalized === "basic5" || normalized === "basic6") {
    return "Basic 4 - 6";
  }
  if (normalized === "basic1" || normalized === "basic2" || normalized === "basic3") {
    return "Basic 1 - 3";
  }
  if (
    normalized === "creche" ||
    normalized === "nursery1" ||
    normalized === "nursery2" ||
    normalized === "kg1" ||
    normalized === "kg2"
  ) {
    return "Nursery, KG1 & KG2";
  }
  return null;
}

// The desktop's per-year subject registry for the live academic year (getSubjectsReference()
// sends it); empty until loaded, or from a server that does not send it.
var SBA_SUBJECT_REGISTRY = [];
var SBA_BAND_REGISTRY_CATEGORY = {
  JHS: "JHS",
  "Basic 4 - 6": "4_6",
  "Basic 1 - 3": "1_3",
  "Nursery, KG1 & KG2": "Nursery",
};

// Stores the registry rows from a getSubjectsReference() reply.
function setSubjectRegistry(rows) {
  SBA_SUBJECT_REGISTRY = Array.isArray(rows) ? rows : [];
}

// The registry rows for one SBA band, in the desktop's own order.
function _subjectRegistryRowsForBand(bandKey) {
  var category = SBA_BAND_REGISTRY_CATEGORY[bandKey];
  return SBA_SUBJECT_REGISTRY.filter(function (row) {
    return String(row.class_category) === category && String(row.canonical_name || "").trim();
  }).sort(function (a, b) {
    return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
  });
}

// Returns the subject list for a class level, resolving the Ghanaian Language
// placeholder and subject IDs from the subjects reference where available.
function getSubjectsForClassLevel(classLevel, ghanaianLanguageName, subjectsReference) {
  var bandKey = _getSbaSubjectBandKey(classLevel);
  if (!bandKey || !SBA_SUBJECTS_MAP.hasOwnProperty(bandKey)) return [];

  var displayLangName =
    ghanaianLanguageName && String(ghanaianLanguageName).trim() !== ""
      ? String(ghanaianLanguageName).trim()
      : "Ghanaian Language";

  var nameToId = {};
  (subjectsReference || []).forEach(function (s) {
    var key = String(s.subject_name || "")
      .trim()
      .toLowerCase();
    if (key) nameToId[key] = s.subject_id;
  });

  // The desktop's own subject list for this class group (its Subjects & Grading screen), when
  // the server sent one: it carries renamed subjects (e.g. the local language) and removals.
  var registryRows = _subjectRegistryRowsForBand(bandKey);
  if (registryRows.length) {
    return registryRows.map(function (row) {
      var name = String(row.canonical_name).trim();
      var key = name.toLowerCase();
      return {
        subjectId: nameToId.hasOwnProperty(key) ? nameToId[key] : null,
        subjectCode: null,
        displayName: name,
      };
    });
  }

  return SBA_SUBJECTS_MAP[bandKey].map(function (subjectName) {
    if (subjectName === SBA_GHANAIAN_LANGUAGE_TOKEN) {
      var langKey = displayLangName.trim().toLowerCase();
      return {
        subjectId: nameToId.hasOwnProperty(langKey) ? nameToId[langKey] : null,
        subjectCode: "GLA01",
        displayName: displayLangName,
      };
    }
    var key = subjectName.trim().toLowerCase();
    return {
      subjectId: nameToId.hasOwnProperty(key) ? nameToId[key] : null,
      subjectCode: null,
      displayName: subjectName,
    };
  });
}

// SECTION 15: FORM COLLECTION & RESET

// Collects all field values from a rendered form into a plain object.
function collectFormValues(containerElement, fieldConfigs) {
  var values = {};
  if (!containerElement || !Array.isArray(fieldConfigs)) return values;
  fieldConfigs.forEach(function (fc) {
    var el = containerElement.querySelector('[data-field="' + fc.fieldKey + '"]');
    if (!el) return;
    if (el.tagName === "SELECT") {
      values[fc.fieldKey] = el.value;
    } else if (el.tagName === "TEXTAREA") {
      values[fc.fieldKey] = el.value.trim();
    } else {
      values[fc.fieldKey] = el.value.trim();
    }
  });
  return values;
}

// Resets a rendered form's fields back to their original values.
function resetFormValues(containerElement) {
  if (!containerElement) return;
  containerElement.querySelectorAll("input, select, textarea").forEach(function (el) {
    if (el.type === "checkbox" || el.type === "radio") {
      el.checked = false;
    } else {
      el.value = "";
    }
  });
}

// SECTION 16: FORM VALIDATION

// Validates a single form field, returning its errors/warnings without touching the DOM.
function _validateOneField(el, fc) {
  var errors = [];
  var warnings = [];
  if (!el || !fc) return { errors: errors, warnings: warnings };
  if (fc.fieldType === "education") {
    errors = _educationProblems(_parseEducationRows(el.value), _educationConfig(fc));
    return { errors: errors, warnings: warnings };
  }

  var val = el.value ? el.value.trim() : "";

  if (fc.required && !val) {
    errors.push(fc.displayLabel + " is required.");
    return { errors: errors, warnings: warnings };
  }
  if (!val) return { errors: errors, warnings: warnings };

  if (fc.fieldType === "email" && !validateEmail(val)) {
    errors.push(fc.displayLabel + ": Invalid email address.");
  }

  if (fc.fieldType === "date") {
    var iso = null;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
      var p = val.split("/");
      iso = p[2] + "-" + p[1] + "-" + p[0];
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      iso = val;
    }
    if (!iso) {
      errors.push(fc.displayLabel + ": Use dd/mm/yyyy format.");
    } else {
      var dObj = new Date(iso + "T00:00:00");
      if (isNaN(dObj.getTime())) {
        errors.push(fc.displayLabel + ": Invalid date.");
      } else if (iso < "1900-01-01") {
        errors.push(fc.displayLabel + ": Must not be before 1900.");
      } else if (isFutureDate(iso)) {
        errors.push(fc.displayLabel + ": Must not be a future date.");
      }
      if (fc.fieldKey === "birth_date" && iso >= "1900-01-01" && !isFutureDate(iso)) {
        var age = calculateAgeFrontend(val);
        if (age !== null && (age < 18 || age > 70)) {
          warnings.push(
            fc.displayLabel +
              ": Age " +
              age +
              " is outside the typical range (18–70). Please verify.",
          );
        }
      }
    }
  }

  if (fc.fieldType === "number") {
    if (!Number.isFinite(parseFloat(val))) {
      errors.push(fc.displayLabel + ": Must be a valid number.");
    }
  }

  if (fc.fieldKey === "staff_contact" || fc.fieldKey === "emergency_contact") {
    if (!validateGhanaPhoneFrontend(val)) {
      errors.push(fc.displayLabel + ": Ghana phone format required (0XXXXXXXXX).");
    }
  }

  if (fc.fieldKey === "ghana_card_no") {
    var _ghDetail = _getGhanaCardErrorDetail(val);
    if (_ghDetail) {
      errors.push(fc.displayLabel + ": " + _ghDetail);
    }
  }

  if (fc.fieldKey === "ssnit_no" && !validateSsnitNo(val)) {
    errors.push(
      fc.displayLabel +
        ": Must start with 1 UPPERCASE letter followed by 12 digits (e.g. A168512050036).",
    );
  }

  if (fc.fieldKey === "ntc_no") {
    if (!validateNtcNo(val)) {
      errors.push(fc.displayLabel + ": Format must be PT/XXXXXX/YYYY (e.g. PT/002255/2004).");
    } else {
      var _ntcYear = parseInt(val.split("/")[2], 10);
      var _ntcCurrentYear = new Date().getFullYear();
      if (_ntcYear > _ntcCurrentYear) {
        errors.push(
          fc.displayLabel + ": Year must not be in the future (max " + _ntcCurrentYear + ").",
        );
      }
    }
  }

  if (fc.fieldKey === "registered_no") {
    var _regUpper = val.toUpperCase();
    if (_regUpper !== "NONE") {
      var _regMatch = /^(\d+)\/(\d{4})$/.test(val);
      if (!_regMatch) {
        errors.push(fc.displayLabel + ": Format must be digits/YYYY (e.g. 21399/2016) or None.");
      } else {
        var _regYear = parseInt(val.split("/")[1], 10);
        var _regCurrentYear = new Date().getFullYear();
        if (_regYear < 1950 || _regYear > _regCurrentYear) {
          errors.push(fc.displayLabel + ": Year must be between 1950 and " + _regCurrentYear + ".");
        }
      }
    }
  }

  return { errors: errors, warnings: warnings };
}

// Shared inline field-error UI helpers used by blur-time and submit-time validation.
function _showFieldError(el, msg) {
  if (!el) return;
  el.classList.add("is-error");
  el.classList.add("form-control--error");
  var group = el.closest ? el.closest(".form-group") : null;
  var errEl = group
    ? group.querySelector(".form-field-error")
    : el.nextElementSibling &&
        el.nextElementSibling.classList &&
        el.nextElementSibling.classList.contains("form-field-error")
      ? el.nextElementSibling
      : null;
  if (!errEl) {
    errEl = document.createElement("div");
    errEl.className = "form-field-error";
    if (el.parentElement) {
      el.parentElement.insertBefore(errEl, el.nextSibling);
    }
  }
  errEl.textContent = msg;
  errEl.style.display = "block";
}

// Clears the inline error message/state shown for a field.
function _clearFieldError(el) {
  if (!el) return;
  el.classList.remove("is-error");
  el.classList.remove("form-control--error");
  var group = el.closest ? el.closest(".form-group") : null;
  var errEl = group
    ? group.querySelector(".form-field-error")
    : el.nextElementSibling &&
        el.nextElementSibling.classList &&
        el.nextElementSibling.classList.contains("form-field-error")
      ? el.nextElementSibling
      : null;
  if (errEl) {
    errEl.textContent = "";
    errEl.style.display = "none";
  }
}

// Runs shared field validation on blur and displays any error inline.
function _validateFieldOnBlur(el, fc) {
  if (!el || !fc || el.readOnly || el.disabled) return;
  var result = _validateOneField(el, fc);
  if (result.errors.length > 0) {
    _showFieldError(el, result.errors[0]);
  } else {
    _clearFieldError(el);
  }
}

// Auto-corrects a field's value (e.g. NTC prefix casing) before blur-time validation runs.
function _applyFieldAutoCorrect(el, fc) {
  if (!el || !fc || el.readOnly || el.disabled) return;
  if (fc.fieldKey === "ntc_no") {
    var v = el.value ? el.value.trim() : "";
    var m = v.match(/^pt(\/.*)$/i);
    if (m) {
      el.value = "PT" + m[1];
    }
  }
  if (fc.fieldKey === "ghana_card_no") {
    var v2 = el.value ? el.value.trim() : "";
    var m2 = v2.match(/^gha(-.*)$/i);
    if (m2) {
      el.value = "GHA" + m2[1];
    }
  }
  if (fc.fieldKey === "ssnit_no") {
    var v3 = el.value ? el.value.trim() : "";
    if (v3.length > 0) {
      var firstChar = v3.charAt(0);
      var upperFirst = firstChar.toUpperCase();
      if (firstChar !== upperFirst || v3 !== el.value) {
        el.value = upperFirst + v3.slice(1);
      }
    }
  }
}

// Validates every field in a form, returning a combined list of errors/warnings.
function validateFormValues(containerElement, fieldConfigs) {
  var errors = [];
  var warnings = [];
  if (!containerElement || !Array.isArray(fieldConfigs)) {
    return { valid: true, errors: errors, warnings: warnings };
  }

  fieldConfigs.forEach(function (fc) {
    if (!fc.active) return;
    var el = containerElement.querySelector('[data-field="' + fc.fieldKey + '"]');
    if (!el || el.readOnly || el.disabled) return;

    var result = _validateOneField(el, fc);

    if (result.errors.length > 0) {
      errors.push.apply(errors, result.errors);
      _showFieldError(el, result.errors[0]);
    } else {
      _clearFieldError(el);
    }

    if (result.warnings.length > 0) {
      warnings.push.apply(warnings, result.warnings);
    }
  });

  return {
    valid: errors.length === 0,
    errors: errors,
    warnings: warnings,
  };
}

// ── Education History editor (Field_Config fieldType "education") ─────────────────────────────
// The entries live in a hidden input as the same JSON text the desktop stores, so the normal
// data-field / data-original change check saves them with the rest of the form.
var EDUCATION_KEYS = [
  "education_level",
  "institution_name",
  "year_started",
  "year_completed",
  "qualification",
  "qualification_type",
];

// The editor's lists come from Field_Config (Code.gs TEACHER_EDUCATION_CONFIG_).
function _educationConfig(fc) {
  var fallback = {
    levels: ["JHS", "SHS", "Training College", "University / Polytechnic"],
    limits: { JHS: 1, SHS: 1, "Training College": 1, "University / Polytechnic": 5 },
    types: ["Professional", "Academic"],
    qualifications: [],
  };
  try {
    var cfg = JSON.parse(fc && fc.dropdownOptions ? fc.dropdownOptions : "");
    return cfg && Array.isArray(cfg.levels) ? cfg : fallback;
  } catch (e) {
    return fallback;
  }
}

function _parseEducationRows(raw) {
  var rows;
  try {
    rows = JSON.parse(String(raw || ""));
  } catch (e) {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(function (r) {
      return r && typeof r === "object";
    })
    .map(function (r) {
      var row = {};
      EDUCATION_KEYS.forEach(function (k) {
        row[k] = r[k] === null || r[k] === undefined ? "" : String(r[k]);
      });
      return row;
    });
}

// One readable line, e.g. "JHS: ASEM JHS (completed 1999); SHS: OPOKU WARE (1999-2002)".
function educationSummary(raw) {
  return _parseEducationRows(raw)
    .map(function (r) {
      var line = r.education_level + ": " + r.institution_name;
      if (r.qualification) line += ", " + r.qualification;
      if (r.year_started && r.year_completed) line += " (" + r.year_started + "-" + r.year_completed + ")";
      else if (r.year_completed) line += " (completed " + r.year_completed + ")";
      else if (r.year_started) line += " (from " + r.year_started + ")";
      return line;
    })
    .join("; ");
}

// What to correct before saving, in plain words.
function _educationProblems(rows, cfg) {
  var problems = [];
  var counts = {};
  rows.forEach(function (r, i) {
    var n = "Education History, school " + (i + 1) + ": ";
    if (!r.education_level) problems.push(n + "choose the Level.");
    if (!String(r.institution_name || "").trim()) problems.push(n + "type the name of the school.");
    if (r.year_started && r.year_completed && r.year_started > r.year_completed) {
      problems.push(n + "Year Started cannot be after Year Completed.");
    }
    if (r.education_level) counts[r.education_level] = (counts[r.education_level] || 0) + 1;
  });
  cfg.levels.forEach(function (level) {
    var limit = cfg.limits[level] || 1;
    if ((counts[level] || 0) > limit) {
      problems.push(
        "Education History: only " + limit + " " + level + (limit === 1 ? " entry is" : " entries are") + " allowed.",
      );
    }
  });
  return problems;
}

// JHS first, then SHS, Training College, University; each level by year (as the desktop sorts).
function _sortEducationRows(rows, cfg) {
  var key = function (r) {
    var rank = cfg.levels.indexOf(r.education_level);
    return [rank === -1 ? cfg.levels.length : rank, r.year_started || r.year_completed || ""];
  };
  return rows.slice().sort(function (a, b) {
    var ka = key(a),
      kb = key(b);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    return ka[1] < kb[1] ? -1 : ka[1] > kb[1] ? 1 : 0;
  });
}

// The text saved for the entries; a blank card is left out, and an emptied list saves "[]".
function _serializeEducation(rows, original, cfg) {
  var kept = rows
    .filter(function (r) {
      return EDUCATION_KEYS.some(function (k) {
        return String(r[k] || "").trim();
      });
    })
    .map(function (r) {
      var o = {};
      EDUCATION_KEYS.forEach(function (k) {
        var v = String(r[k] || "").trim();
        o[k] = k === "institution_name" ? v.toUpperCase() : v;
      });
      return o;
    });
  if (kept.length === 0) return original === "" ? "" : "[]";
  return JSON.stringify(_sortEducationRows(kept, cfg));
}

// Education History as the staff-list workbook's own columns, as the desktop shows and exports
// it (utils/staff_lists.py EDUCATION_COLUMNS; Code.gs _educationColumnValues_ for the PDF).
var EDUCATION_COLUMNS = (function () {
  var cols = [
    ["edu_jhs_name", "JHS Completed: Name"],
    ["edu_jhs_completed", "JHS: Year Completed"],
    ["edu_shs_name", "SHS Completed: Name"],
    ["edu_shs_started", "SHS: Year Started"],
    ["edu_shs_completed", "SHS: Year Completed"],
    ["edu_tc_attended", "Attended Training College?"],
    ["edu_tc_name", "Training College: Name"],
    ["edu_tc_started", "Training College: Year Started"],
    ["edu_tc_completed", "Training College: Year Completed"],
  ];
  for (var n = 1; n <= 5; n++) {
    cols.push(
      ["edu_uni" + n + "_name", "Univ " + n + ": Name"],
      ["edu_uni" + n + "_started", "Univ " + n + ": Year Started"],
      ["edu_uni" + n + "_completed", "Univ " + n + ": Year Completed"],
      ["edu_uni" + n + "_qual_level", "Univ " + n + ": Qual Level"],
      ["edu_uni" + n + "_qualification", "Univ " + n + ": Qualification"],
      ["edu_uni" + n + "_other", "If Other: Specify Univ " + n],
      ["edu_uni" + n + "_type", "Univ " + n + ": Professional or Academic?"],
    );
  }
  return cols.map(function (c) {
    return { key: c[0], label: c[1] };
  });
})();

// {column key: value} for a stored Education History; qualificationLevels maps a listed
// qualification to its level (an unlisted one is "Other (Specify)" with the text beside it).
function educationColumns(raw, qualificationLevels) {
  var levels = qualificationLevels || {};
  var values = {};
  EDUCATION_COLUMNS.forEach(function (c) {
    values[c.key] = "";
  });
  var rows = _parseEducationRows(raw).map(function (r) {
    var row = {};
    EDUCATION_KEYS.forEach(function (k) {
      row[k] = String(r[k] || "").trim();
    });
    return row;
  });
  if (rows.length === 0) return values;
  var byLevel = {};
  _sortEducationRows(rows, { levels: ["JHS", "SHS", "Training College", "University / Polytechnic"] })
    .forEach(function (r) {
      (byLevel[r.education_level] = byLevel[r.education_level] || []).push(r);
    });
  [["JHS", "jhs"], ["SHS", "shs"], ["Training College", "tc"]].forEach(function (p) {
    var first = (byLevel[p[0]] || [])[0];
    if (!first) return;
    values["edu_" + p[1] + "_name"] = first.institution_name;
    values["edu_" + p[1] + "_completed"] = first.year_completed;
    if (p[1] !== "jhs") values["edu_" + p[1] + "_started"] = first.year_started;
  });
  values.edu_tc_attended = byLevel["Training College"] ? "Yes" : "No";
  (byLevel["University / Polytechnic"] || []).slice(0, 5).forEach(function (r, i) {
    var p = "edu_uni" + (i + 1) + "_";
    var listed = Object.prototype.hasOwnProperty.call(levels, r.qualification);
    values[p + "name"] = r.institution_name;
    values[p + "started"] = r.year_started;
    values[p + "completed"] = r.year_completed;
    values[p + "qual_level"] = listed ? levels[r.qualification] : "";
    values[p + "qualification"] = listed ? r.qualification : r.qualification ? "Other (Specify)" : "";
    values[p + "other"] = listed ? "" : r.qualification;
    values[p + "type"] = r.qualification_type;
  });
  return values;
}

// Draws one card per school with an "Add a school" button; read-only users see the summary.
function _renderEducationEditor(group, fc, currentVal, readOnly) {
  var cfg = _educationConfig(fc);
  if (readOnly) {
    var ro = document.createElement("div");
    ro.className = "field-readonly";
    ro.id = "field_" + fc.fieldKey;
    ro.textContent = educationSummary(currentVal) || "—";
    group.appendChild(ro);
    return;
  }

  var hidden = document.createElement("input");
  hidden.type = "hidden";
  hidden.id = "field_" + fc.fieldKey;
  hidden.setAttribute("data-field", fc.fieldKey);
  hidden.setAttribute("data-original", currentVal);
  hidden.value = currentVal;

  var rows = _parseEducationRows(currentVal);
  var years = [];
  for (var y = new Date().getFullYear(); y >= 1960; y--) years.push(String(y));
  var listId = "eduQualifications_" + Math.random().toString(36).slice(2);
  var datalist = document.createElement("datalist");
  datalist.id = listId;
  (cfg.qualifications || []).forEach(function (q) {
    var o = document.createElement("option");
    o.value = q;
    datalist.appendChild(o);
  });

  var list = document.createElement("div");
  list.className = "edu-list";
  var empty = document.createElement("p");
  empty.className = "edu-empty";
  empty.textContent = 'No school added yet. Click "Add a school" to add one.';

  function save() {
    hidden.value = _serializeEducation(rows, currentVal, cfg);
    if (hidden.classList.contains("form-control--error")) _clearFieldError(hidden);
  }

  function chooser(options, value, blankText, onPick) {
    var sel = document.createElement("select");
    sel.className = "form-control";
    var blank = document.createElement("option");
    blank.value = "";
    blank.textContent = blankText;
    sel.appendChild(blank);
    var all = options.slice();
    if (value && all.indexOf(value) === -1) all.push(value);
    all.forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      if (opt === value) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", function () {
      onPick(sel.value);
    });
    return sel;
  }

  function cell(text, control, wide) {
    var wrap = document.createElement("div");
    if (wide) wrap.className = "edu-entry__wide";
    var lab = document.createElement("span");
    lab.className = "edu-entry__label";
    lab.textContent = text;
    wrap.appendChild(lab);
    wrap.appendChild(control);
    return wrap;
  }

  function draw() {
    list.textContent = "";
    empty.style.display = rows.length ? "none" : "";
    rows.forEach(function (r, i) {
      var card = document.createElement("div");
      card.className = "edu-entry";
      var head = document.createElement("div");
      head.className = "edu-entry__head";
      var title = document.createElement("span");
      title.textContent = "School " + (i + 1);
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn btn--outline btn--sm";
      remove.textContent = "🗑 Remove";
      remove.addEventListener("click", function () {
        rows.splice(i, 1);
        draw();
        save();
      });
      head.appendChild(title);
      head.appendChild(remove);
      card.appendChild(head);

      var grid = document.createElement("div");
      grid.className = "edu-entry__grid";
      grid.appendChild(
        cell(
          "Level",
          chooser(cfg.levels, r.education_level, "— Choose level —", function (v) {
            r.education_level = v;
            save();
          }),
        ),
      );
      var name = document.createElement("input");
      name.type = "text";
      name.className = "form-control";
      name.maxLength = 200;
      name.placeholder = "e.g. Opoku Ware School";
      name.value = r.institution_name;
      name.addEventListener("input", function () {
        r.institution_name = name.value;
        save();
      });
      grid.appendChild(cell("Name of School / Institution", name));
      grid.appendChild(
        cell(
          "Year Started",
          chooser(years, r.year_started, "— Year —", function (v) {
            r.year_started = v;
            save();
          }),
        ),
      );
      grid.appendChild(
        cell(
          "Year Completed",
          chooser(years, r.year_completed, "— Year —", function (v) {
            r.year_completed = v;
            save();
          }),
        ),
      );
      var qual = document.createElement("input");
      qual.type = "text";
      qual.className = "form-control";
      qual.maxLength = 200;
      qual.setAttribute("list", listId);
      qual.placeholder = "Choose from the list or type it";
      qual.value = r.qualification;
      qual.addEventListener("input", function () {
        r.qualification = qual.value;
        save();
      });
      grid.appendChild(cell("Qualification Obtained", qual));
      grid.appendChild(
        cell(
          "Professional or Academic",
          chooser(cfg.types, r.qualification_type, "— Choose —", function (v) {
            r.qualification_type = v;
            save();
          }),
        ),
      );
      card.appendChild(grid);
      list.appendChild(card);
    });
  }

  var add = document.createElement("button");
  add.type = "button";
  add.className = "btn btn--outline-accent btn--sm";
  add.textContent = "➕ Add a school";
  add.addEventListener("click", function () {
    var blank = {};
    EDUCATION_KEYS.forEach(function (k) {
      blank[k] = "";
    });
    rows.push(blank);
    draw();
    var level = list.lastElementChild && list.lastElementChild.querySelector("select");
    if (level) level.focus();
  });

  group.appendChild(list);
  group.appendChild(empty);
  group.appendChild(add);
  group.appendChild(datalist);
  group.appendChild(hidden);
  draw();
}

// Renders a form's fields into the DOM and wires up blur/change validation.
function renderFormFields(containerElement, fieldConfigs, teacherData, isTeacherRole) {
  if (!containerElement) return;
  if (!teacherData) teacherData = {};
  containerElement.textContent = "";

  var sorted = fieldConfigs.slice().sort(function (a, b) {
    return (a.columnOrder || 0) - (b.columnOrder || 0);
  });

  sorted.forEach(function (fc) {
    if (!fc.active) return;

    if (fc.fieldKey === "school_level") return;

    var FORCED_DROPDOWNS = {
      assigned_class: {
        fieldType: "dropdown",
        dropdownOptions: "__ASSIGNED_CLASS__",
      },
      form_teacher_class: {
        fieldType: "dropdown",
        dropdownOptions: "__FORM_TC__",
      },
    };
    if (FORCED_DROPDOWNS[fc.fieldKey]) {
      fc = Object.assign({}, fc, FORCED_DROPDOWNS[fc.fieldKey]);
    }

    var group = document.createElement("div");
    group.className = "form-group";

    var label = document.createElement("label");
    label.className = "form-label";
    label.htmlFor = "field_" + fc.fieldKey;
    label.textContent = fc.displayLabel;
    if (fc.required) {
      var req = document.createElement("span");
      req.className = "required";
      req.textContent = " *";
      label.appendChild(req);
    }
    group.appendChild(label);

    var currentVal =
      teacherData[fc.fieldKey] !== undefined && teacherData[fc.fieldKey] !== null
        ? String(teacherData[fc.fieldKey])
        : "";

    if (fc.fieldType === "education") {
      if (fc.validationNote) {
        var eduHint = document.createElement("div");
        eduHint.className = "form-hint";
        eduHint.textContent = fc.validationNote;
        group.appendChild(eduHint);
      }
      _renderEducationEditor(group, fc, currentVal, isTeacherRole && !fc.editableByTeacher);
      containerElement.appendChild(group);
      return;
    }

    if (
      fc.fieldKey === "first_name" ||
      fc.fieldKey === "surname" ||
      fc.fieldKey === "middle_name"
    ) {
      currentVal = currentVal.toUpperCase();
    }

    if (
      fc.fieldKey === "is_form_teacher" ||
      fc.fieldKey === "is_head_teacher" ||
      fc.fieldKey === "is_assistant_head"
    ) {
      if (currentVal === "1" || currentVal === "0") {
        currentVal = currentVal === "1" ? "Yes" : "No";
      }
    }

    var _ADMIN_ONLY_FIELDS = [
      "is_form_teacher",
      "form_teacher_class",
      "is_head_teacher",
      "is_assistant_head",
    ];
    var _forceReadOnly = isTeacherRole && _ADMIN_ONLY_FIELDS.indexOf(fc.fieldKey) !== -1;
    if (isTeacherRole && (!fc.editableByTeacher || _forceReadOnly)) {
      var roDiv = document.createElement("div");
      roDiv.className = "field-readonly";
      roDiv.id = "field_" + fc.fieldKey;
      roDiv.textContent = currentVal || "—";
      group.appendChild(roDiv);
    } else {
      var input = null;

      if (fc.fieldType === "dropdown") {
        input = document.createElement("select");
        input.className = "form-control";
        input.id = "field_" + fc.fieldKey;
        input.setAttribute("data-field", fc.fieldKey);
        input.setAttribute("data-original", currentVal);

        var blankOpt = document.createElement("option");
        blankOpt.value = "";
        blankOpt.textContent = "— Select —";
        input.appendChild(blankOpt);

        if (
          fc.dropdownOptions !== "__CLASS_LEVELS__" &&
          fc.dropdownOptions !== "__ASSIGNED_CLASS__" &&
          fc.dropdownOptions !== "__FORM_TC__"
        ) {
          var opts = String(fc.dropdownOptions || "")
            .split("|")
            .filter(Boolean);
          opts.forEach(function (opt) {
            var o = document.createElement("option");
            o.value = opt;
            o.textContent = opt;
            if (opt === currentVal) o.selected = true;
            input.appendChild(o);
          });
          // A saved value missing from the list stays selectable, so saving does not blank it.
          if (currentVal !== "" && opts.indexOf(currentVal) === -1) {
            var keepOpt = document.createElement("option");
            keepOpt.value = currentVal;
            keepOpt.textContent = currentVal;
            keepOpt.selected = true;
            input.appendChild(keepOpt);
          }
        }

        if (currentVal === "") {
          var _CONSTRAINED_DEFAULTS = {
            disability: "No",
            staff_category: "Professional",
            staff_status: "Teaching",
            is_form_teacher: "No",
            is_head_teacher: "No",
            is_assistant_head: "No",
          };
          if (_CONSTRAINED_DEFAULTS.hasOwnProperty(fc.fieldKey)) {
            input.value = _CONSTRAINED_DEFAULTS[fc.fieldKey];
          }
        }
      } else if (fc.fieldType === "textarea") {
        input = document.createElement("textarea");
        input.className = "form-control";
        input.id = "field_" + fc.fieldKey;
        input.setAttribute("data-field", fc.fieldKey);
        input.setAttribute("data-original", currentVal);
        input.value = currentVal;
        if (fc.maxLength) input.maxLength = fc.maxLength;
      } else {
        input = document.createElement("input");
        input.className = "form-control";
        input.id = "field_" + fc.fieldKey;
        input.setAttribute("data-field", fc.fieldKey);
        input.setAttribute("data-original", currentVal);
        input.value = currentVal;
        if (fc.fieldType === "email") input.type = "email";
        else if (fc.fieldType === "number") input.type = "text";
        else input.type = "text";
        if (fc.maxLength) input.maxLength = fc.maxLength;
        if (fc.required) input.required = true;
      }

      if (fc.fieldKey === "salary_grade") {
        if (input && input.tagName !== "SELECT") {
          input.readOnly = true;
          input.style.fontStyle = "italic";
        }
      }

      // Validate on blur with the same rules as validateFormValues() (_validateOneField).
      if (input) {
        input.addEventListener("blur", function () {
          _applyFieldAutoCorrect(input, fc);
          _validateFieldOnBlur(input, fc);
        });
        var _liveClearEvt = input.tagName === "SELECT" ? "change" : "input";
        input.addEventListener(_liveClearEvt, function () {
          if (input.classList.contains("form-control--error")) {
            _clearFieldError(input);
          }
        });
      }

      if (input) group.appendChild(input);

      if (fc.validationNote) {
        var hint = document.createElement("div");
        hint.className = "form-hint";
        hint.textContent = fc.validationNote;
        group.appendChild(hint);
      }
    }

    containerElement.appendChild(group);
  });

  // ── POST-RENDER HOOKS ────────────────────────────────────────────────────── All field elements are now in the DOM. Wire up inter-field relationships.

  var gradeTypeEl = containerElement.querySelector('[data-field="grade_type"]');
  var gradeEl = containerElement.querySelector('[data-field="grade_and_level"]');
  var salaryEl = containerElement.querySelector('[data-field="salary_grade"]');
  var postedEl = containerElement.querySelector('[data-field="date_posted_station"]');
  var yrsEl = containerElement.querySelector('[data-field="years_at_station"]');
  var schoolLvEl = containerElement.querySelector('[data-field="school_level"]');
  var assignedEl = containerElement.querySelector('[data-field="assigned_class"]');
  var formTcEl = containerElement.querySelector('[data-field="form_teacher_class"]');
  var isFormTcEl = containerElement.querySelector('[data-field="is_form_teacher"]');
  var staffLvEl = containerElement.querySelector('[data-field="staff_level"]');
  var hpqEl = containerElement.querySelector('[data-field="highest_prof_qual"]');
  var otherHpqEl = containerElement.querySelector('[data-field="other_prof_qual"]');
  var haqEl = containerElement.querySelector('[data-field="highest_acad_qual"]');
  var otherHaqEl = containerElement.querySelector('[data-field="other_acad_qual"]');

  var disabilityEl = containerElement.querySelector('[data-field="disability"]');
  var disabilityTypeEl = containerElement.querySelector('[data-field="disability_type"]');

  // ── 1. Auto-compute: salary_grade ← grade_and_level ──
  // salaryEl (found via [data-field='salary_grade']) is null on the
  // read-only My Profile path, which renders a plain <div> instead
  // of an <input>. salaryElForCompute falls back to that div by id
  // so both paths share one listener.
  var salaryElForCompute = salaryEl || containerElement.querySelector("#field_salary_grade");

  // Recomputes and displays Salary Grade whenever grade_and_level changes.
  function _applySalaryGrade() {
    if (!gradeEl || !salaryElForCompute) return;
    var computed = autoComputeSalaryGrade(gradeEl.value);
    if (salaryElForCompute.tagName === "DIV") {
      salaryElForCompute.textContent = computed || "—";
    } else {
      salaryElForCompute.value = computed;
    }
  }

  if (gradeEl && salaryElForCompute) {
    gradeEl.addEventListener("change", _applySalaryGrade);
    if (gradeEl.value) {
      _applySalaryGrade();
    }
  }

  if (postedEl && !yrsEl) {
    var postedGroup = postedEl.closest ? postedEl.closest(".form-group") : null;
    if (postedGroup) {
      var yrsGroup = document.createElement("div");
      yrsGroup.className = "form-group";

      var yrsLabel = document.createElement("label");
      yrsLabel.className = "form-label";
      yrsLabel.htmlFor = "field_years_at_station";
      yrsLabel.textContent = "No. Yrs At Present Station";
      yrsGroup.appendChild(yrsLabel);

      var yrsInput = document.createElement("input");
      yrsInput.type = "text";
      yrsInput.className = "form-control";
      yrsInput.id = "field_years_at_station";
      yrsInput.readOnly = true;
      yrsInput.style.fontStyle = "italic";
      var initYrs = postedEl.value ? String(autoComputeYearsAtStation(postedEl.value)) : "";
      yrsInput.value = initYrs;
      yrsGroup.appendChild(yrsInput);

      var yrsHint = document.createElement("div");
      yrsHint.className = "form-hint";
      yrsHint.textContent = "Auto-calculated from Date Posted to Present Station. Read-only.";
      yrsGroup.appendChild(yrsHint);

      postedGroup.parentNode.insertBefore(yrsGroup, postedGroup.nextSibling);

      yrsEl = yrsInput;
    }
  }

  // ── 3. Auto-compute: years_at_station ← date_posted_station ─────────────
  if (postedEl) {
    postedEl.addEventListener("change", function () {
      var yrs = autoComputeYearsAtStation(postedEl.value);
      var yrsTarget = yrsEl || containerElement.querySelector("#field_years_at_station");
      if (yrsTarget) yrsTarget.value = yrs;
    });
  }

  // ── 4. Uppercase on blur for name fields ──────────────────────────────────
  ["first_name", "surname", "middle_name"].forEach(function (fk) {
    var el = containerElement.querySelector('[data-field="' + fk + '"]');
    if (el && el.tagName !== "SELECT") {
      el.addEventListener("blur", function () {
        el.value = el.value.toUpperCase();
      });
    }
  });

  ["highest_university", "area_specialization", "home_town", "home_town_district"].forEach(
    function (fk) {
      var el = containerElement.querySelector('[data-field="' + fk + '"]');
      if (el && el.tagName !== "SELECT") {
        el.addEventListener("blur", function () {
          el.value = toTitleCaseFrontend(el.value);
        });
      }
    },
  );

  if (schoolLvEl && schoolLvEl.tagName === "SELECT") {
    schoolLvEl.addEventListener("change", function () {
      _rebuildSchoolLevelDependentCombos(containerElement, schoolLvEl.value);
    });
    _rebuildSchoolLevelDependentCombos(containerElement, schoolLvEl.value);
  } else {
    var storedLevel = "";
    if (schoolLvEl) {
      storedLevel = schoolLvEl.textContent.trim();
    } else if (teacherData && teacherData.school_level) {
      storedLevel = String(teacherData.school_level);
    }
    _rebuildSchoolLevelDependentCombos(containerElement, storedLevel);
  }

  // Enables/disables Form Teacher Class based on the Is Form Teacher selection.
  function _applyFormTeacherClassState() {
    if (!formTcEl) return;
    var isFormTeacher = isFormTcEl ? isFormTcEl.value : "";
    if (isFormTeacher === "Yes") {
      formTcEl.disabled = false;
      var stored = formTcEl.getAttribute("data-original") || "";
      var found = false;
      for (var i = 0; i < formTcEl.options.length; i++) {
        if (formTcEl.options[i].value === stored) {
          formTcEl.value = stored;
          found = true;
          break;
        }
      }
      if (!found) formTcEl.value = "";
    } else {
      formTcEl.disabled = true;
      formTcEl.value = ""; // clear display; data-original retains stored value
    }
  }

  if (isFormTcEl && formTcEl) {
    isFormTcEl.addEventListener("change", function () {
      _applyFormTeacherClassState();
      _validateFormTeacherClassRequired(containerElement);
    });
    isFormTcEl.addEventListener("blur", function () {
      _validateFormTeacherClassRequired(containerElement);
    });
    _applyFormTeacherClassState();

    formTcEl.addEventListener("change", function () {
      _validateFormTeacherClassRequired(containerElement);
    });
  }

  // ── 7. Mutual exclusion: is_head_teacher ↔ is_assistant_head ────────────── A teacher cannot be both Head Teacher and Assistant Head at once. Selecting "Yes" on one forces the other to "No" and disables it; selecting anything else on either re-enables the other.
  var headTeacherEl = containerElement.querySelector('[data-field="is_head_teacher"]');
  var asstHeadEl = containerElement.querySelector('[data-field="is_assistant_head"]');

  // Enforces that Head Teacher and Assistant Head Teacher can't both be Yes.
  function _applyHeadAssistantExclusion(changedEl, otherEl) {
    if (!changedEl || !otherEl) return;
    if (changedEl.value === "Yes") {
      otherEl.value = "No";
      otherEl.disabled = true;
    } else {
      otherEl.disabled = false;
    }
  }

  if (headTeacherEl && asstHeadEl) {
    headTeacherEl.addEventListener("change", function () {
      _applyHeadAssistantExclusion(headTeacherEl, asstHeadEl);
    });
    asstHeadEl.addEventListener("change", function () {
      _applyHeadAssistantExclusion(asstHeadEl, headTeacherEl);
    });
    if (headTeacherEl.value === "Yes") {
      asstHeadEl.value = "No";
      asstHeadEl.disabled = true;
    } else if (asstHeadEl.value === "Yes") {
      headTeacherEl.value = "No";
      headTeacherEl.disabled = true;
    }
  }

  // Enables/disables Grade And Level based on the selected Grade Type.
  function _applyGradeTypeGating() {
    if (!gradeEl) return;
    var gt = gradeTypeEl ? gradeTypeEl.value : "";
    if (gt === "PSH" || gt === "PSL") {
      gradeEl.disabled = false;
    } else {
      gradeEl.disabled = true;
      gradeEl.value = "";
      if (salaryElForCompute) {
        if (salaryElForCompute.tagName === "DIV") {
          salaryElForCompute.textContent = "—";
        } else {
          salaryElForCompute.value = "";
        }
      }
    }
  }

  if (gradeTypeEl && gradeEl) {
    gradeTypeEl.addEventListener("change", function () {
      _applyGradeTypeGating();
      _applySalaryGrade();
    });
    _applyGradeTypeGating();
  }

  // Enables Other Professional Qualification only when HPQ is set to 'Other'.
  function _applyHpqOtherGating() {
    if (!otherHpqEl) return;
    if (hpqEl && hpqEl.value === "Other") {
      otherHpqEl.readOnly = false;
      otherHpqEl.style.fontStyle = "normal";
      otherHpqEl.style.color = "";
    } else {
      otherHpqEl.readOnly = true;
      otherHpqEl.style.fontStyle = "italic";
      otherHpqEl.style.color = "var(--text-muted)";
    }
  }

  if (hpqEl && otherHpqEl) {
    hpqEl.addEventListener("change", _applyHpqOtherGating);
    _applyHpqOtherGating();
  }

  // Enables Other Academic Qualification only when HAQ is set to 'Other'.
  function _applyHaqOtherGating() {
    if (!otherHaqEl) return;
    if (haqEl && haqEl.value === "Other") {
      otherHaqEl.readOnly = false;
      otherHaqEl.style.fontStyle = "normal";
      otherHaqEl.style.color = "";
    } else {
      otherHaqEl.readOnly = true;
      otherHaqEl.style.fontStyle = "italic";
      otherHaqEl.style.color = "var(--text-muted)";
    }
  }

  if (haqEl && otherHaqEl) {
    haqEl.addEventListener("change", _applyHaqOtherGating);
    _applyHaqOtherGating();
  }

  // Enables Disability Type only when Disability is set to 'Yes'.
  function _applyDisabilityTypeGating() {
    if (!disabilityTypeEl) return;
    if (disabilityEl && disabilityEl.value === "Yes") {
      disabilityTypeEl.readOnly = false;
      disabilityTypeEl.style.fontStyle = "normal";
      disabilityTypeEl.style.color = "";
    } else {
      disabilityTypeEl.readOnly = true;
      disabilityTypeEl.style.fontStyle = "italic";
      disabilityTypeEl.style.color = "var(--text-muted)";
    }
  }

  if (disabilityEl && disabilityTypeEl) {
    disabilityEl.addEventListener("change", _applyDisabilityTypeGating);
    _applyDisabilityTypeGating();
  }
}

// Empties a <select>, leaving only the blank "— Select —" choice.
function _resetSelect(select) {
  select.textContent = "";
  var blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "— Select —";
  select.appendChild(blank);
}

// Rebuilds the assigned_class, form_teacher_class, and staff_level
// dropdowns. Primary is the only school level in this build, so the
// dropdown contents are fixed; `schoolLevel` is accepted only for
// call-site signature compatibility and no longer used.
function _rebuildSchoolLevelDependentCombos(
  containerElement,
  schoolLevel, // eslint-disable-line no-unused-vars
) {
  // Note: fieldKey "school_level" is always skipped by the generic
  // field renderer, so that field is always the hidden input
  // _injectHiddenSchoolLevelInput() creates, never a real <select> —
  // there is deliberately no "school_level select" branch here.

  var allStaffLvl = ["Creche", "Nursery", "KG", "Primary", "Other", "Administration"];

  // Rebuilds a <select>'s options while preserving its current selection.
  function _rebuildSelect(el, options, preserveVal) {
    if (!el || el.tagName !== "SELECT") return;
    var cur = preserveVal !== undefined ? preserveVal : el.value;
    _resetSelect(el);
    options.forEach(function (opt) {
      var o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      if (opt === cur) o.selected = true;
      el.appendChild(o);
    });
    if (cur && el.value !== cur) el.value = "";
  }

  // ── assigned_class ──────────────────────────────────────────────────
  var assignedClassOptions = [
    "Creche",
    "Nursery1",
    "Nursery2",
    "Nursery1-2",
    "KG 1",
    "KG 2",
    "KG 1-2",
    "Head (KG)",
    "P 1",
    "P 2",
    "P 3",
    "P 4",
    "P 5",
    "P 6",
    "P 1-2",
    "P 1-3",
    "P 1-6",
    "P 4-6",
    "P 4-5",
    "P 5-6",
    "P 3-4",
    "P 2-3",
    "P 3-6",
    "Head (Primary)",
  ];

  // ── form_teacher_class: base classes + A/B/C/D/E suffixes ──
  var formTcBaseClasses = [
    "Creche",
    "Nursery1",
    "Nursery2",
    "KG 1",
    "KG 2",
    "Basic 1",
    "Basic 2",
    "Basic 3",
    "Basic 4",
    "Basic 5",
    "Basic 6",
  ];
  var suffixes = ["A", "B", "C", "D", "E"];
  var formTcOptions = [];
  formTcBaseClasses.forEach(function (cl) {
    formTcOptions.push(cl);
    suffixes.forEach(function (s) {
      formTcOptions.push(cl + s);
    });
  });

  // ── Rebuild assigned_class ─────────────────────────────────────────────
  var assignedEl = containerElement.querySelector('[data-field="assigned_class"]');
  if (assignedEl && assignedEl.tagName === "SELECT") {
    var curAssigned = assignedEl.getAttribute("data-original") || assignedEl.value;
    _rebuildSelect(assignedEl, assignedClassOptions, curAssigned);
  }

  // ── Rebuild form_teacher_class ─────────────────────────────────────────
  var formTcEl = containerElement.querySelector('[data-field="form_teacher_class"]');
  if (formTcEl && formTcEl.tagName === "SELECT") {
    var curFormTc = formTcEl.getAttribute("data-original") || formTcEl.value;
    _rebuildSelect(formTcEl, formTcOptions, curFormTc);
  }

  // ── Rebuild staff_level ────────────────────────────────────────────────
  var staffLvEl = containerElement.querySelector('[data-field="staff_level"]');
  if (staffLvEl && staffLvEl.tagName === "SELECT") {
    var curLvl = staffLvEl.getAttribute("data-original") || staffLvEl.value;
    _rebuildSelect(staffLvEl, allStaffLvl, curLvl);
  }
}

// Creates the hidden school_level input used by profile forms, if not already present.
function _injectHiddenSchoolLevelInput(containerElement, initialValue) {
  if (!containerElement) return;
  var existing = containerElement.querySelector('[data-field="school_level"]');
  if (existing) {
    existing.value = initialValue || "";
    return;
  }
  var hidden = document.createElement("input");
  hidden.type = "hidden";
  hidden.setAttribute("data-field", "school_level");
  hidden.setAttribute("data-original", initialValue || "");
  hidden.value = initialValue || "";
  containerElement.appendChild(hidden);
}

// Sets the hidden school_level input, toggles field state, and
// rebuilds dependent dropdowns. Callers always pass "Primary" now —
// there is no user-facing level picker any more.
function _applySchoolLevelRadio(containerElement, schoolLevel) {
  if (!containerElement) return;

  var slInput = containerElement.querySelector('[data-field="school_level"]');
  if (slInput) {
    slInput.value = schoolLevel.toLowerCase();
  }

  var allControls = containerElement.querySelectorAll(
    "input[data-field], select[data-field], textarea[data-field]",
  );
  allControls.forEach(function (el) {
    var fk = el.getAttribute("data-field");
    if (fk === "salary_grade" || fk === "years_at_station") return;
    el.disabled = false;
  });

  _rebuildSchoolLevelDependentCombos(containerElement, schoolLevel);

  var isFormTcEl = containerElement.querySelector('[data-field="is_form_teacher"]');
  var formTcEl = containerElement.querySelector('[data-field="form_teacher_class"]');
  if (isFormTcEl && formTcEl) {
    if (isFormTcEl.value === "Yes") {
      formTcEl.disabled = false;
    } else {
      formTcEl.disabled = true;
      formTcEl.value = "";
    }
  }

  var headEl = containerElement.querySelector('[data-field="is_head_teacher"]');
  var asstEl = containerElement.querySelector('[data-field="is_assistant_head"]');
  if (headEl && asstEl) {
    if (headEl.value === "Yes") {
      asstEl.value = "No";
      asstEl.disabled = true;
    } else if (asstEl.value === "Yes") {
      headEl.value = "No";
      headEl.disabled = true;
    }
  }
}

// Validates that Form Teacher Class is set when Is Form/Class Teacher is Yes;
// shared by every place this rule is enforced.
function _validateFormTeacherClassRequired(containerElement) {
  if (!containerElement) return null;
  var isFormTcEl = containerElement.querySelector('[data-field="is_form_teacher"]');
  var formTcEl = containerElement.querySelector('[data-field="form_teacher_class"]');
  if (!isFormTcEl || !formTcEl) return null;

  if (formTcEl.disabled) {
    _clearFieldError(formTcEl);
    return null;
  }

  if (isFormTcEl.value === "Yes" && !String(formTcEl.value || "").trim()) {
    var msg = "Form Teacher Class is required when 'Is Form/Class Teacher?' is Yes.";
    _showFieldError(formTcEl, msg);
    return msg;
  }

  _clearFieldError(formTcEl);
  return null;
}

// SECTION 18: ATTENDANCE GRID RENDERING

// Renders the Attendance marking grid.
function renderAttendanceGrid(
  containerElement,
  students,
  existingAttendance,
  weeklySummary,
  expectedSchoolDays,
  defaultPresentIfBlank,
) {
  if (!containerElement) return;
  existingAttendance = existingAttendance || {};
  weeklySummary = weeklySummary || {};
  expectedSchoolDays = expectedSchoolDays || 5;

  var noSyncedDataYet = !!defaultPresentIfBlank && Object.keys(existingAttendance).length === 0;

  setHtml(
    containerElement,
    '<table class="attendance-grid" id="attGrid">' +
      "<thead><tr>" +
      '<th class="col-id">Display ID</th>' +
      "<th>Student Name</th>" +
      '<th class="col-radio">Present</th>' +
      '<th class="col-radio">Absent</th>' +
      '<th class="col-week" title="Days marked this week out of school days expected. Reaching the cap locks the row.">Week ⓘ</th>' +
      "</tr></thead>" +
      '<tbody id="attGridBody"></tbody>' +
      "</table>",
  );

  var tbody = containerElement.querySelector("#attGridBody");

  students.forEach(function (student) {
    var sid = student.student_id;
    var displayId = student.student_non_usable_id || sid;
    var fullName = [student.first_name, student.other_name, student.surname]
      .filter(Boolean)
      .join(" ");
    var existing = existingAttendance[sid] || null;
    var weekly = weeklySummary[sid] || {
      presentCount: 0,
      absentCount: 0,
    };
    var totalMarked = weekly.presentCount + weekly.absentCount;

    var afterToday = totalMarked + 1;
    var capExceeded = afterToday > expectedSchoolDays && !existing;
    var capWarn = afterToday === expectedSchoolDays && !existing;

    var rowClass = capExceeded
      ? "attendance-row--cap-exceeded"
      : capWarn
        ? "attendance-row--cap-warn"
        : "";

    var displayMarked = Math.min(totalMarked, expectedSchoolDays);

    var weekText = displayMarked + "/" + expectedSchoolDays;
    var pillClass = capExceeded ? "week-pill--full" : capWarn ? "week-pill--warn" : "";

    var checkedP = existing === "P" || (existing === null && noSyncedDataYet) ? "checked" : "";
    var checkedA = existing === "A" ? "checked" : "";

    var disabledAttr = capExceeded ? "disabled" : "";

    var tr = document.createElement("tr");
    tr.className = rowClass;
    tr.dataset.sid = sid;
    // Sheet values are escaped; the rest are numbers and this file's own class names.
    setHtml(
      tr,
      "<td>" +
        sanitizeDisplayValue(displayId) +
        "</td>" +
        "<td>" +
        sanitizeDisplayValue(fullName) +
        "</td>" +
        '<td><div class="radio-group">' +
        '<input type="radio" class="radio-present" name="att_' +
        sanitizeDisplayValue(sid) +
        '" value="P" ' +
        checkedP +
        " " +
        disabledAttr +
        ">" +
        "</div></td>" +
        '<td><div class="radio-group">' +
        '<input type="radio" class="radio-absent"  name="att_' +
        sanitizeDisplayValue(sid) +
        '" value="A" ' +
        checkedA +
        " " +
        disabledAttr +
        ">" +
        "</div></td>" +
        '<td><span class="week-pill ' +
        pillClass +
        '" title="' +
        displayMarked +
        " of " +
        expectedSchoolDays +
        ' expected school day(s) marked this week.">' +
        sanitizeDisplayValue(weekText) +
        "</span></td>",
    );

    tbody.appendChild(tr);

    tr.querySelectorAll('input[type="radio"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        updateAttendanceSummary(document.getElementById("attSummary"), containerElement, students);
        updateProgressIndicator(
          containerElement,
          students.length,
          document.getElementById("attProgress"),
          document.getElementById("btnSaveAttendance"),
        );
      });
    });
  });
}

// SECTION 19: DAILY LEVY GRID RENDERING

// Renders the Daily Levy marking grid. locationRates is OPTIONAL
// (Location Identity feature) -- {location_code: rate}; a student
// whose location_identity_code has an entry there is charged that
// rate instead of the flat levyAmount. Omitted/empty = every student
// uses levyAmount, byte-identical to the pre-feature behavior.
function renderDailyLevyGrid(
  containerElement,
  students,
  existingLevy,
  levyAmount,
  locationRates,
  existingAmounts,
) {
  if (!containerElement) return;
  existingLevy = existingLevy || {};
  levyAmount = levyAmount || 0;
  locationRates = locationRates || {};
  // {student_id: amount already recorded for this date}, shown next to
  // the status so the amount is never hidden behind a word.
  existingAmounts = existingAmounts || {};

  setHtml(
    containerElement,
    '<table class="levy-grid" id="levyGrid">' +
      "<thead><tr>" +
      '<th class="col-id">Display ID</th>' +
      "<th>Student Name</th>" +
      '<th class="col-amount">Daily Rate (GH₵)</th>' +
      "<th>Paid</th>" +
      "<th>Not Paid</th>" +
      "<th>Absent</th>" +
      "</tr></thead>" +
      '<tbody id="levyGridBody"></tbody>' +
      "</table>",
  );

  var tbody = containerElement.querySelector("#levyGridBody");

  students.forEach(function (student) {
    var sid = student.student_id;
    var displayId = student.student_non_usable_id || sid;
    var fullName = [student.first_name, student.other_name, student.surname]
      .filter(Boolean)
      .join(" ");
    var existing = existingLevy[sid] || null;

    // Location Identity feature: this student's own rate, falling
    // back to the flat class rate when untagged or no override
    // exists for their location.
    var locCode = student.location_identity_code || "";
    // A location override of 0 is real (free), so test for a valid
    // number rather than truthiness.
    var studentRate = levyAmount;
    if (locCode && Object.prototype.hasOwnProperty.call(locationRates, locCode)) {
      var locRate = parseFloat(locationRates[locCode]);
      if (!isNaN(locRate) && locRate >= 0) studentRate = locRate;
    }
    var amtStr = studentRate.toFixed(2);
    var locationBadge = locCode
      ? '<span class="badge badge--neutral" style="margin-left:6px;">' +
        sanitizeDisplayValue(locCode) +
        "</span>"
      : "";

    var recordedAmount = existingAmounts[sid];
    var recordedNote =
      recordedAmount !== undefined
        ? '<div class="levy-recorded-note" style="font-size:12px;opacity:0.8;">' +
          "Recorded: GH₵ " +
          sanitizeDisplayValue(Number(recordedAmount).toFixed(2)) +
          "</div>"
        : "";

    var chkPaid = existing === "Paid" ? "checked" : "";
    var chkNotPaid = existing === "Not Paid" ? "checked" : "";
    var chkAbsent = existing === "Absent" ? "checked" : "";
    // "Absent" only ever comes from the attendance register, and no fee
    // can be taken for that day (saveDailyLevy refuses it too).
    var paidLock =
      existing === "Absent" ? ' disabled title="Marked absent in the attendance register"' : "";

    var tr = document.createElement("tr");
    tr.dataset.sid = sid;
    // Read back by updateDailyLevySummary() instead of re-resolving
    // the location->rate lookup a second time.
    tr.dataset.rate = studentRate;
    // Sheet values are escaped; the rest are numbers and this file's own class names.
    setHtml(
      tr,
      "<td>" +
        sanitizeDisplayValue(displayId) +
        "</td>" +
        "<td>" +
        sanitizeDisplayValue(fullName) +
        locationBadge +
        recordedNote +
        "</td>" +
        '<td class="col-amount">' +
        sanitizeDisplayValue(amtStr) +
        "</td>" +
        "<td>" +
        '<label class="levy-radio-label paid">' +
        '<input type="radio" name="levy_' +
        sanitizeDisplayValue(sid) +
        '" value="Paid" ' +
        chkPaid +
        paidLock +
        ">" +
        "<span>Paid</span>" +
        "</label>" +
        "</td>" +
        "<td>" +
        '<label class="levy-radio-label notpaid">' +
        '<input type="radio" name="levy_' +
        sanitizeDisplayValue(sid) +
        '" value="Not Paid" ' +
        chkNotPaid +
        ">" +
        "<span>Not Paid</span>" +
        "</label>" +
        "</td>" +
        "<td>" +
        '<label class="levy-radio-label absent">' +
        '<input type="radio" name="levy_' +
        sanitizeDisplayValue(sid) +
        '" value="Absent" ' +
        chkAbsent +
        ">" +
        "<span>Absent</span>" +
        "</label>" +
        "</td>",
    );

    tbody.appendChild(tr);

    // ── Wire radio change listeners ────────────────────────────────────
    tr.querySelectorAll('input[type="radio"]').forEach(function (radio) {
      radio.addEventListener("change", function () {
        updateDailyLevySummary(
          document.getElementById("levySummary"),
          containerElement,
          levyAmount,
          students,
        );
        updateProgressIndicator(
          containerElement,
          students.length,
          document.getElementById("levyProgress"),
          document.getElementById("btnSaveLevy"),
        );
      });
    });
  });
}

// Builds the hint shown above the SBA Marks entry views: marks for every student are
// entered first (moving between students keeps them), then saved together once.
function _buildSbaEntryHint(isCardView) {
  var hint = document.createElement("div");
  hint.className = "notice notice--info sba-entry-hint";
  hint.setAttribute("role", "note");
  var title = document.createElement("div");
  title.className = "notice__title";
  title.textContent = "How to enter SBA marks";
  hint.appendChild(title);
  var body = document.createElement("div");
  body.textContent = isCardView
    ? "Enter this student's marks, then use the \u203A button to move to the next " +
      "student (\u2039 goes back). Marks you type are kept while you move between " +
      "students. When you have entered marks for every student, tap " +
      "\u201C\uD83D\uDCBE Save SBA Marks\u201D once to save them all together."
    : "Enter the marks for every student in the table below. When you have finished " +
      "all the students, click \u201C\uD83D\uDCBE Save SBA Marks\u201D once to " +
      "save them all together.";
  hint.appendChild(body);
  return hint;
}

// Renders the editable (or read-only) SBA marks entry grid table.
function renderSbaGrid(containerElement, students, existingMarks, readOnly) {
  if (!containerElement) return;
  existingMarks = existingMarks || {};
  readOnly = !!readOnly;

  setHtml(
    containerElement,
    '<table class="sba-grid" id="sbaGrid">' +
      "<thead><tr>" +
      '<th class="col-no">No.</th>' +
      '<th class="col-name">Name of Students</th>' +
      '<th>Indiv Test<span class="sba-th-suffix"> (15)</span></th>' +
      '<th>Class Test<span class="sba-th-suffix"> (15)</span></th>' +
      '<th>Group Work<span class="sba-th-suffix"> (15)</span></th>' +
      '<th>Project<span class="sba-th-suffix"> (15)</span></th>' +
      '<th>Exams<br><span class="sba-th-suffix">(100 marks)</span></th>' +
      "</tr></thead>" +
      '<tbody id="sbaGridBody"></tbody>' +
      "</table>",
  );
  if (!readOnly) {
    containerElement.insertBefore(_buildSbaEntryHint(false), containerElement.firstChild);
  }

  var tbody = containerElement.querySelector("#sbaGridBody");

  var fieldSpecs = [
    { key: "individual_test", min: 0, max: 15, label: "Individual Test" },
    { key: "class_test", min: 0, max: 15, label: "Class Test" },
    { key: "group_work", min: 0, max: 15, label: "Group Work" },
    { key: "project", min: 0, max: 15, label: "Project" },
    { key: "exam_marks", min: 0, max: 100, label: "Exam" },
  ];

  students.forEach(function (student, idx) {
    var sid = student.student_id;
    var displayId = student.student_non_usable_id || sid;
    var fullName = [student.first_name, student.other_name, student.surname]
      .filter(Boolean)
      .join(" ");
    var existing = existingMarks[sid] || null;

    var tr = document.createElement("tr");
    tr.dataset.sid = sid;

    var tdNo = document.createElement("td");
    tdNo.className = "col-no";
    tdNo.textContent = String(idx + 1);
    tr.appendChild(tdNo);

    var tdName = document.createElement("td");
    tdName.className = "col-name";
    tdName.textContent = fullName;
    tdName.title = "Display ID: " + displayId;
    tr.appendChild(tdName);

    fieldSpecs.forEach(function (fs) {
      var td = document.createElement("td");
      var existingVal =
        existing &&
        existing[fs.key] !== undefined &&
        existing[fs.key] !== null &&
        existing[fs.key] !== ""
          ? String(existing[fs.key])
          : "";

      if (readOnly) {
        td.textContent = existingVal !== "" ? existingVal : "—";
      } else {
        var input = document.createElement("input");
        input.type = "text";
        input.inputMode = "numeric";
        input.setAttribute("pattern", "[0-9]*");
        input.className = "sba-mark-input";
        input.setAttribute("data-field", fs.key);
        input.setAttribute("maxlength", fs.max === 100 ? "3" : "2");
        input.value = existingVal;
        input.addEventListener("input", function () {
          var stripped = input.value.replace(/[^0-9]/g, "");
          if (stripped !== input.value) input.value = stripped;
          _clearSbaFieldError(input);
        });
        input.addEventListener("blur", function () {
          _validateSbaFieldOnBlur(input, fs);
        });
        td.appendChild(input);
      }
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

// Validates one SBA mark input's range on blur; blank values are always allowed.
function _validateSbaFieldOnBlur(input, fieldSpec) {
  var raw = input.value.trim();
  if (raw === "") {
    input.classList.remove("is-error");
    return;
  }
  var num = parseInt(raw, 10);
  if (isNaN(num) || num < fieldSpec.min || num > fieldSpec.max) {
    input.classList.add("is-error");
    showToast(
      fieldSpec.label + " marks must be between " + fieldSpec.min + " and " + fieldSpec.max + ".",
      "warning",
    );
  } else {
    input.classList.remove("is-error");
    input.value = String(num);
  }
}

// Clears the error state shown for one SBA mark input.
function _clearSbaFieldError(input) {
  if (input.classList.contains("is-error")) {
    input.classList.remove("is-error");
  }
}

// Renders the mobile one-student-at-a-time SBA card view with Prev/Next navigation.
function renderSbaCardView(containerElement, students, existingMarks, readOnly) {
  if (!containerElement) return null;
  existingMarks = existingMarks || {};
  readOnly = !!readOnly;
  students = students || [];

  var fieldSpecs = [
    {
      key: "individual_test",
      min: 0,
      max: 15,
      label: "Individual Test",
      shortLabel: "Indiv Test (15)",
    },
    {
      key: "class_test",
      min: 0,
      max: 15,
      label: "Class Test",
      shortLabel: "Class Test (15)",
    },
    {
      key: "group_work",
      min: 0,
      max: 15,
      label: "Group Work",
      shortLabel: "Group Work (15)",
    },
    {
      key: "project",
      min: 0,
      max: 15,
      label: "Project",
      shortLabel: "Project (15)",
    },
    {
      key: "exam_marks",
      min: 0,
      max: 100,
      label: "Exam",
      shortLabel: "Exams (100 marks)",
    },
  ];

  setHtml(containerElement, '<div class="sba-card-view" id="sbaCardView"></div>');
  var wrapper = containerElement.querySelector("#sbaCardView");

  if (students.length === 0) {
    setHtml(
      wrapper,
      '<div class="empty-state">' +
        '<div class="empty-state__icon">👥</div>' +
        '<div class="empty-state__title">No Students Found</div>' +
        "</div>",
    );
    return {
      goToIndex: function () {},
      getCurrentIndex: function () {
        return 0;
      },
    };
  }

  var currentIndex = 0;

  var card = document.createElement("div");
  card.className = "sba-card";

  var nav = document.createElement("div");
  nav.className = "sba-card__nav";

  var prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "sba-card__nav-btn";
  prevBtn.setAttribute("aria-label", "Previous student");
  prevBtn.textContent = "‹";
  nav.appendChild(prevBtn);

  var info = document.createElement("div");
  info.className = "sba-card__student-info";
  var nameEl = document.createElement("div");
  nameEl.className = "sba-card__student-name";
  info.appendChild(nameEl);
  var posEl = document.createElement("div");
  posEl.className = "sba-card__student-position";
  info.appendChild(posEl);
  nav.appendChild(info);

  var nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "sba-card__nav-btn";
  nextBtn.setAttribute("aria-label", "Next student");
  nextBtn.textContent = "›";
  nav.appendChild(nextBtn);

  card.appendChild(nav);

  var stack = document.createElement("div");
  stack.className = "sba-card__stack";
  card.appendChild(stack);

  var progress = document.createElement("div");
  progress.className = "sba-card__progress";
  card.appendChild(progress);

  if (!readOnly) wrapper.appendChild(_buildSbaEntryHint(true));
  wrapper.appendChild(card);

  students.forEach(function (student, idx) {
    var sid = student.student_id;
    var existing = existingMarks[sid] || null;

    var fields = document.createElement("div");
    fields.className = "sba-card__fields";
    fields.dataset.sid = sid;
    fields.style.display = idx === 0 ? "" : "none";

    fieldSpecs.forEach(function (fs) {
      var fieldWrap = document.createElement("div");
      fieldWrap.className =
        "sba-card__field" + (fs.key === "exam_marks" ? " sba-card__field--exam" : "");

      var label = document.createElement("div");
      label.className = "sba-card__field-label";
      label.textContent = fs.shortLabel;
      fieldWrap.appendChild(label);

      var existingVal =
        existing &&
        existing[fs.key] !== undefined &&
        existing[fs.key] !== null &&
        existing[fs.key] !== ""
          ? String(existing[fs.key])
          : "";

      if (readOnly) {
        var roVal = document.createElement("div");
        roVal.className = "sba-mark-input";
        roVal.textContent = existingVal !== "" ? existingVal : "—";
        fieldWrap.appendChild(roVal);
      } else {
        var input = document.createElement("input");
        input.type = "text";
        input.inputMode = "numeric";
        input.setAttribute("pattern", "[0-9]*");
        input.className = "sba-mark-input";
        input.setAttribute("data-field", fs.key);
        input.setAttribute("maxlength", fs.max === 100 ? "3" : "2");
        input.value = existingVal;
        input.addEventListener("input", function () {
          var stripped = input.value.replace(/[^0-9]/g, "");
          if (stripped !== input.value) input.value = stripped;
          _clearSbaFieldError(input);
        });
        input.addEventListener("blur", function () {
          _validateSbaFieldOnBlur(input, fs);
        });
        fieldWrap.appendChild(input);
      }

      fields.appendChild(fieldWrap);
    });

    stack.appendChild(fields);
  });

  // Updates the SBA mobile card view's header (student position/name).
  function _updateHeader() {
    var student = students[currentIndex];
    var sid = student.student_id;
    var displayId = student.student_non_usable_id || sid;
    var fullName = [student.first_name, student.other_name, student.surname]
      .filter(Boolean)
      .join(" ");
    nameEl.textContent = fullName;
    nameEl.title = fullName;
    posEl.textContent = currentIndex + 1 + " of " + students.length;
    progress.textContent = "Student " + (currentIndex + 1) + " of " + students.length;
    prevBtn.disabled = currentIndex === 0;
    nextBtn.disabled = currentIndex === students.length - 1;
  }

  // Shows the SBA mobile card at the given index.
  function _showCard(idx) {
    if (idx < 0 || idx > students.length - 1) return;
    var allFieldSets = stack.querySelectorAll(".sba-card__fields");
    allFieldSets.forEach(function (fs, i) {
      fs.style.display = i === idx ? "" : "none";
    });
    currentIndex = idx;
    _updateHeader();
  }

  // Returns true if the currently visible SBA card has any field flagged as invalid.
  function _currentCardHasError() {
    var allFieldSets = stack.querySelectorAll(".sba-card__fields");
    var currentSet = allFieldSets[currentIndex];
    if (!currentSet) return false;
    return currentSet.querySelectorAll(".sba-mark-input.is-error").length > 0;
  }

  prevBtn.addEventListener("click", function () {
    if (_currentCardHasError()) {
      showToast("Please fix the invalid mark before moving to another student.", "warning");
      return;
    }
    if (currentIndex > 0) _showCard(currentIndex - 1);
  });
  nextBtn.addEventListener("click", function () {
    if (_currentCardHasError()) {
      showToast("Please fix the invalid mark before moving to another student.", "warning");
      return;
    }
    if (currentIndex < students.length - 1) _showCard(currentIndex + 1);
  });

  _updateHeader();

  return {
    goToIndex: function (idx) {
      _showCard(idx);
    },
    getCurrentIndex: function () {
      return currentIndex;
    },
  };
}

// Renders the Behavior marking grid.
function renderBehaviorGrid(containerElement, students, existingRecords, options) {
  if (!containerElement) return;
  existingRecords = existingRecords || {};
  options = options || {
    attitude: [],
    conduct: [],
    interest: [],
    teacher_remark: [],
  };

  // Builds the <option> HTML for a behavior rating select.
  function _optsHtml(list, selected) {
    var html = '<option value="">— Select —</option>';
    (list || []).forEach(function (opt) {
      var val = sanitizeDisplayValue(opt.option_value);
      var sel = opt.option_value === selected ? "selected" : "";
      html += '<option value="' + val + '" ' + sel + ">" + val + "</option>";
    });
    return html;
  }

  setHtml(
    containerElement,
    '<table class="sba-grid" id="behaviorGrid">' +
      "<thead><tr>" +
      '<th class="col-no">No.</th>' +
      '<th class="col-name">Name of Students</th>' +
      "<th>Attitude</th><th>Conduct</th><th>Interest</th>" +
      "<th>Teacher Remark</th><th>Total Attendance</th>" +
      '</tr></thead><tbody id="behaviorGridBody"></tbody></table>',
  );

  var tbody = containerElement.querySelector("#behaviorGridBody");

  students.forEach(function (student, idx) {
    var sid = student.student_id;
    var fullName = [student.first_name, student.other_name, student.surname]
      .filter(Boolean)
      .join(" ");
    var existing = existingRecords[sid] || null;

    var tr = document.createElement("tr");
    tr.dataset.sid = sid;

    var tdNo = document.createElement("td");
    tdNo.className = "col-no";
    tdNo.textContent = String(idx + 1);
    tr.appendChild(tdNo);

    var tdName = document.createElement("td");
    tdName.className = "col-name";
    tdName.textContent = fullName;
    tr.appendChild(tdName);

    ["attitude", "conduct", "interest", "teacher_remark"].forEach(function (fk) {
      var td = document.createElement("td");
      var sel = document.createElement("select");
      sel.className = "form-control sba-mark-input";
      sel.setAttribute("data-field", fk);
      setHtml(sel, _optsHtml(options[fk], existing ? existing[fk] : ""));
      td.appendChild(sel);
      tr.appendChild(td);
    });

    var tdAtt = document.createElement("td");
    var attInput = document.createElement("input");
    attInput.type = "text";
    attInput.inputMode = "numeric";
    attInput.setAttribute("pattern", "[0-9]*");
    attInput.className = "sba-mark-input";
    attInput.setAttribute("data-field", "total_attendance_present");
    attInput.setAttribute("maxlength", "3");
    attInput.value =
      existing &&
      existing.total_attendance_present !== null &&
      existing.total_attendance_present !== undefined
        ? String(existing.total_attendance_present)
        : "";
    attInput.addEventListener("input", function () {
      var stripped = attInput.value.replace(/[^0-9]/g, "");
      if (stripped !== attInput.value) attInput.value = stripped;
    });
    tdAtt.appendChild(attInput);
    tr.appendChild(tdAtt);

    tbody.appendChild(tr);
  });
}

// Renders the mobile one-student-at-a-time Behaviour Entries card view with Prev/Next navigation.
// Renders the mobile one-student-at-a-time Behaviour Entries card view with Prev/Next navigation.
function renderBehaviorCardView(
  containerElement,
  students,
  existingRecords,
  options,
  cumulativeAverages,
  aggPosition,
) {
  if (!containerElement) return null;
  existingRecords = existingRecords || {};
  options = options || {
    attitude: [],
    conduct: [],
    interest: [],
    teacher_remark: [],
  };
  cumulativeAverages = cumulativeAverages || {};
  aggPosition = aggPosition || { title: "", values: {} };
  students = students || [];

  // Builds the <option> HTML for a behavior rating select (mirrors renderBehaviorGrid()'s _optsHtml()).
  function _optsHtml(list, selected) {
    var html = '<option value="">— Select —</option>';
    (list || []).forEach(function (opt) {
      var val = sanitizeDisplayValue(opt.option_value);
      var sel = opt.option_value === selected ? "selected" : "";
      html += '<option value="' + val + '" ' + sel + ">" + val + "</option>";
    });
    return html;
  }

  setHtml(
    containerElement,
    '<div class="sba-card-view behavior-card-view" id="behaviorCardView"></div>',
  );
  var wrapper = containerElement.querySelector("#behaviorCardView");

  if (students.length === 0) {
    setHtml(
      wrapper,
      '<div class="empty-state">' +
        '<div class="empty-state__icon">👥</div>' +
        '<div class="empty-state__title">No Students Found</div>' +
        "</div>",
    );
    return {
      goToIndex: function () {},
      getCurrentIndex: function () {
        return 0;
      },
    };
  }

  var currentIndex = 0;

  var card = document.createElement("div");
  card.className = "sba-card";

  var nav = document.createElement("div");
  nav.className = "sba-card__nav";

  var prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "sba-card__nav-btn";
  prevBtn.setAttribute("aria-label", "Previous student");
  prevBtn.textContent = "‹";
  nav.appendChild(prevBtn);

  var info = document.createElement("div");
  info.className = "sba-card__student-info";
  var nameEl = document.createElement("div");
  nameEl.className = "sba-card__student-name";
  info.appendChild(nameEl);
  var posEl = document.createElement("div");
  posEl.className = "sba-card__student-position";
  info.appendChild(posEl);
  nav.appendChild(info);

  var nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "sba-card__nav-btn";
  nextBtn.setAttribute("aria-label", "Next student");
  nextBtn.textContent = "›";
  nav.appendChild(nextBtn);

  card.appendChild(nav);

  var stack = document.createElement("div");
  stack.className = "sba-card__stack";
  card.appendChild(stack);

  var progress = document.createElement("div");
  progress.className = "sba-card__progress";
  card.appendChild(progress);

  wrapper.appendChild(card);

  var selectFieldSpecs = [
    { key: "attitude", label: "Attitude" },
    { key: "conduct", label: "Conduct" },
    { key: "interest", label: "Interest" },
    { key: "teacher_remark", label: "Teacher Remark" },
  ];

  students.forEach(function (student, idx) {
    var sid = student.student_id;
    var existing = existingRecords[sid] || null;

    var fields = document.createElement("div");
    fields.className = "sba-card__fields";
    fields.dataset.sid = sid;
    fields.style.display = idx === 0 ? "" : "none";

    selectFieldSpecs.forEach(function (fs) {
      var fieldWrap = document.createElement("div");
      fieldWrap.className = "sba-card__field";

      var label = document.createElement("div");
      label.className = "sba-card__field-label";
      label.textContent = fs.label;
      fieldWrap.appendChild(label);

      var sel = document.createElement("select");
      sel.className = "form-control sba-mark-input";
      sel.setAttribute("data-field", fs.key);
      setHtml(sel, _optsHtml(options[fs.key], existing ? existing[fs.key] : ""));
      fieldWrap.appendChild(sel);

      fields.appendChild(fieldWrap);
    });

    // Total Attendance spans the full row, mirroring the SBA card
    // view's "exam" field treatment (.sba-card__field--exam).
    var attWrap = document.createElement("div");
    attWrap.className = "sba-card__field sba-card__field--exam";

    var attLabel = document.createElement("div");
    attLabel.className = "sba-card__field-label";
    attLabel.textContent = "Total Attendance";
    attWrap.appendChild(attLabel);

    var attInput = document.createElement("input");
    attInput.type = "text";
    attInput.inputMode = "numeric";
    attInput.setAttribute("pattern", "[0-9]*");
    attInput.className = "sba-mark-input";
    attInput.setAttribute("data-field", "total_attendance_present");
    attInput.setAttribute("maxlength", "3");
    attInput.value =
      existing &&
      existing.total_attendance_present !== null &&
      existing.total_attendance_present !== undefined
        ? String(existing.total_attendance_present)
        : "";
    attInput.addEventListener("input", function () {
      var stripped = attInput.value.replace(/[^0-9]/g, "");
      if (stripped !== attInput.value) attInput.value = stripped;
    });
    attWrap.appendChild(attInput);

    fields.appendChild(attWrap);

    // Current Term Aggregate/Position — read-only, computed
    // server-side by getCurrentTermAggPositionForBehavior(). Purely
    // informational, never editable/submitted.
    var aggPosWrap = document.createElement("div");
    aggPosWrap.className = "sba-card__field sba-card__field--exam";

    var aggPosLabel = document.createElement("div");
    aggPosLabel.className = "sba-card__field-label";
    aggPosLabel.textContent = aggPosition.title
      ? "Current Term " + aggPosition.title
      : "Current Term Aggregate/Position";
    aggPosWrap.appendChild(aggPosLabel);

    var aggPosVal = document.createElement("div");
    aggPosVal.className = "sba-mark-input";
    var _aggPosRaw =
      aggPosition.values && aggPosition.values[sid] !== undefined ? aggPosition.values[sid] : null;
    aggPosVal.textContent = _aggPosRaw ? _aggPosRaw : "Not Yet";
    aggPosWrap.appendChild(aggPosVal);

    fields.appendChild(aggPosWrap);

    // Cumulative Average (Term 1-3) — read-only, computed
    // server-side by getCumulativeAveragesForBehavior(). Purely
    // informational (never editable/submitted), matching the
    // desktop's Terminal Report tab display.
    var cumAvgWrap = document.createElement("div");
    cumAvgWrap.className = "sba-card__field sba-card__field--exam";

    var cumAvgLabel = document.createElement("div");
    cumAvgLabel.className = "sba-card__field-label";
    cumAvgLabel.textContent = "Cumulative Average (Term 1-3)";
    cumAvgWrap.appendChild(cumAvgLabel);

    var cumAvgVal = document.createElement("div");
    cumAvgVal.className = "sba-mark-input";
    var _cumAvgRaw = cumulativeAverages ? cumulativeAverages[sid] : undefined;
    cumAvgVal.textContent =
      _cumAvgRaw !== null && _cumAvgRaw !== undefined && _cumAvgRaw > 0
        ? Number(_cumAvgRaw).toFixed(1) + "%"
        : "Not Yet";
    cumAvgWrap.appendChild(cumAvgVal);

    fields.appendChild(cumAvgWrap);

    stack.appendChild(fields);
  });

  // Updates the Behaviour mobile card view's header (student position/name).
  function _updateHeader() {
    var student = students[currentIndex];
    var fullName = [student.first_name, student.other_name, student.surname]
      .filter(Boolean)
      .join(" ");
    nameEl.textContent = fullName;
    nameEl.title = fullName;
    posEl.textContent = currentIndex + 1 + " of " + students.length;
    progress.textContent = "Student " + (currentIndex + 1) + " of " + students.length;
    prevBtn.disabled = currentIndex === 0;
    nextBtn.disabled = currentIndex === students.length - 1;
  }

  // Shows the Behaviour mobile card at the given index.
  function _showCard(idx) {
    if (idx < 0 || idx > students.length - 1) return;
    var allFieldSets = stack.querySelectorAll(".sba-card__fields");
    allFieldSets.forEach(function (fs, i) {
      fs.style.display = i === idx ? "" : "none";
    });
    currentIndex = idx;
    _updateHeader();
  }

  prevBtn.addEventListener("click", function () {
    if (currentIndex > 0) _showCard(currentIndex - 1);
  });
  nextBtn.addEventListener("click", function () {
    if (currentIndex < students.length - 1) _showCard(currentIndex + 1);
  });

  _updateHeader();

  return {
    goToIndex: function (idx) {
      _showCard(idx);
    },
    getCurrentIndex: function () {
      return currentIndex;
    },
  };
}

// Collects Behavior grid values.
function collectBehaviorValues(gridContainer, students) {
  var records = [];
  var incomplete = [];
  var rows = gridContainer ? gridContainer.querySelectorAll("[data-sid]") : [];

  var nameById = {};
  (students || []).forEach(function (s) {
    var fullName = [s.first_name, s.other_name, s.surname].filter(Boolean).join(" ");
    nameById[s.student_id] = fullName || s.student_id;
  });

  rows.forEach(function (row) {
    var sid = row.dataset.sid;
    var attitude = (row.querySelector('[data-field="attitude"]') || {}).value || "";
    var conduct = (row.querySelector('[data-field="conduct"]') || {}).value || "";
    var interest = (row.querySelector('[data-field="interest"]') || {}).value || "";
    var remark = (row.querySelector('[data-field="teacher_remark"]') || {}).value || "";
    var attInput = row.querySelector('[data-field="total_attendance_present"]');
    var attRaw = attInput ? attInput.value.trim() : "";

    if (!attitude && !conduct && !interest && !remark && !attRaw) {
      incomplete.push(nameById[sid] || sid);
      return;
    }

    records.push({
      student_id: sid,
      attitude: attitude,
      conduct: conduct,
      interest: interest,
      teacher_remark: remark,
      total_attendance_present: attRaw === "" ? null : parseInt(attRaw, 10),
    });
  });

  return { records: records, incomplete: incomplete };
}

// Updates a progress bar and its label.
function updateProgressIndicator(gridContainer, totalStudents, indicatorElement, saveButton) {
  if (!gridContainer || !totalStudents) return;
  var rows = gridContainer.querySelectorAll("tbody tr[data-sid]");
  var marked = 0;
  rows.forEach(function (row) {
    var sid = row.dataset.sid;
    var radio = row.querySelector(
      'input[name="att_' + sid + '"]:checked, ' + 'input[name="levy_' + sid + '"]:checked',
    );
    if (radio) marked++;
  });

  var complete = marked === totalStudents;

  if (indicatorElement) {
    indicatorElement.textContent = "Marked " + marked + " of " + totalStudents + " students";
    indicatorElement.className = "progress-indicator__text" + (complete ? " complete" : "");

    var fill = indicatorElement.parentElement
      ? indicatorElement.parentElement.querySelector(".progress-bar-fill")
      : null;
    if (fill) {
      var pct = totalStudents > 0 ? Math.round((marked / totalStudents) * 100) : 0;
      fill.style.width = pct + "%";
      fill.className = "progress-bar-fill" + (complete ? " complete" : "");
    }
  }

  if (saveButton) {
    saveButton.disabled = !complete;
    if (complete) {
      saveButton.classList.remove("is-disabled");
    } else {
      saveButton.classList.add("is-disabled");
    }
  }
}
// SECTION 21: SUMMARY UPDATERS

// Updates the Attendance tab's present/absent summary counts.
function updateAttendanceSummary(summaryContainer, gridContainer, students) {
  if (!summaryContainer || !gridContainer) return;
  var sexMap = {};
  (students || []).forEach(function (s) {
    sexMap[s.student_id] = s.sex || "";
  });

  var boysP = 0,
    boysA = 0,
    girlsP = 0,
    girlsA = 0;
  gridContainer.querySelectorAll("tbody tr[data-sid]").forEach(function (row) {
    var sid = row.dataset.sid;
    var radio = row.querySelector('input[type="radio"]:checked');
    if (!radio) return;
    var sex = sexMap[sid] || "";
    var isMale = sex === "M" || sex === "Male";
    if (radio.value === "P") {
      if (isMale) boysP++;
      else girlsP++;
    } else {
      if (isMale) boysA++;
      else girlsA++;
    }
  });

  _setSummaryCell(summaryContainer, "sumBoysPresent", boysP);
  _setSummaryCell(summaryContainer, "sumBoysAbsent", boysA);
  _setSummaryCell(summaryContainer, "sumGirlsPresent", girlsP);
  _setSummaryCell(summaryContainer, "sumGirlsAbsent", girlsA);
  _setSummaryCell(summaryContainer, "sumTotalPresent", boysP + girlsP);
  _setSummaryCell(summaryContainer, "sumTotalAbsent", boysA + girlsA);
}

// Updates the Daily Levy tab's paid/unpaid summary counts.
function updateDailyLevySummary(summaryContainer, gridContainer, levyAmount, students) {
  if (!summaryContainer || !gridContainer) return;
  var paidCount = 0,
    absentCount = 0,
    notPaidCount = 0,
    totalCollected = 0;

  gridContainer.querySelectorAll("tbody tr[data-sid]").forEach(function (row) {
    var radio = row.querySelector('input[type="radio"]:checked');
    if (!radio) return;
    var ps = radio.value;
    if (ps === "Paid") {
      paidCount++;
      // Location Identity feature: each row carries its own
      // resolved rate (set by renderDailyLevyGrid) so a "Paid"
      // student in an overridden location is counted at their own
      // rate, not the flat class-wide levyAmount.
      var rowRate = parseFloat(row.dataset.rate);
      totalCollected += !isNaN(rowRate) ? rowRate : levyAmount;
    } else if (ps === "Absent") {
      absentCount++;
    } else if (ps === "Not Paid") {
      notPaidCount++;
    }
  });

  _setSummaryCell(summaryContainer, "sumPaidCount", paidCount);
  _setSummaryCell(summaryContainer, "sumAbsentCount", absentCount);
  _setSummaryCell(summaryContainer, "sumNotPaidCount", notPaidCount);
  _setSummaryCell(summaryContainer, "sumTotalCollected", "GH₵ " + totalCollected.toFixed(2));
}

// Sets the text/class of one summary cell.
function _setSummaryCell(container, id, value) {
  var el = container.querySelector("#" + id);
  if (el) el.textContent = value;
}

// SECTION 22: COLLECT GRID VALUES

// Collects Attendance grid values.
function collectAttendanceValues(gridContainer, students) {
  var records = [];
  var incomplete = [];
  var rows = gridContainer ? gridContainer.querySelectorAll("tbody tr[data-sid]") : [];
  rows.forEach(function (row) {
    var sid = row.dataset.sid;
    var radio = row.querySelector('input[type="radio"]:checked');
    if (radio) {
      records.push({ student_id: sid, status: radio.value });
    } else {
      var displayId = row.querySelector("td:first-child");
      incomplete.push(displayId ? displayId.textContent.trim() : sid);
    }
  });
  return { records: records, incomplete: incomplete };
}

// Collects Daily Levy grid values.
function collectDailyLevyValues(gridContainer, students) {
  var records = [];
  var incomplete = [];
  var rows = gridContainer ? gridContainer.querySelectorAll("tbody tr[data-sid]") : [];

  rows.forEach(function (row) {
    var sid = row.dataset.sid;
    var radio = row.querySelector('input[type="radio"]:checked');
    if (radio) {
      // The server sets the amount: the student's full rate when Paid, else 0.
      records.push({
        student_id: sid,
        payment_status: radio.value,
        amount_paid: null,
      });
    } else {
      var displayId = row.querySelector("td:first-child");
      incomplete.push(displayId ? displayId.textContent.trim() : sid);
    }
  });

  return { records: records, incomplete: incomplete };
}

// Collects SBA grid values: skips fully-blank rows, blocks partially-filled ones,
// and validates ranges.
function collectSbaValues(gridContainer, students) {
  var records = [];
  var incomplete = [];
  var errors = [];
  var rows = gridContainer ? gridContainer.querySelectorAll("[data-sid]") : [];

  var nameById = {};
  (students || []).forEach(function (s) {
    var fullName = [s.first_name, s.other_name, s.surname].filter(Boolean).join(" ");
    nameById[s.student_id] = fullName || s.student_id;
  });

  rows.forEach(function (row) {
    var sid = row.dataset.sid;
    var inputs = row.querySelectorAll(".sba-mark-input");
    var values = {};
    var filledCount = 0;
    var hasRangeError = false;

    inputs.forEach(function (input) {
      var key = input.getAttribute("data-field");
      var raw = input.value.trim();
      if (raw !== "") {
        filledCount++;
        var num = parseInt(raw, 10);
        var max = key === "exam_marks" ? 100 : 15;
        if (isNaN(num) || num < 0 || num > max) {
          hasRangeError = true;
          input.classList.add("is-error");
        }
        values[key] = num;
      } else {
        values[key] = null;
      }
    });

    var displayName = nameById[sid] || sid;

    if (hasRangeError) {
      errors.push(displayName + " has an invalid mark. Please correct it before saving.");
      return;
    }

    if (filledCount === 0) {
      incomplete.push(displayName);
      return;
    }

    if (filledCount < inputs.length) {
      errors.push(
        "Please fill in all five fields for " +
          displayName +
          ", or leave all blank to skip this student.",
      );
      return;
    }

    records.push({
      student_id: sid,
      individual_test: values.individual_test,
      class_test: values.class_test,
      group_work: values.group_work,
      project: values.project,
      exam_marks: values.exam_marks,
    });
  });

  return { records: records, incomplete: incomplete, errors: errors };
}

// SECTION 23: HANDLE SAVE WITH RETRY

// Generic save handler: disables the button, calls the save action with its named payload, and
// shows a success/duplicate/error toast with retry support.
function handleSaveWithRetry(saveFunction, params, saveButton, onSuccess) {
  if (!saveButton) return;

  saveButton.disabled = true;
  saveButton.classList.add("is-loading");
  // Every save button's label is plain text, so it is restored as text.
  var origLabel = saveButton.textContent;
  var spinner = el("span", { className: "btn__spinner" });
  spinner.style.cssText =
    "display:inline-block;position:static;margin:auto;border-top-color:white;";
  saveButton.textContent = "";
  saveButton.appendChild(spinner);

  // Re-enables the save button and restores its label after a save attempt finishes.
  function _reenable() {
    saveButton.disabled = false;
    saveButton.classList.remove("is-loading");
    saveButton.textContent = origLabel;
  }

  // Shows a Retry button with an error message after a failed save.
  function _showRetry(errMsg, isRawTechnicalError) {
    var displayMsg =
      isRawTechnicalError === false
        ? errMsg || "Save failed. Please try again."
        : friendlyErrorFrontend(errMsg);
    showToast(displayMsg, "error");
    _reenable();
    var retryId = "retryBtn_" + saveButton.id;
    var existing = document.getElementById(retryId);
    if (existing) existing.remove();
    var retryBtn = document.createElement("button");
    retryBtn.id = retryId;
    retryBtn.className = "btn btn--retry mt-3";
    retryBtn.textContent = "↺ Retry";
    retryBtn.addEventListener("click", function () {
      retryBtn.remove();
      handleSaveWithRetry(saveFunction, params, saveButton, onSuccess);
    });
    if (saveButton.parentElement) {
      saveButton.parentElement.insertBefore(retryBtn, saveButton.nextSibling);
    }
  }

  // Performs the actual server save call for handleSaveWithRetry(), handling its result codes.
  function _doSave(overrideParams) {
    callServer(saveFunction, overrideParams, getTeacherSession().token).then(
      function (result) {
        if (!result) {
          _showRetry("Unknown error");
          return;
        }
        if (result.code === "INACTIVE") {
          redirectToLogin("error=suspended");
          return;
        }
        if (result.code === "UNAUTHORIZED") {
          redirectToLogin("error=session_updated");
          return;
        }
        if (result.code === "DUPLICATE_EXISTS") {
          _reenable();
          showModal(
            "Records Already Exist",
            "<p>" + sanitizeDisplayValue(result.message) + "</p>",
            [
              {
                label: "Cancel",
                cls: "btn--ghost",
                action: function () {
                  closeModal();
                },
              },
              {
                label: "Override",
                cls: "btn--accent",
                action: function () {
                  closeModal();
                  _doSave(Object.assign({}, overrideParams, { isOverride: true }));
                },
              },
            ],
          );
          return;
        }
        // Another collector changed some of these payments after this page loaded.
        if (result.code === "CONFIRM_OVERWRITE") {
          _reenable();
          showModal(
            "Changed by Another Collector",
            "<p>" + sanitizeDisplayValue(result.message).replace(/\n/g, "<br>") + "</p>",
            [
              { label: "Cancel", cls: "btn--ghost", action: function () { closeModal(); } },
              {
                label: "Save Anyway",
                cls: "btn--accent",
                action: function () {
                  closeModal();
                  var confirmed = {};
                  confirmed[result.confirmField || "confirmOverwrite"] = true;
                  _doSave(Object.assign({}, overrideParams, confirmed));
                },
              },
            ],
          );
          return;
        }
        if (!result.success) {
          _showRetry(result.message || "Save failed", false);
          return;
        }
        _reenable();
        showToast(result.message || "Saved successfully!", "success");
        if (onSuccess) onSuccess(result);
      },
      function (err) {
        _showRetry(err ? err.message : "Server error");
      },
    );
  }

  _doSave(params);
}

// SECTION 26b: LEVY LABEL OVERRIDES

// Cached levy label overrides — defaults until loadLevyLabelOverrides() resolves.
var LEVY_LABEL_OVERRIDES = {
  "Admission Fee": "Admission Fee",
  "Tuition Fee": "Tuition Fee",
  "Daily Levy": "Daily Levy",
};
var LEVY_LABEL_OVERRIDES_LOADED = false;

// Fetches the admin's custom levy label text (if any) and caches it for getLevyLabel() lookups.
function loadLevyLabelOverrides(token, callback) {
  callServer("getLevyLabelOverrides", {}, token).then(
    function (res) {
      if (res && res.success && res.labels) {
        LEVY_LABEL_OVERRIDES = res.labels;
      }
      LEVY_LABEL_OVERRIDES_LOADED = true;
      if (callback) callback();
    },
    function () {
      LEVY_LABEL_OVERRIDES_LOADED = true;
      if (callback) callback();
    },
  );
}

// Returns the display text for a levy label key ("Admission Fee", "Tuition Fee", "Daily Levy"),
// falling back to the key itself if no override has loaded yet (safe default = current behavior).
function getLevyLabel(key) {
  return (LEVY_LABEL_OVERRIDES && LEVY_LABEL_OVERRIDES[key]) || key;
}

// SECTION 27: IDLE SESSION MONITOR (shared helper — Admin/Teacher portals)
// Doesn't change server-side session expiry — only warns the user
// before the sliding SESSION_TIMEOUT_MINUTES idle expiry kicks them
// out silently mid-task.
function initIdleSessionMonitor(options) {
  options = options || {};
  var idleLimitMs = (options.idleMinutes || 25) * 60000;
  var warnBeforeMs = (options.warnBeforeMinutes || 5) * 60000;
  var onKeepAlive = options.onKeepAlive;
  var onForceLogout = options.onForceLogout;

  var lastActivity = Date.now();
  var warningShown = false;

  function _resetActivity() {
    lastActivity = Date.now();
    if (warningShown) {
      warningShown = false;
      var overlay = document.getElementById("globalModal");
      if (overlay && overlay.classList.contains("open")) {
        closeModal();
      }
    }
  }

  ["mousemove", "mousedown", "keydown", "scroll", "touchstart"].forEach(function (evt) {
    document.addEventListener(evt, _resetActivity, { passive: true });
  });

  setInterval(function () {
    var idleFor = Date.now() - lastActivity;
    var warnAt = idleLimitMs - warnBeforeMs;

    if (idleFor >= idleLimitMs) {
      if (onForceLogout) onForceLogout();
      return;
    }

    if (idleFor >= warnAt && !warningShown) {
      warningShown = true;
      var secondsLeft = Math.max(1, idleLimitMs - idleFor) / 1000;
      showModal(
        "⏳ Session Expiring Soon",
        "<p>You've been inactive for a while. For your security, you'll be " +
          "logged out automatically in about " +
          Math.ceil(secondsLeft / 60) +
          " minute(s) unless you stay active.</p>",
        [
          {
            label: "Stay Logged In",
            cls: "btn--accent",
            action: function () {
              _resetActivity();
              if (onKeepAlive) onKeepAlive();
              closeModal();
            },
          },
        ],
      );
    }
  }, 15000);
}

// SECTION 24b: SEARCH BOX CLEAR (✕) BUTTON (shared helper)

// Wraps a search input with a ✕ button that empties it and re-runs its own input filter.
function searchBoxWithClear(inputHtml, inputId, maxWidth) {
  return (
    '<span class="search-clear-wrap" style="max-width:' +
    sanitizeDisplayValue(maxWidth) +
    ';">' +
    inputHtml +
    '<button type="button" class="teacher-search-clear" id="' +
    sanitizeDisplayValue(inputId) +
    'Clear" aria-label="Clear search" title="Clear search" data-onclick="clearSearchBox(\'' +
    escapeForJsAttr(inputId) +
    "')\">✕</button>" +
    "</span>"
  );
}

// Shows the ✕ only while the box has text; call from the input's data-oninput.
function toggleSearchClear(input) {
  var btn = input && document.getElementById(input.id + "Clear");
  if (btn) btn.style.display = input.value ? "flex" : "none";
}

function clearSearchBox(inputId) {
  var input = document.getElementById(inputId);
  if (!input) return;
  input.value = "";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.focus();
}

// SECTION 10b: ESCAPING FOR TEMPLATE ACTIONS

// Escapes a value for a quoted string argument of a data-on* template action.
function escapeForJsAttr(value) {
  if (value === null || value === undefined) return "";
  var s = String(value);
  s = s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r\n|\r|\n/g, "\\n");
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// SECTION 8b: PORTAL ADDRESS

// The school's portal folder on this site, e.g. https://…/<school>-<code>/ (teachers and the
// admin both sign in there).
function getPortalBaseUrl() {
  return window.location.origin + window.location.pathname;
}

// The portal address for a screen; teachers and sign-in use the folder address itself.
function buildPortalUrl(page) {
  var base = getPortalBaseUrl();
  return !page || page === "login" || page === "teacher" ? base : base + "#" + page;
}

// SECTION 28: TEMPLATE ACTIONS
// The old page templates used inline handler attributes calling fn('a', this.value), which the
// Content Security Policy blocks. They now carry the same text in data-onclick (data-onchange, …):
// one listener per event reads it as calls to functions registered with registerPageActions(),
// with literal arguments only. Nothing is ever evaluated as code.

var PAGE_ACTIONS_ = {};
var PAGE_ACTION_EVENTS_ = {
  click: "onclick",
  change: "onchange",
  input: "oninput",
  mousedown: "onmousedown",
  keydown: "onkeydown",
  keyup: "onkeyup",
  focusin: "onfocus",
  focusout: "onblur",
};
var PAGE_ACTION_CACHE_ = {};

/* Makes these functions callable from data-on* attributes: registerPageActions({showSection, …}). */
function registerPageActions(fns) {
  Object.keys(fns).forEach(function (name) {
    if (typeof fns[name] !== "function") throw new TypeError(name + " is not a function");
    PAGE_ACTIONS_[name] = fns[name];
  });
}

/* Parses "a('x', 1); b(this.value); return false" into {calls: [{name, args}], returnFalse}. */
function parsePageAction_(text) {
  var pos = 0;
  var fail = function (why) {
    throw new SyntaxError("page action " + JSON.stringify(text) + ": " + why + " at " + pos);
  };
  var space = function () {
    while (pos < text.length && /\s/.test(text[pos])) pos++;
  };
  var word = function () {
    var m = /^[A-Za-z_$][\w$]*/.exec(text.slice(pos));
    if (!m) fail("expected a name");
    pos += m[0].length;
    return m[0];
  };
  var expect = function (ch) {
    space();
    if (text[pos] !== ch) fail("expected " + ch);
    pos++;
  };
  var str = function () {
    var quote = text[pos++];
    var out = "";
    while (pos < text.length && text[pos] !== quote) {
      var ch = text[pos++];
      if (ch === "\\") {
        var next = text[pos++];
        out += next === "n" ? "\n" : next === "t" ? "\t" : next;
      } else {
        out += ch;
      }
    }
    if (text[pos] !== quote) fail("unclosed string");
    pos++;
    return { kind: "value", value: out };
  };
  var list = function (close) {
    var items = [];
    space();
    while (text[pos] !== close) {
      if (pos >= text.length) fail("expected " + close);
      items.push(arg());
      space();
      if (text[pos] === ",") pos++;
      else if (text[pos] !== close) fail("expected , or " + close);
      space();
    }
    pos++;
    return items;
  };
  var arg = function () {
    space();
    var ch = text[pos];
    if (ch === "'" || ch === '"') return str();
    if (ch === "[") {
      pos++;
      return { kind: "array", items: list("]") };
    }
    var num = /^-?\d+(\.\d+)?/.exec(text.slice(pos));
    if (num) {
      pos += num[0].length;
      return { kind: "value", value: Number(num[0]) };
    }
    var name = word();
    if (name === "true" || name === "false") return { kind: "value", value: name === "true" };
    if (name === "null") return { kind: "value", value: null };
    if (name === "event") return { kind: "event" };
    if (name !== "this") fail("unsupported argument " + name);
    if (text[pos] !== ".") return { kind: "this" };
    pos++;
    var prop = word();
    if (prop === "value" || prop === "checked") return { kind: "prop", prop: prop };
    if (prop !== "getAttribute") fail("unsupported this." + prop);
    expect("(");
    space();
    if (text[pos] !== "'" && text[pos] !== '"') fail("expected an attribute name");
    var attrName = str().value;
    expect(")");
    return { kind: "attr", name: attrName };
  };
  var calls = [];
  var returnFalse = false;
  for (;;) {
    space();
    if (pos >= text.length) break;
    if (text[pos] === ";") {
      pos++;
      continue;
    }
    var name = word();
    if (name === "return") {
      space();
      if (word() !== "false") fail("only 'return false' is supported");
      returnFalse = true;
      continue;
    }
    expect("(");
    calls.push({ name: name, args: list(")") });
  }
  return { calls: calls, returnFalse: returnFalse };
}

function pageActionValue_(arg, node, evt) {
  if (arg.kind === "value") return arg.value;
  if (arg.kind === "array") {
    return arg.items.map(function (a) {
      return pageActionValue_(a, node, evt);
    });
  }
  if (arg.kind === "event") return evt;
  if (arg.kind === "this") return node;
  if (arg.kind === "prop") return node[arg.prop];
  return node.getAttribute(arg.name);
}

/* Runs the data-on* action text of `node` for `evt`. */
function runPageAction_(node, attr, evt) {
  var text = node.getAttribute("data-" + attr) || "";
  var parsed = PAGE_ACTION_CACHE_[text];
  if (!parsed) {
    try {
      parsed = parsePageAction_(text);
    } catch (err) {
      console.error(err);
      return;
    }
    PAGE_ACTION_CACHE_[text] = parsed;
  }
  // A "#" link would change the page hash, which reloads the screen (boot.js).
  if (parsed.returnFalse || (node.tagName === "A" && node.getAttribute("href") === "#")) {
    evt.preventDefault();
  }
  parsed.calls.forEach(function (call) {
    var fn = PAGE_ACTIONS_[call.name];
    if (!fn) {
      console.error("page action not registered: " + call.name);
      return;
    }
    fn.apply(
      node,
      call.args.map(function (a) {
        return pageActionValue_(a, node, evt);
      }),
    );
  });
}

Object.keys(PAGE_ACTION_EVENTS_).forEach(function (type) {
  var attr = PAGE_ACTION_EVENTS_[type];
  document.addEventListener(type, function (evt) {
    var target = evt.target;
    if (!target || !target.closest) return;
    // Focus and blur belonged to the element itself; the others bubbled to the nearest handler.
    var node =
      type === "focusin" || type === "focusout" ? target : target.closest("[data-" + attr + "]");
    if (node && node.hasAttribute("data-" + attr)) runPageAction_(node, attr, evt);
  });
});
