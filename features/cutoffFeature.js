// features/cutoffFeature.js

let cachedRows = null;
let lastFetchTime = 0;
const CACHE_MS = 60 * 1000; // 60-second cache so new submissions appear quickly

/**
 * Splits a single CSV row while respecting quoted commas and escaped quotes.
 */
function splitCsvLine(line) {
  const cols = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (quoted && next === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      cols.push(cell.trim());
      cell = '';
    } else {
      cell += ch;
    }
  }

  cols.push(cell.trim());
  return cols;
}

/**
 * Converts a Z-score string (supporting both "." and ",") into a finite number.
 */
function toNumber(val) {
  if (val === undefined || val === null) return null;
  const cleaned = String(val).replace(',', '.').trim();
  if (!cleaned || cleaned.toLowerCase() === 'n/a') return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

/**
 * Parses CSV rows into normalized student preference records.
 * Handles multiple "Selected Degree" columns created by multi-section branching.
 */
function csvToRecords(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());

  const idxName = headers.findIndex((h) => h.includes('name'));
  const idxStream = headers.findIndex((h) => h.includes('stream'));
  const idxYear = headers.findIndex((h) => h.includes('year'));
  const idxIntake = headers.findIndex((h) => h.includes('intake'));
  const idxZ = headers.findIndex((h) => h.includes('z'));
  const idxCampus = headers.findIndex((h) => h.includes('campus'));

  const degreeCols = headers
    .map((h, i) => (h.includes('degree') ? i : -1))
    .filter((i) => i !== -1);

  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const row = splitCsvLine(lines[i]);

    const degree =
      degreeCols
        .map((colIdx) => (row[colIdx] || '').trim())
        .find((val) => val.length > 0) || 'N/A';

    const name = (idxName >= 0 ? row[idxName] : '').trim() || 'Anonymous';
    const stream = (idxStream >= 0 ? row[idxStream] : '').trim() || 'N/A';
    const year = (idxYear >= 0 ? row[idxYear] : '').trim() || 'N/A';
    const intake = (idxIntake >= 0 ? row[idxIntake] : '').trim() || 'N/A';
    const zScore = toNumber(idxZ >= 0 ? row[idxZ] : null);
    const campus = (idxCampus >= 0 ? row[idxCampus] : '').trim() || 'N/A';

    const hasAnyData =
      name !== 'Anonymous' ||
      stream !== 'N/A' ||
      year !== 'N/A' ||
      intake !== 'N/A' ||
      zScore !== null ||
      campus !== 'N/A' ||
      degree !== 'N/A';

    if (hasAnyData) {
      records.push({ name, stream, year, intake, zScore, campus, degree });
    }
  }

  return records;
}

/**
 * Fetches student records from the public Google Sheet CSV URL with caching.
 */
async function getStudentRecords() {
  const now = Date.now();
  if (cachedRows && now - lastFetchTime < CACHE_MS) {
    return cachedRows;
  }

  const sheetCsvUrl = (process.env.GOOGLE_SHEET_CSV_URL || '').trim();
  if (!sheetCsvUrl) {
    return [];
  }

  try {
    const res = await fetch(sheetCsvUrl);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const csvText = await res.text();
    cachedRows = csvToRecords(csvText);
    lastFetchTime = now;
    return cachedRows;
  } catch (err) {
    console.error('[cutoffFeature] Failed to fetch CSV:', err.message);
    return cachedRows || [];
  }
}

/**
 * Parses command input into an optional keyword and an optional Z-score.
 * Supports:
 * - "/cutoff SLIIT - Malabe" -> { keyword: 'sliit - malabe', zScore: null }
 * - "/cutoff 1.5400"         -> { keyword: '', zScore: 1.54 }
 * - "/cutoff SLIIT 1.5400"   -> { keyword: 'sliit', zScore: 1.54 }
 */
function parseQuery(input) {
  const text = String(input || '').trim();
  if (!text) {
    return { keyword: '', zScore: null };
  }

  const wholeZ = toNumber(text);
  if (wholeZ !== null && /^[+-]?\d+([.,]\d+)?$/.test(text)) {
    return { keyword: '', zScore: wholeZ };
  }

  const parts = text.split(/\s+/);
  const lastToken = parts[parts.length - 1];
  const lastZ = toNumber(lastToken);

  if (parts.length > 1 && lastZ !== null && /^[+-]?\d+([.,]\d+)?$/.test(lastToken)) {
    return {
      keyword: parts.slice(0, -1).join(' ').toLowerCase(),
      zScore: lastZ
    };
  }

  return { keyword: text.toLowerCase(), zScore: null };
}

/**
 * Builds the WhatsApp reply for `/cutoff` and `/zcheck`.
 */
