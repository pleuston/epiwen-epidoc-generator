/*
 * vocab.js — controlled vocabularies for the Chinese stone-sutra EpiDoc form.
 *
 * These lists are deliberately small and editable. They mirror the project's
 * own taxonomy (AI/spaces/semantic-universe/ontology/stonesutras-thesaurus.ttl
 * and the TEI export pb-keywords.xml) and can be regenerated from them. Each
 * option carries a bilingual label and, where available, a `ref` (a thesaurus
 * concept id or an external authority) that lands in the EpiDoc @ref attribute.
 *
 * The reign-era table (ERAS) is the China-specific feature absent from the
 * Hamburg generator: picking an era fills @notBefore/@notAfter, and a reign
 * year (e.g. 六年) computes an exact @when. The set below is a STARTER focused
 * on the Northern-dynasties → Tang window where the stone-sutra corpus
 * concentrates; extend freely (or generate from the DILA time/ authority).
 */
(function (root) {
  var V = {};

  // material (材質) — stone sutras are overwhelmingly stone; subtypes given
  V.MATERIALS = [
    { en: "limestone", zh: "石灰岩", ref: "aat:300011286" },
    { en: "sandstone", zh: "砂岩", ref: "aat:300011727" },
    { en: "marble", zh: "大理石", ref: "aat:300011443" },
    { en: "granite", zh: "花崗岩", ref: "aat:300011197" },
    { en: "stone (unspecified)", zh: "石", ref: "aat:300011176" }
  ];

  // object type (物件類型) — the project's five carriers of scripture
  V.OBJECT_TYPES = [
    { en: "cliff carving (moya)", zh: "摩崖刻經", ref: "sst:cliff-carved-sutra" },
    { en: "stele", zh: "碑", ref: "sst:stele" },
    { en: "dhāraṇī / sutra pillar (jingchuang)", zh: "經幢", ref: "sst:dharani-pillar" },
    { en: "cave wall", zh: "窟壁", ref: "sst:cave-wall" },
    { en: "dedicatory inscription (tiji)", zh: "題記 / 造像記", ref: "sst:dedicatory-text" }
  ];

  // script (書體)
  V.SCRIPTS = [
    { en: "seal script", zh: "篆書", ref: "sst:seal-script" },
    { en: "clerical script", zh: "隸書", ref: "sst:clerical-script" },
    { en: "regular script", zh: "楷書", ref: "sst:regular-script" },
    { en: "clerical-to-regular (transitional)", zh: "隸楷之間", ref: "sst:transitional-script" },
    { en: "running script", zh: "行書", ref: "sst:running-script" },
    { en: "cursive script", zh: "草書", ref: "sst:cursive-script" }
  ];

  // primary text language (語言)
  V.LANGS = [
    { ident: "zh", en: "Literary Chinese 漢文", zh: "漢文" },
    { ident: "lzh", en: "Classical Chinese", zh: "文言" },
    { ident: "sa-Sidd", en: "Sanskrit (Siddhaṃ)", zh: "梵文（悉曇）" },
    { ident: "sa-Latn", en: "Sanskrit (romanised)", zh: "梵文（拉丁轉寫）" }
  ];

  // licences
  V.LICENCES = [
    { label: "CC BY 4.0", target: "https://creativecommons.org/licenses/by/4.0/" },
    { label: "CC BY-SA 4.0", target: "https://creativecommons.org/licenses/by-sa/4.0/" },
    { label: "CC BY-NC 4.0", target: "https://creativecommons.org/licenses/by-nc/4.0/" },
    { label: "CC0 1.0", target: "https://creativecommons.org/publicdomain/zero/1.0/" }
  ];

  // a few canonical sutras with CBETA / Taishō anchors (for the msItem ref)
  V.SUTRAS = [
    { en: "Diamond Sūtra", zh: "金剛般若波羅蜜經", cbeta: "T08n0235", taisho: "T 235" },
    { en: "Heart Sūtra", zh: "般若波羅蜜多心經", cbeta: "T08n0251", taisho: "T 251" },
    { en: "Lotus Sūtra", zh: "妙法蓮華經", cbeta: "T09n0262", taisho: "T 262" },
    { en: "Nirvāṇa Sūtra", zh: "大般涅槃經", cbeta: "T12n0374", taisho: "T 374" },
    { en: "Mahāmāyūrī / Great Perfection of Wisdom", zh: "摩訶般若波羅蜜經", cbeta: "T08n0223", taisho: "T 223" },
    { en: "Sūtra on the Names of the Buddhas", zh: "佛說佛名經", cbeta: "T14n0440", taisho: "T 440" },
    { en: "Uṣṇīṣa Vijaya Dhāraṇī", zh: "佛頂尊勝陀羅尼經", cbeta: "T19n0967", taisho: "T 967" }
  ];

  // dynasty spans (Gregorian) — used as fallback notBefore/notAfter
  V.DYNASTIES = [
    { zh: "北魏", en: "Northern Wei", start: 386, end: 534 },
    { zh: "東魏", en: "Eastern Wei", start: 534, end: 550 },
    { zh: "西魏", en: "Western Wei", start: 535, end: 556 },
    { zh: "北齊", en: "Northern Qi", start: 550, end: 577 },
    { zh: "北周", en: "Northern Zhou", start: 557, end: 581 },
    { zh: "隋", en: "Sui", start: 581, end: 618 },
    { zh: "唐", en: "Tang", start: 618, end: 907 }
  ];

  // reign-era table (年號). start/end are inclusive Gregorian years.
  // STARTER set — Northern Qi / Zhou / Sui / early-Tang heartland of cliff sutras.
  V.ERAS = [
    // 北魏 Northern Wei (selected late eras, the sutra-carving uptick)
    { dyn: "北魏", era: "太和", py: "Taihe", start: 477, end: 499 },
    { dyn: "北魏", era: "正始", py: "Zhengshi", start: 504, end: 508 },
    { dyn: "北魏", era: "永平", py: "Yongping", start: 508, end: 512 },
    { dyn: "北魏", era: "延昌", py: "Yanchang", start: 512, end: 515 },
    { dyn: "北魏", era: "正光", py: "Zhengguang", start: 520, end: 525 },
    { dyn: "北魏", era: "孝昌", py: "Xiaochang", start: 525, end: 527 },
    // 東魏 Eastern Wei
    { dyn: "東魏", era: "天平", py: "Tianping", start: 534, end: 537 },
    { dyn: "東魏", era: "興和", py: "Xinghe", start: 539, end: 542 },
    { dyn: "東魏", era: "武定", py: "Wuding", start: 543, end: 550 },
    // 西魏 Western Wei
    { dyn: "西魏", era: "大統", py: "Datong", start: 535, end: 551 },
    // 北齊 Northern Qi (peak cliff-sutra eras)
    { dyn: "北齊", era: "天保", py: "Tianbao", start: 550, end: 559 },
    { dyn: "北齊", era: "河清", py: "Heqing", start: 562, end: 565 },
    { dyn: "北齊", era: "天統", py: "Tiantong", start: 565, end: 569 },
    { dyn: "北齊", era: "武平", py: "Wuping", start: 570, end: 576 },
    { dyn: "北齊", era: "隆化", py: "Longhua", start: 576, end: 577 },
    // 北周 Northern Zhou
    { dyn: "北周", era: "保定", py: "Baoding", start: 561, end: 565 },
    { dyn: "北周", era: "天和", py: "Tianhe", start: 566, end: 572 },
    { dyn: "北周", era: "建德", py: "Jiande", start: 572, end: 578 },
    { dyn: "北周", era: "大象", py: "Daxiang", start: 579, end: 580 },
    // 隋 Sui
    { dyn: "隋", era: "開皇", py: "Kaihuang", start: 581, end: 600 },
    { dyn: "隋", era: "仁壽", py: "Renshou", start: 601, end: 604 },
    { dyn: "隋", era: "大業", py: "Daye", start: 605, end: 618 },
    // 唐 Tang (selected)
    { dyn: "唐", era: "武德", py: "Wude", start: 618, end: 626 },
    { dyn: "唐", era: "貞觀", py: "Zhenguan", start: 627, end: 649 },
    { dyn: "唐", era: "開元", py: "Kaiyuan", start: 713, end: 741 },
    { dyn: "唐", era: "天寶", py: "Tianbao", start: 742, end: 756 }
  ];

  if (typeof module === "object" && module.exports) module.exports = V;
  else root.VOCAB = V;
})(typeof self !== "undefined" ? self : this);
