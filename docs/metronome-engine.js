import { usePlaybackSession } from './audio-session.js';
import { t } from './i18n.js';
export const MIN_BPM = 40;
export const MAX_BPM = 240;
export function normalizeTempo(value, fallback = 80) {
  const number = Number(value);
  return value === '' || !Number.isFinite(number) ? fallback : Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(number)));
}

// Keep beat times on the audio clock; JavaScript only fills a short look-ahead queue.
export class BeatClock {
  constructor(bpm = 80, beats = 4) {
    this.bpm = normalizeTempo(bpm);
    this.beats = beats;
    this.nextTime = 0;
    this.nextBeat = 0;
  }
  reset(now) { this.nextTime = now + 0.04; this.nextBeat = 0; }
  due(now) {
    const events = [];
    // A stalled tab must not play a burst of missed beats.
    if (this.nextTime < now) this.reset(now);
    while (this.nextTime < now + 0.1) {
      events.push({ time: this.nextTime, beat: this.nextBeat });
      this.nextTime += 60 / this.bpm;
      this.nextBeat = (this.nextBeat + 1) % this.beats;
    }
    return events;
  }
}

export class TapTempo {
  constructor() { this.times = []; }
  tap(now) {
    const last = this.times.at(-1);
    if (last !== undefined && now - last < 150) return null;
    if (last !== undefined && now - last > 2000) this.times = [];
    this.times.push(now);
    this.times = this.times.slice(-5);
    if (this.times.length < 2) return null;
    const interval = (now - this.times[0]) / (this.times.length - 1);
    return normalizeTempo(60000 / interval);
  }
}

export class Metronome {
  constructor({ onState = () => {}, onBeat = () => {}, createContext } = {}) {
    this.onState = onState;
    this.onBeat = onBeat;
    this.createContext = createContext || (() => {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error(t('This browser cannot play the metronome. Try a current Chrome, Safari, Firefox or Edge browser.'));
      return new Audio();
    });
    this.clock = new BeatClock();
    this.accent = true;
    this.volume = 0.6;
    this.state = 'stopped';
    this.generation = 0;
    this.nodes = new Set();
    this.visuals = [];
  }
  configure({ bpm = this.clock.bpm, beats = this.clock.beats, accent = this.accent, volume = this.volume }) {
    const meterChanged = beats !== this.clock.beats;
    this.clock.bpm = normalizeTempo(bpm, this.clock.bpm);
    this.clock.beats = Math.max(1, Math.min(6, Math.round(beats) || 4));
    this.accent = Boolean(accent);
    this.volume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : this.volume));
    if (this.master && this.context) this.master.gain.setValueAtTime(this.volume, this.context.currentTime);
    if (meterChanged && this.state === 'playing') {
      this.clearNotes();
      this.clock.reset(this.context.currentTime);
      this.onBeat(null);
    }
  }
  async start() {
    if (this.state !== 'stopped') return;
    const generation = ++this.generation;
    this.state = 'starting'; this.onState('starting');
    try {
      usePlaybackSession();
      const context = this.createContext();
      this.context = context;
      await context.resume();
      if (generation !== this.generation) return;
      if (context.state !== 'running') throw new Error(t('Audio could not start. Check your device’s audio settings, then try again.'));
      this.master = context.createGain();
      this.master.gain.setValueAtTime(this.volume, context.currentTime);
      this.master.connect(context.destination);
      this.clock.reset(context.currentTime);
      this.state = 'playing';
      context.onstatechange = () => {
        if (this.state === 'playing' && context.state !== 'running') this.stop(t('Audio paused. Press Start to continue.'));
      };
      this.onState('playing');
      this.schedule();
      this.interval = setInterval(() => this.schedule(), 25);
      this.draw();
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop();
      throw error;
    }
  }
  schedule() {
    if (this.state !== 'playing') return;
    const now = this.context.currentTime;
    for (const event of this.clock.due(now)) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const accented = this.accent && event.beat === 0;
      oscillator.frequency.setValueAtTime(accented ? 1200 : 800, event.time);
      gain.gain.setValueAtTime(0, event.time);
      gain.gain.linearRampToValueAtTime(accented ? 0.5 : 0.35, event.time + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.001, event.time + 0.045);
      oscillator.connect(gain); gain.connect(this.master);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.nodes.delete(oscillator); };
      this.nodes.add(oscillator);
      oscillator.start(event.time); oscillator.stop(event.time + 0.05);
      this.visuals.push(event);
    }
  }
  draw() {
    if (this.state !== 'playing') return;
    let latest;
    while (this.visuals.length && this.visuals[0].time <= this.context.currentTime) latest = this.visuals.shift();
    if (latest) this.onBeat(latest.beat);
    this.frame = requestAnimationFrame(() => this.draw());
  }
  clearNotes() {
    for (const node of this.nodes) { try { node.stop(); } catch { /* Already ended. */ } }
    this.nodes.clear(); this.visuals = [];
  }
  stop(message = '') {
    ++this.generation;
    clearInterval(this.interval); cancelAnimationFrame(this.frame);
    this.clearNotes();
    const context = this.context;
    this.context = null; this.master = null;
    if (context) { context.onstatechange = null; void context.close().catch(() => {}); }
    this.state = 'stopped'; this.onBeat(null); this.onState('stopped', message);
  }
}
