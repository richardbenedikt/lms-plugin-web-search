# LM Studio Web Search Plugin

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![LM Studio SDK: 1.3+](https://img.shields.io/badge/lmstudio--sdk-1.3%2B-orange.svg)](https://lmstudio.ai/docs/plugins)
[![Node.js](https://img.shields.io/badge/runner-node-green.svg)](manifest.json)

A small [LM Studio](https://lmstudio.ai/) plugin that gives a local model three tools — `web_search`, `visit_website`, and `image_search` — backed by DuckDuckGo's public HTML interface. No API keys, no accounts, no third-party search backend to configure.

This is a fork of [`danielsig/lms-plugin-duckduckgo`](https://github.com/danielsig/lms-plugin-duckduckgo). The main divergence is a dedicated `visit_website` tool plus tool descriptions tuned to stop the model from "searching" full URLs instead of fetching them.

## Features

- **Three-tool surface** the LLM understands: `web_search` (links only), `visit_website` (full page text via Mozilla Readability), and `image_search` (downloads the actual files to the plugin's working directory).
- **Search → fetch chaining** baked into the tool docstrings. `web_search` deliberately returns no page bodies and tells the model to call `visit_website` next; `visit_website` tells it to cite the source URL.
- **URL guardrail.** Passing a URL to `web_search` or `image_search` returns an error string that names the right tool, instead of silently producing a junk search.
- **Current-date injection** in the `web_search` response, so the model can resolve "yesterday" / "this week" against the real date instead of its training cutoff.
- **DuckDuckGo HTML scraping**, not the Instant Answer API — you get the same results a logged-out user sees in a browser. Requests rotate a pool of real-world User-Agents and a shared 2 s rate limiter.
- **Image search downloads to disk.** Image URLs are fetched in parallel into the plugin's working directory and the local file paths are returned, so the model can reference them as local files.

## Requirements

- LM Studio with plugin support (Node runner).
- Node.js to build from source. The runtime depends on `@lmstudio/sdk`, `@mozilla/readability`, `jsdom`, and `zod`.

## Installation

### One-click

[lmstudio.ai/richardbenedikt/web-search](https://lmstudio.ai/richardbenedikt/web-search) → **Run in LM Studio**.

### From the CLI

```bash
lms get richardbenedikt/web-search       # install the published plugin
lms clone richardbenedikt/web-search     # clone for local development
```

## Configuration

Both fields live in the plugin sidebar in LM Studio.

| Field | Type | Default | Effect |
|---|---|---|---|
| `pageSize` | int (0–10) | `0` (auto) | Number of results per search call. `0` defers to the per-call argument or the built-in default of `5`. |
| `safeSearch` | enum | `auto` | `strict` / `moderate` / `off` map to DuckDuckGo's `kp` parameter. `auto` defers to the per-call argument, falling back to `moderate`. |

The "auto" sentinel exists so the model can override the sidebar setting per call when the user explicitly asks for it.

## How the model uses it

The first sentence of each tool's `description` is what the LLM sees and gates on. They are deliberately blunt and chained:

- `web_search` — *"Step 1: Find relevant URLs. Returns a list of links but NO content. If results are relevant, you MUST use 'visit_website' to read the page. If not, refine the query and search again."*
- `visit_website` — *"Step 2: Read the content of a specific URL found via 'web_search'. You can call this multiple times to verify information across different sources."*
- `image_search` — *"Search for images on DuckDuckGo. Returns a list of image URLs."*

`web_search` returns a `{ candidates, current_date, status: "incomplete", system_instruction }` object whose `system_instruction` reminds the model that titles aren't enough and that source URLs must be cited. `visit_website` appends the same instruction as a trailing `SYSTEM INSTRUCTION:` line. These strings are part of the API surface — edit them with care.

### Example flow

1. **User:** "What changed in the latest LM Studio release?"
2. **Model:** calls `web_search({ query: "LM Studio latest release notes" })`.
3. **Model:** picks the most relevant link and calls `visit_website({ url: "..." })` (often two or three of them).
4. **Model:** answers with the source URLs cited inline.

## Development

```bash
git clone https://github.com/richardbenedikt/lms-plugin-websearch.git
cd lms-plugin-websearch
npm install

npm run build   # tsc → dist/
npm run dev     # lms dev — live-loads the plugin into a running LM Studio instance
npm run push    # lms push — publishes a new revision (bump manifest.json `revision` first)
```

There is no test runner or linter wired up; `lms dev` is the iteration loop.

Source layout:

```
src/
├── index.ts            # plugin entry — registers config + tools provider
├── toolsProvider.ts    # builds the three tools, shares one rate limiter
├── config.ts           # sidebar fields (pageSize, safeSearch)
├── utils.ts            # spoofed headers, rate limiter, safe-search mapping
└── tools/
    ├── webSearch.ts
    ├── visitWebsite.ts
    └── imageSearch.ts
```

Add a tool by writing a `createXTool(ctl, waitIfNeeded)` factory in `src/tools/` and pushing the result into the array in `toolsProvider.ts`. Always `await waitIfNeeded()` before any outbound HTTP call — the limiter is shared across tools and DuckDuckGo will start returning empty pages or CAPTCHAs across all three if any tool skips it.

## Privacy

`visit_website` and `image_search` make direct network requests to the target URLs and image CDNs from the machine running LM Studio. Those servers see your IP. There is no proxy or anonymization layer.

## Limitations

- DuckDuckGo HTML scraping. If DDG changes its markup, anti-bot rules, or VQD-token flow, all three tools break before anything else does.
- `visit_website` parses with `JSDOM` + `@mozilla/readability` and does not execute JavaScript. Pages that render entirely client-side return little useful text. Page bodies are truncated to 20 000 characters.
- `image_search` filters to `.jpg` / `.png` / `.gif` / `.jpeg` only and writes files into `ctl.getWorkingDirectory()` named `<timestamp>-<index>.<ext>`. Old images are not cleaned up.
- The shared 2 s rate limit caps throughput at roughly one request every two seconds across all tools.

## License

[MIT](LICENSE). Fork of [`danielsig/lms-plugin-duckduckgo`](https://github.com/danielsig/lms-plugin-duckduckgo).
