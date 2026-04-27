// ===================== Tag — client =====================
const socket = io();

// ---------- DOM helpers ----------
const $ = (id) => document.getElementById(id);
const screens = {
  home: $('home'),
  lobby: $('lobby'),
  game: $('game'),
};
function showScreen(name) {
  for (const k in screens) screens[k].classList.toggle('active', k === name);
}

// ---------- State ----------
const state = {
  myId: null,
  lobbyCode: null,
  hostId: null,
  players: [],
  settings: { mode: 'normal', timeLimit: 120, map: 'summer' },
  gameStart: null, // { platforms, objects, worldW, worldH, playerSize }
  snapshot: null,  // latest gameState
};

// ---------- Home screen ----------
const PRESET_COLORS = [
  '#ef476f', '#ff8c42', '#ffd166', '#06d6a0',
  '#118ab2', '#7b6cd9', '#ec61d4', '#f5f5f5',
  '#3a3a3a', '#a26b3f',
];
let selectedColor = PRESET_COLORS[0];

(function buildColorPresets() {
  const wrap = $('colorPresets');
  PRESET_COLORS.forEach((color, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'color-circle' + (i === 0 ? ' selected' : '');
    btn.style.background = color;
    btn.dataset.color = color;
    btn.setAttribute('aria-label', 'Color ' + color);
    btn.addEventListener('click', () => {
      selectedColor = color;
      wrap.querySelectorAll('.color-circle').forEach(el => el.classList.remove('selected'));
      btn.classList.add('selected');
    });
    wrap.appendChild(btn);
  });
})();

$('createBtn').addEventListener('click', () => {
  const username = $('usernameInput').value.trim() || 'Player';
  socket.emit('createLobby', { username, color: selectedColor });
});
$('joinBtn').addEventListener('click', () => {
  const username = $('usernameInput').value.trim() || 'Player';
  const code = $('codeInput').value.trim();
  if (!/^\d{4}$/.test(code)) {
    $('homeError').textContent = 'Enter a 4-digit code.';
    return;
  }
  socket.emit('joinLobby', { code, username, color: selectedColor });
});
$('codeInput').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
});

// ---------- Lobby screen ----------
$('leaveLobbyBtn').addEventListener('click', () => {
  socket.emit('leaveLobby');
  state.lobbyCode = null;
  showScreen('home');
});
$('startBtn').addEventListener('click', () => {
  socket.emit('startGame');
});
$('modeSelect').addEventListener('change', (e) => {
  socket.emit('updateSettings', { mode: e.target.value });
});
$('timeSelect').addEventListener('change', (e) => {
  socket.emit('updateSettings', { timeLimit: parseInt(e.target.value, 10) });
});
$('mapSelect').addEventListener('change', (e) => {
  socket.emit('updateSettings', { map: e.target.value });
});

function renderLobby() {
  $('lobbyCode').textContent = state.lobbyCode || '----';
  // players
  const list = $('playersList');
  list.innerHTML = '';
  state.players.forEach(p => {
    const chip = document.createElement('div');
    chip.className = 'player-chip' + (p.id === state.hostId ? ' host' : '');
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = p.color;
    chip.appendChild(swatch);
    const nm = document.createElement('span');
    nm.textContent = p.username + (p.id === state.myId ? ' (you)' : '');
    chip.appendChild(nm);
    list.appendChild(chip);
  });

  // settings
  const isHost = state.myId === state.hostId;
  ['modeSelect','timeSelect','mapSelect'].forEach(id => {
    $(id).disabled = !isHost;
  });
  $('startBtn').disabled = !isHost || state.players.length < 2;
  $('hostNote').textContent = isHost
    ? (state.players.length < 2 ? 'Need at least 2 players to start.' : '')
    : 'Waiting for host…';

  $('modeSelect').value = state.settings.mode;
  $('timeSelect').value = String(state.settings.timeLimit);
  $('mapSelect').value = state.settings.map;
}

// ---------- Socket events ----------
socket.on('connect', () => { state.myId = socket.id; });
socket.on('errorMsg', (msg) => {
  if (screens.home.classList.contains('active')) $('homeError').textContent = msg;
  else if (screens.lobby.classList.contains('active')) $('lobbyError').textContent = msg;
  setTimeout(() => { $('homeError').textContent=''; $('lobbyError').textContent=''; }, 3000);
});

socket.on('lobbyJoined', (data) => {
  state.lobbyCode = data.code;
  state.myId = data.you;
  state.hostId = data.hostId;
  state.players = data.players;
  state.settings = data.settings;
  renderLobby();
  showScreen('lobby');
});

socket.on('lobbyUpdate', (data) => {
  state.hostId = data.hostId;
  state.players = data.players;
  state.settings = data.settings;
  if (!data.inGame && screens.game.classList.contains('active')) {
    showScreen('lobby');
  }
  renderLobby();
});

socket.on('gameStart', (data) => {
  state.gameStart = data;
  state.snapshot = null;
  // Reset camera to mid-world; render loop will lerp from there
  camera.cx = data.worldW / 2;
  camera.cy = data.worldH / 2;
  camera.zoom = 0.7;
  seedParticles();
  $('gameOver').classList.add('hidden');
  showScreen('game');
  resizeCanvas();
});

socket.on('gameState', (snap) => {
  state.snapshot = snap;
});

