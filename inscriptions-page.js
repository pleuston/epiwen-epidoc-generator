/* inscriptions-page.js — the cross-catalog inscription concordance (1,698 records).
 * A period tree (left, from CE date) filters a sortable table (right); each row
 * links to inscription.html?id=<id> (aliases, date, attesting 金石學 works, Wikidata).
 * Reads literature-authorities.json (app repo, relative, no auth). */
(function () {
  "use strict";
  var all = [], sel = null, sortKey = "n", sortDir = "desc";
  var PERIODS = [
    ["Han 漢 (–219)", function (y) { return y != null && y < 220; }],
    ["Six Dynasties 魏晉南北朝 (220–588)", function (y) { return y >= 220 && y < 589; }],
    ["Sui–Tang 隋唐 (589–906)", function (y) { return y >= 589 && y < 907; }],
    ["Song–Jin 宋遼金 (907–1279)", function (y) { return y >= 907 && y < 1280; }],
    ["Yuan+ 元明清 (1280–)", function (y) { return y >= 1280; }],
    ["undated", function (y) { return y == null; }]
  ];
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function fold(s) { return window.EpiVariants ? EpiVariants.fold(s) : String(s == null ? "" : s).toLowerCase(); }
  function el(id) { return document.getElementById(id); }
  function yr(c) { var n = parseInt(c.date, 10); return isNaN(n) ? null : n; }
  function periodOf(c) { var y = yr(c); for (var i = 0; i < PERIODS.length; i++) if (PERIODS[i][1](y)) return PERIODS[i][0]; return "undated"; }

  function renderTree() {
    var box = el("ct-tree"); box.innerHTML = "";
    function row(label, count, active, onClick) {
      var r = document.createElement("div");
      r.className = "ct-row" + (active ? " active" : "");
      r.innerHTML = '<span class="ct-caret leaf">▶</span><span class="ct-label">' + esc(label) + '</span><span class="ct-count">' + count + "</span>";
      r.addEventListener("click", onClick); return r;
    }
    var rootR = row("All inscriptions", all.length, !sel, function () { setFilter(null, rootR); });
    box.appendChild(rootR);
    var byp = {}; all.forEach(function (c) { var p = periodOf(c); (byp[p] = byp[p] || []).push(c); });
    PERIODS.forEach(function (P) {
      var p = P[0]; if (!byp[p]) return;
      var r = row(p, byp[p].length, sel === p, function () { setFilter(p, r); });
      box.appendChild(r);
    });
  }
  function setFilter(p, r) {
    sel = p;
    document.querySelectorAll(".ct-row.active").forEach(function (x) { x.classList.remove("active"); });
    if (r) r.classList.add("active");
    el("ct-search").value = ""; render();
  }

  var COLS = [
    { label: "Inscription", key: "name" },
    { label: "Date (CE)", key: "date", num: true },
    { label: "Catalogues", key: "n", num: true },
    { label: "Wikidata", key: null }
  ];
  function sortVal(c, k) {
    if (k === "n") return c.n_catalogs || 0;
    if (k === "date") { var y = yr(c); return y == null ? 999999 : y; }
    if (k === "name") return fold(c.main || "");
    return "";
  }
  function cmp(a, b) {
    var va = sortVal(a, sortKey), vb = sortVal(b, sortKey), r;
    r = (typeof va === "number") ? va - vb : String(va).localeCompare(String(vb));
    if (r === 0) r = (b.n_catalogs || 0) - (a.n_catalogs || 0);
    return sortDir === "desc" ? -r : r;
  }
  function rowHtml(c) {
    return "<tr>" +
      '<td><div class="ct-name"><a href="inscription.html?id=' + encodeURIComponent(c.id) + '">' + esc(c.main) + "</a></div>" +
        (c.aliases && c.aliases.length ? '<div class="ct-city">' + c.aliases.length + " alias" + (c.aliases.length === 1 ? "" : "es") + "</div>" : "") + "</td>" +
      '<td class="num">' + (yr(c) != null ? yr(c) : "—") + "</td>" +
      '<td class="num">' + (c.n_catalogs || 0) + "</td>" +
      "<td>" + (c.wikidata ? '<a href="' + esc(c.wikidata_url || ("https://www.wikidata.org/wiki/" + c.wikidata)) + '" target="_blank" rel="noopener">' + esc(c.wikidata) + " ↗</a>" : "—") + "</td>" +
      "</tr>";
  }
  function render() {
    var q = fold(el("ct-search").value.trim());
    var list = all.filter(function (c) { return !sel || periodOf(c) === sel; });
    if (q) list = list.filter(function (c) { return fold((c.main || "") + " " + (c.aliases || []).join(" ")).indexOf(q) !== -1; });
    list.sort(cmp);
    el("coll-title").textContent = sel || "All inscriptions";
    var dated = list.filter(function (c) { return yr(c) != null; }).length;
    el("coll-crumb").textContent = list.length.toLocaleString() + " inscription" + (list.length === 1 ? "" : "s") + " · " + dated.toLocaleString() + " dated";
    if (!list.length) { el("coll-cards").innerHTML = '<p class="catalog-loading">No inscriptions here.</p>'; return; }
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
      else { sortKey = k; sortDir = (k === "n" || k === "date") ? (k === "date" ? "asc" : "desc") : "asc"; }
      render();
    });
    fetch("literature-authorities.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      all = (d && d.authorities) || [];
      renderTree(); render();
    }).catch(function () { el("ct-tree").innerHTML = '<div class="catalog-loading">Could not load the concordance.</div>'; });
  });
})();
