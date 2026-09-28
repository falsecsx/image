import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { unzipSync } from 'fflate';

const baseUrl = process.env.CANVAS_TEST_URL || 'http://localhost:8080';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==';
const legacyProject = {
    id: 'legacy-test', title: 'Legacy Storyboard', createdAt: 1700000000000, updatedAt: 1700000001000,
    nodeOrder: ['text-1', 'loop-1', 'media-1', 'missing-media'], viewport: { x: 42, y: 18, scale: 1.25 },
    nodes: {
        'text-1': { id: 'text-1', type: 'text', title: 'Old Prompt', text: '旧项目提示词', x: 10, y: 20, width: 280, height: 160 },
        'loop-1': { id: 'loop-1', type: 'loop', title: 'Old Loop', basePrompt: '一棵树', variations: ['春天', '冬天'], x: 350, y: 20 },
        'media-1': { id: 'media-1', type: 'media', kind: 'image', title: 'Old Image', resourceId: 'cached-resource', x: 20, y: 260 },
        'missing-media': { id: 'missing-media', type: 'media', kind: 'image', title: 'Missing Media', resourceId: 'missing-resource', x: 350, y: 260 },
    },
    edges: { 'edge-1': { id: 'edge-1', fromNodeId: 'text-1', toNodeId: 'loop-1' } },
    timeline: { tracks: [{ id: 'track-video', title: '视频轨', kind: 'video' }], currentTimeMs: 0 },
};

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

async function openCanvas() {
    await page.evaluate(() => { void window.CanvasBridge.openCanvasWorkspace(); });
    const frame = page.frameLocator('.canvas-next-frame');
    await frame.locator('main').first().waitFor({ timeout: 20000 });
    return frame;
}

async function seedLegacyResource(targetPage) {
    await targetPage.evaluate(async (src) => {
        const { getCanvasResourceStore } = await import('/assets/js/canvas/canvas-resources.js');
        const store = getCanvasResourceStore();
        await store.put({ id: 'cached-resource', kind: 'image', source: { src: 'https://example.test/legacy.png', cacheKey: 'legacy-image-cache' } });
        await store.putBlob({ cacheKey: 'legacy-image-cache', blob: await (await fetch(src)).blob() });
    }, png);
}

