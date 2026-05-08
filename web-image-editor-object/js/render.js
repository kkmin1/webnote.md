/**
 * render.js — SVG 렌더링 & 줌/캔버스 크기
 */

const cvEl     = document.getElementById('cv');
const cvScroll = document.getElementById('cv-scroll');
const cvInner  = document.getElementById('cv-inner');
const cvSvg    = document.getElementById('cv-svg');
const gridSvg  = document.getElementById('grid-svg');
const svgDefs  = document.getElementById('svg-defs');

const HANDLE_R   = 5;
const HANDLE_IDS = ['tl','tc','tr','mr','br','bc','bl','ml'];

/* ── SVG 헬퍼 ── */
function ns(tag, a) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (a) for (const [k,v] of Object.entries(a)) e.setAttribute(k, v);
  return e;
}

/* ── hex + fillOpacity → rgba ── */
function fillColor(o) {
  if (o.fillNone) return 'none';
  const hex = o.fill || '#ffffff';
  const fop = o.fillOpacity ?? 100;
  if (fop >= 100) return hex;
  let h = hex.replace('#','');
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  const r = parseInt(h.slice(0,2),16);
  const g = parseInt(h.slice(2,4),16);
  const b = parseInt(h.slice(4,6),16);
  return `rgba(${r},${g},${b},${(fop/100).toFixed(2)})`;
}

/* ── 화살표 마커 캐시 ── */
const MC = {};
function marker(color) {
  const key = 'm_' + color.replace(/[^a-zA-Z0-9]/g,'_');
  if (!MC[key]) {
    MC[key] = key;
    const m = ns('marker', { id:key, viewBox:'0 0 10 10', refX:'9', refY:'5', markerWidth:'6', markerHeight:'6', orient:'auto-start-reverse' });
    m.appendChild(ns('path', { d:'M1 1.5L9 5L1 8.5', fill:'none', stroke:color, 'stroke-width':'1.8', 'stroke-linecap':'round', 'stroke-linejoin':'round' }));
    svgDefs.appendChild(m);
  }
  return `url(#${MC[key]})`;
}

function richSegments(text) {
  const s = String(text || '');
  const out = [];
  let i = 0;
  while (i < s.length) {
    if (i + 3 < s.length && s[i + 1] === '_' && s[i + 2] === '{') {
      const base = s[i];
      let j = i + 3, depth = 1, buf = '';
      while (j < s.length && depth) {
        if (s[j] === '{') { depth++; buf += s[j]; }
        else if (s[j] === '}') { depth--; if (depth) buf += s[j]; }
        else buf += s[j];
        j++;
      }
      out.push({ kind:'base', text: base });
      out.push({ kind:'sub', text: buf });
      i = j;
      continue;
    }
    out.push({ kind:'base', text: s[i] });
    i++;
  }
  return out;
}

function bezierPath(points) {
  if (!points || points.length < 2) return '';
  if (points.length === 2) return `M ${points[0][0]} ${points[0][1]} L ${points[1][0]} ${points[1][1]}`;
  const d = [`M ${points[0][0]} ${points[0][1]}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`);
  }
  return d.join(' ');
}

function quadraticPath(o) {
  return `M ${o.x1} ${o.y1} Q ${o.cx1} ${o.cy1} ${o.x2} ${o.y2}`;
}

function cubicPath(o) {
  return `M ${o.x1} ${o.y1} C ${o.cx1} ${o.cy1}, ${o.cx2} ${o.cy2}, ${o.x2} ${o.y2}`;
}

function arcPoint(o, angleDeg) {
  const rad = angleDeg * Math.PI / 180;
  return {
    x: o.cx + o.rx * Math.cos(rad),
    y: o.cy + o.ry * Math.sin(rad),
  };
}

