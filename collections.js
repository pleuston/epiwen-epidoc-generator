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

  function b64(str) { return btoa(unescape(encodeURIComponent(str))); }

  function contentsUrl(path) {  // PUT target — branch goes in the body, no ?ref
    var c = getConfig();
    return "https://api.github.com/repos/" + c.owner + "/" + c.repo + "/contents/" + path;
  }

  /* List the signed-in user's own repositories (for the connect selector). */
  function listUserRepos() {
    if (!token()) return Promise.resolve({ ok: false, code: "no-token", repos: [] });
    return fetch("https://api.github.com/user/repos?per_page=100&affiliation=owner&sort=pushed",
        { headers: headers(false) })
      .then(function (r) {
        if (!r.ok) return { ok: false, code: "http-" + r.status, repos: [] };
        return r.json().then(function (list) {
          return { ok: true, repos: (list || []).map(function (x) {
            return { name: x.name, owner: x.owner ? x.owner.login : "", private: x.private };
          }) };
        });
      })
      .catch(function (e) { return { ok: false, code: "network", message: e.message, repos: [] }; });
  }

  /* Create a new collection (package) by writing collections/<name>/_package.json. */
  function createPackage(name, title) {
    var c = getConfig();
    var path = "collections/" + name.replace(/^\/+|\/+$/g, "") + "/_package.json";
    var content = b64(JSON.stringify({ title: title || name }, null, 2) + "\n");
    return fetch(contentsUrl(path), {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, headers(false)),
      body: JSON.stringify({ message: "Add collection: " + name, content: content, branch: c.branch })
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (e) { throw new Error(e.message || ("HTTP " + r.status)); });
      return r.json();
    });
  }

  /* Create a new private repository to hold collections. Returns the repo name. */
  function createRepo(name) {
    return fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, headers(false)),
      body: JSON.stringify({ name: name, private: true, auto_init: true,
        description: "Epiwen private record collections" })
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (e) { throw new Error(e.message || ("HTTP " + r.status)); });
      return r.json();
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

    function pkgsFromCache() {
      var t = getTitleMap();
      return Object.keys(t).map(function (id) { return { id: id, title: t[id] }; })
        .sort(function (a, b) { return a.id.localeCompare(b.id); });
    }
    // Always-present action buttons: dedicated "Add collection" + config gear.
    var ACTIONS =
      '<button class="col-add btn small" type="button">＋ Add collection</button>' +
      '<button class="col-config btn small" title="Configure collections" aria-label="Configure">⚙</button>';

    function render(packages, msg) {
      var enabled = getEnabled();
      var chips = packages.map(function (p) {
        var on = enabled.indexOf(p.id) !== -1;
        return '<label class="col-chip' + (on ? " on" : "") + '">' +
          '<input type="checkbox" value="' + esc(p.id) + '"' + (on ? " checked" : "") + '>' +
          '<span>🔒 ' + esc(p.title) + '</span></label>';
      }).join("");
      el.innerHTML =
        '<span class="collections-bar-label">🔒 Private collections</span>' +
        (chips || '<span class="collections-bar-empty">' + esc(msg || "none yet — add one →") + '</span>') +
        ACTIONS;
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
      el.querySelector(".col-add").addEventListener("click", function () { showManager(true); });
      el.querySelector(".col-config").addEventListener("click", function () { showManager(false); });
    }

    var c = getConfig();
    if (!c.owner || !c.repo) { render([], "set a repo to begin →"); }
    else {
      var cached = pkgsFromCache();
      render(cached, "loading…");
      listPackages().then(function (res) {
        if (res.ok) render(res.packages);
        else if (!cached.length) render([], codeToMessage(res));
      });
    }

    // Re-paint when collections change (toggled or newly added) — cache-based, no network.
    if (!el._barBound) {
      el._barBound = true;
      onChange(function () { render(pkgsFromCache()); });
    }
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
            '<select id="col-repo" class="gh-input"></select>' +
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
        '<div class="col-newpkg">' +
          '<div class="col-newpkg-title">＋ New collection in this repo</div>' +
          '<div class="col-newpkg-row">' +
            '<input type="text" id="col-new-name" class="gh-input" placeholder="folder-name (e.g. fieldwork-2027)"/>' +
            '<input type="text" id="col-new-title" class="gh-input" placeholder="Display title (optional)"/>' +
            '<button class="btn small" id="col-new-create" type="button">Create</button>' +
          '</div>' +
        '</div>' +
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

    // Repository selector — pick a discovered repo, enter another, or create one.
    document.getElementById("col-repo").addEventListener("change", function () {
      var v = this.value;
      var owner = document.getElementById("col-owner").value.trim();
      if (v === "__manual__") {
        var nm = (window.prompt("Repository name (under owner '" + owner + "'):") || "").trim();
        if (nm) { setConfig({ owner: owner, repo: nm }); populateRepoSelect(nm); refreshList(); }
        else populateRepoSelect(getConfig().repo);
        return;
      }
      if (v === "__new__") {
        var nn = (window.prompt("Name for the new private collections repo:", "epiwen-private") || "").trim();
        if (!nn) { populateRepoSelect(getConfig().repo); return; }
        setStatus("Creating private repository " + nn + "…");
        createRepo(nn).then(function (repo) {
          setConfig({ owner: (repo.owner && repo.owner.login) || owner, repo: repo.name });
          document.getElementById("col-owner").value = getConfig().owner;
          setStatus("Created " + (repo.full_name || repo.name) + ".");
          populateRepoSelect(repo.name);
          refreshList();
        }).catch(function (e) {
          setStatus("Could not create repo: " + e.message + " (token needs repo scope).", true);
          populateRepoSelect(getConfig().repo);
        });
        return;
      }
      setConfig({ owner: owner, repo: v });
      refreshList();
    });

    // Create a new collection (package) in the selected repo.
    document.getElementById("col-new-create").addEventListener("click", function () {
      var name  = (document.getElementById("col-new-name").value || "").trim();
      var title = (document.getElementById("col-new-title").value || "").trim();
      if (!name) { setStatus("Enter a folder name for the new collection.", true); return; }
      if (!/^[A-Za-z0-9._-]+$/.test(name)) {
        setStatus("Folder name: letters, numbers, dashes or underscores only.", true); return;
      }
      setConfig({
        owner:  document.getElementById("col-owner").value.trim(),
        repo:   document.getElementById("col-repo").value.trim(),
        branch: document.getElementById("col-branch").value.trim()
      });
      setStatus("Creating collection " + name + "…");
      createPackage(name, title).then(function () {
        document.getElementById("col-new-name").value = "";
        document.getElementById("col-new-title").value = "";
        var tm = getTitleMap(); tm[name] = title || name; setTitleMap(tm);
        var en = getEnabled(); if (en.indexOf(name) === -1) { en.push(name); setEnabled(en); }
        setStatus("Created collection “" + (title || name) + "”.");
        refreshList();
      }).catch(function (e) {
        setStatus("Could not create collection: " + e.message + " (token needs repo scope).", true);
      });
    });
  }

  // Populate the repository <select> with the user's repos + create options.
  function populateRepoSelect(selected) {
    var sel = document.getElementById("col-repo");
    if (!sel) return;
    selected = selected || getConfig().repo;
    function paint(list) {
      var seen = {}, html = "";
      if (selected) { html += '<option value="' + esc(selected) + '">' + esc(selected) + '</option>'; seen[selected] = 1; }
      list.forEach(function (r) {
        if (seen[r.name]) return; seen[r.name] = 1;
        html += '<option value="' + esc(r.name) + '">' + esc(r.name) + (r.private ? " 🔒" : "") + '</option>';
      });
      html += '<option value="__manual__">— enter another repo…</option>';
      html += '<option value="__new__">＋ Create new private repo…</option>';
      sel.innerHTML = html;
      sel.value = selected;
    }
    paint([]);  // immediate paint with the current value
    listUserRepos().then(function (res) { if (res.ok) paint(res.repos); });
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

  function showManager(focusCreate) {
    injectModal();
    // refresh field values from stored config
    var c = getConfig();
    document.getElementById("col-owner").value  = c.owner;
    document.getElementById("col-branch").value = c.branch;
    populateRepoSelect(c.repo);
    setStatus("");
    document.getElementById("col-pkg-list").innerHTML = "";
    document.getElementById(MODAL_ID).hidden = false;
    document.body.style.overflow = "hidden";
    // auto-discover if we have a token + owner
    if (token() && c.owner) refreshList();
    else if (!token()) setStatus("Sign in with a GitHub token first.", true);
    if (focusCreate) {
      var f = document.getElementById("col-new-name");
      if (f) { try { f.scrollIntoView({ block: "center" }); } catch (e) {} f.focus(); }
    }
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
    listUserRepos:   listUserRepos,
    createPackage:   createPackage,
    createRepo:      createRepo,
    showManager:     showManager,
    hideManager:     hideManager,
    onChange:        onChange
  };
})();
