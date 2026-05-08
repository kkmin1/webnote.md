/**
 * tools.js — 도구 동작, 포인터 이벤트, 오른쪽 패널
 */

const txtInp = document.getElementById('txt-inp');
const TOOL_LABEL = { select:'선택', text:'텍스트', circle:'원', ellipse:'타원', rect:'사각형', line:'직선', arrow:'화살표', dashed:'점선', 'dashed-arrow':'점선↗', bidir:'양방향', freehand:'자유곡선', quadratic:'2차곡선', cubic:'3차곡선' };
const TYPE_NAME  = { circle:'원', ellipse:'타원', arc:'호', rect:'사각형', line:'직선', arrow:'화살표', dashed:'점선', 'dashed-arrow':'점선↗', bidir:'양방향', text:'텍스트', image:'이미지', polyline:'연속선', polygon:'다각형', freehand:'자유곡선', bezier:'스플라인', quadratic:'2차곡선', cubic:'3차곡선' };

function defaultQuadraticControl(p0, p) {
  const mx = (p0.x + p.x) / 2;
  const my = (p0.y + p.y) / 2;
  const dx = p.x - p0.x;
  const dy = p.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const bend = Math.max(30, len * 0.25);
  return { x: mx + nx * bend, y: my + ny * bend };
}

function defaultCubicControls(p0, p) {
  const dx = p.x - p0.x;
  const dy = p.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const bend = Math.max(24, len * 0.18);
  return {
    c1x: p0.x + dx / 3 + nx * bend,
    c1y: p0.y + dy / 3 + ny * bend,
    c2x: p0.x + dx * 2 / 3 - nx * bend,
    c2y: p0.y + dy * 2 / 3 - ny * bend,
  };
}

function resizeBoxFromHandle(snap, h, dx, dy) {
  let x = snap.x, y = snap.y, w = snap.w, sh = snap.h;
  if(h==='tl'){x=snap.x+dx;y=snap.y+dy;w=snap.w-dx;sh=snap.h-dy;}
  if(h==='tc'){y=snap.y+dy;sh=snap.h-dy;}
  if(h==='tr'){y=snap.y+dy;w=snap.w+dx;sh=snap.h-dy;}
  if(h==='mr'){w=snap.w+dx;}
  if(h==='br'){w=snap.w+dx;sh=snap.h+dy;}
  if(h==='bc'){sh=snap.h+dy;}
  if(h==='bl'){x=snap.x+dx;w=snap.w-dx;sh=snap.h+dy;}
  if(h==='ml'){x=snap.x+dx;w=snap.w-dx;}
  return { x, y, w: Math.max(4, w), h: Math.max(4, sh) };
}

function scalePointInBox(px, py, from, to) {
  const sx = from.w ? (px - from.x) / from.w : 0.5;
  const sy = from.h ? (py - from.y) / from.h : 0.5;
  return {
    x: to.x + sx * to.w,
    y: to.y + sy * to.h,
  };
}

function scalePointShape(o, snap, h, dx, dy) {
  const bb = bbox(snap);
  if (!bb) return;
  const next = resizeBoxFromHandle(bb, h, dx, dy);
  o.points = (snap.points || []).map(([x, y]) => {
    const p = scalePointInBox(x, y, bb, next);
    return [p.x, p.y];
  });
}

function scaleArcShape(o, snap, h, dx, dy) {
  const bb = bbox(snap);
  if (!bb) return;
  const next = resizeBoxFromHandle(bb, h, dx, dy);
  o.cx = next.x + next.w / 2;
  o.cy = next.y + next.h / 2;
  o.rx = next.w / 2;
  o.ry = next.h / 2;
}

