/* corpus-detail.js — one modern epigraphic corpus (corpus.html?id=…).
 * Reads modern-corpora.json (app repo, no auth): full metadata, geographic
 * placement, and library-holdings links (StaBiKat / HOLLIS / K10plus) by ISBN or
 * title, plus the web-fan-out evidence source where applicable. */
(function () {
  "use strict";
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function el(id) { return document.getElementById(id); }
  var ID = new URLSearchParams(location.search).get("id");
  var SER_ZH = { 1: "第一輯", 2: "第二輯", 3: "第三輯", 4: "第四輯" };

  function fact(label, val) {
    if (val == null || val === "") return "";
    return "<dt>" + esc(label) + "</dt><dd>" + val + "</dd>";
  }
  function catLink(r, lib) {
    var has = !!(r.isbn && r.isbn[0]), q = has ? r.isbn[0] : (r.title_zh || "");
    if (lib === "sbb") return "https://stabikat.de/Search/Results?lookfor=" + encodeURIComponent(q) + "&type=" + (has ? "ISN" : "AllFields");
    if (lib === "k10") return "https://opac.k10plus.de/DB=2.1/CMD?ACT=SRCHA&IKT=" + (has ? "7" : "1016") + "&TRM=" + encodeURIComponent(q);
    if (lib === "harvard") return "https://hollis.harvard.edu/primo-explore/search?query=any,contains," + encodeURIComponent(q) + "&tab=everything&search_scope=everything&vid=HVD2&mode=basic";
    return "#";
  }

  function render(r) {
    var sub = [];
    if (r.title_pinyin) sub.push(esc(r.title_pinyin));
    if (r.author) sub.push(esc(r.author.replace(/\s*\([^)]*\)/g, "")));

    var secLabel = r.section === "national" ? "全國 national"
      : r.section === "site" ? (r.category || "site")
      : (r.region ? r.region + (r.province ? " › " + r.province : "") : (r.province || "province"));
    var tags = '<span class="cd-tag">' + esc(secLabel) + "</span>" +
      (r.gapfill ? '<span class="cd-tag">✚ gap-fill</span>' : "") +
      (r.web ? '<span class="cd-tag web">' + (r.web_verified ? "web ✓ verified" : "web") + "</span>" : "");

    var placePath = [r.region, r.province, r.locality].filter(Boolean).join(" › ")
      || (r.section === "national" ? "全國 (national / multi-province)" : (r.site || "—"));

    var facts = '<dl class="cd-facts">' +
      fact("Title 書名", esc(r.title_zh || "") + (r.title_pinyin ? ' <span class="cd-note">' + esc(r.title_pinyin) + "</span>" : "")) +
      fact("Author 編者", r.author ? esc(r.author) : "") +
      fact("Year 年", r.year ? esc(r.year) : "") +
      fact("Publisher 出版", r.publisher ? esc(r.publisher) : "") +
      fact("Place 地點", esc(placePath) + (r.admin ? ' <span class="cd-note">(' + esc(r.admin) + ")</span>" : "")) +
      fact("In SKSLXB 輯", r.skslxb_series ? (SER_ZH[r.skslxb_series] || r.skslxb_series) : "") +
      fact("ISBN", (r.isbn && r.isbn.length) ? r.isbn.map(function (x) { return "<code>" + esc(x) + "</code>"; }).join(" ") : "") +
      "</dl>";

    var desc = r.scope ? '<h3>Description 提要</h3><p>' + esc(r.scope) + "</p>" : "";

    // holdings + catalogue links
    var h = r.holdings || {}, hl = [];
    if (h.harvard) hl.push('<a class="harvard" target="_blank" rel="noopener" href="' + esc(catLink(r, "harvard")) + '">Harvard-Yenching (HOLLIS) ↗</a>');
    if (h.sbb) hl.push('<a class="sbb" target="_blank" rel="noopener" href="' + esc(catLink(r, "sbb")) + '">Staatsbibliothek zu Berlin (StaBiKat) ↗</a>');
    if (h.k10plus) hl.push('<a class="k10" target="_blank" rel="noopener" href="' + esc(catLink(r, "k10")) + '">K10plus union catalogue ↗</a>');
    if (h.vault) hl.push('<span class="vault">already in vault</span>');
    var holdings = hl.length ? '<h3>Holdings</h3><div class="cd-hold">' + hl.join("") + "</div>" +
      '<p class="cd-note">Catalogue links search by ISBN where available, else by title.</p>' : "";

    var ev = r.evidence ? String(r.evidence).match(/https?:\/\/[^\s)]+/) : null;
    var evidence = r.web ? '<h3>Source</h3><p class="cd-note">' +
      (r.web_verified ? "Verified against an online source. " : "Discovered by a web fan-out (verification pending). ") +
      (ev ? '<a href="' + esc(ev[0]) + '" target="_blank" rel="noopener">' + esc(ev[0]) + " ↗</a>" : esc(r.evidence || "")) + "</p>" : "";

    el("cd-content").innerHTML =
      "<h1>" + esc(r.title_zh || "?") + "</h1>" +
      (sub.length ? '<p class="cd-sub">' + sub.join(" · ") + "</p>" : "") +
      '<div class="cd-tags">' + tags + "</div>" +
      "<h3>Work</h3>" + facts + desc + holdings + evidence;
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!ID) { el("cd-content").innerHTML = '<p class="catalog-loading">No corpus id given.</p>'; return; }
    fetch("modern-corpora.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var r = ((d && d.corpora) || []).filter(function (x) { return x.id === ID; })[0];
      if (!r) { el("cd-content").innerHTML = '<p class="catalog-loading">Corpus “' + esc(ID) + '” not found.</p>'; return; }
      document.title = "Epiwen · " + (r.title_zh || "Corpus");
      render(r);
    }).catch(function () { el("cd-content").innerHTML = '<p class="catalog-loading">Could not load modern-corpora.json.</p>'; });
  });
})();
