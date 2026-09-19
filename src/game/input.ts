export type TouchKey = 'left' | 'right' | 'brake' | 'boost';

/**
 * Merges keyboard + on-screen touch input into a single polled state.
 * Edge-triggered actions (boost, pause, confirm...) are queued and consumed once.
 */
export class Input {
  private keys = { left: false, right: false, brake: false, boost: false };
  private touch = { left: false, right: false, brake: false, boost: false };
  private queued = { boost: false, pause: false, confirm: false, restart: false, escape: false, mute: false, any: false };
  private attached = false;

  get left() {
    return this.keys.left || this.touch.left;
  }
  get right() {
    return this.keys.right || this.touch.right;
  }
  get brake() {
    return this.keys.brake || this.touch.brake;
  }
  get boostHeld() {
    return this.keys.boost || this.touch.boost;
  }

  attach() {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.releaseAll);
  }

  detach() {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.releaseAll);
  }

  setTouch(key: TouchKey, down: boolean) {
    if (key === 'boost' && down && !this.touch.boost) this.queued.boost = true;
    this.touch[key] = down;
    if (down) this.queued.any = true;
  }

  releaseAll = () => {
    this.keys.left = this.keys.right = this.keys.brake = this.keys.boost = false;
    this.touch.left = this.touch.right = this.touch.brake = this.touch.boost = false;
  };

  consume(action: keyof Input['queued']): boolean {
    const v = this.queued[action];
    this.queued[action] = false;
    return v;
  }

  clearQueue() {
    for (const k of Object.keys(this.queued) as (keyof Input['queued'])[]) this.queued[k] = false;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    let handled = true;
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.keys.left = true;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.keys.right = true;
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.keys.brake = true;
        break;
      case 'Space':
      case 'ShiftLeft':
      case 'ShiftRight':
      case 'ArrowUp':
      case 'KeyW':
        if (!this.keys.boost) this.queued.boost = true;
        this.keys.boost = true;
        if (e.code === 'Space') this.queued.confirm = true;
        break;
      case 'KeyP':
      case 'Escape':
        this.queued.pause = true;
        if (e.code === 'Escape') this.queued.escape = true;
        break;
      case 'Enter':
        this.queued.confirm = true;
        break;
      case 'KeyR':
        this.queued.restart = true;
        break;
      case 'KeyM':
        this.queued.mute = true;
        break;
      default:
        handled = false;
    }
    if (!e.repeat) this.queued.any = true;
    if (handled && (e.code.startsWith('Arrow') || e.code === 'Space')) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.keys.left = false;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.keys.right = false;
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.keys.brake = false;
        break;
      case 'Space':
      case 'ShiftLeft':
      case 'ShiftRight':
      case 'ArrowUp':
      case 'KeyW':
        this.keys.boost = false;
        break;
    }
  };
}
