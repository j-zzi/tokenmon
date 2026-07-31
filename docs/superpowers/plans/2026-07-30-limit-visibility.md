# 세션/주간 한도 가시성 개선 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 패널의 5시간·주간 한도에서 "언제 초기화되는지"가 한눈에 읽히게 만든다.

**Architecture:** 포맷 로직을 `src/panel/format.js` 순수 모듈로 분리해 단위 테스트를 붙이고,
`panel.html`은 색 티어와 마크업만, `panel.js`는 그 둘을 잇는 배선만 담당한다.
IPC 계약(`panelData()`가 넘기는 `{pct, resetsAt}`)은 그대로다.

**Tech Stack:** Electron 43 (renderer, `nodeIntegration: true` / `contextIsolation: false`),
CommonJS, `node:test` + `node:assert/strict`, ESLint 10.

**설계 문서:** `docs/superpowers/specs/2026-07-30-limit-visibility-design.md`

## Global Constraints

- 변경 범위는 `src/panel/` 과 `test/` 로 한정한다. `src/usage/`, `src/main.js`, 펫/말풍선은 건드리지 않는다.
- 커밋 메시지는 `.gitmessage` 규칙을 따른다: `타입(범위): 존댓말 평서문` (마침표 없음).
  이 작업의 범위는 모두 `panel`. 타입은 `feat`(기능) / `style`(포맷·UI) / `test`(테스트) / `docs`(문서).
- 명암비 목표(duo 셀 배경 `#212124` 기준): 남은 시간 ≥ 7:1, 라벨·절대 시각 ≥ 4.5:1.
- UI 문구는 한국어. 색상 리터럴은 소문자 16진수 6자리 (기존 `panel.html` 관례).
- `alertColor()`는 경고 구간이 아니면 빈 문자열을 반환한다. 인라인 스타일에 빈 문자열을 넣어
  CSS 기본색으로 되돌리는 기존 `setRing` 패턴을 그대로 따른다 — 기본색을 JS에 다시 적지 않는다.
- 작업 브랜치는 현재 `feat/agent-status-pokeball`. `.gitignore` / `package.json` /
  `package-lock.json` / `src/main.js` / `assets/icon.icns` 에 커밋되지 않은 선행 변경이 있으니
  **`git add .` 를 쓰지 말고 각 태스크가 명시한 파일만 스테이징한다.**
- 매 태스크 종료 전 `npm run lint` 와 `npm test` 가 모두 통과해야 한다.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `src/panel/format.js` (신규) | 리셋 시각 → 사람이 읽는 문자열. Electron 의존성 없는 순수 함수만 |
| `test/panel-format.test.js` (신규) | 위 모듈의 분기와 경계 |
| `src/panel/panel.html` (수정) | 색 티어(`:root`), duo 마크업/스타일, legend 제거 |
| `src/panel/panel.js` (수정) | `panel-data` 수신 → DOM 반영, 30초 재계산 타이머 |

`panel.js`가 최상단에서 `require('electron')`을 하기 때문에 지금은 어떤 테스트도 붙지 않는다.
포맷 로직만 떼어내면 로직의 위험한 부분(날짜 경계, 단위 분기)이 전부 테스트 아래로 들어온다.
나머지는 DOM 배선이라 눈으로 확인하는 편이 낫다.

**태스크 순서:** 1 → 2 → 3 → 4 → 5. 각 태스크는 끝난 시점에 앱이 정상 동작한다.
Task 5는 Task 3이 만든 `#dot-fh` / `#dot-wk` 를 쓰므로 순서를 바꾸지 않는다.

---

### Task 1: 리셋 포맷 순수 모듈

**Files:**
- Create: `src/panel/format.js`
- Test: `test/panel-format.test.js`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `fmtRemaining(resetsAt: number, now: number) => string` — 밀리초 epoch 두 개를 받아 `'2시간 41분 남음'` 형태
  - `fmtAbsolute(resetsAt: number, now: number) => string` — `'오후 3:45'` / `'내일 오전 9:00'` / `'8/5(수) 오전 9:00'`
  - 둘 다 `module.exports = { fmtRemaining, fmtAbsolute }` 로 내보낸다. Task 4가 이 이름 그대로 쓴다.

