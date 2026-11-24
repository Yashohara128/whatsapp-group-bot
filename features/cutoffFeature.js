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

function getChoiceSummary(rows) {
  if (!rows || rows.length === 0) {
    return {
      yesCount: 0,
      noCount: 0,
      yesStats: null,
      noStats: null,
      majorityText: "No data"
    };
  }

  const yesRows = rows.filter((r) => r.isFirstChoice);
  const noRows = rows.filter((r) => !r.isFirstChoice);

  const yesStats = calcZStats(yesRows.map((r) => r.zScore));
  const noStats = calcZStats(noRows.map((r) => r.zScore));

  let majorityText = `Equal split (${yesRows.length} Yes / ${noRows.length} No)`;
  if (yesRows.length > noRows.length) {
    majorityText = `Most students: First Choice (${yesRows.length}/${rows.length} Yes)`;
  } else if (noRows.length > yesRows.length) {
    majorityText = `Most students: Not First Choice (${noRows.length}/${rows.length} No)`;
  }

  return {
    yesCount: yesRows.length,
    noCount: noRows.length,
    yesStats,
    noStats,
    majorityText
  };
}

function buildBranchDegreeBlocks(rows) {
  const branchMap = new Map();

  for (const r of rows) {
    const rawBranch = (r.campus || "").trim();
    const branchLabel = rawBranch && rawBranch.toLowerCase() !== "n/a" ? rawBranch : "General / Unspecified";
    const branchKey = branchLabel.toLowerCase();

    if (!branchMap.has(branchKey)) {
      branchMap.set(branchKey, {
        branch: branchLabel,
        allZ: [],
        degrees: new Map()
      });
    }

    const branchEntry = branchMap.get(branchKey);
    if (typeof r.zScore === "number" && Number.isFinite(r.zScore)) {
      branchEntry.allZ.push(r.zScore);
    }

    const rawDegree = (r.degree || "").trim();
    const degreeLabel = rawDegree && rawDegree.toLowerCase() !== "n/a" ? rawDegree : "Unspecified Degree";
    const degreeKey = degreeLabel.toLowerCase();

    if (!branchEntry.degrees.has(degreeKey)) {
      branchEntry.degrees.set(degreeKey, {
        degree: degreeLabel,
        zList: []
      });
    }

    if (typeof r.zScore === "number" && Number.isFinite(r.zScore)) {
      branchEntry.degrees.get(degreeKey).zList.push(r.zScore);
    }
  }

  const blocks = [];
  for (const branchEntry of branchMap.values()) {
    const bStats = calcZStats(branchEntry.allZ);
    const bAvgStr = bStats ? bStats.avg.toFixed(4) : "N/A";
    const blockLines = [`• *${branchEntry.branch}* (Branch Avg: ${bAvgStr})`];

    for (const degEntry of branchEntry.degrees.values()) {
      const dStats = calcZStats(degEntry.zList);
      const dAvgStr = dStats ? `*${dStats.avg.toFixed(4)}* (n=${dStats.count})` : "N/A";
      blockLines.push(`   ◦ ${degEntry.degree}: ${dAvgStr}`);
    }

    blocks.push(blockLines.join("\n"));
  }

  return blocks;
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
  const hasExplicitFlag = firstChoiceFlagIdx >= 0 && flagRaw.length > 0;
  const isFirstChoice = hasExplicitFlag ? isYesValue(flagRaw) : true;

  return {
    degree: selectedDegree,
    isFirstChoice,
    hasExplicitFlag
  };
}

