const DEFAULT_SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1rjCnH2ShBhf4Ze8QmXzu4jmBVCt-t6QT1_AjMxHcV1Y/gviz/tq?tqx=out:csv&sheet=Form%20Responses%201";

let cachedRows = null;
let lastFetchTime = 0;
const CACHE_MS = 60 * 1000;

function splitCsvLine(line) {
  const cols = [];
  let cell = "";
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
    } else if (ch === "," && !quoted) {
      cols.push(cell.trim());
      cell = "";
    } else {
      cell += ch;
    }
  }

  cols.push(cell.trim());
  return cols;
}

function toNumber(val) {
  if (val === undefined || val === null) return null;
  const cleaned = String(val).replace(",", ".").trim();
  if (!cleaned || cleaned.toLowerCase() === "n/a") return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function isYesValue(val) {
  if (!val) return false;
  const v = String(val).trim().toLowerCase();
  return v === "yes" || v === "y" || v === "true" || v === "1" || v.startsWith("yes");
}

function calcZStats(zList) {
  const valid = zList.filter((z) => typeof z === "number" && Number.isFinite(z));
  if (valid.length === 0) return null;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const avg = valid.reduce((acc, v) => acc + v, 0) / valid.length;
  return { count: valid.length, min, max, avg };
}

function getChoiceTrendText(rows) {
  if (!rows || rows.length === 0) return "N/A";
  const firstYes = rows.filter((r) => r.isFirstChoice).length;
  const firstNo = rows.length - firstYes;
  if (firstYes > firstNo) {
    return `Most students chose First Choice (${firstYes}/${rows.length})`;
  }
  if (firstNo > firstYes) {
    return `Most students chose Not First Choice (${firstNo}/${rows.length})`;
  }
  return `Equal split: First Choice & Not First Choice (${firstYes}/${rows.length})`;
}

function buildStreamAverages(rows) {
  const map = new Map();

  for (const r of rows) {
    const streamName = (r.stream || "").trim();
    if (!streamName || streamName.toLowerCase() === "n/a") continue;
    if (!map.has(streamName)) {
      map.set(streamName, []);
    }
    if (typeof r.zScore === "number" && Number.isFinite(r.zScore)) {
      map.get(streamName).push(r.zScore);
    }
  }

  const result = [];
  for (const [streamName, zList] of map.entries()) {
    const stats = calcZStats(zList);
    result.push({
      stream: streamName,
      avg: stats ? stats.avg : null
    });
  }

  return result;
}

function extractDegreeAndChoice(headers, row) {
  const degreeCols = headers
    .map((h, i) => (h.includes("degree") || h.includes("course") || h.includes("programme") ? i : -1))
    .filter((i) => i !== -1);

  const firstChoiceFlagIdx = headers.findIndex(
    (h) =>
      h.includes("first choice") ||
      h.includes("1st choice") ||
      h.includes("is this your first") ||
      h.includes("first preference") ||
      h.includes("1st preference")
  );

  const selectedDegree =
    degreeCols
      .map((colIdx) => (row[colIdx] || "").trim())
      .find((val) => val.length > 0 && val.toLowerCase() !== "yes" && val.toLowerCase() !== "no") ||
    "N/A";

  const flagRaw = firstChoiceFlagIdx >= 0 ? (row[firstChoiceFlagIdx] || "").trim() : "";
  const isFirstChoice = firstChoiceFlagIdx >= 0 ? isYesValue(flagRaw) : true;

  return {
    degree: selectedDegree,
    isFirstChoice
  };
}

function csvToRecords(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());

  const idxStream = headers.findIndex((h) => h.includes("stream"));
  const idxYear = headers.findIndex((h) => h.includes("year"));
  const idxIntake = headers.findIndex((h) => h.includes("intake"));
  const idxZ = headers.findIndex((h) => h.includes("z"));
  const idxCampus = headers.findIndex((h) => h.includes("campus"));

  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const row = splitCsvLine(lines[i]);

    const { degree, isFirstChoice } = extractDegreeAndChoice(headers, row);
    const stream = (idxStream >= 0 ? row[idxStream] : "").trim() || "N/A";
    const year = (idxYear >= 0 ? row[idxYear] : "").trim() || "N/A";
    const intake = (idxIntake >= 0 ? row[idxIntake] : "").trim() || "N/A";
    const zScore = toNumber(idxZ >= 0 ? row[idxZ] : null);
    const campus = (idxCampus >= 0 ? row[idxCampus] : "").trim() || "N/A";

    const hasAnyData =
      degree !== "N/A" ||
      stream !== "N/A" ||
      year !== "N/A" ||
      intake !== "N/A" ||
      zScore !== null ||
      campus !== "N/A";

    if (hasAnyData) {
      records.push({
        degree,
        isFirstChoice,
        stream,
        year,
        intake,
        zScore,
        campus
      });
    }
  }

  return records;
}

async function getStudentRecords() {
  const now = Date.now();
  if (cachedRows && now - lastFetchTime < CACHE_MS) {
    return cachedRows;
  }

  const sheetCsvUrl = (process.env.GOOGLE_SHEET_CSV_URL || DEFAULT_SHEET_CSV_URL).trim();

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
    console.error("[cutoffFeature] Failed to fetch CSV:", err.message);
    return cachedRows || [];
  }
}

