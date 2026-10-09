import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const screenshots = new URL('dev/screenshots/', root);
await mkdir(screenshots, { recursive: true });
const fixture = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>CSS editor test</title>
<style>body { margin: 0; background: #eceee8; } #manager { position: fixed; right: 16px; top: 20px; }</style>
<button id="open">打开编辑器</button><div id="manager"></div>
<script type="module">
import { openThemeEditor } from '/theme-editor.js';
const manager = document.querySelector('#manager').attachShadow({ mode: 'open' });
manager.innerHTML = '<style>:host{--wbf-bg:#24282c}.panel{background:var(--wbf-bg);width:240px;height:180px;color:white;padding:20px}</style><section class="panel">世界书预览</section>';
const custom = document.createElement('style'); manager.append(custom);
window.events = []; window.saved = ''; window.fail = '';
window.start = (css = window.saved) => {
  window.events = [];
  window.editor = openThemeEditor({ css,
    onPreview(text) { if (window.fail === 'preview') throw Error('预览失败，请重试。'); window.events.push(['preview', text]); custom.textContent = text; },
    onApply(text) { if (window.fail === 'apply') throw Error('保存失败，请重试。'); window.events.push(['apply', text]); window.saved = text; custom.textContent = text; },
    onCancel() { window.events.push(['cancel']); custom.textContent = window.saved; },
    onReset() { if (window.fail === 'reset') throw Error('恢复失败，请重试。'); window.events.push(['reset']); window.saved = ''; custom.textContent = ''; },
    onClose() { window.events.push(['close']); }
  });
};
document.querySelector('#open').addEventListener('click', () => window.start());
window.ready = true;
</script></html>`;

const server = createServer(async (request, response) => {
    try {
        const path = new URL(request.url, 'http://localhost').pathname;
        if (path === '/') {
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(fixture);
            return;
        }
        if (!['/theme-editor.js', '/core.js'].includes(path)) {
            response.statusCode = 404;
            response.end();
            return;
        }
        response.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        response.end(await readFile(new URL(path.slice(1), root), 'utf8'));
    } catch (error) {
        response.statusCode = 500;
        response.end(error.message);
    }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.ready);
    const editor = page.locator('#clare-worldbook-theme-editor');
    const text = editor.getByRole('textbox', { name: '样式代码' });
    const start = async css => {
        await page.evaluate(value => window.start(value), css);
        await editor.waitFor({ state: 'attached' });
    };
    const eventNames = () => page.evaluate(() => window.events.map(item => item[0]));

    await start('/* draft */');
    assert.equal(await editor.locator('dialog').evaluate(node => node.matches(':modal')), true);
    assert.equal(await text.evaluate(node => node.getRootNode().activeElement === node), true);
    await text.fill('a');
    await page.keyboard.press('End');
    await page.keyboard.press('Tab');
    assert.equal(await text.inputValue(), 'a  ');
    await page.keyboard.press('Shift+Tab');
    assert.notEqual(await text.evaluate(node => node.getRootNode().activeElement === node), true);
    await editor.getByRole('button', { name: '填入浅色示例' }).click();
    const example = await text.inputValue();
    assert.ok(example.includes(':host') && example.includes('--wbf-bg') && example.includes('color-scheme: light'));
    await editor.getByRole('button', { name: '预览', exact: true }).click();
    await editor.locator('dialog.previewing').waitFor();
    assert.equal(await editor.getByRole('button', { name: '返回编辑' }).evaluate(node => node.getRootNode().activeElement === node), true);
    assert.equal(await page.locator('#manager .panel').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(245, 245, 239)');
    await editor.getByRole('button', { name: '返回编辑' }).click();
    assert.equal(await text.inputValue(), example);
    await editor.getByRole('button', { name: '预览', exact: true }).click();
    await editor.getByRole('button', { name: '取消预览' }).click();
    await text.waitFor({ state: 'visible' });
    assert.equal(await text.inputValue(), example);
    assert.deepEqual(await eventNames(), ['preview', 'preview', 'cancel']);
    assert.equal(await page.locator('#manager .panel').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(36, 40, 44)');
    await page.screenshot({ path: fileURLToPath(new URL('css-editor-desktop.png', screenshots)) });
    await editor.getByRole('button', { name: '应用并保存' }).click();
    await editor.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.saved), example);
    assert.deepEqual(await eventNames(), ['preview', 'preview', 'cancel', 'apply', 'close']);

    // Hostile appearance changes cannot style or hide the editor's separate shadow root.
    await start(':host { visibility:hidden; } * { display:none !important; }');
    await editor.getByRole('button', { name: '预览', exact: true }).click();
    await editor.getByRole('button', { name: '取消预览' }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('#manager .panel').isVisible(), false);
    await page.keyboard.press('Escape');
    await editor.waitFor({ state: 'detached' });
    assert.deepEqual(await eventNames(), ['preview', 'cancel', 'close']);
    assert.equal(await page.locator('#manager .panel').isVisible(), true);

    // HTML-shaped text remains code text and cannot execute a script.
    const html = '<img src=x onerror="window.injected=true"><script>window.injected=true</script>';
    await start(html);
    await editor.getByRole('button', { name: '预览', exact: true }).click();
    assert.equal(await page.evaluate(() => window.injected), undefined);
    await editor.getByRole('button', { name: '返回编辑' }).click();
    assert.equal(await text.inputValue(), html);
    await editor.getByRole('button', { name: '关闭 CSS 编辑器' }).click();
    await editor.waitFor({ state: 'detached' });
    assert.deepEqual(await eventNames(), ['preview', 'cancel', 'close']);

    await start(example);
    await editor.getByRole('button', { name: '恢复默认' }).click();
    assert.equal(await text.inputValue(), '');
    assert.equal(await page.evaluate(() => window.saved), '');
    assert.deepEqual(await eventNames(), ['reset']);
    await text.fill('/* unsaved */');
    await page.keyboard.press('Escape');
    await editor.waitFor({ state: 'detached' });
    assert.deepEqual(await eventNames(), ['reset', 'cancel', 'close']);
    assert.equal(await page.evaluate(() => window.saved), '');

    // Failed persistence keeps the draft and an actionable message.
    await start('/* keep my draft */');
    await page.evaluate(() => { window.fail = 'apply'; });
    await editor.getByRole('button', { name: '应用并保存' }).click();
    await editor.getByText('保存失败，请重试。', { exact: true }).waitFor();
    assert.equal(await text.inputValue(), '/* keep my draft */');
    assert.deepEqual(await eventNames(), []);
    await page.evaluate(() => { window.fail = 'reset'; });
    await editor.getByRole('button', { name: '恢复默认' }).click();
    await editor.getByText('恢复失败，请重试。', { exact: true }).waitFor();
    assert.equal(await text.inputValue(), '/* keep my draft */');
    await page.evaluate(() => { window.fail = 'preview'; });
    await editor.getByRole('button', { name: '预览', exact: true }).click();
    await editor.getByText('预览失败，请重试。', { exact: true }).waitFor();
    assert.equal(await text.isVisible(), true);
    await page.evaluate(() => { window.fail = ''; });

    await text.evaluate(node => { node.value = 'a'.repeat(200001); node.dispatchEvent(new Event('input', { bubbles: true })); });
    await editor.getByRole('button', { name: '应用并保存' }).click();
    await editor.getByText('CSS 超过 200,000 字符，请删减后再试。', { exact: true }).waitFor();
    assert.deepEqual(await eventNames(), []);
    await editor.getByRole('button', { name: '预览', exact: true }).click();
    assert.equal(await text.isVisible(), true);
    assert.deepEqual(await eventNames(), []);
    await text.fill('/* valid now */');
    await editor.getByRole('button', { name: '预览', exact: true }).click();
    await editor.getByRole('button', { name: '应用', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    assert.deepEqual(await eventNames(), ['preview', 'apply', 'close']);

    // Imperative cleanup is idempotent and invokes no user callbacks.
    await start();
    await page.evaluate(() => { window.editor.destroy(); window.editor.destroy(); });
    assert.deepEqual(await eventNames(), []);
    assert.equal(await editor.count(), 0);

    for (const [width, height] of [[390, 844], [320, 568], [844, 390], [390, 280]]) {
        await page.setViewportSize({ width, height });
        await start(example);
        const box = await editor.locator('dialog').boundingBox();
        assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1);
        const applyBox = await editor.getByRole('button', { name: '应用并保存' }).boundingBox();
        assert.ok(applyBox.y + applyBox.height <= box.y + box.height + 1, `apply visible at ${width}x${height}`);
        assert.equal(await editor.locator('dialog').evaluate(node => node.scrollWidth <= node.clientWidth), true);
        if (width === 390 && height === 844) await page.screenshot({ path: fileURLToPath(new URL('css-editor-mobile.png', screenshots)) });
        await editor.getByRole('button', { name: '预览', exact: true }).click();
        const previewBox = await editor.locator('dialog').boundingBox();
        assert.ok(previewBox.x >= 0 && previewBox.y >= 0 && previewBox.x + previewBox.width <= width + 1 && previewBox.y + previewBox.height <= height + 1);
        if (width === 390 && height === 844) await page.screenshot({ path: fileURLToPath(new URL('css-preview-mobile.png', screenshots)) });
        await page.keyboard.press('Escape');
        await editor.waitFor({ state: 'detached' });
    }
    // A mobile keyboard/zoom can shrink and offset visualViewport without changing layout viewport.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => {
        window.realViewport = window.visualViewport;
        window.fakeViewport = new EventTarget();
        Object.assign(window.fakeViewport, { width: 380, height: 260, offsetLeft: 125, offsetTop: 240 });
        Object.defineProperty(window, 'visualViewport', { configurable: true, value: window.fakeViewport });
    });
    await start(example);
    const assertInsideViewport = async () => {
        const box = await editor.locator('dialog').boundingBox();
        const viewport = await page.evaluate(() => ({ width: visualViewport.width, height: visualViewport.height, left: visualViewport.offsetLeft, top: visualViewport.offsetTop }));
        assert.ok(box.x >= viewport.left && box.y >= viewport.top);
        assert.ok(box.x + box.width <= viewport.left + viewport.width + 1);
        assert.ok(box.y + box.height <= viewport.top + viewport.height + 1);
    };
    await assertInsideViewport();
    await page.evaluate(() => {
        Object.assign(window.fakeViewport, { width: 360, height: 270, offsetLeft: 150, offsetTop: 280 });
        window.fakeViewport.dispatchEvent(new Event('resize'));
    });
    await assertInsideViewport();
    await editor.getByRole('button', { name: '预览', exact: true }).click();
    await assertInsideViewport();
    await page.evaluate(() => {
        Object.assign(window.fakeViewport, { offsetLeft: 180, offsetTop: 300 });
        window.fakeViewport.dispatchEvent(new Event('scroll'));
    });
    await assertInsideViewport();
    await page.keyboard.press('Escape');
    await editor.waitFor({ state: 'detached' });
    await page.evaluate(() => {
        window.fakeViewport.dispatchEvent(new Event('resize'));
        Object.defineProperty(window, 'visualViewport', { configurable: true, value: window.realViewport });
    });
    assert.deepEqual(errors, []);
    console.log('通过：CSS 编辑、示例、Tab 与模态焦点、预览与取消、应用与失败恢复、默认样式、长度限制、编辑器样式隔离、HTML 文本不执行、Escape 与重复销毁、桌面/手机/横屏/键盘缩小视口及非零 visualViewport 偏移适配。');
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
