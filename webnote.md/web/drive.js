const DRIVE_CLIENT_ID_KEY = 'googleDriveClientId';
const DRIVE_INDEX_KEY = 'googleDriveIndex';
const DRIVE_FOLDER_ID_KEY = 'googleDriveFolderId';
const DRIVE_FOLDER_INDEX_KEY = 'googleDriveFolderIndex';
const DRIVE_APP_FOLDER_NAME = 'webnote.md';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_AUTO_IMPORT_INTERVAL = 10000;

const DRIVE_TOKEN_KEY = 'googleDriveAccessToken';
const DRIVE_TOKEN_EXPIRY_KEY = 'googleDriveTokenExpiry';
const DRIVE_REDIRECT_PENDING_KEY = 'googleDriveRedirectPending';

let driveTokenClient = null;
let driveAccessToken = null;
let driveIndex = JSON.parse(localStorage.getItem(DRIVE_INDEX_KEY) || '{}');
let driveFolderIndex = JSON.parse(localStorage.getItem(DRIVE_FOLDER_INDEX_KEY) || '{}');
let driveFolderPromises = {};
let isDriveSyncing = false;

function isMobileBrowser() {
    return /Mobi|Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function isGoogleDriveConnected() {
    return !!driveAccessToken;
}

function restoreDriveTokenFromSession() {
    const token = sessionStorage.getItem(DRIVE_TOKEN_KEY);
    const expiry = parseInt(sessionStorage.getItem(DRIVE_TOKEN_EXPIRY_KEY) || '0', 10);
    if (token && expiry && Date.now() < expiry) {
        driveAccessToken = token;
        return true;
    }
    sessionStorage.removeItem(DRIVE_TOKEN_KEY);
    sessionStorage.removeItem(DRIVE_TOKEN_EXPIRY_KEY);
    return false;
}

function saveDriveTokenToSession(token, expiresInSeconds) {
    driveAccessToken = token;
    sessionStorage.setItem(DRIVE_TOKEN_KEY, token);
    const expiry = Date.now() + (parseInt(expiresInSeconds, 10) || 3600) * 1000 - 60000;
    sessionStorage.setItem(DRIVE_TOKEN_EXPIRY_KEY, String(expiry));
}

function startGoogleDriveRedirectAuth(clientId) {
    const redirectUri = location.origin + location.pathname;
    const state = Math.random().toString(36).slice(2);
    sessionStorage.setItem(DRIVE_REDIRECT_PENDING_KEY, state);
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'token',
        scope: DRIVE_SCOPE,
        include_granted_scopes: 'true',
        state: state,
        prompt: ''
    });
    location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
}

async function handleGoogleDriveRedirectResult() {
    if (!location.hash || location.hash.length < 2) return false;
    const hashParams = new URLSearchParams(location.hash.slice(1));
    const token = hashParams.get('access_token');
    if (!token) return false;

    const pendingState = sessionStorage.getItem(DRIVE_REDIRECT_PENDING_KEY);
    const returnedState = hashParams.get('state');
    sessionStorage.removeItem(DRIVE_REDIRECT_PENDING_KEY);
    if (pendingState && returnedState !== pendingState) {
        logError('Google Drive redirect state mismatch');
        return false;
    }

    saveDriveTokenToSession(token, hashParams.get('expires_in'));
    history.replaceState(null, '', location.origin + location.pathname + location.search);
    updateDriveButton();

    try {
        await ensureDriveAppFolder();
        const remoteFiles = await listDriveNoteFiles();
        if (remoteFiles.length === 0) {
            await uploadAllLocalFilesToDrive();
        } else {
            await importGoogleDriveFiles(remoteFiles);
        }
        showToast('Google Drive connected');
    } catch (error) {
        logError('Google Drive redirect sync failed:', error);
        alert('Google Drive 연결 실패: ' + (error.message || error));
    }
    return true;
}

