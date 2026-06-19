/* map.js — site locations on Leaflet (vendored locally in leaflet/).
 *
 * Reads data/site-index.json, plots every place-site (kind=site) with
 * coordinates, clusters dense groups, and deep-links each marker to the
 * Sites browser. Tiles are OpenStreetMap raster tiles.
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
    // Guard against swapped lon/lat (corpus is China: lon 60–140, lat 3–55)
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

  document.addEventListener("DOMContentLoaded", function () {
    var mapEl = document.getElementById("map");

    function sizeMap() {
      var top = mapEl.getBoundingClientRect().top;
      mapEl.style.height = Math.max(320, window.innerHeight - top - 4) + "px";
    }
    sizeMap();

    var map = L.map(mapEl, { scrollWheelZoom: true }).setView([34, 104], 4);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }).addTo(map);

    window.addEventListener("resize", function () { sizeMap(); map.invalidateSize(); });

    var cluster = L.markerClusterGroup({
      maxClusterRadius: 45,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true
    });

    fetch("data/site-index.json?v=" + Date.now())
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (recs) {
        var childParents = {};
        recs.forEach(function (r) { if (r.parent) childParents[r.parent] = true; });

        var bounds = [];
        recs.forEach(function (r) {
          if (r.kind && r.kind !== "site") return;     // only place-sites
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
        map.invalidateSize();                            // container is final-sized by now
        if (bounds.length) map.fitBounds(bounds, { padding: [40, 40] });
        else toast("No site coordinates to plot", true);
      })
      .catch(function (e) { toast("Could not load sites: " + e.message, true); });
  });
})();
