// Drawing only: the world's state and the current screen in, pixels out. The 1280x720 arena
// is scaled to fit the window and centred, the margin filled with the backdrop colour.
// Everything is drawn in code — vector ships and polygons with additive glows over a
// starfield and a faint grid. Text that holds a number is rebuilt only when it changes.
import { FIELD, FONT, LIVES, PALETTE, PLAYER } from './config.js';
import { KIND_CHASER, KIND_MINI, KIND_ORBITER, KIND_SPLITTER, POWER_BOMB, POWER_RAPID, POWER_SHIELD } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const ENEMY_COLORS = [PALETTE.chaser, PALETTE.mini, PALETTE.splitter, PALETTE.orbiter];
const POWER_COLORS = [PALETTE.rapid, PALETTE.shield, PALETTE.bomb];
const POWER_GLYPHS = ['R', 'S', 'B'];

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

/** A regular polygon path centred on the origin: `points` vertices, first at angle 0. */
function polygon(context, points, radius) {
  context.beginPath();
  for (let index = 0; index < points; index += 1) {
    const angle = (index / points) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, ratio: 1 };
  const scoreLabel = cachedLabel('SCORE ');
  const waveLabel = cachedLabel('WAVE ');
  const finalLabel = cachedLabel('');
  let spaceGradient = null;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    view.ratio = ratio;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    view.x = (canvas.width - FIELD.width * view.scale) / 2;
    view.y = (canvas.height - FIELD.height * view.scale) / 2;
    spaceGradient = null;
  }

  /** Pointer position (CSS pixels) to field coordinates. */
  function toField(clientX, clientY) {
    return {
      x: (clientX * view.ratio - view.x) / view.scale,
      y: (clientY * view.ratio - view.y) / view.scale,
    };
  }

  const fonts = new Map();
  function font(size, bold) {
    const key = `${bold ? 'b' : ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align, bold = false) {
    context.font = font(size, bold);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function glowText(value, x, y, size, color, align) {
    context.save();
    context.shadowColor = color;
    context.shadowBlur = 22;
    text(value, x, y, size, color, align, true);
    context.restore();
  }

  function drawSpace(state) {
    if (spaceGradient === null) {
      spaceGradient = context.createLinearGradient(0, 0, 0, FIELD.height);
      spaceGradient.addColorStop(0, PALETTE.spaceTop);
      spaceGradient.addColorStop(1, PALETTE.spaceBottom);
    }
    context.fillStyle = spaceGradient;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.strokeStyle = PALETTE.grid;
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 64; x < FIELD.width; x += 64) {
      context.moveTo(x, 0);
      context.lineTo(x, FIELD.height);
    }
    for (let y = 64; y < FIELD.height; y += 64) {
      context.moveTo(0, y);
      context.lineTo(FIELD.width, y);
    }
    context.stroke();
    // Stars twinkle on the game's own clock, so a staged frame is the same every time.
    for (const star of state.stars) {
      const twinkle = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(state.time * (1 + star.layer * 2) + star.x));
      context.globalAlpha = twinkle * (0.35 + star.layer * 0.65);
      context.fillStyle = '#cfe8ff';
      context.fillRect(star.x, star.y, star.size, star.size);
    }
    context.globalAlpha = 1;
    context.strokeStyle = 'rgba(45, 226, 255, 0.4)';
    context.lineWidth = 2;
    context.strokeRect(1, 1, FIELD.width - 2, FIELD.height - 2);
  }

  function drawShipShape(radius, fill, stroke) {
    context.beginPath();
    context.moveTo(radius * 1.5, 0);
    context.lineTo(-radius, radius * 0.92);
    context.lineTo(-radius * 0.55, 0);
    context.lineTo(-radius, -radius * 0.92);
    context.closePath();
    context.fillStyle = fill;
    context.fill();
    context.strokeStyle = stroke;
    context.lineWidth = 2;
    context.stroke();
  }

  function drawPlayer(state) {
    const player = state.player;
    if (!player.alive) return;
    // Blink while invulnerable after a hit: dimmed on alternate tenths of a second.
    const blink = player.invulnerable > 0 && Math.floor(state.time * 12) % 2 === 0;
    context.save();
    context.translate(player.x, player.y);
    if (player.shield) {
      context.save();
      context.globalAlpha = 0.55 + 0.3 * Math.sin(state.time * 5);
      context.strokeStyle = PALETTE.shield;
      context.lineWidth = 2;
      context.shadowColor = PALETTE.shield;
      context.shadowBlur = 12;
      context.beginPath();
      context.arc(0, 0, PLAYER.radius + 11, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
    context.rotate(player.aim);
    context.globalAlpha = blink ? 0.3 : 1;
    const speed = Math.hypot(player.vx, player.vy);
    if (speed > 40) {
      const flame = 9 + 6 * Math.sin(state.time * 42) + speed * 0.012;
      context.beginPath();
      context.moveTo(-PLAYER.radius * 0.7, 4.5);
      context.lineTo(-PLAYER.radius * 0.7 - flame, 0);
      context.lineTo(-PLAYER.radius * 0.7, -4.5);
      context.closePath();
      context.fillStyle = 'rgba(255, 170, 60, 0.85)';
      context.shadowColor = '#ff9f2e';
      context.shadowBlur = 10;
      context.fill();
      context.shadowBlur = 0;
    }
    context.shadowColor = PALETTE.player;
    context.shadowBlur = 16;
    drawShipShape(PLAYER.radius, 'rgba(10, 40, 55, 0.9)', PALETTE.player);
    context.shadowBlur = 0;
    context.beginPath();
    context.arc(2, 0, 3.4, 0, Math.PI * 2);
    context.fillStyle = PALETTE.playerCore;
    context.fill();
    context.restore();
  }

  function drawEnemy(state, e) {
    const color = ENEMY_COLORS[e.kind];
    context.save();
    context.translate(e.x, e.y);
    context.shadowColor = color;
    context.shadowBlur = 13;
    if (e.kind === KIND_CHASER || e.kind === KIND_MINI) {
      context.rotate(e.angle);
      context.beginPath();
      context.moveTo(e.radius, 0);
      context.lineTo(-e.radius * 0.82, e.radius * 0.74);
      context.lineTo(-e.radius * 0.4, 0);
      context.lineTo(-e.radius * 0.82, -e.radius * 0.74);
      context.closePath();
    } else if (e.kind === KIND_SPLITTER) {
      context.rotate(e.wobble + state.time * 0.7);
      polygon(context, 5, e.radius);
    } else {
      context.rotate(e.wobble - state.time * 1.15);
      polygon(context, 6, e.radius);
    }
    context.fillStyle = e.flash > 0 ? '#ffffff' : 'rgba(8, 6, 18, 0.88)';
    context.fill();
    context.strokeStyle = e.flash > 0 ? '#ffffff' : color;
    context.lineWidth = 2;
    context.stroke();
    context.shadowBlur = 0;
    // Cores: a splitter's inner pentagon shrinks as it is hurt; an orbiter's core
    // brightens as its next shot charges.
    if (e.kind === KIND_SPLITTER) {
      context.rotate(0.4);
      polygon(context, 5, e.radius * 0.34 * (e.hp / 3));
      context.fillStyle = color;
      context.fill();
    } else if (e.kind === KIND_ORBITER) {
      const charge = Math.min(1, Math.max(0, 1 - e.shotTimer / 0.45));
      context.beginPath();
      context.arc(0, 0, 4 + charge * 2.5, 0, Math.PI * 2);
      context.fillStyle = charge > 0.7 ? '#ffffff' : color;
      context.fill();
    } else {
      context.beginPath();
      context.arc(0, 0, e.radius * 0.26, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
    }
    context.restore();
  }

  function drawPowerup(state, p) {
    const color = POWER_COLORS[p.kind];
    const pulse = 1 + 0.14 * Math.sin(state.time * 6 + p.x);
    context.save();
    context.translate(p.x, p.y);
    if (p.life < 2) context.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(state.time * 9));
    context.shadowColor = color;
    context.shadowBlur = 14;
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(0, 0, 13 * pulse, 0, Math.PI * 2);
    context.stroke();
    context.shadowBlur = 0;
    context.fillStyle = 'rgba(6, 8, 18, 0.85)';
    context.beginPath();
    context.arc(0, 0, 11, 0, Math.PI * 2);
    context.fill();
    context.textBaseline = 'middle';
    text(POWER_GLYPHS[p.kind], 0, 1, 14, color, 'center', true);
    context.restore();
  }

  function drawEffects(state) {
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (const p of state.particles) {
      if (!p.active) continue;
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.color;
      context.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    context.restore();
    context.globalAlpha = 1;
    context.textBaseline = 'middle';
    for (const f of state.floaters) {
      if (!f.active) continue;
      context.save();
      context.globalAlpha = Math.min(1, f.life / 0.45);
      text(f.text, f.x, f.y, f.size, f.color, 'center', true);
      context.restore();
    }
  }

  function drawHud(state, muted) {
    context.textBaseline = 'top';
    text(scoreLabel(state.score), 22, 16, 27, PALETTE.text, 'left', true);
    if (state.multiplier > 1) {
      const comboY = 52;
      text(`x${state.multiplier} COMBO ${state.combo}`, 22, comboY, 19, PALETTE.rapid, 'left', true);
      context.fillStyle = 'rgba(255, 231, 74, 0.25)';
      context.fillRect(22, comboY + 26, 120, 4);
      context.fillStyle = PALETTE.rapid;
      context.fillRect(22, comboY + 26, 120 * Math.min(1, state.comboTimer / 2.6), 4);
    }
    if (state.player.rapid > 0) {
      text('RAPID', 22, state.multiplier > 1 ? 88 : 52, 16, PALETTE.rapid, 'left', true);
      context.fillStyle = PALETTE.rapid;
      context.fillRect(76, (state.multiplier > 1 ? 88 : 52) + 4, 64 * (state.player.rapid / 8), 7);
    }
    text(waveLabel(Math.max(1, state.wave)), FIELD.width / 2, 16, 24, PALETTE.muted, 'center', true);
    // Lives as little ships, lit for the ones left, dark for the ones lost.
    for (let life = 0; life < LIVES; life += 1) {
      const x = FIELD.width - 34 - life * 36;
      context.save();
      context.translate(x, 30);
      context.rotate(-Math.PI / 2);
      drawShipShape(10, life < state.lives ? 'rgba(89, 247, 255, 0.35)' : 'rgba(60, 70, 95, 0.25)', life < state.lives ? PALETTE.player : '#3c465f');
      context.restore();
    }
    context.textBaseline = 'alphabetic';
    text(muted ? 'M — SOUND OFF' : 'M — SOUND ON', FIELD.width - 22, FIELD.height - 14, 13, PALETTE.muted, 'right');
    text('WASD MOVE · MOUSE AIM · P PAUSE', 22, FIELD.height - 14, 13, PALETTE.muted, 'left');
  }

  function drawBanner(state) {
    if (state.banner <= 0 || state.bannerText === '') return;
    const alpha = Math.min(1, state.banner / 0.6);
    context.save();
    context.globalAlpha = alpha;
    context.textBaseline = 'middle';
    glowText(state.bannerText, FIELD.width / 2, 150, 44, PALETTE.panelEdge, 'center');
    context.restore();
  }

  function drawPanel(width, height) {
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.save();
    context.fillStyle = PALETTE.panel;
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.shadowColor = PALETTE.panelEdge;
    context.shadowBlur = 18;
    context.beginPath();
    context.roundRect(x, y, width, height, 14);
    context.fill();
    context.stroke();
    context.restore();
    return { x, y };
  }

  function drawTitle(state, best) {
    const { y } = drawPanel(640, 470);
    context.textBaseline = 'alphabetic';
    glowText('NEON DRIFT', FIELD.width / 2, y + 88, 62, PALETTE.player, 'center');
    text('T W I N - S T I C K   A R E N A   S U R V I V A L', FIELD.width / 2, y + 124, 16, PALETTE.muted, 'center');
    const lines = [
      'WASD or arrows to thrust — mouse to aim, click or hold to fire.',
      'Chain kills to raise your combo multiplier, up to x8.',
      'Splitters burst into minis. Orbiters keep their distance and shoot back.',
      'Grab the drops:  R rapid fire · S shield · B bomb.',
      'P pauses · M mutes · R restarts. Three ships. How long can you drift?',
    ];
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + 176 + index * 32, 18, PALETTE.text, 'center');
    }
    if (best > 0) text(`BEST ${best}`, FIELD.width / 2, y + 368, 19, PALETTE.rapid, 'center', true);
    const blink = 0.55 + 0.45 * Math.sin(state.time * 4);
    context.save();
    context.globalAlpha = blink;
    text('CLICK OR PRESS ENTER TO LAUNCH', FIELD.width / 2, y + 424, 21, PALETTE.panelEdge, 'center', true);
    context.restore();
  }

  function drawPaused() {
    const { y } = drawPanel(420, 210);
    context.textBaseline = 'alphabetic';
    glowText('PAUSED', FIELD.width / 2, y + 92, 40, PALETTE.panelEdge, 'center');
    text('Press P to resume', FIELD.width / 2, y + 152, 20, PALETTE.text, 'center');
  }

  function drawOver(state, best) {
    const { y } = drawPanel(560, 380);
    context.textBaseline = 'alphabetic';
    glowText('GAME OVER', FIELD.width / 2, y + 84, 48, PALETTE.danger, 'center');
    text('FINAL SCORE', FIELD.width / 2, y + 140, 15, PALETTE.muted, 'center');
    text(finalLabel(state.score), FIELD.width / 2, y + 196, 46, PALETTE.text, 'center', true);
    text(`Reached wave ${Math.max(1, state.wave)} · Best ${best}`, FIELD.width / 2, y + 248, 20, PALETTE.muted, 'center');
    const blink = 0.55 + 0.45 * Math.sin(state.time * 4);
    context.save();
    context.globalAlpha = blink;
    text('PRESS R OR CLICK TO FLY AGAIN', FIELD.width / 2, y + 322, 20, PALETTE.panelEdge, 'center', true);
    context.restore();
  }

  /** Paint one frame: the arena, then the HUD, the banner and any panel the screen calls for. */
  function draw(state, screen, best, muted = false) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    // Screen shake: a decaying offset on a fast deterministic wobble.
    const shakeX = state.shake > 0 ? Math.sin(state.time * 131) * state.shake : 0;
    const shakeY = state.shake > 0 ? Math.cos(state.time * 149) * state.shake * 0.7 : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    drawSpace(state);
    for (const p of state.powerups) if (p.active) drawPowerup(state, p);
    for (const e of state.enemies) if (e.active) drawEnemy(state, e);
    // Hostile fire: magenta orbs with a halo.
    context.save();
    context.shadowColor = PALETTE.hostile;
    context.shadowBlur = 10;
    context.fillStyle = PALETTE.hostile;
    for (const b of state.hostile) {
      if (!b.active) continue;
      context.beginPath();
      context.arc(b.x, b.y, 4.4, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    // Our fire: bright capsules along the line of flight.
    context.save();
    context.strokeStyle = PALETTE.bullet;
    context.lineWidth = 3.4;
    context.lineCap = 'round';
    context.shadowColor = PALETTE.bullet;
    context.shadowBlur = 8;
    context.beginPath();
    for (const b of state.bullets) {
      if (!b.active) continue;
      context.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
      context.lineTo(b.x, b.y);
    }
    context.stroke();
    context.restore();
    drawPlayer(state);
    drawEffects(state);
    if (state.bombFlash > 0) {
      context.fillStyle = `rgba(255, 240, 230, ${state.bombFlash * 0.75})`;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }
    if (state.hurtFlash > 0) {
      const gradient = context.createRadialGradient(FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.36, FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.78);
      gradient.addColorStop(0, 'rgba(255, 46, 77, 0)');
      gradient.addColorStop(1, `rgba(255, 46, 77, ${state.hurtFlash * 0.8})`);
      context.fillStyle = gradient;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }
    if (screen !== SCREEN_TITLE) drawHud(state, muted);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawBanner(state);
    if (screen === SCREEN_TITLE) drawTitle(state, best);
    else if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_OVER) drawOver(state, best);
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toField };
}
