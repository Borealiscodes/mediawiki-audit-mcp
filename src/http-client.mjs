// http-client.mjs
// Generalized SSRF-Hardened MediaWiki HTTP JSON Client (Zero-Dependency ESM)

import https from 'node:https'

export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024 // 2 MiB
export const DEFAULT_TIMEOUT_MS = 8_000
export const MAX_TITLE_BYTES = 256

export const DEFAULT_HOST_PATTERNS = [
  /^[a-z0-9-]+\.fandom\.com$/,
  /^[a-z0-9-]+\.wikipedia\.org$/,
  /^[a-z0-9-]+\.wikimedia\.org$/,
  /^[a-z0-9-]+\.wiki\.gg$/,
]

const RETRYABLE_STATUSES = new Set([429, 503])
const RETRY_DELAYS_MS = [250, 500] // Deterministic, jitter-free backoff

export class HttpClientError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'HttpClientError'
    this.code = code
    Object.assign(this, details)
  }
}

export function isAllowedHost(hostname, allowedPatterns = DEFAULT_HOST_PATTERNS) {
  const normalized = String(hostname || '').trim().toLowerCase()
  if (!normalized) return false
  return allowedPatterns.some((pattern) =>
    pattern instanceof RegExp ? pattern.test(normalized) : normalized === String(pattern).toLowerCase()
  )
}

export function assertAllowlistedUrl(target, allowedPatterns = DEFAULT_HOST_PATTERNS) {
  let parsed
  try {
    parsed = target instanceof URL ? target : new URL(target)
  } catch {
    throw new HttpClientError('ErrHostNotAllowed', 'Invalid target URL')
  }

  if (parsed.protocol !== 'https:') {
    throw new HttpClientError('ErrHostNotAllowed', 'Only HTTPS endpoints are allowed')
  }
  if (parsed.username || parsed.password) {
    throw new HttpClientError('ErrHostNotAllowed', 'Credentials in URLs are not allowed')
  }
  if (parsed.port && parsed.port !== '443') {
    throw new HttpClientError('ErrHostNotAllowed', `Non-standard port ${parsed.port} is not allowed`)
  }
  if (!isAllowedHost(parsed.hostname, allowedPatterns)) {
    throw new HttpClientError('ErrHostNotAllowed', `Host "${parsed.hostname}" is not in allowed MediaWiki host list`)
  }

  return parsed
}

export function buildMediaWikiApiUrl(baseEndpoint, params = {}, allowedPatterns = DEFAULT_HOST_PATTERNS) {
  const parsed = assertAllowlistedUrl(baseEndpoint, allowedPatterns)
  const cleanParams = { ...params }

  if (typeof cleanParams.titles === 'string') {
    cleanParams.titles = sanitizeTitle(cleanParams.titles)
  }
  if (typeof cleanParams.page === 'string') {
    cleanParams.page = sanitizeTitle(cleanParams.page)
  }

  const usp = new URLSearchParams({
    format: 'json',
    formatversion: '2',
    redirects: '1',
    ...cleanParams,
  })

  parsed.search = usp.toString()
  return parsed.toString()
}

export function sanitizeTitle(rawTitle) {
  if (typeof rawTitle !== 'string') {
    throw new HttpClientError('ErrInvalidTitle', 'Page title must be a string')
  }

  // Strip ASCII and C1 control characters, normalize whitespace
  const cleaned = rawTitle
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .trim()
    .replace(/\s+/g, ' ')

  if (!cleaned) {
    throw new HttpClientError('ErrInvalidTitle', 'Page title cannot be empty')
  }

  const byteLength = Buffer.byteLength(cleaned, 'utf8')
  if (byteLength > MAX_TITLE_BYTES) {
    throw new HttpClientError(
      'ErrInvalidTitle',
      `Page title exceeds ${MAX_TITLE_BYTES} UTF-8 bytes (${byteLength} bytes)`
    )
  }

  return cleaned
}

export function validateMediaWikiResponse(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HttpClientError('ErrInvalidSchema', 'MediaWiki response must be a JSON object')
  }

  if (payload.error && typeof payload.error === 'object') {
    throw new HttpClientError(
      'ErrMediaWikiApi',
      payload.error.info || 'Upstream MediaWiki API returned an error',
      { apiCode: payload.error.code }
    )
  }

  const hasQuery = payload.query && typeof payload.query === 'object' && !Array.isArray(payload.query)
  const hasParse = payload.parse && typeof payload.parse === 'object' && !Array.isArray(payload.parse)

  if (!hasQuery && !hasParse) {
    throw new HttpClientError('ErrInvalidSchema', 'MediaWiki response missing valid "query" or "parse" object')
  }

  return payload
}

