document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('markdown-input');
    const preview = document.getElementById('keep-preview');
    const copyBtn = document.getElementById('copy-btn');
    const openFileBtn = document.getElementById('open-file-btn');
    const openFolderBtn = document.getElementById('open-folder-btn');
    const saveBtn = document.getElementById('save-btn');
    const clearBtn = document.getElementById('clear-btn');
    const fileInput = document.getElementById('file-input');
    const dirInput = document.getElementById('dir-input');

    const wordCount = document.getElementById('word-count');
    const charCount = document.getElementById('char-count');
    let currentFileName = 'untitled.md';
    let currentFileType = 'markdown';
    let currentFilePath = null;
    let hasDocumentApi = false;
    let currentWorkspaceFiles = new Map();
    const assetObjectUrls = new Map();

    const UPMATH = 'https://i.upmath.me/svg/';

    marked.setOptions({ breaks: true, gfm: true, silent: true });

    const escapeHtml = v => String(v ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const isSvgPath = p => typeof p === 'string' && /\.svg(\?.*)?(#.*)?$/i.test(p.trim());
    const hasUrlScheme = value => /^[a-z][a-z0-9+.-]*:/i.test(value);
    const normalizeRelPath = value => String(value ?? '').replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '');
    const isApiDocumentPath = value => hasDocumentApi && typeof value === 'string' && value.includes(':\\');

    function revokeAssetObjectUrls() {
        for (const url of assetObjectUrls.values()) URL.revokeObjectURL(url);
        assetObjectUrls.clear();
    }

    function normalizeSegments(value) {
        const parts = normalizeRelPath(value).split('/');
        const stack = [];
        for (const part of parts) {
            if (!part || part === '.') continue;
            if (part === '..') {
                if (stack.length) stack.pop();
                continue;
            }
            stack.push(part);
        }
        return stack.join('/');
    }

    function getCurrentDocumentDir() {
        if (typeof currentFilePath === 'string' && currentFilePath.trim()) {
            return currentFilePath.replace(/\\/g, '/').replace(/\/[^/]*$/, '/');
        }
        if (currentFileName.includes('/')) {
            return currentFileName.replace(/\/[^/]*$/, '/');
        }
        return '';
    }

    function resolveWorkspaceAsset(rawPath) {
        if (!currentWorkspaceFiles.size) return null;
        const normalized = normalizeRelPath(rawPath);
        if (!normalized) return null;
        const docDir = getCurrentDocumentDir();
        const combined = normalizeSegments(docDir ? `${docDir}/${normalized}` : normalized);
        const file = currentWorkspaceFiles.get(combined);
        if (!file) return null;
        let objectUrl = assetObjectUrls.get(combined);
        if (!objectUrl) {
            objectUrl = URL.createObjectURL(file);
            assetObjectUrls.set(combined, objectUrl);
        }
        return objectUrl;
    }

    function resolveAssetPath(rawPath) {
        if (typeof rawPath !== 'string') return '';
        const value = rawPath.trim();
        if (!value) return '';
        if (value.startsWith('#') || value.startsWith('data:') || value.startsWith('blob:')) return value;
        const workspaceAsset = resolveWorkspaceAsset(value);
        if (workspaceAsset) return workspaceAsset;
        if (hasUrlScheme(value)) return value;
        if (isApiDocumentPath(currentFilePath)) {
            return `/api/asset?doc=${encodeURIComponent(currentFilePath)}&src=${encodeURIComponent(value)}`;
        }

        try {
            return new URL(value, currentFilePath || location.href).href;
        } catch {
            return value;
        }
    }

    marked.use({
        renderer: {
            image(t, tA, tX) {
                const tm = typeof t === 'object' && t !== null;
                const href = tm ? (t.href || '') : (t || '');
                const resolvedHref = resolveAssetPath(href);
                const alt = escapeHtml(tm ? (t.text || '') : (tX || ''));
                const ttl = (tm ? t.title : tA) ? ` title="${escapeHtml(tm ? t.title : tA)}"` : '';
                if (isSvgPath(resolvedHref)) {
                    return `<object class="md-svg-object" type="image/svg+xml" data="${escapeHtml(resolvedHref)}" aria-label="${alt}"${ttl}>${alt}</object>`;
                }
                return `<img src="${escapeHtml(resolvedHref)}" alt="${alt}"${ttl}>`;
            }
        }
    });

    function mathImg(formula, block) {
        const tex = block ? formula : `{\\textstyle ${formula}}`;
        const url = UPMATH + encodeURIComponent(tex);
        const alt = escapeHtml(formula);
        const modeClass = block ? 'latex-block-svg' : 'latex-inline-svg';
        const img = `<img src="${url}" alt="${alt}" class="latex-svg ${modeClass}">`;
        return block ? `<div class="latex-block">${img}</div>` : img;
    }

    function processMath(value) {
        const codePh = [];
        value = value.replace(/(```[\s\S]*?```|`[^`\n]+`|<pre[\s\S]*?<\/pre>)/g, m => {
            codePh.push(m);
            return `\x00C${codePh.length - 1}\x00`;
        });

        const mathPh = [];
        const addMath = (formula, isBlock) => {
            mathPh.push({ formula, isBlock });
            return `\x01M${mathPh.length - 1}\x01`;
        };

        value = value.replace(/\\\[([\s\S]*?)\\\]/g, (_, f) => addMath(f, true));
        value = value.replace(/\\\(([\s\S]*?)\\\)/g, (_, f) => addMath(f, false));
        value = value.replace(/\\\s\(([\s\S]*?)\\\)/g, (_, f) => addMath(f, false));
        value = value.replace(/\$\$([\s\S]*?)\$\$/g, (_, f) => addMath(f, true));
        value = replaceInlineDollarMath(value, addMath);

        value = value.replace(/\x01M(\d+)\x01/g, (_, i) => {
            const m = mathPh[+i];
            return mathImg(m.formula, m.isBlock);
        });

        value = value.replace(/\x00C(\d+)\x00/g, (_, i) => codePh[+i]);
        return value;
    }

    function replaceInlineDollarMath(value, addMath) {
        let out = '';
        let i = 0;
        while (i < value.length) {
            if (value[i] !== '$' || value[i - 1] === '\\') {
                out += value[i++];
                continue;
            }

            const first = value[i + 1];
            if (!first || first === '$' || /\s|\d/.test(first)) {
                out += value[i++];
                continue;
            }

            let end = -1;
            for (let j = i + 1; j < value.length; j++) {
                if (value[j] === '\n') break;
                if (value[j] === '$' && value[j - 1] !== '\\') {
                    end = j;
                    break;
                }
            }

            if (end < 0) {
                out += value[i++];
                continue;
            }

            const formula = value.slice(i + 1, end);
            if (!formula.trim() || /\s$/.test(formula)) {
                out += value.slice(i, end + 1);
            } else {
                out += addMath(formula, false);
            }
            i = end + 1;
        }
        return out;
    }

    function normalizeMathImages() {
        preview.querySelectorAll('img[src*="i.upmath.me"]').forEach(img => {
            img.classList.add('latex-svg');
            const isBlock = img.closest('.latex-block') || (
                img.parentElement?.tagName === 'P' &&
                img.parentElement.textContent.trim() === ''
            );

            img.style.maxWidth = '100%';
            img.style.width = 'auto';
            img.style.height = 'auto';
            img.style.verticalAlign = 'middle';
            img.style.display = 'inline-block';
            img.style.margin = isBlock ? '0 auto' : '0 0.08em';
        });
    }

    const hydrateSvg = async () => {
        if (location.protocol === 'file:') return;
        const imgs = [...preview.querySelectorAll('img')].filter(i => isSvgPath(i.getAttribute('src') || ''));
        await Promise.all(imgs.map(async img => {
            const src = img.getAttribute('src');
            if (!src) return;
            try {
                const r = await fetch(src);
                if (!r.ok) return;
                const txt = await r.text();
                if (!/<svg[\s>]/i.test(txt)) return;
                const w = document.createElement('div');
                w.className = 'inline-svg-wrapper';
                w.innerHTML = txt;
                const svgEl = w.querySelector('svg');
                if (!svgEl) return;
                svgEl.setAttribute('role', 'img');
                svgEl.setAttribute('aria-label', img.getAttribute('alt') || 'svg');
                img.replaceWith(w);
            } catch {}
        }));
    };

    const updatePreview = () => {
        if (currentFileType === 'svg') {
            preview.innerHTML = input.value;
            return;
        }

        let value = input.value;
        value = value.replace(
            /(?:\(단위\s?:\s?.+?\)\s*)?(?:\\arrayrulecolor\s*\{.*?\}\s*)?\\begin\s*\{tabular\}[\s\S]*?\\end\s*\{tabular\}/g,
            m => `<pre class="latex-table-code">\n${m}\n</pre>`
        );

        value = processMath(value);

        const prot = [];
        value = value.replace(/(```[\s\S]*?```|`[^`\n]+`|<pre[\s\S]*?<\/pre>|<[^>]+>)/g, m => {
            prot.push(m);
            return `\x00P${prot.length - 1}\x00`;
        });
        value = value.replace(/\*\*([^\*\s](?:[^\*\n]*?[^\*\s])?)\*\*/g, (_, m) => `<strong>${m.replace(/~/g, '&#126;')}</strong>`);
        value = value.replace(/([^\*]|^)\*([^\*\s](?:[^\*\n]*?[^\*\s])?)\*([^\*]|$)/g, (_, p, m, s) => `${p}<em>${m.replace(/~/g, '&#126;')}</em>${s}`);
        value = value.replace(/(?<!~)~(?!~)/g, '&#126;');
        value = value.replace(/\x00P(\d+)\x00/g, (_, i) => prot[+i]);

        preview.innerHTML = marked.parse(value);

        normalizeMathImages();
        if (typeof LaTeXTable !== 'undefined') LaTeXTable.renderAll();
        hydrateSvg();

        if (typeof hljs !== 'undefined') {
            preview.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));
        }

        const txt = input.value.trim();
        wordCount.textContent = txt ? txt.split(/\s+/).length : 0;
        charCount.textContent = input.value.length;
    };

    const readFile = file => new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => rej(r.error);
        r.readAsText(file, 'utf-8');
    });

    const isSvgFile = file => file.type === 'image/svg+xml' || (file.name || '').toLowerCase().endsWith('.svg');

    const saveSourceFile = async () => {
        const content = input.value;
        const isSvg = currentFileType === 'svg';
        const defaultExt = isSvg ? '.svg' : '.md';
        const defaultType = isSvg ? 'image/svg+xml' : 'text/markdown';
        const baseName = currentFileName || `untitled${defaultExt}`;
        const name = baseName.toLowerCase().endsWith(defaultExt) ? baseName : `${baseName}${defaultExt}`;

        try {
            if ('showSaveFilePicker' in window) {
                const handle = await window.showSaveFilePicker({
                    suggestedName: name,
                    excludeAcceptAllOption: false,
                    types: [{
                        description: isSvg ? 'SVG' : 'Markdown',
                        accept: { [defaultType]: [defaultExt] }
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(content);
                await writable.close();
                currentFileName = handle.name || name;
                return;
            }

            const a = Object.assign(document.createElement('a'), {
                href: URL.createObjectURL(new Blob([content], { type: `${defaultType};charset=utf-8` })),
                download: name
            });
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (e) {
            if (e?.name === 'AbortError') return;
        }
    };

    const promptSaveFormat = () => {
        const defaultFormat = currentFileType === 'svg' ? 'svg' : 'md';
        const answer = prompt(`저장 형식을 입력하세요.\n- ${defaultFormat}: 원본 파일 저장\n- pdf: PDF 저장`, defaultFormat);
        if (answer === null) return null;
        const normalized = answer.trim().toLowerCase();
        if (!normalized) return defaultFormat;
        return normalized === 'pdf' ? 'pdf' : defaultFormat;
    };

    const buildPrintHtml = () => {
        const title = escapeHtml((currentFileName || 'document').replace(/\.[^.]+$/, ''));
        return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        body { font-family: "Segoe UI", Arial, sans-serif; color: #222; margin: 24px 32px; line-height: 1.6; }
        img, object { display: block; max-width: 100%; height: auto; margin: 1rem auto; }
        pre { white-space: pre-wrap; word-break: break-word; border: 1px solid #ddd; padding: 12px; border-radius: 8px; background: #f8f8f8; }
        code { font-family: Consolas, monospace; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ccc; padding: 8px 10px; }
    </style>
</head>
<body>
    <div class="markdown-body">${preview.innerHTML}</div>
</body>
</html>`;
    };

    const savePdfInBrowser = () => {
        const frame = document.createElement('iframe');
        frame.style.position = 'fixed';
        frame.style.right = '0';
        frame.style.bottom = '0';
        frame.style.width = '0';
        frame.style.height = '0';
        frame.style.border = '0';
        frame.setAttribute('aria-hidden', 'true');
        document.body.appendChild(frame);

        const cleanup = () => {
            window.removeEventListener('afterprint', cleanup);
            frame.remove();
        };

        window.addEventListener('afterprint', cleanup, { once: true });

        const doc = frame.contentWindow?.document;
        if (!doc || !frame.contentWindow) {
            cleanup();
            alert('PDF 저장용 인쇄 프레임을 만들지 못했습니다.');
            return;
        }

        doc.open();
        doc.write(buildPrintHtml());
        doc.close();

        frame.onload = () => {
            frame.contentWindow.focus();
            frame.contentWindow.print();
        };
    };

    const handleSave = async () => {
        const format = promptSaveFormat();
        if (!format) return;
        if (format === 'pdf') {
            savePdfInBrowser();
            return;
        }
        await saveSourceFile();
    };

    function flashCopied(btn, label = 'Copied!') {
        const originalHtml = btn.innerHTML;
        const originalBackground = btn.style.background;
        btn.innerHTML = `<span>${label}</span>`;
        btn.style.background = '#10b981';
        setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.style.background = originalBackground;
        }, 2000);
    }

    function fallbackCopyText(text) {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.left = '-9999px';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        area.remove();
        if (!ok) throw new Error('Copy command failed');
    }

    async function copyPlainText(text) {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return;
        }
        fallbackCopyText(text);
    }

    const copyEditorSource = async btn => {
        try {
            await copyPlainText(input.value);
            flashCopied(btn);
        } catch (error) {
            console.error(error);
            alert('복사하지 못했습니다. 브라우저 권한이나 HTTPS/localhost 환경을 확인해주세요.');
        }
    };

    const copyPreviewContent = async btn => {
        try {
            if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
                await navigator.clipboard.write([new ClipboardItem({
                    'text/html': new Blob([preview.innerHTML], { type: 'text/html' }),
                    'text/plain': new Blob([preview.innerText], { type: 'text/plain' })
                })]);
            } else {
                await copyPlainText(preview.innerText);
            }
            flashCopied(btn);
        } catch (error) {
            try {
                await copyPlainText(preview.innerText);
                flashCopied(btn);
            } catch (fallbackError) {
                console.error(error, fallbackError);
                alert('복사하지 못했습니다. 브라우저 권한이나 HTTPS/localhost 환경을 확인해주세요.');
            }
        }
    };

    const loadDocument = doc => {
        if (!doc) return;
        if (doc.path) {
            revokeAssetObjectUrls();
            currentWorkspaceFiles = new Map();
        }
        input.value = doc.content || '';
        currentFileName = doc.name || 'untitled.md';
        currentFilePath = doc.path || null;
        currentFileType = doc.type || 'markdown';
        updatePreview();
    };

    const loadDocumentFromServerPath = async filePath => {
        const response = await fetch(`/api/document?path=${encodeURIComponent(filePath)}`);
        if (!response.ok) throw new Error(`Failed to load ${filePath}`);
        loadDocument(await response.json());
    };

    const loadDocumentFromUrl = async fileUrl => {
        const absoluteUrl = new URL(fileUrl, location.href).href;
        const response = await fetch(absoluteUrl);
        if (!response.ok) throw new Error(`Failed to load ${absoluteUrl}`);
        loadDocument({
            content: await response.text(),
            name: absoluteUrl.split('/').pop() || 'document.md',
            path: absoluteUrl,
            type: /\.svg(\?.*)?(#.*)?$/i.test(absoluteUrl) ? 'svg' : 'markdown'
        });
    };

    async function collectDirectoryFiles(dirHandle, basePath = '') {
        const files = [];
        for await (const entry of dirHandle.values()) {
            const nextPath = basePath ? `${basePath}/${entry.name}` : entry.name;
            if (entry.kind === 'file') {
                const file = await entry.getFile();
                files.push({ path: nextPath, file });
                continue;
            }
            if (entry.kind === 'directory') {
                files.push(...await collectDirectoryFiles(entry, nextPath));
            }
        }
        return files;
    }

    async function connectWorkspaceEntries(entries) {
        if (!entries.length) {
            alert('선택한 폴더에 파일이 없습니다.');
            return;
        }

        revokeAssetObjectUrls();
        currentWorkspaceFiles = new Map(entries.map(({ path, file }) => [normalizeRelPath(path), file]));

        if (!input.value.trim()) {
            alert('먼저 `파일 선택`으로 Markdown 문서를 연 뒤, 필요하면 `폴더 선택`으로 이미지 폴더를 연결하세요.');
            return;
        }

        updatePreview();
    }

    async function openFolderWorkspace() {
        if ('showDirectoryPicker' in window) {
            try {
                const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
                const entries = await collectDirectoryFiles(dirHandle);
                await connectWorkspaceEntries(entries);
                return;
            } catch (error) {
                if (error?.name === 'AbortError') return;
                console.error(error);
            }
        }
        dirInput?.click();
    }

    const detectDocumentApi = async () => {
        try {
            const response = await fetch('/api/document?path=__codex_probe__', { method: 'GET' });
            return response.status !== 404;
        } catch {
            return false;
        }
    };

    const promptAndLoadLocalDocument = async () => {
        const answer = prompt(
            '열 Markdown 경로를 입력하세요.\n예: /converter/glm.md 또는 C:\\Users\\kkmin\\.gemini\\antigravity\\scratch\\converter\\glm.md',
            currentFilePath || '/converter/glm.md'
        );
        if (!answer) return;
        try {
            await loadDocumentFromServerPath(answer);
        } catch (error) {
            console.error(error);
            alert('문서를 열지 못했습니다. 경로를 다시 확인해주세요.');
        }
    };

    const loadTestMd = async () => {
        try {
            const response = await fetch('test.md');
            if (response.ok) {
                loadDocument({
                    content: await response.text(),
                    name: 'test.md',
                    path: new URL('test.md', location.href).href,
                    type: 'markdown'
                });
            }
        } catch {}
    };

    const init = async () => {
        hasDocumentApi = await detectDocumentApi();
        await loadTestMd();
    };

    init();

    input.addEventListener('input', () => { updatePreview(); });
    clearBtn?.addEventListener('click', () => {
        if (confirm('모든 내용을 지우시겠습니까?')) {
            input.value = '';
            updatePreview();
        }
    });
    openFileBtn?.addEventListener('click', () => {
        if (hasDocumentApi) {
            promptAndLoadLocalDocument();
            return;
        }
        fileInput.click();
    });
    openFolderBtn?.addEventListener('click', () => openFolderWorkspace());
    dirInput?.addEventListener('change', async e => {
        const entries = Array.from(e.target.files || []).map(file => ({
            path: normalizeRelPath(file.webkitRelativePath || file.name),
            file
        }));
        try {
            await connectWorkspaceEntries(entries);
        } finally {
            dirInput.value = '';
        }
    });
    fileInput?.addEventListener('change', async e => {
        const [file] = e.target.files || [];
        if (!file) return;
        try {
            const content = await readFile(file);
            loadDocument({
                content,
                name: file.name,
                path: null,
                type: isSvgFile(file) ? 'svg' : 'markdown'
            });
        } catch {} finally {
            fileInput.value = '';
        }
    });
    saveBtn?.addEventListener('click', () => handleSave());
    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            handleSave();
        }
    });
    copyBtn.addEventListener('click', () => copyEditorSource(copyBtn));
    document.getElementById('copy-all-btn')?.addEventListener('click', e => copyPreviewContent(e.currentTarget));
    input.addEventListener('scroll', () => {
        const p = input.scrollTop / (input.scrollHeight - input.clientHeight);
        preview.scrollTop = p * (preview.scrollHeight - preview.clientHeight);
    });
    input.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const s = input.selectionStart;
        const v = input.value;
        const line = v.slice(v.lastIndexOf('\n', s - 1) + 1, s);
        let m;
        if ((m = line.match(/^(\s*[*+-]\s+)(.*)/))) {
            e.preventDefault();
            const ins = m[2].trim() === '' ? '' : '\n' + m[1];
            if (!ins) {
                input.value = v.slice(0, s - m[1].length) + v.slice(s);
                input.selectionStart = input.selectionEnd = s - m[1].length;
            } else {
                input.value = v.slice(0, s) + ins + v.slice(s);
                input.selectionStart = input.selectionEnd = s + ins.length;
            }
            updatePreview();
        } else if ((m = line.match(/^(\s*)(\d+)(\.\s+)(.*)/))) {
            e.preventDefault();
            const ins = m[4].trim() === '' ? '' : `\n${m[1]}${+m[2] + 1}${m[3]}`;
            if (!ins) {
                input.value = v.slice(0, s - line.length) + v.slice(s);
                input.selectionStart = input.selectionEnd = s - line.length;
            } else {
                input.value = v.slice(0, s) + ins + v.slice(s);
                input.selectionStart = input.selectionEnd = s + ins.length;
            }
            updatePreview();
        }
    });
});
