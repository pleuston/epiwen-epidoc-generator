/* map.js — site locations on Leaflet (vendored locally in leaflet/).
 *
 * Base layers (radio): modern (Streets/Satellite/Terrain/Light) plus the
 * georeferenced 譚其驤 中國歷史地圖集 (Historical Atlas of China) served as
 * WMTS tiles by CCTS / Academia Sinica — Southern & Northern Dynasties (497),
 * Sui (612), and Tang (741), the stone-sutra periods.
 * Overlay (checkbox): the clustered site markers, shown on whichever base.
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

  // CCTS / Academia Sinica WMTS (GoogleMapsCompatible → standard z/x/y),
  // RESTful ResourceURL template. One layer per period of the atlas.
  var CCTS_ATTR = '譚其驤 <i>中國歷史地圖集</i> · <a href="https://gis.sinica.edu.tw/ccts/" target="_blank" rel="noopener">CCTS</a>, Academia Sinica';
  function ccts(id) {
    return L.tileLayer(
      "https://gis.sinica.edu.tw/ccts/file-exists.php?img=" + id + "-png-{z}-{x}-{y}",
      { maxNativeZoom: 10, maxZoom: 18, attribution: CCTS_ATTR }
    );
  }

  document.addEventListener("DOMContentLoaded", function () {
    var mapEl = document.getElementById("map");
    function sizeMap() {
      var top = mapEl.getBoundingClientRect().top;
      mapEl.style.height = Math.max(320, window.innerHeight - top - 4) + "px";
    }
    sizeMap();

    var map = L.map(mapEl, { scrollWheelZoom: true }).setView([34, 104], 4);

    // ── Modern base layers ─────────────────────────────────────────────────────
    var osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
    });
    var sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 18, attribution: "Imagery © Esri, Maxar, Earthstar Geographics"
    });
    var topo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 17, subdomains: "abc",
      attribution: '© <a href="https://opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA)'
    });
    var light = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19, subdomains: "abcd", attribution: "© OpenStreetMap, © CARTO"
    });
    osm.addTo(map);

    window.addEventListener("resize", function () { sizeMap(); map.invalidateSize(); });

    // ── Historical base maps (Tan Qixiang / CCTS) ──────────────────────────────
    var baseLayers = {
      "Streets": osm,
      "Satellite": sat,
      "Terrain": topo,
      "Light": light,
      "Tang · 741 (Tan Qixiang)": ccts("ad0741"),
      "Sui · 612 (Tan Qixiang)": ccts("ad0612"),
      "S. &amp; N. Dynasties · 497 (Tan Qixiang)": ccts("ad0497")
    };

    // ── Site markers (clustered) ──────────────────────────────────────────────
    var cluster = L.markerClusterGroup({
      maxClusterRadius: 45, showCoverageOnHover: false, spiderfyOnMaxZoom: true
    });

    L.control.layers(baseLayers, { "Sites": cluster }, { collapsed: true }).addTo(map);

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
