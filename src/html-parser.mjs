// src/html-parser.mjs
// Zero-Dependency MediaWiki Rendered HTML Parser (Wikipedia Infobox Tables & Fandom Portable Infoboxes)

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
}

export function decodeHtmlEntities(str) {
  if (!str) return ''
  return String(str).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, entity) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16)
      if (Number.isFinite(code) && code >= 0 && code <= 0x10FFFF) {
        try {
          return String.fromCodePoint(code)
        } catch {
          return full
        }
      }
      return full
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10)
      if (Number.isFinite(code) && code >= 0 && code <= 0x10FFFF) {
        try {
          return String.fromCodePoint(code)
        } catch {
          return full
        }
      }
      return full
    }
    return NAMED_ENTITIES[entity] ?? full
  })
}

export function stripHtmlToText(html) {
  if (!html) return ''
  let s = String(html)

  // Drop scripts, styles, noscript, reference superscripts, and edit section links
  s = s.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  s = s.replace(/<sup\b[^>]*class="[^"]*reference[^"]*"[^>]*>[\s\S]*?<\/sup>/gi, '')
  s = s.replace(/<span\b[^>]*class="[^"]*mw-editsection[^"]*"[^>]*>[\s\S]*?<\/span>/gi, '')

  // Convert line breaks and list items to readable separators
  s = s.replace(/<br\s*\/?>/gi, ', ')
  s = s.replace(/<\/li>/gi, '; ')
  s = s.replace(/<\/(p|div|h[1-6]|tr)>/gi, '\n')

  // Strip remaining HTML tags and decode entities
  s = s.replace(/<[^>]+>/g, '')
  s = decodeHtmlEntities(s)

  return s
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/;\s*(?=\n|$)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function normalizeInfoboxKey(rawLabel) {
  return stripHtmlToText(rawLabel)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function extractPortableInfobox(html) {
  const result = {
    infoboxType: null,
    infobox: {},
    normalized: {},
  }
  if (!html) return result

  const asideMatch = String(html).match(
    /<aside\b[^>]*class="[^"]*\bportable-infobox\b[^"]*"[^>]*>([\s\S]*?)<\/aside>/i
  )
  if (!asideMatch) return result

  const asideTag = asideMatch[0].slice(0, asideMatch[0].indexOf('>') + 1)
  const themeMatch = asideTag.match(/\bpi-theme-([a-zA-Z0-9_-]+)/i)
  result.infoboxType = themeMatch ? themeMatch[1] : 'portable-infobox'

  const body = asideMatch[1]
  const itemRe = /<div\b[^>]*class="[^"]*\bpi-data\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div\b|<section\b|<h2\b|<\/aside>|$)/gi
  let match
  while ((match = itemRe.exec(body)) !== null) {
    const block = match[1]
    const labelMatch = block.match(/<h3\b[^>]*class="[^"]*\bpi-data-label\b[^"]*"[^>]*>([\s\S]*?)<\/h3>/i)
    const valueMatch = block.match(/<div\b[^>]*class="[^"]*\bpi-data-value\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i)

    if (!labelMatch || !valueMatch) continue

    const rawLabel = stripHtmlToText(labelMatch[1])
    const cleanValue = stripHtmlToText(valueMatch[1])
    const normKey = normalizeInfoboxKey(rawLabel)

    if (rawLabel && cleanValue) {
      result.infobox[rawLabel] = cleanValue
    }
    if (normKey && cleanValue) {
      result.normalized[normKey] = cleanValue
    }
  }

  return result
}

