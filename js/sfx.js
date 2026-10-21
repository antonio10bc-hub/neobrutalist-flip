// Sound effects (synthesized with Web Audio, no files) and haptics.
// Exposes window.Sfx. Muting silences both sound and vibration.
(function () {
  const STORAGE_KEY = 'coinfliip_muted';
  let muted = false;
  try { muted = localStorage.getItem(STORAGE_KEY) === 'true'; } catch (e) { }

  let ctx = null;
  let master = null;
  let suspenseNodes = null;

  function audio() {
    if (muted) return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // One enveloped oscillator note
  function tone(freq, start, dur, opts) {
    const c = audio(); if (!c) return;
    opts = opts || {};
    const t = c.currentTime + start;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur);
    const vol = opts.vol == null ? 0.6 : opts.vol;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain); gain.connect(master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  // Short filtered noise burst (thuds, swooshes, register clunk)
  function noise(start, dur, opts) {
    const c = audio(); if (!c) return;
    opts = opts || {};
    const t = c.currentTime + start;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buffer = c.createBuffer(1, len, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = opts.filter || 'lowpass';
    filter.frequency.value = opts.freq || 800;
    const gain = c.createGain();
    gain.gain.setValueAtTime(opts.vol == null ? 0.5 : opts.vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter); filter.connect(gain); gain.connect(master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  // Metallic "ting": inharmonic partials like a struck coin
  function ting(start, base, vol) {
    tone(base, start, 0.45, { vol: vol });
    tone(base * 2.76, start, 0.3, { vol: vol * 0.45 });
    tone(base * 5.4, start, 0.15, { vol: vol * 0.2 });
  }

  function vibrate(pattern) {
    if (muted || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (e) { }
  }

  function stopSuspense() {
    if (!suspenseNodes) return;
    const c = ctx;
    const t = c.currentTime;
    suspenseNodes.gain.gain.cancelScheduledValues(t);
    suspenseNodes.gain.gain.setValueAtTime(suspenseNodes.gain.gain.value, t);
    suspenseNodes.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    suspenseNodes.osc.stop(t + 0.1);
    suspenseNodes = null;
  }

  window.Sfx = {
    isMuted: function () { return muted; },
    setMuted: function (value) {
      muted = !!value;
      try { localStorage.setItem(STORAGE_KEY, String(muted)); } catch (e) { }
      if (muted) { stopSuspense(); if (navigator.vibrate) navigator.vibrate(0); }
    },
    flip: function () {
      ting(0, 1900, 0.5);
      noise(0.02, 0.18, { filter: 'bandpass', freq: 2500, vol: 0.15 });
      vibrate(10);
    },
    // Rising tone while the coin hangs in the air on big streaks
    suspense: function (seconds) {
      const c = audio(); if (!c) return;
      stopSuspense();
      const t = c.currentTime;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(520, t + seconds);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.07, t + 0.1);
      gain.gain.setValueAtTime(0.07, t + seconds);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds + 0.1);
      osc.connect(gain); gain.connect(master);
      osc.start(t); osc.stop(t + seconds + 0.15);
      suspenseNodes = { osc: osc, gain: gain };
      osc.onended = function () { if (suspenseNodes && suspenseNodes.osc === osc) suspenseNodes = null; };
    },
    stopSuspense: stopSuspense,
    heads: function (streak) {
      noise(0, 0.08, { freq: 600, vol: 0.4 });
      // Pitch climbs with the streak so long runs feel bigger
      const step = Math.min(12, Math.log2(Math.max(1, streak)));
      const base = 523.25 * Math.pow(2, step / 12);
      tone(base, 0.02, 0.15, { type: 'triangle', vol: 0.5 });
      tone(base * 1.5, 0.1, 0.25, { type: 'triangle', vol: 0.5 });
      vibrate(30);
    },
    tails: function () {
      noise(0, 0.12, { freq: 400, vol: 0.6 });
      tone(220, 0.03, 0.35, { type: 'sawtooth', slideTo: 90, vol: 0.25 });
      vibrate([60, 40, 120]);
    },
    edge: function () {
      noise(0, 0.08, { freq: 900, vol: 0.4 });
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach(function (f, i) {
        tone(f, 0.05 + i * 0.09, 0.5, { type: 'square', vol: 0.18 });
      });
      tone(1046.5, 0.55, 1.1, { type: 'triangle', vol: 0.4 });
      tone(1567.98, 0.55, 1.1, { type: 'triangle', vol: 0.3 });
      vibrate([80, 50, 80, 50, 300]);
    },
    claim: function () {
      noise(0, 0.07, { filter: 'highpass', freq: 1500, vol: 0.35 });
      ting(0.06, 1318.5, 0.45);
      ting(0.16, 1760, 0.45);
      vibrate([20, 30, 20]);
    }
  };
})();
