/* collections.js — private collections loaded from a private GitHub repo.
 *
 * A "collection" is one folder under collections/<name>/ in a private repo
 * (default <username>/epiwen-private). Each folder holds ordinary Epiwen record
 * XML, referencing the SAME public authority IDs and biblio keys — so private
 * records resolve against the public reference layer without breaking anything.
 *
 * Privacy is enforced by GitHub: private content is fetched through the Contents
 * API with the logged-in user's PAT (EpiAuth.getUser().token). A token without
 * access to the repo gets 404/403, so anonymous / unauthorized visitors see
 * nothing private. The public deployment is unchanged for everyone else.
 *
 * This module only FETCHES raw XML + package metadata. Parsing, badge rendering
 * and merge into the catalog live in catalog.js (one parser, one merge point).
 *
 * Exposes window.EpiCollections:
 *   getConfig() / setConfig(c)
 *   getEnabled() / getEnabledCount()
 *   listPackages()  -> Promise<{ ok, code?, message?, packages:[{id,title}] }>
 *   loadEnabled()   -> Promise<{ records:[{name,xml,collection,collectionTitle}], errors:[] }>
 *   showManager()   -> opens the Collections manager modal
 *   onChange(fn)    -> register a callback fired when the enabled set changes
 */
(function () {
  "use strict";

  var LS = {
    owner:   "epiwen_private_owner",
    repo:    "epiwen_private_repo",
    branch:  "epiwen_private_branch",
    enabled: "epiwen_private_enabled",
    titles:  "epiwen_private_titles"
  };
  var DEFAULTS = { repo: "epiwen-private", branch: "main" };
  var MODAL_ID = "col-manager-modal";

  var _changeHandlers = [];

  // ── helpers ────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function token() {
    return (window.EpiAuth ? EpiAuth.getUser().token : "") ||
           localStorage.getItem("epiwen_gh_token") || "";
  }

  function defaultOwner() {
    return (window.EpiAuth ? EpiAuth.getUser().username : "") ||
           localStorage.getItem("epiwen_gh_username") || "";
  }

  function getConfig() {
    return {
      owner:  localStorage.getItem(LS.owner)  || defaultOwner(),
      repo:   localStorage.getItem(LS.repo)   || DEFAULTS.repo,
      branch: localStorage.getItem(LS.branch) || DEFAULTS.branch
    };
  }

  function setConfig(c) {
    if (c.owner  != null) localStorage.setItem(LS.owner,  c.owner);
    if (c.repo   != null) localStorage.setItem(LS.repo,   c.repo);
    if (c.branch != null) localStorage.setItem(LS.branch, c.branch);
  }

  function getEnabled() {
    try {
      var v = JSON.parse(localStorage.getItem(LS.enabled) || "[]");
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function setEnabled(arr) {
    localStorage.setItem(LS.enabled, JSON.stringify(arr || []));
  }
  function getEnabledCount() { return getEnabled().length; }

  function getTitleMap() {
    try { return JSON.parse(localStorage.getItem(LS.titles) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function setTitleMap(m) { localStorage.setItem(LS.titles, JSON.stringify(m || {})); }

  function onChange(fn) { if (typeof fn === "function") _changeHandlers.push(fn); }
  function fireChange() { _changeHandlers.forEach(function (fn) { try { fn(); } catch (e) {} }); }

  // ── GitHub Contents API ─────────────────────────────────────────────────────

  function apiUrl(path) {
    var c = getConfig();
    return "https://api.github.com/repos/" + c.owner + "/" + c.repo +
      "/contents/" + path + "?ref=" + encodeURIComponent(c.branch);
  }

  function headers(raw) {
    var h = {
      "Accept": raw ? "application/vnd.github.raw" : "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    var t = token();
    if (t) h["Authorization"] = "Bearer " + t;
    return h;
  }

  /* Fetch a single file's raw text via the Contents API (auth-aware). */
  function fetchFileRaw(path) {
    return fetch(apiUrl(path), { headers: headers(true) }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    });
  }

  /* Optional per-package metadata from collections/<id>/_package.json */
  function fetchPackageMeta(id) {
    return fetchFileRaw("collections/" + encodeURIComponent(id) + "/_package.json")
      .then(function (txt) { try { return JSON.parse(txt); } catch (e) { return null; } })
      .catch(function () { return null; });
  }

  /* List the package folders under collections/ */
  function listPackages() {
    if (!token()) return Promise.resolve({ ok: false, code: "no-token", packages: [] });

    return fetch(apiUrl("collections"), { headers: headers(false) })
      .then(function (r) {
        if (r.status === 404) return { ok: false, code: "not-found", packages: [] };
        if (r.status === 401) return { ok: false, code: "unauthorized", packages: [] };
        if (r.status === 403) return { ok: false, code: "forbidden", packages: [] };
        if (!r.ok) return { ok: false, code: "http-" + r.status, packages: [] };

        return r.json().then(function (entries) {
          if (!Array.isArray(entries)) return { ok: false, code: "not-a-dir", packages: [] };
          var dirs = entries.filter(function (e) { return e.type === "dir"; });
          return Promise.all(dirs.map(function (d) {
            return fetchPackageMeta(d.name).then(function (meta) {
              return { id: d.name, title: (meta && meta.title) || d.name };
            });
          })).then(function (packages) {
            packages.sort(function (a, b) { return a.id.localeCompare(b.id); });
            // cache titles for badge labels used by loadEnabled()
            var tm = {};
            packages.forEach(function (p) { tm[p.id] = p.title; });
            setTitleMap(tm);
            return { ok: true, packages: packages };
          });
        });
      })
      .catch(function (e) {
        return { ok: false, code: "network", message: e.message, packages: [] };
      });
  }

  /* Load every .xml record in collections/<id>/ (raw text; parsing is catalog.js) */
  function loadPackage(id) {
    return fetch(apiUrl("collections/" + encodeURIComponent(id)), { headers: headers(false) })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (entries) {
        if (!Array.isArray(entries)) return [];
        var xmlFiles = entries.filter(function (e) {
          return e.type === "file" && /\.xml$/i.test(e.name);
        });
        return Promise.all(xmlFiles.map(function (f) {
          return fetchFileRaw("collections/" + encodeURIComponent(id) + "/" + encodeURIComponent(f.name))
            .then(function (xml) { return { name: f.name, xml: xml, collection: id }; })
            .catch(function () { return null; });
        })).then(function (arr) { return arr.filter(Boolean); });
      });
  }

  /* Load all enabled packages, tag each record with collection + title. */
  function loadEnabled() {
    var enabled = getEnabled();
    if (!enabled.length) return Promise.resolve({ records: [], errors: [] });
    if (!token())        return Promise.resolve({ records: [], errors: [{ code: "no-token" }] });

    var titles = getTitleMap();
    var errors = [];

    return Promise.all(enabled.map(function (id) {
      return loadPackage(id)
        .then(function (recs) {
          recs.forEach(function (r) { r.collectionTitle = titles[id] || id; });
          return recs;
        })
        .catch(function (e) { errors.push({ id: id, message: e.message }); return []; });
    })).then(function (lists) {
      return { records: [].concat.apply([], lists), errors: errors };
    });
  }

  // ── Index loading for bibliography / authorities ─────────────────────────────
  // A package may carry collections/<pkg>/<kind>-index.json (same shape as the
  // app's public data/<kind>-index.json) plus the matching XML records. Returns
  // the merged private index entries (tagged), or [] for packages without one.
  function loadIndex(kind) {
    var enabled = getEnabled();
    if (!enabled.length || !token()) return Promise.resolve([]);
    var titles = getTitleMap();
    return Promise.all(enabled.map(function (id) {
      return fetchFileRaw("collections/" + encodeURIComponent(id) + "/" + kind + "-index.json")
        .then(function (txt) {
          var arr; try { arr = JSON.parse(txt); } catch (e) { return []; }
          if (!Array.isArray(arr)) return [];
          arr.forEach(function (e) {
            e.source = "private"; e.collection = id; e.collectionTitle = titles[id] || id;
          });
          return arr;
        })
        .catch(function () { return []; });   // 404 → package has no index of this kind
    })).then(function (lists) { return [].concat.apply([], lists); });
  }

  // Fetch a record XML from inside a package (for private detail panes).
  function fetchRecordXml(pkg, relPath) {
    return fetchFileRaw("collections/" + encodeURIComponent(pkg) + "/" + relPath.replace(/^\/+/, ""));
  }

  // ── Prominent collections bar (load/unload toggles) ──────────────────────────
  // Renders a checkbox per discovered package into `el`; ticking enables+loads,
  // unticking disables+unloads (fires onChange listeners). Shared by the catalog,
  // authorities and bibliography pages.
  function mountBar(el) {
    if (!el) return;
    if (!token()) { el.style.display = "none"; return; }
    el.style.display = "";
    var c = getConfig();

    function chip(p, on) {
      return '<label class="col-chip' + (on ? " on" : "") + '">' +
        '<input type="checkbox" value="' + esc(p.id) + '"' + (on ? " checked" : "") + '>' +
        '<span>🔒 ' + esc(p.title) + '</span></label>';
    }
    function wire() {
      Array.prototype.forEach.call(el.querySelectorAll(".col-chip input"), function (cb) {
        cb.addEventListener("change", function () {
          var en = getEnabled();
          if (cb.checked) { if (en.indexOf(cb.value) === -1) en.push(cb.value); }
          else { en = en.filter(function (x) { return x !== cb.value; }); }
          setEnabled(en);
          var lbl = cb.parentNode; if (lbl) lbl.classList.toggle("on", cb.checked);
          fireChange();
        });
      });
      var cfg = el.querySelector(".col-config");
      if (cfg) cfg.addEventListener("click", showManager);
    }
    function render(packages, msg) {
      var enabled = getEnabled();
      var chips = packages.map(function (p) { return chip(p, enabled.indexOf(p.id) !== -1); }).join("");
      el.innerHTML =
        '<span class="collections-bar-label">🔒 Private collections</span>' +
        (chips || '<span class="collections-bar-empty">' + esc(msg || ("none in " + c.owner + "/" + c.repo)) + '</span>') +
        '<button class="col-config btn small" title="Configure collections" aria-label="Configure">⚙</button>';
      wire();
    }

    if (!c.owner || !c.repo) {
      el.innerHTML = '<span class="collections-bar-label">🔒 Private collections</span>' +
        '<button class="col-config btn small">Set up…</button>';
      el.querySelector(".col-config").addEventListener("click", showManager);
      return;
    }

    // Instant paint from cached titles, then refresh from the API.
    var cached = getTitleMap();
    var cachedPkgs = Object.keys(cached).map(function (id) { return { id: id, title: cached[id] }; });
    if (cachedPkgs.length) render(cachedPkgs);
    else el.innerHTML = '<span class="collections-bar-label">🔒 Private collections</span>' +
      '<span class="collections-bar-empty">loading…</span>';

    listPackages().then(function (res) {
      if (res.ok) render(res.packages);
      else if (!cachedPkgs.length) render([], codeToMessage(res));
    });
  }

  // ── Manager modal ───────────────────────────────────────────────────────────

  function codeToMessage(res) {
    var c = getConfig();
    switch (res.code) {
      case "no-token":     return "Sign in with a GitHub token first.";
      case "not-found":    return "No repo (or no collections/ folder) at " + c.owner + "/" + c.repo + ".";
      case "unauthorized": return "Token rejected — it may be expired or lack repo scope.";
      case "forbidden":    return "Your token cannot access " + c.owner + "/" + c.repo + ".";
      case "network":      return "Network error: " + (res.message || "unreachable") + ".";
      default:             return res.code ? ("Could not list packages (" + res.code + ").") : "";
    }
  }

  function buildModalHtml() {
    var c = getConfig();
    return '<div id="' + MODAL_ID + '" class="modal-overlay" hidden' +
        ' role="dialog" aria-modal="true" aria-labelledby="col-modal-heading">' +
      '<div class="modal-box" style="max-width:520px">' +
        '<button class="modal-close" id="col-modal-close" aria-label="Close">&#x2715;</button>' +
        '<h2 id="col-modal-heading" class="modal-title">Private collections</h2>' +
        '<p class="modal-desc">Load named packages of records from a private repo. ' +
          'Records stay visible only to tokens with access — others get a 404. ' +
          'Layout: <code>collections/&lt;name&gt;/*.xml</code>.</p>' +
        '<div class="gh-form">' +
          '<label class="gh-label">Owner / org' +
            '<input type="text" id="col-owner" class="gh-input" value="' + esc(c.owner) + '" placeholder="your-github-username"/>' +
          '</label>' +
          '<label class="gh-label">Repository' +
            '<input type="text" id="col-repo" class="gh-input" value="' + esc(c.repo) + '"/>' +
          '</label>' +
          '<label class="gh-label">Branch' +
            '<input type="text" id="col-branch" class="gh-input" value="' + esc(c.branch) + '"/>' +
          '</label>' +
        '</div>' +
        '<div class="gh-actions" style="margin-bottom:0.8rem">' +
          '<button class="btn small" id="col-refresh">Find packages</button>' +
        '</div>' +
        '<div id="col-status" class="col-status"></div>' +
        '<div id="col-pkg-list" class="col-pkg-list"></div>' +
        '<div class="gh-actions">' +
          '<button class="btn primary" id="col-save">Save &amp; load</button>' +
          '<button class="btn" id="col-cancel">Cancel</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  var _injected = false;
  function injectModal() {
    if (_injected) return;
    _injected = true;
    var d = document.createElement("div");
    d.innerHTML = buildModalHtml();
    document.body.appendChild(d.firstElementChild);

    document.getElementById("col-modal-close").addEventListener("click", hideManager);
    document.getElementById("col-cancel").addEventListener("click", hideManager);
    document.getElementById(MODAL_ID).addEventListener("click", function (e) {
      if (e.target === this) hideManager();
    });
    document.getElementById("col-refresh").addEventListener("click", function () {
      // persist the typed owner/repo/branch before listing
      setConfig({
        owner:  document.getElementById("col-owner").value.trim(),
        repo:   document.getElementById("col-repo").value.trim(),
        branch: document.getElementById("col-branch").value.trim()
      });
      refreshList();
    });
    document.getElementById("col-save").addEventListener("click", function () {
      setConfig({
        owner:  document.getElementById("col-owner").value.trim(),
        repo:   document.getElementById("col-repo").value.trim(),
        branch: document.getElementById("col-branch").value.trim()
      });
      var checked = Array.prototype.map.call(
        document.querySelectorAll("#col-pkg-list input[type=checkbox]:checked"),
        function (cb) { return cb.value; }
      );
      setEnabled(checked);
      hideManager();
      fireChange();
    });
  }

  function setStatus(msg, isErr) {
    var el = document.getElementById("col-status");
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = isErr ? "var(--bad)" : "var(--muted)";
  }

  function renderPackages(packages) {
    var enabled = getEnabled();
    var list = document.getElementById("col-pkg-list");
    if (!list) return;
    if (!packages.length) {
      list.innerHTML = '<div class="col-status">No packages found under collections/.</div>';
      return;
    }
    list.innerHTML = packages.map(function (p) {
      var on = enabled.indexOf(p.id) !== -1;
      return '<label class="col-pkg">' +
        '<input type="checkbox" value="' + esc(p.id) + '"' + (on ? " checked" : "") + ">" +
        '<span>' + esc(p.title) + "</span>" +
        (p.title !== p.id ? ' <code>' + esc(p.id) + "</code>" : "") +
      '</label>';
    }).join("");
  }

  function refreshList() {
    setStatus("Searching…");
    document.getElementById("col-pkg-list").innerHTML = "";
    return listPackages().then(function (res) {
      if (!res.ok) { setStatus(codeToMessage(res), true); return; }
      setStatus(res.packages.length + " package" + (res.packages.length === 1 ? "" : "s") + " found.");
      renderPackages(res.packages);
    });
  }

  function showManager() {
    injectModal();
    // refresh field values from stored config
    var c = getConfig();
    document.getElementById("col-owner").value  = c.owner;
    document.getElementById("col-repo").value   = c.repo;
    document.getElementById("col-branch").value = c.branch;
    setStatus("");
    document.getElementById("col-pkg-list").innerHTML = "";
    document.getElementById(MODAL_ID).hidden = false;
    document.body.style.overflow = "hidden";
    // auto-discover if we have a token + owner
    if (token() && c.owner) refreshList();
    else if (!token()) setStatus("Sign in with a GitHub token first.", true);
  }

  function hideManager() {
    var el = document.getElementById(MODAL_ID);
    if (el) el.hidden = true;
    document.body.style.overflow = "";
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") hideManager();
  });

  window.EpiCollections = {
    getConfig:       getConfig,
    setConfig:       setConfig,
    getEnabled:      getEnabled,
    getEnabledCount: getEnabledCount,
    getTitleMap:     getTitleMap,
    listPackages:    listPackages,
    loadPackage:     loadPackage,
    loadEnabled:     loadEnabled,
    loadIndex:       loadIndex,
    fetchRecordXml:  fetchRecordXml,
    mountBar:        mountBar,
    showManager:     showManager,
    hideManager:     hideManager,
    onChange:        onChange
  };
})();