async function connectGoogleDrive() {
    if (location.protocol === 'file:') {
        alert('Google Drive sync requires opening Webnote.md from http://127.0.0.1, not file://.\n\nRun a local server and open http://127.0.0.1:8765/web/index.html');
        return;
    }

    if (isGoogleDriveConnected()) {
        await syncGoogleDriveNow();
        return;
    }

    let clientId = localStorage.getItem(DRIVE_CLIENT_ID_KEY);
    if (!clientId) {
        clientId = prompt('Google OAuth Web Client ID:');
        if (!clientId) return;
        localStorage.setItem(DRIVE_CLIENT_ID_KEY, clientId.trim());
        clientId = clientId.trim();
    }

    if (isMobileBrowser()) {
        startGoogleDriveRedirectAuth(clientId);
        return;
    }

    try {
        await requestGoogleDriveToken(clientId);
        await ensureDriveAppFolder();
        if (isGoogleDriveConnected()) {
            const remoteFiles = await listDriveNoteFiles();
            if (remoteFiles.length === 0) {
                await uploadAllLocalFilesToDrive();
            } else {
                await importGoogleDriveFiles(remoteFiles);
            }
        }
        showToast('Google Drive connected');
    } catch (error) {
        logError('Google Drive connect failed:', error);
        alert('Google Drive 연결 실패: ' + (error.message || error));
    }
}

async function syncGoogleDriveNow(options = {}) {
    if (!isGoogleDriveConnected() || isDriveSyncing) return;
    isDriveSyncing = true;
    try {
        const importedCount = await importGoogleDriveFiles();
        updateDriveButton();
        if (!options.silent) {
            showToast(`Google Drive synced (${importedCount} files)`);
        }
    } catch (error) {
        logError('Google Drive sync failed:', error);
    } finally {
        isDriveSyncing = false;
    }
}

function requestGoogleDriveToken(clientId) {
    return new Promise((resolve, reject) => {
        if (!window.google?.accounts?.oauth2) {
            reject(new Error('Google Identity Services is not loaded yet. Try again in a moment.'));
            return;
        }

        driveTokenClient = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: DRIVE_SCOPE,
            callback: response => {
                if (response.error) {
                    reject(new Error(response.error));
                    return;
                }
                saveDriveTokenToSession(response.access_token, response.expires_in);
                updateDriveButton();
                resolve(response);
            }
        });
        driveTokenClient.requestAccessToken({prompt: ''});
    });
}

async function driveFetch(url, options = {}) {
    if (!driveAccessToken) {
        throw new Error('Google Drive is not connected');
    }

    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${driveAccessToken}`);
    const response = await fetch(url, {...options, headers});
    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Drive API ${response.status}: ${body}`);
    }
    return response;
}

async function ensureDriveAppFolder() {
    const query = [
        `name = '${escapeDriveQuery(DRIVE_APP_FOLDER_NAME)}'`,
        `mimeType = 'application/vnd.google-apps.folder'`,
        'trashed = false'
    ].join(' and ');
    const existing = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime)&pageSize=100`)
        .then(r => r.json());
    if (existing.files && existing.files.length > 0) {
        const folder = await selectBestDriveAppFolder(existing.files);
        localStorage.setItem(DRIVE_FOLDER_ID_KEY, folder.id);
        driveFolderIndex['/'] = folder.id;
        saveDriveFolderIndex();
        return folder.id;
    }

    const created = await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            name: DRIVE_APP_FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder'
        })
    }).then(r => r.json());
    localStorage.setItem(DRIVE_FOLDER_ID_KEY, created.id);
    driveFolderIndex['/'] = created.id;
    saveDriveFolderIndex();
    return created.id;
}

async function selectBestDriveAppFolder(folders) {
    const savedFolderId = localStorage.getItem(DRIVE_FOLDER_ID_KEY);
    let best = null;
    for (const folder of folders) {
        const fileCount = await countDriveFilesInFolder(folder.id);
        const score = fileCount * 10000000000000 + Date.parse(folder.modifiedTime || 0);
        if (!best || score > best.score || (folder.id === savedFolderId && score === best.score)) {
            best = {folder, score};
        }
    }
    return best.folder;
}

async function countDriveFilesInFolder(folderId) {
    const query = `'${folderId}' in parents and trashed = false`;
    const fields = 'files(id,mimeType)';
    const response = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=1000`)
        .then(r => r.json());
    let count = 0;
    for (const entry of response.files || []) {
        if (entry.mimeType === 'application/vnd.google-apps.folder') {
            count += await countDriveFilesInFolder(entry.id);
        } else {
            count++;
        }
    }
    return count;
}

