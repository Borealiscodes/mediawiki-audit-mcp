# 🔍 mediawiki-audit-mcp 🚧

A zero-dependency Node.js ESM **Model Context Protocol (MCP) server** and deterministic toolkit for fetching, parsing, verifying, and auditing MediaWiki knowledge bases across Wikipedia, Fandom, `wiki.gg`, and custom instances.

> ### 🚧 Project Status & Honest Disclaimer (Untested Prototype)
> **Full transparency before you clone or run this:** This repository is an **untested architectural extraction** forged out of pure AI-assisted refactoring chaos.
>
> * **The Origin Story:** It started as a hardened fork of a Dragon Ball Z Fandom wiki scraper (`fandom-mcp`) that originally mixed MediaWiki API calls with 432 Hz frequencies and mystical ontology heuristics.
> * **The Chaos:** While trying to turn that lore-heavy scraper into clean, domain-agnostic tooling, multiple AI coding assistants took turns helping—and tripping over their own feet (including deleting `.fandom.com` out of live URL templates, stripping lookup tables, and getting stuck in chat-renderer loops while wiring `server.mjs`).
> * **Where Things Stand:** The four underlying `src/` modules were extracted and refactored to be clean, zero-dependency, and general-purpose, **but `server.mjs` and the unified `mediawiki-audit-mcp` pipeline have not yet been tested end-to-end**. Expect rough edges, missing glue, and untested CLI/stdio paths until a proper test pass is completed.

---

## 🎯 Why This Exists: Turning Lore Chaos into Clean Tooling

Pop-culture wikis (especially Dragon Ball Z, with its nonlinear retcons, conflicting guidebooks, and exponential power-level scaling) are a stress test for knowledge retrieval. When AI agents consume raw wiki pages directly, they run into predictable failure modes. This project identifies and solves five core engineering problems:

1. **Unbounded SSRF & Context Flooding:** Passing raw wiki URLs or massive HTML dumps straight into an LLM tool invites Server-Side Request Forgery (SSRF) and blows up context windows. `http-client.mjs` and `server.mjs` enforce strict HTTPS host allowlists, redirect validation, 2 MiB payload limits, and a 32 KiB output ceiling.
2. **Noisy HTML & Infobox Drift:** Wikipedia uses `<table class="infobox">` while Fandom and `wiki.gg` use `<aside class="portable-infobox">`, cluttered with `<script>` tags, edit links, and footnote superscripts. `html-parser.mjs` normalizes both formats into clean key-value pairs and readable Markdown without external DOM libraries.
3. **Floating-Point Rounding on Stacked Multipliers:** Stacking exponential multipliers (like *Kaio-ken x20* on top of *Super Saiyan*, or nested SI/proportional factors) causes standard IEEE-754 floats to lose precision. `graph-engine.mjs` uses arbitrary-precision `BigInt` fractions (`p/q`) reduced by GCD so math stays exact.
4. **Circular Timelines & Silent Source Contradictions:** Retcons and conflicting citations often create circular event dependencies or silent factual disagreements. Instead of guessing, `graph-engine.mjs` runs Kahn's topological sort with DFS cycle tracing (`ErrGraphCycle`) and flags cross-source discrepancies explicitly (`ClaimConflict`).
5. **Unverifiable RAG Payloads:** Scraped wiki snippets often lose their source lineage and license attribution. `provenance.mjs` attaches `SHA-256` content digests and `berne-provenance-v2.0` CC-BY-SA attribution receipts to every retrieved record.

---

## ✨ Core Features & Architecture

* **SSRF-Hardened Client (`src/http-client.mjs`):** Enforces HTTPS, domain allowlists (`*.wikipedia.org`, `*.fandom.com`, `*.wiki.gg`), strict redirect checks, 2 MiB payload caps, and title sanitization.
* **HTML Wiki Parser (`src/html-parser.mjs`):** Decodes HTML entities safely, strips scripts/styles/footnotes, extracts both table and portable infobox fields, and converts prose to clean Markdown.
* **Graph & Fact Audit Engine (`src/graph-engine.mjs`):**
  * *DAGs & Timelines:* Kahn's topological sort with deterministic tie-breaking and DFS cycle tracing (`ErrGraphCycle`).
  * *BigInt Rationals (`p/q`):* Exact ratio scaling without floating-point drift.
  * *Contradiction & Clustering:* Explicit cross-source conflict flagging (`ClaimConflict`) and integer-scaled Jaccard entity ranking (`jaccard_micros`).
* **Provenance & Guardrails (`src/provenance.mjs`, `server.mjs`):** Computes deterministic `SHA-256` content digests with attribution receipts (`berne-provenance-v2.0`), speaking JSON-RPC 2.0 over `stdio` with 32 KiB response clamping.

```text
mediawiki-audit-mcp/
├── server.mjs               # Zero-dependency MCP stdio server & CLI entrypoint (untested)
├── package.json             # ESM manifest (Node >= 20, zero runtime dependencies)
├── src/
│   ├── http-client.mjs      # Allowlisted HTTPS client & URL query builder
│   ├── html-parser.mjs      # Dual Wikipedia/Fandom infobox & prose extractor
│   ├── graph-engine.mjs     # BigInt rationals, cycle-checked DAG, conflict & Jaccard engine
│   └── provenance.mjs       # SHA-256 digest & CC-BY-SA attribution envelope
└── test/                    # Planned unit & regression test suite (`node --test`)
```

---

## 🚀 Quickstart & Intended Usage (🚧 Untested)

* **Requirements:** Node.js 20+ (zero external packages required).
* **Run Tests (once populated):** `node --test test/*.test.mjs`
* **CLI Commands (intended interface):**
  * Dump schemas: `node server.mjs --dump-schemas`
  * Search/Fetch: `node server.mjs --base "https://wikipedia.org" --search "Directed acyclic graph"`
  * Run Audit: `node server.mjs --audit '{"dag_nodes":["v1","v2"],"dag_edges":[["v1","v2"]]}'`

### Exposed MCP Tools

| Tool Name | Purpose |
| :--- | :--- |
| **`wiki_search`** | Searches allowlisted endpoints for clean snippets and canonical URLs. |
| **`wiki_page`** | Fetches articles/sections, extracts infoboxes/quotes, formats Markdown, and attaches `SHA-256` receipts. |
| **`wiki_infobox`** | Returns token-compact normalized key-value infobox data and lead summaries. |
| **`wiki_sections`** | Lists table of contents and categories to manage token budgets. |
| **`wiki_audit`** | Runs offline DAG, rational math, contradiction, and Jaccard similarity checks. |

---

## 🔒 Security & License

* **Security:** Outbound traffic locked to HTTPS allowlists; credentials and non-standard ports blocked; hard payload and timeout bounds.
* **License:** MIT
