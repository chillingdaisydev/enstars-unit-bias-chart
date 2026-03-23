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

const CHARACTER_LABELS = {
  eichi: '텐쇼인 에이치',
  wataru: '히비키 와타루',
  tori: '히메미야 토리',
  yuzuru: '후시미 유즈루',
  subaru: '아케호시 스바루',
  hokuto: '히다카 호쿠토',
  makoto: '유우키 마코토',
  mao: '이사라 마오',
  chiaki: '모리사와 치아키',
  kanata: '신카이 카나타',
  tetora: '나구모 테토라',
  midori: '타카미네 미도리',
  shinobu: '센고쿠 시노부',
  hiiro: '아마기 히이로',
  aira: '시라토리 아이라',
  mayoi: '아야세 마요이',
  tatsumi: '카제하야 타츠미',
  nagisa: '란 나기사',
  hiyori: '토모에 히요리',
  ibara: '사에구사 이바라',
  jun: '사자나미 쥰',
  shu: '이츠키 슈',
  mika: '카게히라 미카',
  hinata: '아오이 히나타',
  yuta: '아오이 유우타',
  rinne: '아마기 린네',
  himeru: 'HiMERU',
  kohaku: '오우카와 코하쿠',
  niki: '시이나 니키',
  rei: '사쿠마 레이',
  kaoru: '하카제 카오루',
  koga: '오가미 코가',
  adonis: '오토가리 아도니스',
  nazuna: '니토 나즈나',
  mitsuru: '텐마 미츠루',
  hajime: '시노 하지메',
  tomoya: '마시로 토모야',
  keito: '하스미 케이토',
  kuro: '키류 쿠로',
  souma: '칸자키 소우마',
  ibuki: '타키 이부키',
  chitose: '츠즈라 치토세',
  juis: '코지카 쥬이스',
  mashu: '쿠온 마슈',
  nozomi: '마도카 노조미',
  leo: '츠키나가 레오',
  izumi: '세나 이즈미',
  arashi: '나루카미 아라시',
  ritsu: '사쿠마 리츠',
  tsukasa: '스오우 츠카사',
  natsume: '사카사키 나츠메',
  tsumugi: '아오바 츠무기',
  sora: '하루카와 소라',
  madara: '미케지마 마다라',
  esu: '에스',
  kanna: '칸나',
  raika: '라이카',
  yume: '유메',
  jin: '사가미 진',
  akiomi: '쿠누기 아키오미',
  nice: '나이스',
  kaname: '토죠 카나메',
  gatekeeper: '게이트 키퍼',
  seiya: '히다카 세이야',
  hitsugi: '쿠로네 히츠기',
  anzu: '안즈',
};

const UNIT_LABELS = {
  fine: 'fine',
  trickstar: 'Trickstar',
  ryuseitai: 'RYUSEITAI',
  alkaloid: 'ALKALOID',
  eden: 'Eden',
  valkyrie: 'Valkyrie',
  '2wink': '2wink',
  crazyb: 'Crazy:B',
  undead: 'UNDEAD',
  rabits: 'Ra*bits',
  akatsuki: 'AKATSUKI',
  melodious: 'Mellow Dear Us',
  knights: 'Knights',
  switch: 'Switch',
  mam: 'MaM',
  esprit: 'ESPRIT',
  others: '기타',
};

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

