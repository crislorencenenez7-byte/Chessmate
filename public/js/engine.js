// Stockfish (WASM, single-thread "lite" build) running in a Web Worker.
// Everything is served from /engine, so no CDN or special HTTP headers are needed.
// All jobs run one at a time through a FIFO queue; analysis results are cached by FEN.

const ENGINE_URL = new URL("../engine/stockfish-19-lite-single.js", import.meta.url);

// Computer opponent strength presets.
export const LEVELS = [
  { id: 0, name: "Beginner",     opts: { limit: false, skill: 0  }, go: "depth 1 movetime 60"   },
  { id: 1, name: "Casual",       opts: { limit: false, skill: 5  }, go: "depth 5 movetime 150"  },
  { id: 2, name: "Intermediate", opts: { limit: true,  elo: 1600 }, go: "movetime 300"          },
  { id: 3, name: "Advanced",     opts: { limit: true,  elo: 2100 }, go: "movetime 500"          },
  { id: 4, name: "Master",       opts: { limit: false, skill: 20 }, go: "depth 14 movetime 900" }
];

const ANALYSIS = { depth: 10, multipv: 1, movetime: 450 };

export class Engine {
  constructor() {
    this.worker = null;
    this.state = "idle"; // idle | loading | ready | failed
    this.queue = [];
    this.running = null;
    this.cache = new Map();
    this.pending = new Map();
    this.waiters = [];
    this.initPromise = null;
    this.onState = () => {};
  }

  get ready() { return this.state === "ready"; }

  _setState(s) { this.state = s; try { this.onState(s); } catch {} }

  init() {
    if (this.initPromise) return this.initPromise;
    this._setState("loading");
    this.initPromise = new Promise((resolve, reject) => {
      const fail = err => {
        this._setState("failed");
        this._failAll(err);
        reject(err);
      };
      let worker;
      try { worker = new Worker(ENGINE_URL); } catch (e) { return fail(e); }
      this.worker = worker;
      worker.onerror = e => fail(new Error(e.message || "Stockfish failed to load"));
      worker.onmessage = e => this._onLine(String(e.data || ""));
      const timer = setTimeout(() => fail(new Error("Stockfish start-up timed out")), 20000);
      this._waitFor(l => l === "uciok").then(() => {
        this._send("setoption name Threads value 1");
        this._send("setoption name Hash value 16");
        this._send("isready");
        return this._waitFor(l => l === "readyok");
      }).then(() => {
        clearTimeout(timer);
        this._setState("ready");
        resolve();
        this._pump();
      });
      this._send("uci");
    });
    this.initPromise.catch(() => {});
    return this.initPromise;
  }

  _send(cmd) { this.worker && this.worker.postMessage(cmd); }

  _waitFor(pred) {
    return new Promise(resolve => this.waiters.push({ pred, resolve }));
  }

  _onLine(line) {
    for (let i = 0; i < this.waiters.length; i++) {
      if (this.waiters[i].pred(line)) {
        const [w] = this.waiters.splice(i, 1);
        w.resolve(line);
        return;
      }
    }
    if (this.running) this.running.onLine(line);
  }

  _failAll(err) {
    const jobs = this.queue.splice(0);
    if (this.running) jobs.push(this.running);
    this.running = null;
    jobs.forEach(j => j.fail(err));
  }

  _pump() {
    if (this.running || !this.queue.length || this.state !== "ready") return;
    const job = this.queue.shift();
    this.running = job;
    const done = () => { clearTimeout(job.timer1); clearTimeout(job.timer2); this.running = null; this._pump(); };
    job.done = done;
    job.timer1 = setTimeout(() => this._send("stop"), job.limitMs + 5000);
    job.timer2 = setTimeout(() => { job.fail(new Error("Engine stopped responding")); this._setState("failed"); this._failAll(new Error("Engine stopped responding")); }, job.limitMs + 15000);
    job.start();
  }

  _enqueue(job) {
    if (job.priority) this.queue.unshift(job);
    else this.queue.push(job);
    this._pump();
  }

