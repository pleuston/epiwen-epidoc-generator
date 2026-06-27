/* literature-page.js — browser for the 金石學 epigraphic-literature works.
 * A dynasty tree (left) filters a sortable works table (right); each row links to
 * literature-work.html?id=<id> (the work's 序/跋/提要 + its 目錄). Reads
 * literature.json (app repo, relative, no auth). Forked from collections-page.js. */
(function () {
  "use strict";
  var all = [], sel = null;                       // sel = dynasty filter or null
  var sortKey = "count", sortDir = "desc";
  var DYN_ORDER = ["Northern Wei 北魏", "Tang 唐", "Song 宋", "Yuan 元", "Ming 明", "Qing 清"];

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function fold(s) { return window.EpiVariants ? EpiVariants.fold(s) : String(s == null ? "" : s).toLowerCase(); }
  function el(id) { return document.getElementById(id); }
  function dynKey(c) { return c.dynasty || "—"; }
  function dynRank(d) { var i = DYN_ORDER.indexOf(d); return i === -1 ? 98 : i; }

  // ── dynasty tree ─────────────────────────────────────────────────────────
  function renderTree() {
    var box = el("ct-tree"); box.innerHTML = "";
    function row(label, count, active, onClick) {
      var r = document.createElement("div");
      r.className = "ct-row" + (active ? " active" : "");
      r.innerHTML = '<span class="ct-caret leaf">▶</span><span class="ct-label">' + esc(label) +
        '</span><span class="ct-count">' + count + "</span>";
      r.addEventListener("click", onClick); return r;
    }
    var rootR = row("All works", all.length, !sel, function () { setFilter(null, rootR); });
    box.appendChild(rootR);
    var byd = {}; all.forEach(function (c) { (byd[dynKey(c)] = byd[dynKey(c)] || []).push(c); });
    Object.keys(byd).sort(function (a, b) { return dynRank(a) - dynRank(b) || a.localeCompare(b); }).forEach(function (d) {
      var r = row(d, byd[d].length, sel === d, function () { setFilter(d, r); });
      box.appendChild(r);
    });
  }
  function setFilter(d, r) {
    sel = d;
    document.querySelectorAll(".ct-row.active").forEach(function (x) { x.classList.remove("active"); });
    if (r) r.classList.add("active");
    el("ct-search").value = ""; render();
  }

  // ── sortable table ─────────────────────────────────────────────────────────
  var COLS = [
    { label: "Work", key: "name" },
    { label: "Author", key: "author" },
    { label: "Dynasty", key: "dynasty" },
    { label: "Inscriptions", key: "count", num: true },
    { label: "Kind", key: "kind" },
    { label: "Source", key: null }
  ];
  function sortVal(c, k) {
    if (k === "count") return c.inscriptions_count || 0;
    if (k === "name") return fold(c.title_pinyin || c.title_zh || "");
    if (k === "author") return fold(c.author_en || c.author_zh || "");
    if (k === "dynasty") return dynRank(dynKey(c));
    if (k === "kind") return c.kind || "";
    return "";
  }
  function cmp(a, b) {
    var va = sortVal(a, sortKey), vb = sortVal(b, sortKey), r;
    r = (typeof va === "number") ? va - vb : String(va).localeCompare(String(vb));
    if (r === 0) r = (b.inscriptions_count || 0) - (a.inscriptions_count || 0);
    return sortDir === "desc" ? -r : r;
  }
  function rowHtml(c) {
    var kind = c.kind === "gazetteer"
      ? '<span class="coll-kind agg" title="' + esc((c.subcategory || "gazetteer") + " — best-effort mention extraction") + '">' + esc(c.subcategory || "gazetteer") + "</span>"
      : '<span class="coll-kind inst">catalogue</span>';
    return "<tr>" +
      '<td><div class="ct-name"><a href="literature-work.html?id=' + encodeURIComponent(c.id) + '">' + esc(c.title_zh) + "</a></div>" +
        (c.title_pinyin ? '<div class="ct-zh">' + esc(c.title_pinyin) + "</div>" : "") +
        (c.overlap_note ? '<div class="ct-city" title="' + esc(c.overlap_note) + '">⚠ aggregating witness</div>' : "") + "</td>" +
      "<td>" + esc(c.author_en || "—") + (c.author_zh ? ' <span class="ct-zh">' + esc(c.author_zh) + "</span>" : "") + "</td>" +
      "<td>" + esc(c.dynasty || "—") + "</td>" +
      '<td class="num">' + (c.inscriptions_count || 0).toLocaleString() + "</td>" +
      "<td>" + kind + "</td>" +
      "<td>" + (c.kr_id ? "<code>" + esc(c.kr_id) + "</code>" : "—") + "</td>" +
      "</tr>";
  }
  function render() {
    var q = fold(el("ct-search").value.trim());
    var list = all.filter(function (c) { return !sel || dynKey(c) === sel; });
    if (q) list = list.filter(function (c) { return fold((c.title_zh || "") + " " + (c.title_pinyin || "") + " " + (c.author_en || "") + " " + (c.author_zh || "")).indexOf(q) !== -1; });
    list.sort(cmp);
    el("coll-title").textContent = sel || "All works";
    var insc = list.reduce(function (s, c) { return s + (c.inscriptions_count || 0); }, 0);
    el("coll-crumb").textContent = list.length + " work" + (list.length === 1 ? "" : "s") +
      " · " + insc.toLocaleString() + " inscriptions recorded";
    if (!list.length) { el("coll-cards").innerHTML = '<p class="catalog-loading">No works here.</p>'; return; }
    var thead = "<thead><tr>" + COLS.map(function (col) {
      if (!col.key) return "<th>" + esc(col.label) + "</th>";
      var arrow = sortKey === col.key ? (sortDir === "desc" ? " ▼" : " ▲") : "";
      return '<th class="sortable" data-key="' + col.key + '">' + esc(col.label) + arrow + "</th>";
    }).join("") + "</tr></thead>";
    el("coll-cards").innerHTML = '<table class="coll-table">' + thead + "<tbody>" + list.map(rowHtml).join("") + "</tbody></table>";
  }

  document.addEventListener("DOMContentLoaded", function () {
    el("ct-search").addEventListener("input", render);
    el("coll-cards").addEventListener("click", function (e) {
      var th = e.target.closest ? e.target.closest("th.sortable") : null;
      if (!th) return;
      var k = th.getAttribute("data-key");
      if (sortKey === k) sortDir = sortDir === "desc" ? "asc" : "desc";
      else { sortKey = k; sortDir = k === "count" ? "desc" : "asc"; }
      render();
    });
    fetch("literature.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      all = (d && d.works) || [];
      renderTree(); render();
    }).catch(function () { el("ct-tree").innerHTML = '<div class="catalog-loading">Could not load literature.json.</div>'; });
  });
})();