function labelEntries(items, labels) {
  return items.map((item) => ({
    ...item,
    label: labels[item.key] || item.key,
  }));
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function incrementNestedCounter(map, groupKey, itemKey, amount = 1) {
  if (!groupKey || !itemKey) {
    return;
  }
  if (!map[groupKey]) {
    map[groupKey] = {};
  }
  map[groupKey][itemKey] = (map[groupKey][itemKey] || 0) + amount;
}

function buildUnitLeaders(counterMap) {
  return Object.keys(UNIT_LABELS)
    .map((unitId) => {
      const entries = sortedEntries(counterMap[unitId] || {}, 1);
      const top = entries[0];
      return {
        unitId,
        unitLabel: UNIT_LABELS[unitId] || unitId,
        characterId: top ? top.key : '',
        characterLabel: top ? (CHARACTER_LABELS[top.key] || top.key) : '데이터 없음',
        count: top ? top.count : 0,
      };
    })
    .filter((item) => item.count > 0);
}

function buildUnitFullRankings(counterMap) {
  return Object.keys(UNIT_LABELS)
    .map((unitId) => {
      const allEntries = sortedEntries(counterMap[unitId] || {}, 50);
      return {
        unitId,
        unitLabel: UNIT_LABELS[unitId] || unitId,
        rankings: allEntries.map((entry, idx) => ({
          rank: idx + 1,
          characterId: entry.key,
          characterLabel: CHARACTER_LABELS[entry.key] || entry.key,
          count: entry.count,
        })),
      };
    })
    .filter((item) => item.rankings.length > 0);
}

function summarizeEvents() {
  const summary = {
    totalEvents: 0,
    uniqueSessions: 0,
    byType: {},
    dailyEvents: {},
    dailyVisits: {},
    selectedCharacters: {},
    savedCharacters: {},
    selectedUnits: {},
    savedUnits: {},
    selectedCharactersByUnit: {},
    savedCharactersByUnit: {},
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
        if (event.eventType === 'visit') {
          incrementCounter(summary.dailyVisits, event.recordedAt.slice(0, 10));
        }
      }

      if (event.eventType === 'select_character') {
        incrementCounter(summary.selectedUnits, event.unitId);
        incrementCounter(summary.selectedCharacters, event.characterId);
        incrementNestedCounter(summary.selectedCharactersByUnit, event.unitId, event.characterId);
      }

      if (event.eventType === 'save_image') {
        const selections = safeObject(event.selections);
        for (const [unitId, characterId] of Object.entries(selections)) {
          incrementCounter(summary.savedUnits, unitId);
          incrementCounter(summary.savedCharacters, characterId);
          incrementNestedCounter(summary.savedCharactersByUnit, unitId, characterId);
        }
      }
    } catch {
      // Keep the server resilient even if a line becomes malformed.
    }
  }

  summary.uniqueSessions = sessions.size;
  summary.topSelectedCharacters = labelEntries(sortedEntries(summary.selectedCharacters, 5), CHARACTER_LABELS);
  summary.topSavedCharacters = labelEntries(sortedEntries(summary.savedCharacters, 5), CHARACTER_LABELS);
  summary.topSelectedUnits = labelEntries(sortedEntries(summary.selectedUnits, 5), UNIT_LABELS);
  summary.topSavedUnits = labelEntries(sortedEntries(summary.savedUnits, 5), UNIT_LABELS);
  summary.selectedUnitLeaders = buildUnitLeaders(summary.selectedCharactersByUnit);
  summary.savedUnitLeaders = buildUnitLeaders(summary.savedCharactersByUnit);
  summary.selectedUnitRankings = buildUnitFullRankings(summary.selectedCharactersByUnit);
  summary.savedUnitRankings = buildUnitFullRankings(summary.savedCharactersByUnit);
  summary.recentDays = sortedEntries(summary.dailyEvents, 14);
  summary.recentVisits = sortedEntries(summary.dailyVisits, 14).reverse();

  return summary;
}

