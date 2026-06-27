/* premodern-page.js — searchable register of premodern Chinese epigraphy sources
 * (金石學 works). Left tree facets by 石刻史料新編 (SKSLXB) series / other premodern
 * works; the right pane is a sortable, variant-folded table; each row opens the
 * work's own page (source.html?id=). Reads premodern.json (app repo, no auth). */
(function () {
  "use strict";
  var SERIES_ZH = { 1: "第一輯", 2: "第二輯", 3: "第三輯", 4: "第四輯" };
  var all = [], sel = null;   // sel = {skslxb:bool} or {series:N} or null

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function fold(s) { return window.EpiVariants ? EpiVariants.fold(s) : String(s == null ? "" : s).toLowerCase(); }
  function el(id) { return document.getElementById(id); }

  function matches(c, f) {
    if (!f) return true;
    if (f.skslxb === true && !c.in_skslxb) return false;
    if (f.skslxb === false && c.in_skslxb) return false;
    if (f.series && c.skslxb_series !== f.series) return false;
    return true;
  }
  function locText(c) {
    if (c.skslxb_locator) return c.skslxb_locator;
    if (c.in_skslxb && c.skslxb_series) return SERIES_ZH[c.skslxb_series] || ("輯 " + c.skslxb_series);
    return "";
  }

  // ── tree ─────────────────────────────────────────────────────────────────────
  function node(label, sub, count, depth, onClick, hasChildren) {
    var row = document.createElement("div");
    row.className = "ct-row";
    row.style.paddingLeft = (depth * 0.9) + "rem";
    row.innerHTML = '<span class="ct-caret' + (hasChildren ? "" : " leaf") + '">▶</span>' +
      '<span class="ct-label">' + esc(label) + (sub ? ' <span class="ct-zh">' + esc(sub) + "</span>" : "") +
      '</span><span class="ct-count">' + count + '</span>';
    row.addEventListener("click", onClick);
    return row;
  }
  function renderTree() {
    var box = el("ct-tree"); box.innerHTML = "";
    var nSk = all.filter(function (c) { return c.in_skslxb; }).length;
    var rootRow = node("All works", "", all.length, 0, function () { setFilter(null, rootRow); }, false);
    box.appendChild(rootRow);

    var skWrap = document.createElement("div"); skWrap.className = "ct-node";
    var skKids = document.createElement("div"); skKids.className = "ct-children open";
    var skRow = node("石刻史料新編", "SKSLXB", nSk, 0, function (e) {
      if (e.target.classList.contains("ct-caret")) { toggle(skRow, skKids); }
      else setFilter({ skslxb: true }, skRow);
    }, true);
    skRow.querySelector(".ct-caret").classList.add("open");
    skWrap.appendChild(skRow); skWrap.appendChild(skKids); box.appendChild(skWrap);
    [1, 2, 3, 4].forEach(function (s) {
      var n = all.filter(function (c) { return c.skslxb_series === s; }).length;
      if (!n) return;
      var r = node(SERIES_ZH[s], "series " + s, n, 1, function () { setFilter({ series: s }, r); }, false);
      skKids.appendChild(r);
    });

    var nOther = all.length - nSk;
    if (nOther) {
      var oRow = node("Other premodern works", "", nOther, 0, function () { setFilter({ skslxb: false }, oRow); }, false);
      box.appendChild(oRow);
    }
  }
  function toggle(row, kids) {
    var c = row.querySelector(".ct-caret");
    var open = kids.classList.toggle("open");
    c.classList.toggle("open", open);
  }
  function setFilter(f, row) {
    sel = f;
    document.querySelectorAll(".ct-row.active").forEach(function (r) { r.classList.remove("active"); });
    if (row) row.classList.add("active");
    el("ct-search").value = "";
    render();
  }

  // ── sortable table ─────────────────────────────────────────────────────────
  var sortKey = "title", sortDir = "asc";
  var COLS = [
    { label: "Work 著作", key: "title" },
    { label: "Author 撰者", key: "author" },
    { label: "Dynasty", key: "dynasty" },
    { label: "卷 Juan", key: "juan", num: true },
    { label: "SKSLXB location", key: "loc" },
    { label: "Source", key: null }
  ];
  function sortVal(c, key) {
    if (key === "title") return fold(c.title_zh || c.title_pinyin || "");
    if (key === "author") return fold(c.author_zh || c.author_pinyin || "");
    if (key === "dynasty") return c.dynasty || "~";
    if (key === "juan") return c.juan || 0;
    if (key === "loc") return (c.skslxb_series || 9) + (c.skslxb_locator || "");
    return "";
  }
  function cmp(a, b) {
    var va = sortVal(a, sortKey), vb = sortVal(b, sortKey);
    var p = (typeof va === "number") ? va - vb : String(va).localeCompare(String(vb));
    if (p !== 0) return sortDir === "desc" ? -p : p;
    return fold(a.title_zh || "").localeCompare(fold(b.title_zh || ""));
  }
  function rowHtml(c) {
    var loc = locText(c);
    var locCell = c.skslxb_locator
      ? '<code title="石刻史料新編 ' + esc(loc) + '">' + esc(loc) + "</code>"
      : (loc ? '<span class="pm-series">' + esc(loc) + "</span>" : '<span class="ct-city">—</span>');
    var srcTag = c.in_skslxb
      ? '<span class="coll-kind agg" title="' + esc(c.source || "") + '">SKSLXB</span>'
      : '<span class="coll-kind inst" title="vault epigraphy work page">other</span>';
    return '<tr>' +
      '<td><div class="ct-name"><a href="source.html?id=' + encodeURIComponent(c.id) + '">' + esc(c.title_zh || c.title_pinyin || "(untitled)") + '</a></div>' +
        (c.title_pinyin && c.title_zh ? '<div class="ct-city">' + esc(c.title_pinyin) + '</div>' : "") + '</td>' +
      '<td>' + (c.author_zh ? esc(c.author_zh) : (c.author_pinyin ? esc(c.author_pinyin) : '<span class="ct-city">—</span>')) +
        (c.author_dates ? '<div class="ct-city">' + esc(c.author_dates) + '</div>' : "") + '</td>' +
      '<td>' + (c.dynasty ? esc(c.dynasty) : '<span class="ct-city">—</span>') + '</td>' +
      '<td class="num">' + (c.juan ? c.juan : "—") + '</td>' +
      '<td>' + locCell + '</td>' +
      '<td>' + srcTag + '</td>' +
      '</tr>';
  }
  function render() {
    var q = fold(el("ct-search").value.trim());
    var list = all.filter(function (c) { return matches(c, sel); });
    if (q) list = list.filter(function (c) {
      return fold((c.title_zh || "") + " " + (c.title_pinyin || "") + " " + (c.author_zh || "") + " " +
        (c.author_pinyin || "") + " " + (c.skslxb_locator || "")).indexOf(q) !== -1;
    });
    list.sort(cmp);
    el("coll-title").textContent = sel
      ? (sel.series ? "石刻史料新編 " + (SERIES_ZH[sel.series] || sel.series)
        : sel.skslxb === true ? "石刻史料新編 (SKSLXB)" : "Other premodern works")
      : "All premodern sources";
    var nSk = list.filter(function (c) { return c.in_skslxb; }).length;
    el("coll-crumb").textContent = list.length + " work" + (list.length === 1 ? "" : "s") +
      (nSk ? " · " + nSk + " in SKSLXB" : "");
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
      else { sortKey = k; sortDir = (k === "juan") ? "desc" : "asc"; }
      render();
    });
    fetch("premodern.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      all = (d && d.works) || [];
      renderTree();
      render();
    }).catch(function () {
      el("ct-tree").innerHTML = '<div class="catalog-loading">Could not load premodern.json.</div>';
    });
  });
})();
