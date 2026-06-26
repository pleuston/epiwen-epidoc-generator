/* harvest.js — browse the staged rubbing harvests and import selected entries
 * into the public rubbing corpus (epiwen-public/collections/rubbings/).
 *
 * Sources (staging files in epiwen-public/harvest/, public so the import token
 * can read them): Harvard-Yenching, UC Berkeley, Japan Search (JP institutions).
 * Each source supplies its own record generator, filename scheme and dedup key.
 * Importing generates a rubbing TEI record per selected entry and commits it with
 * the signed-in user's token; dedupes against what's already imported and skips
 * access-restricted records. */
(function () {
  "use strict";

  var TARGET = { owner: "pleuston", repo: "epiwen-public", branch: "main", dir: "collections/rubbings" };
  var HARVEST_REPO = { owner: "pleuston", repo: "epiwen-public", branch: "main" };
  var PAGE = 100;

  // ── generic helpers ─────────────────────────────────────────────────────────
  function token() { return localStorage.getItem("epiwen_gh_token") || ""; }
  function fold(s) { return window.EpiVariants ? EpiVariants.fold(s) : String(s == null ? "" : s).toLowerCase(); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function el(id) { return document.getElementById(id); }
  function toast(m, err) {
    var t = el("toast"); if (!t) return;
    t.textContent = m; t.className = "show" + (err ? " toast-error" : "");
    setTimeout(function () { t.className = ""; }, err ? 6000 : 3000);
  }
  function b64(s) { return btoa(unescape(encodeURIComponent(s))); }
  function slug(s) {
    return String(s || "rubbing").normalize("NFKD").replace(/[^\w]+/g, "_")
      .replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "rubbing";
  }
  function tag(name, val, attrs) { return val ? "<" + name + (attrs || "") + ">" + esc(val) + "</" + name + ">" : ""; }
  function anyCjk(arr) { for (var i = 0; i < (arr || []).length; i++) if (/[㐀-鿿]/.test(arr[i] || "")) return arr[i]; return ""; }
  // Japan Search collection-code → clean label (cobas etc. aggregate many museums).
  var JS_DB = {
    cobas: "ColBase · National Museums of Japan", dignl: "NDL Digital Collections",
    daito: "Daitō Bunka University", utokyo_da: "University of Tokyo",
    arc_resource: "ARC, Ritsumeikan University", arc_books: "ARC, Ritsumeikan University",
    arc_nishikie: "ARC, Ritsumeikan University", bibnl: "National Diet Library",
    nmj01: "Nat'l Institute of Japanese Literature", nmj02: "Nat'l Institute of Japanese Literature"
  };
  function jsDbLabel(e) {
    if (JS_DB[e.database]) return JS_DB[e.database];
    var inst = (e.institution || "").split(" / ").filter(function (x) {
      return /博物館|圖書館|図書館|大學|大学|文庫|文化財|機構|資料館|美術館|Museum|Library|Universit|Archives|Institut|National/.test(x);
    });
    return inst[0] || e.provider || e.database || "(unknown)";
  }
  function fhclNum(urn) { var m = String(urn || "").match(/FHCL:(\d+)/i); return m ? m[1] : ""; }
  function alnum(s) { return String(s || "").replace(/[^A-Za-z0-9]+/g, ""); }

  // Shared rubbing-TEI builder used by every source's gen().
  function buildRubbingXml(o) {
    var refs = (o.refs || []).filter(function (r) { return r.target; }).map(function (r) {
      return "\n              <bibl><ref type=\"" + r.type + "\" target=\"" + esc(r.target) + "\">" + esc(r.label || r.type) + "</ref></bibl>";
    }).join("");
    var idnos = (o.idnos || []).filter(function (i) { return i.value; }).map(function (i) {
      return "            <idno type=\"" + i.type + "\">" + esc(i.value) + "</idno>\n";
    }).join("");
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
'<?xml-model href="https://www.stoa.org/epidoc/schema/latest/tei-epidoc.rng" schematypens="http://relaxng.org/ns/structure/1.0"?>\n' +
'<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:lang="en">\n' +
'  <teiHeader>\n    <fileDesc>\n      <titleStmt>\n' +
'        ' + tag("title", o.titleEn || "Rubbing", ' xml:lang="en"') + '\n' +
(o.titleZh ? '        ' + tag("title", o.titleZh, ' xml:lang="zh-Hant"') + '\n' : '') +
'        <editor role="editor">Epiwen import</editor>\n      </titleStmt>\n' +
'      <publicationStmt>\n        <authority>Epiwen / Altergraphy</authority>\n' +
'        <idno type="filename">' + esc(o.filename) + '</idno>\n' +
'        <availability><licence' + (o.licenceTarget ? ' target="' + esc(o.licenceTarget) + '"' : '') + '>' + esc(o.licence || "See source record") + '</licence></availability>\n' +
'      </publicationStmt>\n      <sourceDesc>\n        <msDesc type="rubbing">\n          <msIdentifier>\n' +
'            ' + (tag("country", o.country) || "<country/>") + '\n' +
(o.settlement ? '            ' + tag("settlement", o.settlement) + '\n' : '') +
'            ' + (tag("repository", o.repository) || "<repository/>") + '\n' +
idnos +
'          </msIdentifier>\n          <msContents>\n            ' + (tag("summary", o.summary) || "<summary/>") + '\n          </msContents>\n' +
'          <physDesc>\n            <objectDesc form="拓本">\n              <supportDesc><support><objectType>拓片 · ink rubbing on paper</objectType></support></supportDesc>\n            </objectDesc>\n          </physDesc>\n' +
'          <history><origin>' + (tag("origDate", o.origDate) || "<origDate/>") + (o.origPlace ? " " + tag("origPlace", o.origPlace) : "") + '</origin></history>\n' +
'          <additional>\n            <listBibl>' + refs + '\n            </listBibl>\n          </additional>\n' +
'        </msDesc>\n      </sourceDesc>\n    </fileDesc>\n' +
'    <profileDesc><langUsage><language ident="zh">Literary Chinese 漢文</language></langUsage></profileDesc>\n' +
'    <revisionDesc>\n      <change when="' + new Date().toISOString().slice(0, 10) + '" who="#epiwen">' +
  esc((o.changeNote || "Imported via the Epiwen rubbing harvest.") +
      (META.harvested ? " Harvested " + META.harvested + (META.harvest_log ? " — " + META.harvest_log : "") + "." : "")) +
'</change>\n    </revisionDesc>\n' +
'  </teiHeader>\n' +
(o.image ? '  <facsimile>\n    <graphic url="' + esc(o.image) + '"/>\n  </facsimile>\n' : '') +
'  <text><body><div type="edition"><p>Ink rubbing — see the source record / IIIF for images.</p></div></body></text>\n' +
'</TEI>\n';
  }

  // ── sources ──────────────────────────────────────────────────────────────────
  var SOURCES = {
    harvard: {
      id: "harvard", label: "Harvard-Yenching Library",
      file: "harvest/harvard-rubbings.json",
      summary: '<a href="https://library.harvard.edu/digital-collections" target="_blank" rel="noopener">Harvard LibraryCloud</a>',
      importedRe: /_rubbing_HV(\d+)\.xml$/i,
      entryId: function (e) { return fhclNum(e.fhcl_urn); },
      filename: function (e) { var id = e.fhcl_urn ? ("HV" + fhclNum(e.fhcl_urn)) : (e.hollis || "x"); return slug(e.title) + "_rubbing_" + id + ".xml"; },
      digitised: function (e) { return !!e.digitised; },
      restricted: function (e) { return e.access === "R"; },
      cjk: function (e) { return anyCjk(e.titles_all); },
      meta: function (e) { return [e.date, e.shelf, e.hollis ? "HOLLIS " + e.hollis : "", e.culture].filter(Boolean).join(" · "); },
      hay: function (e) { return e.title + " " + (e.titles_all || []).join(" ") + " " + e.date + " " + e.shelf + " " + e.hollis; },
      recordUrl: function (e) { return e.record_url; },
      viewUrl: function (e) { return e.iiif_manifest ? ("viewer.html?manifest=" + encodeURIComponent(e.iiif_manifest)) : e.record_url; },
      gen: function (e) {
        return buildRubbingXml({
          titleEn: e.title, titleZh: this.cjk(e),
          repository: e.repository || "Harvard-Yenching Library, Harvard University",
          country: "United States", settlement: "Cambridge, MA",
          idnos: [{ type: "hollis", value: e.hollis }, { type: "shelf", value: e.shelf }],
          summary: e.abstract, origDate: e.date,
          licence: e.access === "R" ? "Harvard Library — access restricted; see the source record" : "Harvard Library digital collections — open access",
          licenceTarget: "https://library.harvard.edu/digital-collections",
          refs: [{ type: "record", target: e.record_url, label: "Harvard Library record" }, { type: "iiif-manifest", target: e.iiif_manifest, label: "IIIF manifest (deep-zoom)" }],
          image: e.drs_file_id ? ("https://mps.lib.harvard.edu/assets/images/drs:" + e.drs_file_id + "/full/,1000/0/default.jpg") : "",
          filename: this.filename(e),
          changeNote: "Imported from Harvard LibraryCloud (" + (e.fhcl_urn || e.hollis || "") + ") via the Epiwen rubbing harvest; images served live from Harvard IIIF."
        });
      }
    },
    berkeley: {
      id: "berkeley", label: "UC Berkeley (C.V. Starr)",
      file: "harvest/berkeley-rubbings.json",
      summary: '<a href="https://digicoll.lib.berkeley.edu/search?ln=en&cc=chineserubbings" target="_blank" rel="noopener">UC Berkeley Digital Collections</a>',
      importedRe: /_rubbing_UCB([A-Za-z0-9]+)\.xml$/i,
      entryId: function (e) { return e.id; },
      filename: function (e) { return slug(e.title) + "_rubbing_UCB" + alnum(e.id) + ".xml"; },
      digitised: function (e) { return !!e.image; },
      restricted: function () { return false; },
      cjk: function (e) { return anyCjk(e.titles_all); },
      meta: function (e) { return [e.date, (e.subjects || []).slice(0, 2).join(", ")].filter(Boolean).join(" · "); },
      hay: function (e) { return e.title + " " + (e.titles_all || []).join(" ") + " " + e.description + " " + (e.subjects || []).join(" "); },
      recordUrl: function (e) { return e.record_url; },
      viewUrl: function (e) { return e.record_url; },
      gen: function (e) {
        return buildRubbingXml({
          titleEn: e.title, titleZh: this.cjk(e),
          repository: "C.V. Starr East Asian Library, University of California, Berkeley",
          country: "United States", settlement: "Berkeley, CA",
          idnos: [{ type: "record", value: e.id }],
          summary: e.description, origDate: e.date,
          licence: e.rights || "UC Berkeley Library — see the source record for rights",
          licenceTarget: e.record_url,
          refs: [{ type: "record", target: e.record_url, label: "UC Berkeley digital collections record" }],
          image: e.image, filename: this.filename(e),
          changeNote: "Imported from UC Berkeley digital collections (record " + e.id + ", OAI chineserubbings) via the Epiwen rubbing harvest."
        });
      }
    },
    japansearch: {
      id: "japansearch", label: "Japan Search (JP institutions)",
      file: "harvest/japansearch-rubbings.json",
      summary: '<a href="https://jpsearch.go.jp/" target="_blank" rel="noopener">Japan Search</a>',
      importedRe: /_rubbing_JPS([A-Za-z0-9]+)\.xml$/i,
      entryId: function (e) { return alnum(e.id); },
      filename: function (e) { return slug(e.title_en || e.title) + "_rubbing_JPS" + alnum(e.id) + ".xml"; },
      digitised: function (e) { return !!e.image; },
      restricted: function (e) { return e.access && e.access !== "PUBLIC"; },
      cjk: function (e) { return /[㐀-鿿]/.test(e.title || "") ? e.title : ""; },
      meta: function (e) { return [e.date, e.institution, e.origin].filter(Boolean).join(" · "); },
      hay: function (e) { return (e.title || "") + " " + (e.title_en || "") + " " + (e.description || "") + " " + (e.institution || "") + " " + (e.origin || ""); },
      recordUrl: function (e) { return e.record_url; },
      viewUrl: function (e) { return e.record_url; },
      // Japan Search aggregates many collections — filter by the source collection.
      collections: true,
      collectionOf: function (e) { return e.database || ""; },
      collectionLabel: function (e) { return jsDbLabel(e); },
      gen: function (e) {
        // "harvested via Japan Search": cite the original record when present, else
        // mark Japan Search as the only (non-independently-verifiable) access path.
        var hasOrig = !!e.record_url;
        return buildRubbingXml({
          titleEn: e.title_en || "", titleZh: /[㐀-鿿]/.test(e.title || "") ? e.title : "",
          repository: e.institution || e.provider || "Japan Search",
          country: "Japan",
          idnos: [{ type: "jps", value: e.id }],
          summary: e.description, origDate: e.date, origPlace: e.origin,
          licence: "Japan Search / " + (e.institution || "") + " — " + (e.rights || "see source record"),
          licenceTarget: e.record_url || "https://jpsearch.go.jp/",
          refs: [{ type: "record", target: e.record_url, label: (e.institution || "Holding institution") + " record" },
                 { type: "provider", target: "https://jpsearch.go.jp/", label: "Japan Search (harvest aggregator)" }],
          image: e.image, filename: this.filename(e),
          changeNote: "Harvested via Japan Search (" + e.id + "; collection: " + (e.institution || e.database) + "). " +
            (hasOrig ? "Original record: " + e.record_url + "." : "Original record not independently linkable — Japan Search is the access path.")
        });
      }
    }
  };

  // ── state ────────────────────────────────────────────────────────────────────
  var SRC = SOURCES.harvard;
  var entries = [], filtered = [], page = 0, imported = {}, META = {}, collFilter = "";

  function isImported(e) { return !!imported[SRC.id + "|" + SRC.entryId(e)]; }

  // ── GitHub I/O ───────────────────────────────────────────────────────────────
  function ghHeaders() {
    // Omit Authorization when there's no token — an empty "Bearer " is 401, but
    // no header is anonymous (fine for reading the public staging files).
    var h = { "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    var t = token();
    if (t) h["Authorization"] = "Bearer " + t;
    return h;
  }
  function listImported() {
    imported = {};
    var url = "https://api.github.com/repos/" + TARGET.owner + "/" + TARGET.repo +
      "/contents/" + TARGET.dir + "?ref=" + encodeURIComponent(TARGET.branch) + "&_t=" + (new Date().getTime());
    return fetch(url, { headers: ghHeaders(), cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        (Array.isArray(list) ? list : []).forEach(function (f) {
          Object.keys(SOURCES).forEach(function (sid) {
            var m = f.name.match(SOURCES[sid].importedRe);
            if (m) imported[sid + "|" + m[1]] = true;
          });
        });
      })
      .catch(function () {});
  }
  function loadHarvestJson(file) {
    var url = "https://api.github.com/repos/" + HARVEST_REPO.owner + "/" + HARVEST_REPO.repo +
      "/contents/" + file.split("/").map(encodeURIComponent).join("/") +
      "?ref=" + encodeURIComponent(HARVEST_REPO.branch) + "&_t=" + (new Date().getTime());
    // Accept: raw must win over ghHeaders()'s +json, else a >1MB file comes back
    // as the metadata wrapper (no entries) instead of the raw JSON.
    return fetch(url, { headers: Object.assign(ghHeaders(), { "Accept": "application/vnd.github.raw" }), cache: "no-store" })
      .then(function (r) {
        if (r.status === 404) throw new Error(file + " not found");
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
  }
  function commit(path, xml, message) {
    var base = "https://api.github.com/repos/" + TARGET.owner + "/" + TARGET.repo + "/contents/" +
      path.split("/").map(encodeURIComponent).join("/");
    return fetch(base + "?ref=" + encodeURIComponent(TARGET.branch) + "&_t=" + (new Date().getTime()),
                 { headers: ghHeaders(), cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (existing) {
        var body = { message: message, content: b64(xml), branch: TARGET.branch };
        if (existing && existing.sha) body.sha = existing.sha;
        return fetch(base, { method: "PUT", headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders()), body: JSON.stringify(body) });
      })
      .then(function (r) { if (!r.ok) return r.json().then(function (e) { throw new Error(e.message || "HTTP " + r.status); }); return r.json(); });
  }

  // ── render / filter ──────────────────────────────────────────────────────────
  function applyFilters() {
    var q = fold(el("hv-search").value.trim());
    var pub = el("hv-f-public").checked, dig = el("hv-f-digit").checked, hideImp = el("hv-f-new").checked;
    filtered = entries.filter(function (e) {
      if (pub && SRC.restricted(e)) return false;
      if (dig && !SRC.digitised(e)) return false;
      if (hideImp && isImported(e)) return false;
      if (collFilter && SRC.collectionOf && SRC.collectionOf(e) !== collFilter) return false;
      if (q && fold(SRC.hay(e)).indexOf(q) === -1) return false;
      return true;
    });
    page = 0;
    render();
  }
  function render() {
    var list = el("hv-list");
    if (!filtered.length) { list.innerHTML = '<div class="hv-status">No matching entries.</div>'; el("hv-pager").innerHTML = ""; updateBar(); return; }
    var start = page * PAGE, slice = filtered.slice(start, start + PAGE);
    list.innerHTML = slice.map(function (e, i) {
      var idx = start + i, imp = isImported(e), restr = SRC.restricted(e), zh = SRC.cjk(e);
      var box = (imp || restr) ? '<span title="' + (imp ? "already imported" : "access restricted") + '">' + (imp ? "✓" : "🔒") + '</span>'
                               : '<input type="checkbox" class="hv-cb" data-i="' + idx + '">';
      var rec = SRC.recordUrl(e), view = SRC.viewUrl(e), titleEn = e.title_en || e.title || "(untitled)";
      return '<div class="hv-row' + (imp ? " imported" : "") + '">' +
        '<div>' + box + '</div>' +
        '<div><div class="hv-title">' + esc(titleEn) + (zh ? '<span class="hv-zh">' + esc(zh) + '</span>' : '') + '</div>' +
          '<div class="hv-meta">' + esc(SRC.meta(e)) + '</div></div>' +
        '<div class="hv-badges">' +
          (SRC.digitised(e) ? '<span class="hv-badge img">image</span>' : '') +
          (restr ? '<span class="hv-badge lock">restricted</span>' : '') +
          (imp ? '<span class="hv-badge ok">imported</span>' : '') +
          '<div class="hv-links">' +
            (rec ? '<a href="' + esc(rec) + '" target="_blank" rel="noopener">record ↗</a>' : '') +
            (view && view !== rec ? '<a href="' + esc(view) + '" target="_blank" rel="noopener">view ↗</a>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
    }).join("");
    var pages = Math.ceil(filtered.length / PAGE);
    el("hv-pager").innerHTML =
      '<button class="btn small" id="hv-prev"' + (page <= 0 ? " disabled" : "") + '>← Prev</button>' +
      '<span>' + (page + 1) + ' / ' + pages + '  (' + filtered.length + ' shown)</span>' +
      '<button class="btn small" id="hv-next"' + (page >= pages - 1 ? " disabled" : "") + '>Next →</button>';
    var p = el("hv-prev"), n = el("hv-next");
    if (p) p.onclick = function () { if (page > 0) { page--; render(); window.scrollTo(0, 0); } };
    if (n) n.onclick = function () { if (page < pages - 1) { page++; render(); window.scrollTo(0, 0); } };
    list.querySelectorAll(".hv-cb").forEach(function (cb) { cb.addEventListener("change", updateBar); });
    updateBar();
  }
  function selectedIdxs() {
    return Array.prototype.map.call(document.querySelectorAll(".hv-cb:checked"), function (cb) { return parseInt(cb.dataset.i, 10); });
  }
  function updateBar() {
    var n = selectedIdxs().length;
    el("hv-selcount").textContent = n + " selected";
    el("hv-import-bar").style.display = n ? "flex" : "none";
  }

  function importSelected() {
    if (!token()) { toast("Sign in with a token that can write to epiwen-public.", true); return; }
    var idxs = selectedIdxs();
    if (!idxs.length) return;
    var btn = el("hv-import-btn"); btn.disabled = true;
    var log = el("hv-log"); log.innerHTML = "";
    var ok = 0, fail = 0;
    function step(k) {
      if (k >= idxs.length) {
        btn.disabled = false;
        el("hv-import-status").textContent = "Done — " + ok + " imported" + (fail ? ", " + fail + " failed" : "") + ".";
        listImported().then(function () { applyFilters(); });
        return;
      }
      var e = filtered[idxs[k]], fn = SRC.filename(e);
      el("hv-import-status").textContent = "Importing " + (k + 1) + " / " + idxs.length + "…";
      commit(TARGET.dir + "/" + fn, SRC.gen(e), "Import rubbing: " + fn)
        .then(function () { ok++; log.innerHTML = '✓ ' + esc(fn) + '<br>' + log.innerHTML; imported[SRC.id + "|" + SRC.entryId(e)] = true; })
        .catch(function (err) { fail++; log.innerHTML = '✗ ' + esc(fn) + ' — ' + esc(err.message) + '<br>' + log.innerHTML; })
        .then(function () { setTimeout(function () { step(k + 1); }, 250); });
    }
    step(0);
  }

  function summarize() {
    var total = entries.length;
    var dig = entries.filter(function (e) { return SRC.digitised(e); }).length;
    var imp = entries.filter(isImported).length;
    var when = META.harvested ? ' · harvested ' + esc(META.harvested) +
      (META.harvest_log ? ' (<a href="' + esc(META.harvest_log) + '" target="_blank" rel="noopener">log</a>)' : '') : '';
    el("hv-summary").innerHTML =
      '<b>' + imp + '</b> of <b>' + total + '</b> imported · ' + dig + ' with images · source: ' + SRC.summary + when +
      '. Select entries and import into the public rubbing corpus.';
  }

  // Populate the collection sub-filter for aggregator sources (Japan Search).
  function buildCollectionFilter() {
    var sel = el("hv-collection");
    collFilter = "";
    if (!SRC.collections) { sel.style.display = "none"; sel.innerHTML = ""; return; }
    var counts = {}, labels = {};
    entries.forEach(function (e) {
      var c = SRC.collectionOf(e); if (!c) return;
      counts[c] = (counts[c] || 0) + 1;
      if (!labels[c]) labels[c] = SRC.collectionLabel(e);
    });
    var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    sel.innerHTML = '<option value="">All collections (' + entries.length + ')</option>' +
      keys.map(function (c) {
        return '<option value="' + esc(c) + '">' + esc((labels[c] || c).split(" / ")[0]) + ' (' + counts[c] + ')</option>';
      }).join("");
    sel.style.display = "";
  }

  function loadSource(sid) {
    SRC = SOURCES[sid] || SOURCES.harvard;
    entries = []; filtered = []; page = 0; META = {}; collFilter = "";
    el("hv-list").innerHTML = '<div class="hv-status">Loading ' + esc(SRC.label) + '…</div>';
    el("hv-summary").textContent = "Loading…";
    Promise.all([loadHarvestJson(SRC.file), listImported()]).then(function (res) {
      META = res[0] || {};
      entries = META.entries || [];
      buildCollectionFilter();
      summarize();
      applyFilters();
    }).catch(function (err) {
      el("hv-list").innerHTML = '<div class="hv-status">Could not load ' + esc(SRC.file) + ' — ' + esc(err.message) + '.</div>';
      el("hv-summary").textContent = "Harvest unavailable.";
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    ["hv-search", "hv-f-public", "hv-f-digit", "hv-f-new"].forEach(function (id) {
      var e = el(id); if (e) e.addEventListener(e.type === "search" ? "input" : "change", applyFilters);
    });
    el("hv-import-btn").addEventListener("click", importSelected);
    el("hv-collection").addEventListener("change", function () { collFilter = this.value; applyFilters(); });

    var sel = el("hv-source");
    var want = new URLSearchParams(location.search).get("source");
    if (want && SOURCES[want]) sel.value = want;
    sel.addEventListener("change", function () { loadSource(this.value); });
    loadSource(sel.value);
  });
})();