socket.on('gameEnd', ({ result }) => {
  const losers = (result && Array.isArray(result.losers)) ? result.losers : [];
  let titleText, subText;
  if (losers.length === 0) {
    titleText = 'Game Over';
    subText = 'No one lost.';
  } else if (losers.length === 1) {
    titleText = `${losers[0]} lost!`;
    subText = '';
  } else {
    titleText = `${losers.join(', ')} lost!`;
    subText = '';
  }
  $('gameOverTitle').textContent = titleText;
  $('gameOverText').textContent = subText;
  $('gameOver').classList.remove('hidden');
});

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

$('backToLobbyBtn').addEventListener('click', () => {
  socket.emit('returnToLobby');
  $('gameOver').classList.add('hidden');
  showScreen('lobby');
});

// ===================== Game rendering & input =====================
const canvas = $('canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  // CSS scales to fit; canvas resolution is fixed at 1600x900.
  const aspect = canvas.width / canvas.height;
  const w = window.innerWidth, h = window.innerHeight;
  let cw, ch;
  if (w / h > aspect) { ch = h; cw = ch * aspect; }
  else { cw = w; ch = cw / aspect; }
  canvas.style.width = Math.floor(cw) + 'px';
  canvas.style.height = Math.floor(ch) + 'px';
}
window.addEventListener('resize', resizeCanvas);

// ---------- Input ----------
const keys = { left: false, right: false, up: false };
function setKey(k, v) {
  let changed = false;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') {
    if (keys.left !== v) { keys.left = v; changed = true; }
  }
  if (k === 'ArrowRight' || k === 'd' || k === 'D') {
    if (keys.right !== v) { keys.right = v; changed = true; }
  }
  if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') {
    if (keys.up !== v) { keys.up = v; changed = true; }
  }
  if (changed) socket.emit('input', keys);
}
window.addEventListener('keydown', (e) => {
  if (!screens.game.classList.contains('active')) return;
  if (['ArrowLeft','ArrowRight','ArrowUp',' '].includes(e.key)) e.preventDefault();
  setKey(e.key, true);
});
window.addEventListener('keyup', (e) => {
  if (!screens.game.classList.contains('active')) return;
  setKey(e.key, false);
});

// ===================== Camera =====================
const camera = { cx: 1200, cy: 550, zoom: 0.7 };

function updateCamera(snap) {
  const cw = canvas.width, ch = canvas.height;
  const ww = state.gameStart ? state.gameStart.worldW : 2400;
  const wh = state.gameStart ? state.gameStart.worldH : 1100;

  // Compute target from player bounding box
  let targetCx = ww / 2, targetCy = wh / 2, targetZoom = 0.8;
  if (snap && snap.players.length > 0) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of snap.players) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x + state.gameStart.playerSize);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y + state.gameStart.playerSize);
    }
    const margin = 240;
    const tw = (maxX - minX) + margin * 2;
    const th = (maxY - minY) + margin * 2;
    targetCx = (minX + maxX) / 2;
    targetCy = (minY + maxY) / 2;
    const zoomX = cw / tw;
    const zoomY = ch / th;
    targetZoom = Math.min(zoomX, zoomY);
  }
  // never zoom out below "fit whole world"; cap zoom-in so blobs aren't huge
  const minZoom = Math.min(cw / ww, ch / wh);
  const maxZoom = 0.7;
  targetZoom = Math.max(minZoom, Math.min(maxZoom, targetZoom));

  // Clamp center so view stays inside the world (when zoom allows)
  const halfW = (cw / targetZoom) / 2;
  const halfH = (ch / targetZoom) / 2;
  if (halfW * 2 < ww) {
    targetCx = Math.max(halfW, Math.min(ww - halfW, targetCx));
  } else {
    targetCx = ww / 2;
  }
  if (halfH * 2 < wh) {
    targetCy = Math.max(halfH, Math.min(wh - halfH, targetCy));
  } else {
    targetCy = wh / 2;
  }

  // Smooth lerp
  const lerp = 0.12;
  camera.cx += (targetCx - camera.cx) * lerp;
  camera.cy += (targetCy - camera.cy) * lerp;
  camera.zoom += (targetZoom - camera.zoom) * lerp;
}

function applyCameraTransform() {
  const cw = canvas.width, ch = canvas.height;
  ctx.setTransform(
    camera.zoom, 0, 0, camera.zoom,
    cw / 2 - camera.cx * camera.zoom,
    ch / 2 - camera.cy * camera.zoom
  );
}
function resetTransform() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
function worldToScreen(wx, wy) {
  return {
    x: (wx - camera.cx) * camera.zoom + canvas.width / 2,
    y: (wy - camera.cy) * camera.zoom + canvas.height / 2,
  };
}

// ===================== Theme rendering =====================
// Animated background particles per theme — wrap to world bounds
const WORLD_W_DEFAULT = 2400, WORLD_H_DEFAULT = 1100;

const particles = {
  rain: [],
  snow: [],
  leaves: [],
};

