# CLAUDE.md — Epiwen app

This repository is the **Epiwen app** (`pleuston/epiwen`) — a dependency-free,
client-side platform (HTML / CSS / JavaScript, no build step) for cataloguing
and editing TEI-EpiDoc records of Chinese stone inscriptions. It is deployed on
**GitHub Pages** at **https://pleuston.github.io/epiwen/**.

It holds **only the app**. All catalog data lives in a separate repository.

---

## App / data split

| | Repo | Visibility | Holds |
| --- | --- | --- | --- |
| **App** | `pleuston/epiwen` (this repo) | public | HTML/CSS/JS, Leaflet, examples — no catalog data |
| **Data** | `pleuston/epiwen-data` | **private** | `records/`, `authority/`, `biblio/`, `catalog/`, `publication/`, `data/*.json` indices |

The app reads **all** data from `epiwen-data` through the **GitHub Contents API
with the signed-in user's token**, via the shared client **`data.js`**
(`window.EpiData.fetch / text / json / list`, which hardcodes
`OWNER=pleuston REPO=epiwen-data`). There are no anonymous reads and no
`raw.githubusercontent.com` / relative-path data fetches — a user must sign in
(`auth.js`, token stored at `localStorage.epiwen_gh_token`) with a token that
can read `epiwen-data`, or the catalog comes back empty (404). This was a
deliberate choice: keep the data private, authenticate every read.

There is **no longer a second copy of the app** and **no `cp` sync step** — the
app is maintained only here.

### Data flow

```
sign in (auth.js) → epiwen_gh_token
   → EpiData.token()  (data.js)
   → Authorization: Bearer <token>
   → GitHub Contents API on pleuston/epiwen-data  → records / authority / biblio / sites / indices
```

Writes (editor "Save to GitHub") target `epiwen-data` too: `github.js` defaults
to it, and `login.html` pre-seeds `epiwen_gh_repo = epiwen-data`.

### Private add-on collections

Beyond the core backend, the app can load **private collections** from other
private repos via `collections.js` (same Contents-API-plus-token mechanism;
no access → 404 → privacy enforced by GitHub). Layout
`collections/<package>/*.xml` + optional `_package.json`. Examples:
`pleuston/epiwen-stonesutras-data` (`collections/stonesutras/`) and a rubbings
collection in the obsidian-vault. Open via catalog → Collections….

---

## What belongs here

- **Platform code**: `*.html`, `styles.css`, the app `*.js` (including `data.js`,
  `auth.js`, `collections.js`, `github.js`, `catalog.js`, the editors, `map.js`,
  the browsers), `leaflet/`.
- **A few example records** under `examples/` for reference.

## What does NOT belong here

- Catalog data of any kind (records, authority, biblio, catalog, publication,
  indices, the OSGeo atlas) → it all lives in `pleuston/epiwen-data`.

---

## Where a change goes

- **App behaviour / UI / data-reading logic** → here (`pleuston/epiwen`).
  Adding a new data reader? Route it through `EpiData` in `data.js`, and add
  `<script src="data.js"></script>` (after `auth.js`) on any new page that uses it.
- **Records / authorities / bibliography / site files / indices** →
  `pleuston/epiwen-data` (usually written by the editor; hand-edits fine, keep
  XML well-formed and regenerate `data/*.json` if you add or rename records).

## Local clones (names lag the repos)

The on-disk folder names have not been renamed to match the repos:

- `/Users/sassmann/repos/GitHub/epiwen-epidoc-generator` → remote `pleuston/epiwen` (this app)
- `/Users/sassmann/repos/GitHub/epiwen` → remote `pleuston/epiwen-data` (the data)

## Session orientation

```bash
cd /Users/sassmann/repos/GitHub/epiwen-epidoc-generator   # the app (remote: pleuston/epiwen)
git log --oneline -5
git status --short
```