**배경:** `now`를 인자로 받는 이유는 테스트 때문이다. 내부에서 `Date.now()`를 부르면
"내일" 판정이 실행 시각에 따라 흔들려 테스트가 불안정해진다.

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`test/panel-format.test.js` 생성:

```js
// toLocaleTimeString이 로컬 타임존에 의존하므로 고정합니다.
// node --test는 파일마다 별도 프로세스라 다른 테스트에 영향을 주지 않습니다.
process.env.TZ = 'Asia/Seoul';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fmtRemaining, fmtAbsolute } = require('../src/panel/format');

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// 2026-07-30(목) 오전 10시
const NOW = new Date('2026-07-30T10:00:00+09:00').getTime();
const at = (iso) => new Date(iso).getTime();

test('이미 지난 리셋 → 곧 리셋', () => {
  assert.equal(fmtRemaining(NOW, NOW), '곧 리셋');
  assert.equal(fmtRemaining(NOW - MIN, NOW), '곧 리셋');
});
test('1분 미만', () => {
  assert.equal(fmtRemaining(NOW + 30_000, NOW), '1분 미만');
});
test('1시간 미만 → 분', () => {
  assert.equal(fmtRemaining(NOW + 41 * MIN, NOW), '41분 남음');
  assert.equal(fmtRemaining(NOW + 59 * MIN + 59_000, NOW), '59분 남음');
});
test('하루 미만 → 시간 + 분', () => {
  assert.equal(fmtRemaining(NOW + 2 * HOUR + 41 * MIN, NOW), '2시간 41분 남음');
});
test('분이 0이면 시간만', () => {
  assert.equal(fmtRemaining(NOW + 2 * HOUR, NOW), '2시간 남음');
});
test('하루 이상 → 일 + 시간', () => {
  assert.equal(fmtRemaining(NOW + 2 * DAY + 15 * HOUR, NOW), '2일 15시간 남음');
  assert.equal(fmtRemaining(NOW + DAY, NOW), '1일 남음');
});
test('시간이 0이면 일만', () => {
  assert.equal(fmtRemaining(NOW + 3 * DAY, NOW), '3일 남음');
});

test('같은 날 → 시각만', () => {
  assert.equal(fmtAbsolute(at('2026-07-30T15:45:00+09:00'), NOW), '오후 3:45');
});
test('다음 날 → 내일', () => {
  assert.equal(fmtAbsolute(at('2026-07-31T09:00:00+09:00'), NOW), '내일 오전 9:00');
});
test('그 밖 → 날짜(요일) + 시각', () => {
  assert.equal(fmtAbsolute(at('2026-08-05T09:00:00+09:00'), NOW), '8/5(수) 오전 9:00');
});
test('자정 넘김은 경과 시간이 아니라 날짜로 가른다', () => {
  // 20분 뒤지만 날짜가 바뀌므로 "내일"이어야 합니다
  const late = at('2026-07-30T23:50:00+09:00');
  const reset = at('2026-07-31T00:10:00+09:00');
  assert.equal(fmtRemaining(reset, late), '20분 남음');
  assert.equal(fmtAbsolute(reset, late), '내일 오전 12:10');
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/panel/format'`

- [ ] **Step 3: 모듈을 구현한다**

`src/panel/format.js` 생성:

```js
// 리셋 시각을 사람이 읽는 문자열로 바꿉니다.
// panel.js는 최상단에서 electron을 require하므로 테스트가 붙지 않아, 포맷 로직만 여기로 분리했습니다.
// now를 인자로 받는 것도 같은 이유입니다 — 내부에서 Date.now()를 부르면 "내일" 판정을 고정할 수 없습니다.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const WEEKDAY = '일월화수목금토';

// 경과 시간이 아니라 자정 기준 달력 날짜 차이.
// 23:50에 본 00:10 리셋은 20분 뒤지만 "내일"이어야 합니다.
function dayDiff(from, to) {
  const a = new Date(from); a.setHours(0, 0, 0, 0);
  const b = new Date(to); b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / DAY); // round로 DST 흡수
}

const time = (ms) =>
  new Date(ms).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });

function fmtRemaining(resetsAt, now) {
  const d = resetsAt - now;
  if (d <= 0) return '곧 리셋';
  if (d < MIN) return '1분 미만';
  if (d < HOUR) return `${Math.floor(d / MIN)}분 남음`;
  if (d < DAY) {
    const h = Math.floor(d / HOUR);
    const m = Math.floor((d % HOUR) / MIN);
    return m ? `${h}시간 ${m}분 남음` : `${h}시간 남음`;
  }
  const days = Math.floor(d / DAY);
  const h = Math.floor((d % DAY) / HOUR);
  return h ? `${days}일 ${h}시간 남음` : `${days}일 남음`;
}

function fmtAbsolute(resetsAt, now) {
  const diff = dayDiff(now, resetsAt);
  if (diff === 0) return time(resetsAt);
  if (diff === 1) return `내일 ${time(resetsAt)}`;
  const d = new Date(resetsAt);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY[d.getDay()]}) ${time(resetsAt)}`;
}

