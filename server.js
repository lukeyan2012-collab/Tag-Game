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
const FREEZE_BOUNCE_FACTOR = 2.05; // springs — strong enough to reach top tier

// 24 platforms per map — same count + ground + 4 wall-attached "shelves" everywhere,
// but the 19 floating platforms are scattered differently per map so each feels distinct.
const COMMON_PLATFORMS = [
  { x: 0,    y: 1060, w: 2400, h: 40 }, // ground
  { x: 0,    y: 760,  w: 110,  h: 16 }, // left wall low shelf
  { x: 2290, y: 760,  w: 110,  h: 16 }, // right wall low shelf
  { x: 0,    y: 470,  w: 110,  h: 16 }, // left wall high shelf
  { x: 2290, y: 470,  w: 110,  h: 16 }, // right wall high shelf
];

// 5 low + 5 mid-low + 3 mid + 3 high + 3 top = 19 floating + 5 fixed = 24.
// Top tier now has THREE platforms spread across left/center/right so the upper
// area isn't sparse and the world doesn't feel left-heavy.
const SUMMER_PLATFORMS = [
  ...COMMON_PLATFORMS,
  // Low (5)
  { x: 220,  y: 980,  w: 200, h: 16 },
  { x: 560,  y: 950,  w: 200, h: 16 },
  { x: 1100, y: 990,  w: 200, h: 16 },
  { x: 1500, y: 960,  w: 200, h: 16 },
  { x: 1820, y: 980,  w: 220, h: 16 },
  // Mid-low (5)
  { x: 340,  y: 850,  w: 200, h: 16 },
  { x: 820,  y: 830,  w: 200, h: 16 },
  { x: 1280, y: 850,  w: 200, h: 16 },
  { x: 1660, y: 830,  w: 200, h: 16 },
  { x: 1980, y: 880,  w: 220, h: 16 },
  // Mid (3)
  { x: 220,  y: 720,  w: 200, h: 16 },
  { x: 1240, y: 730,  w: 200, h: 16 },
  { x: 1700, y: 710,  w: 220, h: 16 },
  // High (3) — tightened so adjacent pairs are within jump reach
  { x: 260,  y: 600,  w: 220, h: 16 },
  { x: 820,  y: 580,  w: 240, h: 16 },
  { x: 1380, y: 600,  w: 220, h: 16 },
  // Top (3)
  { x: 340,  y: 460,  w: 240, h: 16 },
  { x: 940,  y: 440,  w: 240, h: 16 },
  { x: 1700, y: 470,  w: 240, h: 16 },
];

const SPRING_PLATFORMS = [
  ...COMMON_PLATFORMS,
  // Low (5)
  { x: 200,  y: 990,  w: 220, h: 16 },
  { x: 540,  y: 950,  w: 200, h: 16 },
  { x: 880,  y: 970,  w: 200, h: 16 },
  { x: 1240, y: 950,  w: 200, h: 16 },
  { x: 1740, y: 950,  w: 220, h: 16 },
  // Mid-low (5)
  { x: 380,  y: 870,  w: 200, h: 16 },
  { x: 740,  y: 830,  w: 220, h: 16 },
  { x: 1080, y: 840,  w: 200, h: 16 },
  { x: 1440, y: 820,  w: 200, h: 16 },
  { x: 1860, y: 850,  w: 200, h: 16 },
  // Mid (3)
  { x: 220,  y: 730,  w: 200, h: 16 },
  { x: 1100, y: 710,  w: 220, h: 16 },
  { x: 1620, y: 720,  w: 220, h: 16 },
  // High (3) — tightened
  { x: 560,  y: 590,  w: 220, h: 16 },
  { x: 1080, y: 580,  w: 240, h: 16 },
  { x: 1620, y: 600,  w: 220, h: 16 },
  // Top (3)
  { x: 220,  y: 460,  w: 200, h: 16 },
  { x: 1000, y: 440,  w: 240, h: 16 },
  { x: 1700, y: 470,  w: 220, h: 16 },
];

