/* authority-app.js — MADS authority record form editor */
(function () {
  "use strict";

  var NS = "http://www.loc.gov/mads/";

  // ── State ─────────────────────────────────────────────────────────────────

  var state = {
    id:        "",
    nameType:  "personal",
    zhFamily:  "", zhGiven: "", zhWhole: "",
    pyFamily:  "", pyGiven: "",
    enFamily:  "", enGiven: "",
    corpName:  "", corpLang: "en",
    wikidata:  "", viaf: "", gnd: "", dila: "", cbdb: "",
    notes:     ""
  };

  // ── XML builder ───────────────────────────────────────────────────────────

  function xmlEsc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function buildMads() {
    var s = state;
    var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<mads xmlns="http://www.loc.gov/mads/"';
    xml += ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"';
    xml += ' xsi:schemaLocation="http://www.loc.gov/mads/ http://data.stonesutras.org:8080/exist/servlet/db/schema/mads.xsd"';
    xml += ' ID="' + xmlEsc(s.id) + '">\n';

    if (s.nameType === "corporate") {
      xml += '  <authority xmlns:ns1="http://www.w3.org/1999/xlink" ns1:type="simple"';
      xml += ' lang="' + xmlEsc(s.corpLang || "en") + '">\n';
      xml += '    <name type="corporate">\n';
      xml += '      <namePart>' + xmlEsc(s.corpName) + '</namePart>\n';
      xml += '    </name>\n  </authority>\n';

    } else {
      // Personal: prefer CJK form as authority if present, else western
      var hasCjk = s.zhFamily || s.zhGiven || s.zhWhole;
      var hasEn  = s.enFamily || s.enGiven;
      var hasPy  = s.pyFamily || s.pyGiven;

      if (hasCjk) {
        xml += '  <authority xmlns:ns1="http://www.w3.org/1999/xlink" ns1:type="simple" lang="zh">\n';
        xml += '    <name type="personal">\n';
        if (s.zhWhole) {
          xml += '      <namePart>' + xmlEsc(s.zhWhole) + '</namePart>\n';
        } else {
          if (s.zhFamily) xml += '      <namePart type="family">' + xmlEsc(s.zhFamily) + '</namePart>\n';
          if (s.zhGiven)  xml += '      <namePart type="given">'  + xmlEsc(s.zhGiven)  + '</namePart>\n';
        }
        xml += '    </name>\n  </authority>\n';
      } else if (hasEn) {
        xml += '  <authority xmlns:ns1="http://www.w3.org/1999/xlink" ns1:type="simple" lang="en">\n';
        xml += '    <name type="personal">\n';
        if (s.enFamily) xml += '      <namePart type="family">' + xmlEsc(s.enFamily) + '</namePart>\n';
        if (s.enGiven)  xml += '      <namePart type="given">'  + xmlEsc(s.enGiven)  + '</namePart>\n';
        xml += '    </name>\n  </authority>\n';
      }

      if (hasPy) {
        xml += '  <variant transliteration="pinyin">\n';
        xml += '    <name type="personal">\n';
        if (s.pyFamily) xml += '      <namePart type="family">' + xmlEsc(s.pyFamily) + '</namePart>\n';
        if (s.pyGiven)  xml += '      <namePart type="given">'  + xmlEsc(s.pyGiven)  + '</namePart>\n';
        xml += '    </name>\n  </variant>\n';
      }

      // Western variant (only when CJK is primary)
      if (hasCjk && hasEn) {
        xml += '  <variant lang="en">\n';
        xml += '    <name type="personal">\n';
        if (s.enFamily) xml += '      <namePart type="family">' + xmlEsc(s.enFamily) + '</namePart>\n';
        if (s.enGiven)  xml += '      <namePart type="given">'  + xmlEsc(s.enGiven)  + '</namePart>\n';
        xml += '    </name>\n  </variant>\n';
      }
    }

    if (s.wikidata) xml += '  <identifier type="wikidata">' + xmlEsc(s.wikidata) + '</identifier>\n';
    if (s.viaf)     xml += '  <identifier type="viaf">'     + xmlEsc(s.viaf)     + '</identifier>\n';
    if (s.gnd)      xml += '  <identifier type="gnd">'      + xmlEsc(s.gnd)      + '</identifier>\n';
    if (s.dila)     xml += '  <identifier type="dila">'     + xmlEsc(s.dila)     + '</identifier>\n';
    if (s.cbdb)     xml += '  <identifier type="cbdb">'     + xmlEsc(s.cbdb)     + '</identifier>\n';

    if (s.notes) xml += '  <note>' + xmlEsc(s.notes) + '</note>\n';

    xml += '</mads>';
    return xml;
  }

  // ── XML parser (for preload) ───────────────────────────────────────────────

  function parseMads(xml) {
    var st = Object.assign({}, state);
    try {
      var doc = new DOMParser().parseFromString(xml, "application/xml");
      var mads = doc.documentElement;
      if (!mads || mads.nodeName === "parsererror") return st;

      st.id = mads.getAttribute("ID") || "";

      // Authority form
      var auth = mads.getElementsByTagNameNS(NS, "authority")[0];
      if (auth) {
        var authName = auth.getElementsByTagNameNS(NS, "name")[0];
        if (authName) {
          var nameType = authName.getAttribute("type") || "personal";
          st.nameType = (nameType === "corporate") ? "corporate" : "personal";
          var authLang = auth.getAttribute("lang") || "en";

          if (st.nameType === "corporate") {
            var cp = authName.getElementsByTagNameNS(NS, "namePart")[0];
            st.corpName = cp ? (cp.textContent || "").trim() : "";
            st.corpLang = authLang;
          } else {
            var parts = authName.getElementsByTagNameNS(NS, "namePart");
            for (var i = 0; i < parts.length; i++) {
              var pt = parts[i].getAttribute("type") || "";
              var text = (parts[i].textContent || "").trim();
              if (authLang === "zh" || authLang === "ja") {
                if (pt === "family")     st.zhFamily = text;
                else if (pt === "given") st.zhGiven  = text;
                else if (!pt)            st.zhWhole  = text;
              } else {
                if (pt === "family")     st.enFamily = text;
                else if (pt === "given") st.enGiven  = text;
              }
            }
          }
        }
      }

      // Variants
      var variants = mads.getElementsByTagNameNS(NS, "variant");
      for (var vi = 0; vi < variants.length; vi++) {
        var v = variants[vi];
        var translit = v.getAttribute("transliteration") || "";
        var vLang = v.getAttribute("lang") || "";
        var vName = v.getElementsByTagNameNS(NS, "name")[0];
        if (!vName) continue;
        var vParts = vName.getElementsByTagNameNS(NS, "namePart");

        if (translit === "pinyin" || translit === "pinyin_tone") {
          for (var vpi = 0; vpi < vParts.length; vpi++) {
            var vpt = vParts[vpi].getAttribute("type") || "";
            var vt = (vParts[vpi].textContent || "").trim();
            if (vpt === "family")     st.pyFamily = vt;
            else if (vpt === "given") st.pyGiven  = vt;
          }
        } else if (vLang === "en" && st.nameType === "personal") {
          for (var epi = 0; epi < vParts.length; epi++) {
            var ept = vParts[epi].getAttribute("type") || "";
            var et = (vParts[epi].textContent || "").trim();
            if (ept === "family")     st.enFamily = st.enFamily || et;
            else if (ept === "given") st.enGiven  = st.enGiven  || et;
          }
        }
      }

      // Identifiers
      var idEls = mads.getElementsByTagNameNS(NS, "identifier");
      for (var ii = 0; ii < idEls.length; ii++) {
        var idType = idEls[ii].getAttribute("type") || "";
        var idVal  = (idEls[ii].textContent || "").trim();
        if (idType === "wikidata") st.wikidata = idVal;
        else if (idType === "viaf") st.viaf = idVal;
        else if (idType === "gnd")  st.gnd  = idVal;
        else if (idType === "dila") st.dila = idVal;
        else if (idType === "cbdb") st.cbdb = idVal;
      }

      // Notes
      var noteEl = mads.getElementsByTagNameNS(NS, "note")[0];
      if (noteEl) st.notes = (noteEl.textContent || "").trim();

    } catch (e) { /* leave defaults */ }
    return st;
  }

  // ── Form ↔ state ──────────────────────────────────────────────────────────

  function readForm() {
    state.id        = v("f-id");
    state.nameType  = v("f-type");
    state.zhFamily  = v("f-zh-family");
    state.zhGiven   = v("f-zh-given");
    state.zhWhole   = v("f-zh-whole");
    state.pyFamily  = v("f-py-family");
    state.pyGiven   = v("f-py-given");
    state.enFamily  = v("f-en-family");
    state.enGiven   = v("f-en-given");
    state.corpName  = v("f-corp-name");
    state.corpLang  = v("f-corp-lang");
    state.wikidata  = v("f-wikidata");
    state.viaf      = v("f-viaf");
    state.gnd       = v("f-gnd");
    state.dila      = v("f-dila");
    state.cbdb      = v("f-cbdb");
    state.notes     = v("f-notes");
  }

  function writeForm(st) {
    set("f-id",        st.id);
    set("f-type",      st.nameType);
    set("f-zh-family", st.zhFamily);
    set("f-zh-given",  st.zhGiven);
    set("f-zh-whole",  st.zhWhole);
    set("f-py-family", st.pyFamily);
    set("f-py-given",  st.pyGiven);
    set("f-en-family", st.enFamily);
    set("f-en-given",  st.enGiven);
    set("f-corp-name", st.corpName);
    set("f-corp-lang", st.corpLang);
    set("f-wikidata",  st.wikidata);
    set("f-viaf",      st.viaf);
    set("f-gnd",       st.gnd);
    set("f-dila",      st.dila);
    set("f-cbdb",      st.cbdb);
    set("f-notes",     st.notes);
    toggleNameType(st.nameType);
  }

  function v(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : "";
  }
  function set(id, val) {
    var el = document.getElementById(id);
    if (el) el.value = val || "";
  }

  function toggleNameType(type) {
    var pSec = document.getElementById("section-personal");
    var cSec = document.getElementById("section-corporate");
    if (!pSec || !cSec) return;
    pSec.style.display = (type === "personal")  ? "" : "none";
    cSec.style.display = (type === "corporate") ? "" : "none";
  }

  function update() {
    readForm();
    var xml = buildMads();
    var out = document.getElementById("auth-xml-out");
    if (out) out.textContent = xml;
  }

  // ── Toast ─────────────────────────────────────────────────────────────────

  function toast(msg, isErr) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.className = "show" + (isErr ? " toast-error" : "");
    setTimeout(function () { el.className = ""; }, isErr ? 6000 : 3000);
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", function () {
    // Default (public corpus) authorities are read-only here — no in-place delete.
    var _canDelete = true;
    // Show the Delete button once we're editing a deletable existing record.
    function revealDelete() {
      var db = document.getElementById("btn-delete-github");
      if (db && state.id && _canDelete) db.style.display = "";
    }

    // Preload from sessionStorage if editing an existing record
    var raw = sessionStorage.getItem("epiwen_preload_authority");
    if (raw) {
      sessionStorage.removeItem("epiwen_preload_authority");
      try {
        var preload = JSON.parse(raw);
        _canDelete = preload._canDelete !== false;
        var parsed = preload.xml ? parseMads(preload.xml) : state;
        // Overlay any top-level fields from the index record (covers enrichments)
        ["id","wikidata","viaf","gnd","dila_authority","cbdb"].forEach(function (k) {
          if (preload[k]) {
            var sk = k === "dila_authority" ? "dila" : k;
            if (preload[k]) parsed[sk] = preload[k];
          }
        });
        Object.assign(state, parsed);
        writeForm(state);
        var h = document.getElementById("editor-heading");
        if (h && state.id) h.textContent = "Edit: " + state.id;
        revealDelete();
      } catch (e) { console.warn("preload parse error", e); }
    }
    update();

    // Live update on any input change
    document.getElementById("auth-form").addEventListener("input", update);
    document.getElementById("f-type").addEventListener("change", function () {
      toggleNameType(this.value);
      update();
    });

    // Copy XML
    document.getElementById("auth-preview-copy").addEventListener("click", function () {
      var out = document.getElementById("auth-xml-out");
      var xml = out ? out.textContent : "";
      navigator.clipboard.writeText(xml)
        .then(function () { toast("XML copied"); })
        .catch(function () {
          try { var r = document.createRange(); r.selectNode(out); window.getSelection().addRange(r); document.execCommand("copy"); toast("XML copied"); } catch (e2) { toast("Copy failed", true); }
        });
    });

    // GitHub settings
    document.getElementById("btn-gh-settings").addEventListener("click", function () {
      if (window.EpiGitHub) EpiGitHub.showSettings();
    });

    // Authority typeahead: duplicate check / quick-load on name fields
    if (window.EpiAuthorityLookup) {
      function loadExisting(rec) {
        EpiData.fetch("authority/" + rec.id + ".xml")
          .then(function (r) { return r.ok ? r.text() : null; })
          .then(function (xml) {
            if (!xml) { toast("Could not load " + rec.id, true); return; }
            Object.assign(state, parseMads(xml));
            writeForm(state);
            update();
            var h = document.getElementById("editor-heading");
            if (h) h.textContent = "Edit: " + state.id;
            revealDelete();
            toast("Loaded: " + rec.display_name);
          })
          .catch(function () { toast("Could not load " + rec.id, true); });
      }
      EpiAuthorityLookup.attach(document.getElementById("f-py-family"), loadExisting);
      EpiAuthorityLookup.attach(document.getElementById("f-en-family"), loadExisting);
    }

    // Save
    document.getElementById("btn-save-github").addEventListener("click", function () {
      readForm();
      var id = state.id.trim();
      if (!id) { toast("Enter an ID (filename) first", true); return; }
      if (!/^[A-Za-z0-9_\-\.]+$/.test(id)) {
        toast("ID may only contain letters, digits, _, - and .", true);
        return;
      }
      var xml = buildMads();
      var relPath = "authority/" + id + ".xml";
      if (window.EpiGitHub) {
        EpiGitHub.saveAt(xml, relPath, function () {
          var h = document.getElementById("editor-heading");
          if (h) h.textContent = "Edit: " + id;
        });
      } else {
        toast("GitHub module not loaded", true);
      }
    });

    // Delete
    document.getElementById("btn-delete-github").addEventListener("click", function () {
      var id = (state.id || "").trim();
      if (!window.EpiGitHub || !id) return;
      var ask = (window.EpiModal && EpiModal.confirm)
        ? EpiModal.confirm({ title: "Delete entry", message: "Do you really want to delete this entry?",
                             confirmText: "Delete", cancelText: "Cancel", danger: true })
        : Promise.resolve(window.confirm("Do you really want to delete this entry?"));
      ask.then(function (ok) {
        if (!ok) return;
        EpiGitHub.deleteAt("authority/" + id + ".xml", function () {
          setTimeout(function () { window.location.href = "persons.html"; }, 800);
        });
      });
    });
  });
})();
