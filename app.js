/* app.js — DOM wiring for the Epiwen EpiDoc generator.
 * Schema-driven bilingual form + repeatable "texts on this object" block.
 * Right pane: toggle between live XML view and a readable HTML preview card.
 * SessionStorage "epiwen_preload" allows catalog.html to load a record into
 * the form ("Edit" button). */
(function () {
  "use strict";
  var V     = window.VOCAB;
  var build = window.EpiDocGen.buildEpiDoc;

  // ---- state ---------------------------------------------------------------
  var state = {
    authority: "Epiwen / Altergraphy",
    langIdent: "zh",
    langLabel: "Literary Chinese 漢文",
    texts: [{ lang: "zh-Hant" }]
  };
  var _viewMode = "xml"; // "xml" | "preview"

  var pad4 = function (n) { return String(n).padStart(4, "0"); };
  var setVal = function (key, v) {
    var el = document.getElementById("f-" + key);
    if (el) el.value = v == null ? "" : v;
  };
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  // ---- vocab pick handlers -------------------------------------------------
  function pickMaterial(o)   { state.material = o.zh + " " + o.en; state.materialRef = o.ref; }
  function pickObjectType(o) { state.objectType = o.zh + " · " + o.en; state.objectTypeRef = o.ref; }
  function pickScript(o)     { state.script = o.zh + " " + o.en; state.scriptRef = o.ref; }
  function pickLanguage(o)   { state.langIdent = o.ident; state.langLabel = o.en; }
  function pickLicence(o)    { state.licence = o.label; state.licenceTarget = o.target; setVal("licenceTarget", o.target); }
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
  function parseKeywords() {
    state.keywords = String(state.keywords_raw || "")
      .split("\n").map(function (l) { return l.trim(); }).filter(Boolean)
      .map(function (l) { var p = l.split("|"); return { label: (p[0] || "").trim(), ref: (p[1] || "").trim() }; });
  }

  // ---- schema (object-level fields) ----------------------------------------
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
    { en: "Contents", zh: "內容", fields: [
      { key: "summary", type: "textarea", en: "Summary of contents", zh: "內容提要" }
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
      { key: "keywords", type: "textarea", en: "Keywords (one per line: label | ref)", zh: "關鍵詞（每行：標籤 | 權威碼）", onInput: parseKeywords }
    ]},
    { en: "Texts on this object", zh: "本物所載文本", fields: [
      { custom: "texts" }
    ]},
    { en: "Apparatus & media", zh: "附錄與圖像", fields: [
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

  // ---- repeatable texts (several texts on one object) ----------------------
  var textsBox = null;
  function renderTextsSection() {
    var wrap = document.createElement("div");
    textsBox = document.createElement("div"); textsBox.id = "texts-container";
    wrap.appendChild(textsBox);
    var add = document.createElement("button");
    add.type = "button"; add.className = "btn"; add.id = "btn-add-text";
    add.innerHTML = '+ <span class="en">Add text</span><span class="zh">增加文本</span>';
    add.addEventListener("click", function () { state.texts.push({ lang: "zh-Hant" }); renderTexts(); update(); });
    wrap.appendChild(add);
    renderTexts();
    return wrap;
  }
  function renderTexts() {
    if (!textsBox) return;
    textsBox.innerHTML = "";
    state.texts.forEach(function (tx, i) { textsBox.appendChild(renderTextBlock(tx, i)); });
  }
  function tField(tx, i, key, en, zh, ph, area, mono) {
    var w = document.createElement("div"); w.className = "field";
    w.innerHTML = '<span class="label"><span class="en">' + esc(en) + '</span><span class="zh">' + esc(zh) + "</span></span>";
    var c = area ? document.createElement("textarea") : document.createElement("input");
    if (area && mono) c.className = "mono";
    c.id = "f-text-" + i + "-" + key; if (ph) c.placeholder = ph;
    c.value = tx[key] || "";
    c.addEventListener("input", function () { tx[key] = c.value; update(); });
    w.appendChild(c); return w;
  }
  function tSutra(tx, i) {
    var w = document.createElement("div"); w.className = "field";
    w.innerHTML = '<span class="label"><span class="en">Canonical text</span><span class="zh">經目</span></span>';
    var sel = document.createElement("select");
    sel.innerHTML = '<option value="">—</option>' +
      V.SUTRAS.map(function (o, j) { return '<option value="' + j + '">' + esc(o.zh + " · " + o.en + " (" + o.cbeta + ")") + "</option>"; }).join("");
    // Pre-select if cbeta matches (used when loading from sessionStorage)
    if (tx.cbeta) {
      for (var j = 0; j < V.SUTRAS.length; j++) {
        if (V.SUTRAS[j].cbeta === tx.cbeta) { sel.value = String(j); break; }
      }
    }
    sel.addEventListener("change", function () {
      var j = parseInt(sel.value, 10);
      if (isNaN(j)) return;
      var o = V.SUTRAS[j];
      tx.sutraTitleZh = o.zh; tx.sutraTitleEn = o.en; tx.cbeta = o.cbeta; tx.taisho = o.taisho;
      var z  = document.getElementById("f-text-" + i + "-sutraTitleZh"); if (z)  z.value  = o.zh;
      var cb = document.getElementById("f-text-" + i + "-cbeta");        if (cb) cb.value = o.cbeta;
      update();
    });
    w.appendChild(sel); return w;
  }
  function renderTextBlock(tx, i) {
    var box = document.createElement("div"); box.className = "textblock";
    var head = document.createElement("div"); head.className = "textblock-head";
    head.innerHTML = '<strong><span class="en">Text</span><span class="zh">文本</span> ' + (i + 1) + "</strong>";
    if (state.texts.length > 1) {
      var del = document.createElement("button");
      del.type = "button"; del.className = "btn small";
      del.innerHTML = '− <span class="en">remove</span><span class="zh">刪除</span>';
      del.addEventListener("click", function () { state.texts.splice(i, 1); renderTexts(); update(); });
      head.appendChild(del);
    }
    box.appendChild(head);
    var row = document.createElement("div"); row.className = "field row";
    row.appendChild(tField(tx, i, "label",   "Face / locus", "面／位置", "碑陽 recto"));
    row.appendChild(tField(tx, i, "subtype", "subtype",       "類別",     "recto"));
    row.appendChild(tField(tx, i, "lang",    "Lang code",     "語言碼",   "zh-Hant"));
    box.appendChild(row);
    box.appendChild(tSutra(tx, i));
    box.appendChild(tField(tx, i, "sutraTitleZh",    "Sutra title (zh)", "經題（中）"));
    box.appendChild(tField(tx, i, "cbeta",           "CBETA id",         "CBETA 編號", "T08n0235"));
    box.appendChild(tField(tx, i, "editionText",     "Transcription (one line per source line)", "錄文（每行對應原石一行）", "", true, true));
    box.appendChild(tField(tx, i, "translationText", "Translation",       "翻譯", "", true, false));
    return box;
  }

  // ---- render object-level fields ------------------------------------------
  function labelSpan(f) {
    return '<span class="label"><span class="en">' + esc(f.en) + "</span>" +
      (f.zh ? '<span class="zh">' + esc(f.zh) + "</span>" : "") + "</span>";
  }
  function renderField(f) {
    if (f.custom === "texts") return renderTextsSection();
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
    if (f.type === "textarea") { ctrl = document.createElement("textarea"); if (f.mono) ctrl.className = "mono"; }
    else { ctrl = document.createElement("input"); ctrl.type = f.type === "number" ? "number" : "text"; }
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
      cell.classList.remove("field");
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
    setVal("authority", state.authority);
  }

  // ---- HTML preview card ---------------------------------------------------
  function buildHtmlPreviewFromState(s) {
    function row(label, val) {
      if (!val && val !== 0) return "";
      return "<dt>" + esc(label) + "</dt><dd>" + esc(String(val)) + "</dd>";
    }
    function sec(title, rows) {
      var r = rows.filter(Boolean).join("");
      if (!r) return "";
      return '<section class="hp-section"><h4 class="hp-st">' + esc(title) +
             '</h4><dl class="hp-dl">' + r + '</dl></section>';
    }
    var dims = [s.heightCm, s.widthCm, s.depthCm].filter(Boolean).join(" × ");
    var html = '<div class="hp-preview">';
    html += sec("Identity", [
      row("File",       s.filename),
      row("Title (EN)", s.titleEn),
      row("Title (ZH)", s.titleZh),
      row("Editor",     s.editor),
      row("Summary",    s.summary),
    ]);
    html += sec("Holding", [
      row("Country",    s.country),
      row("Region",     s.currentRegion),
      row("Settlement", s.currentSettlement),
      row("Repository", s.repository),
      row("Inventory",  s.inventoryNo),
    ]);
    html += sec("Physical", [
      row("Material",  s.material),
      row("Type",      s.objectType),
      dims ? row("H × W × D", dims + " cm") : "",
      row("Condition", s.condition),
      (s.layoutColumns || s.layoutLines)
        ? row("Columns / lines", [s.layoutColumns, s.layoutLines].filter(Boolean).join(" / "))
        : "",
      row("Script", s.script),
    ]);
    html += sec("Date & place", [
      row("Date (written)", s.origDateText),
      s.whenISO ? row("When", s.whenISO + " CE") : "",
      row("Place", s.origPlace),
    ]);
    if (s.langLabel) {
      html += sec("Language", [row(s.langIdent || "lang", s.langLabel)]);
    }
    var texts = s.texts || [];
    if (texts.length) {
      html += '<section class="hp-section"><h4 class="hp-st">Texts on this object</h4>';
      texts.forEach(function (tx, i) {
        var label = tx.label || tx.subtype || ("Text " + (i + 1));
        html += '<div class="hp-textpart"><div class="hp-textpart-head">' +
                (i + 1) + ". " + esc(label) + "</div>";
        html += '<dl class="hp-dl">';
        if (tx.sutraTitleZh) html += row("Text",     tx.sutraTitleZh);
        if (tx.cbeta)        html += row("CBETA",    tx.cbeta);
        if (tx.lang)         html += row("Language", tx.lang);
        if (tx.editionText) {
          var lines = tx.editionText.split("\n");
          var preview = lines.slice(0, 4).join("\n");
          html += "<dt>Transcription</dt><dd><pre class=\"hp-text\">" +
                  esc(preview) + (lines.length > 4 ? "\n…" : "") + "</pre></dd>";
        }
        if (tx.translationText) {
          var tp = tx.translationText.length > 120
            ? tx.translationText.slice(0, 120) + "…"
            : tx.translationText;
          html += row("Translation", tp);
        }
        html += "</dl></div>";
      });
      html += '</section>';
    }
    html += '</div>';
    return html;
  }

  // ---- view toggle (editor right pane) -------------------------------------
  function setEditorView(mode) {
    _viewMode = mode;
    var htmlPane = document.getElementById("preview-html");
    var xmlPane  = document.getElementById("preview-xml");
    var btnPrev  = document.getElementById("btn-view-preview");
    var btnXml   = document.getElementById("btn-view-xml");
    if (htmlPane) htmlPane.style.display = mode === "preview" ? "block" : "none";
    if (xmlPane)  xmlPane.style.display  = mode === "xml"     ? "block" : "none";
    if (btnPrev)  btnPrev.classList.toggle("active", mode === "preview");
    if (btnXml)   btnXml.classList.toggle("active",  mode === "xml");
    if (mode === "preview") {
      var el = document.getElementById("preview-html");
      if (el) el.innerHTML = buildHtmlPreviewFromState(cleanState());
    }
  }

  // ---- output --------------------------------------------------------------
  function cleanState() {
    var d = {};
    Object.keys(state).forEach(function (k) { if (k[0] !== "_" && k !== "keywords_raw") d[k] = state[k]; });
    return d;
  }
  function update() {
    var xml = build(cleanState());
    document.getElementById("out").textContent = xml;
    if (_viewMode === "preview") {
      var el = document.getElementById("preview-html");
      if (el) el.innerHTML = buildHtmlPreviewFromState(cleanState());
    }
    var v = document.getElementById("validity");
    try {
      var doc = new DOMParser().parseFromString(xml, "application/xml");
      if (doc.getElementsByTagName("parsererror").length) { v.textContent = "✗ not well-formed"; v.className = "validity bad"; }
      else { v.textContent = "✓ well-formed"; v.className = "validity ok"; }
    } catch (e) { v.textContent = ""; }
  }

  // ---- sessionStorage preload (catalog "Edit" → editor) -------------------
  function tryMatchVocab(selectId, arr, labelFn, val, pickFn) {
    if (!val) return;
    var sel = document.getElementById("f-" + selectId);
    if (!sel) return;
    var low = String(val).toLowerCase().trim();
    for (var i = 0; i < arr.length; i++) {
      var o = arr[i];
      var lbl = labelFn(o).toLowerCase();
      if (lbl === low || lbl.indexOf(low) !== -1 || (o.zh && low.indexOf(o.zh.toLowerCase()) !== -1)) {
        sel.value = String(i);
        pickFn(o);
        return;
      }
    }
  }

  function preloadFromSession() {
    var raw = sessionStorage.getItem("epiwen_preload");
    if (!raw) return;
    sessionStorage.removeItem("epiwen_preload");
    try {
      var loaded = JSON.parse(raw);
      Object.keys(loaded).forEach(function (k) { state[k] = loaded[k]; });
      if (!state.texts || !state.texts.length) state.texts = [{ lang: "zh-Hant" }];

      // Set all simple (non-vocab, non-array) fields
      Object.keys(state).forEach(function (k) {
        if (k[0] === "_" || k === "texts" || k === "keywords" || k === "keywords_raw") return;
        setVal(k, state[k]);
      });
      // Keywords textarea
      if (loaded.keywords && loaded.keywords.length) {
        state.keywords_raw = loaded.keywords.map(function (kw) {
          return kw.label + (kw.ref ? " | " + kw.ref : "");
        }).join("\n");
        setVal("keywords", state.keywords_raw);
      }
      // Match and pre-select vocab dropdowns
      tryMatchVocab("_material",   V.MATERIALS,    function (o) { return o.zh + " " + o.en; },   loaded.material,   pickMaterial);
      tryMatchVocab("_objectType", V.OBJECT_TYPES, function (o) { return o.zh + " · " + o.en; }, loaded.objectType, pickObjectType);
      tryMatchVocab("_script",     V.SCRIPTS,      function (o) { return o.zh + " " + o.en; },   loaded.script,     pickScript);
      tryMatchVocab("_language",   V.LANGS,        function (o) { return o.en; },                loaded.langLabel,  pickLanguage);
      tryMatchVocab("_licence",    V.LICENCES,     function (o) { return o.label; },             loaded.licence,    pickLicence);

      renderTexts();
      update();

      // If this record came from a private collection, save it back there.
      if (loaded._writeTarget && window.EpiGitHub && EpiGitHub.setTarget) {
        EpiGitHub.setTarget(loaded._writeTarget);
      }

      // Editing a record that lives in an editable collection — offer Delete.
      // (Default-corpus / shared examples are read-only: no in-place delete.)
      var delBtn = document.getElementById("btn-delete-github");
      if (delBtn && state.filename && state._canDelete) delBtn.style.display = "";
    } catch (e) { console.warn("epiwen_preload parse error", e); }
  }

  // ---- buttons -------------------------------------------------------------
  // Styled "do you really want to delete this entry?" confirm (falls back to the
  // native dialog if the modal module is unavailable). Resolves Promise<boolean>.
  function askDelete() {
    if (window.EpiModal && EpiModal.confirm) {
      return EpiModal.confirm({
        title: "Delete entry",
        message: "Do you really want to delete this entry?",
        confirmText: "Delete", cancelText: "Cancel", danger: true
      });
    }
    return Promise.resolve(window.confirm("Do you really want to delete this entry?"));
  }
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
    a.download = (state.filename || "epidoc").replace(/\.xml$/i, "") + ".xml";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }
  function copy() { if (navigator.clipboard) navigator.clipboard.writeText(build(cleanState())); }
  var _toastTimer = null;
  function showToast(msg) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg; el.classList.add("show");
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () { el.classList.remove("show"); }, 3000);
  }
  function propose() {
    var xml   = build(cleanState());
    var fname = (state.filename || "epidoc-record.xml").replace(/\.xml$/i, "") + ".xml";
    var url   = "https://github.com/pleuston/epiwen-data/new/main" +
                "?filename=" + encodeURIComponent("records/" + fname);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(xml).then(function () {
        window.open(url, "_blank", "noopener");
        showToast("XML copied — paste it into the editor on GitHub");
      });
    } else {
      window.open(url, "_blank", "noopener");
      showToast("Open the GitHub editor — copy XML from the right panel and paste");
    }
  }

  var EXAMPLE = {
    filename: "SNS_2.xml", editor: "Epiwen contributor",
    titleEn: "Mañjuśrī Prajñā stele, Mount Shuiniu (two faces)",
    titleZh: "水牛山《文殊師利所説摩訶般若波羅蜜經》碑（兩面）",
    country: "China 中國", currentRegion: "Shandong 山東", currentSettlement: "Wenshang 汶上",
    repository: "in situ 原處", inventoryNo: "SNS_2",
    summary: "Northern Qi stele: Mañjuśrī Prajñā sūtra on the recto, donor colophon on the verso.",
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
    texts: [
      { label: "碑陽 recto", subtype: "recto", lang: "zh-Hant",
        sutraTitleZh: "文殊師利所説摩訶般若波羅蜜經", sutraTitleEn: "Sūtra of the Perfection of Wisdom Spoken by Mañjuśrī", cbeta: "T08n0232",
        editionText: "文殊師利白佛言\n世尊云何名般若波羅蜜\n佛言般若波羅蜜無邊無際",
        translationText: "Mañjuśrī addressed the Buddha: 'World-Honoured One, what is the Perfection of Wisdom?'" },
      { label: "碑陰 verso / 題記", subtype: "verso", lang: "zh-Hant",
        editionText: "武平六年歲次乙未\n邑義等敬造",
        translationText: "In the sixth year of Wuping (575)... the donor society reverently made this." }
    ],
    authority: "Epiwen / Altergraphy", licence: "CC BY 4.0", licenceTarget: "https://creativecommons.org/licenses/by/4.0/",
    langIdent: "zh", langLabel: "Literary Chinese 漢文",
    changeWhen: "2026-06-18", changeWho: "#epiwen", changeNote: "Initial EpiDoc encoding via the Epiwen generator."
  };
  function loadExample() {
    Object.keys(EXAMPLE).forEach(function (k) { state[k] = EXAMPLE[k]; });
    Object.keys(state).forEach(function (k) {
      if (k[0] === "_" || k === "texts") return;
      setVal(k, k === "keywords" ? state.keywords_raw : state[k]);
    });
    renderTexts();
    update();
  }

  // ---- init ----------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", function () {
    render();

    // Language toggle
    Array.prototype.forEach.call(document.querySelectorAll(".langtoggle button"), function (b) {
      b.addEventListener("click", function () { lang(b.dataset.lang); });
    });

    // Right-pane view toggle
    var btnPrev = document.getElementById("btn-view-preview");
    var btnXml  = document.getElementById("btn-view-xml");
    if (btnPrev) btnPrev.addEventListener("click", function () { setEditorView("preview"); });
    if (btnXml)  btnXml.addEventListener("click",  function () { setEditorView("xml"); });

    // Top bar buttons
    document.getElementById("btn-copy").addEventListener("click", copy);
    var _btnSave = document.getElementById("btn-save-github");
    var _btnCfg  = document.getElementById("btn-gh-settings");
    if (_btnSave) _btnSave.addEventListener("click", function () {
      if (window.EpiGitHub) EpiGitHub.save(build(cleanState()), state.filename);
    });
    var _btnDel = document.getElementById("btn-delete-github");
    if (_btnDel) _btnDel.addEventListener("click", function () {
      if (!window.EpiGitHub || !state.filename) return;
      askDelete().then(function (ok) {
        if (!ok) return;
        EpiGitHub.del(state.filename, function () {
          setTimeout(function () { window.location.href = "catalog.html"; }, 800);
        });
      });
    });
    if (_btnCfg)  _btnCfg.addEventListener("click", function () {
      if (window.EpiGitHub) EpiGitHub.showSettings();
    });
    document.getElementById("btn-download").addEventListener("click", download);
    document.getElementById("btn-reset").addEventListener("click", function () { location.reload(); });
    document.getElementById("btn-example").addEventListener("click", loadExample);

    // Preload from catalog "Edit" button (via sessionStorage)
    preloadFromSession();

    // Pre-fill editor field with GitHub identity if not already set by preload
    if (!state.editor) {
      var ghUser = localStorage.getItem("epiwen_gh_username") || "";
      if (ghUser) { state.editor = ghUser; setVal("editor", ghUser); }
    }

    update();
  });
})();
