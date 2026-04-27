const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// ---------- World constants ----------
const WORLD_W = 2400;
const WORLD_H = 1100;
const WALL_W = 30;
const PLAYER_SIZE = 32;
// Snappier (less floaty) jump: total ground-to-ground air time ≈ 0.9 s.
// With JUMP_V=-21 and GRAVITY=1.55, time-to-peak = 21/1.55 ≈ 13.55 frames,
// so air time ≈ 27.1 frames at 30 Hz ≈ 0.903 s. Peak height ≈ 142 px.
const GRAVITY = 1.55;
// 6 seconds end-to-end across the world: 2400 / 6s / 30Hz = 13.33 px/tick
const MOVE_SPEED = 13.33;
const SUPER_SPEED_MUL = 1.55;
const JUMP_V = -21;
const VY_MAX = 26;
const TICK_HZ = 30;
const TAG_COOLDOWN_MS = 2000;
const POWERUP_INTERVAL_MS = 10000;
const POWERUP_DURATION_MS = 6000;
const SHIELD_DURATION_MS = 5000;
const FREEZE_BOUNCE_FACTOR = 1.7; // beach umbrella

// 24 platforms per map — same count + ground + 4 wall-attached "shelves" everywhere,
// but the 19 floating platforms are scattered differently per map so each feels distinct.
const COMMON_PLATFORMS = [
  { x: 0,    y: 1060, w: 2400, h: 40 }, // ground
  { x: 0,    y: 760,  w: 110,  h: 16 }, // left wall low shelf
  { x: 2290, y: 760,  w: 110,  h: 16 }, // right wall low shelf
  { x: 0,    y: 470,  w: 110,  h: 16 }, // left wall high shelf
  { x: 2290, y: 470,  w: 110,  h: 16 }, // right wall high shelf
];

const SUMMER_PLATFORMS = [
  ...COMMON_PLATFORMS,
  { x: 180,  y: 970,  w: 200, h: 16 },
  { x: 480,  y: 950,  w: 180, h: 16 },
  { x: 760,  y: 1000, w: 200, h: 16 },
  { x: 1080, y: 930,  w: 200, h: 16 },
  { x: 1380, y: 990,  w: 200, h: 16 },
  { x: 1820, y: 940,  w: 220, h: 16 },
  { x: 340,  y: 870,  w: 180, h: 16 },
  { x: 680,  y: 830,  w: 200, h: 16 },
  { x: 1140, y: 850,  w: 220, h: 16 },
  { x: 1500, y: 820,  w: 200, h: 16 },
  { x: 1900, y: 820,  w: 200, h: 16 },
  { x: 240,  y: 720,  w: 180, h: 16 },
  { x: 920,  y: 700,  w: 220, h: 16 },
  { x: 1340, y: 720,  w: 200, h: 16 },
  { x: 1700, y: 700,  w: 220, h: 16 },
  { x: 350,  y: 580,  w: 200, h: 16 },
  { x: 1700, y: 580,  w: 220, h: 16 },
  { x: 820,  y: 460,  w: 200, h: 16 },
  { x: 1380, y: 420,  w: 240, h: 16 },
];

const SPRING_PLATFORMS = [
  ...COMMON_PLATFORMS,
  { x: 200,  y: 1000, w: 220, h: 16 },
  { x: 540,  y: 940,  w: 200, h: 16 },
  { x: 860,  y: 970,  w: 180, h: 16 },
  { x: 1140, y: 1000, w: 200, h: 16 },
  { x: 1450, y: 950,  w: 220, h: 16 },
  { x: 1820, y: 980,  w: 200, h: 16 },
  { x: 380,  y: 850,  w: 200, h: 16 },
  { x: 760,  y: 880,  w: 200, h: 16 },
  { x: 1080, y: 830,  w: 220, h: 16 },
  { x: 1460, y: 870,  w: 200, h: 16 },
  { x: 1840, y: 850,  w: 200, h: 16 },
  { x: 200,  y: 700,  w: 180, h: 16 },
  { x: 540,  y: 730,  w: 200, h: 16 },
  { x: 1100, y: 720,  w: 220, h: 16 },
  { x: 1620, y: 700,  w: 220, h: 16 },
  { x: 380,  y: 590,  w: 200, h: 16 },
  { x: 1340, y: 560,  w: 240, h: 16 },
  { x: 700,  y: 470,  w: 200, h: 16 },
  { x: 1700, y: 440,  w: 220, h: 16 },
];

