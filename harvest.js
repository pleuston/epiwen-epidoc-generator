/* harvest.js — browse the staged Harvard rubbing harvest and import selected
 * entries into the public rubbing corpus (epiwen-public/collections/rubbings/).
 *
 * Reads  : harvest/harvard-rubbings.json  (from the configured data repo, via EpiData)
 * Imports: generates a rubbing TEI record per selected entry and commits it to
 *          pleuston/epiwen-public with the signed-in user's token. Dedupes against
 *          what is already imported (by Harvard FHCL / HOLLIS id) and skips
 *          access-restricted records. */
(function () {
  "use strict";

  var TARGET = { owner: "pleuston", repo: "epiwen-public", branch: "main", dir: "collections/rubbings" };
  var HARVEST = "harvest/harvard-rubbings.json";
  var PAGE = 100;

  var entries = [], filtered = [], page = 0;
  var importedFhcl = {}, importedHollis = {};   // sets of ids already in the corpus

  function token() { return localStorage.getItem("epiwen_gh_token") || ""; }
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
  function fhclNum(urn) { var m = String(urn || "").match(/FHCL:(\d+)/i); return m ? m[1] : ""; }
  function isRestricted(e) { return e.access === "R"; }
  function isImported(e) {
    return (e.fhcl_urn && importedFhcl[fhclNum(e.fhcl_urn)]) || (e.hollis && importedHollis[e.hollis]) || false;
  }

  // ── GitHub helpers (write to epiwen-public with the user's token) ───────────
  function ghHeaders() {
    return { "Authorization": "Bearer " + token(), "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  }
  function listImported() {
    var url = "https://api.github.com/repos/" + TARGET.owner + "/" + TARGET.repo +
      "/contents/" + TARGET.dir + "?ref=" + encodeURIComponent(TARGET.branch) + "&_t=" + (new Date().getTime());
    return fetch(url, { headers: ghHeaders(), cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        (Array.isArray(list) ? list : []).forEach(function (f) {
          var hv = f.name.match(/_rubbing_HV(\d+)\.xml$/i);
          if (hv) importedFhcl[hv[1]] = true;
          var ho = f.name.match(/_rubbing_(\d+)\.xml$/);
          if (ho) importedHollis[ho[1]] = true;
        });
      })
      .catch(function () {});
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

  // ── Record generation ───────────────────────────────────────────────────────
  function slug(s) {
    return String(s || "rubbing").normalize("NFKD").replace(/[^\w]+/g, "_")
      .replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "rubbing";
  }
  function filenameFor(e) {
    var id = e.fhcl_urn ? ("HV" + fhclNum(e.fhcl_urn)) : (e.hollis || fhclNum(e.via_id) || "x");
    return slug(e.title) + "_rubbing_" + id + ".xml";
  }
  function cjkTitle(e) {
    var all = e.titles_all || [];
    for (var i = 0; i < all.length; i++) if (/[㐀-鿿]/.test(all[i])) return all[i];
    return "";
  }
  function tag(name, val, attrs) {
    if (!val) return "";
    return "<" + name + (attrs || "") + ">" + esc(val) + "</" + name + ">";
  }
  function genXml(e) {
    var zh = cjkTitle(e);
    var img = e.drs_file_id ? ("https://mps.lib.harvard.edu/assets/images/drs:" + e.drs_file_id + "/full/,1000/0/default.jpg") : "";
    var lic = isRestricted(e)
      ? "Harvard Library — access restricted; see the source record"
      : "Harvard Library digital collections — open access";
    var refs = "";
    if (e.record_url)    refs += "\n              <bibl><ref type=\"record\" target=\"" + esc(e.record_url) + "\">Harvard Library record</ref></bibl>";
    if (e.iiif_manifest) refs += "\n              <bibl><ref type=\"iiif-manifest\" target=\"" + esc(e.iiif_manifest) + "\">IIIF manifest (deep-zoom)</ref></bibl>";
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
'<?xml-model href="https://www.stoa.org/epidoc/schema/latest/tei-epidoc.rng" schematypens="http://relaxng.org/ns/structure/1.0"?>\n' +
'<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:lang="en">\n' +
'  <teiHeader>\n    <fileDesc>\n      <titleStmt>\n' +
'        ' + tag("title", e.title || "Rubbing", ' xml:lang="en"') + '\n' +
(zh ? '        ' + tag("title", zh, ' xml:lang="zh-Hant"') + '\n' : '') +
'        <editor role="editor">Epiwen import</editor>\n      </titleStmt>\n' +
'      <publicationStmt>\n        <authority>Epiwen / Altergraphy</authority>\n' +
'        <idno type="filename">' + esc(filenameFor(e)) + '</idno>\n' +
'        <availability><licence target="https://library.harvard.edu/digital-collections">' + esc(lic) + '</licence></availability>\n' +
'      </publicationStmt>\n      <sourceDesc>\n        <msDesc type="rubbing">\n          <msIdentifier>\n' +
'            <country>United States</country>\n            <settlement>Cambridge, MA</settlement>\n' +
'            ' + tag("repository", e.repository || "Harvard-Yenching Library, Harvard University") + '\n' +
(e.hollis ? '            <idno type="hollis">' + esc(e.hollis) + '</idno>\n' : '') +
(e.shelf ? '            <idno type="shelf">' + esc(e.shelf) + '</idno>\n' : '') +
'          </msIdentifier>\n          <msContents>\n            ' + (tag("summary", e.abstract) || "<summary/>") + '\n          </msContents>\n' +
'          <physDesc>\n            <objectDesc form="拓本">\n              <supportDesc><support><objectType>拓片 · ink rubbing on paper</objectType></support></supportDesc>\n            </objectDesc>\n          </physDesc>\n' +
'          <history><origin>' + (tag("origDate", e.date) || "<origDate/>") + '</origin></history>\n' +
'          <additional>\n            <listBibl>' + refs + '\n            </listBibl>\n          </additional>\n' +
'        </msDesc>\n      </sourceDesc>\n    </fileDesc>\n' +
'    <profileDesc><langUsage><language ident="zh">Literary Chinese 漢文</language></langUsage></profileDesc>\n' +
'    <revisionDesc>\n      <change when="' + new Date().toISOString().slice(0, 10) + '" who="#epiwen">Imported from Harvard LibraryCloud (' + esc(e.fhcl_urn || e.hollis || "") + ') via the Epiwen rubbing harvest; images served live from Harvard IIIF.</change>\n    </revisionDesc>\n' +
'  </teiHeader>\n' +
(img ? '  <facsimile>\n    <graphic url="' + esc(img) + '"/>\n  </facsimile>\n' : '') +
'  <text><body><div type="edition"><p>Ink rubbing — see the IIIF manifest for the full deep-zoom images.</p></div></body></text>\n' +
'</TEI>\n';
  }

  // ── Rendering ────────────────────────────────────────────────────────────────
  function applyFilters() {
    var q = el("hv-search").value.trim().toLowerCase();
    var pub = el("hv-f-public").checked, dig = el("hv-f-digit").checked, hideImp = el("hv-f-new").checked;
    filtered = entries.filter(function (e) {
      if (pub && e.access === "R") return false;
      if (dig && !e.digitised) return false;
      if (hideImp && isImported(e)) return false;
      if (q) {
        var hay = (e.title + " " + (e.titles_all || []).join(" ") + " " + e.date + " " + e.shelf + " " + e.hollis).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
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
      var idx = start + i, imp = isImported(e), restr = isRestricted(e);
      var box = (imp || restr) ? '<span title="' + (imp ? "already imported" : "access restricted") + '">' + (imp ? "✓" : "🔒") + '</span>'
                               : '<input type="checkbox" class="hv-cb" data-i="' + idx + '">';
      return '<div class="hv-row' + (imp ? " imported" : "") + '">' +
        '<div>' + box + '</div>' +
        '<div><div class="hv-title">' + esc(e.title || "(untitled)") + '</div>' +
          '<div class="hv-meta">' + esc(e.date || "") + (e.shelf ? " · " + esc(e.shelf) : "") +
            (e.hollis ? " · HOLLIS " + esc(e.hollis) : "") + (e.culture ? " · " + esc(e.culture) : "") + '</div></div>' +
        '<div class="hv-badges">' +
          (e.digitised ? '<span class="hv-badge img">IIIF</span>' : '') +
          (restr ? '<span class="hv-badge lock">restricted</span>' : (e.access === "P" ? '<span class="hv-badge ok">public</span>' : '')) +
          (imp ? '<span class="hv-badge ok">imported</span>' : '') +
          '<div class="hv-links">' +
            (e.record_url ? '<a href="' + esc(e.record_url) + '" target="_blank" rel="noopener">record ↗</a>' : '') +
            (e.iiif_manifest ? '<a href="viewer.html?manifest=' + encodeURIComponent(e.iiif_manifest) + '" target="_blank" rel="noopener">view ↗</a>' : '') +
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
        listImported().then(function () { applyFilters(); });   // refresh imported state
        return;
      }
      var e = filtered[idxs[k]], fn = filenameFor(e);
      el("hv-import-status").textContent = "Importing " + (k + 1) + " / " + idxs.length + "…";
      commit(TARGET.dir + "/" + fn, genXml(e), "Import rubbing: " + fn)
        .then(function () { ok++; log.innerHTML = '✓ ' + esc(fn) + '<br>' + log.innerHTML;
          if (e.fhcl_urn) importedFhcl[fhclNum(e.fhcl_urn)] = true; if (e.hollis) importedHollis[e.hollis] = true; })
        .catch(function (err) { fail++; log.innerHTML = '✗ ' + esc(fn) + ' — ' + esc(err.message) + '<br>' + log.innerHTML; })
        .then(function () { setTimeout(function () { step(k + 1); }, 250); });
    }
    step(0);
  }

  function summarize() {
    var total = entries.length;
    var pub = entries.filter(function (e) { return e.access === "P"; }).length;
    var dig = entries.filter(function (e) { return e.digitised; }).length;
    var imp = entries.filter(isImported).length;
    el("hv-summary").innerHTML =
      '<b>' + imp + '</b> of <b>' + total + '</b> imported · ' + dig + ' digitised · ' + pub + ' public · ' +
      'source: <a href="https://library.harvard.edu/digital-collections" target="_blank" rel="noopener">Harvard LibraryCloud</a>. ' +
      'Select entries and import into the public rubbing corpus.';
  }

  document.addEventListener("DOMContentLoaded", function () {
    ["hv-search", "hv-f-public", "hv-f-digit", "hv-f-new"].forEach(function (id) {
      var e = el(id); if (e) e.addEventListener(e.type === "search" ? "input" : "change", applyFilters);
    });
    el("hv-import-btn").addEventListener("click", importSelected);

    Promise.all([
      EpiData.json(HARVEST).catch(function (err) { throw new Error("Could not load " + HARVEST + " — " + err.message + " (are you signed in with access to the data repo?)"); }),
      listImported()
    ]).then(function (res) {
      entries = (res[0] && res[0].entries) || [];
      summarize();
      applyFilters();
    }).catch(function (err) {
      el("hv-list").innerHTML = '<div class="hv-status">' + esc(err.message) + '</div>';
      el("hv-summary").textContent = "Harvest unavailable.";
    });
  });
})();
