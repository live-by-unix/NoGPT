# NoGPT v4 — on-device AI writing analysis

[Website](https://nogptnow.pages.dev) · [Code](https://github.com/live-by-unix/NoGPT)

**No login, no uploaded documents, no server-side inference, no tracking scripts. Vanilla HTML/CSS/JavaScript, Cloudflare Pages static hosting.**

## What changed, and why

Earlier releases converted seven hand-tuned stylistic signals into an arbitrary “AI probability” with a made-up sigmoid. The percentage was not learned from data and predictably produced implausible scores. Version 4 **removes that heuristic from the probability display**. Instead, it invokes a real, pretrained, binary text classifier inside the user's browser:

- **TMR RoBERTa-base**, trained by Oxidane on the RAID human/AI-labeled dataset (MIT license): https://huggingface.co/Oxidane/tmr-ai-text-detector
- **ONNX model** converted by the ONNX Community (MIT license): https://huggingface.co/onnx-community/tmr-ai-text-detector-ONNX
- **Transformers.js v3.8.1**, on-device WebAssembly inference: https://huggingface.co/docs/transformers.js/installation

The model creator [reports performance on RAID](https://huggingface.co/Oxidane/tmr-ai-text-detector) including evaluation of adversarial text and data held out from training. This is **not an independent accuracy guarantee** on different AI models, non-English material, or real-world content; NoGPT has not reproduced the benchmark results or validated the browser inference model against an independent dataset.

The displayed percentage is a **word-weighted mean of the model's predicted AI softmax for evaluated passages**. It is **not** the real-world posterior probability of AI authorship and is not calibrated against your document types or authorship base rates. False positives and false negatives can occur. We therefore avoid representing it as an authorship verdict.

## Features

- Paste/enter text or open `.txt`, `.text`, `.md`, `.markdown`, `.docx`, `.doc` (Word 97–2003), and `.rtf`. No server-side conversion. Up to 30 files per import.
- Local model inference and per-passage model scores, with word coverage and passage disagreement. Long texts are sampled across the entire document, not silently truncated to the start.
- At least **120 English words** needed for scoring. Unsupported/uncertain language and too-short inputs report **no numerical score** rather than a fabricated probability or an artificial 50%.
- Independent writing-style highlights and seven explainable style features. These are **not used to compute the model score** and do not establish which passages were AI-written.
- Word/sentence metrics, keyword frequencies, short extractive summaries, reading/speaking time, batch CSV, TXT/JSON exports and print/PDF.
- Responsive layout; working light/dark toggle initially respecting system preference; no saved theme or analysis data.

## Privacy & downloads

**Your text remains in your browser.** The app calls the model's inference methods in JavaScript/WebAssembly, not an external inference API. It never sends entered/uploaded text, document filenames or computed scores to our servers or third parties. We use no analytics, login, database, cookies, localStorage or sessionStorage.

**A first-time download is required.** Transformers.js is fetched from the public jsDelivr CDN, and the quantized ONNX model (~125–126 MB plus tokenizer/config assets) comes from Hugging Face's file hosting. Those providers can observe standard HTTP request data (IP address, time, browser headers); NoGPT intentionally sets `Referrer-Policy: no-referrer` and does not send document content in these requests. The browser may cache model/runtime assets, but cache retention and availability depend on browser/storage policies. This is not fully network-free offline software on first use. Without access to these assets, **NoGPT refuses to guess**; it never falls back to the previous heuristic percentage. If strictly zero third-party connections are required, host the runtime and model yourself and adjust `model.js` and `_headers`.

Cloudflare Pages serves the static HTML/CSS/JS and will observe normal site requests; it never receives analyzed text. The document parsers never run macros. `index.html` alone can be served as a static website with no framework or build system.

## Important limitations

- Model training was primarily English and RAID genres. Out-of-domain, translated, short, edited/hybrid and newer-model text may be misclassified. Softmax scores are **not calibrated probabilities**.
- Model size is substantial; slower or low-memory devices may fail to load the model. The app reports this explicitly instead of substituting fake results.
- One model passage is limited to 512 model tokens; texts are split into ~180-word sentence-boundary windows, with tokenizer truncation as an additional safeguard. Long texts have a maximum of 8 sampled passages, and the coverage percentage is displayed.
- Legacy `.doc` is decoded using local OLE2/CFB/Word piece-table support; old Word 6/95, encrypted documents, malformed files, images/OCR and PDFs are unsupported.
- This detector cannot prove authorship. **Never use a result by itself to accuse, grade, reject, punish, or discipline somebody.**
- NoGPT is not ZeroGPT's proprietary detector and does not provide plagiarism searches or cloud-based tools.

## Run and test

```bash
python3 -m http.server 8000
# open http://localhost:8000
node tests/detector.test.mjs
node tests/model.test.mjs
```

The model tests use a **mocked classifier** to verify output mapping, chunk selection, sample limitations and aggregation. They do not validate the real model's accuracy or the ability of the browser to download it. Those require network-enabled browser acceptance tests and independent labeled evaluation data.

**Cloudflare Pages:** no framework, no build command, output directory `/`, production branch `main`, project name `nogptnow`.

License: see [LICENSE](LICENSE).
