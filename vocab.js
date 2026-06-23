/*
 * vocab.js — controlled vocabularies for the Chinese stone-sutra EpiDoc form.
 *
 * Object types and scripts are now sourced from the Epiverse (th770) controlled
 * vocabulary on OpenTheso (https://opentheso.huma-num.fr). The `ref` field
 * carries the concept URI that lands in the EpiDoc @ref attribute; `opentheso_id`
 * carries the raw concept identifier for display or API calls. Entries without a
 * th770 match retain `sst:` or `aat:` refs.
 *
 * Source: /Users/sassmann/Downloads/epiwen/Epiverse_th770.rdf (2026-06-12 export)
 * Thesaurus ARK: https://opentheso.huma-num.fr/api/ark:/66666/th770
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
  // th770 does not classify materials; AAT refs retained
  V.MATERIALS = [
    { en: "limestone",          zh: "石灰岩", ref: "aat:300011286" },
    { en: "sandstone",          zh: "砂岩",   ref: "aat:300011727" },
    { en: "marble",             zh: "大理石", ref: "aat:300011443" },
    { en: "granite",            zh: "花崗岩", ref: "aat:300011197" },
    { en: "stone (unspecified)", zh: "石",    ref: "aat:300011176" }
  ];

  // object type (物件類型) — sourced from th770 "Type of support" hierarchy (802575)
  // plus project-specific types that have no th770 equivalent
  V.OBJECT_TYPES = [
    {
      en: "Cliff/Moya", zh: "摩崖",
      ref: "https://opentheso.huma-num.fr/?idc=802581&idt=th770",
      opentheso_id: "802581",
      definition: "Stone slope constituting a geomorphological part of a mountain."
    },
    {
      en: "Stele", zh: "碑",
      ref: "https://opentheso.huma-num.fr/?idc=915132&idt=th770",
      opentheso_id: "915132",
      definition: "Stone slab of considerable size that bears an inscription or relief sculpture often commemorative, honorific, administrative, or votive in nature."
    },
    {
      en: "Pillar (jingchuang / dhāraṇī pillar)", zh: "石柱 / 經幢",
      ref: "https://opentheso.huma-num.fr/?idc=802580&idt=th770",
      opentheso_id: "802580",
      definition: "A rock formation with the appearance or function of a pillar. The term may also refer to a polished stone monument bearing inscriptions, as is the case with dhāraṇī pillars."
    },
    {
      en: "Cave wall", zh: "洞壁",
      ref: "https://opentheso.huma-num.fr/?idc=802582&idt=th770",
      opentheso_id: "802582",
      definition: "The natural rock surfaces inside a cave."
    },
    {
      en: "Stone slab", zh: "石碑",
      ref: "https://opentheso.huma-num.fr/?idc=802578&idt=th770",
      opentheso_id: "802578",
      definition: "A portable, flat, rectangular stone surface prepared to bear inscriptions."
    },
    {
      en: "Epitaph", zh: "墓志铭",
      ref: "https://opentheso.huma-num.fr/?idc=915133&idt=th770",
      opentheso_id: "915133",
      definition: "Stone slab bearing a commemorative and honorific inscription dedicated to the deceased, typically found in a funerary context."
    },
    {
      en: "Cliff inscription", zh: "摩崖石刻",
      ref: "https://opentheso.huma-num.fr/?idc=925189&idt=th770",
      opentheso_id: "925189",
      definition: "Inscriptions in large characters on outdoor cliffs (moya shike 摩崖石刻)."
    },
    {
      en: "Inscribed landscape", zh: "刻字景觀",
      ref: "https://opentheso.huma-num.fr/?idc=925227&idt=th770",
      opentheso_id: "925227"
    },
    // project-specific types without a direct th770 support equivalent
    { en: "image stele (zaoxiang bei)", zh: "造像碑", ref: "sst:image-stele" }
  ];

  // inscription type (文本類型) — the *kind of text* engraved on the object, as
  // distinct from the physical support (V.OBJECT_TYPES). A votive inscription
  // (題記 / 造像記) is typically engraved on an image stele (造像碑 — an object
  // type above). No th770 equivalent; sst: refs retained.
  V.INSCRIPTION_TYPES = [
    { en: "votive / dedicatory inscription (tiji)", zh: "題記 / 造像記", ref: "sst:dedicatory-text" }
  ];

  // script (書體) — sourced from th770 "Type of script" hierarchy (802546)
  // transitional and running script have no th770 equivalent and retain sst: refs
  V.SCRIPTS = [
    {
      en: "Seal script", zh: "篆書",
      ref: "https://opentheso.huma-num.fr/?idc=802547&idt=th770",
      opentheso_id: "802547"
    },
    {
      en: "Clerical script", zh: "隸書",
      ref: "https://opentheso.huma-num.fr/?idc=802548&idt=th770",
      opentheso_id: "802548"
    },
    {
      en: "Regular script", zh: "楷書",
      ref: "https://opentheso.huma-num.fr/?idc=802549&idt=th770",
      opentheso_id: "802549"
    },
    {
      en: "Cursive script", zh: "草書",
      ref: "https://opentheso.huma-num.fr/?idc=802550&idt=th770",
      opentheso_id: "802550"
    },
    {
      en: "Flying white script", zh: "飛白書",
      ref: "https://opentheso.huma-num.fr/?idc=802558&idt=th770",
      opentheso_id: "802558"
    },
    { en: "clerical-to-regular (transitional)", zh: "隸楷之間", ref: "sst:transitional-script" },
    { en: "running script",                     zh: "行書",     ref: "sst:running-script" }
  ];

  // primary text language (語言)
  V.LANGS = [
    { ident: "zh",      en: "Literary Chinese 漢文",  zh: "漢文" },
    { ident: "lzh",     en: "Classical Chinese",       zh: "文言" },
    { ident: "sa-Sidd", en: "Sanskrit (Siddhaṃ)",      zh: "梵文（悉曇）" },
    { ident: "sa-Latn", en: "Sanskrit (romanised)",    zh: "梵文（拉丁轉寫）" }
  ];

  // licences
  V.LICENCES = [
    { label: "CC BY 4.0",    target: "https://creativecommons.org/licenses/by/4.0/" },
    { label: "CC BY-SA 4.0", target: "https://creativecommons.org/licenses/by-sa/4.0/" },
    { label: "CC BY-NC 4.0", target: "https://creativecommons.org/licenses/by-nc/4.0/" },
    { label: "CC0 1.0",      target: "https://creativecommons.org/publicdomain/zero/1.0/" }
  ];

  // a few canonical sutras with CBETA / Taishō anchors (for the msItem ref)
  V.SUTRAS = [
    { en: "Diamond Sūtra",                       zh: "金剛般若波羅蜜經",   cbeta: "T08n0235", taisho: "T 235" },
    { en: "Heart Sūtra",                         zh: "般若波羅蜜多心經",   cbeta: "T08n0251", taisho: "T 251" },
    { en: "Lotus Sūtra",                         zh: "妙法蓮華經",         cbeta: "T09n0262", taisho: "T 262" },
    { en: "Nirvāṇa Sūtra",                       zh: "大般涅槃經",         cbeta: "T12n0374", taisho: "T 374" },
    { en: "Mahāmāyūrī / Great Perfection of Wisdom", zh: "摩訶般若波羅蜜經", cbeta: "T08n0223", taisho: "T 223" },
    { en: "Sūtra on the Names of the Buddhas",   zh: "佛說佛名經",         cbeta: "T14n0440", taisho: "T 440" },
    { en: "Uṣṇīṣa Vijaya Dhāraṇī",              zh: "佛頂尊勝陀羅尼經",   cbeta: "T19n0967", taisho: "T 967" }
  ];

  // dynasty spans (Gregorian) — used as fallback notBefore/notAfter
  V.DYNASTIES = [
    { zh: "北魏", en: "Northern Wei",   start: 386, end: 534 },
    { zh: "東魏", en: "Eastern Wei",    start: 534, end: 550 },
    { zh: "西魏", en: "Western Wei",    start: 535, end: 556 },
    { zh: "北齊", en: "Northern Qi",    start: 550, end: 577 },
    { zh: "北周", en: "Northern Zhou",  start: 557, end: 581 },
    { zh: "隋",   en: "Sui",            start: 581, end: 618 },
    { zh: "唐",   en: "Tang",           start: 618, end: 907 }
  ];

  // reign-era table (年號). start/end are inclusive Gregorian years.
  // STARTER set — Northern Qi / Zhou / Sui / early-Tang heartland of cliff sutras.
  V.ERAS = [
    // 北魏 Northern Wei (selected late eras, the sutra-carving uptick)
    { dyn: "北魏", era: "太和", py: "Taihe",     start: 477, end: 499 },
    { dyn: "北魏", era: "正始", py: "Zhengshi",  start: 504, end: 508 },
    { dyn: "北魏", era: "永平", py: "Yongping",  start: 508, end: 512 },
    { dyn: "北魏", era: "延昌", py: "Yanchang",  start: 512, end: 515 },
    { dyn: "北魏", era: "正光", py: "Zhengguang", start: 520, end: 525 },
    { dyn: "北魏", era: "孝昌", py: "Xiaochang", start: 525, end: 527 },
    // 東魏 Eastern Wei
    { dyn: "東魏", era: "天平", py: "Tianping",  start: 534, end: 537 },
    { dyn: "東魏", era: "興和", py: "Xinghe",    start: 539, end: 542 },
    { dyn: "東魏", era: "武定", py: "Wuding",    start: 543, end: 550 },
    // 西魏 Western Wei
    { dyn: "西魏", era: "大統", py: "Datong",    start: 535, end: 551 },
    // 北齊 Northern Qi (peak cliff-sutra eras)
    { dyn: "北齊", era: "天保", py: "Tianbao",   start: 550, end: 559 },
    { dyn: "北齊", era: "河清", py: "Heqing",    start: 562, end: 565 },
    { dyn: "北齊", era: "天統", py: "Tiantong",  start: 565, end: 569 },
    { dyn: "北齊", era: "武平", py: "Wuping",    start: 570, end: 576 },
    { dyn: "北齊", era: "隆化", py: "Longhua",   start: 576, end: 577 },
    // 北周 Northern Zhou
    { dyn: "北周", era: "保定", py: "Baoding",   start: 561, end: 565 },
    { dyn: "北周", era: "天和", py: "Tianhe",    start: 566, end: 572 },
    { dyn: "北周", era: "建德", py: "Jiande",    start: 572, end: 578 },
    { dyn: "北周", era: "大象", py: "Daxiang",   start: 579, end: 580 },
    // 隋 Sui
    { dyn: "隋", era: "開皇", py: "Kaihuang",    start: 581, end: 600 },
    { dyn: "隋", era: "仁壽", py: "Renshou",     start: 601, end: 604 },
    { dyn: "隋", era: "大業", py: "Daye",        start: 605, end: 618 },
    // 唐 Tang (selected)
    { dyn: "唐", era: "武德", py: "Wude",        start: 618, end: 626 },
    { dyn: "唐", era: "貞觀", py: "Zhenguan",    start: 627, end: 649 },
    { dyn: "唐", era: "開元", py: "Kaiyuan",     start: 713, end: 741 },
    { dyn: "唐", era: "天寶", py: "Tianbao",     start: 742, end: 756 }
  ];

  // ---- Rubbing vocabulary (th770 branch g2966 — "Rubbing") -------------------
  // Source: Epiverse_th770.rdf (2026-06-12 export); rubbing group idg=g2966
  // Rubbing top concept: idc=802596 (拓片 / Rubbing / estampage)
  function th(id) { return "https://opentheso.huma-num.fr/?idc=" + id + "&idt=th770"; }

  // Support formats (802938 branch)
  V.RUBBING_FORMATS = [
    { en: "Sheet / leaf",              zh: "页",         ref: th("802966"), opentheso_id: "802966" },
    { en: "Mount",                     zh: "裱",         ref: th("802940"), opentheso_id: "802940" },
    { en: "Horizontal scroll",         zh: "",           ref: th("802941"), opentheso_id: "802941" },
    { en: "Vertical scroll",           zh: "",           ref: th("802942"), opentheso_id: "802942" },
    { en: "Screen",                    zh: "",           ref: th("802943"), opentheso_id: "802943" },
    { en: "Album",                     zh: "拓本",       ref: th("802939"), opentheso_id: "802939" },
    { en: "Stone or metal album",      zh: "金石杂拓册", ref: th("884375"), opentheso_id: "884375" },
    { en: "Calligraphy album (fatie)", zh: "法帖",       ref: th("884866"), opentheso_id: "884866" },
    { en: "Cut and mounted (album)",   zh: "剪裝",       ref: th("884915"), opentheso_id: "884915" },
    { en: "Strip rubbing",             zh: "条拓",       ref: th("884917"), opentheso_id: "884917" },
    { en: "Notebook",                  zh: "",           ref: th("884781"), opentheso_id: "884781" }
  ];

  // Inking technique (802945 branch under 802944)
  V.INKING_TECHNIQUES = [
    { en: "Dry",   zh: "干拓", ref: th("802948"), opentheso_id: "802948" },
    { en: "Wet",   zh: "湿拓", ref: th("802949"), opentheso_id: "802949" },
    { en: "Print", zh: "",     ref: th("802950"), opentheso_id: "802950" }
  ];

  // Dry-technique subtypes (children of 802948)
  V.INKING_DRY_SUBTYPES = [
    { en: "Cicada wings (chanyi tuo)",          zh: "蝉翼拓", ref: th("884728"), opentheso_id: "884728" },
    { en: "Shiny and dense ink (guanghou)",     zh: "墨色光厚", ref: th("884784"), opentheso_id: "884784" }
  ];

  // Wet-technique subtypes (children of 802949)
  V.INKING_WET_SUBTYPES = [
    { en: "Addings of inked surfaces (buhui)", zh: "补绘",     ref: th("884374"), opentheso_id: "884374" },
    { en: "Black gold (wujin tuo)",            zh: "乌金拓",   ref: th("884729"), opentheso_id: "884729" },
    { en: "Two-color process",                  zh: "双色因相法", ref: th("884730"), opentheso_id: "884730" },
    { en: "Iridescent ink",                     zh: "彩虹墨",   ref: th("884914"), opentheso_id: "884914" }
  ];

  // Ink medium / pigment (802947 branch)
  V.INKING_MEDIA = [
    { en: "Black ink rubbing",      zh: "墨拓",   ref: th("802952"), opentheso_id: "802952" },
    { en: "Charcoal rubbing",       zh: "",       ref: th("802954"), opentheso_id: "802954" },
    { en: "Blue ink rubbing",       zh: "蓝拓",   ref: th("884731"), opentheso_id: "884731" },
    { en: "Vermillion ink rubbing", zh: "朱砂墨", ref: th("884797"), opentheso_id: "884797" }
  ];

  // Paper types (884787 branch under 802961)
  V.PAPER_TYPES = [
    { en: "Xuan paper",             zh: "",       ref: th("802962"), opentheso_id: "802962" },
    { en: "Washi paper",            zh: "",       ref: th("802965"), opentheso_id: "802965" },
    { en: "Ribbed paper",           zh: "罗纹纸", ref: th("884868"), opentheso_id: "884868" },
    { en: "Photolithography paper", zh: "",       ref: th("802963"), opentheso_id: "802963" },
    { en: "Print paper",            zh: "",       ref: th("802964"), opentheso_id: "802964" }
  ];

  // Paper physical attributes (884786 branch + 884847)
  V.PAPER_ATTRIBUTES = [
    { en: "Elasticity",    zh: "韧劲",     ref: th("884795"), opentheso_id: "884795" },
    { en: "Look-through",  zh: "",         ref: th("884798"), opentheso_id: "884798" },
    { en: "Epidermis",     zh: "表皮",     ref: th("884799"), opentheso_id: "884799" },
    { en: "Coarse grain",  zh: "粗颗粒纸", ref: th("884808"), opentheso_id: "884808" },
    { en: "Fine grain",    zh: "细颗粒纸", ref: th("884809"), opentheso_id: "884809" },
    { en: "Off-white",     zh: "米白纸",   ref: th("884867"), opentheso_id: "884867" },
    { en: "Laid (zhiwen)", zh: "直纹 (纸)", ref: th("884876"), opentheso_id: "884876" },
    { en: "Tear",          zh: "撕",       ref: th("884847"), opentheso_id: "884847" }
  ];

  // Concordance with original object (802957 branch)
  V.CONCORDANCE_LEVELS = [
    { en: "High",   zh: "高度一致", ref: th("802958"), opentheso_id: "802958",
      definition: "All characters present in the inscription are visible on the rubbing." },
    { en: "Medium", zh: "中度一致", ref: th("802959"), opentheso_id: "802959",
      definition: "Some of the characters present in the inscription are visible on the rubbing." },
    { en: "Low",    zh: "低度一致", ref: th("802960"), opentheso_id: "802960",
      definition: "Most of the characters present in the inscription are not visible on the rubbing." }
  ];

  // Contact / no-contact techniques (884814 + 884815 branches under 884376)
  V.CONTACT_TECHNIQUES = [
    // contact with original
    { en: "Full-form rubbing",                   zh: "",       contact: true,  ref: th("884377"), opentheso_id: "884377" },
    { en: "Direct rubbing from original (chuītā)", zh: "传拓",  contact: true,  ref: th("884379"), opentheso_id: "884379" },
    { en: "Selective rubbing (yǐngtā)",          zh: "颖拓",   contact: true,  ref: th("884380"), opentheso_id: "884380" },
    { en: "Composite rubbings (quánxíngtā)",     zh: "全形拓", contact: true,  ref: th("884802"), opentheso_id: "884802" },
    { en: "Rubbings of stone and metal (jīnshítāběn)", zh: "金石拓本", contact: true, ref: th("884803"), opentheso_id: "884803" },
    { en: "Red rubbings (shūdān)",               zh: "書丹",   contact: true,  ref: th("884804"), opentheso_id: "884804" },
    // no contact with original
    { en: "Rubbing by copy (xiǎngtā)",           zh: "响拓",   contact: false, ref: th("884378"), opentheso_id: "884378" },
    { en: "Shrunk edition (suōběn)",              zh: "縮本",   contact: false, ref: th("884382"), opentheso_id: "884382" },
    { en: "Elongating / shortening strokes",      zh: "划伸缩", contact: false, ref: th("884796"), opentheso_id: "884796" },
    { en: "Rubbing from the hand of (shǒutā)",   zh: "手拓",   contact: false, ref: th("884800"), opentheso_id: "884800" },
    { en: "Rubbings from recuts (tiě)",           zh: "帖",     contact: false, ref: th("884805"), opentheso_id: "884805" },
    { en: "Pseudo-rubbing (jiǎxìngtā)",          zh: "假性拓", contact: false, ref: th("884871"), opentheso_id: "884871" }
  ];

  // Type of the rubbed object (884816 branch)
  V.RUBBED_OBJECT_TYPES = [
    { en: "Pictorial rubbing",                    zh: "",       ref: th("884793"), opentheso_id: "884793" },
    { en: "Commemorative / collective rubbings",  zh: "纪念拓", ref: th("884801"), opentheso_id: "884801" }
  ];

  // Other copying techniques (884817 branch)
  V.OTHER_COPY_TECHNIQUES = [
    { en: "Collotype",                               zh: "",         ref: th("802955"), opentheso_id: "802955" },
    { en: "Photolithography",                        zh: "",         ref: th("802956"), opentheso_id: "802956" },
    { en: "Hand-copying with brush (lín)",           zh: "臨",       ref: th("884783"), opentheso_id: "884783" },
    { en: "Written and engraved after model (mólè)", zh: "摹勒",     ref: th("884794"), opentheso_id: "884794" },
    { en: "Duplicate (fùjiàn)",                     zh: "複件",     ref: th("884851"), opentheso_id: "884851" },
    { en: "Paper squeeze",                           zh: "",         ref: th("884865"), opentheso_id: "884865" },
    { en: "Stencil",                                 zh: "墨版印刷图案", ref: th("884869"), opentheso_id: "884869" },
    { en: "Pouncing (línmó)",                       zh: "临摹",     ref: th("884870"), opentheso_id: "884870" },
    { en: "Tracing copy (shuānggōu tiānmò)",        zh: "雙鈎填墨", ref: th("884875"), opentheso_id: "884875" }
  ];

  // Agent roles (884822 branch under 884821)
  V.AGENT_ROLES = [
    { en: "Rubbing master (tāpiānshī)",   zh: "拓片師", ref: th("884830"), opentheso_id: "884830" },
    { en: "Rubbing artisan (tāgōng)",     zh: "拓工",   ref: th("884831"), opentheso_id: "884831" },
    { en: "Engraver of original stone",   zh: "",       ref: th("884832"), opentheso_id: "884832" },
    { en: "Collector",                    zh: "",       ref: th("884837"), opentheso_id: "884837" },
    { en: "Sponsor",                      zh: "资助人", ref: th("884834"), opentheso_id: "884834" },
    { en: "Counterfeiter",                zh: "",       ref: th("884835"), opentheso_id: "884835" },
    { en: "Merchant",                     zh: "",       ref: th("884836"), opentheso_id: "884836" },
    { en: "Scholar-artisan",              zh: "",       ref: th("884849"), opentheso_id: "884849" },
    { en: "Calligrapher",                 zh: "书法家", ref: th("884850"), opentheso_id: "884850" },
    { en: "Epigrapher-monk (jīnshísēng)", zh: "金石僧", ref: th("884853"), opentheso_id: "884853" }
  ];

  if (typeof module === "object" && module.exports) module.exports = V;
  else root.VOCAB = V;
})(typeof self !== "undefined" ? self : this);