module.exports = { fmtRemaining, fmtAbsolute };
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npm test`
Expected: PASS — 기존 31개 + 신규 11개

Run: `npm run lint`
Expected: 에러 없음

- [ ] **Step 5: 커밋한다**

```bash
git add src/panel/format.js test/panel-format.test.js
git commit -m "feat(panel): 리셋 시각 포맷을 순수 모듈로 분리합니다

패널의 리셋 표기를 남은 시간 중심으로 바꾸려는데, panel.js는 최상단에서
electron을 require해 테스트가 붙지 않습니다. 날짜 경계처럼 틀리기 쉬운
부분만이라도 테스트 아래 두려고 포맷 로직을 떼어냅니다."
```

---

### Task 2: 색 대비 티어 정리

**Files:**
- Modify: `src/panel/panel.html:3-15` (`:root`), `src/panel/panel.html:58` (`.duo .r`)

**Interfaces:**
- Consumes: 없음
- Produces: CSS 변수 `--text-2: #b4b4bc` (Task 4의 `.r2`가 쓰는 `--muted`와 짝을 이루는 상위 티어)

**배경:** 리셋 텍스트가 `--faint`(`#626269`) 10px이라 duo 셀 배경 위에서 명암비 2.65:1이다.
WCAG AA 본문 기준 4.5:1에 한참 못 미친다. `--faint`는 설정 섹션 힌트에도 쓰이는데
거기서도 2.93:1이라 같이 올린다.

- [ ] **Step 1: `:root`에 티어를 추가한다**

`src/panel/panel.html`에서 이 세 줄을

```css
    --text: #ececf0;
    --muted: #8e8e96;
    --faint: #626269;
```

이렇게 바꾼다:

```css
    --text: #ececf0;             /* 13.6:1 */
    --text-2: #b4b4bc;           /* 7.8:1 — 남은 시간 */
    --muted: #8e8e96;            /* 4.9:1 — 라벨, 절대 시각 */
    --faint: #82828b;            /* 4.65:1 — 설정 힌트 (기존 #626269는 2.9:1로 AA 미달) */
```

- [ ] **Step 2: 리셋 텍스트 규칙을 올린다**

같은 파일에서

```css
  .duo .r { font-size: 10px; color: var(--faint); font-variant-numeric: tabular-nums; }
```

를

```css
  .duo .r { font-size: 11px; color: var(--text-2); font-variant-numeric: tabular-nums; }
```

로 바꾼다.

- [ ] **Step 3: 눈으로 확인한다**

Run: `npm start`
확인할 것:
- 트레이 아이콘을 눌러 패널을 연다
- duo 카드 아래쪽 `3:45 리셋` / `8/5 리셋` 이 확실히 읽힌다 (문구는 아직 옛날 형태 — Task 4에서 바꾼다)
- `설정 ▾` 을 펼쳐 `임계값: 쉼표 구분...` 같은 힌트가 읽힌다
- 앱을 종료한다 (패널 `종료` 버튼)

- [ ] **Step 4: lint와 테스트를 돌린다**

Run: `npm run lint && npm test`
Expected: 둘 다 통과 (이 태스크는 CSS만 건드리므로 기존과 동일하게 통과해야 한다)

- [ ] **Step 5: 커밋한다**

