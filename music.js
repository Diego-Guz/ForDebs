/* A warm, bittersweet piano piece with soft strings underneath, played live in the browser.
   Original composition in C major, 72 BPM. The melody is doubled an octave up on every
   second pass so the piece slowly opens up.
   If you put your own song at music/song.mp3 (or assets/music/song.mp3), the page plays that instead. */
window.MusicBox = (() => {
  let ctx = null, master = null, wet = null, timer = null;
  let playing = false, loopStart = 0, idx = 0, loopCount = 0;

  const BPM = 72;
  const BEAT = 60 / BPM;
  const midi = name => {
    const m = /^([A-G])(#?)(\d)$/.exec(name);
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
    return 12 * (+m[3] + 1) + base + (m[2] ? 1 : 0);
  };
  const freq = n => 440 * Math.pow(2, (n - 69) / 12);

  // Left-hand voicings, low to high
  const V = {
    Am:    ['A2', 'E3', 'A3', 'C4'],
    F:     ['F2', 'C3', 'F3', 'A3'],
    C:     ['C3', 'G3', 'C4', 'E4'],
    G:     ['G2', 'D3', 'G3', 'B3'],
    E:     ['E2', 'B2', 'E3', 'G#3'],
    Em:    ['E2', 'B2', 'E3', 'G3'],
    Dm:    ['D2', 'A2', 'D3', 'F3'],
    Esus:  ['E2', 'B2', 'E3', 'A3'],
  };
  // 16 bars of 4/4. A pair means the chord changes halfway through the bar.
  // Mostly major and hopeful, with minor chords for the bittersweet ache.
  const bars = ['F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'C', 'Dm', 'Em', 'F', 'G', 'F', 'G', ['F', 'G'], 'C'];

  // Right-hand melody: note, length in beats (4 per bar)
  const melody = [
    ['A4',1],['C5',1],['F5',1.5],['E5',.5],
    ['D5',2],['B4',1],['D5',1],
    ['E5',1.5],['D5',.5],['B4',1],['G4',1],
    ['A4',3],['C5',1],
    ['A4',1],['C5',1],['F5',1],['G5',1],
    ['G5',1.5],['F5',.5],['E5',1],['D5',1],
    ['E5',1],['G5',1],['C6',1],['B5',.5],['G5',.5],
    ['G5',4],
    ['F5',1.5],['E5',.5],['D5',1],['A4',1],
    ['G5',1.5],['F5',.5],['E5',1],['B4',1],
    ['A5',2],['G5',1],['F5',1],
    ['E5',1],['F5',1],['G5',2],
    ['C6',2],['A5',1],['G5',1],
    ['F5',1.5],['E5',.5],['D5',1],['B4',1],
    ['C5',1],['A4',1],['B4',1],['D5',1],
    ['C5',4],
  ];
  const LOOP = bars.length * 4;

  // Build the score once
  const events = [];
  let b = 0;
  melody.forEach(([n, len]) => {
    events.push({ at: b, n: midi(n), kind: 'mel', v: 0.26, len: len * BEAT });
    b += len;
  });
  const PATTERN = [0, 1, 2, 3, 2, 1, 2, 1]; // eighth-note arpeggio
  bars.forEach((chord, bar) => {
    const halves = Array.isArray(chord) ? chord : [chord, chord];
    halves.forEach((name, h) => {
      const v = V[name];
      for (let k = 0; k < 4; k++) {
        const step = PATTERN[h * 4 + k];
        events.push({
          at: bar * 4 + h * 2 + k * 0.5,
          n: midi(v[step]),
          kind: 'lh',
          v: k === 0 && h === 0 ? 0.15 : 0.085,
          len: 2.2 * BEAT,
        });
      }
    });
    // strings: one soft chord per bar
    const v = V[halves[0]];
    events.push({ at: bar * 4, chord: [midi(v[1]) + 12, midi(v[2]) + 12, midi(v[3]) + 12], kind: 'pad', len: 4 * BEAT });
  });
  events.sort((a, b) => a.at - b.at);

  function makeReverb(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    const conv = ctx.createConvolver();
    conv.buffer = buf;
    return conv;
  }

  // Soft felt-piano voice: a few harmonics, a warm filter that closes after the hammer hits
  const PARTIALS = [[1, 1], [2, 0.38], [3, 0.14], [4, 0.07]];
  function piano(t, f, v, hold) {
    const ring = Math.max(1.6, 5.2 - Math.log2(f / 110) * 0.9);
    const end = t + Math.min(ring, hold + 1.4);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.4;
    filter.frequency.setValueAtTime(Math.min(f * 7, 9000), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(f * 1.8, 400), t + 1.2);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(v, t + 0.012);
    env.gain.exponentialRampToValueAtTime(v * 0.35, t + 0.9);
    env.gain.exponentialRampToValueAtTime(0.0001, end);

    filter.connect(env);
    env.connect(master);
    env.connect(wet);

    PARTIALS.forEach(([mult, amp], i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f * mult * (1 + i * 0.0007); // slight stretch, like real strings
      g.gain.value = amp;
      o.connect(g);
      g.connect(filter);
      o.start(t);
      o.stop(end + 0.05);
    });
  }

  // Quiet string pad that swells in and fades
  function pad(t, notes, dur) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1100;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.03, t + dur * 0.45);
    env.gain.linearRampToValueAtTime(0.0, t + dur + 0.9);
    filter.connect(env);
    env.connect(master);
    env.connect(wet);
    notes.forEach(n => {
      [-4, 4].forEach(cents => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = freq(n);
        o.detune.value = cents;
        const g = ctx.createGain();
        g.gain.value = 0.18;
        o.connect(g);
        g.connect(filter);
        o.start(t);
        o.stop(t + dur + 1);
      });
    });
  }

  function tick() {
    const ahead = ctx.currentTime + 0.25;
    while (true) {
      const e = events[idx];
      const t = loopStart + e.at * BEAT;
      if (t > ahead) break;
      if (t >= ctx.currentTime - 0.02) {
        const loose = (Math.random() - 0.5) * 0.018;
        const vel = 0.88 + Math.random() * 0.22;
        if (e.kind === 'pad') {
          pad(t, e.chord, e.len);
        } else if (e.kind === 'lh') {
          piano(t + loose, freq(e.n), e.v * vel, e.len);
        } else {
          // melody a hair late, the way a pianist leans into it
          piano(t + 0.015 + loose, freq(e.n), e.v * vel, e.len);
          if (loopCount % 2 === 1 && e.n + 12 <= 93) piano(t + 0.02 + loose, freq(e.n + 12), e.v * 0.32 * vel, e.len);
        }
      }
      idx++;
      if (idx >= events.length) { idx = 0; loopStart += LOOP * BEAT; loopCount++; }
    }
  }

  // Must be called inside a tap/click (iPhone rule)
  function unlock() {
    if (!ctx) {
      // Lets the music play even when the iPhone silent switch is on (Safari 16.4+)
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 3;
      master.connect(comp);
      comp.connect(ctx.destination);
      const verb = makeReverb(3.2);
      wet = ctx.createGain();
      wet.gain.value = 0.42;
      wet.connect(verb);
      verb.connect(master);
      // one silent sample fully unlocks iOS audio
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, 22050);
      s.connect(ctx.destination);
      s.start(0);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function play() {
    if (!unlock() || playing) return;
    playing = true;
    loopStart = ctx.currentTime + 0.3;
    idx = 0;
    loopCount = 0;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.95, ctx.currentTime + 2.5);
    timer = setInterval(tick, 50);
    tick();
  }

  function stop() {
    if (!ctx || !playing) return;
    playing = false;
    clearInterval(timer);
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2);
  }

  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function resume()  { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  return { unlock, play, stop, suspend, resume, get playing() { return playing; } };
})();