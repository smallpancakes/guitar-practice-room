import { usePlaybackSession } from './audio-session.js';
import { guitarSample, guitarBuffer } from './guitar-audio.js';
import { t, lockLanguage } from './i18n.js';
import { staffAnswer } from './staff-answer.js?v=2';
import { STRINGS, NAMES, SCOPES, position, locations, choose, readProgress, LEVELS, TIERS, LEVEL_KEY, readLevels, levelProgress, recordLevel, finishLevel, levelPool } from './fretboard-engine.js?v=2';
const $ = id => document.getElementById(id);
let storage;
try { storage = window.localStorage; } catch { /* Practice works without storage. */ }
const orientationKey = 'practice-room.fretboard.orientation.v1';
const narrowBoard = matchMedia('(max-width: 760px)');
const touchInput = matchMedia('(any-pointer: coarse)');
let orientationPreference;
try { const stored = storage?.getItem(orientationKey); if (['vertical', 'horizontal'].includes(stored)) orientationPreference = stored; } catch { /* Follow viewport size. */ }
const verticalBoard = () => orientationPreference ? orientationPreference === 'vertical' : narrowBoard.matches;
function refreshBoardLayout() {
  const scroll = $('board-scroll');
  board(); tabStops(); if (!onSix()) guide();
  scroll.scrollTo({ top: 0, left: 0 });
  $('board-vertical').setAttribute('aria-pressed', String(verticalBoard()));
  $('board-horizontal').setAttribute('aria-pressed', String(!verticalBoard()));
}
for (const direction of ['vertical', 'horizontal']) $('board-' + direction).addEventListener('click', () => {
  orientationPreference = direction;
  try { storage?.setItem(orientationKey, direction); } catch { /* Keep the choice for this visit. */ }
  refreshBoardLayout();
});
narrowBoard.addEventListener('change', () => { if (!orientationPreference) refreshBoardLayout(); });
const soundKey = 'practice-room.fretboard.sound.v1';
let soundOn = true;
try { soundOn = storage?.getItem(soundKey) !== 'off'; } catch { /* Sound remains available without storage. */ }
function renderSound() {
  $('fret-sound-label').textContent = soundOn ? t('Sound on') : t('Muted');
  $('fret-sound').setAttribute('aria-pressed', String(soundOn));
  $('fret-sound').setAttribute('aria-label', soundOn ? t('Mute fretboard') : t('Enable fretboard sound'));
}
$('fret-sound').addEventListener('click', () => {
  soundOn = !soundOn;
  if (!soundOn) { stopAudio(); setVisible('audio-error', false); }
  try { storage?.setItem(soundKey, soundOn ? 'on' : 'off'); } catch { /* Keep the choice for this visit. */ }
  renderSound();
});
renderSound();
let sixActive = false;
const onSix = () => sixActive;
let sixFound = new Map(), sixWrong;
const openNotesKey = 'practice-room.fretboard.open-notes.v1';
try { $('six-open-notes').checked = storage?.getItem(openNotesKey) !== 'off'; } catch { /* Keep the default labels. */ }
const hideOpenNotes = () => !$('six-open-notes').checked;
$('six-open-notes').addEventListener('change', () => {
  try { storage?.setItem(openNotesKey, $('six-open-notes').checked ? 'on' : 'off'); } catch { /* Keep the choice for this visit. */ }
  render();
});
const accidentalsKey = 'practice-room.fretboard.accidentals.v1';
try { $('six-accidentals').checked = storage?.getItem(accidentalsKey) === 'on'; } catch { /* Default to natural notes. */ }
function sixPitches() {
  return NAMES.map((name, pitch) => pitch).filter(pitch => $('six-accidentals').checked || !NAMES[pitch].includes('♯'));
}
function updateSixNotes() {
  const previous = $('six-note').value || '4';
  $('six-note').replaceChildren(...sixPitches().map(pitch => new Option(NAMES[pitch], pitch)));
  $('six-note').value = sixPitches().includes(Number(previous)) ? previous : '4';
  return previous !== $('six-note').value;
}
updateSixNotes();
$('six-accidentals').addEventListener('change', () => {
  try { storage?.setItem(accidentalsKey, $('six-accidentals').checked ? 'on' : 'off'); } catch { /* Keep the choice for this visit. */ }
  if (updateSixNotes()) resetSix();
});
function resetSix() {
  sixFound.clear(); sixWrong = undefined; $('feedback').textContent = '';
  render(); $('board-scroll').scrollTo({ top: 0, left: 0 });
}
$('six-note').addEventListener('change', resetSix);
function renderSix() {
  lockLanguage(false);
  $('practice-mode').disabled = false;
  $('stage-title').textContent = t('Note hunt');
  $('round-count').textContent = t`${sixFound.size} / 6 strings`;
  $('prompt').textContent = t`Find ${NAMES[Number($('six-note').value)]} on every string`;
  $('prompt-help').textContent = t('One position per string · frets 0–12');
  for (const id of ['start', 'explore', 'reveal', 'remembered', 'missed', 'advance', 'typed-answer-form', 'note-answers', 'staff-answer', 'notation-error']) setVisible(id, false);
  setVisible('round-count', true); setVisible('next', sixFound.size === 6);
  $('next').textContent = t('Next note');
  $('keyboard-help').textContent = t('Keyboard: Tab to a control, then Enter to use it. Arrow keys move between fret positions and note choices.');
  board(); tabStops();
}
function answerSix(p) {
  if (sixFound.has(p.string)) return;
  if (p.midi % 12 === Number($('six-note').value)) {
    sixFound.set(p.string, p.id); sixWrong = undefined;
    $('feedback').textContent = sixFound.size === 6 ? t('All six found') : t`${sixFound.size} / 6 strings`;
  } else {
    sixWrong = p.id; $('feedback').textContent = t`${p.name} · try another fret`;
  }
  render();
  if (sixFound.size === 6) {
    $('next').focus({ preventScroll: true });
    $('next').scrollIntoView({ block: 'center', inline: 'nearest' });
  }
  else {
    const focus = sixFound.has(p.string) ? [...$('fretboard').querySelectorAll('.fret')].find(b => !sixFound.has(Number(b.dataset.position.split(':')[0]))) : $('fretboard').querySelector(`[data-position="${p.id}"]`);
    if (focus) { $('fretboard').querySelectorAll('.fret').forEach(b => b.tabIndex = -1); focus.tabIndex = 0; focus.focus({ preventScroll: true }); }
  }
}
const onStaff = () => $('practice-mode').value === 'staff';
if (new URLSearchParams(location.search).get('answer') === 'staff') $('practice-mode').value = 'staff';
const modeKey = name => onStaff() ? name.replace('fretboard.', 'fretboard.staff.') : name;
const modeStorage = { getItem: name => storage?.getItem(modeKey(name)) };
let path = readLevels(modeStorage);
let history = readProgress(modeStorage), scope = path.selected, phase = 'learn', pool = locations(scope);
let target, question = 0, score = 0, answered = false, assisted = false, questionType = 'find';
let seen = new Set(), audio, voices = new Set();
let saved = Boolean(storage);
const key = 'practice-room.fretboard.v1';
const locationText = p => hideOpenNotes() ? t`String ${p.string + 1}, ${p.fret === 0 ? t('open') : t`fret ${p.fret}`}` : t`${STRINGS[p.string].name} string, ${p.fret === 0 ? t('open') : t`fret ${p.fret}`}`;
let notationReady = false;
const staffInput = staffAnswer($('staff-answer'), n => { if (phase === 'quiz' && !answered && onStaff()) answer(n.midi === target.midi, null, t`written ${n.id}`); });
const onGuitar = () => $('practice-mode').value === 'guitar';
for (const [tier, title] of TIERS.entries()) {
  const group = document.createElement('optgroup'); group.label = t`Tier ${tier + 1} · ${title}`;
  for (const level of LEVELS.filter(l => l.tier === tier)) group.append(new Option(`${level.number}. ${level.title}`, level.id));
  $('scope').append(group);
}
$('scope').value = scope;
function savePath() {
  try { storage.setItem(modeKey(LEVEL_KEY), JSON.stringify(path)); } catch { saved = false; }
}
const openTiers = new Set([LEVELS.find(l => l.id === scope).tier]);
let shownScope;
function renderPath() {
  const levelList = $('path-list'), previousScroll = levelList.scrollTop;
  const level = LEVELS.find(l => l.id === scope), progress = levelProgress(path, scope);
  $('current-level').textContent = t`Level ${level.number} of ${LEVELS.length} · ${TIERS[level.tier]}`;
  $('level-meter').max = progress.total; $('level-meter').value = progress.earned;
  $('level-goal').textContent = t`${progress.earned} / ${progress.total} recalls`;
  const complete = LEVELS.filter(l => levelProgress(path, l.id).complete).length;
  $('path-count').textContent = t`${complete} / ${LEVELS.length} complete`;
  $('path-list').replaceChildren();
  for (const [tier, title] of TIERS.entries()) {
    const levels = LEVELS.filter(l => l.tier === tier), done = levels.filter(l => levelProgress(path, l.id).complete).length;
    const section = document.createElement('details'); section.className = 'tier-section'; section.open = openTiers.has(tier);
    const summary = document.createElement('summary');
    const titleText = document.createElement('span'); titleText.textContent = title;
    const count = document.createElement('span'); count.className = 'tier-count'; count.textContent = `${done} / ${levels.length}`; count.setAttribute('aria-label', t`${done} of ${levels.length} levels complete`);
    summary.append(titleText, count); section.append(summary);
    section.addEventListener('toggle', () => { if (section.isConnected) { if (section.open) openTiers.add(tier); else openTiers.delete(tier); } });
    const list = document.createElement('ol'); list.className = 'level-list';
    for (const item of levels) {
      const li = document.createElement('li'), button = document.createElement('button');
      const status = levelProgress(path, item.id);
      const number = document.createElement('span'); number.className = 'level-number'; number.textContent = item.number; number.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span'); name.className = 'level-name'; name.textContent = item.title;
      const detail = document.createElement('span'); detail.className = 'level-status'; detail.textContent = status.complete ? t('Complete') : t`${status.earned} / ${status.total} recalls`;
      button.append(number, name, detail);
      button.setAttribute('aria-label', t`Level ${item.number}: ${item.title}, ${detail.textContent}`);
      button.disabled = phase === 'quiz'; if (item.id === scope) button.setAttribute('aria-current', 'step');
      button.addEventListener('click', () => { selectLevel(item.id); $('scope').focus(); }); li.append(button); list.append(li);
    }
    section.append(list); $('path-list').append(section);
  }
  // Keep the current level in view without scrolling the exercise itself.
  if (shownScope !== scope) {
    shownScope = scope;
    const current = levelList.querySelector('[aria-current="step"]');
    const offset = current.getBoundingClientRect().top - levelList.getBoundingClientRect().top;
    levelList.scrollTop = offset - (levelList.clientHeight - current.offsetHeight) / 2;
  } else levelList.scrollTop = previousScroll;
  const next = LEVELS.find(l => l.number > level.number && !levelProgress(path, l.id).complete) || LEVELS.find(l => !levelProgress(path, l.id).complete);
  setVisible('advance', phase !== 'quiz' && progress.complete && Boolean(next));
  if (next) { $('advance').textContent = t`Try level ${next.number}`; $('advance').dataset.level = next.id; }
}
function selectLevel(id) {
  scope = id; openTiers.add(LEVELS.find(l => l.id === scope).tier); pool = locations(scope); path.selected = scope; $('scope').value = scope; savePath();
  setVisible('level-celebration', false); explore();
}
$('advance').addEventListener('click', () => { selectLevel($('advance').dataset.level); $('start').focus(); });
function setVisible(id, visible) { $(id).hidden = !visible; }
function guide() {
  $('note-guide').replaceChildren();
  const testing = phase === 'quiz';
  document.querySelector('.note-guide').hidden = testing;
  $('guide-intro').textContent = testing ? t('Reference hidden during practice.')
    : scope === 'starter' ? t('C, D, E on the B string') : t('Notes in this level');
  if (!testing && pool.length <= 12) {
    for (const p of pool) {
      const row = document.createElement('div'); row.className = 'guide-row';
      const name = document.createElement('strong'); name.textContent = p.name;
      const loc = document.createElement('span'); loc.textContent = `${SCOPES[scope].strings.length > 1 ? (hideOpenNotes() ? t`String ${p.string + 1}` : STRINGS[p.string].name) + ' · ' : ''}${p.fret ? t`Fret ${p.fret}` : t('Open string')}`;
      row.append(name, loc); $('note-guide').append(row);
    }
  } else if (!testing) {
    const p = document.createElement('p'); p.textContent = verticalBoard() ? t('Left: thickest string. 0: open string. Fret 12: one octave higher.') : t('Top: thinnest string. 0: open string. Fret 12: one octave higher.'); $('note-guide').append(p);
  }
  const hits = pool.reduce((sum, p) => sum + (history[p.id]?.hits || 0), 0);
  $('progress').textContent = saved ? (hits ? t`${hits} unassisted recalls` : t('Saved in this browser')) : t('Storage is unavailable. Practice works, but progress lasts for this visit only.');
}
function board() {
  const config = SCOPES[onSix() ? 'full' : scope], board = $('fretboard'); board.replaceChildren();
  const vertical = verticalBoard();
  board.closest('.fret-panel').classList.toggle('vertical-practice', vertical);
  const strings = vertical ? [...config.strings].reverse() : config.strings;
  board.classList.toggle('short-board', !vertical && config.max === 5);
  board.classList.toggle('vertical-board', vertical);
  board.style.gridTemplateColumns = vertical ? `28px repeat(${strings.length}, minmax(0, 1fr)) 16px` : `48px repeat(${config.max + 1}, minmax(44px, 1fr))`;
  board.style.minWidth = vertical ? '0' : `${48 + (config.max + 1) * 44}px`;
  $('board-vertical').setAttribute('aria-pressed', String(vertical));
  $('board-horizontal').setAttribute('aria-pressed', String(!vertical));
  $('board-scroll').setAttribute('aria-label', vertical ? t('Fretboard; frets run from top to bottom') : t('Fretboard; scroll sideways for more frets'));
  function place(element, row, column) { if (vertical) { element.style.gridRow = row; element.style.gridColumn = column; } }

  const blank = document.createElement('span'); blank.className = 'fret-label'; blank.textContent = t('Fret'); place(blank, 1, 1); board.append(blank);
  for (let fret = 0; fret <= config.max; fret++) { const n = document.createElement('span'); n.className = 'fret-label'; n.textContent = fret; place(n, fret + 2, 1); board.append(n); }
  const markerLabel = document.createElement('span'); markerLabel.className = 'marker-label'; markerLabel.textContent = vertical ? '' : t('Dots'); place(markerLabel, 1, strings.length + 2); board.append(markerLabel);
  for (let fret = 0; fret <= config.max; fret++) {
    const marker = document.createElement('span'); marker.className = 'fret-marker'; place(marker, fret + 2, strings.length + 2);
    const count = fret === 12 ? 2 : [3, 5, 7, 9].includes(fret) ? 1 : 0;
    if (count) {
      marker.setAttribute('role', 'img');
      marker.setAttribute('aria-label', t`${count === 2 ? t('Double') : t('Single')} dot marker at fret ${fret}`);
      for (let i = 0; i < count; i++) { const dot = document.createElement('i'); dot.setAttribute('aria-hidden', 'true'); marker.append(dot); }
    } else marker.setAttribute('aria-hidden', 'true');
    board.append(marker);
  }
  for (const string of strings) {
    const label = document.createElement('span'); label.className = 'string-label'; label.textContent = hideOpenNotes() ? String(string + 1) : STRINGS[string].name; place(label, 1, strings.indexOf(string) + 2); board.append(label);
    for (let fret = 0; fret <= config.max; fret++) {
      const p = position(string, fret), eligible = onSix() || pool.some(note => note.id === p.id);
      const b = document.createElement('button'); b.className = `fret${fret === 0 ? ' open' : ''}`; b.dataset.position = p.id; place(b, fret + 2, strings.indexOf(string) + 2);
      b.style.setProperty('--string-width', `${1 + string * .3}px`);
      const found = onSix() && sixFound.get(string) === p.id;
      const showNames = onSix() ? found || sixWrong === p.id : phase !== 'quiz' || answered;
      const marked = phase === 'quiz' && questionType === 'name' && p.id === target.id;
      b.disabled = !onSix() && phase !== 'quiz' && !eligible;
      b.setAttribute('aria-label', `${locationText(p)}${showNames && eligible ? `, ${p.name}` : ''}${marked ? t(', highlighted note') : ''}`);
      if (showNames && eligible) b.classList.add('available');
      if (found) b.classList.add('correct');
      if (onSix() && sixWrong === p.id) b.classList.add('wrong');
      if (marked) b.classList.add('target');
      if (phase === 'quiz' && answered && p.id === target.id) b.classList.add('correct');
      const dot = document.createElement('span'); dot.textContent = showNames && eligible ? p.name.split(' / ')[0] : marked ? '?' : '';
      b.append(dot); b.addEventListener('click', () => {
        void playNotes([p]);
        if (onSix()) { answerSix(p); return; }
        if (phase === 'quiz') {
          if (answered || questionType === 'name' || onGuitar()) return;
          const correct = p.id === target.id;
          answer(correct, p);
        }
        else {
          $('feedback').textContent = t`${p.name} · ${locationText(p)}`;
        }
      }); board.append(b);
    }
  }
  if (vertical) [...board.children].sort((a, b) => Number(a.style.gridRow) - Number(b.style.gridRow) || Number(a.style.gridColumn) - Number(b.style.gridColumn)).forEach(el => board.append(el));
  $('board-caption').textContent = config.strings.length === 1 ? (hideOpenNotes() ? t`String ${config.strings[0] + 1} · 0: open` : t`${STRINGS[config.strings[0]].name} string · 0: open`) : vertical ? t('Left: thickest string · 0: open') : t('Top: thinnest string · 0: open');
}
function nameAnswers() {
  $('note-answers').replaceChildren();
  setVisible('note-answers', phase === 'quiz' && questionType === 'name' && !onGuitar() && !onStaff());
  if ($('note-answers').hidden) return;
  const names = NAMES.filter(n => pool.some(p => p.name === n));
  for (const name of names) {
    const b = document.createElement('button'); b.textContent = name; b.disabled = answered;
    b.addEventListener('click', () => answer(name === target.name, null, name)); $('note-answers').append(b);
  }
}
function focusQuestion() {
  if (onStaff()) staffInput.focus();
  else if (onGuitar()) $('reveal').focus();
  else if (touchInput.matches) {
    const control = questionType === 'name' ? $('note-answers').querySelector('button') : $('fretboard').querySelector('.fret[tabindex="0"]');
    control?.focus({ preventScroll: true });
  }
  else $('typed-answer').focus();
}
function typedAnswer() {
  const active = phase === 'quiz' && !onGuitar() && !onStaff() && !answered;
  setVisible('typed-answer-form', active);
  if (!active) return;
  const fretQuestion = questionType === 'find';
  $('typed-answer-label').textContent = fretQuestion ? (hideOpenNotes() ? t`Fret on string ${target.string + 1}` : t`Fret on the ${STRINGS[target.string].name} string`) : t('Note name');
  $('typed-answer').inputMode = fretQuestion ? 'numeric' : 'text';
  $('typed-answer').placeholder = fretQuestion ? `0–${SCOPES[scope].max}` : t('e.g. C, C# or Db');
  $('typed-answer-help').textContent = fretQuestion ? t`Type 0–${SCOPES[scope].max}, then Enter. The string is already selected by the question.` : t('Type a note, then Enter. Use # for sharp or b for flat; either spelling works.');
}
$('typed-answer-form').addEventListener('submit', event => {
  event.preventDefault();
  if (phase !== 'quiz' || answered || onGuitar() || onStaff()) return;
  const value = $('typed-answer').value.trim();
  let valid = false, correct = false, picked = null;
  if (questionType === 'find') {
    valid = /^\d{1,2}$/.test(value) && Number(value) <= SCOPES[scope].max;
    if (valid) { picked = position(target.string, Number(value)); correct = picked.id === target.id; }
  } else {
    const normalized = value.replaceAll('♯', '#').replaceAll('♭', 'b');
    const match = /^([a-g])([#b]?)$/i.exec(normalized);
    valid = Boolean(match);
    if (match) {
      const natural = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1].toUpperCase()];
      const pitch = (natural + (match[2] === '#' ? 1 : match[2] ? -1 : 0) + 12) % 12;
      correct = pitch === target.midi % 12;
    }
  }
  if (!valid) {
    $('typed-answer-error').textContent = questionType === 'find' ? t`Enter a whole fret number from 0 to ${SCOPES[scope].max}.` : t("Enter a note from A to G, with # or b if needed (for example C# or Db).");
    setVisible('typed-answer-error', true); $('typed-answer').setAttribute('aria-invalid', 'true'); $('typed-answer').focus(); return;
  }
  answer(correct, picked, value.toUpperCase());
});
$('typed-answer').addEventListener('input', () => { setVisible('typed-answer-error', false); $('typed-answer').removeAttribute('aria-invalid'); });
// Standard buttons handle Enter/Space; ignore key-repeat to avoid accidental answers.
document.addEventListener('keydown', event => {
  if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
});
function arrowNavigation(container, selector, spatial) {
  container.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const current = event.target.closest(selector);
    if (!current || current.disabled) return;
    const buttons = [...container.querySelectorAll(selector)].filter(b => !b.disabled);
    let next;
    if (spatial) {
      const [string, fret] = current.dataset.position.split(':').map(Number);
      const acrossStrings = verticalBoard() ? ['ArrowLeft', 'ArrowRight'].includes(event.key) : ['ArrowUp', 'ArrowDown'].includes(event.key);
      const line = buttons.filter(b => Number(b.dataset.position.split(':')[acrossStrings ? 1 : 0]) === (acrossStrings ? fret : string));
      line.sort((a, b) => {
        const index = acrossStrings ? 0 : 1;
        return (Number(a.dataset.position.split(':')[index]) - Number(b.dataset.position.split(':')[index])) * (acrossStrings && verticalBoard() ? -1 : 1);
      });
      const index = line.indexOf(current);
      const direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
      next = event.key === 'Home' ? line[0] : event.key === 'End' ? line.at(-1) : line[Math.max(0, Math.min(line.length - 1, index + direction))];
    } else {
      const index = buttons.indexOf(current), direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
      next = event.key === 'Home' ? buttons[0] : event.key === 'End' ? buttons.at(-1) : buttons[(index + direction + buttons.length) % buttons.length];
    }
    if (next) { event.preventDefault(); buttons.forEach(b => b.tabIndex = -1); next.tabIndex = 0; next.focus(); }
  });
}
arrowNavigation($('fretboard'), '.fret', true);
arrowNavigation($('note-answers'), 'button', false);
function tabStops() {
  for (const [id, selector] of [['fretboard', '.fret'], ['note-answers', 'button']]) {
    const buttons = [...$(id).querySelectorAll(selector)].filter(b => !b.disabled);
    buttons.forEach((b, i) => { b.tabIndex = i === 0 ? 0 : -1; });
  }
}
function render() {
  $('exercise-levels').setAttribute('aria-pressed', String(!onSix()));
  $('exercise-six').setAttribute('aria-pressed', String(onSix()));
  $('practice-mode').closest('label').hidden = onSix();
  document.querySelector('.level-summary').hidden = onSix();
  document.querySelector('.sidebar').hidden = onSix();
  $('scope').closest('label').hidden = onSix();
  setVisible('six-note-control', onSix());
  setVisible('open-notes-control', true);
  if (onSix()) { renderSix(); return; }
  lockLanguage(phase === 'quiz');
  $('scope').disabled = phase === 'quiz'; $('practice-mode').disabled = phase === 'quiz';
  setVisible('round-count', phase !== 'learn');
  setVisible('start', phase !== 'quiz'); $('start').textContent = phase === 'result' ? t('Practice another 6') : t('Try 6 questions');
  setVisible('explore', phase !== 'learn');
  setVisible('reveal', phase === 'quiz' && !answered);
  setVisible('next', phase === 'quiz' && answered && !(onGuitar() && assisted));
  setVisible('remembered', phase === 'quiz' && answered && onGuitar() && assisted);
  setVisible('missed', phase === 'quiz' && answered && onGuitar() && assisted);
  $('next').textContent = question === 6 ? t('See results') : t('Next question');
  if (phase === 'quiz') renderQuestionPrompt();
  board(); nameAnswers(); guide(); renderPath(); typedAnswer(); tabStops();
  setVisible('staff-answer', onStaff() && phase === 'quiz');
  if (onStaff() && answered && target) staffInput.reveal(target.midi, assisted);
  $('start').disabled = onStaff() && !notationReady;
  $('keyboard-help').textContent = phase === 'quiz' ? (answered ? t('Press Enter to use the focused button. Tab changes your choice.') : onGuitar() ? t('Play the note, then press Enter to reveal. Tab chooses I knew it or Still learning; Enter confirms.') : onStaff() ? t("Tap the staff or use ↑ / ↓ to place a note. Enter checks it. Tab reaches the accidental selector.") : t('Type your answer, then Enter. After feedback, Enter moves on. Tab reaches Show answer and other controls.')) : t('Keyboard: Tab to a control, then Enter to use it. Arrow keys move between fret positions and note choices.');
}
function renderQuestionPrompt() {
  const sameName = pool.filter(p => p.string === target.string && p.name === target.name);
  const octave = sameName.length > 1 ? (target.midi === Math.min(...sameName.map(p => p.midi)) ? t('lower') : t('higher')) : '';
  const requestedNote = octave ? t`the ${octave} ${target.name}` : target.name;
  $('prompt').textContent = questionType === 'find' ? (hideOpenNotes() ? t`${onGuitar() ? t('Play') : t('Find')} ${requestedNote} on string ${target.string + 1}` : t`${onGuitar() ? t('Play') : t('Find')} ${requestedNote} on the ${STRINGS[target.string].name} string`) : t('What note is highlighted?');
  $('prompt-help').textContent = onGuitar() ? t`Play the note, say its name, then reveal the location to check yourself.${target.fret === 0 || target.fret === 12 ? t` Use fret ${target.fret === 0 ? t("0 (open)") : '12'}.` : ''}` : questionType === 'find' ? t`Tap its location on the fretboard.${target.fret === 0 || target.fret === 12 ? t` Use fret ${target.fret === 0 ? t("0 (open)") : '12'} for this question.` : ''}` : t`${locationText(target)}. Choose the note name below.`;
  if (questionType === 'find' && octave) $('prompt-help').textContent = t`This string has two ${target.name} notes in this level, an octave apart. Choose the ${octave} pitch${octave === t('lower') ? t(', nearer the nut') : t(', farther up the neck')}.`;
  if (onStaff()) { $('prompt').textContent = t('Put this guitar position on the staff'); $('prompt-help').textContent = t`${locationText(target)}. Place its written pitch in guitar treble notation, including the octave.`; }
}
function nextQuestion() {
  const previous = target?.id;
  target = choose(levelPool(path, scope), history, seen, previous); question++; answered = false; assisted = false;
  questionType = onStaff() ? 'name' : onGuitar() || question % 2 === 1 ? 'find' : 'name';
  if (onStaff()) staffInput.reset();
  $('stage-title').textContent = onGuitar() ? t('Find it on your guitar') : t('Practice');
  $('round-count').textContent = t`${question} of 6`;
  $('feedback').textContent = '';
  $('typed-answer').value = ''; $('typed-answer').removeAttribute('aria-invalid'); setVisible('typed-answer-error', false);
  render();
  if (questionType === 'name') $('fretboard').querySelector('.target')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  focusQuestion();
}
function record(correct) {
  const item = history[target.id] || { hits: 0, misses: 0 };
  history[target.id] = { hits: item.hits + Number(correct), misses: correct ? Math.max(0, item.misses - 1) : item.misses + 1 };
  if (correct) { score++; recordLevel(path, scope, target.id); savePath(); }
  try { storage.setItem(modeKey(key), JSON.stringify(history)); saved = true; } catch { saved = false; }
}
function answer(correct, picked, name) {
  if (answered) return;
  if (questionType === 'name') void playNotes([target]);
  answered = true; record(correct);
  $('feedback').textContent = correct ? t`Yes! ${target.name} is on the ${locationText(target)}.` : t`${picked ? t`${picked.name} is at ${locationText(picked)}.` : name ? t`You chose ${name}.` : t('Keep practicing this one.')} ${target.name} is on the ${locationText(target)}. We’ll revisit notes you miss.`;
  render();
  if (picked && !correct) $('fretboard').querySelector(`[data-position="${picked.id}"]`)?.classList.add('wrong');
  $('next').focus({ preventScroll: onStaff() });
  if (onStaff()) $('staff-answer').scrollIntoView({ block: 'start' });
}
$('reveal').addEventListener('click', () => {
  if (answered) return;
  assisted = true; answered = true;
  if (!onGuitar()) record(false);
  $('feedback').textContent = `${target.name} · ${locationText(target)}. ${onGuitar() ? t('Did you find it before revealing the answer?') : t('Hint used; no progress earned.')}`;
  render(); $(onGuitar() ? 'remembered' : 'next').focus({ preventScroll: onStaff() });
  if (onStaff()) $('staff-answer').scrollIntoView({ block: 'start' });
});
for (const [id, correct] of [['remembered', true], ['missed', false]]) $(id).addEventListener('click', () => {
  if (!assisted || !answered) return;
  assisted = false; record(correct); render(); $('next').focus();
});
$('start').addEventListener('click', () => { if (onStaff() && !notationReady) return; stopAudio(); phase = 'quiz'; question = 0; score = 0; seen.clear(); nextQuestion(); });
$('next').addEventListener('click', () => {
  if (onSix()) {
    if (sixFound.size !== 6) return;
    const current = Number($('six-note').value);
    const choices = sixPitches().filter(pitch => pitch !== current);
    $('six-note').value = choices[Math.floor(Math.random() * choices.length)];
    resetSix(); $('fretboard').querySelector('.fret').focus({ preventScroll: true });
    // Cancel any completion scroll, then return after the new layout settles.
    window.scrollTo({ top: window.scrollY, left: window.scrollX, behavior: 'instant' });
    requestAnimationFrame(() => window.scrollTo({ top: $('question-start').getBoundingClientRect().top + window.scrollY }));
    return;
  }
  if (!answered || (onGuitar() && assisted)) return;
  if (question < 6) { nextQuestion(); }
  else {
    phase = 'result';
    const completedNow = finishLevel(path, scope); savePath();
    if (completedNow) {
      const level = LEVELS.find(l => l.id === scope);
      $('level-celebration').textContent = t`Level ${level.number} complete`;
      setVisible('level-celebration', true);
    }
    $('stage-title').textContent = t('Round complete'); $('round-count').textContent = t('6 questions');
    $('prompt').textContent = t`${score} of 6 recalled ${onGuitar() ? t('by self-check') : t('without help')}`;
    $('prompt-help').textContent = score === 6 ? '' : '';
    $('feedback').textContent = completedNow ? t('Level complete') : t('Progress saved');
    render(); $('prompt').setAttribute('role', 'status'); $('start').focus();
  }
});
function explore() {
  stopAudio(); phase = 'learn'; target = undefined;
  $('stage-title').textContent = t('Explore'); $('round-count').textContent = '';
  $('prompt').textContent = scope === 'starter' ? t('Start with C, D & E') : t('Notes in this level');
  $('prompt-help').textContent = t('Tap a note to hear it.');
  $('feedback').textContent = '';
  render();
}
$('explore').addEventListener('click', explore);
for (const [id, six] of [['exercise-levels', false], ['exercise-six', true]]) {
  $(id).addEventListener('click', () => {
    if (sixActive === six) return;
    sixActive = six; sixFound.clear(); sixWrong = undefined;
    setVisible('level-celebration', false); explore();
  });
}
$('practice-mode').addEventListener('change', () => { sixFound.clear(); sixWrong = undefined; path = readLevels(modeStorage); history = readProgress(modeStorage); scope = path.selected; pool = locations(scope); $('scope').value = scope; openTiers.add(LEVELS.find(l => l.id === scope).tier); setVisible('level-celebration', false); explore(); });
$('scope').addEventListener('change', () => selectLevel($('scope').value));
function stopAudio() {
  audioGeneration++;
  for (const node of voices) { try { node.stop(); } catch { /* Already stopped. */ } }
  voices.clear();
}
let audioGeneration = 0;
async function playNotes(notes) {
  if (!soundOn) return;
  stopAudio(); const generation = ++audioGeneration;
  try {
    usePlaybackSession();
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!audio || audio.state === 'closed') audio = new Audio();
    await audio.resume();
    if (generation !== audioGeneration || !soundOn || document.hidden) return;
    setVisible('audio-error', false);
    const context = audio;
    const loaded = await Promise.all(notes.filter(Boolean).map(async note => {
      const sample = guitarSample(note.midi);
      return { ...sample, buffer: await guitarBuffer(context, sample.url) };
    }));
    if (generation !== audioGeneration || !soundOn || document.hidden || context !== audio) return;
    const start = context.currentTime + .01;
    loaded.forEach(({ buffer, rate }, index) => {
      const source = context.createBufferSource(), envelope = context.createGain(), at = start + index * .5;
      source.buffer = buffer; source.playbackRate.value = rate;
      const duration = Math.min(buffer.duration / rate, 4);
      envelope.gain.setValueAtTime(.7, at);
      envelope.gain.setValueAtTime(.7, at + Math.max(0, duration - .12));
      envelope.gain.linearRampToValueAtTime(0, at + duration);
      source.connect(envelope); envelope.connect(context.destination); voices.add(source);
      source.onended = () => { voices.delete(source); source.disconnect(); envelope.disconnect(); };
      source.start(at); source.stop(at + duration);
    });
  } catch { if (generation !== audioGeneration || !soundOn) return; $('audio-error').textContent = t('Sound could not start in this browser. You can keep practicing visually or play the notes on your guitar.'); setVisible('audio-error', true); }
}
function releaseAudio() { audioGeneration++; stopAudio(); if (audio && audio.state !== 'closed') audio.close().catch(() => {}); audio = undefined; }
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAudio(); });
window.addEventListener('pagehide', releaseAudio);
// A separate reminder leaves the original question in normal document flow.
const floatingQuestion = document.createElement('div');
floatingQuestion.id = 'floating-question'; floatingQuestion.className = 'floating-question';
floatingQuestion.hidden = true; floatingQuestion.setAttribute('aria-hidden', 'true');
const floatingTitle = document.createElement('strong'), floatingHelp = document.createElement('p');
floatingQuestion.append(floatingTitle, floatingHelp); document.body.append(floatingQuestion);
const originalQuestion = $('question-start'), practicePanel = originalQuestion.closest('.fret-panel');
let reminderFrame;
function updateQuestionReminder() {
  reminderFrame = undefined;
  const panel = practicePanel.getBoundingClientRect();
  floatingTitle.textContent = onSix() ? t`Find ${NAMES[Number($('six-note').value)]} · every string` : $('prompt').textContent;
  floatingHelp.textContent = onSix() ? '' : $('prompt-help').textContent;
  floatingHelp.hidden = onSix() || !floatingHelp.textContent;
  floatingQuestion.style.left = `${panel.left + practicePanel.clientLeft}px`;
  floatingQuestion.style.width = `${practicePanel.clientWidth}px`;
  floatingQuestion.hidden = !verticalBoard() || originalQuestion.getBoundingClientRect().bottom > 0 || panel.bottom <= 0;
  if (!floatingQuestion.hidden) floatingQuestion.style.top = `${Math.min(0, panel.bottom - floatingQuestion.offsetHeight)}px`;
}
function scheduleQuestionReminder() {
  if (reminderFrame === undefined) reminderFrame = requestAnimationFrame(updateQuestionReminder);
}
window.addEventListener('scroll', scheduleQuestionReminder, { passive: true });
window.addEventListener('resize', scheduleQuestionReminder);
new MutationObserver(scheduleQuestionReminder).observe(originalQuestion, { childList: true, subtree: true, characterData: true });
new MutationObserver(scheduleQuestionReminder).observe(practicePanel, { attributes: true, attributeFilter: ['class'] });
document.fonts.ready.then(scheduleQuestionReminder);
explore();

document.fonts.load('80px Bravura', '\uE050').then(faces => { if (!faces.length) throw Error(t('Missing font')); notationReady = true; render(); }).catch(() => { $('notation-error').textContent = t('The notation font could not load. Reload to use staff answers; note-name practice is still available.'); setVisible('notation-error', true); });
