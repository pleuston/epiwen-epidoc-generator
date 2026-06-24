/* changelog.js — GitHub commit log for the Epiwen platform.
 * Reads owner/repo/token from the same localStorage keys as github.js.
 * Exports window.EpiChangelog with fetchXML(), fetchAll(), timeAgo(). */
(function () {
  "use strict";

  var LS = {
    token: "epiwen_gh_token", owner: "epiwen_gh_owner",
    repo: "epiwen_gh_repo",  branch: "epiwen_gh_branch"
  };
  var DEF     = { owner: "pleuston", repo: "epiwen-data", branch: "main" };
  var DEF_APP = { owner: "pleuston", repo: "epiwen",      branch: "main" };

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

  /* Record changes — commits touching record/data files, wherever they live:
     the data repo (records/catalog/authority/biblio) AND the app repo's bundled
     default corpus (corpus/), since editing a default-corpus record commits to
     the app repo. */
  function fetchXML(limit) {
    var c = cfg();
    var dirs = ["records", "catalog", "authority", "biblio"];
    var jobs = dirs.map(function (d) { return ghFetch(commitsUrl(c, d, 100), c.token); });
    var app = { owner: DEF_APP.owner, repo: DEF_APP.repo, branch: DEF_APP.branch };
    jobs.push(ghFetch(commitsUrl(app, "corpus", 100), c.token));   // default-corpus record edits
    return Promise.all(jobs)
      .then(mergeDedup)
      .then(function (all) { return limit ? all.slice(0, limit) : all; });
  }

  /* All commits in the repo */
  function fetchAll(limit) {
    var c = cfg();
    return ghFetch(commitsUrl(c, "", limit || 200), c.token);
  }

  /* Platform changes — app-repo commits EXCEPT the default-corpus record edits
     (those are record changes, shown on the Records tab). */
  function fetchPlatform(limit) {
    var c = cfg();
    var app = { owner: DEF_APP.owner, repo: DEF_APP.repo, branch: DEF_APP.branch };
    return Promise.all([
      ghFetch(commitsUrl(app, "", 300), c.token),        // all app-repo commits
      ghFetch(commitsUrl(app, "corpus", 200), c.token)   // …the record (corpus) commits to subtract
    ]).then(function (res) {
      var all = res[0] || [], corpus = res[1] || [], skip = {};
      corpus.forEach(function (cm) { skip[cm.sha] = true; });
      var platform = all.filter(function (cm) { return !skip[cm.sha]; });
      return limit ? platform.slice(0, limit) : platform;
    });
  }

  window.EpiChangelog = { fetchXML: fetchXML, fetchAll: fetchAll, fetchPlatform: fetchPlatform, timeAgo: timeAgo, cfg: cfg };
})();
