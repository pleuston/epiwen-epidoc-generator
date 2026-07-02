/* epidoc-cn.js — shared model for the Epiwen / EpiDoc-CN profile (sample shape 2026-07).
 *
 * The three-level model: SITE (TEI <place>) → OBJECT (TEI <object>) → INSCRIPTION
 * (EpiDoc <msDesc> + delegated <div type="edition">), mutually linked; controlled
 * vocabularies resolve against epiwen-taxonomies.xml (@ana="#category.id").
 *
 * Provides, on window.EpiDocCN:
 *   detect(xml)            -> "site" | "objectfile" | "inscription" | "taxonomy" | null
 *   parseSite / parseObject / parseInscription (xml -> state)
 *   buildSite / buildObject / buildInscription (state -> xml)
 *   parseTaxonomies(xml)   -> { objectTypes:[{id,zh,en,ref}], materials:[…], … }
 *   loadTaxonomies()       -> Promise<tax> (collection epidoc-cn, bundled fallback)
 *
 * Fidelity rule: everything the forms model is structured state; every element the
 * forms do NOT model is captured verbatim (inner XML) in `_x` raw buckets and
 * re-emitted on build, so editing never silently drops encoded data. XML comments
 * are not preserved (they are documentation, not data); the samples' upstream-wart
 * notes are elements and survive.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.EpiDocCN = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var TEI_NS = "http://www.tei-c.org/ns/1.0";
  var XML_NS = "http://www.w3.org/XML/1998/namespace";

  // ---------------------------------------------------------------- utilities
  function ln(el) { return el.localName || String(el.nodeName).replace(/^.*:/, ""); }
  function kids(el, name) {
    var out = [];
    if (!el) return out;
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 1 && (!name || ln(n) === name)) out.push(n);
    }
    return out;
  }
  function firstKid(el, name) { return kids(el, name)[0] || null; }
  function desc(el, name) {
    var out = [], all = el ? el.getElementsByTagName("*") : [];
    for (var i = 0; i < all.length; i++) if (ln(all[i]) === name) out.push(all[i]);
    return out;
  }
  function attr(el, name) { return el ? (el.getAttribute(name) || "") : ""; }
  function xmlId(el) { return el ? (el.getAttributeNS(XML_NS, "id") || el.getAttribute("xml:id") || "") : ""; }
  function xmlLang(el) { return el ? (el.getAttributeNS(XML_NS, "lang") || el.getAttribute("xml:lang") || "") : ""; }
  function txt(el) { return el ? String(el.textContent || "").trim() : ""; }
  function collapse(s) { return String(s || "").replace(/\s+/g, " ").trim(); }

  var _ser = null;
  function serializeNode(node) {
    if (!_ser) _ser = new XMLSerializer();
    return _ser.serializeToString(node)
      .replace(/ xmlns="http:\/\/www\.tei-c\.org\/ns\/1\.0"/g, "");
  }
  /* inner XML of an element, TEI default-ns declarations stripped, trimmed */
  function inner(el) {
    if (!el) return "";
    var s = "";
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 8) continue;                    // comments dropped
      s += n.nodeType === 3 ? escText(n.nodeValue) : serializeNode(n);
    }
    return s.replace(/^\s+|\s+$/g, "");     // full end-trim: "\n  <ab/>" and "  <ab/>" must round-trip alike
  }
  /* whole element as raw XML (for _x buckets) */
  function outer(el) { return serializeNode(el); }

  function escText(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function escAttr(s) { return escText(s).replace(/"/g, "&quot;"); }

  // ------------------------------------------------------------- node builder
  // N(tag, attrs, ...children) -> node | null (pruned when empty)
  // NK = keep even if empty; RAW(xml) = verbatim fragment; C(text) = comment
  function clean(attrs) {
    var out = {};
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v != null && String(v).trim() !== "") out[k] = String(v).trim();
    });
    return out;
  }
  function flat(arr) {
    var out = [];
    arr.forEach(function (c) {
      if (Array.isArray(c)) out = out.concat(flat(c));
      else if (c != null && !(typeof c === "string" && c === "")) out.push(c);
    });
    return out;
  }
  function N(tag, attrs) {
    var ch = flat([].slice.call(arguments, 2));
    var a = clean(attrs);
    if (!Object.keys(a).length && !ch.length) return null;
    return { tag: tag, attrs: a, ch: ch };
  }
  function NK(tag, attrs) {
    return { tag: tag, attrs: clean(attrs), ch: flat([].slice.call(arguments, 2)) };
  }
  function RAW(xml) { return xml && String(xml).trim() ? { raw: String(xml) } : null; }

  function ser(node, depth) {
    var pad = new Array(depth + 1).join("  ");
    if (node == null) return "";
    if (typeof node === "string") return pad + escText(node);
    if (node.raw != null) {
      // verbatim fragment: re-indent its first line only; keep internal layout
      return node.raw.split("\n").map(function (l, i) {
        return i === 0 ? pad + l.replace(/^\s+/, "") : l;
      }).join("\n");
    }
    var a = Object.keys(node.attrs).map(function (k) {
      return " " + k + '="' + escAttr(node.attrs[k]) + '"';
    }).join("");
    if (!node.ch.length) return pad + "<" + node.tag + a + "/>";
    if (node.ch.length === 1 && typeof node.ch[0] === "string")
      return pad + "<" + node.tag + a + ">" + escText(node.ch[0]) + "</" + node.tag + ">";
    if (node.ch.length === 1 && node.ch[0] && node.ch[0].raw != null && node.ch[0].raw.indexOf("\n") === -1)
      return pad + "<" + node.tag + a + ">" + node.ch[0].raw + "</" + node.tag + ">";
    var innerStr = node.ch.map(function (c) { return ser(c, depth + 1); })
      .filter(function (s) { return s !== ""; }).join("\n");
    return pad + "<" + node.tag + a + ">\n" + innerStr + "\n" + pad + "</" + node.tag + ">";
  }

  // ------------------------------------------------------------- fixed blocks
  var PREFIXES = [
    { ident: "crm", pattern: "(.+)", repl: "http://www.cidoc-crm.org/cidoc-crm/$1" },
    { ident: "crmtex", pattern: "(.+)", repl: "http://www.cidoc-crm.org/extensions/crmtex/$1" },
    { ident: "sutras", pattern: "(.+)", repl: "https://github.com/StoneSutras/sutras-data/blob/master/$1" }
  ];
  function prefixDefNode(list) {
    var src = (list && list.length) ? list : PREFIXES;
    return N("listPrefixDef", null, src.map(function (p) {
      return N("prefixDef", { ident: p.ident, matchPattern: p.pattern, replacementPattern: p.repl });
    }));
  }
  function parsePrefixes(doc) {
    return desc(doc.documentElement, "prefixDef").map(function (p) {
      return { ident: attr(p, "ident"), pattern: attr(p, "matchPattern"), repl: attr(p, "replacementPattern") };
    });
  }

  function availabilityNode(av) {
    av = av || {};
    return N("availability", { status: av.status || "restricted" },
      RAW("<p>" + escText(av.text || "Draft sample, not for publication.") + "</p>"));
  }

  // ------------------------------------------------------------------- detect
  function parseDoc(xml) {
    var doc = new DOMParser().parseFromString(xml, "application/xml");
    return doc.getElementsByTagName("parsererror").length ? null : doc;
  }
  function detect(xml) {
    var doc = typeof xml === "string" ? parseDoc(xml) : xml;
    if (!doc || !doc.documentElement) return null;
    var rootEl = doc.documentElement;
    if (ln(rootEl) !== "TEI") return null;
    if (desc(rootEl, "classDecl").length && desc(rootEl, "taxonomy").length) return "taxonomy";
    if (desc(rootEl, "listPlace").length) return "site";
    if (desc(rootEl, "listObject").length) return "objectfile";
    if (desc(rootEl, "msDesc").length) return "inscription";
    return null;
  }

  // ------------------------------------------------------------ shared pieces
  function parseHeaderCommon(doc) {
    var out = { titles: [], titleZh: "", titleEn: "", authority: "", idnoType: "", idno: "",
                availability: null, sourceBibls: [], prefixes: [] };
    var titleStmt = desc(doc.documentElement, "titleStmt")[0];
    kids(titleStmt, "title").forEach(function (t) {
      var item = { lang: xmlLang(t), type: attr(t, "type"), text: collapse(txt(t)) };
      out.titles.push(item);
      if (item.lang === "zh" && !item.type && !out.titleZh) out.titleZh = item.text;
      else if (item.lang === "en" && !item.type && !out.titleEn) out.titleEn = item.text;
    });
    // display fallbacks when every title is typed (e.g. only @type="abbreviated")
    if (!out.titleZh) { var z = out.titles.filter(function (t) { return t.lang === "zh"; })[0]; if (z) out.titleZh = z.text; }
    if (!out.titleEn) { var e = out.titles.filter(function (t) { return t.lang === "en"; })[0]; if (e) out.titleEn = e.text; }
    var pub = desc(doc.documentElement, "publicationStmt")[0];
    out.authority = txt(firstKid(pub, "authority"));
    var idnoEl = firstKid(pub, "idno");
    if (idnoEl) { out.idnoType = attr(idnoEl, "type"); out.idno = txt(idnoEl); }
    var avEl = firstKid(pub, "availability");
    if (avEl) out.availability = { status: attr(avEl, "status"), text: txt(avEl) };
    var srcDesc = desc(doc.documentElement, "sourceDesc")[0];
    kids(srcDesc, "bibl").forEach(function (b) { out.sourceBibls.push(inner(b)); });
    out.prefixes = parsePrefixes(doc);
    return out;
  }
  function titleNodes(st) {
    if (st.titles && st.titles.length) {
      return st.titles.map(function (t) {
        return t.text ? N("title", { "xml:lang": t.lang, type: t.type }, t.text) : null;
      });
    }
    return [st.titleZh ? N("title", { "xml:lang": "zh" }, st.titleZh) : null,
            st.titleEn ? N("title", { "xml:lang": "en" }, st.titleEn) : null];
  }
  function headerNodes(st, defIdnoType) {
    return NK("fileDesc", null,
      NK("titleStmt", null, titleNodes(st)),
      NK("publicationStmt", null,
        N("authority", null, st.authority || "Epiwen / EpiDoc-CN profile — sample"),
        N("idno", { type: st.idnoType || defIdnoType }, st.idno),
        availabilityNode(st.availability)),
      NK("sourceDesc", null,
        (st.sourceBibls || []).map(function (b) { return N("bibl", null, RAW(b)); }),
        st._sourceExtra ? st._sourceExtra.map(RAW) : null));
  }
  function encodingNode(st) {
    return N("encodingDesc", null, prefixDefNode(st.prefixes), (st._encodingExtra || []).map(RAW));
  }

  /* term-carrying classified element: <objectType ana ref><term zh/><term en/></objectType> */
  function parseClassified(el) {
    if (!el) return null;
    var o = { ana: attr(el, "ana"), ref: attr(el, "ref"), zh: "", en: "", text: "" };
    kids(el, "term").forEach(function (t) {
      if (xmlLang(t) === "zh") o.zh = txt(t);
      else if (xmlLang(t) === "en") o.en = collapse(txt(t));
    });
    if (!kids(el, "term").length) o.text = collapse(txt(el));
    return (o.ana || o.ref || o.zh || o.en || o.text) ? o : null;
  }
  function classifiedNode(tag, o, extraAttrs) {
    if (!o || !(o.ana || o.ref || o.zh || o.en || o.text)) return null;
    var a = Object.assign({ ana: o.ana, ref: o.ref }, extraAttrs || {});
    if (o.text && !o.zh && !o.en) return N(tag, a, o.text);
    return N(tag, a,
      o.zh ? N("term", { "xml:lang": "zh" }, o.zh) : null,
      o.en ? N("term", { "xml:lang": "en" }, o.en) : null);
  }

  /* dimensions: { type, unit, parts:[{el,n,unit,atLeast,atMost,text}] } */
  function parseDims(el) {
    var d = { type: attr(el, "type"), unit: attr(el, "unit"), parts: [] };
    kids(el).forEach(function (p) {
      d.parts.push({ el: ln(p), n: attr(p, "n"), unit: attr(p, "unit"),
                     atLeast: attr(p, "atLeast"), atMost: attr(p, "atMost"), text: txt(p) });
    });
    return d;
  }
  function dimsNode(d) {
    if (!d || !d.parts || !d.parts.length) return null;
    return N("dimensions", { type: d.type, unit: d.unit }, d.parts.map(function (p) {
      return N(p.el || "height", { n: p.n, unit: p.unit, atLeast: p.atLeast, atMost: p.atMost }, p.text);
    }));
  }

  /* bilingual paragraphs + typed notes: condition, decoNote, provenance … */
  function parsePs(el) {
    var o = { pZh: "", pEn: "", notes: [] };
    kids(el, "p").forEach(function (p) {
      if (xmlLang(p) === "zh") o.pZh = o.pZh || txt(p);
      else o.pEn = o.pEn || collapse(txt(p));
    });
    kids(el, "note").forEach(function (nEl) {
      o.notes.push({ type: attr(nEl, "type"), lang: xmlLang(nEl), xml: inner(nEl) });
    });
    return o;
  }
  function psNodes(o) {
    if (!o) return [];
    return flat([
      o.pZh ? N("p", { "xml:lang": "zh" }, o.pZh) : null,
      o.pEn ? N("p", { "xml:lang": "en" }, o.pEn) : null,
      (o.notes || []).map(function (nn) {
        return N("note", { type: nn.type, "xml:lang": nn.lang }, RAW(nn.xml));
      })
    ]);
  }

  function noteNodes(notes) {
    return (notes || []).map(function (nn) {
      return N("note", { type: nn.type, "xml:lang": nn.lang }, RAW(nn.xml));
    });
  }
  function parseNotesOf(el) {
    return kids(el, "note").map(function (nEl) {
      return { type: attr(nEl, "type"), lang: xmlLang(nEl), xml: inner(nEl) };
    });
  }

  /* layout: columns/ruledLines + ORDERED children (p | rs | note | raw) */
  function parseLayout(el) {
    if (!el) return null;
    var o = { columns: attr(el, "columns"), ruledLines: attr(el, "ruledLines"),
              writtenLines: attr(el, "writtenLines"), items: [] };
    kids(el).forEach(function (k) {
      var name = ln(k);
      if (name === "p") o.items.push({ kind: "p", lang: xmlLang(k), text: collapse(txt(k)) });
      else if (name === "rs") {
        var c = parseClassified(k) || {};
        o.items.push({ kind: "rs", type: attr(k, "type"), ana: c.ana, ref: c.ref, zh: c.zh, en: c.en, text: c.text });
      }
      else if (name === "note") o.items.push({ kind: "note", type: attr(k, "type"), lang: xmlLang(k), xml: inner(k) });
      else o.items.push({ kind: "raw", xml: outer(k) });
    });
    return o;
  }
  function layoutNode(o) {
    if (!o) return null;
    return N("layout", { columns: o.columns, ruledLines: o.ruledLines, writtenLines: o.writtenLines },
      (o.items || []).map(function (it) {
        if (it.kind === "p") return it.text ? N("p", { "xml:lang": it.lang || "en" }, it.text) : null;
        if (it.kind === "rs") return classifiedNode("rs", it, { type: it.type });
        if (it.kind === "note") return N("note", { type: it.type, "xml:lang": it.lang }, RAW(it.xml));
        return RAW(it.xml);
      }));
  }

  /* history: origin(origDate + notes + origPlace) + provenance + extras */
  function parseHistory(el) {
    if (!el) return null;
    var h = { date: null, dateNotes: [], place: null, provenance: null, _x: [] };
    var origin = firstKid(el, "origin");
    if (origin) {
      var od = firstKid(origin, "origDate");
      if (od) h.date = { when: attr(od, "when"), notBefore: attr(od, "notBefore"),
                         notAfter: attr(od, "notAfter"), evidence: attr(od, "evidence"), text: txt(od) };
      h.dateNotes = parseNotesOf(origin);
      var op = firstKid(origin, "origPlace");
      var pn = op ? firstKid(op, "placeName") : null;
      if (pn) h.place = { ref: attr(pn, "ref"), lang: xmlLang(pn), text: txt(pn) };
    }
    var prov = firstKid(el, "provenance");
    if (prov) { h.provenance = parsePs(prov); h.provenance.type = attr(prov, "type"); }
    kids(el).forEach(function (k) {
      if (ln(k) !== "origin" && ln(k) !== "provenance") h._x.push(outer(k));
    });
    return h;
  }
  function historyNode(h) {
    if (!h) return null;
    var od = h.date ? N("origDate", { when: h.date.when, notBefore: h.date.notBefore,
      notAfter: h.date.notAfter, evidence: h.date.evidence }, h.date.text) : null;
    var op = h.place ? N("origPlace", null,
      N("placeName", { ref: h.place.ref, "xml:lang": h.place.lang || "zh" }, h.place.text)) : null;
    var prov = h.provenance ? N("provenance", { type: h.provenance.type }, psNodes(h.provenance)) : null;
    return N("history", null,
      (od || op || (h.dateNotes || []).length) ? NK("origin", null, od, noteNodes(h.dateNotes), op) : null,
      prov, (h._x || []).map(RAW));
  }

  /* physDesc for both objects and inscriptions.
   * support and handNote keep their children as ORDERED typed items (the samples
   * interleave note/dimensions freely); forms edit slots via the find helpers. */
  function parseSupportItems(sup) {
    var items = [];
    if (sup) kids(sup).forEach(function (k) {
      var name = ln(k);
      if (name === "objectType" || name === "material") {
        var c = parseClassified(k) || {};
        items.push({ kind: name, ana: c.ana, ref: c.ref, zh: c.zh, en: c.en, text: c.text });
      }
      else if (name === "dimensions") items.push({ kind: "dimensions", dims: parseDims(k) });
      else if (name === "note") items.push({ kind: "note", type: attr(k, "type"), lang: xmlLang(k), xml: inner(k) });
      else items.push({ kind: "raw", xml: outer(k) });
    });
    return items;
  }
  function supportItemNodes(items) {
    return (items || []).map(function (it) {
      if (it.kind === "objectType" || it.kind === "material") return classifiedNode(it.kind, it);
      if (it.kind === "dimensions") return dimsNode(it.dims);
      if (it.kind === "note") return N("note", { type: it.type, "xml:lang": it.lang }, RAW(it.xml));
      return RAW(it.xml);
    });
  }
  function parseHandItems(hn) {
    var items = [];
    kids(hn).forEach(function (k) {
      var name = ln(k);
      if (name === "p") items.push({ kind: "p", lang: xmlLang(k), text: collapse(txt(k)) });
      else if (name === "dimensions") items.push({ kind: "dimensions", dims: parseDims(k) });
      else if (name === "ptr") items.push({ kind: "ptr", type: attr(k, "type"), target: attr(k, "target") });
      else if (name === "note") items.push({ kind: "note", type: attr(k, "type"), lang: xmlLang(k), xml: inner(k) });
      else items.push({ kind: "raw", xml: outer(k) });
    });
    return items;
  }
  function handItemNodes(items) {
    return (items || []).map(function (it) {
      if (it.kind === "p") return it.text ? N("p", { "xml:lang": it.lang || "en" }, it.text) : null;
      if (it.kind === "dimensions") return dimsNode(it.dims);
      if (it.kind === "ptr") return N("ptr", { type: it.type || "glyph-metrics", target: it.target });
      if (it.kind === "note") return N("note", { type: it.type, "xml:lang": it.lang }, RAW(it.xml));
      return RAW(it.xml);
    });
  }
  function parsePhys(el) {
    if (!el) return null;
    var ph = { form: "", supportItems: [], condition: null, layout: null, deco: [], hand: null, _x: [] };
    var od = firstKid(el, "objectDesc");
    ph.form = attr(od, "form");
    var sd = od ? firstKid(od, "supportDesc") : null;
    ph.supportItems = parseSupportItems(sd ? firstKid(sd, "support") : null);
    var cond = sd ? firstKid(sd, "condition") : null;
    if (cond) { ph.condition = parsePs(cond); ph.condition.ana = attr(cond, "ana"); }
    var ld = od ? firstKid(od, "layoutDesc") : null;
    ph.layout = ld ? parseLayout(firstKid(ld, "layout")) : null;
    var dd = firstKid(el, "decoDesc");
    if (dd) kids(dd, "decoNote").forEach(function (dn) {
      var o = parsePs(dn); o.ana = attr(dn, "ana"); ph.deco.push(o);
    });
    var hd = firstKid(el, "handDesc");
    var hn = hd ? firstKid(hd, "handNote") : null;
    if (hn) ph.hand = { scope: attr(hn, "scope"), script: attr(hn, "script"), ana: attr(hn, "ana"),
                        items: parseHandItems(hn) };
    kids(el).forEach(function (k) {
      var name = ln(k);
      if (name !== "objectDesc" && name !== "decoDesc" && name !== "handDesc") ph._x.push(outer(k));
    });
    return ph;
  }
  function physNode(ph) {
    if (!ph) return null;
    var supKids = supportItemNodes(ph.supportItems).filter(Boolean);
    var support = supKids.length ? NK("support", null, supKids) : null;
    var condition = ph.condition
      ? N("condition", { ana: ph.condition.ana }, psNodes(ph.condition)) : null;
    var supportDesc = (support || condition) ? NK("supportDesc", null, support, condition) : null;
    var layout = layoutNode(ph.layout);
    var objectDesc = (supportDesc || layout || ph.form)
      ? NK("objectDesc", { form: ph.form }, supportDesc, layout ? N("layoutDesc", null, layout) : null) : null;
    var deco = (ph.deco || []).length
      ? N("decoDesc", null, ph.deco.map(function (d) { return N("decoNote", { ana: d.ana }, psNodes(d)); })) : null;
    var hand = ph.hand
      ? N("handDesc", null, N("handNote", { scope: ph.hand.scope, script: ph.hand.script, ana: ph.hand.ana },
          handItemNodes(ph.hand.items))) : null;
    return N("physDesc", null, objectDesc, hand, deco, (ph._x || []).map(RAW));
  }
  /* find helpers for the forms (edit slots inside ordered item lists) */
  function findItem(items, kind) {
    for (var i = 0; i < (items || []).length; i++) if (items[i].kind === kind) return items[i];
    return null;
  }
  function upsertItem(items, kind, make, atStart) {
    var it = findItem(items, kind);
    if (!it) { it = make(); atStart ? items.unshift(it) : items.push(it); }
    return it;
  }

  /* msContents: summary + msItems */
  function parseMsContents(el) {
    if (!el) return null;
    var mc = { summaryEn: "", summaryZh: "", items: [] };
    kids(el, "summary").forEach(function (s) {
      if (xmlLang(s) === "zh") mc.summaryZh = txt(s); else mc.summaryEn = collapse(txt(s));
    });
    kids(el, "msItem").forEach(function (mi) {
      var it = { n: attr(mi, "n"), corresp: attr(mi, "corresp"), locusTarget: "", locusText: "",
                 titles: [], notes: [], mainLang: "", _x: [] };
      kids(mi).forEach(function (k) {
        var name = ln(k);
        if (name === "locus") { it.locusTarget = attr(k, "target"); it.locusText = txt(k); }
        else if (name === "title") it.titles.push({ lang: xmlLang(k), type: attr(k, "type"), text: collapse(txt(k)) });
        else if (name === "note") it.notes.push({ type: attr(k, "type"), lang: xmlLang(k), xml: inner(k) });
        else if (name === "textLang") it.mainLang = attr(k, "mainLang");
        else it._x.push(outer(k));
      });
      mc.items.push(it);
    });
    return mc;
  }
  function msContentsNode(mc) {
    if (!mc) return null;
    return N("msContents", null,
      mc.summaryEn ? N("summary", { "xml:lang": "en" }, mc.summaryEn) : null,
      mc.summaryZh ? N("summary", { "xml:lang": "zh" }, mc.summaryZh) : null,
      (mc.items || []).map(function (it) {
        var hasLocus = it.locusTarget || it.locusText;
        return N("msItem", { n: it.n, corresp: it.corresp },
          hasLocus ? (it.locusText ? N("locus", { target: it.locusTarget }, it.locusText)
                                   : N("locus", { target: it.locusTarget })) : null,
          (it.titles || []).map(function (t) {
            return t.text ? N("title", { "xml:lang": t.lang || "zh", type: t.type }, t.text) : null;
          }),
          noteNodes(it.notes),
          it.mainLang ? N("textLang", { mainLang: it.mainLang }) : null,
          (it._x || []).map(RAW));
      }));
  }

  // ---------------------------------------------------------------- SITE ----
  function parsePlaceEl(el) {
    var p = { id: xmlId(el), type: attr(el, "type"), subtype: attr(el, "subtype"), ana: attr(el, "ana"),
              nameZh: "", nameEn: "", country: {}, region: {}, settlement: {},
              geo: "", notes: [], objectPtrs: [], subsites: [], _x: [] };
    kids(el).forEach(function (k) {
      var name = ln(k);
      if (name === "placeName") {
        if (xmlLang(k) === "zh") p.nameZh = p.nameZh || txt(k);
        else p.nameEn = p.nameEn || collapse(txt(k));
      } else if (name === "country" || name === "region" || name === "settlement") {
        var slot = p[name]; var lang = xmlLang(k) === "zh" ? "zh" : "en";
        if (!slot[lang]) slot[lang] = name === "country" || lang === "zh" ? txt(k) : collapse(txt(k));
      } else if (name === "location") {
        var g = firstKid(k, "geo"); if (g) p.geo = txt(g);
      } else if (name === "note") {
        p.notes.push({ type: attr(k, "type"), lang: xmlLang(k), xml: inner(k) });
      } else if (name === "linkGrp" && attr(k, "type") === "objects") {
        kids(k, "ptr").forEach(function (pt) { p.objectPtrs.push(attr(pt, "target")); });
      } else if (name === "place") {
        p.subsites.push(parsePlaceEl(k));
      } else {
        p._x.push(outer(k));
      }
    });
    return p;
  }
  function placeNode(p) {
    function bi(tag, slot) {
      return [slot.zh ? N(tag, { "xml:lang": "zh" }, slot.zh) : null,
              slot.en ? N(tag, { "xml:lang": "en" }, slot.en) : null];
    }
    return NK("place", { "xml:id": p.id, type: p.type, subtype: p.subtype, ana: p.ana },
      p.nameZh ? N("placeName", { "xml:lang": "zh" }, p.nameZh) : null,
      p.nameEn ? N("placeName", { "xml:lang": "en" }, p.nameEn) : null,
      bi("country", p.country || {}), bi("region", p.region || {}), bi("settlement", p.settlement || {}),
      p.geo ? N("location", null, N("geo", null, p.geo)) : null,
      noteNodes(p.notes),
      (p.objectPtrs || []).length ? N("linkGrp", { type: "objects" },
        p.objectPtrs.map(function (tgt) { return N("ptr", { type: "object", target: tgt }); })) : null,
      (p._x || []).map(RAW),
      (p.subsites || []).map(placeNode));                    // nested places LAST
  }
  function parseSite(xml) {
    var doc = parseDoc(xml); if (!doc) return null;
    var st = parseHeaderCommon(doc);
    st.model = "site";
    st.fileId = xmlId(doc.documentElement);
    var lp = desc(doc.documentElement, "listPlace")[0];
    st.place = lp ? parsePlaceEl(firstKid(lp, "place")) : parsePlaceEl(doc.createElement("place"));
    return st;
  }
  function buildSite(st) {
    var TEI = NK("TEI", { xmlns: TEI_NS, "xml:id": st.fileId },
      NK("teiHeader", null, headerNodes(st, "site"), encodingNode(st)),
      NK("text", null, NK("body", null, NK("listPlace", null, placeNode(st.place)))));
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ser(TEI, 0) + "\n";
  }

  // -------------------------------------------------------------- OBJECT ----
  function parseObjectEl(el, isPart) {
    var o = { id: xmlId(el), type: attr(el, "type"), subtype: attr(el, "subtype"),
              n: attr(el, "n"), ana: attr(el, "ana"),
              ident: { country: {}, region: {}, settlement: {}, nameZh: "", nameEn: "", idnoSupport: "" },
              msContents: null, phys: null, history: null, notes: [], parts: [], _x: [] };
    kids(el).forEach(function (k) {
      var name = ln(k);
      if (name === "objectIdentifier") {
        kids(k).forEach(function (c) {
          var cn = ln(c), lang = xmlLang(c) === "zh" ? "zh" : "en";
          if (cn === "objectName") {
            if (lang === "zh") o.ident.nameZh = o.ident.nameZh || txt(c);
            else o.ident.nameEn = o.ident.nameEn || collapse(txt(c));
          } else if (cn === "country" || cn === "region" || cn === "settlement") {
            if (!o.ident[cn][lang]) o.ident[cn][lang] = txt(c);
          } else if (cn === "idno") {
            if (attr(c, "type") === "support") o.ident.idnoSupport = txt(c);
          }
        });
      }
      else if (name === "msContents") o.msContents = parseMsContents(k);
      else if (name === "physDesc") o.phys = parsePhys(k);
      else if (name === "history") o.history = parseHistory(k);
      else if (name === "note") o.notes.push({ type: attr(k, "type"), lang: xmlLang(k), xml: inner(k) });
      else if (name === "object") o.parts.push(parseObjectEl(k, true));
      else o._x.push(outer(k));
    });
    return o;
  }
  function objectNode(o) {
    function bi(tag, slot) {
      return [(slot.zh ? N(tag, { "xml:lang": "zh" }, slot.zh) : null),
              (slot.en ? N(tag, { "xml:lang": "en" }, slot.en) : null)];
    }
    var identKids = flat([
      bi("country", o.ident.country || {}), bi("region", o.ident.region || {}),
      bi("settlement", o.ident.settlement || {}),
      o.ident.nameZh ? N("objectName", { "xml:lang": "zh" }, o.ident.nameZh) : null,
      o.ident.nameEn ? N("objectName", { "xml:lang": "en" }, o.ident.nameEn) : null,
      o.ident.idnoSupport ? N("idno", { type: "support" }, o.ident.idnoSupport) : null
    ]);
    return NK("object", { "xml:id": o.id, type: o.type, subtype: o.subtype, n: o.n, ana: o.ana },
      identKids.length ? NK("objectIdentifier", null, identKids) : null,
      msContentsNode(o.msContents),
      physNode(o.phys),
      historyNode(o.history),
      noteNodes(o.notes),
      (o._x || []).map(RAW),
      (o.parts || []).map(objectNode));                      // nested objects LAST
  }
  function parseObject(xml) {
    var doc = parseDoc(xml); if (!doc) return null;
    var st = parseHeaderCommon(doc);
    st.model = "objectfile";
    st.fileId = xmlId(doc.documentElement);
    var lo = desc(doc.documentElement, "listObject")[0];
    st.obj = lo ? parseObjectEl(firstKid(lo, "object")) : null;
    return st;
  }
  function buildObject(st) {
    var TEI = NK("TEI", { xmlns: TEI_NS, "xml:id": st.fileId },
      NK("teiHeader", null, headerNodes(st, "object"), encodingNode(st)),
      NK("text", null, NK("body", null, NK("listObject", null, objectNode(st.obj)))));
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ser(TEI, 0) + "\n";
  }

  // --------------------------------------------------------- INSCRIPTION ----
  function parseWitness(w) {
    var wit = { id: xmlId(w), n: attr(w, "n"), ana: attr(w, "ana"), items: [] };
    var bibl = firstKid(w, "bibl") || w;
    kids(bibl).forEach(function (k) {
      var name = ln(k);
      if (name === "rs" && attr(k, "type") === "witness-type") {
        var c = parseClassified(k); wit.items.push({ kind: "rs", ana: c && c.ana, zh: c && c.zh, en: c && c.en });
      } else if (name === "date") {
        wit.items.push({ kind: "date", when: attr(k, "when"), text: txt(k) });
      } else if (name === "orgName") {
        wit.items.push({ kind: "orgName", role: attr(k, "role"), lang: xmlLang(k), text: txt(k) });
      } else if (name === "placeName") {
        wit.items.push({ kind: "placeName", lang: xmlLang(k), text: txt(k) });
      } else if (name === "idno") {
        wit.items.push({ kind: "idno", type: attr(k, "type"), text: txt(k) });
      } else if (name === "extent") {
        wit.items.push({ kind: "extent", text: txt(k) });
      } else if (name === "note") {
        wit.items.push({ kind: "note", type: attr(k, "type"), lang: xmlLang(k), xml: inner(k) });
      } else {
        wit.items.push({ kind: "raw", xml: outer(k) });
      }
    });
    return wit;
  }
  function witnessNode(wit) {
    return N("witness", { "xml:id": wit.id, n: wit.n, ana: wit.ana },
      NK("bibl", null, (wit.items || []).map(function (it) {
        switch (it.kind) {
          case "rs": return N("rs", { type: "witness-type", ana: it.ana },
            it.zh ? N("term", { "xml:lang": "zh" }, it.zh) : null,
            it.en ? N("term", { "xml:lang": "en" }, it.en) : null);
          case "date": return N("date", { when: it.when }, it.text);
          case "orgName": return N("orgName", { role: it.role || "repository", "xml:lang": it.lang }, it.text);
          case "placeName": return N("placeName", { "xml:lang": it.lang }, it.text);
          case "idno": return N("idno", { type: it.type || "accession" }, it.text);
          case "extent": return N("extent", null, it.text);
          case "note": return N("note", { type: it.type, "xml:lang": it.lang }, RAW(it.xml));
          default: return RAW(it.xml);
        }
      })));
  }
  function parseInscription(xml) {
    var doc = parseDoc(xml); if (!doc) return null;
    var st = parseHeaderCommon(doc);
    st.model = "inscription";
    st.fileId = xmlId(doc.documentElement);
    var rootEl = doc.documentElement;

    var msDesc = desc(rootEl, "msDesc")[0];
    st.corresp = attr(msDesc, "corresp");
    st.msIdent = { country: "", region: "", settlement: "", idnoEdition: "", idnoSupport: "",
                   idnoSegment: "", altType: "", altIdno: "", _x: [] };
    var mi = msDesc ? firstKid(msDesc, "msIdentifier") : null;
    if (mi) kids(mi).forEach(function (k) {
      var name = ln(k);
      if (name === "country") st.msIdent.country = txt(k);
      else if (name === "region") st.msIdent.region = txt(k);
      else if (name === "settlement") st.msIdent.settlement = txt(k);
      else if (name === "idno") {
        var ty = attr(k, "type");
        if (ty === "edition") st.msIdent.idnoEdition = txt(k);
        else if (ty === "support") st.msIdent.idnoSupport = txt(k);
        else if (ty === "segment") st.msIdent.idnoSegment = txt(k);
        else st.msIdent._x.push(outer(k));
      }
      else if (name === "altIdentifier") {
        st.msIdent.altType = attr(k, "type");
        st.msIdent.altIdno = txt(firstKid(k, "idno"));
      }
      else st.msIdent._x.push(outer(k));
    });
    st.msContents = msDesc ? parseMsContents(firstKid(msDesc, "msContents")) : null;
    st.phys = msDesc ? parsePhys(firstKid(msDesc, "physDesc")) : null;
    st.history = msDesc ? parseHistory(firstKid(msDesc, "history")) : null;

    st.witnesses = [];
    // ONLY the sourceDesc-level witness list (E-WIT rubbings); an edition div may
    // carry its own inline <listWit> of text witnesses, which must stay there.
    var srcDesc = msDesc ? msDesc.parentNode : desc(rootEl, "sourceDesc")[0];
    var lw = srcDesc ? firstKid(srcDesc, "listWit") : null;
    if (lw) kids(lw, "witness").forEach(function (w) { st.witnesses.push(parseWitness(w)); });

    st.languages = desc(rootEl, "langUsage").length
      ? kids(desc(rootEl, "langUsage")[0], "language").map(function (l) {
          return { ident: attr(l, "ident"), label: txt(l) };
        })
      : [];

    var textEl = kids(rootEl, "text")[0];
    st.textNext = attr(textEl, "next"); st.textPrev = attr(textEl, "prev");
    st.edition = { lang: "lzh", mode: "ptr", ptrTarget: "", inlineText: "" };
    st.bibls = [];                       // ordered: {canonical:true,taisho,range} | {xml}
    st._bodyX = [];
    var body = textEl ? firstKid(textEl, "body") : null;
    if (body) kids(body, "div").forEach(function (d) {
      var ty = attr(d, "type");
      if (ty === "edition") {
        st.edition.lang = xmlLang(d) || "lzh";
        // delegated form: the div holds ONLY <ab><ptr type="transcription"/></ab>
        var dKids = kids(d), ab = firstKid(d, "ab");
        var abKids = ab ? kids(ab) : [];
        var ptr = abKids.length === 1 && ln(abKids[0]) === "ptr" ? abKids[0] : null;
        if (dKids.length === 1 && ptr && attr(ptr, "type") === "transcription" && !txt(ab)) {
          st.edition.mode = "ptr"; st.edition.ptrTarget = attr(ptr, "target");
        } else {
          // inline form: the WHOLE div content verbatim (ab with the transcription,
          // optionally preceded by a listWit of text witnesses)
          st.edition.mode = "inline";
          st.edition.inlineText = inner(d);
        }
      } else if (ty === "bibliography") {
        var lb = firstKid(d, "listBibl");
        kids(lb, "bibl").forEach(function (b) {
          var idn = firstKid(b, "idno");
          var cr = firstKid(b, "citedRange");
          if (attr(b, "type") === "canonical" && (idn || cr)) {
            st.bibls.push({ canonical: true,
              taisho: idn && attr(idn, "type") === "taisho" ? txt(idn) : "",
              range: cr ? txt(cr) : "" });
          } else st.bibls.push({ xml: outer(b) });
        });
      } else st._bodyX.push(outer(d));
    });
    return st;
  }
  function buildInscription(st) {
    var mi = st.msIdent || {};
    var msIdentifier = NK("msIdentifier", null,
      mi.country ? N("country", { "xml:lang": "zh" }, mi.country) : null,
      mi.region ? N("region", { "xml:lang": "zh" }, mi.region) : null,
      mi.settlement ? N("settlement", { "xml:lang": "zh" }, mi.settlement) : null,
      mi.idnoEdition ? N("idno", { type: "edition" }, mi.idnoEdition) : null,
      mi.idnoSupport ? N("idno", { type: "support" }, mi.idnoSupport) : null,
      mi.idnoSegment ? N("idno", { type: "segment" }, mi.idnoSegment) : null,
      mi.altIdno ? N("altIdentifier", { type: mi.altType || "sutras-data" }, N("idno", null, mi.altIdno)) : null,
      (mi._x || []).map(RAW));
    var msDesc = NK("msDesc", { corresp: st.corresp },
      msIdentifier, msContentsNode(st.msContents), physNode(st.phys), historyNode(st.history));
    var listWit = (st.witnesses || []).length
      ? N("listWit", null, st.witnesses.map(witnessNode)) : null;

    var fileDesc = NK("fileDesc", null,
      NK("titleStmt", null, titleNodes(st)),
      NK("publicationStmt", null,
        N("authority", null, st.authority || "Epiwen / EpiDoc-CN profile — sample"),
        N("idno", { type: st.idnoType || "filename" }, st.idno),
        availabilityNode(st.availability)),
      NK("sourceDesc", null, msDesc, listWit,
        (st.sourceBibls || []).map(function (b) { return N("bibl", null, RAW(b)); })));

    var langs = (st.languages && st.languages.length)
      ? st.languages : [{ ident: "lzh", label: "Literary Chinese" }];
    var profileDesc = N("profileDesc", null,
      N("langUsage", null, langs.map(function (l) {
        return N("language", { ident: l.ident }, l.label);
      })));

    var editionDiv;
    if (st.edition && st.edition.mode === "inline") {
      // inlineText is the div's whole content (e.g. optional <listWit> + <ab>…</ab>);
      // bare text without any <ab> wrapper is wrapped for TEI validity.
      var edInner = String(st.edition.inlineText || "");
      if (edInner && edInner.indexOf("<ab") === -1) edInner = "<ab>" + edInner + "</ab>";
      editionDiv = NK("div", { type: "edition", "xml:lang": st.edition.lang || "lzh" },
        RAW(edInner || "<ab/>"));
    } else {
      editionDiv = NK("div", { type: "edition", "xml:lang": (st.edition && st.edition.lang) || "lzh" },
        NK("ab", null, N("ptr", { type: "transcription", target: st.edition ? st.edition.ptrTarget : "" })));
    }
    var biblDiv = (st.bibls || []).length
      ? N("div", { type: "bibliography" }, N("listBibl", null,
          st.bibls.map(function (b) {
            if (b.canonical) {
              var innerXml = (b.taisho ? '<idno type="taisho">' + escText(b.taisho) + "</idno>" : "") +
                             (b.range ? "<citedRange>" + escText(b.range) + "</citedRange>" : "");
              return RAW('<bibl type="canonical">' + innerXml + "</bibl>");
            }
            return RAW(b.xml);
          })))
      : null;

    var TEI = NK("TEI", { xmlns: TEI_NS, "xml:id": st.fileId },
      NK("teiHeader", null, fileDesc, encodingNode(st), profileDesc),
      NK("text", { next: st.textNext, prev: st.textPrev },
        // canonical EpiDoc order: edition → translation/commentary (_bodyX) → bibliography
        NK("body", null, editionDiv, (st._bodyX || []).map(RAW), biblDiv)));
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ser(TEI, 0) + "\n";
  }

  // ----------------------------------------------------------- taxonomies ---
  function parseTaxonomies(xml) {
    var doc = parseDoc(xml); if (!doc) return null;
    var out = {};
    desc(doc.documentElement, "taxonomy").forEach(function (tx) {
      var id = xmlId(tx), cats = [];
      kids(tx, "category").forEach(function (c) {
        var cat = { id: xmlId(c), zh: "", en: "", ref: "" };
        kids(c, "catDesc").forEach(function (cd) {
          var g = firstKid(cd, "gloss");
          if (xmlLang(cd) === "zh") cat.zh = txt(g || cd);
          else {
            cat.en = collapse(txt(g || cd));
            var refEl = firstKid(cd, "ref");
            if (refEl && attr(refEl, "type") === "getty") cat.ref = attr(refEl, "target");
          }
        });
        cats.push(cat);
      });
      out[id] = cats;
    });
    return out;
  }
  /* bundled snapshot of epiwen-taxonomies.xml (ids + short glosses + verified Getty refs) */
  var FALLBACK_TAX = {
    objectTypes: [
      { id: "object.stele", zh: "碑", en: "stele", ref: "http://vocab.getty.edu/aat/300007023" },
      { id: "object.rock-face", zh: "摩崖", en: "rock-face", ref: "http://vocab.getty.edu/aat/300404733" },
      { id: "object.boulder", zh: "刻經石／巨石", en: "inscribed boulder", ref: "http://vocab.getty.edu/aat/300404733" },
      { id: "object.panel", zh: "組合刻面", en: "multi-text panel", ref: "http://vocab.getty.edu/aat/300404733" },
      { id: "object.cave", zh: "石窟", en: "rock-cut text cave", ref: "" },
      { id: "object.cave-wall", zh: "窟壁", en: "cave wall", ref: "" },
      { id: "object.jingchuang", zh: "經幢", en: "sutra pillar", ref: "" }
    ],
    materials: [
      { id: "material.granite.biotite", zh: "黑雲母花崗岩", en: "biotite granite", ref: "http://vocab.getty.edu/aat/300011183" },
      { id: "material.granite.leuco", zh: "淡色花崗岩", en: "leucogranite", ref: "http://vocab.getty.edu/aat/300011183" },
      { id: "material.granite.biotite-hornblende", zh: "黑雲母角閃石花崗岩", en: "biotite-hornblende granite", ref: "http://vocab.getty.edu/aat/300011183" },
      { id: "material.limestone.fossiliferous", zh: "含化石石灰岩", en: "fossiliferous limestone", ref: "http://vocab.getty.edu/aat/300011286" }
    ],
    conditions: [
      { id: "condition.excellent", zh: "極佳", en: "excellent", ref: "" },
      { id: "condition.good", zh: "良好／尚佳", en: "good", ref: "" },
      { id: "condition.fair", zh: "尚可", en: "fair", ref: "" },
      { id: "condition.slightly-damaged", zh: "微損", en: "slightly damaged", ref: "" },
      { id: "condition.poor", zh: "劣", en: "poor", ref: "" },
      { id: "condition.lost", zh: "佚失（舊存）", en: "stone lost", ref: "" }
    ],
    executions: [
      { id: "execution.v-cut", zh: "“V”形刻法", en: "V-shaped cut", ref: "http://vocab.getty.edu/aat/300053847" },
      { id: "execution.u-cut", zh: "“U”形刻法", en: "U-shaped cut", ref: "http://vocab.getty.edu/aat/300053847" },
      { id: "execution.kan-cut", zh: "“凵”形刻法", en: "rectangular-U cut", ref: "http://vocab.getty.edu/aat/300053847" },
      { id: "execution.feibai", zh: "飛白刻", en: "flying-white carving", ref: "" },
      { id: "execution.unknown", zh: "未知", en: "unknown", ref: "" }
    ],
    surfaceTreatments: [
      { id: "polishing.polished", zh: "磨光（有）", en: "surface polished", ref: "" },
      { id: "polishing.unpolished", zh: "未磨（無）", en: "not polished (attested absent)", ref: "" }
    ],
    scripts: [
      { id: "script.kaishu", zh: "楷書", en: "regular script", ref: "" },
      { id: "script.lishu", zh: "隸書", en: "clerical script", ref: "" }
    ],
    shapes: [
      { id: "shape.vertical-rectangle", zh: "縱長方形", en: "vertical rectangle", ref: "" },
      { id: "shape.horizontal-rectangle", zh: "橫長方形", en: "horizontal rectangle", ref: "" }
    ],
    features: [
      { id: "decor.none", zh: "無紋飾", en: "no decoration (attested absent)", ref: "" },
      { id: "decor.border", zh: "飾帶／邊飾", en: "carved ornamental border", ref: "" },
      { id: "frame.present", zh: "有邊框", en: "frame present", ref: "" },
      { id: "frame.none", zh: "無邊框", en: "no frame (attested absent)", ref: "" }
    ],
    witnessTypes: [
      { id: "witness.rubbing", zh: "拓本", en: "ink rubbing", ref: "" },
      { id: "witness.woodcut", zh: "摹刻（木刻翻刻拓本）", en: "woodcut reproduction of a rubbing", ref: "" }
    ]
  };
  var _taxCache = null;
  function loadTaxonomies() {
    if (_taxCache) return Promise.resolve(_taxCache);
    var viaCollection = (typeof window !== "undefined" && window.EpiCollections && EpiCollections.fetchRecordXml)
      ? EpiCollections.fetchRecordXml("epidoc-cn", "epiwen-taxonomies.xml")
          .then(function (xml) { return parseTaxonomies(xml); })
      : Promise.reject(new Error("no collections module"));
    return viaCollection
      .then(function (tax) { _taxCache = tax && tax.objectTypes ? tax : FALLBACK_TAX; return _taxCache; })
      .catch(function () { _taxCache = FALLBACK_TAX; return _taxCache; });
  }

  return {
    detect: detect,
    parseSite: parseSite, buildSite: buildSite,
    parseObject: parseObject, buildObject: buildObject,
    parseInscription: parseInscription, buildInscription: buildInscription,
    parseTaxonomies: parseTaxonomies, loadTaxonomies: loadTaxonomies,
    findItem: findItem, upsertItem: upsertItem,
    FALLBACK_TAX: FALLBACK_TAX
  };
});