/* ── 도구 전환 ── */
function switchTool(t) {
  tool = t;
  document.querySelectorAll('.ti').forEach(x => x.classList.remove('on'));
  document.querySelector(`.ti[data-tool="${t}"]`)?.classList.add('on');
  cvEl.style.cursor = t==='select' ? 'default' : t==='text' ? 'text' : 'crosshair';
  document.getElementById('sb-tool').textContent = '도구: ' + (TOOL_LABEL[t] || t);
}

/* ── 포인터 이벤트 ── */
cvSvg.addEventListener('pointerdown', onDown);
cvSvg.addEventListener('pointermove', onMove);
cvSvg.addEventListener('pointerup',   onUp);
cvSvg.addEventListener('dblclick',    onDbl);

function onDown(e) {
  if (e.button !== 0) return;
  cvSvg.setPointerCapture(e.pointerId);
  const p = svgPt(e);

  if (tool === 'select') {
    const hEl = e.target.closest('[data-handle]');
    if (hEl) {
      dragMode = 'handle'; activeHandle = hEl.getAttribute('data-handle');
      dragP0 = p; dragSnap = JSON.parse(JSON.stringify(getObj(selId)));
      saveState(); return;
    }
    const hit = hitTest(p.x, p.y);
    if (hit) {
      selId = hit.id; dragMode = 'move'; dragP0 = p;
      dragSnap = JSON.parse(JSON.stringify(hit)); saveState();
      render(); syncProps();
    } else { selId = null; render(); syncProps(); }
    return;
  }
  if (tool === 'text') { openTextInput(e.clientX, e.clientY, p.x, p.y, null); return; }

  drawing = true; drawP0 = p; saveState();
  drawObj = makeNewObj(tool, p); objects.push(drawObj); render();
}

function onMove(e) {
  const p = svgPt(e);
  document.getElementById('sb-xy').textContent = `x:${Math.round(p.x)} y:${Math.round(p.y)}`;
  if (dragMode==='handle' && dragSnap && selId) { const o=getObj(selId); if(o) applyHandle(o,dragSnap,activeHandle,p); render(); syncProps(); return; }
  if (dragMode==='move'   && dragSnap && selId) { const o=getObj(selId); if(!o) return; copyPos(o,dragSnap); moveObj(o,p.x-dragP0.x,p.y-dragP0.y); render(); syncProps(); return; }
  if (drawing && drawObj) { updateDrawing(drawObj, drawP0, p); render(); }
}

function onUp(e) {
  cvSvg.releasePointerCapture(e.pointerId);
  if (dragMode) { dragMode=null; dragP0=null; dragSnap=null; activeHandle=null; render(); syncProps(); return; }
  if (drawing) {
    drawing = false;
    if (drawObj && isDegenerate(drawObj)) { objects=objects.filter(o=>o.id!==drawObj.id); undoStack.pop(); selId=null; }
    else if (drawObj) { selId=drawObj.id; switchTool('select'); }
    drawObj=null; drawP0=null; render(); syncProps();
  }
}

function onDbl(e) {
  const p = svgPt(e), hit = hitTest(p.x, p.y);
  if (hit && hit.type==='text') openTextInput(e.clientX, e.clientY, hit.x, hit.y, hit);
}

