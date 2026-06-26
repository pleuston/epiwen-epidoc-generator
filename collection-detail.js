/* collection-detail.js — full detail view for one holding collection.
 * Reads ?id=<collection-id> from collections.json (no auth), renders every field,
 * all outbound links (collection site, rubbing database, Japan Search browse, API,
 * EFEO union record, Institution authority, harvest holdings), a mini-map, and —
 * for the EFEO aggregator — its member collections. */
(function () {
  "use strict";
  var SRC = { "harvard-librarycloud": "harvard", "berkeley-oai": "berkeley", "japan-search": "japansearch" };
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function el(id) { return document.getElementById(id); }
  var ID = new URLSearchParams(location.search).get("id");

  function accessLabel(c) {
    if (c.harvested_count) return c.harvested_count.toLocaleString() + " rubbings harvested";
    if (c.connector === "japan-search") return "via Japan Search — not yet harvested";
    if (c.aggregator_db) return "aggregator · union database";
    if (c.api) return "API ✓ — machine-harvestable";
    if (c.commercial) return "subscription / commercial";
    if (c.needs_request) return c.via_aggregator ? "data by request · via EFEO" : "data by request";
    if (c.via_aggregator) return "via EFEO aggregator";
    if (c.verify) return "verification pending";
    if (c.connector === "database") return "online database";
    if (c.rubbing_site) return "online catalogue";
    return "catalog-only";
  }
  function accessClass(c) {
    if (c.harvested_count || c.api) return "acc-api";
    if (c.needs_request || c.commercial || c.verify) return "acc-req";
    return "";
  }
  function btn(href, label, primary, ext) {
    return '<a class="btn small' + (primary ? " primary" : "") + '" href="' + esc(href) + '"' +
      (ext ? ' target="_blank" rel="noopener"' : "") + ">" + esc(label) + (ext ? " ↗" : "") + "</a>";
  }
  function fact(label, val) {
    return (val == null || val === "") ? "" : '<dt>' + esc(label) + "</dt><dd>" + val + "</dd>";
  }

  function render(c, all) {
    var kindBadge = '<span class="cd-badge ' + (c.kind === "aggregator" ? "agg" : "inst") + '">' +
      (c.kind === "aggregator" ? "aggregator" : "institution") + "</span>";
    var catBadge = '<span class="cd-badge ' + (c.category === "object" ? "obj" : "rub") + '">' +
      (c.category === "object" ? "object / inscription DB" : "rubbing collection") + "</span>";
    var accBadge = '<span class="cd-badge ' + accessClass(c) + '">' + esc(accessLabel(c)) + "</span>";

    // ── links ──
    var L = [];
    var src = SRC[c.connector];
    if (src && c.harvested_count) L.push(btn("harvest.html?source=" + src, "Open holdings in the harvest tool →", true, false));
    if (c.js_browse) L.push(btn(c.js_browse, "Browse on Japan Search", true, true));
    if (c.rubbing_site && c.rubbing_site !== c.site) {
      var rl = c.aggregator_db ? "Open the EFEO union database" : c.via_aggregator ? "EFEO record" : (c.category === "object" ? "Open database" : "Rubbing database");
      L.push(btn(c.rubbing_site, rl, true, true));
    }
    if (c.api_url) L.push(btn(c.api_url, "API endpoint", false, true));
    if (c.site) L.push(btn(c.site, "Collection website", false, true));
    if (c.aggregator_ref) L.push(btn(c.aggregator_ref, "EFEO union record", false, true));
    if (c.authority) L.push(btn("institutions.html?id=" + encodeURIComponent(c.authority), "Institution authority record →", false, false));

    // ── facts ──
    var facts = "";
    facts += fact("Region", [c.continent, c.country, c.province].filter(Boolean).map(esc).join(" › "));
    facts += fact("City", esc(c.city));
    facts += fact("Type", c.kind === "aggregator" ? "Aggregator" + (c.aggregates ? " — " + esc(c.aggregates) : "") : "Single institution");
    facts += fact("Catalogue layer", c.category === "object" ? "Object / inscription database" + (c.db_type ? " (" + esc(c.db_type) + ")" : "") : "Rubbing collection");
    facts += fact("Harvested into Epiwen", c.harvested_count ? c.harvested_count.toLocaleString() + " rubbings" : null);
    facts += fact("Harvested / staged", c.staged_count ? c.staged_count.toLocaleString() + " records → <code>" + esc(c.staged_file) + "</code>" : null);
    facts += fact("Documented holding", c.est_count ? "≈ " + c.est_count.toLocaleString() : null);
    facts += fact("拓本 keyword matches (Japan Search)", c.mentions ? "~" + c.mentions.toLocaleString() + " (upper bound)" : null);
    facts += fact("Access", esc(accessLabel(c)) + (c.api ? " — " + esc(c.api) : ""));
    facts += fact("Open licence", esc(c.open_license));
    facts += fact("Japan Search f-db code", c.fdb ? "<code>" + esc(c.fdb) + "</code>" : null);
    facts += fact("Catalogue reference", esc(c.catalogue || c.catalog));
    facts += fact("Coordinates", (c.lat != null && c.lon != null) ? c.lat.toFixed(4) + ", " + c.lon.toFixed(4) : null);

    // ── EFEO aggregator → member collections ──
    var members = "";
    if (c.aggregator_db) {
      var ms = all.filter(function (x) { return x.via_aggregator === "EFEO" || (x.aggregator_ref && /efeo/i.test(x.aggregator_ref)); });
      if (ms.length) members = '<h3>Aggregated collections (' + ms.length + ")</h3><ul class=\"cd-members\">" +
        ms.map(function (x) { return '<li><a href="collection.html?id=' + encodeURIComponent(x.id) + '">' + esc(x.label) + "</a>" +
          (x.est_count ? ' <span class="cd-muted">≈ ' + x.est_count.toLocaleString() + "</span>" : "") + "</li>"; }).join("") + "</ul>";
    }

    var hasMap = c.lat != null && c.lon != null;
    el("cd-content").innerHTML =
      '<div class="cd-badges">' + kindBadge + catBadge + accBadge + "</div>" +
      "<h1>" + esc(c.label) + (c.label_zh ? ' <span class="cd-zh">' + esc(c.label_zh) + "</span>" : "") + "</h1>" +
      '<p class="cd-loc">' + [c.city, c.country].filter(Boolean).map(esc).join(" · ") + "</p>" +
      '<div class="cd-cols"><div class="cd-left">' +
        (c.holdings ? '<p class="cd-holdings">' + esc(c.holdings) + "</p>" : "") +
        (c.access && c.access !== c.holdings ? '<p class="cd-access-note">' + esc(c.access) + "</p>" : "") +
        (L.length ? "<h3>Links</h3><div class=\"cd-links\">" + L.join("") + "</div>" : "") +
        members +
        "<h3>Details</h3><dl class=\"cd-facts\">" + facts + "</dl>" +
      "</div><div class=\"cd-right\">" +
        (hasMap ? '<div id="cd-map"></div>' : "") +
      "</div></div>";

    if (hasMap && window.L) {
      var map = L_init(c);
    }
  }
  function L_init(c) {
    try {
      var m = window.L.map("cd-map", { scrollWheelZoom: false, attributionControl: true }).setView([c.lat, c.lon], 6);
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        { maxZoom: 18, attribution: "© OpenStreetMap" }).addTo(m);
      window.L.marker([c.lat, c.lon]).addTo(m).bindPopup(c.label);
      return m;
    } catch (e) { return null; }
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!ID) { el("cd-content").innerHTML = '<p class="catalog-loading">No collection id given.</p>'; return; }
    fetch("collections.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var all = (d && d.collections) || [];
      var c = all.filter(function (x) { return x.id === ID; })[0];
      if (!c) { el("cd-content").innerHTML = '<p class="catalog-loading">Collection “' + esc(ID) + '” not found.</p>'; return; }
      document.title = "Epiwen · " + c.label;
      el("cd-back").href = c.category === "object" ? "objects.html" : "collections.html";
      el("cd-back").textContent = c.category === "object" ? "← All databases" : "← All collections";
      render(c, all);
    }).catch(function () { el("cd-content").innerHTML = '<p class="catalog-loading">Could not load collections.json.</p>'; });
  });
})();
