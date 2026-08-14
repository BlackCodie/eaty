/* ==========================================================================
   charts.js — dependency-free SVG chart renderers.
   Every function returns an HTML string; callers drop it into innerHTML.
   ========================================================================== */
(function () {
  'use strict';

  let uid = 0;
  const nid = p => (p || 'g') + (++uid);
  const r2 = n => Math.round(n * 100) / 100;

  /* --------------------------------------------------------------- Rings */
  /**
   * Concentric progress rings (Apple-Health style).
   * arcs: [{ pct: 0..100+, color, label? }] — outermost first.
   */
  function rings(arcs, opts) {
    const o = Object.assign({ size: 148, stroke: 12, gap: 5, center: '' }, opts);
    const cx = o.size / 2;
    let html = `<svg class="ring" width="${o.size}" height="${o.size}" viewBox="0 0 ${o.size} ${o.size}">`;
    arcs.forEach((a, i) => {
      const r = cx - o.stroke / 2 - i * (o.stroke + o.gap);
      if (r <= 2) return;
      const c = 2 * Math.PI * r;
      const pct = Math.max(0, Math.min(100, Number(a.pct) || 0));
      const off = c * (1 - pct / 100);
      html += `<circle class="trk" cx="${cx}" cy="${cx}" r="${r2(r)}" stroke-width="${o.stroke}"/>`;
      html += `<circle class="val" cx="${cx}" cy="${cx}" r="${r2(r)}" stroke-width="${o.stroke}"` +
              ` stroke="${a.color}" style="color:${a.color}" stroke-dasharray="${r2(c)}"` +
              ` stroke-dashoffset="${r2(off)}"/>`;
      // A full lap and beyond gets a subtle second pass so overshoot is visible.
      if ((Number(a.pct) || 0) > 100) {
        const extra = Math.min(100, (a.pct - 100));
        html += `<circle class="val" cx="${cx}" cy="${cx}" r="${r2(r)}" stroke-width="${o.stroke * 0.42}"` +
                ` stroke="rgba(255,255,255,.85)" stroke-dasharray="${r2(c)}"` +
                ` stroke-dashoffset="${r2(c * (1 - extra / 100))}"/>`;
      }
    });
    html += '</svg>';
    return `<div class="ring-wrap">${html}${o.center ? `<div class="ring-center">${o.center}</div>` : ''}</div>`;
  }

  /* ---------------------------------------------------------- Line chart */
  /**
   * data: [{ x: label, y: number|null }]
   * opts: { height, color, goal, goalLabel, fmt, area, dots, minY, maxY, unit }
   */
  function line(data, opts) {
    const o = Object.assign({
      width: 340, height: 168, color: 'var(--brand)', area: true, dots: true,
      goal: null, goalLabel: '', fmt: v => Math.round(v), unit: '', padL: 34, padR: 10, padT: 12, padB: 22
    }, opts);

    const pts = (data || []).filter(d => d.y !== null && d.y !== undefined && !isNaN(d.y));
    if (pts.length < 2) return emptyBox(pts.length === 1 ? 'Log at least two entries to see a trend' : 'No data yet', o.height);

    const W = o.width, H = o.height;
    const x0 = o.padL, x1 = W - o.padR, y0 = o.padT, y1 = H - o.padB;

    let lo = o.minY !== undefined ? o.minY : Math.min.apply(null, pts.map(p => p.y));
    let hi = o.maxY !== undefined ? o.maxY : Math.max.apply(null, pts.map(p => p.y));
    if (o.goal !== null && o.goal !== undefined) { lo = Math.min(lo, o.goal); hi = Math.max(hi, o.goal); }
    if (hi === lo) { hi = lo + 1; lo = lo - 1; }
    const padY = (hi - lo) * 0.12;
    lo -= padY; hi += padY;

    const n = data.length;
    const X = i => x0 + (n === 1 ? (x1 - x0) / 2 : (x1 - x0) * i / (n - 1));
    const Y = v => y1 - (y1 - y0) * (v - lo) / (hi - lo);

    const gid = nid('lg');
    let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img">`;
    svg += `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${o.color}" stop-opacity=".34"/>
      <stop offset="100%" stop-color="${o.color}" stop-opacity="0"/></linearGradient></defs>`;

    // horizontal grid + y labels
    [0, 0.5, 1].forEach(f => {
      const y = y0 + (y1 - y0) * f;
      const v = hi - (hi - lo) * f;
      svg += `<line class="grid-line" x1="${x0}" y1="${r2(y)}" x2="${x1}" y2="${r2(y)}"/>`;
      svg += `<text class="axis-txt" x="${x0 - 6}" y="${r2(y + 3)}" text-anchor="end">${o.fmt(v)}</text>`;
    });

    if (o.goal !== null && o.goal !== undefined && o.goal >= lo && o.goal <= hi) {
      svg += `<line class="goal-line" x1="${x0}" y1="${r2(Y(o.goal))}" x2="${x1}" y2="${r2(Y(o.goal))}"/>`;
      if (o.goalLabel) {
        svg += `<text class="axis-txt" x="${x1}" y="${r2(Y(o.goal) - 5)}" text-anchor="end">${o.goalLabel}</text>`;
      }
    }

    // Build path across gaps (null values split the line into segments).
    const segs = [];
    let cur = [];
    data.forEach((d, i) => {
      if (d.y === null || d.y === undefined || isNaN(d.y)) { if (cur.length) { segs.push(cur); cur = []; } return; }
      cur.push([X(i), Y(d.y)]);
    });
    if (cur.length) segs.push(cur);

    segs.forEach(seg => {
      if (seg.length === 1) return;
      const d = seg.map((p, i) => (i ? 'L' : 'M') + r2(p[0]) + ' ' + r2(p[1])).join(' ');
      if (o.area) {
        svg += `<path d="${d} L ${r2(seg[seg.length - 1][0])} ${y1} L ${r2(seg[0][0])} ${y1} Z" fill="url(#${gid})" stroke="none"/>`;
      }
      svg += `<path class="ln" d="${d}" stroke="${o.color}"/>`;
    });

    if (o.dots) {
      const step = Math.ceil(pts.length / 14);
      data.forEach((d, i) => {
        if (d.y === null || d.y === undefined || isNaN(d.y)) return;
        const isLast = i === n - 1;
        if (!isLast && i % step !== 0) return;
        svg += `<circle class="dot" cx="${r2(X(i))}" cy="${r2(Y(d.y))}" r="${isLast ? 4.2 : 3}" fill="${o.color}"/>`;
      });
    }

    // x labels: first, middle, last
    [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i).forEach(i => {
      const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      svg += `<text class="axis-txt" x="${r2(X(i))}" y="${H - 6}" text-anchor="${anchor}">${esc(data[i].x)}</text>`;
    });

    svg += '</svg>';
    return svg;
  }

  /* ----------------------------------------------------------- Bar chart */
  /**
   * data: [{ x, y, color? }]
   * opts: { height, color, goal, fmt, overColor }
   */
  function bars(data, opts) {
    const o = Object.assign({
      width: 340, height: 168, color: 'var(--brand)', goal: null,
      fmt: v => Math.round(v), padL: 34, padR: 10, padT: 12, padB: 22, labelEvery: 0
    }, opts);

    if (!data || !data.length) return emptyBox('No data yet', o.height);
    const W = o.width, H = o.height;
    const x0 = o.padL, x1 = W - o.padR, y0 = o.padT, y1 = H - o.padB;

    let hi = Math.max.apply(null, data.map(d => d.y || 0));
    if (o.goal) hi = Math.max(hi, o.goal);
    if (hi <= 0) hi = 1;
    hi *= 1.12;

    const n = data.length;
    const slot = (x1 - x0) / n;
    const bw = Math.max(3, Math.min(26, slot * 0.62));
    const Y = v => y1 - (y1 - y0) * (v / hi);

    let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img">`;
    [0, 0.5, 1].forEach(f => {
      const y = y0 + (y1 - y0) * f;
      svg += `<line class="grid-line" x1="${x0}" y1="${r2(y)}" x2="${x1}" y2="${r2(y)}"/>`;
      svg += `<text class="axis-txt" x="${x0 - 6}" y="${r2(y + 3)}" text-anchor="end">${o.fmt(hi - hi * f)}</text>`;
    });

    data.forEach((d, i) => {
      const v = Math.max(0, d.y || 0);
      const cx = x0 + slot * i + slot / 2;
      const h = Math.max(v > 0 ? 2 : 0, y1 - Y(v));
      const col = d.color || o.color;
      svg += `<rect class="bar-r" x="${r2(cx - bw / 2)}" y="${r2(y1 - h)}" width="${r2(bw)}" height="${r2(h)}"` +
             ` rx="${r2(Math.min(bw / 2, 4))}" fill="${col}" opacity="${d.dim ? .38 : 1}"/>`;
    });

    if (o.goal) {
      svg += `<line class="goal-line" x1="${x0}" y1="${r2(Y(o.goal))}" x2="${x1}" y2="${r2(Y(o.goal))}"/>`;
    }

    const every = o.labelEvery || Math.max(1, Math.ceil(n / 7));
    data.forEach((d, i) => {
      if (i % every !== 0 && i !== n - 1) return;
      const cx = x0 + slot * i + slot / 2;
      svg += `<text class="axis-txt" x="${r2(cx)}" y="${H - 6}" text-anchor="middle">${esc(d.x)}</text>`;
    });

    svg += '</svg>';
    return svg;
  }

  /* ---------------------------------------------------------- Sparkline */
  function spark(values, opts) {
    const o = Object.assign({ width: 90, height: 28, color: 'var(--brand)' }, opts);
    const vals = (values || []).filter(v => v !== null && !isNaN(v));
    if (vals.length < 2) return '';
    const lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    const span = hi - lo || 1;
    const d = vals.map((v, i) => {
      const x = o.width * i / (vals.length - 1);
      const y = o.height - 2 - (o.height - 4) * (v - lo) / span;
      return (i ? 'L' : 'M') + r2(x) + ' ' + r2(y);
    }).join(' ');
    return `<svg class="chart" width="${o.width}" height="${o.height}" viewBox="0 0 ${o.width} ${o.height}">` +
           `<path d="${d}" fill="none" stroke="${o.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  /* --------------------------------------------------- Stacked macro bar */
  function macroBar(totals) {
    const p = (totals.protein || 0) * 4, c = (totals.carbs || 0) * 4, f = (totals.fat || 0) * 9;
    const tot = p + c + f;
    if (tot <= 0) return '<div class="bar" style="height:9px"></div>';
    const seg = (v, col) => `<i style="width:${r2(v / tot * 100)}%;background:${col}"></i>`;
    return `<div class="bar" style="height:9px;display:flex;gap:0">
      ${seg(p, 'var(--protein)')}${seg(c, 'var(--carbs)')}${seg(f, 'var(--fat)')}</div>`;
  }

  function emptyBox(msg, h) {
    return `<div class="chart-empty" style="min-height:${(h || 150) - 20}px">${esc(msg)}</div>`;
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.Charts = { rings, line, bars, spark, macroBar, empty: emptyBox };
})();
