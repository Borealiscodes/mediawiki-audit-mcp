// --- buildMediaWikiApiUrl ---
function buildMediaWikiApiUrl(baseUrl, params = {}) {
  const url = new URL('/w/api.php', baseUrl);
  Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
  return url.toString();
}

// --- parseRenderedWikiPage ---
function parseRenderedWikiPage(htmlContent) {
  return {
    title: '',
    bodyHtml: htmlContent,
    extractedAt: new Date().toISOString()
  };
}

// --- validateDag ---
function validateDag(nodes, edges) {
  const visited = new Set();
  const visiting = new Set();

  function dfs(node) {
    if (visiting.has(node)) return false; // Cycle detected
    if (visited.has(node)) return true;

    visiting.add(node);
    const neighbors = edges.filter(e => e.from === node).map(e => e.to);
    for (const neighbor of neighbors) {
      if (!dfs(neighbor)) return false;
    }
    visiting.delete(node);
    visited.add(node);
    return true;
  }

  for (const node of nodes) {
    if (!dfs(node)) return { valid: false, error: 'Cycle detected in DAG' };
  }
  return { valid: true };
}

// --- attachProvenanceEnvelope ---
function attachProvenanceEnvelope(data, sourceUri) {
  return {
    provenance: {
      source: sourceUri,
      timestamp: new Date().toISOString(),
      generator: 'MediaWiki-DAG-Service'
    },
    payload: data
  };
}

// --- Example Server Setup ---
import http from 'http';

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  
  const responseData = {
    message: 'MediaWiki DAG Service is running',
    sampleApiUrl: buildMediaWikiApiUrl('https://wikipedia.org', { action: 'parse', page: 'Main_Page' }),
    dagValidation: validateDag(['A', 'B'], [{ from: 'A', to: 'B' }])
  };

  const envelopedData = attachProvenanceEnvelope(responseData, req.url);
  res.end(JSON.stringify(envelopedData, null, 2));
});

const PORT = process.init ? 3000 : 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
