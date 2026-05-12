const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const host = '127.0.0.1';
const port = Number.parseInt(process.env.PORT || '8080', 10);
const rootDir = path.resolve(__dirname, '..');

const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.md': 'text/markdown; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8'
};

function send(res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
    res.writeHead(statusCode, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store'
    });
    res.end(body);
}

function sendJson(res, statusCode, payload) {
    send(res, statusCode, JSON.stringify(payload), 'application/json; charset=utf-8');
}

function safePathFromUrl(urlPath) {
    const pathname = decodeURIComponent(new URL(urlPath, `http://${host}:${port}`).pathname);
    const normalized = path.normalize(path.join(rootDir, pathname));
    if (!normalized.startsWith(rootDir)) return null;
    return normalized;
}

function safePathFromUserInput(inputPath) {
    if (typeof inputPath !== 'string' || !inputPath.trim()) return null;
    const raw = inputPath.trim();
    const isDriveAbsolute = /^[a-zA-Z]:[\\/]/.test(raw);
    const isUncAbsolute = /^\\\\/.test(raw);
    const candidate = (isDriveAbsolute || isUncAbsolute)
        ? path.normalize(raw)
        : path.normalize(path.join(rootDir, raw.replace(/^[\\/]+/, '')));
    if (!candidate.startsWith(rootDir)) return null;
    return candidate;
}

function walkFiles(dirPath, results = []) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            walkFiles(fullPath, results);
            continue;
        }
        if (entry.isFile()) results.push(fullPath);
    }
    return results;
}

function resolveAssetPath(docPath, assetPath) {
    const source = String(assetPath || '').trim();
    if (!source) return null;

    const directPath = safePathFromUserInput(source);
    if (directPath && fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
        return directPath;
    }

    const docDir = path.dirname(docPath);
    const candidate = path.normalize(path.resolve(docDir, source));
    if (candidate.startsWith(docDir) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
    }

    const normalizedNeedle = source.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '').toLowerCase();
    const basenameNeedle = path.basename(normalizedNeedle);
    const allFiles = walkFiles(docDir);

    const suffixMatch = allFiles.find(filePath => {
        const rel = path.relative(docDir, filePath).replace(/\\/g, '/').toLowerCase();
        return normalizedNeedle && rel.endsWith(normalizedNeedle);
    });
    if (suffixMatch) return suffixMatch;

    const basenameMatch = allFiles.find(filePath => path.basename(filePath).toLowerCase() === basenameNeedle);
    return basenameMatch || null;
}

function serveStaticFile(res, filePath) {
    fs.readFile(filePath, (error, data) => {
        if (error) {
            send(res, 500, error.message);
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        send(res, 200, data, mimeTypes[ext] || 'application/octet-stream');
    });
}

const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', `http://${host}:${port}`);

    if (requestUrl.pathname === '/api/document') {
        const requestedPath = requestUrl.searchParams.get('path');
        const filePath = safePathFromUserInput(requestedPath);
        if (!filePath) {
            sendJson(res, 400, { error: 'Invalid path' });
            return;
        }
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            sendJson(res, 404, { error: 'Document not found' });
            return;
        }
        fs.readFile(filePath, 'utf8', (error, content) => {
            if (error) {
                sendJson(res, 500, { error: error.message });
                return;
            }
            sendJson(res, 200, {
                content,
                name: path.basename(filePath),
                path: filePath,
                type: /\.svg$/i.test(filePath) ? 'svg' : 'markdown'
            });
        });
        return;
    }

    if (requestUrl.pathname === '/api/asset') {
        const docPath = safePathFromUserInput(requestUrl.searchParams.get('doc'));
        const assetPath = requestUrl.searchParams.get('src');
        if (!docPath || !assetPath) {
            send(res, 400, 'Invalid asset request');
            return;
        }
        if (!fs.existsSync(docPath) || !fs.statSync(docPath).isFile()) {
            send(res, 404, 'Document not found');
            return;
        }
        const resolvedAsset = resolveAssetPath(docPath, assetPath);
        if (!resolvedAsset) {
            send(res, 404, 'Asset not found');
            return;
        }
        serveStaticFile(res, resolvedAsset);
        return;
    }

    const targetPath = safePathFromUrl(req.url || '/');
    if (!targetPath) {
        send(res, 403, 'Forbidden');
        return;
    }

    let filePath = targetPath;
    try {
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) filePath = path.join(filePath, 'index.html');
    } catch {
        send(res, 404, 'Not Found');
        return;
    }

    serveStaticFile(res, filePath);
});

server.listen(port, host, () => {
    const viewerUrl = `http://${host}:${port}/web-md/index.html`;
    const exampleUrl = `${viewerUrl}?file=/converter/glm.md`;
    console.log(`Serving ${rootDir}`);
    console.log(`Viewer:  ${viewerUrl}`);
    console.log(`Example: ${exampleUrl}`);
});
