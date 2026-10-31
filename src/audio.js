// Áudio sintetizado — sem arquivos externos, tudo via WebAudio.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ambientBus = null;
    this.ambientNodes = [];
    this.ambientTimer = null;
    this.muted = false;
    this.started = false;
    this.noiseBuffer = null;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);

    const length = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.08);
    }
  }

  get ready() {
    return Boolean(this.ctx);
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  tone({ freq = 440, endFreq = null, dur = 0.15, type = 'sine', vol = 0.08, delay = 0, attack = 0.006 }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  noise({ dur = 0.2, vol = 0.06, type = 'bandpass', freq = 900, q = 1, delay = 0 }) {
    if (!this.ctx || this.muted || !this.noiseBuffer) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t0);
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  sfx(name) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'click':
        this.tone({ freq: 760, endFreq: 520, dur: 0.06, type: 'square', vol: 0.025 });
        break;
      case 'till':
        this.noise({ dur: 0.16, vol: 0.09, type: 'lowpass', freq: 480 });
        this.tone({ freq: 150, endFreq: 80, dur: 0.12, type: 'triangle', vol: 0.06 });
        break;
      case 'water':
        this.noise({ dur: 0.3, vol: 0.05, type: 'bandpass', freq: 1400, q: 0.8 });
        this.tone({ freq: 900, endFreq: 500, dur: 0.18, type: 'sine', vol: 0.025 });
        break;
      case 'plant':
        this.tone({ freq: 440, endFreq: 720, dur: 0.14, type: 'sine', vol: 0.05 });
        this.noise({ dur: 0.1, vol: 0.025, type: 'highpass', freq: 2000 });
        break;
      case 'harvest':
        this.tone({ freq: 660, dur: 0.14, type: 'triangle', vol: 0.06 });
        this.tone({ freq: 990, dur: 0.2, type: 'triangle', vol: 0.05, delay: 0.08 });
        this.tone({ freq: 1320, dur: 0.22, type: 'sine', vol: 0.035, delay: 0.16 });
        break;
      case 'gather':
        this.tone({ freq: 520, endFreq: 880, dur: 0.16, type: 'triangle', vol: 0.045 });
        this.noise({ dur: 0.08, vol: 0.02, type: 'highpass', freq: 2400 });
        break;
      case 'build':
        this.noise({ dur: 0.26, vol: 0.08, type: 'lowpass', freq: 700 });
        this.tone({ freq: 180, endFreq: 380, dur: 0.24, type: 'sawtooth', vol: 0.03 });
        break;
      case 'error':
        this.tone({ freq: 190, endFreq: 130, dur: 0.14, type: 'square', vol: 0.035 });
        break;
      case 'claim':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          this.tone({ freq: f, dur: 0.5, type: 'triangle', vol: 0.05, delay: i * 0.1 });
        });
        this.noise({ dur: 0.8, vol: 0.035, type: 'highpass', freq: 1800 });
        break;
      case 'travel':
        this.tone({ freq: 90, endFreq: 1400, dur: 1.1, type: 'sine', vol: 0.05 });
        this.noise({ dur: 1.2, vol: 0.06, type: 'bandpass', freq: 700, q: 0.5 });
        break;
      case 'arrive':
        this.tone({ freq: 220, endFreq: 440, dur: 0.4, type: 'triangle', vol: 0.05 });
        this.tone({ freq: 660, dur: 0.4, type: 'sine', vol: 0.035, delay: 0.2 });
        break;
      case 'quest':
        this.tone({ freq: 880, dur: 0.18, type: 'sine', vol: 0.05 });
        this.tone({ freq: 1174, dur: 0.3, type: 'sine', vol: 0.04, delay: 0.12 });
        break;
      case 'day':
        this.tone({ freq: 392, dur: 0.5, type: 'sine', vol: 0.04 });
        this.tone({ freq: 587, dur: 0.6, type: 'sine', vol: 0.03, delay: 0.18 });
        break;
      default:
        break;
    }
  }

  startAmbient() {
    if (!this.ctx || this.started) return;
    this.started = true;
    const bus = this.ctx.createGain();
    bus.gain.value = this.muted ? 0 : 0.09;
    bus.connect(this.master);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    filter.Q.value = 0.7;
    filter.connect(bus);

    const notes = [55, 82.41, 110, 164.81];
    for (let i = 0; i < notes.length; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = i % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.value = notes[i];
      osc.detune.value = (i - 1.5) * 3;
      gain.gain.value = i === 0 ? 0.26 : 0.1;
      osc.connect(gain);
      gain.connect(filter);
      osc.start();
      this.ambientNodes.push(osc);
    }

    // LFO lento no filtro — respiração do ambiente.
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.045;
    lfoGain.gain.value = 230;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    this.ambientNodes.push(lfo);

    this.ambientBus = bus;

    const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
    let step = 0;
    this.ambientTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      step += 1;
      if (step % 2 === 0) {
        const freq = scale[Math.floor(Math.random() * scale.length)];
        this.tone({ freq, dur: 2.4, type: 'sine', vol: 0.012, attack: 0.4 });
        this.tone({ freq: freq * 1.5, dur: 2.0, type: 'sine', vol: 0.006, attack: 0.6, delay: 0.4 });
      }
    }, 5200);
  }

  stopAmbient() {
    for (const node of this.ambientNodes) {
      try { node.stop(); } catch { /* já parado */ }
    }
    this.ambientNodes = [];
    if (this.ambientTimer) clearInterval(this.ambientTimer);
    this.ambientTimer = null;
    if (this.ambientBus) {
      try { this.ambientBus.disconnect(); } catch { /* ignore */ }
    }
    this.ambientBus = null;
    this.started = false;
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }
}