const FALL_PLATFORMS = [
  ...COMMON_PLATFORMS,
  { x: 200,  y: 980,  w: 180, h: 16 },
  { x: 460,  y: 940,  w: 200, h: 16 },
  { x: 740,  y: 990,  w: 200, h: 16 },
  { x: 1040, y: 950,  w: 200, h: 16 },
  { x: 1340, y: 1000, w: 220, h: 16 },
  { x: 1900, y: 970,  w: 220, h: 16 },
  { x: 320,  y: 870,  w: 180, h: 16 },
  { x: 620,  y: 850,  w: 200, h: 16 },
  { x: 940,  y: 820,  w: 200, h: 16 },
  { x: 1260, y: 830,  w: 200, h: 16 },
  { x: 1620, y: 870,  w: 200, h: 16 },
  { x: 200,  y: 720,  w: 200, h: 16 },
  { x: 540,  y: 700,  w: 200, h: 16 },
  { x: 920,  y: 720,  w: 220, h: 16 },
  { x: 1500, y: 740,  w: 220, h: 16 },
  { x: 600,  y: 590,  w: 220, h: 16 },
  { x: 1380, y: 600,  w: 220, h: 16 },
  { x: 880,  y: 470,  w: 240, h: 16 },
  { x: 1540, y: 440,  w: 220, h: 16 },
];

const WINTER_PLATFORMS = [
  ...COMMON_PLATFORMS,
  { x: 220,  y: 990,  w: 220, h: 16 },
  { x: 560,  y: 950,  w: 180, h: 16 },
  { x: 900,  y: 1010, w: 200, h: 16 },
  { x: 1200, y: 940,  w: 220, h: 16 },
  { x: 1540, y: 980,  w: 200, h: 16 },
  { x: 1900, y: 950,  w: 200, h: 16 },
  { x: 360,  y: 850,  w: 200, h: 16 },
  { x: 720,  y: 820,  w: 220, h: 16 },
  { x: 1080, y: 870,  w: 200, h: 16 },
  { x: 1440, y: 830,  w: 200, h: 16 },
  { x: 1820, y: 850,  w: 200, h: 16 },
  { x: 220,  y: 720,  w: 200, h: 16 },
  { x: 1080, y: 700,  w: 220, h: 16 },
  { x: 1500, y: 720,  w: 200, h: 16 },
  { x: 1900, y: 700,  w: 200, h: 16 },
  { x: 480,  y: 580,  w: 220, h: 16 },
  { x: 1640, y: 580,  w: 220, h: 16 },
  { x: 800,  y: 460,  w: 240, h: 16 },
  { x: 1380, y: 420,  w: 240, h: 16 },
];

const PLATFORMS_BY_MAP = {
  summer: SUMMER_PLATFORMS,
  spring: SPRING_PLATFORMS,
  fall: FALL_PLATFORMS,
  winter: WINTER_PLATFORMS,
};

function getPlatforms(lobby) {
  return PLATFORMS_BY_MAP[lobby.settings.map] || SUMMER_PLATFORMS;
}

// Map-specific objects (hiding + bouncy)
// type: 'hide' covers player visually; 'bouncy' boosts jump on top
// Springs are placed in clear vertical columns so the bounce isn't blocked by
// a low-tier platform overhead. Both x-ranges are also clear of every spawn column.
const COMMON_SPRINGS = [
  { type: 'bouncy', x: 115,  y: 1010, w: 60, h: 50 },
  { type: 'bouncy', x: 2120, y: 1010, w: 60, h: 50 },
];

