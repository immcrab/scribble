import { useCallback, useEffect, useRef, useState } from "react";
import { Play, RotateCw, Trophy } from "lucide-react";
import type { BuildGameId } from "../lib/playground";

/**
 * Tiny canvas mini-games for the code panel's build screen. Each game is a plain factory
 * that owns its own state and draws into a fixed 320×320 logical canvas; <GameCanvas> runs
 * the loop, input, idle/over overlays and per-game high score.
 */

const W = 320;
const H = 320;
const BG = "#0d0f14";

type Phase = "idle" | "playing" | "over";

interface GameApi {
  addScore(n?: number): void;
  gameOver(): void;
}

interface GameInstance {
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
  /** Return true when the key was used (so the page doesn't scroll on arrows/space). */
  key?(key: string): boolean;
  pointer?(x: number, y: number, kind: "down" | "move"): void;
}

type GameFactory = (api: GameApi) => GameInstance;

function rand(n: number) {
  return Math.floor(Math.random() * n);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

/* ---------------------------------- Snake --------------------------------- */

const createSnake: GameFactory = (api) => {
  const CELL = 16;
  const COLS = W / CELL;
  const ROWS = H / CELL;
  let snake = [
    { x: 8, y: 10 },
    { x: 7, y: 10 },
    { x: 6, y: 10 },
  ];
  let dir = { x: 1, y: 0 };
  const queue: { x: number; y: number }[] = [];
  let food = { x: 14, y: 10 };
  let acc = 0;
  let eaten = 0;

  const placeFood = () => {
    do {
      food = { x: rand(COLS), y: rand(ROWS) };
    } while (snake.some((s) => s.x === food.x && s.y === food.y));
  };

  const turn = (x: number, y: number) => {
    const last = queue[queue.length - 1] ?? dir;
    if (last.x === -x && last.y === -y) return;
    if (last.x === x && last.y === y) return;
    if (queue.length < 3) queue.push({ x, y });
  };

  return {
    update(dt) {
      acc += dt;
      const tick = Math.max(0.055, 0.12 - eaten * 0.003);
      while (acc >= tick) {
        acc -= tick;
        dir = queue.shift() ?? dir;
        const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
        if (
          head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS ||
          snake.some((s) => s.x === head.x && s.y === head.y)
        ) {
          api.gameOver();
          return;
        }
        snake.unshift(head);
        if (head.x === food.x && head.y === food.y) {
          eaten++;
          api.addScore();
          placeFood();
        } else {
          snake.pop();
        }
      }
    },
    draw(ctx) {
      ctx.fillStyle = "rgba(255,255,255,0.025)";
      for (let x = 0; x < COLS; x++)
        for (let y = 0; y < ROWS; y++) if ((x + y) % 2 === 0) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      // Food: a little apple.
      ctx.fillStyle = "#f43f5e";
      ctx.beginPath();
      ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2 + 1, CELL / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#4ade80";
      ctx.fillRect(food.x * CELL + CELL / 2, food.y * CELL + 1, 2, 4);
      snake.forEach((s, i) => {
        const t = i / Math.max(1, snake.length - 1);
        ctx.fillStyle = `hsl(${145 - t * 30}, 70%, ${58 - t * 18}%)`;
        roundRect(ctx, s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2, i === 0 ? 5 : 4);
      });
      // Eyes, looking where it's going.
      const h = snake[0];
      const cx = h.x * CELL + CELL / 2;
      const cy = h.y * CELL + CELL / 2;
      const px = dir.y !== 0 ? 3.5 : 0;
      const py = dir.x !== 0 ? 3.5 : 0;
      ctx.fillStyle = "#0d0f14";
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(cx + dir.x * 3 + px * s, cy + dir.y * 3 + py * s, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    key(k) {
      const map: Record<string, [number, number]> = {
        ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
        ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
        ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
        ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
      };
      const m = map[k];
      if (!m) return false;
      turn(m[0], m[1]);
      return true;
    },
    pointer(x, y, kind) {
      if (kind !== "down") return;
      // Tap relative to the head: turn toward whichever axis the tap is further along.
      const hx = snake[0].x * CELL + CELL / 2;
      const hy = snake[0].y * CELL + CELL / 2;
      const dx = x - hx;
      const dy = y - hy;
      if (dir.x !== 0) turn(0, dy < 0 ? -1 : 1);
      else if (dir.y !== 0) turn(dx < 0 ? -1 : 1, 0);
      else if (Math.abs(dx) > Math.abs(dy)) turn(dx < 0 ? -1 : 1, 0);
    },
  };
};

/* -------------------------------- Breakout -------------------------------- */

const createBreakout: GameFactory = (api) => {
  const PW = 64;
  const PH = 8;
  const PY = H - 22;
  const R = 5;
  const COLS = 8;
  const ROWS = 5;
  const BW = 34;
  const BH = 12;
  const GAP = 4;
  const OX = (W - (COLS * (BW + GAP) - GAP)) / 2;
  const OY = 40;
  const COLORS = ["#f43f5e", "#f59e0b", "#eab308", "#22c55e", "#06b6d4"];
  let paddle = W / 2 - PW / 2;
  let speed = 230;
  let ball = { x: W / 2, y: PY - 20, vx: 0.6, vy: -0.8 };
  let lives = 3;
  let bricks: { x: number; y: number; c: string; alive: boolean }[] = [];
  let keyDir = 0;

  const build = () => {
    bricks = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) bricks.push({ x: OX + c * (BW + GAP), y: OY + r * (BH + GAP), c: COLORS[r], alive: true });
  };
  const serve = () => {
    const a = (-Math.PI / 2) + (Math.random() - 0.5) * 0.9;
    ball = { x: paddle + PW / 2, y: PY - 12, vx: Math.cos(a), vy: Math.sin(a) };
  };
  build();
  serve();

  return {
    update(dt) {
      paddle = Math.max(0, Math.min(W - PW, paddle + keyDir * 320 * dt));
      ball.x += ball.vx * speed * dt;
      ball.y += ball.vy * speed * dt;
      if (ball.x < R) { ball.x = R; ball.vx = Math.abs(ball.vx); }
      if (ball.x > W - R) { ball.x = W - R; ball.vx = -Math.abs(ball.vx); }
      if (ball.y < R) { ball.y = R; ball.vy = Math.abs(ball.vy); }
      if (ball.vy > 0 && ball.y + R >= PY && ball.y + R <= PY + PH + 6 && ball.x >= paddle - R && ball.x <= paddle + PW + R) {
        // Angle depends on where it hits the paddle.
        const hit = (ball.x - (paddle + PW / 2)) / (PW / 2);
        const a = -Math.PI / 2 + hit * 1.05;
        ball.vx = Math.cos(a);
        ball.vy = Math.sin(a);
        ball.y = PY - R;
      }
      if (ball.y > H + R) {
        lives--;
        if (lives <= 0) return api.gameOver();
        serve();
      }
      for (const b of bricks) {
        if (!b.alive) continue;
        if (ball.x + R > b.x && ball.x - R < b.x + BW && ball.y + R > b.y && ball.y - R < b.y + BH) {
          b.alive = false;
          api.addScore();
          const overlapX = Math.min(ball.x + R - b.x, b.x + BW - (ball.x - R));
          const overlapY = Math.min(ball.y + R - b.y, b.y + BH - (ball.y - R));
          if (overlapX < overlapY) ball.vx = -ball.vx;
          else ball.vy = -ball.vy;
          break;
        }
      }
      if (bricks.every((b) => !b.alive)) {
        speed += 40;
        build();
        serve();
      }
    },
    draw(ctx) {
      for (const b of bricks) {
        if (!b.alive) continue;
        ctx.fillStyle = b.c;
        roundRect(ctx, b.x, b.y, BW, BH, 3);
      }
      ctx.fillStyle = "#e5e7eb";
      roundRect(ctx, paddle, PY, PW, PH, 4);
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f43f5e";
      for (let i = 0; i < lives; i++) {
        ctx.beginPath();
        ctx.arc(W - 14 - i * 14, 16, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    key(k) {
      if (k === "ArrowLeft" || k === "a" || k === "A") { keyDir = -1; setTimeout(() => (keyDir = 0), 120); return true; }
      if (k === "ArrowRight" || k === "d" || k === "D") { keyDir = 1; setTimeout(() => (keyDir = 0), 120); return true; }
      return false;
    },
    pointer(x) {
      paddle = Math.max(0, Math.min(W - PW, x - PW / 2));
    },
  };
};

/* --------------------------------- Flappy --------------------------------- */

const createFlappy: GameFactory = (api) => {
  const BX = 80;
  const GAP = 104;
  const PW = 46;
  const GROUND = H - 24;
  let y = H / 2;
  let vy = 0;
  let t = 0;
  let spawn = 0;
  let pipes: { x: number; top: number; scored: boolean }[] = [];
  let groundOffset = 0;

  const flap = () => { vy = -270; };

  return {
    update(dt) {
      t += dt;
      vy += 880 * dt;
      y += vy * dt;
      groundOffset = (groundOffset + 120 * dt) % 24;
      spawn -= dt;
      if (spawn <= 0) {
        spawn = 1.45;
        pipes.push({ x: W + 10, top: 40 + rand(GROUND - GAP - 80), scored: false });
      }
      for (const p of pipes) {
        p.x -= 120 * dt;
        if (!p.scored && p.x + PW < BX) {
          p.scored = true;
          api.addScore();
        }
        if (BX + 10 > p.x && BX - 10 < p.x + PW && (y - 9 < p.top || y + 9 > p.top + GAP)) return api.gameOver();
      }
      pipes = pipes.filter((p) => p.x > -PW);
      if (y + 10 > GROUND || y < -20) api.gameOver();
    },
    draw(ctx) {
      for (const p of pipes) {
        ctx.fillStyle = "#22c55e";
        ctx.fillRect(p.x, 0, PW, p.top);
        ctx.fillRect(p.x, p.top + GAP, PW, GROUND - p.top - GAP);
        ctx.fillStyle = "#16a34a";
        ctx.fillRect(p.x - 3, p.top - 12, PW + 6, 12);
        ctx.fillRect(p.x - 3, p.top + GAP, PW + 6, 12);
      }
      ctx.fillStyle = "#3f3a2f";
      ctx.fillRect(0, GROUND, W, H - GROUND);
      ctx.fillStyle = "#57503f";
      for (let x = -groundOffset; x < W; x += 24) ctx.fillRect(x, GROUND, 12, 4);
      // Bird, tilted with its velocity.
      ctx.save();
      ctx.translate(BX, y);
      ctx.rotate(Math.max(-0.5, Math.min(1.1, vy / 420)));
      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 9.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fde68a";
      ctx.beginPath();
      ctx.ellipse(-3, 2 + Math.sin(t * 22) * 2, 6, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(5, -3, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(6, -3, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fb923c";
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(17, 2);
      ctx.lineTo(10, 4);
      ctx.fill();
      ctx.restore();
    },
    key(k) {
      if (k === " " || k === "ArrowUp" || k === "w" || k === "W") { flap(); return true; }
      return false;
    },
    pointer(_x, _y, kind) {
      if (kind === "down") flap();
    },
  };
};

const FACTORIES: Record<Exclude<BuildGameId, "none">, GameFactory> = {
  snake: createSnake,
  breakout: createBreakout,
  flappy: createFlappy,
};

const HINTS: Record<Exclude<BuildGameId, "none">, string> = {
  snake: "Arrows / WASD — or tap where to turn",
  breakout: "Move your mouse to steer",
  flappy: "Click or Space to flap",
};

function readBest(game: string): number {
  try {
    return Number(localStorage.getItem(`lofin:game-best:${game}`)) || 0;
  } catch {
    return 0;
  }
}

function writeBest(game: string, score: number) {
  try {
    localStorage.setItem(`lofin:game-best:${game}`, String(score));
  } catch {
    // Best score is a nicety only.
  }
}

export function GameCanvas({
  game,
  onPhaseChange,
}: {
  game: Exclude<BuildGameId, "none">;
  onPhaseChange?: (phase: Phase) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<GameInstance | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const [phase, setPhaseState] = useState<Phase>("idle");
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  const [best, setBest] = useState(() => readBest(game));

  const setPhase = useCallback(
    (p: Phase) => {
      phaseRef.current = p;
      setPhaseState(p);
      onPhaseChange?.(p);
    },
    [onPhaseChange]
  );

  const fresh = useCallback(() => {
    scoreRef.current = 0;
    setScore(0);
    instanceRef.current = FACTORIES[game]({
      addScore(n = 1) {
        scoreRef.current += n;
        setScore(scoreRef.current);
      },
      gameOver() {
        if (phaseRef.current !== "playing") return;
        setPhase("over");
        if (scoreRef.current > readBest(game)) {
          writeBest(game, scoreRef.current);
          setBest(scoreRef.current);
        }
      },
    });
  }, [game, setPhase]);

  const start = useCallback(() => {
    fresh();
    setPhase("playing");
    wrapRef.current?.focus({ preventScroll: true });
  }, [fresh, setPhase]);

  // New game picked: reset to its idle screen.
  useEffect(() => {
    fresh();
    setBest(readBest(game));
    setPhase("idle");
  }, [game, fresh, setPhase]);

  // Render loop. Canvas is sized for the device pixel ratio so it stays crisp.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const inst = instanceRef.current;
      if (inst && phaseRef.current === "playing") inst.update(dt);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, W, H);
      inst?.draw(ctx);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const toLocal = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  };

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      onKeyDown={(e) => {
        if (phaseRef.current !== "playing") {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            start();
          }
          return;
        }
        if (instanceRef.current?.key?.(e.key)) e.preventDefault();
      }}
      className="relative w-full max-w-[340px] select-none overflow-hidden rounded-2xl border border-white/10 shadow-xl outline-none ring-accent-500/50 focus-visible:ring-2"
    >
      <canvas
        ref={canvasRef}
        className="block aspect-square w-full touch-none"
        onPointerDown={(e) => {
          if (phaseRef.current !== "playing") return;
          wrapRef.current?.focus({ preventScroll: true });
          const p = toLocal(e);
          instanceRef.current?.pointer?.(p.x, p.y, "down");
        }}
        onPointerMove={(e) => {
          if (phaseRef.current !== "playing") return;
          const p = toLocal(e);
          instanceRef.current?.pointer?.(p.x, p.y, "move");
        }}
      />
      <div className="pointer-events-none absolute left-3 top-2 flex items-center gap-3 font-mono text-xs text-white/80">
        <span>{score}</span>
        {best > 0 && (
          <span className="flex items-center gap-1 text-amber-300/80">
            <Trophy size={11} /> {best}
          </span>
        )}
      </div>
      {phase !== "playing" && (
        <button
          type="button"
          onClick={start}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-white backdrop-blur-[2px] transition-colors hover:bg-black/45"
        >
          {phase === "over" ? (
            <>
              <span className="text-lg font-semibold">Game over</span>
              <span className="text-sm text-white/70">
                Score {score}
                {score > 0 && score >= best ? " · new best!" : ""}
              </span>
              <span className="mt-1 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black">
                <RotateCw size={12} /> Play again
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold text-black">
                <Play size={13} /> Play
              </span>
              <span className="text-xs text-white/70">{HINTS[game]}</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
