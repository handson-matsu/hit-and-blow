/* Pure game logic is also exported for the dependency-free Node.js tests. */
(function (root) {
  'use strict';
  function validateLength(length) {
    if (!Number.isInteger(length) || length < 2 || length > 5) throw new RangeError('桁数は2〜5です。');
  }
  function digitMask(value) {
    let mask = 0;
    for (const digit of value) mask |= 1 << Number(digit);
    return mask;
  }
  function countBits(mask) {
    let count = 0;
    while (mask) { mask &= mask - 1; count++; }
    return count;
  }
  function scoreWithMasks(answer, guess, answerMask, guessMask) {
    let hit = 0;
    for (let i = 0; i < answer.length; i++) if (answer[i] === guess[i]) hit++;
    return { hit, blow: countBits(answerMask & guessMask) - hit };
  }
  function score(answer, guess) {
    return scoreWithMasks(answer, guess, digitMask(answer), digitMask(guess));
  }
  function generateCandidates(length) {
    validateLength(length);
    const candidates = [];
    function visit(value, mask) {
      if (value.length === length) { candidates.push({ value, mask }); return; }
      for (let digit = 0; digit < 10; digit++) {
        if (!(mask & (1 << digit))) visit(value + digit, mask | (1 << digit));
      }
    }
    visit('', 0);
    return candidates;
  }
  // Only candidates and a public history entry are accepted; no secret is used.
  function filterCandidates(candidates, entry) {
    const guessMask = digitMask(entry.guess);
    return candidates.filter(candidate => {
      const result = scoreWithMasks(candidate.value, entry.guess, candidate.mask, guessMask);
      return result.hit === entry.hit && result.blow === entry.blow;
    });
  }
  function createSecret(length, random = Math.random) {
    validateLength(length);
    const digits = Array.from({ length: 10 }, (_, i) => String(i));
    let value = '';
    for (let i = 0; i < length; i++) value += digits.splice(Math.floor(random() * digits.length), 1)[0];
    return value;
  }
  function validateGuess(guess, length) {
    if (!/^\d+$/.test(guess) || guess.length !== length) return `${length}桁の数字を入力してください。`;
    if (new Set(guess).size !== length) return '同じ数字は使えません。別の数字を入力してください。';
    return '';
  }
  const logic = { score, generateCandidates, filterCandidates, createSecret, validateGuess };
  if (typeof module !== 'undefined' && module.exports) module.exports = logic;
  root.HitAndBlow = logic;
  if (typeof document === 'undefined') return;

  const $ = id => document.getElementById(id);
  let length = 3, secret, candidates, guess = '', history = [], uniqueAt = null, finished = false;
  const numberButtons = [...document.querySelectorAll('[data-number]')];
  const lengthButtons = [...document.querySelectorAll('[data-length]')];
  // Presentation only: audio is created/resumed exclusively during user actions.
  const AudioContextClass = root.AudioContext || root.webkitAudioContext;
  let soundOn = false, audioContext = null, audioEpoch = 0, confettiTimer;
  const playingNotes = new Set();
  function stopSounds() {
    audioEpoch++;
    for (const oscillator of playingNotes) {
      try { oscillator.stop(); } catch (_) { /* Already ended. */ }
    }
    playingNotes.clear();
  }
  function updateSoundButton() {
    $('sound-toggle').textContent = soundOn ? '音 ON' : '音 OFF';
    $('sound-toggle').setAttribute('aria-pressed', String(soundOn));
  }
  function audioUnavailable() {
    soundOn = false;
    stopSounds();
    updateSoundButton();
    $('sound-status').textContent = '音を再生できませんでした。音をONにし直して、端末の音量も確認してください。';
  }
  function readyAudio() {
    if (!audioContext || audioContext.state === 'closed') audioContext = new AudioContextClass();
    // resume() must be called before leaving the click/keyboard event handler.
    return audioContext.state === 'running' ? Promise.resolve() : audioContext.resume();
  }
  function scheduleNote(frequency, offset, duration, volume, type = 'sine') {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const start = audioContext.currentTime + 0.015 + offset;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    playingNotes.add(oscillator);
    oscillator.onended = () => {
      playingNotes.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }
  function playSound(kind) {
    if (!soundOn) return;
    const epoch = audioEpoch;
    const requestedAt = Date.now();
    try {
      readyAudio().then(() => {
        // Discard delayed sounds after OFF, reset, or a newer event; never replay.
        if (!soundOn || epoch !== audioEpoch || Date.now() - requestedAt > 500 || audioContext.state !== 'running') return;
        if (kind === 'unique') {
          scheduleNote(880, 0, 0.14, 0.11);
          scheduleNote(1318.51, 0.12, 0.3, 0.1);
        } else {
          [523.25, 659.25, 783.99].forEach((frequency, i) => scheduleNote(frequency, i * 0.11, 0.22, 0.065, 'triangle'));
          [523.25, 659.25, 783.99, 1046.5].forEach(frequency => scheduleNote(frequency, 0.36, 0.85, 0.055, 'triangle'));
        }
      }).catch(() => { if (soundOn && epoch === audioEpoch) audioUnavailable(); });
    } catch (_) { audioUnavailable(); }
  }
  function clearConfetti() {
    clearTimeout(confettiTimer);
    $('confetti').replaceChildren();
  }
  function celebrate() {
    clearConfetti();
    if (root.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = ['#f2bf43', '#ef7484', '#4aaf96', '#6f9fe5', '#be85d6'];
    const pieces = Array.from({ length: 64 }, (_, i) => {
      const piece = document.createElement('span');
      piece.className = 'confetti-piece';
      piece.style.setProperty('--x', `${Math.random() * 100}%`);
      piece.style.setProperty('--color', colors[i % colors.length]);
      piece.style.setProperty('--drift', `${Math.random() * 160 - 80}px`);
      piece.style.setProperty('--spin', `${Math.random() * 720 - 360}deg`);
      piece.style.setProperty('--duration', `${2.2 + Math.random() * 0.4}s`);
      piece.style.setProperty('--delay', `${Math.random() * 0.1}s`);
      return piece;
    });
    $('confetti').replaceChildren(...pieces);
    confettiTimer = setTimeout(clearConfetti, 2800);
  }
  $('sound-toggle').addEventListener('click', () => {
    soundOn = !soundOn;
    updateSoundButton();
    if (!soundOn) {
      stopSounds();
      $('sound-status').textContent = '音はOFFです。';
      return;
    }
    const epoch = audioEpoch;
    $('sound-status').textContent = '音はONです。一意に決まったときと正解時に効果音が鳴ります。';
    try {
      const ready = readyAudio();
      // A silent buffer unlocks audio on browsers that require a touch gesture.
      const source = audioContext.createBufferSource();
      source.buffer = audioContext.createBuffer(1, 1, audioContext.sampleRate);
      source.connect(audioContext.destination);
      source.onended = () => source.disconnect();
      source.start();
      ready.catch(() => { if (soundOn && epoch === audioEpoch) audioUnavailable(); });
    } catch (_) { audioUnavailable(); }
  });
  if (!AudioContextClass) {
    $('sound-toggle').disabled = true;
    $('sound-status').textContent = 'このブラウザは効果音に対応していません。';
  }

  function message(text, error = false) {
    $('message').textContent = text;
    $('message').classList.toggle('error', error);
  }
  function renderInput() {
    $('slots').replaceChildren(...Array.from({ length }, (_, i) => {
      const slot = document.createElement('span');
      slot.className = 'slot' + (i === guess.length && !finished ? ' active' : '');
      slot.textContent = guess[i] ?? '·';
      slot.setAttribute('aria-label', `${i + 1}桁目：${guess[i] ?? '未入力'}`);
      return slot;
    }));
    $('submit').disabled = finished || !!validateGuess(guess, length);
    numberButtons.forEach(button => { button.disabled = finished; });
    $('delete').disabled = finished || !guess.length;
    $('clear').disabled = finished || !guess.length;
  }
  function startGame(nextLength = length) {
    stopSounds();
    clearConfetti();
    length = nextLength;
    secret = createSecret(length);
    candidates = generateCandidates(length);
    guess = ''; history = []; uniqueAt = null; finished = false;
    lengthButtons.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.length) === length)));
    $('history').replaceChildren();
    $('empty').hidden = false;
    $('unique').hidden = true;
    $('unique-digits').textContent = '？'.repeat(length);
    $('success').hidden = true;
    $('answer').textContent = '';
    $('summary').textContent = '';
    $('latest').textContent = 'ここに判定結果が並びます。';
    $('turn').textContent = '1回目';
    $('history-count').textContent = '0回';
    message('数字ボタンかキーボードで入力できます。');
    renderInput();
  }
  function restart(nextLength = length) {
    if (!finished && history.length && !window.confirm('進行中のゲームを終了して、新しいゲームを始めますか？')) return;
    if (!finished && !history.length && guess.length && !window.confirm('入力を消して、新しいゲームを始めますか？')) return;
    startGame(nextLength);
  }
  function enterDigit(digit) {
    if (finished) return;
    if (guess.includes(digit)) { message('同じ数字は使えません。別の数字を入力してください。', true); return; }
    if (guess.length === length) { message('入力はそろっています。判定するか、削除して直してください。', true); return; }
    guess += digit;
    message(guess.length === length ? '準備OK！「判定する」を押そう。' : '次の数字を入力してください。');
    renderInput();
  }
  function edit(clearAll) {
    if (finished) return;
    guess = clearAll ? '' : guess.slice(0, -1);
    message('数字ボタンかキーボードで入力できます。');
    renderInput();
  }
  function submit() {
    if (finished) return;
    const error = validateGuess(guess, length);
    if (error) { message(error, true); return; }
    const entry = { guess, ...score(secret, guess) };
    history.push(entry);
    candidates = filterCandidates(candidates, entry);
    if (uniqueAt === null && candidates.length === 1) {
      uniqueAt = history.length;
      if (entry.hit !== length) {
        $('unique').hidden = false;
        stopSounds();
        playSound('unique');
        $('unique').scrollIntoView({ block: 'center', behavior: 'instant' });
      }
    }
    const row = document.createElement('tr');
    [history.length, guess, entry.hit, entry.blow].forEach((value, i) => {
      const cell = document.createElement('td');
      cell.textContent = value;
      if (i >= 2) cell.className = i === 2 ? 'hit' : 'blow';
      row.append(cell);
    });
    $('history').append(row);
    $('empty').hidden = true;
    $('history-count').textContent = `${history.length}回`;
    $('latest').textContent = `${history.length}回目：${guess} → ${entry.hit} Hit・${entry.blow} Blow`;
    if (entry.hit === length) {
      finished = true;
      $('success').hidden = false;
      $('answer').textContent = secret;
      $('summary').textContent = `判定した回数：${history.length}回\n答えが一意に定まった回数：${uniqueAt}回目`;
      $('unique').hidden = true;
      message('正解！おめでとう！');
      stopSounds();
      playSound('success');
      celebrate();
      $('again').focus({ preventScroll: true });
      $('success').scrollIntoView({ block: 'center', behavior: 'instant' });
    } else {
      guess = '';
      $('turn').textContent = `${history.length + 1}回目`;
      message('手がかりを見ながら、次の予想を考えよう。');
    }
    renderInput();
  }
  numberButtons.forEach(button => button.addEventListener('click', () => enterDigit(button.dataset.number)));
  lengthButtons.forEach(button => button.addEventListener('click', () => {
    const nextLength = Number(button.dataset.length);
    if (nextLength !== length) restart(nextLength);
  }));
  $('delete').addEventListener('click', () => edit(false));
  $('clear').addEventListener('click', () => edit(true));
  $('submit').addEventListener('click', submit);
  $('new-game').addEventListener('click', () => restart());
  $('again').addEventListener('click', () => startGame());
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (/^\d$/.test(event.key)) { event.preventDefault(); enterDigit(event.key); }
    else if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); edit(false); }
    else if (event.key === 'Escape') { event.preventDefault(); edit(true); }
    else if (event.key === 'Enter' && event.target.tagName !== 'BUTTON') { event.preventDefault(); submit(); }
  });
  startGame();
})(typeof globalThis !== 'undefined' ? globalThis : this);
