# Epiwen · EpiDoc generator for Chinese stone inscriptions / 中文碑刻 EpiDoc 生成器

A small, **dependency-free, client-side** web form that produces valid
**EpiDoc / TEI** records for Chinese stone-sutra inscriptions. Bilingual
(English / 中文), seeded with the project's own controlled vocabularies, with a
**reign-era → Gregorian** date helper. Nothing is uploaded — the XML is built
live in the browser.

Modelled on the [Hamburg *Metadata Generator for EpiDoc*](https://tools.fdm.uni-hamburg.de/mdg/generator_metadata_epidoc.html),
rebuilt for the Chinese material and the [Epiwen](https://epigraphy.info) /
Altergraphy workflow (Bundle 2 "encoding-support tool").

## Why this exists

The Epiwen call asks for *"a guided EpiDoc generator … comparable to the
Hamburg tool"* to lower the barrier for contributors and harmonize output. This
is that tool. It covers the **`teiHeader` + physical description + edition
skeleton** — i.e. exactly the scope of Epiwen session 2, *Headers & physical
description*. It does **not** model the per-glyph measured layer (geometry +
condition grade); that impedance mismatch is documented in
[`../epidoc-cn-profile/physDesc-mapping.md`](../epidoc-cn-profile/physDesc-mapping.md)
and is out of scope for any header generator (the Hamburg tool doesn't do it
either).

## Features

- **Bilingual UI** — toggle EN / 中 / EN+中; every field is labelled in both.
- **CJK-safe** — characters pass through verbatim into UTF-8 XML.
- **Project vocabularies** — material, object type (the five carriers: 摩崖 /
  碑 / 經幢 / 窟壁 / 題記), script (篆隸楷行草), language, licence, and a list of
  canonical sutras with CBETA/Taishō anchors. Editable in `vocab.js`.
- **Reign-era date helper** — pick a 年號 and a reign year and the tool computes
  the exact `@when` and fills `@notBefore`/`@notAfter`/`@calendar`/`@datingMethod`
  (e.g. 武平 + 六年 → `when="0575"`).
- **Live preview + well-formedness check**; **Copy** and **Download .xml**.
- **No build step, no server, no dependencies** — a folder of static files.

## Run it

Just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8137
# → http://localhost:8137/
```

## Deploy on GitHub Pages

The whole tool is static, so Pages needs **no build**:

1. Push these files to a repository (the `.nojekyll` file is included so Pages
   serves everything as-is).
2. Repo **Settings → Pages → Build and deployment → Deploy from a branch →
   `main` / `/ (root)`**.
3. The tool is live at `https://<user>.github.io/<repo>/`.

> **Do not publish `_reference/`** — it holds a downloaded copy of the Hamburg
> tool's source, kept locally for study only. Exclude it (and `test/`) from the
> published repo.

## Files

| File | Role |
| --- | --- |
| `index.html` | page shell, loads the three scripts |
| `styles.css` | layout + bilingual label visibility |
| `vocab.js` | controlled vocabularies + reign-era table (edit here) |
| `generator.js` | pure `buildEpiDoc(data)` serializer — runs in browser **and** Node |
| `app.js` | schema-driven form, state, live preview, buttons |
| `test/build-test.js` | Node test of the serializer (`node test/build-test.js`) |
| `examples/SNS_2.epidoc.xml` | sample output (Northern Qi Mañjuśrī Prajñā stele) |
| `_reference/` | local copy of the Hamburg generator (study only — do not republish) |

Test the serializer headlessly:

```bash
node test/build-test.js | xmllint --noout -   # → no output = well-formed
```

## Editing the vocabularies

`vocab.js` is plain data. The lists mirror the Stone Sutras thesaurus
(`AI/spaces/semantic-universe/ontology/stonesutras-thesaurus.ttl`) and the TEI
export (`pb-keywords.xml`) and can be regenerated from them. The reign-era table
is a **starter set** focused on the Northern-dynasties → Tang window; extend it
(or generate it from the DILA `time/` authority).

## Roadmap — the dynamic version

This is the **static "necessary" tier** of the Epiwen tooling. The **desirable**
next step (Bundle 2, task 7) is a **dynamic** version with stored records,
structured input fields, validation, and search — on the model of EDEP / EFES /
an eXist-db data-entry UI. The clean separation here (`generator.js` is a pure
function with no DOM) is meant to make that migration easy: the same serializer
can sit behind a database front end.

## Credits & licence

- Concept and form pattern: Hamburg *Metadata Generator for EpiDoc* (FDM, Univ.
  Hamburg).
- Vocabularies: Stone Sutras project thesaurus.
- Licence: **to be set by the project** — suggested MIT for the code and
  CC BY 4.0 for the vocabularies. (No binding `LICENSE` file is committed yet.)
