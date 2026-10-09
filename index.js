import { mountManager } from './ui.js';
import { createBridge } from './bridge.js';
import { DEFAULTS, SETTINGS_KEY, normalizeSettings } from './core.js';

let instance;
let initialization;

/** Mount once, after the host has finished constructing its native controls. */
async function start() {
    if (instance) return;
    if (initialization) return initialization;
    initialization = (async () => {
        const context = () => SillyTavern.getContext();
        const world = await import('/scripts/world-info.js');
        if (!world.worldInfoCache?.set) throw new Error('此版本缺少世界书缓存接口，请升级酒馆。');
        const ctx = context();
        const stored = ctx.extensionSettings[SETTINGS_KEY] ?? structuredClone(DEFAULTS);
        const settings = normalizeSettings(stored);
        instance = mountManager({
            bridge: createBridge({ context, world }), settings,
            saveSettings(next) {
                context().extensionSettings[SETTINGS_KEY] = structuredClone(next);
                context().saveSettingsDebounced();
            },
        });
        const subscriptions = [];
        for (const key of ['CHAT_CHANGED', 'WORLDINFO_UPDATED', 'WORLDINFO_SETTINGS_UPDATED']) {
            if (!ctx.eventTypes[key]) continue;
            const listener = () => instance?.sync();
            ctx.eventSource.on(ctx.eventTypes[key], listener);
            subscriptions.push([ctx.eventTypes[key], listener]);
        }
        instance.unsubscribe = () => subscriptions.forEach(([event, listener]) => ctx.eventSource.removeListener(event, listener));
    })().catch(error => {
        console.error('[worldbook-float]', error);
        globalThis.toastr?.error(`世界书悬浮管理无法启动：${error.message}`);
    }).finally(() => { initialization = undefined; });
    return initialization;
}

export function onDisable() {
    instance?.unsubscribe?.();
    instance?.destroy();
    instance = undefined;
}

export function onEnable() { return start(); }

const context = SillyTavern.getContext();
// APP_READY covers newer releases; jQuery ready also supports older ones.
if (context.eventTypes.APP_READY) context.eventSource.once(context.eventTypes.APP_READY, start);
jQuery(() => { void start(); });
