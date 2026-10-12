// Starts the portal inside a school's page: picks the screen from the hash, inserts its markup,
// then loads the scripts in order. The school's config.js has already set MMODEMMO_CONFIG.
(function () {
  var base = document.currentScript.src.replace(/[^/]*$/, "");
  var APP_FONTS = ['400 1em "Inter"', '600 1em "Inter"'];
  var SCREENS = {
    login: {
      markup: "login",
      css: "login.css",
      scripts: ["login.js"],
      fonts: ['400 1em "DM Sans"', '700 1em "DM Sans"', '400 1em "DM Serif Display"'].concat(APP_FONTS),
    },
    teacher: { markup: "teacher", css: "teacher.css", scripts: ["portal.js", "teacher.js"], fonts: APP_FONTS },
    admin: { markup: "admin", css: "admin.css", scripts: ["portal.js", "admin.js"], fonts: APP_FONTS },
  };
  // A slow font never holds the page back longer than this; the text then swaps in later.
  var FONT_WAIT_MS = 1500;
  var screen = SCREENS[window.location.hash.slice(1)] || SCREENS.login;
  window.addEventListener("hashchange", function () {
    window.location.reload();
  });
  var reveal = function () {
    document.body.style.visibility = "";
  };
  var fail = function (err) {
    console.error(err);
    document.body.textContent =
      "The school portal could not load. Check your internet connection and reload the page.";
    reveal();
  };

  var fontsLoaded = function () {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var loads = Promise.all(
      screen.fonts.map(function (font) {
        return document.fonts.load(font);
      }),
    ).catch(function (err) {
      console.warn("font load failed", err);
    });
    return Promise.race([
      loads,
      new Promise(function (resolve) {
        setTimeout(resolve, FONT_WAIT_MS);
      }),
    ]);
  };

  // The screen stays hidden until its stylesheet, fonts and scripts are in: showing it sooner
  // flashed the bare, unstyled sign-in form and then the fonts and school name changing.
  var cssLoaded = new Promise(function (resolve, reject) {
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = base + screen.css;
    link.onload = resolve;
    link.onerror = function () {
      reject(new Error(screen.css + " failed to load"));
    };
    document.head.appendChild(link);
  });

  // No ".html": Cloudflare Pages answers x.html with a redirect to the extensionless path.
  var markup = fetch(base + screen.markup, { cache: "no-cache" }).then(function (res) {
    if (!res.ok) throw new Error(screen.markup + ": HTTP " + res.status);
    return res.text();
  });

  Promise.all([markup, cssLoaded.then(fontsLoaded)])
    .then(function (results) {
      document.body.style.visibility = "hidden";
      // Our own static markup from this site; it holds no user or server text.
      document.body.insertAdjacentHTML("afterbegin", results[0]);
      var files = ["api.js", "common.js"].concat(screen.scripts);
      files.forEach(function (file, i) {
        var script = document.createElement("script");
        script.src = base + file;
        script.async = false; // keep the order: each file needs the ones before it
        if (i === files.length - 1) script.onload = reveal;
        script.onerror = function () {
          fail(new Error(file + " failed to load"));
        };
        document.body.appendChild(script);
      });
    })
    .catch(fail);
})();
