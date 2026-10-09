import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const screenshots = new URL('dev/screenshots/', root);
await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const errors = [];
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(new URL('preview.html', root).href);
    const host = page.locator('#clare-worldbook-float');
    const launcher = host.locator('.launcher');
    const panel = host.locator('.panel');
    await launcher.click();
    await panel.waitFor({ state: 'visible' });
    await page.waitForTimeout(180);
    assert.equal(await host.locator('.book-row').count(), 5);
    await page.screenshot({ path: fileURLToPath(new URL('desktop.png', screenshots)) });

    await host.getByRole('button', { name: '雾港 · 城市与传闻', exact: false }).click();
    await host.locator('.entry-row').first().waitFor();
    const entrySwitch = host.getByRole('checkbox', { name: '启用条目：雾港的夜晚', exact: true });
    assert.equal(await entrySwitch.isChecked(), true);
    await entrySwitch.uncheck();
    await host.getByText('条目开关已保存', { exact: true }).waitFor();
    assert.equal(await entrySwitch.isChecked(), false);
    assert.equal(await page.evaluate(() => window.wbfDemo.books['雾港 · 城市与传闻'].entries[0].disable), true);
    await page.evaluate(() => window.wbfDemo.failNext());
    await entrySwitch.check();
    await host.getByText('演示：保存失败，请重试。', { exact: true }).waitFor();
    assert.equal(await entrySwitch.isChecked(), false);
    assert.equal(await page.evaluate(() => window.wbfDemo.books['雾港 · 城市与传闻'].entries[0].disable), true);
    await entrySwitch.check();
    await host.getByText('条目开关已保存', { exact: true }).waitFor();
    await host.getByRole('searchbox').fill('钟楼');
    assert.equal(await host.locator('.entry-row').count(), 1);
    await host.getByRole('searchbox').fill('');
    await host.getByText('旧书店的来客', { exact: true }).click();
    assert.equal(await host.locator('details[open]').count(), 1);
    await page.screenshot({ path: fileURLToPath(new URL('desktop-entries.png', screenshots)) });

    await host.getByRole('button', { name: '设置', exact: true }).click();
    await host.getByRole('combobox', { name: '展开面板时使用' }).selectOption('global');
    await host.getByText('默认范围已设为全局世界书', { exact: true }).waitFor();
    await host.getByRole('combobox', { name: '展开面板时使用' }).selectOption('chat');
    const slider = host.getByRole('slider');
    await slider.fill('80');
    await slider.dispatchEvent('input');
    await slider.dispatchEvent('change');
    assert.equal(Math.round((await launcher.boundingBox()).width), 80);
    const png = await page.screenshot({ clip: { x: 0, y: 0, width: 32, height: 32 } });
    await host.locator('input[type=file]').setInputFiles({ name: 'button.png', mimeType: 'image/png', buffer: png });
    await host.getByText('按钮图片已更新', { exact: true }).waitFor();
    assert.ok(await launcher.locator('img').getAttribute('src').then(src => src.startsWith('data:image/png;base64,')));
    await host.getByRole('button', { name: '恢复默认图片' }).click();

    // A long press moves the launcher without also toggling the panel.
    let box = await launcher.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(500);
    await page.mouse.move(12, 100, { steps: 6 });
    await page.mouse.up();
    assert.ok(await panel.isVisible());
    box = await launcher.boundingBox();
    assert.ok(box.x <= 10);
    const p = await panel.boundingBox();
    assert.ok(p.x >= box.x + box.width);
    await page.waitForTimeout(750);
    await launcher.click();
    assert.equal(await panel.isVisible(), false);
    await launcher.click();
    assert.equal(await panel.isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await panel.isVisible(), false);
    await page.keyboard.press('Enter');
    assert.equal(await panel.isVisible(), true);

    // Reload keeps both position and button size.
    await page.reload();
    const newLauncher = page.locator('#clare-worldbook-float .launcher');
    await newLauncher.waitFor();
    assert.equal(Math.round((await newLauncher.boundingBox()).width), 80);
    assert.ok((await newLauncher.boundingBox()).x <= 10);
    await newLauncher.click();

    for (const [width, height] of [[390, 844], [320, 568], [844, 390], [390, 280]]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(60);
        const panelBox = await panel.boundingBox();
        assert.ok(panelBox.x >= 0 && panelBox.y >= 0);
        assert.ok(panelBox.x + panelBox.width <= width + 1);
        assert.ok(panelBox.y + panelBox.height <= height + 1);
        assert.ok(await panel.evaluate(node => node.scrollWidth <= node.clientWidth));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await host.getByRole('button', { name: '雾港 · 城市与传闻', exact: false }).click();
    await host.locator('.entry-row').first().waitFor();
    await page.screenshot({ path: fileURLToPath(new URL('mobile.png', screenshots)) });
    await host.getByRole('button', { name: '设置', exact: true }).click();
    await page.screenshot({ path: fileURLToPath(new URL('mobile-settings.png', screenshots)) });
    assert.deepEqual(errors, []);
    console.log('通过：开关保存与失败恢复、搜索、图片上传、大小设置、长按移动、位置持久化、键盘操作、桌面/手机/横屏/键盘缩小视口边缘适配。');
} finally {
    await browser.close();
}
