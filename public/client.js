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
$('createBtn').addEventListener('click', () => {
  const username = $('usernameInput').value.trim() || 'Player';
  const color = $('colorInput').value;
  socket.emit('createLobby', { username, color });
});
$('joinBtn').addEventListener('click', () => {
  const username = $('usernameInput').value.trim() || 'Player';
  const color = $('colorInput').value;
  const code = $('codeInput').value.trim();
  if (!/^\d{4}$/.test(code)) {
    $('homeError').textContent = 'Enter a 4-digit code.';
    return;
  }
  socket.emit('joinLobby', { code, username, color });
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
  $('gameOverTitle').textContent = result.text || 'Game Over';
  let body = '';
  if (result.winners && result.winners.length) {
    body += '<b>Winners:</b> ' + result.winners.join(', ');
  }
  if (result.loser) body += '<br/><b>It at end:</b> ' + result.loser;
  $('gameOverText').innerHTML = body;
  $('gameOver').classList.remove('hidden');
});

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
  // never zoom out below "fit whole world"; never zoom in past 1:1
  const minZoom = Math.min(cw / ww, ch / wh);
  const maxZoom = 1.0;
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
  for (let i = 0; i < 160; i++) {
    particles.snow.push({
      x: Math.random() * ww, y: Math.random() * wh,
      vy: 1 + Math.random() * 1.5, vx: Math.sin(i) * 0.4,
      r: 1.5 + Math.random() * 2.5, ph: Math.random() * Math.PI * 2,
    });
  }
  particles.leaves = [];
  const colors = ['#ff7a3d', '#ffb347', '#e85d4f', '#c0392b', '#f5b041'];
  for (let i = 0; i < 90; i++) {
    particles.leaves.push({
      x: Math.random() * ww, y: Math.random() * wh,
      vy: 0.6 + Math.random() * 1.2, vx: 1.2 + Math.random() * 1.5,
      ph: Math.random() * Math.PI * 2,
      sz: 4 + Math.random() * 4,
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
    for (const p of particles.leaves) {
      const a = p.ph + t * 0.003;
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(a);
      ctx.fillRect(-p.sz/2, -p.sz/2, p.sz, p.sz);
      ctx.restore();
      p.x += p.vx + Math.sin(a) * 0.4;
      p.y += p.vy;
      if (p.y > h) { p.y = -10; p.x = Math.random() * w - 100; }
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

function drawPlatform(plat, map, isGround) {
  const { x, y, w, h } = plat;
  if (map === 'summer') {
    if (isGround) {
      // sandy ground
      ctx.fillStyle = '#ecd092';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#d6b97a';
      for (let i = 0; i < w; i += 12) ctx.fillRect(x + i, y + 4, 6, 2);
    } else {
      // palm tree top: brown trunk under, green leaf top
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(x + w/2 - 6, y + h, 12, 30);
      // leaf canopy
      ctx.fillStyle = '#3aa55a';
      ctx.beginPath();
      ctx.ellipse(x + w/2, y + h/2, w/2, h*1.2, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#52c476';
      ctx.fillRect(x, y, w, 4);
    }
  } else if (map === 'spring') {
    if (isGround) {
      ctx.fillStyle = '#5fa84a';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#7bc15c';
      ctx.fillRect(x, y, w, 6);
    } else {
      ctx.fillStyle = '#7d4f2b';
      ctx.fillRect(x, y + 4, w, h - 4);
      ctx.fillStyle = '#7bc15c';
      ctx.fillRect(x, y, w, 6);
      // tufts
      ctx.fillStyle = '#9adc7a';
      for (let i = 0; i < w; i += 14) {
        ctx.fillRect(x + i, y - 3, 4, 4);
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
      ctx.fillRect(x, y + 4, w, h - 4);
      ctx.fillStyle = '#d97a3c';
      ctx.fillRect(x, y, w, 5);
    }
  } else if (map === 'winter') {
    if (isGround) {
      ctx.fillStyle = '#dde7f0';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x, y, w, 8);
    } else {
      ctx.fillStyle = '#7d8b9c';
      ctx.fillRect(x, y + 6, w, h - 6);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x - 2, y, w + 4, 9);
    }
  }
}

function drawObject(o, map) {
  if (o.type === 'bouncy') {
    // beach umbrella (summer)
    const cx = o.x + o.w / 2;
    // pole
    ctx.fillStyle = '#5b3a1d';
    ctx.fillRect(cx - 2, o.y + 8, 4, o.h + 4);
    // umbrella canopy (red & white stripes)
    ctx.save();
    ctx.translate(cx, o.y + 18);
    ctx.scale(1, 0.55);
    const stripes = ['#e74c3c', '#fff', '#e74c3c', '#fff', '#e74c3c'];
    for (let i = 0; i < stripes.length; i++) {
      ctx.fillStyle = stripes[i];
      ctx.beginPath();
      const a0 = Math.PI + (i / stripes.length) * Math.PI;
      const a1 = Math.PI + ((i+1) / stripes.length) * Math.PI;
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, o.w/2 + 4, a0, a1);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - 2, o.y + 16, 4, 4);
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
    } else if (o.kind === 'leafpile') {
      const cx = o.x + o.w/2;
      const by = o.y + o.h;
      ctx.fillStyle = '#c0392b';
      ctx.beginPath(); ctx.ellipse(cx, by - 8, o.w/2, 18, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#e67e22';
      ctx.beginPath(); ctx.ellipse(cx - 14, by - 18, o.w/3, 14, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath(); ctx.ellipse(cx + 12, by - 22, o.w/3, 12, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#d35400';
      ctx.beginPath(); ctx.ellipse(cx, by - 26, o.w/2.5, 10, 0, 0, Math.PI*2); ctx.fill();
    }
  }
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
  } else if (o.kind === 'leafpile') {
    const cx = o.x + o.w/2;
    const by = o.y + o.h;
    ctx.fillStyle = 'rgba(192,57,43,0.95)';
    ctx.beginPath(); ctx.ellipse(cx, by - 8, o.w/2, 18, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(230,126,34,0.95)';
    ctx.beginPath(); ctx.ellipse(cx - 14, by - 18, o.w/3, 14, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(241,196,15,0.95)';
    ctx.beginPath(); ctx.ellipse(cx + 12, by - 22, o.w/3, 12, 0, 0, Math.PI*2); ctx.fill();
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

  // Body
  ctx.fillStyle = p.color;
  ctx.fillRect(x, y, sz, sz);

  // Outline
  if (p.isIt) {
    ctx.strokeStyle = '#ff2d2d';
    ctx.lineWidth = 3;
    ctx.strokeRect(x - 1, y - 1, sz + 2, sz + 2);
  } else {
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, sz - 1, sz - 1);
  }

  // Eyes
  ctx.fillStyle = '#fff';
  const ex = p.facing > 0 ? x + sz - 9 : x + 4;
  ctx.fillRect(ex, y + 7, 5, 5);
  ctx.fillStyle = '#000';
  ctx.fillRect(ex + (p.facing > 0 ? 2 : 1), y + 8, 2, 3);

  // Frozen overlay
  if (p.frozen) {
    ctx.fillStyle = 'rgba(120,200,255,0.55)';
    ctx.fillRect(x - 2, y - 2, sz + 4, sz + 4);
    ctx.strokeStyle = '#cdefff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 2, y - 2, sz + 4, sz + 4);
  }

  // Shield
  if (p.shieldUntil > now || p.starUntil > now) {
    ctx.strokeStyle = 'rgba(86,207,225,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + sz/2, y + sz/2, sz * 0.85 + Math.sin(t*0.01)*1.2, 0, Math.PI*2);
    ctx.stroke();
  }

  ctx.restore();
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

  // Platforms
  state.gameStart.platforms.forEach((plat, i) => {
    drawPlatform(plat, map, i === 0);
  });

  // Map objects (back layer)
  state.gameStart.objects.forEach(o => drawObject(o, map));

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

    $('hudTime').textContent = fmtTime(snap.endsAt - snap.now);
    $('hudMode').textContent = modeLabel(snap.mode);
    const me = snap.players.find(p => p.id === state.myId);
    $('hudPower').textContent = activePowerLabel(me, snap.now);
  } else {
    $('hudTime').textContent = '--:--';
  }
}
requestAnimationFrame(render);

showScreen('home');
