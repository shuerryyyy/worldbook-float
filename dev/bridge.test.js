import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridge } from '../bridge.js';

function fixture() {
    let books = { '世界 A': { entries: { 0: { uid: 0, disable: false, content: '<script>原文</script>', pluginField: true }, 1: { uid: 1, disable: false, content: '条目二' } }, extra: '保留' } };
    const cache = new Map();
    const events = [];
    let ctx = {
        chatId: 'chat-a', characterId: 0, chatMetadata: {},
        getRequestHeaders: () => ({ 'X-CSRF-Token': 'test' }),
        getWorldInfoNames: () => Object.keys(books),
        saveMetadata: async () => {}, updateWorldInfoList: async () => {},
        loadWorldInfo: async name => structuredClone(cache.get(name) ?? books[name]),
        saveWorldInfo: async (name, data, immediately) => {
            assert.equal(immediately, true);
            cache.set(name, structuredClone(data));
            if (!failSave) books[name] = structuredClone(data);
        },
        eventSource: { emit: async (...args) => events.push(args) }, eventTypes: { WORLDINFO_UPDATED: 'updated' },
        characters: [{ avatar: '角色.png', data: { extensions: { world: '世界 A' } } }],
        powerUserSettings: {},
    };
    let failSave = false;
    const world = { METADATA_KEY: 'world_info', worldInfoCache: cache, selected_world_info: [], world_info: {} };
    const request = async (path, options) => {
        const body = JSON.parse(options.body);
        assert.equal(options.headers['X-CSRF-Token'], 'test');
        if (path.endsWith('/get')) return { ok: true, json: async () => structuredClone(books[body.name]) };
        if (failSave) return { ok: false, status: 500 };
        books[body.name] = structuredClone(body.data);
        return { ok: true };
    };
    const bridge = createBridge({ context: () => ctx, world, request, document: { querySelectorAll: () => [] } });
    return { bridge, cache, events, world, ctx, setContext: next => { ctx = next; }, setFailure: value => { failSave = value; }, books: () => books };
}

test('read actual book names; discover character/global/chat/persona associations', () => {
    const f = fixture();
    assert.deepEqual(f.bridge.names(), ['世界 A']);
    assert.deepEqual(f.bridge.sources('世界 A'), ['角色']);
    f.world.selected_world_info.push('世界 A');
    f.ctx.chatMetadata.world_info = '世界 A';
    f.ctx.powerUserSettings.persona_description_lorebook = '世界 A';
    assert.deepEqual(f.bridge.sources('世界 A'), ['全局', '聊天', '角色', '用户']);
});

test('fresh reads and sequential writes preserve changes in different entries', async () => {
    const f = fixture();
    await Promise.all([f.bridge.toggleEntry('世界 A', '0', false), f.bridge.toggleEntry('世界 A', '1', false)]);
    assert.equal(f.books()['世界 A'].entries[0].disable, true);
    assert.equal(f.books()['世界 A'].entries[1].disable, true);
    assert.equal(f.books()['世界 A'].entries[0].pluginField, true);
    assert.equal(f.books()['世界 A'].extra, '保留');
    assert.equal(f.cache.get('世界 A').entries[1].disable, true);
    assert.equal(f.events.length, 2);
});

test('HTTP failure never publishes a false successful cache state', async () => {
    const f = fixture();
    f.setFailure(true);
    await assert.rejects(f.bridge.toggleEntry('世界 A', '0', false), /HTTP 500/);
    assert.equal(f.cache.size, 0);
    assert.equal(f.events.length, 0);
    assert.equal(f.books()['世界 A'].entries[0].disable, false);
    f.setFailure(false);
    await f.bridge.toggleEntry('世界 A', '0', false);
    assert.equal(f.books()['世界 A'].entries[0].disable, true);
});

test('chat binding persists through host metadata and can be removed', async () => {
    const f = fixture();
    await f.bridge.bind('世界 A', 'chat', true);
    assert.equal(f.ctx.chatMetadata.world_info, '世界 A');
    await f.bridge.bind('世界 A', 'chat', false);
    assert.equal(f.ctx.chatMetadata.world_info, undefined);
});

test('queued chat binding cannot affect a new chat after switching', async () => {
    const f = fixture();
    const binding = f.bridge.bind('世界 A', 'chat', true);
    const next = { ...f.ctx, chatId: 'chat-b', chatMetadata: {} };
    f.setContext(next);
    await assert.rejects(binding, /聊天已切换/);
    assert.deepEqual(next.chatMetadata, {});
});

test('metadata rejection restores prior binding without touching a different chat', async () => {
    const f = fixture();
    f.ctx.chatMetadata.world_info = '旧世界书';
    f.ctx.saveMetadata = async () => { throw new Error('metadata failed'); };
    await assert.rejects(f.bridge.bind('世界 A', 'chat', true), /metadata failed/);
    assert.equal(f.ctx.chatMetadata.world_info, '旧世界书');
});

test('wait for native pending save on the target without discarding unsaved content', async () => {
    const f = fixture();
    const native = structuredClone(f.books()['世界 A']);
    native.entries[0].content = '原生编辑器刚改但尚未落盘的内容';
    f.cache.set('世界 A', native);
    const nativeSave = setTimeout(() => { f.books()['世界 A'] = structuredClone(native); }, 80);
    await f.bridge.toggleEntry('世界 A', '0', false);
    clearTimeout(nativeSave);
    assert.equal(f.books()['世界 A'].entries[0].content, native.entries[0].content);
    assert.equal(f.books()['世界 A'].entries[0].disable, true);
});

test('pending native save in another book is never cancelled by a float toggle', async () => {
    const f = fixture();
    f.cache.set('世界 A', structuredClone(f.books()['世界 A']));
    f.books()['世界 B'] = { entries: { 0: { uid: 0, content: '旧内容' } } };
    const changedB = { entries: { 0: { uid: 0, content: '原生新内容' } } };
    f.cache.set('世界 B', changedB);
    let nativeSaveCalled = false;
    f.ctx.saveWorldInfo = async () => { nativeSaveCalled = true; throw Error('must not cancel native debounce'); };
    const nativeSave = new Promise(resolve => setTimeout(() => { f.books()['世界 B'] = structuredClone(changedB); resolve(); }, 60));
    await f.bridge.toggleEntry('世界 A', '0', false);
    await nativeSave;
    assert.equal(nativeSaveCalled, false);
    assert.equal(f.books()['世界 B'].entries[0].content, '原生新内容');
    assert.equal(f.books()['世界 A'].entries[0].disable, true);
});

test('failed save with an existing cache retains the original switch', async () => {
    const f = fixture();
    f.cache.set('世界 A', structuredClone(f.books()['世界 A']));
    f.setFailure(true);
    await assert.rejects(f.bridge.toggleEntry('世界 A', '0', false), /HTTP 500/);
    assert.equal(f.cache.get('世界 A').entries[0].disable, false);
});

test('global binding triggers the native select, including punctuation in names', async () => {
    const f = fixture();
    const select = { options: [{ textContent: '世界 A', selected: false }] };
    const bridge = createBridge({ context: () => f.ctx, world: f.world, document: { querySelector: () => select }, jquery: node => ({ trigger: event => {
        assert.equal(event, 'change'); assert.equal(node, select);
        f.world.selected_world_info = select.options.filter(x => x.selected).map(x => x.textContent);
    } }) });
    await bridge.bind('世界 A', 'global', true);
    assert.equal(bridge.isBound('世界 A', 'global'), true);
    await bridge.bind('世界 A', 'global', false);
    assert.equal(bridge.isBound('世界 A', 'global'), false);
});
