import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const screenshots = new URL('dev/screenshots/', root);
await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 390, height: 480 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(new URL('preview.html', root).href);
    const host = page.locator('#clare-worldbook-float');
    const panel = host.locator('.panel');
    const scroller = host.locator('.panel-scroll');
    const header = host.locator('.header');
    await host.locator('.launcher').click();
    await page.waitForTimeout(180);
    const headerBefore = await header.boundingBox();
    await page.mouse.move(headerBefore.x + 15, headerBefore.y + 15);
    await page.mouse.wheel(0, 240);
    await page.waitForFunction(() => document.querySelector('#clare-worldbook-float').shadowRoot.querySelector('.panel-scroll').scrollTop > 10);
    const headerAfter = await header.boundingBox();
    assert.ok(headerAfter.y < headerBefore.y - 10);
    assert.equal(await host.locator('.list').evaluate(node => node.scrollTop), 0);
    await scroller.evaluate(node => { node.scrollTop = 0; });

    const bookName = '旅人 · 人物关系';
    await host.getByRole('button', { name: bookName, exact: false }).click();
    await host.locator('.entry-row').waitFor();
    const chatBinding = host.getByRole('checkbox', { name: `当前聊天绑定：${bookName}`, exact: true });
    assert.equal(await chatBinding.isChecked(), false);
    await host.getByText('此范围尚未启用。仅打开下面的条目，不会自动绑定这本书。', { exact: true }).waitFor();
    await chatBinding.check();
    await host.getByText('已绑定到当前聊天', { exact: true }).waitFor();
    assert.equal(await chatBinding.isChecked(), true);
    await host.getByRole('button', { name: '全局', exact: true }).click();
    assert.equal(await host.getByRole('checkbox', { name: `全局启用：${bookName}`, exact: true }).isChecked(), false);
    await host.getByRole('button', { name: '当前聊天', exact: true }).click();
    assert.equal(await chatBinding.isChecked(), true);

    await page.setViewportSize({ width: 390, height: 844 });
    await scroller.evaluate(node => { node.scrollTop = 0; });
    await page.screenshot({ path: fileURLToPath(new URL('scroll-chat-binding-mobile.png', screenshots)) });
    await host.getByRole('button', { name: '设置', exact: true }).click();
    await scroller.evaluate(node => { node.scrollTop = 200; });
    assert.ok(await header.boundingBox().then(box => box.y < (0 + 8)));
    // Change view by the launcher without requiring a fixed header.
    await host.locator('.launcher').click();
    await host.locator('.launcher').click();
    await scroller.evaluate(node => { node.scrollTop = 0; });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: fileURLToPath(new URL('scroll-settings-desktop.png', screenshots)) });
    assert.ok(await panel.isVisible());
    assert.equal(await page.locator('#clare-worldbook-css-recovery').count(), 0);
    assert.deepEqual(errors, []);
    console.log('通过：上半区滚轮驱动整面板、标题随内容移动、无列表嵌套滚动、条目页聊天绑定不影响全局、设置滚动和无 CSS 小牌。');
} finally { await browser.close(); }