/* ── 핸들 리사이즈 ── */
function applyHandle(o, snap, h, p) {
  const dx=p.x-dragP0.x, dy=p.y-dragP0.y;
  if (isLine(o)) { if(h==='l1'){o.x1=snap.x1+dx;o.y1=snap.y1+dy;}else{o.x2=snap.x2+dx;o.y2=snap.y2+dy;} return; }
  if (o.type==='quadratic') {
    if (h==='q1') { o.x1=snap.x1+dx; o.y1=snap.y1+dy; }
    if (h==='qc') { o.cx1=snap.cx1+dx; o.cy1=snap.cy1+dy; }
    if (h==='q2') { o.x2=snap.x2+dx; o.y2=snap.y2+dy; }
    return;
  }
  if (o.type==='cubic') {
    if (h==='c1') { o.x1=snap.x1+dx; o.y1=snap.y1+dy; }
    if (h==='cc1') { o.cx1=snap.cx1+dx; o.cy1=snap.cy1+dy; }
    if (h==='cc2') { o.cx2=snap.cx2+dx; o.cy2=snap.cy2+dy; }
    if (h==='c2') { o.x2=snap.x2+dx; o.y2=snap.y2+dy; }
    return;
  }
  if (o.type==='polyline' || o.type==='polygon' || o.type==='bezier') { scalePointShape(o, snap, h, dx, dy); return; }
  if (o.type==='arc') { scaleArcShape(o, snap, h, dx, dy); return; }
  if (o.type==='rect'||o.type==='image') {
    let{x,y,w,h:sh}=resizeBoxFromHandle({x:snap.x,y:snap.y,w:snap.w,h:snap.h},h,dx,dy);
    o.x=x;o.y=y;o.w=Math.max(4,w);o.h=Math.max(4,sh); return;
  }
  if (o.type==='circle') { o.r=Math.max(4,Math.max(Math.abs(p.x-snap.cx),Math.abs(p.y-snap.cy))); return; }
  if (o.type==='ellipse') {
    if(h==='ml'||h==='mr') o.rx=Math.max(4,Math.abs(p.x-snap.cx));
    else if(h==='tc'||h==='bc') o.ry=Math.max(4,Math.abs(p.y-snap.cy));
    else{o.rx=Math.max(4,Math.abs(p.x-snap.cx));o.ry=Math.max(4,Math.abs(p.y-snap.cy));}
  }
}

/* ── 오브젝트 팩토리 ── */
function makeNewObj(type, p) {
  const id=uid();
  const base={id,type,stroke:D.stroke,sw:D.sw,fill:D.fill,fillNone:D.fillNone,fillOpacity:D.fillOpacity,opacity:1};
  if(type==='circle')       return{...base,cx:p.x,cy:p.y,r:2};
  if(type==='ellipse')      return{...base,cx:p.x,cy:p.y,rx:2,ry:2};
  if(type==='rect')         return{...base,x:p.x,y:p.y,w:2,h:2,rx:3};
  if(type==='freehand')     return{id,type:'polyline',points:[[p.x,p.y]],stroke:D.stroke,sw:D.sw,dash:'none',arrow:'none',opacity:1};
  if(type==='quadratic')    return{id,type:'quadratic',x1:p.x,y1:p.y,cx1:p.x,cy1:p.y,x2:p.x,y2:p.y,stroke:D.stroke,sw:D.sw,dash:'none',opacity:1};
  if(type==='cubic')        return{id,type:'cubic',x1:p.x,y1:p.y,cx1:p.x,cy1:p.y,cx2:p.x,cy2:p.y,x2:p.x,y2:p.y,stroke:D.stroke,sw:D.sw,dash:'none',opacity:1};
  if(type==='line')         return{...base,x1:p.x,y1:p.y,x2:p.x,y2:p.y,arrow:'none',dash:'none'};
  if(type==='arrow')        return{...base,x1:p.x,y1:p.y,x2:p.x,y2:p.y,arrow:'end',dash:'none'};
  if(type==='dashed')       return{...base,x1:p.x,y1:p.y,x2:p.x,y2:p.y,arrow:'none',dash:'dashed'};
  if(type==='dashed-arrow') return{...base,x1:p.x,y1:p.y,x2:p.x,y2:p.y,arrow:'end',dash:'dashed'};
  if(type==='bidir')        return{...base,x1:p.x,y1:p.y,x2:p.x,y2:p.y,arrow:'both',dash:'none'};
  return base;
}
function updateDrawing(o,p0,p){
  if(o.type==='circle')  o.r=Math.max(2,Math.hypot(p.x-p0.x,p.y-p0.y));
  if(o.type==='ellipse'){o.cx=(p0.x+p.x)/2;o.cy=(p0.y+p.y)/2;o.rx=Math.max(2,Math.abs(p.x-p0.x)/2);o.ry=Math.max(2,Math.abs(p.y-p0.y)/2);}
  if(o.type==='rect'){o.x=Math.min(p0.x,p.x);o.y=Math.min(p0.y,p.y);o.w=Math.max(2,Math.abs(p.x-p0.x));o.h=Math.max(2,Math.abs(p.y-p0.y));}
  if(o.type==='polyline'){
    const pts=o.points||[];
    const last=pts[pts.length-1];
    if(!last || Math.hypot(p.x-last[0], p.y-last[1]) >= 2) pts.push([p.x,p.y]);
    o.points=pts;
  }
  if(o.type==='quadratic'){
    const c=defaultQuadraticControl(p0,p);
    o.x2=p.x; o.y2=p.y; o.cx1=c.x; o.cy1=c.y;
  }
  if(o.type==='cubic'){
    const c=defaultCubicControls(p0,p);
    o.x2=p.x; o.y2=p.y; o.cx1=c.c1x; o.cy1=c.c1y; o.cx2=c.c2x; o.cy2=c.c2y;
  }
  if(isLine(o)){o.x2=p.x;o.y2=p.y;}
}
function isDegenerate(o){
  if(o.type==='circle')  return o.r<5;
  if(o.type==='ellipse') return o.rx<5||o.ry<5;
  if(o.type==='rect')    return o.w<5||o.h<5;
  if(o.type==='polyline'){
    const pts=o.points||[];
    if(pts.length<2) return true;
    let len=0;
    for(let i=1;i<pts.length;i++) len+=Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]);
    return len<8;
  }
  if(o.type==='quadratic') return Math.hypot(o.x2-o.x1,o.y2-o.y1)<8;
  if(o.type==='cubic')     return Math.hypot(o.x2-o.x1,o.y2-o.y1)<8;
  if(isLine(o))          return Math.hypot(o.x2-o.x1,o.y2-o.y1)<8;
  return false;
}