function parseQuery(input) {
  const text = String(input || "").trim();
  if (!text) {
    return { keyword: "", zScore: null };
  }

  const wholeZ = toNumber(text);
  if (wholeZ !== null && /^[+-]?\d+([.,]\d+)?$/.test(text)) {
    return { keyword: "", zScore: wholeZ };
  }

  const parts = text.split(/\s+/);
  const lastToken = parts[parts.length - 1];
  const lastZ = toNumber(lastToken);

  if (parts.length > 1 && lastZ !== null && /^[+-]?\d+([.,]\d+)?$/.test(lastToken)) {
    return {
      keyword: parts.slice(0, -1).join(" ").toLowerCase(),
      zScore: lastZ
    };
  }

  return { keyword: text.toLowerCase(), zScore: null };
}

async function buildCutoffReply(rawArgs) {
  const { keyword, zScore } = parseQuery(rawArgs);

  if (!keyword && zScore === null) {
    return [
      "📌 *IFSLS Cutoff & Z-Score Check*",
      "",
      "• *Campus / Degree:* `/cutoff HORIZON`",
      "• *By Z-Score:* `/cutoff 0.578` or `/zcheck 0.578`",
      "• *Campus + Z-Score:* `/cutoff HORIZON 0.578`",
      "",
      "⚠️ _Peer-submitted preference trend only; not an official cutoff._"
    ].join("\n");
  }

  const records = await getStudentRecords();
  if (records.length === 0) {
    return "📭 Sheet එකෙන් දත්ත ලබාගන්න බැරි වුණා හෝ තාම form submissions නැහැ.";
  }

  let filtered = records;
  if (keyword) {
    filtered = records.filter((r) =>
      [r.campus, r.degree, r.stream, r.year, r.intake]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }

  if (filtered.length === 0) {
    return `❌ *"${rawArgs.trim()}"* සඳහා records හමු වුණේ නැහැ.\n\n⚠️ _Peer-submitted preference trend only; not an official cutoff._`;
  }

  const campuses = [...new Set(filtered.map((r) => r.campus).filter((c) => c !== "N/A"))];
  const campusLabel = campuses.length > 0 ? campuses.join(", ") : rawArgs.trim() || "All Campuses";

  const intakes = [...new Set(filtered.map((r) => r.intake).filter((i) => i !== "N/A"))];
  const intakeLabel = intakes.length > 0 ? intakes.join(", ") : "N/A";

  const allStats = calcZStats(filtered.map((r) => r.zScore));
  const firstChoiceRows = filtered.filter((r) => r.isFirstChoice);
  const firstChoiceStats = calcZStats(firstChoiceRows.map((r) => r.zScore));
  const choiceTrend = getChoiceTrendText(filtered);

  let targetRows = filtered;
  let degreeTitle = "🎓 *Matching Degrees:*";

  if (zScore !== null) {
    targetRows = filtered
      .filter((r) => typeof r.zScore === "number" && r.zScore <= zScore && r.degree !== "N/A")
      .sort((a, b) => b.zScore - a.zScore);
    degreeTitle = `🎓 *Matching Degrees (Z ≤ ${zScore.toFixed(4)}):*`;
  }

  const degreesToShow = [
    ...new Set(targetRows.map((r) => r.degree).filter((d) => d !== "N/A"))
  ];

  const streamAverages = buildStreamAverages(targetRows);

  const lines = [
    `🏫 *Campus:* ${campusLabel}`,
    "",
    degreeTitle,
    degreesToShow.length > 0
      ? degreesToShow.slice(0, 8).map((d) => `• ${d}`).join("\n") +
        (degreesToShow.length > 8 ? `\n• ... (+${degreesToShow.length - 8} more)` : "")
      : "• No matching degrees found",
    "",
    "📚 *A/L Stream Average:*",
    streamAverages.length > 0
      ? streamAverages
          .map((s) => `• ${s.stream}: ${s.avg !== null ? s.avg.toFixed(4) : "N/A"}`)
          .join("\n")
      : "• N/A",
    "",
    `📈 *Z-Score Range:* ${allStats ? `${allStats.min.toFixed(4)} – ${allStats.max.toFixed(4)}` : "N/A"}`,
    `📊 *Z-Score Average:* ${allStats ? allStats.avg.toFixed(4) : "N/A"}`,
    `⭐ *First Choice Average:* ${firstChoiceStats ? firstChoiceStats.avg.toFixed(4) : "N/A"}`,
    `📌 *Preference Trend:* ${choiceTrend}`,
    `🗓️ *IFSLS Intake:* ${intakeLabel}`,
    "",
    "⚠️ _Peer-submitted preference trend only; not an official cutoff._"
  ];

  return lines.join("\n");
}

async function handleCutoffFeature(msg) {
  const raw = (msg.body || "").trim();
  const lower = raw.toLowerCase();

  if (lower === "/cutoff" || lower.startsWith("/cutoff ")) {
    const args = raw.slice("/cutoff".length).trim();
    const reply = await buildCutoffReply(args);
    await msg.reply(reply);
    return true;
  }

  if (lower === "/zcheck" || lower.startsWith("/zcheck ")) {
    const args = raw.slice("/zcheck".length).trim();
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