const MAP_OBJECTS = {
  summer: [
    ...COMMON_SPRINGS,
  ],
  spring: [
    // Trees in low-platform gaps; none sit on a spawn column for any player count
    { type: 'hide', x: 80,   y: 900, w: 90, h: 160, kind: 'tree' },
    { type: 'hide', x: 435,  y: 900, w: 90, h: 160, kind: 'tree' },
    { type: 'hide', x: 1050, y: 900, w: 90, h: 160, kind: 'tree' },
    ...COMMON_SPRINGS,
  ],
  fall: [
    // Pumpkin piles sit on top of fall-map platforms
    { type: 'hide', x: 980, y: 770, w: 110, h: 50, kind: 'pumpkin' }, // on (940,820)
    { type: 'hide', x: 960, y: 670, w: 110, h: 50, kind: 'pumpkin' }, // on (920,720)
    ...COMMON_SPRINGS,
  ],
  winter: [
    // Snowmen on ground in winter-map gaps (none on spawn columns)
    { type: 'hide', x: 140,  y: 960, w: 60, h: 100, kind: 'snowman' },
    { type: 'hide', x: 1100, y: 960, w: 60, h: 100, kind: 'snowman' },
    { type: 'hide', x: 1840, y: 960, w: 60, h: 100, kind: 'snowman' },
    ...COMMON_SPRINGS,
  ],
};

// ---------- Lobby store ----------
const lobbies = {}; // code -> lobby

function genCode() {
  let code;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (lobbies[code]);
  return code;
}

function makeLobby(hostId) {
  return {
    hostId,
    players: {}, // socketId -> player
    settings: {
      mode: 'normal', // normal | freeze | infection
      timeLimit: 120, // seconds (max 300)
      map: 'summer',
    },
    inGame: false,
    state: null, // game state when inGame
  };
}

function publicLobby(lobby) {
  return {
    hostId: lobby.hostId,
    players: Object.values(lobby.players).map(p => ({
      id: p.id, username: p.username, color: p.color,
    })),
    settings: lobby.settings,
    inGame: lobby.inGame,
  };
}

function findLobbyOf(socketId) {
  for (const code in lobbies) {
    if (lobbies[code].players[socketId]) return { code, lobby: lobbies[code] };
  }
  return null;
}

// ---------- Game state helpers ----------
function spawnPlayerAt(i, total) {
  // spread spawn points across ground (top of ground - player size)
  const margin = 200;
  const span = WORLD_W - margin * 2;
  const step = total > 1 ? span / (total - 1) : 0;
  return { x: margin + i * step, y: 1060 - PLAYER_SIZE - 4 };
}

function startGame(lobby) {
  const ids = Object.keys(lobby.players);
  if (ids.length < 2) return false;
  const itId = ids[Math.floor(Math.random() * ids.length)];

  ids.forEach((id, i) => {
    const p = lobby.players[id];
    const pos = spawnPlayerAt(i, ids.length);
    p.x = pos.x;
    p.y = pos.y;
    p.vx = 0; p.vy = 0;
    p.onGround = false;
    p.input = { left: false, right: false, up: false };
    p.isIt = (id === itId);
    p.frozen = false;
    p.cantTag = null; // socketId we can't tag (cooldown)
    p.cantTagUntil = 0;
    p.shieldUntil = 0;
    p.invisibleUntil = 0;
    p.speedUntil = 0;
    p.jumpUntil = 0;
    p.starUntil = 0;
    p.activePower = null; // 'swap' is instant; others store as activePower for HUD
    p.facing = 1;
  });

  lobby.inGame = true;
  lobby.state = {
    startedAt: Date.now(),
    endsAt: Date.now() + lobby.settings.timeLimit * 1000,
    powerups: [], // {id, type, x, y, w, h}
    nextPowerupAt: Date.now() + POWERUP_INTERVAL_MS,
    powerupSeq: 1,
    ended: false,
  };
  return true;
}

function endGame(lobby, result) {
  if (!lobby.state || lobby.state.ended) return;
  lobby.state.ended = true;
  lobby.inGame = false;
  io.to(getRoom(lobby)).emit('gameEnd', { result });
}

function getRoom(lobby) {
  // find code by reference
  for (const code in lobbies) if (lobbies[code] === lobby) return 'lobby:' + code;
  return null;
}

