# NoGPT

**Private browser-only AI-likelihood estimation.** No account, API key, frameworks, back end, tracking, cookies, analytics, or text uploads.

[Live site](https://nogptnow.pages.dev) · [Source](https://github.com/live-by-unix/NoGPT)

## Features

- Paste, edit or type text. Import one or up to 30 documents at once: `.txt`, `.text`, `.md`, `.markdown`, `.docx` (modern Word), `.doc` (Word 97–2003 binary), or `.rtf`.
- Process text and extract supported documents locally using JavaScript and browser APIs. Word DOCX ZIP/XML parsing uses `DecompressionStream`; RTF decoding supports Unicode escape sequences and common text/control tokens. Legacy `.doc` uses an on-device OLE2/CFB and Word FIB/CLX piece-table parser (including compressed 8-bit and Unicode text). **Old Word 6/95, encrypted documents, malformed/unsupported DOC variants, PDF, images/OCR, and ZIP64 documents are not supported.**
- Show a **0–100% estimated AI authorship likelihood** (a transparent, **uncalibrated heuristic**, never a verified probability or binary verdict). The underlying 0–100 writing-pattern index remains available in exports.
- Highlight individual passages with identifiable patterns; inspect seven component scores. Dark/light theme toggle follows system preference by default and never stores a preference.
- See word/character/sentence counts, paragraphs, estimated reading and speaking time, sentence-length variation, most-used content words, and an extractive (original-sentences) summary.
- Import/compare multiple files, switch between reports, and export batch CSV.
- Copy reports, save human-readable TXT or detailed JSON, and print/save as PDF using browser print dialog.
- Responsive layout, accessible labels, error handling, no third-party dependencies.

## How it works / limitations

This project **does not implement ZeroGPT's proprietary DeepAnalyse model**. It is not a reproduction of a trained AI-authorship detector. The local score measures seven hand-weighted signals: stock phrases, repeated five-word sequences, repeated openings, generic promotional diction, local lexical diversity, unusually even cadence, and repeated trigrams. The underlying writing-pattern index is mapped to an **estimated AI probability-like percentage** using `100 / (1 + exp(-(patternIndex - 40)/11))` and blended toward a neutral 50% for small samples via `sampleStrength = clamp((wordCount - 30)/270, 0, 1)`. **This is an uncalibrated, assumed mathematical mapping, NOT an empirical posterior probability**. To make it a statistically trustworthy probability, train/calibrate with representative labeled human and AI documents, account for authorship base rates, and evaluate on held-out datasets. No such validation has been performed. Low-evidence samples approach 50% to mean *unknown*, not a 50/50 factual chance. Sentence highlights show style clues only. Human writers may receive high estimates; AI writing may receive low estimates. Do **not** use it as sole evidence in academic, hiring, moderation or disciplinary decisions.

ZeroGPT also offers plagiarism lookup, translation, generative paraphrasing, chatbot, AI humanization, image detection, grammar checking and additional cloud-based tools. These are **not included**; implementing truthful equivalents with zero network requests requires locally shipped models, reference corpora, dictionaries and evaluation. This project does not pretend they work when they do not.

## Privacy architecture

All files are opened using the File API and analyzed in volatile browser memory. No text is sent to a server. There is **no `fetch`, XMLHttpRequest, remote font, CDN, external model, backend, localStorage, sessionStorage or tracking** in the app. The dark/light choice is intentionally memory-only, so it resets on refresh; initial appearance follows OS preference. A strict CSP sets `connect-src 'none'`. Cloudflare Pages only serves static assets; it can receive normal page requests (as any host does), but not document text. Clicking the GitHub links leaves the site by user choice. Exports are local Blob downloads. Text disappears upon refresh/close. Documents are size-limited to avoid resource exhaustion.

## Run locally

Serve the directory with any static server (ES modules require HTTP; double-clicking `index.html` may not work):

```bash
python3 -m http.server 8000
# Open http://localhost:8000
```

Use a modern browser that supports `Intl.Segmenter` and `DecompressionStream('deflate-raw')` for best results.

## Deploy to Cloudflare Pages

- Production branch: `main`
- Framework preset: **None**
- Build command: leave blank
- Build output directory: `/` or project root
- Pages project name: `nogptnow`
- No environment variables, build step, Pages Functions or API endpoints.

## Testing

Run core regression checks with:

```bash
node tests/detector.test.mjs
```

Run the site in a browser and check TXT, RTF, Markdown and DOCX extraction, multi-file inputs, exports and the PDF print dialog before claiming full browser acceptance.

## License

See [LICENSE](LICENSE).

## Legacy .doc format details

The in-browser `.doc` parser reads the OLE2 compound-file FAT/miniFAT, retrieves WordDocument and 0Table/1Table streams, locates the variable-length FIB `fcClx/lcbClx` entry (index 33), and extracts both Unicode and compressed codepage text via the piece table. Word macros are never run. Password-protected/encrypted files fail with a clear message; no server is contacted. The format is complex: test uncommon `.doc` variants against another trusted document reader when extraction looks incomplete.

## Is the displayed percentage calibrated?

**No.** The UI reports an *estimated AI probability-like percentage* for users who want that score format. The estimate is uncalibrated, not an observed probability or a claim of validated accuracy; its interpretation depends on the chosen assumptions. No deployment of an offline text-only heuristic can promise accurate provenance across genres, writers and languages. See the [2025 NAACL evaluation of AI detectors](https://aclanthology.org/2025.findings-naacl.271/) for generalization limitations.
