/* sites-browser.js — hierarchical site tree + dual-view (HTML/XML) detail pane.
 *
 * Tree:  main site  ->  section  ->  object (cave)  ->  inscription sigla [brackets]
 * Detail: click a site/cave -> right pane shows pure data + prose description,
 *         toggled between rendered HTML and raw XML.
 *
 * Data: data/site-index.json (built by AI/scripts/build_site_data.py).
 * XML:  catalog/<id>_site.xml (structured), publication/Site_<id>.xml (prose).
 */
(function () {
  "use strict";

  var TEI = "http://www.tei-c.org/ns/1.0";

  var allRecords = [];
  var byId = {};
  var byParent = {};        // parentId -> [records]
  var selectedId = null;
  var viewMode = "html";    // "html" | "xml"
  var cache = {};           // id -> { siteXml, proseXml }

  // ── utils ──────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function el(id) { return document.getElementById(id); }
  function label(r) {
    return esc(r.title_en || r.id) +
      (r.title_zh ? ' <span class="tree-label-zh">' + esc(r.title_zh) + "</span>" : "");
  }
  function toast(msg, isErr) {
    var t = el("toast"); if (!t) return;
    t.textContent = msg; t.className = "show" + (isErr ? " toast-error" : "");
    setTimeout(function () { t.className = ""; }, isErr ? 6000 : 3000);
  }

  // ── load ─────────────────────────────────────────────────────────────────────

  function load() {
    var tree = el("site-tree");
    tree.innerHTML = '<div class="catalog-loading">Loading sites…</div>';
    EpiData.fetch("data/site-index.json")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) {
        allRecords = data;
        byId = {}; byParent = {};
        data.forEach(function (r) {
          byId[r.id] = r;
          (byParent[r.parent || ""] = byParent[r.parent || ""] || []).push(r);
        });
        renderTree("");
        // Deep-link from the map: sites.html?site=<id>
        var want = new URLSearchParams(location.search).get("site");
        if (want && byId[want]) showDetail(want);
      })
      .catch(function (e) {
        tree.innerHTML = '<div class="catalog-loading">Error: ' + esc(e.message) + "</div>";
      });
  }

  // ── tree ───────────────────────────────────────────────────────────────────

  function renderTree(query) {
    var tree = el("site-tree");
    tree.innerHTML = "";
    var roots = (byParent[""] || []).slice().sort(function (a, b) {
      return (a.title_en || a.id).localeCompare(b.title_en || b.id);
    });
    var q = (query || "").trim().toLowerCase();
    if (q) {
      roots = roots.filter(function (r) {
        return ((r.title_en || "") + " " + (r.title_zh || "") + " " +
                (r.id || "") + " " + (r.province_en || "")).toLowerCase().indexOf(q) !== -1;
      });
    }
    el("site-count").textContent = "(" + roots.length + (q ? " match" : " top-level") + ")";
    if (!roots.length) { tree.innerHTML = '<div class="catalog-loading">No sites.</div>'; return; }
    roots.forEach(function (r) { tree.appendChild(renderSite(r, q && roots.length <= 3)); });
  }

  function caret(open) {
    var c = document.createElement("span");
    c.className = "tree-caret" + (open ? " open" : "");
    c.textContent = "▶";
    return c;
  }
  function leafCaret() {
    var c = document.createElement("span");
    c.className = "tree-caret leaf"; c.textContent = "▶";
    return c;
  }

  // a clickable row that opens the detail pane
  function detailRow(rec, extraClass) {
    var row = document.createElement("div");
    row.className = "tree-row" + (extraClass ? " " + extraClass : "");
    row.dataset.id = rec.id;
    row.addEventListener("click", function (e) {
      e.stopPropagation();
      showDetail(rec.id);
    });
    return row;
  }

  function renderSite(site, autoOpen) {
    var wrap = document.createElement("div");
    wrap.className = "tree-site";

    var kids = (byParent[site.id] || []);
    var hasKids = kids.length > 0;
    var expandable = hasKids;

    var row = detailRow(site);
    var car = expandable ? caret(autoOpen) : leafCaret();
    row.appendChild(car);
    var lab = document.createElement("span");
    lab.innerHTML = label(site) + '<span class="tree-id">' + esc(site.id) + "</span>" +
      (site.has_description ? '<span class="badge-desc">desc</span>' : "");
    row.appendChild(lab);
    wrap.appendChild(row);

    if (!expandable) return wrap;

    var children = document.createElement("div");
    children.className = "tree-children" + (autoOpen ? " open" : "");

    if (hasKids) {
      var sectioned = kids.some(function (k) { return k.section; });
      if (sectioned) {
        renderSections(children, kids);
      } else {
        kids.slice()
          .sort(function (a, b) { return (a.title_en || a.id).localeCompare(b.title_en || b.id); })
          .forEach(function (k) { children.appendChild(renderObject(k)); });
      }
    }

    wrap.appendChild(children);

    car.addEventListener("click", function (e) {
      e.stopPropagation();
      children.classList.toggle("open");
      car.classList.toggle("open");
    });
    return wrap;
  }

  // group a site's children by section -> caves
  function renderSections(container, kids) {
    var order = [], groups = {};
    kids.forEach(function (k) {
      var sec = k.section || "(none)";
      if (!groups[sec]) { groups[sec] = []; order.push(sec); }
      groups[sec].push(k);
    });
    order.sort();
    order.forEach(function (sec) {
      var grp = groups[sec];
      var secRec = grp.filter(function (k) { return !k.cave; })[0];
      var caves = grp.filter(function (k) { return k.cave; })
        .sort(function (a, b) { return (parseInt(a.cave, 10) || 0) - (parseInt(b.cave, 10) || 0); });

      var secWrap = document.createElement("div");
      secWrap.className = "tree-section";
      var hasCaveKids = caves.length > 0;

      var row = secRec ? detailRow(secRec) : document.createElement("div");
      if (!secRec) row.className = "tree-row";
      var car = hasCaveKids ? caret(false) : leafCaret();
      row.insertBefore(car, row.firstChild || null);
      var lab = document.createElement("span");
      lab.innerHTML = "Section " + esc(sec) +
        (secRec && secRec.has_description ? '<span class="badge-desc">desc</span>' : "");
      row.appendChild(lab);
      secWrap.appendChild(row);

      if (hasCaveKids) {
        var box = document.createElement("div");
        box.className = "tree-children";
        caves.forEach(function (c) { box.appendChild(renderObject(c)); });
        secWrap.appendChild(box);
        car.addEventListener("click", function (e) {
          e.stopPropagation();
          box.classList.toggle("open"); car.classList.toggle("open");
        });
      }
      container.appendChild(secWrap);
    });
  }

  // an object node (cave / wall) + its bracketed inscription sigla
  function renderObject(obj) {
    var wrap = document.createElement("div");
    var row = detailRow(obj);
    row.appendChild(leafCaret());
    var lab = document.createElement("span");
    lab.innerHTML = label(obj) +
      (obj.cave ? "" : '<span class="tree-id">' + esc(obj.id) + "</span>") +
      (obj.has_description ? '<span class="badge-desc">desc</span>' : "");
    row.appendChild(lab);
    wrap.appendChild(row);
    return wrap;
  }

  // ── detail pane ──────────────────────────────────────────────────────────────

  function showDetail(id) {
    var rec = byId[id];
    if (!rec) return;
    selectedId = id;
    document.querySelectorAll(".tree-row.selected").forEach(function (r) { r.classList.remove("selected"); });
    var rowEl = document.querySelector('.tree-row[data-id="' + cssEsc(id) + '"]');
    if (rowEl) rowEl.classList.add("selected");

    el("preview-title").innerHTML = esc(rec.title_en || rec.id) +
      (rec.title_zh ? " " + esc(rec.title_zh) : "") +
      ' <span class="catalog-date">(' + esc(rec.id) + ")</span>";

    // Only catalog-backed records (genuine sites) are editable
    var editLink = el("site-edit-link");
    editLink.style.display = rec.catalog_file ? "" : "none";
    editLink.onclick = function () {
      var c = cache[id] || {};
      sessionStorage.setItem("epiwen_preload_site", JSON.stringify({ id: id, xml: c.siteXml || "" }));
      window.location.href = "site-editor.html";
    };

    el("site-detail").innerHTML = '<div class="catalog-loading">Loading…</div>';

    if (cache[id]) { renderDetail(rec); return; }

    var jobs = [rec.catalog_file
      ? EpiData.fetch(rec.catalog_file).then(okText).catch(function () { return ""; })
      : Promise.resolve("")];
    jobs.push(rec.prose_file
      ? EpiData.fetch(rec.prose_file).then(okText).catch(function () { return ""; })
      : Promise.resolve(""));
    Promise.all(jobs).then(function (res) {
      cache[id] = { siteXml: res[0], proseXml: res[1] };
      if (selectedId === id) renderDetail(rec);
    });
  }

  function volLabel(v) {
    if (!v) return "forthcoming";
    var m = /volume(\d+)/.exec(v);
    return m ? "Sichuan vol " + m[1] : v;
  }

  function childSummary(rec) {
    if (rec.kind === "section") {
      var c = allRecords.filter(function (r) {
        return r.parent === rec.parent && r.section === rec.section && r.kind === "cave";
      }).length;
      return c ? c + (c === 1 ? " cave" : " caves") : "";
    }
    var kids = byParent[rec.id] || [];
    if (!kids.length) return "";
    var secs = kids.filter(function (k) { return k.kind === "section"; }).length;
    var caves = kids.filter(function (k) { return k.kind === "cave"; }).length;
    if (secs) return secs + " sections · " + caves + " caves";
    return kids.length + " subsites";
  }

  function okText(r) { return r.ok ? r.text() : ""; }
  function cssEsc(s) { return String(s).replace(/(["\\])/g, "\\$1"); }

  function renderDetail(rec) {
    var c = cache[rec.id] || {};
    el("site-detail").innerHTML = (viewMode === "xml")
      ? renderXml(c)
      : renderHtml(rec, c);
  }

  function renderHtml(rec, c) {
    var h = '<dl class="detail-dl">';
    function row(k, v) { if (v) h += "<dt>" + k + "</dt><dd>" + esc(v) + "</dd>"; }
    row("Type", rec.kind === "section" ? "section" : (rec.subtype || rec.kind));
    if (rec.parent) {
      var p = byId[rec.parent];
      h += '<dt>Parent</dt><dd><a href="#" data-goto="' + esc(rec.parent) + '">' +
           esc(p ? (p.title_en || rec.parent) : rec.parent) + "</a></dd>";
    }
    if (rec.volume || rec.kind === "section")
      row("Volume", volLabel(rec.volume));
    row("Province", [rec.province_en, rec.province_zh].filter(Boolean).join(" · "));
    row("Coordinates", rec.coordinates);
    h += "</dl>";

    var summary = childSummary(rec);
    if (summary) h += '<div class="detail-section-head">' + summary + "</div>";

    if (c.proseXml) {
      h += '<div class="detail-section-head">Description</div>';
      h += '<div class="prose-body">' + teiBodyToHtml(c.proseXml) + "</div>";
    } else if (rec.has_description) {
      h += '<div class="prose-body"><em>Description file referenced but not loaded.</em></div>';
    } else {
      h += '<div class="prose-body" style="color:var(--text-muted)"><em>No prose description.</em></div>';
    }

    setTimeout(bindGoto, 0);
    return h;
  }

  function renderXml(c) {
    var h = "";
    if (c.siteXml) {
      h += '<div class="detail-section-head">Catalog (structured)</div>';
      h += '<pre class="site-xml">' + esc(c.siteXml) + "</pre>";
    }
    if (c.proseXml) {
      h += '<div class="detail-section-head">Description (TEI prose)</div>';
      h += '<pre class="prose-xml">' + esc(c.proseXml) + "</pre>";
    }
    return h || '<div class="prose-body" style="color:var(--text-muted)"><em>No XML.</em></div>';
  }

  function bindGoto() {
    document.querySelectorAll("#site-detail [data-goto]").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        showDetail(a.getAttribute("data-goto"));
      });
    });
  }

  // ── minimal TEI body -> HTML ──────────────────────────────────────────────────

  function teiBodyToHtml(xml) {
    try {
      var doc = new DOMParser().parseFromString(xml, "application/xml");
      if (doc.getElementsByTagName("parsererror").length) return "<em>Unparseable TEI.</em>";
      var bodies = doc.getElementsByTagNameNS(TEI, "body");
      var body = bodies.length ? bodies[0] : doc.documentElement;
      var out = nodeToHtml(body);
      return out.trim() ? out : "<em>(empty description)</em>";
    } catch (e) { return "<em>Error rendering description.</em>"; }
  }

  function nodeToHtml(node) {
    var out = "";
    for (var i = 0; i < node.childNodes.length; i++) {
      var n = node.childNodes[i];
      if (n.nodeType === 3) { out += esc(n.nodeValue); continue; }
      if (n.nodeType !== 1) continue;
      var name = n.localName || n.nodeName.split(":").pop();
      var inner = nodeToHtml(n);
      var blank = !inner.replace(/<br>/g, "").trim();
      switch (name) {
        case "head":    if (!blank) out += "<h4>" + inner + "</h4>"; break;
        case "p":       if (!blank) out += "<p>" + inner + "</p>"; break;
        case "div":     out += inner; break;
        case "lb":      out += "<br>"; break;
        case "hi":      out += "<em>" + inner + "</em>"; break;
        case "foreign": out += '<span class="foreign">' + inner + "</span>"; break;
        case "term":    out += '<span class="term">' + inner + "</span>"; break;
        case "title":   out += "<em>" + inner + "</em>"; break;
        case "note":    out += ' <span class="note">(' + inner + ")</span> "; break;
        case "ref": case "ptr": out += inner; break;
        case "list":    out += "<ul>" + inner + "</ul>"; break;
        case "item":    out += "<li>" + inner + "</li>"; break;
        default:        out += inner;
      }
    }
    return out;
  }

  // ── view toggle + search ─────────────────────────────────────────────────────

  function setView(mode) {
    viewMode = mode;
    el("view-html").classList.toggle("active", mode === "html");
    el("view-xml").classList.toggle("active", mode === "xml");
    if (selectedId && byId[selectedId]) renderDetail(byId[selectedId]);
  }

  document.addEventListener("DOMContentLoaded", function () {
    load();
    el("view-html").addEventListener("click", function () { setView("html"); });
    el("view-xml").addEventListener("click", function () { setView("xml"); });
    var s = el("site-search");
    var t = null;
    s.addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(function () { renderTree(s.value); }, 150);
    });
  });
})();
