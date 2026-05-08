/**
 * io.js — 파일 저장 / 불러오기 / 내보내기
 *
 * 저장:
 *   .gtree — 편집 가능 JSON (모든 오브젝트 보존)
 *   .svg   — 벡터 이미지
 *   .png   — 래스터 2× 해상도
 *   .jpg   — JPEG (흰 배경)
 *
 * 불러오기:
 *   .gtree      — 편집 재개
 *   PNG / JPG   — 이미지 오브젝트로 삽입
 *   SVG         — 이미지 오브젝트로 삽입
 */

/* ── 타임스탬프 ── */
function ts() {
  const d = new Date();
  return d.getFullYear()
    + String(d.getMonth()+1).padStart(2,'0')
    + String(d.getDate()).padStart(2,'0')
    + '_' + String(d.getHours()).padStart(2,'0')
    + String(d.getMinutes()).padStart(2,'0');
}

/* ── 내보내기용 SVG 복제 ── */
function cloneSvg() {
  const r = cvSvg.getBoundingClientRect();
  const c = cvSvg.cloneNode(true);
  c.setAttribute('width', r.width); c.setAttribute('height', r.height);
  [...c.querySelectorAll('[data-handle]')].forEach(el => el.remove());
  // 선택 박스(점선 테두리) 제거
  [...c.querySelectorAll('rect[stroke-dasharray="5,3"]')].forEach(el => el.remove());
  const bg = document.createElementNS('http://www.w3.org/2000/svg','rect');
  bg.setAttribute('width','100%'); bg.setAttribute('height','100%'); bg.setAttribute('fill','#fff');
  c.insertBefore(bg, c.firstChild);
  return { clone: c, w: r.width, h: r.height };
}

