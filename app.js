/* app.js — Epiwen inscription editor (EpiDoc-CN profile).
 *
 * The form binds directly onto the EpiDocCN inscription state (epidoc-cn.js):
 * what you edit is what buildInscription() serializes, so sample files from the
 * epidoc-cn collection round-trip through the form without loss (unmodeled
 * elements ride along in _x raw buckets). Legacy records (the pre-2026-07 flat
 * EpiDoc shape) preload via a field mapping and are migrated on save.
 *
 * sessionStorage "epiwen_preload": { rawXml, ... } from catalog.html "Edit".
 */
(function () {
  "use strict";
  var CN = window.EpiDocCN;

  // ---- state ---------------------------------------------------------------
  function blankState() {
    return {
      model: "inscription", fileId: "",
      titles: [{ lang: "zh", type: "", text: "" }, { lang: "en", type: "", text: "" }],
      titleZh: "", titleEn: "",
      authority: "Epiwen / EpiDoc-CN profile — sample",
      idnoType: "filename", idno: "",
      availability: { status: "restricted", text: "Draft sample, not for publication." },
      sourceBibls: [], prefixes: [],
      corresp: "",
      msIdent: { country: "中國", region: "", settlement: "", idnoEdition: "", idnoSupport: "",
                 idnoSegment: "", altType: "sutras-data", altIdno: "", _x: [] },
      msContents: { summaryEn: "", summaryZh: "", items: [
        { n: "", corresp: "", locusTarget: "", locusText: "", titles: [
            { lang: "zh", type: "", text: "" }, { lang: "en", type: "", text: "" }],
          notes: [], mainLang: "lzh", _x: [] } ] },
      phys: { form: "", supportItems: [], condition: null, layout: { columns: "", ruledLines: "", items: [] },
              deco: [], hand: null, _x: [] },
      history: { date: null, dateNotes: [], place: null, provenance: null, _x: [] },
      witnesses: [],
      languages: [{ ident: "lzh", label: "Literary Chinese" }],
      textNext: "", textPrev: "",
      edition: { lang: "lzh", mode: "ptr", ptrTarget: "", inlineText: "" },
      bibls: [], _bodyX: []
    };
  }
  var state = blankState();
  var TAX = CN.FALLBACK_TAX;
  var _viewMode = "xml";

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  // ---- slot accessors (ordered-item lists) ----------------------------------
  function suppItem(kind) {                       // objectType / material slot in supportItems
    return CN.findItem(state.phys.supportItems, kind);
  }
  function setSuppClassified(kind, cat) {         // cat = {id, zh, en, ref}
    var it = CN.upsertItem(state.phys.supportItems, kind,
      function () { return { kind: kind }; }, kind === "objectType");
    it.ana = "#" + cat.id; it.ref = cat.ref || ""; it.zh = cat.zh; it.en = cat.en; it.text = "";
  }
  function fieldDims() {
    var it = CN.findItem(state.phys.supportItems, "dimensions");
    return it ? it.dims : null;
  }
  function setFieldDim(el, val) {
    var it = CN.upsertItem(state.phys.supportItems, "dimensions",
      function () { return { kind: "dimensions", dims: { type: "field", unit: "cm", parts: [] } }; });
    var part = null;
    it.dims.parts.forEach(function (p) { if (p.el === el) part = p; });
    if (!part) { part = { el: el, n: "", unit: "cm", atLeast: "", atMost: "", text: "" }; it.dims.parts.push(part); }
    part.text = val;
    it.dims.parts = it.dims.parts.filter(function (p) { return p.text || p.atLeast || p.atMost; });
    if (!it.dims.parts.length) {
      state.phys.supportItems = state.phys.supportItems.filter(function (x) { return x !== it; });
    }
  }
  function getFieldDim(el) {
    var d = fieldDims(); if (!d) return "";
    var out = "";
    d.parts.forEach(function (p) { if (p.el === el) out = p.text; });
    return out;
  }
  function layoutRs(type) {
    var L = state.phys.layout || (state.phys.layout = { columns: "", ruledLines: "", items: [] });
    var found = null;
    L.items.forEach(function (it) { if (it.kind === "rs" && it.type === type) found = it; });
    return found;
  }
  function setLayoutRs(type, cat) {
    var L = state.phys.layout || (state.phys.layout = { columns: "", ruledLines: "", items: [] });
    var it = layoutRs(type);
    if (!it) { it = { kind: "rs", type: type }; L.items.push(it); }
    it.ana = "#" + cat.id; it.zh = cat.zh; it.en = cat.en; it.text = "";
  }
  function ensureCondition() {
    if (!state.phys.condition) state.phys.condition = { ana: "", pZh: "", pEn: "", notes: [] };
    return state.phys.condition;
  }
  function ensureHand() {
    if (!state.phys.hand) state.phys.hand = { scope: "sole", script: "", ana: "", items: [] };
    return state.phys.hand;
  }
  function handP(lang) {
    var h = state.phys.hand; if (!h) return null;
    var found = null;
    h.items.forEach(function (it) { if (it.kind === "p" && (it.lang || "en") === lang) found = it; });
    return found;
  }
  function setHandP(lang, text) {
    var h = ensureHand(); var it = handP(lang);
    if (!it) { it = { kind: "p", lang: lang, text: "" }; h.items.unshift(it); }
    it.text = text;
  }
  function handLetter() {
    var h = state.phys.hand; if (!h) return null;
    var f = CN.findItem(h.items, "dimensions");
    return f && f.dims.type === "letterHeight" ? f : null;
  }
  function setHandLetter(atLeast, atMost) {
    var h = ensureHand();
    var it = handLetter();
    if (!atLeast && !atMost) {
      if (it) h.items = h.items.filter(function (x) { return x !== it; });
      return;
    }
    if (!it) { it = { kind: "dimensions", dims: { type: "letterHeight", unit: "cm", parts: [] } }; h.items.push(it); }
    var p = it.dims.parts[0];
    if (!p) { p = { el: "height", n: "", unit: "cm" }; it.dims.parts = [p]; }
    p.atLeast = atLeast; p.atMost = atMost;
    p.text = atLeast && atMost ? atLeast + "–" + atMost : (atLeast || atMost);
  }
  function handGlyphPtr() {
    var h = state.phys.hand; if (!h) return "";
    var f = CN.findItem(h.items, "ptr");
    return f ? f.target : "";
  }
  function setHandGlyphPtr(v) {
    var h = ensureHand();
    var it = CN.findItem(h.items, "ptr");
    if (!v) { if (it) h.items = h.items.filter(function (x) { return x !== it; }); return; }
    if (!it) { it = { kind: "ptr", type: "glyph-metrics", target: "" }; h.items.push(it); }
    it.target = v;
  }
  function ensureHistory() {
    if (!state.history) state.history = { date: null, dateNotes: [], place: null, provenance: null, _x: [] };
    return state.history;
  }
  function firstTitle(list, lang) {
    var found = null;
    (list || []).forEach(function (t) { if (t.lang === lang && !found && !t.type) found = t; });
    if (!found) (list || []).forEach(function (t) { if (t.lang === lang && !found) found = t; });
    return found;
  }
  function setTitle(list, lang, text) {
    var t = firstTitle(list, lang);
    if (!t) { t = { lang: lang, type: "", text: "" }; list.push(t); }
    t.text = text;
  }

  // ---- form rendering --------------------------------------------------------
  var FORM;
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function sectionTitle(en, zh) {
    return el("div", "section-title", '<span class="en">' + esc(en) + '</span><span class="zh">' + esc(zh) + "</span>");
  }
  function labelled(en, zh, ctrl, hint) {
    var w = el("div", "field");
    w.innerHTML = '<span class="label"><span class="en">' + esc(en) + '</span>' + (zh ? '<span class="zh">' + esc(zh) + "</span>" : "") + "</span>";
    w.appendChild(ctrl);
    if (hint) w.appendChild(el("div", "hint", '<span class="en">' + esc(hint) + "</span>"));
    return w;
  }
  function input(get, set, ph, mono) {
    var c = document.createElement("input");
    c.type = "text"; if (ph) c.placeholder = ph; if (mono) c.className = "mono";
    c.value = get() || "";
    c.addEventListener("input", function () { set(c.value.trim()); update(); });
    return c;
  }
  function area(get, set, ph, mono) {
    var c = document.createElement("textarea");
    if (ph) c.placeholder = ph; if (mono) c.className = "mono";
    c.value = get() || "";
    c.addEventListener("input", function () { set(c.value); update(); });
    return c;
  }
  function rowOf() {
    var r = el("div", "field row");
    [].slice.call(arguments).forEach(function (c) { c.classList.remove("field"); r.appendChild(c); });
    return r;
  }
  /* taxonomy picker bound to a classified slot */
  function taxPicker(taxKey, en, zh, getAna, setCat, allowClear) {
    var w = el("div", "field");
    w.innerHTML = '<span class="label"><span class="en">' + esc(en) + '</span><span class="zh">' + esc(zh) + "</span></span>";
    var sel = document.createElement("select");
    function fill() {
      var opts = (TAX[taxKey] || []);
      sel.innerHTML = '<option value="">—</option>' + opts.map(function (o, i) {
        return '<option value="' + i + '">' + esc(o.zh + " · " + o.en) + "</option>";
      }).join("");
      var ana = (getAna() || "").replace(/^#/, "");
      opts.forEach(function (o, i) { if (o.id === ana) sel.value = String(i); });
    }
    fill();
    sel.addEventListener("change", function () {
      var i = parseInt(sel.value, 10);
      if (isNaN(i)) { if (allowClear) allowClear(); }
      else setCat((TAX[taxKey] || [])[i]);
      update();
    });
    w.appendChild(sel);
    w._refill = fill;
    return w;
  }

  // repeatable list scaffold; removeItem for lists backed by a filtered copy
  function repeatable(container, list, renderOne, addLabel, makeNew, removeItem) {
    function renderAll() {
      container.innerHTML = "";
      list().forEach(function (item, i) {
        var box = el("div", "textblock");
        var head = el("div", "textblock-head");
        head.innerHTML = "<strong>" + (i + 1) + "</strong>";
        var del = el("button", "btn small", "− remove");
        del.type = "button";
        del.addEventListener("click", function () {
          if (removeItem) removeItem(item, i);
          else list().splice(i, 1);
          renderAll(); update();
        });
        head.appendChild(del);
        box.appendChild(head);
        renderOne(box, item, i);
        container.appendChild(box);
      });
      var add = el("button", "btn", "+ " + addLabel);
      add.type = "button";
      add.addEventListener("click", function () {
        var made = makeNew();
        if (!removeItem && list().indexOf(made) === -1) list().push(made);
        renderAll(); update();
      });
      container.appendChild(add);
    }
    renderAll();
    return renderAll;
  }

  function notesEditor(getList) {
    var wrap = el("div", null);
    repeatable(wrap, getList, function (box, nn) {
      box.appendChild(rowOf(
        labelled("type", "類型", input(function () { return nn.type; }, function (v) { nn.type = v; })),
        labelled("lang", "語言", input(function () { return nn.lang; }, function (v) { nn.lang = v; }, "zh / en"))
      ));
      box.appendChild(labelled("note (XML/text)", "註記", area(function () { return nn.xml; }, function (v) { nn.xml = v; }, "", true)));
    }, "add note 增加註記", function () { return { type: "", lang: "", xml: "" }; });
    return wrap;
  }

  function render() {
    FORM = document.getElementById("form");
    FORM.innerHTML = "";

    // — Identity
    FORM.appendChild(sectionTitle("Identity", "著錄"));
    FORM.appendChild(labelled("File name", "檔名",
      input(function () { return state.idno; }, function (v) { state.idno = v; }, "SNS_1.xml")));
    var tWrap = el("div", null);
    FORM.appendChild(labelled("Titles (zh/en; typed: engraved / abbreviated …)", "標題", tWrap));
    repeatable(tWrap, function () { return state.titles; }, function (box, t) {
      box.appendChild(rowOf(
        labelled("lang", "語言", input(function () { return t.lang; }, function (v) { t.lang = v; }, "zh / en")),
        labelled("type", "類型", input(function () { return t.type; }, function (v) { t.type = v; }, "engraved / abbreviated")),
        labelled("title", "標題", input(function () { return t.text; }, function (v) { t.text = v; }))
      ));
    }, "add title 增加標題", function () { return { lang: "zh", type: "", text: "" }; });

    // — Link & identifiers
    FORM.appendChild(sectionTitle("Object link & identifiers", "所屬器物與編號"));
    FORM.appendChild(labelled("Object file (corresp)", "器物檔 @corresp",
      input(function () { return state.corresp; }, function (v) { state.corresp = v; }, "SNS_1_object.xml#SNS_1"),
      "the msDesc points at its bearer: OBJECT.xml#faceId (space-separated for spans)"));
    FORM.appendChild(rowOf(
      labelled("Country", "國別", input(function () { return state.msIdent.country; }, function (v) { state.msIdent.country = v; }, "中國")),
      labelled("Region", "省", input(function () { return state.msIdent.region; }, function (v) { state.msIdent.region = v; }, "山東省")),
      labelled("Settlement", "市縣", input(function () { return state.msIdent.settlement; }, function (v) { state.msIdent.settlement = v; }))
    ));
    FORM.appendChild(rowOf(
      labelled("idno edition", "版本編號", input(function () { return state.msIdent.idnoEdition; }, function (v) { state.msIdent.idnoEdition = v; }, "SNS_1")),
      labelled("idno support", "載體編號", input(function () { return state.msIdent.idnoSupport; }, function (v) { state.msIdent.idnoSupport = v; }, "SNS_1")),
      labelled("idno segment", "分段編號", input(function () { return state.msIdent.idnoSegment; }, function (v) { state.msIdent.idnoSegment = v; }))
    ));
    FORM.appendChild(rowOf(
      labelled("Alt-identifier type", "外部編號類型", input(function () { return state.msIdent.altType; }, function (v) { state.msIdent.altType = v; }, "sutras-data")),
      labelled("Alt-identifier", "外部編號", input(function () { return state.msIdent.altIdno; }, function (v) { state.msIdent.altIdno = v; }, "catalog/SNS_1.xml"))
    ));

    // — Contents
    FORM.appendChild(sectionTitle("Contents", "內容"));
    FORM.appendChild(labelled("Summary (en)", "內容提要",
      area(function () { return state.msContents.summaryEn; }, function (v) { state.msContents.summaryEn = v; })));
    var item0 = state.msContents.items[0];
    FORM.appendChild(labelled("Text title 中文", "文本標題（中）",
      input(function () { return (firstTitle(item0.titles, "zh") || {}).text; },
            function (v) { setTitle(item0.titles, "zh", v); })));
    FORM.appendChild(labelled("Text title EN", "文本標題（英）",
      input(function () { return (firstTitle(item0.titles, "en") || {}).text; },
            function (v) { setTitle(item0.titles, "en", v); })));
    FORM.appendChild(labelled("Text language", "文本語言",
      input(function () { return item0.mainLang; }, function (v) { item0.mainLang = v; }, "lzh")));

    // — Physical (text-specific: the script field)
    FORM.appendChild(sectionTitle("Physical — script field", "形制（銘刻面）"));
    FORM.appendChild(taxPicker("objectTypes", "Object type", "類型",
      function () { var it = suppItem("objectType"); return it && it.ana; },
      function (cat) { setSuppClassified("objectType", cat); }));
    FORM.appendChild(taxPicker("materials", "Material", "材質",
      function () { var it = suppItem("material"); return it && it.ana; },
      function (cat) { setSuppClassified("material", cat); }));
    FORM.appendChild(rowOf(
      labelled("Field height (cm)", "字面高", input(function () { return getFieldDim("height"); }, function (v) { setFieldDim("height", v); })),
      labelled("Field width (cm)", "字面寬", input(function () { return getFieldDim("width"); }, function (v) { setFieldDim("width", v); }))
    ));
    var supNotes = el("div", null);
    FORM.appendChild(labelled("Support notes (orientation …)", "載體註記", supNotes));
    (function () {
      function getNotes() {
        var out = [];
        state.phys.supportItems.forEach(function (it) { if (it.kind === "note") out.push(it); });
        return out;
      }
      repeatable(supNotes, getNotes, function (box, nn) {
        box.appendChild(rowOf(
          labelled("type", "類型", input(function () { return nn.type; }, function (v) { nn.type = v; }, "orientation")),
          labelled("lang", "語言", input(function () { return nn.lang; }, function (v) { nn.lang = v; }))
        ));
        box.appendChild(labelled("note", "註記", area(function () { return nn.xml; }, function (v) { nn.xml = v; }, "", true)));
      }, "add support note", function () {
        var nn = { kind: "note", type: "", lang: "", xml: "" };
        state.phys.supportItems.push(nn);
        return nn;
      }, function (item) {
        var i = state.phys.supportItems.indexOf(item);
        if (i >= 0) state.phys.supportItems.splice(i, 1);
      });
    })();
    FORM.appendChild(taxPicker("conditions", "Condition", "狀況",
      function () { return state.phys.condition && state.phys.condition.ana; },
      function (cat) { var c = ensureCondition(); c.ana = "#" + cat.id; }));
    FORM.appendChild(rowOf(
      labelled("Condition 中文", "狀況（中）", input(
        function () { return state.phys.condition ? state.phys.condition.pZh : ""; },
        function (v) { ensureCondition().pZh = v; })),
      labelled("Condition EN", "狀況（英）", input(
        function () { return state.phys.condition ? state.phys.condition.pEn : ""; },
        function (v) { ensureCondition().pEn = v; }))
    ));
    FORM.appendChild(rowOf(
      labelled("Columns", "行數", input(
        function () { return state.phys.layout ? state.phys.layout.columns : ""; },
        function (v) { (state.phys.layout || (state.phys.layout = { items: [] })).columns = v; })),
      labelled("Ruled lines 界格 (0 = checked, absent)", "界格", input(
        function () { return state.phys.layout ? state.phys.layout.ruledLines : ""; },
        function (v) { (state.phys.layout || (state.phys.layout = { items: [] })).ruledLines = v; }))
    ));
    FORM.appendChild(taxPicker("shapes", "Field shape", "形制",
      function () { var it = layoutRs("shape"); return it && it.ana; },
      function (cat) { setLayoutRs("shape", cat); }));
    FORM.appendChild(taxPicker("executions", "Carving technique", "刻法",
      function () { var it = layoutRs("execution"); return it && it.ana; },
      function (cat) { setLayoutRs("execution", cat); }));
    FORM.appendChild(taxPicker("features", "Frame", "邊框",
      function () { var it = layoutRs("frame"); return it && it.ana; },
      function (cat) { setLayoutRs("frame", cat); }));
    FORM.appendChild(taxPicker("surfaceTreatments", "Polishing", "磨光",
      function () { var it = layoutRs("polishing"); return it && it.ana; },
      function (cat) { setLayoutRs("polishing", cat); }));

    // — Hand
    FORM.appendChild(sectionTitle("Hand & glyphs", "書手與字徑"));
    FORM.appendChild(labelled("Hand description (en)", "書手說明",
      area(function () { var p = handP("en"); return p ? p.text : ""; },
           function (v) { setHandP("en", v); })));
    FORM.appendChild(rowOf(
      labelled("Letter height min (cm)", "字徑下限", input(
        function () { var it = handLetter(); return it && it.dims.parts[0] ? it.dims.parts[0].atLeast : ""; },
        function (v) { var it = handLetter(); setHandLetter(v, it && it.dims.parts[0] ? it.dims.parts[0].atMost : ""); })),
      labelled("Letter height max (cm)", "字徑上限", input(
        function () { var it = handLetter(); return it && it.dims.parts[0] ? it.dims.parts[0].atMost : ""; },
        function (v) { var it = handLetter(); setHandLetter(it && it.dims.parts[0] ? it.dims.parts[0].atLeast : "", v); }))
    ));
    FORM.appendChild(labelled("Glyph-metrics dataset (ptr)", "字徑資料集",
      input(function () { return handGlyphPtr(); }, function (v) { setHandGlyphPtr(v); }, "SNS_1_glyphs.csv"),
      "two-track split: the per-glyph array is a linked CSV, not TEI"));

    // — Date & place
    FORM.appendChild(sectionTitle("Date & place", "紀年與地點"));
    FORM.appendChild(rowOf(
      labelled("when", "確切年", input(
        function () { return state.history.date ? state.history.date.when : ""; },
        function (v) { (ensureHistory().date || (state.history.date = {})).when = v; })),
      labelled("notBefore", "不早於", input(
        function () { return state.history.date ? state.history.date.notBefore : ""; },
        function (v) { (ensureHistory().date || (state.history.date = {})).notBefore = v; })),
      labelled("notAfter", "不晚於", input(
        function () { return state.history.date ? state.history.date.notAfter : ""; },
        function (v) { (ensureHistory().date || (state.history.date = {})).notAfter = v; }))
    ));
    FORM.appendChild(labelled("Date as written", "紀年原文", input(
      function () { return state.history.date ? state.history.date.text : ""; },
      function (v) { (ensureHistory().date || (state.history.date = {})).text = v; }, "公元五五八到六六一年 (558–661)")));
    FORM.appendChild(rowOf(
      labelled("Site file ref", "地點檔", input(
        function () { return state.history.place ? state.history.place.ref : ""; },
        function (v) { (ensureHistory().place || (state.history.place = { lang: "zh" })).ref = v; }, "SNS_site.xml#SNS")),
      labelled("Place name", "地名", input(
        function () { return state.history.place ? state.history.place.text : ""; },
        function (v) { (ensureHistory().place || (state.history.place = { lang: "zh" })).text = v; }, "水牛山"))
    ));

    // — Witnesses
    FORM.appendChild(sectionTitle("Witnesses (rubbings …)", "見證（拓本…）"));
    var witBox = el("div", null); FORM.appendChild(witBox);
    repeatable(witBox, function () { return state.witnesses; }, function (box, w) {
      box.appendChild(rowOf(
        labelled("xml:id", "編號 id", input(function () { return w.id; }, function (v) { w.id = v; }, "SNS_1_rub_A")),
        labelled("n", "序", input(function () { return w.n; }, function (v) { w.n = v; }, "A")),
        labelled("type (@ana)", "類型", input(function () { return w.ana; }, function (v) { w.ana = v; }, "#witness.rubbing"))
      ));
      var itemsBox = el("div", null);
      box.appendChild(labelled("bibl items (in order)", "著錄項", itemsBox));
      repeatable(itemsBox, function () { return w.items; }, function (ibox, it) {
        var kindSel = document.createElement("select");
        ["rs", "date", "orgName", "placeName", "idno", "extent", "note", "raw"].forEach(function (k) {
          var o = document.createElement("option"); o.value = k; o.textContent = k;
          if (it.kind === k) o.selected = true;
          kindSel.appendChild(o);
        });
        kindSel.addEventListener("change", function () { it.kind = kindSel.value; renderAllWitnesses(); update(); });
        ibox.appendChild(labelled("kind", "類", kindSel));
        if (it.kind === "rs") {
          ibox.appendChild(rowOf(
            labelled("ana", "", input(function () { return it.ana; }, function (v) { it.ana = v; }, "#witness.rubbing")),
            labelled("zh", "", input(function () { return it.zh; }, function (v) { it.zh = v; }, "拓本")),
            labelled("en", "", input(function () { return it.en; }, function (v) { it.en = v; }, "rubbing"))
          ));
        } else if (it.kind === "date") {
          ibox.appendChild(rowOf(
            labelled("when", "", input(function () { return it.when; }, function (v) { it.when = v; }, "1998")),
            labelled("text", "", input(function () { return it.text; }, function (v) { it.text = v; }, "made 1998"))
          ));
        } else if (it.kind === "orgName") {
          ibox.appendChild(rowOf(
            labelled("role", "", input(function () { return it.role; }, function (v) { it.role = v; }, "repository")),
            labelled("lang", "", input(function () { return it.lang; }, function (v) { it.lang = v; }, "zh")),
            labelled("name", "", input(function () { return it.text; }, function (v) { it.text = v; }))
          ));
        } else if (it.kind === "placeName") {
          ibox.appendChild(rowOf(
            labelled("lang", "", input(function () { return it.lang; }, function (v) { it.lang = v; }, "en")),
            labelled("place", "", input(function () { return it.text; }, function (v) { it.text = v; }, "Jinan"))
          ));
        } else if (it.kind === "idno") {
          ibox.appendChild(rowOf(
            labelled("type", "", input(function () { return it.type; }, function (v) { it.type = v; }, "accession")),
            labelled("no.", "", input(function () { return it.text; }, function (v) { it.text = v; }))
          ));
        } else if (it.kind === "extent") {
          ibox.appendChild(labelled("extent", "", input(function () { return it.text; }, function (v) { it.text = v; }, "2 sheets: 257 × 86 cm")));
        } else {
          ibox.appendChild(rowOf(
            labelled("type", "", input(function () { return it.type; }, function (v) { it.type = v; })),
            labelled("lang", "", input(function () { return it.lang; }, function (v) { it.lang = v; }))
          ));
          ibox.appendChild(labelled("content", "", area(function () { return it.xml; }, function (v) { it.xml = v; }, "", true)));
        }
      }, "add item 增加著錄項", function () { return { kind: "note", type: "", lang: "zh", xml: "" }; });
    }, "add witness 增加見證", function () {
      return { id: "", n: "", ana: "#witness.rubbing",
               items: [{ kind: "rs", ana: "#witness.rubbing", zh: "拓本", en: "rubbing" }] };
    });
    function renderAllWitnesses() { render(); }   // kind switch re-renders the whole form

    // — Edition
    FORM.appendChild(sectionTitle("Edition", "錄文"));
    var modeSel = document.createElement("select");
    [["ptr", "delegated — <ptr> to the upstream transcription"], ["inline", "inline transcription"]].forEach(function (p) {
      var o = document.createElement("option"); o.value = p[0]; o.textContent = p[1];
      if (state.edition.mode === p[0]) o.selected = true;
      modeSel.appendChild(o);
    });
    modeSel.addEventListener("change", function () { state.edition.mode = modeSel.value; render(); update(); });
    FORM.appendChild(labelled("Edition mode", "錄文方式", modeSel));
    if (state.edition.mode === "ptr") {
      FORM.appendChild(labelled("Transcription pointer", "錄文連結",
        input(function () { return state.edition.ptrTarget; }, function (v) { state.edition.ptrTarget = v; },
          "sutras:docs/Shuiniushan/SNS_1.xml", true)));
    } else {
      FORM.appendChild(labelled("Edition content (XML: <ab> with lb/app/supplied…; optional <listWit>)", "錄文",
        area(function () { return state.edition.inlineText; }, function (v) { state.edition.inlineText = v; }, "", true)));
    }
    FORM.appendChild(rowOf(
      labelled("text @next", "後續記錄", input(function () { return state.textNext; }, function (v) { state.textNext = v; })),
      labelled("text @prev", "前一記錄", input(function () { return state.textPrev; }, function (v) { state.textPrev = v; }))
    ));

    // — Bibliography
    FORM.appendChild(sectionTitle("Canonical bibliography", "經藏著錄"));
    var biblBox = el("div", null); FORM.appendChild(biblBox);
    repeatable(biblBox, function () { return state.bibls; }, function (box, b) {
      if (b.canonical) {
        box.appendChild(rowOf(
          labelled("Taishō no.", "大正藏", input(function () { return b.taisho; }, function (v) { b.taisho = v; }, "T_232")),
          labelled("Cited range", "頁行", input(function () { return b.range; }, function (v) { b.range = v; }, "728a26–29"))
        ));
      } else {
        box.appendChild(labelled("bibl (raw XML)", "著錄", area(function () { return b.xml; }, function (v) { b.xml = v; }, "", true)));
      }
    }, "add canonical ref 增加經藏著錄", function () { return { canonical: true, taisho: "", range: "" }; });

    // — Publication
    FORM.appendChild(sectionTitle("Publication", "出版"));
    FORM.appendChild(labelled("Authority", "發布機構",
      input(function () { return state.authority; }, function (v) { state.authority = v; })));
    FORM.appendChild(rowOf(
      labelled("Availability status", "可用性", input(
        function () { return state.availability ? state.availability.status : "restricted"; },
        function (v) { (state.availability || (state.availability = {})).status = v; })),
      labelled("Availability note", "說明", input(
        function () { return state.availability ? state.availability.text : ""; },
        function (v) { (state.availability || (state.availability = {})).text = v; }))
    ));
  }

  // ---- preview card ----------------------------------------------------------
  function buildPreview() {
    function row(l, v) { return v ? "<dt>" + esc(l) + "</dt><dd>" + esc(v) + "</dd>" : ""; }
    function sec(t, rows) {
      var r = rows.filter(Boolean).join("");
      return r ? '<section class="hp-section"><h4 class="hp-st">' + esc(t) + '</h4><dl class="hp-dl">' + r + "</dl></section>" : "";
    }
    var zh = (firstTitle(state.titles, "zh") || {}).text, en = (firstTitle(state.titles, "en") || {}).text;
    var ot = suppItem("objectType"), mat = suppItem("material");
    var cond = state.phys.condition;
    var d = fieldDims();
    var dimsStr = d ? d.parts.map(function (p) { return p.el + " " + p.text; }).join(" × ") : "";
    var html = '<div class="hp-preview">';
    html += sec("Identity", [row("File", state.idno), row("Title 中", zh), row("Title EN", en),
      row("Object", state.corresp), row("Edition id", state.msIdent.idnoEdition), row("Support", state.msIdent.idnoSupport)]);
    html += sec("Physical", [
      row("Type", ot ? ot.zh + " " + ot.en : ""), row("Material", mat ? mat.zh + " " + mat.en : ""),
      row("Script field", dimsStr && dimsStr + " cm"),
      row("Condition", cond ? (cond.pZh || cond.pEn || cond.ana) : ""),
      row("Columns / 界格", state.phys.layout ? [state.phys.layout.columns, state.phys.layout.ruledLines].filter(function (x) { return x !== ""; }).join(" / ") : "")]);
    html += sec("Date & place", [
      row("Date", state.history.date ? (state.history.date.text || state.history.date.when) : ""),
      row("Place", state.history.place ? state.history.place.text : "")]);
    if (state.witnesses.length) {
      html += '<section class="hp-section"><h4 class="hp-st">Witnesses (' + state.witnesses.length + ')</h4><dl class="hp-dl">';
      state.witnesses.forEach(function (w) {
        var org = "", ext = "";
        (w.items || []).forEach(function (it) {
          if (it.kind === "orgName" && !org) org = it.text;
          if (it.kind === "extent") ext = it.text;
        });
        html += row(w.n || w.id, [org, ext].filter(Boolean).join(" — ") || w.ana);
      });
      html += "</dl></section>";
    }
    html += sec("Edition", [row("Mode", state.edition.mode),
      row(state.edition.mode === "ptr" ? "Pointer" : "Text", state.edition.mode === "ptr" ? state.edition.ptrTarget : (state.edition.inlineText || "").slice(0, 80))]);
    return html + "</div>";
  }

  // ---- output ----------------------------------------------------------------
  function currentXml() { return CN.buildInscription(state); }
  function update() {
    var xml = currentXml();
    document.getElementById("out").textContent = xml;
    if (_viewMode === "preview") {
      var elp = document.getElementById("preview-html");
      if (elp) elp.innerHTML = buildPreview();
    }
    var v = document.getElementById("validity");
    try {
      var doc = new DOMParser().parseFromString(xml, "application/xml");
      if (doc.getElementsByTagName("parsererror").length) { v.textContent = "✗ not well-formed"; v.className = "validity bad"; }
      else { v.textContent = "✓ well-formed"; v.className = "validity ok"; }
    } catch (e) { v.textContent = ""; }
  }
  function setEditorView(mode) {
    _viewMode = mode;
    var hp = document.getElementById("preview-html"), xp = document.getElementById("preview-xml");
    var bp = document.getElementById("btn-view-preview"), bx = document.getElementById("btn-view-xml");
    if (hp) hp.style.display = mode === "preview" ? "block" : "none";
    if (xp) xp.style.display = mode === "xml" ? "block" : "none";
    if (bp) bp.classList.toggle("active", mode === "preview");
    if (bx) bx.classList.toggle("active", mode === "xml");
    if (mode === "preview") document.getElementById("preview-html").innerHTML = buildPreview();
  }

  // ---- preload ---------------------------------------------------------------
  function mapLegacy(o) {
    var s = blankState();
    s.idno = o.filename || "";
    setTitle(s.titles, "zh", o.titleZh || ""); setTitle(s.titles, "en", o.titleEn || "");
    s.msIdent.country = o.country || "中國"; s.msIdent.region = o.currentRegion || o.region || "";
    s.msIdent.settlement = o.currentSettlement || o.settlement || "";
    s.msIdent.idnoSupport = o.inventoryNo || "";
    s.msContents.summaryEn = o.summary || "";
    if (o.material) s.phys.supportItems.push({ kind: "material", ana: "", ref: o.materialRef || "", zh: "", en: "", text: o.material });
    if (o.objectType) s.phys.supportItems.unshift({ kind: "objectType", ana: "", ref: o.objectTypeRef || "", zh: "", en: "", text: o.objectType });
    if (o.heightCm || o.widthCm) {
      var parts = [];
      if (o.heightCm) parts.push({ el: "height", n: "", unit: "cm", text: String(o.heightCm) });
      if (o.widthCm) parts.push({ el: "width", n: "", unit: "cm", text: String(o.widthCm) });
      if (o.depthCm) parts.push({ el: "depth", n: "", unit: "cm", text: String(o.depthCm) });
      s.phys.supportItems.push({ kind: "dimensions", dims: { type: "field", unit: "cm", parts: parts } });
    }
    if (o.condition) { s.phys.condition = { ana: "", pZh: "", pEn: o.condition, notes: [] }; }
    if (o.layoutColumns || o.layoutLines) s.phys.layout = { columns: String(o.layoutColumns || ""), ruledLines: "", writtenLines: String(o.layoutLines || ""), items: [] };
    if (o.script) { s.phys.hand = { scope: "sole", script: o.scriptRef || "", ana: "", items: [{ kind: "p", lang: "en", text: o.script }] }; }
    if (o.whenISO || o.notBefore || o.origDateText)
      s.history.date = { when: o.whenISO || "", notBefore: o.notBefore || "", notAfter: o.notAfter || "", text: o.origDateText || "" };
    if (o.origPlace) s.history.place = { ref: o.origPlaceRef || "", lang: "zh", text: o.origPlace };
    var tx = (o.texts || [])[0] || {};
    if (tx.editionText) { s.edition.mode = "inline"; s.edition.inlineText = tx.editionText.split("\n").map(function (l, i) { return '<lb n="' + (i + 1) + '"/>' + l; }).join("\n"); }
    if (tx.sutraTitleZh) setTitle(s.msContents.items[0].titles, "zh", tx.sutraTitleZh);
    if (tx.taisho) s.bibls.push({ canonical: true, taisho: tx.taisho, range: "" });
    s.authority = o.authority || s.authority;
    return s;
  }
  function preload() {
    var raw = sessionStorage.getItem("epiwen_preload");
    if (!raw) return;
    sessionStorage.removeItem("epiwen_preload");
    try {
      var o = JSON.parse(raw);
      if (o.rawXml && CN.detect(o.rawXml) === "inscription") {
        state = CN.parseInscription(o.rawXml);
        if (!state.idno && o.filename) state.idno = o.filename;
      } else {
        state = mapLegacy(o);
      }
      if (o._writeTarget && window.EpiGitHub && EpiGitHub.setTarget) EpiGitHub.setTarget(o._writeTarget);
      var delBtn = document.getElementById("btn-delete-github");
      if (delBtn && state.idno && o._canDelete) delBtn.style.display = "";
    } catch (e) { console.warn("epiwen_preload parse error", e); }
  }

  // ---- example ---------------------------------------------------------------
  function loadExample() {
    var s = blankState();
    s.fileId = "DEMO_1"; s.idno = "DEMO_1.xml";
    setTitle(s.titles, "zh", "《文殊師利所説摩訶般若波羅蜜經》五十二字節文");
    setTitle(s.titles, "en", "Passage of 52 Characters from the Sutra Spoken by Mañjuśrī");
    s.corresp = "DEMO_1_object.xml#DEMO_1";
    s.msIdent.region = "山東省"; s.msIdent.idnoEdition = "DEMO_1"; s.msIdent.idnoSupport = "DEMO_1";
    s.msIdent.altIdno = "catalog/SNS_1.xml";
    s.msContents.summaryEn = "A 52-character sutra excerpt on an open moya surface, six columns.";
    setTitle(s.msContents.items[0].titles, "zh", "《文殊師利所説摩訶般若波羅蜜經》五十二字節文");
    setSuppClassifiedOn(s, "objectType", { id: "object.rock-face", zh: "摩崖", en: "rock-face", ref: "http://vocab.getty.edu/aat/300404733" });
    setSuppClassifiedOn(s, "material", { id: "material.granite.biotite", zh: "黑雲母花崗岩", en: "biotite granite", ref: "http://vocab.getty.edu/aat/300011183" });
    s.phys.supportItems.push({ kind: "dimensions", dims: { type: "field", unit: "cm", parts: [
      { el: "height", n: "", unit: "cm", text: "234" }, { el: "width", n: "", unit: "cm", text: "171" }] } });
    s.phys.condition = { ana: "#condition.excellent", pZh: "除起首二字，保存狀况極佳", pEn: "excellent, except for the first two characters", notes: [] };
    s.phys.layout = { columns: "6", ruledLines: "0", items: [
      { kind: "rs", type: "shape", ana: "#shape.vertical-rectangle", zh: "縱長方形", en: "vertical rectangle" },
      { kind: "rs", type: "execution", ana: "#execution.v-cut", zh: "“V”形刻法", en: "V-shaped carving" }] };
    s.phys.hand = { scope: "sole", script: "", ana: "", items: [
      { kind: "p", lang: "en", text: "52 characters in six columns." },
      { kind: "dimensions", dims: { type: "letterHeight", unit: "cm", parts: [{ el: "height", n: "", unit: "cm", atLeast: "14", atMost: "28", text: "14–28" }] } },
      { kind: "ptr", type: "glyph-metrics", target: "SNS_1_glyphs.csv" }] };
    s.history.date = { when: "", notBefore: "0558", notAfter: "0661", text: "公元五五八到六六一年 (558–661)" };
    s.history.place = { ref: "SNS_site.xml#SNS", lang: "zh", text: "水牛山" };
    s.witnesses = [{ id: "DEMO_1_rub_A", n: "A", ana: "#witness.rubbing", items: [
      { kind: "rs", ana: "#witness.rubbing", zh: "拓本", en: "rubbing" },
      { kind: "date", when: "1998", text: "made 1998" },
      { kind: "orgName", role: "repository", lang: "zh", text: "山東省石刻藝術博物館" }] }];
    s.edition.ptrTarget = "sutras:docs/Shuiniushan/SNS_1.xml";
    s.bibls = [{ canonical: true, taisho: "T_232", range: "728a26–29" }];
    state = s; render(); update();
  }
  function setSuppClassifiedOn(s, kind, cat) {
    s.phys.supportItems.push({ kind: kind, ana: "#" + cat.id, ref: cat.ref || "", zh: cat.zh, en: cat.en, text: "" });
  }

  // ---- buttons / init ---------------------------------------------------------
  function lang(which) {
    document.body.className = "lang-" + which;
    Array.prototype.forEach.call(document.querySelectorAll(".langtoggle button"), function (b) {
      b.classList.toggle("active", b.dataset.lang === which);
    });
  }
  function download() {
    var blob = new Blob([currentXml()], { type: "application/xml" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (state.idno || "epidoc").replace(/\.xml$/i, "") + ".xml";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }
  function askDelete() {
    if (window.EpiModal && EpiModal.confirm) {
      return EpiModal.confirm({ title: "Delete entry", message: "Do you really want to delete this entry?",
        confirmText: "Delete", cancelText: "Cancel", danger: true });
    }
    return Promise.resolve(window.confirm("Do you really want to delete this entry?"));
  }

  document.addEventListener("DOMContentLoaded", function () {
    preload();
    render();
    update();
    CN.loadTaxonomies().then(function (tax) {
      TAX = tax;
      render(); update();          // refill pickers with the live registry
    });

    Array.prototype.forEach.call(document.querySelectorAll(".langtoggle button"), function (b) {
      b.addEventListener("click", function () { lang(b.dataset.lang); });
    });
    var bp = document.getElementById("btn-view-preview"), bx = document.getElementById("btn-view-xml");
    if (bp) bp.addEventListener("click", function () { setEditorView("preview"); });
    if (bx) bx.addEventListener("click", function () { setEditorView("xml"); });
    document.getElementById("btn-copy").addEventListener("click", function () {
      if (navigator.clipboard) navigator.clipboard.writeText(currentXml());
    });
    var bs = document.getElementById("btn-save-github");
    if (bs) bs.addEventListener("click", function () {
      if (window.EpiGitHub) EpiGitHub.save(currentXml(), state.idno);
    });
    var bd = document.getElementById("btn-delete-github");
    if (bd) bd.addEventListener("click", function () {
      if (!window.EpiGitHub || !state.idno) return;
      askDelete().then(function (ok) {
        if (!ok) return;
        EpiGitHub.del(state.idno, function () {
          setTimeout(function () { window.location.href = "catalog.html"; }, 800);
        });
      });
    });
    document.getElementById("btn-download").addEventListener("click", download);
    document.getElementById("btn-reset").addEventListener("click", function () { location.reload(); });
    document.getElementById("btn-example").addEventListener("click", loadExample);
  });
})();