// ---------- Physics ----------
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function physicsStep(lobby) {
  const dt = 1; // step units, gravity tuned for 30Hz
  const map = lobby.settings.map;
  const objs = MAP_OBJECTS[map] || [];
  const platforms = getPlatforms(lobby);
  const now = Date.now();

  for (const id in lobby.players) {
    const p = lobby.players[id];
    if (p.frozen) {
      p.vx = 0;
      // still apply gravity so frozen players sit on platforms
    } else {
      const speedMul = (now < p.speedUntil || now < p.starUntil) ? SUPER_SPEED_MUL : 1;
      const jumpMul = (now < p.jumpUntil || now < p.starUntil) ? 1.55 : 1;
      let ax = 0;
      if (p.input.left) ax -= MOVE_SPEED * speedMul;
      if (p.input.right) ax += MOVE_SPEED * speedMul;
      p.vx = ax;
      if (ax < 0) p.facing = -1;
      else if (ax > 0) p.facing = 1;

      if (p.input.up && p.onGround) {
        p.vy = JUMP_V * jumpMul;
        p.onGround = false;
      }
    }

    p.vy += GRAVITY;
    if (p.vy > VY_MAX) p.vy = VY_MAX;

    // Horizontal move + collide
    p.x += p.vx * dt;
    if (p.x < WALL_W) p.x = WALL_W;
    if (p.x + PLAYER_SIZE > WORLD_W - WALL_W) p.x = WORLD_W - WALL_W - PLAYER_SIZE;
    for (const plat of platforms) {
      const pr = { x: p.x, y: p.y, w: PLAYER_SIZE, h: PLAYER_SIZE };
      if (rectsOverlap(pr, plat)) {
        if (p.vx > 0) p.x = plat.x - PLAYER_SIZE;
        else if (p.vx < 0) p.x = plat.x + plat.w;
      }
    }

    // Vertical move + collide
    p.y += p.vy * dt;
    p.onGround = false;
    if (p.y + PLAYER_SIZE > WORLD_H) {
      p.y = WORLD_H - PLAYER_SIZE; p.vy = 0; p.onGround = true;
    }
    for (const plat of platforms) {
      const pr = { x: p.x, y: p.y, w: PLAYER_SIZE, h: PLAYER_SIZE };
      if (rectsOverlap(pr, plat)) {
        if (p.vy > 0) {
          p.y = plat.y - PLAYER_SIZE; p.vy = 0; p.onGround = true;
        } else if (p.vy < 0) {
          p.y = plat.y + plat.h; p.vy = 0;
        }
      }
    }

    // Bouncy umbrellas (Summer): if landing on top
    for (const o of objs) {
      if (o.type !== 'bouncy') continue;
      const pr = { x: p.x, y: p.y, w: PLAYER_SIZE, h: PLAYER_SIZE };
      // top surface
      const top = { x: o.x, y: o.y, w: o.w, h: 8 };
      if (rectsOverlap(pr, top) && p.vy >= 0) {
        p.y = o.y - PLAYER_SIZE;
        p.vy = JUMP_V * FREEZE_BOUNCE_FACTOR;
        p.onGround = false;
      }
    }

    // Hidden flag based on overlap with hide objects (more than 50% covered counts)
    p.hidden = false;
    for (const o of objs) {
      if (o.type !== 'hide') continue;
      const pr = { x: p.x, y: p.y, w: PLAYER_SIZE, h: PLAYER_SIZE };
      if (rectsOverlap(pr, o)) {
        p.hidden = true;
        break;
      }
    }
  }
}

// ---------- Powerups ----------
const POWERUP_TYPES = ['highJump', 'superSpeed', 'invisible', 'swap', 'shield'];

function pickPowerupType() {
  // 1/12 chance for star, otherwise uniform among normal types
  if (Math.random() < 1 / 12) return 'star';
  return POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
}

