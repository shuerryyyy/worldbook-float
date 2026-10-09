import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const screenshots = new URL('dev/screenshots/', root);
await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(new URL('preview.html', root).href);
    const host = page.locator('#clare-worldbook-float');
    const launcher = host.locator('.launcher');
    const panel = host.locator('.panel');
    const scroller = host.locator('.panel-scroll');
    const lock = host.getByRole('checkbox', { name: '锁定按钮与面板相对位置', exact: true });
    const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1, `${actual} != ${expected}`);
    async function dragBy(dx, dy) {
        const b = await launcher.boundingBox();
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(500);
        await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 5 });
        await page.mouse.up();
        assert.equal(await panel.isVisible(), true);
    }
    await launcher.click();
    await host.getByRole('button', { name: '设置', exact: true }).click();
    assert.equal(await lock.isChecked(), false);
    const initial = await launcher.boundingBox();
    await lock.check();
    closeTo((await launcher.boundingBox()).x, initial.x);
    closeTo((await launcher.boundingBox()).y, initial.y);
    const before = { button: await launcher.boundingBox(), panel: await panel.boundingBox() };
    await dragBy(-25, -20);
    const after = { button: await launcher.boundingBox(), panel: await panel.boundingBox() };
    closeTo(after.button.x - before.button.x, -25);
    closeTo(after.button.y - before.button.y, -20);
    closeTo(after.panel.x - before.panel.x, -25);
    closeTo(after.panel.y - before.panel.y, -20);
    await launcher.focus();
    await page.keyboard.press('Alt+ArrowDown');
    closeTo((await panel.boundingBox()).y - after.panel.y, 12);
    await scroller.evaluate(node => { node.scrollTop = node.scrollHeight; });
    await page.screenshot({ path: fileURLToPath(new URL('drag-lock-desktop.png', screenshots)) });

    await page.reload();
    await launcher.click();
    await host.getByRole('button', { name: '设置', exact: true }).click();
    assert.equal(await lock.isChecked(), true);
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 390, height: 280 }]) {
        await page.setViewportSize(viewport);
        await page.waitForTimeout(100);
        for (const node of [launcher, panel]) {
            const b = await node.boundingBox();
            assert.ok(b.x >= 0 && b.y >= 0);
            assert.ok(b.x + b.width <= viewport.width + 1 && b.y + b.height <= viewport.height + 1);
        }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await lock.scrollIntoViewIfNeeded();
    await page.screenshot({ path: fileURLToPath(new URL('drag-lock-mobile.png', screenshots)) });
    await lock.uncheck();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wbf-preview')));
    assert.equal(saved.lockPanel, false);
    assert.deepEqual(errors, []);
    console.log('通过：锁定即时同步拖动、开启时按钮不跳位、键盘同步移动、刷新保留、手机横屏及键盘视口适配、可恢复自动展开。');
} finally { await browser.close(); }