function download(href, name) {
  const a = document.createElement('a'); a.href = href; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

async function saveBlobWithPicker(blob, suggestedName, types, fallbackHref = null) {
  try {
    if (window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({ suggestedName, types });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return false;
    console.warn('save picker failed, falling back to download', err);
  }
  download(fallbackHref || URL.createObjectURL(blob), suggestedName);
  return true;
}

function dataUrlToBlob(dataUrl) {
  const [head, body] = String(dataUrl).split(',', 2);
  const mime = (head.match(/^data:([^;]+)/i) || [null, 'application/octet-stream'])[1];
  const binary = atob(body || '');
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function saveTikzBundleWithPicker(bundle, baseName) {
  if (!bundle.assets.length) {
    const blob = new Blob([bundle.tex], { type:'text/x-tex;charset=utf-8' });
    return saveBlobWithPicker(
      blob,
      `${baseName}.tex`,
      [{ description:'TeX files', accept:{ 'text/x-tex':['.tex'] } }]
    );
  }

  try {
    if (window.showDirectoryPicker) {
      const dir = await window.showDirectoryPicker({ mode:'readwrite' });
      const texHandle = await dir.getFileHandle(`${baseName}.tex`, { create:true });
      const texWritable = await texHandle.createWritable();
      await texWritable.write(new Blob([bundle.tex], { type:'text/x-tex;charset=utf-8' }));
      await texWritable.close();

      for (const asset of bundle.assets) {
        const fileHandle = await dir.getFileHandle(asset.fileName, { create:true });
        const writable = await fileHandle.createWritable();
        await writable.write(dataUrlToBlob(asset.href));
        await writable.close();
      }
      return true;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return false;
    console.warn('directory picker failed, falling back to downloads', err);
  }

  download(
    URL.createObjectURL(new Blob([bundle.tex], { type:'text/x-tex;charset=utf-8' })),
    `${baseName}.tex`
  );
  bundle.assets.forEach(asset => download(asset.href, asset.fileName));
  return true;
}

function texEsc(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/#/g, '\\#')
    .replace(/\$/g, '\\$')
    .replace(/%/g, '\\%')
    .replace(/&/g, '\\&')
    .replace(/_/g, '\\_');
}

function num(v) {
  let s = Number(v).toFixed(2);
  s = s.replace(/\.?0+$/, '');
  return s || '0';
}

function tikzX(x) { return num(x / 40); }
function tikzY(y) { return num((cvH - y) / 40); }

function colorDef(hex, prefix, defs, seen) {
  const raw = String(hex || '').trim();
  if (!raw || raw === 'none') return 'none';
  const h = raw.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return raw;
  const name = `${prefix}${h.toLowerCase()}`;
  const line = `\\definecolor{${name}}{HTML}{${h.toUpperCase()}}`;
  if (!seen.has(line)) {
    seen.add(line);
    defs.push(line);
  }
  return name;
}

function tikzStyle(o, strokeName, extra = []) {
  const parts = [...extra, `draw=${strokeName}`, `line width=${num((o.sw ?? 1.5) / 1.5)}pt`];
  if (o.dash === 'dashed') parts.push('dashed');
  else if (o.dash === 'dotted') parts.push('dotted');
  if (o.arrow === 'end') parts.push('->');
  else if (o.arrow === 'start') parts.push('<-');
  else if (o.arrow === 'both') parts.push('<->');
  if ((o.opacity ?? 1) !== 1) parts.push(`opacity=${num(o.opacity ?? 1)}`);
  return parts.join(', ');
}

function tikzFill(o, fillName) {
  const parts = [];
  if (!o.fillNone && fillName !== 'none') {
    parts.push(`fill=${fillName}`);
    if ((o.fillOpacity ?? 100) < 100) parts.push(`fill opacity=${num((o.fillOpacity ?? 100) / 100)}`);
  }
  return parts;
}

function polyPoints(points, closed = false) {
  let s = (points || []).map(([x, y]) => `(${tikzX(x)}, ${tikzY(y)})`).join(' -- ');
  if (closed) s += ' -- cycle';
  return s;
}

function catmullRomSegments(points) {
  const segs = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i + 2 < points.length ? points[i + 2] : p2;
    segs.push({
      cp1x: p1[0] + (p2[0] - p0[0]) / 6,
      cp1y: p1[1] + (p2[1] - p0[1]) / 6,
      cp2x: p2[0] - (p3[0] - p1[0]) / 6,
      cp2y: p2[1] - (p3[1] - p1[1]) / 6,
      x: p2[0],
      y: p2[1],
    });
  }
  return segs;
}

function arcPoint(o, angleDeg) {
  const r = angleDeg * Math.PI / 180;
  return { x: o.cx + o.rx * Math.cos(r), y: o.cy + o.ry * Math.sin(r) };
}

function dataUrlMeta(href, index) {
  const m = String(href || '').match(/^data:([^;,]+)?(;base64)?,/i);
  if (!m) return null;
  const mime = (m[1] || 'application/octet-stream').toLowerCase();
  const ext = ({
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
  })[mime] || 'bin';
  return { mime, ext, fileName: `ks_image_${index}.${ext}` };
}

function arcToCubics(o) {
  const start = Number(o.startAngle ?? 0);
  const end = Number(o.endAngle ?? 0);
  let delta = end - start;
  while (delta <= -180) delta += 360;
  while (delta > 180) delta -= 360;
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / 90));
  const segs = [];
  for (let i = 0; i < steps; i++) {
    const a0 = start + (delta * i / steps);
    const a1 = start + (delta * (i + 1) / steps);
    const r0 = a0 * Math.PI / 180;
    const r1 = a1 * Math.PI / 180;
    const k = (4 / 3) * Math.tan((r1 - r0) / 4);
    const p0 = { x: o.cx + o.rx * Math.cos(r0), y: o.cy + o.ry * Math.sin(r0) };
    const p3 = { x: o.cx + o.rx * Math.cos(r1), y: o.cy + o.ry * Math.sin(r1) };
    const cp1 = { x: p0.x - k * o.rx * Math.sin(r0), y: p0.y + k * o.ry * Math.cos(r0) };
    const cp2 = { x: p3.x + k * o.rx * Math.sin(r1), y: p3.y - k * o.ry * Math.cos(r1) };
    segs.push({ p0, cp1, cp2, p3 });
  }
  return segs;
}

function buildTikzBundle(baseName = `ks_diagram_${ts()}`) {
  const defs = [];
  const seen = new Set();
  const out = [];
  const warnings = [];
  const assets = [];
  let imageIndex = 1;

  objects.forEach(o => {
    const stroke = colorDef(o.stroke || '#000000', 'draw', defs, seen);
    const fill = colorDef(o.fill || '#ffffff', 'fill', defs, seen);
    const text = colorDef(o.tc || '#000000', 'text', defs, seen);

    if (o.type === 'line') {
      out.push(`  \\draw[${tikzStyle(o, stroke)}] (${tikzX(o.x1)}, ${tikzY(o.y1)}) -- (${tikzX(o.x2)}, ${tikzY(o.y2)});`);
    } else if (o.type === 'polyline') {
      out.push(`  \\draw[${tikzStyle(o, stroke)}] ${polyPoints(o.points, false)};`);
    } else if (o.type === 'polygon') {
      out.push(`  \\draw[${tikzStyle(o, stroke, tikzFill(o, fill))}] ${polyPoints(o.points, true)};`);
    } else if (o.type === 'rect') {
      out.push(`  \\draw[${tikzStyle(o, stroke, tikzFill(o, fill))}] (${tikzX(o.x)}, ${tikzY(o.y)}) rectangle (${tikzX(o.x + o.w)}, ${tikzY(o.y + o.h)});`);
    } else if (o.type === 'circle') {
      out.push(`  \\draw[${tikzStyle(o, stroke, tikzFill(o, fill))}] (${tikzX(o.cx)}, ${tikzY(o.cy)}) circle (${num(o.r / 40)}cm);`);
    } else if (o.type === 'ellipse') {
      out.push(`  \\draw[${tikzStyle(o, stroke, tikzFill(o, fill))}] (${tikzX(o.cx)}, ${tikzY(o.cy)}) ellipse (${num(o.rx / 40)}cm and ${num(o.ry / 40)}cm);`);
    } else if (o.type === 'arc') {
      const segs = arcToCubics(o);
      if (!segs.length) return;
      const parts = [`(${tikzX(segs[0].p0.x)}, ${tikzY(segs[0].p0.y)})`];
      segs.forEach(seg => {
        parts.push(`.. controls (${tikzX(seg.cp1.x)}, ${tikzY(seg.cp1.y)}) and (${tikzX(seg.cp2.x)}, ${tikzY(seg.cp2.y)}) .. (${tikzX(seg.p3.x)}, ${tikzY(seg.p3.y)})`);
      });
      out.push(`  \\draw[${tikzStyle(o, stroke)}] ${parts.join(' ')};`);
    } else if (o.type === 'text') {
      const extra = [`text=${text}`, `font=\\fontsize{${o.fs || 14}}{${(o.fs || 14) + 2}}\\selectfont`];
      if ((o.opacity ?? 1) !== 1) extra.push(`opacity=${num(o.opacity ?? 1)}`);
      if (o.align === 'start') extra.push('anchor=west');
      else if (o.align === 'end') extra.push('anchor=east');
      out.push(`  \\node[${extra.join(', ')}] at (${tikzX(o.x)}, ${tikzY(o.y)}) {${texEsc(o.text || '')}};`);
    } else if (o.type === 'quadratic') {
      out.push(`  \\draw[${tikzStyle(o, stroke)}] (${tikzX(o.x1)}, ${tikzY(o.y1)}) .. controls (${tikzX(o.cx1)}, ${tikzY(o.cy1)}) .. (${tikzX(o.x2)}, ${tikzY(o.y2)});`);
    } else if (o.type === 'cubic') {
      out.push(`  \\draw[${tikzStyle(o, stroke)}] (${tikzX(o.x1)}, ${tikzY(o.y1)}) .. controls (${tikzX(o.cx1)}, ${tikzY(o.cy1)}) and (${tikzX(o.cx2)}, ${tikzY(o.cy2)}) .. (${tikzX(o.x2)}, ${tikzY(o.y2)});`);
    } else if (o.type === 'bezier') {
      const pts = o.points || [];
      if (pts.length < 2) return;
      const parts = [`(${tikzX(pts[0][0])}, ${tikzY(pts[0][1])})`];
      catmullRomSegments(pts).forEach(seg => {
        parts.push(`.. controls (${tikzX(seg.cp1x)}, ${tikzY(seg.cp1y)}) and (${tikzX(seg.cp2x)}, ${tikzY(seg.cp2y)}) .. (${tikzX(seg.x)}, ${tikzY(seg.y)})`);
      });
      out.push(`  \\draw[${tikzStyle(o, stroke)}] ${parts.join(' ')};`);
    } else if (o.type === 'image') {
      const meta = dataUrlMeta(o.href, imageIndex);
      if (!meta) {
        warnings.push(`image skipped at (${o.x}, ${o.y})`);
        out.push(`  % image skipped at (${o.x}, ${o.y}) size ${o.w}x${o.h}`);
      } else {
        imageIndex += 1;
        assets.push({ fileName: meta.fileName, href: o.href });
        warnings.push(`requires \\usepackage{graphicx} for ${meta.fileName}`);
        const opacity = (o.opacity ?? 1) !== 1 ? `, opacity=${num(o.opacity ?? 1)}` : '';
        out.push(`  \\node[anchor=north west, inner sep=0${opacity}] at (${tikzX(o.x)}, ${tikzY(o.y)}) {\\includegraphics[width=${num(o.w / 40)}cm,height=${num(o.h / 40)}cm]{${meta.fileName}}};`);
      }
    } else {
      warnings.push(`unsupported object type: ${o.type}`);
      out.push(`  % unsupported object skipped: ${o.type}`);
    }
  });

  const header = [];
  if (warnings.length) {
    header.push('% warnings:');
    warnings.forEach(w => header.push(`% - ${w}`));
    header.push('');
  }
  if (defs.length) {
    header.push(...defs, '');
  }
  return {
    tex: `${header.join('\n')}\\begin{tikzpicture}\n${out.join('\n')}\n\\end{tikzpicture}\n`,
    assets,
  };
}

function buildTikz() {
  return buildTikzBundle().tex;
}

function textNodeForObject(o) {
  if (o.type !== 'text') return null;
  const approxW = Math.max(24, Math.round((String(o.text || '').length || 1) * (o.fs || 14) * 0.65));
  const approxH = Math.max(18, Math.round((o.fs || 14) * 1.4));
  return {
    id: `node-text-${o.id}`,
    type: 'text',
    x: Math.round(o.x - approxW / 2),
    y: Math.round(o.y - approxH / 2),
    width: approxW,
    height: approxH,
    text: String(o.text || ''),
    color: 'transparent',
    fill: 'transparent',
    opacity: Math.round((o.opacity ?? 1) * 100),
    textColor: o.tc || '#000000',
    fontSize: o.fs || 14,
    thickness: 0,
    lineStyle: 'solid',
  };
}

function buildWtikz() {
  const nodes = [];
  const edges = [];
  const beziers = [];
  const quadratics = [];
  const quartics = [];
  const plots = [];
  let seq = 1;

  function nextId(prefix) {
    seq += 1;
    return `${prefix}-${Date.now()}-${seq}`;
  }

  objects.forEach(o => {
    if (o.type === 'rect') {
      nodes.push({
        id: nextId('node'),
        type: 'rectangle',
        x: o.x,
        y: o.y,
        width: o.w,
        height: o.h,
        text: '',
        color: o.stroke || '#64748b',
        fill: o.fillNone ? '#ffffff' : (o.fill || '#ffffff'),
        opacity: Math.round((o.opacity ?? 1) * 100),
        textColor: '#000000',
        fontSize: 14,
        thickness: Math.max(1, Math.round(o.sw || 1)),
        lineStyle: o.dash === 'dashed' ? 'dashed' : o.dash === 'dotted' ? 'dotted' : 'solid',
      });
    } else if (o.type === 'circle' || o.type === 'ellipse') {
      nodes.push({
        id: nextId('node'),
        type: 'circle',
        x: Math.round(o.cx - (o.type === 'circle' ? o.r : o.rx)),
        y: Math.round(o.cy - (o.type === 'circle' ? o.r : o.ry)),
        width: Math.round((o.type === 'circle' ? o.r : o.rx) * 2),
        height: Math.round((o.type === 'circle' ? o.r : o.ry) * 2),
        text: '',
        color: o.stroke || '#64748b',
        fill: o.fillNone ? '#ffffff' : (o.fill || '#ffffff'),
        opacity: Math.round((o.opacity ?? 1) * 100),
        textColor: '#000000',
        fontSize: 14,
        thickness: Math.max(1, Math.round(o.sw || 1)),
        lineStyle: o.dash === 'dashed' ? 'dashed' : o.dash === 'dotted' ? 'dotted' : 'solid',
      });
    } else if (o.type === 'text') {
      nodes.push(textNodeForObject(o));
    } else if (o.type === 'line') {
      edges.push({
        id: nextId('edge'),
        x1: o.x1,
        y1: o.y1,
        x2: o.x2,
        y2: o.y2,
        style: o.dash === 'dashed' ? 'dashed' : o.dash === 'dotted' ? 'dotted' : 'solid',
        arrow: o.arrow && o.arrow !== 'none',
        arrowCount: 1,
        arrowMode: o.arrow === 'start' ? 'backward' : 'forward',
        arrowFlipPoints: '0.5',
        color: o.stroke || '#64748b',
        thickness: Math.max(1, Math.round(o.sw || 1)),
      });
    } else if (o.type === 'quadratic') {
      quadratics.push({
        id: nextId('quad'),
        x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2,
        cpx: o.cx1, cpy: o.cy1,
        color: o.stroke || '#64748b',
        thickness: Math.max(1, Math.round(o.sw || 1)),
        style: o.dash === 'dashed' ? 'dashed' : o.dash === 'dotted' ? 'dotted' : 'solid',
        arrow: o.arrow && o.arrow !== 'none',
        arrowCount: 1,
        arrowMode: o.arrow === 'start' ? 'backward' : 'forward',
        arrowFlipPoints: '0.5',
      });
    } else if (o.type === 'cubic') {
      beziers.push({
        id: nextId('bezier'),
        x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2,
        cp1x: o.cx1, cp1y: o.cy1, cp2x: o.cx2, cp2y: o.cy2,
        color: o.stroke || '#64748b',
        thickness: Math.max(1, Math.round(o.sw || 1)),
        style: o.dash === 'dashed' ? 'dashed' : o.dash === 'dotted' ? 'dotted' : 'solid',
        arrow: o.arrow && o.arrow !== 'none',
        arrowCount: 1,
        arrowMode: o.arrow === 'start' ? 'backward' : 'forward',
        arrowFlipPoints: '0.5',
      });
    } else if (o.type === 'bezier') {
      const pts = o.points || [];
      catmullRomSegments(pts).forEach((seg, i) => {
        const p0 = i === 0 ? pts[0] : pts[i];
        beziers.push({
          id: nextId('bezier'),
          x1: p0[0], y1: p0[1], x2: seg.x, y2: seg.y,
          cp1x: seg.cp1x, cp1y: seg.cp1y, cp2x: seg.cp2x, cp2y: seg.cp2y,
          color: o.stroke || '#64748b',
          thickness: Math.max(1, Math.round(o.sw || 1)),
          style: o.dash === 'dashed' ? 'dashed' : o.dash === 'dotted' ? 'dotted' : 'solid',
          arrow: false,
          arrowCount: 1,
          arrowMode: 'forward',
          arrowFlipPoints: '0.5',
        });
      });
    } else if (o.type === 'polyline' || o.type === 'polygon') {
      const pts = o.points || [];
      for (let i = 1; i < pts.length; i++) {
        edges.push({
          id: nextId('edge'),
          x1: pts[i - 1][0], y1: pts[i - 1][1], x2: pts[i][0], y2: pts[i][1],
          style: o.dash === 'dashed' ? 'dashed' : o.dash === 'dotted' ? 'dotted' : 'solid',
          arrow: false,
          arrowCount: 1,
          arrowMode: 'forward',
          arrowFlipPoints: '0.5',
          color: o.stroke || '#64748b',
          thickness: Math.max(1, Math.round(o.sw || 1)),
        });
      }
      if (o.type === 'polygon' && pts.length > 2) {
        edges.push({
          id: nextId('edge'),
          x1: pts[pts.length - 1][0], y1: pts[pts.length - 1][1], x2: pts[0][0], y2: pts[0][1],
          style: o.dash === 'dashed' ? 'dashed' : o.dash === 'dotted' ? 'dotted' : 'solid',
          arrow: false,
          arrowCount: 1,
          arrowMode: 'forward',
          arrowFlipPoints: '0.5',
          color: o.stroke || '#64748b',
          thickness: Math.max(1, Math.round(o.sw || 1)),
        });
      }
    } else if (o.type === 'arc') {
      arcToCubics(o).forEach(seg => {
        beziers.push({
          id: nextId('bezier'),
          x1: seg.p0.x, y1: seg.p0.y, x2: seg.p3.x, y2: seg.p3.y,
          cp1x: seg.cp1.x, cp1y: seg.cp1.y, cp2x: seg.cp2.x, cp2y: seg.cp2.y,
          color: o.stroke || '#64748b',
          thickness: Math.max(1, Math.round(o.sw || 1)),
          style: o.dash === 'dashed' ? 'dashed' : o.dash === 'dotted' ? 'dotted' : 'solid',
          arrow: false,
          arrowCount: 1,
          arrowMode: 'forward',
          arrowFlipPoints: '0.5',
        });
      });
    }
  });

  return { nodes, edges, beziers, quadratics, quartics, plots, canvasW: Math.round(cvW), canvasH: Math.round(cvH) };
}

/* ════════════════════════════
   저장 드롭다운
════════════════════════════ */
document.getElementById('save-gtree').addEventListener('click', async () => {
  closeDropdowns();
  const data = { version:1, appName:'KS 이미지 에디터', savedAt:new Date().toISOString(), cvW, cvH, objects: JSON.parse(JSON.stringify(objects)) };
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const name = `ks_diagram_${ts()}.gtree`;
  await saveBlobWithPicker(
    blob,
    name,
    [{ description:'GTree files', accept:{ 'application/json':['.gtree','.json'] } }]
  );
});

document.getElementById('save-svg').addEventListener('click', async () => {
  closeDropdowns();
  const { clone } = cloneSvg();
  const blob = new Blob([clone.outerHTML], {type:'image/svg+xml'});
  const name = `ks_diagram_${ts()}.svg`;
  await saveBlobWithPicker(
    blob,
    name,
    [{ description:'SVG files', accept:{ 'image/svg+xml':['.svg'] } }]
  );
});

document.getElementById('save-tex').addEventListener('click', async () => {
  closeDropdowns();
  const base = `ks_diagram_${ts()}`;
  const bundle = buildTikzBundle(base);
  await saveTikzBundleWithPicker(bundle, base);
});

document.getElementById('save-wtikz').addEventListener('click', async () => {
  closeDropdowns();
  const blob = new Blob([JSON.stringify(buildWtikz(), null, 2)], {type:'application/wtikz'});
  const name = `ks_diagram_${ts()}.wtikz`;
  await saveBlobWithPicker(
    blob,
    name,
    [{ description:'WTIKZ files', accept:{ 'application/wtikz':['.wtikz','.json'] } }]
  );
});

document.getElementById('save-png').addEventListener('click', () => {
  closeDropdowns();
  exportRaster('png');
});

document.getElementById('save-jpg').addEventListener('click', () => {
  closeDropdowns();
  exportRaster('jpg');
});

function exportRaster(fmt) {
  const { clone, w, h } = cloneSvg();
  const url = URL.createObjectURL(new Blob([clone.outerHTML], {type:'image/svg+xml'}));
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = w*2; c.height = h*2;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.scale(2,2); ctx.drawImage(img, 0, 0, w, h);
    const mime  = fmt==='jpg' ? 'image/jpeg' : 'image/png';
    const qual  = fmt==='jpg' ? 0.92 : undefined;
    download(c.toDataURL(mime, qual), `ks_diagram_${ts()}.${fmt}`);
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

/* ════════════════════════════
   불러오기 드롭다운
════════════════════════════ */
document.getElementById('load-gtree').addEventListener('click', () => {
  closeDropdowns();
  document.getElementById('file-gtree').click();
});
document.getElementById('load-image').addEventListener('click', () => {
  closeDropdowns();
  document.getElementById('file-image').click();
});
document.getElementById('load-svg').addEventListener('click', () => {
  closeDropdowns();
  document.getElementById('file-svg').click();
});

/* ── .gtree 불러오기 ── */
document.getElementById('file-gtree').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.objects || !Array.isArray(data.objects)) { alert('올바른 .gtree 파일이 아닙니다.'); return; }
      saveState();
      objects = data.objects;
      oid = objects.reduce((mx,o) => Math.max(mx, o.id||0), 0);
      if (data.cvW) cvW = data.cvW;
      if (data.cvH) cvH = data.cvH;
      selId = null; applyCvSize(); render(); syncProps(); updateSB();
      showMsg(`✓ ${file.name} 불러오기 완료`);
    } catch(err) { alert('파일 오류: ' + err.message); }
  };
  reader.readAsText(file); e.target.value='';
});

