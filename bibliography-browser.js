/* bibliography-browser.js — loads data/biblio-index.json and renders the Bibliography browser */
(function () {
  "use strict";

  var OWNER  = "pleuston";
  var REPO   = "epiwen-epidoc-generator";
  var BRANCH = "main";
  var RAW    = "https://raw.githubusercontent.com/" + OWNER + "/" + REPO + "/" + BRANCH + "/";

  var allRecords    = [];
  var currentFilter = "all";
  var currentQuery  = "";
  var yearMin       = 0;
  var yearMax       = 9999;
  var selectedRec   = null;

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

  // ── Load ──────────────────────────────────────────────────────────────────

  function loadIndex() {
    var list = document.getElementById("biblio-list");
    list.innerHTML = '<div class="catalog-loading">Loading bibliography index…</div>';

    fetch("data/biblio-index.json?v=" + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        allRecords = data;
        renderList();
      })
      .catch(function (err) {
        list.innerHTML = '<div class="catalog-loading">Error loading index: ' + esc(err.message) + '</div>';
      });
  }

  // ── Filter + render ───────────────────────────────────────────────────────

  function filteredRecords() {
    var q = currentQuery.toLowerCase();
    return allRecords.filter(function (r) {
      if (currentFilter !== "all" && r.pub_type !== currentFilter) return false;

      var yr = parseInt(r.year, 10) || 0;
      if (yearMin && yr && yr < yearMin) return false;
      if (yearMax < 9999 && yr && yr > yearMax) return false;

      if (q) {
        var hay = [
          r.reference || "",
          r.title || "",
          r.title_zh || "",
          (r.author || []).join(" ")
        ].join(" ").toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function renderList() {
    var recs = filteredRecords();
    var list = document.getElementById("biblio-list");
    var countEl = document.getElementById("biblio-count");
    if (countEl) countEl.textContent = recs.length + " of " + allRecords.length;

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

    var info = document.createElement("div");
    info.className = "catalog-item-info";

    var refEl = document.createElement("div");
    refEl.className = "catalog-title";
    refEl.textContent = rec.reference || rec.key;
    info.appendChild(refEl);

    // Short title on second line
    if (rec.title) {
      var titleEl = document.createElement("div");
      titleEl.className = "catalog-date";
      var titleShort = rec.title.length > 70 ? rec.title.slice(0, 68) + "…" : rec.title;
      titleEl.textContent = titleShort;
      info.appendChild(titleEl);
    }

    // Type badge
    if (rec.pub_type && rec.pub_type !== "other") {
      var typeEl = document.createElement("div");
      typeEl.className = "catalog-date";
      typeEl.textContent = rec.pub_type;
      info.appendChild(typeEl);
    }

    div.appendChild(info);
    div.addEventListener("click", function () { selectRecord(rec, div); });
    return div;
  }

  function selectRecord(rec, itemEl) {
    var prev = document.querySelector(".catalog-item.selected");
    if (prev) prev.classList.remove("selected");
    if (itemEl) itemEl.classList.add("selected");
    selectedRec = rec;
    showDetail(rec);
  }

  // ── Detail pane ───────────────────────────────────────────────────────────

  function showDetail(rec) {
    var titleEl = document.getElementById("preview-title");
    if (titleEl) titleEl.textContent = rec.reference || rec.key;

    var contentEl = document.getElementById("biblio-detail-content");
    if (!contentEl) return;

    var html = '<div style="padding:1rem 1.2rem">';

    // Heading
    html += '<h3 style="margin:0 0 .25rem">' + esc(rec.reference || rec.key) + '</h3>';
    if (rec.title) {
      html += '<p style="margin:0 0 .7rem;font-style:italic">' + esc(rec.title) + '</p>';
    }
    if (rec.title_zh) {
      html += '<p style="margin:0 0 .7rem">' + esc(rec.title_zh) + '</p>';
    }

    // Metadata table
    html += '<table class="docs-table" style="margin-bottom:.8rem"><tbody>';

    if (rec.author && rec.author.length) {
      html += '<tr><th>Author(s)</th><td>' + esc(rec.author.join("; ")) + '</td></tr>';
    }
    html += '<tr><th>Year</th><td>' + esc(rec.year || "—") + '</td></tr>';
    html += '<tr><th>Type</th><td>' + esc(rec.pub_type || "—") + '</td></tr>';
    html += '<tr><th>Group</th><td>' + esc(rec.group || "—") + '</td></tr>';
    html += '<tr><th>Key</th><td><code>' + esc(rec.key) + '</code></td></tr>';
    html += '</tbody></table>';

    // Action buttons
    html += '<div style="display:flex;gap:.5rem;flex-wrap:wrap">';
    html += '<button class="btn small primary" id="biblio-edit-btn">Edit</button>';
    html += '<button class="btn small" id="biblio-copy-btn">Copy XML</button>';
    html += '</div>';
    html += '</div>';

    contentEl.innerHTML = html;

    document.getElementById("biblio-edit-btn").addEventListener("click", function () {
      openInEditor(rec);
    });
    document.getElementById("biblio-copy-btn").addEventListener("click", function () {
      fetchXml(rec, function (xml) {
        navigator.clipboard.writeText(xml)
          .then(function () { toast("XML copied to clipboard"); })
          .catch(function (e) { toast("Copy failed: " + e.message, true); });
      });
    });
  }

  // ── Edit ──────────────────────────────────────────────────────────────────

  function xmlPath(rec) {
    return "biblio/" + encodeURIComponent(rec.group) + "/" + encodeURIComponent(rec.key) + ".xml";
  }

  function fetchXml(rec, cb) {
    var url = RAW + xmlPath(rec);
    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status + " — " + url);
        return r.text();
      })
      .then(cb)
      .catch(function (err) { toast("Could not load XML: " + err.message, true); });
  }

  function openInEditor(rec) {
    fetchXml(rec, function (xml) {
      sessionStorage.setItem("epiwen_preload_biblio", JSON.stringify({
        key:      rec.key,
        group:    rec.group,
        reference: rec.reference,
        title:    rec.title,
        title_zh: rec.title_zh,
        author:   rec.author,
        year:     rec.year,
        pub_type: rec.pub_type,
        xml:      xml
      }));
      window.location.href = "biblio-editor.html";
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", function () {
    loadIndex();

    document.getElementById("biblio-search").addEventListener("input", function () {
      currentQuery = this.value.trim();
      renderList();
    });

    document.querySelectorAll(".biblio-tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll(".biblio-tab-btn").forEach(function (b) {
          b.classList.remove("active");
        });
        this.classList.add("active");
        currentFilter = this.dataset.filter;
        renderList();
      });
    });

    var yearMinEl = document.getElementById("year-min");
    var yearMaxEl = document.getElementById("year-max");
    if (yearMinEl) {
      yearMinEl.addEventListener("input", function () {
        yearMin = parseInt(this.value, 10) || 0;
        renderList();
      });
    }
    if (yearMaxEl) {
      yearMaxEl.addEventListener("input", function () {
        yearMax = parseInt(this.value, 10) || 9999;
        renderList();
      });
    }
  });
})();
