/* authority-browser.js — loads data/authority-index.json and renders the Authorities browser */
(function () {
  "use strict";

  var OWNER  = "pleuston";
  var REPO   = "epiwen-epidoc-generator";
  var BRANCH = "main";
  var RAW    = "https://raw.githubusercontent.com/" + OWNER + "/" + REPO + "/" + BRANCH + "/";

  var allRecords   = [];
  var currentFilter = "all";
  var currentQuery  = "";
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
    var list = document.getElementById("auth-list");
    list.innerHTML = '<div class="catalog-loading">Loading authority index…</div>';

    fetch("data/authority-index.json?v=" + Date.now())
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
      if (currentFilter === "personal"  && r.name_type !== "personal")  return false;
      if (currentFilter === "corporate" && r.name_type !== "corporate") return false;
      if (q) {
        var hay = ((r.display_name || "") + " " + (r.name_zh || "") + " " + (r.name_pinyin || "")).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function renderList() {
    var recs = filteredRecords();
    var list = document.getElementById("auth-list");
    var countEl = document.getElementById("auth-count");
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
    div.dataset.authId = rec.id;

    var info = document.createElement("div");
    info.className = "catalog-item-info";

    var nameEl = document.createElement("div");
    nameEl.className = "catalog-title";
    nameEl.textContent = rec.display_name || rec.id;
    info.appendChild(nameEl);

    // Sub-line: forms + type
    var subParts = [];
    if (rec.name_pinyin && rec.name_pinyin !== rec.display_name) subParts.push(rec.name_pinyin);
    if (rec.name_zh && rec.name_zh !== rec.display_name)         subParts.push(rec.name_zh);
    if (rec.name_type === "corporate") subParts.push("corporate");
    if (subParts.length) {
      var sub = document.createElement("div");
      sub.className = "catalog-date";
      sub.textContent = subParts.join(" · ");
      info.appendChild(sub);
    }

    // Identifier badges
    var idBadges = [];
    if (rec.wikidata)       idBadges.push("WD");
    if (rec.viaf)           idBadges.push("VIAF");
    if (rec.gnd)            idBadges.push("GND");
    if (rec.dila_authority) idBadges.push("DILA");
    if (rec.cbdb)           idBadges.push("CBDB");
    if (idBadges.length) {
      var badges = document.createElement("div");
      badges.className = "catalog-date";
      badges.textContent = idBadges.join(" · ");
      info.appendChild(badges);
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

  var EXT_LINKS = {
    wikidata:       function (v) { return "https://www.wikidata.org/wiki/" + encodeURIComponent(v); },
    viaf:           function (v) { return "https://viaf.org/viaf/" + encodeURIComponent(v); },
    gnd:            function (v) { return "https://d-nb.info/gnd/" + encodeURIComponent(v); },
    dila_authority: function (v) { return "https://authority.dila.edu.tw/" + v; },
    cbdb:           function (v) { return "https://cbdb.fas.harvard.edu/cbdbapi/person.php?id=" + encodeURIComponent(v); }
  };

  var ID_LABELS = { wikidata: "Wikidata", viaf: "VIAF", gnd: "GND", dila_authority: "DILA", cbdb: "CBDB" };

  function idRow(label, value, makeUrl) {
    var val = value || "—";
    var row = "<tr><th>" + esc(label) + "</th><td>";
    if (value && makeUrl) {
      row += '<a href="' + esc(makeUrl(value)) + '" target="_blank" rel="noopener">' + esc(value) + " ↗</a>";
    } else {
      row += esc(val);
    }
    return row + "</td></tr>";
  }

  function showDetail(rec) {
    var titleEl = document.getElementById("preview-title");
    if (titleEl) titleEl.textContent = rec.display_name || rec.id;

    var contentEl = document.getElementById("auth-detail-content");
    if (!contentEl) return;

    var html = '<div style="padding:1rem 1.2rem">';
    html += "<h3 style=\"margin:0 0 .3rem\">" + esc(rec.display_name || rec.id) + "</h3>";

    var sub = [];
    if (rec.name_pinyin && rec.name_pinyin !== rec.display_name) sub.push(rec.name_pinyin);
    if (rec.name_zh && rec.name_zh !== rec.display_name)         sub.push(rec.name_zh);
    if (sub.length) {
      html += "<p class=\"catalog-date\" style=\"margin:0 0 .8rem\">" + esc(sub.join(" · ")) + "</p>";
    }

    html += "<table class=\"docs-table\" style=\"margin-bottom:.8rem\">";
    html += "<tbody>";
    html += "<tr><th>Type</th><td>" + esc(rec.name_type || "personal") + "</td></tr>";
    if (rec.date) html += "<tr><th>Dates</th><td>" + esc(rec.date) + "</td></tr>";
    html += idRow("Wikidata", rec.wikidata, EXT_LINKS.wikidata);
    html += idRow("VIAF",     rec.viaf,     EXT_LINKS.viaf);
    html += idRow("GND",      rec.gnd,      EXT_LINKS.gnd);
    html += idRow("DILA",     rec.dila_authority, EXT_LINKS.dila_authority);
    html += idRow("CBDB",     rec.cbdb,     EXT_LINKS.cbdb);
    html += "</tbody></table>";

    html += "<div style=\"display:flex;gap:.5rem;flex-wrap:wrap\">";
    html += "<button class=\"btn small primary\" id=\"auth-edit-btn\">Edit</button>";
    html += "<button class=\"btn small\" id=\"auth-copy-btn\">Copy XML</button>";
    html += "</div>";
    html += "</div>";

    contentEl.innerHTML = html;

    document.getElementById("auth-edit-btn").addEventListener("click", function () {
      openInEditor(rec);
    });
    document.getElementById("auth-copy-btn").addEventListener("click", function () {
      fetchXml(rec.id, function (xml) {
        navigator.clipboard.writeText(xml)
          .then(function () { toast("XML copied to clipboard"); })
          .catch(function (e) { toast("Copy failed: " + e.message, true); });
      });
    });
  }

  // ── Edit ──────────────────────────────────────────────────────────────────

  function fetchXml(id, cb) {
    var url = RAW + "authority/" + encodeURIComponent(id) + ".xml";
    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status + " — " + url);
        return r.text();
      })
      .then(cb)
      .catch(function (err) { toast("Could not load XML: " + err.message, true); });
  }

  function openInEditor(rec) {
    fetchXml(rec.id, function (xml) {
      sessionStorage.setItem("epiwen_preload_authority", JSON.stringify({
        id:             rec.id,
        display_name:   rec.display_name,
        name_zh:        rec.name_zh,
        name_pinyin:    rec.name_pinyin,
        name_type:      rec.name_type || "personal",
        wikidata:       rec.wikidata,
        viaf:           rec.viaf,
        gnd:            rec.gnd,
        dila_authority: rec.dila_authority,
        cbdb:           rec.cbdb,
        xml:            xml
      }));
      window.location.href = "authority-editor.html";
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", function () {
    loadIndex();

    document.getElementById("auth-search").addEventListener("input", function () {
      currentQuery = this.value.trim();
      renderList();
    });

    document.querySelectorAll(".auth-tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll(".auth-tab-btn").forEach(function (b) {
          b.classList.remove("active");
        });
        this.classList.add("active");
        currentFilter = this.dataset.filter;
        renderList();
      });
    });

    var newBtn = document.getElementById("auth-new-btn");
    if (newBtn) {
      newBtn.addEventListener("click", function () {
        sessionStorage.removeItem("epiwen_preload_authority");
        window.location.href = "authority-editor.html";
      });
    }
  });
})();
