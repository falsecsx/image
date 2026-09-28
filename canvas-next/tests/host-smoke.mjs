import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.CANVAS_TEST_URL || 'http://localhost:8080';
const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
});
const errors = [];
try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        page.on('pageerror', (error) => errors.push(`${viewport.width}: ${error.message}`));
        page.on('console', (message) => {
            if (message.type() === 'error') errors.push(`${viewport.width}: ${message.text()}`);
        });
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
        const returnPositions = [];
        async function checkWorkspaceBack(selector, label) {
            const back = page.locator(selector);
            assert.equal(await back.getAttribute('aria-label'), '返回 Studio', `${label}: return target is accessible`);
            assert.equal(await back.getAttribute('title'), '返回 Studio', `${label}: return target has a tooltip`);
            assert.equal(await back.getAttribute('data-workspace-back'), '', `${label}: return uses the shared DOM contract`);
            const position = await back.boundingBox();
            assert.ok(position && position.width >= 44 && position.height >= 44, `${label}: return touch target is at least 44px`);
            assert.ok(Math.abs(position.x - (viewport.width <= 900 ? 8 : 16)) <= 2 && position.y < 8, `${label}: return is at the workspace top-left`);
            returnPositions.push({ label, ...position });
            for (const other of returnPositions) {
                assert.ok(Math.abs(other.x - position.x) <= 2 && Math.abs(other.y - position.y) <= 2, `${label}: return aligns with ${other.label} within 2px`);
            }
        }
        await page.evaluate(() => { void window.CanvasBridge.openCanvasWorkspace(); });
        console.log(JSON.stringify({ afterClick: {
            rootHtml: (await page.locator('#canvas-workspace-root').innerHTML()).slice(0, 400),
            rootHidden: await page.locator('#canvas-workspace-root').getAttribute('hidden'),
            errors,
        } }));
        const frame = page.frameLocator('.canvas-next-frame');
        await frame.locator('body').waitFor({ timeout: 5000 }).catch(() => undefined);
        await page.waitForTimeout(2500);
        assert.equal(await page.locator('[data-canvas-next-close]').getAttribute('aria-label'), '返回 Studio');
        assert.equal(await page.locator('[data-canvas-next-more]').count(), 1);
        assert.equal(await page.locator('[data-canvas-next-close]').isVisible(), true);
        await checkWorkspaceBack('[data-canvas-next-close]', 'Canvas');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `${viewport.width}: host has no horizontal overflow`);
        const canvasFrame = page.frames().find((item) => item.url().includes('/assets/canvas-app/'));
        assert.ok(canvasFrame, `${viewport.width}: canvas iframe is available`);
        assert.equal(await canvasFrame.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `${viewport.width}: canvas has no horizontal overflow`);
        assert.equal(await frame.getByRole('button', { name: '新建画布' }).first().isVisible(), true, `${viewport.width}: primary project action is visible`);
        assert.equal(await frame.getByRole('button', { name: '导入画布' }).isVisible().catch(() => false), viewport.width > 600, `${viewport.width}: import action follows the responsive layout`);
        if (viewport.width <= 600) {
            await frame.getByRole('button', { name: '更多画布操作' }).click();
            const mobileImportAction = frame.getByRole('menuitem', { name: '导入画布' });
            await mobileImportAction.waitFor({ state: 'visible', timeout: 3000 });
            assert.equal(await mobileImportAction.isVisible(), true, 'mobile project action menu opens');
            await page.keyboard.press('Escape');
        }
        if (viewport.width <= 600) {
            await page.locator('[data-canvas-next-more]').click();
            assert.equal(await page.locator('[data-canvas-next-more-menu]').isVisible(), true, 'mobile host action menu opens');
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('[data-canvas-next-more-menu]').isVisible(), false, 'mobile host action menu closes with Escape');
        }
        await page.locator('[data-canvas-next-close]').click();
        await page.waitForFunction(() => {
            const root = document.getElementById('canvas-workspace-root');
            const studio = document.querySelector('.app.studio-layout');
            return root?.hidden === true
                && document.body.dataset.activeWorkspace === 'studio'
                && studio?.hidden === false
                && !studio?.inert
                && !document.body.classList.contains('canvas-workspace-open');
        });
        assert.equal(await page.locator('.app.studio-layout').isVisible(), true, `${viewport.width}: returning to Studio restores the host shell`);
        assert.equal(await page.locator('#canvas-workspace-root').isVisible(), false, `${viewport.width}: returning to Studio hides the canvas iframe host`);
        await page.evaluate(() => { void window.CanvasBridge.openCanvasWorkspace(); });
        await page.locator('.canvas-next-frame').waitFor();
        await page.waitForTimeout(600);
        const details = {
            viewport,
            frameUrl: await page.locator('.canvas-next-frame').getAttribute('src', { timeout: 1000 }).catch(() => ''),
            projectPage: await frame.locator('main').first().innerText({ timeout: 1000 }).catch(() => ''),
            rootVisible: await page.locator('#canvas-workspace-root').isVisible(),
            iframeVisible: await page.locator('.canvas-next-frame').isVisible().catch(() => false),
            rootHtml: (await page.locator('#canvas-workspace-root').innerHTML()).slice(0, 400),
            mainErrors: errors.slice(-8),
        };
        await page.screenshot({ path: `../tmp/canvas-next-${viewport.width}.png`, fullPage: true });
        console.log(JSON.stringify(details));
        await frame.getByRole('button', { name: '新建画布' }).first().click();
        await page.waitForTimeout(1600);
        assert.equal(await frame.getByRole('button', { name: '返回画布列表' }).count(), 1, `${viewport.width}: editor exposes a project-list back action`);
        assert.equal(await frame.locator('[data-canvas-project-back]').count(), 1, `${viewport.width}: editor back action keeps its DOM contract`);
        await frame.getByRole('button', { name: '返回画布列表' }).click();
        await frame.getByRole('button', { name: '新建画布' }).first().waitFor({ timeout: 5000 });
        assert.equal(await page.locator('.canvas-next-frame').evaluate((element) => element.contentWindow?.location.hash), '#/canvas');
        await frame.getByRole('button', { name: '新建画布' }).first().click();
        await page.waitForTimeout(900);
        console.log(JSON.stringify({ editor: {
            viewport,
            frameHash: await page.locator('.canvas-next-frame').evaluate((element) => element.contentWindow?.location.hash),
            body: (await frame.locator('body').innerText()).slice(0, 500),
            errors: errors.slice(-8),
        } }));
        await page.screenshot({ path: `../tmp/canvas-next-editor-${viewport.width}.png`, fullPage: true });
        await page.locator('[data-canvas-next-close]').click();
        await page.waitForFunction(() => document.body.dataset.activeWorkspace === 'studio');
        // UI-only entitlement stub in this disposable browser, with no generation requests.
        await page.evaluate(() => { window.AuthGate.requireMembership = async () => true; });
        await page.locator('[data-open-agent]').first().click();
        await page.locator('.agent-workspace').waitFor();
        assert.equal(await page.locator('.agent-close').getAttribute('aria-label'), '返回 Studio');
        await checkWorkspaceBack('.agent-close', 'Agent');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `${viewport.width}: Agent has no horizontal overflow`);
        assert.equal(await page.locator('.agent-workspace').evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true, `${viewport.width}: Agent shell has no horizontal overflow`);
        const tools = page.locator('[data-agent-tools-toggle]');
        if (viewport.width > 900) {
            assert.equal(await tools.getAttribute('aria-expanded'), 'true');
            await tools.click();
            assert.equal(await tools.getAttribute('aria-expanded'), 'false');
            assert.equal(await page.locator('#agent-sidepane').evaluate((element) => element.inert), true);
            await tools.click();
            assert.equal(await tools.getAttribute('aria-expanded'), 'true');
            assert.equal(await page.locator('#agent-sidepane').evaluate((element) => element.inert), false);
        } else {
            await page.locator('.agent-mobile-sessions').click();
            await page.locator('.agent-sidebar').waitFor({ state: 'visible' });
            assert.equal(await page.locator('.agent-mobile-backdrop').isVisible(), true);
            assert.equal(await page.locator('.agent-workspace-nav').evaluate(element => element.inert), true, 'mobile drawer isolates workspace navigation');
            await page.waitForFunction(() => document.activeElement?.classList.contains('agent-sidebar-close'));
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('.agent-mobile-backdrop').isVisible(), false);
            assert.equal(await page.locator('.agent-workspace-nav').evaluate(element => element.inert), false, 'closing mobile drawer restores workspace navigation');
            await page.waitForFunction(() => document.activeElement?.classList.contains('agent-mobile-sessions'));
            await page.locator('.agent-mobile-sessions').click();
            await page.locator('.agent-mobile-backdrop').click({ position: { x: viewport.width - 5, y: 120 } });
            assert.equal(await page.locator('.agent-mobile-backdrop').isVisible(), false);
            await tools.click();
            await page.locator('#agent-sidepane').waitFor({ state: 'visible' });
            assert.equal(await tools.getAttribute('aria-expanded'), 'true');
            await page.screenshot({ path: `../tmp/agent-tools-${viewport.width}.png`, fullPage: true });
            await page.locator('.agent-sidepane-close').click();
            assert.equal(await tools.getAttribute('aria-expanded'), 'false');
            await page.waitForFunction(() => document.activeElement?.hasAttribute('data-agent-tools-toggle'));
        }
        await page.screenshot({ path: `../tmp/agent-release-${viewport.width}.png`, fullPage: true });
        await page.locator('.agent-close').click();
        await page.waitForFunction(() => {
            const studio = document.querySelector('.app.studio-layout');
            return document.body.dataset.activeWorkspace === 'studio' && studio && !studio.hidden && !studio.inert;
        });
        assert.equal(await page.locator('.app.studio-layout').isVisible(), true);
        assert.equal(await page.locator('#canvas-workspace-root').isVisible(), false);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `${viewport.width}: Studio has no horizontal overflow`);
        await page.evaluate(() => window.PromptLibraryBridge.open({ context: 'studio', tab: 'mine' }));
        await page.locator('#prompt-library-root [data-workspace-back]').waitFor();
        await checkWorkspaceBack('#prompt-library-root [data-workspace-back]', 'Prompt library');
        assert.equal(await page.locator('#prompt-library-root').evaluate(element => element.scrollWidth <= element.clientWidth + 1), true, `${viewport.width}: prompt library has no horizontal overflow`);
        await page.screenshot({ path: `../tmp/prompt-navigation-${viewport.width}.png`, fullPage: true });
        await page.locator('#prompt-library-root [data-workspace-back]').click();
        await page.waitForFunction(() => document.body.dataset.activeWorkspace === 'studio');
        assert.equal(await page.locator('.app.studio-layout').isVisible(), true, 'prompt return restores Studio');
        console.log(JSON.stringify({ returnPositions }));

        // Synthetic login verifies the standalone page without real credentials.
        let loginPosts = 0;
        let confirmedSession = false;
        await page.route('**/api/auth/login', route => {
            ++loginPosts;
            return route.fulfill({ json: { success: true } });
        });
        await page.route('**/api/auth/me', route => route.fulfill({ json: confirmedSession
            ? { authenticated: true, user: { id: 42, username: 'fixture-user' }, membership: null, quota: { daily_remaining: 7 } }
            : { authenticated: false, user: null, quota: { daily_remaining: 2 } }
        }));
        await page.evaluate(() => window.AuthGate.requireAuth());
        await page.locator('#auth-username').fill('fixture-user');
        await page.locator('#auth-password').fill('fixture-password');
        await page.locator('#auth-submit').click();
        await page.getByRole('button', { name: '重新确认', exact: true }).waitFor();
        assert.ok((await page.locator('#auth-error').innerText()).includes('Cookie'), 'standalone ineffective session explains cookies');
        assert.equal(await page.locator('#auth-standalone-link').count(), 0, 'standalone page does not offer a redundant external-page link');
        await page.screenshot({ path: `../tmp/login-confirmation-${viewport.width}.png`, fullPage: true });
        confirmedSession = true;
        await page.getByRole('button', { name: '重新确认', exact: true }).click();
        await page.locator('#auth-modal').waitFor({ state: 'hidden' });
        assert.equal(await page.evaluate(() => window.AuthGate.getUser()?.id), 42, 'standalone confirmation updates the account without refresh');
        assert.equal(loginPosts, 1, 'standalone retry never repeats the login POST');
        console.log(`PASS ${viewport.width}: aligned workspace navigation, Agent panels, Studio return and synthetic login`);
        await context.close();
    }
    console.log(JSON.stringify({ errors: errors.slice(0, 20) }));
    assert.deepEqual(errors, [], 'no console or page errors');
} finally {
    await browser.close();
}
