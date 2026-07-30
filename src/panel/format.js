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
