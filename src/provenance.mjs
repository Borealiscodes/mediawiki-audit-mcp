// provenance.mjs
// Berne-Provenance-Toolkit v2.0 Aligned Attribution & Integrity Envelope (Zero-Dependency ESM)

import { createHash } from 'node:crypto'

export function computeSha256(content) {
  return createHash('sha256').update(String(content ?? ''), 'utf8').digest('hex')
}

export function buildCanonicalWikiUrl({
  host = 'en.wikipedia.org',
  wiki,
  title = '',
  articlePath = '/wiki/',
} = {}) {
  const resolvedHost = wiki
    ? `${String(wiki).trim().toLowerCase()}.fandom.com`
    : String(host || 'en.wikipedia.org').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')

  const cleanPath = articlePath.startsWith('/') ? articlePath : `/${articlePath}`
  const normalizedPath = cleanPath.endsWith('/') ? cleanPath : `${cleanPath}/`
  const encodedTitle = encodeURIComponent(String(title || '').trim().replace(/\s+/g, '_'))

  return `https://${resolvedHost}${normalizedPath}${encodedTitle}`
}

export function attachProvenanceEnvelope(payload, {
  host,
  wiki,
  title = '',
  pageId = null,
  revId = null,
  license = 'CC-BY-SA-4.0',
  modified = false,
  synthesisMode = 'verbatim',
  sources = [],
} = {}) {
  const resolvedHost = wiki
    ? `${String(wiki).trim().toLowerCase()}.fandom.com`
    : String(host || 'en.wikipedia.org').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')

  const resolvedLicense = wiki && !host ? 'CC-BY-SA-3.0' : license
  const canonicalUrl = buildCanonicalWikiUrl({ host: resolvedHost, title })

  const serializedBody = typeof payload === 'string'
    ? payload
    : JSON.stringify(payload)

  const upstreamSources = sources.length > 0
    ? sources
    : [
        {
          uri: revId ? `${canonicalUrl}?oldid=${encodeURIComponent(String(revId))}` : canonicalUrl,
          wiki: resolvedHost,
          title: String(title || ''),
          pageid: pageId,
          revid: revId,
          license: resolvedLicense,
          attribution: `${resolvedHost} contributors`,
        },
      ]

  return {
    ...((payload && typeof payload === 'object' && !Array.isArray(payload)) ? payload : { data: payload }),
    _provenance: {
      schema: 'berne-provenance-v2.0',
      canonical_uri: canonicalUrl,
      modified: Boolean(modified),
      synthesis_mode: synthesisMode,
      content_sha256: computeSha256(serializedBody),
      sources: upstreamSources,
    },
  }
}
