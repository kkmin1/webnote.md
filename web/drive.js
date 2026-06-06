const DRIVE_CLIENT_ID_KEY = 'googleDriveClientId';
const DRIVE_INDEX_KEY = 'googleDriveIndex';
const DRIVE_FOLDER_ID_KEY = 'googleDriveFolderId';
const DRIVE_FOLDER_INDEX_KEY = 'googleDriveFolderIndex';
const DRIVE_APP_FOLDER_NAME = 'webnote.md';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

let driveTokenClient = null;
let driveAccessToken = null;
let driveIndex = JSON.parse(localStorage.getItem(DRIVE_INDEX_KEY) || '{}');
let driveFolderIndex = JSON.parse(localStorage.getItem(DRIVE_FOLDER_INDEX_KEY) || '{}');
let driveFolderPromises = {};
let isDriveSyncing = false;

function isGoogleDriveConnected() {
    return !!driveAccessToken;
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

async function syncGoogleDriveNow() {
    if (!isGoogleDriveConnected() || isDriveSyncing) return;
    isDriveSyncing = true;
    try {
        await importGoogleDriveFiles();
        updateDriveButton();
        showToast('Google Drive synced');
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
                driveAccessToken = response.access_token;
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
    const savedFolderId = localStorage.getItem(DRIVE_FOLDER_ID_KEY);
    if (savedFolderId) return savedFolderId;

    const query = [
        `name = '${escapeDriveQuery(DRIVE_APP_FOLDER_NAME)}'`,
        `mimeType = 'application/vnd.google-apps.folder'`,
        'trashed = false'
    ].join(' and ');
    const existing = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`)
        .then(r => r.json());
    if (existing.files && existing.files.length > 0) {
        localStorage.setItem(DRIVE_FOLDER_ID_KEY, existing.files[0].id);
        driveFolderIndex['/'] = existing.files[0].id;
        saveDriveFolderIndex();
        return existing.files[0].id;
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

async function importGoogleDriveFiles(remoteFiles) {
    remoteFiles = remoteFiles || await listDriveNoteFiles();
    const importedPaths = [];
    for (const file of remoteFiles) {
        const notePath = file.appProperties?.webnotePath;
        if (!notePath) continue;

        const contentResponse = await driveFetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
        const blob = await contentResponse.blob();
        const content = file.mimeType.startsWith('text/') || notePath.endsWith('.md')
            ? await blob.text()
            : blob;
        await write(notePath, content);
        driveIndex[notePath] = file.id;
        importedPaths.push(notePath);
    }
    saveDriveIndex();

    if (remoteFiles.length > 0) {
        files = await loadLocalFiles(await getRootDirHandle(), true);
        await renderSidebar();
        await refreshCurrentEditorAfterDriveImport(importedPaths);
    }
}

async function refreshCurrentEditorAfterDriveImport(importedPaths) {
    if (!window.currentEditor || !currentEditor.path || !currentEditor.isClean()) {
        return;
    }
    if (!importedPaths.includes(currentEditor.path)) {
        return;
    }

    const el = currentEditor === editor2 ? 'editor2-textarea' : 'editor-textarea';
    await openFile(currentEditor.path, false, el);
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

document.addEventListener('DOMContentLoaded', updateDriveButton);
