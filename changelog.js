/* changelog.js — GitHub commit log for the Epiwen platform.
 * Reads owner/repo/token from the same localStorage keys as github.js.
 * Exports window.EpiChangelog with fetchXML(), fetchAll(), timeAgo(). */
(function () {
  "use strict";

  var LS = {
    token: "epiwen_gh_token", owner: "epiwen_gh_owner",
    repo: "epiwen_gh_repo",  branch: "epiwen_gh_branch"
  };
  var DEF = { owner: "pleuston", repo: "epiwen-data", branch: "main" };

  function cfg() {
    return {
      token:  localStorage.getItem(LS.token)  || "",
      owner:  localStorage.getItem(LS.owner)  || DEF.owner,
      repo:   localStorage.getItem(LS.repo)   || DEF.repo,
      branch: localStorage.getItem(LS.branch) || DEF.branch
    };
  }

  function ghHeaders(token) {
    var h = { "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (token) h["Authorization"] = "Bearer " + token;
    return h;
  }

  function commitsUrl(c, path, n) {
    return "https://api.github.com/repos/" + c.owner + "/" + c.repo +
      "/commits?sha=" + encodeURIComponent(c.branch) +
      "&per_page=" + (n || 100) +
      (path ? "&path=" + encodeURIComponent(path) : "");
  }

  function ghFetch(url, token) {
    return fetch(url, { headers: ghHeaders(token) })
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; });
  }

  function mergeDedup(arrays) {
    var seen = {}, out = [];
    [].concat.apply([], arrays).forEach(function (c) {
      if (!seen[c.sha]) { seen[c.sha] = true; out.push(c); }
    });
    return out.sort(function (a, b) {
      return new Date(b.commit.author.date) - new Date(a.commit.author.date);
    });
  }

  function timeAgo(iso) {
    var s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60)       return "just now";
    if (s < 3600)     return Math.floor(s / 60) + " min ago";
    if (s < 86400)    return Math.floor(s / 3600) + " hr ago";
    if (s < 86400*30) return Math.floor(s / 86400) + " d ago";
    return new Date(iso).toISOString().slice(0, 10);
  }

  /* Commits touching XML data directories */
  function fetchXML(limit) {
    var c = cfg();
    var dirs = ["records", "catalog", "authority", "biblio"];
    return Promise.all(dirs.map(function (d) { return ghFetch(commitsUrl(c, d, 100), c.token); }))
      .then(mergeDedup)
      .then(function (all) { return limit ? all.slice(0, limit) : all; });
  }

  /* All commits in the repo */
  function fetchAll(limit) {
    var c = cfg();
    return ghFetch(commitsUrl(c, "", limit || 200), c.token);
  }

  window.EpiChangelog = { fetchXML: fetchXML, fetchAll: fetchAll, timeAgo: timeAgo, cfg: cfg };
})();
