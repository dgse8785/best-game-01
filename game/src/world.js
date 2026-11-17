// NEON DRIFT's rules and state, with no drawing and no browser in it: the ship, its bullets,
// four kinds of geometric enemy, their shots, drifting power-ups, particles and floating
// score text. Waves arrive on a schedule and grow; kills build a combo multiplier; a bomb
// clears the arena. step() advances one fixed step given a control object and returns what
// happened as bit flags, so the caller can react (sound, announcements) without the world
// knowing about screens. Every random draw comes from the seeded generator handed in, so a
// seed replays a run exactly. Nothing allocates after createWorld returns.
import { COMBO, ENEMY, FIELD, LIVES, PLAYER, POINTS, POOLS, POWERUP, WAVE } from './config.js';

export const KIND_CHASER = 0;
export const KIND_MINI = 1;
export const KIND_SPLITTER = 2;
export const KIND_ORBITER = 3;

export const POWER_RAPID = 0;
export const POWER_SHIELD = 1;
export const POWER_BOMB = 2;

export const EVENT_SHOOT = 1;
export const EVENT_KILL = 2;
export const EVENT_HIT = 4;
export const EVENT_POWER = 8;
export const EVENT_WAVE = 16;
export const EVENT_OVER = 32;
export const EVENT_BOMB = 64;
export const EVENT_SHIELD = 128;

const KIND_STATS = [ENEMY.chaser, ENEMY.mini, ENEMY.splitter, ENEMY.orbiter];
const KIND_POINTS = [POINTS.chaser, POINTS.mini, POINTS.splitter, POINTS.orbiter];

function makePool(size, build) {
  const pool = [];
  for (let index = 0; index < size; index += 1) pool.push(build());
  return pool;
}

function freeOf(pool) {
  for (let index = 0; index < pool.length; index += 1) if (!pool[index].active) return pool[index];
  return null;
}

function countActive(pool) {
  let n = 0;
  for (let index = 0; index < pool.length; index += 1) if (pool[index].active) n += 1;
  return n;
}

