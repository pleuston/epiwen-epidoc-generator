/* map.js — site locations on Leaflet (vendored locally in leaflet/).
 *
 * Layer panel: modern base maps + the full 中國歷史地圖集 (左图右史 / OSGeo.cn)
 * as a dynasty tree (21 dynasties → 303 period maps, data/osgeo-atlas.json),
 * plus the clustered site markers. Grouped, collapsible, compact.
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

  function modern(url, extra) { return L.tileLayer(url, Object.assign({ zIndex: 1 }, extra)); }

  // 中國歷史地圖集 — CCTS / Academia Sinica (譚其驤) historical base maps.
  var CCTS_ATTR = '譚其驤 <i>中國歷史地圖集</i> · <a href="https://gis.sinica.edu.tw/ccts/" target="_blank" rel="noopener">CCTS</a>, Academia Sinica';
  function ccts(id, extra) {
    return L.tileLayer(
      "https://gis.sinica.edu.tw/ccts/file-exists.php?img=" + id + "-png-{z}-{x}-{y}",
      Object.assign({ maxNativeZoom: 10, maxZoom: 18, attribution: CCTS_ATTR }, extra || {})
    );
  }
  var CCTS_DYN = [
    ["bc0210", "秦 · 210 BCE"],     ["bc0007", "西漢 · 7 BCE"],
    ["ad0140", "東漢 · 140"],        ["ad0262", "三國 · 262"],
    ["ad0281", "西晉 · 281"],        ["ad0382", "東晉 · 382"],
    ["ad0497", "南北朝 · 497"],      ["ad0612", "隋 · 612"],
    ["ad0741", "唐 · 741"],          ["ad1111", "北宋 · 1111"],
    ["ad1208", "南宋 · 1208"],       ["ad1330", "元 · 1330"],
    ["ad1582", "明 · 1582"],         ["ad1820", "清 · 1820"]
  ];

  // 中國歷史地圖集 — 左图右史 / OSGeo.cn transparent period tiles.
  var OSGEO_ATTR = '<a href="https://history-map.osgeo.cn" target="_blank" rel="noopener">中國歷史地圖集 · 左图右史</a> · OSGeo.cn';
  function osgeo(uid) {
    return L.tileLayer(
      "https://tile.osgeo.cn/wmts/" + uid + "/webmercator/{z}/{x}/{y}.png",
      // hotlink-protected by Referer — suppress it to load cross-origin
      { maxNativeZoom: 8, maxZoom: 18, opacity: 0.85, zIndex: 7,
        referrerPolicy: "no-referrer", attribution: OSGEO_ATTR }
    );
  }

  var ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><polygon points="12 2 22 8.5 12 15 2 8.5 12 2"/><polyline points="2 15.5 12 22 22 15.5"/></svg>';

  function groupedControl(map, groups) {
    var ctrl = L.control({ position: "topright" });
    ctrl.onAdd = function () {
      var C = L.DomUtil.create.bind(L.DomUtil), on = L.DomEvent.on;
      var wrap = C("div", "lp");
      var btn = C("button", "lp-btn", wrap);
      btn.type = "button"; btn.title = "Map layers"; btn.setAttribute("aria-label", "Map layers");
      btn.innerHTML = ICON;
      var body = C("div", "lp-body", wrap);
      var head = C("div", "lp-head", body); head.innerHTML = "<span>Layers</span>";
      var close = C("button", "lp-close", head); close.type = "button"; close.innerHTML = "×";

      var bases = [];
      function addItem(parent, kind, label, layer) {
        var row = C("label", "lp-item", parent);
        var inp = C("input", "", row); inp.type = (kind === "base") ? "radio" : "checkbox";
        if (kind === "base") inp.name = "lp-base";
        var sp = C("span", "lp-label", row); sp.innerHTML = label; sp.title = sp.textContent;
        return { inp: inp };
      }

      groups.forEach(function (g) {
        var gEl = C("div", "lp-group" + (g.collapsible ? " collapsible" + (g.collapsed ? "" : " open") : ""), body);
        var gh = C("div", "lp-grouphead", gEl);
        gh.innerHTML = '<span class="lp-gtitle">' + g.title + "</span>" +
          (g.source ? '<span class="lp-gsrc">' + esc(g.source) + "</span>" : "");
        var items = C("div", "lp-items", gEl);

        if (g.collapsible) {
          on(gh, "click", function () { gEl.classList.toggle("open"); });
        }

        if (g.tree) {                                   // dynasty tree (atlas)
          g.tree.forEach(function (dyn) {
            var d = C("div", "lp-dyn", items);
            var dh = C("div", "lp-dynhead", d);
            dh.innerHTML = '<span class="lp-dyn-zh">' + esc(dyn.zh) + "</span>" +
              '<span class="lp-dyn-en">' + esc(dyn.en) + "</span>" +
              '<span class="lp-dyn-n">' + dyn.sections.length + "</span>";
            var di = C("div", "lp-dynitems", d);
            on(dh, "click", function () { d.classList.toggle("open"); });
            dyn.sections.forEach(function (s) {
              var it = addItem(di, "overlay", esc(s.label));
              on(it.inp, "change", function () {
                if (!s._layer) s._layer = osgeo(s.uid);
                if (it.inp.checked) map.addLayer(s._layer); else map.removeLayer(s._layer);
              });
            });
          });
          return;
        }

        g.layers.forEach(function (lyr) {               // flat group
          var it = addItem(items, g.kind, lyr.label);
          if (lyr.on) it.inp.checked = true;
          if (g.kind === "base") {
            bases.push(lyr.layer);
            on(it.inp, "change", function () {
              bases.forEach(function (b) { if (map.hasLayer(b)) map.removeLayer(b); });
              map.addLayer(lyr.layer);
            });
          } else {
            on(it.inp, "change", function () {
              if (it.inp.checked) map.addLayer(lyr.layer); else map.removeLayer(lyr.layer);
            });
          }
        });
      });

      on(btn, "click", function (e) { L.DomEvent.stop(e); wrap.classList.add("open"); });
      on(close, "click", function (e) { L.DomEvent.stop(e); wrap.classList.remove("open"); });
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.disableScrollPropagation(body);
      return wrap;
    };
    return ctrl;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var mapEl = document.getElementById("map");
    function sizeMap() {
      var top = mapEl.getBoundingClientRect().top;
      mapEl.style.height = Math.max(320, window.innerHeight - top - 4) + "px";
    }
    sizeMap();

    var map = L.map(mapEl, { scrollWheelZoom: true }).setView([34, 104], 4);
    var osm = modern("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
    });
    var sat = modern("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 18, attribution: "Imagery © Esri, Maxar, Earthstar Geographics"
    });
    var topo = modern("https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 13, attribution: "Terrain © Esri"
    });
    var light = modern("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19, subdomains: "abcd", attribution: "© OpenStreetMap, © CARTO"
    });
    sat.addTo(map);
    window.addEventListener("resize", function () { sizeMap(); map.invalidateSize(); });

    var cluster = L.markerClusterGroup({
      maxClusterRadius: 45, showCoverageOnHover: false, spiderfyOnMaxZoom: true
    });

    function buildControl(atlasTree) {
      var groups = [
        { kind: "base", title: "Base map", layers: [
          { label: "Streets", layer: osm },
          { label: "Satellite", layer: sat, on: true },
          { label: "Terrain", layer: topo },
          { label: "Light", layer: light }
        ] },
        { kind: "base", title: "Historical atlas", source: "Tan Qixiang · CCTS",
          collapsible: true, collapsed: true,
          layers: CCTS_DYN.map(function (d) { return { label: d[1], layer: ccts(d[0], { zIndex: 1 }) }; }) },
        { kind: "overlay", title: "Site catalogue", layers: [
          { label: "Sites", layer: cluster, on: true }
        ] },
        { kind: "overlay", title: "Tang overlays", source: "CCTS", layers: [
          { label: "Circuits & prefectures", layer: ccts("Tang_Admin", { zIndex: 5, opacity: 0.8 }) },
          { label: "Traffic routes", layer: ccts("Tang_TrafficRoute", { zIndex: 6, opacity: 0.8 }) }
        ] }
      ];
      if (atlasTree && atlasTree.length) {
        groups.push({ kind: "atlas", title: "中國歷史地圖集",
                      source: "左图右史 · OSGeo", collapsible: true, collapsed: true,
                      tree: atlasTree });
      }
      groupedControl(map, groups).addTo(map);
    }

    // Load the dynasty atlas tree, then build the panel (degrade gracefully)
    EpiData.fetch("data/osgeo-atlas.json")
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; })
      .then(buildControl);

    EpiData.fetch("data/site-index.json")
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