export function extractTableInfobox(html) {
  const result = {
    infoboxType: null,
    infobox: {},
    normalized: {},
  }
  if (!html) return result

  const tableMatch = String(html).match(
    /<table\b[^>]*class="[^"]*\binfobox\b[^"]*"[^>]*>([\s\S]*?)<\/table>/i
  )
  if (!tableMatch) return result

  const tableTag = tableMatch[0].slice(0, tableMatch[0].indexOf('>') + 1)
  const classMatch = tableTag.match(/class="([^"]*)"/i)
  if (classMatch) {
    const classes = classMatch[1].split(/\s+/).filter(c => c !== 'infobox' && c !== 'vcard' && c !== 'vevent')
    result.infoboxType = classes[0] || 'table-infobox'
  } else {
    result.infoboxType = 'table-infobox'
  }

  const body = tableMatch[1]
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch
  while ((rowMatch = rowRe.exec(body)) !== null) {
    const row = rowMatch[1]
    const thMatch = row.match(/<th\b[^>]*>([\s\S]*?)<\/th>/i)
    const tdMatch = row.match(/<td\b[^>]*>([\s\S]*?)<\/td>/i)

    if (!thMatch || !tdMatch) continue

    const rawLabel = stripHtmlToText(thMatch[1])
    const cleanValue = stripHtmlToText(tdMatch[1])
    const normKey = normalizeInfoboxKey(rawLabel)

    if (rawLabel && cleanValue) {
      result.infobox[rawLabel] = cleanValue
    }
    if (normKey && cleanValue) {
      result.normalized[normKey] = cleanValue
    }
  }

  return result
}

export function extractInfobox(html) {
  const portable = extractPortableInfobox(html)
  if (portable.infoboxType || Object.keys(portable.infobox).length > 0) {
    return portable
  }
  return extractTableInfobox(html)
}

export function extractRenderedQuote(html) {
  if (!html) return null
  const quoteMatch = String(html).match(
    /<blockquote\b[^>]*class="[^"]*(?:\bpull-quote\b|\btemplatequote\b)[^"]*"[^>]*>([\s\S]*?)<\/blockquote>/i
  )
  if (!quoteMatch) return null

  const inner = quoteMatch[1]
  const citeMatch = inner.match(/<cite\b[^>]*>([\s\S]*?)<\/cite>/i)
  const attribution = citeMatch ? stripHtmlToText(citeMatch[1]).replace(/^[—–-]\s*/, '') : null
  const withoutCite = citeMatch ? inner.replace(citeMatch[0], '') : inner
  const text = stripHtmlToText(withoutCite).replace(/^[“"]|[”"]$/g, '').trim()

  if (!text) return null
  return { text, attribution: attribution || null }
}

export function parseRenderedWikiPage(html) {
  const { infoboxType, infobox, normalized } = extractInfobox(html)
  const quote = extractRenderedQuote(html)

  // Strip infoboxes, pull-quotes, and TOCs before extracting clean lead paragraphs
  let proseHtml = String(html || '')
    .replace(/<aside\b[^>]*class="[^"]*\bportable-infobox\b[^"]*"[^>]*>[\s\S]*?<\/aside>/gi, '')
    .replace(/<table\b[^>]*class="[^"]*\binfobox\b[^"]*"[^>]*>[\s\S]*?<\/table>/gi, '')
    .replace(/<blockquote\b[^>]*class="[^"]*(?:\bpull-quote\b|\btemplatequote\b)[^"]*"[^>]*>[\s\S]*?<\/blockquote>/gi, '')
    .replace(/<div\b[^>]*class="[^"]*\btoc\b[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')

  const paragraphs = []
  const pRe = /<p\b[^>]*>([\s\S]*?)<\/p>/gi
  let pMatch
  while ((pMatch = pRe.exec(proseHtml)) !== null) {
    const clean = stripHtmlToText(pMatch[1])
    if (clean) paragraphs.push(clean)
  }

  return {
    quote,
    infoboxType,
    infobox,
    normalized,
    lead_markdown: paragraphs.join('\n\n'),
  }
}

export function lookupField(normalizedBox, ...aliases) {
  if (!normalizedBox || typeof normalizedBox !== 'object') return null
  for (const alias of aliases) {
    const key = normalizeInfoboxKey(alias)
    if (normalizedBox[key]) return normalizedBox[key]
  }
  return null
}
