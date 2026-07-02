/* object-app.js — Epiwen OBJECT / monument editor (EpiDoc-CN profile).
 *
 * Edits the middle tier of the three-level model: the TEI <object> file that
 * carries the whole-monument description (division rule: general/whole-object
 * data lives HERE; per-text script-field data lives on the inscriptions).
 * Binds directly onto the EpiDocCN objectfile state; nested face/wall parts
 * are editable; anything unmodeled rides along in _x raw buckets.
 *
 * sessionStorage "epiwen_preload_object": { rawXml, filename, _writeTarget }.
 */
(function () {
  "use strict";
  var CN = window.EpiDocCN;

  function blankObj() {
    return { id: "", type: "monument", subtype: "", n: "", ana: "crm:E22_Human-Made_Object",
      ident: { country: { zh: "中國" }, region: {}, settlement: {}, nameZh: "", nameEn: "", idnoSupport: "" },
      msContents: { summaryEn: "", summaryZh: "", items: [] },
      phys: { form: "", supportItems: [], condition: null, layout: null, deco: [], hand: null, _x: [] },
      history: { date: null, dateNotes: [], place: null, provenance: null, _x: [] },
      notes: [], parts: [], _x: [] };
  }
  function blankState() {
    return { model: "objectfile", fileId: "",
      titles: [{ lang: "zh", type: "", text: "" }, { lang: "en", type: "", text: "" }],
      titleZh: "", titleEn: "",
      authority: "Epiwen / EpiDoc-CN profile — sample",
      idnoType: "object", idno: "",
      availability: { status: "restricted", text: "Draft sample, not for publication." },
      sourceBibls: [], prefixes: [],
      obj: blankObj() };
  }
  var state = blankState();
  var TAX = CN.FALLBACK_TAX;
  var _viewMode = "xml";
  var _filename = "";

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  // ---- form helpers ----------------------------------------------------------
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
  function taxPicker(taxKey, en, zh, getAna, setCat) {
    var w = el("div", "field");
    w.innerHTML = '<span class="label"><span class="en">' + esc(en) + '</span><span class="zh">' + esc(zh) + "</span></span>";
    var sel = document.createElement("select");
    var opts = (TAX[taxKey] || []);
    sel.innerHTML = '<option value="">—</option>' + opts.map(function (o, i) {
      return '<option value="' + i + '">' + esc(o.zh + " · " + o.en) + "</option>";
    }).join("");
    var ana = (getAna() || "").replace(/^#/, "");
    opts.forEach(function (o, i) { if (o.id === ana) sel.value = String(i); });
    sel.addEventListener("change", function () {
      var i = parseInt(sel.value, 10);
      if (!isNaN(i)) setCat(opts[i]);
      update();
    });
    w.appendChild(sel);
    return w;
  }
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
        renderOne(box, item, i, renderAll);
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
  function removeFrom(arr) { return function (item) { var i = arr.indexOf(item); if (i >= 0) arr.splice(i, 1); }; }
  function notesEditor(container, getList) {
    repeatable(container, getList, function (box, nn) {
      box.appendChild(rowOf(
        labelled("type", "類型", input(function () { return nn.type; }, function (v) { nn.type = v; }, "witnesses / source")),
        labelled("lang", "語言", input(function () { return nn.lang; }, function (v) { nn.lang = v; }, "zh / en"))
      ));
      box.appendChild(labelled("note (text/XML)", "註記", area(function () { return nn.xml; }, function (v) { nn.xml = v; }, "", true)));
    }, "add note 增加註記", function () { return { type: "", lang: "", xml: "" }; });
  }
  function dimsEditor(container, getDimsList, makeNew, removeItem) {
    repeatable(container, getDimsList, function (box, dItem) {
      var d = dItem.dims;
      box.appendChild(rowOf(
        labelled("dimensions @type", "類型", input(function () { return d.type; }, function (v) { d.type = v; }, "overall / field")),
        labelled("@unit", "單位", input(function () { return d.unit; }, function (v) { d.unit = v; }, "cm"))
      ));
      var partsBox = el("div", null);
      box.appendChild(labelled("measurements", "尺寸", partsBox));
      repeatable(partsBox, function () { return d.parts; }, function (pbox, p) {
        pbox.appendChild(rowOf(
          labelled("element", "項", input(function () { return p.el; }, function (v) { p.el = v; }, "height / width / depth")),
          labelled("@n", "位置", input(function () { return p.n; }, function (v) { p.n = v; }, "front / back / west")),
          labelled("value", "值", input(function () { return p.text; }, function (v) { p.text = v; }))
        ));
      }, "add measurement", function () { return { el: "height", n: "", unit: "cm", atLeast: "", atMost: "", text: "" }; });
    }, "add dimensions block 增加尺寸", makeNew || function () {
      return { kind: "dimensions", dims: { type: "overall", unit: "cm", parts: [] } };
    }, removeItem);
  }

  // ---- slots on the object --------------------------------------------------
  function supp(kind) { return CN.findItem(state.obj.phys.supportItems, kind); }
  function setSuppClassified(kind, cat) {
    var it = CN.upsertItem(state.obj.phys.supportItems, kind,
      function () { return { kind: kind }; }, kind === "objectType");
    it.ana = "#" + cat.id; it.ref = cat.ref || ""; it.zh = cat.zh; it.en = cat.en; it.text = "";
  }
  function ensureCondition() {
    var ph = state.obj.phys;
    if (!ph.condition) ph.condition = { ana: "", pZh: "", pEn: "", notes: [] };
    return ph.condition;
  }
  function ensureLayout() {
    var ph = state.obj.phys;
    if (!ph.layout) ph.layout = { columns: "", ruledLines: "", writtenLines: "", items: [] };
    return ph.layout;
  }
  function layoutP(lang) {
    var L = state.obj.phys.layout; if (!L) return null;
    var found = null;
    L.items.forEach(function (it) { if (it.kind === "p" && (it.lang || "en") === lang && !found) found = it; });
    return found;
  }
  function setLayoutP(lang, text) {
    var L = ensureLayout(); var it = layoutP(lang);
    if (!it) { it = { kind: "p", lang: lang, text: "" }; L.items.push(it); }
    it.text = text;
  }
  function ensureHistory() {
    if (!state.obj.history) state.obj.history = { date: null, dateNotes: [], place: null, provenance: null, _x: [] };
    return state.obj.history;
  }
  function firstTitle(list, lang) {
    var found = null;
    (list || []).forEach(function (t) { if (t.lang === lang && !found) found = t; });
    return found;
  }
  function setTitle(list, lang, text) {
    var t = firstTitle(list, lang);
    if (!t) { t = { lang: lang, type: "", text: "" }; list.push(t); }
    t.text = text;
  }

  // ---- render -----------------------------------------------------------------
  function render() {
    FORM = document.getElementById("form");
    FORM.innerHTML = "";
    var o = state.obj;

    FORM.appendChild(sectionTitle("Identity", "著錄"));
    FORM.appendChild(rowOf(
      labelled("File name", "檔名", input(function () { return _filename; }, function (v) { _filename = v; }, "SNS_stele.xml")),
      labelled("TEI file id", "檔案 id", input(function () { return state.fileId; }, function (v) { state.fileId = v; }, "SNS_stele_doc")),
      labelled("idno (object)", "器物編號", input(function () { return state.idno; }, function (v) { state.idno = v; }, "SNS_stele"))
    ));
    FORM.appendChild(labelled("Title 中文", "中文標題",
      input(function () { return (firstTitle(state.titles, "zh") || {}).text; }, function (v) { setTitle(state.titles, "zh", v); })));
    FORM.appendChild(labelled("Title EN", "英文標題",
      input(function () { return (firstTitle(state.titles, "en") || {}).text; }, function (v) { setTitle(state.titles, "en", v); })));

    FORM.appendChild(sectionTitle("Object", "器物"));
    FORM.appendChild(rowOf(
      labelled("xml:id", "器物 id", input(function () { return o.id; }, function (v) { o.id = v; }, "SNS_stele")),
      labelled("type", "類型", input(function () { return o.type; }, function (v) { o.type = v; }, "monument / cave / boulder / panel")),
      labelled("subtype", "次類型", input(function () { return o.subtype; }, function (v) { o.subtype = v; }, "stele"))
    ));
    var anaSel = document.createElement("select");
    [["crm:E22_Human-Made_Object", "E22 made object (movable: stele, pillar…)"],
     ["crm:E25_Human-Made_Feature", "E25 feature (moya, cave, wall, panel)"]].forEach(function (p) {
      var op = document.createElement("option"); op.value = p[0]; op.textContent = p[1];
      if (o.ana === p[0]) op.selected = true;
      anaSel.appendChild(op);
    });
    anaSel.addEventListener("change", function () { o.ana = anaSel.value; update(); });
    FORM.appendChild(labelled("CRM class (@ana)", "CRM 類", anaSel));
    FORM.appendChild(rowOf(
      labelled("Country", "國別", input(function () { return o.ident.country.zh || ""; }, function (v) { o.ident.country.zh = v; }, "中國")),
      labelled("Region", "省", input(function () { return o.ident.region.zh || ""; }, function (v) { o.ident.region.zh = v; }, "山東省")),
      labelled("Settlement", "市縣", input(function () { return o.ident.settlement.zh || ""; }, function (v) { o.ident.settlement.zh = v; }))
    ));
    FORM.appendChild(rowOf(
      labelled("Object name 中文", "器物名（中）", input(function () { return o.ident.nameZh; }, function (v) { o.ident.nameZh = v; })),
      labelled("Object name EN", "器物名（英）", input(function () { return o.ident.nameEn; }, function (v) { o.ident.nameEn = v; }))
    ));
    FORM.appendChild(labelled("idno support", "載體編號",
      input(function () { return o.ident.idnoSupport; }, function (v) { o.ident.idnoSupport = v; }, "SNS_stele"),
      "the sibling key shared with every inscription this object bears"));

    FORM.appendChild(sectionTitle("Texts borne (msContents)", "所載文本"));
    FORM.appendChild(labelled("Summary (en)", "提要",
      area(function () { return o.msContents ? o.msContents.summaryEn : ""; },
           function (v) { (o.msContents || (o.msContents = { summaryEn: "", summaryZh: "", items: [] })).summaryEn = v; })));
    var itemsBox = el("div", null); FORM.appendChild(itemsBox);
    repeatable(itemsBox, function () { return (o.msContents || (o.msContents = { summaryEn: "", summaryZh: "", items: [] })).items; },
      function (box, it) {
        box.appendChild(rowOf(
          labelled("n", "序", input(function () { return it.n; }, function (v) { it.n = v; }, "1")),
          labelled("inscription file (@corresp)", "銘文檔", input(function () { return it.corresp; }, function (v) { it.corresp = v; }, "SNS_2.xml"))
        ));
        box.appendChild(rowOf(
          labelled("locus @target", "位置 target", input(function () { return it.locusTarget; }, function (v) { it.locusTarget = v; }, "#SNS_stele_yang")),
          labelled("locus label", "位置", input(function () { return it.locusText; }, function (v) { it.locusText = v; }, "碑陽 obverse"))
        ));
        box.appendChild(labelled("Title 中文", "標題（中）",
          input(function () { return (firstTitle(it.titles, "zh") || {}).text; }, function (v) { setTitle(it.titles, "zh", v); })));
        box.appendChild(labelled("Title EN", "標題（英）",
          input(function () { return (firstTitle(it.titles, "en") || {}).text; }, function (v) { setTitle(it.titles, "en", v); })));
        box.appendChild(labelled("Text language", "語言",
          input(function () { return it.mainLang; }, function (v) { it.mainLang = v; }, "lzh")));
      }, "add text 增加文本",
      function () { return { n: "", corresp: "", locusTarget: "", locusText: "",
        titles: [{ lang: "zh", type: "", text: "" }], notes: [], mainLang: "lzh", _x: [] }; });

    FORM.appendChild(sectionTitle("Whole-object physical description", "整體形制"));
    FORM.appendChild(labelled("objectDesc @form", "形制",
      input(function () { return o.phys.form; }, function (v) { o.phys.form = v; }, "stele / boulder")));
    FORM.appendChild(taxPicker("objectTypes", "Object type", "類型",
      function () { var it = supp("objectType"); return it && it.ana; },
      function (cat) { setSuppClassified("objectType", cat); }));
    FORM.appendChild(taxPicker("materials", "Material", "材質",
      function () { var it = supp("material"); return it && it.ana; },
      function (cat) { setSuppClassified("material", cat); }));
    var dimsBox = el("div", null);
    FORM.appendChild(labelled("Whole-object dimensions", "整體尺寸", dimsBox));
    dimsEditor(dimsBox, function () {
      return state.obj.phys.supportItems.filter(function (it) { return it.kind === "dimensions"; });
    }, function () {                       // add through supportItems (the filtered list is a copy)
      var it = { kind: "dimensions", dims: { type: "overall", unit: "cm", parts: [] } };
      state.obj.phys.supportItems.push(it);
      return it;
    }, removeFrom(state.obj.phys.supportItems));
    var supNotesBox = el("div", null);
    FORM.appendChild(labelled("Support notes (source-dimensions …)", "載體註記", supNotesBox));
    (function () {
      function getNotes() {
        return state.obj.phys.supportItems.filter(function (it) { return it.kind === "note"; });
      }
      repeatable(supNotesBox, getNotes, function (box, nn) {
        box.appendChild(rowOf(
          labelled("type", "類型", input(function () { return nn.type; }, function (v) { nn.type = v; }, "source-dimensions")),
          labelled("lang", "語言", input(function () { return nn.lang; }, function (v) { nn.lang = v; }))
        ));
        box.appendChild(labelled("note", "註記", area(function () { return nn.xml; }, function (v) { nn.xml = v; }, "", true)));
      }, "add support note", function () {
        var nn = { kind: "note", type: "", lang: "", xml: "" };
        state.obj.phys.supportItems.push(nn);
        return nn;
      }, removeFrom(state.obj.phys.supportItems));
    })();
    FORM.appendChild(taxPicker("conditions", "Condition", "狀況",
      function () { return o.phys.condition && o.phys.condition.ana; },
      function (cat) { ensureCondition().ana = "#" + cat.id; }));
    FORM.appendChild(rowOf(
      labelled("Condition 中文", "狀況（中）", input(
        function () { return o.phys.condition ? o.phys.condition.pZh : ""; },
        function (v) { ensureCondition().pZh = v; })),
      labelled("Condition EN", "狀況（英）", input(
        function () { return o.phys.condition ? o.phys.condition.pEn : ""; },
        function (v) { ensureCondition().pEn = v; }))
    ));
    FORM.appendChild(labelled("Layout (en)", "版式說明",
      area(function () { var p = layoutP("en"); return p ? p.text : ""; },
           function (v) { setLayoutP("en", v); })));
    var decoBox = el("div", null);
    FORM.appendChild(labelled("Decoration notes", "紋飾", decoBox));
    repeatable(decoBox, function () { return o.phys.deco; }, function (box, d) {
      box.appendChild(labelled("@ana", "類", input(function () { return d.ana; }, function (v) { d.ana = v; }, "#decor.border")));
      box.appendChild(rowOf(
        labelled("中文", "", input(function () { return d.pZh; }, function (v) { d.pZh = v; })),
        labelled("EN", "", input(function () { return d.pEn; }, function (v) { d.pEn = v; }))
      ));
    }, "add decoration 增加紋飾", function () { return { ana: "", pZh: "", pEn: "", notes: [] }; });

    FORM.appendChild(sectionTitle("History", "沿革"));
    FORM.appendChild(rowOf(
      labelled("when", "確切年", input(
        function () { return o.history && o.history.date ? o.history.date.when : ""; },
        function (v) { (ensureHistory().date || (o.history.date = {})).when = v; })),
      labelled("notBefore", "不早於", input(
        function () { return o.history && o.history.date ? o.history.date.notBefore : ""; },
        function (v) { (ensureHistory().date || (o.history.date = {})).notBefore = v; })),
      labelled("notAfter", "不晚於", input(
        function () { return o.history && o.history.date ? o.history.date.notAfter : ""; },
        function (v) { (ensureHistory().date || (o.history.date = {})).notAfter = v; }))
    ));
    FORM.appendChild(labelled("Date as written", "紀年原文", input(
      function () { return o.history && o.history.date ? o.history.date.text : ""; },
      function (v) { (ensureHistory().date || (o.history.date = {})).text = v; })));
    FORM.appendChild(rowOf(
      labelled("Site file ref", "地點檔", input(
        function () { return o.history && o.history.place ? o.history.place.ref : ""; },
        function (v) { (ensureHistory().place || (o.history.place = { lang: "zh" })).ref = v; }, "SNS_site.xml#SNS")),
      labelled("Place name", "地名", input(
        function () { return o.history && o.history.place ? o.history.place.text : ""; },
        function (v) { (ensureHistory().place || (o.history.place = { lang: "zh" })).text = v; }))
    ));
    FORM.appendChild(rowOf(
      labelled("Provenance @type", "流傳類型", input(
        function () { return o.history && o.history.provenance ? o.history.provenance.type : ""; },
        function (v) {
          var h = ensureHistory();
          (h.provenance || (h.provenance = { pZh: "", pEn: "", notes: [] })).type = v;
        }, "lost / found")),
      labelled("Provenance 中文", "流傳（中）", input(
        function () { return o.history && o.history.provenance ? o.history.provenance.pZh : ""; },
        function (v) {
          var h = ensureHistory();
          (h.provenance || (h.provenance = { type: "", pEn: "", notes: [] })).pZh = v;
        })),
      labelled("Provenance EN", "流傳（英）", input(
        function () { return o.history && o.history.provenance ? o.history.provenance.pEn : ""; },
        function (v) {
          var h = ensureHistory();
          (h.provenance || (h.provenance = { type: "", pZh: "", notes: [] })).pEn = v;
        }))
    ));

    FORM.appendChild(sectionTitle("Object-level notes (witnesses …)", "器物層註記（見證…）"));
    var notesBox = el("div", null); FORM.appendChild(notesBox);
    notesEditor(notesBox, function () { return o.notes; });

    FORM.appendChild(sectionTitle("Parts (faces / walls)", "部位（碑面／窟壁）"));
    var partsBox = el("div", null); FORM.appendChild(partsBox);
    repeatable(partsBox, function () { return o.parts; }, function (box, part) {
      box.appendChild(rowOf(
        labelled("xml:id", "id", input(function () { return part.id; }, function (v) { part.id = v; }, "SNS_stele_yang")),
        labelled("type", "類型", input(function () { return part.type; }, function (v) { part.type = v; }, "face / wall")),
        labelled("n", "序", input(function () { return part.n; }, function (v) { part.n = v; }, "碑陽 / d"))
      ));
      box.appendChild(rowOf(
        labelled("Name 中文", "名（中）", input(function () { return part.ident.nameZh; }, function (v) { part.ident.nameZh = v; })),
        labelled("Name EN", "名（英）", input(function () { return part.ident.nameEn; }, function (v) { part.ident.nameEn = v; }))
      ));
      var pd = el("div", null);
      box.appendChild(labelled("Part dimensions", "部位尺寸", pd));
      repeatable(pd, function () {
        return part.phys ? part.phys.supportItems.filter(function (it) { return it.kind === "dimensions"; }) : [];
      }, function (dbox, dItem) {
        var d = dItem.dims;
        dbox.appendChild(rowOf(
          labelled("@type", "", input(function () { return d.type; }, function (v) { d.type = v; }, "overall")),
          labelled("@unit", "", input(function () { return d.unit; }, function (v) { d.unit = v; }, "cm"))
        ));
        var pparts = el("div", null);
        dbox.appendChild(labelled("measurements", "尺寸", pparts));
        repeatable(pparts, function () { return d.parts; }, function (pbox, p) {
          pbox.appendChild(rowOf(
            labelled("element", "", input(function () { return p.el; }, function (v) { p.el = v; }, "height")),
            labelled("@n", "", input(function () { return p.n; }, function (v) { p.n = v; }, "front")),
            labelled("value", "", input(function () { return p.text; }, function (v) { p.text = v; }))
          ));
        }, "add measurement", function () { return { el: "height", n: "", unit: "cm", atLeast: "", atMost: "", text: "" }; });
      }, "add dimensions block", function () {
        if (!part.phys) part.phys = { form: "", supportItems: [], condition: null, layout: null, deco: [], hand: null, _x: [] };
        var it = { kind: "dimensions", dims: { type: "overall", unit: "cm", parts: [] } };
        part.phys.supportItems.push(it);
        return it;
      }, function (item) {
        if (part.phys) { var i = part.phys.supportItems.indexOf(item); if (i >= 0) part.phys.supportItems.splice(i, 1); }
      });
    }, "add part 增加部位", function () {
      var p = blankObj();
      p.type = "face"; p.ana = "crm:E25_Human-Made_Feature";
      p.ident.country = {}; p.msContents = null; p.history = null;
      return p;
    });
  }

  // ---- output / preview --------------------------------------------------------
  function currentXml() {
    state.titleZh = (state.titles[0] || {}).text || "";
    return CN.buildObject(state);
  }
  function buildPreview() {
    function row(l, v) { return v ? "<dt>" + esc(l) + "</dt><dd>" + esc(v) + "</dd>" : ""; }
    var o = state.obj;
    var ot = supp("objectType"), mat = supp("material");
    var html = '<div class="hp-preview"><section class="hp-section"><h4 class="hp-st">Object</h4><dl class="hp-dl">';
    html += row("File", _filename) + row("Title", (state.titles[0] || {}).text) +
      row("id", o.id) + row("Type", o.type + (o.subtype ? " / " + o.subtype : "")) +
      row("CRM", o.ana) +
      row("objectType", ot ? ot.zh + " " + ot.en : "") + row("Material", mat ? mat.zh + " " + mat.en : "") +
      row("Condition", o.phys.condition ? (o.phys.condition.pZh || o.phys.condition.pEn) : "") +
      row("Texts borne", o.msContents ? String(o.msContents.items.length) : "0") +
      row("Parts", String(o.parts.length)) +
      row("Notes", String(o.notes.length));
    html += "</dl></section></div>";
    return html;
  }
  function update() {
    var xml = currentXml();
    document.getElementById("out").textContent = xml;
    if (_viewMode === "preview") document.getElementById("preview-html").innerHTML = buildPreview();
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

  // ---- preload / example ---------------------------------------------------------
  function preload() {
    var raw = sessionStorage.getItem("epiwen_preload_object");
    if (!raw) return;
    sessionStorage.removeItem("epiwen_preload_object");
    try {
      var o = JSON.parse(raw);
      if (o.rawXml && CN.detect(o.rawXml) === "objectfile") {
        state = CN.parseObject(o.rawXml);
        _filename = o.filename || (state.idno ? state.idno + ".xml" : "");
      }
      if (o._writeTarget && window.EpiGitHub && EpiGitHub.setTarget) EpiGitHub.setTarget(o._writeTarget);
      var delBtn = document.getElementById("btn-delete-github");
      if (delBtn && _filename && o._canDelete) delBtn.style.display = "";
    } catch (e) { console.warn("epiwen_preload_object parse error", e); }
  }
  function loadExample() {
    var s = blankState();
    _filename = "DEMO_stele.xml";
    s.fileId = "DEMO_stele_doc"; s.idno = "DEMO_stele";
    s.titles = [{ lang: "zh", type: "", text: "示例碑" }, { lang: "en", type: "", text: "Demo stele" }];
    var o = s.obj;
    o.id = "DEMO_stele"; o.type = "monument"; o.subtype = "stele";
    o.ident.region = { zh: "山東省" }; o.ident.nameZh = "示例碑"; o.ident.nameEn = "Demo stele";
    o.ident.idnoSupport = "DEMO_stele";
    o.msContents.summaryEn = "Two texts: the sutra on the obverse, the colophon on both narrow sides.";
    o.msContents.items = [{ n: "1", corresp: "DEMO_2.xml", locusTarget: "#DEMO_stele_yang", locusText: "碑陽 obverse",
      titles: [{ lang: "zh", type: "", text: "示例經文" }], notes: [], mainLang: "lzh", _x: [] }];
    o.phys.form = "stele";
    o.phys.supportItems = [
      { kind: "objectType", ana: "#object.stele", ref: "http://vocab.getty.edu/aat/300007023", zh: "碑", en: "stele", text: "" },
      { kind: "material", ana: "#material.granite.biotite", ref: "http://vocab.getty.edu/aat/300011183", zh: "黑雲母花崗岩", en: "biotite granite", text: "" }];
    o.phys.condition = { ana: "", pZh: "碑座與碑額佚失。", pEn: "The base and the head of the stele are missing.", notes: [] };
    o.history.date = { when: "", notBefore: "0558", notAfter: "0661", text: "公元五五八到六六一年 (558–661)" };
    o.history.place = { ref: "DEMO_site.xml#DEMO", lang: "zh", text: "示例山" };
    o.parts = [{ id: "DEMO_stele_yang", type: "face", subtype: "", n: "碑陽", ana: "crm:E25_Human-Made_Feature",
      ident: { country: {}, region: {}, settlement: {}, nameZh: "碑陽", nameEn: "obverse", idnoSupport: "" },
      msContents: null, phys: null, history: null, notes: [], parts: [], _x: [] }];
    state = s; render(); update();
  }

  // ---- init -----------------------------------------------------------------------
  function lang(which) {
    document.body.className = "lang-" + which;
    Array.prototype.forEach.call(document.querySelectorAll(".langtoggle button"), function (b) {
      b.classList.toggle("active", b.dataset.lang === which);
    });
  }
  document.addEventListener("DOMContentLoaded", function () {
    preload();
    render();
    update();
    CN.loadTaxonomies().then(function (tax) { TAX = tax; render(); update(); });
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
      if (window.EpiGitHub) EpiGitHub.save(currentXml(), _filename || (state.idno ? state.idno + ".xml" : ""));
    });
    var bd = document.getElementById("btn-delete-github");
    if (bd) bd.addEventListener("click", function () {
      if (!window.EpiGitHub || !_filename) return;
      var go = window.EpiModal && EpiModal.confirm
        ? EpiModal.confirm({ title: "Delete entry", message: "Do you really want to delete this entry?", confirmText: "Delete", cancelText: "Cancel", danger: true })
        : Promise.resolve(window.confirm("Delete this entry?"));
      go.then(function (ok) {
        if (!ok) return;
        EpiGitHub.del(_filename, function () {
          setTimeout(function () { window.location.href = "catalog.html"; }, 800);
        });
      });
    });
    document.getElementById("btn-download").addEventListener("click", function () {
      var blob = new Blob([currentXml()], { type: "application/xml" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (_filename || "object").replace(/\.xml$/i, "") + ".xml";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    });
    document.getElementById("btn-reset").addEventListener("click", function () { location.reload(); });
    document.getElementById("btn-example").addEventListener("click", loadExample);
  });
})();
