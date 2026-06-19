/* catalog.js — loads records from GitHub and renders the searchable catalog.
 * Three tabs: Objects (physical carriers), Inscriptions (per-text), Rubbings. */
(function () {
  "use strict";

  var OWNER  = "pleuston";
  var REPO   = "epiwen-epidoc-generator";
  var BRANCH = "main";
  var API    = "https://api.github.com/repos/" + OWNER + "/" + REPO + "/contents/records";
  var RAW    = "https://raw.githubusercontent.com/" + OWNER + "/" + REPO + "/" + BRANCH + "/records/";

  var allRecords   = [];
  var currentXml   = "";
  var selectedItem = null;
  var currentTab   = "objects";

  // ---- fetch helpers -------------------------------------------------------
  function ghFetch(url) {
    return fetch(url, { headers: { Accept: "application/vnd.github.v3+json" } })
      .then(function (r) {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error("GitHub API " + r.status);
        return r.json();
      });
  }
  function rawFetch(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    });
  }

  // ---- XML helpers ---------------------------------------------------------
  var NS = "http://www.tei-c.org/ns/1.0";
  function qns(node, tag) { return Array.from(node.getElementsByTagNameNS(NS, tag)); }
  function first(node, tag) { return node.getElementsByTagNameNS(NS, tag)[0] || null; }
  function txt(el) { return el ? el.textContent.trim() : ""; }

  function extractAbText(abEl) {
    if (!abEl) return "";
    var lbs = abEl.getElementsByTagNameNS(NS, "lb");
    if (!lbs.length) return abEl.textContent.trim();
    var lines = [], cur = "";
    var nodes = abEl.childNodes;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.nodeType === 1 && n.localName === "lb") {
        if (cur.trim()) lines.push(cur.trim());
        cur = "";
      } else {
        cur += n.textContent || "";
      }
    }
    if (cur.trim()) lines.push(cur.trim());
    return lines.join("\n");
  }

  function extractTranslation(divEl) {
    if (!divEl) return "";
    var p = first(divEl, "p");
    return p ? p.textContent.trim() : divEl.textContent.trim();
  }

  // ---- parseRecord ---------------------------------------------------------
  function parseRecord(name, xmlText) {
    var doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) {
      return { name: name, recordType: "object", surrogateOf: "",
               titleEn: name, titleZh: "", when: "", dateText: "", parts: [], rawXml: xmlText };
    }

    // Record type (object vs rubbing)
    var msDescEl   = doc.getElementsByTagNameNS(NS, "msDesc")[0];
    var msDescType = msDescEl ? (msDescEl.getAttribute("type") || "") : "";
    var recordType = msDescType === "rubbing" ? "rubbing" : "object";

    // For rubbings: what inscription does this reproduce?
    var relItemEls  = qns(doc, "relatedItem");
    var surrogateEl = relItemEls.find(function (el) {
      return el.getAttribute("type") === "surrogateOf";
    });
    var surrogateOf = "";
    if (surrogateEl) {
      var ptrEl = surrogateEl.getElementsByTagNameNS(NS, "ptr")[0];
      surrogateOf = ptrEl ? (ptrEl.getAttribute("target") || txt(ptrEl))
                          : txt(surrogateEl);
    }

    // Identity
    var stmtTitles = qns(doc, "title").filter(function (t) {
      return t.parentNode && t.parentNode.localName === "titleStmt";
    });
    var titleEn = txt(stmtTitles.find(function (t) { return t.getAttribute("xml:lang") === "en"; }));
    var titleZh = txt(stmtTitles.find(function (t) { return t.getAttribute("xml:lang") === "zh-Hant"; }));
    var editor  = txt(first(doc, "editor"));

    // Holding
    var countryEl   = first(doc, "country");
    var country     = txt(countryEl);
    var countryRef  = countryEl ? countryEl.getAttribute("ref") || "" : "";
    var region      = txt(first(doc, "region"));
    var settlement  = txt(first(doc, "settlement"));
    var repository  = txt(first(doc, "repository"));
    var idnos       = qns(doc, "idno");
    var inventoryNo = txt(idnos.find(function (el) { return el.getAttribute("type") === "inventory"; }) || null);

    // Contents
    var summary = txt(first(doc, "summary"));

    // Physical
    var materialEl    = first(doc, "material");
    var material      = txt(materialEl);
    var materialRef   = materialEl ? materialEl.getAttribute("ref") || "" : "";
    var objectTypeEl  = first(doc, "objectType");
    var objectType    = txt(objectTypeEl);
    var objectTypeRef = objectTypeEl ? objectTypeEl.getAttribute("ref") || "" : "";
    var height    = txt(first(doc, "height"));
    var width     = txt(first(doc, "width"));
    var depth     = txt(first(doc, "depth"));
    var condition = txt(first(doc, "condition"));
    var layoutEl      = first(doc, "layout");
    var layoutColumns = layoutEl ? layoutEl.getAttribute("columns") || "" : "";
    var layoutLines   = layoutEl ? layoutEl.getAttribute("writtenLines") || "" : "";
    var layoutNote    = txt(layoutEl);
    var handNoteEl = first(doc, "handNote");
    var script     = txt(handNoteEl);
    var scriptRef  = handNoteEl ? handNoteEl.getAttribute("script") || "" : "";

    // Date
    var origDateEl   = first(doc, "origDate");
    var when         = origDateEl ? origDateEl.getAttribute("when") || origDateEl.getAttribute("notBefore") || "" : "";
    var notBefore    = origDateEl ? origDateEl.getAttribute("notBefore") || "" : "";
    var notAfter     = origDateEl ? origDateEl.getAttribute("notAfter") || "" : "";
    var calendar     = origDateEl ? origDateEl.getAttribute("calendar") || "" : "";
    var datingMethod = origDateEl ? origDateEl.getAttribute("datingMethod") || "" : "";
    var dateText     = txt(origDateEl);

    // Place
    var origPlaceEl  = first(doc, "origPlace");
    var origPlace    = txt(origPlaceEl);
    var origPlaceRef = origPlaceEl ? origPlaceEl.getAttribute("ref") || "" : "";

    // Language
    var langs = qns(doc, "language").map(function (l) {
      return { ident: l.getAttribute("ident") || "", label: l.textContent.trim() };
    });

    // Publication
    var authority     = txt(first(doc, "authority"));
    var licenceEl     = first(doc, "licence");
    var licence       = txt(licenceEl);
    var licenceTarget = licenceEl ? licenceEl.getAttribute("target") || "" : "";
    var changeEl      = first(doc, "change");
    var changeWhen    = changeEl ? changeEl.getAttribute("when") || "" : "";
    var changeWho     = changeEl ? changeEl.getAttribute("who") || "" : "";
    var changeNote    = txt(changeEl);

    // Textparts
    var allDivs = qns(doc, "div");
    var msItems = qns(doc, "msItem");
    var parts   = [];

    allDivs.forEach(function (div) {
      if (div.getAttribute("type") !== "textpart") return;
      var n       = div.getAttribute("n") || "";
      var subtype = div.getAttribute("subtype") || "";
      var head    = txt(first(div, "head"));
      var lang    = div.getAttribute("xml:lang") || "";

      var msItem     = msItems.find(function (m) { return m.getAttribute("n") === n; }) || null;
      var itemTitles = msItem ? qns(msItem, "title") : [];
      var sutra      = txt(itemTitles.find(function (t) { return t.getAttribute("xml:lang") === "zh-Hant"; }) || itemTitles[0] || null);
      var sutraEn    = txt(itemTitles.find(function (t) { return t.getAttribute("xml:lang") === "en"; }) || null);
      var refTitle   = itemTitles.find(function (t) { return t.getAttribute("ref"); });
      var titleRef   = refTitle ? refTitle.getAttribute("ref") || "" : "";
      var cbeta      = titleRef.indexOf("cbeta:")  === 0 ? titleRef.slice(6)  : "";
      var taisho     = titleRef.indexOf("taisho:") === 0 ? titleRef.slice(7)  : "";

      var abEl            = first(div, "ab");
      var editionText     = extractAbText(abEl);
      var transDiv        = allDivs.find(function (d) {
        return d.getAttribute("type") === "translation" && d.getAttribute("n") === n;
      }) || null;
      var translationText = extractTranslation(transDiv);

      parts.push({ n: n, subtype: subtype, head: head, lang: lang,
                   sutra: sutra, sutraEn: sutraEn, cbeta: cbeta, taisho: taisho,
                   editionText: editionText, translationText: translationText });
    });

    // Single-text fallback (no textpart divs)
    if (!parts.length && msItems.length) {
      var itemTitles2 = qns(msItems[0], "title");
      var sutra2   = txt(itemTitles2.find(function (t) { return t.getAttribute("xml:lang") === "zh-Hant"; }) || itemTitles2[0] || null);
      var sutraEn2 = txt(itemTitles2.find(function (t) { return t.getAttribute("xml:lang") === "en"; }) || null);
      var refTitle2   = itemTitles2.find(function (t) { return t.getAttribute("ref"); });
      var titleRef2   = refTitle2 ? refTitle2.getAttribute("ref") || "" : "";
      var cbeta2   = titleRef2.indexOf("cbeta:")  === 0 ? titleRef2.slice(6)  : "";
      var taisho2  = titleRef2.indexOf("taisho:") === 0 ? titleRef2.slice(7)  : "";
      var locus2   = txt(first(msItems[0], "locus"));
      var editionDiv  = allDivs.find(function (d) { return d.getAttribute("type") === "edition"; });
      var editionText2 = extractAbText(editionDiv ? first(editionDiv, "ab") : null);
      var transDiv2   = allDivs.find(function (d) { return d.getAttribute("type") === "translation"; });
      var translationText2 = extractTranslation(transDiv2);
      parts.push({ n: "1", subtype: "", head: locus2, lang: langs[0] ? langs[0].ident : "",
                   sutra: sutra2, sutraEn: sutraEn2, cbeta: cbeta2, taisho: taisho2,
                   editionText: editionText2, translationText: translationText2 });
    }

    return {
      name: name, recordType: recordType, surrogateOf: surrogateOf,
      editor: editor, titleEn: titleEn, titleZh: titleZh,
      country: country, countryRef: countryRef, region: region, settlement: settlement,
      repository: repository, inventoryNo: inventoryNo, summary: summary,
      material: material, materialRef: materialRef,
      objectType: objectType, objectTypeRef: objectTypeRef,
      height: height, width: width, depth: depth,
      condition: condition, layoutColumns: layoutColumns, layoutLines: layoutLines, layoutNote: layoutNote,
      script: script, scriptRef: scriptRef,
      when: when, notBefore: notBefore, notAfter: notAfter,
      calendar: calendar, datingMethod: datingMethod, dateText: dateText,
      origPlace: origPlace, origPlaceRef: origPlaceRef,
      langs: langs, authority: authority,
      licence: licence, licenceTarget: licenceTarget,
      changeWhen: changeWhen, changeWho: changeWho, changeNote: changeNote,
      parts: parts, rawXml: xmlText
    };
  }

  // ---- HTML helpers --------------------------------------------------------
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // ---- HTML preview card ---------------------------------------------------
  function buildHtmlPreview(rec) {
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

    var dims = [rec.height, rec.width, rec.depth].filter(Boolean).join(" × ");
    var html = '<div class="hp-preview">';

    html += sec("Identity", [
      row("File", rec.name),
      row("Title (EN)", rec.titleEn),
      row("Title (ZH)", rec.titleZh),
      row("Editor", rec.editor),
      row("Summary", rec.summary),
    ]);

    if (rec.recordType === "rubbing" && rec.surrogateOf) {
      html += sec("Rubbing of", [ row("Inscription", rec.surrogateOf) ]);
    }

    html += sec("Holding", [
      row("Country", rec.country),
      row("Region", rec.region),
      row("Settlement", rec.settlement),
      row("Repository", rec.repository),
      row("Inventory no.", rec.inventoryNo),
    ]);
    html += sec("Physical", [
      row("Material", rec.material),
      row("Type", rec.objectType),
      dims ? row("H × W × D", dims + " cm") : "",
      row("Condition", rec.condition),
      (rec.layoutColumns || rec.layoutLines)
        ? row("Columns / lines", [rec.layoutColumns, rec.layoutLines].filter(Boolean).join(" / "))
        : "",
      row("Script", rec.script),
    ]);
    html += sec("Date & place", [
      row("Date (written)", rec.dateText),
      rec.when ? row("When", rec.when + " CE") : "",
      row("Original place", rec.origPlace),
    ]);

    if (rec.langs && rec.langs.length) {
      var lr = rec.langs.map(function (l) { return row(l.ident, l.label); }).join("");
      if (lr) html += '<section class="hp-section"><h4 class="hp-st">Language</h4>' +
                      '<dl class="hp-dl">' + lr + '</dl></section>';
    }

    if (rec.licence) {
      html += sec("Licence", [
        rec.licenceTarget
          ? '<dt>Licence</dt><dd><a href="' + esc(rec.licenceTarget) + '" target="_blank" rel="noopener">' + esc(rec.licence) + '</a></dd>'
          : row("Licence", rec.licence)
      ]);
    }

    if (rec.parts && rec.parts.length) {
      html += '<section class="hp-section"><h4 class="hp-st">Texts on this object</h4>';
      rec.parts.forEach(function (p, i) {
        var label = p.head || p.subtype || ("Text " + (i + 1));
        html += '<div class="hp-textpart"><div class="hp-textpart-head">' +
                (i + 1) + ". " + esc(label) + "</div>";
        html += '<dl class="hp-dl">';
        if (p.sutra)  html += row("Text", p.sutra);
        if (p.cbeta)  html += row("CBETA", p.cbeta);
        if (p.lang)   html += row("Language", p.lang);
        if (p.editionText) {
          var lines = p.editionText.split("\n");
          var preview = lines.slice(0, 4).join("\n");
          html += "<dt>Transcription</dt><dd><pre class=\"hp-text\">" +
                  esc(preview) + (lines.length > 4 ? "\n…" : "") + "</pre></dd>";
        }
        if (p.translationText) {
          var tp = p.translationText.length > 120
            ? p.translationText.slice(0, 120) + "…"
            : p.translationText;
          html += row("Translation", tp);
        }
        html += "</dl></div>";
      });
      html += '</section>';
    }

    html += '</div>';
    return html;
  }

  // ---- convert rec → editor state -----------------------------------------
  function recToState(rec) {
    return {
      filename:          rec.name || "",
      titleEn:           rec.titleEn || "",
      titleZh:           rec.titleZh || "",
      editor:            rec.editor || "",
      country:           rec.country || "",
      currentRegion:     rec.region || "",
      currentSettlement: rec.settlement || "",
      repository:        rec.repository || "",
      inventoryNo:       rec.inventoryNo || "",
      summary:           rec.summary || "",
      material:          rec.material || "",
      materialRef:       rec.materialRef || "",
      objectType:        rec.objectType || "",
      objectTypeRef:     rec.objectTypeRef || "",
      heightCm:          rec.height || "",
      widthCm:           rec.width || "",
      depthCm:           rec.depth || "",
      condition:         rec.condition || "",
      layoutColumns:     rec.layoutColumns || "",
      layoutLines:       rec.layoutLines || "",
      layoutNote:        rec.layoutNote || "",
      script:            rec.script || "",
      scriptRef:         rec.scriptRef || "",
      origDateText:      rec.dateText || "",
      whenISO:           rec.when || "",
      notBefore:         rec.notBefore || "",
      notAfter:          rec.notAfter || "",
      calendar:          rec.calendar || "",
      datingMethod:      rec.datingMethod || "",
      origPlace:         rec.origPlace || "",
      origPlaceRef:      rec.origPlaceRef || "",
      langIdent:         (rec.langs && rec.langs[0]) ? rec.langs[0].ident : "zh",
      langLabel:         (rec.langs && rec.langs[0]) ? rec.langs[0].label : "Literary Chinese 漢文",
      authority:         rec.authority || "Epiwen",
      licence:           rec.licence || "",
      licenceTarget:     rec.licenceTarget || "",
      changeWhen:        rec.changeWhen || "",
      changeWho:         rec.changeWho || "",
      changeNote:        rec.changeNote || "",
      texts: rec.parts.length
        ? rec.parts.map(function (p) {
            return {
              label:           p.head || "",
              subtype:         p.subtype || "",
              lang:            p.lang || "zh-Hant",
              sutraTitleZh:    p.sutra || "",
              sutraTitleEn:    p.sutraEn || "",
              cbeta:           p.cbeta || "",
              taisho:          p.taisho || "",
              editionText:     p.editionText || "",
              translationText: p.translationText || ""
            };
          })
        : [{ lang: "zh-Hant" }]
    };
  }

  function openInEditor(rec) {
    sessionStorage.setItem("epiwen_preload", JSON.stringify(recToState(rec)));
    window.location.href = "editor.html";
  }

  function recToRubbingState(rec) {
    return {
      filename:        rec.name || "",
      titleEn:         rec.titleEn || "",
      titleZh:         rec.titleZh || "",
      editor:          rec.editor || "",
      inscriptionFile: rec.surrogateOf || "",
      country:         rec.country || "",
      region:          rec.region || "",
      settlement:      rec.settlement || "",
      repository:      rec.repository || "",
      inventoryNo:     rec.inventoryNo || "",
      authority:       rec.authority || "Epiwen / Altergraphy",
      licence:         rec.licence || "",
      licenceTarget:   rec.licenceTarget || "",
      changeWhen:      rec.changeWhen || "",
      changeWho:       rec.changeWho || "",
      changeNote:      rec.changeNote || ""
    };
  }

  function openInRubbingEditor(rec) {
    sessionStorage.setItem("epiwen_preload_rubbing", JSON.stringify(recToRubbingState(rec)));
    window.location.href = "rubbing.html";
  }

  // ---- preview pane --------------------------------------------------------
  function clearPreview() {
    if (selectedItem) selectedItem.classList.remove("selected");
    selectedItem = null;
    document.getElementById("preview-title").textContent = "Select a record to preview";
    document.getElementById("preview-copy").style.display = "none";
    document.getElementById("cat-view-toggle").style.display = "none";
    document.getElementById("cat-html-view").innerHTML = "";
    document.getElementById("cat-html-view").style.display = "none";
    document.getElementById("cat-xml-view").style.display = "none";
    document.getElementById("preview-out").textContent = "";
  }

  function showPreview(rec, item) {
    if (selectedItem) selectedItem.classList.remove("selected");
    selectedItem = item;
    if (item) item.classList.add("selected");

    document.getElementById("preview-title").textContent = rec.name;
    document.getElementById("preview-copy").style.display = "";
    document.getElementById("cat-view-toggle").style.display = "";

    document.getElementById("cat-html-view").innerHTML = buildHtmlPreview(rec);
    document.getElementById("preview-out").textContent = rec.rawXml || "";
    currentXml = rec.rawXml || "";

    setCatView("html");
  }

  function setCatView(mode) {
    var htmlPane = document.getElementById("cat-html-view");
    var xmlPane  = document.getElementById("cat-xml-view");
    htmlPane.style.display = mode === "html" ? "" : "none";
    xmlPane.style.display  = mode === "xml"  ? "" : "none";
    Array.prototype.forEach.call(document.querySelectorAll(".cat-view-btn"), function (b) {
      b.classList.toggle("active", b.dataset.view === mode);
    });
  }

  // ---- clipboard -----------------------------------------------------------
  function flashCopy(xml, btn) {
    if (!navigator.clipboard || !xml) return;
    navigator.clipboard.writeText(xml).then(function () {
      var prev = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(function () { btn.textContent = prev; }, 1800);
    });
  }

  // ---- build catalog items -------------------------------------------------
  function buildItem(rec) {
    var item = document.createElement("div");
    item.className = "catalog-item";
    var idx = [rec.name, rec.titleEn, rec.titleZh, rec.dateText, rec.settlement, rec.region]
      .concat(rec.parts.map(function (p) { return p.sutra + " " + p.head; }))
      .join(" ").toLowerCase();
    item.dataset.idx = idx;

    var monument = document.createElement("div");
    monument.className = "catalog-monument";

    var info = document.createElement("div");
    info.className = "catalog-info";
    info.innerHTML =
      '<code class="catalog-filename">' + esc(rec.name) + '</code>' +
      (rec.titleEn || rec.titleZh
        ? '<div class="catalog-title">' +
          (rec.titleEn ? '<span class="catalog-title-en">' + esc(rec.titleEn) + '</span>' : '') +
          (rec.titleZh ? '<span class="catalog-title-zh">' + esc(rec.titleZh) + '</span>' : '') +
          '</div>'
        : '') +
      ((rec.dateText || rec.when || rec.settlement)
        ? '<span class="catalog-date">' +
          esc([rec.dateText || rec.when, rec.settlement].filter(Boolean).join(' · ')) +
          '</span>'
        : '');

    var actions = document.createElement("div");
    actions.className = "catalog-actions";

    var previewBtn = document.createElement("button");
    previewBtn.type = "button"; previewBtn.className = "btn small";
    previewBtn.textContent = "Preview";
    previewBtn.addEventListener("click", function () { showPreview(rec, item); });

    var copyBtn = document.createElement("button");
    copyBtn.type = "button"; copyBtn.className = "btn small";
    copyBtn.textContent = "Copy XML";
    copyBtn.addEventListener("click", function () { flashCopy(rec.rawXml, copyBtn); });

    var editBtn = document.createElement("button");
    editBtn.type = "button"; editBtn.className = "btn small primary";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", function () { openInEditor(rec); });

    actions.appendChild(previewBtn);
    actions.appendChild(copyBtn);
    actions.appendChild(editBtn);
    monument.appendChild(info);
    monument.appendChild(actions);
    item.appendChild(monument);

    // textparts (indented)
    if (rec.parts.length) {
      var ul = document.createElement("ul");
      ul.className = "catalog-parts";
      rec.parts.forEach(function (p) {
        var li = document.createElement("li");
        li.className = "catalog-part";
        var label = p.head || p.subtype || ("Text " + p.n);
        li.innerHTML =
          '<span class="catalog-part-label">' + esc(label) + '</span>' +
          (p.sutra ? ' <span class="catalog-part-sutra">' + esc(p.sutra) + '</span>' : '') +
          (p.lang  ? ' <code class="catalog-part-lang">'  + esc(p.lang)  + '</code>'  : '');
        ul.appendChild(li);
      });
      item.appendChild(ul);
    }

    return item;
  }

  function buildInscriptionItem(rec, part, pIdx) {
    var item = document.createElement("div");
    item.className = "catalog-item";

    var label = part.head || part.subtype || ("Text " + part.n);
    item.dataset.idx = [label, part.sutra, part.sutraEn, rec.name, rec.titleEn, rec.titleZh]
      .join(" ").toLowerCase();

    var row = document.createElement("div");
    row.className = "catalog-monument";

    var info = document.createElement("div");
    info.className = "catalog-info";

    var titleHtml = "";
    if (part.sutra || part.sutraEn) {
      titleHtml = '<div class="catalog-title">' +
        (part.sutra   ? '<span class="catalog-title-zh">' + esc(part.sutra)   + '</span>' : '') +
        (part.sutraEn ? '<span class="catalog-title-en">' + esc(part.sutraEn) + '</span>' : '') +
        '</div>';
    }

    info.innerHTML =
      titleHtml +
      '<span class="catalog-date">' + esc(label) +
      ' · inscribed on <a href="catalog.html?tab=objects&amp;file=' + encodeURIComponent(rec.name) +
      '" class="catalog-obj-link"><code class="catalog-filename">' + esc(rec.name) + '</code></a>' +
      (rec.dateText ? ' · ' + esc(rec.dateText) : '') +
      '</span>';
    var objLink = info.querySelector(".catalog-obj-link");
    if (objLink) {
      objLink.addEventListener("click", function (e) {
        e.preventDefault();
        history.pushState({ tab: "objects", file: rec.name }, "", objLink.href);
        renderByTab("objects", rec.name);
      });
    }

    var actions = document.createElement("div");
    actions.className = "catalog-actions";

    var previewBtn = document.createElement("button");
    previewBtn.type = "button"; previewBtn.className = "btn small";
    previewBtn.textContent = "Preview";
    previewBtn.addEventListener("click", function () { showPreview(rec, item); });

    actions.appendChild(previewBtn);
    row.appendChild(info);
    row.appendChild(actions);
    item.appendChild(row);
    return item;
  }

  function buildRubbingItem(rec) {
    var item = document.createElement("div");
    item.className = "catalog-item";
    item.dataset.idx = [rec.name, rec.titleEn, rec.titleZh, rec.surrogateOf, rec.dateText]
      .join(" ").toLowerCase();

    var row = document.createElement("div");
    row.className = "catalog-monument";

    var info = document.createElement("div");
    info.className = "catalog-info";

    var refText = rec.surrogateOf
      ? 'rubbing of <code class="catalog-filename">' + esc(rec.surrogateOf) + '</code>'
      : "";
    var dateClause = rec.dateText ? esc(rec.dateText) : "";

    info.innerHTML =
      '<code class="catalog-filename">' + esc(rec.name) + '</code>' +
      (rec.titleEn || rec.titleZh
        ? '<div class="catalog-title">' +
          (rec.titleEn ? '<span class="catalog-title-en">' + esc(rec.titleEn) + '</span>' : '') +
          (rec.titleZh ? '<span class="catalog-title-zh">' + esc(rec.titleZh) + '</span>' : '') +
          '</div>'
        : '') +
      ((refText || dateClause)
        ? '<span class="catalog-date">' +
          [refText, dateClause].filter(Boolean).join(' · ') +
          '</span>'
        : '');

    var actions = document.createElement("div");
    actions.className = "catalog-actions";

    var previewBtn = document.createElement("button");
    previewBtn.type = "button"; previewBtn.className = "btn small";
    previewBtn.textContent = "Preview";
    previewBtn.addEventListener("click", function () { showPreview(rec, item); });

    var copyBtn = document.createElement("button");
    copyBtn.type = "button"; copyBtn.className = "btn small";
    copyBtn.textContent = "Copy XML";
    copyBtn.addEventListener("click", function () { flashCopy(rec.rawXml, copyBtn); });

    var editBtn = document.createElement("button");
    editBtn.type = "button"; editBtn.className = "btn small primary";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", function () { openInRubbingEditor(rec); });

    actions.appendChild(previewBtn);
    actions.appendChild(copyBtn);
    actions.appendChild(editBtn);
    row.appendChild(info);
    row.appendChild(actions);
    item.appendChild(row);
    return item;
  }

  // ---- render by tab -------------------------------------------------------
  function renderByTab(tab, file) {
    currentTab = tab;

    // Update nav active state
    Array.prototype.forEach.call(document.querySelectorAll(".sitenav-link[data-tab]"), function (link) {
      link.classList.toggle("active", link.dataset.tab === tab);
    });

    // Update "+ New" add button
    var addBtn = document.getElementById("btn-add-new");
    if (addBtn) {
      if (tab === "objects")       { addBtn.href = "editor.html";  addBtn.style.display = ""; }
      else if (tab === "rubbings") { addBtn.href = "rubbing.html"; addBtn.style.display = ""; }
      else                         { addBtn.style.display = "none"; }
    }

    // Reset search and preview when switching tabs
    var searchEl = document.getElementById("catalog-search");
    if (searchEl) searchEl.value = "";
    clearPreview();

    if (tab === "objects") {
      renderObjectsCatalog(allRecords.filter(function (r) { return r.recordType !== "rubbing"; }), file || "");
    } else if (tab === "inscriptions") {
      renderInscriptionsCatalog();
    } else if (tab === "rubbings") {
      renderRubbingsCatalog(allRecords.filter(function (r) { return r.recordType === "rubbing"; }));
    }
  }

  function renderObjectsCatalog(records, file) {
    var list = document.getElementById("catalog-list");
    if (!records.length) {
      list.innerHTML = '<div class="catalog-empty">' +
        'No records yet. <a href="editor.html">Add the first inscription →</a></div>';
      return;
    }
    list.innerHTML = "";
    records.forEach(function (rec) {
      var item = buildItem(rec);
      list.appendChild(item);
      if (file && rec.name === file) {
        setTimeout(function () {
          item.scrollIntoView({ behavior: "smooth", block: "nearest" });
          showPreview(rec, item);
        }, 0);
      }
    });
  }

  function renderInscriptionsCatalog() {
    var list = document.getElementById("catalog-list");
    list.innerHTML = "";

    var items = [];
    allRecords
      .filter(function (r) { return r.recordType !== "rubbing"; })
      .forEach(function (rec) {
        rec.parts.forEach(function (part, pIdx) {
          items.push({ rec: rec, part: part, pIdx: pIdx });
        });
      });

    if (!items.length) {
      list.innerHTML = '<div class="catalog-empty">No inscriptions found.</div>';
      return;
    }
    items.forEach(function (it) {
      list.appendChild(buildInscriptionItem(it.rec, it.part, it.pIdx));
    });
  }

  function renderRubbingsCatalog(records) {
    var list = document.getElementById("catalog-list");
    if (!records.length) {
      list.innerHTML = '<div class="catalog-empty">' +
        'No rubbing records yet. <a href="rubbing.html">Add the first rubbing →</a></div>';
      return;
    }
    list.innerHTML = "";
    records.forEach(function (rec) { list.appendChild(buildRubbingItem(rec)); });
  }

  // ---- search --------------------------------------------------------------
  function filterCatalog(term) {
    var q = term.toLowerCase();
    Array.prototype.forEach.call(document.querySelectorAll(".catalog-item"), function (el) {
      el.style.display = (!q || el.dataset.idx.indexOf(q) !== -1) ? "" : "none";
    });
  }

  // ---- init ----------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", function () {

    document.getElementById("preview-copy").addEventListener("click", function () {
      flashCopy(currentXml, this);
    });

    Array.prototype.forEach.call(document.querySelectorAll(".cat-view-btn"), function (btn) {
      btn.addEventListener("click", function () { setCatView(btn.dataset.view); });
    });

    // SPA nav — catalog tab links switch view without a full reload
    Array.prototype.forEach.call(document.querySelectorAll(".sitenav-link[data-tab]"), function (link) {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        var tab = link.dataset.tab;
        history.pushState({ tab: tab }, "", link.href);
        renderByTab(tab);
      });
    });

    // Browser back/forward
    window.addEventListener("popstate", function (e) {
      var sp   = new URLSearchParams(window.location.search);
      var tab  = (e.state && e.state.tab)  || sp.get("tab")  || "objects";
      var file = (e.state && e.state.file) || sp.get("file") || "";
      renderByTab(tab, file);
    });

    document.getElementById("catalog-search").addEventListener("input", function () {
      filterCatalog(this.value);
    });

    // Initial tab + file from URL params
    var _sp       = new URLSearchParams(window.location.search);
    var tabParam  = _sp.get("tab")  || "objects";
    var fileParam = _sp.get("file") || "";
    currentTab = tabParam;

    // Load records from GitHub
    ghFetch(API)
      .then(function (files) {
        if (!files) { renderByTab(currentTab, fileParam); return; }

        var xmlFiles = files
          .filter(function (f) { return /\.xml$/i.test(f.name); })
          .sort(function (a, b) { return a.name.localeCompare(b.name); });

        if (!xmlFiles.length) { renderByTab(currentTab, fileParam); return; }

        var records = [], remaining = xmlFiles.length;
        function done() {
          records.sort(function (a, b) { return a.name.localeCompare(b.name); });
          allRecords = records;
          renderByTab(currentTab, fileParam);
        }
        xmlFiles.forEach(function (f) {
          // Use locally-cached fresh XML if the user just saved this file from the editor;
          // otherwise fetch from GitHub raw (which may lag the CDN by several minutes).
          var fresh = sessionStorage.getItem("epiwen_fresh:" + f.name);
          var fetchPromise = fresh ? Promise.resolve(fresh) : rawFetch(RAW + f.name);
          fetchPromise
            .then(function (xml) { records.push(parseRecord(f.name, xml)); })
            .catch(function () {})
            .then(function () { remaining -= 1; if (!remaining) done(); });
        });
      })
      .catch(function (e) {
        document.getElementById("catalog-list").innerHTML =
          '<div class="catalog-empty">Could not load records from GitHub: ' +
          esc(e.message) + '</div>';
      });
  });
})();
