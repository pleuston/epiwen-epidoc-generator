/* skslxb-page.js — contents of 石刻史料新編 (SKSLXB), by series (輯).
 * Reads skslxb-toc.json (app repo, no auth). Left tree selects a series; the right
 * table lists its works (each → source.html?id=). ?series=N preselects a series;
 * a #<work-id> hash highlights/scrolls to that row. */
(function () {
  "use strict";
  var SERIES_ZH = { "1": "第一輯", "2": "第二輯", "3": "第三輯", "4": "第四輯" };
  var data = {}, sel = null;   // sel = series key string, or null = all

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function fold(s) { return window.EpiVariants ? EpiVariants.fold(s) : String(s == null ? "" : s).toLowerCase(); }
  function el(id) { return document.getElementById(id); }
  function keys() { return Object.keys(data).sort(); }
  function listFor(s) { return s ? (data[s] || []) : keys().reduce(function (a, k) { return a.concat(data[k]); }, []); }

  function row(label, sub, count, active, onClick) {
    var r = document.createElement("div");
    r.className = "ct-row" + (active ? " active" : "");
    r.innerHTML = '<span class="ct-label">' + esc(label) + (sub ? ' <span class="ct-city">' + esc(sub) + "</span>" : "") +
      '</span><span class="ct-count">' + count + "</span>";
    r.addEventListener("click", onClick);
    return r;
  }
  function renderTree() {
    var box = el("ct-tree"); box.innerHTML = "";
    box.appendChild(row("All series", "", listFor(null).length, sel === null, function () { setSel(null); }));
    keys().forEach(function (k) {
      box.appendChild(row(SERIES_ZH[k] || ("輯 " + k), "series " + k, data[k].length, sel === k, function () { setSel(k); }));
    });
  }
  function setSel(s) { sel = s; renderTree(); render(); }

  function render() {
    var q = fold(el("ct-search").value.trim());
    var list = listFor(sel);
    if (q) list = list.filter(function (w) { return fold((w.title_zh || "") + " " + (w.author_zh || "") + " " + (w.locator || "")).indexOf(q) !== -1; });
    list = list.slice().sort(function (a, b) { return (a.locator || "~").localeCompare(b.locator || "~") || fold(a.title_zh).localeCompare(fold(b.title_zh)); });
    el("coll-title").textContent = sel ? "石刻史料新編 " + (SERIES_ZH[sel] || sel) : "石刻史料新編 contents";
    el("coll-crumb").textContent = list.length + " work" + (list.length === 1 ? "" : "s") + (sel ? "" : " · " + keys().length + " series");
    if (!list.length) { el("coll-cards").innerHTML = '<p class="catalog-loading">No works here.</p>'; return; }
    el("coll-cards").innerHTML = '<table class="coll-table"><thead><tr>' +
      "<th>Work 著作</th><th>Author 撰者</th><th>Locator</th></tr></thead><tbody>" +
      list.map(function (w) {
        return '<tr id="' + esc(w.id) + '">' +
          '<td class="ct-name"><a href="source.html?id=' + encodeURIComponent(w.id) + '">' + esc(w.title_zh || "(untitled)") + "</a></td>" +
          "<td>" + (w.author_zh ? esc(w.author_zh) : '<span class="ct-city">—</span>') + "</td>" +
          "<td>" + (w.locator ? "<code>" + esc(w.locator) + "</code>" : '<span class="ct-city">—</span>') + "</td></tr>";
      }).join("") + "</tbody></table>";
    if (location.hash.length > 1) {
      var t = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (t && t.scrollIntoView) t.scrollIntoView({ block: "center" });
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    el("ct-search").addEventListener("input", render);
    var qs = new URLSearchParams(location.search).get("series");
    fetch("skslxb-toc.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      data = (d && d.series) || {};
      if (qs && data[qs]) sel = qs;
      renderTree();
      render();
    }).catch(function () { el("ct-tree").innerHTML = '<div class="catalog-loading">Could not load skslxb-toc.json.</div>'; });
  });
})();
