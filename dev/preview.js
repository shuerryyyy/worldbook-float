// Synthetic data only. This preview never reads or modifies real SillyTavern data.
const demoBooks = {
    '雾港 · 城市与传闻': { entries: {
        0: { uid: 0, comment: '雾港的夜晚', key: ['雾港', '夜晚'], content: '入夜后，海雾会沿石阶漫进旧城区。灯塔每隔七秒闪烁一次，渔民说那是在给归航的人指路。', constant: true, disable: false },
        1: { uid: 1, comment: '旧书店的来客', key: ['旧书店', '店主'], content: '旧书店的店主记得每一位借书的人。靠窗的书架上，始终留着一本没有名字的笔记。', disable: false },
        2: { uid: 2, comment: '潮汐钟楼', key: ['钟楼', '潮汐'], content: '钟楼只有在涨潮时才会报时。没有人知道谁在上面敲钟。', disable: true },
        3: { uid: 3, comment: '未寄出的信', key: ['信件'], content: '演示条目：内容由预览生成，并非用户的真实世界书。', disable: false },
        4: { uid: 4, comment: '地下集市', key: ['集市'], content: '每周五开放。摊贩只接受交换，不收钱币。', disable: false },
    } },
    '旅人 · 人物关系': { entries: { 0: { uid: 0, comment: '同行者', key: ['同行'], content: '演示人物条目。', disable: false } } },
    '叙事规则': { entries: { 0: { uid: 0, comment: '叙事视角', key: [], content: '演示叙事规则。', constant: true, disable: false } } },
    '很长的世界书名称用于检查窄屏自动换行以及左右边缘适配不会出现横向滚动': { entries: {} },
    '尚未启用的支线': { entries: {} },
};
let currentBook = '雾港 · 城市与传闻';
const globals = new Set(['叙事规则']);
let failNext = false;
const demoBridge = {
    names: () => Object.keys(demoBooks),
    sources: name => [currentBook === name ? '聊天' : '', globals.has(name) ? '全局' : '', name === '旅人 · 人物关系' ? '角色' : ''].filter(Boolean),
    isBound: (name, scope) => scope === 'chat' ? currentBook === name : globals.has(name),
    hasChat: () => true,
    load: async name => { await new Promise(resolve => setTimeout(resolve, 80)); if (!demoBooks[name]) throw new Error('这本书已被删除。'); return structuredClone(demoBooks[name]); },
    refresh: async () => {},
    bind: async (name, scope, enabled) => {
        if (scope === 'chat') currentBook = enabled ? name : '';
        else if (enabled) globals.add(name); else globals.delete(name);
    },
    toggleEntry: async (name, key, enabled) => {
        await new Promise(resolve => setTimeout(resolve, 70));
        if (failNext) { failNext = false; throw new Error('演示：保存失败，请重试。'); }
        setEntryEnabled(demoBooks[name], key, enabled);
        return structuredClone(demoBooks[name]);
    },
};
let previewSettings;
try { previewSettings = normalizeSettings(JSON.parse(localStorage.getItem('wbf-preview') || '{}')); }
catch { previewSettings = { ...DEFAULTS }; }
const preview = mountManager({ bridge: demoBridge, settings: previewSettings, styleText: PREVIEW_STYLE,
    saveSettings: value => localStorage.setItem('wbf-preview', JSON.stringify(value)),
});
window.wbfDemo = { books: demoBooks, failNext: () => { failNext = true; }, sync: () => preview.sync() };