async function importGoogleDriveFiles(remoteFiles) {
    remoteFiles = remoteFiles || await listDriveNoteFiles();
    const importedPaths = [];
    const safeRefreshPaths = new Set();
    for (const file of remoteFiles) {
        const notePath = file.appProperties?.webnotePath;
        if (!notePath) continue;

        const contentResponse = await driveFetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
        const blob = await contentResponse.blob();
        const content = file.mimeType.startsWith('text/') || notePath.endsWith('.md')
            ? await blob.text()
            : blob;
        const previousContent = await read(notePath).catch(() => null);
        if (canRefreshOpenEditorFromDrive(notePath, previousContent)) {
            safeRefreshPaths.add(notePath);
        }
        if (typeof content === 'string' && previousContent === content) {
            driveIndex[notePath] = file.id;
            continue;
        }
        await write(notePath, content);
        await updateMemFileAfterDriveImport(notePath, content, blob);
        driveIndex[notePath] = file.id;
        importedPaths.push(notePath);
    }
    saveDriveIndex();

    if (remoteFiles.length > 0) {
        await renderSidebar();
        await refreshOpenEditorsAfterDriveImport(importedPaths, safeRefreshPaths);
    }
    return importedPaths.length;
}

async function updateMemFileAfterDriveImport(path, content, blob) {
    const fileHandle = await getFileHandle(path);
    const file = await fileHandle.getFile();
    const ext = path.split('.').pop().toLowerCase();
    const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext);
    const memFile = {
        isFile: true,
        content: typeof content === 'string' ? content : undefined,
        lastModified: file.lastModified,
        path: path,
        handle: fileHandle,
        imageUrl: isImage ? URL.createObjectURL(blob) : null
    };
    addMemFile(path, memFile);
    if (isImage && mediaIndex) {
        mediaIndex[toFilename(path)] = memFile;
    }
}

function canRefreshOpenEditorFromDrive(path, previousContent) {
    return canRefreshEditorFromDrive(editor, path, previousContent)
        || canRefreshEditorFromDrive(editor2, path, previousContent);
}

function canRefreshEditorFromDrive(editorInstance, path, previousContent) {
    if (!editorInstance || editorInstance.path !== path) return false;
    if (editorInstance.isClean()) return true;
    return typeof previousContent === 'string'
        && getEditorContentForPath(editorInstance, path) === previousContent;
}

function getEditorContentForPath(editorInstance, path) {
    let content = editorInstance.getValue();
    const header = toHeader(toFilename(path)).toLowerCase();
    if (content.toLowerCase().startsWith(header)) {
        content = content.slice(`${header}\n`.length);
    } else if (content.toLowerCase().startsWith('# ')) {
        content = content.slice(`# \n`.length);
    }
    return content;
}

async function refreshOpenEditorsAfterDriveImport(importedPaths, safeRefreshPaths) {
    let skippedDirtyEditor = false;
    for (const editorInstance of [editor, editor2]) {
        if (!editorInstance || !editorInstance.path) continue;
        if (!importedPaths.includes(editorInstance.path)) continue;
        if (!editorInstance.isClean() && !safeRefreshPaths.has(editorInstance.path)) {
            skippedDirtyEditor = true;
            continue;
        }

        const content = await read(editorInstance.path);
        editorInstance.getDoc().setValue(toHeader(toFilename(editorInstance.path)) + '\n' + content);
        editorInstance.clearHistory();
        editorInstance.markClean();
    }
    if (skippedDirtyEditor) {
        showToast('Drive changes imported; unsaved local editor was not replaced');
    }
}

