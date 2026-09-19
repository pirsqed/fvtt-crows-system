# MuPDF.js extraction prototype

## Result

The JavaScript adapter matches the existing Python extraction pipeline on all
72 content-bearing pages tested from the August–September 2026 packet:

| Comparison | Coverage | Result |
| --- | --- | --- |
| Inventory card columns and segmented raw text | 49 pages, 734 segments across core, profession, and POI card PDFs | Exact text/segmentation match |
| Trait names, XP costs, starting flags, descriptions | 23 trees, 276 traits | Exact match |
| Trait boxes, connector segments, and connected groups | All 23 trees | Groups match exactly; coordinates within 0.05 PDF points |
| Bold/italic non-whitespace character counts | All 72 pages | Exact match |

MuPDF.js 1.28.1 (WASM) was compared against PyMuPDF 1.28.2 using the actual
functions from `extract_cards.py` and `extract_traits.py`. The two APIs split
some styled text into different numbers of spans; styled character counts and
the final segmented text match. Both engines can emit an `ActualText with no
position` warning for this packet; agreement does not prove the Python baseline
itself is error-free.

Headless Chrome also exercised the real file-picker UI and module worker:
20 card segments on core PDF page 1 and 12 traits on Characters PDF page 8,
with exact record comparisons and matching trait connection groups. Each took
approximately 0.1 seconds in the local smoke test. Invalid pages, malformed
PDFs, cancellation/retry, and preview-launcher cleanup are covered. This is
not a cross-browser performance benchmark.

**Recommendation:** proceed with a direct JavaScript port. The critical layout
information is available through public MuPDF.js APIs. No Python runtime is
needed in the browser.

## Try the preview

From the system directory, install the developer runtime:

```powershell
npm.cmd install --prefix tools/out/mupdf-runtime --save-exact --ignore-scripts --no-audit --no-fund mupdf@1.28.1
```

The runtime is already installed in this working copy. Node/npm are development
setup tools only; browser extraction does not call Node or Python. Dependency
files, WASM, local baselines, and extracted content live under the existing
ignored, release-excluded `tools/out/` directory. No CDN or remote PDF service
is used. The prototype source does not modify the production importer.

With this working copy installed as the Foundry system, run this Script macro:

```javascript
const { openPrototype } = await import(
  new URL("systems/fvtt-crows-system/tools/mupdf-prototype/foundry.mjs", document.baseURI).href
);
openPrototype();
```

This opens a modal preview with a local PDF picker. Choose **Inventory cards**
and page **1** of the core inventory PDF, or **Trait tree** and page **8** of
the Characters book. Page numbers are physical PDF pages, starting at 1.
Results are displayed as JSON. Closing or cancelling terminates the worker.
No documents, compendiums, or uploaded artwork are created.

The launcher was tested in a browser DOM harness, **not in a live Foundry
world**. Foundry hosting must serve the prototype and its local WASM runtime.
An installation using a custom URL prefix may require adjusting the macro URL.

For standalone local use, serve the system directory with an HTTP development
server bound to `127.0.0.1` and open `/tools/mupdf-prototype/index.html`.
Do not open it as a `file://` URL.

## Reproduce the comparison

From the system directory, using the existing Python tool environment:

```powershell
tools/.venv/Scripts/python.exe tools/mupdf-prototype/baseline.py --packet "../playtest2_pdfs"
node tools/mupdf-prototype/compare.mjs
```

The first command generates a developer-only Python oracle. The second runs
the same JavaScript extraction module used by the browser and exits nonzero
on mismatches. Outputs are `tools/out/mupdf-prototype/baseline.json` and
`comparison.json`; neither should be committed or distributed.

To run the browser smoke test with an installed Playwright package and Chrome:

```powershell
$env:PLAYWRIGHT_MODULE = "C:/path/to/playwright/index.mjs"
node tools/mupdf-prototype/browser-smoke.mjs
```

The smoke test starts an ephemeral localhost HTTP server and closes its server
and browser when finished. It writes `tools/out/mupdf-prototype/browser-results.json`.

## Scope and remaining work

- Cards currently expose columns and segmented raw lines. The full card field
  parser (prices, qualities, spells, crafting, tier cells) and `build_packs.py`
  mappings have not been ported. Matching raw lines alone does not validate
  word-level tier-cell assignment.
- Traits expose parsed records and connection groups; Foundry item generation,
  icons, correction maps, and import integration remain to be ported.
- Monsters, backgrounds/connections, art conversion/upload, and packet-wide
  browser orchestration are outside this probe.
- This adapter follows the current packet's geometry heuristics. It is not a
  general table detector; clipping, unusual transforms, arbitrary curved
  diagrams, scanned/image-only content, and encrypted PDFs need separate work.
- Baselines include pages where the existing parser found card records and
  pages containing `XP Cost`; pages with no recognized content are excluded.
- Before release, test inside Foundry 14, decide persistent storage, and retain
  the existing importer's validation and local-edit protections.

## Dependency licensing

The repository is currently MIT licensed. The installed MuPDF.js package is
`AGPL-3.0-or-later`, with commercial terms available from Artifex. This local
prototype does not bundle MuPDF into the release. Resolve the licensing model
before distributing an integrated runtime; installing it here does not change
the repository license.

Official references:

- [MuPDF.js overview and licensing](https://mupdfjs.readthedocs.io/en/latest/faq/index.html)
- [Device callbacks](https://mupdf.readthedocs.io/en/latest/reference/javascript/types/Device.html)
- [Structured text walker](https://mupdf.readthedocs.io/en/latest/reference/javascript/types/StructuredTextWalker.html)
