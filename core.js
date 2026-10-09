/** Pure data and geometry helpers shared by the extension and preview. */
export const SETTINGS_KEY = 'clare_worldbook_float';
export const DEFAULTS = Object.freeze({ size: 52, image: '', x: 0.93, y: 0.64, scope: 'chat', defaultScope: 'chat', panelWidth: 390, panelHeight: 540, lockPanel: false, panelOffsetX: -398, panelOffsetY: 0, customCss: '' });
export const PANEL_LIMITS = Object.freeze({
    width: Object.freeze({ min: 300, max: 760 }),
    height: Object.freeze({ min: 320, max: 1000 }),
});
export const CUSTOM_CSS_LIMIT = 200000;

export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
}

export function normalizeSettings(settings = {}) {
    const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    return {
        size: clamp(finite(settings.size, DEFAULTS.size), 36, 100),
        image: typeof settings.image === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(settings.image) ? settings.image : '',
        x: clamp(finite(settings.x, DEFAULTS.x), 0, 1),
        y: clamp(finite(settings.y, DEFAULTS.y), 0, 1),
        scope: settings.scope === 'global' ? 'global' : 'chat',
        defaultScope: settings.defaultScope === 'global' ? 'global' : 'chat',
        panelWidth: clamp(finite(settings.panelWidth, DEFAULTS.panelWidth), PANEL_LIMITS.width.min, PANEL_LIMITS.width.max),
        panelHeight: clamp(finite(settings.panelHeight, DEFAULTS.panelHeight), PANEL_LIMITS.height.min, PANEL_LIMITS.height.max),
        lockPanel: settings.lockPanel === true,
        panelOffsetX: clamp(finite(settings.panelOffsetX, DEFAULTS.panelOffsetX), -2000, 2000),
        panelOffsetY: clamp(finite(settings.panelOffsetY, DEFAULTS.panelOffsetY), -2000, 2000),
        customCss: typeof settings.customCss === 'string' && settings.customCss.length <= CUSTOM_CSS_LIMIT ? settings.customCss : '',
    };
}

/** Positions everything inside the visible viewport, including keyboard/zoom offsets. */
export function layoutFloating(settings, viewport) {
    settings = normalizeSettings(settings);
    const { width, height, left = 0, top = 0 } = viewport;
    const gap = Math.max(0, Math.min(8, width / 2, height / 2));
    const size = Math.min(settings.size, Math.max(0, width - gap * 2), Math.max(0, height - gap * 2));
    const x = left + gap + settings.x * Math.max(0, width - size - gap * 2);
    const y = top + gap + settings.y * Math.max(0, height - size - gap * 2);
    const panelWidth = Math.min(settings.panelWidth, Math.max(0, width - gap * 2));
    let panelHeight = Math.min(settings.panelHeight, Math.max(0, height - gap * 2));
    if (settings.lockPanel) {
        // Constrain the pair as one object. Narrow viewports may compress the
        // offset, but the saved offset is retained for when space returns.
        const offsetX = clamp(settings.panelOffsetX, size - width + gap * 2, width - gap * 2 - panelWidth);
        const offsetY = clamp(settings.panelOffsetY, size - height + gap * 2, height - gap * 2 - panelHeight);
        const bounds = {
            minX: left + gap - Math.min(0, offsetX),
            maxX: left + width - gap - Math.max(size, offsetX + panelWidth),
            minY: top + gap - Math.min(0, offsetY),
            maxY: top + height - gap - Math.max(size, offsetY + panelHeight),
        };
        const lockedX = bounds.minX + settings.x * Math.max(0, bounds.maxX - bounds.minX);
        const lockedY = bounds.minY + settings.y * Math.max(0, bounds.maxY - bounds.minY);
        return { x: lockedX, y: lockedY, size, panelX: lockedX + offsetX, panelY: lockedY + offsetY, panelWidth, panelHeight, bounds };
    }
    const roomRight = left + width - x - size - gap * 2;
    const roomLeft = x - left - gap * 2;
    let panelX;
    if (roomRight >= panelWidth) panelX = x + size + gap;
    else if (roomLeft >= panelWidth) panelX = x - panelWidth - gap;
    else panelX = x + size / 2 - panelWidth / 2;
    let panelY = clamp(y, top + gap, top + height - panelHeight - gap);
    if (roomRight < panelWidth && roomLeft < panelWidth) {
        const above = y - top - gap * 2;
        const below = top + height - y - size - gap * 2;
        if (Math.max(above, below) >= 240) {
            panelHeight = Math.min(panelHeight, Math.max(above, below));
            panelY = above >= below ? y - panelHeight - gap : y + size + gap;
        }
    }
    return {
        x, y, size,
        panelX: clamp(panelX, left + gap, left + width - panelWidth - gap),
        panelY,
        panelWidth, panelHeight,
        bounds: { minX: left + gap, maxX: left + width - gap - size, minY: top + gap, maxY: top + height - gap - size },
    };
}

/** Convert a desired button position into the current mode's movable range. */
export function floatingPosition(settings, viewport, x, y) {
    const { bounds } = layoutFloating(settings, viewport);
    return {
        x: clamp((x - bounds.minX) / Math.max(1, bounds.maxX - bounds.minX), 0, 1),
        y: clamp((y - bounds.minY) / Math.max(1, bounds.maxY - bounds.minY), 0, 1),
    };
}

export function entryRows(data) {
    if (!data?.entries || typeof data.entries !== 'object') return [];
    return Object.entries(data.entries)
        .filter(([, entry]) => entry && typeof entry === 'object')
        .map(([key, entry]) => ({ key, entry }))
        .sort((a, b) => (Number(a.entry.displayIndex ?? a.entry.uid) || 0) - (Number(b.entry.displayIndex ?? b.entry.uid) || 0));
}

export function entryTitle(entry) {
    return String(entry.comment || (Array.isArray(entry.key) && entry.key.join('、')) || `未命名条目 #${entry.uid ?? '?'}`);
}

/** Only the kill switch and its original imported representation may change. */
export function setEntryEnabled(data, key, enabled) {
    const entry = data.entries?.[key];
    if (!entry) throw new Error('这个条目已被删除，请刷新后重试。');
    entry.disable = !enabled;
    const original = data.originalData?.entries;
    if (Array.isArray(original)) {
        const imported = original.find(item => String(item.uid ?? item.id) === String(entry.uid));
        if (imported) imported.enabled = enabled;
    }
    return data;
}

/** Serializes writes so rapid toggles in one book cannot replace each other's changes. */
export function createQueue() {
    let tail = Promise.resolve();
    return operation => {
        const next = tail.then(operation);
        tail = next.catch(() => {});
        return next;
    };
}
