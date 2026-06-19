/* biblio-app.js — MODS bibliography record form editor */
(function () {
  "use strict";

  var NS_MODS  = "http://www.loc.gov/mods/v3";
  var XLINK_NS = "http://www.w3.org/1999/xlink";

  // ── State ─────────────────────────────────────────────────────────────────

  var state = {
    key:          "",
    pubType:      "monograph",
    reference:    "",
    titlePrimary: "",
    titleLang:    "en",
    titleZh:      "",
    titlePinyin:  "",
    titleEnTrans: "",
    contributors: [],   // [{pyFamily, pyGiven, zhFamily, zhGiven, role, href}]
    // monograph
    year: "", placeEn: "", placeZh: "", pubEn: "", pubZh: "",
    series: "", volumes: "",
    // article
    journalTitle: "", journalTitleZh: "", journalHref: "",
    volume: "", issue: "", artYear: "",
    pageStart: "", pageEnd: "",
    // chapter
    hostTitle: "", hostTitleZh: "", hostHref: "",
    hostEditors: [],    // [{pyFamily, pyGiven, zhFamily, zhGiven, href}]
    hostPlaceEn: "", hostPlaceZh: "", hostPubEn: "", hostPubZh: "",
    chapYear: "", chapPageStart: "", chapPageEnd: "",
    // thesis
    thesisNote: "Ph.D. diss.", thesisYear: "", thesisInst: "",
    // website
    url: "", dateCaptured: "", websiteTitle: "", webYear: "",
    // identifiers + notes
    doi: "", isbn: "", notes: ""
  };

  // ── Utilities ─────────────────────────────────────────────────────────────

  function xmlEsc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function gv(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }

  function sv(id, val) {
    var el = document.getElementById(id);
    if (el) el.value = val || "";
  }

  function toast(msg, isErr) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.className = "show" + (isErr ? " toast-error" : "");
    setTimeout(function () { el.className = ""; }, isErr ? 6000 : 3000);
  }

  // ── MODS XML builder ──────────────────────────────────────────────────────

  function buildMods() {
    var s = state;
    var x = '<?xml version="1.0" encoding="UTF-8"?>\n';
    x += '<mods xmlns="http://www.loc.gov/mods/v3"';
    x += '\n      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"';
    x += '\n      xmlns:ns2="http://www.w3.org/1999/xlink"';
    x += '\n      ID="' + xmlEsc(s.key) + '"';
    x += '\n      xsi:schemaLocation="http://www.loc.gov/mods/v3 http://data.stonesutras.org:8080/exist/servlet/db/schema/mods-3-0.xsd">\n';

    // Titles
    if (s.titleLang === "zh") {
      if (s.titlePinyin) x += '  <titleInfo transliteration="pinyin"><title>' + xmlEsc(s.titlePinyin) + '</title></titleInfo>\n';
      if (s.titlePrimary) x += '  <titleInfo lang="zh"><title>' + xmlEsc(s.titlePrimary) + '</title></titleInfo>\n';
      if (s.titleEnTrans) x += '  <titleInfo type="translated" lang="en"><title>' + xmlEsc(s.titleEnTrans) + '</title></titleInfo>\n';
    } else {
      if (s.titlePrimary) x += '  <titleInfo lang="en"><title>' + xmlEsc(s.titlePrimary) + '</title></titleInfo>\n';
      if (s.titleZh)      x += '  <titleInfo lang="zh"><title>' + xmlEsc(s.titleZh) + '</title></titleInfo>\n';
    }
    if (s.reference) x += '  <titleInfo type="reference"><title>' + xmlEsc(s.reference) + '</title></titleInfo>\n';

    // Contributors
    for (var ci = 0; ci < s.contributors.length; ci++) {
      x += buildNameEl(s.contributors[ci], "  ");
    }

    // Type-specific content
    if (s.pubType === "article") {
      x += buildArticle(s);
    } else if (s.pubType === "chapter") {
      x += buildChapter(s);
    } else if (s.pubType === "thesis") {
      x += buildThesis(s);
    } else if (s.pubType === "website") {
      x += buildWebsite(s);
    } else {
      x += buildMonograph(s);
    }

    if (s.doi)  x += '  <identifier type="doi">'  + xmlEsc(s.doi)  + '</identifier>\n';
    if (s.isbn) x += '  <identifier type="isbn">' + xmlEsc(s.isbn) + '</identifier>\n';
    if (s.notes) x += '  <note>' + xmlEsc(s.notes) + '</note>\n';

    x += '</mods>';
    return x;
  }

  function buildNameEl(c, indent) {
    var hasPy = c.pyFamily || c.pyGiven;
    var hasZh = c.zhFamily || c.zhGiven;
    var hrefAttr = c.href ? ' ns2:href="#' + xmlEsc(c.href) + '"' : "";
    var x = indent + '<name' + hrefAttr + ' type="personal">\n';
    if (c.role === "et-al") {
      x += indent + '  <role><roleTerm type="etal">author</roleTerm></role>\n';
    } else {
      if (hasZh) {
        if (hasPy) {
          if (c.pyFamily) x += indent + '  <namePart transliteration="pinyin" type="family">' + xmlEsc(c.pyFamily) + '</namePart>\n';
          if (c.pyGiven)  x += indent + '  <namePart transliteration="pinyin" type="given">'  + xmlEsc(c.pyGiven)  + '</namePart>\n';
        }
        if (c.zhFamily) x += indent + '  <namePart lang="zh" type="family">' + xmlEsc(c.zhFamily) + '</namePart>\n';
        if (c.zhGiven)  x += indent + '  <namePart lang="zh" type="given">'  + xmlEsc(c.zhGiven)  + '</namePart>\n';
      } else if (hasPy) {
        if (c.pyFamily) x += indent + '  <namePart type="family">' + xmlEsc(c.pyFamily) + '</namePart>\n';
        if (c.pyGiven)  x += indent + '  <namePart type="given">'  + xmlEsc(c.pyGiven)  + '</namePart>\n';
      }
      x += indent + '  <role><roleTerm>' + xmlEsc(c.role || "author") + '</roleTerm></role>\n';
    }
    x += indent + '</name>\n';
    return x;
  }

  function buildOriginInfo(year, placeEn, placeZh, pubEn, pubZh, indent) {
    var x = indent + '<originInfo>\n';
    if (year)  x += indent + '  <dateIssued>' + xmlEsc(year) + '</dateIssued>\n';
    if (placeEn || placeZh) {
      x += indent + '  <place>\n';
      if (placeEn) x += indent + '    <placeTerm>' + xmlEsc(placeEn) + '</placeTerm>\n';
      if (placeZh) x += indent + '    <placeTerm lang="zh">' + xmlEsc(placeZh) + '</placeTerm>\n';
      x += indent + '  </place>\n';
    }
    if (pubEn || pubZh) {
      x += indent + '  <publisher><name type="corporate">\n';
      if (pubEn) x += indent + '    <namePart lang="en">' + xmlEsc(pubEn) + '</namePart>\n';
      if (pubZh) x += indent + '    <namePart lang="zh">' + xmlEsc(pubZh) + '</namePart>\n';
      x += indent + '  </name></publisher>\n';
    }
    x += indent + '  <issuance>monographic</issuance>\n';
    x += indent + '</originInfo>\n';
    return x;
  }

  function buildMonograph(s) {
    var x = buildOriginInfo(s.year, s.placeEn, s.placeZh, s.pubEn, s.pubZh, "  ");
    if (s.volumes) x += '  <extension>' + xmlEsc(s.volumes) + '</extension>\n';
    if (s.series)  x += '  <relatedItem type="series"><titleInfo><title>' + xmlEsc(s.series) + '</title></titleInfo></relatedItem>\n';
    return x;
  }

  function buildArticle(s) {
    var x = "";
    var hrefAttr = s.journalHref ? ' ns2:href="#' + xmlEsc(s.journalHref) + '"' : "";
    x += '  <relatedItem' + hrefAttr + ' type="host">\n';
    x += '    <titleInfo><title>' + xmlEsc(s.journalTitle) + '</title></titleInfo>\n';
    if (s.journalTitleZh) x += '    <titleInfo lang="zh"><title>' + xmlEsc(s.journalTitleZh) + '</title></titleInfo>\n';
    x += '    <originInfo><issuance>continuing</issuance></originInfo>\n';
    x += '    <part>\n';
    if (s.artYear)   x += '      <date>' + xmlEsc(s.artYear) + '</date>\n';
    if (s.volume)    x += '      <detail type="volume">' + xmlEsc(s.volume) + '</detail>\n';
    if (s.issue)     x += '      <detail type="no">' + xmlEsc(s.issue) + '</detail>\n';
    if (s.pageStart || s.pageEnd) {
      x += '      <extent unit="page">\n';
      if (s.pageStart) x += '        <start>' + xmlEsc(s.pageStart) + '</start>\n';
      if (s.pageEnd)   x += '        <end>'   + xmlEsc(s.pageEnd)   + '</end>\n';
      x += '      </extent>\n';
    }
    x += '    </part>\n  </relatedItem>\n';
    return x;
  }

  function buildChapter(s) {
    var x = "";
    if (s.chapYear) {
      x += '  <originInfo>\n';
      x += '    <dateIssued>' + xmlEsc(s.chapYear) + '</dateIssued>\n';
      x += '    <issuance>monographic</issuance>\n  </originInfo>\n';
    }
    var hrefAttr = s.hostHref ? ' ns2:href="#' + xmlEsc(s.hostHref) + '"' : "";
    x += '  <relatedItem' + hrefAttr + ' type="host">\n';
    x += '    <titleInfo><title>' + xmlEsc(s.hostTitle) + '</title></titleInfo>\n';
    if (s.hostTitleZh) x += '    <titleInfo lang="zh"><title>' + xmlEsc(s.hostTitleZh) + '</title></titleInfo>\n';
    for (var ei = 0; ei < s.hostEditors.length; ei++) {
      x += buildNameEl(Object.assign({ role: "editor" }, s.hostEditors[ei]), "    ");
    }
    x += buildOriginInfo("", s.hostPlaceEn, s.hostPlaceZh, s.hostPubEn, s.hostPubZh, "    ");
    if (s.chapPageStart || s.chapPageEnd) {
      x += '    <part><extent unit="page">\n';
      if (s.chapPageStart) x += '      <start>' + xmlEsc(s.chapPageStart) + '</start>\n';
      if (s.chapPageEnd)   x += '      <end>'   + xmlEsc(s.chapPageEnd)   + '</end>\n';
      x += '    </extent></part>\n';
    }
    x += '  </relatedItem>\n';
    return x;
  }

  function buildThesis(s) {
    var x = "";
    if (s.thesisNote) x += '  <note type="thesis">' + xmlEsc(s.thesisNote) + '</note>\n';
    x += '  <originInfo>\n';
    if (s.thesisYear) x += '    <dateIssued>' + xmlEsc(s.thesisYear) + '</dateIssued>\n';
    if (s.thesisInst) x += '    <place><placeTerm>' + xmlEsc(s.thesisInst) + '</placeTerm></place>\n';
    x += '    <issuance>monographic</issuance>\n  </originInfo>\n';
    return x;
  }

  function buildWebsite(s) {
    var x = '  <genre>Web</genre>\n';
    x += '  <originInfo>\n';
    if (s.webYear)       x += '    <dateIssued>' + xmlEsc(s.webYear) + '</dateIssued>\n';
    if (s.dateCaptured)  x += '    <dateCaptured>' + xmlEsc(s.dateCaptured) + '</dateCaptured>\n';
    x += '    <issuance>monographic</issuance>\n  </originInfo>\n';
    if (s.url) x += '  <location><url>' + xmlEsc(s.url) + '</url></location>\n';
    if (s.websiteTitle) {
      x += '  <relatedItem type="host"><titleInfo><title>' + xmlEsc(s.websiteTitle) + '</title></titleInfo></relatedItem>\n';
    }
    return x;
  }

  // ── MODS parser (for preload from browser Edit button) ────────────────────

  function parseMods(xml) {
    var s = {};
    for (var k in state) { if (state.hasOwnProperty(k)) s[k] = state[k]; }
    s.contributors = [];
    s.hostEditors  = [];

    try {
      var doc  = new DOMParser().parseFromString(xml, "application/xml");
      var root = doc.documentElement;
      if (!root || root.nodeName === "parsererror") return s;

      s.key = root.getAttribute("ID") || "";

      // Determine type
      var relItems = root.getElementsByTagNameNS(NS_MODS, "relatedItem");
      var hasHostCont = false, hasHostMono = false, hasSeries = false;
      for (var ri = 0; ri < relItems.length; ri++) {
        var riType = relItems[ri].getAttribute("type") || "";
        if (riType === "host") {
          var iss = relItems[ri].getElementsByTagNameNS(NS_MODS, "issuance")[0];
          if (iss && iss.textContent.trim() === "continuing")  hasHostCont = true;
          if (iss && iss.textContent.trim() === "monographic") hasHostMono = true;
        }
        if (riType === "series") hasSeries = true;
      }
      var thesisNote = root.getElementsByTagNameNS(NS_MODS, "note")[0];
      var hasThesis  = thesisNote && thesisNote.getAttribute("type") === "thesis";
      var genreEl    = root.getElementsByTagNameNS(NS_MODS, "genre")[0];
      var locUrlEl   = root.getElementsByTagNameNS(NS_MODS, "url")[0];
      var hasWeb     = (genreEl && genreEl.textContent.trim() === "Web") || !!locUrlEl;

      if (hasHostCont)  s.pubType = "article";
      else if (hasHostMono) s.pubType = "chapter";
      else if (hasThesis)   s.pubType = "thesis";
      else if (hasWeb)      s.pubType = "website";
      else                  s.pubType = "monograph";

      // Titles
      var titleInfos = root.getElementsByTagNameNS(NS_MODS, "titleInfo");
      for (var ti = 0; ti < titleInfos.length; ti++) {
        var tinfo = titleInfos[ti];
        var tType    = tinfo.getAttribute("type") || "";
        var tLang    = tinfo.getAttribute("lang") || "";
        var tTransl  = tinfo.getAttribute("transliteration") || "";
        var titleEl  = tinfo.getElementsByTagNameNS(NS_MODS, "title")[0];
        var tText    = titleEl ? titleEl.textContent.trim() : "";
        if (!tText) continue;
        if (tType === "reference") { s.reference = tText; continue; }
        if (tType === "translated" && tLang === "en") { s.titleEnTrans = tText; continue; }
        if (tTransl === "pinyin") { s.titlePinyin = tText; continue; }
        if (tLang === "zh") {
          if (!s.titlePrimary) { s.titlePrimary = tText; s.titleLang = "zh"; }
          else s.titleZh = tText;
          continue;
        }
        if (!s.titlePrimary) { s.titlePrimary = tText; s.titleLang = "en"; }
      }

      // Contributors (top-level name elements only)
      var nameEls = root.getElementsByTagNameNS(NS_MODS, "name");
      for (var ni = 0; ni < nameEls.length; ni++) {
        var nameEl = nameEls[ni];
        if (nameEl.parentNode !== root) continue;
        var c = parseNameEl(nameEl);
        s.contributors.push(c);
      }

      // Main originInfo
      var oInfo = root.getElementsByTagNameNS(NS_MODS, "originInfo")[0];
      if (oInfo && oInfo.parentNode === root) {
        var diEl = oInfo.getElementsByTagNameNS(NS_MODS, "dateIssued")[0];
        if (diEl) {
          var yr = diEl.textContent.trim();
          if (s.pubType === "article") s.artYear = yr;
          else if (s.pubType === "chapter") s.chapYear = yr;
          else if (s.pubType === "thesis") s.thesisYear = yr;
          else if (s.pubType === "website") s.webYear = yr;
          else s.year = yr;
        }
        var ptEls = oInfo.getElementsByTagNameNS(NS_MODS, "placeTerm");
        for (var pi = 0; pi < ptEls.length; pi++) {
          var ptEl  = ptEls[pi];
          var ptLng = ptEl.getAttribute("lang") || "";
          if (ptLng === "zh") {
            if (s.pubType === "thesis") {} // institution is non-zh
            else s.placeZh = ptEl.textContent.trim();
          } else {
            if (s.pubType === "thesis") s.thesisInst = ptEl.textContent.trim();
            else s.placeEn = ptEl.textContent.trim();
          }
        }
        var npEls = oInfo.getElementsByTagNameNS(NS_MODS, "namePart");
        for (var npi = 0; npi < npEls.length; npi++) {
          var npEl  = npEls[npi];
          var npLng = npEl.getAttribute("lang") || "";
          if (npLng === "zh") s.pubZh = npEl.textContent.trim();
          else s.pubEn = npEl.textContent.trim();
        }
      }

      // RelatedItems
      for (var rii = 0; rii < relItems.length; rii++) {
        var ri2 = relItems[rii];
        var riType2 = ri2.getAttribute("type") || "";
        var riHref  = ri2.getAttributeNS(XLINK_NS, "href") || "";

        if (riType2 === "series") {
          var stEl = ri2.getElementsByTagNameNS(NS_MODS, "title")[0];
          if (stEl) s.series = stEl.textContent.trim();

        } else if (riType2 === "host" && s.pubType === "article") {
          var jtEls = ri2.getElementsByTagNameNS(NS_MODS, "titleInfo");
          for (var jt = 0; jt < jtEls.length; jt++) {
            var jtL = jtEls[jt].getAttribute("lang") || "";
            var jtT = jtEls[jt].getElementsByTagNameNS(NS_MODS, "title")[0];
            if (!jtT) continue;
            if (jtL === "zh") s.journalTitleZh = jtT.textContent.trim();
            else s.journalTitle = jtT.textContent.trim();
          }
          s.journalHref = riHref.replace(/^#/, "");
          var partEl = ri2.getElementsByTagNameNS(NS_MODS, "part")[0];
          if (partEl) {
            var dtEls = partEl.getElementsByTagNameNS(NS_MODS, "detail");
            for (var dt = 0; dt < dtEls.length; dt++) {
              var dtType = dtEls[dt].getAttribute("type") || "";
              var dtText = dtEls[dt].textContent.trim();
              if (dtType === "volume") s.volume = dtText;
              else if (dtType === "no") s.issue = dtText;
            }
            var dateEl2 = partEl.getElementsByTagNameNS(NS_MODS, "date")[0];
            if (dateEl2) s.artYear = dateEl2.textContent.trim();
            var extEl = partEl.getElementsByTagNameNS(NS_MODS, "extent")[0];
            if (extEl) {
              var stEl2 = extEl.getElementsByTagNameNS(NS_MODS, "start")[0];
              var enEl2 = extEl.getElementsByTagNameNS(NS_MODS, "end")[0];
              if (stEl2) s.pageStart = stEl2.textContent.trim();
              if (enEl2) s.pageEnd   = enEl2.textContent.trim();
            }
          }

        } else if (riType2 === "host" && s.pubType === "chapter") {
          var htEls = ri2.getElementsByTagNameNS(NS_MODS, "titleInfo");
          for (var ht = 0; ht < htEls.length; ht++) {
            if (htEls[ht].parentNode !== ri2) continue;
            var htL = htEls[ht].getAttribute("lang") || "";
            var htT = htEls[ht].getElementsByTagNameNS(NS_MODS, "title")[0];
            if (!htT) continue;
            if (htL === "zh") s.hostTitleZh = htT.textContent.trim();
            else s.hostTitle = htT.textContent.trim();
          }
          s.hostHref = riHref.replace(/^#/, "");
          var hEdEls = ri2.getElementsByTagNameNS(NS_MODS, "name");
          for (var he = 0; he < hEdEls.length; he++) {
            if (hEdEls[he].parentNode !== ri2) continue;
            s.hostEditors.push(parseNameEl(hEdEls[he]));
          }
          var hoInfo = ri2.getElementsByTagNameNS(NS_MODS, "originInfo")[0];
          if (hoInfo) {
            var hoPts = hoInfo.getElementsByTagNameNS(NS_MODS, "placeTerm");
            for (var hp = 0; hp < hoPts.length; hp++) {
              var hpL = hoPts[hp].getAttribute("lang") || "";
              if (hpL === "zh") s.hostPlaceZh = hoPts[hp].textContent.trim();
              else s.hostPlaceEn = hoPts[hp].textContent.trim();
            }
            var hoNps = hoInfo.getElementsByTagNameNS(NS_MODS, "namePart");
            for (var hn = 0; hn < hoNps.length; hn++) {
              var hnL = hoNps[hn].getAttribute("lang") || "";
              if (hnL === "zh") s.hostPubZh = hoNps[hn].textContent.trim();
              else s.hostPubEn = hoNps[hn].textContent.trim();
            }
          }
          var hPart = ri2.getElementsByTagNameNS(NS_MODS, "part")[0];
          if (hPart) {
            var hExt = hPart.getElementsByTagNameNS(NS_MODS, "extent")[0];
            if (hExt) {
              var hSt = hExt.getElementsByTagNameNS(NS_MODS, "start")[0];
              var hEn = hExt.getElementsByTagNameNS(NS_MODS, "end")[0];
              if (hSt) s.chapPageStart = hSt.textContent.trim();
              if (hEn) s.chapPageEnd   = hEn.textContent.trim();
            }
          }
        }

        if (riType2 === "host" && s.pubType === "website") {
          var wTEl = ri2.getElementsByTagNameNS(NS_MODS, "title")[0];
          if (wTEl) s.websiteTitle = wTEl.textContent.trim();
        }
      }

      // Thesis note
      if (hasThesis && thesisNote) s.thesisNote = thesisNote.textContent.trim();

      // Website URL
      if (locUrlEl) s.url = locUrlEl.textContent.trim();
      var dcEl = root.getElementsByTagNameNS(NS_MODS, "dateCaptured")[0];
      if (dcEl) s.dateCaptured = dcEl.textContent.trim();

      // Extension (volumes)
      var extEl2 = root.getElementsByTagNameNS(NS_MODS, "extension")[0];
      if (extEl2) s.volumes = extEl2.textContent.trim();

      // Identifiers
      var idEls = root.getElementsByTagNameNS(NS_MODS, "identifier");
      for (var ii = 0; ii < idEls.length; ii++) {
        var idType = idEls[ii].getAttribute("type") || "";
        var idVal  = idEls[ii].textContent.trim();
        if (idType === "doi")  s.doi  = idVal;
        if (idType === "isbn") s.isbn = idVal;
      }

      // Top-level note (not thesis)
      var noteEls = root.getElementsByTagNameNS(NS_MODS, "note");
      for (var no = 0; no < noteEls.length; no++) {
        var noType = noteEls[no].getAttribute("type") || "";
        if (!noType) s.notes = noteEls[no].textContent.trim();
      }

    } catch (e) { /* leave defaults */ }
    return s;
  }

  function parseNameEl(nameEl) {
    var c = { pyFamily: "", pyGiven: "", zhFamily: "", zhGiven: "", role: "author", href: "" };
    c.href = (nameEl.getAttributeNS(XLINK_NS, "href") || "").replace(/^#/, "");
    var parts = nameEl.getElementsByTagNameNS(NS_MODS, "namePart");
    for (var i = 0; i < parts.length; i++) {
      var p      = parts[i];
      var pType  = p.getAttribute("type") || "";
      var pLang  = p.getAttribute("lang") || "";
      var pTrans = p.getAttribute("transliteration") || "";
      var pText  = p.textContent.trim();
      if (pLang === "zh") {
        if (pType === "family") c.zhFamily = pText;
        else if (pType === "given") c.zhGiven = pText;
      } else if (pTrans === "pinyin") {
        if (pType === "family") c.pyFamily = pText;
        else if (pType === "given") c.pyGiven = pText;
      } else {
        if (pType === "family") c.pyFamily = pText;
        else if (pType === "given") c.pyGiven = pText;
      }
    }
    var roleEl = nameEl.getElementsByTagNameNS(NS_MODS, "roleTerm")[0];
    if (roleEl) {
      var rType = roleEl.getAttribute("type") || "";
      c.role = rType === "etal" ? "et-al" : (roleEl.textContent.trim() || "author");
    }
    return c;
  }

  // ── Contributor UI ────────────────────────────────────────────────────────

  function makeContribRow(c, idx, listId) {
    var div = document.createElement("div");
    div.className = "contrib-row";
    div.dataset.idx = idx;

    var isEtal = c.role === "et-al";
    var mainHtml = '<div class="contrib-main">';
    if (!isEtal) {
      mainHtml += '<label style="flex:1.1">Family (Py/EN)<input type="text" class="form-input contrib-py-family" value="' + xmlEsc(c.pyFamily) + '" placeholder="Ledderose" /></label>';
      mainHtml += '<label style="flex:1">Given (Py/EN)<input type="text" class="form-input contrib-py-given" value="' + xmlEsc(c.pyGiven) + '" placeholder="Lothar" /></label>';
      mainHtml += '<label style="flex:.7">ZH 姓<input type="text" class="form-input contrib-zh-family" value="' + xmlEsc(c.zhFamily) + '" placeholder="陳" /></label>';
      mainHtml += '<label style="flex:.7">ZH 名<input type="text" class="form-input contrib-zh-given" value="' + xmlEsc(c.zhGiven) + '" placeholder="清香" /></label>';
    }
    mainHtml += '<label class="contrib-role-label">Role<select class="form-input contrib-role">';
    ["author", "editor", "translator", "et-al"].forEach(function (r) {
      mainHtml += '<option value="' + r + '"' + (c.role === r ? ' selected' : '') + '>' + r + '</option>';
    });
    mainHtml += '</select></label>';
    mainHtml += '<button type="button" class="btn small contrib-remove" style="margin-bottom:.1rem;flex:0 0 auto">×</button>';
    mainHtml += '</div>';

    if (!isEtal) {
      mainHtml += '<div class="contrib-aux">';
      mainHtml += '<label class="contrib-href-label">Authority key (without #)<input type="text" class="form-input contrib-href" value="' + xmlEsc(c.href) + '" placeholder="ledderose" /></label>';
      mainHtml += '</div>';
    }

    div.innerHTML = mainHtml;

    div.querySelector(".contrib-remove").addEventListener("click", function () {
      div.remove();
      update();
    });

    div.querySelector(".contrib-role").addEventListener("change", function () {
      var newRole = this.value;
      var parent = this.closest(".contrib-row");
      // rebuild row with correct fields for et-al vs normal
      var curC = readContribRow(parent);
      curC.role = newRole;
      var newRow = makeContribRow(curC, idx, listId);
      parent.parentNode.replaceChild(newRow, parent);
      update();
    });

    return div;
  }

  function readContribRow(row) {
    function rq(cls) {
      var el = row.querySelector("." + cls);
      return el ? el.value.trim() : "";
    }
    return {
      pyFamily: rq("contrib-py-family"),
      pyGiven:  rq("contrib-py-given"),
      zhFamily: rq("contrib-zh-family"),
      zhGiven:  rq("contrib-zh-given"),
      role:     rq("contrib-role"),
      href:     rq("contrib-href")
    };
  }

  function readContribList(listId) {
    var rows = document.querySelectorAll("#" + listId + " .contrib-row");
    var out = [];
    rows.forEach(function (row) { out.push(readContribRow(row)); });
    return out;
  }

  function renderContribList(listId, items) {
    var container = document.getElementById(listId);
    if (!container) return;
    container.innerHTML = "";
    items.forEach(function (c, idx) {
      container.appendChild(makeContribRow(c, idx, listId));
    });
  }

  function addContrib(listId, role) {
    var cur = readContribList(listId);
    cur.push({ pyFamily: "", pyGiven: "", zhFamily: "", zhGiven: "", role: role, href: "" });
    renderContribList(listId, cur);
    update();
  }

  // ── Form ↔ state ──────────────────────────────────────────────────────────

  function readForm() {
    state.key          = gv("f-key");
    state.pubType      = gv("f-pub-type");
    state.reference    = gv("f-reference");
    state.titlePrimary = gv("f-title-primary");
    state.titleLang    = gv("f-title-lang");
    state.titleZh      = gv("f-title-zh");
    state.titlePinyin  = gv("f-title-pinyin");
    state.titleEnTrans = gv("f-title-en-trans");

    state.contributors = readContribList("contrib-list");

    // monograph
    state.year    = gv("f-year");
    state.placeEn = gv("f-place-en");
    state.placeZh = gv("f-place-zh");
    state.pubEn   = gv("f-pub-en");
    state.pubZh   = gv("f-pub-zh");
    state.series  = gv("f-series");
    state.volumes = gv("f-volumes");

    // article
    state.journalTitle   = gv("f-journal");
    state.journalTitleZh = gv("f-journal-zh");
    state.journalHref    = gv("f-journal-href");
    state.volume         = gv("f-volume");
    state.issue          = gv("f-issue");
    state.artYear        = gv("f-art-year");
    state.pageStart      = gv("f-page-start");
    state.pageEnd        = gv("f-page-end");

    // chapter
    state.hostTitle    = gv("f-host-title");
    state.hostTitleZh  = gv("f-host-title-zh");
    state.hostHref     = gv("f-host-href");
    state.hostEditors  = readContribList("host-editor-list");
    state.hostPlaceEn  = gv("f-host-place-en");
    state.hostPlaceZh  = gv("f-host-place-zh");
    state.hostPubEn    = gv("f-host-pub-en");
    state.hostPubZh    = gv("f-host-pub-zh");
    state.chapYear     = gv("f-chap-year");
    state.chapPageStart = gv("f-chap-page-start");
    state.chapPageEnd   = gv("f-chap-page-end");

    // thesis
    state.thesisNote = gv("f-thesis-note");
    state.thesisYear = gv("f-thesis-year");
    state.thesisInst = gv("f-thesis-inst");

    // website
    state.url          = gv("f-url");
    state.dateCaptured = gv("f-date-captured");
    state.websiteTitle = gv("f-website-title");
    state.webYear      = gv("f-web-year");

    state.doi   = gv("f-doi");
    state.isbn  = gv("f-isbn");
    state.notes = gv("f-notes");
  }

  function writeForm(st) {
    sv("f-key",           st.key);
    sv("f-pub-type",      st.pubType);
    sv("f-reference",     st.reference);
    sv("f-title-primary", st.titlePrimary);
    sv("f-title-lang",    st.titleLang);
    sv("f-title-zh",      st.titleZh);
    sv("f-title-pinyin",  st.titlePinyin);
    sv("f-title-en-trans",st.titleEnTrans);

    renderContribList("contrib-list",     st.contributors);
    renderContribList("host-editor-list", st.hostEditors);

    sv("f-year",    st.year);
    sv("f-place-en",st.placeEn);
    sv("f-place-zh",st.placeZh);
    sv("f-pub-en",  st.pubEn);
    sv("f-pub-zh",  st.pubZh);
    sv("f-series",  st.series);
    sv("f-volumes", st.volumes);

    sv("f-journal",      st.journalTitle);
    sv("f-journal-zh",   st.journalTitleZh);
    sv("f-journal-href", st.journalHref);
    sv("f-volume",       st.volume);
    sv("f-issue",        st.issue);
    sv("f-art-year",     st.artYear);
    sv("f-page-start",   st.pageStart);
    sv("f-page-end",     st.pageEnd);

    sv("f-host-title",    st.hostTitle);
    sv("f-host-title-zh", st.hostTitleZh);
    sv("f-host-href",     st.hostHref);
    sv("f-host-place-en", st.hostPlaceEn);
    sv("f-host-place-zh", st.hostPlaceZh);
    sv("f-host-pub-en",   st.hostPubEn);
    sv("f-host-pub-zh",   st.hostPubZh);
    sv("f-chap-year",      st.chapYear);
    sv("f-chap-page-start",st.chapPageStart);
    sv("f-chap-page-end",  st.chapPageEnd);

    sv("f-thesis-note", st.thesisNote);
    sv("f-thesis-year", st.thesisYear);
    sv("f-thesis-inst", st.thesisInst);

    sv("f-url",           st.url);
    sv("f-date-captured", st.dateCaptured);
    sv("f-website-title", st.websiteTitle);
    sv("f-web-year",      st.webYear);

    sv("f-doi",   st.doi);
    sv("f-isbn",  st.isbn);
    sv("f-notes", st.notes);

    showSection(st.pubType);
  }

  function showSection(type) {
    ["monograph", "article", "chapter", "thesis", "website"].forEach(function (t) {
      var el = document.getElementById("section-" + t);
      if (el) el.classList.toggle("active", t === type);
    });
  }

  function update() {
    readForm();
    var xml = buildMods();
    var out = document.getElementById("biblio-xml-out");
    if (out) out.textContent = xml;
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", function () {

    // Preload from bibliography browser "Edit" button
    var raw = sessionStorage.getItem("epiwen_preload_biblio");
    if (raw) {
      sessionStorage.removeItem("epiwen_preload_biblio");
      try {
        var preload = JSON.parse(raw);
        var parsed = preload.xml ? parseMods(preload.xml) : {};
        // Top-level index fields override parsed (for fields browser already has)
        if (preload.key)       parsed.key       = preload.key;
        if (preload.reference) parsed.reference  = preload.reference;
        if (preload.pub_type)  parsed.pubType    = preload.pub_type;
        // Store group for save path
        if (preload.group) state._group = preload.group;
        Object.assign(state, parsed);
        writeForm(state);
        var h = document.getElementById("editor-heading");
        if (h && state.key) h.textContent = "Edit: " + state.key;
      } catch (e) { console.warn("preload parse error", e); }
    }

    // Show correct type section
    showSection(state.pubType);
    update();

    // Live update on any form input
    document.getElementById("biblio-form").addEventListener("input", update);

    // Type change
    document.getElementById("f-pub-type").addEventListener("change", function () {
      showSection(this.value);
      update();
    });

    // Contributor buttons
    document.getElementById("btn-add-author").addEventListener("click",
      function () { addContrib("contrib-list", "author"); });
    document.getElementById("btn-add-editor").addEventListener("click",
      function () { addContrib("contrib-list", "editor"); });
    document.getElementById("btn-add-translator").addEventListener("click",
      function () { addContrib("contrib-list", "translator"); });
    document.getElementById("btn-add-etal").addEventListener("click",
      function () { addContrib("contrib-list", "et-al"); });
    document.getElementById("btn-add-host-editor").addEventListener("click",
      function () { addContrib("host-editor-list", "editor"); });

    // Copy XML
    document.getElementById("biblio-preview-copy").addEventListener("click", function () {
      var out = document.getElementById("biblio-xml-out");
      var xml = out ? out.textContent : "";
      navigator.clipboard.writeText(xml)
        .then(function () { toast("XML copied"); })
        .catch(function () {
          try {
            var r = document.createRange();
            r.selectNode(out);
            window.getSelection().addRange(r);
            document.execCommand("copy");
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
      var key = state.key.trim();
      if (!key) { toast("Enter a citation key first", true); return; }
      if (!/^[A-Za-z0-9_\-\.]+$/.test(key)) {
        toast("Key may only contain letters, digits, _, - and .", true);
        return;
      }
      var group = state._group || key[0].toUpperCase();
      var xml   = buildMods();
      var relPath = "biblio/" + group + "/" + key + ".xml";
      if (window.EpiGitHub) {
        EpiGitHub.saveAt(xml, relPath, function () {
          var h = document.getElementById("editor-heading");
          if (h) h.textContent = "Edit: " + key;
          state._group = group;
        });
      } else {
        toast("GitHub module not loaded", true);
      }
    });
  });
})();
