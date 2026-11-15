// src/provenance.mjs
// Zero-Dependency Attribution & SHA-256 Integrity Envelope (ESM)
import { createHash } from 'node:crypto'
export function computeSha256(content) {
return createHash('sha256').update(String(content ?? ''), 'utf8').digest('hex')
}