try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    const original = JSON.stringify([legacyProject]);
    await page.evaluate((value) => localStorage.setItem('image_app:canvas_projects', value), original);
    await page.evaluate(() => {
        window.AgentBridge.getGenerationOptions = () => ({ model: 'Nano Banana', modelOptions: [{ value: 'Nano Banana', label: 'Nano Banana' }], aspect: '1:1', resolution: '2K', quality: 'auto', duration: '6' });
    });
    await seedLegacyResource(page);
    let frame = await openCanvas();
    await frame.getByText('Legacy Storyboard').first().waitFor({ timeout: 20000 });
    assert.equal(await frame.getByText('Legacy Storyboard').count(), 1);
    assert.equal(await page.evaluate(() => localStorage.getItem('image_app:canvas_projects')), original);
    assert.equal(await frame.getByRole('button', { name: '导出旧版原件' }).count(), 1);
    console.log('PASS legacy migration preserves the source and exposes export');

    const downloadPromise = page.waitForEvent('download');
    await frame.getByRole('button', { name: '导出旧版原件' }).click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /canvas-legacy-.*\.zip/);
    const archive = unzipSync(new Uint8Array(await readFile(await download.path())));
    assert.equal(JSON.parse(new TextDecoder().decode(archive['legacy-test/project.json'])).timeline.tracks[0].title, '视频轨');
    assert.ok(archive['legacy-test/resources/0.bin']?.length);
    assert.equal(JSON.parse(new TextDecoder().decode(archive['legacy-test/resources.json']))[0].id, 'cached-resource');
    console.log('PASS the original project and timeline are downloadable');

    await frame.getByText('Legacy Storyboard').first().click();
    await frame.locator('[data-node-id]').first().waitFor({ timeout: 10000 });
    assert.equal(await frame.locator('[data-node-id]').count(), 4);
    assert.match(await frame.locator('body').innerText(), /旧项目提示词/);
    assert.match(await frame.locator('body').innerText(), /Missing Media/);
    console.log('PASS legacy nodes, missing media placeholders, and connections appear in the new editor');

    await frame.getByRole('button', { name: '返回画布列表' }).click();
    await frame.getByText('Legacy Storyboard').first().waitFor({ timeout: 10000 });
    assert.equal(await page.locator('.canvas-next-frame').evaluate((element) => element.contentWindow?.location.hash), '#/canvas');
    console.log('PASS editor back action returns to the canvas project list');
    await frame.getByText('Legacy Storyboard').first().click();
    await frame.locator('[data-node-id]').first().waitFor({ timeout: 10000 });

    const movableNode = frame.locator('[data-node-id="media-1"]');
    const startPosition = await movableNode.getAttribute('style');
    const nodeBox = await movableNode.boundingBox();
    assert.ok(nodeBox);
    await page.mouse.move(nodeBox.x + nodeBox.width / 2, nodeBox.y + nodeBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(nodeBox.x + nodeBox.width / 2 + 60, nodeBox.y + nodeBox.height / 2 + 45, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(450);
    assert.notEqual(await movableNode.getAttribute('style'), startPosition);
    await frame.getByRole('button', { name: '撤销' }).click();
    await page.waitForTimeout(100);
    assert.equal(await movableNode.getAttribute('style'), startPosition);
    const startViewport = await movableNode.evaluate((node) => node.parentElement.style.transform);
    const zoomBox = await movableNode.boundingBox();
    await page.mouse.move(zoomBox.x + zoomBox.width / 2, zoomBox.y + zoomBox.height / 2);
    await page.mouse.wheel(0, -180);
    await page.waitForTimeout(100);
    assert.notEqual(await movableNode.evaluate((node) => node.parentElement.style.transform), startViewport);
    console.log('PASS node drag, undo, and wheel zoom work in the editor');

    await page.evaluate(() => {
        window.__generationCalls = [];
        window.CanvasBridge.runGeneration = async (kind, prompt, options) => {
            window.__generationCalls.push({ kind, prompt, model: options.model });
            return { result: { imageBase64: 'iVBORw0KGgo=', mime: 'image/png' }, params: {} };
        };
    });
    const generated = await frame.locator('body').evaluate(() => new Promise((resolve) => {
        const id = 'rpc-generate-test';
        const receive = (event) => {
            if (event.data?.id !== id) return;
            window.removeEventListener('message', receive);
            resolve(event.data);
        };
        window.addEventListener('message', receive);
        window.parent.postMessage({ canvasBridge: 1, type: 'request', id, method: 'generate', payload: { kind: 'image', prompt: 'test', images: [], options: { model: 'arbitrary-model-id' } } }, location.origin);
    }));
    assert.equal(generated.payload?.result?.mime, 'image/png');
    assert.deepEqual(await page.evaluate(() => window.__generationCalls), [{ kind: 'image', prompt: 'test', model: 'arbitrary-model-id' }]);
    await page.evaluate(() => window.postMessage({ canvasBridge: 1, type: 'request', id: 'forged', method: 'generate', payload: { kind: 'image', prompt: 'forged' } }, location.origin));
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__generationCalls.length), 1);
    console.log('PASS bridge accepts arbitrary model IDs but rejects the wrong message source');

    await page.evaluate(() => {
        window.__generationAborted = false;
        window.CanvasBridge.runGeneration = (kind, prompt, options) => new Promise((resolve, reject) => {
            options.signal.addEventListener('abort', () => {
                window.__generationAborted = true;
                reject(new DOMException('Aborted', 'AbortError'));
            }, { once: true });
        });
    });
    await frame.locator('body').evaluate(() => {
        const id = 'rpc-cancel-test';
        window.parent.postMessage({ canvasBridge: 1, type: 'request', id, method: 'generate', payload: { kind: 'video', prompt: 'test video', images: [], options: {} } }, location.origin);
        window.parent.postMessage({ canvasBridge: 1, type: 'cancel', id }, location.origin);
    });
    await page.waitForFunction(() => window.__generationAborted === true);
    console.log('PASS cancellation aborts the active video request');

    await page.evaluate(() => {
        window.CanvasBridge.runGeneration = async (kind) => ({ result: kind === 'video' ? { videoSrc: 'https://example.test/video.mp4' } : {}, params: {} });
    });
    const videoResult = await frame.locator('body').evaluate(() => new Promise((resolve) => {
        const id = 'rpc-video-test';
        const receive = (event) => {
            if (event.data?.id !== id) return;
            window.removeEventListener('message', receive);
            resolve(event.data);
        };
        window.addEventListener('message', receive);
        window.parent.postMessage({ canvasBridge: 1, type: 'request', id, method: 'generate', payload: { kind: 'video', prompt: 'test video', images: [], options: {} } }, location.origin);
    }));
    assert.equal(videoResult.payload?.result?.videoSrc, 'https://example.test/video.mp4');
    console.log('PASS video generation uses the host route');

    await page.evaluate(() => { window.AgentBridge.getTextCapabilityStatus = () => ({ available: false, message: '需要兼容中转' }); });
    const textResult = await frame.locator('body').evaluate(() => new Promise((resolve) => {
        const id = 'rpc-text-test';
        const receive = (event) => {
            if (event.data?.id !== id) return;
            window.removeEventListener('message', receive);
            resolve(event.data);
        };
        window.addEventListener('message', receive);
        window.parent.postMessage({ canvasBridge: 1, type: 'request', id, method: 'text', payload: { messages: [] } }, location.origin);
    }));
    assert.match(textResult.error, /需要兼容中转/);
    console.log('PASS text capability is blocked by the host');

    await page.evaluate((src) => { void window.CanvasBridge.openCanvasWorkspace({ importSources: [{ src, label: 'Studio import' }] }); }, png);
    await frame.locator('[data-node-id]').nth(4).waitFor({ timeout: 15000 });
    assert.equal(await frame.locator('[data-node-id]').count(), 5);
    console.log('PASS Studio import reaches the active project');

    await page.evaluate((src) => {
        window.__generationCalls = [];
        window.CanvasBridge.runGeneration = async (kind, prompt, options) => {
            window.__generationCalls.push({ kind, prompt, model: options.model, resolution: options.resolution });
            return { result: { imageBase64: src, mime: 'image/png' }, params: {} };
        };
    }, png);
    await frame.locator('[data-node-id="missing-media"]').click();
    const promptPanel = frame.locator('[data-node-id="missing-media"]');
    await promptPanel.getByRole('textbox').fill('A red square');
    await promptPanel.getByRole('button', { name: '生成', exact: true }).click();
    await frame.locator('[data-node-id="missing-media"] img').first().waitFor({ state: 'attached', timeout: 15000 });
    assert.equal(await frame.locator('[data-node-id="missing-media"] img').first().evaluate((image) => image.complete && image.naturalWidth > 0), true);
    assert.deepEqual(await page.evaluate(() => window.__generationCalls), [{ kind: 'image', prompt: 'A red square', model: 'Nano Banana', resolution: '2K' }]);
    console.log('PASS editor image generation uses the selected host model and displays the result');

    await page.waitForTimeout(800);
    await page.reload({ waitUntil: 'domcontentloaded' });
    frame = await openCanvas();
    await frame.getByText('Legacy Storyboard').first().waitFor({ timeout: 20000 });
    assert.equal(await frame.getByText('Legacy Storyboard').count(), 1);
    assert.equal(await page.evaluate(() => localStorage.getItem('image_app:canvas_projects')), original);
    console.log('PASS migration is idempotent across reloads');
    await frame.locator('body').evaluate(() => { window.location.hash = '#/canvas'; });
    const legacyCard = frame.locator('article').filter({ hasText: 'Legacy Storyboard' });
    await legacyCard.getByRole('button', { name: '删除' }).click();
    await frame.locator('.ant-modal-footer button').last().click();
    await legacyCard.waitFor({ state: 'detached' });
    await page.waitForTimeout(800);
    await page.reload({ waitUntil: 'domcontentloaded' });
    frame = await openCanvas();
    await frame.getByRole('button', { name: '导出旧版原件' }).waitFor();
    assert.equal(await frame.getByText('Legacy Storyboard').count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem('image_app:canvas_projects')), original);
    console.log('PASS deleting a migrated project does not re-import it, while the original remains exportable');
    await page.getByRole('button', { name: '返回 Studio' }).click();
    await page.waitForFunction(() => document.getElementById('canvas-workspace-root')?.hidden === true);
    assert.equal(await page.locator('[data-workspace-nav="studio"]').evaluate((button) => button.classList.contains('is-active')), true);
    assert.equal(await page.evaluate(() => document.body.dataset.activeWorkspace), 'studio');
    assert.equal(await page.locator('.app.studio-layout').evaluate((element) => element.hidden === false && !element.inert), true);
    assert.equal(await page.locator('#canvas-workspace-root').evaluate((element) => element.inert && element.getAttribute('aria-hidden') === 'true'), true);
    console.log('PASS host back action exits the canvas workspace to Studio');
    assert.deepEqual(errors, []);
    console.log('PASS no browser errors');

    const failureContext = await browser.newContext();
    try {
        await failureContext.addInitScript(() => {
            const put = IDBObjectStore.prototype.put;
            IDBObjectStore.prototype.put = function (...args) {
                if (this.name === 'image_files') throw new DOMException('Quota exceeded', 'QuotaExceededError');
                return put.apply(this, args);
            };
        });
        const failurePage = await failureContext.newPage();
        await failurePage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
        await failurePage.evaluate((value) => localStorage.setItem('image_app:canvas_projects', value), original);
        await seedLegacyResource(failurePage);
        await failurePage.evaluate(() => { void window.CanvasBridge.openCanvasWorkspace(); });
        await failurePage.locator('[data-canvas-next-status][data-tone="danger"]').waitFor({ timeout: 20000 });
        assert.match(await failurePage.locator('[data-canvas-next-status]').innerText(), /旧数据仍保留/);
        assert.equal(await failurePage.evaluate(() => localStorage.getItem('image_app:canvas_projects')), original);
        console.log('PASS storage failure leaves the legacy project intact and visible error feedback');
    } finally {
        await failureContext.close();
    }
} finally {
    await context.close();
    await browser.close();
}
