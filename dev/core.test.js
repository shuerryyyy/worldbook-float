import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, normalizeSettings, layoutFloating, setEntryEnabled, createQueue } from '../core.js';

test('panel stays visible at every edge, with mobile, zoom and keyboard viewports', () => {
    for (const [width, height, left, top] of [[1440, 900, 0, 0], [390, 844, 0, 0], [320, 568, 0, 0], [844, 390, 0, 0], [390, 280, 0, 0], [280, 300, 100, 70]]) {
        for (const x of [0, .5, 1]) for (const y of [0, .5, 1]) for (const size of [36, 100]) {
            const p = layoutFloating({ ...DEFAULTS, x, y, size }, { width, height, left, top });
            assert.ok(p.x >= left && p.y >= top);
            assert.ok(p.x + p.size <= left + width && p.y + p.size <= top + height);
            assert.ok(p.panelX >= left && p.panelY >= top);
            assert.ok(p.panelX + p.panelWidth <= left + width + .001);
            assert.ok(p.panelY + p.panelHeight <= top + height + .001);
        }
    }
});

test('on wide screens a right edge button opens to its left, and vice versa', () => {
    const right = layoutFloating({ ...DEFAULTS, x: 1 }, { width: 1440, height: 900 });
    assert.ok(right.panelX + right.panelWidth < right.x);
    const left = layoutFloating({ ...DEFAULTS, x: 0 }, { width: 1440, height: 900 });
    assert.ok(left.panelX > left.x + left.size);
});

test('entry toggle preserves unknown fields, content and imported metadata', () => {
    const source = { entries: { 7: { uid: 7, disable: false, content: '保持原文', key: ['test'], customPlugin: { value: 42 } } }, originalData: { entries: [{ uid: '7', enabled: true, other: '保留' }] }, customBook: true };
    const expected = structuredClone(source);
    expected.entries[7].disable = true;
    expected.originalData.entries[0].enabled = false;
    assert.deepEqual(setEntryEnabled(source, '7', false), expected);
    assert.throws(() => setEntryEnabled(source, 'missing', true), /已被删除/);
});

test('queue keeps writes ordered and recovers after a failed save', async () => {
    const queue = createQueue();
    const order = [];
    const first = queue(async () => { await new Promise(resolve => setTimeout(resolve, 15)); order.push(1); throw new Error('failed'); });
    const second = queue(async () => { order.push(2); return 2; });
    await assert.rejects(first, /failed/);
    assert.equal(await second, 2);
    assert.deepEqual(order, [1, 2]);
});

test('native character-book import uses id in originalData and uid at runtime', () => {
    const data = { entries: { 7: { uid: 7, disable: false } }, originalData: { entries: [{ id: 7, enabled: true, content: '保留' }] } };
    setEntryEnabled(data, '7', false);
    assert.equal(data.originalData.entries[0].enabled, false);
    assert.equal(data.originalData.entries[0].content, '保留');
});

test('invalid positions and unsafe image URLs are normalized', () => {
    const settings = normalizeSettings({ x: -10, y: NaN, size: 900, image: 'javascript:alert(1)' });
    assert.equal(settings.x, 0);
    assert.equal(settings.y, DEFAULTS.y);
    assert.equal(settings.size, 100);
    assert.equal(settings.image, '');
});