async function buildCutoffReply(rawArgs) {
  const { keyword, zScore } = parseQuery(rawArgs);

  if (!keyword && zScore === null) {
    return [
      '📌 *IFSLS Cutoff & Z-Score Check*',
      '• By Campus / Degree / Intake: `/cutoff SLIIT - Malabe`',
      '• By Z-Score: `/cutoff 1.5400` or `/zcheck 1.5400`',
      '• Campus + Z-Score: `/cutoff SLIIT 1.5400`',
      '',
      '⚠️ _Peer-submitted preference trend only; not an official cutoff._'
    ].join('\n');
  }

  const sheetCsvUrl = (process.env.GOOGLE_SHEET_CSV_URL || '').trim();
  if (!sheetCsvUrl) {
    return '⏳ Live Google Sheet CSV URL is not configured yet. Once linked, live results will appear here.';
  }

  const records = await getStudentRecords();
  if (records.length === 0) {
    return '📭 No form submissions recorded yet. Once students submit the form, data will sync automatically.';
  }

  let filtered = records;
  if (keyword) {
    filtered = records.filter((r) =>
      [r.campus, r.degree, r.stream, r.year, r.intake]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    );
  }

  // Mode 1: Keyword only (Campus, Degree, Stream, Year, or Intake)
  if (keyword && zScore === null) {
    if (filtered.length === 0) {
      return `❌ No submissions found matching *"${rawArgs.trim()}"*.\n⚠️ _Peer-submitted preference trend only; not an official cutoff._`;
    }

    const zList = filtered.map((r) => r.zScore).filter((z) => typeof z === 'number');
    const degrees = [...new Set(filtered.map((r) => r.degree).filter((d) => d !== 'N/A'))];
    const intakes = [...new Set(filtered.map((r) => r.intake).filter((i) => i !== 'N/A'))];

    let zLine = '• *Z-Score Range:* No Z-scores submitted yet';
    if (zList.length > 0) {
      const min = Math.min(...zList);
      const max = Math.max(...zList);
      const avg = zList.reduce((acc, v) => acc + v, 0) / zList.length;
      zLine = `• *Z-Score Range:* ${min.toFixed(4)} – ${max.toFixed(4)} (Avg: ${avg.toFixed(4)})`;
    }

    return [
      `📊 *IFSLS Peer Trend* — \`${rawArgs.trim()}\``,
      `• *Submissions:* ${filtered.length}`,
      zLine,
      intakes.length > 0 ? `• *Intakes:* ${intakes.join(', ')}` : null,
      degrees.length > 0
        ? `• *Degrees (${degrees.length}):* ${degrees.slice(0, 6).join(' | ')}${degrees.length > 6 ? ' ...' : ''}`
        : null,
      '',
      '⚠️ _Peer-submitted preference trend only; not an official cutoff._'
    ]
      .filter(Boolean)
      .join('\n');
  }

  // Mode 2 & 3: Z-score provided (with or without keyword filter)
  const withZ = filtered.filter((r) => typeof r.zScore === 'number');
  if (withZ.length === 0) {
    return `❌ No Z-score records found for *"${rawArgs.trim()}"*.\n⚠️ _Peer-submitted preference trend only; not an official cutoff._`;
  }

  const zValues = withZ.map((r) => r.zScore);
  const min = Math.min(...zValues);
  const max = Math.max(...zValues);
  const avg = zValues.reduce((acc, v) => acc + v, 0) / zValues.length;

  const matching = withZ
    .filter((r) => r.zScore <= zScore)
    .sort((a, b) => b.zScore - a.zScore);

  let status = 'Within the peer Z-score range recorded so far.';
  if (zScore >= max) {
    status = 'At or above the highest peer Z-score in this group.';
  } else if (zScore < min) {
    status = 'Below the lowest peer Z-score recorded so far in this group.';
  }

  const lines = [
    `🎯 *Z-Score Check* — \`${zScore.toFixed(4)}\`${keyword ? ` (\`${keyword}\`)` : ''}`,
    `• *Peer Z Range:* ${min.toFixed(4)} – ${max.toFixed(4)} (Avg: ${avg.toFixed(4)})`,
    `• *Status:* ${status}`,
    `• *Matching / Within-Reach Entries:* ${matching.length} / ${withZ.length}`,
    '',
    '*Matching Peer Entries:*'
  ];

  if (matching.length === 0) {
    lines.push('• No peer entries at or below this Z-score in the current dataset.');
  } else {
    for (const item of matching.slice(0, 6)) {
      lines.push(
        `• *${item.campus}* — ${item.degree} (Z: ${item.zScore.toFixed(4)} | ${item.intake})`
      );
    }
  }

  lines.push('', '⚠️ _Peer-submitted preference trend only; not an official cutoff._');
  return lines.join('\n');
}

/**
 * Handles `/cutoff` and `/zcheck` messages from `whatsapp-web.js`.
 */
async function handleCutoffFeature(msg) {
  const raw = (msg.body || '').trim();
  const lower = raw.toLowerCase();

  if (lower === '/cutoff' || lower.startsWith('/cutoff ')) {
    const args = raw.slice('/cutoff'.length).trim();
    const reply = await buildCutoffReply(args);
    await msg.reply(reply);
    return true;
  }

  if (lower === '/zcheck' || lower.startsWith('/zcheck ')) {
    const args = raw.slice('/zcheck'.length).trim();
    const reply = await buildCutoffReply(args);
    await msg.reply(reply);
    return true;
  }

  return false;
}

module.exports = {
  handleCutoffFeature,
  buildCutoffReply
};



