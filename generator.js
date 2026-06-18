/*
 * generator.js — pure EpiDoc serializer for Chinese stone-sutra inscriptions.
 *
 * buildEpiDoc(data) -> EpiDoc/TEI XML string.
 *
 * Environment-agnostic (no DOM, no jQuery): runs in the browser (attached to
 * window.EpiDocGen) AND under Node (module.exports), so the same code that
 * powers the form can be unit-tested headlessly.
 *
 * Design note: unlike the Hamburg MDG generator (which encodes the XML tree as
 * deeply-nested HTML and walks the DOM), the tree here is built explicitly from
 * a flat data object. Empty optional elements are pruned; the structural spine
 * (titleStmt/title, msIdentifier, edition div) is always emitted, with a
 * comment placeholder when a value is missing, so the skeleton stays valid and
 * instructive even when half-filled.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.EpiDocGen = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // --- escaping -----------------------------------------------------------
  function escText(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  function escAttr(s) {
    return escText(s).replace(/"/g, "&quot;");
  }
  function t(v) {
    return v == null ? "" : String(v).trim();
  }

  // --- tiny node model ----------------------------------------------------
  // h(tag, attrs, ...children): prunes to null when it carries no attribute
  //   value and no non-blank child (so empty optionals disappear).
  function cleanAttrs(attrs) {
    var out = {};
    if (attrs)
      Object.keys(attrs).forEach(function (k) {
        if (t(attrs[k]) !== "") out[k] = t(attrs[k]);
      });
    return out;
  }
  function flat(children) {
    var out = [];
    children.forEach(function (c) {
      if (Array.isArray(c)) out = out.concat(flat(c));
      else if (c != null && !(typeof c === "string" && c.trim() === "")) out.push(c);
    });
    return out;
  }
  function h(tag, attrs) {
    var children = flat([].slice.call(arguments, 2));
    var a = cleanAttrs(attrs);
    if (Object.keys(a).length === 0 && children.length === 0) return null;
    return { tag: tag, attrs: a, children: children };
  }
  // hk = "keep": always emit even if empty (structural spine)
  function hk(tag, attrs) {
    var children = flat([].slice.call(arguments, 2));
    return { tag: tag, attrs: cleanAttrs(attrs), children: children };
  }
  function comment(s) {
    return { comment: t(s) };
  }
  function selfclose(tag, attrs) {
    return { tag: tag, attrs: cleanAttrs(attrs), children: [], selfclose: true };
  }

  // --- serialize ----------------------------------------------------------
  function attrStr(attrs) {
    var keys = Object.keys(attrs);
    if (!keys.length) return "";
    return (
      " " +
      keys
        .map(function (k) {
          return k + '="' + escAttr(attrs[k]) + '"';
        })
        .join(" ")
    );
  }
  function serialize(node, depth) {
    var pad = "  ".repeat(depth);
    if (node == null) return "";
    if (typeof node === "string") return pad + escText(node);
    if (node.comment != null) return pad + "<!-- " + node.comment + " -->";
    var a = attrStr(node.attrs);
    var kids = node.children || [];
    if (node.selfclose || kids.length === 0) return pad + "<" + node.tag + a + "/>";
    // inline a single short text child
    if (kids.length === 1 && typeof kids[0] === "string") {
      return pad + "<" + node.tag + a + ">" + escText(kids[0]) + "</" + node.tag + ">";
    }
    var inner = kids
      .map(function (c) {
        return serialize(c, depth + 1);
      })
      .filter(function (s) {
        return s !== "";
      })
      .join("\n");
    return pad + "<" + node.tag + a + ">\n" + inner + "\n" + pad + "</" + node.tag + ">";
  }

  // --- edition body: split transcription into <lb n=".."/> lines ----------
  function editionChildren(text) {
    var raw = t(text);
    if (!raw) return [comment("transcription — one source line per line / 每行一句")];
    var lines = raw.replace(/\r/g, "").split("\n");
    var out = [];
    var n = 0;
    lines.forEach(function (line) {
      // keep blank lines as structural breaks? skip empties, number the rest
      if (line.trim() === "") return;
      n += 1;
      out.push(selfclose("lb", { n: String(n) }));
      out.push(line);
    });
    return out.length ? out : [comment("transcription")];
  }

  // --- bibliography lines -> <bibl> ---------------------------------------
  function biblChildren(text) {
    var raw = t(text);
    if (!raw) return null;
    return raw
      .replace(/\r/g, "")
      .split("\n")
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean)
      .map(function (l) {
        return h("bibl", null, l);
      });
  }

  // --- main builder -------------------------------------------------------
  function buildEpiDoc(d) {
    d = d || {};

    // titleStmt
    var titleStmt = hk(
      "titleStmt",
      null,
      t(d.titleEn) ? h("title", { "xml:lang": "en" }, d.titleEn) : comment("English title"),
      txtTitleZh(d),
      h("editor", { role: "editor" }, d.editor)
    );

    function txtTitleZh(d) {
      return t(d.titleZh)
        ? h("title", { "xml:lang": "zh-Hant" }, d.titleZh)
        : null;
    }

    // publicationStmt
    var publicationStmt = hk(
      "publicationStmt",
      null,
      h("authority", null, d.authority || "Epiwen / Altergraphy"),
      h("idno", { type: "filename" }, d.filename),
      d.idAuthority ? h("idno", { type: "URI" }, d.idAuthority) : null,
      hk(
        "availability",
        null,
        d.licenceTarget || d.licence
          ? h("licence", { target: d.licenceTarget }, d.licence || d.licenceTarget)
          : comment("licence, e.g. CC BY 4.0")
      )
    );

    // msIdentifier (current holding)
    var msIdentifier = hk(
      "msIdentifier",
      null,
      h("country", { ref: d.countryRef }, d.country),
      h("region", null, d.currentRegion),
      h("settlement", null, d.currentSettlement),
      h("repository", { ref: d.repositoryRef }, d.repository),
      h("idno", { type: "inventory" }, d.inventoryNo) || comment("inventory no. / 編號")
    );

    // msContents
    var msContents = h(
      "msContents",
      null,
      h("summary", null, d.summary),
      makeMsItem(d)
    );
    function makeMsItem(d) {
      var ref = t(d.cbeta) ? "cbeta:" + t(d.cbeta) : t(d.taisho) ? "taisho:" + t(d.taisho) : "";
      var titleNode =
        t(d.sutraTitleZh) || t(d.sutraTitleEn)
          ? h(
              "title",
              { ref: ref, "xml:lang": t(d.sutraTitleZh) ? "zh-Hant" : "en" },
              d.sutraTitleZh || d.sutraTitleEn
            )
          : null;
      var enAlt =
        t(d.sutraTitleZh) && t(d.sutraTitleEn)
          ? h("title", { "xml:lang": "en", type: "translated" }, d.sutraTitleEn)
          : null;
      if (!titleNode && !t(d.cbeta) && !t(d.taisho)) return null;
      return h("msItem", null, titleNode, enAlt);
    }

    // physDesc
    var support = h(
      "support",
      null,
      h("material", { ref: d.materialRef }, d.material),
      h("objectType", { ref: d.objectTypeRef }, d.objectType),
      h(
        "dimensions",
        { unit: "cm" },
        h("height", null, d.heightCm),
        h("width", null, d.widthCm),
        h("depth", null, d.depthCm)
      )
    );
    var supportDesc = h(
      "supportDesc",
      { material: d.materialRef ? undefined : undefined },
      support,
      h("condition", null, d.condition)
    );
    var layout = h(
      "layout",
      { columns: d.layoutColumns, writtenLines: d.layoutLines },
      d.layoutNote
    );
    var physDesc = h(
      "physDesc",
      null,
      h("objectDesc", { form: d.objectForm }, supportDesc, layout ? h("layoutDesc", null, layout) : null),
      t(d.script) ? h("handDesc", null, h("handNote", { script: d.scriptRef }, d.script)) : null
    );

    // history / origin
    var origDate = h(
      "origDate",
      {
        calendar: d.calendar,
        "datingMethod": d.datingMethod,
        when: d.whenISO,
        notBefore: d.notBefore,
        notAfter: d.notAfter
      },
      d.origDateText
    );
    var origin = h(
      "origin",
      null,
      origDate,
      h("origPlace", { ref: d.origPlaceRef }, d.origPlace)
    );
    var history = h(
      "history",
      null,
      origin,
      t(d.provenanceFound) ? h("provenance", { type: "found" }, d.provenanceFound) : null
    );

    var msDesc = hk("msDesc", null, msIdentifier, msContents, physDesc, history);
    var sourceDesc = hk("sourceDesc", null, msDesc);

    var fileDesc = hk("fileDesc", null, titleStmt, publicationStmt, sourceDesc);

    // profileDesc
    var profileDesc = h(
      "profileDesc",
      null,
      h(
        "langUsage",
        null,
        h("language", { ident: d.langIdent || "zh" }, d.langLabel || "Literary Chinese 漢文"),
        t(d.langSecondary) ? h("language", { ident: d.langSecondaryIdent }, d.langSecondary) : null
      ),
      keywordsNode(d)
    );
    function keywordsNode(d) {
      var list = (d.keywords || []).filter(function (k) {
        return t(k.label) || t(k.ref);
      });
      if (!list.length) return null;
      return h(
        "textClass",
        null,
        h(
          "keywords",
          { scheme: d.keywordScheme || "#stonesutras" },
          list.map(function (k) {
            return h("term", { ref: k.ref }, k.label);
          })
        )
      );
    }

    // revisionDesc
    var revisionDesc = t(d.changeNote)
      ? h(
          "revisionDesc",
          null,
          h("change", { when: d.changeWhen, who: d.changeWho }, d.changeNote)
        )
      : null;

    var teiHeader = hk(
      "teiHeader",
      null,
      fileDesc,
      d.encodingNote
        ? h("encodingDesc", null, h("p", null, d.encodingNote))
        : null,
      profileDesc,
      revisionDesc
    );

    // facsimile
    var facsimile = t(d.facsimileUrl)
      ? h("facsimile", null, selfclose("graphic", { url: d.facsimileUrl }))
      : null;

    // text / body
    var edition = hk(
      "div",
      { type: "edition", "xml:lang": d.editionLang || "zh-Hant", "xml:space": "preserve" },
      hk("ab", null, editionChildren(d.editionText))
    );
    var translation = t(d.translationText)
      ? h(
          "div",
          { type: "translation", "xml:lang": d.translationLang || "en" },
          h("p", null, d.translationText)
        )
      : null;
    var commentaryDiv = t(d.commentaryText)
      ? h("div", { type: "commentary" }, h("p", null, d.commentaryText))
      : null;
    var biblDiv = (function () {
      var bibls = biblChildren(d.bibliography);
      return bibls ? h("div", { type: "bibliography" }, h("listBibl", null, bibls)) : null;
    })();

    var body = hk("body", null, edition, translation, commentaryDiv, biblDiv);
    var text = hk("text", null, body);

    var TEI = hk(
      "TEI",
      { xmlns: "http://www.tei-c.org/ns/1.0", "xml:lang": "en" },
      teiHeader,
      facsimile,
      text
    );

    var prolog =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<?xml-model href="https://www.stoa.org/epidoc/schema/latest/tei-epidoc.rng" schematypens="http://relaxng.org/ns/structure/1.0"?>\n' +
      '<?xml-model href="https://www.stoa.org/epidoc/schema/latest/tei-epidoc.rng" schematypens="http://purl.oclc.org/dsdl/schematron"?>\n';

    return prolog + serialize(TEI, 0) + "\n";
  }

  return { buildEpiDoc: buildEpiDoc };
});
