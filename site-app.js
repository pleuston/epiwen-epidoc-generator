/* site-app.js — basic catalog site-record form editor
 *
 * Emits the de-facto site XML used across sutras-data/catalog/*_site.xml:
 *   <c:object type="site" subtype="…" xml:id="…"> with header (title en/zh,
 *   province en/zh), an optional parent link, preserved inscription/media
 *   links, and a coordinates location.
 *
 * Hierarchy: a subsite points UP at its parent via
 *   <c:link type="parent" xlink:href="<parentId>"/>
 * (link/@type is an open NCName in catalog.xsd, so this is schema-valid).
 * A parent's subsites are derived from data/site-index.json, not stored.
 */
(function () {
  "use strict";

  var XLINK_NS = "http://www.w3.org/1999/xlink";
  var SCHEMA_LOC = "http://exist-db.org/ns/catalog " +
    "http://data.stonesutras.org:8080/exist/servlet/db/schema/catalog.xsd";

  // Province en → zh controlled vocabulary (the only three in the corpus)
  var PROVINCE_ZH = {
    "Shandong Province": "山東省",
    "Sichuan Province":  "四川省",
    "Shaanxi Province":  "陝西省"
  };

  // ── State ─────────────────────────────────────────────────────────────────

  var state = {
    id:          "",
    subtype:     "mountain",
    parent:      "",
    titleEn:     "",
    titleZh:     "",
    provinceEn:  "",
    provinceZh:  "",
    coordinates: "",
    _otherLinks: []   // preserved non-parent links: [{type,href,view,capZh,capEn}]
  };

  var _siteIndex = null;   // loaded from data/site-index.json

  // ── Utilities ─────────────────────────────────────────────────────────────

  function xmlEsc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function gv(id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; }
  function sv(id, val) { var el = document.getElementById(id); if (el) el.value = val || ""; }

  function toast(msg, isErr) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.className = "show" + (isErr ? " toast-error" : "");
    setTimeout(function () { el.className = ""; }, isErr ? 6000 : 3000);
  }

  // ── XML builder ─────────────────────────────────────────────────────────────

  function buildSite() {
    var s = state;
    var x = '<?xml version="1.0" encoding="UTF-8"?>\n';
    x += '<c:object xmlns="http://www.tei-c.org/ns/1.0"';
    x += '\n          xmlns:c="http://exist-db.org/ns/catalog"';
    x += '\n          xmlns:xlink="http://www.w3.org/1999/xlink"';
    x += '\n          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"';
    x += '\n          type="site"';
    if (s.subtype) x += ' subtype="' + xmlEsc(s.subtype) + '"';
    x += ' xml:id="' + xmlEsc(s.id) + '"';
    x += '\n          xsi:schemaLocation="' + SCHEMA_LOC + '">\n';

    // Header
    x += '    <c:header>\n';
    if (s.titleEn) x += '        <c:title lang="en" type="given">' + xmlEsc(s.titleEn) + '</c:title>\n';
    if (s.titleZh) x += '        <c:title lang="zh" type="given">' + xmlEsc(s.titleZh) + '</c:title>\n';
    if (s.provinceEn) x += '        <c:province lang="en">' + xmlEsc(s.provinceEn) + '</c:province>\n';
    if (s.provinceZh) x += '        <c:province lang="zh">' + xmlEsc(s.provinceZh) + '</c:province>\n';
    x += '    </c:header>\n';

    // fileDescription: parent link first, then any preserved links
    var hasParent = !!s.parent;
    if (hasParent || s._otherLinks.length) {
      x += '    <c:fileDescription>\n';
      if (hasParent) x += '        <c:link type="parent" xlink:href="' + xmlEsc(s.parent) + '"/>\n';
      s._otherLinks.forEach(function (l) { x += buildLink(l); });
      x += '    </c:fileDescription>\n';
    }

    // Location
    if (s.coordinates) {
      x += '    <c:location>\n';
      x += '        <c:coordinates srsName="EPSG:4326">' + xmlEsc(s.coordinates) + '</c:coordinates>\n';
      x += '    </c:location>\n';
    }

    x += '</c:object>';
    return x;
  }

  function buildLink(l) {
    var attrs = ' type="' + xmlEsc(l.type) + '"';
    if (l.view) attrs += ' view="' + xmlEsc(l.view) + '"';
    attrs += ' xlink:href="' + xmlEsc(l.href || "") + '"';
    if (l.capZh != null || l.capEn != null) {
      var x = '        <c:link' + attrs + '>\n';
      x += '            <c:caption xml:lang="zh">' + xmlEsc(l.capZh || "") + '</c:caption>\n';
      x += '            <c:caption xml:lang="en">' + xmlEsc(l.capEn || "") + '</c:caption>\n';
      x += '        </c:link>\n';
      return x;
    }
    return '        <c:link' + attrs + '/>\n';
  }

  // ── XML parser (for preload / edit) ─────────────────────────────────────────

  function localName(el) { return el.localName || el.nodeName.split(":").pop(); }
  function childrenByLocal(parent, name) {
    var out = [];
    if (!parent) return out;
    for (var i = 0; i < parent.childNodes.length; i++) {
      var n = parent.childNodes[i];
      if (n.nodeType === 1 && localName(n) === name) out.push(n);
    }
    return out;
  }
  function descByLocal(root, name) {
    var out = [], all = root.getElementsByTagName("*");
    for (var i = 0; i < all.length; i++) if (localName(all[i]) === name) out.push(all[i]);
    return out;
  }
  function langOf(el) {
    return el.getAttribute("lang") || el.getAttributeNS("http://www.w3.org/XML/1998/namespace", "lang") || "";
  }

  function parseSite(xml) {
    var s = {};
    for (var k in state) if (state.hasOwnProperty(k)) s[k] = state[k];
    s._otherLinks = [];
    try {
      var doc = new DOMParser().parseFromString(xml, "application/xml");
      var root = doc.documentElement;
      if (!root || root.nodeName === "parsererror") return s;

      s.id = root.getAttribute("xml:id") ||
             root.getAttributeNS("http://www.w3.org/XML/1998/namespace", "id") || "";
      s.subtype = root.getAttribute("subtype") || "";

      descByLocal(root, "title").forEach(function (t) {
        var txt = (t.textContent || "").trim();
        if (!txt) return;
        if (langOf(t) === "en") s.titleEn = s.titleEn || txt;
        else if (langOf(t) === "zh") s.titleZh = s.titleZh || txt;
      });
      descByLocal(root, "province").forEach(function (p) {
        var txt = (p.textContent || "").trim();
        if (langOf(p) === "en") s.provinceEn = txt;
        else if (langOf(p) === "zh") s.provinceZh = txt;
      });
      var coordEls = descByLocal(root, "coordinates");
      for (var c = 0; c < coordEls.length; c++) {
        var ct = (coordEls[c].textContent || "").trim();
        if (ct) { s.coordinates = ct; break; }
      }

      descByLocal(root, "link").forEach(function (l) {
        var type = l.getAttribute("type") || "";
        var href = l.getAttributeNS(XLINK_NS, "href") || l.getAttribute("xlink:href") || "";
        if (type === "parent") { s.parent = href; return; }
        var caps = descByLocal(l, "caption");
        var rec = { type: type, href: href, view: l.getAttribute("view") || "" };
        if (caps.length) {
          rec.capZh = ""; rec.capEn = "";
          caps.forEach(function (cap) {
            if (langOf(cap) === "zh") rec.capZh = (cap.textContent || "").trim();
            else if (langOf(cap) === "en") rec.capEn = (cap.textContent || "").trim();
          });
        }
        s._otherLinks.push(rec);
      });
    } catch (e) { /* leave defaults */ }
    return s;
  }

  // ── Site index (parent picker + subsite list) ───────────────────────────────

  function loadIndex(cb) {
    if (_siteIndex) { cb(_siteIndex); return; }
    EpiData.fetch("data/site-index.json")
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (data) { _siteIndex = data || []; cb(_siteIndex); })
      .catch(function () { _siteIndex = []; cb(_siteIndex); });
  }

  function fillParentDatalist() {
    if (!_siteIndex) return;
    var dl = document.getElementById("site-parent-list");
    if (!dl) return;
    dl.innerHTML = "";
    _siteIndex
      .filter(function (r) { return r.id !== state.id; })
      .forEach(function (r) {
        var o = document.createElement("option");
        o.value = r.id;
        o.label = [r.title_en, r.title_zh].filter(Boolean).join(" ");
        dl.appendChild(o);
      });
  }

  function renderSubsites() {
    var block = document.getElementById("subsite-block");
    var box   = document.getElementById("subsite-chips");
    if (!block || !box || !_siteIndex) return;
    var kids = _siteIndex.filter(function (r) { return r.parent && r.parent === state.id && state.id; });
    if (!kids.length) { block.style.display = "none"; return; }
    box.innerHTML = "";
    kids.forEach(function (r) {
      var chip = document.createElement("span");
      chip.className = "subsite-chip";
      chip.textContent = [r.title_en, r.title_zh].filter(Boolean).join(" ") || r.id;
      box.appendChild(chip);
    });
    block.style.display = "block";
  }

  // ── Form ↔ state ─────────────────────────────────────────────────────────────

  function readForm() {
    state.id          = gv("f-id");
    state.subtype     = gv("f-subtype");
    state.parent      = gv("f-parent");
    state.titleEn     = gv("f-title-en");
    state.titleZh     = gv("f-title-zh");
    state.provinceEn  = gv("f-province-en");
    state.provinceZh  = gv("f-province-zh");
    state.coordinates = gv("f-coordinates");
  }

  function writeForm(st) {
    sv("f-id",          st.id);
    sv("f-subtype",     st.subtype || "mountain");
    sv("f-parent",      st.parent);
    sv("f-title-en",    st.titleEn);
    sv("f-title-zh",    st.titleZh);
    sv("f-province-en", st.provinceEn);
    sv("f-province-zh", st.provinceZh);
    sv("f-coordinates", st.coordinates);
  }

  function update() {
    readForm();
    var out = document.getElementById("site-xml-out");
    if (out) out.textContent = buildSite();
    renderSubsites();
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", function () {

    // Preload from sites browser "Edit" button
    var raw = sessionStorage.getItem("epiwen_preload_site");
    if (raw) {
      sessionStorage.removeItem("epiwen_preload_site");
      try {
        var preload = JSON.parse(raw);
        var parsed = preload.xml ? parseSite(preload.xml) : {};
        if (preload.id) parsed.id = preload.id;
        Object.assign(state, parsed);
        writeForm(state);
        var h = document.getElementById("editor-heading");
        if (h && state.id) h.textContent = "Edit: " + state.id;
      } catch (e) { console.warn("preload parse error", e); }
    }

    loadIndex(function () { fillParentDatalist(); renderSubsites(); });
    update();

    // Live update
    document.getElementById("site-form").addEventListener("input", update);

    // Province auto-pair (en → zh) when ZH is empty or matches a known value
    document.getElementById("f-province-en").addEventListener("input", function () {
      var en = this.value.trim();
      var zhEl = document.getElementById("f-province-zh");
      var known = Object.keys(PROVINCE_ZH).map(function (k) { return PROVINCE_ZH[k]; });
      if (PROVINCE_ZH[en] && (!zhEl.value.trim() || known.indexOf(zhEl.value.trim()) !== -1)) {
        zhEl.value = PROVINCE_ZH[en];
        update();
      }
    });

    // Refresh subsite list / datalist when the ID changes
    document.getElementById("f-id").addEventListener("input", function () {
      fillParentDatalist();
    });

    // Copy XML
    document.getElementById("site-preview-copy").addEventListener("click", function () {
      var out = document.getElementById("site-xml-out");
      var xml = out ? out.textContent : "";
      navigator.clipboard.writeText(xml)
        .then(function () { toast("XML copied"); })
        .catch(function () {
          try {
            var r = document.createRange(); r.selectNode(out);
            window.getSelection().addRange(r); document.execCommand("copy");
            toast("XML copied");
          } catch (e2) { toast("Copy failed", true); }
        });
    });

    // GitHub settings
    document.getElementById("btn-gh-settings").addEventListener("click", function () {
      if (window.EpiGitHub) EpiGitHub.showSettings();
    });

    // Save to GitHub
    document.getElementById("btn-save-github").addEventListener("click", function () {
      readForm();
      var id = state.id.trim();
      if (!id) { toast("Enter a site ID first", true); return; }
      if (!/^[A-Za-z0-9_\-\.]+$/.test(id)) {
        toast("ID may only contain letters, digits, _, - and .", true);
        return;
      }
      var xml = buildSite();
      var relPath = "catalog/" + id + "_site.xml";
      if (window.EpiGitHub) {
        EpiGitHub.saveAt(xml, relPath, function () {
          var h = document.getElementById("editor-heading");
          if (h) h.textContent = "Edit: " + id;
        });
      } else {
        toast("GitHub module not loaded", true);
      }
    });
  });
})();

