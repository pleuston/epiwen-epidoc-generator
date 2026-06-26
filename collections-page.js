/* collections-page.js — geographic browser for rubbing holding collections.
 * Cascading tree (continent → country → province for China) on the left filters
 * the collection cards on the right; each card links to the collection's holdings
 * (harvest tool), its original site / dedicated rubbing database, and — where one
 * exists — its Institution authority record. Reads collections.json (app repo,
 * no auth). */
(function () {
  "use strict";
  var SRC = { "harvard-librarycloud": "harvard", "berkeley-oai": "berkeley", "japan-search": "japansearch" };
  // This module drives two pages: "rubbing" (collections.html) and "object"
  // (objects.html, inscription/object databases). The page sets window.COLL_CATEGORY.
  var CATEGORY = (typeof window !== "undefined" && window.COLL_CATEGORY) || "rubbing";
  var NOUN = CATEGORY === "object" ? "inscriptions" : "rubbings";
  var all = [], sel = null;   // sel = {continent, country, province} filter

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function fold(s) { return window.EpiVariants ? EpiVariants.fold(s) : String(s == null ? "" : s).toLowerCase(); }
  function el(id) { return document.getElementById(id); }

  function matches(c, f) {
    if (!f) return true;
    if (f.continent && c.continent !== f.continent) return false;
    if (f.country && c.country !== f.country) return false;
    if (f.province && c.province !== f.province) return false;
    return true;
  }

  // ── tree ─────────────────────────────────────────────────────────────────────
  function buildTree() {
    var t = {};
    all.forEach(function (c) {
      var cont = c.continent || "—", ctry = c.country || "—", prov = c.province || "";
      t[cont] = t[cont] || {};
      t[cont][ctry] = t[cont][ctry] || {};
      var key = prov || "_";
      (t[cont][ctry][key] = t[cont][ctry][key] || []).push(c);
    });
    return t;
  }
  function node(label, count, depth, onClick, hasChildren) {
    var row = document.createElement("div");
    row.className = "ct-row";
    row.style.paddingLeft = (depth * 0.9) + "rem";
    row.innerHTML = '<span class="ct-caret' + (hasChildren ? "" : " leaf") + '">▶</span>' +
      '<span class="ct-label">' + esc(label) + '</span><span class="ct-count">' + count + '</span>';
    row.addEventListener("click", onClick);
    return row;
  }
  function renderTree() {
    var box = el("ct-tree"); box.innerHTML = "";
    var rootRow = node("All collections", all.length, 0, function () { setFilter(null, rootRow); }, false);
    box.appendChild(rootRow);
    var t = buildTree();
    Object.keys(t).sort().forEach(function (cont) {
      var contColls = [].concat.apply([], Object.keys(t[cont]).map(function (ctry) {
        return [].concat.apply([], Object.keys(t[cont][ctry]).map(function (p) { return t[cont][ctry][p]; }));
      }));
      var contWrap = document.createElement("div"); contWrap.className = "ct-node";
      var contKids = document.createElement("div"); contKids.className = "ct-children";
      var contRow = node(cont, contColls.length, 0, function (e) {
        if (e.target.classList.contains("ct-caret")) { toggle(contRow, contKids); }
        else setFilter({ continent: cont }, contRow);
      }, true);
      contWrap.appendChild(contRow); contWrap.appendChild(contKids); box.appendChild(contWrap);

      Object.keys(t[cont]).sort().forEach(function (ctry) {
        var provs = t[cont][ctry];
        var ctryColls = [].concat.apply([], Object.keys(provs).map(function (p) { return provs[p]; }));
        var hasProv = Object.keys(provs).some(function (p) { return p !== "_"; });
        var ctryKids = document.createElement("div"); ctryKids.className = "ct-children";
        var ctryRow = node(ctry, ctryColls.length, 1, function (e) {
          if (hasProv && e.target.classList.contains("ct-caret")) { toggle(ctryRow, ctryKids); }
          else setFilter({ continent: cont, country: ctry }, ctryRow);
        }, hasProv);
        contKids.appendChild(ctryRow); contKids.appendChild(ctryKids);
        if (hasProv) {
          Object.keys(provs).sort().forEach(function (p) {
            if (p === "_") return;
            var provRow = node(p, provs[p].length, 2, function () { setFilter({ continent: cont, country: ctry, province: p }, provRow); }, false);
            ctryKids.appendChild(provRow);
          });
        }
      });
    });
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

  // ── sortable table ───────────────────────────────────────────────────────────
  var sortKey = "harvested", sortDir = "desc";
  var COLS = [
    { label: "Collection", key: "name" },
    { label: "Country",    key: "country" },
    { label: "Type",       key: "kind" },
    { label: "Harvested",  key: "harvested", num: true },
    { label: CATEGORY === "object" ? "Est. records" : "Est. 拓本",  key: "mentions",  num: true },
    { label: "Access",     key: null },
    { label: "Links",      key: null }
  ];
  function sortVal(c, key) {
    if (key === "harvested") return c.harvested_count || 0;
    if (key === "mentions")  return c.mentions || c.est_count || 0;
    if (key === "name")      return fold(c.label || "");
    if (key === "country")   return (c.country || "") + "|" + (c.province || "");
    if (key === "kind")      return c.kind || "";
    return "";
  }
  function cmp(a, b) {
    var va = sortVal(a, sortKey), vb = sortVal(b, sortKey);
    var primary = (typeof va === "number") ? va - vb : String(va).localeCompare(String(vb));
    if (primary !== 0) return sortDir === "desc" ? -primary : primary;
    // tiebreak (direction-independent): biggest count first, then name A→Z
    return (b.harvested_count || 0) - (a.harvested_count || 0) ||
           (b.mentions || b.est_count || 0) - (a.mentions || a.est_count || 0) ||
           fold(a.label || "").localeCompare(fold(b.label || ""));
  }
  function accessLabel(c) {
    if (c.harvested_count) return c.harvested_count.toLocaleString() + " harvested";
    if (c.connector === "japan-search") return "via Japan Search";
    if (c.aggregator_db) return "aggregator · union DB";
    if (c.api) return "API ✓";
    if (c.commercial) return "subscription";
    if (c.needs_request) return c.via_aggregator ? "needs request · via EFEO" : "needs request";
    if (c.via_aggregator) return "via EFEO aggregator";
    if (c.connector === "database") return "online database";
    if (c.rubbing_site) return "online catalogue";
    return "catalog-only";
  }
  function linksFor(c) {
    var src = SRC[c.connector], L = [];
    if (src && c.harvested_count) L.push('<a href="harvest.html?source=' + src + '">holdings</a>');
    if (c.js_browse) L.push('<a href="' + esc(c.js_browse) + '" target="_blank" rel="noopener">Japan Search ↗</a>');
    if (c.site) L.push('<a href="' + esc(c.site) + '" target="_blank" rel="noopener">site ↗</a>');
    if (c.rubbing_site && c.rubbing_site !== c.site) {
      var lbl = c.aggregator_db ? "open database ↗" : c.via_aggregator ? "EFEO record ↗" : "collection ↗";
      L.push('<a href="' + esc(c.rubbing_site) + '" target="_blank" rel="noopener">' + lbl + '</a>');
    }
    if (c.api_url) L.push('<a href="' + esc(c.api_url) + '" target="_blank" rel="noopener" title="' + esc(c.api || "") + '">API ↗</a>');
    if (c.aggregator_ref) L.push('<a href="' + esc(c.aggregator_ref) + '" target="_blank" rel="noopener">EFEO union ↗</a>');
    if (c.authority) L.push('<a href="institutions.html?id=' + encodeURIComponent(c.authority) + '">authority</a>');
    return L.join(" ");
  }
  function rowHtml(c) {
    var kind = c.kind === "aggregator"
      ? '<span class="coll-kind agg" title="' + esc(c.aggregates || "aggregates several institutions") + '">aggregator</span>'
      : '<span class="coll-kind inst">institution</span>';
    var sub = c.catalog || c.holdings || "";
    var catLine = sub ? '<div class="ct-city" title="' + esc(c.catalogue || c.catalog || c.holdings || "") + '">' + esc(sub.length > 50 ? sub.slice(0, 48) + "…" : sub) + '</div>' : "";
    var est = c.mentions || c.est_count || 0;
    var accCls = c.api ? " acc-api" : (c.needs_request || c.commercial) ? " acc-req" : "";
    return '<tr>' +
      '<td><div class="ct-name">' + esc(c.label) + '</div>' +
        (c.label_zh ? '<div class="ct-zh">' + esc(c.label_zh) + (c.hangul ? " · " + esc(c.hangul) : "") + '</div>'
                    : (c.hangul ? '<div class="ct-zh">' + esc(c.hangul) + '</div>' : "")) +
        (c.city ? '<div class="ct-city">' + esc(c.city) + '</div>' : "") + '</td>' +
      '<td>' + esc(c.country || "—") + (c.province ? '<div class="ct-city">' + esc(c.province) + '</div>' : "") + '</td>' +
      '<td>' + kind + '</td>' +
      '<td class="num">' + (c.harvested_count ? c.harvested_count.toLocaleString() : "—") + '</td>' +
      '<td class="num">' + (est ? "~" + est.toLocaleString() + (c.db_type === "inscription" ? ' <span class="acc-req" title="count is inscriptions, not rubbings">inscr.</span>' : "") : "—") + '</td>' +
      '<td><span class="coll-access' + accCls + '" title="' + esc(c.access || c.api || "") + '">' + accessLabel(c) + '</span>' + catLine + '</td>' +
      '<td><div class="ct-links">' + linksFor(c) + '</div></td>' +
      '</tr>';
  }
  function render() {
    var q = fold(el("ct-search").value.trim());
    var list = all.filter(function (c) { return matches(c, sel); });
    if (q) list = list.filter(function (c) { return fold((c.label || "") + " " + (c.label_zh || "") + " " + (c.city || "") + " " + (c.country || "")).indexOf(q) !== -1; });
    list.sort(cmp);
    el("coll-title").textContent = sel
      ? [sel.continent, sel.country, sel.province].filter(Boolean).join(" › ")
      : (CATEGORY === "object" ? "All databases" : "All collections");
    var har = list.reduce(function (s, c) { return s + (c.harvested_count || 0); }, 0);
    var agg = list.filter(function (c) { return c.kind === "aggregator"; }).length;
    el("coll-crumb").textContent = list.length + " " + (CATEGORY === "object" ? "database" : "collection") + (list.length === 1 ? "" : "s") +
      (har ? " · " + har.toLocaleString() + " " + NOUN + " harvested" : "") +
      (agg ? " · " + agg + " aggregator" + (agg === 1 ? "" : "s") : "");
    if (!list.length) { el("coll-cards").innerHTML = '<p class="catalog-loading">No collections here.</p>'; return; }
    var thead = "<thead><tr>" + COLS.map(function (col) {
      if (!col.key) return "<th>" + esc(col.label) + "</th>";
      var arrow = sortKey === col.key ? (sortDir === "desc" ? " ▼" : " ▲") : "";
      return '<th class="sortable" data-key="' + col.key + '">' + esc(col.label) + arrow + "</th>";
    }).join("") + "</tr></thead>";
    el("coll-cards").innerHTML = '<table class="coll-table">' + thead + "<tbody>" + list.map(rowHtml).join("") + "</tbody></table>";
  }

  document.addEventListener("DOMContentLoaded", function () {
    el("ct-search").addEventListener("input", render);
    // Sort when a sortable column header is clicked (thead is re-rendered each render).
    el("coll-cards").addEventListener("click", function (e) {
      var th = e.target.closest ? e.target.closest("th.sortable") : null;
      if (!th) return;
      var k = th.getAttribute("data-key");
      if (sortKey === k) sortDir = sortDir === "desc" ? "asc" : "desc";
      else { sortKey = k; sortDir = (k === "harvested" || k === "mentions") ? "desc" : "asc"; }
      render();
    });
    fetch("collections.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      all = ((d && d.collections) || []).filter(function (c) { return (c.category || "rubbing") === CATEGORY; });
      renderTree();
      render();
    }).catch(function () {
      el("ct-tree").innerHTML = '<div class="catalog-loading">Could not load collections.</div>';
    });
  });
})();
