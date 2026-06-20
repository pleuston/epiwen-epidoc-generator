# CLAUDE.md — Epiwen (public shell / working-group template)

This is the **public template** of the Epiwen research platform, deployed on
GitHub Pages. It contains the full platform code and a small set of
representative example records — suitable for working-group distribution,
experimentation, and adaptation to other corpora.

The private working instance (Stone Sutras of North China, full dataset) lives at:
`/Users/sassmann/Documents/epiwen/` (private GitHub repo `pleuston/epiwen`)

---

## What belongs here

- **Platform code**: HTML, CSS, JavaScript, Leaflet library (no build step)
- **OSGeo atlas data**: `data/osgeo-atlas.json` — public historical atlas tiles
- **Example records** (representative by type):
  - Sites: JSY (cliff inscription — Mount Tai), SNS (stele — Mount Shuiniu), WFY (cave temple — 臥佛院)
  - Catalog XML: the 3 site XMLs + 1 cave subsite
  - Records: SNS stele EpiDoc, SNS rubbing EpiDoc
  - Authority (5): GuoMoruo, FanJinshi, HuangShih-shanSusan, AAS, HU_berlin
  - Bibliography (3): Ledderose2000, Wenzel2003_04, Wenzel2006

## What does NOT belong here

- Full stone sutras catalog XML (80+ sites) → private `epiwen/`
- Full authority library (4,382 MADS files) → private `epiwen/`
- Full bibliography (5,848 MODS files) → private `epiwen/`
- Full site-index, authority-index, biblio-index → private `epiwen/`

---

## Role in the development workflow

Experiments and working-group features can be developed here.
Once confirmed, sync platform-level changes back to the private instance:

```bash
cp <file> /Users/sassmann/Documents/epiwen/<file>
# then commit in epiwen/ separately
```

When the private instance makes platform improvements:
```bash
# In the private repo, after committing:
cp <file> /Users/sassmann/Documents/epiwen-epidoc-generator/<file>
cp <file> /Users/sassmann/repos/stonehistory/AI/spaces/epiwen-epidoc-generator/<file>
# Commit each repo
```

---

## Session orientation

```bash
cd /Users/sassmann/Documents/epiwen-epidoc-generator
git log --oneline -5
git status --short
```
