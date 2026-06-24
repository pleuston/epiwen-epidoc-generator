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
  // Default collections repo: epiwen-data, so its corpora (e.g. the opt-in
  // Stone Sutras corpus) are discoverable as toggles without manual config.
  var DEFAULTS = { repo: "epiwen-data", branch: "main" };
  var MODAL_ID = "col-manager-modal";

  // DEFAULT = no-auth corpus bundled in the app repo itself (pleuston/epiwen).
  // Loaded without a token so the app works out of the box in workshops.
  // Records live under corpus/ in the app repo.
  var DEFAULT_CORPUS = { owner: "pleuston", repo: "epiwen", branch: "main",
                         id: "corpus", title: "Workshop corpus" };

  // SHARED = the default-ON public corpus: rubbings + holding-institution
  // authorities, in the PUBLIC repo epiwen-public. Person/place authorities and
  // bibliography stay in the always-on core; the Stone Sutras corpus (sites +
  // inscriptions) is an opt-in toggle in epiwen-data, not the default.
  var SHARED = { owner: "pleuston", repo: "epiwen-public", branch: "main",
                 id: "rubbings", title: "Public corpus (rubbings)" };

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

  // The shared collection is ON BY DEFAULT but toggleable ("0" = the user turned it off).
  function sharedEnabled() { return localStorage.getItem("epiwen_shared_enabled") !== "0"; }
  function setSharedEnabled(on) { localStorage.setItem("epiwen_shared_enabled", on ? "1" : "0"); }

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

  // ── Shared collection (auto-loaded, fixed repo) ─────────────────────────────
  // Same as apiUrl/fetchFileRaw but against an explicit {owner,repo,branch} —
  // used for SHARED, which is NOT the user's configured collections repo.
  function ctxApiUrl(ctx, path) {
    return "https://api.github.com/repos/" + ctx.owner + "/" + ctx.repo +
      "/contents/" + path + "?ref=" + encodeURIComponent(ctx.branch);
  }
  function ctxFetchRaw(ctx, path) {
    return fetch(ctxApiUrl(ctx, path), { headers: headers(true) }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    });
  }

  // Fetch from a public repo. Works WITHOUT a token (guests), but uses the
  // signed-in user's token when present — public repos accept it, and it lifts
  // the rate limit from 60/hour (unauthenticated, per IP) to 5000/hour. Without
  // this, signed-in users load the default corpus on the same 60/hour pool as
  // anonymous traffic and get throttled.
  function ctxFetchNoAuth(ctx, path) {
    return fetch(ctxApiUrl(ctx, path), { headers: headers(true) }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    });
  }
  function ctxListNoAuth(ctx, path) {
    return fetch(ctxApiUrl(ctx, path), { headers: headers(false) }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  /* Load every .xml record from the default (no-auth) corpus in the app repo.
     Walks one level of subdirectories (sites/, objects/, rubbings/, characters/).
     Always attempted; 404 yields empty result. */
  function loadDefaultCorpus() {
    var base = DEFAULT_CORPUS.id;
    function fetchFile(path, name) {
      return ctxFetchNoAuth(DEFAULT_CORPUS, path)
        .then(function (xml) {
          return { name: name, xml: xml, collection: DEFAULT_CORPUS.id,
                   collectionTitle: DEFAULT_CORPUS.title, shared: true,
                   // Repo-relative directory (e.g. "corpus/objects/") so the record
                   // can be located in the app repo for in-place edit/delete.
                   _repoDir: path.slice(0, path.lastIndexOf("/") + 1) };
        })
        .catch(function () { return null; });
    }
    function listDir(dirPath) {
      return ctxListNoAuth(DEFAULT_CORPUS, dirPath)
        .then(function (entries) {
          if (!entries || !Array.isArray(entries)) return [];
          return entries.filter(function (e) {
            return e.type === "file" && /\.xml$/i.test(e.name);
          }).map(function (e) {
            return { path: dirPath + "/" + encodeURIComponent(e.name), name: e.name };
          });
        })
        .catch(function () { return []; });
    }
    return ctxListNoAuth(DEFAULT_CORPUS, base)
      .then(function (entries) {
        if (!entries || !Array.isArray(entries)) return { records: [], errors: [] };
        var rootFiles = entries.filter(function (e) {
          return e.type === "file" && /\.xml$/i.test(e.name);
        }).map(function (e) {
          return { path: base + "/" + encodeURIComponent(e.name), name: e.name };
        });
        // authority/ holds MADS authority records (loaded by the Authorities
        // browser, not the catalog) — skip it here so they aren't parsed as objects.
        var subdirJobs = entries.filter(function (e) {
          return e.type === "dir" && e.name !== "authority";
        }).map(function (e) { return listDir(base + "/" + e.name); });
        return Promise.all(subdirJobs).then(function (subResults) {
          var allFiles = rootFiles;
          subResults.forEach(function (sub) { allFiles = allFiles.concat(sub); });
          return Promise.all(allFiles.map(function (f) {
            return fetchFile(f.path, f.name);
          })).then(function (arr) { return { records: arr.filter(Boolean), errors: [] }; });
        });
      })
      .catch(function () { return { records: [], errors: [] }; });
  }

  /* The default corpus's authority index (corpus/authority-index.json in the
     app repo) — public, no token. Entries are tagged _default so the browser
     fetches their XML via the no-auth corpus/authority/ path. Returns [] if the
     file is absent (404) so signed-in users with the private backend are
     unaffected. */
  function loadDefaultAuthorityIndex() {
    return ctxFetchNoAuth(DEFAULT_CORPUS, DEFAULT_CORPUS.id + "/authority-index.json")
      .then(function (txt) {
        var arr; try { arr = JSON.parse(txt); } catch (e) { return []; }
        if (!Array.isArray(arr)) return [];
        arr.forEach(function (e) { e._default = true; });
        return arr;
      })
      .catch(function () { return []; });
  }

  /* Fetch one default-corpus authority record's XML (no token). */
  function fetchDefaultAuthorityXml(id) {
    return ctxFetchNoAuth(DEFAULT_CORPUS, DEFAULT_CORPUS.id + "/authority/" + encodeURIComponent(id) + ".xml");
  }

  /* The default corpus's site index (corpus/site-index.json in the app repo) —
     public, no token. Entries are tagged so the Sites browser fetches their XML
     via the no-auth corpus/ path. [] if absent (404). */
  function loadDefaultSiteIndex() {
    return ctxFetchNoAuth(DEFAULT_CORPUS, DEFAULT_CORPUS.id + "/site-index.json")
      .then(function (txt) {
        var arr; try { arr = JSON.parse(txt); } catch (e) { return []; }
        if (!Array.isArray(arr)) return [];
        arr.forEach(function (e) {
          e.source = "default"; e.collection = DEFAULT_CORPUS.id;
          e.collectionTitle = DEFAULT_CORPUS.title; e._defaultCorpus = true;
        });
        return arr;
      })
      .catch(function () { return []; });
  }

  /* The default corpus's bibliography index (corpus/biblio-index.json) — public,
     no token, so guests see a sample bibliography. Entries tagged _defaultCorpus
     so the browser fetches their XML via the no-auth corpus/ path. [] if absent. */
  function loadDefaultBiblioIndex() {
    return ctxFetchNoAuth(DEFAULT_CORPUS, DEFAULT_CORPUS.id + "/biblio-index.json")
      .then(function (txt) {
        var arr; try { arr = JSON.parse(txt); } catch (e) { return []; }
        if (!Array.isArray(arr)) return [];
        arr.forEach(function (e) { e._defaultCorpus = true; });
        return arr;
      })
      .catch(function () { return []; });
  }

  /* Fetch a file from the default corpus by its path relative to corpus/
     (no token) — e.g. a site's catalog_file "sites/SNS_site.xml". */
  function fetchDefaultCorpusFile(relPath) {
    var p = String(relPath || "").replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
    return ctxFetchNoAuth(DEFAULT_CORPUS, DEFAULT_CORPUS.id + "/" + p);
  }

  /* Load every .xml record in the shared collection. Always attempted (no
     enable toggle); 404 (not created yet) yields an empty, non-error result. */
  function loadShared() {
    if (!token() || !sharedEnabled()) return Promise.resolve({ records: [], errors: [] });
    return fetch(ctxApiUrl(SHARED, "collections/" + SHARED.id), { headers: headers(false) })
      .then(function (r) {
        if (r.status === 404) return { records: [], errors: [] };
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json().then(function (entries) {
          if (!Array.isArray(entries)) return { records: [], errors: [] };
          var xmlFiles = entries.filter(function (e) {
            return e.type === "file" && /\.xml$/i.test(e.name);
          });
          return Promise.all(xmlFiles.map(function (f) {
            return ctxFetchRaw(SHARED, "collections/" + SHARED.id + "/" + encodeURIComponent(f.name))
              .then(function (xml) {
                return { name: f.name, xml: xml, collection: SHARED.id,
                         collectionTitle: SHARED.title, shared: true };
              })
              .catch(function () { return null; });
          })).then(function (arr) { return { records: arr.filter(Boolean), errors: [] }; });
        });
      })
      .catch(function (e) { return { records: [], errors: [{ id: SHARED.id, message: e.message }] }; });
  }

  /* The shared collection's optional <kind>-index.json (authority / biblio). */
  function loadSharedIndex(kind) {
    if (!token() || !sharedEnabled()) return Promise.resolve([]);
    return ctxFetchRaw(SHARED, "collections/" + SHARED.id + "/" + kind + "-index.json")
      .then(function (txt) {
        var arr; try { arr = JSON.parse(txt); } catch (e) { return []; }
        if (!Array.isArray(arr)) return [];
        arr.forEach(function (e) {
          e.source = "private"; e.collection = SHARED.id; e.collectionTitle = SHARED.title;
        });
        return arr;
      })
      .catch(function () { return []; });   // 404 → no shared index of this kind
  }

  /* Fetch an arbitrary file (e.g. _inscription_index.json) from the shared corpus. */
  function fetchSharedFile(relpath) {
    return ctxFetchRaw(SHARED, "collections/" + SHARED.id + "/" + relpath);
  }

  /* Delete a file from any repo (GET its sha, then DELETE). Needs a token with
     write access to that repo; 403 → no write permission. */
  function deleteFile(owner, repo, branch, path, message) {
    var base = "https://api.github.com/repos/" + owner + "/" + repo + "/contents/" +
      String(path).replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/");
    // Cache-bust + no-store: this URL was already fetched with Accept:raw when the
    // record loaded, and some browsers mis-Vary and would serve that cached XML here.
    return fetch(base + "?ref=" + encodeURIComponent(branch) + "&_t=" + (new Date().getTime()),
                 { headers: headers(false), cache: "no-store" })
      .then(function (r) {
        if (r.status === 404) throw new Error("file not found");
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (meta) {
        return fetch(base, {
          method: "DELETE",
          headers: Object.assign({ "Content-Type": "application/json" }, headers(false)),
          body: JSON.stringify({ message: message || ("Delete " + path), sha: meta.sha, branch: branch })
        }).then(function (r) {
          if (!r.ok) return r.json().then(function (e) { throw new Error(e.message || ("HTTP " + r.status)); });
          return r.json();
        });
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

  // ── Records index (list metadata for large collections) ─────────────────────
  // The full index, collections/<pkg>/records-index.json, is a build artifact
  // (scripts/build_records_index.py) and can be multiple MB — too large to
  // rewrite on every edit. So the editor never touches it: it writes only the
  // changed record's entry to a small companion collections/<pkg>/records-index.
  // patch.json (a map keyed by filename; { _deleted:true } is a tombstone), and
  // loadPackageIndex() merges the patch over the full index at load time. A full
  // regeneration folds the patch back in and clears it.

  var TEI_NS = "http://www.tei-c.org/ns/1.0";
  function _itxt(el) { return el ? (el.textContent || "").trim() : ""; }
  function _iq(root, tag) { return Array.prototype.slice.call(root.getElementsByTagNameNS(TEI_NS, tag)); }
  function _ifirst(root, tag) { var e = root.getElementsByTagNameNS(TEI_NS, tag); return e.length ? e[0] : null; }
  function _b64utf8(s) { return btoa(unescape(encodeURIComponent(s))); }
  function _unb64utf8(s) { try { return decodeURIComponent(escape(atob((s || "").replace(/\n/g, "")))); } catch (e) { return ""; } }

  // Build one records-index entry from a record's XML. Mirrors the fields
  // scripts/build_records_index.py extracts (and catalog.js parseRecord's list
  // view). Keep the two in sync.
  function indexEntryFromXml(filename, xmlText) {
    var base = { name: filename, file: filename, record_type: "object", title_en: filename,
                 title_zh: "", editor: "", when: "", date_text: "", region: "", settlement: "",
                 repository: "", orig_place: "", surrogate_of: "", provider_label: "", manifest: "", parts: [] };
    var doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) return base;

    var root = doc.documentElement;
    if (root && root.getAttribute("type") === "site") {
      var sEn = "", sZh = "";
      Array.prototype.forEach.call(root.getElementsByTagName("*"), function (el) {
        if ((el.localName || "") !== "title") return;
        var lang = el.getAttribute("xml:lang") || "";
        if (lang.indexOf("zh") === 0) { if (!sZh) sZh = _itxt(el); }
        else if (!sEn) sEn = _itxt(el);
      });
      base.record_type = "site"; base.title_en = sEn || filename; base.title_zh = sZh;
      return base;
    }

    var msDesc = _ifirst(doc, "msDesc");
    base.record_type = (msDesc && msDesc.getAttribute("type") === "rubbing") ? "rubbing" : "object";

    _iq(doc, "relatedItem").some(function (rel) {
      if (rel.getAttribute("type") !== "surrogateOf") return false;
      var ptr = _ifirst(rel, "ptr");
      base.surrogate_of = ptr ? (ptr.getAttribute("target") || _itxt(ptr)) : _itxt(rel);
      return true;
    });

    base.title_en = "";   // object records: empty unless a titleStmt en title exists
    _iq(doc, "title").forEach(function (t) {
      var p = t.parentNode;
      if (!p || p.localName !== "titleStmt") return;
      var lang = t.getAttribute("xml:lang") || "";
      if (lang === "en" && !base.title_en) base.title_en = _itxt(t);
      else if (lang === "zh-Hant" && !base.title_zh) base.title_zh = _itxt(t);
    });
    base.editor     = _itxt(_ifirst(doc, "editor"));
    base.region     = _itxt(_ifirst(doc, "region"));
    base.settlement = _itxt(_ifirst(doc, "settlement"));
    base.repository = _itxt(_ifirst(doc, "repository"));

    var od = _ifirst(doc, "origDate");
    base.when      = od ? (od.getAttribute("when") || od.getAttribute("notBefore") || "") : "";
    base.date_text = _itxt(od);
    base.orig_place = _itxt(_ifirst(doc, "origPlace"));

    _iq(doc, "ref").forEach(function (r) {
      var target = r.getAttribute("target") || "", typ = r.getAttribute("type") || "";
      if (!/^https?:\/\//.test(target)) return;
      if (typ === "iiif-manifest" && !base.manifest) base.manifest = target;
      else if (typ === "provider" && !base.provider_label) base.provider_label = _itxt(r);
    });

    var msItems = _iq(doc, "msItem");
    var langs = _iq(doc, "language");
    function itemTitles(ms) { return ms ? _iq(ms, "title") : []; }
    function sutraPair(titles) {
      var zh = "", en = "";
      titles.forEach(function (t) {
        var lang = t.getAttribute("xml:lang") || "";
        if (lang === "zh-Hant" && !zh) zh = _itxt(t);
        else if (lang === "en" && !en) en = _itxt(t);
      });
      if (!zh && titles.length) zh = _itxt(titles[0]);
      return { zh: zh, en: en };
    }

    _iq(doc, "div").forEach(function (div) {
      if (div.getAttribute("type") !== "textpart") return;
      var n = div.getAttribute("n") || "", ms = null;
      msItems.forEach(function (m) { if (m.getAttribute("n") === n) ms = m; });
      var sp = sutraPair(itemTitles(ms));
      base.parts.push({ n: n, head: _itxt(_ifirst(div, "head")), subtype: div.getAttribute("subtype") || "",
                        lang: div.getAttribute("xml:lang") || "", sutra: sp.zh, sutra_en: sp.en });
    });
    if (!base.parts.length && msItems.length) {
      var sp2 = sutraPair(itemTitles(msItems[0]));
      base.parts.push({ n: "1", head: _itxt(_ifirst(msItems[0], "locus")), subtype: "",
                        lang: langs[0] ? (langs[0].getAttribute("ident") || "") : "", sutra: sp2.zh, sutra_en: sp2.en });
    }
    return base;
  }

  // Read+modify+write the small records-index.patch.json for a package (Contents
  // API, with the user's token, against the configured collections repo).
  function _patchRecordsIndex(id, mutate, message) {
    var t = token();
    if (!t) return Promise.reject(new Error("Sign in to update the index."));
    var c = getConfig();
    var rel  = "collections/" + id + "/records-index.patch.json";
    var url  = "https://api.github.com/repos/" + c.owner + "/" + c.repo + "/contents/" + rel;
    var h    = { "Authorization": "Bearer " + t, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    // Cache-bust + no-store: loadPackageIndex fetches this same URL with Accept:raw,
    // and a mis-Vary'd cached copy would break r.json() / hide the real sha.
    return fetch(url + "?ref=" + encodeURIComponent(c.branch) + "&_t=" + (new Date().getTime()),
                 { headers: h, cache: "no-store" })
      .then(function (r) {
        if (r.status === 404) return { patch: {}, sha: null };
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json().then(function (j) {
          var patch; try { patch = JSON.parse(_unb64utf8(j.content)); } catch (e) { patch = {}; }
          if (!patch || typeof patch !== "object" || Array.isArray(patch)) patch = {};
          return { patch: patch, sha: j.sha };
        });
      })
      .then(function (st) {
        mutate(st.patch);
        var body = { message: message, content: _b64utf8(JSON.stringify(st.patch, null, 1) + "\n"), branch: c.branch };
        if (st.sha) body.sha = st.sha;
        return fetch(url, { method: "PUT", headers: Object.assign({ "Content-Type": "application/json" }, h), body: JSON.stringify(body) })
          .then(function (r) { if (!r.ok) return r.json().then(function (e) { throw new Error(e.message || "HTTP " + r.status); }); return r.json(); });
      });
  }

  // True if the package actually has a full records-index.json. Uses a metadata
  // GET (no content), so it stays cheap even for multi-MB indexes. Packages
  // without one are browsed by directory walk and need no patch file.
  function _indexExists(id) {
    var c = getConfig();
    var url = "https://api.github.com/repos/" + c.owner + "/" + c.repo +
      "/contents/collections/" + encodeURIComponent(id) + "/records-index.json?ref=" + encodeURIComponent(c.branch);
    return fetch(url, { headers: headers(false) }).then(function (r) { return r.ok; }).catch(function () { return false; });
  }

  /* Editor hooks: keep the index current without rewriting the full (large) file.
     No-op for packages that have no index (the catalog walks those directly). */
  function recordsIndexUpsert(id, filename, xml) {
    return _indexExists(id).then(function (exists) {
      if (!exists) return null;
      var entry = indexEntryFromXml(filename, xml);
      return _patchRecordsIndex(id, function (patch) { patch[filename] = entry; }, "Index: update " + filename);
    });
  }
  function recordsIndexRemove(id, filename) {
    return _indexExists(id).then(function (exists) {
      if (!exists) return null;
      return _patchRecordsIndex(id, function (patch) { patch[filename] = { name: filename, _deleted: true }; }, "Index: remove " + filename);
    });
  }

  /* A package's records-index.json merged with its records-index.patch.json —
     lightweight list metadata for every record in ONE (well, two small) request.
     This is how large collections (thousands of records) are browsed: the
     directory walk in loadPackage() is capped at 1000 entries by the Contents API
     and fetches every file, which does not scale. Returns the merged entries
     tagged { _lazy:true, collection } (catalog.js renders the list from these and
     fetches each record's full XML only when opened), or null when the package
     has no index (caller falls back to loadPackage). */
  function loadPackageIndex(id) {
    var dir = "collections/" + encodeURIComponent(id);
    function safeJson(path) {
      return fetchFileRaw(path).then(function (t) { try { return JSON.parse(t); } catch (e) { return null; } })
        .catch(function () { return null; });
    }
    return Promise.all([safeJson(dir + "/records-index.json"), safeJson(dir + "/records-index.patch.json")])
      .then(function (res) {
        var index = res[0], patch = res[1];
        if (!Array.isArray(index)) return null;          // no full index → walk instead
        var byName = {};
        index.forEach(function (e) { if (e && e.name) byName[e.name] = e; });
        if (patch && typeof patch === "object" && !Array.isArray(patch)) {
          Object.keys(patch).forEach(function (fn) {
            var p = patch[fn];
            if (p && p._deleted) delete byName[fn];
            else if (p) byName[fn] = p;
          });
        }
        return Object.keys(byName).map(function (k) { var e = byName[k]; e._lazy = true; e.collection = id; return e; });
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
    // No token guard: public collections (e.g. epiwen-workshop) work without auth.
    // Private repos without a token return 404/401, caught per-package below.

    var titles = getTitleMap();
    var errors = [];

    return Promise.all(enabled.map(function (id) {
      // Prefer the records index (scales to thousands); fall back to walking the
      // directory for packages that have no records-index.json yet.
      return loadPackageIndex(id)
        .then(function (indexed) {
          if (indexed) return indexed;
          return loadPackage(id);
        })
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
    if (!token()) return Promise.resolve([]);
    var titles = getTitleMap();
    var jobs = [ loadSharedIndex(kind) ];   // the shared collection is always included
    getEnabled().forEach(function (id) {
      jobs.push(
        fetchFileRaw("collections/" + encodeURIComponent(id) + "/" + kind + "-index.json")
          .then(function (txt) {
            var arr; try { arr = JSON.parse(txt); } catch (e) { return []; }
            if (!Array.isArray(arr)) return [];
            arr.forEach(function (e) {
              e.source = "private"; e.collection = id; e.collectionTitle = titles[id] || id;
            });
            return arr;
          })
          .catch(function () { return []; })   // 404 → package has no index of this kind
      );
    });
    return Promise.all(jobs).then(function (lists) { return [].concat.apply([], lists); });
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
      // Always-on, non-removable chip for the shared collection.
      var sharedChip = '<span class="col-chip shared on" ' +
        'title="Shared collection — auto-loaded for everyone with access to the data backend">' +
        '<span>🌐 ' + esc(SHARED.title) + '</span></span>';
      var chips = packages.map(function (p) {
        var on = enabled.indexOf(p.id) !== -1;
        return '<label class="col-chip' + (on ? " on" : "") + '">' +
          '<input type="checkbox" value="' + esc(p.id) + '"' + (on ? " checked" : "") + '>' +
          '<span>🔒 ' + esc(p.title) + '</span></label>';
      }).join("");
      el.innerHTML =
        '<span class="collections-bar-label">Corpora</span>' +
        sharedChip +
        (chips || '<span class="collections-bar-empty">' + esc(msg || "add your own →") + '</span>') +
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
        '<h2 id="col-modal-heading" class="modal-title">Corpora</h2>' +
        '<p class="modal-desc">Load named packages of records from a private repo. ' +
          'Records stay visible only to tokens with access — others get a 404. ' +
          'Layout: <code>collections/&lt;name&gt;/*.xml</code>.</p>' +
        '<p class="modal-desc">Need a token with access? Generate a ' +
          '<a href="https://github.com/settings/tokens/new?scopes=repo&amp;description=Epiwen" target="_blank" rel="noopener">classic PAT (<code>repo</code> scope)</a> or a ' +
          '<a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">fine-grained PAT</a> (Contents: Read), ' +
          'then sign out and sign back in with it.</p>' +
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

  // ── Global collections dropdown (top bar, next to the user chip) ─────────────
  // Self-injects on every page that loads collections.js, so the same selector
  // is available everywhere and its selection applies app-wide.
  var _menuMounted = false;
  function mountMenu() {
    if (_menuMounted || !token()) return;
    var signOut = document.querySelector('[onclick="EpiAuth.signOut()"]');
    if (!signOut || !signOut.parentNode) return;
    _menuMounted = true;

    var wrap = document.createElement("div");
    wrap.className = "col-menu";
    wrap.innerHTML =
      '<button class="col-menu-btn btn small" type="button" aria-haspopup="true" aria-expanded="false">' +
        '🌐 Corpora<span class="col-menu-count" hidden></span> <span class="col-menu-caret">▾</span>' +
      '</button>' +
      '<div class="col-menu-panel" hidden role="menu"></div>';
    signOut.parentNode.insertBefore(wrap, signOut);

    var btn = wrap.querySelector(".col-menu-btn"),
        panel = wrap.querySelector(".col-menu-panel"),
        countEl = wrap.querySelector(".col-menu-count");

    function pkgsFromCache() {
      var t = getTitleMap();
      return Object.keys(t).map(function (id) { return { id: id, title: t[id] }; })
        .sort(function (a, b) { return a.id.localeCompare(b.id); });
    }
    function updateCount() {
      var n = getEnabled().length + (sharedEnabled() ? 1 : 0);
      countEl.textContent = n ? String(n) : ""; countEl.hidden = (n === 0);
    }
    function renderPanel(packages) {
      var enabled = getEnabled();
      var sharedOn = sharedEnabled();
      var items = packages.map(function (p) {
        var on = enabled.indexOf(p.id) !== -1;
        return '<label class="col-menu-item' + (on ? " on" : "") + '">' +
          '<input type="checkbox" class="col-pkg-cb" value="' + esc(p.id) + '"' + (on ? " checked" : "") + '>' +
          '<span>🔒 ' + esc(p.title) + '</span></label>';
      }).join("");
      panel.innerHTML =
        '<div class="col-menu-head">Corpora</div>' +
        '<label class="col-menu-item shared' + (sharedOn ? " on" : "") + '" title="On by default — shared with everyone who has backend access. Untick to hide it.">' +
          '<input type="checkbox" class="col-shared-cb"' + (sharedOn ? " checked" : "") + '>' +
          '<span>🌐 ' + esc(SHARED.title) + '</span><span class="col-menu-always">default</span></label>' +
        (items || '<div class="col-menu-empty">No private collections yet.</div>') +
        '<div class="col-menu-sep"></div>' +
        '<button class="col-menu-action col-add" type="button">＋ Add collection…</button>' +
        '<button class="col-menu-action col-manage" type="button">⚙ Manage &amp; settings</button>';
      Array.prototype.forEach.call(panel.querySelectorAll("input.col-pkg-cb"), function (cb) {
        cb.addEventListener("change", function () {
          var en = getEnabled();
          if (cb.checked) { if (en.indexOf(cb.value) === -1) en.push(cb.value); }
          else en = en.filter(function (x) { return x !== cb.value; });
          setEnabled(en);
          var lbl = cb.closest(".col-menu-item"); if (lbl) lbl.classList.toggle("on", cb.checked);
          updateCount(); fireChange();
        });
      });
      var sc = panel.querySelector("input.col-shared-cb");
      if (sc) sc.addEventListener("change", function () {
        setSharedEnabled(sc.checked);
        var lbl = sc.closest(".col-menu-item"); if (lbl) lbl.classList.toggle("on", sc.checked);
        updateCount(); fireChange();
      });
      panel.querySelector(".col-add").addEventListener("click", function () { close(); showManager(true); });
      panel.querySelector(".col-manage").addEventListener("click", function () { close(); showManager(false); });
    }
    function open() {
      renderPanel(pkgsFromCache()); panel.hidden = false; btn.setAttribute("aria-expanded", "true");
      listPackages().then(function (res) { if (res.ok && !panel.hidden) renderPanel(res.packages); });
    }
    function close() { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); }

    btn.addEventListener("click", function (e) { e.stopPropagation(); panel.hidden ? open() : close(); });
    document.addEventListener("click", function (e) { if (!wrap.contains(e.target)) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });

    updateCount();
    onChange(function () { updateCount(); if (!panel.hidden) renderPanel(pkgsFromCache()); });
    var c = getConfig();
    if (c.owner && c.repo) listPackages().then(function () { updateCount(); });
  }

  // Auto-mount the dropdown once the DOM is ready (idempotent).
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountMenu);
  else mountMenu();

  window.EpiCollections = {
    getConfig:       getConfig,
    setConfig:       setConfig,
    getEnabled:      getEnabled,
    getEnabledCount: getEnabledCount,
    getTitleMap:     getTitleMap,
    listPackages:    listPackages,
    loadPackage:     loadPackage,
    loadPackageIndex: loadPackageIndex,
    indexEntryFromXml:  indexEntryFromXml,
    recordsIndexUpsert: recordsIndexUpsert,
    recordsIndexRemove: recordsIndexRemove,
    loadEnabled:     loadEnabled,
    loadDefaultCorpus: loadDefaultCorpus,
    loadDefaultAuthorityIndex: loadDefaultAuthorityIndex,
    fetchDefaultAuthorityXml:  fetchDefaultAuthorityXml,
    loadDefaultSiteIndex:      loadDefaultSiteIndex,
    loadDefaultBiblioIndex:    loadDefaultBiblioIndex,
    fetchDefaultCorpusFile:    fetchDefaultCorpusFile,
    loadShared:        loadShared,
    loadSharedIndex:   loadSharedIndex,
    fetchSharedFile:   fetchSharedFile,
    deleteFile:        deleteFile,
    DEFAULT_CORPUS:    DEFAULT_CORPUS,
    SHARED:            SHARED,
    loadIndex:       loadIndex,
    fetchRecordXml:  fetchRecordXml,
    mountBar:        mountBar,
    mountMenu:       mountMenu,
    listUserRepos:   listUserRepos,
    createPackage:   createPackage,
    createRepo:      createRepo,
    showManager:     showManager,
    hideManager:     hideManager,
    onChange:        onChange
  };
})();
