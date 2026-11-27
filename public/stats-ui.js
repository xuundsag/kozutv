// The statistics page: a few numbers and a lot of drawing.
//
// Every chart is a <canvas> painted from /api/stats and animated with
// requestAnimationFrame, easing to its final shape once the card scrolls into
// view. Nothing here depends on a chart library, so it keeps working offline and
// inside the Android WebView, and the same code serves the desktop and the phone
// layouts (each chart re-reads its own box on resize).
(function () {
  const C = {
    orange: '#ff731c',
    orangeSoft: '#ff9c5e',
    amber: '#f0b429',
    green: '#2fd07a',
    teal: '#25b7d3',
    blue: '#5865f2',
    purple: '#a855f7',
    pink: '#eb459e',
    red: '#e8412f',
    track: '#262b36',
    text: '#eef0f5',
    muted: '#8d95a5'
  };
  const PALETTE = [C.orange, C.amber, C.green, C.teal, C.blue, C.purple, C.pink, C.red];
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function prep(canvas) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const box = canvas.getBoundingClientRect();
    const w = Math.max(60, Math.round(box.width));
    const h = Math.max(40, Math.round(box.height));
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  /** Animates one canvas from progress 0 to 1. */
  function drawNow(canvas) {
    const draw = canvas && canvas.__draw;
    if (!draw) return;
    if (REDUCED) return draw(1);
    cancelAnimationFrame(canvas.__raf);
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / 900);
      draw(ease(p));
      if (p < 1) canvas.__raf = requestAnimationFrame(step);
    };
    canvas.__raf = requestAnimationFrame(step);
  }

  /**
   * Registers the last draw for a canvas and plays it the first time the canvas
   * scrolls into view. Each canvas keeps at most one observer, so redrawing (on
   * resize, on new data) never stacks them up.
   */
  function animate(canvas, draw) {
    if (!canvas) return;
    canvas.__draw = draw;
    if (!('IntersectionObserver' in window)) return drawNow(canvas);
    if (canvas.__io) return;
    if (canvas.__seen) return drawNow(canvas);
    canvas.__io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        canvas.__seen = true;
        if (canvas.__io) canvas.__io.disconnect();
        canvas.__io = null;
        drawNow(canvas);
      }
    }, { threshold: 0.2 });
    canvas.__io.observe(canvas);
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  // ---- charts -------------------------------------------------------------

  /** Donut: genre share. The ring sweeps in, then the labels count up. */
  function donut(canvas, rows) {
    const total = rows.reduce((n, r) => n + r.value, 0) || 1;
    animate(canvas, (p) => {
      const { ctx, w, h } = prep(canvas);
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.38;
      const thickness = Math.max(14, radius * 0.34);
      let angle = -Math.PI / 2;
      rows.forEach((row, i) => {
        const sweep = (row.value / total) * Math.PI * 2 * p;
        ctx.beginPath();
        ctx.strokeStyle = PALETTE[i % PALETTE.length];
        ctx.lineWidth = thickness;
        ctx.lineCap = 'butt';
        ctx.arc(cx, cy, radius, angle + 0.012, angle + sweep - 0.012);
        ctx.stroke();
        angle += sweep;
      });
      // The hole is painted rather than cut, so the card background shows through.
      ctx.beginPath();
      ctx.fillStyle = '#16181f';
      ctx.arc(cx, cy, radius - thickness / 2 - 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const top = rows[0];
      ctx.fillStyle = C.text;
      ctx.font = `800 ${Math.round(radius * 0.42)}px "Segoe UI",system-ui,sans-serif`;
      ctx.fillText(top ? Math.round((top.value / total) * 100 * p) + '%' : '0%', cx, cy - radius * 0.16);
      ctx.fillStyle = C.muted;
      ctx.font = `700 ${Math.round(radius * 0.17)}px "Segoe UI",system-ui,sans-serif`;
      ctx.fillText((top ? top.name : 'No data').toUpperCase().slice(0, 14), cx, cy + radius * 0.24);
    });
  }

  /** Vertical bars: minutes watched per day for the last fortnight. */
  function bars(canvas, days) {
    const max = Math.max(1, ...days.map((d) => d.minutes));
    animate(canvas, (p) => {
      const { ctx, w, h } = prep(canvas);
      const pad = 6;
      const labelH = 20;
      const plot = h - labelH;
      const gap = Math.max(3, w * 0.012);
      const bw = (w - pad * 2 - gap * (days.length - 1)) / days.length;
      days.forEach((d, i) => {
        const x = pad + i * (bw + gap);
        const bh = Math.max(d.minutes ? 4 : 2, (d.minutes / max) * (plot - 12) * p);
        const y = plot - bh;
        const grad = ctx.createLinearGradient(0, y, 0, plot);
        grad.addColorStop(0, d.minutes ? C.orange : C.track);
        grad.addColorStop(1, d.minutes ? C.orangeSoft : C.track);
        ctx.fillStyle = grad;
        roundRect(ctx, x, y, bw, bh, Math.min(6, bw / 2));
        ctx.fill();
        if (i % 2 === 0 || days.length <= 8) {
          ctx.fillStyle = '#717a8a';
          ctx.font = '600 10px "Segoe UI",system-ui,sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(d.day.slice(8), x + bw / 2, h - 5);
        }
      });
    });
  }

  /** Horizontal bars: the six shows watched the longest. */
  function hbars(canvas, rows) {
    const max = Math.max(1, ...rows.map((r) => r.seconds));
    animate(canvas, (p) => {
      const { ctx, w, h } = prep(canvas);
      const rowH = h / Math.max(1, rows.length);
      const labelW = Math.min(150, w * 0.4);
      rows.forEach((r, i) => {
        const y = i * rowH + rowH * 0.22;
        const bh = Math.max(8, rowH * 0.42);
        ctx.fillStyle = '#20242e';
        roundRect(ctx, labelW, y, w - labelW - 6, bh, bh / 2);
        ctx.fill();
        const bw = Math.max(6, ((w - labelW - 6) * (r.seconds / max)) * p);
        const grad = ctx.createLinearGradient(labelW, 0, labelW + bw, 0);
        grad.addColorStop(0, C.orange);
        grad.addColorStop(1, C.amber);
        ctx.fillStyle = grad;
        roundRect(ctx, labelW, y, bw, bh, bh / 2);
        ctx.fill();
        ctx.fillStyle = C.text;
        ctx.font = `700 ${Math.min(13, Math.max(10, rowH * 0.34))}px "Segoe UI",system-ui,sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const label = r.title.length > 22 ? r.title.slice(0, 21) + '…' : r.title;
        ctx.fillText(label, 0, y + bh / 2);
      });
    });
  }

  /** Ring split: how many anime, movies and series make up the library. */
  function rings(canvas, rows) {
    const total = rows.reduce((n, r) => n + r.value, 0) || 1;
    animate(canvas, (p) => {
      const { ctx, w, h } = prep(canvas);
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.36;
      let angle = -Math.PI / 2;
      const colors = { anime: C.orange, movie: C.teal, tv: C.purple };
      rows.forEach((r) => {
        const sweep = (r.value / total) * Math.PI * 2 * p;
        ctx.beginPath();
        ctx.strokeStyle = colors[r.name] || C.blue;
        ctx.lineWidth = Math.max(12, radius * 0.3);
        ctx.arc(cx, cy, radius, angle, angle + sweep);
        ctx.stroke();
        angle += sweep;
      });
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.text;
      ctx.font = `800 ${Math.round(radius * 0.4)}px "Segoe UI",system-ui,sans-serif`;
      ctx.fillText(String(Math.round(total * p)), cx, cy);
    });
  }

  /** Sparkline: the running total over the last two weeks. */
  function spark(canvas, days) {
    const max = Math.max(1, ...days.map((d) => d.minutes));
    animate(canvas, (p) => {
      const { ctx, w, h } = prep(canvas);
      const pts = days.map((d, i) => ({
        x: 8 + (i / Math.max(1, days.length - 1)) * (w - 16),
        y: h - 8 - (d.minutes / max) * (h - 20)
      }));
      const cut = Math.max(1, Math.floor(pts.length * p));
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < cut; i++) {
        const prev = pts[i - 1], cur = pts[i];
        const mx = (prev.x + cur.x) / 2;
        ctx.bezierCurveTo(mx, prev.y, mx, cur.y, cur.x, cur.y);
      }
      ctx.strokeStyle = C.teal;
      ctx.lineWidth = 2.4;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.lineTo(pts[cut - 1].x, h - 6);
      ctx.lineTo(pts[0].x, h - 6);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(37,183,211,.34)');
      grad.addColorStop(1, 'rgba(37,183,211,0)');
      ctx.fillStyle = grad;
      ctx.fill();
      const last = pts[cut - 1];
      ctx.beginPath();
      ctx.fillStyle = C.teal;
      ctx.arc(last.x, last.y, 3.4, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawAll(data) {
    donut(document.getElementById('st-donut'), data.genres || []);
    bars(document.getElementById('st-bars'), data.days || []);
    hbars(document.getElementById('st-hbars'), data.topTitles || []);
    rings(document.getElementById('st-rings'), data.types || []);
    spark(document.getElementById('st-spark'), data.days || []);
  }

  // Numbers count up so the tiles feel alive without a spinner.
  function countUp(node, to, suffix = '') {
    if (!node) return;
    const target = Number(to) || 0;
    if (REDUCED || !target) { node.textContent = target + suffix; return; }
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / 750);
      node.textContent = Math.round(target * ease(p)) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  let lastData = null;
  let wired = false;
  function wire() {
    if (wired) return;
    wired = true;
    let timer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(timer);
      timer = setTimeout(() => lastData && drawAll(lastData), 160);
    });
    document.addEventListener('kozutv-theme', () => lastData && drawAll(lastData));
  }

  /** Called by app.js with the payload from /api/stats. */
  function paint(data) {
    lastData = data;
    wire();
    countUp(document.querySelector('[data-st-hours]'), data.totalHours || 0, 'h');
    countUp(document.querySelector('[data-st-minutes]'), data.totalMinutes || 0);
    countUp(document.querySelector('[data-st-episodes]'), data.episodesWatched || 0);
    countUp(document.querySelector('[data-st-streak]'), data.streak || 0);
    countUp(document.querySelector('[data-st-titles]'), data.titlesStarted || 0);
    countUp(document.querySelector('[data-st-days]'), data.daysWatched || 0);
    requestAnimationFrame(() => drawAll(data));
  }

  /** Re-arms the reveal animation for every chart; used after a data refresh. */
  function refresh(data) {
    lastData = data || lastData;
    if (!lastData) return;
    wire();
    for (const id of ['st-donut', 'st-bars', 'st-hbars', 'st-rings', 'st-spark']) {
      const el = document.getElementById(id);
      if (!el) continue;
      drawAll(lastData);
    }
  }
  window.KozuStats = { paint, drawAll, refresh, palette: PALETTE, colors: C };
})();