function spawnPowerup(lobby) {
  // Pick a random platform top (any platform including ground), random x within
  const platforms = getPlatforms(lobby);
  const plat = platforms[Math.floor(Math.random() * platforms.length)];
  const w = 22, h = 22;
  const x = plat.x + 10 + Math.random() * Math.max(0, plat.w - 20 - w);
  const y = plat.y - h - 4;
  const type = pickPowerupType();
  lobby.state.powerups.push({
    id: lobby.state.powerupSeq++,
    type, x, y, w, h,
  });
}

function applyPowerup(lobby, player, type) {
  const now = Date.now();
  switch (type) {
    case 'highJump': player.jumpUntil = now + POWERUP_DURATION_MS; break;
    case 'superSpeed': player.speedUntil = now + POWERUP_DURATION_MS; break;
    case 'invisible': player.invisibleUntil = now + POWERUP_DURATION_MS; break;
    case 'shield': player.shieldUntil = now + SHIELD_DURATION_MS; break;
    case 'swap': {
      // swap with random other player
      const others = Object.values(lobby.players).filter(p => p.id !== player.id);
      if (others.length > 0) {
        const target = others[Math.floor(Math.random() * others.length)];
        const tx = target.x, ty = target.y;
        target.x = player.x; target.y = player.y;
        player.x = tx; player.y = ty;
      }
      break;
    }
    case 'star':
      player.jumpUntil = now + POWERUP_DURATION_MS;
      player.speedUntil = now + POWERUP_DURATION_MS;
      player.invisibleUntil = now + POWERUP_DURATION_MS;
      player.shieldUntil = now + POWERUP_DURATION_MS;
      player.starUntil = now + POWERUP_DURATION_MS;
      break;
  }
}

function pickupPowerups(lobby) {
  for (const id in lobby.players) {
    const p = lobby.players[id];
    if (p.frozen) continue;
    const pr = { x: p.x, y: p.y, w: PLAYER_SIZE, h: PLAYER_SIZE };
    for (let i = lobby.state.powerups.length - 1; i >= 0; i--) {
      const pu = lobby.state.powerups[i];
      if (rectsOverlap(pr, pu)) {
        applyPowerup(lobby, p, pu.type);
        lobby.state.powerups.splice(i, 1);
      }
    }
  }
}

// ---------- Tag/contact resolution ----------
function resolveContacts(lobby) {
  const ids = Object.keys(lobby.players);
  const now = Date.now();
  const mode = lobby.settings.mode;

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = lobby.players[ids[i]];
      const b = lobby.players[ids[j]];
      const ra = { x: a.x, y: a.y, w: PLAYER_SIZE, h: PLAYER_SIZE };
      const rb = { x: b.x, y: b.y, w: PLAYER_SIZE, h: PLAYER_SIZE };
      if (!rectsOverlap(ra, rb)) continue;

      if (mode === 'freeze') {
        // It freezes a non-it on contact
        if (a.isIt && !b.isIt && !b.frozen && now >= b.shieldUntil) {
          b.frozen = true; b.vx = 0;
        } else if (b.isIt && !a.isIt && !a.frozen && now >= a.shieldUntil) {
          a.frozen = true; a.vx = 0;
        } else if (!a.isIt && !b.isIt) {
          // unfreeze each other
          if (a.frozen && !b.frozen) a.frozen = false;
          if (b.frozen && !a.frozen) b.frozen = false;
        }
      } else {
        // normal & infection: tag transfers / spreads
        const cooldownBlock = (taggerId, victimId) => {
          // victim was just tagged by taggerId; now they can't tag taggerId until cantTagUntil
          const v = lobby.players[victimId];
          v.cantTag = taggerId;
          v.cantTagUntil = now + TAG_COOLDOWN_MS;
        };

        const tryTag = (attacker, defender) => {
          if (!attacker.isIt || defender.isIt) return false;
          if (now < defender.shieldUntil) return false;
          if (attacker.cantTag === defender.id && now < attacker.cantTagUntil) return false;
          // tag!
          if (mode === 'normal') {
            attacker.isIt = false;
            defender.isIt = true;
            cooldownBlock(attacker.id, defender.id);
          } else if (mode === 'infection') {
            defender.isIt = true;
            // defender is now a chaser; brief immunity from attacker so they don't double-bounce
            cooldownBlock(attacker.id, defender.id);
          }
          return true;
        };
        if (!tryTag(a, b)) tryTag(b, a);
      }
    }
  }
}

