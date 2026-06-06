const {test, expect} = require('@playwright/test');

// Seed OPFS with a file + a nested dir with a file, then init the app.
async function setupSidebar(page) {
    await page.goto('/index.html');
    await page.waitForSelector('#tree', {timeout: 5000});

    await page.evaluate(() => {
        window.getTemporaryStorageDirHandle = async function () {
            const root = await navigator.storage.getDirectory();
            const write = async (dir, name, content) => {
                const h = await dir.getFileHandle(name, {create: true});
                const w = await h.createWritable();
                await w.write(content);
                await w.close();
            };
            await write(root, 'README.md', 'Hello world');
            const lifeDir = await root.getDirectoryHandle('life', {create: true});
            await write(lifeDir, 'Pilaf.md', 'Pilaf recipe');
            return root;
        };
    });

    await page.evaluate(() => init(document.getElementById('editor')));
    await page.waitForTimeout(300);
}

// Right-click somewhere inside #sidebar that's NOT a tree-item node, so
// the node's own contextmenu handler doesn't fire and the root handler
// (attached in sidebar.js's DOMContentLoaded listener) shows its menu.
async function rightClickSidebarEmpty(page) {
    await page.evaluate(() => {
        const sb = document.getElementById('sidebar');
        sb.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true, cancelable: true, clientX: 50, clientY: 400,
        }));
    });
    await expect(page.locator('.sidebar-ctx-menu')).toBeVisible();
}

async function rightClickNode(page, name) {
    await page.locator(`#tree .tree-item:text-is("${name}")`).click({button: 'right'});
    await expect(page.locator('.sidebar-ctx-menu')).toBeVisible();
}

async function clickMenuItem(page, label) {
    await page.locator(`.sidebar-ctx-menu-item:text-is("${label}")`).click();
}

// --- root context menu -------------------------------------------------------

test('root ctx menu: new file creates a root-level file', async ({page}) => {
    await setupSidebar(page);

    // No prompt anymore - same behaviour as the toolbar #new-file button:
    // a "New file.md" is created under the targeted parent and opened.
    await rightClickSidebarEmpty(page);
    await clickMenuItem(page, 'New file');

    await expect(page.locator('#tree .tree-item:text-is("New file")')).toBeVisible();
});

test('root ctx menu: new dir creates a root-level directory', async ({page}) => {
    await setupSidebar(page);

    page.once('dialog', d => d.accept('MyRootDir'));
    await rightClickSidebarEmpty(page);
    await clickMenuItem(page, 'New dir');

    await expect(page.locator('#tree .tree-item:text-is("MyRootDir")')).toBeVisible();
});

// --- file context menu -------------------------------------------------------

test('file ctx menu: new file creates sibling in parent dir', async ({page}) => {
    await setupSidebar(page);

    await rightClickNode(page, 'README');
    await clickMenuItem(page, 'New file');

    await expect(page.locator('#tree .tree-item:text-is("New file")')).toBeVisible();
});

test('file ctx menu: new dir creates sibling dir in parent dir', async ({page}) => {
    await setupSidebar(page);

    page.once('dialog', d => d.accept('SiblingDir'));
    await rightClickNode(page, 'README');
    await clickMenuItem(page, 'New dir');

    await expect(page.locator('#tree .tree-item:text-is("SiblingDir")')).toBeVisible();
});

test('file ctx menu: rename', async ({page}) => {
    await setupSidebar(page);

    page.once('dialog', d => d.accept('Renamed'));
    await rightClickNode(page, 'README');
    await clickMenuItem(page, 'Rename');

    await expect(page.locator('#tree .tree-item:text-is("Renamed")')).toBeVisible();
    await expect(page.locator('#tree .tree-item:text-is("README")')).toHaveCount(0);
});

// Regression: renaming a file that is currently open in the editor used to
// be silently undone. The editor still showed `# README` while the path was
// already `/Renamed.md`, so the rename-from-header watcher in
// syncCurrentText (files.js:1198) saw a "filename change" back to README.md
// on its next tick and reverted the rename.
test('file ctx menu: rename of open file is not reverted by header watcher', async ({page}) => {
    test.setTimeout(15000);
    await setupSidebar(page);

    await page.click('#tree .tree-item:text-is("README")');
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue()))
        .toBe('# README\nHello world');

    page.once('dialog', d => d.accept('Renamed'));
    await rightClickNode(page, 'README');
    await clickMenuItem(page, 'Rename');

    // Wait past CURRENT_FILE_SYNC_INTERVAL (1000ms) so the periodic sync,
    // which is what used to revert the rename, has had a chance to fire.
    await page.waitForTimeout(2500);

    await expect(page.locator('#tree .tree-item:text-is("Renamed")')).toBeVisible();
    await expect(page.locator('#tree .tree-item:text-is("README")')).toHaveCount(0);

    expect(await page.evaluate(() => document.querySelector('.CodeMirror').CodeMirror.getValue()))
        .toBe('# Renamed\nHello world');
});

test('file ctx menu: move opens the move modal', async ({page}) => {
    await setupSidebar(page);

    await rightClickNode(page, 'README');
    await clickMenuItem(page, 'Move');

    await expect(page.locator('#move')).toBeVisible();
});

test('file ctx menu: delete removes the file', async ({page}) => {
    await setupSidebar(page);

    page.once('dialog', d => d.accept());
    await rightClickNode(page, 'README');
    await clickMenuItem(page, 'Delete');

    await expect(page.locator('#tree .tree-item:text-is("README")')).toHaveCount(0);
});

// --- directory context menu --------------------------------------------------

test('dir ctx menu: new file creates file inside directory', async ({page}) => {
    await setupSidebar(page);

    await rightClickNode(page, 'life');
    await clickMenuItem(page, 'New file');

    // Expand the dir to verify the child shows up.
    await page.locator('#tree .tree-item:text-is("life")').click();
    await expect(page.locator('#tree .tree-item:text-is("New file")')).toBeVisible();
});

test('dir ctx menu: new dir creates sub-directory', async ({page}) => {
    await setupSidebar(page);

    page.once('dialog', d => d.accept('SubDir'));
    await rightClickNode(page, 'life');
    await clickMenuItem(page, 'New dir');

    await page.locator('#tree .tree-item:text-is("life")').click();
    await expect(page.locator('#tree .tree-item:text-is("SubDir")')).toBeVisible();
});

test('dir ctx menu: rename', async ({page}) => {
    await setupSidebar(page);

    page.once('dialog', d => d.accept('happiness'));
    await rightClickNode(page, 'life');
    await clickMenuItem(page, 'Rename');

    await expect(page.locator('#tree .tree-item:text-is("happiness")')).toBeVisible();
    await expect(page.locator('#tree .tree-item:text-is("life")')).toHaveCount(0);
});

test('dir ctx menu: delete removes the directory', async ({page}) => {
    await setupSidebar(page);

    page.once('dialog', d => d.accept());
    await rightClickNode(page, 'life');
    await clickMenuItem(page, 'Delete');

    await expect(page.locator('#tree .tree-item:text-is("life")')).toHaveCount(0);
});
