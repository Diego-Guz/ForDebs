(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'JPG', 'JPEG', 'PNG', 'heic', 'HEIC'];
  document.querySelectorAll('img[data-photo]').forEach(img => {
    const name = img.dataset.photo;
    const tries = [];
    ['photos/', 'assets/photos/'].forEach(dir => EXTENSIONS.forEach(ext => tries.push(`${dir}${name}.${ext}`)));
    let i = 0;
    const tryNext = () => {
      if (i >= tries.length) return; // no file found: placeholder stays
      img.src = tries[i++];
    };
    img.addEventListener('load', () => {
      img.classList.add('ok');
      img.closest('.slot').classList.add('has-photo');
    });
    img.addEventListener('error', tryNext);
    tryNext();
  });

  (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 180;
    const g = c.getContext('2d');
    const d = g.createImageData(180, 180);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = Math.random() * 255;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
      d.data[i + 3] = 255;
    }
    g.putImageData(d, 0, 0);
    document.querySelector('.grain').style.backgroundImage = `url(${c.toDataURL()})`;
  })();


  const canvas = document.getElementById('garden');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  let clusters = [], drifting = [], opened = false, openedAt = 0;

  let seed = 11;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const clamp = v => Math.max(0, Math.min(1, v));
  const ease = t => 1 - Math.pow(1 - t, 3);

  // One floret = four soft rounded petals. Pre-drawn once per tint, then stamped many times.
  const TINTS = {
    white: { inner: '#efeee3', outer: '#ffffff', eye: '#d3dcc0', line: 'rgba(120,130,110,0.16)' },
    cream: { inner: '#e9e4d1', outer: '#fcf9ef', eye: '#cfd3a6', line: 'rgba(130,125,100,0.16)' },
    young: { inner: '#dbe3c4', outer: '#f1f5e4', eye: '#b6c28c', line: 'rgba(110,130,90,0.18)' },
    shade: { inner: '#d6d8cb', outer: '#e9eadf', eye: '#c2cab0', line: 'rgba(100,110,95,0.18)' },
  };
  const SPRITE = 96;
  const sprites = {};
  Object.entries(TINTS).forEach(([key, t]) => {
    const variants = [];
    for (let v = 0; v < 3; v++) {
      const c = document.createElement('canvas');
      c.width = c.height = SPRITE;
      const g = c.getContext('2d');
      g.translate(SPRITE / 2, SPRITE / 2);
      const s = SPRITE;
      for (let k = 0; k < 4; k++) {
        g.save();
        g.rotate(k * Math.PI / 2 + (Math.random() - 0.5) * 0.25);
        const len = s * (0.4 + Math.random() * 0.05);
        const grad = g.createRadialGradient(0, 0, 0, 0, -len * 0.5, len);
        grad.addColorStop(0, t.inner);
        grad.addColorStop(1, t.outer);
        g.fillStyle = grad;
        g.strokeStyle = t.line;
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(0, 0);
        g.bezierCurveTo(-s * 0.27, -s * 0.06, -s * 0.25, -len * 1.08, 0, -len);
        g.bezierCurveTo(s * 0.25, -len * 1.08, s * 0.27, -s * 0.06, 0, 0);
        g.fill();
        g.stroke();
        g.restore();
      }
      g.fillStyle = t.eye;
      g.beginPath();
      g.arc(0, 0, s * 0.045, 0, Math.PI * 2);
      g.fill();
      variants.push(c);
    }
    sprites[key] = variants;
  });

  function makeCluster(cx, cy, R, at) {
    const florets = [];
    const count = Math.min(120, Math.round(R * R * 0.011) + 18);
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const r = R * Math.sqrt(rand());
      const depth = 1 - r / R;
      const lower = Math.sin(a) > 0.35 && depth < 0.45;
      let tint = 'white';
      if (depth < 0.22 || lower) tint = 'shade';
      else if (rand() < 0.14) tint = 'young';
      else if (rand() < 0.4) tint = 'cream';
      florets.push({
        x: Math.cos(a) * r,
        y: Math.sin(a) * r * 0.86,
        size: R * 0.34 * (0.72 + 0.38 * depth + rand() * 0.12),
        rot: rand() * Math.PI * 2,
        sprite: sprites[tint][Math.floor(rand() * 3)],
        delay: rand(),
        depth,
      });
    }
    florets.sort((p, q) => p.depth - q.depth);

    const leaves = [];
    const angles = [-1.15, -0.5, 0.45, 1.1, 2.5, -2.45];
    angles.forEach((ang, i) => {
      leaves.push({
        ang: ang + (rand() - 0.5) * 0.3,
        len: R * (i > 3 ? 0.75 : 1.0 + rand() * 0.25),
        wid: R * (0.38 + rand() * 0.1),
        tone: rand(),
      });
    });
    return { cx, cy, R, at, florets, leaves, phase: rand() * 6.28 };
  }

  function buildGarden() {
    seed = 11;
    clusters = [];
    const phone = W < 640;
    let back = 0;
    if (phone) {
      const R = Math.max(62, W * 0.2);
      // back row: a little higher and smaller, peeking over the front
      [0.18, 0.5, 0.82].forEach(fx => {
        clusters.push(makeCluster(fx * W + (rand() - 0.5) * 20, H - R * 0.55 - rand() * R * 0.25, R * (0.75 + rand() * 0.15), 0));
      });
      // front row along the bottom edge
      [0.02, 0.34, 0.66, 0.98].forEach(fx => {
        clusters.push(makeCluster(fx * W + (rand() - 0.5) * 18, H + R * 0.12 - rand() * R * 0.3, R * (0.9 + rand() * 0.2), 0));
      });
      // climbing up both sides
      [[0.74, 0.85], [0.46, 0.75], [0.2, 0.65]].forEach(([fy, s]) => {
        clusters.push(makeCluster(-R * 0.4, H * fy, R * s, 0));
        clusters.push(makeCluster(W + R * 0.4, H * (fy - 0.08), R * s, 0));
      });
      // tucked into the top corners
      clusters.push(makeCluster(-R * 0.2, -R * 0.15, R * 0.7, 0));
      clusters.push(makeCluster(W + R * 0.2, -R * 0.05, R * 0.65, 0));
    } else {
      // back row
      back = Math.max(5, Math.round(W / 240));
      for (let i = 0; i < back; i++) {
        const R = 75 + rand() * 30;
        clusters.push(makeCluster(((i + 0.25) / back) * W + (rand() - 0.5) * 50, H - R * 0.6 - rand() * R * 0.3, R, 0));
      }
      // front row
      const n = Math.max(6, Math.round(W / 190));
      for (let i = 0; i < n; i++) {
        const R = 95 + rand() * 40;
        clusters.push(makeCluster(((i + 0.5) / n) * W + (rand() - 0.5) * 60, H + R * 0.1 - rand() * R * 0.4, R, 0));
      }
      // climbing up both sides
      [[0.72, 110], [0.5, 100], [0.3, 88]].forEach(([fy, R]) => {
        clusters.push(makeCluster(-25 + rand() * 30, H * fy, R, 0));
        clusters.push(makeCluster(W + 25 - rand() * 30, H * (fy - 0.07), R, 0));
      });
      // top corners
      clusters.push(makeCluster(30, H * 0.08, 78, 0));
      clusters.push(makeCluster(W - 30, H * 0.05, 74, 0));
      clusters.push(makeCluster(150, -20, 58, 0));
      clusters.push(makeCluster(W - 160, -25, 56, 0));
    }
    // Bloom order: the front row opens right away, the rest as she scrolls
    const order = clusters.map((_, i) => i);
    const first = phone ? [3, 4, 5, 6] : [back, back + 1, back + 2, back + 3, back + 4];
    const rest = order.filter(i => !first.includes(i)).sort(() => rand() - 0.5);
    first.forEach(i => { clusters[i].at = -1; });
    rest.forEach((ci, k) => { clusters[ci].at = 0.06 + (k / rest.length) * 0.78; });

    drifting = [];
    const n = phone ? 13 : 22;
    for (let i = 0; i < n; i++) {
      drifting.push({
        x: rand() * W, y: rand() * H,
        s: 10 + rand() * 10,
        v: 0.18 + rand() * 0.3,
        r: rand() * 6.28, spin: (rand() - 0.5) * 0.01,
        d: rand() * 6.28,
        sprite: sprites[rand() < 0.5 ? 'white' : 'cream'][Math.floor(rand() * 3)],
      });
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildGarden();
  }

  function drawLeaf(l, grow) {
    ctx.save();
    ctx.rotate(l.ang);
    ctx.scale(grow, grow);
    const L = l.len, w = l.wid;
    const grad = ctx.createLinearGradient(0, 0, 0, L);
    const dark = l.tone > 0.5 ? '#4f7a52' : '#5d8a5c';
    grad.addColorStop(0, dark);
    grad.addColorStop(1, '#8fb27f');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(w, L * 0.2, w * 0.9, L * 0.75, 0, L);
    ctx.bezierCurveTo(-w * 0.9, L * 0.75, -w, L * 0.2, 0, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(230, 240, 215, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, L * 0.05);
    ctx.quadraticCurveTo(w * 0.08, L * 0.5, 0, L * 0.92);
    ctx.stroke();
    ctx.restore();
  }

  function drawCluster(c, b, t) {
    if (b <= 0) return;
    const sway = reduceMotion ? 0 : Math.sin(t * 0.0006 + c.phase) * 2.5;
    ctx.save();
    ctx.translate(c.cx + sway, c.cy);

    const leafGrow = ease(clamp(b * 2.2));
    c.leaves.forEach(l => drawLeaf(l, leafGrow));

    // soft shadow under the flower head
    const head = ease(clamp(b * 1.6 - 0.25));
    if (head > 0) {
      const sh = ctx.createRadialGradient(0, c.R * 0.15, 0, 0, c.R * 0.15, c.R * 1.15);
      sh.addColorStop(0, `rgba(55, 70, 50, ${0.22 * head})`);
      sh.addColorStop(1, 'rgba(55, 70, 50, 0)');
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.ellipse(0, c.R * 0.15, c.R * 1.15, c.R * 1.0, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const f of c.florets) {
      const open = ease(clamp((b - 0.25 - f.delay * 0.5) / 0.3));
      if (open <= 0.01) continue;
      const s = f.size * open;
      ctx.save();
      ctx.translate(f.x * (0.7 + 0.3 * open), f.y * (0.7 + 0.3 * open));
      ctx.rotate(f.rot + (1 - open) * 0.8);
      ctx.globalAlpha = 0.35 + 0.65 * open;
      ctx.drawImage(f.sprite, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawDrifting(t, p) {
    if (reduceMotion || !opened) return;
    const show = clamp(p * 1.5 + 0.2);
    drifting.forEach((d, i) => {
      if (i / drifting.length > show) return;
      d.y += d.v;
      d.x += Math.sin(t * 0.0005 + d.d) * 0.3;
      d.r += d.spin;
      if (d.y > H + 20) { d.y = -20; d.x = Math.random() * W; }
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.r);
      ctx.globalAlpha = 0.8;
      ctx.drawImage(d.sprite, -d.s / 2, -d.s / 2, d.s, d.s);
      ctx.restore();
    });
    ctx.globalAlpha = 1;
  }

  function scrollProgress() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return max > 0 ? clamp(window.scrollY / max) : 1;
  }

  function frame(t) {
    ctx.clearRect(0, 0, W, H);
    const p = reduceMotion ? 1 : scrollProgress();
    const intro = reduceMotion ? 1 : (opened ? clamp((t - openedAt) / 2600) : 0.08);
    drawDrifting(t, p);
    clusters.forEach(c => {
      const b = c.at < 0 ? intro : clamp((p - c.at) / 0.16);
      drawCluster(c, b, t);
    });
    if (!reduceMotion) requestAnimationFrame(frame);
  }

  resize();
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    // iPhone fires resize while the address bar slides; only rebuild on real size changes
    resizeTimer = setTimeout(() => {
      if (Math.abs(window.innerWidth - W) > 2 || Math.abs(window.innerHeight - H) > 120) resize();
      if (reduceMotion) frame(0);
    }, 150);
  });
  requestAnimationFrame(frame);


  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in'); });
    }, { threshold: 0.35 });
    document.querySelectorAll('.polaroid').forEach(el => io.observe(el));
  } else {
    document.querySelectorAll('.polaroid').forEach(el => el.classList.add('in'));
  }


  const gate = document.getElementById('gate');
  const toggle = document.getElementById('music-toggle');
  const song = new Audio();
  song.loop = true;
  song.preload = 'auto';
  song.setAttribute('playsinline', '');
  song.src = 'music/song.mp3';
  song.addEventListener('error', () => {
    if (!song.src.includes('assets/')) song.src = 'assets/music/song.mp3';
  }, { once: true });
  let mode = null;      // 'song' or 'box'
  let musicOn = false;

  document.body.classList.add('locked');

  function setToggle(on) {
    musicOn = on;
    toggle.hidden = false;
    toggle.classList.toggle('on', on);
    toggle.setAttribute('aria-label', on ? 'Turn music off' : 'Turn music on');
  }

  function startMusic() {
    window.MusicBox.unlock(); // has to happen inside the tap on iPhone
    if (mode === 'box') { window.MusicBox.play(); setToggle(true); return; }
    song.volume = 0.8;
    const attempt = song.play();
    if (attempt && attempt.then) {
      attempt.then(() => { mode = 'song'; setToggle(true); })
        .catch(() => { mode = 'box'; window.MusicBox.play(); setToggle(true); });
    } else {
      mode = 'song'; setToggle(true);
    }
  }
  function stopMusic() {
    if (mode === 'song') song.pause();
    else window.MusicBox.stop();
    setToggle(false);
  }

  function openPage(withMusic) {
    gate.classList.add('gone');
    document.body.classList.remove('locked');
    opened = true;
    openedAt = performance.now();
    if (withMusic) startMusic();
    else setToggle(false);
    setTimeout(() => gate.setAttribute('hidden', ''), 1500);
  }

  document.getElementById('open-music').addEventListener('click', () => openPage(true));
  document.getElementById('open-quiet').addEventListener('click', () => openPage(false));
  toggle.addEventListener('click', () => (musicOn ? stopMusic() : startMusic()));
  document.getElementById('again').addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  });

  // Pause when she switches apps, pick back up when she returns
  document.addEventListener('visibilitychange', () => {
    if (!musicOn) return;
    if (document.hidden) {
      if (mode === 'song') song.pause(); else window.MusicBox.suspend();
    } else {
      if (mode === 'song') song.play().catch(() => {}); else window.MusicBox.resume();
    }
  });
})();