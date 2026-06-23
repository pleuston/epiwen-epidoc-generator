/* data.js — the data backend client.
 *
 * All catalog data (records, authority, bibliography, sites, map, indices) lives
 * in the PRIVATE repo pleuston/epiwen-data and is read through the GitHub
 * Contents API with the signed-in user's token. Anonymous reads do not work —
 * a user must be signed in (auth.js) with a token that can read epiwen-data.
 *
 * Exposes window.EpiData:
 *   EpiData.text(path)  -> Promise<string>   raw file contents (e.g. XML)
 *   EpiData.json(path)  -> Promise<any>      parsed JSON file
 *   EpiData.list(path)  -> Promise<array|null>  directory listing (null on 404)
 *   EpiData.OWNER / REPO / BRANCH / token() / headers(raw) / url(path)
 *
 * Replaces the old anonymous raw.githubusercontent.com / relative-path reads.
 */
(function () {
  "use strict";
  // Falls back to epiwen-data so that regular users (who set epiwen_gh_repo in
  // login.html) get the expected backend; workshop users get epiwen-workshop.
  var OWNER  = localStorage.getItem("epiwen_gh_owner")  || "pleuston";
  var REPO   = localStorage.getItem("epiwen_gh_repo")   || "epiwen-data";
  var BRANCH = localStorage.getItem("epiwen_gh_branch") || "main";

  function token() {
    return (window.EpiAuth ? EpiAuth.getUser().token : "") ||
           localStorage.getItem("epiwen_gh_token") || "";
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
  // Contents API URL; encodes each path segment but keeps the slashes.
  function url(path) {
    var p = String(path).replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
    return "https://api.github.com/repos/" + OWNER + "/" + REPO + "/contents/" + p +
      "?ref=" + encodeURIComponent(BRANCH);
  }
  // Drop-in for fetch() against the data backend — returns a real Response, so
  // existing `.then(r => r.json()/r.text())` chains keep working unchanged.
  // Strips any "?v=…" cache-buster (the Contents API uses ?ref instead).
  function get(path) {
    return fetch(url(String(path).split("?")[0]), { headers: headers(true) });
  }
  function text(path) {
    return get(path).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status + " — " + path);
      return r.text();
    });
  }
  function json(path) {
    return text(path).then(function (t) { return JSON.parse(t); });
  }
  function list(path) {
    return fetch(url(path), { headers: headers(false) }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  window.EpiData = {
    OWNER: OWNER, REPO: REPO, BRANCH: BRANCH,
    token: token, headers: headers, url: url,
    fetch: get, text: text, json: json, list: list
  };
})();
