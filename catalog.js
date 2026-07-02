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
  var backendUnreadable = false, backendErrorDetail = "";
  var currentXml   = "";
  var selectedItem = null;
  var currentTab   = "objects";
  var showMine     = false;
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

    // Site/place records use the exist-db catalog schema (<c:object type="site">),
    // not TEI. They belong on the Sites page, so tag them recordType "site" and
    // keep them out of the Objects / Inscriptions / Rubbings tabs.
    var rootEl = doc.documentElement;
    if (rootEl && rootEl.getAttribute("type") === "site") {
      var siteEn = "", siteZh = "";
      Array.prototype.forEach.call(rootEl.getElementsByTagName("*"), function (el) {
        if ((el.localName || el.nodeName.replace(/^.*:/, "")) !== "title") return;
        var lang = el.getAttribute("lang") || "";
        if (lang.indexOf("zh") === 0) { if (!siteZh) siteZh = el.textContent.trim(); }
        else if (!siteEn) siteEn = el.textContent.trim();
      });
      return { name: name, recordType: "site", surrogateOf: "",
               titleEn: siteEn || name, titleZh: siteZh, when: "", dateText: "", parts: [], rawXml: xmlText };
    }

    // EpiDoc-CN profile files (the three-level model, epidoc-cn.js): the taxonomy
    // registry is data for the editors, not a catalog row; TEI sites and object
    // files are typed so "Edit" routes to the right editor. All three carry
    // _cnKind; sites/objects list in the Objects tab alongside their inscriptions.
    var cnKind = window.EpiDocCN ? EpiDocCN.detect(doc) : null;
    if (cnKind === "taxonomy" || cnKind === "sitedesc") {
      // neither is a catalog row: the taxonomy registry is editor data; a
      // site-description doc is a site's prose (shown in the Sites detail pane).
      return { name: name, recordType: cnKind, surrogateOf: "", _cnKind: cnKind,
               titleEn: cnKind === "sitedesc" ? "Site description" : "EpiDoc-CN taxonomies",
               titleZh: "", when: "", dateText: "", parts: [], rawXml: xmlText };
    }
    if (cnKind === "site" || cnKind === "objectfile") {
      var cnEn = "", cnZh = "";
      qns(doc, "title").forEach(function (t) {
        if (!t.parentNode || t.parentNode.localName !== "titleStmt") return;
        var lg = t.getAttribute("xml:lang") || "";
        if (lg.indexOf("zh") === 0) { if (!cnZh) cnZh = t.textContent.trim(); }
        else if (!cnEn) cnEn = t.textContent.trim();
      });
      var cnDateEl = qns(doc, "origDate")[0] || null;
      // IIIF manifest note (e.g. ASCDC imports) → drives the inline strip viewer
      // + "Open in IIIF viewer" exactly like rubbing records.
      var cnManifest = "";
      qns(doc, "note").forEach(function (nEl) {
        if (nEl.getAttribute("type") === "iiif-manifest" && !cnManifest) {
          var u = (nEl.textContent || "").trim().match(/https?:\/\/\S+/);
          if (u) cnManifest = u[0];
        }
      });
      return { name: name, recordType: cnKind === "site" ? "site" : "object", surrogateOf: "", _cnKind: cnKind,
               titleEn: cnEn || name, titleZh: cnZh,
               objectType: cnKind === "site" ? "site 地點" : "object 器物",
               region: txt(qns(doc, "region")[0] || null),
               when: cnDateEl ? (cnDateEl.getAttribute("when") || cnDateEl.getAttribute("notBefore") || "") : "",
               dateText: txt(cnDateEl), summary: txt(qns(doc, "summary")[0] || null),
               manifest: cnManifest, images: [],
               parts: [], rawXml: xmlText };
    }

    // Record type (object vs rubbing vs EpiDoc-CN inscription)
    var msDescEl   = doc.getElementsByTagNameNS(NS, "msDesc")[0];
    var msDescType = msDescEl ? (msDescEl.getAttribute("type") || "") : "";
    var _cnKind = cnKind;                    // "inscription" for new-model msDesc files
    var recordType = msDescType === "rubbing" ? "rubbing"
      : (cnKind === "inscription" ? "inscription" : "object");
    var bearer = (cnKind === "inscription" && msDescEl)   // the object file it is inscribed on
      ? (msDescEl.getAttribute("corresp") || "").split(/\s+/)[0].split("#")[0] : "";

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
    var titleZh = txt(stmtTitles.find(function (t) {
      return (t.getAttribute("xml:lang") || "").indexOf("zh") === 0;   // zh-Hant (legacy) or zh (EpiDoc-CN)
    }));
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
      name: name, recordType: recordType, surrogateOf: surrogateOf, _cnKind: _cnKind, bearer: bearer,
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

  // A lightweight record built from a package's records-index.json entry. Carries
  // only the fields the list/filter/search need; the full record (all fields +
  // rawXml) is loaded lazily by ensureFullRecord() when the record is opened.
  function indexRecord(r) {
    return {
      name: r.name, recordType: r.record_type || "object",
      surrogateOf: r.surrogate_of || "", editor: r.editor || "",
      titleEn: r.title_en || "", titleZh: r.title_zh || "",
      when: r.when || "", dateText: r.date_text || "",
      region: r.region || "", settlement: r.settlement || "",
      repository: r.repository || "", origPlace: r.orig_place || "",
      provider: r.provider_label ? { label: r.provider_label } : null,
      manifest: r.manifest || "", images: [],
      parts: (r.parts || []).map(function (p) {
        return { n: p.n || "", head: p.head || "", subtype: p.subtype || "",
                 sutra: p.sutra || "", sutraEn: p.sutra_en || "", lang: p.lang || "",
                 cbeta: "", taisho: "", editionText: "", translationText: "" };
      }),
      rawXml: "", _lazy: true, _path: r.file || r.name,
      shared: !!r.shared, _cnKind: r.cn_kind || "", bearer: r.bearer || ""
    };
  }

  // Ensure a record has its full parsed fields + rawXml. Index records load only
  // list metadata; the first time one is previewed/edited/copied we fetch its XML
  // (one request) and re-parse it in place. Resolves with the (now full) record.
  function ensureFullRecord(rec) {
    if (!rec || !rec._lazy || rec.rawXml) return Promise.resolve(rec);
    if (!window.EpiCollections || !EpiCollections.fetchRecordXml)
      return Promise.reject(new Error("collections unavailable"));
    return EpiCollections.fetchRecordXml(rec.collection, encodeURIComponent(rec._path || rec.name))
      .then(function (xml) {
        var full = parseRecord(rec.name, xml);
        Object.keys(full).forEach(function (k) { rec[k] = full[k]; });
        rec._lazy = false;
        return rec;
      });
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
    if (rec.shared)                       // shared public corpus — loads for everyone
      return '<span class="catalog-badge-private" ' +
        'title="Shared public corpus — visible to everyone">🌐 ' + esc(label) + '</span>';
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
  // Save target = the directory that holds the record's file (the editor appends
  // the filename). Derived from its actual location so save/delete hit the right
  // repo: the app repo for the default corpus, epiwen-public for the shared
  // corpus, the configured repo for private collections.
  function writeTargetFor(rec) {
    var loc = recordLocation(rec);
    if (loc) return { owner: loc.owner, repo: loc.repo, branch: loc.branch,
                      path: loc.path.replace(/[^/]+$/, "") };
    return { owner: OWNER, repo: REPO, branch: BRANCH, path: "records/" };
  }

  // Deletable in place wherever we can resolve the file's location.
  function canDeleteInPlace(rec) { return !!recordLocation(rec); }

  function openInEditor(rec) {
    // EpiDoc-CN files route to their tier's editor with the raw XML (the editors
    // parse it losslessly via epidoc-cn.js); legacy records keep the flat state.
    if (rec._cnKind === "objectfile") {
      sessionStorage.setItem("epiwen_preload_object", JSON.stringify({
        rawXml: rec.rawXml, filename: rec.name,
        _writeTarget: writeTargetFor(rec), _canDelete: canDeleteInPlace(rec) }));
      window.location.href = "object-editor.html";
      return;
    }
    if (rec._cnKind === "site") {
      sessionStorage.setItem("epiwen_preload_site_tei", JSON.stringify({
        rawXml: rec.rawXml, filename: rec.name, _writeTarget: writeTargetFor(rec) }));
      window.location.href = "site-editor.html";
      return;
    }
    var state = recToState(rec);
    state.rawXml       = rec.rawXml || "";     // new-model inscriptions parse this directly
    state._writeTarget = writeTargetFor(rec);
    state._canDelete   = canDeleteInPlace(rec);
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
    state._canDelete   = canDeleteInPlace(rec);
    sessionStorage.setItem("epiwen_preload_rubbing", JSON.stringify(state));
    window.location.href = "rubbing.html";
  }

  // ---- preview pane --------------------------------------------------------
  function toast(msg, isErr) {
    var t = document.getElementById("toast");
    if (!t) { if (isErr) alert(msg); return; }
    t.textContent = msg; t.className = "show" + (isErr ? " toast-error" : "");
    setTimeout(function () { t.className = ""; }, isErr ? 6000 : 3000);
  }

  // Where a record's file lives (repo + path) — for delete. Records come from
  // the shared corpus (epiwen-public) or an enabled collection (configured repo).
  function recordLocation(rec) {
    if (!rec || !rec.name || !window.EpiCollections) return null;
    var file = rec._path || rec.name;
    var SH = EpiCollections.SHARED, DC = EpiCollections.DEFAULT_CORPUS;
    // Default corpus: lives in the app repo at <_repoDir><name> (e.g.
    // corpus/objects/SNS_stele.xml). Needs _repoDir to be located.
    if (rec.collection && DC && rec.collection === DC.id)
      return rec._repoDir
        ? { owner: DC.owner, repo: DC.repo, branch: DC.branch, path: rec._repoDir + rec.name }
        : null;
    var shp = rec.collection && EpiCollections.sharedPkg ? EpiCollections.sharedPkg(rec.collection) : null;
    if (shp || (rec.collection && SH && rec.collection === SH.id)) {
      var s = shp || SH;
      return { owner: s.owner, repo: s.repo, branch: s.branch, path: "collections/" + s.id + "/" + file };
    }
    if (rec.collection) {
      var c = EpiCollections.getConfig();
      return { owner: c.owner, repo: c.repo, branch: c.branch, path: "collections/" + rec.collection + "/" + file };
    }
    return null;
  }

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

  function deleteRecord(rec) {
    var loc = recordLocation(rec);
    if (!loc) { toast("Can’t locate this record’s file.", true); return; }
    if (!EpiCollections.deleteFile) { toast("Delete unavailable.", true); return; }
    askDelete().then(function (ok) {
      if (!ok) return;
      var btn = document.getElementById("preview-delete");
      if (btn) { btn.disabled = true; btn.textContent = "Deleting…"; }
      EpiCollections.deleteFile(loc.owner, loc.repo, loc.branch, loc.path, "Delete " + rec.name + " via Epiwen")
        .then(function () {
          // Keep the records index current (no-op for un-indexed packages).
          if (rec.collection && EpiCollections.recordsIndexRemove)
            return EpiCollections.recordsIndexRemove(rec.collection, rec._path || rec.name).catch(function () {});
        })
        .then(function () {
          privateRecords = privateRecords.filter(function (r) { return r !== rec; });
          publicRecords  = publicRecords.filter(function (r) { return r !== rec; });
          _insIndexCache = null;
          rebuildAll(); clearPreview(); renderByTab(currentTab);
          toast("Deleted " + rec.name);
        })
        .catch(function (e) {
          var m = e && e.message || "error";
          toast("Delete failed: " + m + (/403|forbidden|permission/i.test(m) ? " — token needs write access to " + loc.repo : ""), true);
        })
        .then(function () { if (btn) { btn.disabled = false; btn.textContent = "🗑 Delete"; } });
    });
  }

  function clearPreview() {
    if (selectedItem) selectedItem.classList.remove("selected");
    selectedItem = null;
    document.getElementById("preview-title").textContent = "Select a record to preview";
    document.getElementById("preview-copy").style.display = "none";
    var _pd = document.getElementById("preview-delete"); if (_pd) _pd.style.display = "none";
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
    var pd = document.getElementById("preview-delete");
    if (pd) { pd.style.display = recordLocation(rec) ? "" : "none"; pd.onclick = function () { deleteRecord(rec); }; }

    var view = document.getElementById("cat-html-view");

    // Index records carry no XML until opened — fetch + parse on first preview.
    if (rec._lazy && !rec.rawXml) {
      view.innerHTML = '<div class="catalog-loading">Loading record…</div>';
      document.getElementById("preview-out").textContent = "";
      currentXml = "";
      setCatView("html");
      ensureFullRecord(rec)
        .then(function () { if (selectedItem === item) renderPreviewBody(rec, view); })
        .catch(function (e) {
          if (selectedItem === item)
            view.innerHTML = '<div class="catalog-empty">Could not load record: ' + esc(e.message) + '</div>';
        });
      return;
    }
    renderPreviewBody(rec, view);
  }

  function renderPreviewBody(rec, view) {
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

  // ---- inscription (textpart) preview --------------------------------------
  // Extract just this textpart's XML — its <div type="textpart" n="…"> plus the
  // matching <div type="translation" n="…"> — instead of the whole object.
  function partXml(rec, part) {
    if (!rec.rawXml) return "";
    var doc = new DOMParser().parseFromString(rec.rawXml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) return rec.rawXml;
    var ser = new XMLSerializer();
    var tp = null, tr = null;
    qns(doc, "div").forEach(function (d) {
      var type = d.getAttribute("type"), n = d.getAttribute("n") || "";
      if (type === "textpart" && n === part.n) tp = tp || d;
      else if (type === "translation" && n === part.n) tr = tr || d;
    });
    if (!tp) {   // single-text record (no textpart divs): whole edition + translation
      qns(doc, "div").forEach(function (d) {
        var type = d.getAttribute("type");
        if (type === "edition") tp = tp || d;
        else if (type === "translation") tr = tr || d;
      });
    }
    var out = [];
    if (tp) out.push(ser.serializeToString(tp));
    if (tr) out.push(ser.serializeToString(tr));
    return out.join("\n\n") || rec.rawXml;
  }

  function buildInscriptionPreview(rec, part, pIdx) {
    function row(label, val) { return (val || val === 0) ? "<dt>" + esc(label) + "</dt><dd>" + esc(String(val)) + "</dd>" : ""; }
    var label   = part.head || part.subtype || ("Text " + (pIdx + 1));
    var objHref = "catalog.html?tab=objects&file=" + encodeURIComponent(rec.name);
    var html = '<div class="hp-preview">';
    html += '<div class="hp-partof">Part of <code class="catalog-filename">' + esc(rec.name) + '</code>' +
            ' — <a class="hp-objlink" href="' + esc(objHref) + '">open the object record →</a></div>';
    var idRows = [
      row("Section", label),
      row("Text", part.sutra),
      row("Text (EN)", part.sutraEn),
      row("CBETA", part.cbeta),
      row("Language", part.lang),
      row("On object", rec.titleEn || rec.titleZh),
      row("Date", rec.dateText)
    ].join("");
    if (idRows) html += '<section class="hp-section"><h4 class="hp-st">Inscription</h4><dl class="hp-dl">' + idRows + '</dl></section>';
    if (part.editionText)
      html += '<section class="hp-section"><h4 class="hp-st">Transcription</h4><pre class="hp-text">' + esc(part.editionText) + '</pre></section>';
    if (part.translationText)
      html += '<section class="hp-section"><h4 class="hp-st">Translation</h4><p class="hp-trans">' + esc(part.translationText) + '</p></section>';
    html += '</div>';
    return html;
  }

  // The catalog "open the object record →" link inside an inscription preview.
  function wireObjLink(view, rec) {
    var a = view.querySelector(".hp-objlink");
    if (a) a.addEventListener("click", function (e) {
      e.preventDefault();
      history.pushState({ tab: "objects", file: rec.name }, "", a.href);
      renderByTab("objects", rec.name);
    });
  }

  function showInscriptionPreview(rec, part, pIdx, item) {
    if (selectedItem) selectedItem.classList.remove("selected");
    selectedItem = item;
    if (item) item.classList.add("selected");

    var label = part.head || part.subtype || ("Text " + (pIdx + 1));
    document.getElementById("preview-title").textContent = label + " · " + rec.name;
    document.getElementById("preview-copy").style.display = "";
    document.getElementById("cat-view-toggle").style.display = "";
    var pd = document.getElementById("preview-delete");
    if (pd) pd.style.display = "none";   // a single inscription isn't independently deletable

    var view = document.getElementById("cat-html-view");
    function render() {
      // Re-resolve the part from the (now full) record so we get edition/translation text.
      var p = (rec.parts || []).filter(function (x) { return x.n === part.n; })[0] || part;
      view.innerHTML = buildInscriptionPreview(rec, p, pIdx);
      var xml = partXml(rec, p);
      document.getElementById("preview-out").textContent = xml;
      currentXml = xml;
      wireObjLink(view, rec);
      setCatView("html");
    }

    if (rec._lazy && !rec.rawXml) {
      view.innerHTML = '<div class="catalog-loading">Loading inscription…</div>';
      document.getElementById("preview-out").textContent = "";
      currentXml = "";
      setCatView("html");
      ensureFullRecord(rec)
        .then(function () { if (selectedItem === item) render(); })
        .catch(function (e) {
          if (selectedItem === item)
            view.innerHTML = '<div class="catalog-empty">Could not load inscription: ' + esc(e.message) + '</div>';
        });
      return;
    }
    render();
  }

  // ── Rubbing repositories panel (Rubbings tab default, when none selected) ────
  // Curated metadata for the holding institutions/aggregators in the rubbing
  // corpus. Counts are computed live from the loaded records (not hardcoded).
  var REPO_META = [
    { re: /harvard.yenching/i, zh: "哈佛燕京圖書館", inventory: 8418, harvest: "harvest.html", desc: "Harvard-Yenching Library's Chinese Rubbings and Rubbings Collection — among the largest outside China, digitised open-access and served via IIIF deep-zoom." },
    { re: /berkeley/i,         zh: "加州大學柏克萊分校 C.V. Starr 東亞圖書館", inventory: 2745, harvest: "harvest.html?source=berkeley", desc: "C. V. Starr East Asian Library, UC Berkeley — East Asian rubbings in its digital collections." },
    { re: /japan ?search|ジャパンサーチ/i, zh: "ジャパンサーチ（日本檢索）", inventory: 2000, harvest: "harvest.html?source=japansearch", desc: "Japan's national cross-institution discovery portal, aggregating rubbings (拓本) held across Japanese libraries, museums and archives." },
    { re: /national diet|国立国会図書館|ndl/i, zh: "国立国会図書館", harvest: "harvest.html?source=japansearch", desc: "National Diet Library, Japan — rubbings in its NDL Digital Collections (harvested via Japan Search)." },
    { re: /colbase|national institutes for cultural heritage|national museums of japan/i, zh: "ColBase（国立文化財機構）", harvest: "harvest.html?source=japansearch", desc: "ColBase — the integrated collections database of Japan's National Institutes for Cultural Heritage (harvested via Japan Search)." },
    { re: /efeo|école française|ecole francaise/i, zh: "法國遠東學院", desc: "École française d'Extrême-Orient — its union catalogue of Chinese estampages (rubbings)." },
    { re: /indianapolis/i,     zh: "印第安納波利斯藝術博物館", desc: "Indianapolis Museum of Art at Newfields — Asian art collection." }
  ];
  function repoMeta(name) {
    for (var i = 0; i < REPO_META.length; i++) if (REPO_META[i].re.test(name)) return REPO_META[i];
    return null;
  }

  function showRubbingRepositories(records) {
    var content = document.getElementById("cat-html-view");
    if (!content) return;
    // Group by repository (normalised so "C.V." / "C. V." merge); live counts.
    var groups = {};
    (records || []).forEach(function (r) {
      var name = (r.repository || "(unspecified)").replace(/\s+/g, " ").trim();
      var key  = name.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, "");
      var g = groups[key] || (groups[key] = { name: name, count: 0, country: "", url: "" });
      g.count++;
      if (!g.country && r.country) g.country = r.country;
      if (!g.url) g.url = r.sourceUrl || (r.provider && r.provider.url) || "";
    });
    var keys = Object.keys(groups).sort(function (a, b) { return groups[b].count - groups[a].count; });
    if (!keys.length) return;

    var cards = keys.map(function (k) {
      var g = groups[k], m = repoMeta(g.name);
      var host = "";
      if (g.url) { try { host = new URL(g.url).hostname.replace(/^www\./, ""); } catch (e) { host = g.url; } }
      var countTag = (m && m.inventory)
        ? '<span class="source-tag" title="imported into Epiwen / full harvested inventory">' + g.count + ' of ' + m.inventory.toLocaleString() + ' imported</span>'
        : '<span class="source-tag">' + g.count + (g.count === 1 ? " rubbing" : " rubbings") + ' in Epiwen</span>';
      return '<div class="source-card">' +
        '<h3>' + esc(g.name) + '</h3>' +
        (m && m.zh ? '<div class="source-zh">' + esc(m.zh) + '</div>' : "") +
        countTag +
        (g.country ? '<span class="source-tag">' + esc(g.country) + '</span>' : "") +
        (m && m.desc ? '<p>' + esc(m.desc) + '</p>' : "") +
        (g.url ? '<a class="source-link" href="' + esc(g.url) + '" target="_blank" rel="noopener">' + esc(host || "record ↗") + '</a>' : "") +
        (m && m.harvest ? ' &ensp;·&ensp; <a class="source-link" href="' + esc(m.harvest) + '">browse full inventory →</a>' : "") +
        '</div>';
    }).join("");

    document.getElementById("preview-title").textContent = "Rubbing Repositories";
    content.innerHTML =
      '<div class="hp-preview"><div style="padding:.25rem">' +
        '<div id="rub-stats" style="border:1px solid var(--line);border-radius:6px;background:var(--field-bg,#fafafa);padding:.7rem .85rem;margin-bottom:1rem;font-size:.85rem">' +
          '<b>' + records.length + '</b> rubbings in this catalogue from <b>' + keys.length + '</b> holding institutions. ' +
          '<a class="source-link" href="collections.html">Explore all rubbing collections →</a>' +
        '</div>' +
        '<div class="source-grid">' + cards + '</div></div></div>';
    content.style.display = "";
    // Enrich the banner with global harvest statistics (collections.json, no auth).
    fetch("collections.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.collections) return;
      var banner = document.getElementById("rub-stats"); if (!banner) return;
      var harv = d.collections.filter(function (c) { return c.harvested_count; });
      var total = harv.reduce(function (s, c) { return s + c.harvested_count; }, 0);
      banner.innerHTML =
        '<b>' + records.length + '</b> rubbings in this catalogue from <b>' + keys.length + '</b> holding institutions.<br>' +
        '<span style="color:var(--muted)">Harvested for import: <b>' + total.toLocaleString() + '</b> rubbings across <b>' +
          harv.length + '</b> collections; <b>' + d.collections.length + '</b> collections catalogued worldwide.</span> ' +
        '<a class="source-link" href="collections.html">Explore all rubbing collections →</a>';
    }).catch(function () {});
  }

  // From an object's textpart row: switch to the Inscriptions tab and open that
  // inscription's preview (selecting its row there).
  function openInscriptionFromObject(rec, part) {
    history.pushState({ tab: "inscriptions" }, "", "catalog.html?tab=inscriptions");
    renderByTab("inscriptions");
    var items = document.querySelectorAll("#catalog-list .catalog-item");
    for (var k = 0; k < items.length; k++) {
      if (items[k].dataset.insObj === rec.name && items[k].dataset.insN === (part.n || "")) {
        items[k].scrollIntoView({ behavior: "smooth", block: "nearest" });
        (items[k].querySelector(".catalog-monument") || items[k]).click();
        return;
      }
    }
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
    var idx = foldIdx([rec.name, rec.titleEn, rec.titleZh, rec.dateText, rec.settlement, rec.region]
      .concat(rec.parts.map(function (p) { return p.sutra + " " + p.head; }))
      .join(" "));
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
    copyBtn.addEventListener("click", function (e) { e.stopPropagation(); ensureFullRecord(rec).then(function () { flashCopy(rec.rawXml, copyBtn); }); });

    var editBtn = document.createElement("button");
    editBtn.type = "button"; editBtn.className = "btn small primary";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", function (e) { e.stopPropagation(); ensureFullRecord(rec).then(function () { openInEditor(rec); }); });

    actions.appendChild(copyBtn);
    actions.appendChild(editBtn);
    monument.appendChild(info);
    monument.appendChild(actions);
    item.appendChild(monument);

    // textparts (indented) — each opens that inscription in the Inscriptions tab
    if (rec.parts.length) {
      var ul = document.createElement("ul");
      ul.className = "catalog-parts";
      rec.parts.forEach(function (p, i) {
        var li = document.createElement("li");
        li.className = "catalog-part catalog-part-link";
        li.setAttribute("role", "button");
        li.setAttribute("tabindex", "0");
        li.title = "Open this inscription";
        var label = p.head || p.subtype || ("Text " + p.n);
        li.innerHTML =
          '<span class="catalog-part-label">' + esc(label) + '</span>' +
          (p.sutra ? ' <span class="catalog-part-sutra">' + esc(p.sutra) + '</span>' : '') +
          (p.lang  ? ' <code class="catalog-part-lang">'  + esc(p.lang)  + '</code>'  : '') +
          ' <span class="catalog-part-go">→</span>';
        li.addEventListener("click", function (e) { e.stopPropagation(); openInscriptionFromObject(rec, p); });
        li.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openInscriptionFromObject(rec, p); }
        });
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
  // ASCDC (buddhism.ascdc.sinica.edu.tw) manifests reference an INTERNAL image
  // server (http://parser/parser/IIIF/<imageId>/…) that is not publicly routed;
  // the public equivalent per image is buddhism/img/Thumbnail/<imageId>.jpg.
  // Rewrite those so the strip viewer / OSD get loadable URLs.
  var ASCDC_PARSER = /^https?:\/\/parser\/parser\/IIIF\/([^/]+)/;
  function ascdcPublicImage(u) {
    var m = ASCDC_PARSER.exec(u || "");
    return m ? "https://buddhism.ascdc.sinica.edu.tw/buddhism/img/Thumbnail/" +
               encodeURIComponent(m[1]) + ".jpg" : "";
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
      var pub = ascdcPublicImage(service) || ascdcPublicImage(full);
      if (pub) { service = ""; full = pub; if (!thumb || ASCDC_PARSER.test(thumb)) thumb = pub; }
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

      loadInto(i);
    }

    // Load page i into the OSD viewer. Robust to rapid clicks (only the latest
    // requested page wins) and to a load that never fires "open" (no wedge).
    // osdEl._want = latest desired page; osdEl._loadingIdx = page being opened.
    function loadInto(i) {
      osdEl._want = i;
      ensureOSD().then(function (OSD) {
        if (osdEl._want !== i) return;                 // superseded by a later click
        if (osdEl._creating) return;                   // construction in flight → "open" reconciles to _want
        if (_rubOSD && _rubOSD.element === osdEl) {     // reuse the live viewer
          osdEl._loadingIdx = i; _rubOSD.open(tileSourceFor(pages[i])); return;
        }
        osdEl._creating = true; osdEl._loadingIdx = i;
        _rubOSD = OSD({
          element: osdEl,
          prefixUrl: "https://cdn.jsdelivr.net/npm/openseadragon@4.1.0/build/openseadragon/images/",
          showNavigationControl: false,
          homeFillsViewer: false,                      // fit the whole image into the window
          visibilityRatio: 1,
          minZoomImageRatio: 0.9,
          gestureSettingsMouse: { clickToZoom: false },// scroll = zoom, drag = pan
          tileSources: [tileSourceFor(pages[i])]
        });
        _rubOSD.addHandler("open", reconcile);
        _rubOSD.addHandler("open-failed", onOpenFailed);
      }).catch(function () {                           // OSD CDN unreachable → static fit image
        if (osdEl._want === i) osdEl.innerHTML = '<img class="rubview-img" src="' + esc(pageImg(pages[i], 1200)) + '" alt="page">';
      });
    }
    function reconcile() {                              // a load settled → jump to the latest wanted page
      osdEl._creating = false;
      if (osdEl._want != null && osdEl._want !== osdEl._loadingIdx) loadInto(osdEl._want);
    }
    function onOpenFailed() {                           // tiled info.json blocked, etc.
      osdEl._creating = false;                          // never wedge if the first open fails
      var li = osdEl._loadingIdx, pg = pages[li];
      if (pg && pg.service && pg.full && !fellBack[li]) {  // fall the FAILED page back to a plain image
        fellBack[li] = true; _rubOSD.open({ type: "image", url: pg.full }); return;
      }
      if (osdEl._want != null && osdEl._want !== li) loadInto(osdEl._want);
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
      if (p.length) { pages = p; buildStrip(); openPage(0); }   // show the first page directly
      else if (first) { buildStrip(); openPage(0); }
      else strip.innerHTML = '<span class="rubview-loading">no pages found</span>';
    }).catch(function () {
      if (first) { buildStrip(); openPage(0); }
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
      if (window.EpiBookmarks) EpiBookmarks.detach(a);
    });
    bar.querySelector("#compare-save").addEventListener("click", function () {
      if (!window.EpiBookmarks) return;
      var name = prompt("Name this comparison:", a.length + "-rubbing comparison");
      if (name === null) return;
      EpiBookmarks.save(name, a);
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
    item.dataset.idx = foldIdx([label, part.sutra, part.sutraEn, rec.name, rec.titleEn, rec.titleZh]
      .join(" "));
    // Identify this inscription so an object's textpart row can deep-link to it.
    item.dataset.insObj = rec.name;
    item.dataset.insN   = part.n || "";

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

    var bearerFile = rec.bearer || rec.name;    // new-model: the object bearer; legacy: the object record itself
    info.innerHTML =
      sourceBadge(rec) +
      titleHtml +
      '<span class="catalog-date">' + esc(label) +
      ' · inscribed on <a href="catalog.html?tab=objects&amp;file=' + encodeURIComponent(bearerFile) +
      '" class="catalog-obj-link"><code class="catalog-filename">' + esc(bearerFile) + '</code></a>' +
      (rec.dateText ? ' · ' + esc(rec.dateText) : '') +
      '</span>';
    var objLink = info.querySelector(".catalog-obj-link");
    if (objLink) {
      objLink.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        history.pushState({ tab: "objects", file: bearerFile }, "", objLink.href);
        renderByTab("objects", bearerFile);
      });
    }

    // entry itself selectable (replaces the old Preview button) — shows only
    // this inscription (its textpart XML + a link back to the object).
    row.classList.add("selectable");
    row.setAttribute("role", "button"); row.setAttribute("tabindex", "0");
    row.addEventListener("click", function () { showInscriptionPreview(rec, part, pIdx, item); });
    row.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showInscriptionPreview(rec, part, pIdx, item); }
    });
    row.appendChild(info);
    item.appendChild(row);
    appendFoldedRubbings(item, rec.name);
    return item;
  }

  function buildRubbingItem(rec) {
    var item = document.createElement("div");
    item.className = "catalog-item";
    item.dataset.idx = foldIdx([rec.name, rec.titleEn, rec.titleZh, rec.surrogateOf, rec.dateText]
      .join(" "));

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
    copyBtn.addEventListener("click", function (e) { e.stopPropagation(); ensureFullRecord(rec).then(function () { flashCopy(rec.rawXml, copyBtn); }); });

    var editBtn = document.createElement("button");
    editBtn.type = "button"; editBtn.className = "btn small primary";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", function (e) { e.stopPropagation(); ensureFullRecord(rec).then(function () { openInRubbingEditor(rec); }); });

    var delBtn = document.createElement("button");
    delBtn.type = "button"; delBtn.className = "btn small btn-danger";
    delBtn.textContent = "🗑"; delBtn.title = "Delete this rubbing's file from GitHub";
    delBtn.addEventListener("click", function (e) { e.stopPropagation(); deleteRecord(rec); });

    actions.appendChild(copyBtn);
    actions.appendChild(editBtn);
    if (recordLocation(rec)) actions.appendChild(delBtn);
    row.appendChild(info);
    row.appendChild(actions);
    item.appendChild(row);
    return item;
  }

  // ---- render by tab -------------------------------------------------------
  // Shown when the data backend (private epiwen-data) can't be read — almost
  // always a token without access, which GitHub reports as a 404.
  var TOKEN_CLASSIC = "https://github.com/settings/tokens/new?scopes=repo&amp;description=Epiwen";
  var TOKEN_FINE    = "https://github.com/settings/personal-access-tokens/new";
  function showBackendError() {
    var list = document.getElementById("catalog-list");
    if (!list) return;
    list.innerHTML =
      '<div class="catalog-empty backend-error">' +
        '<strong>Can’t read the data backend.</strong> The catalog lives in the private repo ' +
        '<code>pleuston/epiwen-data</code>, and the token you’re signed in with can’t read it ' +
        '(GitHub returns a 404). Generate a token that has access:' +
        '<ul>' +
          '<li><a href="' + TOKEN_CLASSIC + '" target="_blank" rel="noopener">classic PAT with the <code>repo</code> scope</a> — one click, scope pre-filled; or</li>' +
          '<li><a href="' + TOKEN_FINE + '" target="_blank" rel="noopener">fine-grained PAT</a> granting <code>epiwen-data → Contents: Read</code>.</li>' +
        '</ul>' +
        'Then <a href="#" onclick="EpiAuth.signOut();return false;">sign out and sign back in</a> with the new token.' +
        (backendErrorDetail ? '<div class="muted" style="margin-top:.4rem">(' + esc(backendErrorDetail) + ')</div>' : '') +
      '</div>';
  }

  function hasToken() {
    return !!((window.EpiData && EpiData.token && EpiData.token()) ||
              localStorage.getItem("epiwen_gh_token"));
  }

  // A quiet, non-blocking banner shown when the private backend can't be read
  // but the default corpus loaded fine — so signed-in users know their private
  // collections are missing without losing the records that did load. Guests
  // (no token) never see it: they have no private backend to begin with.
  function renderBackendNotice() {
    var box = document.getElementById("catalog-notice");
    if (!box) return;
    if (backendUnreadable && allRecords.length && hasToken()) {
      box.innerHTML =
        '<div class="catalog-notice-bar">' +
          'Showing the public corpus only — your token can’t read the private ' +
          '<code>pleuston/epiwen-data</code> backend (GitHub returns a 404). ' +
          '<a href="' + TOKEN_FINE + '" target="_blank" rel="noopener">Use a token with access</a> ' +
          'to see private collections.' +
        '</div>';
    } else {
      box.innerHTML = "";
    }
  }

  function renderByTab(tab, file) {
    currentTab = tab;

    // Update nav active state
    Array.prototype.forEach.call(document.querySelectorAll(".sitenav-link[data-tab]"), function (link) {
      link.classList.toggle("active", link.dataset.tab === tab);
    });

    // Update "+ New" add button
    var addBtn = document.getElementById("btn-add-new");
    if (addBtn) {
      if (tab === "objects")           { addBtn.href = "object-editor.html"; addBtn.style.display = ""; }
      else if (tab === "inscriptions") { addBtn.href = "editor.html";        addBtn.style.display = ""; }
      else if (tab === "rubbings")     { addBtn.href = "rubbing.html";       addBtn.style.display = ""; }
      else                             { addBtn.style.display = "none"; }
    }

    // Reset search and preview when switching tabs
    var searchEl = document.getElementById("catalog-search");
    if (searchEl) searchEl.value = "";
    clearPreview();

    // Only blank the catalog with the full error when NOTHING loaded. If the
    // default corpus loaded, render it and show a quiet notice instead.
    if (backendUnreadable && !allRecords.length) { showBackendError(); return; }
    renderBackendNotice();

    if (tab === "objects") {
      renderObjectsCatalog(allRecords.filter(function (r) { return r.recordType === "object"; }), file || "");
    } else if (tab === "inscriptions") {
      renderInscriptionsCatalog();
    } else if (tab === "rubbings") {
      var rubs = allRecords.filter(function (r) { return r.recordType === "rubbing"; });
      renderRubbingsCatalog(rubs);
      showRubbingRepositories(rubs);   // default detail panel (until a rubbing is selected)
    }
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
    var base = applyMineFilter(records);
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

  function applyFilters(records) {
    return applySiteFilter(applyMineFilter(records));
  }

  function updateMineLabel(filtered, total) {
    var lbl = document.getElementById("mine-label");
    if (!lbl) return;
    var parts = [];
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

    // EpiDoc-CN inscription files are each one inscription (recordType
    // "inscription"); legacy object records carry their inscriptions as
    // textparts. EpiDoc-CN OBJECT bearers are excluded — their texts are the
    // separate inscription files, so counting their msItems would double-list.
    var inscribable = allRecords.filter(function (r) {
      return r.recordType === "inscription" ||
             (r.recordType === "object" && r._cnKind !== "objectfile");
    });
    var totalParts = inscribable.reduce(function (n, r) { return n + r.parts.length; }, 0);
    var base = applyFilters(inscribable);
    var items = [];
    base.forEach(function (rec) {
      rec.parts.forEach(function (part, pIdx) {
        items.push({ rec: rec, part: part, pIdx: pIdx });
      });
    });

    updateMineLabel(items.length, totalParts);

    var bar = siteBar(inscribable);
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
      '<button type="button" class="btn small' + (rubViewMode === "compact" ? " primary" : "") + '" data-rubview="compact">Compact (by inscription)</button> ' +
      '<button type="button" class="btn small' + (rubViewMode === "index" ? " primary" : "") + '" data-rubview="index">By inscription (index)</button></div>';
    list.innerHTML = selHtml + viewBar;
    if (rubViewMode === "index") {
      var ibox = document.createElement("div"); ibox.className = "rub-index";
      ibox.innerHTML = '<div class="catalog-loading">Loading inscription index…</div>';
      list.appendChild(ibox);
      renderInscriptionIndex(ibox);
      wireRubSource(); wireRubView();
      return;
    }
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

  // "By inscription" index: one heading per inscription, holdings grouped by
  // institution as comma-separated id links. Reads collections/<corpus>/_inscription_index.json.
  var _insIndexCache = null;
  function renderInscriptionIndex(box) {
    function draw(data) {
      if (!Array.isArray(data) || !data.length) { box.innerHTML = '<div class="catalog-empty">No inscription index for this corpus.</div>'; return; }
      box.innerHTML = data.map(function (ins) {
        var holds = (ins.holdings || []).map(function (h) {
          var ids = (h.items || []).map(function (it) {
            return '<a href="' + esc(it.link) + '" target="_blank" rel="noopener">' + esc(it.id) + '</a>';
          }).join(", ");
          return '<div class="ins-hold"><span class="ins-inst">' + esc(h.institution) + ':</span> ' + ids + '</div>';
        }).join("");
        return '<div class="ins-row"><div class="ins-name">' + esc(ins.en) +
          (ins.zh ? ' <span class="ins-zh">' + esc(ins.zh) + '</span>' : '') +
          ' <span class="ins-count">' + (ins.count || 0) + '</span></div>' + holds + '</div>';
      }).join("");
    }
    if (_insIndexCache) { draw(_insIndexCache); return; }
    if (!window.EpiCollections || !EpiCollections.fetchSharedFile) { box.innerHTML = '<div class="catalog-empty">Index unavailable.</div>'; return; }
    EpiCollections.fetchSharedFile("_inscription_index.json")
      .then(function (txt) { _insIndexCache = JSON.parse(txt); draw(_insIndexCache); })
      .catch(function () { box.innerHTML = '<div class="catalog-empty">No inscription index found for this corpus.</div>'; });
  }

  function wireRubSource() {
    var sel = document.getElementById("rub-source");
    if (sel) sel.addEventListener("change", function () {
      rubSourceFilter = this.value;
      renderByTab("rubbings");
    });
  }

  // ---- search --------------------------------------------------------------
  // Fold 繁/简/異體字 + lowercase so search is script-insensitive (variants.js).
  function foldIdx(s) { return window.EpiVariants ? EpiVariants.fold(s) : String(s == null ? "" : s).toLowerCase(); }
  function filterCatalog(term) {
    var q = foldIdx(term);
    Array.prototype.forEach.call(document.querySelectorAll(".catalog-item"), function (el) {
      el.style.display = (!q || el.dataset.idx.indexOf(q) !== -1) ? "" : "none";
    });
  }

  // ---- private collections -------------------------------------------------
  /* Fetch enabled private packages (raw XML), parse here, tag, merge, re-render.
     Additive and idempotent — safe to call again after the manager changes the
     enabled set. */
  function loadPrivate() {
    if (!window.EpiCollections) { renderByTab(currentTab); return; }
    // The shared collection auto-loads alongside any enabled private collections.
    var jobs = [ EpiCollections.loadEnabled() ];
    if (EpiCollections.loadShared) jobs.unshift(EpiCollections.loadShared());
    if (EpiCollections.loadDefaultCorpus) jobs.unshift(EpiCollections.loadDefaultCorpus());
    Promise.all(jobs).then(function (results) {
      var raw = [];
      results.forEach(function (res) { raw = raw.concat((res && res.records) || []); });
      privateRecords = raw.map(function (r) {
        // Index records (from records-index.json) arrive pre-summarised and load
        // their XML lazily; directory-walked records carry full XML to parse now.
        var rec = r._lazy ? indexRecord(r) : parseRecord(r.name, r.xml);
        rec.source          = "private";
        rec.collection      = r.collection;
        rec.collectionTitle = r.collectionTitle || r.collection;
        if (r._repoDir) rec._repoDir = r._repoDir;   // default corpus: locate in app repo
        return rec;
      });
      privateRecords.sort(function (a, b) { return a.name.localeCompare(b.name); });
    }).catch(function () {
      // A rejected collection load must not leave the catalog stuck on the
      // "Loading…" placeholder — keep whatever records we already had.
    }).then(function () {
      // Always render, success or failure, so the UI never hangs on "Loading…".
      rebuildAll();
      renderByTab(currentTab);
    });
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

    // Records now live in the Stone Sutras corpus collection (default-on) and any
    // enabled collections; authorities + biblio stay in the always-on core.
    // Probe a core path (data/) to detect backend readability, then load records
    // from the collections via loadPrivate().
    // Always load the default corpus (no auth needed); also probe the private
    // backend and, if accessible, load private collections on top.
    loadPrivate();   // default corpus works without a token; loadEnabled/loadShared gracefully no-op without one
    EpiData.list("data")
      .then(function (files) {
        if (!files) { backendUnreadable = true; return; }  // 404 = no private backend access
        loadPrivate();   // re-run now that we know the backend is readable (adds private records)
      })
      .catch(function (e) {
        backendUnreadable = true; backendErrorDetail = e.message;
      });
  });
})();
