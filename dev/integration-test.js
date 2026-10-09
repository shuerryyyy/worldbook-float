import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

// A host harness exercising the shipped index and bridge through real HTTP.
// It is deliberately separate from the offline demo adapter.
const prefix = '/scripts/extensions/third-party/worldbook-float/';
const name = '测试世界书，包含逗号 "与引号"';
let book = { entries: { 11: { uid: 11, comment: '测试条目', content: '不能改写的内容', key: ['测试'], disable: false, otherExtension: { keep: true } } } };
let fail = false;
const server = createServer(async (request, response) => {
    try {
        if (request.url === '/api/worldinfo/get' || request.url === '/api/worldinfo/edit') {
            let input = '';
            for await (const chunk of request) input += chunk;
            const body = JSON.parse(input);
            assert.equal(body.name, name);
            assert.equal(request.headers['x-csrf-token'], 'fixture');
            if (request.url.endsWith('/edit')) {
                if (fail) { response.writeHead(500); response.end('error'); return; }
                book = body.data;
            }
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify(book));
            return;
        }
        if (request.url === '/scripts/world-info.js') {
            response.setHeader('Content-Type', 'application/javascript');
            response.end(`export const METADATA_KEY='world_info'; export const worldInfoCache=new Map(); export let selected_world_info=[]; export const world_info={}; export const world_names=[${JSON.stringify(name)}]; export function selectGlobal(value){selected_world_info=value;}`);
            return;
        }
        if (request.url === '/') {
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.end(`<!doctype html><html><head><meta charset="utf-8"></head><body><select id="world_info" multiple></select><button class="chat_lorebook_button"></button><div id="extensions_settings2"></div>
<script type="module">
import * as world from '/scripts/world-info.js';
const handlers=new Map();const eventSource={on(event,listener){const set=handlers.get(event)||new Set();set.add(listener);handlers.set(event,set)},once(event,listener){const wrap=(...args)=>{this.removeListener(event,wrap);return listener(...args)};this.on(event,wrap)},removeListener(event,listener){handlers.get(event)?.delete(listener)},async emit(event,...args){for(const listener of [...handlers.get(event)||[]]) await listener(...args)}};
const select=document.querySelector('#world_info');select.append(new Option(world.world_names[0],'0'));
window.jQuery=value=>typeof value==='function'?value():({trigger(event){if(value===select&&event==='change')world.selectGlobal([...select.selectedOptions].map(option=>option.textContent))}});
const ctx={extensionSettings:{},eventTypes:{APP_READY:'ready',WORLDINFO_UPDATED:'world-update',WORLDINFO_SETTINGS_UPDATED:'settings-update',CHAT_CHANGED:'chat-change'},eventSource,chatId:'chat1',characterId:0,chatMetadata:{},characters:[],groups:[],powerUserSettings:{},getRequestHeaders:()=>({'Content-Type':'application/json','X-CSRF-Token':'fixture'}),getWorldInfoNames:()=>world.world_names,saveMetadata:async()=>{window.savedMetadata=structuredClone(ctx.chatMetadata)},saveSettingsDebounced:()=>{window.savedSettings=structuredClone(ctx.extensionSettings)},updateWorldInfoList:async()=>{},reloadWorldInfoEditor:()=>{}};
ctx.loadWorldInfo=async name=>world.worldInfoCache.has(name)?structuredClone(world.worldInfoCache.get(name)):await (await fetch('/api/worldinfo/get',{method:'POST',headers:ctx.getRequestHeaders(),body:JSON.stringify({name})})).json();
ctx.saveWorldInfo=async(name,data,immediately)=>{if(!immediately)throw Error('must save immediately');world.worldInfoCache.set(name,structuredClone(data));await fetch('/api/worldinfo/edit',{method:'POST',headers:ctx.getRequestHeaders(),body:JSON.stringify({name,data})});await eventSource.emit('world-update',name,data)};
window.SillyTavern={getContext:()=>ctx};window.testContext=ctx;window.testWorld=world;
window.extension=await import('${prefix}index.js');await eventSource.emit('ready');
</script></body></html>`);
            return;
        }
        if (request.url.startsWith(prefix)) {
            const file = request.url.slice(prefix.length);
            if (!/^(index|core|bridge|ui|theme-editor)\.js$|^style\.css$|^assets\/book-open\.svg$/.test(file)) { response.writeHead(404); response.end(); return; }
            response.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'image/svg+xml');
            response.end(await readFile(new URL(`../${file}`, import.meta.url)));
            return;
        }
        response.writeHead(404); response.end();
    } catch (error) { response.writeHead(500); response.end(error.message); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const host = page.locator('#clare-worldbook-float');
    await host.locator('.launcher').click();
    await host.getByRole('checkbox', { name: `当前聊天绑定：${name}`, exact: true }).check();
    await host.getByText('已绑定到当前聊天', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.savedMetadata.world_info), name);
    await host.getByRole('button', { name, exact: false }).click();
    const toggle = host.getByRole('checkbox', { name: '启用条目：测试条目', exact: true });
    await toggle.uncheck();
    await host.getByText('条目开关已保存', { exact: true }).waitFor();
    assert.equal(book.entries[11].disable, true);
    assert.equal(book.entries[11].content, '不能改写的内容');
    assert.equal(book.entries[11].otherExtension.keep, true);
    assert.equal(await page.evaluate(name => window.testWorld.worldInfoCache.get(name).entries[11].disable, name), true);
    fail = true;
    await toggle.check();
    await host.getByText(/HTTP 500/).waitFor();
    assert.equal(await toggle.isChecked(), false);
    assert.equal(await page.evaluate(name => window.testWorld.worldInfoCache.get(name).entries[11].disable, name), true);
    await host.getByRole('button', { name: '设置', exact: true }).click();
    await host.getByRole('combobox', { name: '展开面板时使用' }).selectOption('global');
    assert.equal(await page.evaluate(() => window.savedSettings.clare_worldbook_float.defaultScope), 'global');
    const nativeSettings = page.locator('#clare-worldbook-native-settings');
    await nativeSettings.locator('summary').click();
    await nativeSettings.getByRole('button', { name: '编辑悬浮窗 CSS', exact: true }).click();
    const editor = page.locator('#clare-worldbook-theme-editor');
    await editor.getByRole('textbox', { name: '样式代码' }).fill(':host { --wbf-accent: #abcdef; }');
    await editor.getByRole('button', { name: '应用并保存', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.savedSettings.clare_worldbook_float.customCss), ':host { --wbf-accent: #abcdef; }');
    await nativeSettings.getByRole('button', { name: '恢复默认美化', exact: true }).click();
    assert.equal(await page.evaluate(() => window.savedSettings.clare_worldbook_float.customCss), '');
    await host.getByRole('button', { name: '返回', exact: true }).click();
    await host.getByRole('checkbox', { name: `全局启用：${name}`, exact: true }).check();
    await host.getByText('已全局启用', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.testWorld.selected_world_info.length), 1);
    await page.evaluate(() => window.extension.onDisable());
    assert.equal(await page.locator('#clare-worldbook-float').count(), 0);
    assert.equal(await nativeSettings.count(), 0);
    assert.equal(await page.locator('#clare-worldbook-css-recovery').count(), 0);
    await page.evaluate(() => window.extension.onEnable());
    await page.locator('#clare-worldbook-float').waitFor({ state: 'attached' });
    assert.equal(await page.locator('#clare-worldbook-float').count(), 1);
    assert.deepEqual(errors, []);
    console.log('通过：实际插件入口启动、HTTP 读写、CSRF 请求头、酒馆缓存同步、失败不污染缓存、聊天/全局绑定、默认范围持久化、禁用及重新启用。使用模拟宿主，非真实酒馆。');
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
