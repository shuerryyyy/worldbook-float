import { DEFAULTS, PANEL_LIMITS, entryRows, entryTitle, layoutFloating, floatingPosition } from './core.js';
import { openThemeEditor } from './theme-editor.js';

/** Isolated UI: host themes cannot accidentally break its layout or its switches. */
export function mountManager({ bridge, settings, saveSettings, styleText }) {
    const host = document.createElement('div');
    host.id = 'clare-worldbook-float';
    host.style.cssText = 'position:fixed!important;inset:0!important;pointer-events:none!important;z-index:10000!important;';
    const shadow = host.attachShadow({ mode: 'open' });
    const stylesheet = document.createElement(styleText ? 'style' : 'link');
    if (styleText) stylesheet.textContent = styleText;
    else {
        stylesheet.rel = 'stylesheet';
        stylesheet.href = new URL('./style.css', import.meta.url).href;
    }
    shadow.append(stylesheet);
    const customStyle = el('style');
    customStyle.textContent = settings.customCss || '';
    shadow.append(customStyle);
    const launcher = el('button', 'launcher');
    launcher.type = 'button';
    launcher.setAttribute('aria-label', '打开世界书管理；长按可移动');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.setAttribute('aria-controls', 'wbf-panel');
    launcher.title = '世界书 · 点击展开，长按移动';
    const picture = el('img');
    picture.alt = '';
    picture.draggable = false;
    launcher.append(picture);
    const panel = el('section', 'panel');
    panel.id = 'wbf-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', '世界书管理');
    const state = { open: false, view: 'books', book: '', data: null, bookQuery: '', entryQuery: '', activeOnly: false, entryFilter: 'all', loading: false, busy: false, error: '', status: '', epoch: 0 };
    let destroyed = false;
    let drag;
    let suppressClickUntil = 0;
    let syncTimer;
    let themeEditor;
    let nativeSettings;
    shadow.append(panel, launcher);
    document.body.append(host);

    function el(tag, className = '', text = '') {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function button(text, action, className = 'action') {
        const node = el('button', className, text);
        node.type = 'button';
        node.addEventListener('click', action);
        return node;
    }

    function viewport() {
        const v = window.visualViewport;
        return { width: v?.width ?? innerWidth, height: v?.height ?? innerHeight, left: v?.offsetLeft ?? 0, top: v?.offsetTop ?? 0 };
    }

    function position() {
        const v = viewport();
        const p = layoutFloating(settings, v);
        Object.assign(launcher.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.size}px`, height: `${p.size}px` });
        Object.assign(panel.style, { left: `${p.panelX}px`, top: `${p.panelY}px`, width: `${p.panelWidth}px`, height: `${p.panelHeight}px` });
        picture.src = settings.image || new URL('./assets/book-open.svg', import.meta.url).href;
        launcher.classList.toggle('custom-image', Boolean(settings.image));
    }

    function persist() { saveSettings({ ...settings }); }

    function editTheme() {
        if (themeEditor || state.busy || destroyed) return;
        const previousView = state.view;
        const previousOpen = state.open;
        const previousFocus = shadow.activeElement || document.activeElement;
        const restoreView = () => {
            state.view = previousView;
            setOpen(previousOpen, false, false);
        };
        themeEditor = openThemeEditor({
            css: settings.customCss || '',
            onPreview(css) {
                customStyle.textContent = css;
                state.view = 'books';
                setOpen(true, false, false);
            },
            onApply(css) {
                settings.customCss = css;
                customStyle.textContent = css;
                persist(); position(); restoreView();
                state.status = css.trim() ? '自定义美化已保存' : '已恢复默认美化';
                message();
            },
            onCancel() { customStyle.textContent = settings.customCss || ''; restoreView(); },
            onReset() { settings.customCss = ''; customStyle.textContent = ''; persist(); position(); restoreView(); },
            onClose() {
                themeEditor = undefined;
                if (previousFocus?.isConnected && previousFocus.getClientRects().length) previousFocus.focus();
                else (panel.querySelector('[data-focus="theme"]') || launcher).focus();
            },
        });
    }

    // Also available in native extension settings, even if a theme hides the launcher.
    const nativeContainer = document.querySelector('#extensions_settings2') || document.querySelector('#extensions_settings');
    if (nativeContainer) {
        nativeSettings = el('details');
        nativeSettings.id = 'clare-worldbook-native-settings';
        nativeSettings.append(el('summary', '', '世界书悬浮管理'));
        nativeSettings.append(button('编辑悬浮窗 CSS', editTheme, 'menu_button'));
        nativeSettings.append(button('恢复默认美化', () => {
            themeEditor?.destroy(); themeEditor = undefined;
            settings.customCss = ''; customStyle.textContent = ''; persist(); position();
            state.status = '已恢复默认美化'; message();
        }, 'menu_button'));
        nativeContainer.append(nativeSettings);
    }

    function setOpen(open, focus = false, resetScope = true) {
        state.open = open;
        panel.hidden = !open;
        launcher.setAttribute('aria-expanded', String(open));
        launcher.setAttribute('aria-label', open ? '收起世界书管理；长按可移动' : '打开世界书管理；长按可移动');
        if (open) {
            if (resetScope) settings.scope = settings.defaultScope;
            position();
            if (state.view === 'entries') void loadBook(state.book);
            else render();
            if (focus) panel.querySelector('input,button')?.focus();
        } else if (focus) launcher.focus();
    }

    function message() {
        const node = panel.querySelector('.feedback');
        if (!node) return;
        node.textContent = state.error || state.status;
        node.classList.toggle('error', Boolean(state.error));
        node.setAttribute('role', state.error ? 'alert' : 'status');
    }

    async function perform(operation, success, update) {
        if (state.busy) return;
        state.busy = true;
        state.error = '';
        state.status = '正在保存…';
        // Keep the clicked control mounted until the request settles, preserving focus
        // and avoiding duplicate change events from input replacement during a click.
        panel.querySelectorAll('button,input,select').forEach(control => {
            if (!control.dataset.allowBusy) control.disabled = true;
        });
        message();
        try {
            const result = await operation();
            if (destroyed) return;
            update?.(result);
            state.status = success;
        } catch (error) {
            state.error = error.message || '保存失败，请重试。';
            state.status = '';
        } finally {
            state.busy = false;
            if (!destroyed) render();
        }
    }

    function toggleBinding(name, enabled) {
        const scope = settings.scope;
        void perform(() => bridge.bind(name, scope, enabled), enabled ? (scope === 'chat' ? '已绑定到当前聊天' : '已全局启用') : '已取消此范围的绑定');
    }

    function makeSwitch(label, checked, disabled, action) {
        const wrap = el('label', 'switch');
        const input = el('input');
        input.type = 'checkbox';
        input.checked = checked;
        input.disabled = disabled;
        input.setAttribute('aria-label', label);
        const track = el('span', 'track');
        track.setAttribute('aria-hidden', 'true');
        input.addEventListener('change', () => action(input.checked));
        wrap.append(input, track);
        return wrap;
    }

    async function loadBook(name) {
        const epoch = ++state.epoch;
        state.view = 'entries';
        state.book = name;
        state.loading = true;
        state.data = null;
        state.error = '';
        state.status = '';
        render();
        try {
            const data = await bridge.load(name);
            if (epoch === state.epoch && !destroyed) state.data = data;
        } catch (error) {
            if (epoch === state.epoch) state.error = error.message;
        } finally {
            if (epoch === state.epoch && !destroyed) {
                state.loading = false;
                render();
            }
        }
    }

    function render() {
        if (destroyed) return;
        const oldScroller = panel.querySelector('.panel-scroll');
        const oldScroll = oldScroller?.dataset.view === state.view ? oldScroller.scrollTop : 0;
        const openEntries = new Set([...panel.querySelectorAll('details[open]')].map(node => node.dataset.entry));
        const active = shadow.activeElement;
        const focusId = active?.dataset.focus;
        const selection = typeof active?.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
        panel.replaceChildren();
        const scroller = el('div', 'panel-scroll');
        scroller.dataset.view = state.view;
        panel.append(scroller);
        const header = el('header', 'header');
        const title = el('h2', '', state.view === 'settings' ? '界面设置' : '世界书');
        header.append(title);
        const tools = el('div', 'tools');
        const refresh = button('刷新', async () => {
            if (state.busy || state.loading) return;
            state.loading = true;
            state.error = '';
            state.status = '正在刷新…';
            render();
            try {
                await bridge.refresh();
                if (destroyed) return;
                if (state.view === 'entries' && bridge.names().includes(state.book)) {
                    await loadBook(state.book);
                } else {
                    state.view = 'books';
                    state.status = '列表已刷新';
                }
            } catch (error) { state.error = error.message; }
            finally { state.loading = false; if (!destroyed) render(); }
        });
        refresh.disabled = state.busy || state.loading;
        const options = button(state.view === 'settings' ? '返回' : '设置', () => {
            state.epoch++;
            state.loading = false;
            state.error = '';
            state.status = '';
            state.view = state.view === 'settings' ? 'books' : 'settings';
            render();
        });
        options.disabled = state.busy;
        const close = button('收起', () => setOpen(false, true));
        close.dataset.allowBusy = 'true';
        tools.append(refresh, options, close);
        header.append(tools);
        scroller.append(header);
        if (state.view === 'settings') renderSettings();
        else {
            const scope = el('div', 'scope');
            const tabs = el('div', 'tabs');
            tabs.setAttribute('aria-label', '世界书绑定范围');
            for (const [value, label] of [['chat', '当前聊天'], ['global', '全局']]) {
                const tab = button(label, () => { settings.scope = value; render(); }, 'tab');
                tab.setAttribute('aria-pressed', String(settings.scope === value));
                tab.disabled = state.busy;
                tabs.append(tab);
            }
            scope.append(tabs);
            scope.append(el('p', 'hint', settings.scope === 'chat' ? (bridge.hasChat() ? '当前聊天可绑定一本书；开启另一本会替换绑定。' : '先打开聊天，即可在这里绑定世界书。') : '此处的总开关影响所有聊天的全局世界书。'));
            scroller.append(scope);
            if (state.view === 'entries') {
                const breadcrumb = el('div', 'breadcrumb');
                const back = button('返回列表', () => { state.epoch++; state.loading = false; state.view = 'books'; state.error = ''; state.status = ''; render(); });
                back.disabled = state.busy;
                breadcrumb.append(back, el('strong', 'book-name', state.book));
                scroller.append(breadcrumb);
                const binding = el('div', 'entry-binding');
                const bound = bridge.isBound(state.book, settings.scope);
                const bindingText = el('div', 'entry-binding-text');
                bindingText.append(el('strong', '', settings.scope === 'chat' ? '用于当前聊天' : '全局启用这本书'));
                bindingText.append(el('p', 'hint', bound ? '此范围已启用；下面的条目仍按各自触发规则生效。' : '此范围尚未启用。仅打开下面的条目，不会自动绑定这本书。'));
                const name = state.book;
                binding.append(bindingText, makeSwitch(`${settings.scope === 'chat' ? '当前聊天绑定' : '全局启用'}：${name}`, bound, state.busy || (settings.scope === 'chat' && !bridge.hasChat()), enabled => toggleBinding(name, enabled)));
                scroller.append(binding);
            }
            const search = el('input', 'search');
            search.type = 'search';
            search.placeholder = state.view === 'books' ? '搜索世界书名称' : '搜索条目名称、关键词或内容';
            search.setAttribute('aria-label', search.placeholder);
            search.dataset.focus = 'search';
            search.value = state.view === 'books' ? state.bookQuery : state.entryQuery;
            search.addEventListener('input', () => {
                if (state.view === 'books') state.bookQuery = search.value;
                else state.entryQuery = search.value;
                renderList();
            });
            scroller.append(search);
            const filters = el('div', 'filters');
            if (state.view === 'books') {
                const label = el('label', 'filter-label');
                const input = el('input');
                input.type = 'checkbox'; input.checked = state.activeOnly;
                input.addEventListener('change', () => { state.activeOnly = input.checked; renderList(); });
                label.append(input, document.createTextNode('仅当前关联'));
                filters.append(label);
            } else {
                for (const [value, label] of [['all', '全部'], ['on', '已开启'], ['off', '已关闭']]) {
                    const filter = button(label, () => { state.entryFilter = value; render(); }, 'filter');
                    filter.setAttribute('aria-pressed', String(state.entryFilter === value));
                    filters.append(filter);
                }
            }
            filters.append(el('span', 'count'));
            scroller.append(filters, el('div', 'list'));
            renderList();
        }
        const feedback = el('div', 'feedback');
        feedback.setAttribute('aria-live', 'polite');
        scroller.append(feedback);
        message();
        const footer = el('footer', 'footer', state.view === 'entries' ? '条目开关修改原世界书，影响所有引用它的聊天。' : '点击展开 · 长按移动 · 位置自动记住');
        scroller.append(footer);
        panel.querySelectorAll('details').forEach(node => { node.open = openEntries.has(node.dataset.entry); });
        if (focusId) {
            const replacement = [...panel.querySelectorAll('[data-focus]')].find(node => node.dataset.focus === focusId);
            if (replacement) {
                replacement.focus({ preventScroll: true });
                if (selection && replacement.type !== 'range') replacement.setSelectionRange(...selection);
            }
        }
        scroller.scrollTop = oldScroll;
    }

    function renderList() {
        const list = panel.querySelector('.list');
        if (!list) return;
        list.replaceChildren();
        let shown = 0;
        let total = 0;
        if (state.view === 'books') {
            const names = bridge.names().sort((a, b) => Number(Boolean(bridge.sources(b).length)) - Number(Boolean(bridge.sources(a).length)) || a.localeCompare(b, 'zh-CN'));
            total = names.length;
            for (const name of names) {
                const sources = bridge.sources(name);
                if (state.activeOnly && !sources.length) continue;
                if (!name.toLocaleLowerCase().includes(state.bookQuery.toLocaleLowerCase().trim())) continue;
                shown++;
                const row = el('div', 'book-row');
                const open = button('', () => { state.entryQuery = ''; state.entryFilter = 'all'; void loadBook(name); }, 'book-open');
                open.disabled = state.busy;
                open.append(el('strong', '', name));
                const info = el('span', 'sources', sources.length ? `关联：${sources.join(' / ')}` : '未关联当前聊天');
                open.append(info);
                const binding = makeSwitch(`${settings.scope === 'chat' ? '当前聊天绑定' : '全局启用'}：${name}`, bridge.isBound(name, settings.scope), state.busy || (settings.scope === 'chat' && !bridge.hasChat()), enabled => toggleBinding(name, enabled));
                row.append(open, binding);
                list.append(row);
            }
            if (!shown) list.append(el('p', 'empty', total ? '没有匹配的世界书。试试其他名称，或取消筛选。' : '还没有世界书。先在酒馆中导入一本，再点击刷新。'));
        } else {
            const rows = entryRows(state.data);
            total = rows.length;
            if (state.loading) list.append(el('p', 'empty', '正在读取条目…'));
            else if (!state.data && state.error) list.append(button('重新读取', () => void loadBook(state.book), 'retry'));
            else for (const { key, entry } of rows) {
                const query = state.entryQuery.trim().toLocaleLowerCase();
                const haystack = `${entryTitle(entry)} ${(entry.key ?? []).join?.(' ') ?? ''} ${(entry.keysecondary ?? []).join?.(' ') ?? ''} ${entry.content ?? ''}`.toLocaleLowerCase();
                if (!haystack.includes(query)) continue;
                if (state.entryFilter === 'on' && entry.disable || state.entryFilter === 'off' && !entry.disable) continue;
                shown++;
                const row = el('div', `entry-row${entry.disable ? ' is-disabled' : ''}`);
                const head = el('div', 'entry-head');
                const detail = el('details', 'entry-detail');
                detail.dataset.entry = key;
                const summary = el('summary');
                summary.append(el('strong', '', entryTitle(entry)));
                const mode = entry.constant ? '常驻' : entry.vectorized ? '向量' : '关键词';
                summary.append(el('span', 'entry-meta', `${mode} · #${entry.uid ?? key}${entry.disable ? ' · 已关闭' : ''}`));
                detail.append(summary);
                const content = el('div', 'entry-content');
                const keys = Array.isArray(entry.key) ? entry.key.join('、') : '';
                content.append(el('p', 'entry-keys', `关键词：${keys || '无'}`), el('p', 'entry-text', String(entry.content || '（条目内容为空）')));
                detail.append(content);
                const name = state.book;
                const toggle = makeSwitch(`启用条目：${entryTitle(entry)}`, !entry.disable, state.busy, enabled => {
                    void perform(() => bridge.toggleEntry(name, key, enabled), '条目开关已保存', data => {
                        if (state.view === 'entries' && state.book === name) state.data = data;
                    });
                });
                head.append(detail, toggle);
                row.append(head);
                list.append(row);
            }
            if (!shown && !state.loading && state.data) list.append(el('p', 'empty', total ? '没有匹配的条目。试试其他关键词或筛选。' : '这本世界书还没有条目。'));
        }
        const count = panel.querySelector('.count');
        if (count) count.textContent = `${shown} / ${total}`;
    }

    function renderSettings() {
        const body = el('div', 'settings-body');
        body.append(el('p', 'settings-intro', '把常用的世界书，放在手边。'));
        const sizeLabel = el('label', 'setting-label', '按钮大小');
        sizeLabel.htmlFor = 'wbf-size';
        const output = el('output', '', `${settings.size}px`);
        const size = el('input', 'size-range');
        size.id = 'wbf-size'; size.type = 'range'; size.min = '36'; size.max = '100'; size.step = '1'; size.value = String(settings.size);
        size.dataset.focus = 'size';
        size.addEventListener('input', () => { settings.size = Number(size.value); output.textContent = `${settings.size}px`; position(); });
        size.addEventListener('change', persist);
        const sizeHead = el('div', 'size-head'); sizeHead.append(sizeLabel, output);
        body.append(sizeHead, size);
        body.append(el('h3', '', '展开面板大小'), el('p', 'hint', '设置宽度和高度；屏幕空间不足时会自动缩小，不会超出可视区域。'));
        for (const [key, label, limits] of [['panelWidth', '面板宽度', PANEL_LIMITS.width], ['panelHeight', '面板高度', PANEL_LIMITS.height]]) {
            const dimensionLabel = el('label', 'setting-label', label);
            dimensionLabel.htmlFor = `wbf-${key}`;
            const dimensionOutput = el('output', '', `${settings[key]}px`);
            const dimension = el('input', 'size-range');
            dimension.id = dimensionLabel.htmlFor; dimension.type = 'range';
            dimension.min = String(limits.min); dimension.max = String(limits.max); dimension.step = '1'; dimension.value = String(settings[key]);
            dimension.dataset.focus = key;
            dimension.addEventListener('input', () => { settings[key] = Number(dimension.value); dimensionOutput.textContent = `${settings[key]}px`; position(); });
            dimension.addEventListener('change', persist);
            const head = el('div', 'size-head dimension-head'); head.append(dimensionLabel, dimensionOutput);
            body.append(head, dimension);
        }
        body.append(button('恢复默认面板大小', () => {
            settings.panelWidth = DEFAULTS.panelWidth; settings.panelHeight = DEFAULTS.panelHeight;
            persist(); position(); state.status = '面板大小已重置'; render();
        }));
        body.append(el('h3', '', '自定义美化'), el('p', 'hint', settings.customCss?.trim() ? '自定义 CSS 使用中。点击编辑可预览、修改或恢复默认。' : '用 CSS 调整配色、字体、圆角和背景；预览满意后再应用。'));
        const editCss = button('编辑 CSS', editTheme, 'primary');
        editCss.dataset.focus = 'theme';
        body.append(editCss);
        body.append(el('h3', '', '按钮图片'), el('p', 'hint', '上传 PNG、JPG 或 WebP，支持透明背景。'));
        const upload = el('input');
        upload.type = 'file'; upload.accept = 'image/png,image/jpeg,image/webp'; upload.hidden = true;
        upload.addEventListener('change', async () => {
            const file = upload.files?.[0];
            if (!file) return;
            state.error = '';
            try {
                if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('请上传 PNG、JPG 或 WebP 图片。');
                if (file.size > 8 * 1024 * 1024) throw new Error('图片超过 8MB，请压缩后再上传。');
                const bitmap = await createImageBitmap(file);
                if (destroyed) { bitmap.close(); return; }
                const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(bitmap.width * scale));
                canvas.height = Math.max(1, Math.round(bitmap.height * scale));
                canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                bitmap.close();
                settings.image = canvas.toDataURL('image/png');
                state.status = '按钮图片已更新';
                persist(); position();
            } catch (error) { state.error = error.message || '这张图片无法读取，请换一张。'; }
            render();
        });
        const actions = el('div', 'setting-actions');
        actions.append(button('上传图片', () => upload.click(), 'primary'), button('恢复默认图片', () => { settings.image = ''; persist(); position(); state.status = '已恢复默认图片'; message(); }));
        body.append(upload, actions);
        body.append(el('h3', '', '移动位置'), el('p', 'hint', '按住按钮约半秒，再拖到想放的位置。松开后自动保存；窗口变小时会自动留在屏幕内。'));
        const lockLabel = el('div', 'size-head');
        lockLabel.append(el('span', 'setting-label', '锁定按钮与面板相对位置'), makeSwitch('锁定按钮与面板相对位置', settings.lockPanel, false, enabled => {
            const v = viewport();
            const current = layoutFloating(settings, v);
            if (enabled) {
                settings.panelOffsetX = current.panelX - current.x;
                settings.panelOffsetY = current.panelY - current.y;
            }
            settings.lockPanel = enabled;
            Object.assign(settings, floatingPosition(settings, v, current.x, current.y));
            persist(); position();
            state.status = enabled ? '已锁定，长按按钮可一起移动面板' : '已恢复自动展开位置';
            message();
        }));
        body.append(lockLabel, el('p', 'hint', '开启时固定当前相对位置，拖动按钮会带着面板一起走，到边缘一起停下。屏幕变小时会适配可用空间；关闭后恢复自动展开。'));
        body.append(button('重置位置', () => { settings.x = DEFAULTS.x; settings.y = DEFAULTS.y; persist(); position(); state.status = '位置已重置'; message(); }));
        body.append(el('h3', '', '默认管理范围'));
        const scopeLabel = el('label', 'setting-label', '展开面板时使用');
        scopeLabel.htmlFor = 'wbf-default-scope';
        const scopeSelect = el('select', 'scope-select');
        scopeSelect.id = 'wbf-default-scope';
        scopeSelect.dataset.focus = 'default-scope';
        for (const [value, text] of [['chat', '当前聊天'], ['global', '全局世界书']]) {
            const option = el('option', '', text); option.value = value; scopeSelect.append(option);
        }
        scopeSelect.value = settings.defaultScope;
        scopeSelect.addEventListener('change', () => {
            settings.defaultScope = scopeSelect.value;
            settings.scope = scopeSelect.value;
            persist();
            state.status = `默认范围已设为${scopeSelect.value === 'chat' ? '当前聊天' : '全局世界书'}`;
            message();
        });
        body.append(scopeLabel, scopeSelect, el('p', 'hint', '面板顶部仍可临时切换范围；再次展开时恢复这里的选择。角色或用户绑定会单独标出；条目开关直接保存到原世界书。'));
        panel.querySelector('.panel-scroll').append(body);
    }

    launcher.addEventListener('click', event => {
        if (Date.now() < suppressClickUntil) { event.preventDefault(); return; }
        setOpen(!state.open, event.detail === 0);
    });

    launcher.addEventListener('pointerdown', event => {
        if (event.button !== 0 || drag) return;
        const rect = launcher.getBoundingClientRect();
        drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, dx: event.clientX - rect.left, dy: event.clientY - rect.top, active: false, movedEarly: false };
        launcher.setPointerCapture(event.pointerId);
        drag.timer = setTimeout(() => {
            if (!drag || drag.movedEarly) return;
            drag.active = true;
            launcher.classList.add('dragging');
            navigator.vibrate?.(15);
        }, 450);
    });

    launcher.addEventListener('pointermove', event => {
        if (!drag || drag.id !== event.pointerId) return;
        if (!drag.active) {
            if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 10) {
                clearTimeout(drag.timer); drag.movedEarly = true;
            }
            return;
        }
        Object.assign(settings, floatingPosition(settings, viewport(), event.clientX - drag.dx, event.clientY - drag.dy));
        position();
    });

    function finishDrag(event) {
        if (!drag || drag.id !== event.pointerId) return;
        clearTimeout(drag.timer);
        if (drag.active || drag.movedEarly || event.type === 'pointercancel') suppressClickUntil = Date.now() + 700;
        if (drag.active) persist();
        launcher.classList.remove('dragging');
        drag = undefined;
    }
    launcher.addEventListener('pointerup', finishDrag);
    launcher.addEventListener('pointercancel', finishDrag);
    launcher.addEventListener('lostpointercapture', finishDrag);
    launcher.addEventListener('contextmenu', event => event.preventDefault());

    function onKey(event) {
        if (event.key === 'Escape' && state.open) { setOpen(false, true); event.stopPropagation(); }
        if (shadow.activeElement === launcher && event.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            event.preventDefault();
            const v = viewport();
            const step = event.shiftKey ? 40 : 12;
            const current = layoutFloating(settings, v);
            const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
            const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
            Object.assign(settings, floatingPosition(settings, v, current.x + dx, current.y + dy));
            persist(); position();
        }
    }
    shadow.addEventListener('keydown', onKey);
    window.addEventListener('resize', position);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    position();

    return {
        /** Native changes are reflected without background polling. */
        sync() {
            clearTimeout(syncTimer);
            syncTimer = setTimeout(() => {
                if (!state.open || destroyed || state.busy) return;
                if (state.view === 'entries') void loadBook(state.book);
                else if (state.view === 'books') render();
            }, 100);
        },
        destroy() {
            destroyed = true;
            state.epoch++;
            clearTimeout(syncTimer); clearTimeout(drag?.timer);
            window.removeEventListener('resize', position);
            window.visualViewport?.removeEventListener('resize', position);
            window.visualViewport?.removeEventListener('scroll', position);
            themeEditor?.destroy();
            nativeSettings?.remove();
            host.remove();
        },
    };
}
