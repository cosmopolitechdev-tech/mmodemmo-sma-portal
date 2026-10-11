// The website's one connection to the school's Apps Script deployment (WEB_ROUTES_ in Code.gs).
// Plain-text POSTs avoid a CORS preflight, which Apps Script cannot answer; the token travels in
// the body, never in the URL.
var MmodemmoApi = (function () {
  var NETWORK_ERROR = Object.freeze({
    code: "NETWORK",
    message: "Could not reach the server. Check your connection and try again.",
  });
  var BAD_RESPONSE = Object.freeze({
    code: "BAD_RESPONSE",
    message: "The server sent an unexpected reply. Please try again.",
  });
  var TIMEOUT = Object.freeze({
    code: "TIMEOUT",
    message: "The server is taking too long to answer. Check your connection and try again.",
  });
  var TIMEOUT_MS = 60000;
  // Reads are safe to repeat; a failed save or sign-in is never sent twice.
  var RETRYABLE = { NETWORK: true, BAD_RESPONSE: true };
  function isReadOnly(action) {
    return /^(get|list)[A-Z]/.test(action);
  }

  /* POSTs {web: 1, action, payload, token}; resolves {ok, data} or {ok: false, error}, never rejects. */
  function request(apiUrl, action, payload, token) {
    return requestOnce(apiUrl, action, payload, token).then(function (reply) {
      if (reply.ok || !isReadOnly(action) || !RETRYABLE[reply.error.code]) return reply;
      return new Promise(function (resolve) {
        setTimeout(resolve, 1500);
      }).then(function () {
        return requestOnce(apiUrl, action, payload, token);
      });
    });
  }

  function requestOnce(apiUrl, action, payload, token) {
    if (!apiUrl) {
      return Promise.resolve({
        ok: false,
        error: { code: "NOT_CONFIGURED", message: "This portal is not set up yet." },
      });
    }
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, TIMEOUT_MS);
    return fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ web: 1, action: action, payload: payload || {}, token: token || "" }),
      redirect: "follow",
      signal: controller.signal,
    })
      .then(
        function (response) {
          if (!response.ok) {
            console.error(action, "HTTP " + response.status);
            return { ok: false, error: NETWORK_ERROR };
          }
          return response.json().then(
            function (body) {
              if (body && typeof body.ok === "boolean") return body;
              console.error(action, "reply without ok", body);
              return { ok: false, error: BAD_RESPONSE };
            },
            function (err) {
              // Google answers with an HTML page when the deployment is missing or not public.
              console.error(action, err);
              return { ok: false, error: BAD_RESPONSE };
            },
          );
        },
        function (err) {
          console.error(action, err);
          return { ok: false, error: err && err.name === "AbortError" ? TIMEOUT : NETWORK_ERROR };
        },
      )
      .finally(function () {
        clearTimeout(timer);
      });
  }

  return { request: request };
})();