const FALL_PLATFORMS = [
  ...COMMON_PLATFORMS,
  // Low (5)
  { x: 240,  y: 970,  w: 200, h: 16 },
  { x: 600,  y: 990,  w: 200, h: 16 },
  { x: 940,  y: 950,  w: 200, h: 16 },
  { x: 1300, y: 990,  w: 200, h: 16 },
  { x: 1820, y: 970,  w: 220, h: 16 },
  // Mid-low (5)
  { x: 320,  y: 830,  w: 220, h: 16 },
  { x: 720,  y: 870,  w: 200, h: 16 },
  { x: 1080, y: 830,  w: 200, h: 16 },
  { x: 1500, y: 840,  w: 220, h: 16 },
  { x: 1900, y: 830,  w: 220, h: 16 },
  // Mid (3) — tightened
  { x: 380,  y: 700,  w: 220, h: 16 },
  { x: 940,  y: 720,  w: 220, h: 16 },
  { x: 1500, y: 710,  w: 220, h: 16 },
  // High (3) — tightened
  { x: 260,  y: 600,  w: 220, h: 16 },
  { x: 740,  y: 590,  w: 220, h: 16 },
  { x: 1300, y: 600,  w: 220, h: 16 },
  // Top (3)
  { x: 380,  y: 470,  w: 220, h: 16 },
  { x: 1000, y: 450,  w: 240, h: 16 },
  { x: 1700, y: 460,  w: 220, h: 16 },
];