```bash
git add src/panel/panel.html
git commit -m "style(panel): 하위 텍스트 색을 WCAG AA 위로 올립니다

리셋 시각과 설정 힌트가 각각 2.65:1, 2.93:1이라 사실상 안 보였습니다.
--faint 하나로 뭉뚱그리던 하위 정보를 --text-2(7.8:1)와
--faint(4.65:1) 두 단계로 나눕니다."
```

---

### Task 3: legend 제거, 색 범례를 duo 라벨로

**Files:**
- Modify: `src/panel/panel.html:48-51` (`.legend` 스타일 삭제), `src/panel/panel.html:56` (`.duo .k`), `src/panel/panel.html:123-129` (마크업)
- Modify: `src/panel/panel.js:43-44` (legend 갱신 삭제)

**Interfaces:**
- Consumes: 없음
- Produces: DOM 원소 `#dot-fh`, `#dot-wk` — Task 5가 `style.background`로 경고색을 칠한다

**배경:** legend(`주간 62% / 5시간 47%`)가 바로 아래 duo와 같은 숫자를 중복 표시한다.
다만 legend의 색 dot은 "바깥 링 = 주간, 안쪽 링 = 5시간"을 알려주는 유일한 단서라
그냥 지우면 링이 범례를 잃는다. dot만 duo 라벨 앞으로 옮긴다.

- [ ] **Step 1: `.legend` 스타일을 지운다**

`src/panel/panel.html`에서 이 네 줄을 통째로 삭제한다 (뒤따르는 빈 줄 하나도 함께):

```css
  .legend { display: flex; gap: 14px; justify-content: center; margin-bottom: 12px; }
  .legend div { display: flex; align-items: center; gap: 6px;
    font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .legend .dot { width: 7px; height: 7px; border-radius: 99px; flex: none; }
```

- [ ] **Step 2: 라벨에 dot 자리를 만든다**

같은 파일에서

```css
  .duo .k { font-size: 10.5px; color: var(--muted); font-weight: 600; letter-spacing: .4px; }
```

를

```css
  .duo .k { display: flex; align-items: center; gap: 5px;
    font-size: 10.5px; color: var(--muted); font-weight: 600; letter-spacing: .4px; }
  /* 링 색 범례 겸용 — 바깥 링(주간) / 안쪽 링(5시간)과 같은 색을 쓴다 */
  .duo .k .dot { width: 7px; height: 7px; border-radius: 99px; flex: none; }
  #dot-fh { background: #7ec8ff; }
  #dot-wk { background: var(--accent); }
```

로 바꾼다.

- [ ] **Step 3: 마크업을 바꾼다**

`src/panel/panel.html`에서 legend 블록과 duo 블록

```html
  <div class="legend">
    <div><span class="dot" style="background:var(--accent)"></span><span id="lg-wk">주간 —</span></div>
    <div><span class="dot" style="background:#7ec8ff"></span><span id="lg-fh">5시간 —</span></div>
  </div>
  <div class="duo">
    <div><div class="k">5시간</div><div class="v" id="fh-pct">—</div><div class="r" id="fh-reset"></div></div>
    <div><div class="k">주간</div><div class="v" id="wk-pct">—</div><div class="r" id="wk-reset"></div></div>
  </div>
```

를 이렇게 바꾼다 (legend는 사라지고 duo 라벨에 dot이 붙는다):

```html
  <div class="duo">
    <div>
      <div class="k"><span class="dot" id="dot-fh"></span>5시간</div>
      <div class="v" id="fh-pct">—</div>
      <div class="r" id="fh-reset"></div>
    </div>
    <div>
      <div class="k"><span class="dot" id="dot-wk"></span>주간</div>
      <div class="v" id="wk-pct">—</div>
      <div class="r" id="wk-reset"></div>
    </div>
  </div>
```

- [ ] **Step 4: legend를 채우던 JS를 지운다**

`src/panel/panel.js`에서 이 두 줄을 삭제한다:

```js
    q('lg-wk').textContent = `주간 ${typeof wk?.pct === 'number' ? Math.round(wk.pct) + '%' : '—'}`;
    q('lg-fh').textContent = `5시간 ${typeof fh?.pct === 'number' ? Math.round(fh.pct) + '%' : '—'}`;
```

