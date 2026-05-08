/**
 * app.js — 초기화, 전역 이벤트, 키보드 단축키
 * 로드 순서: state → render → tools → io → app
 */

/* ── 툴바 버튼 ── */
document.getElementById('btn-undo').addEventListener('click', undo);
document.getElementById('btn-redo').addEventListener('click', redo);
document.getElementById('btn-copy').addEventListener('click', () => { if (selId) clipboard = JSON.parse(JSON.stringify(getObj(selId))); });
document.getElementById('btn-paste').addEventListener('click', () => {
  if (!clipboard) return; saveState();
  const n = JSON.parse(JSON.stringify(clipboard)); n.id = uid(); moveObj(n, 16, 16);
  objects.push(n); selId = n.id; render(); syncProps();
});
document.getElementById('btn-front').addEventListener('click', () => {
  if (!selId) return; saveState();
  const i = objects.findIndex(o => o.id === selId);
  if (i < objects.length-1) { const o = objects.splice(i,1)[0]; objects.push(o); }
  render();
});
document.getElementById('btn-back').addEventListener('click', () => {
  if (!selId) return; saveState();
  const i = objects.findIndex(o => o.id === selId);
  if (i > 0) { const o = objects.splice(i,1)[0]; objects.unshift(o); }
  render();
});
document.getElementById('btn-clear').addEventListener('click', () => {
  if (!objects.length) return;
  if (!confirm('모든 오브젝트를 삭제하시겠습니까?')) return;
  saveState(); objects = []; selId = null; render(); syncProps();
});

/* ── 기본 스타일 패널 ── */
document.getElementById('d-stroke').addEventListener('input', e => D.stroke = e.target.value);
document.getElementById('d-fill').addEventListener('input', e => {
  D.fill = e.target.value; D.fillNone = false;
  document.getElementById('d-fnone').classList.remove('on');
});
document.getElementById('d-fnone').addEventListener('click', () => {
  D.fillNone = !D.fillNone;
  document.getElementById('d-fnone').classList.toggle('on', D.fillNone);
});
document.getElementById('d-fill-op').addEventListener('input', e => {
  D.fillOpacity = parseInt(e.target.value);
  document.getElementById('d-fill-op-v').textContent = e.target.value;
});
document.getElementById('d-sw').addEventListener('input', e => {
  D.sw = parseFloat(e.target.value);
  document.getElementById('d-sw-v').textContent = D.sw;
});
document.getElementById('d-tc').addEventListener('input', e => D.tc = e.target.value);
document.getElementById('d-fs').addEventListener('input', e => D.fs = parseInt(e.target.value) || 14);

/* ── 도구 버튼 ── */
document.querySelectorAll('.ti').forEach(t => t.addEventListener('click', () => switchTool(t.dataset.tool)));

/* ── 줌 ── */
document.getElementById('zoom-in').addEventListener('click',    () => setZoom(zoom * 1.25));
document.getElementById('zoom-out').addEventListener('click',   () => setZoom(zoom / 1.25));
document.getElementById('zoom-reset').addEventListener('click', () => setZoom(1));
document.getElementById('zoom-fit').addEventListener('click', () => {
  setZoom(Math.min(cvScroll.clientWidth/cvW, cvScroll.clientHeight/cvH) * 0.95);
  cvScroll.scrollLeft = 0; cvScroll.scrollTop = 0;
});
cvScroll.addEventListener('wheel', e => {
  if (!e.ctrlKey) return; e.preventDefault();
  setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1/1.1));
}, { passive: false });

/* ── 캔버스 리사이즈 핸들 ── */
(function() {
  const h = document.getElementById('cv-resize-handle');
  let active=false, r0=null, w0=0, h0=0;
  h.addEventListener('pointerdown', e => { e.stopPropagation(); active=true; r0={x:e.clientX,y:e.clientY}; w0=cvW; h0=cvH; h.setPointerCapture(e.pointerId); });
  h.addEventListener('pointermove', e => { if(!active)return; cvW=Math.max(400,w0+(e.clientX-r0.x)/zoom); cvH=Math.max(300,h0+(e.clientY-r0.y)/zoom); applyCvSize(); updateSB(); });
  h.addEventListener('pointerup', () => { active=false; });
})();

/* ── 사이드바 리사이저 ── */
function makePanelResizer(rzId, panelId, side) {
  const rz=document.getElementById(rzId), panel=document.getElementById(panelId);
  let active=false, x0=0, w0=0;
  rz.addEventListener('pointerdown', e => { active=true; x0=e.clientX; w0=panel.offsetWidth; rz.classList.add('dragging'); rz.setPointerCapture(e.pointerId); });
  rz.addEventListener('pointermove', e => { if(!active)return; const dx=e.clientX-x0; const nw=side==='left'?w0+dx:w0-dx; panel.style.width=Math.max(140,Math.min(380,nw))+'px'; syncPanelHeight(); });
  rz.addEventListener('pointerup', () => { active=false; rz.classList.remove('dragging'); });
}
makePanelResizer('resizer-l','lpanel','left');
makePanelResizer('resizer-r','rpanel','right');

/* ── 패널 높이 동기화 ── */
function syncPanelHeight() {
  const h = document.getElementById('main').offsetHeight;
  document.querySelectorAll('.panel-scroll').forEach(el => { el.style.height=h+'px'; el.style.maxHeight=h+'px'; });
}

/* ── 키보드 단축키 ── */
const TOOL_KEYS = { s:'select', v:'select', t:'text', c:'circle', e:'ellipse', r:'rect', l:'line', a:'arrow', d:'dashed', f:'freehand', q:'quadratic', b:'cubic' };
document.addEventListener('keydown', e => {
  if (document.getElementById('txt-inp').style.display !== 'none') return;
  const tag = e.target.tagName;
  if (tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') return;
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl&&e.key==='z'){e.preventDefault();undo();return;}
  if (ctrl&&(e.key==='y'||e.key==='Y')){e.preventDefault();redo();return;}
  if (ctrl&&e.key==='c'){if(selId)clipboard=JSON.parse(JSON.stringify(getObj(selId)));return;}
  if (ctrl&&e.key==='v'){document.getElementById('btn-paste').click();return;}
  if ((e.key==='Delete'||e.key==='Backspace')&&selId){e.preventDefault();saveState();objects=objects.filter(o=>o.id!==selId);selId=null;render();syncProps();return;}
  if (e.key==='Escape'){selId=null;render();syncProps();return;}
  if (!ctrl&&TOOL_KEYS[e.key]){switchTool(TOOL_KEYS[e.key]);return;}
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&selId){
    e.preventDefault(); saveState();
    const dx=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0;
    const dy=e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0;
    const o=getObj(selId); if(o)moveObj(o,dx,dy); render(); syncProps();
  }
});

/* ── 초기화 ── */
(function init() {
  applyCvSize(); render(); syncProps(); updateSB(); syncPanelHeight();
  window.addEventListener('resize', syncPanelHeight);
  if (window.ResizeObserver) new ResizeObserver(syncPanelHeight).observe(document.getElementById('main'));
  console.log('KS 이미지 에디터 초기화 완료');
})();
