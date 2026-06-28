/* modern-corpora-page.js — searchable register of modern (20th–21st c.) Chinese
 * epigraphic corpora, from the obsidian-vault geographic fan-out. Left tree facets
 * by national / province (region → province) / site (category → site) / supplement;
 * the right pane is a sortable, variant-folded table. Reads corpora.json (no auth). */
(function () {
  "use strict";
  var all = [], sel = null;   // sel = {section?, region?, province?, category?, site?}

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function fold(s) { return window.EpiVariants ? EpiVariants.fold(s) : String(s == null ? "" : s).toLowerCase(); }
  function el(id) { return document.getElementById(id); }
  function yearNum(r) { var m = String(r.year || "").match(/\d{4}/); return m ? parseInt(m[0], 10) : 0; }
  function matches(r, f) {
    if (!f) return true;
    if (f.section && r.section !== f.section) return false;
    if (f.region && r.region !== f.region) return false;
    if (f.province !== undefined && (r.province || "") !== f.province) return false;
    if (f.locality !== undefined && (r.locality || "") !== f.locality) return false;
    if (f.category && r.category !== f.category) return false;
    if (f.site && r.site !== f.site) return false;
    return true;
  }

  // ── tree (region → province → county/locality · category → site) ──────────────
  var REGION_ORDER = ["華北", "東北", "華東", "中南", "西南", "西北", "港澳台"];
  function mk(label, sub, count, depth, onClick, hasChildren) {
    var row = document.createElement("div");
    row.className = "ct-row"; row.style.paddingLeft = (depth * 0.8) + "rem";
    row.innerHTML = '<span class="ct-caret' + (hasChildren ? "" : " leaf") + '">▶</span>' +
      '<span class="ct-label">' + esc(label) + (sub ? ' <span class="ct-zh">' + esc(sub) + "</span>" : "") +
      '</span><span class="ct-count">' + count + "</span>";
    row.addEventListener("click", onClick);
    return row;
  }
  function toggle(row, kids) { var c = row.querySelector(".ct-caret"); var open = kids.classList.toggle("open"); c.classList.toggle("open", open); }
  function leaf(parent, label, count, depth, filter) {
    var r = mk(label, "", count, depth, function () { setFilter(filter, r); }, false);
    parent.appendChild(r); return r;
  }
  function branch(parent, label, sub, count, depth, onSelect, buildKids) {
    var wrap = document.createElement("div"); wrap.className = "ct-node";
    var kids = document.createElement("div"); kids.className = "ct-children";
    var head = mk(label, sub, count, depth, function (e) {
      if (e.target.classList.contains("ct-caret")) toggle(head, kids);
      else if (onSelect) onSelect(head);
    }, true);
    wrap.appendChild(head); wrap.appendChild(kids); parent.appendChild(wrap);
    buildKids(kids);
  }
  function bucket(recs, key) {
    var t = {}; recs.forEach(function (r) { var k = r[key] || ""; (t[k] = t[k] || []).push(r); }); return t;
  }
  function bySize(o) { return Object.keys(o).sort(function (a, b) { return o[b].length - o[a].length || a.localeCompare(b); }); }

  function renderTree() {
    var box = el("ct-tree"); box.innerHTML = "";
    var rootRow = mk("All corpora", "", all.length, 0, function () { setFilter(null, rootRow); }, false);
    box.appendChild(rootRow);
    var nat = all.filter(function (r) { return r.section === "national"; });
    if (nat.length) { var natRow = mk("全國 national", "", nat.length, 0, function () { setFilter({ section: "national" }, natRow); }, false); box.appendChild(natRow); }

    // 省 → region → province → county/locality
    var prov = all.filter(function (r) { return r.section === "province"; });
    var byReg = bucket(prov, "region");
    branch(box, "省 by province", "", prov.length, 0, null, function (regBox) {
      REGION_ORDER.concat(Object.keys(byReg).filter(function (k) { return REGION_ORDER.indexOf(k) < 0; })).forEach(function (reg) {
        var recs = byReg[reg]; if (!recs) return;
        branch(regBox, reg, "", recs.length, 1, function (h) { setFilter({ section: "province", region: reg }, h); }, function (provBox) {
          var byP = bucket(recs, "province");
          if (byP[""]) leaf(provBox, "（全區 region-wide）", byP[""].length, 2, { section: "province", region: reg, province: "" });
          bySize(byP).forEach(function (p) {
            if (!p) return;
            branch(provBox, p, "", byP[p].length, 2, function (h) { setFilter({ province: p }, h); }, function (locBox) {
              var byL = bucket(byP[p], "locality");
              if (byL[""]) leaf(locBox, "（全省 province-wide）", byL[""].length, 3, { province: p, locality: "" });
              bySize(byL).forEach(function (l) { if (l) leaf(locBox, l, byL[l].length, 3, { province: p, locality: l }); });
            });
          });
        });
      });
    });

    // 名山與遺址 → category → site
    var site = all.filter(function (r) { return r.section === "site"; });
    var byCat = bucket(site, "category");
    branch(box, "名山與遺址 sites", "", site.length, 0, null, function (catBox) {
      bySize(byCat).forEach(function (cat) {
        branch(catBox, cat, "", byCat[cat].length, 1, function (h) { setFilter({ section: "site", category: cat }, h); }, function (siteBox) {
          var byS = bucket(byCat[cat], "site");
          bySize(byS).forEach(function (s) { if (s) leaf(siteBox, s, byS[s].length, 2, { site: s }); });
        });
      });
    });
  }
  function setFilter(f, row) {
    sel = f;
    document.querySelectorAll(".ct-row.active").forEach(function (r) { r.classList.remove("active"); });
    if (row) row.classList.add("active");
    el("ct-search").value = ""; render();
  }

  // ── table ────────────────────────────────────────────────────────────────────
  var sortKey = "title", sortDir = "asc";
  var COLS = [
    { label: "Corpus 書名", key: "title" },
    { label: "Author / editor", key: "author" },
    { label: "Year", key: "year", num: true },
    { label: "Publisher", key: "publisher" },
    { label: "Place", key: "place" },
    { label: "Holdings", key: null }
  ];
  function sortVal(r, key) {
    if (key === "title") return fold(r.title_zh || r.title_pinyin || "");
    if (key === "author") return fold(r.author || "");
    if (key === "year") return yearNum(r);
    if (key === "publisher") return fold(r.publisher || "");
    if (key === "place") return fold(r.place || "~");
    return "";
  }
  function cmp(a, b) {
    var va = sortVal(a, sortKey), vb = sortVal(b, sortKey);
    var p = (typeof va === "number") ? va - vb : String(va).localeCompare(String(vb));
    if (p !== 0) return sortDir === "desc" ? -p : p;
    return fold(a.title_zh || "").localeCompare(fold(b.title_zh || ""));
  }
  function holds(h) {
    if (!h) return "";
    var b = [];
    if (h.harvard) b.push('<span class="mc-hold harvard" title="Harvard-Yenching">Harvard</span>');
    if (h.sbb) b.push('<span class="mc-hold sbb" title="Staatsbibliothek zu Berlin">SBB</span>');
    if (h.k10plus) b.push('<span class="mc-hold k10" title="K10plus union catalog">K10+</span>');
    if (h.vault) b.push('<span class="mc-hold vault" title="already in vault">vault</span>');
    return b.join("");
  }
  function cleanAuthor(a) { return (a || "").replace(/\s*\([^)]*\)/g, "").replace(/\s+(主編|編|輯校|編著|著|纂)$/,"").trim(); }
  function rowHtml(r) {
    var place = r.section === "national" ? "全國 national"
      : (r.section === "province" && !r.province) ? (r.region || "") + "地區"
      : (r.place || "—");
    var sub = (r.locality && r.locality !== place) ? r.locality : (r.admin || "");
    return '<tr>' +
      '<td><div class="ct-name">' + (r.gapfill ? '<span class="mc-plus" title="gap-fill addition">✚ </span>' : "") + esc(r.title_zh || "?") + "</div>" +
        (r.title_pinyin ? '<div class="ct-city">' + esc(r.title_pinyin) + "</div>" : "") +
        (r.scope ? '<div class="ct-city" title="' + esc(r.scope) + '">' + esc(r.scope.length > 60 ? r.scope.slice(0, 58) + "…" : r.scope) + "</div>" : "") + "</td>" +
      "<td>" + (r.author ? esc(cleanAuthor(r.author)) : '<span class="ct-city">—</span>') + "</td>" +
      '<td class="num">' + (r.year ? esc(r.year) : "—") + "</td>" +
      "<td>" + (r.publisher ? '<span class="ct-zh">' + esc(r.publisher.replace(/\s*\([^)]*\)/g, "")) + "</span>" : '<span class="ct-city">—</span>') + "</td>" +
      '<td class="mc-place">' + esc(place) + (sub ? '<div class="ct-city">' + esc(sub) + "</div>" : "") + "</td>" +
      "<td>" + (holds(r.holdings) || '<span class="ct-city">—</span>') + "</td></tr>";
  }
  function render() {
    var q = fold(el("ct-search").value.trim());
    var list = all.filter(function (r) { return matches(r, sel); });
    if (q) list = list.filter(function (r) {
      return fold((r.title_zh || "") + " " + (r.title_pinyin || "") + " " + (r.author || "") + " " + (r.publisher || "") + " " + (r.place || "")).indexOf(q) !== -1;
    });
    list.sort(cmp);
    el("coll-title").textContent = !sel ? "All modern corpora"
      : sel.locality ? (sel.province + " · " + sel.locality)
      : (sel.locality === "" && sel.province) ? (sel.province + "（全省 province-wide）")
      : sel.province ? sel.province
      : (sel.province === "") ? ((sel.region || "") + "地區 (region-wide)")
      : sel.site ? sel.site
      : sel.category ? sel.category
      : sel.region ? sel.region
      : sel.section === "national" ? "全國 national series" : "Modern corpora";
    var nh = list.filter(function (r) { return r.holdings && (r.holdings.harvard || r.holdings.sbb || r.holdings.k10plus); }).length;
    el("coll-crumb").textContent = list.length + " corpus" + (list.length === 1 ? "" : "/corpora") + (nh ? " · " + nh + " with located holdings" : "");
    if (!list.length) { el("coll-cards").innerHTML = '<p class="catalog-loading">No corpora here.</p>'; return; }
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
      else { sortKey = k; sortDir = (k === "year") ? "desc" : "asc"; }
      render();
    });
    fetch("modern-corpora.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      all = (d && d.corpora) || [];
      renderTree(); render();
    }).catch(function () { el("ct-tree").innerHTML = '<div class="catalog-loading">Could not load modern-corpora.json.</div>'; });
  });
})();