/* ── 이미지(PNG/JPG) 불러오기 → 오브젝트로 삽입 ── */
document.getElementById('file-image').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => insertImageObj(ev.target.result);
  reader.readAsDataURL(file); e.target.value='';
});

/* ── SVG 불러오기 → 이미지 오브젝트로 삽입 ── */
document.getElementById('file-svg').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    // SVG를 Blob URL로 변환 후 이미지로 삽입
    const blob = new Blob([ev.target.result], {type:'image/svg+xml'});
    const url  = URL.createObjectURL(blob);
    // dataURL로 변환 (저장 시 포함되도록)
    const img  = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || 400; c.height = img.naturalHeight || 300;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      insertImageObj(c.toDataURL('image/png'));
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { // canvas 변환 실패 시 dataURL 직접 사용
      const svgData = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(ev.target.result)));
      insertImageObj(svgData);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };
  reader.readAsText(file); e.target.value='';
});

function insertImageObj(dataUrl) {
  const img = new Image();
  img.onload = () => {
    saveState();
    const MAX_W=400, MAX_H=300;
    let w=img.naturalWidth||400, h=img.naturalHeight||300;
    if (w>MAX_W){h=h*(MAX_W/w);w=MAX_W;}
    if (h>MAX_H){w=w*(MAX_H/h);h=MAX_H;}
    w=Math.round(w); h=Math.round(h);
    const o={id:uid(),type:'image',x:Math.round(cvW/2-w/2),y:Math.round(cvH/2-h/2),w,h,href:dataUrl,opacity:1};
    objects.push(o); selId=o.id; switchTool('select'); render(); syncProps();
  };
  img.src = dataUrl;
}

/* ── 상태바 메시지 ── */
function showMsg(msg) {
  const el = document.getElementById('sb-sel');
  el.textContent = msg;
  setTimeout(() => { el.textContent = selId ? `선택: id=${selId}` : '선택: 없음'; }, 2500);
}

/* ── 드롭다운 열기/닫기 ── */
function closeDropdowns() {
  document.querySelectorAll('.dropdown-panel').forEach(p => p.classList.remove('open'));
}
document.getElementById('btn-save-menu').addEventListener('click', e => {
  e.stopPropagation();
  const panel = document.getElementById('save-panel');
  const wasOpen = panel.classList.contains('open');
  closeDropdowns();
  if (!wasOpen) panel.classList.add('open');
});
document.getElementById('btn-load-menu').addEventListener('click', e => {
  e.stopPropagation();
  const panel = document.getElementById('load-panel');
  const wasOpen = panel.classList.contains('open');
  closeDropdowns();
  if (!wasOpen) panel.classList.add('open');
});
document.addEventListener('click', closeDropdowns);