두 줄을 남겨두면 원소가 없어져 `q('lg-wk')`가 `null`이 되고 `panel-data` 핸들러 전체가
`TypeError`로 죽는다 (몬스터 표시까지 같이 멈춘다). 반드시 Step 3과 함께 간다.

- [ ] **Step 5: 눈으로 확인한다**

Run: `npm start`
확인할 것:
- 패널을 열면 링 아래 중복되던 `주간 —/5시간 —` 줄이 사라졌다
- duo 라벨이 `● 5시간` / `● 주간` 이고, dot 색이 각각 하늘색 / 코럴이다
- 설정에서 소스를 Codex로 바꾸면 `주간` dot이 틸(`#10a37f`)로 따라 바뀐다 (`var(--accent)` 연동 확인)
- 링 가운데 몬스터/알과 이름이 정상 표시된다 (Step 4를 빠뜨리면 여기가 멈춘다)
- 개발자 도구 콘솔에 에러가 없다
- 앱을 종료한다

- [ ] **Step 6: lint와 테스트를 돌린다**

Run: `npm run lint && npm test`
Expected: 둘 다 통과

- [ ] **Step 7: 커밋한다**

```bash
git add src/panel/panel.html src/panel/panel.js
git commit -m "style(panel): 중복된 범례를 걷어내고 색 점을 라벨로 옮깁니다

범례가 바로 아래 카드와 같은 수치를 두 번 보여주고 있었습니다. 다만
색 점은 바깥 링이 주간이고 안쪽이 5시간이라는 유일한 단서라, 지우는 대신
카드 라벨 앞으로 옮겨 그 역할만 남깁니다."
```

---

### Task 4: 리셋 표기를 남은 시간 + 절대 시각 2줄로

**Files:**
- Modify: `src/panel/panel.html` (`.duo .r2` 규칙 추가, duo 마크업에 둘째 줄 추가)
- Modify: `src/panel/panel.js` (`fmtTime`/`fmtDate` 제거, `format.js` 사용, 30초 타이머)

**Interfaces:**
- Consumes: Task 1의 `fmtRemaining(resetsAt, now)`, `fmtAbsolute(resetsAt, now)` (`require('./format')`)
- Produces: DOM 원소 `#fh-remain` / `#fh-at` / `#wk-remain` / `#wk-at`.
  `#fh-reset` / `#wk-reset` 은 사라진다.

**배경:** 지금은 5시간이 `3:45 리셋`(날짜 없음 → 오늘인지 내일인지 모름),
주간이 `8/5 리셋`(시각 없음)이다. 지표별로 다른 포맷을 쓰던 것을 같은 함수 쌍으로 통일하면
리셋 시점에 따라 날짜가 알아서 붙는다.

폴링은 5분 주기인데 패널은 설정을 펼쳐두면 계속 떠 있으므로,
남은 시간은 30초마다 다시 그린다.

- [ ] **Step 1: 둘째 줄 스타일을 추가한다**

`src/panel/panel.html`의 `.duo .r` 규칙 **바로 아래**에 한 줄 추가:

```css
  .duo .r2 { font-size: 10.5px; color: var(--muted); font-variant-numeric: tabular-nums; margin-top: 1px; }
```

- [ ] **Step 2: 마크업에 둘째 줄을 넣는다**

`src/panel/panel.html`의 duo 블록에서 `id`를 바꾸고 줄을 하나씩 추가한다.

`<div class="r" id="fh-reset"></div>` 를

```html
      <div class="r" id="fh-remain"></div>
      <div class="r2" id="fh-at"></div>
```

로, `<div class="r" id="wk-reset"></div>` 를

```html
      <div class="r" id="wk-remain"></div>
      <div class="r2" id="wk-at"></div>
```

로 바꾼다.

- [ ] **Step 3: 옛 포맷 함수를 걷어내고 모듈을 붙인다**

`src/panel/panel.js` 최상단에서 `q` 정의 바로 위에 require를 추가한다:

```js
  const { ipcRenderer } = require('electron');
  const { fmtRemaining, fmtAbsolute } = require('./format');
```

그리고 이 두 줄을 삭제한다:

```js
  const fmtTime = (ms) => new Date(ms).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  const fmtDate = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()}`; };
