/* catalog.js — loads records from GitHub and renders the searchable catalog.
 * Provides: HTML preview card, XML view toggle, "Edit" button that loads a
 * record into editor.html via sessionStorage. */
(function () {
  "use strict";

  var OWNER  = "pleuston";
  var REPO   = "epiwen-epidoc-generator";
  var BRANCH = "main";
  var API    = "https://api.github.com/repos/" + OWNER + "/" + REPO + "/contents/records";
  var RAW    = "https://raw.githubusercontent.com/" + OWNER + "/" + REPO + "/" + BRANCH + "/records/";

  var allRecords  = [];
  var currentXml  = "";
  var selectedItem = null;

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
      return { name: name, titleEn: name, titleZh: "", when: "", dateText: "", parts: [], rawXml: xmlText };
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
    var materialEl   = first(doc, "material");
    var material     = txt(materialEl);
    var materialRef  = materialEl ? materialEl.getAttribute("ref") || "" : "";
    var objectTypeEl = first(doc, "objectType");
    var objectType   = txt(objectTypeEl);
    var objectTypeRef = objectTypeEl ? objectTypeEl.getAttribute("ref") || "" : "";
    var height    = txt(first(doc, "height"));
    var width     = txt(first(doc, "width"));
    var depth     = txt(first(doc, "depth"));
    var condition = txt(first(doc, "condition"));
    var layoutEl     = first(doc, "layout");
    var layoutColumns = layoutEl ? layoutEl.getAttribute("columns") || "" : "";
    var layoutLines   = layoutEl ? layoutEl.getAttribute("writtenLines") || "" : "";
    var layoutNote    = txt(layoutEl);
    var handNoteEl = first(doc, "handNote");
    var script     = txt(handNoteEl);
    var scriptRef  = handNoteEl ? handNoteEl.getAttribute("script") || "" : "";

    // Date
    var origDateEl  = first(doc, "origDate");
    var when        = origDateEl ? origDateEl.getAttribute("when") || origDateEl.getAttribute("notBefore") || "" : "";
    var notBefore   = origDateEl ? origDateEl.getAttribute("notBefore") || "" : "";
    var notAfter    = origDateEl ? origDateEl.getAttribute("notAfter") || "" : "";
    var calendar    = origDateEl ? origDateEl.getAttribute("calendar") || "" : "";
    var datingMethod = origDateEl ? origDateEl.getAttribute("datingMethod") || "" : "";
    var dateText    = txt(origDateEl);

    // Place
    var origPlaceEl  = first(doc, "origPlace");
    var origPlace    = txt(origPlaceEl);
    var origPlaceRef = origPlaceEl ? origPlaceEl.getAttribute("ref") || "" : "";

    // Language
    var langs = qns(doc, "language").map(function (l) {
      return { ident: l.getAttribute("ident") || "", label: l.textContent.trim() };
    });

    // Publication
    var authority    = txt(first(doc, "authority"));
    var licenceEl    = first(doc, "licence");
    var licence      = txt(licenceEl);
    var licenceTarget = licenceEl ? licenceEl.getAttribute("target") || "" : "";
    var changeEl     = first(doc, "change");
    var changeWhen   = changeEl ? changeEl.getAttribute("when") || "" : "";
    var changeWho    = changeEl ? changeEl.getAttribute("who") || "" : "";
    var changeNote   = txt(changeEl);

    // Textparts
    var allDivs  = qns(doc, "div");
    var msItems  = qns(doc, "msItem");
    var parts    = [];

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

      var abEl         = first(div, "ab");
      var editionText  = extractAbText(abEl);
      var transDiv     = allDivs.find(function (d) {
        return d.getAttribute("type") === "translation" && d.getAttribute("n") === n;
      }) || null;
      var translationText = extractTranslation(transDiv);

      parts.push({ n: n, subtype: subtype, head: head, lang: lang,
                   sutra: sutra, sutraEn: sutraEn, cbeta: cbeta, taisho: taisho,
                   editionText: editionText, translationText: translationText });
    });

    // Single-text fallback (no textpart divs)
    if (!parts.length && msItems.length) {
      var itemTitles = qns(msItems[0], "title");
      var sutra   = txt(itemTitles.find(function (t) { return t.getAttribute("xml:lang") === "zh-Hant"; }) || itemTitles[0] || null);
      var sutraEn = txt(itemTitles.find(function (t) { return t.getAttribute("xml:lang") === "en"; }) || null);
      var refTitle  = itemTitles.find(function (t) { return t.getAttribute("ref"); });
      var titleRef  = refTitle ? refTitle.getAttribute("ref") || "" : "";
      var cbeta   = titleRef.indexOf("cbeta:")  === 0 ? titleRef.slice(6)  : "";
      var taisho  = titleRef.indexOf("taisho:") === 0 ? titleRef.slice(7)  : "";
      var locus   = txt(first(msItems[0], "locus"));
      var editionDiv = allDivs.find(function (d) { return d.getAttribute("type") === "edition"; });
      var editionText = extractAbText(editionDiv ? first(editionDiv, "ab") : null);
      var transDiv    = allDivs.find(function (d) { return d.getAttribute("type") === "translation"; });
      var translationText = extractTranslation(transDiv);
      parts.push({ n: "1", subtype: "", head: locus, lang: langs[0] ? langs[0].ident : "",
                   sutra: sutra, sutraEn: sutraEn, cbeta: cbeta, taisho: taisho,
                   editionText: editionText, translationText: translationText });
    }

    return {
      name: name, editor: editor, titleEn: titleEn, titleZh: titleZh,
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
      filename:        rec.name || "",
      titleEn:         rec.titleEn || "",
      titleZh:         rec.titleZh || "",
      editor:          rec.editor || "",
      country:         rec.country || "",
      currentRegion:   rec.region || "",
      currentSettlement: rec.settlement || "",
      repository:      rec.repository || "",
      inventoryNo:     rec.inventoryNo || "",
      summary:         rec.summary || "",
      material:        rec.material || "",
      materialRef:     rec.materialRef || "",
      objectType:      rec.objectType || "",
      objectTypeRef:   rec.objectTypeRef || "",
      heightCm:        rec.height || "",
      widthCm:         rec.width || "",
      depthCm:         rec.depth || "",
      condition:       rec.condition || "",
      layoutColumns:   rec.layoutColumns || "",
      layoutLines:     rec.layoutLines || "",
      layoutNote:      rec.layoutNote || "",
      script:          rec.script || "",
      scriptRef:       rec.scriptRef || "",
      origDateText:    rec.dateText || "",
      whenISO:         rec.when || "",
      notBefore:       rec.notBefore || "",
      notAfter:        rec.notAfter || "",
      calendar:        rec.calendar || "",
      datingMethod:    rec.datingMethod || "",
      origPlace:       rec.origPlace || "",
      origPlaceRef:    rec.origPlaceRef || "",
      langIdent:       (rec.langs && rec.langs[0]) ? rec.langs[0].ident : "zh",
      langLabel:       (rec.langs && rec.langs[0]) ? rec.langs[0].label : "Literary Chinese 漢文",
      authority:       rec.authority || "Epiwen / Altergraphy",
      licence:         rec.licence || "",
      licenceTarget:   rec.licenceTarget || "",
      changeWhen:      rec.changeWhen || "",
      changeWho:       rec.changeWho || "",
      changeNote:      rec.changeNote || "",
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

  // ---- render catalog ------------------------------------------------------
  function renderCatalog(records) {
    var list = document.getElementById("catalog-list");
    if (!records.length) {
      list.innerHTML = '<div class="catalog-empty">' +
        'No records yet. <a href="editor.html">Add the first inscription →</a></div>';
      return;
    }
    list.innerHTML = "";
    records.forEach(function (rec) { list.appendChild(buildItem(rec)); });
  }

  function buildItem(rec) {
    var item = document.createElement("div");
    item.className = "catalog-item";
    var idx = [rec.name, rec.titleEn, rec.titleZh, rec.dateText, rec.settlement, rec.region]
      .concat(rec.parts.map(function (p) { return p.sutra + " " + p.head; }))
      .join(" ").toLowerCase();
    item.dataset.idx = idx;

    // monument row
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

  // ---- preview pane --------------------------------------------------------
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

  // ---- search --------------------------------------------------------------
  function filterCatalog(term) {
    var q = term.toLowerCase();
    Array.prototype.forEach.call(document.querySelectorAll(".catalog-item"), function (el) {
      el.style.display = (!q || el.dataset.idx.indexOf(q) !== -1) ? "" : "none";
    });
  }

  // ---- init ----------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", function () {

    // Preview pane header buttons
    document.getElementById("preview-copy").addEventListener("click", function () {
      flashCopy(currentXml, this);
    });

    // View toggle
    Array.prototype.forEach.call(document.querySelectorAll(".cat-view-btn"), function (btn) {
      btn.addEventListener("click", function () { setCatView(btn.dataset.view); });
    });

    // Search
    document.getElementById("catalog-search").addEventListener("input", function () {
      filterCatalog(this.value);
    });

    // Load records from GitHub
    ghFetch(API)
      .then(function (files) {
        if (!files) { renderCatalog([]); return; }

        var xmlFiles = files
          .filter(function (f) { return /\.xml$/i.test(f.name); })
          .sort(function (a, b) { return a.name.localeCompare(b.name); });

        if (!xmlFiles.length) { renderCatalog([]); return; }

        var records = [], remaining = xmlFiles.length;
        function done() {
          records.sort(function (a, b) { return a.name.localeCompare(b.name); });
          allRecords = records;
          renderCatalog(records);
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