async function uploadAllLocalFilesToDrive() {
    if (!isGoogleDriveConnected() || !files) return;

    const paths = [];
    walk(files, path => {
        const file = getMemFile(path);
        if (!file || !file.handle) return;
        paths.push(path);
    });
    for (const path of paths) {
        const file = getMemFile(path);
        if (!file || !file.handle) continue;
        await uploadFileHandleToDrive(path, file.handle);
    }
}

async function uploadCurrentFileToDrive(path, content) {
    if (!isGoogleDriveConnected()) return;
    try {
        await uploadBlobToDrive(path, new Blob([content], {type: 'text/markdown;charset=utf-8'}));
    } catch (error) {
        logError('Google Drive upload failed:', path, error);
    }
}

async function uploadFileHandleToDrive(path, fileHandle) {
    if (!isGoogleDriveConnected()) return;
    try {
        const file = await fileHandle.getFile();
        await uploadBlobToDrive(path, file);
    } catch (error) {
        logError('Google Drive media upload failed:', path, error);
    }
}

async function uploadBlobToDrive(path, blob) {
    const normalizedPath = path.startsWith('/') ? path : '/' + path;
    const folderId = await ensureDriveFolderForPath(toDirPath(normalizedPath));
    const fileId = driveIndex[normalizedPath] || await findDriveFileByPath(normalizedPath);
    const metadata = {
        name: toFilename(normalizedPath),
        parents: fileId ? undefined : [folderId],
        appProperties: {webnotePath: normalizedPath}
    };

    const boundary = 'webnote-' + Math.random().toString(36).slice(2);
    const body = new Blob([
        `--${boundary}\r\n`,
        'Content-Type: application/json; charset=UTF-8\r\n\r\n',
        JSON.stringify(metadata),
        `\r\n--${boundary}\r\n`,
        `Content-Type: ${blob.type || mimeTypeForPath(normalizedPath)}\r\n\r\n`,
        blob,
        `\r\n--${boundary}--`
    ]);

    const url = fileId
        ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id`
        : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
    const uploaded = await driveFetch(url, {
        method: fileId ? 'PATCH' : 'POST',
        headers: {'Content-Type': `multipart/related; boundary=${boundary}`},
        body
    }).then(r => r.json());

    driveIndex[normalizedPath] = uploaded.id;
    saveDriveIndex();
    updateDriveButton();
}

async function listDriveNoteFiles() {
    const folderId = await ensureDriveAppFolder();
    const query = [
        `'${folderId}' in parents`,
        'trashed = false'
    ].join(' and ');
    const fields = 'files(id,name,mimeType,modifiedTime,appProperties)';
    const response = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=1000`)
        .then(r => r.json());
    const files = [];
    await collectDriveFiles(response.files || [], files);
    return files;
}