function buildDashboardHtml(summary) {
  const renderRows = (items, emptyLabel) => {
    if (!items.length) {
      return `<tr><td colspan="2">${emptyLabel}</td></tr>`;
    }
    return items.map((item) => `<tr><td>${item.label || item.key}</td><td>${item.count}</td></tr>`).join('');
  };

  const renderLeaderRows = (items, emptyLabel) => {
    if (!items.length) {
      return `<tr><td colspan="3">${emptyLabel}</td></tr>`;
    }
    return items.map((item) => `<tr><td>${item.unitLabel}</td><td>${item.characterLabel}</td><td>${item.count}</td></tr>`).join('');
  };

  const renderUnitRankings = (rankings) => {
    if (!rankings.length) return '<p class="empty-state">No data yet</p>';
    return rankings.map((unit) => {
      const rows = unit.rankings.map((r) => {
        const medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `${r.rank}.`;
        const barWidth = unit.rankings[0].count > 0 ? Math.round((r.count / unit.rankings[0].count) * 100) : 0;
        return `<div class="rank-row">
          <span class="rank-medal">${medal}</span>
          <span class="rank-name">${r.characterLabel}</span>
          <div class="rank-bar-bg"><div class="rank-bar" style="width:${barWidth}%"></div></div>
          <span class="rank-count">${r.count}</span>
        </div>`;
      }).join('');
      return `<div class="unit-ranking-card"><div class="unit-ranking-title">${unit.unitLabel}</div>${rows}</div>`;
    }).join('');
  };

  const renderVisitBars = (items) => {
    if (!items.length) {
      return '<div class="empty-state">No visit data yet</div>';
    }

    const maxCount = Math.max(...items.map((item) => item.count), 1);
    return `<div class="visit-chart">${
      items.map((item) => {
        const height = Math.max(12, Math.round((item.count / maxCount) * 140));
        return `<div class="visit-bar-wrap">
          <div class="visit-count">${item.count}</div>
          <div class="visit-bar" style="height:${height}px"></div>
          <div class="visit-label">${item.key.slice(5)}</div>
        </div>`;
      }).join('')
    }</div>`;
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Enstar Stats</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0a0f1a;
      --bg-accent: #121a2b;
      --card: rgba(18, 26, 43, 0.88);
      --card-border: rgba(148, 163, 184, 0.16);
      --text: #eef2ff;
      --muted: #9aa6c5;
      --line: rgba(148, 163, 184, 0.14);
      --glow: rgba(56, 189, 248, 0.18);
      --metric: #8be9fd;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      margin: 32px;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(56, 189, 248, 0.16), transparent 28%),
        radial-gradient(circle at top right, rgba(99, 102, 241, 0.14), transparent 24%),
        linear-gradient(180deg, var(--bg-accent), var(--bg));
      min-height: 100vh;
    }
    h1 { margin-bottom: 8px; letter-spacing: 0.02em; }
    p { color: var(--muted); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-top: 24px; }
    .card {
      background: var(--card);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 18px;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.04);
      backdrop-filter: blur(12px);
    }
    .metric { font-size: 30px; font-weight: 800; margin-top: 10px; color: var(--metric); text-shadow: 0 0 24px var(--glow); }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { text-align: left; padding: 8px 0; border-bottom: 1px solid var(--line); }
    th { font-size: 13px; color: var(--muted); }
    td { color: var(--text); }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .span-2 { grid-column: span 2; }
    .visit-chart { display: flex; align-items: end; gap: 10px; min-height: 190px; margin-top: 16px; padding-top: 8px; }
    .visit-bar-wrap { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: end; gap: 8px; }
    .visit-bar {
      width: 100%;
      max-width: 42px;
      border-radius: 12px 12px 6px 6px;
      background: linear-gradient(180deg, #67e8f9 0%, #38bdf8 45%, #2563eb 100%);
      box-shadow: 0 0 24px rgba(56, 189, 248, 0.28);
    }
    .visit-count { font-size: 12px; color: var(--text); }
    .visit-label { font-size: 11px; color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .empty-state { margin-top: 16px; color: var(--muted); }
    .unit-ranking-card { margin-bottom: 16px; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 10px; border: 1px solid var(--line); }
    .unit-ranking-title { font-weight: 700; font-size: 14px; margin-bottom: 8px; color: var(--metric); }
    .rank-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; }
    .rank-medal { width: 24px; text-align: center; flex-shrink: 0; }
    .rank-name { width: 120px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .rank-bar-bg { flex: 1; height: 14px; background: rgba(255,255,255,0.06); border-radius: 7px; overflow: hidden; }
    .rank-bar { height: 100%; background: linear-gradient(90deg, #38bdf8, #818cf8); border-radius: 7px; transition: width 0.3s; }
    .rank-count { width: 40px; text-align: right; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--muted); flex-shrink: 0; }
    @media (max-width: 900px) {
      .span-2 { grid-column: span 1; }
      .visit-chart { gap: 6px; }
      .visit-label { font-size: 10px; }
    }
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
    <div class="card"><div>Share Link</div><div class="metric">${summary.byType.share_link || 0}</div></div>
    <div class="card span-2">
      <div>Daily Visits</div>
      ${renderVisitBars(summary.recentVisits)}
    </div>
    <div class="card">
      <div>Unit Winners by Save</div>
      <table><thead><tr><th>Unit</th><th>Winner</th><th>Count</th></tr></thead><tbody>${renderLeaderRows(summary.savedUnitLeaders, 'No data yet')}</tbody></table>
    </div>
    <div class="card">
      <div>Top 5 Saved Units</div>
      <table><thead><tr><th>Unit</th><th>Count</th></tr></thead><tbody>${renderRows(summary.topSavedUnits, 'No data yet')}</tbody></table>
    </div>
    <div class="card">
      <div>Recent Days</div>
      <table><thead><tr><th>Date</th><th>Events</th></tr></thead><tbody>${renderRows(summary.recentDays, 'No data yet')}</tbody></table>
    </div>
    <div class="card span-2">
      <div style="font-size:18px;font-weight:700;margin-bottom:12px">📊 Unit Rankings (by Save)</div>
      ${renderUnitRankings(summary.savedUnitRankings)}
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
