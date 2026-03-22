const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 8893);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'events.ndjson');
const MAX_BODY_BYTES = 100 * 1024;
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || [
    'https://chillingdaisydev.github.io',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
  ].join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

const ALLOWED_EVENT_TYPES = new Set([
  'visit',
  'select_character',
  'clear_character',
  'save_image',
  'share_link',
  'reset_all',
]);

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(EVENTS_FILE)) {
  fs.writeFileSync(EVENTS_FILE, '');
}

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.has('*') || ALLOWED_ORIGINS.has(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let totalBytes = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8') || '{}';
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });

    req.on('error', reject);
  });
}

function incrementCounter(map, key, amount = 1) {
  if (!key) {
    return;
  }
  map[key] = (map[key] || 0) + amount;
}

function sortedEntries(map, limit = 20) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function summarizeEvents() {
  const summary = {
    totalEvents: 0,
    uniqueSessions: 0,
    byType: {},
    dailyEvents: {},
    selectedCharacters: {},
    savedCharacters: {},
    selectedUnits: {},
    savedUnits: {},
  };
  const sessions = new Set();

  const raw = fs.readFileSync(EVENTS_FILE, 'utf8');
  const lines = raw.split('\n').filter(Boolean);

  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      summary.totalEvents += 1;
      incrementCounter(summary.byType, event.eventType);

      if (event.sessionId) {
        sessions.add(event.sessionId);
      }

      if (event.recordedAt) {
        incrementCounter(summary.dailyEvents, event.recordedAt.slice(0, 10));
      }

      if (event.eventType === 'select_character') {
        incrementCounter(summary.selectedUnits, event.unitId);
        incrementCounter(summary.selectedCharacters, event.characterId);
      }

      if (event.eventType === 'save_image') {
        const selections = safeObject(event.selections);
        for (const [unitId, characterId] of Object.entries(selections)) {
          incrementCounter(summary.savedUnits, unitId);
          incrementCounter(summary.savedCharacters, characterId);
        }
      }
    } catch {
      // Keep the server resilient even if a line becomes malformed.
    }
  }

  summary.uniqueSessions = sessions.size;
  summary.topSelectedCharacters = sortedEntries(summary.selectedCharacters);
  summary.topSavedCharacters = sortedEntries(summary.savedCharacters);
  summary.topSelectedUnits = sortedEntries(summary.selectedUnits);
  summary.topSavedUnits = sortedEntries(summary.savedUnits);
  summary.recentDays = sortedEntries(summary.dailyEvents, 14);

  return summary;
}

function buildDashboardHtml(summary) {
  const renderRows = (items, emptyLabel) => {
    if (!items.length) {
      return `<tr><td colspan="2">${emptyLabel}</td></tr>`;
    }
    return items.map((item) => `<tr><td>${item.key}</td><td>${item.count}</td></tr>`).join('');
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Enstar Stats</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 32px; background: #f6f7fb; color: #1f2937; }
    h1 { margin-bottom: 8px; }
    p { color: #6b7280; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-top: 24px; }
    .card { background: white; border-radius: 14px; padding: 18px; box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08); }
    .metric { font-size: 28px; font-weight: 700; margin-top: 10px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { text-align: left; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    th { font-size: 13px; color: #6b7280; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  </style>
</head>
<body>
  <h1>Enstar Stats</h1>
  <p class="mono">/api/stats/summary</p>
  <div class="grid">
    <div class="card"><div>Total Events</div><div class="metric">${summary.totalEvents}</div></div>
    <div class="card"><div>Unique Sessions</div><div class="metric">${summary.uniqueSessions}</div></div>
    <div class="card"><div>Visits</div><div class="metric">${summary.byType.visit || 0}</div></div>
    <div class="card"><div>Saved Images</div><div class="metric">${summary.byType.save_image || 0}</div></div>
    <div class="card">
      <div>Top Selected Characters</div>
      <table><thead><tr><th>Character</th><th>Count</th></tr></thead><tbody>${renderRows(summary.topSelectedCharacters, 'No data yet')}</tbody></table>
    </div>
    <div class="card">
      <div>Top Saved Characters</div>
      <table><thead><tr><th>Character</th><th>Count</th></tr></thead><tbody>${renderRows(summary.topSavedCharacters, 'No data yet')}</tbody></table>
    </div>
    <div class="card">
      <div>Top Selected Units</div>
      <table><thead><tr><th>Unit</th><th>Count</th></tr></thead><tbody>${renderRows(summary.topSelectedUnits, 'No data yet')}</tbody></table>
    </div>
    <div class="card">
      <div>Recent Days</div>
      <table><thead><tr><th>Date</th><th>Events</th></tr></thead><tbody>${renderRows(summary.recentDays, 'No data yet')}</tbody></table>
    </div>
  </div>
</body>
</html>`;
}

function normalizeEvent(payload, req) {
  const eventType = typeof payload.eventType === 'string' ? payload.eventType.trim() : '';
  if (!ALLOWED_EVENT_TYPES.has(eventType)) {
    throw new Error('Unsupported event type');
  }

  const selectionCode = typeof payload.selectionCode === 'string' ? payload.selectionCode.slice(0, 256) : '';
  const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.slice(0, 128) : '';
  const unitId = typeof payload.unitId === 'string' ? payload.unitId.slice(0, 64) : '';
  const characterId = typeof payload.characterId === 'string' ? payload.characterId.slice(0, 64) : '';
  const previousCharacterId = typeof payload.previousCharacterId === 'string' ? payload.previousCharacterId.slice(0, 64) : '';
  const lang = typeof payload.lang === 'string' ? payload.lang.slice(0, 16) : '';
  const page = typeof payload.page === 'string' ? payload.page.slice(0, 256) : '';
  const selectionCount = Number.isInteger(payload.selectionCount) ? payload.selectionCount : 0;
  const selections = safeObject(payload.selections);

  return {
    id: crypto.randomUUID(),
    eventType,
    sessionId,
    unitId,
    characterId,
    previousCharacterId,
    selectionCode,
    selectionCount,
    selections,
    hasNickname: Boolean(payload.hasNickname),
    lang,
    page,
    referrer: typeof req.headers.referer === 'string' ? req.headers.referer.slice(0, 512) : '',
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 512) : '',
    recordedAt: new Date().toISOString(),
  };
}

const server = http.createServer(async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/stats/summary') {
    sendJson(res, 200, summarizeEvents());
    return;
  }

  if (req.method === 'GET' && url.pathname === '/dashboard') {
    const summary = summarizeEvents();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(buildDashboardHtml(summary));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/events') {
    try {
      const payload = await readJsonBody(req);
      const event = normalizeEvent(payload, req);
      fs.appendFileSync(EVENTS_FILE, `${JSON.stringify(event)}\n`);
      sendJson(res, 202, { ok: true, id: event.id });
    } catch (error) {
      const statusCode = error.message === 'Payload too large' ? 413 : 400;
      sendJson(res, statusCode, { ok: false, error: error.message || 'Invalid request' });
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`Enstar stats server listening on port ${PORT}`);
});
