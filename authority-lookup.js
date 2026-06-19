/* authority-lookup.js — shared MADS authority typeahead for form fields
 *
 * Usage (in any form page that includes this script):
 *   EpiAuthorityLookup.attach(inputEl, onSelect, opts)
 *
 * onSelect(record) is called with the chosen authority-index.json record:
 *   { id, display_name, name_zh, name_pinyin, name_type, date, viaf, … }
 *
 * opts:
 *   { personsOnly: true (default), limit: 8 }
 *
 * Also exposes:
 *   EpiAuthorityLookup.parsePinyin(str) → { family, given }
 */
(function () {
  "use strict";

  var _index   = null;
  var _pending = [];   // callbacks waiting for the index

  // ── Index loading ─────────────────────────────────────────────────────────

  function ensureIndex(cb) {
    if (_index) { cb(_index); return; }
    _pending.push(cb);
    if (_pending.length > 1) return;   // fetch already in flight
    fetch("data/authority-index.json")
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        _index = data;
        var q = _pending.slice(); _pending = [];
        q.forEach(function (fn) { fn(_index); });
      })
      .catch(function (err) {
        console.warn("authority-lookup: could not load index:", err.message);
        _pending = [];
      });
  }

  // Pre-warm the cache so the first keystroke doesn't stall
  document.addEventListener("DOMContentLoaded", function () {
    ensureIndex(function () {});
  });

  // ── Search ────────────────────────────────────────────────────────────────

  function search(q, limit, personsOnly) {
    if (!_index || !q || !q.trim()) return [];
    var lq = q.trim().toLowerCase();
    var out = [];
    for (var i = 0; i < _index.length; i++) {
      if (out.length >= (limit || 8)) break;
      var r = _index[i];
      if (personsOnly !== false && r.name_type !== "personal") continue;
      var hay = ((r.display_name || "") + " " +
                 (r.name_zh || "")       + " " +
                 (r.name_pinyin || "")).toLowerCase();
      if (hay.indexOf(lq) !== -1) out.push(r);
    }
    return out;
  }

  // ── Name parsing ──────────────────────────────────────────────────────────

  function parsePinyin(py) {
    if (!py) return { family: "", given: "" };
    // Strip any trailing CJK portion: "Gu, Yanwu 顧炎武" → "Gu, Yanwu"
    var latin = py.replace(/[　-鿿豈-﫿\u{20000}-\u{2a6df}]+/gu, "").trim();
    var comma = latin.indexOf(",");
    if (comma >= 0) {
      return {
        family: latin.slice(0, comma).trim(),
        given:  latin.slice(comma + 1).trim()
      };
    }
    // Space-separated western name: "Lothar Ledderose" (unusual but possible)
    var sp = latin.lastIndexOf(" ");
    if (sp > 0) {
      return { family: latin.slice(sp + 1).trim(), given: latin.slice(0, sp).trim() };
    }
    return { family: latin.trim(), given: "" };
  }

  // ── Dropdown UI ───────────────────────────────────────────────────────────

  var _activeDropdown = null;   // only one open at a time

  function closeAll() {
    if (_activeDropdown) {
      _activeDropdown.remove();
      _activeDropdown = null;
    }
  }

  // Close on outside click
  document.addEventListener("mousedown", function (e) {
    if (_activeDropdown && !_activeDropdown.contains(e.target)) {
      closeAll();
    }
  });

  function positionDropdown(dropdown, input) {
    var rect = input.getBoundingClientRect();
    var scrollY = window.scrollY || document.documentElement.scrollTop;
    var scrollX = window.scrollX || document.documentElement.scrollLeft;
    dropdown.style.top  = (rect.bottom + scrollY + 2) + "px";
    dropdown.style.left = (rect.left   + scrollX)     + "px";
    dropdown.style.minWidth = Math.max(rect.width, 220) + "px";
  }

  // ── attach() ─────────────────────────────────────────────────────────────

  function attach(input, onSelect, opts) {
    opts = opts || {};
    var limit      = opts.limit      || 8;
    var persOnly   = opts.personsOnly !== false;

    var currentResults = [];
    var activeIdx      = -1;
    var dropdown       = null;

    function highlight(idx) {
      if (!dropdown) return;
      var items = dropdown.querySelectorAll(".alookup-item");
      items.forEach(function (el, i) {
        el.setAttribute("aria-selected", i === idx ? "true" : "false");
        el.style.background = (i === idx)
          ? "var(--accent-light, #eef3ff)"
          : "";
      });
      activeIdx = idx;
    }

    function close() {
      if (dropdown) { dropdown.remove(); dropdown = null; }
      if (_activeDropdown === dropdown) _activeDropdown = null;
      currentResults = [];
      activeIdx = -1;
    }

    function pick(rec) {
      close();
      onSelect(rec);
    }

    function open(results) {
      closeAll();
      if (!results.length) return;

      dropdown = document.createElement("div");
      dropdown.className = "alookup-dropdown";
      dropdown.setAttribute("role", "listbox");
      dropdown.style.cssText = [
        "position:absolute",
        "z-index:9999",
        "background:var(--bg,#fff)",
        "border:1px solid var(--border,#ccc)",
        "border-radius:5px",
        "box-shadow:0 3px 12px rgba(0,0,0,.15)",
        "max-height:240px",
        "overflow-y:auto",
        "font-size:.84em",
        "line-height:1.35"
      ].join(";");

      results.forEach(function (rec, i) {
        var item = document.createElement("div");
        item.className = "alookup-item";
        item.setAttribute("role", "option");
        item.style.cssText = "padding:.32rem .7rem;cursor:pointer;border-bottom:1px solid var(--border-subtle,#f0f0f0)";

        // Primary label
        var label = document.createElement("div");
        label.style.fontWeight = "500";
        label.textContent = rec.display_name || rec.id;
        item.appendChild(label);

        // Sub-line: dates + identifier badges
        var sub = [];
        if (rec.date) sub.push(rec.date);
        if (rec.viaf) sub.push("VIAF");
        if (rec.dila_authority) sub.push("DILA");
        if (rec.cbdb) sub.push("CBDB");
        if (sub.length) {
          var subEl = document.createElement("div");
          subEl.style.cssText = "font-size:.88em;color:var(--text-muted,#888);margin-top:.05rem";
          subEl.textContent = sub.join(" · ");
          item.appendChild(subEl);
        }

        item.addEventListener("mouseenter", function () { highlight(i); });
        item.addEventListener("mousedown", function (e) {
          e.preventDefault();
          pick(rec);
        });

        dropdown.appendChild(item);
      });

      positionDropdown(dropdown, input);
      document.body.appendChild(dropdown);
      _activeDropdown = dropdown;
    }

    // Reposition if window scrolls while open
    window.addEventListener("scroll", function () {
      if (dropdown) positionDropdown(dropdown, input);
    }, { passive: true });

    input.addEventListener("input", function () {
      var q = this.value.trim();
      if (q.length < 1) { close(); return; }
      ensureIndex(function () {
        var results = search(q, limit, persOnly);
        currentResults = results;
        open(results);
      });
    });

    input.addEventListener("keydown", function (e) {
      if (!dropdown) return;
      var itemCount = currentResults.length;
      if (!itemCount) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        highlight(Math.min(activeIdx + 1, itemCount - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        highlight(Math.max(activeIdx - 1, 0));
      } else if (e.key === "Enter") {
        if (activeIdx >= 0 && currentResults[activeIdx]) {
          e.preventDefault();
          pick(currentResults[activeIdx]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    });

    input.addEventListener("blur", function () {
      // Short delay so mousedown on a dropdown item fires before the close
      setTimeout(function () {
        if (dropdown && !dropdown.contains(document.activeElement)) close();
      }, 200);
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  window.EpiAuthorityLookup = {
    attach:      attach,
    parsePinyin: parsePinyin,
    search:      search,
    ensureIndex: ensureIndex
  };

})();