```

- [ ] **Step 4: 마지막 수치를 보관하고 리셋 줄을 그리는 함수를 만든다**

`src/panel/panel.js`의 `setRing` 함수 정의 **바로 아래**에 추가:

```js
  // 폴링은 5분 주기인데 패널은 설정을 펼쳐두면 계속 떠 있다.
  // 남은 시간을 30초마다 다시 그리려면 마지막 수치를 들고 있어야 한다.
  let last = { fh: null, wk: null };

  function renderReset() {
    const now = Date.now();
    for (const [prefix, u] of [['fh', last.fh], ['wk', last.wk]]) {
      const on = typeof u?.pct === 'number' && u.resetsAt;
      q(`${prefix}-remain`).textContent = on ? fmtRemaining(u.resetsAt, now) : '';
      q(`${prefix}-at`).textContent = on ? fmtAbsolute(u.resetsAt, now) : '';
    }
  }
```

- [ ] **Step 5: `panel-data` 핸들러를 배선한다**

`src/panel/panel.js`에서

```js
    const put = (prefix, u, fmt) => {
      const has = typeof u?.pct === 'number';
      q(`${prefix}-pct`).textContent = has ? `${Math.round(u.pct)}%` : '—';
      q(`${prefix}-reset`).textContent = has && u.resetsAt ? `${fmt(u.resetsAt)} 리셋` : '';
    };
    put('fh', fh, fmtTime);
    put('wk', wk, fmtDate);
```

를

```js
    const put = (prefix, u) => {
      q(`${prefix}-pct`).textContent =
        typeof u?.pct === 'number' ? `${Math.round(u.pct)}%` : '—';
    };
    put('fh', fh);
    put('wk', wk);

    last = { fh, wk };
    renderReset();
```

로 바꾼다.

- [ ] **Step 6: 30초 타이머를 건다**

`src/panel/panel.js` 아래쪽, `q('refresh').onclick = ...` 바로 위에 추가:

```js
  setInterval(renderReset, 30_000);
```

- [ ] **Step 7: 눈으로 확인한다**

Run: `npm start`
확인할 것:
- duo 카드가 `47%` / `2시간 41분 남음` / `오후 3:45` 3단으로 나온다
- 주간 쪽에 요일이 붙는다 (예: `3일 남음` / `8/5(수) 오전 9:00`)
- 리셋이 오늘이면 날짜 없이 시각만, 내일이면 `내일 ...` 이 붙는다
- 패널을 열어둔 채 30초 이상 기다리면 `분 남음` 숫자가 1 줄어든다
  (설정을 펼치면 blur로 닫히지 않는다)
- 링 아래 몬스터 이름/단계가 정상이고 콘솔에 에러가 없다
- 앱을 종료한다

- [ ] **Step 8: lint와 테스트를 돌린다**

Run: `npm run lint && npm test`
Expected: 둘 다 통과. lint는 특히 `fmtTime`/`fmtDate` 삭제 후 미사용 변수가 남지 않았는지 잡아준다.

- [ ] **Step 9: 커밋한다**

```bash
git add src/panel/panel.html src/panel/panel.js
git commit -m "feat(panel): 한도 리셋을 남은 시간과 함께 보여줍니다

절대 시각만 주다 보니 5시간은 오늘인지 내일인지, 주간은 그날 몇 시인지
알 수 없어 매번 머릿속으로 계산해야 했습니다. 남은 시간을 앞세우고 정확한
시각을 아래 붙입니다. 지표마다 다르던 포맷도 하나로 합쳐, 리셋이 언제냐에
따라 날짜가 알아서 붙게 했습니다.

폴링이 5분 주기라 패널을 열어둔 동안 남은 시간이 어긋나므로 30초마다
다시 그립니다."
```

---

### Task 5: 경고색을 값과 라벨 dot까지 확장

**Files:**
- Modify: `src/panel/panel.html` (`.duo .v` 에 transition 추가)
- Modify: `src/panel/panel.js` (`put` 안에서 `alertColor` 적용)

**Interfaces:**
- Consumes: Task 3의 `#dot-fh` / `#dot-wk`, 기존 `alertColor(pct)` (`panel.js`)
- Produces: 없음 (마지막 태스크)

**배경:** `alertColor()`는 이미 70%에서 앰버(`#ffb340`), 90%에서 레드(`#ff5f57`)를 돌려주는데
지금은 링에만 칠한다. 정작 사람이 보는 숫자는 한도가 코앞이어도 흰색 그대로다.

