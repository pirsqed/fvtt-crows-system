# Foundry PDF.js extraction prototype

## Verdict

**Foundry's bundled PDF.js can supply the layout data required by the tested
Crows card and trait parsers. Recommend PDF.js for the next implementation.**

Tested against the actual `@foundryvtt/pdfjs` 4.0.379-1 package in the installed
Foundry 14.367.0. Its exposed PDF.js version is 4.0.379. No MuPDF code or runtime
is loaded by this prototype, and no replacement PDF dependency is installed.

| Comparison with existing Python extractors | Coverage | Result |
| --- | --- | --- |
| Card column geometry and segmented raw lines | 49 pages, 734 card segments | 48 pages exact; 1 page differs only in three invisible separators |
| Trait names, costs, starting flags and descriptions | 23 pages, 276 traits | Exact |
| Trait boxes and connector segments | 23 trees | Within 0.05 PDF points |
| Trait connection groups | 23 trees | Exact |
| Bold and italic non-whitespace character counts | 72 pages | Exact |

Overall: **71/72 strict page matches; 72/72 after explicit separator
normalization.** Here "strict" means exact text and record structure with a
0.05-point numeric tolerance, the same as the MuPDF probe.

### The one text difference

Profession cards PDF, physical page 7, contains three bullet lines in the
Alteration Stone card. Python emits a U+200B zero-width space after each bullet;
PDF.js emits an ordinary space. All visible words match. The adapter returns
PDF.js's actual text unchanged. The comparison report records both strict
differences and the result after replacing U+200B with a space and collapsing
whitespace. The original discrepancy has not been hidden or patched to mimic
Python's output.

### Browser verification

Headless Chrome exercised the actual module worker, using the installed Foundry
PDF.js files served under Foundry-style routes:

- Core card PDF page 1: 20 segments, exact comparison.
- Characters book page 8: 12 traits, exact records and connections.
- Profession card PDF page 7: 15 segments, only the documented bullet differences.
- Invalid page, malformed PDF, cancellation/retry and closing the preview pass.
- A reverse-proxy prefix is preserved in all resource URLs.
- The browser loads the bundled `pdf.worker.mjs`; no package HTML viewer or
  external PDF service is used. No page JavaScript errors were observed.
- The three sample extractions took about 0.10–0.12 seconds each locally,
  including worker startup. This is not a cross-browser performance benchmark.

**This was a browser route harness, not a live Foundry world test.** The harness
serves the PDF.js library directly from the Foundry installation without copying
or modifying it. It simulates Foundry's package routes and HTML MIME restriction.

## Try inside Foundry

Install this working copy as the Crows system, then run this Script macro:

```javascript
const { openPrototype } = await import(
  new URL("systems/fvtt-crows-system/tools/pdfjs-prototype/foundry.mjs", document.baseURI).href
);
openPrototype();
```

Choose a local PDF, layout type, and physical PDF page number (starting at 1).
The preview displays JSON; it does not create or modify world documents,
compendiums, settings, or uploaded files. No npm or Python setup is needed to
run it inside Foundry. PDF.js comes from `scripts/pdfjs/` in the host installation.

The UI is constructed by JavaScript rather than loading a package HTML file:
Foundry 14.361+ serves package HTML as text/plain. This also avoids the standalone
HTML/iframe approach used by the earlier MuPDF preview.

The prototype explicitly refuses PDF.js versions other than 4.0.379, so a
Foundry dependency update cannot silently bypass the adapter's tested version.

## Architecture and maintenance caveats

- `extract.mjs` adapts PDF.js text items and drawing operators to the geometry
  consumed by `layout-parser.mjs`. The latter contains our own parsing heuristics
  reused from the MuPDF prototype, with no MuPDF import or dependency.
- `getTextContent()` supplies text, transforms and font metrics.
- `getOperatorList()` supplies paths and graphics-state changes. The adapter
  tracks transforms, line widths, rectangles and segments in page coordinates.
- PDF.js's public text styles do not supply original font names or bold/italic
  flags. The adapter enables `fontExtraProperties` and reads resolved font names
  through `page.commonObjs`. **That cache and the operator representation are
  version-sensitive implementation details**, not a stable Foundry extraction
  API. Bold/italic inference uses font names and is verified for this packet.
- The browser runs our adapter in a worker, with an explicit nested PDF.js
  worker port. Explicit worker fetching avoids PDF.js 4's assumptions about
  `window`/`document` during its default loading path. Cancellation terminates
  the outer worker; its nested worker is terminated with it. Normal completion
  also explicitly destroys the document and worker resources.
- The adapter disables eval-based font optimizations and font-face rendering.
- Password-protected PDFs, rotated text/pages, general clipping/curved diagram
  interpretation, OCR and image-only card extraction are outside this probe.
- One PDF.js font warning (`TT: undefined function: 21`) appeared in the Node
  run; it did not produce differences beyond the documented separators.

## What has not been proven yet

This is equivalent in scope to the MuPDF feasibility prototype. It validates
card segmentation/raw text and trait records/connections, **not the complete
card-field parser**. Prices, spell properties, crafting, word-level tier-cell
assignment, Foundry document generation, monsters, backgrounds/connections,
artwork and packet-wide browser orchestration still need implementation and
validation. Agreement with Python is not independent proof that the original
Python parser is correct. Pages where the original parser detected no content
are not in the comparison baseline.

The existing production importer, Python tools and licensing files are unchanged.
The decision to package the finished importer as a module or inside the system
is still open.

## Reproduce

From the system directory, first generate the same local Python oracle used by
the MuPDF prototype (Python is used only for developer comparison):

```powershell
tools/.venv/Scripts/python.exe tools/mupdf-prototype/baseline.py --packet "../playtest2_pdfs"
```

Then run the JavaScript comparison against the installed Foundry library:

```powershell
$env:FOUNDRY_PDFJS = "C:/Program Files/Foundry Virtual Tabletop/resources/app/node_modules/@foundryvtt/pdfjs/"
node tools/pdfjs-prototype/compare.mjs
```

The command reports strict and normalized results separately and exits nonzero
if any normalized mismatch remains. Detailed actual records and differences are
written to `tools/out/pdfjs-prototype/comparison.json`.

For the browser tests, supply an existing Playwright installation and Chrome:

```powershell
$env:PLAYWRIGHT_MODULE = "C:/path/to/playwright/index.mjs"
node tools/pdfjs-prototype/browser-smoke.mjs
```

This starts an ephemeral localhost server, runs the preview tests, and closes
the browser and server. It writes `tools/out/pdfjs-prototype/browser-results.json`.
Optional `inspect.mjs <baseline-case-index>` dumps font and operator data for
diagnosis. All generated content stays under ignored, release-excluded `tools/out/`.

## Licensing

The installed PDF.js package declares Apache-2.0. This prototype references
the host library and does not redistribute Foundry software or copy MuPDF
implementation code. Selecting PDF.js avoids introducing MuPDF's AGPL dependency
in this extraction path. Existing Python/MuPDF distribution questions are separate.

References:

- [PDF.js API](https://mozilla.github.io/pdf.js/api/draft/api.js.html)
- [PDF.js Apache-2.0 license](https://github.com/mozilla/pdf.js/blob/master/LICENSE)
- [Foundry 14.361 release notes](https://foundryvtt.com/releases/14.361)