/* ── EpiDoc-CN TEI place mode ─────────────────────────────────────────────────
 * The new-model site file: TEI <listPlace>/<place> with nested subsites and
 * linkGrp object pointers (epidoc-cn.js). Entered when catalog routes a TEI
 * site here (sessionStorage "epiwen_preload_site_tei") or via the "TEI mode"
 * button for a new record. The legacy c:object form above stays untouched for
 * the existing catalog sites. */
(function () {
  "use strict";
  var CN = window.EpiDocCN;
  if (!CN) return;

  var tei = null;          // EpiDocCN site state
  var teiFile = "";        // filename to save as
  var active = false;

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function labelled(text, ctrl, note) {
    var l = el("label", "form-label");
    l.style.display = "block"; l.style.marginBottom = ".5rem";
    l.appendChild(document.createTextNode(text));
    l.appendChild(ctrl);
    if (note) l.appendChild(el("span", "field-note", esc(note)));
    return l;
  }
  function input(get, set, ph) {
    var c = document.createElement("input");
    c.type = "text"; c.className = "form-input"; if (ph) c.placeholder = ph;
    c.value = get() || "";
    c.addEventListener("input", function () { set(c.value.trim()); teiUpdate(); });
    return c;
  }
  function area(get, set, ph) {
    var c = document.createElement("textarea");
    c.className = "form-input"; c.rows = 3; if (ph) c.placeholder = ph;
    c.value = get() || "";
    c.addEventListener("input", function () { set(c.value); teiUpdate(); });
    return c;
  }
  function row2(a, b) {
    var r = el("div", "form-row-2"); r.appendChild(a); r.appendChild(b); return r;
  }
  function blankPlace(type) {
    return { id: "", type: type || "site", subtype: "", ana: type === "subsite" ? "" : "crm:E27_Site",
             nameZh: "", nameEn: "", country: { zh: "中國" }, region: {}, settlement: {},
             geo: "", notes: [], objectPtrs: [], subsites: [], _x: [] };
  }
  function blankTei() {
    return { model: "site", fileId: "",
      titles: [{ lang: "zh", type: "", text: "" }, { lang: "en", type: "", text: "" }],
      titleZh: "", titleEn: "",
      authority: "Epiwen / EpiDoc-CN profile — sample", idnoType: "site", idno: "",
      availability: { status: "restricted", text: "Draft sample, not for publication." },
      sourceBibls: [], prefixes: [], place: blankPlace("site") };
  }
  function firstTitle(list, lang) {
    var f = null;
    (list || []).forEach(function (t) { if (t.lang === lang && !f) f = t; });
    return f;
  }
  function setTitle(list, lang, text) {
    var t = firstTitle(list, lang);
    if (!t) { t = { lang: lang, type: "", text: "" }; list.push(t); }
    t.text = text;
  }

  function placeFields(container, p, depth) {
    container.appendChild(row2(
      labelled("xml:id", input(function () { return p.id; }, function (v) { p.id = v; }, "SNS")),
      labelled("subtype", input(function () { return p.subtype; }, function (v) { p.subtype = v; }, "mountain / section"))
    ));
    container.appendChild(row2(
      labelled("Name 中文", input(function () { return p.nameZh; }, function (v) { p.nameZh = v; }, "水牛山")),
      labelled("Name EN", input(function () { return p.nameEn; }, function (v) { p.nameEn = v; }, "Mount Shuiniu"))
    ));
    if (depth === 0) {
      container.appendChild(row2(
        labelled("Region 中文", input(function () { return p.region.zh || ""; }, function (v) { p.region.zh = v; }, "山東省")),
        labelled("Region EN", input(function () { return p.region.en || ""; }, function (v) { p.region.en = v; }, "Shandong Province"))
      ));
      container.appendChild(row2(
        labelled("Settlement 中文", input(function () { return p.settlement.zh || ""; }, function (v) { p.settlement.zh = v; }, "安岳")),
        labelled("Settlement EN", input(function () { return p.settlement.en || ""; }, function (v) { p.settlement.en = v; }, "Anyue"))
      ));
    }
    container.appendChild(labelled("Coordinates (geo: lat lon)",
      input(function () { return p.geo; }, function (v) { p.geo = v; }, "35.7704 116.6635"),
      "TEI <geo> order: latitude longitude (the upstream lon-lat string belongs in a source-coordinates note)"));
    container.appendChild(labelled("Object files borne (one target per line)",
      area(function () { return (p.objectPtrs || []).join("\n"); },
           function (v) { p.objectPtrs = v.split("\n").map(function (s) { return s.trim(); }).filter(Boolean); },
           "SNS_stele.xml#SNS_stele"),
      "linkGrp type=\"objects\" — each line one <ptr type=\"object\"> target"));
    container.appendChild(labelled("Notes (type | lang | text — one per line)",
      area(function () {
        return (p.notes || []).map(function (n) { return [n.type, n.lang, n.xml].join(" | "); }).join("\n");
      }, function (v) {
        p.notes = v.split("\n").map(function (s) { return s.trim(); }).filter(Boolean).map(function (line) {
          var parts = line.split("|");
          return { type: (parts[0] || "").trim(), lang: (parts[1] || "").trim(), xml: (parts.slice(2).join("|") || "").trim() };
        });
      }, "source-coordinates |  | upstream lon-lat verbatim: …")));
  }

  function teiRender() {
    var root = document.getElementById("tei-site-form");
    if (!root) return;
    root.innerHTML = "";
    root.appendChild(el("p", "section-head", "File"));
    root.appendChild(row2(
      labelled("File name", input(function () { return teiFile; }, function (v) { teiFile = v; }, "SNS_site.xml")),
      labelled("TEI file id", input(function () { return tei.fileId; }, function (v) { tei.fileId = v; }, "SNS_site"))
    ));
    root.appendChild(row2(
      labelled("idno (site)", input(function () { return tei.idno; }, function (v) { tei.idno = v; }, "SNS")),
      labelled("Authority", input(function () { return tei.authority; }, function (v) { tei.authority = v; }))
    ));
    root.appendChild(row2(
      labelled("Title 中文", input(function () { return (firstTitle(tei.titles, "zh") || {}).text; }, function (v) { setTitle(tei.titles, "zh", v); })),
      labelled("Title EN", input(function () { return (firstTitle(tei.titles, "en") || {}).text; }, function (v) { setTitle(tei.titles, "en", v); }))
    ));
    root.appendChild(el("p", "section-head", "Place 地點"));
    placeFields(root, tei.place, 0);

    root.appendChild(el("p", "section-head", "Subsites 子地點"));
    var subBox = el("div", null);
    root.appendChild(subBox);
    function renderSubs() {
      subBox.innerHTML = "";
      (tei.place.subsites || []).forEach(function (sp, i) {
        var box = el("div", "textblock");
        var head = el("div", "textblock-head", "<strong>subsite " + (i + 1) + "</strong>");
        var del = el("button", "btn small", "− remove");
        del.type = "button";
        del.addEventListener("click", function () { tei.place.subsites.splice(i, 1); renderSubs(); teiUpdate(); });
        head.appendChild(del);
        box.appendChild(head);
        placeFields(box, sp, 1);
        subBox.appendChild(box);
      });
      var add = el("button", "btn", "+ add subsite 增加子地點");
      add.type = "button";
      add.addEventListener("click", function () {
        tei.place.subsites.push(blankPlace("subsite"));
        renderSubs(); teiUpdate();
      });
      subBox.appendChild(add);
    }
    renderSubs();

    var save = el("button", "btn primary", "② Save to GitHub");
    save.type = "button";
    save.addEventListener("click", function () {
      if (window.EpiGitHub) EpiGitHub.save(teiXml(), teiFile || ((tei.place.id || "site") + "_site.xml"));
    });
    var wrap = el("div", null); wrap.style.cssText = "display:flex;gap:.6rem;margin:1rem 0";
    wrap.appendChild(save);
    root.appendChild(wrap);
  }
  function teiXml() { return CN.buildSite(tei); }
  function teiUpdate() {
    var out = document.getElementById("site-xml-out");
    if (out) out.textContent = teiXml();
  }

  function enterTei(parsed, filename) {
    tei = parsed || blankTei();
    teiFile = filename || (tei.place && tei.place.id ? tei.place.id + "_site.xml" : "");
    active = true;
    var legacy = document.getElementById("site-form");
    var teiForm = document.getElementById("tei-site-form");
    if (legacy) legacy.style.display = "none";
    if (teiForm) teiForm.style.display = "block";
    var h = document.getElementById("editor-heading");
    if (h) h.textContent = "Site record (EpiDoc-CN)" + (tei.place.id ? " — " + tei.place.id : "");
    var btn = document.getElementById("btn-mode-tei");
    if (btn) btn.style.display = "none";
    teiRender(); teiUpdate();
  }

  document.addEventListener("DOMContentLoaded", function () {
    var raw = sessionStorage.getItem("epiwen_preload_site_tei");
    if (raw) {
      sessionStorage.removeItem("epiwen_preload_site_tei");
      try {
        var o = JSON.parse(raw);
        var parsed = o.rawXml && CN.detect(o.rawXml) === "site" ? CN.parseSite(o.rawXml) : null;
        if (o._writeTarget && window.EpiGitHub && EpiGitHub.setTarget) EpiGitHub.setTarget(o._writeTarget);
        enterTei(parsed, o.filename || "");
        return;
      } catch (e) { console.warn("epiwen_preload_site_tei parse error", e); }
    }
    var btn = document.getElementById("btn-mode-tei");
    if (btn) btn.addEventListener("click", function () { enterTei(null, ""); });
  });
})();
