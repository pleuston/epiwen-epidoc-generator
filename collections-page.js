/* collections-page.js — geographic browser for rubbing holding collections.
 * Cascading tree (continent → country → province for China) on the left filters
 * the collection cards on the right; each card links to the collection's holdings
 * (harvest tool), its original site / dedicated rubbing database, and — where one
 * exists — its Institution authority record. Reads collections.json (app repo,
 * no auth). */
(function () {
  "use strict";
  var SRC = { "harvard-librarycloud": "harvard", "berkeley-oai": "berkeley", "japan-search": "japansearch" };
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

  // ── cards ─────────────────────────────────────────────────────────────────────
  function card(c) {
    var src = SRC[c.connector];
    var harvestable = src && c.harvested_count;
    var name = harvestable
      ? '<a href="harvest.html?source=' + src + '">' + esc(c.label) + "</a>"
      : esc(c.label);
    var tag = c.harvested_count
      ? '<span class="source-tag coll-tag-har">' + c.harvested_count + ' harvested</span>'
      : '<span class="source-tag coll-tag-cat">catalog-only</span>';
    var links = [];
    if (harvestable) links.push('<a class="source-link" href="harvest.html?source=' + src + '">Open holdings →</a>');
    if (c.site) links.push('<a class="source-link" href="' + esc(c.site) + '" target="_blank" rel="noopener">Collection site ↗</a>');
    if (c.rubbing_site && c.rubbing_site !== c.site) links.push('<a class="source-link" href="' + esc(c.rubbing_site) + '" target="_blank" rel="noopener">Rubbing database ↗</a>');
    if (c.authority) links.push('<a class="source-link" href="institutions.html?id=' + encodeURIComponent(c.authority) + '">Institution authority →</a>');
    return '<div class="source-card coll-card">' +
      '<h3>' + name + '</h3>' +
      (c.label_zh ? '<div class="source-zh">' + esc(c.label_zh) + '</div>' : "") +
      tag +
      (c.via ? '<span class="source-tag">via ' + esc(c.via) + '</span>' : "") +
      (c.city ? '<span class="source-tag">' + esc(c.city) + '</span>' : "") +
      (c.holdings ? '<p><b>Holdings:</b> ' + esc(c.holdings) + '</p>' : "") +
      (c.catalog ? '<p><b>Catalog:</b> ' + esc(c.catalog) + '</p>' : "") +
      (c.access ? '<p class="source-zh">' + esc(c.access) + (c.rubbing_site_note ? ' · ' + esc(c.rubbing_site_note) : "") + '</p>'
                : (c.rubbing_site_note ? '<p class="source-zh">' + esc(c.rubbing_site_note) + '</p>' : "")) +
      '<div class="coll-links">' + links.join("") + '</div>' +
      '</div>';
  }
  function render() {
    var q = fold(el("ct-search").value.trim());
    var list = all.filter(function (c) { return matches(c, sel); });
    if (q) list = list.filter(function (c) { return fold((c.label || "") + " " + (c.label_zh || "") + " " + (c.city || "")).indexOf(q) !== -1; });
    list.sort(function (a, b) { return (b.harvested_count || 0) - (a.harvested_count || 0); });
    el("coll-title").textContent = sel
      ? [sel.continent, sel.country, sel.province].filter(Boolean).join(" › ")
      : "All collections";
    var har = list.reduce(function (s, c) { return s + (c.harvested_count || 0); }, 0);
    el("coll-crumb").textContent = list.length + " collection" + (list.length === 1 ? "" : "s") +
      (har ? " · " + har.toLocaleString() + " rubbings harvested" : "");
    el("coll-cards").innerHTML = list.length ? list.map(card).join("") : '<p class="catalog-loading">No collections here.</p>';
  }

  document.addEventListener("DOMContentLoaded", function () {
    el("ct-search").addEventListener("input", render);
    fetch("collections.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      all = (d && d.collections) || [];
      renderTree();
      render();
    }).catch(function () {
      el("ct-tree").innerHTML = '<div class="catalog-loading">Could not load collections.</div>';
    });
  });
})();
