/**
 * state.js — 전역 상태 & 데이터 구조
 *
 * 오브젝트 스키마 (공통):
 *   id, type, opacity
 * 도형 공통:
 *   stroke, sw, fill, fillNone, fillOpacity(0~100)
 * 선분:
 *   x1,y1,x2,y2, arrow('none'|'end'|'both'), dash('none'|'dashed'|'dotted')
 * 원:    cx,cy,r
 * 타원:  cx,cy,rx,ry
 * 호:    cx,cy,rx,ry,startAngle,endAngle
 * 사각형: x,y,w,h,rx
 * 텍스트: x,y,text,fs,tc,bold,italic,align
 * 이미지: x,y,w,h,href(base64)
 * 폴리라인: points[[x,y],...], stroke, sw, dash
 * 스플라인: points[[x,y],...], stroke, sw, dash
 * 2차곡선: x1,y1,cx1,cy1,x2,y2, stroke, sw, dash
 * 3차곡선: x1,y1,cx1,cy1,cx2,cy2,x2,y2, stroke, sw, dash
 * 폴리곤: points[[x,y],...], stroke, sw, fill, fillNone, fillOpacity
 */

let objects   = [];
let selId     = null;
let undoStack = [];
let redoStack = [];
let clipboard = null;
let oid       = 0;
let tool      = 'select';

let drawing      = false, drawObj = null, drawP0 = null;
let dragMode     = null, dragP0 = null, dragSnap = null, activeHandle = null;
let txtCtx       = null;

const D = {
  stroke: '#2c2c2a', fill: '#ffffff', fillNone: false, fillOpacity: 100,
  sw: 1.5, tc: '#1a1a18', fs: 14,
};

let cvW = 1600, cvH = 1200, zoom = 1;

/* ── 유틸 ── */
function uid() { return ++oid; }
function isLine(o) { return ['line','arrow','dashed','dashed-arrow','bidir'].includes(o.type); }
function isPointShape(o) { return ['polyline','polygon','bezier'].includes(o.type); }
function isCurveShape(o) { return ['quadratic','cubic'].includes(o.type); }
function getObj(id) { return objects.find(o => o.id === id) || null; }

function bbox(o) {
  if (!o) return null;
  if (o.type === 'circle')  return { x: o.cx-o.r,  y: o.cy-o.r,  w: o.r*2,  h: o.r*2  };
  if (o.type === 'ellipse') return { x: o.cx-o.rx, y: o.cy-o.ry, w: o.rx*2, h: o.ry*2 };
  if (o.type === 'arc')     return { x: o.cx-o.rx, y: o.cy-o.ry, w: o.rx*2, h: o.ry*2 };
  if (o.type === 'rect' || o.type === 'image') return { x: o.x, y: o.y, w: o.w, h: o.h };
  if (o.type === 'quadratic') {
    const xs = [o.x1, o.cx1, o.x2], ys = [o.y1, o.cy1, o.y2];
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs)-Math.min(...xs)||1, h: Math.max(...ys)-Math.min(...ys)||1 };
  }
  if (o.type === 'cubic') {
    const xs = [o.x1, o.cx1, o.cx2, o.x2], ys = [o.y1, o.cy1, o.cy2, o.y2];
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs)-Math.min(...xs)||1, h: Math.max(...ys)-Math.min(...ys)||1 };
  }
  if (isPointShape(o)) {
    const pts = o.points || [];
    if (!pts.length) return null;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs)-Math.min(...xs)||1, h: Math.max(...ys)-Math.min(...ys)||1 };
  }
  if (isLine(o)) return {
    x: Math.min(o.x1,o.x2), y: Math.min(o.y1,o.y2),
    w: Math.abs(o.x2-o.x1)||1, h: Math.abs(o.y2-o.y1)||1,
  };
  if (o.type === 'text') {
    const cw = (o.text||'').length * (o.fs||14) * 0.6;
    return { x: o.x-cw/2, y: o.y-(o.fs||14)*0.6, w: cw, h: (o.fs||14)*1.3 };
  }
  return null;
}

function hitTest(px, py) {
  for (let i = objects.length-1; i >= 0; i--) {
    const o = objects[i], bb = bbox(o);
    if (!bb) continue;
    const p = 5;
    if (px >= bb.x-p && px <= bb.x+bb.w+p && py >= bb.y-p && py <= bb.y+bb.h+p) return o;
  }
  return null;
}

function moveObj(o, dx, dy) {
  if (o.type==='circle'||o.type==='ellipse'||o.type==='arc') { o.cx+=dx; o.cy+=dy; }
  else if (o.type==='rect'||o.type==='image'||o.type==='text') { o.x+=dx; o.y+=dy; }
  else if (o.type==='quadratic') { o.x1+=dx; o.y1+=dy; o.cx1+=dx; o.cy1+=dy; o.x2+=dx; o.y2+=dy; }
  else if (o.type==='cubic') { o.x1+=dx; o.y1+=dy; o.cx1+=dx; o.cy1+=dy; o.cx2+=dx; o.cy2+=dy; o.x2+=dx; o.y2+=dy; }
  else if (isPointShape(o)) { o.points = (o.points || []).map(([x,y]) => [x+dx, y+dy]); }
  else if (isLine(o)) { o.x1+=dx; o.y1+=dy; o.x2+=dx; o.y2+=dy; }
}

function copyPos(dst, src) {
  if (src.type==='circle'||src.type==='ellipse'||src.type==='arc') { dst.cx=src.cx; dst.cy=src.cy; }
  else if (src.type==='rect'||src.type==='image'||src.type==='text') { dst.x=src.x; dst.y=src.y; }
  else if (src.type==='quadratic') { dst.x1=src.x1; dst.y1=src.y1; dst.cx1=src.cx1; dst.cy1=src.cy1; dst.x2=src.x2; dst.y2=src.y2; }
  else if (src.type==='cubic') { dst.x1=src.x1; dst.y1=src.y1; dst.cx1=src.cx1; dst.cy1=src.cy1; dst.cx2=src.cx2; dst.cy2=src.cy2; dst.x2=src.x2; dst.y2=src.y2; }
  else if (isPointShape(src)) { dst.points = JSON.parse(JSON.stringify(src.points || [])); }
  else if (isLine(src)) { dst.x1=src.x1; dst.y1=src.y1; dst.x2=src.x2; dst.y2=src.y2; }
}

/* ── Undo / Redo ── */
function saveState() {
  undoStack.push({ obs: JSON.parse(JSON.stringify(objects)), oid });
  redoStack = [];
  if (undoStack.length > 100) undoStack.shift();
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push({ obs: JSON.parse(JSON.stringify(objects)), oid });
  const s = undoStack.pop(); objects = s.obs; oid = s.oid; selId = null;
  render(); syncProps(); updateSB();
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push({ obs: JSON.parse(JSON.stringify(objects)), oid });
  const s = redoStack.pop(); objects = s.obs; oid = s.oid; selId = null;
  render(); syncProps(); updateSB();
}
