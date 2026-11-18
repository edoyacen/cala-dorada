/**
 * input.js — keyboard and mouse state with edge detection. The window keeps a
 * set of held keys, a set of keys pressed since the last frame and the pointer
 * in canvas pixels, which is all the game and the menus read.
 */

const HELD = new Set();

export class Input {
  constructor() {
    this.keys = new Set();
    this.tapped = new Set();
    this.released = new Set();
    this.mouse = { x: 0, y: 0, down: false, right: false, wheel: 0 };
    this.mouseTapped = false;
    this.mouseReleased = false;
    this.anyKey = false;
    this.enabled = true;
    this.onFirstGesture = null;
    this._gestured = false;
  }

  /** Attach the listeners to a canvas and the window. */
  bind(canvas) {
    this.canvas = canvas;
    const block = new Set([
      'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'Tab',
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyE', 'KeyQ', 'KeyR',
      'Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyM', 'KeyH', 'KeyF', 'KeyP', 'KeyJ', 'Escape', 'Enter',
    ]);
    window.addEventListener('keydown', (e) => {
      if (block.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.tapped.add(e.code);
      HELD.add(e.code);
      this.anyKey = true;
      this._gesture();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.released.add(e.code);
      HELD.delete(e.code);
    });
    window.addEventListener('blur', () => {
      for (const code of this.keys) this.released.add(code);
      this.keys.clear();
      HELD.clear();
      this.mouse.down = false;
    });
    const point = (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width;
      const sy = canvas.height / rect.height;
      this.mouse.x = (e.clientX - rect.left) * sx;
      this.mouse.y = (e.clientY - rect.top) * sy;
    };
    canvas.addEventListener('mousemove', point);
    canvas.addEventListener('mousedown', (e) => {
      point(e);
      if (e.button === 0) {
        this.mouse.down = true;
        this.mouseTapped = true;
      }
      if (e.button === 2) this.mouse.right = true;
      e.preventDefault();
      this._gesture();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.mouse.down = false;
        this.mouseReleased = true;
      }
      if (e.button === 2) this.mouse.right = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      this.mouse.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
  }

  /** Report the first real gesture once, so audio may start. */
  _gesture() {
    if (this._gestured) return;
    this._gestured = true;
    if (this.onFirstGesture) this.onFirstGesture();
  }

  down(...codes) {
    return codes.some((code) => this.keys.has(code));
  }

  hit(code) {
    return this.tapped.has(code);
  }

  /** True once when any of these keys went down this frame. */
  hitAny(...codes) {
    return codes.some((code) => this.tapped.has(code));
  }

  /** Read and clear a one-frame key press, for a key two systems share. */
  take(code) {
    if (!this.tapped.has(code)) return false;
    this.tapped.delete(code);
    return true;
  }

  /** Clear the one-frame edge sets; called at the end of every frame. */
  endFrame() {
    this.tapped.clear();
    this.released.clear();
    this.mouseTapped = false;
    this.mouseReleased = false;
    this.mouse.wheel = 0;
    this.anyKey = false;
  }
}

/** True while any of the movement keys is held, in the order the game reads them. */
export const MOVE_KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};
