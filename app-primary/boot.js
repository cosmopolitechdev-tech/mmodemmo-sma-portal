// Starts the portal inside a school's page: picks the screen from the hash, inserts its markup,
// then loads the scripts in order. The school's config.js has already set MMODEMMO_CONFIG.
(function () {
  var base = document.currentScript.src.replace(/[^/]*$/, "");
  var SCREENS = {
    login: { markup: "login", css: "login.css", scripts: ["login.js"] },
    teacher: { markup: "teacher", css: "teacher.css", scripts: ["portal.js", "teacher.js"] },
    admin: { markup: "admin", css: "admin.css", scripts: ["portal.js", "admin.js"] },
  };
  var screen = SCREENS[window.location.hash.slice(1)] || SCREENS.login;
  window.addEventListener("hashchange", function () {
    window.location.reload();
  });
  var fail = function (err) {
    console.error(err);
    document.body.textContent =
      "The school portal could not load. Check your internet connection and reload the page.";
  };

  var link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = base + screen.css;
  document.head.appendChild(link);

  // No ".html": Cloudflare Pages answers x.html with a redirect to the extensionless path.
  fetch(base + screen.markup, { cache: "no-cache" })
    .then(function (res) {
      if (!res.ok) throw new Error(screen.markup + ": HTTP " + res.status);
      return res.text();
    })
    .then(function (html) {
      // Our own static markup from this site; it holds no user or server text.
      document.body.insertAdjacentHTML("afterbegin", html);
      ["api.js", "common.js"].concat(screen.scripts).forEach(function (file) {
        var script = document.createElement("script");
        script.src = base + file;
        script.async = false; // keep the order: each file needs the ones before it
        script.onerror = function () {
          fail(new Error(file + " failed to load"));
        };
        document.body.appendChild(script);
      });
    })
    .catch(fail);
})();
