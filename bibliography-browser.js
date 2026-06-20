/* bibliography-browser.js — full-citation list + structured HTML/XML detail pane */
(function () {
  "use strict";

  var allRecords    = [];
  var _publicRecords  = [];
  var _privateRecords = [];
  var currentFilter = "all";
  var currentQuery  = "";
  var yearMin       = 0;
  var yearMax       = 9999;
  // per-selection state for the XML/fields toggle
  var _selectedRec  = null;
  var _selectedXml  = null;
  var _detailMode   = "fields"; // "fields" | "xml"

  // ── Utilities ─────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function toast(msg, isErr) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.className = "show" + (isErr ? " toast-error" : "");
    setTimeout(function () { el.className = ""; }, isErr ? 6000 : 3000);
  }

  // ── Citation helpers ──────────────────────────────────────────────────────

  function nameWithCjk(western, cjk) {
    // CJK-only names (no romanisation) fall back to the CJK form in both
    // fields — show it once, not "中文 中文".
    if (western && cjk && western === cjk) return "<span lang=\"zh\">" + esc(cjk) + "</span>";
    if (western && cjk)  return esc(western) + " <span lang=\"zh\">" + esc(cjk) + "</span>";
    if (western)         return esc(western);
    return cjk ? "<span lang=\"zh\">" + esc(cjk) + "</span>" : "";
  }

  function nameListHtml(ws, zs, roleHtml) {
    // ws = ["Family, Given", …]  zs = ["中文", …]
    if (!ws.length && !zs.length) return "";
    var max = Math.max(ws.length, zs.length);
    var parts = [];
    for (var i = 0; i < max; i++) {
      parts.push(nameWithCjk(ws[i] || "", zs[i] || ""));
    }
    var joined = "";
    if (parts.length === 1) joined = parts[0];
    else if (parts.length === 2) joined = parts[0] + " and " + parts[1];
    else joined = parts.slice(0, -1).join(", ") + ", and " + parts[parts.length - 1];
    return joined + (roleHtml || "");
  }

  function titleHtml(main, zh, en, italic) {
    // main = translit/EN, zh = CJK native, en = translated title
    var parts = [];
    if (main) {
      parts.push(italic
        ? "<em>" + esc(main) + "</em>"
        : esc(main));
    }
    if (zh) parts.push("<span lang=\"zh\">" + esc(zh) + "</span>");
    // show translation only when primary is non-Latin (i.e., all-CJK main)
    if (en && main && /^[a-zA-Z]/.test(main)) {
      // main is Latin → translation is redundant, skip
    } else if (en) {
      parts.push("[" + esc(en) + "]");
    }
    return parts.join(" ");
  }

  function pagesStr(start, end) {
    if (!start) return "";
    return (end && end !== start) ? start + "–" + end : start;
  }

  // ── Full Chicago citation from index record ───────────────────────────────

  function formatCitation(rec) {
    var html = "";
    var pt = rec.pub_type;

    // Contributors block — author, else editor, else translator
    if (rec.author && rec.author.length) {
      html += "<strong>" + nameListHtml(rec.author, rec.author_zh || [], "") + ".</strong> ";
    } else if (rec.editor && rec.editor.length) {
      var suf = rec.editor.length === 1 ? ", ed" : ", eds";
      html += "<strong>" + nameListHtml(rec.editor, rec.editor_zh || [], suf) + ".</strong> ";
    } else if (rec.translator && rec.translator.length) {
      html += "<strong>" + nameListHtml(rec.translator, rec.translator_zh || [], ", trans") + ".</strong> ";
    }

    if (pt === "article") {
      // "Article title." *Journal* vol, no. N (year): pp–pp.
      html += "“" + titleHtml(rec.title, rec.title_zh, rec.title_en, false) + ".” ";
      html += titleHtml(rec.journal || "", rec.journal_zh || "", "", true);
      var loc = "";
      if (rec.volume && rec.issue)  loc = " " + esc(rec.volume) + ", no. " + esc(rec.issue) + " (" + esc(rec.year) + ")";
      else if (rec.volume)          loc = " " + esc(rec.volume) + " (" + esc(rec.year) + ")";
      else if (rec.issue)           loc = " no. " + esc(rec.issue) + " (" + esc(rec.year) + ")";
      else if (rec.year)            loc = " (" + esc(rec.year) + ")";
      var pp = pagesStr(rec.page_start, rec.page_end);
      html += loc + ": " + (pp || "—") + ".";

    } else if (pt === "chapter") {
      // "Chapter." In *Book*, eds. Editor. Place: Pub, year, pp–pp.
      html += "“" + titleHtml(rec.title, rec.title_zh, rec.title_en, false) + ".” ";
      html += "In " + titleHtml(rec.host_title || "", rec.host_title_zh || "", "", true);
      var heditors = rec.host_editor || [];
      var heditors_z = rec.host_editor_zh || [];
      if (heditors.length) {
        var heSuf = heditors.length === 1 ? ", ed. " : ", eds. ";
        html += heSuf + nameListHtml(heditors, heditors_z, "");
      }
      html += ". ";
      var pi2 = [];
      if (rec.host_place)     pi2.push(esc(rec.host_place));
      if (rec.host_publisher) pi2.push(esc(rec.host_publisher));
      if (rec.year)           pi2.push(esc(rec.year));
      if (pi2.length) html += pi2.join(": ").replace(": " + esc(rec.year), ", " + esc(rec.year)) + "";
      var pp2 = pagesStr(rec.page_start, rec.page_end);
      if (pp2) html += ", " + pp2;
      html += ".";

    } else {
      // monograph / edited / other
      html += titleHtml(rec.title, rec.title_zh, rec.title_en, true);
      html += ". ";
      var pi = [];
      var sep = "";
      if (rec.place && rec.publisher) { pi.push(esc(rec.place) + ": " + esc(rec.publisher)); }
      else if (rec.place)             { pi.push(esc(rec.place)); }
      else if (rec.publisher)         { pi.push(esc(rec.publisher)); }
      if (rec.year) pi.push(esc(rec.year));
      html += pi.join(", ") + ".";
    }

    return html;
  }

  // ── Load index ────────────────────────────────────────────────────────────

  function loadIndex() {
    var list = document.getElementById("biblio-list");
    list.innerHTML = '<div class="catalog-loading">Loading bibliography…</div>';
    EpiData.fetch("data/biblio-index.json")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) { _publicRecords = data; mergePrivate(); })
      .catch(function (err) {
        list.innerHTML = '<div class="catalog-loading">Error: ' + esc(err.message) + '</div>';
      });
  }

  // Merge private bibliography entries from enabled collections (re-run on toggle).
  function mergePrivate() {
    if (!window.EpiCollections) { allRecords = _publicRecords.slice(); renderList(); return; }
    EpiCollections.loadIndex("biblio")
      .then(function (priv) {
        _privateRecords = priv || [];
        allRecords = _publicRecords.concat(_privateRecords);
        renderList();
      })
      .catch(function () { allRecords = _publicRecords.slice(); renderList(); });
  }

  // ── Filter + render list ──────────────────────────────────────────────────

  function filteredRecords() {
    var q = currentQuery.toLowerCase();
    return allRecords.filter(function (r) {
      if (currentFilter !== "all" && r.pub_type !== currentFilter) return false;
      var yr = parseInt(r.year, 10) || 0;
      if (yearMin && yr && yr < yearMin) return false;
      if (yearMax < 9999 && yr && yr > yearMax) return false;
      if (q) {
        var hay = [
          r.key || "", r.reference || "", r.title || "", r.title_zh || "", r.title_en || "",
          (r.author || []).join(" "), (r.author_zh || []).join(" "),
          (r.editor || []).join(" "), (r.editor_zh || []).join(" "),
          (r.translator || []).join(" "), (r.translator_zh || []).join(" "),
          r.journal || "", r.host_title || ""
        ].join(" ").toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function renderList() {
    var recs = filteredRecords();
    var countEl = document.getElementById("biblio-count");
    if (countEl) countEl.textContent = recs.length + " of " + allRecords.length;
    var list = document.getElementById("biblio-list");
    if (!recs.length) {
      list.innerHTML = '<div class="catalog-loading">No records match.</div>';
      return;
    }
    var frag = document.createDocumentFragment();
    recs.forEach(function (rec) { frag.appendChild(buildListItem(rec)); });
    list.innerHTML = "";
    list.appendChild(frag);
  }

  function buildListItem(rec) {
    var div = document.createElement("div");
    div.className = "catalog-item";
    div.dataset.biblioKey = rec.key;

    var cite = document.createElement("div");
    cite.className = "biblio-list-cite";
    if (rec.source === "private") {
      cite.innerHTML = '<span class="catalog-badge-private" title="Private collection">🔒 ' +
        esc(rec.collectionTitle || rec.collection || "private") + '</span> ';
    }
    cite.innerHTML += formatCitation(rec);
    div.appendChild(cite);

    div.addEventListener("click", function () { selectRecord(rec, div); });
    return div;
  }

  function selectRecord(rec, itemEl) {
    var prev = document.querySelector(".catalog-item.selected");
    if (prev) prev.classList.remove("selected");
    if (itemEl) itemEl.classList.add("selected");
    _selectedRec = rec;
    _selectedXml = null;
    showDetailLoading(rec);
  }

  // ── Detail pane ───────────────────────────────────────────────────────────

  function showDetailLoading(rec) {
    var titleEl = document.getElementById("preview-title");
    if (titleEl) titleEl.textContent = rec.reference || rec.key;
    var contentEl = document.getElementById("biblio-detail-content");
    if (contentEl) contentEl.innerHTML = '<div class="catalog-loading">Loading…</div>';

    var relPath = "biblio/" + rec.group + "/" + rec.key + ".xml";
    var xmlPromise = (rec.source === "private" && window.EpiCollections)
      ? EpiCollections.fetchRecordXml(rec.collection, relPath)
      : EpiData.fetch(relPath).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); });
    xmlPromise
      .then(function (xml) {
        _selectedXml = xml;
        renderDetail(rec, xml);
      })
      .catch(function (err) {
        var contentEl2 = document.getElementById("biblio-detail-content");
        if (contentEl2) contentEl2.innerHTML =
          '<div style="padding:1rem"><p class="catalog-date">Could not load XML: ' + esc(err.message) + '</p>' +
          '<div style="font-size:.97em;line-height:1.7">' + formatCitation(rec) + '</div></div>';
      });
  }

  function renderDetail(rec, xml) {
    if (_detailMode === "xml") {
      renderDetailXml(rec, xml);
    } else {
      renderDetailFields(rec, xml);
    }
  }

  function makeToggleBar(rec, xml) {
    var bar = '<div class="detail-toggle-bar" style="display:flex;gap:.4rem;align-items:center;margin-bottom:.9rem">';
    bar += '<button class="btn small' + (_detailMode === "fields" ? " active" : "") + '" id="det-fields-btn">Fields</button>';
    bar += '<button class="btn small' + (_detailMode === "xml"    ? " active" : "") + '" id="det-xml-btn">XML source</button>';
    bar += '<button class="btn small primary" id="det-edit-btn" style="margin-left:auto">Edit</button>';
    bar += '<button class="btn small" id="det-copy-btn">Copy XML</button>';
    bar += '</div>';
    return bar;
  }

  function bindToggleBar(rec, xml) {
    var fieldsBtn = document.getElementById("det-fields-btn");
    var xmlBtn    = document.getElementById("det-xml-btn");
    var editBtn   = document.getElementById("det-edit-btn");
    var copyBtn   = document.getElementById("det-copy-btn");

    if (fieldsBtn) fieldsBtn.addEventListener("click", function () {
      _detailMode = "fields";
      renderDetailFields(rec, xml);
    });
    if (xmlBtn) xmlBtn.addEventListener("click", function () {
      _detailMode = "xml";
      renderDetailXml(rec, xml);
    });
    if (editBtn) editBtn.addEventListener("click", function () {
      sessionStorage.setItem("epiwen_preload_biblio", JSON.stringify({
        key: rec.key, group: rec.group, reference: rec.reference,
        pub_type: rec.pub_type, xml: xml
      }));
      window.location.href = "biblio-editor.html";
    });
    if (copyBtn) copyBtn.addEventListener("click", function () {
      navigator.clipboard.writeText(xml)
        .then(function () { toast("XML copied"); })
        .catch(function (e) { toast("Copy failed: " + e.message, true); });
    });
  }

  function dlRow(term, value) {
    if (!value) return "";
    return '<div class="biblio-field-row"><dt>' + esc(term) + '</dt><dd>' + value + '</dd></div>';
  }

  function renderDetailFields(rec, xml) {
    var titleEl = document.getElementById("preview-title");
    if (titleEl) titleEl.textContent = rec.reference || rec.key;
    var contentEl = document.getElementById("biblio-detail-content");
    if (!contentEl) return;

    var html = '<div style="padding:1rem 1.2rem">';
    html += makeToggleBar(rec, xml);

    // Full citation
    html += '<div class="biblio-citation" style="font-size:.97em;line-height:1.7;margin-bottom:1.2rem;padding-bottom:.8rem;border-bottom:1px solid var(--border)">';
    html += formatCitation(rec);
    html += '</div>';

    // Structured fields
    html += '<dl class="biblio-fields">';

    // Contributors
    var authors = nameListHtml(rec.author || [], rec.author_zh || [], "");
    var editors = nameListHtml(rec.editor || [], rec.editor_zh || [], "");
    var translators = nameListHtml(rec.translator || [], rec.translator_zh || [], "");
    if (authors) html += dlRow("Author(s)", authors);
    if (editors) html += dlRow("Editor(s)", editors);
    if (translators) html += dlRow("Translator(s)", translators);

    // Titles
    if (rec.title)    html += dlRow("Title", "<em>" + esc(rec.title) + "</em>");
    if (rec.title_zh) html += dlRow("Title (Chinese/Japanese)", "<span lang=\"zh\">" + esc(rec.title_zh) + "</span>");
    if (rec.title_en) html += dlRow("Translation", esc(rec.title_en));

    // Publication info by type
    var pt = rec.pub_type;
    if (pt === "article") {
      html += dlRow("Journal", rec.journal ? ("<em>" + esc(rec.journal) + "</em>" + (rec.journal_zh ? " <span lang=\"zh\">" + esc(rec.journal_zh) + "</span>" : "")) : "");
      html += dlRow("Volume",  esc(rec.volume));
      html += dlRow("Issue",   esc(rec.issue));
      html += dlRow("Pages",   esc(pagesStr(rec.page_start, rec.page_end)));
      html += dlRow("Year",    esc(rec.year));
    } else if (pt === "chapter") {
      html += dlRow("In", titleHtml(rec.host_title || "", rec.host_title_zh || "", "", true));
      var hedHtml = nameListHtml(rec.host_editor || [], rec.host_editor_zh || [], "");
      if (hedHtml) html += dlRow((rec.host_editor || []).length === 1 ? "Host editor" : "Host editors", hedHtml);
      html += dlRow("Pages",     esc(pagesStr(rec.page_start, rec.page_end)));
      html += dlRow("Place",     esc(rec.host_place));
      html += dlRow("Publisher", esc(rec.host_publisher));
      html += dlRow("Year",      esc(rec.year));
    } else {
      html += dlRow("Place",     esc(rec.place));
      html += dlRow("Publisher", esc(rec.publisher));
      html += dlRow("Year",      esc(rec.year));
    }

    // Identifiers
    html += dlRow("Type",  esc(pt));
    html += dlRow("Key",   "<code>" + esc(rec.key) + "</code>");
    html += dlRow("Group", esc(rec.group));

    html += '</dl>';
    html += '</div>';

    contentEl.innerHTML = html;
    bindToggleBar(rec, xml);
  }

  function syntaxColorXml(raw) {
    return esc(raw)
      .replace(/(&lt;\/?[a-zA-Z][^&gt;]*?&gt;)/g, '<span class="xml-tag">$1</span>')
      .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="xml-comment">$1</span>');
  }

  function renderDetailXml(rec, xml) {
    var titleEl = document.getElementById("preview-title");
    if (titleEl) titleEl.textContent = rec.reference || rec.key;
    var contentEl = document.getElementById("biblio-detail-content");
    if (!contentEl) return;

    var html = '<div style="padding:1rem 1.2rem">';
    html += makeToggleBar(rec, xml);
    html += '<pre class="biblio-xml-pre" style="font-size:.78em;line-height:1.5;overflow-x:auto;white-space:pre-wrap;word-break:break-all">';
    html += syntaxColorXml(xml);
    html += '</pre></div>';

    contentEl.innerHTML = html;
    bindToggleBar(rec, xml);
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", function () {
    loadIndex();

    if (window.EpiCollections) {
      EpiCollections.mountBar(document.getElementById("collections-bar"));
      EpiCollections.onChange(mergePrivate);
    }

    document.getElementById("biblio-search").addEventListener("input", function () {
      currentQuery = this.value.trim();
      renderList();
    });

    document.querySelectorAll(".biblio-tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll(".biblio-tab-btn").forEach(function (b) { b.classList.remove("active"); });
        this.classList.add("active");
        currentFilter = this.dataset.filter;
        renderList();
      });
    });

    var yearMinEl = document.getElementById("year-min");
    var yearMaxEl = document.getElementById("year-max");
    if (yearMinEl) yearMinEl.addEventListener("input", function () {
      yearMin = parseInt(this.value, 10) || 0; renderList();
    });
    if (yearMaxEl) yearMaxEl.addEventListener("input", function () {
      yearMax = parseInt(this.value, 10) || 9999; renderList();
    });
  });
})();
