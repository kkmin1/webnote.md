const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

let mainWindow = null;
let pendingFilePath = null;

function isFilePath(candidate) {
    if (!candidate) return false;
    if (candidate.startsWith('-')) return false;
    return /\.(md|markdown|txt|svg)$/i.test(candidate);
}

function getLaunchFilePath(argv = process.argv) {
    return argv.slice(1).find(isFilePath) || null;
}

async function readDocument(filePath) {
    const content = await fs.readFile(filePath, 'utf8');
    return {
        path: filePath,
        name: path.basename(filePath),
        content,
        type: /\.svg$/i.test(filePath) ? 'svg' : 'markdown'
    };
}

async function sendFileToRenderer(filePath) {
    if (!mainWindow || !filePath) return;
    try {
        const doc = await readDocument(filePath);
        mainWindow.webContents.send('document:open', doc);
    } catch (error) {
        dialog.showErrorBox('File Open Failed', error.message);
    }
}

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 920,
        minWidth: 1024,
        minHeight: 720,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    await mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

function buildPdfHtml({ html, title }) {
    const safeTitle = String(title || 'Document')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <title>${safeTitle}</title>
    <style>
        body {
            font-family: "Segoe UI", Arial, sans-serif;
            color: #222;
            margin: 24px 32px;
            line-height: 1.6;
        }
        img, object {
            max-width: 100%;
            height: auto;
        }
        pre {
            white-space: pre-wrap;
            word-break: break-word;
            border: 1px solid #ddd;
            padding: 12px;
            border-radius: 8px;
            background: #f8f8f8;
        }
        code {
            font-family: Consolas, monospace;
        }
        table {
            border-collapse: collapse;
            width: 100%;
        }
        th, td {
            border: 1px solid #ccc;
            padding: 8px 10px;
        }
    </style>
</head>
<body>
    <div class="markdown-body">${html || ''}</div>
</body>
</html>`;
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
    app.quit();
} else {
    app.on('second-instance', async (_event, argv) => {
        const filePath = getLaunchFilePath(argv);
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
        if (filePath) {
            await sendFileToRenderer(path.resolve(filePath));
        }
    });

    app.whenReady().then(async () => {
        pendingFilePath = getLaunchFilePath();
        if (pendingFilePath) pendingFilePath = path.resolve(pendingFilePath);
        await createWindow();

        app.on('activate', async () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                await createWindow();
            }
        });
    });
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('dialog:open-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] },
            { name: 'SVG', extensions: ['svg'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (result.canceled || !result.filePaths[0]) return null;
    return readDocument(result.filePaths[0]);
});

ipcMain.handle('dialog:save-file', async (_event, payload) => {
    const { content, currentPath, currentType } = payload || {};
    if (typeof content !== 'string') return null;

    let targetPath = currentPath || null;
    if (!targetPath) {
        const result = await dialog.showSaveDialog(mainWindow, {
            defaultPath: currentType === 'svg' ? 'untitled.svg' : 'untitled.md',
            filters: currentType === 'svg'
                ? [{ name: 'SVG', extensions: ['svg'] }]
                : [{ name: 'Markdown', extensions: ['md'] }]
        });
        if (result.canceled || !result.filePath) return null;
        targetPath = result.filePath;
    }

    await fs.writeFile(targetPath, content, 'utf8');
    return {
        path: targetPath,
        name: path.basename(targetPath)
    };
});

ipcMain.handle('dialog:save-pdf', async (_event, payload) => {
    const { html, title } = payload || {};
    if (typeof html !== 'string' || !html.trim()) return null;

    const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: `${(title || 'document').replace(/\.[^.]+$/, '')}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (result.canceled || !result.filePath) return null;

    const pdfWindow = new BrowserWindow({
        show: false,
        webPreferences: {
            sandbox: true,
            contextIsolation: true
        }
    });

    try {
        await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildPdfHtml({ html, title }))}`);
        const pdfBuffer = await pdfWindow.webContents.printToPDF({
            printBackground: true,
            landscape: false,
            pageSize: 'A4'
        });
        await fs.writeFile(result.filePath, pdfBuffer);
        return {
            path: result.filePath,
            name: path.basename(result.filePath)
        };
    } finally {
        if (!pdfWindow.isDestroyed()) pdfWindow.close();
    }
});

ipcMain.handle('app:get-launch-file', async () => {
    if (!pendingFilePath) return null;
    const filePath = pendingFilePath;
    pendingFilePath = null;
    return readDocument(filePath);
});
