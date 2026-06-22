/* bookmarks.js — personal saved rubbing comparisons.
 *
 * A "favorite" is a named set of IIIF manifests (a comparison) the user wants to
 * keep and re-open in the IIIF viewer. Stored per-browser in localStorage
 * (key "epiwen_bookmarks"); no server round-trip. Shared by catalog.js (the
 * compare bar), viewer.html (the Save button), and bookmarks.html (the page).
 *
 * window.EpiBookmarks:
 *   list()                       -> [{id, name, manifests[], titles[], created}]
 *   save(name, manifests, titles)-> the saved favorite (newest first), or null
 *   remove(id)                   -> void
 *   viewerHref(manifests)        -> "viewer.html?manifest=…&manifest=…"
 *   detach(manifests)            -> open the viewer in a detached popup window
 */
(function (w) {
  var KEY = "epiwen_bookmarks";

  function read() {
    try { var a = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  // returns false on failure (quota exceeded, or Safari/Firefox private mode where
  // setItem throws) so callers can tell the user instead of silently losing the save.
  function write(a) {
    try { localStorage.setItem(KEY, JSON.stringify(a)); return true; }
    catch (e) { return false; }
  }

  function viewerHref(manifests) {
    return "viewer.html?" + manifests.map(function (m) {
      return "manifest=" + encodeURIComponent(m);
    }).join("&");
  }

  w.EpiBookmarks = {
    list: read,

    save: function (name, manifests, titles) {
      if (!manifests || !manifests.length) return null;
      var a = read();
      var fav = {
        id: "fav-" + Date.now().toString(36),
        name: (name || "Untitled comparison").trim() || "Untitled comparison",
        manifests: manifests.slice(),
        titles: (titles || []).slice(),
        created: new Date().toISOString()
      };
      a.unshift(fav);
      write(a);
      return fav;
    },

    remove: function (id) {
      write(read().filter(function (f) { return f.id !== id; }));
    },

    viewerHref: viewerHref,

    /* Open the comparison in a DETACHED popup window (not a browser tab), so it
     * floats free of the catalog window — resize/move it beside other windows. */
    detach: function (manifests) {
      var name = "epiwen-viewer-" + Date.now().toString(36);
      return w.open(viewerHref(manifests), name,
        "popup=yes,width=1500,height=950,scrollbars=yes,resizable=yes");
    }
  };
})(window);
