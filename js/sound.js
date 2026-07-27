'use strict';
/*
 * Som sintetizado via Web Audio API — sem ficheiros externos a carregar.
 * O AudioContext só é criado ao primeiro gesto do utilizador (autoplay policy
 * dos browsers exige isso); até lá, todas as chamadas são no-op silenciosas.
 */
(function () {
  let ctx = null;
  let muted = false;

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  }

  function unlock() {
    const c = ensureCtx();
    if (c && c.state === 'suspended') c.resume();
  }
  ['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, unlock, { once: true, passive: true }));

  function now() { return ctx ? ctx.currentTime : 0; }

  function tone({ freq = 440, dur = 0.15, type = 'sine', vol = 0.2, endFreq = null, delay = 0 }) {
    if (muted || !ctx) return;
    const t0 = now() + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.02, dur * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noiseBurst({ dur = 0.15, vol = 0.25, filterFreq = 1200, delay = 0 }) {
    if (muted || !ctx) return;
    const t0 = now() + delay;
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, t0);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t0);
  }

  const Sound = {
    setMuted(v) { muted = v; },
    isMuted() { return muted; },

    cardPlace() {
      ensureCtx();
      tone({ freq: 260, endFreq: 480, dur: 0.16, type: 'triangle', vol: 0.16 });
    },
    unitPlace() {
      ensureCtx();
      tone({ freq: 200, endFreq: 340, dur: 0.14, type: 'triangle', vol: 0.18 });
      noiseBurst({ dur: 0.08, vol: 0.08, filterFreq: 700, delay: 0.02 });
    },
    apoioCast() {
      ensureCtx();
      [660, 880, 1100].forEach((f, i) => tone({ freq: f, dur: 0.14, type: 'sine', vol: 0.12, delay: i * 0.045 }));
    },
    attackSwing() {
      ensureCtx();
      noiseBurst({ dur: 0.09, vol: 0.12, filterFreq: 2200 });
    },
    hit() {
      ensureCtx();
      tone({ freq: 140, endFreq: 60, dur: 0.18, type: 'sawtooth', vol: 0.22 });
      noiseBurst({ dur: 0.12, vol: 0.18, filterFreq: 900 });
    },
    death() {
      ensureCtx();
      tone({ freq: 220, endFreq: 40, dur: 0.4, type: 'sawtooth', vol: 0.2 });
    },
    heal() {
      ensureCtx();
      [440, 550, 660].forEach((f, i) => tone({ freq: f, dur: 0.18, type: 'sine', vol: 0.14, delay: i * 0.06 }));
    },
    siege() {
      ensureCtx();
      tone({ freq: 90, endFreq: 35, dur: 0.5, type: 'sine', vol: 0.3 });
      noiseBurst({ dur: 0.3, vol: 0.2, filterFreq: 400 });
    },
    pass() {
      ensureCtx();
      tone({ freq: 320, endFreq: 260, dur: 0.09, type: 'square', vol: 0.08 });
    },
    click() {
      ensureCtx();
      tone({ freq: 700, dur: 0.05, type: 'square', vol: 0.06 });
    },
    error() {
      ensureCtx();
      tone({ freq: 160, dur: 0.12, type: 'square', vol: 0.1 });
    },
    victory() {
      ensureCtx();
      [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.3, type: 'triangle', vol: 0.2, delay: i * 0.14 }));
    },
    defeat() {
      ensureCtx();
      [392, 349, 293, 220].forEach((f, i) => tone({ freq: f, dur: 0.35, type: 'sawtooth', vol: 0.18, delay: i * 0.16 }));
    }
  };

  window.Sound = Sound;
})();