async function collectDriveFiles(entries, output) {
    for (const entry of entries) {
        if (entry.mimeType === 'application/vnd.google-apps.folder') {
            const folderPath = entry.appProperties?.webnotePath;
            if (folderPath) {
                driveFolderIndex[folderPath] = entry.id;
            }
            const query = `'${entry.id}' in parents and trashed = false`;
            const fields = 'files(id,name,mimeType,modifiedTime,appProperties)';
            const children = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=1000`)
                .then(r => r.json());
            await collectDriveFiles(children.files || [], output);
        } else {
            output.push(entry);
        }
    }
    saveDriveFolderIndex();
}

async function findDriveFileByPath(path) {
    const query = [
        `appProperties has { key='webnotePath' and value='${escapeDriveQuery(path)}' }`,
        'trashed = false'
    ].join(' and ');
    const response = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,parents)&pageSize=10`)
        .then(r => r.json());
    const id = response.files?.[0]?.id || null;
    if (id) {
        driveIndex[path] = id;
        saveDriveIndex();
    }
    return id;
}

async function ensureDriveFolderForPath(dirPath) {
    const rootId = await ensureDriveAppFolder();
    const normalizedDir = normalizeDriveDirPath(dirPath);
    if (normalizedDir === '/') return rootId;
    if (driveFolderIndex[normalizedDir]) return driveFolderIndex[normalizedDir];
    if (driveFolderPromises[normalizedDir]) return await driveFolderPromises[normalizedDir];

    driveFolderPromises[normalizedDir] = createDriveFolderPath(normalizedDir, rootId)
        .finally(() => delete driveFolderPromises[normalizedDir]);
    return await driveFolderPromises[normalizedDir];
}

async function createDriveFolderPath(normalizedDir, rootId) {
    const parts = normalizedDir.split('/').filter(Boolean);
    let parentId = rootId;
    let currentPath = '';
    for (const part of parts) {
        currentPath = currentPath + '/' + part;
        if (driveFolderIndex[currentPath]) {
            parentId = driveFolderIndex[currentPath];
            continue;
        }

        const existingId = await findDriveFolder(parentId, part, currentPath);
        if (existingId) {
            driveFolderIndex[currentPath] = existingId;
            parentId = existingId;
            saveDriveFolderIndex();
            continue;
        }

        const created = await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                name: part,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId],
                appProperties: {webnotePath: currentPath}
            })
        }).then(r => r.json());
        driveFolderIndex[currentPath] = created.id;
        parentId = created.id;
        saveDriveFolderIndex();
    }
    return parentId;
}

async function findDriveFolder(parentId, name, path) {
    const query = [
        `'${parentId}' in parents`,
        `name = '${escapeDriveQuery(name)}'`,
        `mimeType = 'application/vnd.google-apps.folder'`,
        'trashed = false'
    ].join(' and ');
    const response = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,appProperties)&pageSize=1`)
        .then(r => r.json());
    const folder = response.files?.[0];
    if (!folder) return null;
    if (!folder.appProperties?.webnotePath) {
        await driveFetch(`https://www.googleapis.com/drive/v3/files/${folder.id}`, {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({appProperties: {webnotePath: path}})
        });
    }
    return folder.id;
}

function updateDriveButton() {
    const button = document.getElementById('drive-sync');
    if (!button) return;
    button.classList.toggle('drive-connected', isGoogleDriveConnected());
    button.title = isGoogleDriveConnected()
        ? 'Google Drive connected - click to sync now'
        : 'Connect Google Drive';
}

function saveDriveIndex() {
    localStorage.setItem(DRIVE_INDEX_KEY, JSON.stringify(driveIndex));
}

function saveDriveFolderIndex() {
    localStorage.setItem(DRIVE_FOLDER_INDEX_KEY, JSON.stringify(driveFolderIndex));
}

function normalizeDriveDirPath(path) {
    if (!path || path === '.') return '/';
    let normalized = path.startsWith('/') ? path : '/' + path;
    normalized = normalized.replace(/\/+/g, '/').replace(/\/$/, '');
    return normalized || '/';
}

function escapeDriveQuery(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function mimeTypeForPath(path) {
    const ext = path.split('.').pop().toLowerCase();
    const types = {
        md: 'text/markdown;charset=utf-8',
        txt: 'text/plain;charset=utf-8',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp'
    };
    return types[ext] || 'application/octet-stream';
}

async function autoImportGoogleDriveChanges() {
    if (!isGoogleDriveConnected()
        || isDriveSyncing
        || document.hidden
        || !window.currentEditor
        || !currentEditor.path
        || !currentEditor.isClean()) {
        return;
    }
    await syncGoogleDriveNow({silent: true});
}

async function initGoogleDriveOnLoad() {
    const handledRedirect = await handleGoogleDriveRedirectResult();
    if (!handledRedirect && restoreDriveTokenFromSession()) {
        try {
            await syncGoogleDriveNow({silent: true});
        } catch (error) {
            logError('Google Drive restore sync failed:', error);
        }
    }
    updateDriveButton();
}

document.addEventListener('DOMContentLoaded', initGoogleDriveOnLoad);
setInterval(autoImportGoogleDriveChanges, DRIVE_AUTO_IMPORT_INTERVAL);
