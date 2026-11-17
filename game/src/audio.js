// Synthesized sound effects: no audio files, everything is an oscillator or a burst of
// filtered noise shaped in code. The context is created lazily on the first user gesture
// (browsers refuse one before that), and in screenshot mode nothing here is ever called.
// M mutes; the flag is kept in localStorage so it survives a reload.

const MUTE_KEY = 'neon-drift.muted';

export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;
  let lastShoot = 0;
  let muted = false;
  try {
    muted = window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    muted = false;
  }

  /** Build the context on the first gesture; returns false while sound is unavailable. */
  function ensure() {
    if (context !== null) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (Ctor === undefined) return false;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = muted ? 0 : 0.42;
    master.connect(context.destination);
    const length = Math.floor(context.sampleRate * 0.5);
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
    return true;
  }

  /** One oscillator blip: `type` wave gliding from `from` to `to` Hz over `seconds`. */
  function blip(type, from, to, seconds, gain, when = 0) {
    if (!ensure()) return;
    const t = context.currentTime + when;
    const osc = context.createOscillator();
    const amp = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + seconds);
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    osc.connect(amp);
    amp.connect(master);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  /** A burst of white noise through a low-pass filter whose cutoff falls as it plays. */
  function noise(seconds, gain, cutoffFrom, cutoffTo) {
    if (!ensure()) return;
    const t = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoffFrom, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, cutoffTo), t + seconds);
    const amp = context.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    source.start(t, Math.random() * 0.3);
    source.stop(t + seconds + 0.02);
  }

  return {
    get muted() {
      return muted;
    },
    /** Called from any start/confirm gesture so later effects have a live context. */
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      try {
        window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      } catch {
        // Private windows: the choice then lasts this visit only.
      }
      if (master !== null) master.gain.value = muted ? 0 : 0.42;
      return muted;
    },
    shoot() {
      // Shots fire up to 12 times a second; a sound for every one would be a buzz.
      const now = performance.now();
      if (now - lastShoot < 55) return;
      lastShoot = now;
      blip('square', 920, 240, 0.07, 0.11);
    },
    explosion(big) {
      noise(big ? 0.5 : 0.28, big ? 0.5 : 0.3, big ? 3200 : 2400, 90);
      blip('sine', big ? 160 : 210, 38, big ? 0.45 : 0.3, 0.35);
    },
    playerHit() {
      blip('sawtooth', 320, 55, 0.4, 0.4);
      noise(0.35, 0.35, 1800, 120);
    },
    shieldBreak() {
      blip('triangle', 1180, 300, 0.22, 0.3);
    },
    powerup() {
      blip('sine', 520, 520, 0.07, 0.22);
      blip('sine', 780, 780, 0.07, 0.22, 0.07);
      blip('sine', 1180, 1180, 0.12, 0.22, 0.14);
    },
    wave() {
      blip('square', 392, 392, 0.1, 0.16);
      blip('square', 587, 587, 0.16, 0.16, 0.1);
    },
    gameOver() {
      blip('sawtooth', 440, 440, 0.18, 0.25);
      blip('sawtooth', 349, 349, 0.18, 0.25, 0.18);
      blip('sawtooth', 262, 262, 0.2, 0.25, 0.36);
      blip('sawtooth', 131, 110, 0.55, 0.3, 0.54);
    },
    ui() {
      blip('sine', 660, 880, 0.06, 0.15);
    },
  };
}
