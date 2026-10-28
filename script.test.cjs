'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { score, generateCandidates, filterCandidates, createSecret, validateGuess } = require('./script.js');
// Independent reference implementation deliberately avoids bit masks.
function reference(answer, guess) {
  const hit = [...guess].filter((digit, index) => answer[index] === digit).length;
  return { hit, blow: [...guess].filter(digit => answer.includes(digit)).length - hit };
}
for (const [length, count] of [[2, 90], [3, 720], [4, 5040], [5, 30240]]) {
  test(`${length}桁：候補数・重複なし・先頭0・秘密の生成`, () => {
    const candidates = generateCandidates(length);
    assert.equal(candidates.length, count);
    assert.equal(new Set(candidates.map(c => c.value)).size, count);
    assert.ok(candidates.some(c => c.value.startsWith('0')));
    for (const candidate of candidates) assert.equal(validateGuess(candidate.value, length), '');
    assert.equal(createSecret(length, () => 0), '01234'.slice(0, length));
    for (let i = 0; i < 100; i++) assert.equal(validateGuess(createSecret(length), length), '');
  });
  test(`${length}桁：各絞り込みが全履歴の独立計算と一致する`, () => {
    const all = generateCandidates(length);
    const secret = '01234'.slice(0, length);
    let remaining = all;
    const history = [];
    const guesses = ['98765'.slice(0, length), '13579'.slice(0, length), secret.slice(1) + secret[0], secret];
    for (const guess of guesses) {
      const entry = { guess, ...reference(secret, guess) };
      history.push(entry);
      remaining = filterCandidates(remaining, entry);
      const expected = all.filter(c => history.every(h => {
        const r = reference(c.value, h.guess);
        return r.hit === h.hit && r.blow === h.blow;
      }));
      assert.deepEqual(remaining, expected);
      assert.ok(remaining.some(c => c.value === secret));
    }
    assert.deepEqual(remaining.map(c => c.value), [secret]);
  });
}
test('Hit・Blow：全2桁の組み合わせを独立計算と比較', () => {
  const all = generateCandidates(2);
  for (const a of all) for (const b of all) assert.deepEqual(score(a.value, b.value), reference(a.value, b.value));
  assert.deepEqual(score('123', '132'), { hit: 1, blow: 2 });
  assert.deepEqual(score('037', '703'), { hit: 0, blow: 3 });
  assert.deepEqual(score('01234', '01234'), { hit: 5, blow: 0 });
});
test('複数候補→未正解で一意→通常入力で正解、同じ予想も許可', () => {
  let remaining = generateCandidates(2);
  const first = { guess: '01', hit: 1, blow: 0 };
  remaining = filterCandidates(remaining, first);
  assert.ok(remaining.length > 1);
  assert.deepEqual(filterCandidates(remaining, first), remaining);
  remaining = filterCandidates(remaining, { guess: '23', hit: 1, blow: 0 });
  assert.ok(remaining.length > 1);
  remaining = filterCandidates(remaining, { guess: '02', hit: 1, blow: 0 });
  assert.deepEqual(remaining.map(c => c.value), ['03']);
  assert.notEqual(score('03', '02').hit, 2);
  remaining = filterCandidates(remaining, { guess: '03', hit: 2, blow: 0 });
  assert.deepEqual(remaining.map(c => c.value), ['03']);
});
test('入力不足・重複・数字以外を拒否し先頭0を許可', () => {
  for (const guess of ['', '12', '112', 'abc', '１２３']) assert.ok(validateGuess(guess, 3));
  assert.equal(validateGuess('037', 3), '');
  for (const length of [1, 6, 2.5]) assert.throws(() => generateCandidates(length), RangeError);
});
