import express from "express";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_BASE = "https://last-story-app.fly.dev";
const TOKEN = process.env.CHARACTER_TOKEN;
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

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

// 길드원 스펙 시트: { [길드멤버]: {...필드} }. 게임 API와 무관하게 길드원이 직접 입력하는
// 값이라, 닉네임(길드멤버) 자체를 키로 쓴다 — market-tracker 거래 게시판과 같은 방식으로
// 별도 로그인 없이 이름만으로 자기 줄을 등록/수정한다.
const SPECS_FILE = path.join(DATA_DIR, "member_specs.json");
const SPEC_FIELDS = [
  "직업",
  "길드보스경",
  "룬물마공합",
  "펫물마공합",
  "펫등급",
  "펫옵션",
  "물마공합",
  "단일합",
  "악마의눈",
  "오오라",
  "무기템이름",
  "무기강화",
  "투구템이름",
  "투구강화",
  "갑옷템이름",
  "갑옷강화",
  "신발템이름",
  "신발강화",
  "반지템이름",
  "반지강화",
  "목걸이템이름",
  "목걸이강화",
  "귀걸이소켓갯수",
  "망토발카갯수",
];

function loadSpecs() {
  try {
    return JSON.parse(fs.readFileSync(SPECS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveSpecs(data) {
  try {
    fs.writeFileSync(SPECS_FILE, JSON.stringify(data));
  } catch (err) {
    console.error("[member-specs] 저장 실패:", err);
  }
}

let memberSpecs = loadSpecs();

if (!ADMIN_PASSWORD) {
  console.log("[member-specs] ADMIN_PASSWORD 환경변수가 없어 관리자 열람 기능이 꺼져있습니다.");
}

// 비밀번호는 평문으로 저장하지 않는다 — scrypt(내장 crypto)로 해시+솔트해서 저장.
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  if (!password || !salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(check, "hex"), Buffer.from(hash, "hex"));
}

// 작성자 본인 비밀번호이거나(있는 경우) 관리자 비밀번호(설정된 경우)면 통과
function canAccess(entry, password) {
  if (ADMIN_PASSWORD && password === ADMIN_PASSWORD) return true;
  if (entry && verifyPassword(password, entry.salt, entry.hash)) return true;
  return false;
}

function publicEntry(entry) {
  const { salt, hash, ...rest } = entry;
  return rest;
}

const app = express();
app.use(express.json());

app.get("/api/guild-boss-log", (req, res) => {
  res.json({ log });
});

// 이름 목록만 공개 — 스탯 상세는 본인/관리자 비밀번호로 확인해야 보인다
app.get("/api/member-specs", (req, res) => {
  res.json({ names: Object.keys(memberSpecs) });
});

app.post("/api/member-specs/:name/view", (req, res) => {
  const name = req.params.name.trim();
  const entry = memberSpecs[name];
  if (!entry) return res.status(404).json({ error: "등록된 스펙이 없습니다." });
  if (!canAccess(entry, req.body.password)) {
    return res.status(403).json({ error: "비밀번호가 틀렸습니다." });
  }
  res.json({ ok: true, name, entry: publicEntry(entry) });
});

app.put("/api/member-specs/:name", (req, res) => {
  const name = req.params.name.trim();
  if (!name) return res.status(400).json({ error: "길드멤버 이름이 필요합니다." });

  const existing = memberSpecs[name];
  const newPassword = req.body.newPassword;

  if (existing) {
    if (!canAccess(existing, req.body.password)) {
      return res.status(403).json({ error: "비밀번호가 틀렸습니다." });
    }
  } else {
    if (!newPassword) {
      return res.status(400).json({ error: "처음 등록할 땐 비밀번호를 설정해야 합니다." });
    }
  }

  const entry = {};
  for (const field of SPEC_FIELDS) {
    const value = req.body[field];
    entry[field] = typeof value === "string" ? value.trim() : value ?? "";
  }
  // 비밀번호를 새로 설정하려는 경우에만 해시를 갱신, 아니면 기존 해시 유지
  if (newPassword) {
    const { salt, hash } = hashPassword(newPassword);
    entry.salt = salt;
    entry.hash = hash;
  } else {
    entry.salt = existing.salt;
    entry.hash = existing.hash;
  }

  memberSpecs[name] = entry;
  saveSpecs(memberSpecs);
  res.json({ ok: true, name, entry: publicEntry(entry) });
});

app.delete("/api/member-specs/:name", (req, res) => {
  const name = req.params.name.trim();
  const existing = memberSpecs[name];
  if (!existing) return res.status(404).json({ error: "등록된 스펙이 없습니다." });
  if (!canAccess(existing, req.body.password)) {
    return res.status(403).json({ error: "비밀번호가 틀렸습니다." });
  }
  delete memberSpecs[name];
  saveSpecs(memberSpecs);
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
  console.log(`[guild-boss-log] 서버 시작 (포트 ${PORT}) — 매일 새벽 5:58(KST)에 자동 기록`);
});
