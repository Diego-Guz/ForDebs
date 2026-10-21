/* A small original music-box waltz, played live in the browser.
   If you put your own song at assets/music/song.mp3, the page plays that instead. */
window.MusicBox = (() => {
  let ctx = null, master = null, wet = null, timer = null;
  let playing = false, loopStart = 0, idx = 0;

  const BPM = 96;
  const BEAT = 60 / BPM;
  const midi = name => {
    const m = /^([A-G])(#?)(\d)$/.exec(name);
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
    return 12 * (+m[3] + 1) + base + (m[2] ? 1 : 0);
  };
  const freq = n => 440 * Math.pow(2, (n - 69) / 12);

  // 16 bars of 3/4. Each entry: note, length in beats.
  const melody = [
    ['E5',1],['G5',1],['C6',1],
    ['B5',1],['A5',1],['E5',1],
    ['F5',1],['A5',1],['C6',1],
    ['B5',2],['G5',1],
    ['E5',.5],['F5',.5],['G5',1],['E5',1],
    ['D5',1],['E5',1],['B4',1],
    ['C5',1],['D5',1],['F5',1],
    ['E5',2],['D5',1],
    ['C5',1],['E5',1],['A5',1],
    ['G5',.5],['F5',.5],['A5',1],['F5',1],
    ['E5',1],['G5',1],['C6',1],
    ['D6',2],['B5',1],
    ['A5',1],['C6',1],['A5',1],
    ['G5',1],['F5',1],['D5',1],
    ['C5',1],['E5',1],['G5',1],
    ['C6',3],
  ];
  // One chord per bar: root, then two soft chord tones
  const chords = [
    ['C3','E4','G4'], ['A2','C4','E4'], ['F2','A3','C4'], ['G2','B3','D4'],
    ['C3','E4','G4'], ['E2','G3','B3'], ['F2','A3','C4'], ['G2','B3','D4'],
    ['A2','C4','E4'], ['F2','A3','C4'], ['C3','E4','G4'], ['G2','B3','D4'],
    ['F2','A3','C4'], ['G2','B3','D4'], ['C3','E4','G4'], ['C3','G3','C4'],
  ];
  const LOOP = 48; // beats

  const events = [];
  let b = 0;
  melody.forEach(([n, len]) => { events.push({ at: b, n: midi(n), kind: 'tine', v: 0.32 }); b += len; });
  chords.forEach((c, bar) => {
    events.push({ at: bar * 3,     n: midi(c[0]), kind: 'bass', v: 0.22 });
    events.push({ at: bar * 3 + 1, n: midi(c[1]), kind: 'tine', v: 0.09 });
    events.push({ at: bar * 3 + 1, n: midi(c[2]), kind: 'tine', v: 0.08 });
    events.push({ at: bar * 3 + 2, n: midi(c[1]), kind: 'tine', v: 0.08 });
    events.push({ at: bar * 3 + 2, n: midi(c[2]), kind: 'tine', v: 0.07 });
  });
  events.sort((a, b) => a.at - b.at);

  function makeReverb() {
    const len = ctx.sampleRate * 2.6;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const conv = ctx.createConvolver();
    conv.buffer = buf;
    return conv;
  }

  function tine(t, f, v) {
    // music-box tine: a pure tone plus a bright, quickly fading overtone
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(v, t + 0.004);
    out.gain.exponentialRampToValueAtTime(0.0008, t + 1.8);
    out.connect(master); out.connect(wet);

    const o1 = ctx.createOscillator();
    o1.type = 'sine'; o1.frequency.value = f;
    o1.connect(out);

    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.type = 'sine'; o2.frequency.value = f * 4.02;
    g2.gain.setValueAtTime(0.22, t);
    g2.gain.exponentialRampToValueAtTime(0.0005, t + 0.35);
    o2.connect(g2); g2.connect(out);

    o1.start(t); o2.start(t);
    o1.stop(t + 1.9); o2.stop(t + 0.4);
  }

  function bass(t, f, v) {
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(v, t + 0.01);
    out.gain.exponentialRampToValueAtTime(0.0008, t + 1.2);
    out.connect(master); out.connect(wet);
    const o = ctx.createOscillator();
    o.type = 'triangle'; o.frequency.value = f;
    o.connect(out);
    o.start(t); o.stop(t + 1.3);
  }

  function tick() {
    const ahead = ctx.currentTime + 0.2;
    while (true) {
      const e = events[idx];
      const t = loopStart + e.at * BEAT;
      if (t > ahead) break;
      if (t >= ctx.currentTime - 0.02) {
        const swing = (Math.random() - 0.5) * 0.012; // tiny human looseness
        if (e.kind === 'bass') bass(t + swing, freq(e.n), e.v);
        else tine(t + swing, freq(e.n), e.v);
      }
      idx++;
      if (idx >= events.length) { idx = 0; loopStart += LOOP * BEAT; }
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
      master.connect(comp); comp.connect(ctx.destination);
      const verb = makeReverb();
      wet = ctx.createGain(); wet.gain.value = 0.35;
      wet.connect(verb); verb.connect(master);
      // play one silent sample to fully unlock iOS
      const s = ctx.createBufferSource();
      s.buffer = ctx.createBuffer(1, 1, 22050);
      s.connect(ctx.destination); s.start(0);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function play() {
    if (!unlock() || playing) return;
    playing = true;
    loopStart = ctx.currentTime + 0.25;
    idx = 0;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 1.5);
    timer = setInterval(tick, 40);
    tick();
  }

  function stop() {
    if (!ctx || !playing) return;
    playing = false;
    clearInterval(timer);
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
  }

  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function resume()  { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  return { unlock, play, stop, suspend, resume, get playing() { return playing; } };
})();