function executeAttempt(url, {
  headers,
  timeoutMs,
  maxBytes,
  maxRedirects,
  allowedPatterns,
  transport,
}) {
  return new Promise((resolve, reject) => {
    let settled = false
    let activeRequest
    let activeResponse

    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      if (error) {
        activeResponse?.destroy()
        activeRequest?.destroy()
        reject(error)
      } else {
        resolve(value)
      }
    }

    const deadline = setTimeout(() => {
      finish(new HttpClientError('ErrUpstreamTimeout', `HTTP JSON request timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    const visit = (target, redirects) => {
      let parsed
      try {
        parsed = assertAllowlistedUrl(target, allowedPatterns)

        const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
          ? AbortSignal.timeout(timeoutMs)
          : undefined

        const req = transport(parsed, { headers, signal }, res => {
          if (settled) {
            res.destroy()
            return
          }
          activeResponse = res

          const failResponse = error => {
            if (res === activeResponse) finish(error)
          }

          res.on('error', failResponse)
          res.on('aborted', () => failResponse(new HttpClientError('ErrUpstreamAborted', 'HTTP JSON response aborted')))
          res.on('close', () => {
            if (!res.complete) {
              failResponse(new HttpClientError('ErrUpstreamAborted', 'HTTP JSON response closed before completion'))
            }
          })

          const status = res.statusCode || 0
          if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
            if (redirects >= maxRedirects) {
              finish(new HttpClientError('ErrRedirectLimit', 'HTTP JSON redirect limit exceeded'))
              return
            }

            let next
            try {
              next = new URL(res.headers.location, parsed)
              assertAllowlistedUrl(next, allowedPatterns)
            } catch (err) {
              finish(
                err instanceof HttpClientError
                  ? err
                  : new HttpClientError('ErrHostNotAllowed', 'Invalid or disallowed redirect location')
              )
              return
            }

            activeRequest = undefined
            activeResponse = undefined
            res.destroy()
            req.destroy()
            visit(next, redirects + 1)
            return
          }

          if (status < 200 || status >= 300) {
            finish(
              new HttpClientError('ErrUpstreamHttp', `HTTP JSON request failed with status ${status}`, { status })
            )
            return
          }

          const contentLength = Number(res.headers['content-length'])
          if (Number.isFinite(contentLength) && contentLength > maxBytes) {
            finish(new HttpClientError('ErrPayloadTooLarge', `Response exceeds byte limit of ${maxBytes} bytes`))
            return
          }

          const chunks = []
          let bytes = 0

          res.on('data', chunk => {
            if (settled) return
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
            bytes += buffer.length
            if (bytes > maxBytes) {
              finish(new HttpClientError('ErrPayloadTooLarge', `Response exceeds byte limit of ${maxBytes} bytes`))
              return
            }
            chunks.push(buffer)
          })

          res.on('end', () => {
            if (settled) return
            if (!res.complete) {
              finish(new HttpClientError('ErrUpstreamAborted', 'HTTP JSON response ended before completion'))
              return
            }

            try {
              const decoder = new TextDecoder('utf-8', { fatal: true })
              const text = decoder.decode(Buffer.concat(chunks, bytes))
              finish(null, JSON.parse(text))
            } catch {
              finish(new HttpClientError('ErrInvalidJson', 'Invalid UTF-8 or malformed JSON response'))
            }
          })
        })

        activeRequest = req
        req.on('error', error => {
          if (req === activeRequest) {
            if (error?.name === 'TimeoutError' || error?.code === 'ABORT_ERR') {
              finish(new HttpClientError('ErrUpstreamTimeout', `HTTP JSON request timed out after ${timeoutMs}ms`))
            } else {
              finish(error)
            }
          }
        })
      } catch (error) {
        finish(error)
      }
    }

    visit(url, 0)
  })
}

export async function fetchJson(url, {
  headers = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = MAX_RESPONSE_BYTES,
  maxRedirects = 3,
  maxRetries = 2,
  validateSchema = false,
  allowedPatterns = DEFAULT_HOST_PATTERNS,
  transport = https.get,
} = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 ||
      !Number.isSafeInteger(maxBytes) || maxBytes < 1 ||
      !Number.isSafeInteger(maxRedirects) || maxRedirects < 0 ||
      !Number.isSafeInteger(maxRetries) || maxRetries < 0) {
    throw new RangeError('Invalid HTTP response budget')
  }

  let attempt = 0
  while (true) {
    try {
      const data = await executeAttempt(url, {
        headers,
        timeoutMs,
        maxBytes,
        maxRedirects,
        allowedPatterns,
        transport,
      })
      return validateSchema ? validateMediaWikiResponse(data) : data
    } catch (error) {
      const retryable =
        error instanceof HttpClientError &&
        error.code === 'ErrUpstreamHttp' &&
        RETRYABLE_STATUSES.has(error.status)

      if (!retryable || attempt >= maxRetries) {
        throw error
      }

      const delay = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]
      attempt += 1
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}
