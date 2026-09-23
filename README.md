# 마지막이야기 길드보스 전체 순위 기록

매일 새벽 5시 58분(KST, 초기화 1분 전)에 길드보스 전체 순위(길드별 누적 데미지/MVP)를
자동으로 스냅샷 찍어 저장하는 작은 웹 서비스입니다. `laststory-market-tracker`(시세
트래커)와는 완전히 별개 프로젝트입니다.

## 1. 토큰 얻기 (직접 해야 하는 부분)

이 서버가 길드보스 순위 데이터를 가져오려면 로그인 토큰이 필요합니다. 토큰은 게임에
로그인한 브라우저의 로컬 저장소에만 있고, 자동으로 꺼낼 수 없게 막혀 있어서(민감 정보라
도구가 값 노출을 차단합니다) 직접 복사해야 합니다.

전체 순위 조회 API는 **길드원이면 어느 캐릭터의 토큰이든** 됩니다(본인 계정일 필요 없음,
실측 확인함) — 부캐 토큰을 쓰셔도 됩니다.

1. 크롬/엣지에서 `https://last-story-app.fly.dev` 로그인
2. F12 → **Application(애플리케이션)** 탭 → 왼쪽 **Local Storage** → `https://last-story-app.fly.dev` 클릭
3. 목록에서 `token` 항목의 **Value** 전체를 복사

이 토큰은 **30일간 유효**합니다. 만료되면 같은 방법으로 다시 복사해서 환경변수를 갱신하면 됩니다.

⚠️ 이 토큰은 로그인 비밀번호나 마찬가지이니 공개 저장소나 채팅에 붙여넣지 말고, 아래
환경변수로만 설정하세요.

## 2. 로컬에서 실행

```bash
npm install
cp .env.example .env
# .env 파일 열어서 CHARACTER_TOKEN 값 채워넣기
npm start
```

`http://localhost:3000` 접속. 아직 스냅샷이 없으면(당일 5:58 전) 빈 화면이 나오는 게 정상입니다.

## 3. Railway로 배포

1. https://railway.app 가입/로그인
2. 이 폴더를 GitHub 저장소로 올리기 (또는 Railway CLI로 직접 배포도 가능)
3. Railway에서 **New Project → Deploy from GitHub repo** 선택, 이 저장소 선택
4. 프로젝트 **Variables** 탭에서 `CHARACTER_TOKEN` 환경변수 추가 (1단계에서 복사한 값)
5. (선택) 재배포해도 기록이 안 날아가게 하려면 Railway에서 Volume을 추가하고
   `DATA_DIR` 환경변수로 마운트 경로를 지정 — 안 해도 서비스 자체는 정상 동작하지만,
   재배포/재시작 시 그동안 쌓인 기록이 초기화됩니다.
6. 배포가 끝나면 Railway가 발급하는 `xxx.up.railway.app` 주소로 확인 가능

### Railway CLI로 배포하는 경우 (GitHub 없이)

```bash
npm install -g @railway/cli
railway login
railway init
railway variables set CHARACTER_TOKEN=복사한_토큰값
railway up
```

## 4. (선택) 길드원 스펙 열람 관리자 비밀번호

"길드원 스펙" 탭은 이름 목록만 공개되고, 각 줄의 상세 내용은 등록할 때 본인이 정한
비밀번호를 입력해야 보입니다. 관리자(본인)가 모든 줄을 다 보고 싶으면 Railway
Variables에 `ADMIN_PASSWORD`를 추가하세요 — 이 값을 어느 줄에 입력하든 그 줄이 열립니다.

- 설정 안 하면 관리자 전용 열람 기능만 꺼지고, 각자 본인 스펙 등록/열람은 정상 동작합니다.
- 길드원 개인 비밀번호는 평문 저장이 아니라 해시(scrypt)로 저장됩니다.

## 확인 방법

- 배포 주소로 접속하면 최근 스냅샷 날짜를 드롭다운으로 골라 순위표를 볼 수 있습니다.
- `GET /api/guild-boss-log`로 원본 JSON(최근 180일치)도 조회 가능합니다.
- 서버 로그에 `[guild-boss-log] 스냅샷 실패`가 뜨면 토큰이 만료된 신호입니다 — 1단계 방법으로
  다시 복사해서 Railway Variables의 `CHARACTER_TOKEN` 값을 갱신하세요.
