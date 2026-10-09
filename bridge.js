import { createQueue, setEntryEnabled } from './core.js';

/** The only adapter that knows SillyTavern internals. No hard-coded user/book names. */
export function createBridge({ context, world, request = fetch, jquery = globalThis.jQuery, document: doc = globalThis.document }) {
    const enqueue = createQueue();
    const chatKey = world.METADATA_KEY || 'world_info';
    const chatIdentity = ctx => `${ctx.groupId ?? ''}:${ctx.characterId ?? ''}:${ctx.getCurrentChatId?.() ?? ctx.chatId ?? ''}`;
    const hasChat = ctx => Boolean(ctx.getCurrentChatId?.() ?? ctx.chatId);

    async function post(path, body) {
        const response = await request(path, {
            method: 'POST', headers: context().getRequestHeaders(),
            body: JSON.stringify(body), cache: 'no-store',
        });
        if (!response.ok) throw new Error(`酒馆未能保存或读取数据（HTTP ${response.status}），请重试。`);
        return response;
    }

    function names() {
        const ctx = context();
        return [...new Set(ctx.getWorldInfoNames?.() ?? world.world_names ?? [])];
    }

    function sources(name) {
        const ctx = context();
        const result = [];
        if ((world.selected_world_info ?? []).includes(name)) result.push('全局');
        if (ctx.chatMetadata?.[chatKey] === name) result.push('聊天');
        const group = ctx.groups?.find(group => String(group.id) === String(ctx.groupId));
        const chars = ctx.groupId != null && group
            ? (ctx.characters ?? []).filter(char => group.members?.includes(char.avatar) && !group.disabled_members?.includes(char.avatar))
            : [ctx.characters?.[ctx.characterId]].filter(Boolean);
        const linked = chars.some(char => {
            const primary = char.data?.extensions?.world;
            const filename = String(char.avatar ?? '').replace(/\.[^.]+$/, '');
            const extra = world.world_info?.charLore?.find(item => item.name === filename)?.extraBooks ?? [];
            return primary === name || extra.includes(name);
        });
        if (linked) result.push('角色');
        if (ctx.powerUserSettings?.persona_description_lorebook === name) result.push('用户');
        return result;
    }

    function isBound(name, scope) {
        return scope === 'global'
            ? (world.selected_world_info ?? []).includes(name)
            : context().chatMetadata?.[chatKey] === name;
    }

    async function load(name) {
        if (!names().includes(name)) throw new Error('这本世界书已被删除或重命名，请刷新列表。');
        const data = await (await post('/api/worldinfo/get', { name })).json();
        if (!data?.entries || typeof data.entries !== 'object') throw new Error('无法读取这本世界书的条目，请在酒馆中检查文件。');
        return data;
    }

    function toggleEntry(name, key, enabled) {
        return enqueue(async () => {
            if (!names().includes(name)) throw new Error('这本世界书已被删除或重命名，请刷新列表。');
            const ctx = context();
            let current = await load(name);
            if (world.worldInfoCache?.has(name)) {
                if (!ctx.loadWorldInfo) throw new Error('此版本缺少世界书读取接口，请升级酒馆。');
                // Never call native immediate save: its global debounce cancellation
                // can discard a pending edit in ANOTHER book. When this target has
                // unsaved native data, wait for native disk/cache agreement instead.
                const deadline = Date.now() + 5000;
                let native = await ctx.loadWorldInfo(name);
                while (JSON.stringify(native) !== JSON.stringify(current)) {
                    if (Date.now() >= deadline) throw new Error('原生编辑器仍有未保存的修改，请稍后重试；若使用多个标签页，请刷新酒馆。');
                    await new Promise(resolve => setTimeout(resolve, 120));
                    current = await load(name);
                    native = await ctx.loadWorldInfo(name);
                }
            }
            const data = setEntryEnabled(structuredClone(current), key, enabled);
            await post('/api/worldinfo/edit', { name, data });
            // Publish only after a successful HTTP response. Native prompt generation reads this cache.
            world.worldInfoCache?.set(name, structuredClone(data));
            try {
                const event = ctx.eventTypes.WORLDINFO_UPDATED;
                if (event) await ctx.eventSource.emit(event, name, data);
                ctx.reloadWorldInfoEditor?.(name);
            } catch (error) {
                console.warn('[worldbook-float] 已保存，但其他插件的刷新回调出错', error);
            }
            return data;
        });
    }

    function bind(name, scope, enabled) {
        const initial = context();
        const identity = chatIdentity(initial);
        return enqueue(async () => {
            if (!names().includes(name)) throw new Error('世界书列表已变化，请刷新后重试。');
            if (scope === 'global') {
                const select = doc.querySelector('#world_info');
                const option = select && [...select.options].find(item => item.textContent === name);
                if (!option || !jquery) throw new Error('找不到酒馆的全局世界书控件，请刷新酒馆后重试。');
                option.selected = enabled;
                // Trigger the native handler, keeping its live selection and settings in sync.
                jquery(select).trigger('change');
                return;
            }
            const ctx = context();
            if (!hasChat(ctx)) throw new Error('请先打开一个聊天，再绑定世界书。');
            if (identity !== chatIdentity(ctx)) throw new Error('聊天已切换，请在新聊天中重试。');
            const metadata = ctx.chatMetadata;
            const old = metadata[chatKey];
            if (enabled) metadata[chatKey] = name;
            else if (old === name) delete metadata[chatKey];
            else return;
            try {
                await ctx.saveMetadata();
            } catch (error) {
                if (context().chatMetadata === metadata && identity === chatIdentity(context())) {
                    if (old === undefined) delete metadata[chatKey];
                    else metadata[chatKey] = old;
                }
                throw error;
            }
            if (identity === chatIdentity(context())) {
                doc.querySelectorAll('.chat_lorebook_button').forEach(button => button.classList.toggle('world_set', Boolean(metadata[chatKey])));
            }
        });
    }

    return {
        names, sources, load, isBound, toggleEntry, bind,
        hasChat: () => hasChat(context()),
        refresh: () => context().updateWorldInfoList(),
    };
}