/* ── 텍스트 편집 ── */
function openTextInput(cx,cy,svgX,svgY,editObj){
  const r=cvScroll.getBoundingClientRect();
  txtInp.style.left=(cx-r.left+cvScroll.scrollLeft)+'px';
  txtInp.style.top=(cy-r.top+cvScroll.scrollTop-14)+'px';
  txtInp.style.display='block'; txtInp.value=editObj?editObj.text:''; txtInp.focus();
  txtCtx={x:svgX,y:svgY,editId:editObj?editObj.id:null};
  if(editObj){objects=objects.filter(o=>o.id!==editObj.id);render();}
}
txtInp.addEventListener('keydown',e=>{
  e.stopPropagation();
  if(e.key==='Enter'){e.preventDefault();commitText();}
  if(e.key==='Escape'){txtInp.style.display='none';txtCtx=null;}
});
document.addEventListener('pointerdown',e=>{if(txtCtx&&e.target!==txtInp)commitText();},true);
function commitText(){
  if(!txtCtx)return;
  const v=(txtInp.value||'').trim();
  if(v){saveState();const id=txtCtx.editId||uid();objects.push({id,type:'text',x:txtCtx.x,y:txtCtx.y,text:v,fs:D.fs,tc:D.tc,bold:false,italic:false,align:'middle',opacity:1});selId=id;}
  txtInp.style.display='none';txtCtx=null;switchTool('select');render();syncProps();
}

