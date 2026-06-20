/* catalog.js — loads records from GitHub and renders the searchable catalog.
 * Three tabs: Objects (physical carriers), Inscriptions (per-text), Rubbings. */
(function () {
  "use strict";

  var OWNER  = "pleuston";
  var REPO   = "epiwen-data";   // records live in the private data backend
  var BRANCH = "main";

  var allRecords    = [];
  var publicRecords = [];
  var privateRecords = [];
  var currentXml   = "";
  var selectedItem = null;
  var currentTab   = "objects";
  var showMine     = false;
  var sourceFilter = "all";   // "all" | "public" | "private" | "col:<id>"
  var rubSourceFilter = "all"; // Rubbings tab: filter by holding collection / source
  var siteFilter   = "all";    // Objects/Inscriptions: filter by site (origPlace / repository)
  var rubViewMode  = "flat";   // Rubbings tab: "flat" (every rubbing) | "compact" (by inscription)
  var currentUsername = (window.EpiAuth ? EpiAuth.getUser().username : "") ||
                        localStorage.getItem("epiwen_gh_username") || "";

  function rebuildAll() { allRecords = publicRecords.concat(privateRecords); }

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

    // Facsimile images (rubbings): <facsimile><graphic url="…IIIF…"/> + source link
    var images = qns(doc, "graphic")
      .map(function (g) { return g.getAttribute("url"); })
      .filter(Boolean);
    // Provenance: distinguish the holding institution's own record (type="record"
    // or untyped) from a data aggregator/provider (type="provider", e.g. EFEO).
    var sourceUrl = "", provider = null, manifest = "";
    qns(doc, "ref").forEach(function (r) {
      var t = r.getAttribute("target") || "", typ = r.getAttribute("type") || "";
      if (!/^https?:\/\//.test(t)) return;
      if (typ === "iiif-manifest") { if (!manifest) manifest = t; }
      else if (typ === "provider") { if (!provider) provider = { url: t, label: txt(r) }; }
      else if (!sourceUrl) sourceUrl = t;
    });

    return {
      name: name, recordType: recordType, surrogateOf: surrogateOf,
      images: images, sourceUrl: sourceUrl, provider: provider, manifest: manifest,
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

  /* Pill shown on records loaded from a private collection. */
  function sourceBadge(rec) {
    if (!rec || rec.source !== "private") return "";
    var label = rec.collectionTitle || rec.collection || "private";
    return '<span class="catalog-badge-private" ' +
      'title="Private collection — only visible with your token">🔒 ' +
      esc(label) + '</span>';
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

    // Facsimile image(s) + IIIF viewer (zoom · page-turn · compare via Mirador)
    if ((rec.images && rec.images.length) || rec.manifest) {
      html += '<div class="hp-images">' +
        // With a manifest: an inline multi-page navigator (mounted in showPreview).
        // Without: the static facsimile image(s).
        (rec.manifest
          ? '<div class="rubview" data-manifest="' + esc(rec.manifest) +
            '" data-first="' + esc((rec.images && rec.images[0]) || "") + '"></div>'
          : (rec.images || []).map(function (u) {
              return '<a href="' + esc(u) + '" target="_blank" rel="noopener" title="open full image ↗">' +
                '<img class="hp-img" src="' + esc(u) + '" loading="lazy" alt="' + esc(rec.titleEn || "rubbing") + '"></a>';
            }).join("")) +
        (rec.manifest ? '<a class="hp-viewer btn small primary" href="viewer.html?manifest=' +
          encodeURIComponent(rec.manifest) + '" target="_blank" rel="noopener">🔍 Open in IIIF viewer — zoom · turn pages</a>' : "") +
        (rec.manifest ? '<button class="hp-compare btn small" type="button" data-manifest="' + esc(rec.manifest) + '">' +
          (compareHas(rec.manifest) ? "✓ In comparison" : "⊕ Add to comparison") + '</button>' : "") +
        (rec.sourceUrl ? '<a class="hp-source" href="' + esc(rec.sourceUrl) +
          '" target="_blank" rel="noopener">Source record ↗</a>' : "") +
      '</div>';
    }

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

    if (rec.recordType === "rubbing") {
      html += sec("Provenance", [
        row("Held at", rec.repository),
        rec.sourceUrl ? '<dt>Record</dt><dd><a href="' + esc(rec.sourceUrl) +
          '" target="_blank" rel="noopener">holding institution ↗</a></dd>' : "",
        rec.provider ? '<dt>Data via</dt><dd><a href="' + esc(rec.provider.url) +
          '" target="_blank" rel="noopener">' + esc(rec.provider.label) + ' ↗</a> ' +
          '<span class="rub-prov-flag">aggregator</span></dd>' : ""
      ]);
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

  /* Carry the record's origin as a write-target so the editor saves it back to
     where it came from (round-trip) — a private collection, or the public path —
     overriding any persisted "Save into" default. */
  function writeTargetFor(rec) {
    if (rec.source === "private" && window.EpiCollections) {
      var c = EpiCollections.getConfig();
      return { owner: c.owner, repo: c.repo, branch: c.branch,
               path: "collections/" + rec.collection + "/" };
    }
    return { owner: OWNER, repo: REPO, branch: BRANCH, path: "records/" };
  }

  function openInEditor(rec) {
    var state = recToState(rec);
    state._writeTarget = writeTargetFor(rec);
    sessionStorage.setItem("epiwen_preload", JSON.stringify(state));
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
    var state = recToRubbingState(rec);
    state._writeTarget = writeTargetFor(rec);
    sessionStorage.setItem("epiwen_preload_rubbing", JSON.stringify(state));
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

    var view = document.getElementById("cat-html-view");
    view.innerHTML = buildHtmlPreview(rec);
    document.getElementById("preview-out").textContent = rec.rawXml || "";
    currentXml = rec.rawXml || "";

    var rv = view.querySelector(".rubview");
    if (rv) mountRubbingViewer(rv);
    else if (_rubOSD) { try { _rubOSD.destroy(); } catch (e) {} _rubOSD = null; }

    var hc = view.querySelector(".hp-compare");
    if (hc) hc.addEventListener("click", function () {
      var m = hc.getAttribute("data-manifest");
      compareToggle(m);
      var on = compareHas(m);
      hc.textContent = on ? "✓ In comparison" : "⊕ Add to comparison";
      hc.classList.toggle("on", on);
    });

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
      sourceBadge(rec) +
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

    // the entry itself is selectable (replaces the old per-entry Preview button)
    monument.classList.add("selectable");
    monument.setAttribute("role", "button");
    monument.setAttribute("tabindex", "0");
    monument.addEventListener("click", function () { showPreview(rec, item); });
    monument.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showPreview(rec, item); }
    });

    var actions = document.createElement("div");
    actions.className = "catalog-actions";

    var copyBtn = document.createElement("button");
    copyBtn.type = "button"; copyBtn.className = "btn small";
    copyBtn.textContent = "Copy XML";
    copyBtn.addEventListener("click", function (e) { e.stopPropagation(); flashCopy(rec.rawXml, copyBtn); });

    var editBtn = document.createElement("button");
    editBtn.type = "button"; editBtn.className = "btn small primary";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", function (e) { e.stopPropagation(); openInEditor(rec); });

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

    appendFoldedRubbings(item, rec.name);
    return item;
  }

  // ---- rubbings folded under their object/inscription ----------------------
  function rubbingsFor(objName) {
    if (!objName) return [];
    return allRecords.filter(function (r) {
      return r.recordType === "rubbing" && r.surrogateOf === objName;
    });
  }
  function rubbingSourceLabel(rec) {
    if (rec.provider && rec.provider.label) return rec.provider.label.split("—")[0].trim();
    var rp = (rec.repository || "").toLowerCase();
    if (rp.indexOf("harvard") !== -1)  return "Harvard-Yenching";
    if (rp.indexOf("berkeley") !== -1) return "UC Berkeley";
    if (rp.indexOf("efeo") !== -1)     return "EFEO estampages";
    if (rp.indexOf("sinica") !== -1 || rp.indexOf("philology") !== -1) return "IHP";
    return rec.repository || "—";
  }
  // ---- inline multi-page rubbing viewer (reads the IIIF manifest) ----------
  var _manifestCache = {};
  var _osdPromise = null, _rubOSD = null;
  // Lazy-load OpenSeadragon (deep-zoom) from CDN only when a preview is opened.
  function ensureOSD() {
    if (window.OpenSeadragon) return Promise.resolve(window.OpenSeadragon);
    if (_osdPromise) return _osdPromise;
    _osdPromise = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/openseadragon@4.1.0/build/openseadragon/openseadragon.min.js";
      s.onload  = function () { window.OpenSeadragon ? resolve(window.OpenSeadragon) : reject(new Error("OSD missing")); };
      s.onerror = function () { _osdPromise = null; reject(new Error("OSD load failed")); };
      document.head.appendChild(s);
    });
    return _osdPromise;
  }
  function iiifLabel(l) {
    if (!l) return "";
    if (typeof l === "string") return l;
    if (Array.isArray(l)) return l.map(iiifLabel).join(" ");
    return Object.keys(l).map(function (k) { return [].concat(l[k]).join(" "); }).join(" ").trim();
  }
  function parseManifestPages(m) {
    var canvases = m.items ||
      (m.sequences && m.sequences[0] && m.sequences[0].canvases) || [];
    return canvases.map(function (cv) {
      var service = "", full = "", thumb = "";
      try {                                  // IIIF v3
        var body = cv.items[0].items[0].body;
        full = body.id || "";
        var svc = body.service; svc = Array.isArray(svc) ? svc[0] : svc;
        if (svc) service = svc.id || svc["@id"] || "";
      } catch (e) {}
      if (!service && !full && cv.images) {  // IIIF v2 fallback
        try {
          var res = cv.images[0].resource;
          full = res["@id"] || res.id || "";
          var s2 = res.service; s2 = Array.isArray(s2) ? s2[0] : s2;
          if (s2) service = s2["@id"] || s2.id || "";
        } catch (e2) {}
      }
      if (cv.thumbnail) {
        var t = Array.isArray(cv.thumbnail) ? cv.thumbnail[0] : cv.thumbnail;
        thumb = (t && (t.id || t["@id"])) || "";
      }
      return { label: iiifLabel(cv.label), service: service, full: full, thumb: thumb };
    }).filter(function (p) { return p.service || p.full; });
  }
  function pageImg(p, h) {
    return p.service ? (p.service + "/full/," + h + "/0/default.jpg") : p.full;
  }
  function fetchManifestPages(url) {
    if (_manifestCache[url]) return Promise.resolve(_manifestCache[url]);
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (m) {
      var pages = parseManifestPages(m);
      _manifestCache[url] = pages;
      return pages;
    });
  }
  // Strip-first viewer: only the thumbnail strip shows at first; clicking a
  // thumbnail opens a zoomable (OpenSeadragon) preview BELOW it, fit to window.
  function mountRubbingViewer(el) {
    var manifest = el.getAttribute("data-manifest");
    var first    = el.getAttribute("data-first") || "";
    var pages = first ? [{ service: "", full: first, thumb: first, label: "" }] : [];
    var idx = -1, fellBack = {};

    // Tear down any viewer left over from a previously-previewed record.
    if (_rubOSD) { try { _rubOSD.destroy(); } catch (e) {} _rubOSD = null; }

    el.innerHTML =
      '<div class="rubview-strip"><span class="rubview-loading">loading pages…</span></div>' +
      '<div class="rubview-preview" hidden>' +
        '<div class="rubview-toolbar">' +
          '<button class="rubview-prev btn small" type="button" title="previous page">◀</button>' +
          '<span class="rubview-count"></span>' +
          '<button class="rubview-next btn small" type="button" title="next page">▶</button>' +
          '<span class="rubview-zoom">' +
            '<button class="rubview-zout btn small" type="button" title="zoom out">－</button>' +
            '<button class="rubview-zin btn small"  type="button" title="zoom in">＋</button>' +
            '<button class="rubview-zfit btn small" type="button" title="fit to window">⤢</button>' +
          '</span>' +
        '</div>' +
        '<div class="rubview-osd"></div>' +
      '</div>';

    var strip   = el.querySelector(".rubview-strip");
    var preview = el.querySelector(".rubview-preview");
    var osdEl   = el.querySelector(".rubview-osd");
    var count   = el.querySelector(".rubview-count");

    function tileSourceFor(pg) {
      return pg.service ? (pg.service.replace(/\/+$/, "") + "/info.json")
                        : { type: "image", url: pg.full };
    }
    function zoom(f) { if (_rubOSD && _rubOSD.viewport) { _rubOSD.viewport.zoomBy(f); _rubOSD.viewport.applyConstraints(); } }

    function openPage(i) {
      if (i < 0 || i >= pages.length) return;
      idx = i;
      preview.hidden = false;                       // reveal the preview BELOW the strip
      count.textContent = (i + 1) + " / " + pages.length;
      var thumbs = strip.querySelectorAll(".rubview-thumb");
      for (var k = 0; k < thumbs.length; k++) thumbs[k].classList.toggle("on", k === i);
      if (thumbs[i]) thumbs[i].scrollIntoView({ block: "nearest", inline: "center" });

      var ts = tileSourceFor(pages[i]);
      ensureOSD().then(function (OSD) {
        if (_rubOSD && _rubOSD.element === osdEl) { _rubOSD.open(ts); return; }
        if (osdEl._creating) { osdEl._pending = ts; return; }   // guard rapid pre-load clicks
        osdEl._creating = true;
        _rubOSD = OSD({
          element: osdEl,
          prefixUrl: "https://cdn.jsdelivr.net/npm/openseadragon@4.1.0/build/openseadragon/images/",
          showNavigationControl: false,
          homeFillsViewer: false,                   // fit the whole image into the window
          visibilityRatio: 1,
          minZoomImageRatio: 0.9,
          gestureSettingsMouse: { clickToZoom: false }, // scroll = zoom, drag = pan
          tileSources: [ts]
        });
        _rubOSD.addHandler("open", function () {
          osdEl._creating = false;
          if (osdEl._pending) { var t = osdEl._pending; osdEl._pending = null; _rubOSD.open(t); }
        });
        _rubOSD.addHandler("open-failed", function () {   // tiled info.json blocked → plain image
          var pg = pages[idx];
          if (pg && pg.service && pg.full && !fellBack[idx]) {
            fellBack[idx] = true; _rubOSD.open({ type: "image", url: pg.full });
          }
        });
      }).catch(function () {                          // OSD CDN unreachable → static fit image
        osdEl.innerHTML = '<img class="rubview-img" src="' + esc(pageImg(pages[idx], 1200)) + '" alt="page">';
      });
    }

    el.querySelector(".rubview-prev").addEventListener("click", function () { openPage(idx - 1); });
    el.querySelector(".rubview-next").addEventListener("click", function () { openPage(idx + 1); });
    el.querySelector(".rubview-zin").addEventListener("click",  function () { zoom(1.5); });
    el.querySelector(".rubview-zout").addEventListener("click", function () { zoom(1 / 1.5); });
    el.querySelector(".rubview-zfit").addEventListener("click", function () { if (_rubOSD && _rubOSD.viewport) _rubOSD.viewport.goHome(); });

    function buildStrip() {
      strip.innerHTML = pages.map(function (pg, i) {
        var t = pg.thumb || pageImg(pg, 140);
        return '<img class="rubview-thumb" data-i="' + i + '" loading="lazy" src="' + esc(t) +
          '" alt="' + esc(pg.label || ("p" + (i + 1))) + '" title="' + esc(pg.label || ("page " + (i + 1))) + '">';
      }).join("");
      Array.prototype.forEach.call(strip.querySelectorAll(".rubview-thumb"), function (t) {
        t.addEventListener("click", function () { openPage(parseInt(t.getAttribute("data-i"), 10)); });
      });
    }

    fetchManifestPages(manifest).then(function (p) {
      if (p.length) { pages = p; buildStrip(); }
      else if (first) buildStrip();
      else strip.innerHTML = '<span class="rubview-loading">no pages found</span>';
    }).catch(function () {
      if (first) buildStrip();
      else strip.innerHTML = '<span class="rubview-loading">could not load pages</span>';
    });
  }

  // ---- side-by-side comparison basket (Mirador) ----------------------------
  function compareGet() {
    try { var a = JSON.parse(sessionStorage.getItem("epiwen_compare") || "[]"); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function compareSet(a) { sessionStorage.setItem("epiwen_compare", JSON.stringify(a)); renderCompareBar(); }
  function compareHas(m) { return compareGet().indexOf(m) !== -1; }
  function compareToggle(m) {
    var a = compareGet(), i = a.indexOf(m);
    if (i === -1) a.push(m); else a.splice(i, 1);
    compareSet(a);
  }
  function renderCompareBar() {
    var bar = document.getElementById("compare-bar");
    if (!bar) { bar = document.createElement("div"); bar.id = "compare-bar"; bar.className = "compare-bar"; document.body.appendChild(bar); }
    var a = compareGet();
    if (!a.length) { bar.style.display = "none"; return; }
    bar.style.display = "flex";
    var href = "viewer.html?" + a.map(function (m) { return "manifest=" + encodeURIComponent(m); }).join("&");
    bar.innerHTML =
      '<span class="compare-count">⊟ Comparison: ' + a.length + ' rubbing' + (a.length > 1 ? "s" : "") + '</span>' +
      '<a class="btn small primary" href="' + esc(href) + '" target="_blank" rel="noopener">Open side by side ↗</a>' +
      '<button class="btn small" id="compare-detach" type="button" title="Pop out into a separate window">⧉ Detach</button>' +
      '<button class="btn small" id="compare-save" type="button" title="Save this comparison to your favorites">★ Save</button>' +
      '<a class="btn small" href="favorites.html">Favorites</a>' +
      '<button class="btn small" id="compare-clear" type="button">clear</button>';
    bar.querySelector("#compare-clear").addEventListener("click", function () { compareSet([]); });
    bar.querySelector("#compare-detach").addEventListener("click", function () {
      if (window.EpiFavorites) EpiFavorites.detach(a);
    });
    bar.querySelector("#compare-save").addEventListener("click", function () {
      if (!window.EpiFavorites) return;
      var name = prompt("Name this comparison:", a.length + "-rubbing comparison");
      if (name === null) return;
      EpiFavorites.save(name, a);
      var b = bar.querySelector("#compare-save");
      if (b) { b.textContent = "★ Saved"; setTimeout(function () { b.textContent = "★ Save"; }, 1800); }
    });
  }

  function appendFoldedRubbings(item, objName) {
    var rubs = rubbingsFor(objName);
    if (!rubs.length) return;
    var head = document.createElement("div");
    head.className = "catalog-rubbings-head";
    head.appendChild(document.createTextNode("Rubbings (" + rubs.length + ")"));
    var withManifest = rubs.filter(function (r) { return r.manifest; });
    if (withManifest.length >= 2) {
      var cmp = document.createElement("a");
      cmp.className = "rub-compare-btn";
      cmp.textContent = "⊟ Compare " + withManifest.length + " side by side";
      cmp.href = "viewer.html?" + withManifest.map(function (r) {
        return "manifest=" + encodeURIComponent(r.manifest);
      }).join("&");
      cmp.target = "_blank"; cmp.rel = "noopener";
      cmp.addEventListener("click", function (e) { e.stopPropagation(); });
      head.appendChild(cmp);
    }
    item.appendChild(head);
    var ul = document.createElement("ul");
    ul.className = "catalog-rubbings";
    rubs.forEach(function (rub) {
      var li = document.createElement("li");
      li.className = "catalog-rubbing";
      var hasImg = rub.images && rub.images.length;
      li.innerHTML =
        '<span class="rub-icon" title="' + (hasImg ? "has image" : "metadata only") + '">' +
          (hasImg ? "🖼" : "🔎") + '</span>' +
        '<span class="rub-title">' + esc(rub.titleEn || rub.name) + '</span>' +
        '<span class="rub-src">' + esc(rubbingSourceLabel(rub)) +
          (rub.provider ? ' <span class="rub-prov-flag">via aggregator</span>' : '') + '</span>' +
        (rub.manifest ? '<button class="rub-cmp' + (compareHas(rub.manifest) ? " on" : "") +
          '" type="button" title="add to side-by-side comparison">' +
          (compareHas(rub.manifest) ? "✓" : "⊕") + '</button>' : '');
      li.addEventListener("click", function (e) { e.stopPropagation(); showPreview(rub, item); });
      if (rub.manifest) {
        var cb = li.querySelector(".rub-cmp");
        cb.addEventListener("click", function (e) {
          e.stopPropagation();
          compareToggle(rub.manifest);
          cb.classList.toggle("on", compareHas(rub.manifest));
          cb.textContent = compareHas(rub.manifest) ? "✓" : "⊕";
        });
      }
      ul.appendChild(li);
    });
    item.appendChild(ul);
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
      sourceBadge(rec) +
      titleHtml +
      '<span class="catalog-date">' + esc(label) +
      ' · inscribed on <a href="catalog.html?tab=objects&amp;file=' + encodeURIComponent(rec.name) +
      '" class="catalog-obj-link"><code class="catalog-filename">' + esc(rec.name) + '</code></a>' +
      (rec.dateText ? ' · ' + esc(rec.dateText) : '') +
      '</span>';
    var objLink = info.querySelector(".catalog-obj-link");
    if (objLink) {
      objLink.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        history.pushState({ tab: "objects", file: rec.name }, "", objLink.href);
        renderByTab("objects", rec.name);
      });
    }

    // entry itself selectable (replaces the old Preview button)
    row.classList.add("selectable");
    row.setAttribute("role", "button"); row.setAttribute("tabindex", "0");
    row.addEventListener("click", function () { showPreview(rec, item); });
    row.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showPreview(rec, item); }
    });
    row.appendChild(info);
    item.appendChild(row);
    appendFoldedRubbings(item, rec.name);
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
      sourceBadge(rec) +
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

    row.classList.add("selectable");
    row.setAttribute("role", "button"); row.setAttribute("tabindex", "0");
    row.addEventListener("click", function () { showPreview(rec, item); });
    row.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showPreview(rec, item); }
    });

    var actions = document.createElement("div");
    actions.className = "catalog-actions";

    var copyBtn = document.createElement("button");
    copyBtn.type = "button"; copyBtn.className = "btn small";
    copyBtn.textContent = "Copy XML";
    copyBtn.addEventListener("click", function (e) { e.stopPropagation(); flashCopy(rec.rawXml, copyBtn); });

    var editBtn = document.createElement("button");
    editBtn.type = "button"; editBtn.className = "btn small primary";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", function (e) { e.stopPropagation(); openInRubbingEditor(rec); });

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

  function applySourceFilter(records) {
    if (sourceFilter === "all")     return records;
    if (sourceFilter === "public")  return records.filter(function (r) { return r.source !== "private"; });
    if (sourceFilter === "private") return records.filter(function (r) { return r.source === "private"; });
    if (sourceFilter.indexOf("col:") === 0) {
      var id = sourceFilter.slice(4);
      return records.filter(function (r) { return r.collection === id; });
    }
    return records;
  }

  function applyMineFilter(records) {
    if (!showMine || !currentUsername) return records;
    return records.filter(function (r) { return r.editor === currentUsername; });
  }

  /* The site an inscription belongs to (origPlace, else the repository minus its "(in situ …)" tail). */
  function recSite(rec) {
    return (rec.origPlace || rec.repository || "").replace(/\s*[\(（][^)）]*[\)）]\s*$/, "").trim();
  }
  function applySiteFilter(records) {
    if (siteFilter === "all") return records;
    return records.filter(function (r) { return recSite(r) === siteFilter; });
  }

  /* Build the "filter by site" <select> (facet over the currently sourced records). */
  function siteBar(records) {
    var base = applyMineFilter(applySourceFilter(records));
    var counts = {};
    base.forEach(function (r) { var s = recSite(r); if (s) counts[s] = (counts[s] || 0) + 1; });
    var sites = Object.keys(counts).sort();
    if (siteFilter !== "all" && sites.indexOf(siteFilter) === -1) siteFilter = "all";
    if (sites.length < 2) return "";
    return '<div class="rub-sourcebar">Site 遗址: ' +
      '<select id="site-filter" class="catalog-searchbox" style="max-width:280px">' +
      '<option value="all">All sites (' + base.length + ')</option>' +
      sites.map(function (s) {
        return '<option value="' + esc(s) + '"' + (s === siteFilter ? " selected" : "") +
          '>' + esc(s) + ' (' + counts[s] + ')</option>';
      }).join("") + '</select></div>';
  }
  function wireSiteFilter() {
    var sel = document.getElementById("site-filter");
    if (sel) sel.addEventListener("change", function () { siteFilter = this.value; renderByTab(currentTab); });
  }

  /* Compose source + mine + site filters. */
  function applyFilters(records) {
    return applySiteFilter(applyMineFilter(applySourceFilter(records)));
  }

  function updateMineLabel(filtered, total) {
    var lbl = document.getElementById("mine-label");
    if (!lbl) return;
    var parts = [];
    if (sourceFilter !== "all") {
      var srcName = sourceFilter === "public" ? "public"
        : sourceFilter === "private" ? "private"
        : "“" + sourceFilter.slice(4) + "”";
      parts.push(srcName);
    }
    if (showMine && currentUsername) parts.push("@" + currentUsername);
    lbl.textContent = parts.length
      ? (filtered + " of " + total + " record" + (total === 1 ? "" : "s") + " · " + parts.join(" · "))
      : "";
  }

  function renderObjectsCatalog(records, file) {
    var list = document.getElementById("catalog-list");
    var filtered = applyFilters(records);
    updateMineLabel(filtered.length, records.length);
    var bar = siteBar(records);
    if (!filtered.length) {
      list.innerHTML = bar + '<div class="catalog-empty">' +
        (siteFilter !== "all" ? 'No records at “' + esc(siteFilter) + '”.'
          : showMine && currentUsername
          ? 'No records by @' + esc(currentUsername) + ' yet. <a href="editor.html">Add the first →</a>'
          : 'No records yet. <a href="editor.html">Add the first inscription →</a>') +
        '</div>';
      wireSiteFilter();
      return;
    }
    list.innerHTML = bar;
    filtered.forEach(function (rec) {
      var item = buildItem(rec);
      list.appendChild(item);
      if (file && rec.name === file) {
        setTimeout(function () {
          item.scrollIntoView({ behavior: "smooth", block: "nearest" });
          showPreview(rec, item);
        }, 0);
      }
    });
    wireSiteFilter();
  }

  function renderInscriptionsCatalog() {
    var list = document.getElementById("catalog-list");
    list.innerHTML = "";

    var nonRubbing = allRecords.filter(function (r) { return r.recordType !== "rubbing"; });
    var totalParts = nonRubbing.reduce(function (n, r) { return n + r.parts.length; }, 0);
    var base = applyFilters(nonRubbing);
    var items = [];
    base.forEach(function (rec) {
      rec.parts.forEach(function (part, pIdx) {
        items.push({ rec: rec, part: part, pIdx: pIdx });
      });
    });

    updateMineLabel(items.length, totalParts);

    var bar = siteBar(nonRubbing);
    if (!items.length) {
      list.innerHTML = bar + '<div class="catalog-empty">' +
        (siteFilter !== "all" ? 'No inscriptions at “' + esc(siteFilter) + '”.' : 'No inscriptions found.') + '</div>';
      wireSiteFilter();
      return;
    }
    list.innerHTML = bar;
    items.forEach(function (it) {
      list.appendChild(buildInscriptionItem(it.rec, it.part, it.pIdx));
    });
    wireSiteFilter();
  }

  function renderRubbingsCatalog(records) {
    var list = document.getElementById("catalog-list");
    var filtered = applyFilters(records);

    // Dedicated rubbing-collection / source selector
    var counts = {};
    filtered.forEach(function (r) { var s = rubbingSourceLabel(r); counts[s] = (counts[s] || 0) + 1; });
    var sources = Object.keys(counts).sort();
    if (rubSourceFilter !== "all" && sources.indexOf(rubSourceFilter) === -1) rubSourceFilter = "all";
    var shown = rubSourceFilter === "all" ? filtered
      : filtered.filter(function (r) { return rubbingSourceLabel(r) === rubSourceFilter; });
    updateMineLabel(shown.length, records.length);

    var selHtml = '';
    if (sources.length > 1) {
      selHtml = '<div class="rub-sourcebar">Rubbing collection: ' +
        '<select id="rub-source" class="catalog-searchbox" style="max-width:240px">' +
        '<option value="all">All collections (' + filtered.length + ')</option>' +
        sources.map(function (s) {
          return '<option value="' + esc(s) + '"' + (s === rubSourceFilter ? " selected" : "") +
            '>' + esc(s) + ' (' + counts[s] + ')</option>';
        }).join("") + '</select></div>';
    }

    if (!shown.length) {
      list.innerHTML = selHtml + '<div class="catalog-empty">' +
        (showMine && currentUsername
          ? 'No rubbing records by @' + esc(currentUsername) + ' yet. <a href="rubbing.html">Add the first →</a>'
          : 'No rubbings in this view.') +
        '</div>';
      wireRubSource();
      return;
    }
    var viewBar = '<div class="rub-viewtoggle">View: ' +
      '<button type="button" class="btn small' + (rubViewMode === "flat" ? " primary" : "") + '" data-rubview="flat">Every rubbing</button> ' +
      '<button type="button" class="btn small' + (rubViewMode === "compact" ? " primary" : "") + '" data-rubview="compact">Compact (by inscription)</button></div>';
    list.innerHTML = selHtml + viewBar;
    if (rubViewMode === "compact") {
      // draw the different collections together under the same inscription
      var groups = {};
      shown.forEach(function (r) {
        var k = r.surrogateOf || "— unlinked";
        (groups[k] = groups[k] || []).push(r);
      });
      Object.keys(groups).sort().forEach(function (k) {
        var g = document.createElement("div"); g.className = "catalog-item";
        var head = document.createElement("div"); head.className = "catalog-rubbings-head";
        head.appendChild(document.createTextNode(
          (k === "— unlinked" ? "Unlinked rubbings" : k) + " (" + groups[k].length + ")"));
        // draw the collections together for comparison: one link opens them all side by side
        var withManifest = groups[k].filter(function (r) { return r.manifest; });
        if (k !== "— unlinked" && withManifest.length >= 2) {
          var cmp = document.createElement("a");
          cmp.className = "rub-compare-btn";
          cmp.textContent = "⊟ Compare " + withManifest.length + " side by side";
          cmp.href = "viewer.html?" + withManifest.map(function (r) {
            return "manifest=" + encodeURIComponent(r.manifest);
          }).join("&");
          cmp.target = "_blank"; cmp.rel = "noopener";
          head.appendChild(cmp);
        }
        g.appendChild(head);
        var ul = document.createElement("ul"); ul.className = "catalog-rubbings";
        groups[k].forEach(function (rub) {
          var li = document.createElement("li"); li.className = "catalog-rubbing selectable";
          var hasImg = rub.images && rub.images.length;
          li.innerHTML = '<span class="rub-icon">' + (hasImg ? "🖼" : "🔎") + '</span>' +
            '<span class="rub-title">' + esc(rub.titleEn || rub.name) + '</span>' +
            '<span class="rub-src">' + esc(rubbingSourceLabel(rub)) + '</span>' +
            (rub.manifest ? '<button class="rub-cmp' + (compareHas(rub.manifest) ? " on" : "") +
              '" type="button" title="add to side-by-side comparison">' +
              (compareHas(rub.manifest) ? "✓" : "⊕") + '</button>' : '');
          li.addEventListener("click", function () { showPreview(rub, g); });
          if (rub.manifest) {
            var cb = li.querySelector(".rub-cmp");
            cb.addEventListener("click", function (e) {
              e.stopPropagation();
              compareToggle(rub.manifest);
              cb.classList.toggle("on", compareHas(rub.manifest));
              cb.textContent = compareHas(rub.manifest) ? "✓" : "⊕";
            });
          }
          ul.appendChild(li);
        });
        g.appendChild(ul); list.appendChild(g);
      });
    } else {
      shown.forEach(function (rec) { list.appendChild(buildRubbingItem(rec)); });
    }
    wireRubSource(); wireRubView();
  }

  function wireRubView() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-rubview]"), function (b) {
      b.addEventListener("click", function () { rubViewMode = this.dataset.rubview; renderByTab("rubbings"); });
    });
  }

  function wireRubSource() {
    var sel = document.getElementById("rub-source");
    if (sel) sel.addEventListener("change", function () {
      rubSourceFilter = this.value;
      renderByTab("rubbings");
    });
  }

  // ---- search --------------------------------------------------------------
  function filterCatalog(term) {
    var q = term.toLowerCase();
    Array.prototype.forEach.call(document.querySelectorAll(".catalog-item"), function (el) {
      el.style.display = (!q || el.dataset.idx.indexOf(q) !== -1) ? "" : "none";
    });
  }

  // ---- private collections -------------------------------------------------
  /* Fetch enabled private packages (raw XML), parse here, tag, merge, re-render.
     Additive and idempotent — safe to call again after the manager changes the
     enabled set. */
  function loadPrivate() {
    if (!window.EpiCollections) return;
    // The shared collection auto-loads alongside any enabled private collections.
    var jobs = [ EpiCollections.loadEnabled() ];
    if (EpiCollections.loadShared) jobs.unshift(EpiCollections.loadShared());
    Promise.all(jobs).then(function (results) {
      var raw = [];
      results.forEach(function (res) { raw = raw.concat((res && res.records) || []); });
      privateRecords = raw.map(function (r) {
        var rec = parseRecord(r.name, r.xml);
        rec.source          = "private";
        rec.collection      = r.collection;
        rec.collectionTitle = r.collectionTitle || r.collection;
        return rec;
      });
      privateRecords.sort(function (a, b) { return a.name.localeCompare(b.name); });
      rebuildAll();
      updateSourceFilterOptions();
      renderByTab(currentTab);
    });
  }

  /* Rebuild the source-filter <select> options from the loaded private records. */
  function updateSourceFilterOptions() {
    var sel = document.getElementById("source-filter");
    if (!sel) return;
    if (!privateRecords.length) {
      sel.style.display = "none";
      if (sourceFilter !== "all") { sourceFilter = "all"; }
      return;
    }
    var cols = {};
    privateRecords.forEach(function (r) { cols[r.collection] = r.collectionTitle || r.collection; });
    var opts = '<option value="all">All sources</option>' +
               '<option value="public">Public only</option>' +
               '<option value="private">Private only</option>';
    Object.keys(cols).sort().forEach(function (id) {
      opts += '<option value="col:' + esc(id) + '">🔒 ' + esc(cols[id]) + '</option>';
    });
    sel.innerHTML = opts;
    // keep current selection if still valid, else reset
    var valid = ["all", "public", "private"].concat(Object.keys(cols).map(function (id) { return "col:" + id; }));
    if (valid.indexOf(sourceFilter) === -1) sourceFilter = "all";
    sel.value = sourceFilter;
    sel.style.display = "";
  }

  // ---- init ----------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", function () {

    renderCompareBar();   // restore a pending side-by-side comparison basket

    /* Mine filter + Collections — only shown when a GitHub identity is stored */
    var mineBar = document.getElementById("mine-bar");
    var mineBtn = document.getElementById("btn-mine");
    if (mineBar && mineBtn && currentUsername) {
      mineBar.style.display = "flex";
      mineBtn.addEventListener("click", function () {
        showMine = !showMine;
        mineBtn.dataset.active = showMine ? "true" : "false";
        mineBtn.textContent = showMine ? "Show all" : "Show mine";
        mineBtn.classList.toggle("primary", showMine);
        renderByTab(currentTab);
      });

      if (window.EpiCollections) {
        EpiCollections.mountBar(document.getElementById("collections-bar"));
      }

      var sourceSel = document.getElementById("source-filter");
      if (sourceSel) {
        sourceSel.addEventListener("change", function () {
          sourceFilter = this.value;
          renderByTab(currentTab);
        });
      }

      // Re-load private records whenever the manager changes the enabled set
      if (window.EpiCollections) {
        EpiCollections.onChange(function () { loadPrivate(); });
      }
    }

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

    // Load records from the data backend (epiwen-data, via token)
    EpiData.list("records")
      .then(function (files) {
        if (!files) { renderByTab(currentTab, fileParam); loadPrivate(); return; }

        var xmlFiles = files
          .filter(function (f) { return /\.xml$/i.test(f.name); })
          .sort(function (a, b) { return a.name.localeCompare(b.name); });

        if (!xmlFiles.length) { renderByTab(currentTab, fileParam); loadPrivate(); return; }

        var records = [], remaining = xmlFiles.length;
        function done() {
          records.sort(function (a, b) { return a.name.localeCompare(b.name); });
          records.forEach(function (r) { r.source = "public"; });
          publicRecords = records;
          rebuildAll();
          renderByTab(currentTab, fileParam);
          loadPrivate();   // additive — merges private records when they arrive
        }
        xmlFiles.forEach(function (f) {
          // Use locally-cached fresh XML if the user just saved this file from the editor;
          // otherwise read it from the data backend via the Contents API + token.
          var fresh = sessionStorage.getItem("epiwen_fresh:" + f.name);
          var fetchPromise = fresh ? Promise.resolve(fresh) : EpiData.text("records/" + f.name);
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
        loadPrivate();   // private collections may still be reachable
      });
  });
})();
