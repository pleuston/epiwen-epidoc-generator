/* source-detail.js — one premodern epigraphy work (source.html?id=…).
 * Reads the work from premodern.json (app repo, no auth), renders its metadata +
 * SKSLXB placement + Kuhn & Stahl catalogue concordances, links into the SKSLXB
 * contents page, and — where the Epiwen bibliography holds a matching entry —
 * links those (default corpus + token-gated backend, via EpiData). */
(function () {
  "use strict";
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function el(id) { return document.getElementById(id); }
  var ID = new URLSearchParams(location.search).get("id");
  var SERIES_ZH = { 1: "第一輯", 2: "第二輯", 3: "第三輯", 4: "第四輯" };
  var CAT_LABEL = { HY: "Harvard-Yenching 哈佛燕京", LC: "LC", UC: "UC", FZ: "方志 gazetteer", SKTBSY: "SKTBSY" };

  function fact(label, val) {
    if (val == null || val === "" || val === false) return "";
    return "<dt>" + esc(label) + "</dt><dd>" + val + "</dd>";
  }
  function yesno(v) { return v === true ? "yes" : v === false ? "no" : v == null ? "" : esc(v); }

  function catRefs(cat) {
    if (!cat) return "";
    var parts = [];
    Object.keys(cat).forEach(function (k) {
      var v = cat[k];
      if (v == null || v === "" || v === false) return;
      var lbl = CAT_LABEL[k] || k;
      parts.push('<span title="' + esc(lbl) + '"><b>' + esc(k) + "</b> " + (v === true ? "✓" : "<code>" + esc(v) + "</code>") + "</span>");
    });
    return parts.join(" &nbsp; ");
  }

  function render(c, biblio) {
    var sub = [];
    if (c.title_pinyin) sub.push(esc(c.title_pinyin));
    if (c.author_zh || c.author_pinyin) sub.push(esc(c.author_zh || c.author_pinyin) + (c.author_dates ? " (" + esc(c.author_dates) + ")" : ""));
    var tags = (c.in_skslxb
      ? '<span class="cd-tag agg" title="' + esc(c.source || "") + '">石刻史料新編 ' + (SERIES_ZH[c.skslxb_series] || "") + "</span>"
      : '<span class="cd-tag inst">premodern epigraphy work</span>');

    // ── SKSLXB placement ──
    var sk = "";
    if (c.in_skslxb) {
      var dl = fact("Series 輯", (SERIES_ZH[c.skslxb_series] || c.skslxb_series) + " (" + c.skslxb_series + ")") +
        fact("Locator", c.skslxb_locator ? "<code>" + esc(c.skslxb_locator) + "</code> <span class=\"cd-note\">series.volume:page</span>" : "<span class=\"cd-note\">series only — precise locator unresolved</span>") +
        fact("Pages", c.skslxb_pages ? esc(c.skslxb_pages) : "") +
        fact("K&S page", c.ks_page ? "p. " + esc(c.ks_page) : "") +
        fact("K&S date", c.ks_date ? esc(c.ks_date) : "");
      var refs = catRefs(c.catalogue);
      if (refs) dl += "<dt>Concordances</dt><dd>" + refs + "</dd>";
      sk = '<h3>石刻史料新編 (SKSLXB) placement</h3><dl class="cd-facts">' + dl + "</dl>" +
        '<p style="margin:.7rem 0 0"><a class="cd-back" style="margin:0" href="skslxb.html?series=' + c.skslxb_series + "#" + encodeURIComponent(c.id) + '">View in 石刻史料新編 contents →</a></p>';
    }

    // ── bibliography matches ──
    var bib = "";
    if (biblio && biblio.length) {
      bib = '<h3>Bibliography</h3><ul class="cd-biblio">' + biblio.map(function (b) {
        var cite = [b.author && (Array.isArray(b.author) ? b.author.join(", ") : b.author), b.year, b.title || b.title_zh || b.reference]
          .filter(Boolean).join(". ");
        return "<li><a href=\"bibliography.html?q=" + encodeURIComponent(c.title_zh || "") + "\">" + esc(cite || b.key) + "</a>" +
          (b.title_zh && b.title_zh !== b.title ? ' <span class="ct-zh">' + esc(b.title_zh) + "</span>" : "") + "</li>";
      }).join("") + "</ul>";
    }

    var vault = c.vault_page ? '<h3>Source notes</h3><p class="cd-note">Vault work page: ' + esc(c.vault_page) +
      ". Catalogue concordances and dates are from Kuhn &amp; Stahl 1991, an annotated bibliography of 石刻史料新編. No paratexts (序/跋/提要) are included.</p>" : "";

    el("cd-content").innerHTML =
      "<h1>" + esc(c.title_zh || c.title_pinyin || "(untitled)") + "</h1>" +
      (sub.length ? '<p class="cd-sub">' + sub.join(" · ") + "</p>" : "") +
      '<div class="cd-tags">' + tags + "</div>" +
      '<h3>Work</h3><dl class="cd-facts">' +
        fact("Title 著作", esc(c.title_zh || "") + (c.title_pinyin ? ' <span class="ct-zh">' + esc(c.title_pinyin) + "</span>" : "")) +
        fact("Author 撰者", esc(c.author_zh || c.author_pinyin || "")) +
        fact("Dates", c.author_dates ? esc(c.author_dates) : "") +
        fact("Dynasty", c.dynasty ? esc(c.dynasty) : "") +
        fact("Juan 卷", c.juan ? c.juan : "") +
        fact("Period covered", c.period_covered ? esc(c.period_covered) : "") +
        fact("Transcriptions", c.transcriptions ? esc(c.transcriptions) : "") +
        fact("Epitaphs 墓誌", c.has_epitaphs != null ? yesno(c.has_epitaphs) : "") +
      "</dl>" + sk + bib + vault;
  }

  // load the Epiwen bibliography (default corpus + token-gated backend) and keep
  // entries whose Chinese title contains this work's title.
  function loadBiblio(c) {
    if (!c.title_zh || c.title_zh.length < 2) return Promise.resolve([]);
    function asArr(b) { return Array.isArray(b) ? b : (b && (b.entries || b.items)) || []; }
    var def = fetch("corpus/biblio-index.json").then(function (r) { return r.ok ? r.json() : []; }).then(asArr).catch(function () { return []; });
    var back = (window.EpiData && EpiData.token && EpiData.token())
      ? EpiData.json("data/biblio-index.json").then(asArr).catch(function () { return []; })
      : Promise.resolve([]);
    return Promise.all([def, back]).then(function (rs) {
      var byKey = {};
      rs[0].concat(rs[1]).forEach(function (b) { if (b && b.key) byKey[b.key] = b; });
      var t = c.title_zh;
      return Object.keys(byKey).map(function (k) { return byKey[k]; }).filter(function (b) {
        var z = b.title_zh || b.title || "";
        return z && z.indexOf(t) !== -1;
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!ID) { el("cd-content").innerHTML = '<p class="catalog-loading">No work id given.</p>'; return; }
    fetch("premodern.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var c = ((d && d.works) || []).filter(function (x) { return x.id === ID; })[0];
      if (!c) { el("cd-content").innerHTML = '<p class="catalog-loading">Work “' + esc(ID) + '” not found.</p>'; return; }
      document.title = "Epiwen · " + (c.title_zh || c.title_pinyin || "Source");
      render(c, []);
      loadBiblio(c).then(function (bib) { if (bib.length) render(c, bib); }).catch(function () {});
    }).catch(function () { el("cd-content").innerHTML = '<p class="catalog-loading">Could not load premodern.json.</p>'; });
  });
})();
