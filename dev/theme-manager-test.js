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
    // A real v0.1 settings object: migration must preserve the user's preferences.
    await page.addInitScript(() => {
        if (!localStorage.getItem('wbf-preview')) localStorage.setItem('wbf-preview', JSON.stringify({ size: 68, x: .85, y: .4, defaultScope: 'global', scope: 'global', image: '' }));
    });
    await page.goto(new URL('preview.html', root).href);
    const manager = page.locator('#clare-worldbook-float');
    const panel = manager.locator('.panel');
    const launcher = manager.locator('.launcher');
    const editor = page.locator('#clare-worldbook-theme-editor');
    const nativeSettings = page.locator('#clare-worldbook-native-settings');
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('wbf-preview')));
    const panelColor = () => panel.evaluate(node => getComputedStyle(node).backgroundColor);
    const theme = ':host { --wbf-bg: #112233; }\n.panel { border-radius: 23px; }';
    await launcher.click();
    assert.equal(Math.round((await launcher.boundingBox()).width), 68);
    assert.equal(Math.round((await panel.boundingBox()).width), 390);
    await manager.getByRole('button', { name: '设置', exact: true }).click();
    assert.equal(await manager.getByRole('combobox').inputValue(), 'global');
    await manager.getByRole('button', { name: '编辑 CSS', exact: true }).click();
    await editor.getByRole('textbox', { name: '样式代码' }).fill(theme);
    await editor.getByRole('button', { name: '预览', exact: true }).click();
    await editor.getByRole('button', { name: '返回编辑', exact: true }).waitFor();
    assert.equal(await panelColor(), 'rgb(17, 34, 51)');
    assert.equal((await saved()).customCss ?? '', '');
    assert.notEqual(await page.locator('body').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(17, 34, 51)');
    await editor.getByRole('button', { name: '取消预览', exact: true }).click();
    await editor.getByRole('textbox').waitFor();
    assert.equal(await panelColor(), 'rgb(36, 40, 44)');
    assert.equal(await editor.getByRole('textbox').inputValue(), theme);
    await editor.getByRole('button', { name: '预览', exact: true }).click();
    await editor.getByRole('button', { name: '返回编辑', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await editor.waitFor({ state: 'detached' });
    assert.equal(await panelColor(), 'rgb(36, 40, 44)');

    await manager.getByRole('button', { name: '编辑 CSS', exact: true }).click();
    await editor.getByRole('textbox').fill(theme);
    await editor.getByRole('button', { name: '应用并保存', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    assert.equal((await saved()).customCss, theme);
    assert.equal((await saved()).size, 68);
    assert.equal((await saved()).defaultScope, 'global');
    assert.equal(await page.locator('#clare-worldbook-css-recovery').count(), 0);
    await page.reload();
    await launcher.waitFor();
    await launcher.click();
    assert.equal(await panelColor(), 'rgb(17, 34, 51)');
    await manager.getByRole('button', { name: '设置', exact: true }).click();
    await manager.getByRole('button', { name: '编辑 CSS', exact: true }).click();
    // A broken user stylesheet must never take away the recovery/editor controls.
    await editor.getByRole('textbox').fill('.panel, .launcher { display: none !important; }');
    await editor.getByRole('button', { name: '应用并保存', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    assert.equal(await launcher.isVisible(), false);
    assert.equal(await panel.isVisible(), false);
    await page.locator('#preview-extension-settings > summary').click();
    await nativeSettings.locator('summary').click();
    await nativeSettings.getByRole('button', { name: '编辑悬浮窗 CSS', exact: true }).click();
    await editor.getByRole('button', { name: '恢复默认', exact: true }).click();
    await editor.getByText('默认样式已恢复并保存。', { exact: true }).waitFor();
    assert.equal((await saved()).customCss, '');
    assert.equal(await launcher.isVisible(), true);
    await editor.getByRole('button', { name: '关闭 CSS 编辑器' }).click();
    await editor.waitFor({ state: 'detached' });
    await page.locator('#preview-extension-settings > summary').click();

    await manager.getByRole('button', { name: '编辑 CSS', exact: true }).click();
    await editor.getByRole('button', { name: '填入浅色示例' }).click();
    await page.screenshot({ path: fileURLToPath(new URL('theme-editor-desktop.png', screenshots)) });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: fileURLToPath(new URL('theme-editor-mobile.png', screenshots)) });
    await editor.getByRole('button', { name: '预览', exact: true }).click();
    await editor.getByRole('button', { name: '返回编辑' }).waitFor();
    await page.screenshot({ path: fileURLToPath(new URL('theme-preview-mobile.png', screenshots)) });
    await editor.getByRole('button', { name: '应用', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    await manager.getByRole('button', { name: '返回', exact: true }).click();
    await page.screenshot({ path: fileURLToPath(new URL('theme-applied-mobile.png', screenshots)) });
    assert.deepEqual(errors, []);
    console.log('通过：旧设置迁移、CSS 预览不保存及取消/Escape 撤销、应用持久化、页面样式隔离、失效样式恢复、桌面与手机美化。');
} finally {
    await browser.close();
}
