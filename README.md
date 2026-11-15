being populated  🚧 

# 🔍 mediawiki-audit-mcp

A zero-dependency Node.js ESM **Model Context Protocol (MCP) server** and deterministic toolkit for fetching, parsing, verifying, and auditing MediaWiki knowledge bases across Wikipedia, Fandom, `wiki.gg`, and custom instances. 

---

## ✨ Core Features & Architecture

* **SSRF-Hardened Client (`src/http-client.mjs`):** Enforces HTTPS, domain allowlists, strict redirect checks, 2 MiB payload caps, and title sanitization.
* **HTML Wiki Parser (`src/html-parser.mjs`):** Decodes HTML entities, strips scripts/styles/footnotes, extracts portable infobox fields, and converts prose to clean Markdown.
* **Graph & Fact Audit Engine (`src/graph-engine.mjs`):** 
  * *DAGs & Timelines:* Kahn's topological sort with DFS cycle tracing (`ErrTimelineCycle`).
  * *BigInt Rations (`p/q`):* Exact math scaling without floating-point drift.
  * *Contradiction & Clustering:* Explicit cross-source conflict flagging (`HolonomyConflict`) and integer-scaled Jaccard entity ranking.
* **Provenance & Guardrails (`src/provenance.mjs`, `server.mjs`):** Computes deterministic `SHA-256` content digests with attribution receipts (`berne-provenance-v2.0`), speaking JSON-RPC 2.0 over `stdio` with 32 KiB response clamping.

```text
mediawiki-audit-mcp/
├── server.mjs               # Zero-dependency MCP stdio server & CLI entrypoint
├── package.json             # ESM manifest (Node >= 20, zero runtime dependencies)
├── src/                     # Core modules (http-client, html-parser, graph-engine, provenance)
└── test/                    # Unit & regression test suite (`node --test`)
```

---

## 🚀 Quickstart & Usage

* **Requirements:** Node.js 20+ (zero external packages required).
* **Verify Suite:** `node --test test/*.test.mjs`
* **CLI Commands:**
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
* **Security:** Outbound traffic locked to HTTPS allowlists; private IPs and non-standard ports blocked; hard execution bounds.
* **License:** MIT
