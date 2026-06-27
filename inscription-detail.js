/* inscription-detail.js — one cross-catalog inscription authority: canonical title,
 * variant titles, CE date, Wikidata typing, and every 金石學 work that records it
 * (with juan), each linking to literature-work.html?id=. Reads
 * literature-authorities.json + literature.json (for work pinyin). */
(function () {
  "use strict";
  var ID = new URLSearchParams(location.search).get("id");
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function el(id) { return document.getElementById(id); }
  function fact(l, v) { return (v == null || v === "") ? "" : "<dt>" + esc(l) + "</dt><dd>" + v + "</dd>"; }

  function render(a, worksById) {
    var cats = a.catalogs || {};
    var works = Object.keys(cats).map(function (slug) {
      var w = worksById[slug] || {}, c = cats[slug];
      var juan = (c.juan || []).filter(function (v, i, arr) { return arr.indexOf(v) === i; });
      return '<li><a href="literature-work.html?id=' + encodeURIComponent(slug) + '">' + esc(c.title_zh || w.title_zh || slug) + "</a>" +
        (w.title_pinyin ? ' <span class="cd-muted">' + esc(w.title_pinyin) + "</span>" : "") +
        (juan.length ? ' <span class="cd-muted">juan ' + juan.join(", ") + "</span>" : "") +
        (w.dynasty ? ' <span class="cd-muted">· ' + esc(w.dynasty) + "</span>" : "") + "</li>";
    });
    var facts = "";
    facts += fact("Date", a.date ? esc(a.date) + " CE" : "undated");
    facts += fact("Attested in", (a.n_catalogs || works.length) + " catalogue" + ((a.n_catalogs || works.length) === 1 ? "" : "s"));
    if (a.instance_of) facts += fact("Wikidata type (P31)", esc([].concat(a.instance_of).join(", ")));
    if (a.is_stele != null) facts += fact("Is stele", String(a.is_stele) === "true" || a.is_stele === true ? "yes" : "—");
    facts += fact("Variant titles", a.aliases && a.aliases.length ? a.aliases.length : null);

    var links = [];
    if (a.wikidata) links.push('<a class="btn small" href="' + esc(a.wikidata_url || ("https://www.wikidata.org/wiki/" + a.wikidata)) + '" target="_blank" rel="noopener">Wikidata ' + esc(a.wikidata) + " ↗</a>");
    if (a.wikipedia_zh) links.push('<a class="btn small" href="' + esc(a.wikipedia_zh) + '" target="_blank" rel="noopener">Wikipedia ↗</a>');

    el("cd-content").innerHTML =
      '<div class="cd-badges"><span class="cd-badge">inscription concordance</span>' +
        (a.is_stele === true || String(a.is_stele) === "true" ? '<span class="cd-badge cat">碑 stele</span>' : "") + "</div>" +
      "<h1>" + esc(a.main) + "</h1>" +
      '<p class="cd-loc">' + (a.date ? esc(a.date) + " CE · " : "") + (a.n_catalogs || works.length) + " attesting catalogue" + ((a.n_catalogs || works.length) === 1 ? "" : "s") + "</p>" +
      (links.length ? '<div class="cd-links">' + links.join("") + "</div>" : "") +
      "<h3>Recorded in</h3><ul class=\"cd-members\">" + works.join("") + "</ul>" +
      "<h3>Details</h3><dl class=\"cd-facts\">" + facts + "</dl>" +
      (a.aliases && a.aliases.length ? "<h3>Variant titles (異名)</h3><ul class=\"cd-aliases\">" + a.aliases.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "");
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!ID) { el("cd-content").innerHTML = '<p class="catalog-loading">No inscription id given.</p>'; return; }
    Promise.all([
      fetch("literature-authorities.json").then(function (r) { return r.ok ? r.json() : null; }),
      fetch("literature.json").then(function (r) { return r.ok ? r.json() : null; })
    ]).then(function (res) {
      var a = ((res[0] && res[0].authorities) || []).filter(function (x) { return x.id === ID; })[0];
      if (!a) { el("cd-content").innerHTML = '<p class="catalog-loading">Inscription “' + esc(ID) + '” not found.</p>'; return; }
      var worksById = {}; ((res[1] && res[1].works) || []).forEach(function (w) { worksById[w.id] = w; });
      document.title = "Epiwen · " + a.main;
      render(a, worksById);
    }).catch(function () { el("cd-content").innerHTML = '<p class="catalog-loading">Could not load the concordance.</p>'; });
  });
})();