// ---------- Win condition ----------
// End-screen format: only the loser(s) are shown. Each branch computes a `losers`
// array of usernames; the client renders "X lost" / "X, Y lost" from it.
function checkEnd(lobby) {
  const now = Date.now();
  const mode = lobby.settings.mode;
  const players = Object.values(lobby.players);
  if (players.length === 0) { endGame(lobby, { reason: 'empty', losers: [] }); return; }

  if (mode === 'freeze') {
    const nonIt = players.filter(p => !p.isIt);
    if (nonIt.length > 0 && nonIt.every(p => p.frozen)) {
      // Everyone got frozen → all the frozen non-It players lost.
      endGame(lobby, {
        reason: 'all-frozen',
        losers: nonIt.map(p => p.username),
      });
      return;
    }
  }

  if (now >= lobby.state.endsAt) {
    if (mode === 'normal') {
      const it = players.find(p => p.isIt);
      endGame(lobby, {
        reason: 'time',
        losers: it ? [it.username] : [],
      });
    } else if (mode === 'infection') {
      const survivors = players.filter(p => !p.isIt);
      if (survivors.length > 0) {
        // Survivors held out → all current chasers lost.
        endGame(lobby, {
          reason: 'time',
          losers: players.filter(p => p.isIt).map(p => p.username),
        });
      } else {
        // Everyone got infected → all the (formerly survivor) infected players lost.
        // We can't tell the original "It" apart from later infectees, so call them all losers.
        endGame(lobby, {
          reason: 'time',
          losers: players.map(p => p.username),
        });
      }
    } else if (mode === 'freeze') {
      const survivors = players.filter(p => !p.isIt && !p.frozen);
      if (survivors.length > 0) {
        // Timer ran out with someone still unfrozen → It lost.
        endGame(lobby, {
          reason: 'time',
          losers: players.filter(p => p.isIt).map(p => p.username),
        });
      } else {
        // No survivors and no all-frozen branch above ⇒ everyone non-It is frozen.
        endGame(lobby, {
          reason: 'time',
          losers: players.filter(p => !p.isIt).map(p => p.username),
        });
      }
    }
  }
}

// ---------- Game tick ----------
setInterval(() => {
  const now = Date.now();
  for (const code in lobbies) {
    const lobby = lobbies[code];
    if (!lobby.inGame || !lobby.state || lobby.state.ended) continue;

    physicsStep(lobby);
    resolveContacts(lobby);

    // Powerup spawning
    if (now >= lobby.state.nextPowerupAt) {
      spawnPowerup(lobby);
      lobby.state.nextPowerupAt = now + POWERUP_INTERVAL_MS;
    }
    pickupPowerups(lobby);

    checkEnd(lobby);

    // Broadcast state
    const snap = {
      now,
      endsAt: lobby.state.endsAt,
      mode: lobby.settings.mode,
      map: lobby.settings.map,
      players: Object.values(lobby.players).map(p => ({
        id: p.id, username: p.username, color: p.color,
        x: p.x, y: p.y, vx: p.vx, facing: p.facing,
        onGround: p.onGround,
        isIt: p.isIt, frozen: p.frozen, hidden: p.hidden,
        invisibleUntil: p.invisibleUntil,
        shieldUntil: p.shieldUntil,
        speedUntil: p.speedUntil,
        jumpUntil: p.jumpUntil,
        starUntil: p.starUntil,
      })),
      powerups: lobby.state.powerups,
    };
    io.to('lobby:' + code).emit('gameState', snap);
  }
}, 1000 / TICK_HZ);

