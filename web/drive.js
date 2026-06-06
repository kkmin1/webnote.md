const DRIVE_CLIENT_ID_KEY = 'googleDriveClientId';
const DRIVE_INDEX_KEY = 'googleDriveIndex';
const DRIVE_FOLDER_ID_KEY = 'googleDriveFolderId';
const DRIVE_APP_FOLDER_NAME = 'webnote.md';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

let driveTokenClient = null;
let driveAccessToken = null;
let driveIndex = JSON.parse(localStorage.getItem(DRIVE_INDEX_KEY) || '{}');
let isDriveSyncing = false;

function isGoogleDriveConnected() {
    return !!driveAccessToken;
}

async function connectGoogleDrive() {
    if (location.protocol === 'file:') {
        alert('Google Drive sync requires opening Webnote.md from http://127.0.0.1, not file://.\n\nRun a local server and open http://127.0.0.1:8765/web/index.html');
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
        await importGoogleDriveFiles();
        await uploadAllLocalFilesToDrive();
        showToast('Google Drive connected');
    } catch (error) {
        logError('Google Drive connect failed:', error);
        alert('Google Drive 연결 실패: ' + (error.message || error));
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
    return created.id;
}

async function importGoogleDriveFiles() {
    const remoteFiles = await listDriveNoteFiles();
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
    }
    saveDriveIndex();

    if (remoteFiles.length > 0) {
        files = await loadLocalFiles(await getRootDirHandle(), true);
        await renderSidebar();
    }
}

async function uploadAllLocalFilesToDrive() {
    if (!isGoogleDriveConnected() || !files) return;

    const uploads = [];
    walk(files, path => {
        const file = getMemFile(path);
        if (!file || !file.handle) return;
        uploads.push(uploadFileHandleToDrive(path, file.handle));
    });
    await Promise.allSettled(uploads);
}

async function uploadCurrentFileToDrive(path, content) {
    if (!isGoogleDriveConnected() || isDriveSyncing) return;
    isDriveSyncing = true;
    try {
        await uploadBlobToDrive(path, new Blob([content], {type: 'text/markdown;charset=utf-8'}));
    } catch (error) {
        logError('Google Drive upload failed:', path, error);
    } finally {
        isDriveSyncing = false;
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
    const folderId = await ensureDriveAppFolder();
    const normalizedPath = path.startsWith('/') ? path : '/' + path;
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
    const query = `'${folderId}' in parents and trashed = false`;
    const fields = 'files(id,name,mimeType,modifiedTime,appProperties)';
    const response = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&pageSize=1000`)
        .then(r => r.json());
    return response.files || [];
}

async function findDriveFileByPath(path) {
    const folderId = await ensureDriveAppFolder();
    const query = [
        `'${folderId}' in parents`,
        `appProperties has { key='webnotePath' and value='${escapeDriveQuery(path)}' }`,
        'trashed = false'
    ].join(' and ');
    const response = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1`)
        .then(r => r.json());
    const id = response.files?.[0]?.id || null;
    if (id) {
        driveIndex[path] = id;
        saveDriveIndex();
    }
    return id;
}

function updateDriveButton() {
    const button = document.getElementById('drive-sync');
    if (!button) return;
    button.classList.toggle('drive-connected', isGoogleDriveConnected());
    button.title = isGoogleDriveConnected()
        ? 'Google Drive connected'
        : 'Connect Google Drive';
}

function saveDriveIndex() {
    localStorage.setItem(DRIVE_INDEX_KEY, JSON.stringify(driveIndex));
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