function arcPath(o) {
  const start = arcPoint(o, o.startAngle ?? 0);
  const end = arcPoint(o, o.endAngle ?? 0);
  let delta = (o.endAngle ?? 0) - (o.startAngle ?? 0);
  while (delta <= -180) delta += 360;
  while (delta > 180) delta -= 360;
  const largeArc = Math.abs(delta) > 180 ? 1 : 0;
  const sweep = delta >= 0 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${o.rx} ${o.ry} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`;
}

/* ── 캔버스 크기 & 줌 ── */
function applyCvSize() {
  const w = Math.round(cvW*zoom), h = Math.round(cvH*zoom);
  cvInner.style.width = w+'px'; cvInner.style.height = h+'px';
  gridSvg.setAttribute('width', w); gridSvg.setAttribute('height', h);
  cvSvg.setAttribute('width', w); cvSvg.setAttribute('height', h);
  cvSvg.setAttribute('viewBox', `0 0 ${cvW} ${cvH}`);
  document.getElementById('zoom-label').textContent = Math.round(zoom*100)+'%';
}

function setZoom(z) {
  const prev = zoom; zoom = Math.max(0.15, Math.min(4, z));
  const cx = cvScroll.scrollLeft + cvScroll.clientWidth/2;
  const cy = cvScroll.scrollTop  + cvScroll.clientHeight/2;
  applyCvSize();
  const r = zoom/prev;
  cvScroll.scrollLeft = cx*r - cvScroll.clientWidth/2;
  cvScroll.scrollTop  = cy*r - cvScroll.clientHeight/2;
}

/* ── 메인 렌더 ── */
function render() {
  cvSvg.innerHTML = ''; cvSvg.appendChild(svgDefs);
  if (!svgDefs.querySelector('#sel-shadow')) {
    const f = ns('filter', { id:'sel-shadow', x:'-20%', y:'-20%', width:'140%', height:'140%' });
    f.appendChild(ns('feDropShadow', { dx:'0', dy:'0', stdDeviation:'2.5', 'flood-color':'#2563eb', 'flood-opacity':'0.55' }));
    svgDefs.appendChild(f);
  }
  objects.forEach(o => {
    const el = makeEl(o); if (!el) return;
    el.dataset.oid = o.id;
    if (o.id === selId) el.setAttribute('filter', 'url(#sel-shadow)');
    cvSvg.appendChild(el);
  });
  if (selId) { const o = getObj(selId); if (o) drawHandles(o); }
  updateSB();
}

function makeEl(o) {
  const op = o.opacity ?? 1; let el;
  if (o.type==='circle')
    el = ns('circle', { cx:o.cx, cy:o.cy, r:o.r, fill:fillColor(o), stroke:o.stroke, 'stroke-width':o.sw, opacity:op });
  else if (o.type==='ellipse')
    el = ns('ellipse', { cx:o.cx, cy:o.cy, rx:o.rx, ry:o.ry, fill:fillColor(o), stroke:o.stroke, 'stroke-width':o.sw, opacity:op });
  else if (o.type==='rect')
    el = ns('rect', { x:o.x, y:o.y, width:o.w, height:o.h, rx:o.rx??3, fill:fillColor(o), stroke:o.stroke, 'stroke-width':o.sw, opacity:op });
  else if (o.type==='polyline')
    el = ns('polyline', { points:(o.points||[]).map(p => `${p[0]},${p[1]}`).join(' '), fill:'none', stroke:o.stroke, 'stroke-width':o.sw, 'stroke-dasharray':o.dash==='dashed'?'8,5':o.dash==='dotted'?'2,5':'none', 'stroke-linecap':'round', 'stroke-linejoin':'round', opacity:op });
  else if (o.type==='bezier')
    el = ns('path', { d:bezierPath(o.points||[]), fill:'none', stroke:o.stroke, 'stroke-width':o.sw, 'stroke-dasharray':o.dash==='dashed'?'8,5':o.dash==='dotted'?'2,5':'none', 'stroke-linecap':'round', 'stroke-linejoin':'round', opacity:op });
  else if (o.type==='quadratic')
    el = ns('path', { d:quadraticPath(o), fill:'none', stroke:o.stroke, 'stroke-width':o.sw, 'stroke-dasharray':o.dash==='dashed'?'8,5':o.dash==='dotted'?'2,5':'none', 'stroke-linecap':'round', 'stroke-linejoin':'round', opacity:op });
  else if (o.type==='cubic')
    el = ns('path', { d:cubicPath(o), fill:'none', stroke:o.stroke, 'stroke-width':o.sw, 'stroke-dasharray':o.dash==='dashed'?'8,5':o.dash==='dotted'?'2,5':'none', 'stroke-linecap':'round', 'stroke-linejoin':'round', opacity:op });
  else if (o.type==='arc')
    el = ns('path', { d:arcPath(o), fill:'none', stroke:o.stroke, 'stroke-width':o.sw, 'stroke-dasharray':o.dash==='dashed'?'8,5':o.dash==='dotted'?'2,5':'none', 'stroke-linecap':'round', 'stroke-linejoin':'round', opacity:op });
  else if (o.type==='polygon')
    el = ns('polygon', { points:(o.points||[]).map(p => `${p[0]},${p[1]}`).join(' '), fill:fillColor(o), stroke:o.stroke, 'stroke-width':o.sw, 'stroke-dasharray':o.dash==='dashed'?'8,5':o.dash==='dotted'?'2,5':'none', 'stroke-linecap':'round', 'stroke-linejoin':'round', opacity:op });
  else if (isLine(o)) {
    const dash = o.dash==='dashed'?'8,5':o.dash==='dotted'?'2,5':'none';
    const me = (o.arrow==='end'||o.arrow==='both') ? marker(o.stroke) : 'none';
    const ms = (o.arrow==='start'||o.arrow==='both') ? marker(o.stroke) : 'none';
    el = ns('line', { x1:o.x1, y1:o.y1, x2:o.x2, y2:o.y2, stroke:o.stroke, 'stroke-width':o.sw, 'stroke-dasharray':dash, 'stroke-linecap':'round', 'marker-end':me, 'marker-start':ms, opacity:op });
  } else if (o.type==='text') {
    el = ns('text', { x:o.x, y:o.y, 'font-size':o.fs||14, fill:o.tc||'#1a1a18', 'font-weight':o.bold?'700':'400', 'font-style':o.italic?'italic':'normal', 'text-anchor':o.align||'middle', 'dominant-baseline':'central', 'font-family':"'Pretendard','Apple SD Gothic Neo',sans-serif", opacity:op });
    const parts = richSegments(o.text || '');
    if (!parts.some(p => p.kind !== 'base')) el.textContent = o.text || '';
    else {
      parts.forEach(part => {
        const t = ns('tspan', {});
        if (part.kind === 'sub') {
          t.setAttribute('baseline-shift', '-22%');
          t.setAttribute('font-size', `${((o.fs||14) * 0.68).toFixed(1)}px`);
          t.setAttribute('dx', `${-((o.fs||14) * 0.18).toFixed(1)}`);
        }
        t.textContent = part.text;
        el.appendChild(t);
      });
    }
  } else if (o.type==='image') {
    el = ns('image', { x:o.x, y:o.y, width:o.w, height:o.h, href:o.href, preserveAspectRatio:'xMidYMid meet', opacity:op });
  }
  return el || null;
}

function drawHandles(o) {
  const bb = bbox(o); if (!bb) return;
  const pad = 6;
  cvSvg.appendChild(ns('rect', { x:bb.x-pad, y:bb.y-pad, width:bb.w+pad*2, height:bb.h+pad*2, fill:'none', stroke:'#2563eb', 'stroke-width':'1', 'stroke-dasharray':'5,3', rx:'4', 'pointer-events':'none' }));
  if (isLine(o)) {
    [['l1',o.x1,o.y1],['l2',o.x2,o.y2]].forEach(([hid,hx,hy]) => {
      cvSvg.appendChild(ns('circle', { cx:hx, cy:hy, r:HANDLE_R, fill:'#fff', stroke:'#2563eb', 'stroke-width':'1.5', cursor:'move', 'data-handle':hid, 'data-oid':o.id }));
    });
  } else if (o.type==='quadratic') {
    cvSvg.appendChild(ns('line', { x1:o.x1, y1:o.y1, x2:o.cx1, y2:o.cy1, stroke:'#60a5fa', 'stroke-width':'1', 'stroke-dasharray':'4,3', 'pointer-events':'none' }));
    cvSvg.appendChild(ns('line', { x1:o.cx1, y1:o.cy1, x2:o.x2, y2:o.y2, stroke:'#60a5fa', 'stroke-width':'1', 'stroke-dasharray':'4,3', 'pointer-events':'none' }));
    [['q1',o.x1,o.y1],['qc',o.cx1,o.cy1],['q2',o.x2,o.y2]].forEach(([hid,hx,hy]) => {
      cvSvg.appendChild(ns('circle', { cx:hx, cy:hy, r:HANDLE_R, fill:hid==='qc'?'#dbeafe':'#fff', stroke:'#2563eb', 'stroke-width':'1.5', cursor:'move', 'data-handle':hid, 'data-oid':o.id }));
    });
  } else if (o.type==='cubic') {
    cvSvg.appendChild(ns('line', { x1:o.x1, y1:o.y1, x2:o.cx1, y2:o.cy1, stroke:'#60a5fa', 'stroke-width':'1', 'stroke-dasharray':'4,3', 'pointer-events':'none' }));
    cvSvg.appendChild(ns('line', { x1:o.cx2, y1:o.cy2, x2:o.x2, y2:o.y2, stroke:'#60a5fa', 'stroke-width':'1', 'stroke-dasharray':'4,3', 'pointer-events':'none' }));
    [['c1',o.x1,o.y1],['cc1',o.cx1,o.cy1],['cc2',o.cx2,o.cy2],['c2',o.x2,o.y2]].forEach(([hid,hx,hy]) => {
      cvSvg.appendChild(ns('circle', { cx:hx, cy:hy, r:HANDLE_R, fill:hid.startsWith('cc')?'#dbeafe':'#fff', stroke:'#2563eb', 'stroke-width':'1.5', cursor:'move', 'data-handle':hid, 'data-oid':o.id }));
    });
  } else {
    const hx = [bb.x-pad, bb.x+bb.w/2, bb.x+bb.w+pad];
    const hy = [bb.y-pad, bb.y+bb.h/2, bb.y+bb.h+pad];
    const cur = { tl:'nwse-resize',tc:'ns-resize',tr:'nesw-resize',mr:'ew-resize',br:'nwse-resize',bc:'ns-resize',bl:'nesw-resize',ml:'ew-resize' };
    const pts = { tl:[0,0],tc:[1,0],tr:[2,0],mr:[2,1],br:[2,2],bc:[1,2],bl:[0,2],ml:[0,1] };
    HANDLE_IDS.forEach(hid => {
      const [xi,yi] = pts[hid];
      cvSvg.appendChild(ns('rect', { x:hx[xi]-HANDLE_R, y:hy[yi]-HANDLE_R, width:HANDLE_R*2, height:HANDLE_R*2, rx:2, fill:'#fff', stroke:'#2563eb', 'stroke-width':'1.5', cursor:cur[hid], 'data-handle':hid, 'data-oid':o.id }));
    });
  }
}

/* ── 좌표 변환 ── */
function svgPt(e) {
  const r = cvSvg.getBoundingClientRect();
  return { x: (e.clientX-r.left)/zoom, y: (e.clientY-r.top)/zoom };
}

/* ── 상태바 ── */
function updateSB() {
  document.getElementById('sb-cnt').textContent = `오브젝트: ${objects.length}  캔버스: ${Math.round(cvW)}×${Math.round(cvH)}`;
  document.getElementById('sb-sel').textContent = selId ? `선택: id=${selId}` : '선택: 없음';
}