// ---------- Socket.io ----------
io.on('connection', (socket) => {
  socket.on('createLobby', ({ username, color }) => {
    const code = genCode();
    const lobby = makeLobby(socket.id);
    lobby.players[socket.id] = {
      id: socket.id,
      username: (username || 'Player').slice(0, 16),
      color: color || '#ff5577',
    };
    lobbies[code] = lobby;
    socket.join('lobby:' + code);
    socket.data.lobbyCode = code;
    socket.emit('lobbyJoined', { code, you: socket.id, ...publicLobby(lobby) });
    io.to('lobby:' + code).emit('lobbyUpdate', publicLobby(lobby));
  });

  socket.on('joinLobby', ({ code, username, color }) => {
    code = String(code || '').trim();
    const lobby = lobbies[code];
    if (!lobby) return socket.emit('errorMsg', 'Lobby not found.');
    if (lobby.inGame) return socket.emit('errorMsg', 'Game already in progress.');
    if (Object.keys(lobby.players).length >= 12)
      return socket.emit('errorMsg', 'Lobby full.');
    lobby.players[socket.id] = {
      id: socket.id,
      username: (username || 'Player').slice(0, 16),
      color: color || '#55aaff',
    };
    socket.join('lobby:' + code);
    socket.data.lobbyCode = code;
    socket.emit('lobbyJoined', { code, you: socket.id, ...publicLobby(lobby) });
    io.to('lobby:' + code).emit('lobbyUpdate', publicLobby(lobby));
  });

  socket.on('updateSettings', (settings) => {
    const code = socket.data.lobbyCode;
    const lobby = lobbies[code];
    if (!lobby || lobby.hostId !== socket.id) return;
    if (settings.mode && ['normal','freeze','infection'].includes(settings.mode))
      lobby.settings.mode = settings.mode;
    if (typeof settings.timeLimit === 'number')
      lobby.settings.timeLimit = Math.max(30, Math.min(300, Math.floor(settings.timeLimit)));
    if (settings.map && ['summer','winter','spring','fall'].includes(settings.map))
      lobby.settings.map = settings.map;
    io.to('lobby:' + code).emit('lobbyUpdate', publicLobby(lobby));
  });

  socket.on('startGame', () => {
    const code = socket.data.lobbyCode;
    const lobby = lobbies[code];
    if (!lobby || lobby.hostId !== socket.id) return;
    if (Object.keys(lobby.players).length < 2)
      return socket.emit('errorMsg', 'Need at least 2 players.');
    if (!startGame(lobby))
      return socket.emit('errorMsg', 'Could not start game.');
    io.to('lobby:' + code).emit('gameStart', {
      settings: lobby.settings,
      platforms: getPlatforms(lobby),
      objects: MAP_OBJECTS[lobby.settings.map] || [],
      worldW: WORLD_W,
      worldH: WORLD_H,
      wallW: WALL_W,
      playerSize: PLAYER_SIZE,
    });
  });

  socket.on('input', (input) => {
    const code = socket.data.lobbyCode;
    const lobby = lobbies[code];
    if (!lobby || !lobby.inGame) return;
    const p = lobby.players[socket.id];
    if (!p) return;
    p.input = {
      left: !!input.left,
      right: !!input.right,
      up: !!input.up,
    };
  });

  socket.on('returnToLobby', () => {
    const code = socket.data.lobbyCode;
    const lobby = lobbies[code];
    if (!lobby) return;
    lobby.inGame = false;
    lobby.state = null;
    io.to('lobby:' + code).emit('lobbyUpdate', publicLobby(lobby));
  });

  socket.on('leaveLobby', () => {
    handleLeave(socket);
  });

  socket.on('disconnect', () => {
    handleLeave(socket);
  });
});

function handleLeave(socket) {
  const found = findLobbyOf(socket.id);
  if (!found) return;
  const { code, lobby } = found;
  delete lobby.players[socket.id];
  socket.leave('lobby:' + code);

  if (Object.keys(lobby.players).length === 0) {
    delete lobbies[code];
    return;
  }
  // reassign host if needed
  if (lobby.hostId === socket.id) {
    lobby.hostId = Object.keys(lobby.players)[0];
  }
  io.to('lobby:' + code).emit('lobbyUpdate', publicLobby(lobby));
}

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`Tag game server listening on ${HOST}:${PORT}`);
});