/* ── 오른쪽 패널 동기화 ── */
function syncProps(){
  const o=selId?getObj(selId):null;
  document.getElementById('r-nosel').style.display=o?'none':'';
  document.getElementById('r-sel').style.display=o?'block':'none';
  if(!o)return;
  document.getElementById('r-badge').textContent=TYPE_NAME[o.type]||o.type;
  const isText=o.type==='text',isL=isLine(o)||o.type==='polyline'||o.type==='bezier'||o.type==='quadratic'||o.type==='cubic',isImg=o.type==='image';
  document.getElementById('r-line-sec').style.display=(isText||isImg)?'none':'';
  document.getElementById('r-fill-sec').style.display=(isText||isL||isImg)?'none':'';
  document.getElementById('r-obj-op-sec').style.display=isText?'none':'';
  document.getElementById('r-text-sec').style.display=isText?'':'none';

  if(!isText&&!isImg){
    setV('r-stroke',o.stroke||'#2c2c2a');setV('r-sw',o.sw||1.5);
    document.getElementById('r-sw-v').textContent=o.sw||1.5;
    ['r-solid','r-dashed','r-dotted'].forEach(id=>document.getElementById(id).classList.remove('on'));
    setOn(o.dash==='dashed'?'r-dashed':o.dash==='dotted'?'r-dotted':'r-solid');
    ['r-no-arr','r-end-arr','r-both-arr'].forEach(id=>document.getElementById(id).classList.remove('on'));
    setOn(o.arrow==='end'?'r-end-arr':o.arrow==='both'?'r-both-arr':'r-no-arr');
  }
  if(!isText&&!isL&&!isImg){
    setV('r-fill',(o.fill&&o.fill!=='none')?o.fill:'#ffffff');
    document.getElementById('r-fnone').classList.toggle('on',!!o.fillNone);
    const fop=o.fillOpacity??100;setV('r-fill-op',fop);document.getElementById('r-fill-op-v').textContent=fop;
  }
  const op=Math.round((o.opacity??1)*100);setV('r-op',op);document.getElementById('r-op-v').textContent=op;

  if(isText){
    setV('r-txt',o.text||'');setV('r-fs',o.fs||14);setV('r-tc',o.tc||'#1a1a18');
    document.getElementById('r-bold').classList.toggle('on',!!o.bold);
    document.getElementById('r-italic').classList.toggle('on',!!o.italic);
    ['r-al-m','r-al-s','r-al-e'].forEach(id=>document.getElementById(id).classList.toggle('on',document.getElementById(id).dataset.align===(o.align||'middle')));
  }
  document.getElementById('r-wh-row').style.display=isText?'none':'';
  const bb=bbox(o);
  if(o.type==='circle'||o.type==='ellipse'||o.type==='arc'){setV('r-x',Math.round(o.cx));setV('r-y',Math.round(o.cy));}
  else if(isLine(o)){setV('r-x',Math.round(o.x1));setV('r-y',Math.round(o.y1));}
  else if(o.type==='quadratic'||o.type==='cubic'||o.type==='polyline'||o.type==='bezier'||o.type==='polygon'){setV('r-x',Math.round(bb.x));setV('r-y',Math.round(bb.y));}
  else{setV('r-x',Math.round(o.x));setV('r-y',Math.round(o.y));}
  if(bb&&!isText){setV('r-w',Math.round(bb.w));setV('r-h',Math.round(bb.h));}
}
function setV(id,v){const el=document.getElementById(id);if(el)el.value=v;}
function setOn(id){document.getElementById(id)?.classList.add('on');}

function pc(fn){const o=selId?getObj(selId):null;if(!o)return;fn(o);render();syncProps();}

