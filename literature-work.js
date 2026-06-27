/* literature-work.js — one 金石學 work: metadata, 序/跋/四庫提要 excerpts, and its
 * 目錄 (inscription list, paginated + search-within). Reads literature.json (meta)
 * + literature/toc/<id>.json (excerpts + inscriptions). Rows cross-link to the
 * inscription concordance (inscription.html?id=) where matched. */
(function () {
  "use strict";
  var ID = new URLSearchParams(location.search).get("id");
  var PAGE = 100;
  var rows = [], filtered = [], page = 0;

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function fold(s) { return window.EpiVariants ? EpiVariants.fold(s) : String(s == null ? "" : s).toLowerCase(); }
  function el(id) { return document.getElementById(id); }
  function fact(l, v) { return (v == null || v === "") ? "" : "<dt>" + esc(l) + "</dt><dd>" + v + "</dd>"; }

  function renderTocPage() {
    var box = el("lw-toc-body"); if (!box) return;
    var start = page * PAGE, slice = filtered.slice(start, start + PAGE);
    if (!filtered.length) { box.innerHTML = '<p class="catalog-loading">No matching entries.</p>'; el("lw-pager").innerHTML = ""; return; }
    box.innerHTML = '<table class="lw-table"><thead><tr><th>#</th><th>Inscription</th><th>Juan</th><th>WYG / SBCK</th><th>Note</th></tr></thead><tbody>' +
      slice.map(function (r) {
        var t = r.authority ? '<a href="inscription.html?id=' + encodeURIComponent(r.authority) + '">' + esc(r.title) + "</a>" : esc(r.title);
        var anchor = [r.wyg, r.sbck].filter(Boolean).join(" / ");
        return "<tr><td class=\"num\">" + (r.seq != null ? r.seq : "") + "</td><td>" + t +
          (r.location ? ' <span class="lw-attr">' + esc(r.location) + "</span>" : "") + "</td>" +
          "<td class=\"num\">" + (r.juan != null ? r.juan : "") + "</td>" +
          "<td>" + (anchor ? "<code>" + esc(anchor) + "</code>" : "") + "</td>" +
          '<td class="lw-attr">' + esc(r.attribution || "") + "</td></tr>";
      }).join("") + "</tbody></table>";
    var pages = Math.ceil(filtered.length / PAGE);
    el("lw-pager").innerHTML = pages > 1
      ? '<button class="btn small" id="lw-prev"' + (page <= 0 ? " disabled" : "") + ">← Prev</button>" +
        "<span>" + (page + 1) + " / " + pages + " (" + filtered.length.toLocaleString() + " entries)</span>" +
        '<button class="btn small" id="lw-next"' + (page >= pages - 1 ? " disabled" : "") + ">Next →</button>"
      : "<span>" + filtered.length.toLocaleString() + " entries</span>";
    var pv = el("lw-prev"), nx = el("lw-next");
    if (pv) pv.onclick = function () { if (page > 0) { page--; renderTocPage(); } };
    if (nx) nx.onclick = function () { page++; renderTocPage(); };
  }
  function applyToc() {
    var q = fold(el("lw-toc-q").value.trim());
    filtered = q ? rows.filter(function (r) { return fold((r.title || "") + " " + (r.attribution || "") + " " + (r.location || "")).indexOf(q) !== -1; }) : rows.slice();
    page = 0; renderTocPage();
  }

  function render(w, data) {
    var linked = (data.inscriptions || []).filter(function (r) { return r.authority; }).length;
    var kindBadge = w.kind === "gazetteer"
      ? '<span class="cd-badge gaz">' + esc(w.subcategory || "gazetteer") + "</span>"
      : '<span class="cd-badge cat">catalogue</span>';
    var facts = "";
    facts += fact("Author", (esc(w.author_en || "") + (w.author_zh ? " " + esc(w.author_zh) : "")).trim() || "—");
    facts += fact("Dynasty", esc(w.dynasty));
    facts += fact("Inscriptions recorded", (w.inscriptions_count || 0).toLocaleString());
    facts += fact("Cross-linked to concordance", linked ? linked.toLocaleString() + " of " + (w.inscriptions_count || 0).toLocaleString() : null);
    facts += fact("Kanripo ID", w.kr_id ? "<code>" + esc(w.kr_id) + "</code>" : null);
    facts += fact("Parser", w.parser ? "<code>" + esc(w.parser) + "</code>" : null);
    facts += fact("Source", "Kanripo 四庫全書 (WYG + SBCK)" + (w.kind === "gazetteer" ? " — best-effort mention extraction" : ""));

    var excerpts = (data.excerpts || []).map(function (e, i) {
      return '<details class="lw-excerpt"' + (i === 0 ? " open" : "") + "><summary>" + esc(e.name) + '</summary><div class="lw-body">' + esc(e.text) + "</div></details>";
    }).join("");

    el("cd-content").innerHTML =
      '<div class="cd-badges">' + kindBadge + (w.overlap_note ? '<span class="cd-badge gaz" title="' + esc(w.overlap_note) + '">⚠ aggregating witness</span>' : "") + "</div>" +
      "<h1>" + esc(w.title_zh) + (w.title_pinyin ? ' <span class="cd-zh">' + esc(w.title_pinyin) + "</span>" : "") + "</h1>" +
      '<p class="cd-loc">' + [esc(w.author_en || w.author_zh || ""), esc(w.dynasty || "")].filter(Boolean).join(" · ") + "</p>" +
      "<h3>Details</h3><dl class=\"cd-facts\">" + facts + "</dl>" +
      (excerpts ? "<h3>序 / 跋 / 四庫提要</h3>" + excerpts : "") +
      "<h3>目錄 — recorded inscriptions</h3>" +
      '<div class="lw-toc-bar"><input type="search" id="lw-toc-q" placeholder="Search within this 目錄…" /></div>' +
      '<div id="lw-toc-body"></div><div class="lw-pager" id="lw-pager"></div>';

    rows = data.inscriptions || []; filtered = rows.slice();
    el("lw-toc-q").addEventListener("input", applyToc);
    renderTocPage();
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!ID) { el("cd-content").innerHTML = '<p class="catalog-loading">No work id given.</p>'; return; }
    Promise.all([
      fetch("literature.json").then(function (r) { return r.ok ? r.json() : null; }),
      fetch("literature/toc/" + encodeURIComponent(ID) + ".json").then(function (r) { return r.ok ? r.json() : null; })
    ]).then(function (res) {
      var w = ((res[0] && res[0].works) || []).filter(function (x) { return x.id === ID; })[0];
      if (!w) { el("cd-content").innerHTML = '<p class="catalog-loading">Work “' + esc(ID) + '” not found.</p>'; return; }
      document.title = "Epiwen · " + w.title_zh;
      render(w, res[1] || { excerpts: [], inscriptions: [] });
    }).catch(function () { el("cd-content").innerHTML = '<p class="catalog-loading">Could not load the work.</p>'; });
  });
})();
