/* github.js — direct save to GitHub via Contents API.
 * Provides EpiGitHub.save(xml, filename) and EpiGitHub.showSettings().
 * Settings (PAT, owner, repo, branch, path) live in localStorage.
 * The token is stored client-side only and never sent anywhere except
 * the GitHub API endpoint in the fetch call below. */
(function () {
  "use strict";

  var MODAL_ID = "gh-settings-modal";
  var LS = {
    token:  "epiwen_gh_token",
    owner:  "epiwen_gh_owner",
    repo:   "epiwen_gh_repo",
    branch: "epiwen_gh_branch",
    path:   "epiwen_gh_path"
  };
  var DEFAULTS = {
    owner:  "pleuston",
    repo:   "epiwen-data",
    branch: "main",
    path:   "records/"
  };

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function getSettings() {
    return {
      token:  localStorage.getItem(LS.token)  || "",
      owner:  localStorage.getItem(LS.owner)  || DEFAULTS.owner,
      repo:   localStorage.getItem(LS.repo)   || DEFAULTS.repo,
      branch: localStorage.getItem(LS.branch) || DEFAULTS.branch,
      path:   localStorage.getItem(LS.path)   || DEFAULTS.path
    };
  }

  function putSettings(s) {
    Object.keys(LS).forEach(function (k) { localStorage.setItem(LS[k], s[k]); });
  }

  function hasToken() { return !!localStorage.getItem(LS.token); }

  // ---- save-target override --------------------------------------------------
  // When set (e.g. editing a record loaded from a private collection), saves go
  // to this owner/repo/branch/path instead of the stored defaults. The token is
  // always taken from the stored settings. null → default public behaviour.
  var _target = null;

  function effectiveSettings() {
    var s = getSettings();
    if (_target) {
      if (_target.owner)  s.owner  = _target.owner;
      if (_target.repo)   s.repo   = _target.repo;
      if (_target.branch) s.branch = _target.branch;
      if (_target.path)   s.path   = _target.path;
    }
    return s;
  }

  function refreshTargetUI() {
    var el = document.getElementById("save-target");
    if (!el) return;
    var s = effectiveSettings();
    el.textContent = s.owner + "/" + s.repo + " · " + (s.path || "records/");
    el.classList.toggle("save-target-private", !!_target);
    el.title = _target
      ? "Saving back into the private collection this record came from"
      : "Default save destination";
  }

  function setTarget(t)  { _target = t || null; refreshTargetUI(); }
  function clearTarget() { _target = null; refreshTargetUI(); }
  function getTarget()   { return _target; }

  document.addEventListener("DOMContentLoaded", refreshTargetUI);

  // ---- Settings modal --------------------------------------------------------

  function buildModalHtml(s) {
    return '<div id="' + MODAL_ID + '" class="modal-overlay" hidden' +
        ' role="dialog" aria-modal="true" aria-labelledby="gh-modal-heading">' +
      '<div class="modal-box" style="max-width:480px">' +
        '<button class="modal-close" id="gh-modal-close" aria-label="Close">&#x2715;</button>' +
        '<h2 id="gh-modal-heading" class="modal-title">GitHub save settings</h2>' +
        '<p class="modal-desc">Generate a <a href="https://github.com/settings/tokens/new?scopes=repo&amp;description=Epiwen" target="_blank" rel="noopener">personal access token</a> (classic, <code>repo</code> scope). Stored only in this browser — never transmitted elsewhere.</p>' +
        '<div class="gh-form">' +
          '<label class="gh-label" id="gh-s-collection-wrap" style="display:none">Save into' +
            '<select id="gh-s-collection" class="gh-input"></select>' +
          '</label>' +
          '<label class="gh-label">Token' +
            '<input type="password" id="gh-s-token" class="gh-input" autocomplete="off"' +
            ' value="' + esc(s.token) + '" placeholder="github_pat_…"/>' +
          '</label>' +
          '<label class="gh-label">Owner / org' +
            '<input type="text" id="gh-s-owner" class="gh-input" value="' + esc(s.owner) + '"/>' +
          '</label>' +
          '<label class="gh-label">Repository' +
            '<input type="text" id="gh-s-repo" class="gh-input" value="' + esc(s.repo) + '"/>' +
          '</label>' +
          '<label class="gh-label">Branch' +
            '<input type="text" id="gh-s-branch" class="gh-input" value="' + esc(s.branch) + '"/>' +
          '</label>' +
          '<label class="gh-label">Records path' +
            '<input type="text" id="gh-s-path" class="gh-input"' +
            ' value="' + esc(s.path) + '" placeholder="records/"/>' +
          '</label>' +
        '</div>' +
        '<div class="gh-actions">' +
          '<button class="btn primary" id="gh-s-save">Save</button>' +
          '<button class="btn" id="gh-s-cancel">Cancel</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  var _injected = false;
  function injectModal() {
    if (_injected) return;
    _injected = true;
    var d = document.createElement("div");
    d.innerHTML = buildModalHtml(getSettings());
    document.body.appendChild(d.firstElementChild);

    document.getElementById("gh-modal-close").addEventListener("click", hideSettings);
    document.getElementById("gh-s-cancel").addEventListener("click", hideSettings);
    document.getElementById("gh-s-save").addEventListener("click", function () {
      putSettings({
        token:  document.getElementById("gh-s-token").value.trim(),
        owner:  document.getElementById("gh-s-owner").value.trim(),
        repo:   document.getElementById("gh-s-repo").value.trim(),
        branch: document.getElementById("gh-s-branch").value.trim(),
        path:   document.getElementById("gh-s-path").value.trim()
      });
      hideSettings();
      toast("Settings saved");
    });
    document.getElementById(MODAL_ID).addEventListener("click", function (e) {
      if (e.target === this) hideSettings();
    });
    var picker = document.getElementById("gh-s-collection");
    if (picker) picker.addEventListener("change", function () { applyCollectionChoice(this.value); });
  }

  // Fill owner/repo/branch/path fields from the chosen destination.
  function applyCollectionChoice(value) {
    if (value === "public") {
      document.getElementById("gh-s-owner").value  = DEFAULTS.owner;
      document.getElementById("gh-s-repo").value   = DEFAULTS.repo;
      document.getElementById("gh-s-branch").value = DEFAULTS.branch;
      document.getElementById("gh-s-path").value   = DEFAULTS.path;
    } else if (value.indexOf("col:") === 0 && window.EpiCollections) {
      var id = value.slice(4);
      var c  = EpiCollections.getConfig();
      document.getElementById("gh-s-owner").value  = c.owner;
      document.getElementById("gh-s-repo").value   = c.repo;
      document.getElementById("gh-s-branch").value = c.branch;
      document.getElementById("gh-s-path").value   = "collections/" + id + "/";
    }
  }

  // Populate the "Save into" picker from enabled private collections (no network).
  function populateCollectionPicker() {
    var wrap = document.getElementById("gh-s-collection-wrap");
    var sel  = document.getElementById("gh-s-collection");
    if (!wrap || !sel) return;
    var enabled = window.EpiCollections ? EpiCollections.getEnabled() : [];
    if (!enabled.length) { wrap.style.display = "none"; return; }

    var titles = EpiCollections.getTitleMap ? EpiCollections.getTitleMap() : {};
    var c      = EpiCollections.getConfig();
    var opts   = '<option value="public">Public · ' + esc(DEFAULTS.repo) + ' / ' + esc(DEFAULTS.path) + '</option>';
    enabled.forEach(function (id) {
      opts += '<option value="col:' + esc(id) + '">🔒 ' + esc(titles[id] || id) +
              ' · ' + esc(c.repo) + '</option>';
    });
    sel.innerHTML = opts;
    wrap.style.display = "";

    // Reflect the current destination if it already points at a collection.
    var cur = effectiveSettings();
    var match = "public";
    enabled.forEach(function (id) {
      if (cur.repo === c.repo && (cur.path || "").replace(/^\/+/, "") === ("collections/" + id + "/")) {
        match = "col:" + id;
      }
    });
    sel.value = match;
  }

  function showSettings() {
    injectModal();
    // Refresh fields with current stored values
    var s = getSettings();
    document.getElementById("gh-s-token").value  = s.token;
    document.getElementById("gh-s-owner").value  = s.owner;
    document.getElementById("gh-s-repo").value   = s.repo;
    document.getElementById("gh-s-branch").value = s.branch;
    document.getElementById("gh-s-path").value   = s.path;
    populateCollectionPicker();
    document.getElementById(MODAL_ID).hidden = false;
    document.body.style.overflow = "hidden";
    document.getElementById("gh-s-token").focus();
  }

  function hideSettings() {
    var el = document.getElementById(MODAL_ID);
    if (el) el.hidden = true;
    document.body.style.overflow = "";
  }

  // ---- GitHub Contents API save ----------------------------------------------

  function b64(str) {
    // Encode to UTF-8 bytes then base64
    return btoa(unescape(encodeURIComponent(str)));
  }

  function setBtnState(busy) {
    var btn = document.getElementById("btn-save-github");
    if (!btn) return;
    btn.disabled = busy;
    btn.textContent = busy ? "Saving…" : "② Save to GitHub";
  }

  // For a collections/<pkg>/<file> path, return { pkg, file }; else null. Used to
  // keep that package's records-index current after a save/delete.
  function collectionOf(relPath) {
    var m = String(relPath).match(/^collections\/([^/]+)\/(.+)$/);
    return m ? { pkg: m[1], file: m[2].split("/").pop() } : null;
  }
  function syncIndexOnSave(relPath, xml) {
    var c = collectionOf(relPath);
    if (!c || !window.EpiCollections || !EpiCollections.recordsIndexUpsert) return Promise.resolve();
    return EpiCollections.recordsIndexUpsert(c.pkg, c.file, xml)
      .catch(function (e) { toast("Saved — but index update failed: " + e.message, true); });
  }
  function syncIndexOnDelete(relPath) {
    var c = collectionOf(relPath);
    if (!c || !window.EpiCollections || !EpiCollections.recordsIndexRemove) return Promise.resolve();
    return EpiCollections.recordsIndexRemove(c.pkg, c.file)
      .catch(function (e) { toast("Deleted — but index update failed: " + e.message, true); });
  }

  function toast(msg, isErr) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.className = "show" + (isErr ? " toast-error" : "");
    setTimeout(function () { el.className = ""; }, isErr ? 6000 : 3000);
  }

  function saveAt(xml, relPath, onDone) {
    if (!relPath) { toast("Set a file path before saving", true); return; }
    if (!xml)     { toast("Nothing to save — fill the form first", true); return; }

    var s = effectiveSettings();
    if (!s.token) { showSettings(); return; }

    relPath = relPath.replace(/^\/+/, "");
    var filename = relPath.split("/").pop();
    var apiUrl   = "https://api.github.com/repos/" + s.owner + "/" + s.repo + "/contents/" + relPath;
    var headers  = {
      "Authorization":        "Bearer " + s.token,
      "Accept":               "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };

    setBtnState(true);
    var isNew = true;

    fetch(apiUrl, { headers: headers })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (existing) {
        isNew = !existing;
        var body = {
          message: (existing ? "Update" : "Add") + " record: " + filename,
          content: b64(xml),
          branch:  s.branch
        };
        if (existing && existing.sha) body.sha = existing.sha;
        return fetch(apiUrl, {
          method: "PUT",
          headers: Object.assign({ "Content-Type": "application/json" }, headers),
          body: JSON.stringify(body)
        });
      })
      .then(function (r) {
        if (!r.ok) {
          return r.json().then(function (e) {
            throw new Error(e.message || "HTTP " + r.status);
          });
        }
        return r.json();
      })
      .then(function () { return syncIndexOnSave(relPath, xml); })
      .then(function () {
        toast((isNew ? "Added" : "Updated") + ": " + filename);
        try { sessionStorage.setItem("epiwen_fresh:" + filename, xml); } catch (e) {}
        setBtnState(false);
        if (onDone) onDone();
      })
      .catch(function (err) {
        toast("GitHub error: " + err.message, true);
        setBtnState(false);
      });
  }

  function save(xml, filename, onDone) {
    if (!filename) { toast("Set a filename before saving", true); return; }
    if (!xml)      { toast("Nothing to save — fill the form first", true); return; }
    var s = effectiveSettings();
    if (!s.token) { showSettings(); return; }
    filename = filename.replace(/\.xml$/i, "") + ".xml";
    var filePath = s.path.replace(/\/+$/, "") + "/" + filename;
    saveAt(xml, filePath, onDone);
  }

  // Delete a file at an explicit repo-relative path (GET its sha, then DELETE).
  // Targets the same destination as saveAt (effectiveSettings + any write target).
  function deleteAt(relPath, onDone) {
    if (!relPath) { toast("No file path to delete", true); return; }
    var s = effectiveSettings();
    if (!s.token) { showSettings(); return; }

    relPath = relPath.replace(/^\/+/, "");
    var filename = relPath.split("/").pop();
    var apiUrl   = "https://api.github.com/repos/" + s.owner + "/" + s.repo + "/contents/" + relPath;
    var headers  = {
      "Authorization":        "Bearer " + s.token,
      "Accept":               "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };

    setBtnState(true);
    fetch(apiUrl + "?ref=" + encodeURIComponent(s.branch), { headers: headers })
      .then(function (r) {
        if (r.status === 404) throw new Error("File not found on GitHub (nothing to delete).");
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (existing) {
        return fetch(apiUrl, {
          method:  "DELETE",
          headers: Object.assign({ "Content-Type": "application/json" }, headers),
          body:    JSON.stringify({ message: "Delete record: " + filename, sha: existing.sha, branch: s.branch })
        });
      })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (e) { throw new Error(e.message || "HTTP " + r.status); });
        return r.json();
      })
      .then(function () { return syncIndexOnDelete(relPath); })
      .then(function () {
        toast("Deleted: " + filename);
        setBtnState(false);
        if (onDone) onDone();
      })
      .catch(function (err) {
        toast("GitHub error: " + err.message, true);
        setBtnState(false);
      });
  }

  function del(filename, onDone) {
    if (!filename) { toast("No filename to delete", true); return; }
    var s = effectiveSettings();
    if (!s.token) { showSettings(); return; }
    filename = filename.replace(/\.xml$/i, "") + ".xml";
    deleteAt(s.path.replace(/\/+$/, "") + "/" + filename, onDone);
  }

  // Close settings modal on Escape
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") hideSettings();
  });

  window.EpiGitHub = {
    save:            save,
    saveAt:          saveAt,
    del:             del,
    deleteAt:        deleteAt,
    showSettings:    showSettings,
    hideSettings:    hideSettings,
    hasToken:        hasToken,
    setTarget:       setTarget,
    clearTarget:     clearTarget,
    getTarget:       getTarget,
    refreshTargetUI: refreshTargetUI
  };
})();
