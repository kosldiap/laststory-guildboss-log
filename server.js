import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_BASE = "https://last-story-app.fly.dev";
const TOKEN = process.env.CHARACTER_TOKEN;
const PORT = process.env.PORT || 3000;

if (!TOKEN) {
  console.error("CHARACTER_TOKEN 환경변수가 설정되지 않았습니다. 서버를 시작할 수 없습니다.");
  process.exit(1);
}

// Railway Volume을 이 경로에 마운트하면 재배포해도 기록이 유지된다
const DATA_DIR = process.env.DATA_DIR || __dirname;
const LOG_FILE = path.join(DATA_DIR, "guild_boss_log.json");
const LOG_MAX_ENTRIES = 180;

console.log(`[guild-boss-log] DATA_DIR: ${DATA_DIR}`);
try {
  fs.accessSync(DATA_DIR, fs.constants.W_OK);
} catch (err) {
  console.error(`[guild-boss-log] ${DATA_DIR} 쓰기 불가능! 볼륨이 이 경로에 마운트되어 있는지 확인하세요.`, err.message);
}

function loadLog() {
  try {
    return JSON.parse(fs.readFileSync(LOG_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveLog(data) {
  try {
    fs.writeFileSync(LOG_FILE, JSON.stringify(data));
  } catch (err) {
    console.error("[guild-boss-log] 저장 실패:", err);
  }
}

let log = loadLog();

function getKstNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  return {
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

async function snapshotRankings(dateStr) {
  try {
    const res = await fetch(`${API_BASE}/api/guild-boss/rankings`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!res.ok) throw new Error(`길드보스 API 응답 오류: ${res.status}`);
    const rankings = await res.json();
    log.push({ date: dateStr, capturedAt: new Date().toISOString(), rankings });
    if (log.length > LOG_MAX_ENTRIES) log = log.slice(-LOG_MAX_ENTRIES);
    saveLog(log);
    console.log(`[guild-boss-log] ${dateStr} 스냅샷 저장 완료 (${log.length}일치 보관 중)`);
  } catch (err) {
    console.error("[guild-boss-log] 스냅샷 실패:", err instanceof Error ? err.message : err);
  }
}

let lastSnapshotDate = null; // "YYYY-MM-DD" (KST) — 이미 오늘자 기록했는지 확인용

setInterval(() => {
  const { dateStr, hour, minute } = getKstNow();
  if (hour === 5 && minute === 58 && lastSnapshotDate !== dateStr) {
    lastSnapshotDate = dateStr;
    snapshotRankings(dateStr);
  }
}, 60 * 1000);

const app = express();

app.get("/api/guild-boss-log", (req, res) => {
  res.json({ log });
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`[guild-boss-log] 서버 시작 (포트 ${PORT}) — 매일 새벽 5:58(KST)에 자동 기록`);
});
