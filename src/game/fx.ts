// Pooled particles + floating text popups (screen-space)

interface Particle {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  drag: number;
  shape: 0 | 1 | 2; // circle | rect | streak
  grow: number; // size change per second
  spin: number;
  rot: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Particles {
  private pool: Particle[] = [];
  private cursor = 0;
  private cap: number;

  constructor(cap = 420) {
    this.cap = cap;
    for (let i = 0; i < cap; i++) {
      this.pool.push({
        alive: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 2,
        color: '#fff',
        gravity: 0,
        drag: 0,
        shape: 0,
        grow: 0,
        spin: 0,
        rot: 0,
      });
    }
  }

  clear() {
    for (const p of this.pool) p.alive = false;
  }

  spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    color: string,
    shape: 0 | 1 | 2 = 0,
    gravity = 0,
    drag = 0,
    grow = 0,
    spin = 0,
  ) {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.cap;
    p.alive = true;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.color = color;
    p.shape = shape;
    p.gravity = gravity;
    p.drag = drag;
    p.grow = grow;
    p.spin = spin;
    p.rot = Math.random() * Math.PI * 2;
  }

  /** Impact sparks: hot yellow/orange streaks with gravity */
  emitSparks(x: number, y: number, n: number, dir = 0) {
    const colors = ['#fff4b0', '#ffd400', '#ff9f1c', '#ff6a00', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI, 0) + dir * 0.6;
      const sp = rand(180, 620);
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.35, 0.8), rand(1.5, 3.2), colors[i % colors.length], 2, 900, 0.5);
    }
    // debris chunks
    for (let i = 0; i < Math.floor(n / 4); i++) {
      const a = rand(-Math.PI, 0);
      const sp = rand(120, 380);
      this.spawn(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.5, 1.0), rand(3, 6), i % 2 ? '#222' : '#555', 1, 1100, 0.6, 0, rand(-12, 12));
    }
  }

  /** Off-road dust puffs behind a tyre */
  emitDust(x: number, y: number, dirX: number, intensity: number) {
    const n = Math.random() < intensity ? 2 : 1;
    for (let i = 0; i < n; i++) {
      this.spawn(
        x + rand(-6, 6),
        y + rand(-3, 3),
        rand(-40, 40) + dirX * 90,
        rand(20, 120),
        rand(0.4, 0.9),
        rand(4, 10),
        `rgba(190,160,120,${rand(0.25, 0.5)})`,
        0,
        -60,
        1.5,
        26,
      );
    }
  }

  /** Tyre smoke (launch / hard braking) */
  emitSmoke(x: number, y: number) {
    this.spawn(x + rand(-8, 8), y, rand(-50, 50), rand(-10, 60), rand(0.5, 1.1), rand(6, 12), `rgba(230,230,230,${rand(0.2, 0.45)})`, 0, -40, 1.6, 34);
  }

  /** Boost exhaust flame */
  emitFlame(x: number, y: number, power: number) {
    const colors = ['#7dd3fc', '#38bdf8', '#ffffff', '#fde68a', '#fb923c'];
    for (let i = 0; i < 3; i++) {
      this.spawn(
        x + rand(-5, 5),
        y + rand(-2, 2),
        rand(-60, 60),
        rand(200, 420) * power,
        rand(0.18, 0.4),
        rand(3, 8),
        colors[Math.floor(Math.random() * colors.length)],
        0,
        0,
        1.2,
        -12,
      );
    }
  }

  /** Air rush lines when a car is passed closely */
  emitWind(x: number, y: number, side: number) {
    for (let i = 0; i < 8; i++) {
      this.spawn(x + rand(-10, 10), y + rand(-40, 40), side * rand(300, 700), rand(200, 500), rand(0.25, 0.45), rand(1.5, 2.5), 'rgba(255,255,255,0.8)', 2, 0, 0.2);
    }
  }

  /** Celebration confetti */
  emitConfetti(x: number, y: number, n: number) {
    const colors = ['#e10600', '#ffd400', '#38bdf8', '#ffffff', '#22c55e', '#f472b6'];
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI * 0.9, -Math.PI * 0.1);
      const sp = rand(200, 620);
      this.spawn(x + rand(-30, 30), y, Math.cos(a) * sp, Math.sin(a) * sp, rand(1.2, 2.2), rand(4, 7), colors[i % colors.length], 1, 500, 1.4, 0, rand(-10, 10));
    }
  }

  update(dt: number) {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      p.vy += p.gravity * dt;
      if (p.drag) {
        const d = Math.max(0, 1 - p.drag * dt);
        p.vx *= d;
        p.vy *= d;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size = Math.max(0.2, p.size + p.grow * dt);
      p.rot += p.spin * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.lineCap = 'round';
    for (const p of this.pool) {
      if (!p.alive) continue;
      const t = p.life / p.maxLife;
      ctx.globalAlpha = t < 0.3 ? t / 0.3 : 1;
      ctx.fillStyle = p.color;
      if (p.shape === 0) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 1) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      } else {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

interface FloatText {
  active: boolean;
  text: string;
  sub: string;
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export class FloatingTexts {
  private pool: FloatText[] = [];
  private cursor = 0;

  constructor(cap = 20) {
    for (let i = 0; i < cap; i++) {
      this.pool.push({ active: false, text: '', sub: '', x: 0, y: 0, vy: 0, life: 0, maxLife: 1, color: '#fff', size: 24 });
    }
  }

  clear() {
    for (const t of this.pool) t.active = false;
  }

  add(text: string, x: number, y: number, color: string, size = 26, sub = '', life = 1.1) {
    const t = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;
    t.active = true;
    t.text = text;
    t.sub = sub;
    t.x = x;
    t.y = y;
    t.vy = -55;
    t.life = life;
    t.maxLife = life;
    t.color = color;
    t.size = size;
  }

  update(dt: number) {
    for (const t of this.pool) {
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.active = false;
        continue;
      }
      t.y += t.vy * dt;
      t.vy *= 1 - 1.5 * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D, font: string) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.pool) {
      if (!t.active) continue;
      const age = 1 - t.life / t.maxLife;
      // pop-in overshoot then settle, fade at the end
      const pop = age < 0.15 ? 0.6 + (age / 0.15) * 0.6 : age < 0.3 ? 1.2 - ((age - 0.15) / 0.15) * 0.2 : 1;
      const alpha = t.life < 0.3 ? t.life / 0.3 : 1;
      ctx.globalAlpha = alpha;
      ctx.font = `700 ${Math.round(t.size * pop)}px ${font}`;
      ctx.lineWidth = Math.max(3, t.size * 0.18);
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineJoin = 'round';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
      if (t.sub) {
        ctx.font = `600 ${Math.round(t.size * 0.55)}px ${font}`;
        ctx.lineWidth = 3;
        ctx.strokeText(t.sub, t.x, t.y + t.size * 0.8);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(t.sub, t.x, t.y + t.size * 0.8);
      }
    }
    ctx.restore();
  }
}