  // Drop jobs that have not started yet (e.g. when a new game begins).
  cancelQueued() {
    this.queue.splice(0).forEach(j => j.fail(new Error("cancelled")));
  }

  // Cached analysis, if any, without scheduling a search.
  peek(fen) {
    return this.cache.get(this._key(fen, ANALYSIS.depth, ANALYSIS.multipv)) || null;
  }

  _key(fen, depth, mpv) { return `${fen}|${depth}|${mpv}`; }

  // Returns { fen, turn, depth, lines:[{move, cp, mate, depth}] } with scores from the
  // point of view of the side to move. `lines` is empty when there are no legal moves.
  analyze(fen, o = {}) {
    const { depth, multipv, movetime } = { ...ANALYSIS, ...o };
    const key = this._key(fen, depth, multipv);
    if (this.cache.has(key)) return Promise.resolve(this.cache.get(key));
    if (this.pending.has(key)) return this.pending.get(key);
    if (this.state === "failed") return Promise.reject(new Error("Engine unavailable"));
    const turn = fen.split(" ")[1] === "b" ? "b" : "w";
    const p = new Promise((resolve, reject) => {
      const lines = new Map();
      this._enqueue({
        limitMs: movetime,
        fail: reject,
        start: () => {
          this._send("setoption name UCI_LimitStrength value false");
          this._send("setoption name Skill Level value 20");
          this._send(`setoption name MultiPV value ${multipv}`);
          this._send("position fen " + fen);
          this._send(`go depth ${depth} movetime ${movetime}`);
        },
        onLine: line => {
          if (line.startsWith("info ")) {
            const t = line.split(" ");
            const iPv = t.indexOf("pv");
            const iScore = t.indexOf("score");
            if (iPv < 0 || iScore < 0) return;
            const mpvIdx = t.indexOf("multipv");
            const idx = mpvIdx >= 0 ? Number(t[mpvIdx + 1]) : 1;
            const kind = t[iScore + 1];
            const val = Number(t[iScore + 2]);
            const bound = t[iScore + 3] === "lowerbound" || t[iScore + 3] === "upperbound";
            const d = Number(t[t.indexOf("depth") + 1]) || 0;
            const prev = lines.get(idx);
            if (bound && prev && !prev.bound) return;
            lines.set(idx, {
              move: t[iPv + 1], depth: d, bound,
              cp: kind === "cp" ? val : null,
              mate: kind === "mate" ? val : null
            });
          } else if (line.startsWith("bestmove")) {
            const out = [...lines.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1])
              .filter(l => l.move && l.move !== "(none)");
            const res = { fen, turn, depth: out[0]?.depth || 0, lines: out };
            if (out.length) {
              this.cache.set(key, res);
              if (this.cache.size > 600) this.cache.delete(this.cache.keys().next().value);
            }
            this.running.done();
            resolve(res);
          }
        }
      });
    });
    this.pending.set(key, p);
    const clear = () => this.pending.delete(key);
    p.then(clear, clear);
    return p;
  }

  // Ask the engine for a move at a given strength level. Resolves with a UCI move or null.
  playMove(fen, levelId) {
    const level = LEVELS[levelId] || LEVELS[2];
    const mt = Number((level.go.match(/movetime (\d+)/) || [])[1]) || 500;
    if (this.state === "failed") return Promise.reject(new Error("Engine unavailable"));
    return new Promise((resolve, reject) => {
      this._enqueue({
        priority: true,
        limitMs: mt,
        fail: reject,
        start: () => {
          this._send("setoption name MultiPV value 1");
          if (level.opts.limit) {
            this._send("setoption name UCI_LimitStrength value true");
            this._send(`setoption name UCI_Elo value ${level.opts.elo}`);
          } else {
            this._send("setoption name UCI_LimitStrength value false");
            this._send(`setoption name Skill Level value ${level.opts.skill}`);
          }
          this._send("position fen " + fen);
          this._send("go " + level.go);
        },
        onLine: line => {
          if (!line.startsWith("bestmove")) return;
          const m = line.split(" ")[1];
          this.running.done();
          resolve(m && m !== "(none)" ? m : null);
        }
      });
    });
  }
}