/* ── 패널 이벤트 ── */
document.getElementById('r-stroke').addEventListener('input',e=>pc(o=>o.stroke=e.target.value));
document.getElementById('r-sw').addEventListener('input',e=>{const v=parseFloat(e.target.value);document.getElementById('r-sw-v').textContent=v;pc(o=>o.sw=v);});
document.getElementById('r-solid').addEventListener('click',()=>pc(o=>o.dash='none'));
document.getElementById('r-dashed').addEventListener('click',()=>pc(o=>o.dash='dashed'));
document.getElementById('r-dotted').addEventListener('click',()=>pc(o=>o.dash='dotted'));
document.getElementById('r-no-arr').addEventListener('click',()=>pc(o=>o.arrow='none'));
document.getElementById('r-end-arr').addEventListener('click',()=>pc(o=>o.arrow='end'));
document.getElementById('r-both-arr').addEventListener('click',()=>pc(o=>o.arrow='both'));
document.getElementById('r-fill').addEventListener('input',e=>pc(o=>{o.fill=e.target.value;o.fillNone=false;}));
document.getElementById('r-fnone').addEventListener('click',()=>pc(o=>o.fillNone=!o.fillNone));
document.getElementById('r-fill-op').addEventListener('input',e=>{const v=parseInt(e.target.value);document.getElementById('r-fill-op-v').textContent=v;pc(o=>o.fillOpacity=v);});
document.getElementById('r-op').addEventListener('input',e=>{const v=parseInt(e.target.value);document.getElementById('r-op-v').textContent=v;pc(o=>o.opacity=v/100);});
document.getElementById('r-txt').addEventListener('input',e=>pc(o=>o.text=e.target.value));
document.getElementById('r-fs').addEventListener('input',e=>pc(o=>o.fs=parseInt(e.target.value)||14));
document.getElementById('r-tc').addEventListener('input',e=>pc(o=>o.tc=e.target.value));
document.getElementById('r-bold').addEventListener('click',()=>pc(o=>o.bold=!o.bold));
document.getElementById('r-italic').addEventListener('click',()=>pc(o=>o.italic=!o.italic));
['r-al-m','r-al-s','r-al-e'].forEach(id=>document.getElementById(id).addEventListener('click',()=>pc(o=>o.align=document.getElementById(id).dataset.align)));
document.getElementById('r-x').addEventListener('change',e=>pc(o=>{const v=parseInt(e.target.value)||0;if(o.type==='circle'||o.type==='ellipse'||o.type==='arc')o.cx=v;else if(isLine(o)){const d=v-o.x1;o.x1=v;o.x2+=d;}else if(o.type==='quadratic'||o.type==='cubic'){const bb=bbox(o); moveObj(o,v-bb.x,0);}else if(o.type==='polyline'||o.type==='polygon'||o.type==='bezier'){const bb=bbox(o); const d=v-bb.x; o.points=o.points.map(([x,y])=>[x+d,y]);}else o.x=v;}));
document.getElementById('r-y').addEventListener('change',e=>pc(o=>{const v=parseInt(e.target.value)||0;if(o.type==='circle'||o.type==='ellipse'||o.type==='arc')o.cy=v;else if(isLine(o)){const d=v-o.y1;o.y1=v;o.y2+=d;}else if(o.type==='quadratic'||o.type==='cubic'){const bb=bbox(o); moveObj(o,0,v-bb.y);}else if(o.type==='polyline'||o.type==='polygon'||o.type==='bezier'){const bb=bbox(o); const d=v-bb.y; o.points=o.points.map(([x,y])=>[x,y+d]);}else o.y=v;}));
document.getElementById('r-w').addEventListener('change',e=>pc(o=>{const v=Math.max(4,parseInt(e.target.value)||4);if(o.type==='circle')o.r=v/2;else if(o.type==='ellipse'||o.type==='arc')o.rx=v/2;else if(o.type==='rect'||o.type==='image')o.w=v;else if(isLine(o))o.x2=o.x1+v;}));
document.getElementById('r-h').addEventListener('change',e=>pc(o=>{const v=Math.max(4,parseInt(e.target.value)||4);if(o.type==='circle')o.r=v/2;else if(o.type==='ellipse'||o.type==='arc')o.ry=v/2;else if(o.type==='rect'||o.type==='image')o.h=v;else if(isLine(o))o.y2=o.y1+v;}));
document.getElementById('r-del').addEventListener('click',()=>{if(!selId)return;saveState();objects=objects.filter(o=>o.id!==selId);selId=null;render();syncProps();});
