/* rubbing-app.js — form and TEI/XML serializer for rubbing records.
 * Companion to editor.html (inscription records); same design patterns.
 * Vocabulary from vocab.js (V = window.VOCAB), rubbing branch.
 * XML output: TEI msDesc type="rubbing" linked to source inscription via
 *   <relatedItem type="surrogateOf">.
 */
(function () {
  "use strict";
  var V = window.VOCAB;

  // ===== XML BUILDER ===========================================================
  function ex(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function ea(s) { return ex(s).replace(/"/g, "&quot;"); }
  function tv(v)  { return v == null ? "" : String(v).trim(); }

  // el(tag, attrs, inner): attrs = plain object, inner = string | array | null.
  // Returns null when the element would be completely empty (no attrs, no content).
  // Returns self-closing <tag/> when attrs present but inner is empty/null.
  function el(tag, attrs, inner) {
    var a = "";
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (tv(attrs[k])) a += " " + k + '="' + ea(tv(attrs[k])) + '"';
      });
    }
    if (inner === null || inner === undefined || (typeof inner === "string" && inner === "")) {
      if (!a) return null;
      return "<" + tag + a + "/>";
    }
    var b = Array.isArray(inner) ? inner.filter(Boolean).join("\n") : String(inner);
    if (!a && !b.trim()) return null;
    return "<" + tag + a + ">" + b + "</" + tag + ">";
  }

  function buildXML(s) {
    var X = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<?xml-model href="http://www.stoa.org/epidoc/schema/latest/tei-epidoc.rng"' +
        ' schematypens="http://relaxng.org/ns/structure/1.0"?>',
      '<TEI xmlns="http://www.tei-c.org/ns/1.0">'
    ];

    /* titleStmt */
    var ts = el("titleStmt", null, [
      el("title",  { "xml:lang": "en" },       ex(tv(s.titleEn))),
      el("title",  { "xml:lang": "zh-Hant" },  ex(tv(s.titleZh))),
      el("editor", null,                        ex(tv(s.editor)))
    ]);

    /* publicationStmt */
    var licEl = tv(s.licenceTarget)
      ? el("licence", { target: tv(s.licenceTarget) }, ex(tv(s.licence)))
      : el("licence", null, ex(tv(s.licence)));
    var ps = el("publicationStmt", null, [
      el("authority", null, ex(tv(s.authority) || "Epiwen / Altergraphy")),
      el("idno", { type: "filename" }, ex(tv(s.filename))),
      licEl ? el("availability", null, licEl) : null
    ]);

    /* msIdentifier */
    var msId = el("msIdentifier", null, [
      el("country",     null, ex(tv(s.country))),
      el("region",      null, ex(tv(s.region))),
      el("settlement",  null, ex(tv(s.settlement))),
      el("institution", null, ex(tv(s.institution))),
      el("repository",  null, ex(tv(s.repository))),
      el("idno", { type: "inventory" }, ex(tv(s.inventoryNo)))
    ]);

    /* physDesc — support */
    var suppChildren = [
      el("objectType",
        { ref: "https://opentheso.huma-num.fr/?idc=802596&idt=th770" },
        "拓片 Rubbing")
    ];
    if (tv(s.formatRef)) {
      suppChildren.push("<p>" +
        el("term", { type: "rubbingFormat", ref: tv(s.formatRef) }, ex(tv(s.formatLabel))) +
        "</p>");
    }
    if (tv(s.paperRef) || tv(s.paperLabel)) {
      suppChildren.push(el("material",
        tv(s.paperRef) ? { ref: tv(s.paperRef) } : null,
        ex(tv(s.paperLabel))));
    }
    if (s.paperAttrs && s.paperAttrs.length) {
      var paTerms = s.paperAttrs.map(function (a) {
        return el("term", { ref: tv(a.ref) }, ex(a.en + (a.zh ? " / " + a.zh : "")));
      }).filter(Boolean).join(", ");
      suppChildren.push(el("note", { type: "paperAttributes" }, paTerms));
    }
    if (tv(s.heightCm) || tv(s.widthCm)) {
      suppChildren.push(el("dimensions", { unit: "cm" }, [
        el("height", null, ex(tv(s.heightCm))),
        el("width",  null, ex(tv(s.widthCm)))
      ]));
    }
    var suppDesc = el("supportDesc", null, [
      el("support",   null, suppChildren),
      el("condition", null, ex(tv(s.condition)))
    ]);
    var objDesc = el("objectDesc",
      tv(s.formatLabel) ? { form: tv(s.formatLabel) } : null,
      suppDesc);

    /* physDesc — handDesc (inking) */
    var hnote = [];
    if (tv(s.inkingTechniqueRef)) {
      hnote.push(el("term",
        { type: "inkingTechnique", ref: tv(s.inkingTechniqueRef) },
        ex(tv(s.inkingTechniqueLabel))));
    }
    if (tv(s.inkingSubtypeRef)) {
      hnote.push(el("term",
        { type: "inkingSubtype", ref: tv(s.inkingSubtypeRef) },
        ex(tv(s.inkingSubtypeLabel))));
    }
    if (tv(s.inkingMediumRef)) {
      hnote.push(el("term",
        { type: "inkingMedium", ref: tv(s.inkingMediumRef) },
        ex(tv(s.inkingMediumLabel))));
    }
    if (tv(s.inkingIntensity)) {
      hnote.push(el("note", { type: "inkingIntensity" }, ex(tv(s.inkingIntensity)) + "/10"));
    }
    var handDesc = hnote.length ? el("handDesc", null, el("handNote", null, hnote)) : null;

    /* physDesc — additions (paratext) */
    var addParts = [];
    if (tv(s.colophon)) addParts.push("<p><label>Colophon 跋</label>: " + ex(tv(s.colophon)) + "</p>");
    if (tv(s.seals))    addParts.push("<p><label>Seals 印章</label>: "   + ex(tv(s.seals))    + "</p>");
    if (tv(s.marks))    addParts.push("<p><label>Marks</label>: "         + ex(tv(s.marks))    + "</p>");
    var additions = addParts.length ? el("additions", null, addParts.join("\n")) : null;

    var physDesc = el("physDesc", null, [objDesc, handDesc, additions]);

    /* history */
    var orig = el("origin", null, [
      el("origDate", tv(s.dateCreatedISO) ? { when: tv(s.dateCreatedISO) } : null, ex(tv(s.dateCreated))),
      el("origPlace", null, ex(tv(s.placeCreated)))
    ]);
    var history = el("history", null, [
      orig,
      el("provenance",   null, ex(tv(s.provenance))),
      el("acquisition",
        tv(s.dateAcquiredISO) ? { when: tv(s.dateAcquiredISO) } : null,
        ex(tv(s.acquisition)))
    ]);

    /* additional / listBibl */
    var bibs = [];
    if (tv(s.inscriptionFile)) {
      bibs.push(el("relatedItem", { type: "surrogateOf" },
        el("bibl", null,
          el("ptr", { target: tv(s.inscriptionFile) }, null))));
    }
    if (tv(s.concordanceRef)) {
      bibs.push(el("bibl",
        { type: "concordance", ref: tv(s.concordanceRef) },
        "Concordance: " + ex(tv(s.concordanceLabel))));
    }
    if (tv(s.techniqueRef)) {
      bibs.push(el("bibl",
        { type: "rubbingTechnique", ref: tv(s.techniqueRef) },
        "Technique: " + ex(tv(s.techniqueLabel))));
    }
    if (tv(s.copyingRef)) {
      bibs.push(el("bibl",
        { type: "copyingTechnique", ref: tv(s.copyingRef) },
        ex(tv(s.copyingLabel))));
    }
    if (tv(s.rubObjectTypeRef)) {
      bibs.push(el("bibl",
        { type: "rubbedObjectType", ref: tv(s.rubObjectTypeRef) },
        ex(tv(s.rubObjectTypeLabel))));
    }
    tv(s.bibliography).split("\n").map(function (l) { return l.trim(); }).filter(Boolean)
      .forEach(function (l) { bibs.push(el("bibl", null, ex(l))); });
    var additional = bibs.length
      ? el("additional", null, el("listBibl", null, bibs))
      : null;

    /* listPerson (agents) */
    var persons = [];
    (s.agents || []).forEach(function (ag) {
      if (!tv(ag.name) && !tv(ag.roleLabel)) return;
      var pch = [el("persName", null, ex(tv(ag.name)))];
      if (tv(ag.date)) pch.push(el("floruit", null, ex(tv(ag.date))));
      persons.push(el("person",
        tv(ag.roleRef) ? { role: tv(ag.roleLabel), ref: tv(ag.roleRef) }
                       : { role: tv(ag.roleLabel) },
        pch));
    });
    var listPerson = persons.length ? el("listPerson", null, persons) : null;

    var msDesc = el("msDesc", { type: "rubbing" },
      [msId, physDesc, history, additional, listPerson]);

    var fileDesc = el("fileDesc", null, [ts, ps, el("sourceDesc", null, msDesc)]);

    /* revisionDesc */
    var rev = null;
    if (tv(s.changeWhen) || tv(s.changeWho) || tv(s.changeNote)) {
      var ca = {};
      if (tv(s.changeWhen)) ca.when = tv(s.changeWhen);
      if (tv(s.changeWho))  ca.who  = tv(s.changeWho);
      rev = el("revisionDesc", null, el("change", ca, ex(tv(s.changeNote))));
    }

    X.push(el("teiHeader", null, [fileDesc, rev]));

    /* text body */
    var bodyParts = [];
    if (tv(s.commentary)) {
      bodyParts.push(el("div", { type: "commentary" }, el("p", null, ex(tv(s.commentary)))));
    }
    X.push("<text>\n<body>\n" + (bodyParts.join("\n") || "") + "\n</body>\n</text>");
    X.push("</TEI>");
    return X.filter(Boolean).join("\n");
  }

  // ===== STATE =================================================================
  var state = {
    authority: "Epiwen / Altergraphy",
    agents: [{}],
    paperAttrs: []
  };

  function setVal(key, v) {
    var el2 = document.getElementById("f-" + key);
    if (el2) el2.value = v == null ? "" : v;
  }
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ===== VOCAB PICK HANDLERS ===================================================
  function label(o) { return (o.zh ? o.zh + " · " : "") + o.en; }

  function pickFormat(o) {
    state.formatLabel = label(o); state.formatRef = o.ref;
  }
  function pickInkTechnique(o) {
    state.inkingTechniqueLabel = label(o);
    state.inkingTechniqueRef   = o.ref;
    // clear subtype when technique changes
    state.inkingSubtypeLabel = ""; state.inkingSubtypeRef = "";
    refreshSubtypes();
  }
  function pickInkSubtype(o) {
    state.inkingSubtypeLabel = label(o); state.inkingSubtypeRef = o.ref;
  }
  function pickInkMedium(o) {
    state.inkingMediumLabel = label(o); state.inkingMediumRef = o.ref;
  }
  function pickPaperType(o) {
    state.paperLabel = label(o); state.paperRef = o.ref;
  }
  function pickConcordance(o) {
    state.concordanceLabel = o.en; state.concordanceRef = o.ref;
  }
  function pickTechnique(o) {
    state.techniqueLabel = label(o); state.techniqueRef = o.ref;
  }
  function pickRubObject(o) {
    state.rubObjectTypeLabel = label(o); state.rubObjectTypeRef = o.ref;
  }
  function pickCopyTech(o) {
    state.copyingLabel = label(o); state.copyingRef = o.ref;
  }
  function pickLicence(o) {
    state.licence = o.label; state.licenceTarget = o.target;
    setVal("licenceTarget", o.target);
  }

  function refreshSubtypes() {
    var sel = document.getElementById("f-_inkingSubtype");
    if (!sel) return;
    var opts = [];
    var tech = tv(state.inkingTechniqueLabel);
    if (tech.indexOf("Dry") !== -1 || tech.indexOf("干") !== -1)    opts = V.INKING_DRY_SUBTYPES;
    else if (tech.indexOf("Wet") !== -1 || tech.indexOf("湿") !== -1) opts = V.INKING_WET_SUBTYPES;
    sel._opts = opts;
    sel.innerHTML = '<option value="">—</option>' +
      opts.map(function (o, i) {
        return '<option value="' + i + '">' + esc(label(o)) + "</option>";
      }).join("");
    sel.disabled = (opts.length === 0);
  }

  // ===== FORM SECTIONS =========================================================
  var SECTIONS = [
    { en: "Identity", zh: "著錄", fields: [
      { key: "filename",  en: "File name",     zh: "檔名",   ph: "RUB_1.xml" },
      { key: "titleEn",   en: "English title", zh: "英文標題" },
      { key: "titleZh",   en: "Chinese title", zh: "中文標題" },
      { key: "editor",    en: "Editor",         zh: "編者" }
    ]},
    { en: "Inscription reference", zh: "銘文參照", fields: [
      { key: "inscriptionFile",
        en: "Source inscription file", zh: "銘文檔名", ph: "SNS_2.xml",
        hint_en: "Filename of the inscription this rubbing was taken from",
        hint_zh: "本拓本所從之銘文檔名" }
    ]},
    { en: "Holding & identifier", zh: "收藏與編號", fields: [
      { row: [
        { key: "country",    en: "Country",    zh: "國別",  ph: "France 法國" },
        { key: "region",     en: "Region",     zh: "省/區", ph: "Île-de-France" },
        { key: "settlement", en: "Settlement", zh: "市/縣", ph: "Paris 巴黎" }
      ]},
      { key: "institution", en: "Institution",             zh: "機構",   ph: "Bibliothèque nationale de France" },
      { key: "repository",  en: "Repository / collection", zh: "收藏部門", ph: "Estampes et photographies" },
      { key: "inventoryNo", en: "Inventory no.",           zh: "索書號" }
    ]},
    { en: "Format", zh: "支持物形制", fields: [
      { type: "vocab", key: "_format", en: "Support format", zh: "支持物形式",
        options: V.RUBBING_FORMATS,
        label: function (o) { return label(o); }, pick: pickFormat },
      { row: [
        { key: "heightCm", type: "number", en: "Height (cm)", zh: "高" },
        { key: "widthCm",  type: "number", en: "Width (cm)",  zh: "寬" }
      ]},
      { key: "condition", en: "Condition", zh: "保存狀況" }
    ]},
    { en: "Inking", zh: "墨 / 拓印技法", fields: [
      { type: "vocab", key: "_inkingTechnique",
        en: "Inking technique", zh: "拓印技法",
        options: V.INKING_TECHNIQUES,
        label: function (o) { return label(o); }, pick: pickInkTechnique },
      { type: "vocab", key: "_inkingSubtype",
        en: "Subtype (dry/wet variant)", zh: "細分技法",
        options: [],
        label: function (o) { return label(o); }, pick: pickInkSubtype },
      { type: "vocab", key: "_inkingMedium",
        en: "Ink medium / pigment", zh: "墨料",
        options: V.INKING_MEDIA,
        label: function (o) { return label(o); }, pick: pickInkMedium },
      { key: "inkingIntensity", type: "number",
        en: "Ink intensity (1–10)", zh: "墨色深淺（1–10）",
        hint_en: "Grey scale: 1 = lightest, 10 = blackest",
        hint_zh: "1 = 最淡，10 = 最深" }
    ]},
    { en: "Paper", zh: "紙張", fields: [
      { type: "vocab", key: "_paperType",
        en: "Paper type", zh: "紙張類型",
        options: V.PAPER_TYPES,
        label: function (o) { return label(o); }, pick: pickPaperType },
      { custom: "paperAttributes" }
    ]},
    { en: "Relationship with original", zh: "與原石的關係", fields: [
      { type: "vocab", key: "_concordance",
        en: "Concordance with original", zh: "與原石一致程度",
        options: V.CONCORDANCE_LEVELS,
        label: function (o) {
          return o.en + (o.zh ? " / " + o.zh : "") +
            (o.definition ? "  — " + o.definition.slice(0, 45) + "…" : "");
        }, pick: pickConcordance },
      { type: "vocab", key: "_technique",
        en: "Rubbing technique", zh: "拓製方式",
        options: V.CONTACT_TECHNIQUES,
        label: function (o) {
          return (o.contact ? "[contact] " : "[no contact] ") + label(o);
        }, pick: pickTechnique },
      { type: "vocab", key: "_rubObject",
        en: "Rubbed object type", zh: "拓製對象類型",
        options: V.RUBBED_OBJECT_TYPES,
        label: function (o) { return label(o); }, pick: pickRubObject }
    ]},
    { en: "Other copying technique", zh: "其他複製方式", fields: [
      { type: "vocab", key: "_copyTech",
        en: "Copying technique", zh: "複製技法",
        options: V.OTHER_COPY_TECHNIQUES,
        label: function (o) { return label(o); }, pick: pickCopyTech }
    ]},
    { en: "Paratext", zh: "旁白文字（跋語、印章、記號）", fields: [
      { key: "colophon", type: "textarea", en: "Colophon 跋",  zh: "跋文" },
      { key: "seals",    type: "textarea", en: "Seals 印章",    zh: "印章" },
      { key: "marks",    type: "textarea", en: "Marks",          zh: "記號" }
    ]},
    { en: "Persons", zh: "著錄人物", fields: [
      { custom: "agents" }
    ]},
    { en: "Dates & provenance", zh: "紀年與收藏史", fields: [
      { row: [
        { key: "dateCreated",    en: "Date of rubbing",     zh: "拓製年代", ph: "1880年代" },
        { key: "dateCreatedISO", en: "ISO year",            zh: "公曆年",  ph: "1880" }
      ]},
      { key: "placeCreated",   en: "Place of creation",  zh: "拓製地點" },
      { key: "dateParatext",   en: "Date on paratext",   zh: "旁白年代",
        hint_en: "Date appearing in colophon or seal" },
      { row: [
        { key: "dateAcquired",    en: "Date acquired",    zh: "入藏日期", ph: "1920" },
        { key: "dateAcquiredISO", en: "ISO year",          zh: "公曆年",  ph: "1920" }
      ]},
      { key: "provenance",  type: "textarea", en: "Provenance / collection history", zh: "流傳歷史" },
      { key: "acquisition", en: "Acquisition note", zh: "入藏說明" }
    ]},
    { en: "Commentary & bibliography", zh: "注釋與參考文獻", fields: [
      { key: "commentary",   type: "textarea", en: "Commentary / comments", zh: "注釋" },
      { key: "bibliography", type: "textarea", en: "Bibliography (one per line)", zh: "參考文獻（每行一條）" }
    ]},
    { en: "Publication & revision", zh: "出版與修訂", fields: [
      { key: "authority", en: "Authority", zh: "發布機構" },
      { type: "vocab", key: "_licence", en: "Licence", zh: "授權",
        options: V.LICENCES,
        label: function (o) { return o.label; }, pick: pickLicence },
      { key: "licenceTarget", en: "Licence URL", zh: "授權連結" },
      { row: [
        { key: "changeWhen", en: "Change date", zh: "修訂日期", ph: "2026-06-19" },
        { key: "changeWho",  en: "Change by",   zh: "修訂者" },
        { key: "changeNote", en: "Change note", zh: "修訂說明" }
      ]}
    ]}
  ];

  // ===== CUSTOM BLOCKS =========================================================

  // -- Paper attributes (checkboxes) --
  var _paBox = null;
  function renderPaperAttributesBlock() {
    var wrap = document.createElement("div"); wrap.className = "field";
    wrap.innerHTML = '<span class="label">' +
      '<span class="en">Paper attributes</span>' +
      '<span class="zh">紙張特性</span></span>';
    _paBox = document.createElement("div"); _paBox.className = "checkbox-group";
    V.PAPER_ATTRIBUTES.forEach(function (attr, i) {
      var lbl = document.createElement("label"); lbl.className = "check-label";
      var cb = document.createElement("input");
      cb.type = "checkbox"; cb.id = "pa-" + i; cb.value = i;
      cb.addEventListener("change", function () {
        var idx = parseInt(cb.value, 10);
        var pos = state.paperAttrs.findIndex(function (a) {
          return a.ref === V.PAPER_ATTRIBUTES[idx].ref;
        });
        if (cb.checked && pos === -1) state.paperAttrs.push(V.PAPER_ATTRIBUTES[idx]);
        else if (!cb.checked && pos !== -1) state.paperAttrs.splice(pos, 1);
        update();
      });
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(
        " " + attr.en + (attr.zh ? " / " + attr.zh : "")));
      _paBox.appendChild(lbl);
    });
    wrap.appendChild(_paBox);
    return wrap;
  }

  // -- Agents (repeatable person block) --
  var _agBox = null;
  function renderAgentsBlock() {
    var wrap = document.createElement("div");
    _agBox = document.createElement("div"); _agBox.id = "agents-container";
    wrap.appendChild(_agBox);
    var addBtn = document.createElement("button");
    addBtn.type = "button"; addBtn.className = "btn";
    addBtn.innerHTML = '+ <span class="en">Add person</span><span class="zh">增加人物</span>';
    addBtn.addEventListener("click", function () {
      state.agents.push({}); renderAgents(); update();
    });
    wrap.appendChild(addBtn);
    renderAgents();
    return wrap;
  }
  function renderAgents() {
    if (!_agBox) return;
    _agBox.innerHTML = "";
    state.agents.forEach(function (ag, i) { _agBox.appendChild(renderAgentRow(ag, i)); });
  }
  function renderAgentRow(ag, i) {
    var box  = document.createElement("div"); box.className = "textblock";
    var head = document.createElement("div"); head.className = "textblock-head";
    head.innerHTML = "<strong>" +
      '<span class="en">Person</span><span class="zh">人物</span>' +
      " " + (i + 1) + "</strong>";
    if (state.agents.length > 1) {
      var del = document.createElement("button");
      del.type = "button"; del.className = "btn small";
      del.innerHTML = '− <span class="en">remove</span><span class="zh">刪除</span>';
      del.addEventListener("click", function () {
        state.agents.splice(i, 1); renderAgents(); update();
      });
      head.appendChild(del);
    }
    box.appendChild(head);

    var row = document.createElement("div"); row.className = "field row";

    // name
    var nWrap = document.createElement("div");
    nWrap.innerHTML = '<span class="label"><span class="en">Name</span><span class="zh">姓名</span></span>';
    var nIn = document.createElement("input"); nIn.type = "text"; nIn.value = ag.name || "";
    nIn.addEventListener("input", function () { ag.name = nIn.value; update(); });
    nWrap.appendChild(nIn); row.appendChild(nWrap);

    // role
    var rWrap = document.createElement("div");
    rWrap.innerHTML = '<span class="label"><span class="en">Role</span><span class="zh">角色</span></span>';
    var rSel = document.createElement("select");
    rSel.innerHTML = '<option value="">—</option>' +
      V.AGENT_ROLES.map(function (r, j) {
        return '<option value="' + j + '">' + esc(label(r)) + "</option>";
      }).join("");
    if (ag.roleRef) {
      for (var j = 0; j < V.AGENT_ROLES.length; j++) {
        if (V.AGENT_ROLES[j].ref === ag.roleRef) { rSel.value = String(j); break; }
      }
    }
    rSel.addEventListener("change", function () {
      var j = parseInt(rSel.value, 10);
      if (!isNaN(j)) { ag.roleLabel = V.AGENT_ROLES[j].en; ag.roleRef = V.AGENT_ROLES[j].ref; }
      else            { ag.roleLabel = ""; ag.roleRef = ""; }
      update();
    });
    rWrap.appendChild(rSel); row.appendChild(rWrap);

    // date
    var dWrap = document.createElement("div");
    dWrap.innerHTML = '<span class="label"><span class="en">Active / date</span><span class="zh">活動年代</span></span>';
    var dIn = document.createElement("input"); dIn.type = "text"; dIn.value = ag.date || "";
    dIn.addEventListener("input", function () { ag.date = dIn.value; update(); });
    dWrap.appendChild(dIn); row.appendChild(dWrap);

    box.appendChild(row);
    return box;
  }

  // ===== FORM RENDERER =========================================================
  function labelSpan(f) {
    return '<span class="label">' +
      '<span class="en">' + esc(f.en) + "</span>" +
      (f.zh ? '<span class="zh">' + esc(f.zh) + "</span>" : "") +
      "</span>";
  }
  function renderField(f) {
    if (f.custom === "paperAttributes") return renderPaperAttributesBlock();
    if (f.custom === "agents")          return renderAgentsBlock();

    var wrap = document.createElement("div"); wrap.className = "field";

    if (f.type === "vocab") {
      wrap.innerHTML = labelSpan(f);
      var sel = document.createElement("select"); sel.id = "f-" + f.key;
      sel.innerHTML = '<option value="">—</option>' +
        f.options.map(function (o, i) {
          return '<option value="' + i + '">' + esc(f.label(o)) + "</option>";
        }).join("");
      if (f.key === "_inkingSubtype") sel.disabled = true;
      sel.addEventListener("change", function () {
        var opts = sel._opts || f.options;
        var i = parseInt(sel.value, 10);
        if (!isNaN(i)) { f.pick(opts[i]); update(); }
      });
      wrap.appendChild(sel);
      return wrap;
    }

    var ctrl;
    if (f.type === "textarea") {
      ctrl = document.createElement("textarea");
    } else {
      ctrl = document.createElement("input");
      ctrl.type = (f.type === "number") ? "number" : "text";
    }
    ctrl.id = "f-" + f.key;
    if (f.ph) ctrl.placeholder = f.ph;
    wrap.innerHTML = labelSpan(f);
    ctrl.addEventListener("input", function () { state[f.key] = ctrl.value; update(); });
    wrap.appendChild(ctrl);

    if (f.hint_en || f.hint_zh) {
      var hint = document.createElement("div"); hint.className = "hint";
      hint.innerHTML =
        (f.hint_en ? '<span class="en">' + esc(f.hint_en) + "</span>" : "") +
        (f.hint_zh ? '<span class="zh">' + esc(f.hint_zh) + "</span>" : "");
      wrap.appendChild(hint);
    }
    return wrap;
  }
  function renderRow(fields) {
    var row = document.createElement("div"); row.className = "field row";
    fields.forEach(function (f) {
      var c = renderField(f); c.classList.remove("field"); row.appendChild(c);
    });
    return row;
  }
  function renderForm() {
    var root = document.getElementById("form");
    SECTIONS.forEach(function (sec) {
      var h = document.createElement("div"); h.className = "section-title";
      h.innerHTML = '<span class="en">' + esc(sec.en) + "</span>" +
                    '<span class="zh">' + esc(sec.zh) + "</span>";
      root.appendChild(h);
      sec.fields.forEach(function (f) {
        if (f.row) root.appendChild(renderRow(f.row));
        else       root.appendChild(renderField(f));
      });
    });
    setVal("authority", state.authority);
  }

  // ===== HTML PREVIEW CARD =====================================================
  function buildPreviewHTML(s) {
    function row(lbl, val) {
      if (!val && val !== 0) return "";
      return "<dt>" + esc(lbl) + "</dt><dd>" + esc(String(val)) + "</dd>";
    }
    function sec(title, rows) {
      var r = rows.filter(Boolean).join("");
      if (!r) return "";
      return '<section class="hp-section"><h4 class="hp-st">' + esc(title) +
             '</h4><dl class="hp-dl">' + r + "</dl></section>";
    }
    var html = '<div class="hp-preview">';
    html += sec("Identity", [
      row("File",      s.filename),
      row("Title EN",  s.titleEn),
      row("Title ZH",  s.titleZh),
      row("Editor",    s.editor)
    ]);
    if (tv(s.inscriptionFile)) {
      html += sec("Inscription reference", [row("Source file", s.inscriptionFile)]);
    }
    html += sec("Holding", [
      row("Country",     s.country),
      row("Region",      s.region),
      row("Settlement",  s.settlement),
      row("Institution", s.institution),
      row("Repository",  s.repository),
      row("Inventory",   s.inventoryNo)
    ]);
    html += sec("Format", [
      row("Format",    s.formatLabel),
      (s.heightCm || s.widthCm)
        ? row("H × W", [s.heightCm, s.widthCm].filter(Boolean).join(" × ") + " cm")
        : "",
      row("Condition", s.condition)
    ]);
    html += sec("Inking", [
      row("Technique",  s.inkingTechniqueLabel),
      row("Subtype",    s.inkingSubtypeLabel),
      row("Medium",     s.inkingMediumLabel),
      s.inkingIntensity ? row("Intensity", s.inkingIntensity + "/10") : ""
    ]);
    html += sec("Paper", [
      row("Type",       s.paperLabel),
      s.paperAttrs && s.paperAttrs.length
        ? row("Attributes", s.paperAttrs.map(function (a) { return a.en; }).join(", "))
        : ""
    ]);
    html += sec("Relationship with original", [
      row("Concordance",   s.concordanceLabel),
      row("Technique",     s.techniqueLabel),
      row("Rubbed object", s.rubObjectTypeLabel)
    ]);
    if (tv(s.copyingLabel)) {
      html += sec("Other copying technique", [row("Technique", s.copyingLabel)]);
    }
    html += sec("Paratext", [
      row("Colophon", s.colophon),
      row("Seals",    s.seals),
      row("Marks",    s.marks)
    ]);
    if (s.agents && s.agents.length) {
      var agRows = s.agents
        .filter(function (a) { return tv(a.name) || tv(a.roleLabel); })
        .map(function (a) {
          var label2 = a.roleLabel || "person";
          var val = tv(a.name) || "—";
          if (a.date) val += " (" + a.date + ")";
          return row(label2, val);
        });
      if (agRows.length) html += sec("Persons", agRows);
    }
    html += sec("Dates & provenance", [
      row("Date of rubbing",  s.dateCreated),
      s.dateCreatedISO  ? row("ISO year",        s.dateCreatedISO)  : "",
      row("Place of creation", s.placeCreated),
      row("Date on paratext", s.dateParatext),
      row("Date acquired",    s.dateAcquired),
      row("Provenance",       s.provenance)
    ]);
    if (tv(s.commentary)) html += sec("Commentary", [row("Note", s.commentary)]);
    html += "</div>";
    return html;
  }

  // ===== UPDATE ================================================================
  function cleanState() {
    var d = {};
    Object.keys(state).forEach(function (k) { d[k] = state[k]; });
    return d;
  }
  function update() {
    var xml = buildXML(cleanState());
    var out = document.getElementById("out");
    if (out) out.textContent = xml;
    var ph = document.getElementById("preview-html");
    if (ph) ph.innerHTML = buildPreviewHTML(state);
    var v = document.getElementById("validity");
    if (v) {
      var ready = tv(state.filename) && tv(state.inscriptionFile);
      v.textContent = ready ? "✓ ready" : "filename + inscription ref required";
      v.style.color = ready ? "var(--ok)" : "var(--muted)";
    }
  }

  // ===== DOM WIRING ============================================================
  document.addEventListener("DOMContentLoaded", function () {
    renderForm();
    refreshSubtypes();
    update();

    // Language toggle
    Array.prototype.forEach.call(document.querySelectorAll("[data-lang]"), function (btn) {
      btn.addEventListener("click", function () {
        document.body.className = "lang-" + btn.dataset.lang;
        Array.prototype.forEach.call(document.querySelectorAll("[data-lang]"), function (b) {
          b.classList.remove("active");
        });
        btn.classList.add("active");
      });
    });

    // View toggle
    var btnPrev = document.getElementById("btn-view-preview");
    var btnXml  = document.getElementById("btn-view-xml");
    var pHtml   = document.getElementById("preview-html");
    var pXml    = document.getElementById("preview-xml");
    function setView(mode) {
      if (pHtml) pHtml.style.display = mode === "preview" ? "" : "none";
      if (pXml)  pXml.style.display  = mode === "xml"     ? "" : "none";
      if (btnPrev) btnPrev.classList.toggle("active", mode === "preview");
      if (btnXml)  btnXml.classList.toggle("active",  mode === "xml");
    }
    if (btnPrev) btnPrev.addEventListener("click", function () { setView("preview"); });
    if (btnXml)  btnXml.addEventListener("click",  function () { setView("xml"); });

    // Reset
    var btnReset = document.getElementById("btn-reset");
    if (btnReset) btnReset.addEventListener("click", function () {
      if (!confirm("Reset all fields? / 清空所有欄位？")) return;
      state.filename = ""; state.titleEn = ""; state.titleZh = "";
      state.editor = ""; state.inscriptionFile = "";
      state.country = ""; state.region = ""; state.settlement = "";
      state.institution = ""; state.repository = ""; state.inventoryNo = "";
      state.formatLabel = ""; state.formatRef = "";
      state.heightCm = ""; state.widthCm = ""; state.condition = "";
      state.inkingTechniqueLabel = ""; state.inkingTechniqueRef = "";
      state.inkingSubtypeLabel = "";  state.inkingSubtypeRef = "";
      state.inkingMediumLabel = "";   state.inkingMediumRef = "";
      state.inkingIntensity = "";
      state.paperLabel = ""; state.paperRef = ""; state.paperAttrs = [];
      state.concordanceLabel = ""; state.concordanceRef = "";
      state.techniqueLabel = ""; state.techniqueRef = "";
      state.rubObjectTypeLabel = ""; state.rubObjectTypeRef = "";
      state.copyingLabel = ""; state.copyingRef = "";
      state.colophon = ""; state.seals = ""; state.marks = "";
      state.agents = [{}];
      state.dateCreated = ""; state.dateCreatedISO = "";
      state.placeCreated = ""; state.dateParatext = "";
      state.dateAcquired = ""; state.dateAcquiredISO = "";
      state.provenance = ""; state.acquisition = "";
      state.commentary = ""; state.bibliography = "";
      state.authority = "Epiwen / Altergraphy";
      state.licence = ""; state.licenceTarget = "";
      state.changeWhen = ""; state.changeWho = ""; state.changeNote = "";

      var formEl = document.getElementById("form");
      if (formEl) formEl.innerHTML = "";
      _agBox = null; _paBox = null;
      renderForm(); refreshSubtypes(); update();
    });

    // Copy XML
    var btnCopy = document.getElementById("btn-copy");
    if (btnCopy) btnCopy.addEventListener("click", function () {
      var xml = buildXML(cleanState());
      if (navigator.clipboard) {
        navigator.clipboard.writeText(xml).then(function () {
          var prev = btnCopy.textContent;
          btnCopy.textContent = "Copied!";
          setTimeout(function () { btnCopy.textContent = prev; }, 1800);
        });
      }
    });

    // Download
    var btnDl = document.getElementById("btn-download");
    if (btnDl) btnDl.addEventListener("click", function () {
      var xml  = buildXML(cleanState());
      var fname = tv(state.filename) || "rubbing.xml";
      if (!fname.endsWith(".xml")) fname += ".xml";
      var blob = new Blob([xml], { type: "application/xml" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = fname;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    });

    // GitHub save + settings
    var _btnSave = document.getElementById("btn-save-github");
    var _btnCfg  = document.getElementById("btn-gh-settings");
    if (_btnSave) _btnSave.addEventListener("click", function () {
      if (window.EpiGitHub) {
        EpiGitHub.save(buildXML(cleanState()), tv(state.filename) || "rubbing.xml");
      }
    });
    if (_btnCfg) _btnCfg.addEventListener("click", function () {
      if (window.EpiGitHub) EpiGitHub.showSettings();
    });
  });

})();
