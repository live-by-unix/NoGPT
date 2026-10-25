# NoGPT

**Private browser-only writing-pattern analysis.** No account, API key, frameworks, back end, tracking, cookies, analytics, or text uploads.

[Live site](https://nogptnow.pages.dev) · [Source](https://github.com/live-by-unix/NoGPT)

## Features

- Paste, edit or type text. Import one or up to 30 documents at once: `.txt`, `.text`, `.md`, `.markdown`, `.docx` (modern Word), or `.rtf`.
- Process text and extract supported documents locally using JavaScript and browser APIs. Word DOCX ZIP/XML parsing uses `DecompressionStream`; RTF decoding supports Unicode escape sequences and common text/control tokens. **Legacy binary `.doc`, PDF, encrypted DOCX, images/OCR and ZIP64 documents are not supported.**
- Return a **0–100 writing-pattern score**, not a binary label, claimed AI percentage, model attribution, or verified authorship probability.
- Highlight individual passages with formulaic signals; inspect six component scores.
- See word/character/sentence counts, paragraphs, estimated reading and speaking time, sentence-length variation, most-used content words, and an extractive (original-sentences) summary.
- Import/compare multiple files, switch between reports, and export batch CSV.
- Copy reports, save human-readable TXT or detailed JSON, and print/save as PDF using browser print dialog.
- Responsive layout, accessible labels, error handling, no third-party dependencies.

## How it works / limitations

This project **does not implement ZeroGPT's proprietary DeepAnalyse model**. It is not a reproduction of their trained detector. The browser-local score blends six transparent hand-weighted signals: sentence-length uniformity, repeated trigrams, formulaic transitions, vocabulary predictability, repeated sentence openings, and steady long-form cadence. These weights **have not been trained, benchmark-calibrated, or validated**, and the score is **not** a probability of AI generation. Sentence highlights are based on the same heuristic signals. Text below 150–200 words is especially weak evidence, and results for multilingual/technical writing are less meaningful. Human writers may receive high scores; AI writing may receive low scores. Do **not** use it as sole evidence in academic, hiring, moderation or disciplinary decisions.

ZeroGPT also offers plagiarism lookup, translation, generative paraphrasing, chatbot, AI humanization, image detection, grammar checking and additional cloud-based tools. These are **not included**; implementing truthful equivalents with zero network requests requires locally shipped models, reference corpora, dictionaries and evaluation. This project does not pretend they work when they do not.

## Privacy architecture

All files are opened using the File API and analyzed in volatile browser memory. No text is sent to a server. There is **no `fetch`, XMLHttpRequest, remote font, CDN, external model, backend, localStorage, sessionStorage or tracking** in the app. A strict CSP sets `connect-src 'none'`. Cloudflare Pages only serves static assets; it can receive normal page requests (as any host does), but not document text. Clicking the GitHub links leaves the site by user choice. Exports are local Blob downloads. Text disappears upon refresh/close. Documents are size-limited to avoid resource exhaustion.

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
