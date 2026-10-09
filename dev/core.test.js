import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, PANEL_LIMITS, CUSTOM_CSS_LIMIT, normalizeSettings, layoutFloating, floatingPosition, setEntryEnabled, createQueue } from '../core.js';

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

test('locked button and panel move equally with no independent edge clamping', () => {
    const viewport = { width: 1440, height: 900 };
    const settings = { ...DEFAULTS, lockPanel: true, panelOffsetX: -398, panelOffsetY: -100, x: .5, y: .5 };
    const before = layoutFloating(settings, viewport);
    const next = { ...settings, ...floatingPosition(settings, viewport, before.x + 20, before.y - 30) };
    const after = layoutFloating(next, viewport);
    assert.equal(after.x - before.x, 20);
    assert.equal(after.panelX - before.panelX, 20);
    assert.equal(after.y - before.y, -30);
    assert.equal(after.panelY - before.panelY, -30);
    const edge = { ...settings, ...floatingPosition(settings, viewport, 10000, -10000) };
    const atEdge = layoutFloating(edge, viewport);
    const reverse = layoutFloating({ ...edge, ...floatingPosition(edge, viewport, atEdge.x - 12, atEdge.y + 12) }, viewport);
    assert.equal(reverse.x - atEdge.x, -12);
    assert.equal(reverse.y - atEdge.y, 12);
});

test('locked pair remains visible after viewport, panel and button size changes', () => {
    for (const [width, height, left, top] of [[1440, 900, 0, 0], [390, 844, 0, 0], [844, 390, 0, 0], [280, 300, 100, 70], [24, 20, 13, 11], [8, 8, 20, 40]]) {
        for (const panelOffsetX of [-2000, -398, 0, 60, 2000]) for (const panelOffsetY of [-2000, -548, -100, 0, 60, 2000]) {
            for (const x of [0, .5, 1]) for (const y of [0, .5, 1]) for (const size of [36, 100]) {
                const settings = { ...DEFAULTS, lockPanel: true, panelOffsetX, panelOffsetY, x, y, size, panelWidth: 760, panelHeight: 1000 };
                const p = layoutFloating(settings, { width, height, left, top });
                const context = JSON.stringify({ settings, width, height, p });
                for (const [px, py, w, h] of [[p.x, p.y, p.size, p.size], [p.panelX, p.panelY, p.panelWidth, p.panelHeight]]) {
                    assert.ok(px >= left - .001 && py >= top - .001, context);
                    assert.ok(px + w <= left + width + .001 && py + h <= top + height + .001, context);
                }
            }
        }
    }
});

test('lock setting defaults off and retains saved offsets without enabling truthy strings', () => {
    assert.equal(normalizeSettings({}).lockPanel, false);
    assert.equal(normalizeSettings({ lockPanel: 'true' }).lockPanel, false);
    const saved = normalizeSettings({ lockPanel: true, panelOffsetX: -398, panelOffsetY: -100 });
    assert.equal(saved.lockPanel, true);
    assert.equal(saved.panelOffsetX, -398);
    assert.equal(saved.panelOffsetY, -100);
    assert.deepEqual(normalizeSettings(JSON.parse(JSON.stringify(saved))), saved);
    assert.equal(normalizeSettings({ panelOffsetX: Infinity }).panelOffsetX, DEFAULTS.panelOffsetX);
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

test('older settings gain default panel dimensions and empty custom CSS', () => {
    const legacy = { size: 60, x: .4, y: .2, scope: 'global', defaultScope: 'global' };
    const normalized = normalizeSettings(legacy);
    assert.equal(normalized.panelWidth, 390);
    assert.equal(normalized.panelHeight, 540);
    assert.equal(normalized.customCss, '');
    assert.equal(normalized.size, 60);
    assert.equal(normalized.scope, 'global');
    assert.deepEqual(layoutFloating(legacy, { width: 1440, height: 900 }), layoutFloating(normalized, { width: 1440, height: 900 }));
    assert.deepEqual(normalizeSettings(), DEFAULTS);
});

test('panel dimensions clamp finite values and fall back for invalid values', () => {
    const small = normalizeSettings({ panelWidth: -1, panelHeight: 200 });
    assert.equal(small.panelWidth, PANEL_LIMITS.width.min);
    assert.equal(small.panelHeight, PANEL_LIMITS.height.min);
    const large = normalizeSettings({ panelWidth: 100000, panelHeight: '2000' });
    assert.equal(large.panelWidth, PANEL_LIMITS.width.max);
    assert.equal(large.panelHeight, PANEL_LIMITS.height.max);
    for (const invalid of [undefined, NaN, Infinity, -Infinity, 'invalid']) {
        const normalized = normalizeSettings({ panelWidth: invalid, panelHeight: invalid });
        assert.equal(normalized.panelWidth, DEFAULTS.panelWidth);
        assert.equal(normalized.panelHeight, DEFAULTS.panelHeight);
    }
    const requested = normalizeSettings({ panelWidth: '620', panelHeight: 850 });
    assert.equal(requested.panelWidth, 620);
    assert.equal(requested.panelHeight, 850);
    const layout = layoutFloating({ ...DEFAULTS, ...requested, x: 0, y: 0 }, { width: 1440, height: 1200 });
    assert.equal(layout.panelWidth, 620);
    assert.equal(layout.panelHeight, 850);
});

test('custom CSS preserves a bounded string and rejects other values', () => {
    const css = ':host { --wb-accent: #eab; }\n/* 自定义外观 */';
    assert.equal(normalizeSettings({ customCss: css }).customCss, css);
    const limit = 'x'.repeat(CUSTOM_CSS_LIMIT);
    assert.equal(normalizeSettings({ customCss: limit }).customCss, limit);
    for (const invalid of [limit + 'x', undefined, null, 123, {}, []]) {
        assert.equal(normalizeSettings({ customCss: invalid }).customCss, '');
    }
});

test('custom panel sizes remain inside every viewport and visual viewport offset', () => {
    const viewports = [[1920, 1200, 0, 0], [1440, 900, 0, 0], [390, 844, 0, 0], [320, 568, 0, 0], [844, 390, 0, 0], [390, 280, 0, 0], [280, 300, 100, 70], [24, 20, 13, 11], [8, 8, 20, 40]];
    for (const [width, height, left, top] of viewports) {
        for (const panelWidth of [300, 390, 760, 100000, NaN]) for (const panelHeight of [320, 540, 1000, 100000, Infinity]) {
            for (const x of [0, .5, 1]) for (const y of [0, .5, 1]) {
                const p = layoutFloating({ ...DEFAULTS, panelWidth, panelHeight, x, y }, { width, height, left, top });
                const context = JSON.stringify({ width, height, left, top, panelWidth, panelHeight, x, y, p });
                assert.ok(p.x >= left && p.y >= top, context);
                assert.ok(p.x + p.size <= left + width + .001 && p.y + p.size <= top + height + .001, context);
                assert.ok(p.panelX >= left && p.panelY >= top, context);
                assert.ok(p.panelX + p.panelWidth <= left + width + .001, context);
                assert.ok(p.panelY + p.panelHeight <= top + height + .001, context);
            }
        }
    }
});
