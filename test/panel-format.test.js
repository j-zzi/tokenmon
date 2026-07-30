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
