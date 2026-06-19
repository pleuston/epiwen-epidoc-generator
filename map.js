/* map.js — site locations on Leaflet (vendored locally in leaflet/).
 *
 * A custom grouped layer panel: base maps (modern + the 譚其驤/CCTS historical
 * atlas) and overlays (sites, Tang detail, 左图右史/OSGeo period maps), grouped
 * by type and source, collapsible and compact.
 */
(function () {
  "use strict";

  function esc(t) {
    return String(t == null ? "" : t)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function parseLonLat(str) {
    if (!str) return null;
    var p = String(str).split(",").map(function (s) { return parseFloat(s.trim()); });
    if (p.length < 2 || isNaN(p[0]) || isNaN(p[1])) return null;
    var lon = p[0], lat = p[1];
    var isLon = function (v) { return v >= 60 && v <= 140; };
    var isLat = function (v) { return v >= 3 && v <= 55; };
    if (!isLon(lon) && isLon(lat) && isLat(lon)) { var t = lon; lon = lat; lat = t; }
    return { lon: lon, lat: lat };
  }

  function toast(msg, isErr) {
    var el = document.getElementById("toast"); if (!el) return;
    el.textContent = msg; el.className = "show" + (isErr ? " toast-error" : "");
    setTimeout(function () { el.className = ""; }, isErr ? 6000 : 3000);
  }

  // ── Tile sources ────────────────────────────────────────────────────────────

  var CCTS_ATTR = '譚其驤 <i>中國歷史地圖集</i> · <a href="https://gis.sinica.edu.tw/ccts/" target="_blank" rel="noopener">CCTS</a>, Academia Sinica';
  function ccts(id, extra) {
    return L.tileLayer(
      "https://gis.sinica.edu.tw/ccts/file-exists.php?img=" + id + "-png-{z}-{x}-{y}",
      Object.assign({ maxNativeZoom: 10, maxZoom: 18, attribution: CCTS_ATTR }, extra || {})
    );
  }

  var OSGEO_ATTR = '<a href="https://history-map.osgeo.cn" target="_blank" rel="noopener">左图右史</a> · OSGeo.cn';
  function osgeo(uid, z) {
    return L.tileLayer(
      "https://tile.osgeo.cn/wmts/" + uid + "/webmercator/{z}/{x}/{y}.png",
      // tile.osgeo.cn hotlink-protects by Referer — suppress it to load cross-origin
      { maxNativeZoom: 8, maxZoom: 18, opacity: 0.85, zIndex: z || 7,
        referrerPolicy: "no-referrer", attribution: OSGEO_ATTR }
    );
  }

  function modern(url, extra) {
    return L.tileLayer(url, Object.assign({ zIndex: 1 }, extra));
  }

  // ── Custom grouped layer panel ──────────────────────────────────────────────

  var ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><polygon points="12 2 22 8.5 12 15 2 8.5 12 2"/><polyline points="2 15.5 12 22 22 15.5"/></svg>';

  function groupedControl(map, groups) {
    var ctrl = L.control({ position: "topright" });
    ctrl.onAdd = function () {
      var wrap = L.DomUtil.create("div", "lp");
      var btn = L.DomUtil.create("button", "lp-btn", wrap);
      btn.type = "button"; btn.title = "Map layers"; btn.setAttribute("aria-label", "Map layers");
      btn.innerHTML = ICON;

      var body = L.DomUtil.create("div", "lp-body", wrap);
      var head = L.DomUtil.create("div", "lp-head", body);
      head.innerHTML = "<span>Layers</span>";
      var close = L.DomUtil.create("button", "lp-close", head);
      close.type = "button"; close.innerHTML = "×"; close.setAttribute("aria-label", "Close");

      var bases = [];
      groups.forEach(function (g) {
        var gEl = L.DomUtil.create("div", "lp-group" +
          (g.collapsible ? " collapsible" : "") + (g.collapsed ? "" : " open"), body);
        var gh = L.DomUtil.create("div", "lp-grouphead", gEl);
        gh.innerHTML = '<span class="lp-gtitle">' + g.title + "</span>" +
          (g.source ? '<span class="lp-gsrc">' + g.source + "</span>" : "");
        var items = L.DomUtil.create("div", "lp-items" + (g.grid ? " lp-grid" : ""), gEl);
        if (g.collapsible) L.DomEvent.on(gh, "click", function () { gEl.classList.toggle("open"); });

        g.layers.forEach(function (it) {
          var row = L.DomUtil.create("label", "lp-item", items);
          var inp = L.DomUtil.create("input", "", row);
          inp.type = (g.kind === "base") ? "radio" : "checkbox";
          if (g.kind === "base") inp.name = "lp-base";
          if (it.on) { inp.checked = true; }
          var sp = L.DomUtil.create("span", "lp-label", row);
          sp.innerHTML = it.label;
          if (g.kind === "base") {
            bases.push(it.layer);
            L.DomEvent.on(inp, "change", function () {
              bases.forEach(function (b) { if (map.hasLayer(b)) map.removeLayer(b); });
              map.addLayer(it.layer);
            });
          } else {
            L.DomEvent.on(inp, "change", function () {
              if (inp.checked) map.addLayer(it.layer); else map.removeLayer(it.layer);
            });
          }
        });
      });

      L.DomEvent.on(btn, "click", function (e) { L.DomEvent.stop(e); wrap.classList.add("open"); });
      L.DomEvent.on(close, "click", function (e) { L.DomEvent.stop(e); wrap.classList.remove("open"); });
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(body);
      return wrap;
    };
    return ctrl;
  }

  // ── Init ────────────────────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", function () {
    var mapEl = document.getElementById("map");
    function sizeMap() {
      var top = mapEl.getBoundingClientRect().top;
      mapEl.style.height = Math.max(320, window.innerHeight - top - 4) + "px";
    }
    sizeMap();

    var map = L.map(mapEl, { scrollWheelZoom: true, zoomControl: true }).setView([34, 104], 4);

    var osm = modern("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
    });
    var sat = modern("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 18, attribution: "Imagery © Esri, Maxar, Earthstar Geographics"
    });
    var topo = modern("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 17, subdomains: "abc",
      attribution: '© <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA)'
    });
    var light = modern("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19, subdomains: "abcd", attribution: "© OpenStreetMap, © CARTO"
    });
    osm.addTo(map);

    window.addEventListener("resize", function () { sizeMap(); map.invalidateSize(); });

    var cluster = L.markerClusterGroup({
      maxClusterRadius: 45, showCoverageOnHover: false, spiderfyOnMaxZoom: true
    });

    var DYN = [
      ["bc0210", "Qin · 210 BCE"], ["bc0007", "W. Han · 7 BCE"], ["ad0140", "E. Han · 140"],
      ["ad0262", "Three Kingdoms · 262"], ["ad0281", "W. Jin · 281"], ["ad0382", "E. Jin · 382"],
      ["ad0497", "S. & N. Dyn. · 497"], ["ad0612", "Sui · 612"], ["ad0741", "Tang · 741"],
      ["ad1111", "N. Song · 1111"], ["ad1208", "S. Song · 1208"], ["ad1330", "Yuan · 1330"],
      ["ad1582", "Ming · 1582"], ["ad1820", "Qing · 1820"]
    ];

    var groups = [
      { kind: "base", title: "Modern", layers: [
        { label: "Streets", layer: osm, on: true },
        { label: "Satellite", layer: sat },
        { label: "Terrain", layer: topo },
        { label: "Light", layer: light }
      ] },
      { kind: "base", title: "Historical atlas", source: "Tan Qixiang · CCTS",
        collapsible: true, collapsed: true,
        layers: DYN.map(function (d) { return { label: d[1], layer: ccts(d[0], { zIndex: 1 }) }; }) },
      { kind: "overlay", title: "Site catalogue", layers: [
        { label: "Sites", layer: cluster, on: true }
      ] },
      { kind: "overlay", title: "Tang detail", source: "CCTS", layers: [
        { label: "Circuits &amp; prefectures", layer: ccts("Tang_Admin", { zIndex: 5 }) },
        { label: "Traffic routes", layer: ccts("Tang_TrafficRoute", { zIndex: 6 }) }
      ] },
      { kind: "overlay", title: "Northern dynasties", source: "左图右史 · OSGeo", layers: [
        { label: "E. Wei 東魏", layer: osgeo("mp03c5", 7) },
        { label: "W. Wei 西魏", layer: osgeo("mp03c6", 8) },
        { label: "N. Qi 北齊", layer: osgeo("mp03c7", 9) },
        { label: "N. Zhou 北周", layer: osgeo("mp03c8", 10) },
        { label: "Chen · Qi · Zhou 557", layer: osgeo("mp0394", 11) }
      ] }
    ];

    groupedControl(map, groups).addTo(map);

    fetch("data/site-index.json?v=" + Date.now())
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (recs) {
        var childParents = {};
        recs.forEach(function (r) { if (r.parent) childParents[r.parent] = true; });
        var bounds = [];
        recs.forEach(function (r) {
          if (r.kind && r.kind !== "site") return;
          var ll = parseLonLat(r.coordinates);
          if (!ll) return;
          var isParent = !!childParents[r.id];
          var icon = L.divIcon({
            className: "site-divicon",
            html: '<div class="map-marker' + (isParent ? " is-parent" : "") + '"></div>',
            iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -8]
          });
          var m = L.marker([ll.lat, ll.lon], { icon: icon, title: r.title_en || r.id });
          m.bindPopup(
            "<h4>" + esc(r.title_en || r.id) +
              (r.title_zh ? ' <span class="pp-sub">' + esc(r.title_zh) + "</span>" : "") + "</h4>" +
            (r.province_en ? '<div class="pp-sub">' + esc(r.province_en) + "</div>" : "") +
            '<a class="btn small" href="sites.html?site=' + encodeURIComponent(r.id) + '">Open in Sites →</a>'
          );
          cluster.addLayer(m);
          bounds.push([ll.lat, ll.lon]);
        });
        map.addLayer(cluster);
        var countEl = document.getElementById("map-count");
        if (countEl) countEl.textContent = bounds.length;
        map.invalidateSize();
        if (bounds.length) map.fitBounds(bounds, { padding: [40, 40] });
        else toast("No site coordinates to plot", true);
      })
      .catch(function (e) { toast("Could not load sites: " + e.message, true); });
  });
})();
