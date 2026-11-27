// ChessMate PixiJS effect renderer — lazy initialized, manual rendering.
let appPromise = null;
let app = null;
let graphics = null;
let disabled = false;

async function getRenderer() {
  if (disabled) return null;
  if (app) return app;

  if (!appPromise) {
    appPromise = (async () => {
      try {
        const PIXI = await import("../vendor/pixi.min.mjs");
        const instance = new PIXI.Application();

        await instance.init({
          width: window.innerWidth,
          height: window.innerHeight,
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 1.5),
          preference: "webgl",
          powerPreference: "high-performance",
          autoStart: false
        });

        const canvas = instance.canvas;
        canvas.className = "chessmate-pixi-fx";
        Object.assign(canvas.style, {
          position: "fixed",
          inset: "0",
          width: "100vw",
          height: "100vh",
          zIndex: "9998",
          pointerEvents: "none",
          display: "none"
        });

        document.body.append(canvas);

        graphics = new PIXI.Graphics();
        instance.stage.addChild(graphics);
        app = instance;
        return app;
      } catch (error) {
        console.warn("[ChessMate] PixiJS unavailable; using Canvas fallback.", error);
        disabled = true;
        return null;
      }
    })();
  }

  return appPromise;
}

function strokePath(g, points, width, color, alpha) {
  if (!points.length) return;
  g.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    g.lineTo(points[i][0], points[i][1]);
  }
  g.stroke({ width, color, alpha, cap: "round", join: "round" });
}

function drawBolt(g, bolt, power) {
  for (const branch of bolt.branches) {
    strokePath(g, branch, 7, 0x3d86e0, 0.25 * power);
    strokePath(g, branch, 2.2, 0xdff0ff, 0.95 * power);
  }

  strokePath(g, bolt.main, 26, 0x2f6fd0, 0.16 * power);
  strokePath(g, bolt.main, 13, 0x6fb6ff, 0.38 * power);
  strokePath(g, bolt.main, 6, 0xcfe8ff, 0.9 * power);
  strokePath(g, bolt.main, 2.6, 0xffffff, power);
}

export async function renderLightningPixi({ bolt, tx, ty, radius, frames }) {
  const renderer = await getRenderer();
  if (!renderer || !graphics) return false;

  try {
    renderer.renderer.resize(window.innerWidth, window.innerHeight);
    renderer.canvas.style.display = "block";

    return await new Promise(resolve => {
      const start = performance.now();
      let lastFrame = -1;
      let finished = false;

      const finish = () => {
        if (finished) return;
        finished = true;
        graphics.clear();
        renderer.render();
        renderer.canvas.style.display = "none";
        resolve(true);
      };

      const tick = now => {
        if (finished) return;

        const elapsed = now - start;
        let index = -1;

        for (let i = 0; i < frames.length; i++) {
          if (elapsed >= frames[i].t) index = i;
        }

        if (index !== lastFrame && index >= 0) {
          lastFrame = index;
          const power = frames[index].p;

          graphics.clear();
          drawBolt(graphics, bolt, power);

          // Impact glow, rendered on the same GPU canvas.
          graphics.circle(tx, ty, radius * 1.6)
            .fill({ color: 0x9fcfff, alpha: 0.12 * power });
          graphics.circle(tx, ty, radius * 0.8)
            .fill({ color: 0xc4e4ff, alpha: 0.12 * power });

          renderer.render();
        }

        if (elapsed < 900) {
          requestAnimationFrame(tick);
        } else {
          finish();
        }
      };

      requestAnimationFrame(tick);
    });
  } catch (error) {
    console.warn("[ChessMate] PixiJS rendering failed; using Canvas fallback.", error);
    renderer.canvas.style.display = "none";
    graphics?.clear();
    return false;
  }
}