- [ ] **Step 1: 색 전환을 부드럽게 한다**

`src/panel/panel.html`에서

```css
  .duo .v { font: 600 17px var(--mono); font-variant-numeric: tabular-nums; margin: 1px 0 2px; }
```

를

```css
  .duo .v { font: 600 17px var(--mono); font-variant-numeric: tabular-nums; margin: 1px 0 3px;
    transition: color .3s; }
```

로 바꾼다. `.3s`는 링의 `stroke .3s`(`.ring circle`)와 맞춘 값이고,
아래 여백을 `2px → 3px`로 넓혀 3단이 된 카드에서 값과 리셋 줄을 떼어놓는다.

- [ ] **Step 2: `put`에서 값과 dot에 경고색을 칠한다**

`src/panel/panel.js`의 `put`을

```js
    const put = (prefix, u) => {
      q(`${prefix}-pct`).textContent =
        typeof u?.pct === 'number' ? `${Math.round(u.pct)}%` : '—';
    };
```

에서

```js
    // 링과 같은 경고색을 값과 라벨 dot에도 (빈 문자열이면 CSS 기본색으로 되돌아감)
    const put = (prefix, u) => {
      const has = typeof u?.pct === 'number';
      const color = has ? alertColor(u.pct) : '';
      const v = q(`${prefix}-pct`);
      v.textContent = has ? `${Math.round(u.pct)}%` : '—';
      v.style.color = color;
      q(`dot-${prefix}`).style.background = color;
    };
```

로 바꾼다.

- [ ] **Step 3: 눈으로 확인한다**

`alertColor`의 경계는 70%와 90%다. 실제 사용량이 그 아래라면 개발자 도구 콘솔에서
가짜 데이터를 흘려 확인한다 (패널 창을 선택한 뒤):

```js
require('electron').ipcRenderer.emit('panel-data', null, {
  source: 'claude',
  usage: { fiveHour: { pct: 95, resetsAt: Date.now() + 2 * 3600e3 },
           weekly:   { pct: 72, resetsAt: Date.now() + 3 * 86400e3 } },
});
```

확인할 것:
- `95%` 숫자와 5시간 dot이 레드(`#ff5f57`), 링도 같은 레드
- `72%` 숫자와 주간 dot이 앰버(`#ffb340`)
- 같은 방식으로 `pct: 30`을 흘리면 숫자가 흰색, dot이 각각 하늘색/코럴로 **되돌아온다**
  (되돌아오지 않으면 `alertColor`의 빈 문자열 처리가 깨진 것이다)
- 위 가짜 데이터에는 `monster` 키가 없어 링 가운데가 알 + `몬스터 없음`으로 바뀐다.
  회귀가 아니라 정상이며, `새로고침` 버튼을 누르면 진짜 데이터로 복구된다.
- 앱을 종료한다

- [ ] **Step 4: lint와 테스트를 돌린다**

Run: `npm run lint && npm test`
Expected: 둘 다 통과

- [ ] **Step 5: 커밋한다**

```bash
git add src/panel/panel.html src/panel/panel.js
git commit -m "feat(panel): 한도 경고색을 수치와 라벨에도 입힙니다

70%/90% 경고색이 링에만 있어서, 정작 사람이 읽는 숫자는 한도가 코앞이어도
평소와 같은 색이었습니다. 링과 같은 규칙을 값과 라벨 점에 함께 적용합니다."
```

---

## 완료 후 확인

- [ ] `npm test` — 기존 31개 + 신규 11개 통과
- [ ] `npm run lint` — 에러 없음
- [ ] `git log --oneline -5` — 커밋 5개가 `.gitmessage` 형식을 따른다
- [ ] `git status` — `.gitignore` / `package.json` / `package-lock.json` / `src/main.js` /
      `assets/icon.icns` 의 선행 변경이 **커밋되지 않은 채 그대로** 남아 있다
- [ ] `npm start` — 패널 전체 회귀 확인: 소스 전환(Claude ↔ Codex), 새로고침,
      설정 펼치기/접기, 몬스터 표시, 패널 높이가 내용에 맞게 잡힘
