// The screenshot scenes behind ?shot=start|play|end. Each one plays the real rules forward
// from a fresh world for a fixed number of steps, steered by an autopilot, so the frame is
// what a real game looks like and the same seed always gives the same frame. The play scene's
// pilot aims with a little lead, keeps its distance and dodges incoming fire; the end scene's
// pilot drifts toward the nearest enemy and fires in bursts, and is caught, as a reckless
// player is.
import { FIELD, STEP } from './config.js';
import { EVENT_OVER } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 22;
const END_LIMIT_SECONDS = 600;

function nearestEnemy(state) {
  let best = null;
  let bestDist = Infinity;
  for (const e of state.enemies) {
    if (!e.active) continue;
    const dx = e.x - state.player.x;
    const dy = e.y - state.player.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = e;
    }
  }
  return best;
}

/** The careful pilot: lead the nearest target, flee anything close, dodge orbs, stay central. */
function goodPilot(state, ctl) {
  const player = state.player;
  let fleeX = 0;
  let fleeY = 0;
  for (const e of state.enemies) {
    if (!e.active) continue;
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 210 && dist > 0.01) {
      const weight = (210 - dist) / 210;
      fleeX += (dx / dist) * weight * 1.6;
      fleeY += (dy / dist) * weight * 1.6;
    }
  }
  for (const b of state.hostile) {
    if (!b.active) continue;
    const dx = player.x - b.x;
    const dy = player.y - b.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 120 && dist > 0.01) {
      fleeX += (dx / dist) * 1.2;
      fleeY += (dy / dist) * 1.2;
    }
  }
  // A soft pull back toward the middle so the ship is not cornered against a wall.
  fleeX += (FIELD.width / 2 - player.x) / FIELD.width * 0.35;
  fleeY += (FIELD.height / 2 - player.y) / FIELD.height * 0.35;
  const length = Math.hypot(fleeX, fleeY);
  ctl.moveX = length > 0.12 ? fleeX / Math.max(1, length) : 0;
  ctl.moveY = length > 0.12 ? fleeY / Math.max(1, length) : 0;
  const target = nearestEnemy(state);
  if (target !== null) {
    const dist = Math.hypot(target.x - player.x, target.y - player.y);
    const lead = dist / 760;
    ctl.aimX = target.x + target.vx * lead;
    ctl.aimY = target.y + target.vy * lead;
    ctl.fire = true;
  } else {
    ctl.aimX = player.x + 120;
    ctl.aimY = player.y - 120;
    ctl.fire = false;
  }
}

/** The reckless pilot: homes in on the nearest enemy and fires only in bursts. */
function badPilot(state, ctl) {
  const player = state.player;
  const target = nearestEnemy(state);
  if (target !== null) {
    ctl.moveX = (target.x - player.x) * 0.004;
    ctl.moveY = (target.y - player.y) * 0.004;
    ctl.aimX = target.x;
    ctl.aimY = target.y;
    ctl.fire = Math.floor(state.time * 2) % 2 === 0;
  } else {
    ctl.moveX = 0;
    ctl.moveY = 0;
    ctl.aimX = player.x + 100;
    ctl.aimY = player.y;
    ctl.fire = false;
  }
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start) and return the
 * screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  const ctl = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false };
  world.reset();
  if (name !== 'play' && name !== 'end') {
    ctl.aimX = world.state.player.x + 140;
    ctl.aimY = world.state.player.y - 140;
    for (let index = 0; index < START_SECONDS / STEP; index += 1) world.step(STEP, ctl, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const pilot = name === 'end' ? badPilot : goodPilot;
  const limit = name === 'end' ? END_LIMIT_SECONDS : PLAY_SECONDS;
  let over = false;
  for (let index = 0; index < limit / STEP; index += 1) {
    pilot(world.state, ctl);
    if (world.step(STEP, ctl, false) & EVENT_OVER) {
      over = true;
      break;
    }
  }
  if (name === 'play' && !over) {
    // The fixed run can end in a lull between kills; play on a little (still the same
    // deterministic rules) until the arena is populated, so the frame shows a real fight.
    for (let index = 0; index < 8 / STEP; index += 1) {
      let active = 0;
      let nearest = Infinity;
      for (const e of world.state.enemies) {
        if (!e.active) continue;
        active += 1;
        const dist = Math.hypot(e.x - world.state.player.x, e.y - world.state.player.y);
        if (dist < nearest) nearest = dist;
      }
      if (active >= 5 && nearest < 430) break;
      pilot(world.state, ctl);
      if (world.step(STEP, ctl, false) & EVENT_OVER) {
        over = true;
        break;
      }
    }
  }
  if (name === 'end' && over) {
    // Let the death flash fade and the wreckage settle before the frame is taken.
    ctl.fire = false;
    for (let index = 0; index < 0.7 / STEP; index += 1) world.step(STEP, ctl, true);
  }
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}
