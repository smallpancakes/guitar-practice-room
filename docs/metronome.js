import { t, lockLanguage } from './i18n.js';
import { Metronome, TapTempo, normalizeTempo } from './metronome-engine.js';
const $ = id => document.getElementById(id);
const key = 'practice-room.metronome.v1';
let settings = { bpm: 80, beats: 4, accent: true, volume: 0.6 };
try {
  const saved = JSON.parse(localStorage.getItem(key));
  if (saved && typeof saved === 'object') {
    if (Number.isFinite(saved.bpm)) settings.bpm = normalizeTempo(saved.bpm);
    if (Number.isInteger(saved.beats) && saved.beats >= 1 && saved.beats <= 6) settings.beats = saved.beats;
    if (typeof saved.accent === 'boolean') settings.accent = saved.accent;
    if (Number.isFinite(saved.volume) && saved.volume >= 0 && saved.volume <= 1) settings.volume = saved.volume;
  }
} catch { /* Defaults work when storage is blocked or invalid. */ }
let wakeLock, beatFlash;
const tapTempo = new TapTempo();
const player = new Metronome({
  onState(state, message) {
    lockLanguage(state !== 'stopped');
    $('metro-toggle').textContent = state === 'stopped' ? t('Start metronome') : state === 'starting' ? t('Cancel starting') : t('Stop metronome');
    $('metro-toggle').setAttribute('aria-pressed', String(state !== 'stopped'));
    $('metro-status').textContent = message || (state === 'playing' ? t('Playing') : state === 'starting' ? t('Starting…') : t('Ready'));
    document.body.classList.toggle('metro-playing', state === 'playing');
    if (state === 'stopped' && wakeLock) { void wakeLock.release().catch(() => {}); wakeLock = null; }
  },
  onBeat(beat) {
    clearTimeout(beatFlash);
    [...$('beat-lights').children].forEach((light, index) => {
      light.classList.toggle('beat-active', index === beat);
      if (index === beat) light.setAttribute('aria-current', 'true');
      else light.removeAttribute('aria-current');
    });
    if (beat !== null) beatFlash = setTimeout(() => {
      for (const light of $('beat-lights').children) light.classList.remove('beat-active');
    }, 120);
  },
});
function persist() {
  try { localStorage.setItem(key, JSON.stringify(settings)); } catch { /* Settings remain usable for this visit. */ }
}
function drawBeats() {
  $('beat-lights').replaceChildren();
  for (let i = 0; i < settings.beats; i++) {
    const beat = document.createElement('span');
    beat.className = 'beat-light'; beat.textContent = i + 1;
    beat.setAttribute('role', 'listitem'); beat.setAttribute('aria-label', t`Beat ${i + 1}${i === 0 && settings.accent ? t(', accented') : ''}`);
    $('beat-lights').append(beat);
  }
  $('beat-lights').classList.toggle('has-accent', settings.accent);
}
function setTempo(value) {
  settings.bpm = normalizeTempo(value, settings.bpm);
  $('bpm').value = $('tempo-slider').value = settings.bpm;
  $('tempo-minus').disabled = settings.bpm === 40;
  $('tempo-plus').disabled = settings.bpm === 240;
  player.configure(settings); persist();
}
$('tempo-minus').addEventListener('click', () => setTempo(settings.bpm - 1));
$('tempo-plus').addEventListener('click', () => setTempo(settings.bpm + 1));
$('bpm').addEventListener('change', () => setTempo($('bpm').value));
$('bpm').addEventListener('keydown', event => { if (event.key === 'Enter') { setTempo($('bpm').value); $('bpm').blur(); } });
$('tempo-slider').addEventListener('input', () => setTempo($('tempo-slider').value));
function recordTap() {
  const bpm = tapTempo.tap(performance.now());
  $('tap-help').textContent = bpm === null ? t('Tap again to set tempo') : t`Tempo: ${bpm} BPM`;
  if (bpm !== null) setTempo(bpm);
}
// Time the press, not the release: holding or sliding off must not lose a beat.
$('tap-tempo').addEventListener('pointerdown', event => {
  if (event.button === 0 && event.isPrimary) recordTap();
});
$('tap-tempo').addEventListener('click', event => {
  // Keyboard and assistive activation have no pointer press. Pointer clicks
  // already counted above must not add a second tap on release.
  if (event.detail === 0) recordTap();
});
$('beats-per-bar').value = settings.beats;
$('beats-per-bar').addEventListener('change', () => {
  settings.beats = Number($('beats-per-bar').value); player.configure(settings); drawBeats(); persist();
});
$('accent-first').checked = settings.accent;
$('accent-first').addEventListener('change', () => { settings.accent = $('accent-first').checked; player.configure(settings); drawBeats(); persist(); });
$('volume').value = Math.round(settings.volume * 100);
function updateVolumeLabel() { $('volume-value').textContent = settings.volume === 0 ? t('Muted') : `${Math.round(settings.volume * 100)}%`; }
$('volume').addEventListener('input', () => { settings.volume = Number($('volume').value) / 100; player.configure(settings); updateVolumeLabel(); persist(); });
async function toggle() {
  if (player.state !== 'stopped') { player.stop(); return; }
  $('metro-error').hidden = true;
  try {
    await player.start();
    if (player.state !== 'playing') return;
    try {
      const lock = await navigator.wakeLock?.request('screen');
      if (player.state === 'playing') wakeLock = lock;
      else await lock?.release();
    } catch { /* Keeping the screen awake is optional. */ }
  } catch (error) {
    $('metro-error').textContent = error.message || t('Audio could not start. Check your device’s sound settings and try again.');
    $('metro-error').hidden = false;
  }
}
$('metro-toggle').addEventListener('click', toggle);
document.addEventListener('keydown', event => {
  if (event.code === 'Space' && !event.repeat && !event.altKey && !event.ctrlKey && !event.metaKey && !event.target.closest('input, select, textarea, button, a, summary, [contenteditable]')) {
    event.preventDefault(); void toggle();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && player.state !== 'stopped') player.stop(t('Paused while you were away. Press Start to continue.'));
});
window.addEventListener('pagehide', () => player.stop());
setTempo(settings.bpm); drawBeats(); updateVolumeLabel();
