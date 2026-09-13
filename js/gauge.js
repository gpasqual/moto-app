// Lean-angle dial rendered as SVG. Scale runs 0° at the top to ±60° either side.
const NS = 'http://www.w3.org/2000/svg';
const CX = 100, CY = 100, R_DIAL = 97, R_TICK = 76, R_LABEL = 87, MAX_DEG = 60;

function el(name, attrs = {}, parent) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
function polar(deg, r) {
  const a = (deg - 90) * Math.PI / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

export function createGauge(container) {
  const svg = el('svg', { viewBox: '0 0 200 200', class: 'gauge-svg' }, container);
  const defs = el('defs', {}, svg);
  const grad = el('radialGradient', { id: 'gaugeBg', cx: '50%', cy: '55%', r: '60%' }, defs);
  el('stop', { offset: '0%', 'stop-color': '#1b1b22' }, grad);
  el('stop', { offset: '100%', 'stop-color': '#0b0b0f' }, grad);
  const glow = el('filter', { id: 'needleGlow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
  el('feGaussianBlur', { stdDeviation: '1.6', result: 'b' }, glow);
  const merge = el('feMerge', {}, glow);
  el('feMergeNode', { in: 'b' }, merge);
  el('feMergeNode', { in: 'SourceGraphic' }, merge);

  el('circle', { cx: CX, cy: CY, r: R_DIAL, fill: 'url(#gaugeBg)', stroke: '#26262e', 'stroke-width': 1.5 }, svg);

  // Ticks + labels
  const ticks = el('g', { class: 'gauge-ticks' }, svg);
  for (let d = -MAX_DEG; d <= MAX_DEG; d += 2) {
    const major = d % 10 === 0;
    const mid = !major && d % 5 === 0;
    const len = major ? 11 : mid ? 7 : 4;
    const [x1, y1] = polar(d, R_TICK);
    const [x2, y2] = polar(d, R_TICK - len);
    el('line', {
      x1, y1, x2, y2,
      stroke: major ? '#e8e8f0' : '#8a8a96',
      'stroke-width': major ? 2.2 : 1.2, 'stroke-linecap': 'round',
    }, ticks);
    if (major && d !== 0) {
      const [lx, ly] = polar(d, R_LABEL);
      const t = el('text', {
        x: lx, y: ly, 'text-anchor': 'middle', 'dominant-baseline': 'central',
        class: 'gauge-label',
      }, ticks);
      t.textContent = String(Math.abs(d));
    }
  }
  // Danger zone arcs beyond 45°
  const arc = (from, to) => {
    const r = R_TICK + 3.5;
    const [ax, ay] = polar(from, r);
    const [bx, by] = polar(to, r);
    return `M ${ax} ${ay} A ${r} ${r} 0 0 ${to > from ? 1 : 0} ${bx} ${by}`;
  };
  el('path', { d: arc(-MAX_DEG, -45), stroke: 'rgba(255,90,60,0.55)', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }, svg);
  el('path', { d: arc(45, MAX_DEG), stroke: 'rgba(255,90,60,0.55)', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }, svg);

  // Needle
  const needle = el('g', { class: 'gauge-needle', filter: 'url(#needleGlow)' }, svg);
  needle.style.transformOrigin = `${CX}px ${CY}px`;
  el('line', { x1: CX, y1: CY, x2: CX, y2: CY - R_TICK, stroke: 'var(--needle)', 'stroke-width': 3.2, 'stroke-linecap': 'round' }, needle);
  el('circle', { cx: CX, cy: CY - R_TICK, r: 3.4, fill: 'var(--needle)' }, needle);
  el('circle', { cx: CX, cy: CY - R_TICK + 14, r: 3.2, fill: 'var(--needle)' }, needle);
  el('circle', { cx: CX, cy: CY, r: 6.5, fill: '#0b0b0f', stroke: 'var(--needle)', 'stroke-width': 2.4 }, needle);

  // Readout
  const readout = el('text', { x: CX, y: CY + 34, 'text-anchor': 'middle', class: 'gauge-readout' }, svg);
  readout.textContent = '0°';

  let shown = 0;
  return {
    svg,
    setAngle(deg) {
      const clamped = Math.max(-MAX_DEG - 5, Math.min(MAX_DEG + 5, deg || 0));
      shown = clamped;
      needle.style.transform = `rotate(${clamped}deg)`;
      readout.textContent = `${Math.round(Math.abs(deg || 0))}°`;
      const over = Math.abs(deg) >= 45;
      readout.classList.toggle('danger', over);
    },
    get angle() { return shown; },
  };
}
