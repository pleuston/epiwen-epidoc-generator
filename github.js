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
    repo:   "epiwen-epidoc-generator",
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

  // ---- Settings modal --------------------------------------------------------

  function buildModalHtml(s) {
    return '<div id="' + MODAL_ID + '" class="modal-overlay" hidden' +
        ' role="dialog" aria-modal="true" aria-labelledby="gh-modal-heading">' +
      '<div class="modal-box" style="max-width:480px">' +
        '<button class="modal-close" id="gh-modal-close" aria-label="Close">&#x2715;</button>' +
        '<h2 id="gh-modal-heading" class="modal-title">GitHub save settings</h2>' +
        '<p class="modal-desc">Generate a <a href="https://github.com/settings/tokens/new?scopes=repo&amp;description=Epiwen" target="_blank" rel="noopener">personal access token</a> (classic, <code>repo</code> scope). Stored only in this browser — never transmitted elsewhere.</p>' +
        '<div class="gh-form">' +
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

  function toast(msg, isErr) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.className = "show" + (isErr ? " toast-error" : "");
    setTimeout(function () { el.className = ""; }, isErr ? 6000 : 3000);
  }

  function save(xml, filename, onDone) {
    if (!filename) { toast("Set a filename before saving", true); return; }
    if (!xml)      { toast("Nothing to save — fill the form first", true); return; }

    var s = getSettings();
    if (!s.token) { showSettings(); return; }

    filename = filename.replace(/\.xml$/i, "") + ".xml";
    var filePath = s.path.replace(/\/+$/, "") + "/" + filename;
    var apiUrl   = "https://api.github.com/repos/" + s.owner + "/" + s.repo + "/contents/" + filePath;
    var headers  = {
      "Authorization":        "Bearer " + s.token,
      "Accept":               "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };

    setBtnState(true);
    var isNew = true;

    // GET first to retrieve SHA (needed to update an existing file)
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
      .then(function () {
        toast((isNew ? "Added" : "Updated") + ": " + filename);
        setBtnState(false);
        if (onDone) onDone();
      })
      .catch(function (err) {
        toast("GitHub error: " + err.message, true);
        setBtnState(false);
      });
  }

  // Close settings modal on Escape
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") hideSettings();
  });

  window.EpiGitHub = {
    save:         save,
    showSettings: showSettings,
    hideSettings: hideSettings,
    hasToken:     hasToken
  };
})();
