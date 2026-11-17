// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The
// game moves between four screens: title, play, paused and game over. World events drive the
// synthesized sound effects and the screen-reader announcements.
//
// ?seed=N fixes the random stream. ?shot=start|play|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld, EVENT_BOMB, EVENT_HIT, EVENT_KILL, EVENT_OVER, EVENT_POWER, EVENT_SHIELD, EVENT_SHOOT, EVENT_WAVE,
} from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, audio.muted);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, renderer.toField, () => audio.unlock());
  const ctl = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false };
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.ui();
    announce('Playing. Three ships. Wave 1 incoming.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startGame();
    else if (actions & ACTION_RESTART && (screen === SCREEN_OVER || screen === SCREEN_PLAY)) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function playEvents(events) {
    if (events & EVENT_SHOOT) audio.shoot();
    if (events & EVENT_KILL) audio.explosion(false);
    if (events & EVENT_BOMB) audio.explosion(true);
    if (events & EVENT_SHIELD) audio.shieldBreak();
    if (events & EVENT_HIT) audio.playerHit();
    if (events & EVENT_POWER) audio.powerup();
    if (events & EVENT_WAVE) {
      audio.wave();
      announce(`Wave ${world.state.wave}.`);
    }
  }

  function step() {
    if (screen === SCREEN_PLAY) {
      ctl.moveX = input.moveX();
      ctl.moveY = input.moveY();
      ctl.aimX = input.aimX();
      ctl.aimY = input.aimY();
      ctl.fire = input.firing();
      const events = world.step(STEP, ctl, false);
      playEvents(events);
      if (events & EVENT_OVER) {
        audio.gameOver();
        endGame();
      } else if (events & EVENT_HIT) {
        announce(world.state.lives === 1 ? 'Hit. One ship left.' : `Hit. ${world.state.lives} ships left.`);
      }
      return;
    }
    // Title and game over: the arena idles on — shapes drift, particles settle, nothing scores.
    const player = world.state.player;
    ctl.moveX = 0;
    ctl.moveY = 0;
    ctl.aimX = player.x + Math.cos(world.state.time * 0.35) * 180;
    ctl.aimY = player.y + Math.sin(world.state.time * 0.35) * 180;
    ctl.fire = false;
    world.step(STEP, ctl, true);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen !== SCREEN_PAUSED) {
      while (accumulator >= STEP && screen !== SCREEN_PAUSED) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, audio.muted);
  }

  // Leaving the tab pauses a running game rather than letting the arena run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Neon Drift. Click or press Enter to launch.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
