// Keyboard and mouse input for a twin-stick ship. Held movement keys give a direction vector,
// the pointer gives an aim point in field coordinates and, held down, the trigger. One-shot
// presses (start, pause, restart, mute) are queued as bit flags and taken once by the loop, so
// a press between two frames is never lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_MUTE = 8;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const RESTART = new Set(['KeyR']);
const MUTE = new Set(['KeyM']);

/**
 * `toField(clientX, clientY)` converts pointer coordinates to the game's field coordinates
 * (the renderer owns the scale and letterbox offset). `onGesture` runs on the first pointer
 * or key interaction, which is where the audio context is unlocked.
 */
export function createInput(target, toField, onGesture) {
  const held = { up: false, down: false, left: false, right: false };
  const aim = { x: 0, y: 0 };
  let firing = false;
  let actions = 0;
  let gestured = false;

  function gesture() {
    if (gestured) return;
    gestured = true;
    if (onGesture) onGesture();
  }

  function setAim(event) {
    const point = toField(event.clientX, event.clientY);
    aim.x = point.x;
    aim.y = point.y;
  }

  window.addEventListener('keydown', (event) => {
    gesture();
    if (UP.has(event.code)) held.up = true;
    else if (DOWN.has(event.code)) held.down = true;
    else if (LEFT.has(event.code)) held.left = true;
    else if (RIGHT.has(event.code)) held.right = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) held.up = false;
    else if (DOWN.has(event.code)) held.down = false;
    else if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.up = false;
    held.down = false;
    held.left = false;
    held.right = false;
    firing = false;
  });
  target.addEventListener('pointermove', setAim);
  target.addEventListener('pointerdown', (event) => {
    gesture();
    setAim(event);
    firing = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    firing = false;
  });
  target.addEventListener('pointerleave', () => {
    firing = false;
  });

  return {
    /** The held movement direction: -1, 0 or 1 on each axis (not normalized). */
    moveX() {
      return (held.right ? 1 : 0) - (held.left ? 1 : 0);
    },
    moveY() {
      return (held.down ? 1 : 0) - (held.up ? 1 : 0);
    },
    /** The pointer's position in field coordinates. */
    aimX() {
      return aim.x;
    },
    aimY() {
      return aim.y;
    },
    /** Whether the trigger is held. */
    firing() {
      return firing;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