function extractCampusLocation(row, idxCampus, idxLocation) {
  const campusVal = idxCampus >= 0 ? (row[idxCampus] || "").trim() : "";
  const locVal = idxLocation >= 0 && idxLocation !== idxCampus ? (row[idxLocation] || "").trim() : "";

  if (campusVal && locVal && !campusVal.toLowerCase().includes(locVal.toLowerCase())) {
    return `${campusVal} - ${locVal}`;
  }
  return campusVal || locVal || "N/A";
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
  const idxCampus = headers.findIndex((h) => h.includes("campus") || h.includes("institute") || h.includes("university"));
  const idxLocation = headers.findIndex((h) => h.includes("location") || h.includes("branch") || h.includes("city"));

  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const row = splitCsvLine(lines[i]);

    const { degree, isFirstChoice, hasExplicitFlag } = extractDegreeAndChoice(headers, row);
    const stream = (idxStream >= 0 ? row[idxStream] : "").trim() || "N/A";
    const year = (idxYear >= 0 ? row[idxYear] : "").trim() || "N/A";
    const intake = (idxIntake >= 0 ? row[idxIntake] : "").trim() || "N/A";
    const zScore = toNumber(idxZ >= 0 ? row[idxZ] : null);
    const campus = extractCampusLocation(row, idxCampus, idxLocation);

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
        hasExplicitFlag,
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

function resolveCampusTitle(keyword, filtered) {
  const rawCampuses = [...new Set(filtered.map((r) => r.campus).filter((c) => c && c.toLowerCase() !== "n/a"))];
  if (keyword) {
    const upperKw = keyword.toUpperCase();
    const matchedPrefixes = rawCampuses.filter((c) => c.toUpperCase().includes(upperKw));
    if (matchedPrefixes.length > 1) {
      const firstWordMatches = matchedPrefixes.map((c) => c.split(/[\s-]+/)[0]).filter(Boolean);
      const uniqueFirst = [...new Set(firstWordMatches.map((w) => w.toUpperCase()))];
      if (uniqueFirst.length === 1) {
        return uniqueFirst[0];
      }
    }
  }
  return rawCampuses.length > 0 ? rawCampuses.join(", ") : keyword ? keyword.toUpperCase() : "All Campuses";
}

async function buildCutoffReply(rawArgs) {
  const { keyword, zScore } = parseQuery(rawArgs);

  if (!keyword && zScore === null) {
    return [
      "📌 *IFSLS Cutoff & Z-Score Check*",
      "",
      "• By Campus: `/cutoff sliit` or `/cutoff icbt`",
      "• By Z-Score: `/cutoff 0.578` or `/zcheck 0.578`",
      "• Campus + Z-Score: `/cutoff sliit 0.578`",
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

  let targetRows = filtered;
  if (zScore !== null) {
    targetRows = filtered.filter((r) => typeof r.zScore === "number" && r.zScore <= zScore);
  }

  const rowsForBreakdown = targetRows.length > 0 ? targetRows : filtered;
  const campusTitle = resolveCampusTitle(keyword, rowsForBreakdown);
  const branchBlocks = buildBranchDegreeBlocks(rowsForBreakdown);

  const intakes = [...new Set(rowsForBreakdown.map((r) => r.intake).filter((i) => i && i.toLowerCase() !== "n/a"))];
  const intakeLabel = intakes.length > 0 ? intakes.join(", ") : "N/A";

  const allStats = calcZStats(rowsForBreakdown.map((r) => r.zScore));
  const choiceSummary = getChoiceSummary(rowsForBreakdown);

  let firstChoiceLine = "⭐ *First Choice Average:* ";
  if (choiceSummary.yesStats) {
    firstChoiceLine += `*${choiceSummary.yesStats.avg.toFixed(4)}* (${choiceSummary.majorityText})`;
  } else if (choiceSummary.noStats) {
    firstChoiceLine += `No 1st-Choice (Yes) Z-scores yet (${choiceSummary.majorityText})`;
  } else {
    firstChoiceLine += `No Z-scores submitted yet (${choiceSummary.majorityText})`;
  }

  const sections = [
    `🏫 *Campus:* ${campusTitle}`,
    zScore !== null
      ? `📍 *Branches & Degrees (Z ≤ ${zScore.toFixed(4)}):*\n\n${branchBlocks.length > 0 ? branchBlocks.join("\n\n") : "   ◦ No branch or degree records found"}`
      : `📍 *Branches & Degree Z-Score Averages:*\n\n${branchBlocks.length > 0 ? branchBlocks.join("\n\n") : "   ◦ No branch or degree records found"}`,
    `📈 *Z-Score Range:* ${allStats ? `${allStats.min.toFixed(4)} – ${allStats.max.toFixed(4)}` : "N/A"}`,
    `📊 *Z-Score Average:* ${allStats ? allStats.avg.toFixed(4) : "N/A"}`,
    firstChoiceLine,
    `🗓️ *IFSLS Intake:* ${intakeLabel}`,
    "⚠️ _Peer-submitted preference trend only; not an official cutoff._"
  ];

  return sections.join("\n\n");
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