function seedParticles() {
  const ww = state.gameStart ? state.gameStart.worldW : WORLD_W_DEFAULT;
  const wh = state.gameStart ? state.gameStart.worldH : WORLD_H_DEFAULT;
  particles.rain = [];
  for (let i = 0; i < 220; i++) {
    particles.rain.push({
      x: Math.random() * ww, y: Math.random() * wh,
      vy: 9 + Math.random() * 5, vx: -1.5 - Math.random(),
      len: 10 + Math.random() * 8,
    });
  }
  particles.snow = [];
  for (let i = 0; i < 280; i++) {
    particles.snow.push({
      x: Math.random() * ww, y: Math.random() * wh,
      vy: 1 + Math.random() * 1.8, vx: Math.sin(i) * 0.5,
      r: 2 + Math.random() * 3, ph: Math.random() * Math.PI * 2,
    });
  }
  // Small floating pumpkins for fall (replaces falling leaves).
  particles.leaves = [];
  const colors = ['#ee8a3b', '#d97a2b', '#e88336', '#ffb347', '#cf6f3b'];
  for (let i = 0; i < 70; i++) {
    particles.leaves.push({
      x: Math.random() * ww, y: Math.random() * wh,
      vy: 0.5 + Math.random() * 1.0, vx: 0.8 + Math.random() * 1.2,
      ph: Math.random() * Math.PI * 2,
      sz: 7 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }
}
seedParticles();

function drawBackground(map, t) {
  const w = state.gameStart ? state.gameStart.worldW : WORLD_W_DEFAULT;
  const h = state.gameStart ? state.gameStart.worldH : WORLD_H_DEFAULT;
  if (map === 'summer') {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#7ec8ff');
    g.addColorStop(0.6, '#fce5b8');
    g.addColorStop(1, '#f5d68a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // suns / clouds across the wider world
    ctx.fillStyle = '#fff2a8';
    ctx.beginPath(); ctx.arc(w * 0.78, 160, 70, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,180,0.4)';
    ctx.beginPath(); ctx.arc(w * 0.78, 160, 100, 0, Math.PI * 2); ctx.fill();
    // ocean band
    const oceanY = h - 220;
    ctx.fillStyle = '#3aa4d1';
    ctx.fillRect(0, oceanY, w, 60);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < Math.ceil(w / 140); i++) {
      const x = (i * 140 + (t * 0.05) % 140);
      ctx.fillRect(x, oceanY + 15 + Math.sin(t*0.005 + i) * 4, 60, 2);
    }
  } else if (map === 'spring') {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#bfe8a3');
    g.addColorStop(1, '#82c468');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    const cloudCount = Math.ceil(w / 320);
    for (let i = 0; i < cloudCount; i++) {
      const x = ((i * 320 + (t * 0.02)) % (w + 200)) - 100;
      drawCloud(x, 80 + (i % 2) * 40);
    }
    // rain
    ctx.strokeStyle = 'rgba(180,210,240,0.6)';
    ctx.lineWidth = 2;
    for (const p of particles.rain) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.vx * 1.2, p.y + p.len);
      ctx.stroke();
      p.x += p.vx; p.y += p.vy;
      if (p.y > h) { p.y = -10; p.x = Math.random() * w; }
      if (p.x < -20) p.x = w + 10;
    }
  } else if (map === 'fall') {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#f6c987');
    g.addColorStop(1, '#cf6f3b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // Falling pumpkin particles (replaces leaves)
    for (const p of particles.leaves) {
      const a = Math.sin(p.ph + t * 0.003) * 0.35;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(a);
      // small pumpkin
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.sz * 0.7, p.sz * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(120,55,15,0.45)';
      ctx.beginPath();
      ctx.ellipse(-p.sz*0.22, 0, p.sz*0.14, p.sz*0.55, 0, 0, Math.PI*2);
      ctx.ellipse( p.sz*0.22, 0, p.sz*0.14, p.sz*0.55, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#3d6b2a';
      ctx.fillRect(-1.5, -p.sz*0.6 - 3, 3, 4);
      ctx.restore();
      p.x += p.vx + Math.sin(p.ph + t * 0.002) * 0.4;
      p.y += p.vy;
      if (p.y > h) { p.y = -16; p.x = Math.random() * w - 100; }
      if (p.x > w + 20) p.x = -20;
    }
  } else if (map === 'winter') {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#a9c8e0');
    g.addColorStop(1, '#e8eef7');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // distant mountains across world
    ctx.fillStyle = '#cfd8e3';
    ctx.beginPath();
    const mountainTop = h - 220;
    ctx.moveTo(0, mountainTop);
    for (let x = 0; x <= w; x += 40) {
      ctx.lineTo(x, mountainTop - Math.abs(Math.sin(x * 0.008)) * 100);
    }
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
    // snow
    for (const p of particles.snow) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(p.x + Math.sin(t*0.002 + p.ph) * 8, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      p.y += p.vy;
      if (p.y > h) { p.y = -5; p.x = Math.random() * w; }
    }
  }
}

function drawCloud(x, y) {
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, Math.PI * 2);
  ctx.arc(x + 24, y - 6, 26, 0, Math.PI * 2);
  ctx.arc(x + 50, y, 20, 0, Math.PI * 2);
  ctx.arc(x + 30, y + 10, 22, 0, Math.PI * 2);
  ctx.fill();
}

// Themed walls along left + right (and top) of the world.
function drawWalls(map) {
  if (!state.gameStart) return;
  const ww = state.gameStart.worldW;
  const wh = state.gameStart.worldH;
  const wallW = state.gameStart.wallW || 30;

  const themes = {
    summer: { base: '#d6b97a', edge: '#b89656', accent: '#e8c98a', detail: '#3aa55a' },
    spring: { base: '#5a8c3e', edge: '#3e6b28', accent: '#7bc15c', detail: '#a4d57e' },
    fall:   { base: '#7d4a1e', edge: '#5a3416', accent: '#a26b3f', detail: '#e88336' },
    winter: { base: '#cdd9e6', edge: '#8ea0b7', accent: '#fff',    detail: '#fff' },
  };
  const th = themes[map] || themes.summer;

  // Left wall
  ctx.fillStyle = th.base;
  ctx.fillRect(0, 0, wallW, wh);
  ctx.fillStyle = th.edge;
  ctx.fillRect(wallW - 4, 0, 4, wh);
  // Right wall
  ctx.fillStyle = th.base;
  ctx.fillRect(ww - wallW, 0, wallW, wh);
  ctx.fillStyle = th.edge;
  ctx.fillRect(ww - wallW, 0, 4, wh);
  // Top frame
  ctx.fillStyle = th.base;
  ctx.fillRect(0, 0, ww, wallW);
  ctx.fillStyle = th.edge;
  ctx.fillRect(0, wallW - 4, ww, 4);

  // Per-theme detail: small repeated motifs along the inner edge of the walls.
  if (map === 'summer') {
    // tiny palm leaves crowning the walls
    ctx.fillStyle = th.detail;
    for (let y = 80; y < wh - 60; y += 110) {
      for (const sx of [wallW + 4, ww - wallW - 4]) {
        ctx.beginPath();
        ctx.ellipse(sx, y, 14, 5, sx < ww/2 ? 0.4 : -0.4, 0, Math.PI*2);
        ctx.fill();
      }
    }
  } else if (map === 'spring') {
    ctx.fillStyle = th.detail;
    for (let y = 60; y < wh - 60; y += 70) {
      for (const sx of [wallW - 2, ww - wallW + 2]) {
        ctx.beginPath();
        ctx.arc(sx, y, 10, 0, Math.PI*2);
        ctx.fill();
      }
    }
  } else if (map === 'fall') {
    // wood plank lines
    ctx.fillStyle = th.edge;
    for (let y = 0; y < wh; y += 60) {
      ctx.fillRect(0, y, wallW, 3);
      ctx.fillRect(ww - wallW, y, wallW, 3);
    }
    // a few small pumpkins along the base
    for (const sx of [wallW + 16, ww - wallW - 16]) {
      drawPumpkin(sx, wh - 24, 18, 14, '#ee8a3b', 1);
      drawPumpkin(sx + (sx < ww/2 ? 22 : -22), wh - 22, 14, 11, '#d97a2b', 1);
    }
  } else if (map === 'winter') {
    // icicles along the top frame and snow caps on inner edge of walls
    ctx.fillStyle = '#fff';
    for (let x = wallW; x < ww - wallW; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, wallW);
      ctx.lineTo(x + 12, wallW);
      ctx.lineTo(x + 6, wallW + 14);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#eef4fb';
    ctx.fillRect(0, 0, wallW, 8);
    ctx.fillRect(ww - wallW, 0, wallW, 8);
  }
}

function drawPlatform(plat, map, isGround) {
  const { x, y, w, h } = plat;
  // Floating platforms get rounded corners; ground keeps a flat bottom edge.
  const r = isGround ? 0 : Math.min(8, h / 2);

  if (map === 'summer') {
    if (isGround) {
      ctx.fillStyle = '#ecd092';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#d6b97a';
      for (let i = 0; i < w; i += 12) ctx.fillRect(x + i, y + 4, 6, 2);
    } else {
      // sand-colored rounded plank with green palm-leaf top
      ctx.fillStyle = '#8b5a2b';
      roundRect(x, y, w, h, r); ctx.fill();
      ctx.fillStyle = '#3aa55a';
      ctx.beginPath();
      ctx.ellipse(x + w/2, y + h/2, w/2, h * 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#52c476';
      roundRectTop(x, y, w, 5, r);
    }
  } else if (map === 'spring') {
    if (isGround) {
      ctx.fillStyle = '#5fa84a';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#7bc15c';
      ctx.fillRect(x, y, w, 6);
    } else {
      ctx.fillStyle = '#7d4f2b';
      roundRect(x, y, w, h, r); ctx.fill();
      ctx.fillStyle = '#7bc15c';
      roundRectTop(x, y, w, 7, r);
      // tufts
      ctx.fillStyle = '#9adc7a';
      for (let i = 0; i < w; i += 14) {
        ctx.fillRect(x + i + 2, y - 3, 4, 4);
      }
    }
  } else if (map === 'fall') {
    if (isGround) {
      ctx.fillStyle = '#8a5a2a';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#b8763a';
      ctx.fillRect(x, y, w, 6);
    } else {
      ctx.fillStyle = '#6e4423';
      roundRect(x, y, w, h, r); ctx.fill();
      ctx.fillStyle = '#d97a3c';
      roundRectTop(x, y, w, 6, r);
    }
  } else if (map === 'winter') {
    if (isGround) {
      ctx.fillStyle = '#dde7f0';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x, y, w, 8);
    } else {
      ctx.fillStyle = '#7d8b9c';
      roundRect(x, y, w, h, r); ctx.fill();
      ctx.fillStyle = '#fff';
      roundRectTop(x - 2, y, w + 4, 10, r);
    }
  }
}

// Rounded rect with corners only on the top — used for the colored top strip
// of a platform so it follows the platform's rounded silhouette.
function roundRectTop(x, y, w, h, r) {
  r = Math.min(r, h);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function drawObject(o, map) {
  if (o.type === 'bouncy') {
    drawSpring(o, map);
  } else if (o.type === 'hide') {
    if (o.kind === 'tree') {
      // big spring tree (background pass — trunk + canopy)
      const cx = o.x + o.w/2;
      const baseY = o.y + o.h; // ground line
      ctx.fillStyle = '#5e3a1d';
      ctx.fillRect(cx - 10, o.y + 30, 20, o.h - 30);
      // upper canopy (decorative, drawn again on top in overlay)
      ctx.fillStyle = '#3e8e3a';
      ctx.beginPath();
      ctx.arc(cx, o.y + 20, 50, 0, Math.PI * 2);
      ctx.fill();
      // low foliage skirt that reaches the ground (covers player area)
      ctx.fillStyle = '#56a850';
      ctx.beginPath();
      ctx.ellipse(cx, baseY - 30, 60, 50, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (o.kind === 'snowman') {
      const cx = o.x + o.w/2;
      const by = o.y + o.h;
      // body
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(cx, by - 22, 22, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, by - 56, 16, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, by - 84, 11, 0, Math.PI*2); ctx.fill();
      // hat
      ctx.fillStyle = '#222';
      ctx.fillRect(cx - 12, by - 92, 24, 4);
      ctx.fillRect(cx - 8, by - 104, 16, 12);
      // eyes/nose
      ctx.fillStyle = '#222';
      ctx.fillRect(cx - 4, by - 88, 2, 2);
      ctx.fillRect(cx + 2, by - 88, 2, 2);
      ctx.fillStyle = '#e67e22';
      ctx.fillRect(cx - 1, by - 84, 7, 2);
    } else if (o.kind === 'pumpkin') {
      drawPumpkinPile(o, false);
    }
  }
}

// Bouncy "spring" — top is themed per map; coiled metal stem underneath.
function drawSpring(o, map) {
  const cx = o.x + o.w / 2;
  const topY = o.y;
  const baseY = o.y + o.h;
  const w = o.w;

  // Coiled spring stem (universal)
  ctx.strokeStyle = '#cfd6dd';
  ctx.lineWidth = 3;
  ctx.beginPath();
  const coils = 4;
  for (let i = 0; i <= coils; i++) {
    const yy = topY + 12 + (i / coils) * (o.h - 16);
    if (i === 0) ctx.moveTo(cx - w * 0.18, yy);
    ctx.lineTo(cx + (i % 2 === 0 ? -1 : 1) * w * 0.18, yy);
  }
  ctx.stroke();
  // Base plate
  ctx.fillStyle = '#7a838d';
  ctx.fillRect(cx - w * 0.30, baseY - 4, w * 0.60, 4);

  // Themed top platter
  if (map === 'summer') {
    // Striped beach-umbrella style top (red/white)
    ctx.save();
    ctx.translate(cx, topY + 12);
    ctx.scale(1, 0.55);
    const stripes = ['#e74c3c', '#fff', '#e74c3c', '#fff', '#e74c3c'];
    for (let i = 0; i < stripes.length; i++) {
      ctx.fillStyle = stripes[i];
      ctx.beginPath();
      const a0 = Math.PI + (i / stripes.length) * Math.PI;
      const a1 = Math.PI + ((i + 1) / stripes.length) * Math.PI;
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, w / 2 + 4, a0, a1);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  } else if (map === 'spring') {
    // Red mushroom cap with white spots
    ctx.fillStyle = '#d94343';
    ctx.beginPath();
    ctx.arc(cx, topY + 14, w / 2 + 2, Math.PI, Math.PI * 2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx - 12, topY + 8, 4, 0, Math.PI * 2);
    ctx.arc(cx + 8, topY + 6, 3, 0, Math.PI * 2);
    ctx.arc(cx + 18, topY + 12, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (map === 'fall') {
    // Pumpkin-style top (orange ridges)
    ctx.fillStyle = '#ea8230';
    ctx.beginPath();
    ctx.ellipse(cx, topY + 12, w / 2 + 2, 14, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(120,55,15,0.45)';
    ctx.beginPath();
    ctx.ellipse(cx - w * 0.20, topY + 14, w * 0.06, 12, 0, Math.PI, Math.PI * 2);
    ctx.ellipse(cx + w * 0.20, topY + 14, w * 0.06, 12, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3d6b2a';
    ctx.fillRect(cx - 2, topY - 2, 4, 5);
  } else if (map === 'winter') {
    // Snowy mound with icy rim
    ctx.fillStyle = '#9bc2e0';
    ctx.beginPath();
    ctx.arc(cx, topY + 14, w / 2 + 2, Math.PI, Math.PI * 2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(cx, topY + 8, w / 2, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Pumpkin pile (fall hide spot) — three pumpkins of varying size grouped together.
function drawPumpkinPile(o, overlay) {
  const cx = o.x + o.w/2;
  const by = o.y + o.h;
  const a = overlay ? 0.97 : 1.0;
  // back pumpkin (smaller, behind)
  drawPumpkin(cx + 22, by - 14, 22, 18, '#d97a2b', a);
  drawPumpkin(cx - 22, by - 12, 24, 20, '#e88336', a);
  // front pumpkin (largest)
  drawPumpkin(cx,      by - 6,  34, 28, '#ee8a3b', a);
}
function drawPumpkin(cx, cy, w, h, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  // body lobes
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w/2, h/2, 0, 0, Math.PI*2);
  ctx.fill();
  // ribs (slightly darker stripes)
  ctx.fillStyle = 'rgba(150,60,18,0.45)';
  ctx.beginPath();
  ctx.ellipse(cx - w*0.18, cy + 1, w*0.10, h/2 - 1, 0, 0, Math.PI*2);
  ctx.ellipse(cx + w*0.18, cy + 1, w*0.10, h/2 - 1, 0, 0, Math.PI*2);
  ctx.fill();
  // stem
  ctx.fillStyle = '#3d6b2a';
  ctx.fillRect(cx - 2, cy - h/2 - 5, 4, 6);
  ctx.restore();
}

// Draw a hide object's "front cover" so it visually obscures players standing in it.
// We draw the bushy/leafy/snow body AGAIN above the player layer.
function drawHideOverlay(o) {
  if (o.type !== 'hide') return;
  if (o.kind === 'tree') {
    const cx = o.x + o.w/2;
    const baseY = o.y + o.h;
    // trunk in front (covers player from front)
    ctx.fillStyle = 'rgba(94,58,29,0.98)';
    ctx.fillRect(cx - 10, o.y + 30, 20, o.h - 30);
    // big low foliage skirt covers the player
    ctx.fillStyle = 'rgba(86,168,80,0.97)';
    ctx.beginPath();
    ctx.ellipse(cx, baseY - 30, 60, 50, 0, 0, Math.PI * 2);
    ctx.fill();
    // upper canopy
    ctx.fillStyle = 'rgba(62,142,58,0.96)';
    ctx.beginPath();
    ctx.arc(cx, o.y + 20, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(102,182,96,0.95)';
    ctx.beginPath();
    ctx.arc(cx - 24, o.y + 8, 24, 0, Math.PI * 2);
    ctx.arc(cx + 24, o.y + 12, 28, 0, Math.PI * 2);
    ctx.fill();
  } else if (o.kind === 'snowman') {
    const cx = o.x + o.w/2;
    const by = o.y + o.h;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx, by - 22, 22, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, by - 56, 16, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, by - 84, 11, 0, Math.PI*2); ctx.fill();
  } else if (o.kind === 'pumpkin') {
    drawPumpkinPile(o, true);
  }
}

// Powerup glyph
function drawPowerup(pu, t) {
  const cx = pu.x + pu.w/2, cy = pu.y + pu.h/2;
  const bob = Math.sin(t * 0.005 + pu.id) * 3;
  ctx.save();
  ctx.translate(cx, cy + bob);
  // ring
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, pu.w/2 + 2, 0, Math.PI * 2); ctx.stroke();
  // body
  let bg, label;
  switch (pu.type) {
    case 'highJump': bg = '#56cfe1'; label = '↑'; break;
    case 'superSpeed': bg = '#ffd166'; label = '»'; break;
    case 'invisible': bg = '#9b59b6'; label = '◌'; break;
    case 'swap': bg = '#2ecc71'; label = '⇄'; break;
    case 'shield': bg = '#3498db'; label = '⛨'; break;
    case 'star': {
      // rainbow gradient
      const grd = ctx.createLinearGradient(-12, -12, 12, 12);
      grd.addColorStop(0, '#ff7a59');
      grd.addColorStop(0.5, '#ffd166');
      grd.addColorStop(1, '#56cfe1');
      bg = grd; label = '★'; break;
    }
  }
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.arc(0, 0, pu.w/2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 1);
  ctx.restore();
}

// ---------- Player rendering ----------
function drawPlayer(p, t, isMe, now, map) {
  const sz = state.gameStart.playerSize;
  const x = p.x, y = p.y;

  // Visibility: if hidden behind cover and not me, skip.
  // If invisible powerup active, draw faded.
  const inv = p.invisibleUntil > now || p.starUntil > now;
  // Hidden players are drawn but the hide overlay is drawn ON TOP later, covering them.

  let alpha = 1;
  if (inv) alpha = isMe ? 0.45 : 0.18;

  // shadow under feet
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x + sz/2, y + sz + 2, sz/2 + 2, 4, 0, 0, Math.PI*2);
  ctx.fill();

  ctx.save();
  ctx.globalAlpha = alpha;

  // Star aura
  if (p.starUntil > now) {
    const r = sz * 1.3 + Math.sin(t*0.01) * 2;
    const grd = ctx.createRadialGradient(x + sz/2, y + sz/2, 4, x + sz/2, y + sz/2, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x + sz/2, y + sz/2, r, 0, Math.PI*2);
    ctx.fill();
  }

  // Speed trail
  if (p.speedUntil > now || p.starUntil > now) {
    ctx.fillStyle = 'rgba(255,209,102,0.35)';
    ctx.fillRect(x - 6, y + 4, 6, sz - 8);
    ctx.fillStyle = 'rgba(255,209,102,0.18)';
    ctx.fillRect(x - 12, y + 6, 6, sz - 12);
  }

  // High-jump bounce ring
  if (p.jumpUntil > now || p.starUntil > now) {
    ctx.strokeStyle = 'rgba(86,207,225,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x + sz/2, y + sz, sz/2 + 4, 3, 0, 0, Math.PI*2);
    ctx.stroke();
  }

  // Movement state for animation
  const moving = Math.abs(p.vx || 0) > 0.5;
  const cx = x + sz / 2, cy = y + sz / 2;
  const dir = p.facing >= 0 ? 1 : -1;

  const bodyColor = '#1c2230';
  const bodyShade = '#10131c';
  const earPink = 'rgba(220,120,140,0.85)';

  // Legs (drawn first so they sit behind the body). Alternating swing while moving.
  const legSwing = (moving && p.onGround) ? Math.sin(t * 0.025) * (sz * 0.10) : 0;
  const legW = sz * 0.16, legH = sz * 0.16;
  const legY = y + sz - legH;
  ctx.fillStyle = bodyColor;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1;
  // left leg
  roundRect(cx - sz * 0.26, legY + Math.max(0, -legSwing), legW, legH, 3);
  ctx.fill(); ctx.stroke();
  // right leg
  roundRect(cx + sz * 0.10, legY + Math.max(0, legSwing), legW, legH, 3);
  ctx.fill(); ctx.stroke();

  // Cat ears (two pointed triangles on top, pink inner)
  const earBaseY = y + sz * 0.18;
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.moveTo(cx - sz * 0.36, earBaseY);
  ctx.lineTo(cx - sz * 0.30, y - sz * 0.12);
  ctx.lineTo(cx - sz * 0.10, earBaseY - sz * 0.02);
  ctx.closePath();
  ctx.moveTo(cx + sz * 0.10, earBaseY - sz * 0.02);
  ctx.lineTo(cx + sz * 0.30, y - sz * 0.12);
  ctx.lineTo(cx + sz * 0.36, earBaseY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // inner ear pink
  ctx.fillStyle = earPink;
  ctx.beginPath();
  ctx.moveTo(cx - sz * 0.30, earBaseY - sz * 0.04);
  ctx.lineTo(cx - sz * 0.27, y - sz * 0.04);
  ctx.lineTo(cx - sz * 0.18, earBaseY - sz * 0.04);
  ctx.closePath();
  ctx.moveTo(cx + sz * 0.18, earBaseY - sz * 0.04);
  ctx.lineTo(cx + sz * 0.27, y - sz * 0.04);
  ctx.lineTo(cx + sz * 0.30, earBaseY - sz * 0.04);
  ctx.closePath();
  ctx.fill();

  // Head/body — rounded shape
  ctx.fillStyle = bodyColor;
  roundRect(x + sz * 0.10, y + sz * 0.12, sz * 0.80, sz * 0.78, sz * 0.24);
  ctx.fill();
  // body shadow on lower half
  ctx.fillStyle = bodyShade;
  ctx.beginPath();
  ctx.ellipse(cx, y + sz * 0.85, sz * 0.36, sz * 0.10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1.4;
  roundRect(x + sz * 0.10, y + sz * 0.12, sz * 0.80, sz * 0.78, sz * 0.24);
  ctx.stroke();

  // Headband — player's chosen color, between the ears and the eyes
  drawHeadband(x, y, sz, p.color, dir);

  // Eyes — big white ovals just below the headband
  const eyeY = y + sz * 0.58;
  const eyeR = sz * 0.13;
  const eyeOffsetX = sz * 0.19;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(cx - eyeOffsetX, eyeY, eyeR, 0, Math.PI * 2);
  ctx.arc(cx + eyeOffsetX, eyeY, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Pupils — slight shift toward facing direction
  const pupilR = sz * 0.058;
  const pupilShift = dir * sz * 0.04;
  ctx.fillStyle = '#0d0d0d';
  ctx.beginPath();
  ctx.arc(cx - eyeOffsetX + pupilShift, eyeY + sz * 0.005, pupilR, 0, Math.PI * 2);
  ctx.arc(cx + eyeOffsetX + pupilShift, eyeY + sz * 0.005, pupilR, 0, Math.PI * 2);
  ctx.fill();
  // Tiny white highlight in each eye
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(cx - eyeOffsetX + pupilShift + sz * 0.018, eyeY - sz * 0.025, sz * 0.018, 0, Math.PI * 2);
  ctx.arc(cx + eyeOffsetX + pupilShift + sz * 0.018, eyeY - sz * 0.025, sz * 0.018, 0, Math.PI * 2);
  ctx.fill();

  // Small smile below the eyes
  ctx.strokeStyle = '#0d0d0d';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, y + sz * 0.78, sz * 0.06, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  // "It" red outline around the silhouette
  if (p.isIt) {
    ctx.strokeStyle = '#ff2d2d';
    ctx.lineWidth = 3;
    roundRect(x + sz * 0.08, y + sz * 0.10, sz * 0.84, sz * 0.82, sz * 0.26);
    ctx.stroke();
  }

  // Frozen overlay
  if (p.frozen) {
    ctx.fillStyle = 'rgba(120,200,255,0.55)';
    ctx.fillRect(x - 4, y - 4, sz + 8, sz + 12);
    ctx.strokeStyle = '#cdefff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 4, y - 4, sz + 8, sz + 12);
  }

  // Shield
  if (p.shieldUntil > now || p.starUntil > now) {
    ctx.strokeStyle = 'rgba(86,207,225,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, sz * 0.85 + Math.sin(t * 0.01) * 1.2, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();

  if (moving && p.onGround) maybeEmitDust(p, dir);
}

// Headband — colored stripe across the forehead, with two ribbon tails trailing
// behind the head opposite to the facing direction.
function drawHeadband(x, y, sz, color, dir) {
  const bandY = y + sz * 0.34;
  const bandH = sz * 0.13;
  // Main band
  ctx.fillStyle = color;
  ctx.fillRect(x + sz * 0.04, bandY, sz * 0.92, bandH);
  // Subtle bottom shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(x + sz * 0.04, bandY + bandH - 2, sz * 0.92, 2);
  // Knot on the trailing side
  const knotX = dir > 0 ? x + sz * 0.04 : x + sz * 0.96;
  const knotDir = -dir;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(knotX, bandY + bandH * 0.5, sz * 0.06, sz * 0.10, 0, 0, Math.PI * 2);
  ctx.fill();
  // Two ribbon tails flowing behind
  ctx.beginPath();
  ctx.moveTo(knotX, bandY + bandH * 0.2);
  ctx.lineTo(knotX + knotDir * sz * 0.30, bandY - sz * 0.04);
  ctx.lineTo(knotX + knotDir * sz * 0.34, bandY + bandH * 0.45);
  ctx.lineTo(knotX, bandY + bandH * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(knotX, bandY + bandH * 0.5);
  ctx.lineTo(knotX + knotDir * sz * 0.36, bandY + bandH * 1.1);
  ctx.lineTo(knotX + knotDir * sz * 0.30, bandY + bandH * 1.4);
  ctx.lineTo(knotX, bandY + bandH);
  ctx.closePath();
  ctx.fill();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ---------- Dust trail particles (client-only) ----------
const dust = [];
let lastDustEmit = new WeakMap(); // throttle per player

function maybeEmitDust(p, dir) {
  // Throttle: each player emits at most ~every 70ms while running
  const last = lastDustEmit.get(p) || 0;
  const nowMs = performance.now();
  if (nowMs - last < 70) return;
  lastDustEmit.set(p, nowMs);
  const sz = state.gameStart.playerSize;
  // Spawn just behind the trailing foot, near the ground
  const fx = p.x + sz / 2 - dir * sz * 0.30;
  const fy = p.y + sz - 4;
  dust.push({
    x: fx + (Math.random() - 0.5) * 4,
    y: fy + (Math.random() - 0.5) * 2,
    vx: -dir * (0.3 + Math.random() * 0.4),
    vy: -0.5 - Math.random() * 0.6,
    life: 1.0,
    decay: 0.025 + Math.random() * 0.02,
    r: 2.5 + Math.random() * 2,
  });
}

function updateDust() {
  for (let i = dust.length - 1; i >= 0; i--) {
    const d = dust[i];
    d.x += d.vx;
    d.y += d.vy;
    d.vy += 0.04; // light gravity so it settles
    d.life -= d.decay;
    if (d.life <= 0) dust.splice(i, 1);
  }
}

function drawDust(map) {
  // Subtle theme tint so dust matches the ground.
  let tint;
  switch (map) {
    case 'summer': tint = '218,196,140'; break;
    case 'spring': tint = '180,210,160'; break;
    case 'fall':   tint = '170,120,80'; break;
    case 'winter': tint = '230,236,244'; break;
    default:       tint = '200,195,180';
  }
  for (const d of dust) {
    ctx.fillStyle = `rgba(${tint},${Math.max(0, d.life * 0.55)})`;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Drawn after world transform is reset, so text is always readable regardless of zoom.
function drawPlayerLabel(p, now) {
  // Don't reveal players hidden behind cover via floating name.
  if (p.hidden) return;
  const sz = state.gameStart.playerSize;
  const top = worldToScreen(p.x + sz/2, p.y);
  // Faded name when invisible powerup is active
  const inv = p.invisibleUntil > now || p.starUntil > now;
  ctx.globalAlpha = inv ? 0.35 : 1.0;
  ctx.font = '13px system-ui';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.lineWidth = 3;
  const ny = top.y - 8;
  ctx.strokeText(p.username, top.x, ny);
  ctx.fillText(p.username, top.x, ny);
  if (p.isIt) {
    ctx.font = 'bold 14px system-ui';
    ctx.fillStyle = '#ff2d2d';
    ctx.strokeText('IT', top.x, ny - 16);
    ctx.fillText('IT', top.x, ny - 16);
  }
  ctx.globalAlpha = 1.0;
}

// ---------- HUD ----------
function fmtTime(ms) {
  if (ms < 0) ms = 0;
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
}

function modeLabel(m) {
  return m === 'normal' ? 'Normal Tag'
    : m === 'freeze' ? 'Freeze Tag'
    : m === 'infection' ? 'Infection' : m;
}

function activePowerLabel(p, now) {
  if (!p) return '';
  if (p.starUntil > now) return '★ STAR';
  const parts = [];
  if (p.speedUntil > now) parts.push('»Speed');
  if (p.jumpUntil > now) parts.push('↑Jump');
  if (p.invisibleUntil > now) parts.push('◌Invis');
  if (p.shieldUntil > now) parts.push('⛨Shield');
  return parts.join(' ');
}

// ---------- Main render loop ----------
function render(t) {
  requestAnimationFrame(render);
  if (!screens.game.classList.contains('active')) return;
  if (!state.gameStart) return;
  const snap = state.snapshot;
  const map = state.gameStart && (snap ? snap.map : state.settings.map);

  // Clear viewport with neutral letterbox color (visible if camera shows beyond world)
  resetTransform();
  ctx.fillStyle = '#0a0d14';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Update + apply camera
  updateCamera(snap);
  applyCameraTransform();

  drawBackground(map, t);

  // Themed wall borders along the playable frame
  drawWalls(map);

  // Platforms
  state.gameStart.platforms.forEach((plat, i) => {
    drawPlatform(plat, map, i === 0);
  });

  // Map objects (back layer)
  state.gameStart.objects.forEach(o => drawObject(o, map));

  // Dust trail (under players so it looks like it's coming off feet)
  updateDust();
  drawDust(map);

  // Powerups
  if (snap) snap.powerups.forEach(pu => drawPowerup(pu, t));

  // Players
  if (snap) {
    const now = snap.now;
    snap.players.forEach(p => {
      const isMe = p.id === state.myId;
      drawPlayer(p, t, isMe, now, map);
    });

    // Hide overlays — drawn on top of players to obscure those inside hide objects
    state.gameStart.objects.forEach(o => {
      if (o.type === 'hide') drawHideOverlay(o);
    });
  }

  // Screen-space layer: player names + IT label (constant size regardless of zoom)
  resetTransform();
  if (snap) {
    snap.players.forEach(p => drawPlayerLabel(p, snap.now));

    const remaining = Math.max(0, snap.endsAt - snap.now);
    const timeEl = $('hudTime');
    timeEl.textContent = fmtTime(remaining);
    timeEl.classList.toggle('warning', remaining <= 30000);
    $('hudMode').textContent = modeLabel(snap.mode);
    const me = snap.players.find(p => p.id === state.myId);
    $('hudPower').textContent = activePowerLabel(me, snap.now);
  } else {
    $('hudTime').textContent = '--:--';
    $('hudTime').classList.remove('warning');
  }
}
requestAnimationFrame(render);

showScreen('home');
