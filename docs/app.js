import { t, locale, lockLanguage } from './i18n.js';
import { StrumDetector, guitarBands, PracticeRound, pairKey, validSession } from './engine.js?v=3';
const $ = id => document.getElementById(id);
const chords = ['A', 'D', 'E', 'Am', 'Dm', 'Em', 'C', 'G', 'F', 'Bm', 'B7', 'A7', 'D7', 'E7', 'G7', 'C7', 'Fmaj7'];
const commonPairs = [
  ['A', 'C'], ['A', 'G'], ['A', 'E'], ['A', 'Em'], ['A', 'D'], ['A', 'Dm'],
  ['C', 'G'], ['C', 'E'], ['C', 'D'], ['C', 'Dm'], ['C', 'Am'], ['C', 'Em'],
  ['G', 'E'], ['G', 'D'], ['G', 'Dm'], ['G', 'Am'], ['G', 'Em'],
  ['E', 'D'], ['E', 'Dm'], ['E', 'Am'], ['D', 'Am'], ['D', 'Em'],
  ['Dm', 'Am'], ['Dm', 'Em'], ['Am', 'Em'],
];
const storageKey = 'practice-room.sessions.v1';
let sessions = [], state = 'idle', mode = 'mic', round, detector, stream, context, analyser, samples, frequencies, bands, frame, timeout, requestId = 0, calibrationEnd, wakeLock;
let storageWarning = '';
try {
  const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (!Array.isArray(stored) || !stored.every(validSession)) throw new Error(t('Invalid practice log'));
  sessions = stored;
} catch {
  storageWarning = t('Your saved practice log could not be read. New results can still be downloaded. Saving will not replace the existing log.');
}
for (const id of ['chord-a', 'chord-b']) {
  for (const chord of chords) $(id).add(new Option(chord, chord));
  $(id).addEventListener('change', () => { clearError(); renderHistory(); updateControls(); });
}
$('chord-b').value = 'D';
$('swap-chords').addEventListener('click', () => {
  if (state !== 'idle') return;
  const [first, second] = selectedPair();
  $('chord-a').value = second;
  $('chord-b').value = first;
  clearError(); renderHistory(); updateControls();
});
for (const [a, b] of commonPairs) {
  $('common-pair').add(new Option(`${a} ↔ ${b}`, pairKey(a, b)));
}
function choosePair(pair) {
  if (state !== 'idle' || !pair) return;
  [$('chord-a').value, $('chord-b').value] = pair;
  clearError(); renderHistory(); updateControls();
}
$('common-pair').addEventListener('change', () => {
  choosePair(commonPairs.find(pair => pairKey(...pair) === $('common-pair').value));
  updateControls();
});
$('random-pair').addEventListener('click', () => {
  const choices = commonPairs.filter(pair => pairKey(...pair) !== pairKey(...selectedPair()));
  choosePair(choices[Math.floor(Math.random() * choices.length)]);
});
function selectedPair() { return [$('chord-a').value, $('chord-b').value]; }
function showError(message) { $('error').textContent = message; $('error').hidden = false; }
function clearError() { $('error').hidden = true; }
function setStatus(title, instruction) { $('status').textContent = title; $('instruction').textContent = instruction; }
function updateControls() {
  lockLanguage(state !== 'idle');
  const preset = commonPairs.find(pair => pairKey(...pair) === pairKey(...selectedPair()));
  $('common-pair').value = preset ? pairKey(...preset) : '';
  $('common-pair').disabled = $('random-pair').disabled = state !== 'idle';
  const active = ['requesting', 'checking', 'calibrating', 'armed', 'running'].includes(state);
  const canChoose = ['idle', 'checking'].includes(state);
  $('audio-input').disabled = $('refresh-inputs').disabled = $('check-input').disabled = $('input-boost').disabled = !canChoose;
  $('check-input').textContent = state === 'checking' ? t('Stop check') : t('Check input');
  const same = $('chord-a').value === $('chord-b').value;
  $('chord-a').disabled = $('chord-b').disabled = $('swap-chords').disabled = state !== 'idle';
  $('listen').hidden = !canChoose;
  $('manual').hidden = state !== 'idle';
  $('listen').disabled = $('manual').disabled = same;
  $('cancel').hidden = !active || state === 'checking';
  $('tap').hidden = !(mode === 'manual' && ['armed', 'running'].includes(state));
  $('result').hidden = state !== 'finished';
  $('mic-settings').hidden = mode === 'manual' && active;
  document.body.classList.toggle('is-running', state === 'running');
  document.body.classList.toggle('is-armed', state === 'armed');
  if (same && state === 'idle') setStatus(t('Choose two different chords'), t('Pick a different second chord to start your practice.'));
  else if (state === 'idle') setStatus(t('Ready'), t('First strum starts the 60-second timer.'));
}
async function holdScreen() {
  try {
    const lock = await navigator.wakeLock?.request('screen');
    if (['armed', 'running', 'calibrating'].includes(state)) wakeLock = lock;
    else await lock?.release();
  } catch { /* Keeping the screen awake is optional. */ }
}
function releaseAudio() {
  cancelAnimationFrame(frame); clearTimeout(timeout);
  if (stream) { stream.getTracks().forEach(track => { track.onended = null; track.stop(); }); stream = null; }
  if (context) { const oldContext = context; context = null; oldContext.onstatechange = null; void oldContext.close().catch(() => {}); }
  if (wakeLock) { void wakeLock.release().catch(() => {}); wakeLock = null; }
  analyser = null; $('level').value = 0; $('input-signal').textContent = t('Input off');
  $('input-status').textContent = t('Input stopped.');
}
function reset(message) {
  requestId++; releaseAudio(); state = 'idle'; round = null;
  $('timer').textContent = '1:00'; $('timer').setAttribute('aria-label', t('60 seconds remaining'));
  $('time-fill').style.transform = 'scaleX(1)'; $('count').textContent = '0';
  $('count-label').textContent = t('estimated changes');
  updateControls(); if (message) setStatus(message, '');
}
function interrupt(message) { reset(); showError(message); }
function registerHit(now) {
  if (!['armed', 'running'].includes(state)) return;
  if (round.expired(now)) { finish(); return; }
  if (state === 'armed') {
    state = 'running';
    setStatus(t('Counting'), mode === 'mic' ? t('Strum once per chord.') : t('Space or tap to count a change.'));
    timeout = setTimeout(finish, 60000);
    updateControls();
  }
  round.hit(now); $('count').textContent = round.count;
}
function tick() {
  if (!['checking', 'calibrating', 'armed', 'running'].includes(state)) return;
  const now = performance.now();
  if (state === 'running' && round.expired(now)) { finish(); return; }
  if (analyser) {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0, peak = 0; for (const sample of samples) { sum += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
    // Boost the measured envelope, not audio playback. Calibration uses the same scale.
    const boost = 10 ** (Number($('input-boost').value) / 20);
    const rms = Math.sqrt(sum / samples.length) * boost;
    analyser.getFloatFrequencyData(frequencies);
    guitarBands(frequencies, context.sampleRate, boost, bands);
    $('level').value = rms;
    $('input-signal').textContent = peak >= 0.98 ? t('Too loud — lower device input gain') : peak * boost >= 0.98 ? t('Boost too high — reduce input boost') : rms >= 0.005 ? t('Signal detected') : t('Very quiet');
    if (state === 'calibrating') {
      detector.calibrate(rms, bands);
      if (now >= calibrationEnd) {
        state = 'armed'; setStatus(t('Waiting for first strum'), t('First strum starts the timer.')); updateControls();
      }
    } else if (state !== 'checking' && detector.feed(rms, now, bands)) registerHit(now);
  }
  if (state === 'running') {
    const remaining = round.remaining(now), seconds = Math.ceil(remaining / 1000);
    $('timer').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    $('timer').setAttribute('aria-label', t`${seconds} seconds remaining`);
    $('time-fill').style.transform = `scaleX(${remaining / 60000})`;
  }
  frame = requestAnimationFrame(tick);
}
async function listen(preview = false) {
  if (state === 'checking') reset();
  if (state !== 'idle') return;
  clearError(); mode = 'mic'; state = 'requesting'; const token = ++requestId;
  setStatus(t('Allow audio input access'), t('Allow microphone access, including for USB audio.')); updateControls();
  let pendingContext;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('UNSUPPORTED');
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('UNSUPPORTED');
    pendingContext = new AudioContext(); context = pendingContext;
    await context.resume();
    if (token !== requestId) return;
    const deviceId = $('audio-input').value;
    const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
    if (deviceId) audio.deviceId = { exact: deviceId };
    const acquired = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    if (token !== requestId) { acquired.getTracks().forEach(t => t.stop()); return; }
    stream = acquired;
    $('input-status').textContent = t`Listening to: ${stream.getTracks()[0]?.label || $('audio-input').selectedOptions[0].textContent}`;
    void refreshInputs();
    for (const track of stream.getTracks()) track.onended = () => interrupt(t('The audio input disconnected. Reconnect it, refresh devices, and check the input before starting again.'));
    analyser = context.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0;
    context.createMediaStreamSource(stream).connect(analyser);
    frequencies = new Float32Array(analyser.frequencyBinCount); bands = new Float32Array(16);
    samples = new Float32Array(analyser.fftSize); detector = new StrumDetector(Number($('sensitivity').value)); round = new PracticeRound();
    state = preview ? 'checking' : 'calibrating'; calibrationEnd = performance.now() + 1500;
    if (preview) $('mic-settings').open = true;
    if (preview) setStatus(t('Check your input'), t('Strum to test the level. Timer stays paused.'));
    else setStatus(t('Finding the input’s quiet level…'), t('Stay quiet briefly.'));
    updateControls();
    context.onstatechange = () => { if (context && context.state === 'suspended' && ['checking', 'armed', 'running', 'calibrating'].includes(state)) interrupt(t('Audio was interrupted. Keep this page open and start a new round.')); };
    void holdScreen(); tick();
  } catch (error) {
    if (token !== requestId) return;
    reset();
    $('mic-settings').open = true;
    const messages = { OverconstrainedError: t('The selected audio input is unavailable. Reconnect it or choose another input; the app has not switched to your microphone.'), NotAllowedError: t("Audio input access was blocked. Allow microphone permission in your browser’s site settings (also required for USB audio), or use manual mode."), NotFoundError: t('The audio input was not found. Connect your USB device with a data cable, refresh devices, or choose another input.'), NotReadableError: t('The audio input is unavailable. Close other apps using it and try again, or use manual mode.') };
    showError(messages[error.name] || t('Audio input is unavailable. Open this app on localhost or HTTPS in a supported browser, or use manual mode.'));
  }
}
function manual() {
  if (state !== 'idle') return;
  clearError(); mode = 'manual'; round = new PracticeRound(); state = 'armed';
  $('count-label').textContent = t('changes counted');
  setStatus(t('Ready to count'), t('Space or tap starts the timer and counts one change.'));
  updateControls(); $('tap').focus(); void holdScreen(); tick();
}
function finish() {
  if (state !== 'running') return;
  // Use the audio context already permitted by the start gesture for a short end cue.
  const oldContext = context;
  if (oldContext && oldContext.state === 'running') {
    try {
      const oscillator = oldContext.createOscillator(), gain = oldContext.createGain();
      oscillator.connect(gain); gain.connect(oldContext.destination); oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0.08, oldContext.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, oldContext.currentTime + 0.35);
      oscillator.start(); oscillator.stop(oldContext.currentTime + 0.36);
      context = null; oldContext.onstatechange = null; setTimeout(() => { void oldContext.close().catch(() => {}); }, 450);
    } catch { /* The visible end state still signals completion. */ }
  }
  releaseAudio(); state = 'finished'; $('timer').textContent = '0:00'; $('timer').setAttribute('aria-label', t('Time is up')); $('time-fill').style.transform = 'scaleX(0)';
  $('final-count').value = round.count; setStatus(t('Finished'), ''); updateControls(); $('final-count').focus();
}
function renderHistory() {
  const [a, b] = selectedPair(), rows = sessions.filter(s => pairKey(...s.chords) === pairKey(a, b)).sort((a,b) => Date.parse(b.date)-Date.parse(a.date));
  $('log-context').textContent = t`${a} ↔ ${b} · this device`;
  $('session-total').textContent = `${rows.length} ${rows.length === 1 ? t("session") : t("sessions")}`;
  $('empty-log').hidden = rows.length > 0; $('personal-best').hidden = rows.length === 0;
  $('best').replaceChildren(document.createTextNode(`${Math.max(0, ...rows.map(s => s.count))} `));
  const small = document.createElement('small'); small.textContent = (locale === 'zh-Hant' ? '次轉換' : 'changes'); $('best').append(small);
  $('history').replaceChildren();
  for (const row of rows.slice(0, 8)) {
    const el = document.createElement('div'); el.className = 'history-row';
    const meta = document.createElement('div'), date = document.createElement('time'), detail = document.createElement('small'), score = document.createElement('div'), unit = document.createElement('span');
    date.dateTime = row.date; date.textContent = new Date(row.date).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
    detail.textContent = new Date(row.date).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }) + t(' · 1 minute');
    score.className = 'history-score'; score.textContent = row.count; unit.textContent = (locale === 'zh-Hant' ? '次轉換' : 'changes'); score.append(unit); meta.append(date, detail); el.append(meta, score); $('history').append(el);
  }
  $('export').hidden = sessions.length === 0;
}
$('listen').addEventListener('click', () => listen()); $('manual').addEventListener('click', manual);
$('cancel').addEventListener('click', () => { clearError(); reset(); }); $('discard').addEventListener('click', () => { clearError(); reset(); });
$('tap').addEventListener('click', () => registerHit(performance.now()));
document.addEventListener('keydown', event => {
  if (event.code === 'Space' && mode === 'manual' && ['armed', 'running'].includes(state) && !['INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'].includes(event.target.tagName) && (event.target.tagName !== 'BUTTON' || event.target === $('tap'))) {
    event.preventDefault(); if (!event.repeat) registerHit(performance.now());
  }
});
$('sensitivity').addEventListener('input', () => { const value = Number($('sensitivity').value); if (detector) detector.sensitivity = value; $('sensitivity-value').textContent = value < 35 ? t('Less sensitive') : value > 70 ? t('More sensitive') : t('Balanced'); });
for (const [id, delta] of [['minus', -1], ['plus', 1]]) $(id).addEventListener('click', () => { const value = Number($('final-count').value); $('final-count').value = Math.max(0, Math.min(999, (Number.isFinite(value) ? value : 0) + delta)); });
$('save').addEventListener('click', () => {
  if (state !== 'finished') return;
  const count = Number($('final-count').value);
  if (!$('final-count').value.trim() || !Number.isInteger(count) || count < 0 || count > 999) { showError(t('Enter a whole number between 0 and 999 before saving.')); return; }
  const next = [...sessions, { id: crypto.randomUUID(), chords: selectedPair(), count, date: new Date().toISOString(), mode }];
  let saved = false;
  if (!storageWarning) { try { localStorage.setItem(storageKey, JSON.stringify(next)); saved = true; } catch { /* Keep session in memory for export. */ } }
  sessions = next; clearError(); reset(saved ? t('Session saved') : t('Saved for this visit only')); renderHistory();
  if (!saved) showError(storageWarning || t('Browser storage is unavailable or full. Download your practice log now to keep this result after closing the page.'));
});
$('export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ version: 1, sessions }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'guitar-practice-log.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
document.addEventListener('visibilitychange', () => { if (document.hidden && ['requesting', 'checking', 'calibrating', 'armed', 'running'].includes(state)) interrupt(t('The round stopped because this page was hidden. Keep it visible while practising so no strums are missed.')); });
window.addEventListener('pagehide', () => { requestId++; releaseAudio(); });
renderHistory(); updateControls(); if (storageWarning) showError(storageWarning);

let deviceListRequest = 0;
async function refreshInputs() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const request = ++deviceListRequest;
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audioinput' && device.deviceId);
    if (request !== deviceListRequest) return;
    const selected = $('audio-input').value;
    const options = [new Option(t('System default'), '')];
    for (const [index, device] of devices.entries()) options.push(new Option(device.label || t`Audio input ${index + 1}`, device.deviceId));
    if (selected && !devices.some(device => device.deviceId === selected)) {
      const missing = new Option(t('Selected input unavailable — reconnect or choose another'), selected);
      missing.disabled = true; options.push(missing);
    }
    $('audio-input').replaceChildren(...options); $('audio-input').value = selected;
    $('input-help').textContent = devices.some(device => device.label)
      ? t("Select an input, then check the signal.")
      : t('Check input to allow access and show devices.');
  } catch {
    $('input-help').textContent = t('Device list unavailable. Allow audio permission with Check input, then refresh devices.');
  }
}
$('check-input').addEventListener('click', () => { if (state === 'checking') reset(); else void listen(true); });
$('refresh-inputs').addEventListener('click', () => { void refreshInputs(); });
$('input-boost').addEventListener('input', () => {
  $('input-boost-value').textContent = Number($('input-boost').value) === 0 ? t('Off') : t`+${$('input-boost').value} dB`;
});
$('audio-input').addEventListener('change', () => {
  // A boost for a quiet USB device may be excessive for another input.
  $('input-boost').value = '0'; $('input-boost-value').textContent = t('Off');
  const wasChecking = state === 'checking';
  clearError();
  if (wasChecking) { reset(); void listen(true); }
  else $('input-status').textContent = t('Input selected');
});
navigator.mediaDevices?.addEventListener?.('devicechange', () => { void refreshInputs(); });
void refreshInputs();