export function createWorld(random) {
  const player = {
    x: FIELD.width / 2, y: FIELD.height / 2, vx: 0, vy: 0,
    aim: -Math.PI / 2, fireTimer: 0, invulnerable: 0, rapid: 0, shield: false, alive: true,
  };
  const bullets = makePool(POOLS.bullets, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 }));
  const hostile = makePool(POOLS.hostile, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 }));
  const enemies = makePool(POOLS.enemies, () => ({
    active: false, kind: KIND_CHASER, x: 0, y: 0, vx: 0, vy: 0, hp: 1, radius: 10,
    angle: 0, spin: 0, wobble: 0, shotTimer: 0, flash: 0, driftX: 0, driftY: 0,
  }));
  const particles = makePool(POOLS.particles, () => ({
    active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#ffffff',
  }));
  const floaters = makePool(POOLS.floaters, () => ({ active: false, x: 0, y: 0, life: 0, text: '', color: '#ffffff', size: 18 }));
  const powerups = makePool(POOLS.powerups, () => ({ active: false, kind: POWER_RAPID, x: 0, y: 0, vx: 0, vy: 0, life: 0 }));
  const stars = [];
  for (let index = 0; index < POOLS.stars; index += 1) {
    stars.push({ x: random() * FIELD.width, y: random() * FIELD.height, size: 1 + random() * 1.8, layer: random() });
  }

  const state = {
    player, bullets, hostile, enemies, particles, floaters, powerups, stars,
    score: 0, lives: LIVES, wave: 0, time: 0,
    combo: 0, comboTimer: 0, multiplier: 1,
    toSpawn: 0, spawnTimer: 0, phase: 'intermission', phaseTimer: 1.2, banner: 0, bannerText: '',
    shake: 0, hurtFlash: 0, bombFlash: 0, over: false,
  };

  function burst(x, y, color, count, speed, size, life) {
    for (let index = 0; index < count; index += 1) {
      const p = freeOf(particles);
      if (p === null) return;
      const angle = random() * Math.PI * 2;
      const v = speed * (0.25 + random() * 0.95);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * v;
      p.vy = Math.sin(angle) * v;
      p.maxLife = life * (0.55 + random() * 0.8);
      p.life = p.maxLife;
      p.size = size * (0.6 + random() * 0.9);
      p.color = color;
    }
  }

  function floatText(x, y, text, color, size) {
    const f = freeOf(floaters);
    if (f === null) return;
    f.active = true;
    f.x = x;
    f.y = y;
    f.life = 0.95;
    f.text = text;
    f.color = color;
    f.size = size;
  }

  /** Which kinds a wave is made of: new kinds join as the waves climb. */
  function pickKind(wave) {
    const roll = random();
    if (wave <= 1) return KIND_CHASER;
    if (wave === 2) return roll < 0.72 ? KIND_CHASER : KIND_SPLITTER;
    if (wave === 3) return roll < 0.55 ? KIND_CHASER : roll < 0.78 ? KIND_SPLITTER : KIND_ORBITER;
    if (roll < 0.46) return KIND_CHASER;
    if (roll < 0.7) return KIND_SPLITTER;
    return KIND_ORBITER;
  }

  function spawnEnemy(kind, x, y) {
    const e = freeOf(enemies);
    if (e === null) return null;
    const stats = KIND_STATS[kind];
    const speedScale = Math.min(ENEMY.speedCap, 1 + (state.wave - 1) * ENEMY.speedPerWave);
    e.active = true;
    e.kind = kind;
    e.x = x;
    e.y = y;
    e.vx = 0;
    e.vy = 0;
    e.hp = stats.hp + (kind === KIND_CHASER && state.wave >= 6 ? 1 : 0);
    e.radius = stats.radius;
    e.angle = random() * Math.PI * 2;
    e.spin = (random() - 0.5) * 2.4;
    e.wobble = random() * Math.PI * 2;
    e.shotTimer = ENEMY.orbiter.shotInterval * (0.6 + random() * 0.8);
    e.flash = 0;
    e.speedScale = speedScale;
    const driftAngle = random() * Math.PI * 2;
    e.driftX = Math.cos(driftAngle) * 34;
    e.driftY = Math.sin(driftAngle) * 34;
    return e;
  }

  /** A spawn point on the arena's edge, kept away from the ship. */
  function spawnPoint() {
    for (let tries = 0; tries < 12; tries += 1) {
      const side = Math.floor(random() * 4);
      const x = side === 0 ? 24 : side === 1 ? FIELD.width - 24 : 24 + random() * (FIELD.width - 48);
      const y = side === 2 ? 24 : side === 3 ? FIELD.height - 24 : 24 + random() * (FIELD.height - 48);
      const dx = x - player.x;
      const dy = y - player.y;
      if (dx * dx + dy * dy >= WAVE.safeRadius * WAVE.safeRadius) return { x, y };
    }
    return { x: FIELD.width / 2, y: 24 };
  }

  function startWave() {
    state.wave += 1;
    state.toSpawn = WAVE.base + WAVE.perWave * (state.wave - 1);
    state.spawnTimer = 0.4;
    state.phase = 'active';
    state.banner = WAVE.bannerSeconds;
    state.bannerText = `WAVE ${state.wave}`;
  }

  function dropPowerup(x, y) {
    if (random() > POWERUP.dropChance) return;
    const p = freeOf(powerups);
    if (p === null) return;
    const roll = random();
    p.kind = roll < 0.45 ? POWER_RAPID : roll < 0.8 ? POWER_SHIELD : POWER_BOMB;
    p.active = true;
    p.x = x;
    p.y = y;
    const angle = random() * Math.PI * 2;
    p.vx = Math.cos(angle) * POWERUP.drift;
    p.vy = Math.sin(angle) * POWERUP.drift;
    p.life = POWERUP.life;
  }

  function addScore(x, y, base, color) {
    const gained = base * state.multiplier;
    state.score += gained;
    floatText(x, y - 14, `+${gained}`, color, state.multiplier >= 4 ? 23 : 18);
  }

  /** Destroy an enemy: score, particles, splitter children, a possible drop. Returns events. */
  function killEnemy(e, events) {
    e.active = false;
    const color = ['#ff3d7f', '#ff8fb3', '#ff9f2e', '#37e0a0'][e.kind];
    burst(e.x, e.y, color, e.kind === KIND_SPLITTER ? 26 : 15, 300, 3, 0.55);
    state.combo += 1;
    state.comboTimer = COMBO.window;
    state.multiplier = Math.min(COMBO.maxMultiplier, 1 + Math.floor(state.combo / COMBO.killsPerStep));
    addScore(e.x, e.y, KIND_POINTS[e.kind], color);
    state.shake = Math.min(16, state.shake + (e.kind === KIND_SPLITTER ? 4 : 1.6));
    if (e.kind === KIND_SPLITTER) {
      for (let index = 0; index < ENEMY.splitter.children; index += 1) {
        const child = spawnEnemy(KIND_MINI, e.x + (random() - 0.5) * 26, e.y + (random() - 0.5) * 26);
        if (child !== null) {
          const angle = random() * Math.PI * 2;
          child.vx = Math.cos(angle) * 190;
          child.vy = Math.sin(angle) * 190;
        }
      }
    }
    dropPowerup(e.x, e.y);
    return events | EVENT_KILL;
  }

  /** The bomb: every enemy in the arena dies in one rolling flash. Returns events. */
  function detonate(events) {
    state.bombFlash = 0.5;
    state.shake = 17;
    burst(player.x, player.y, '#ffd9d0', 46, 520, 3.4, 0.8);
    for (let index = 0; index < enemies.length; index += 1) {
      const e = enemies[index];
      if (e.active) events = killEnemy(e, events);
    }
    for (let index = 0; index < hostile.length; index += 1) hostile[index].active = false;
    return events | EVENT_BOMB;
  }

  /** A hit on the ship: the shield eats it, else a life goes. Returns events. */
  function hitPlayer(events) {
    if (player.invulnerable > 0 || !player.alive) return events;
    if (player.shield) {
      player.shield = false;
      player.invulnerable = 1.1;
      burst(player.x, player.y, '#57b6ff', 18, 300, 2.6, 0.45);
      return events | EVENT_SHIELD;
    }
    state.lives -= 1;
    state.combo = 0;
    state.multiplier = 1;
    state.comboTimer = 0;
    state.hurtFlash = 0.45;
    state.shake = 15;
    player.invulnerable = PLAYER.invulnerable;
    burst(player.x, player.y, '#59f7ff', 30, 380, 3, 0.7);
    events |= EVENT_HIT;
    if (state.lives <= 0) {
      player.alive = false;
      state.over = true;
      burst(player.x, player.y, '#eafcff', 60, 460, 3.6, 1.1);
      events |= EVENT_OVER;
    }
    return events;
  }

  function reset() {
    player.x = FIELD.width / 2;
    player.y = FIELD.height / 2;
    player.vx = 0;
    player.vy = 0;
    player.aim = -Math.PI / 2;
    player.fireTimer = 0;
    player.invulnerable = 0;
    player.rapid = 0;
    player.shield = false;
    player.alive = true;
    for (const pool of [bullets, hostile, enemies, particles, floaters, powerups]) {
      for (const item of pool) item.active = false;
    }
    state.score = 0;
    state.lives = LIVES;
    state.wave = 0;
    state.time = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.multiplier = 1;
    state.toSpawn = 0;
    state.spawnTimer = 0;
    state.phase = 'intermission';
    state.phaseTimer = 1.4;
    state.banner = 0;
    state.bannerText = '';
    state.shake = 0;
    state.hurtFlash = 0;
    state.bombFlash = 0;
    state.over = false;
  }

  /**
   * One fixed step. `ctl` is { moveX, moveY, aimX, aimY, fire } in field coordinates. With
   * `harmless` set (the title screen's backdrop) enemies drift and wrap without targeting,
   * nothing shoots, nothing collides and nothing scores.
   */
  function step(dt, ctl, harmless) {
    let events = 0;
    state.time += dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 26);
    if (state.hurtFlash > 0) state.hurtFlash = Math.max(0, state.hurtFlash - dt);
    if (state.bombFlash > 0) state.bombFlash = Math.max(0, state.bombFlash - dt);
    if (state.banner > 0) state.banner = Math.max(0, state.banner - dt);
    if (state.comboTimer > 0) {
      state.comboTimer = Math.max(0, state.comboTimer - dt);
      if (state.comboTimer === 0) {
        state.combo = 0;
        state.multiplier = 1;
      }
    }

    // Waves: spawn on schedule, and open the next wave once the arena is clear.
    if (!harmless) {
      if (state.phase === 'intermission') {
        state.phaseTimer -= dt;
        if (state.phaseTimer <= 0 && player.alive) {
          startWave();
          events |= EVENT_WAVE;
        }
      } else if (state.toSpawn > 0) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          const point = spawnPoint();
          spawnEnemy(pickKind(state.wave), point.x, point.y);
          state.toSpawn -= 1;
          const interval = Math.max(WAVE.minSpawnInterval, WAVE.spawnInterval - state.wave * WAVE.spawnIntervalPerWave);
          state.spawnTimer = interval * (0.7 + random() * 0.6);
        }
      } else if (countActive(enemies) === 0 && player.alive) {
        state.phase = 'intermission';
        state.phaseTimer = WAVE.intermission;
        state.banner = 1.6;
        state.bannerText = 'WAVE CLEAR';
      }
    } else if (random() < dt * 0.55 && countActive(enemies) < 9) {
      const point = spawnPoint();
      spawnEnemy(pickKind(3), point.x, point.y);
    }

    // The ship: velocity toward the held direction, aim at the pointer, fire on the trigger.
    if (player.alive) {
      const length = Math.hypot(ctl.moveX, ctl.moveY);
      const wantX = length > 0 ? (ctl.moveX / Math.max(1, length)) * PLAYER.speed : 0;
      const wantY = length > 0 ? (ctl.moveY / Math.max(1, length)) * PLAYER.speed : 0;
      const blend = Math.min(1, PLAYER.agility * dt);
      player.vx += (wantX - player.vx) * blend;
      player.vy += (wantY - player.vy) * blend;
      player.x = Math.min(FIELD.width - PLAYER.radius, Math.max(PLAYER.radius, player.x + player.vx * dt));
      player.y = Math.min(FIELD.height - PLAYER.radius, Math.max(PLAYER.radius, player.y + player.vy * dt));
      player.aim = Math.atan2(ctl.aimY - player.y, ctl.aimX - player.x);
      if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);
      if (player.rapid > 0) player.rapid = Math.max(0, player.rapid - dt);
      if (length > 0 && random() < dt * 26) {
        const p = freeOf(particles);
        if (p !== null) {
          p.active = true;
          p.x = player.x - Math.cos(player.aim) * 0 - player.vx * 0.03 + (random() - 0.5) * 6;
          p.y = player.y - player.vy * 0.03 + (random() - 0.5) * 6;
          p.vx = -player.vx * 0.35 + (random() - 0.5) * 30;
          p.vy = -player.vy * 0.35 + (random() - 0.5) * 30;
          p.maxLife = 0.34;
          p.life = p.maxLife;
          p.size = 2;
          p.color = '#2de2ff';
        }
      }
      player.fireTimer -= dt;
      if (ctl.fire && !harmless && player.fireTimer <= 0) {
        const b = freeOf(bullets);
        if (b !== null) {
          b.active = true;
          b.x = player.x + Math.cos(player.aim) * (PLAYER.radius + 4);
          b.y = player.y + Math.sin(player.aim) * (PLAYER.radius + 4);
          b.vx = Math.cos(player.aim) * PLAYER.bulletSpeed;
          b.vy = Math.sin(player.aim) * PLAYER.bulletSpeed;
          b.life = PLAYER.bulletLife;
          events |= EVENT_SHOOT;
        }
        player.fireTimer = player.rapid > 0 ? PLAYER.rapidInterval : PLAYER.fireInterval;
      }
    }

    // Bullets, ours and theirs.
    for (const b of bullets) {
      if (!b.active) continue;
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) b.active = false;
    }
    for (const b of hostile) {
      if (!b.active) continue;
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) {
        b.active = false;
        continue;
      }
      if (!harmless && player.alive) {
        const dx = b.x - player.x;
        const dy = b.y - player.y;
        if (dx * dx + dy * dy < (PLAYER.radius + 4) * (PLAYER.radius + 4)) {
          b.active = false;
          events = hitPlayer(events);
        }
      }
    }

    // Enemies: steer by kind, then collide with bullets and with the ship.
    for (const e of enemies) {
      if (!e.active) continue;
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt);
      e.wobble += dt * 3;
      if (harmless) {
        e.x += e.driftX * dt;
        e.y += e.driftY * dt;
        e.angle += e.spin * dt;
        if (e.x < -40) e.x = FIELD.width + 40;
        if (e.x > FIELD.width + 40) e.x = -40;
        if (e.y < -40) e.y = FIELD.height + 40;
        if (e.y > FIELD.height + 40) e.y = -40;
        continue;
      }
      const stats = KIND_STATS[e.kind];
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const ux = dx / dist;
      const uy = dy / dist;
      let wantX;
      let wantY;
      if (e.kind === KIND_ORBITER) {
        const radial = dist > ENEMY.orbiter.orbitRange + 18 ? 1 : dist < ENEMY.orbiter.orbitRange - 18 ? -0.7 : 0;
        const tx = -uy;
        const ty = ux;
        wantX = (ux * radial + tx * 0.9) * stats.speed * e.speedScale;
        wantY = (uy * radial + ty * 0.9) * stats.speed * e.speedScale;
        e.shotTimer -= dt;
        if (e.shotTimer <= 0 && player.alive && dist < 560) {
          const b = freeOf(hostile);
          if (b !== null) {
            b.active = true;
            b.x = e.x;
            b.y = e.y;
            b.vx = ux * ENEMY.orbiter.shotSpeed;
            b.vy = uy * ENEMY.orbiter.shotSpeed;
            b.life = 3.4;
          }
          e.shotTimer = ENEMY.orbiter.shotInterval * (0.8 + random() * 0.5);
        }
      } else {
        const wobble = e.kind === KIND_MINI ? 0.45 : 0.16;
        const wx = Math.cos(e.wobble) * wobble;
        const wy = Math.sin(e.wobble * 1.3) * wobble;
        wantX = (ux + wx) * stats.speed * e.speedScale;
        wantY = (uy + wy) * stats.speed * e.speedScale;
      }
      const blendE = Math.min(1, (stats.accel / stats.speed) * dt);
      e.vx += (wantX - e.vx) * blendE;
      e.vy += (wantY - e.vy) * blendE;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.angle = Math.atan2(e.vy, e.vx);
      // Gentle separation so a swarm reads as individuals, not a blob.
      for (const other of enemies) {
        if (other === e || !other.active) continue;
        const sx = e.x - other.x;
        const sy = e.y - other.y;
        const sd = sx * sx + sy * sy;
        const min = (e.radius + other.radius) * 0.9;
        if (sd > 0.01 && sd < min * min) {
          const push = (min - Math.sqrt(sd)) * 0.5;
          const inv = 1 / Math.sqrt(sd);
          e.x += sx * inv * push;
          e.y += sy * inv * push;
        }
      }
      if (player.alive) {
        const pdx = e.x - player.x;
        const pdy = e.y - player.y;
        const rr = e.radius + PLAYER.radius - 3;
        if (pdx * pdx + pdy * pdy < rr * rr) {
          e.active = false;
          burst(e.x, e.y, '#ffffff', 10, 240, 2.4, 0.4);
          events = hitPlayer(events);
        }
      }
    }

    // Our bullets against the enemies.
    for (const b of bullets) {
      if (!b.active) continue;
      for (const e of enemies) {
        if (!e.active) continue;
        const dx = e.x - b.x;
        const dy = e.y - b.y;
        const rr = e.radius + PLAYER.bulletRadius;
        if (dx * dx + dy * dy < rr * rr) {
          b.active = false;
          e.hp -= 1;
          e.flash = 0.09;
          if (e.hp <= 0) events = killEnemy(e, events);
          else burst(b.x, b.y, '#ffffff', 3, 170, 1.8, 0.25);
          break;
        }
      }
    }

    // Power-ups drift, expire, and are picked up by flying near them.
    for (const p of powerups) {
      if (!p.active) continue;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      if (!harmless && player.alive) {
        const dx = p.x - player.x;
        const dy = p.y - player.y;
        if (dx * dx + dy * dy < POWERUP.pickupRadius * POWERUP.pickupRadius) {
          p.active = false;
          events |= EVENT_POWER;
          if (p.kind === POWER_RAPID) {
            player.rapid = PLAYER.rapidSeconds;
            floatText(player.x, player.y - 30, 'RAPID FIRE', '#ffe74a', 21);
          } else if (p.kind === POWER_SHIELD) {
            player.shield = true;
            floatText(player.x, player.y - 30, 'SHIELD UP', '#57b6ff', 21);
          } else {
            floatText(player.x, player.y - 30, 'BOMB!', '#ff5340', 24);
            events = detonate(events);
          }
        }
      }
    }

    // Particles and floaters are pure decoration, but they step here so a screenshot
    // scene shows the same frame every time.
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2.6 * dt;
      p.vy *= 1 - 2.6 * dt;
    }
    for (const f of floaters) {
      if (!f.active) continue;
      f.life -= dt;
      f.y -= 44 * dt;
      if (f.life <= 0) f.active = false;
    }
    return events;
  }

  reset();
  return { state, reset, step };
}
