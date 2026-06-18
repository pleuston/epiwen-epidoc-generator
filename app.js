/* app.js — DOM wiring for the Epiwen EpiDoc generator.
 * Renders a schema-driven bilingual form, keeps a flat `state` object, and
 * re-serializes via EpiDocGen.buildEpiDoc() on every edit. No framework. */
(function () {
  "use strict";
  var V = window.VOCAB;
  var build = window.EpiDocGen.buildEpiDoc;

  // ---- state -------------------------------------------------------------
  var state = {
    authority: "Epiwen / Altergraphy",
    editionLang: "zh-Hant",
    langIdent: "zh",
    langLabel: "Literary Chinese 漢文"
  };
  var pad4 = function (n) { return String(n).padStart(4, "0"); };
  var setVal = function (key, v) {
    var el = document.getElementById("f-" + key);
    if (el) el.value = v == null ? "" : v;
  };

  // ---- vocab pick handlers ----------------------------------------------
  function pickMaterial(o) { state.material = o.zh + " " + o.en; state.materialRef = o.ref; }
  function pickObjectType(o) { state.objectType = o.zh + " " + o.en; state.objectTypeRef = o.ref; }
  function pickScript(o) { state.script = o.zh + " " + o.en; state.scriptRef = o.ref; }
  function pickLanguage(o) { state.langIdent = o.ident; state.langLabel = o.en; }
  function pickLicence(o) { state.licence = o.label; state.licenceTarget = o.target; setVal("licenceTarget", o.target); }
  function pickSutra(o) {
    state.sutraTitleZh = o.zh; state.sutraTitleEn = o.en; state.cbeta = o.cbeta; state.taisho = o.taisho;
    setVal("sutraTitleZh", o.zh); setVal("sutraTitleEn", o.en); setVal("cbeta", o.cbeta);
  }
  function pickEra(o) {
    state._era = o;
    state.notBefore = pad4(o.start); state.notAfter = pad4(o.end);
    state.calendar = "#chinese"; state.datingMethod = "#reign-era";
    if (!state.origDateText) { state.origDateText = o.dyn + o.era; setVal("origDateText", state.origDateText); }
    recalcReignYear();
    setVal("notBefore", state.notBefore); setVal("notAfter", state.notAfter);
  }
  function recalcReignYear() {
    var o = state._era, y = parseInt(state.reignYear, 10);
    if (o && y >= 1) {
      var when = o.start + y - 1;
      state.whenISO = pad4(when); state.notBefore = pad4(when); state.notAfter = pad4(when);
      setVal("whenISO", state.whenISO); setVal("notBefore", state.notBefore); setVal("notAfter", state.notAfter);
    }
  }

  // ---- schema ------------------------------------------------------------
  var SECTIONS = [
    { en: "Identity", zh: "著錄", fields: [
      { key: "filename", en: "File name", zh: "檔名", ph: "SNS_2.xml" },
      { key: "titleEn", en: "English title", zh: "英文標題" },
      { key: "titleZh", en: "Chinese title", zh: "中文標題" },
      { key: "editor", en: "Editor", zh: "編者" }
    ]},
    { en: "Holding & identifier", zh: "收藏與編號", fields: [
      { row: [
        { key: "country", en: "Country", zh: "國別", ph: "China 中國" },
        { key: "currentRegion", en: "Region", zh: "省/區", ph: "Shandong 山東" },
        { key: "currentSettlement", en: "Settlement", zh: "市/縣" }
      ]},
      { key: "repository", en: "Repository / in situ", zh: "收藏地／原處" },
      { key: "inventoryNo", en: "Inventory no.", zh: "編號" }
    ]},
    { en: "Contents & text identity", zh: "內容", fields: [
      { key: "summary", type: "textarea", en: "Summary", zh: "提要" },
      { type: "vocab", key: "_sutra", en: "Canonical text", zh: "經目", options: V.SUTRAS,
        label: function (o) { return o.zh + " · " + o.en + " (" + o.cbeta + ")"; }, pick: pickSutra },
      { key: "sutraTitleZh", en: "Sutra title (zh)", zh: "經題（中）" },
      { key: "sutraTitleEn", en: "Sutra title (en)", zh: "經題（英）" },
      { key: "cbeta", en: "CBETA id", zh: "CBETA 編號", ph: "T08n0235" }
    ]},
    { en: "Physical description", zh: "形制", fields: [
      { type: "vocab", key: "_material", en: "Material", zh: "材質", options: V.MATERIALS,
        label: function (o) { return o.zh + " " + o.en; }, pick: pickMaterial },
      { type: "vocab", key: "_objectType", en: "Object type", zh: "類型", options: V.OBJECT_TYPES,
        label: function (o) { return o.zh + " · " + o.en; }, pick: pickObjectType },
      { row: [
        { key: "heightCm", type: "number", en: "Height (cm)", zh: "高" },
        { key: "widthCm", type: "number", en: "Width (cm)", zh: "寬" },
        { key: "depthCm", type: "number", en: "Depth (cm)", zh: "厚" }
      ]},
      { key: "condition", en: "Condition", zh: "保存狀況" },
      { row: [
        { key: "layoutColumns", type: "number", en: "Columns", zh: "行數" },
        { key: "layoutLines", type: "number", en: "Lines/col", zh: "每行字數" },
        { key: "layoutNote", en: "Layout note", zh: "版式說明" }
      ]},
      { type: "vocab", key: "_script", en: "Script", zh: "書體", options: V.SCRIPTS,
        label: function (o) { return o.zh + " " + o.en; }, pick: pickScript }
    ]},
    { en: "Date & place", zh: "紀年與地點", fields: [
      { type: "vocab", key: "_era", en: "Reign era", zh: "年號", options: V.ERAS,
        label: function (o) { return o.dyn + o.era + " " + o.py + " (" + o.start + "–" + o.end + ")"; }, pick: pickEra },
      { key: "reignYear", type: "number", en: "Reign year", zh: "在位年", hint_en: "e.g. 6 → computes exact year", hint_zh: "例：6 → 自動換算公曆", onInput: recalcReignYear },
      { key: "origDateText", en: "Date as written", zh: "紀年原文", ph: "北齊武平六年" },
      { row: [
        { key: "whenISO", en: "when", zh: "確切年", ph: "0575" },
        { key: "notBefore", en: "notBefore", zh: "不早於", ph: "0570" },
        { key: "notAfter", en: "notAfter", zh: "不晚於", ph: "0576" }
      ]},
      { key: "origPlace", en: "Original place", zh: "原始地點" },
      { key: "origPlaceRef", en: "Place ref (geonames/tgn)", zh: "地點權威碼" }
    ]},
    { en: "Language & classification", zh: "語言與分類", fields: [
      { type: "vocab", key: "_language", en: "Primary language", zh: "主要語言", options: V.LANGS,
        label: function (o) { return o.en; }, pick: pickLanguage },
      { key: "keywords", type: "textarea", en: "Keywords (one per line: label | ref)", zh: "關鍵詞（每行：標籤 | 權威碼）",
        onInput: parseKeywords }
    ]},
    { en: "Transcription & apparatus", zh: "錄文", fields: [
      { key: "editionText", type: "textarea", mono: true, en: "Transcription (one line per source line)", zh: "錄文（每行對應原石一行）" },
      { key: "editionLang", en: "Edition lang", zh: "錄文語言碼", ph: "zh-Hant" },
      { key: "translationText", type: "textarea", en: "Translation", zh: "翻譯" },
      { key: "commentaryText", type: "textarea", en: "Commentary", zh: "註釋" },
      { key: "bibliography", type: "textarea", en: "Bibliography (one per line)", zh: "參考文獻（每行一條）" },
      { key: "facsimileUrl", en: "Facsimile image URL", zh: "圖版連結" }
    ]},
    { en: "Publication & revision", zh: "出版與修訂", fields: [
      { key: "authority", en: "Authority", zh: "發布機構" },
      { type: "vocab", key: "_licence", en: "Licence", zh: "授權", options: V.LICENCES,
        label: function (o) { return o.label; }, pick: pickLicence },
      { key: "licenceTarget", en: "Licence URL", zh: "授權連結" },
      { row: [
        { key: "changeWhen", en: "Change date", zh: "修訂日期", ph: "2026-06-18" },
        { key: "changeWho", en: "Change by", zh: "修訂者" },
        { key: "changeNote", en: "Change note", zh: "修訂說明" }
      ]}
    ]}
  ];

  function parseKeywords() {
    state.keywords = String(state.keywords_raw || "")
      .split("\n").map(function (l) { return l.trim(); }).filter(Boolean)
      .map(function (l) {
        var p = l.split("|");
        return { label: (p[0] || "").trim(), ref: (p[1] || "").trim() };
      });
  }

  // ---- render ------------------------------------------------------------
  function labelSpan(f) {
    return '<span class="label"><span class="en">' + esc(f.en) + "</span>" +
      (f.zh ? '<span class="zh">' + esc(f.zh) + "</span>" : "") + "</span>";
  }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  function renderField(f) {
    var wrap = document.createElement("div");
    wrap.className = "field";
    if (f.type === "vocab") {
      wrap.innerHTML = labelSpan(f);
      var sel = document.createElement("select");
      sel.id = "f-" + f.key;
      sel.innerHTML = '<option value="">—</option>' +
        f.options.map(function (o, i) { return '<option value="' + i + '">' + esc(f.label(o)) + "</option>"; }).join("");
      sel.addEventListener("change", function () {
        var i = parseInt(sel.value, 10);
        if (!isNaN(i)) { f.pick(f.options[i]); update(); }
      });
      wrap.appendChild(sel);
      return wrap;
    }
    var ctrl;
    if (f.type === "textarea") {
      ctrl = document.createElement("textarea");
      if (f.mono) ctrl.className = "mono";
    } else {
      ctrl = document.createElement("input");
      ctrl.type = f.type === "number" ? "number" : "text";
    }
    ctrl.id = "f-" + f.key;
    if (f.ph) ctrl.placeholder = f.ph;
    wrap.innerHTML = labelSpan(f);
    ctrl.addEventListener("input", function () {
      if (f.key === "keywords") { state.keywords_raw = ctrl.value; parseKeywords(); }
      else state[f.key] = ctrl.value;
      if (f.onInput) f.onInput();
      update();
    });
    wrap.appendChild(ctrl);
    if (f.hint_en || f.hint_zh) {
      var hint = document.createElement("div");
      hint.className = "hint";
      hint.innerHTML = (f.hint_en ? '<span class="en">' + esc(f.hint_en) + "</span>" : "") +
        (f.hint_zh ? '<span class="zh">' + esc(f.hint_zh) + "</span>" : "");
      wrap.appendChild(hint);
    }
    return wrap;
  }

  function renderRow(fields) {
    var row = document.createElement("div");
    row.className = "field row";
    fields.forEach(function (f) {
      var cell = renderField(f);
      cell.classList.remove("field"); // already inside .row grid cell
      var inner = document.createElement("div");
      inner.appendChild(cell);
      row.appendChild(cell);
    });
    return row;
  }

  function render() {
    var root = document.getElementById("form");
    SECTIONS.forEach(function (sec) {
      var h = document.createElement("div");
      h.className = "section-title";
      h.innerHTML = '<span class="en">' + esc(sec.en) + "</span>" + '<span class="zh">' + esc(sec.zh) + "</span>";
      root.appendChild(h);
      sec.fields.forEach(function (f) {
        if (f.row) root.appendChild(renderRow(f.row));
        else root.appendChild(renderField(f));
      });
    });
    // reflect defaults
    ["authority", "editionLang"].forEach(function (k) { setVal(k, state[k]); });
  }

  // ---- preview -----------------------------------------------------------
  function cleanState() {
    var d = {};
    Object.keys(state).forEach(function (k) { if (k[0] !== "_" && k !== "keywords_raw") d[k] = state[k]; });
    return d;
  }
  function update() {
    var xml = build(cleanState());
    document.getElementById("out").textContent = xml;
    var v = document.getElementById("validity");
    try {
      var doc = new DOMParser().parseFromString(xml, "application/xml");
      var err = doc.getElementsByTagName("parsererror");
      if (err.length) { v.textContent = "✗ not well-formed"; v.className = "validity bad"; }
      else { v.textContent = "✓ well-formed"; v.className = "validity ok"; }
    } catch (e) { v.textContent = ""; }
  }

  // ---- buttons -----------------------------------------------------------
  function lang(which) {
    document.body.className = "lang-" + which;
    Array.prototype.forEach.call(document.querySelectorAll(".langtoggle button"), function (b) {
      b.classList.toggle("active", b.dataset.lang === which);
    });
  }
  function download() {
    var blob = new Blob([build(cleanState())], { type: "application/xml" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (state.filename || "epidoc") .replace(/\.xml$/i, "") + ".xml";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }
  function copy() {
    var xml = build(cleanState());
    if (navigator.clipboard) navigator.clipboard.writeText(xml);
  }

  var EXAMPLE = {
    filename: "SNS_2.xml", editor: "Epiwen contributor",
    titleEn: "Mañjuśrī Prajñā passage, Mount Shuiniu (stele recto)",
    titleZh: "水牛山《文殊師利所説摩訶般若波羅蜜經》碑陽正法節文",
    country: "China 中國", currentRegion: "Shandong 山東", currentSettlement: "Wenshang 汶上",
    repository: "in situ 原處", inventoryNo: "SNS_2",
    summary: "Northern Qi stele excerpt of the Mañjuśrī Prajñā-pāramitā sūtra.",
    sutraTitleZh: "文殊師利所説摩訶般若波羅蜜經", sutraTitleEn: "Sūtra of the Perfection of Wisdom Spoken by Mañjuśrī", cbeta: "T08n0232",
    material: "石灰岩 limestone", materialRef: "aat:300011286",
    objectType: "碑 · stele", objectTypeRef: "sst:stele",
    heightCm: "210", widthCm: "92", depthCm: "24",
    condition: "weathered; lower register effaced 風化，下段漫漶",
    layoutColumns: "1", layoutLines: "12",
    script: "楷書 regular script", scriptRef: "sst:regular-script",
    reignYear: "6", origDateText: "北齊武平六年", calendar: "#chinese", datingMethod: "#reign-era",
    whenISO: "0575", notBefore: "0575", notAfter: "0575",
    origPlace: "Mount Shuiniu 水牛山",
    keywords: [{ ref: "sst:perfection-of-wisdom", label: "Perfection of Wisdom 般若" }],
    keywords_raw: "Perfection of Wisdom 般若 | sst:perfection-of-wisdom",
    editionText: "文殊師利白佛言\n世尊云何名般若波羅蜜\n佛言般若波羅蜜無邊無際",
    translationText: "Mañjuśrī addressed the Buddha: 'World-Honoured One, what is the Perfection of Wisdom?'",
    bibliography: "Wenzel, Claudia, ed. Buddhist Stone Sutras in Shandong.\nCatalogue no. SNS_2.",
    facsimileUrl: "images/SNS_2.jpg",
    authority: "Epiwen / Altergraphy", licence: "CC BY 4.0", licenceTarget: "https://creativecommons.org/licenses/by/4.0/",
    editionLang: "zh-Hant", langIdent: "zh", langLabel: "Literary Chinese 漢文",
    changeWhen: "2026-06-18", changeWho: "#epiwen", changeNote: "Initial EpiDoc encoding via the Epiwen generator."
  };
  function loadExample() {
    Object.keys(EXAMPLE).forEach(function (k) { state[k] = EXAMPLE[k]; });
    Object.keys(state).forEach(function (k) { if (k[0] !== "_") setVal(k, k === "keywords" ? state.keywords_raw : state[k]); });
    update();
  }

  // ---- init --------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", function () {
    render();
    Array.prototype.forEach.call(document.querySelectorAll(".langtoggle button"), function (b) {
      b.addEventListener("click", function () { lang(b.dataset.lang); });
    });
    document.getElementById("btn-copy").addEventListener("click", copy);
    document.getElementById("btn-download").addEventListener("click", download);
    document.getElementById("btn-reset").addEventListener("click", function () { location.reload(); });
    document.getElementById("btn-example").addEventListener("click", loadExample);
    update();
  });
})();
