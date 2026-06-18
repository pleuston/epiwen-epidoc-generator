const { buildEpiDoc } = require("../generator.js");
const example = {
  filename: "SNS_2.xml",
  editor: "Epiwen contributor",
  titleEn: "Mañjuśrī Prajñā passage, Mount Shuiniu (stele recto)",
  titleZh: "水牛山《文殊師利所説摩訶般若波羅蜜經》碑陽正法節文",
  authority: "Epiwen / Altergraphy",
  licence: "CC BY 4.0",
  licenceTarget: "https://creativecommons.org/licenses/by/4.0/",
  country: "China 中國", region: "Shandong 山東", currentSettlement: "Wenshang 汶上",
  repository: "in situ 原處",
  inventoryNo: "SNS_2",
  summary: "Northern Qi cliff/stele excerpt of the Mañjuśrī Prajñā-pāramitā sūtra.",
  sutraTitleZh: "文殊師利所説摩訶般若波羅蜜經", sutraTitleEn: "Sūtra of Perfection of Wisdom Spoken by Mañjuśrī",
  cbeta: "T08n0232",
  material: "limestone 石灰岩", materialRef: "aat:300011286",
  objectType: "stele 碑", objectTypeRef: "sst:stele",
  heightCm: "210", widthCm: "92", depthCm: "24",
  condition: "weathered; lower register effaced 風化，下段漫漶",
  layoutColumns: "1", layoutLines: "12",
  script: "regular script 楷書", scriptRef: "sst:regular-script",
  origDateText: "北齊武平六年", calendar: "#chinese", datingMethod: "#reign-era",
  whenISO: "0575", notBefore: "0575", notAfter: "0575",
  origPlace: "Mount Shuiniu 水牛山", origPlaceRef: "geonames:0000000",
  langIdent: "zh", langLabel: "Literary Chinese 漢文",
  keywords: [
    { ref: "sst:perfection-of-wisdom", label: "Perfection of Wisdom 般若" },
    { ref: "sst:cliff-carved-sutra", label: "cliff-carved sutra 摩崖刻經" }
  ],
  editionText: "文殊師利白佛言\n世尊云何名般若波羅蜜\n佛言般若波羅蜜無邊無際",
  translationText: "Mañjuśrī addressed the Buddha: 'World-Honoured One, what is called the Perfection of Wisdom?'",
  bibliography: "Wenzel, Claudia. Buddhist Stone Sutras in Shandong, vol. 1.\nLedderose, Ledderose et al., catalogue no. SNS_2.",
  facsimileUrl: "images/SNS_2.jpg",
  changeWhen: "2026-06-18", changeWho: "#epiwen", changeNote: "Initial EpiDoc encoding via the Epiwen generator."
};
const xml = buildEpiDoc(example);
process.stdout.write(xml);