const WINTER_PLATFORMS = [
  ...COMMON_PLATFORMS,
  // Low (5)
  { x: 220,  y: 990,  w: 220, h: 16 },
  { x: 580,  y: 950,  w: 200, h: 16 },
  { x: 940,  y: 980,  w: 200, h: 16 },
  { x: 1300, y: 950,  w: 220, h: 16 },
  { x: 1700, y: 990,  w: 200, h: 16 },
  // Mid-low (5)
  { x: 360,  y: 850,  w: 200, h: 16 },
  { x: 720,  y: 820,  w: 220, h: 16 },
  { x: 1100, y: 850,  w: 200, h: 16 },
  { x: 1500, y: 820,  w: 200, h: 16 },
  { x: 1900, y: 860,  w: 220, h: 16 },
  // Mid (3) — tightened
  { x: 340,  y: 720,  w: 200, h: 16 },
  { x: 880,  y: 710,  w: 220, h: 16 },
  { x: 1320, y: 720,  w: 220, h: 16 },
  // High (3) — tightened
  { x: 660,  y: 590,  w: 220, h: 16 },
  { x: 1100, y: 580,  w: 220, h: 16 },
  { x: 1620, y: 600,  w: 220, h: 16 },
  // Top (3)
  { x: 240,  y: 460,  w: 200, h: 16 },
  { x: 1080, y: 440,  w: 240, h: 16 },
  { x: 1700, y: 470,  w: 220, h: 16 },
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
// Springs sit in vertical columns that are clear of every overhead platform in
// every map, and clear of every spawn column. Bounce is now strong enough to
// reach the top tier directly.
const COMMON_SPRINGS = [
  { type: 'bouncy', x: 115,  y: 1010, w: 60, h: 50 },
  { type: 'bouncy', x: 2200, y: 1010, w: 60, h: 50 },
];

// Hide objects (trees / snowmen / pumpkin piles) removed for now per request.
const MAP_OBJECTS = {
  summer: [...COMMON_SPRINGS],
  spring: [...COMMON_SPRINGS],
  fall:   [...COMMON_SPRINGS],
  winter: [...COMMON_SPRINGS],
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

function makeLobby(hostId, isPublic, isPractice) {
  return {
    hostId,
    isPublic: !!isPublic,
    isPractice: !!isPractice,
    players: {}, // socketId -> player
    settings: {
      mode: 'normal', // normal | freeze | infection
      timeLimit: 120, // seconds (max 300)
      map: 'summer',
    },
    inGame: false,
    state: null,
  };
}

function defaultUsername() {
  return 'Player' + (1000 + Math.floor(Math.random() * 9000));
}

// Validate / normalise a username. Empty → unique default name.
function cleanName(s) {
  s = String(s || '').trim().slice(0, 16);
  return s || defaultUsername();
}

// Public-lobby browser list — only lobbies marked isPublic and not yet in-game.
function publicLobbiesList() {
  const out = [];
  for (const code in lobbies) {
    const l = lobbies[code];
    if (!l.isPublic || l.inGame) continue;
    const host = l.players[l.hostId];
    out.push({
      code,
      host: host ? host.username : 'host',
      playerCount: Object.keys(l.players).length,
      mode: l.settings.mode,
      map: l.settings.map,
    });
  }
  return out;
}

function broadcastPublicLobbies() {
  io.to('home').emit('publicLobbies', publicLobbiesList());
}

function publicLobby(lobby) {
  return {
    hostId: lobby.hostId,
    isPublic: !!lobby.isPublic,
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
  // Spread spawn points across ground. Margin chosen so the rightmost spawn
  // column never overlaps the right spring at x=2200.
  const margin = 240;
  const span = WORLD_W - margin * 2;
  const step = total > 1 ? span / (total - 1) : 0;
  return { x: margin + i * step, y: 1060 - PLAYER_SIZE - 4 };
}

function startGame(lobby) {
  const ids = Object.keys(lobby.players);
  // Practice mode runs solo; everyone else needs ≥ 2 players.
  if (!lobby.isPractice && ids.length < 2) return false;
  if (lobby.isPractice && ids.length < 1) return false;
  const itId = lobby.isPractice ? null : ids[Math.floor(Math.random() * ids.length)];

  ids.forEach((id, i) => {
    const p = lobby.players[id];
    const pos = spawnPlayerAt(i, Math.max(ids.length, 2));
    p.x = pos.x;
    p.y = pos.y;
    p.vx = 0; p.vy = 0;
    p.onGround = false;
    p.input = { left: false, right: false, up: false };
    p.wasJumpPressed = false;
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
    // Practice mode has no time limit — set far in the future.
    endsAt: lobby.isPractice
      ? Date.now() + 1000 * 60 * 60 * 24
      : Date.now() + lobby.settings.timeLimit * 1000,
    originalItId: itId, // remembered so Infection can name the original chaser
    powerups: [],
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

      // Edge-triggered jump: only fires on a fresh up-press, not while held.
      const jumpPressed = p.input.up && !p.wasJumpPressed;
      p.wasJumpPressed = !!p.input.up;
      if (jumpPressed && p.onGround) {
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

  if (mode === 'infection') {
    // Early-end: all players are It (everyone got tagged) → original It wins.
    const allIt = players.length > 1 && players.every(p => p.isIt);
    if (allIt) {
      const orig = lobby.players[lobby.state.originalItId];
      endGame(lobby, {
        reason: 'all-infected',
        winner: orig ? orig.username : null,
        losers: players
          .filter(p => p.id !== lobby.state.originalItId)
          .map(p => p.username),
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
        // Everyone got infected → the player who was "It" first wins (they
        // tagged everyone). Everyone else is a loser.
        const orig = lobby.players[lobby.state.originalItId];
        endGame(lobby, {
          reason: 'all-infected',
          winner: orig ? orig.username : null,
          losers: players
            .filter(p => p.id !== lobby.state.originalItId)
            .map(p => p.username),
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

    // Practice mode: solo, no tagging, no powerups, no end conditions.
    if (!lobby.isPractice) {
      resolveContacts(lobby);
      if (now >= lobby.state.nextPowerupAt) {
        spawnPowerup(lobby);
        lobby.state.nextPowerupAt = now + POWERUP_INTERVAL_MS;
      }
      pickupPowerups(lobby);
      checkEnd(lobby);
    }

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
  // Every freshly-connected socket is on the home screen by default.
  socket.join('home');
  socket.emit('publicLobbies', publicLobbiesList());

  socket.on('createLobby', ({ username, color, isPublic, isPractice, map }) => {
    const code = genCode();
    const lobby = makeLobby(socket.id, isPublic, isPractice);
    // Apply requested map BEFORE auto-starting (fixes practice race condition
    // where the map dropdown change arrived after gameStart).
    if (map && ['summer','spring','fall','winter'].includes(map)) {
      lobby.settings.map = map;
    }
    lobby.players[socket.id] = {
      id: socket.id,
      username: cleanName(username),
      color: color || '#ff5577',
    };
    lobbies[code] = lobby;
    socket.leave('home');
    socket.join('lobby:' + code);
    socket.data.lobbyCode = code;
    socket.emit('lobbyJoined', { code, you: socket.id, ...publicLobby(lobby) });
    io.to('lobby:' + code).emit('lobbyUpdate', publicLobby(lobby));
    if (lobby.isPublic) broadcastPublicLobbies();

    // Practice: auto-start the game so the player goes straight in.
    if (lobby.isPractice) {
      if (startGame(lobby)) {
        io.to('lobby:' + code).emit('gameStart', {
          settings: lobby.settings,
          platforms: getPlatforms(lobby),
          objects: MAP_OBJECTS[lobby.settings.map] || [],
          worldW: WORLD_W, worldH: WORLD_H, wallW: WALL_W,
          playerSize: PLAYER_SIZE,
          isPractice: true,
        });
      }
    }
  });

  socket.on('joinLobby', ({ code, username, color }) => {
    code = String(code || '').trim();
    const lobby = lobbies[code];
    if (!lobby) return socket.emit('errorMsg', 'Lobby not found.');
    if (lobby.isPractice) return socket.emit('errorMsg', 'Cannot join a practice game.');
    if (lobby.inGame) return socket.emit('errorMsg', 'Game already in progress.');
    if (Object.keys(lobby.players).length >= 12)
      return socket.emit('errorMsg', 'Lobby full.');
    lobby.players[socket.id] = {
      id: socket.id,
      username: cleanName(username),
      color: color || '#55aaff',
    };
    socket.leave('home');
    socket.join('lobby:' + code);
    socket.data.lobbyCode = code;
    socket.emit('lobbyJoined', { code, you: socket.id, ...publicLobby(lobby) });
    io.to('lobby:' + code).emit('lobbyUpdate', publicLobby(lobby));
    if (lobby.isPublic) broadcastPublicLobbies();
  });

  // ---------- Chat ----------
  // Scope: when in a lobby/game, message goes to that lobby room. Otherwise it
  // goes to the public 'home' room (visible on the title screen).
  socket.on('chat', ({ text }) => {
    text = String(text || '').slice(0, 200).trim();
    if (!text) return;
    const code = socket.data.lobbyCode;
    let username = 'Anon', color = '#aaa';
    if (code && lobbies[code] && lobbies[code].players[socket.id]) {
      username = lobbies[code].players[socket.id].username;
      color = lobbies[code].players[socket.id].color;
    } else {
      // Stash a transient name on the socket so home-screen chat works
      username = socket.data.homeName || defaultUsername();
      socket.data.homeName = username;
      color = socket.data.homeColor || '#aaa';
    }
    const msg = { from: username, color, text, time: Date.now() };
    if (code && lobbies[code]) {
      io.to('lobby:' + code).emit('chat', { ...msg, scope: 'lobby' });
    } else {
      io.to('home').emit('chat', { ...msg, scope: 'home' });
    }
  });

  // Client tells server its current home-screen name/color (for chat without lobby)
  socket.on('homeIdentity', ({ username, color }) => {
    socket.data.homeName = cleanName(username);
    socket.data.homeColor = color || '#aaa';
  });

  // Client requests a fresh snapshot of public lobbies (e.g. when returning to home)
  socket.on('refreshPublicLobbies', () => {
    socket.join('home');
    socket.emit('publicLobbies', publicLobbiesList());
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
    if (lobby.isPublic) broadcastPublicLobbies();
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
    if (lobby.isPublic) broadcastPublicLobbies();
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
  const wasPublic = lobby.isPublic;
  delete lobby.players[socket.id];
  socket.leave('lobby:' + code);
  socket.data.lobbyCode = null;
  // Person who explicitly left re-joins the home room so they see public lobbies
  if (socket.connected) {
    socket.join('home');
    socket.emit('publicLobbies', publicLobbiesList());
  }

  if (Object.keys(lobby.players).length === 0) {
    delete lobbies[code];
    if (wasPublic) broadcastPublicLobbies();
    return;
  }
  if (lobby.hostId === socket.id) {
    lobby.hostId = Object.keys(lobby.players)[0];
  }
  io.to('lobby:' + code).emit('lobbyUpdate', publicLobby(lobby));
  if (wasPublic) broadcastPublicLobbies();
}

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`Tag game server listening on ${HOST}:${PORT}`);
});
