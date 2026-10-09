import { CUSTOM_CSS_LIMIT } from './core.js';

const LIGHT_EXAMPLE = `/* 浅色纸页：可从下面的颜色变量开始修改。 */
:host {
    --wbf-bg: #f5f5ef;
    --wbf-surface: #e8ece4;
    --wbf-ink: #26332a;
    --wbf-muted: #556454;
    --wbf-line: #c9d2c5;
    --wbf-accent: #416e4b;
    --wbf-on-accent: #ffffff;
    --wbf-error: #ad3529;
    color-scheme: light;
}

.panel { border-radius: 18px; }
.book-row:hover { background: var(--wbf-surface); }
`;

// This editor lives in a separate shadow root. User CSS is never inserted here.
const EDITOR_CSS = `
:host { all: initial; font-family: var(--mainFontFamily, 'Segoe UI'), 'Microsoft YaHei', sans-serif; }
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
dialog {
    position: fixed; inset: 8px; margin: auto;
    width: min(760px, calc(100vw - 16px)); height: min(720px, calc(100dvh - 16px));
    max-width: calc(100vw - 16px); max-height: calc(100dvh - 16px);
    padding: 0; border: 0; border-radius: 14px; overflow: hidden;
    background: #24282c; color: #f1f0e9; color-scheme: dark;
    font-family: inherit; font-size: 14px; line-height: 1.5;
    box-shadow: 0 16px 48px #0007;
}
dialog[open] { display: flex; flex-direction: column; }
dialog::backdrop { background: #101517a6; }
dialog.previewing {
    inset: auto 8px max(8px, env(safe-area-inset-bottom)) 8px;
    width: min(560px, calc(100vw - 16px)); height: auto;
    overflow-y: auto;
}
dialog.previewing::backdrop { background: transparent; }
button, textarea { font: inherit; }
button { cursor: pointer; border: 0; border-radius: 6px; min-height: 38px; padding: 7px 12px; background: #30363a; color: #f1f0e9; }
button:hover:not(:disabled) { background: #434c48; }
button.primary { background: #baddb5; color: #213322; font-weight: 600; }
button.primary:hover:not(:disabled) { background: #c8e5c3; }
button:disabled { cursor: default; opacity: .5; }
button:focus-visible, textarea:focus-visible { outline: 2px solid #baddb5; outline-offset: 3px; }
::selection { background: #baddb5; color: #213322; }
.edit-view { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.editor-header { display: flex; align-items: center; gap: 12px; padding: 14px 18px 6px; flex-shrink: 0; }
h2 { margin: 0; flex: 1; min-width: 0; font-size: 19px; font-weight: 650; }
.help { color: #b9c3bd; font-size: 12px; margin: 4px 18px 12px; }
.code-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding: 0 18px 8px; flex-shrink: 0; }
.code-heading label { font-size: 13px; font-weight: 600; }
.example { padding: 5px 9px; min-height: 32px; font-size: 12px; }
textarea {
    display: block; flex: 1; min-height: 80px; min-width: 0; resize: none;
    width: calc(100% - 36px); margin: 0 18px; padding: 12px;
    border: 1px solid #434c48; border-radius: 6px; background: #1d2124; color: #f1f0e9;
    font-family: Consolas, 'Cascadia Code', monospace; font-size: 13px; line-height: 1.7;
    tab-size: 2; caret-color: #baddb5; overflow: auto; white-space: pre;
    scrollbar-width: thin; scrollbar-color: #434c48 transparent;
}
.code-meta { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; margin: 7px 18px 0; color: #b9c3bd; font-size: 11px; }
.counter { font-variant-numeric: tabular-nums; }
.actions { display: flex; align-items: center; gap: 8px; padding: 14px 18px 16px; flex-shrink: 0; flex-wrap: wrap; }
.actions .reset { margin-right: auto; }
.preview-view { display: flex; align-items: center; gap: 8px; padding: 12px; flex-wrap: wrap; }
.preview-label { color: #b9c3bd; font-size: 12px; flex: 1 1 100px; }
.preview-view button { font-size: 12px; min-height: 36px; padding: 6px 10px; }
.message { margin: 0; padding: 0 18px 12px; font-size: 12px; overflow-wrap: anywhere; color: #baddb5; }
.message:empty { display: none; }
.message.error, .counter.error { color: #ffb5a9; }
@media (max-width: 420px) {
    .editor-header { padding: 12px 12px 5px; }
    .help { margin: 4px 12px 10px; }
    .code-heading { padding: 0 12px 8px; }
    textarea { margin: 0 12px; width: calc(100% - 24px); font-size: 12px; }
    .code-meta { margin: 7px 12px 0; }
    .actions { padding: 12px; gap: 6px; }
    .actions button { padding: 7px 10px; font-size: 12px; }
    .message { padding: 0 12px 10px; }
    .preview-view { gap: 6px; }
    .preview-label { flex-basis: 100%; }
}
@media (max-height: 420px) {
    .editor-header { padding-top: 8px; }
    .help { display: none; }
    .code-heading { padding-bottom: 5px; }
    .code-meta .keyboard-hint { display: none; }
    .actions { padding-top: 8px; padding-bottom: 8px; }
}
`;

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

/** Opens a protected CSS editor. The caller owns CSS persistence and preview. */
export function openThemeEditor({ css = '', onPreview, onApply, onCancel, onReset, onClose } = {}) {
    const host = element('div');
    host.id = 'clare-worldbook-theme-editor';
    const shadow = host.attachShadow({ mode: 'open' });
    const stylesheet = element('style');
    stylesheet.textContent = EDITOR_CSS;
    const dialog = element('dialog');
    dialog.setAttribute('aria-labelledby', 'wbf-editor-title');
    const edit = element('section', 'edit-view');
    const header = element('header', 'editor-header');
    const title = element('h2', '', '自定义 CSS');
    title.id = 'wbf-editor-title';
    const closeButton = element('button', '', '关闭');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', '关闭 CSS 编辑器');
    header.append(title, closeButton);
    const help = element('p', 'help', '使用 :host 修改颜色变量，也可以为 .panel、.book-row 等元素写样式。CSS 只作用于世界书悬浮面板和按钮。');
    help.id = 'wbf-editor-help';
    const codeHeading = element('div', 'code-heading');
    const label = element('label', '', '样式代码');
    label.htmlFor = 'wbf-css-source';
    const exampleButton = element('button', 'example', '填入浅色示例');
    exampleButton.type = 'button';
    codeHeading.append(label, exampleButton);
    const textarea = element('textarea');
    textarea.id = 'wbf-css-source';
    textarea.setAttribute('aria-describedby', 'wbf-editor-help wbf-editor-meta');
    textarea.spellcheck = false;
    textarea.autocapitalize = 'off';
    textarea.autocomplete = 'off';
    textarea.value = typeof css === 'string' ? css : '';
    const meta = element('div', 'code-meta');
    meta.id = 'wbf-editor-meta';
    const keyboardHint = element('span', 'keyboard-hint', 'Tab 插入两个空格；Shift + Tab 移出代码区');
    const counter = element('span', 'counter');
    meta.append(keyboardHint, counter);
    const actions = element('footer', 'actions');
    const resetButton = element('button', 'reset', '恢复默认');
    const previewButton = element('button', '', '预览');
    const applyButton = element('button', 'primary', '应用并保存');
    for (const button of [resetButton, previewButton, applyButton]) button.type = 'button';
    actions.append(resetButton, previewButton, applyButton);
    edit.append(header, help, codeHeading, textarea, meta, actions);

    const preview = element('section', 'preview-view');
    preview.hidden = true;
    const previewLabel = element('span', 'preview-label', '预览中 · 尚未保存');
    const backButton = element('button', '', '返回编辑');
    const previewApplyButton = element('button', 'primary', '应用');
    const cancelPreviewButton = element('button', '', '取消预览');
    for (const button of [backButton, previewApplyButton, cancelPreviewButton]) button.type = 'button';
    preview.append(previewLabel, backButton, previewApplyButton, cancelPreviewButton);
    const message = element('p', 'message');
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');
    dialog.append(edit, preview, message);
    shadow.append(stylesheet, dialog);
    document.body.append(host);

    const lifetime = new AbortController();
    const options = { signal: lifetime.signal };
    let destroyed = false;
    let busy = false;
    let pendingFocus = null;
    const controls = [...shadow.querySelectorAll('button'), textarea];

    function updateCount() {
        const overLimit = textarea.value.length > CUSTOM_CSS_LIMIT;
        counter.textContent = `${textarea.value.length.toLocaleString()} / ${CUSTOM_CSS_LIMIT.toLocaleString()} 字符`;
        counter.classList.toggle('error', overLimit);
        textarea.setAttribute('aria-invalid', String(overLimit));
    }

    function showMessage(text = '', error = false) {
        message.textContent = text;
        message.classList.toggle('error', error);
        if (dialog.classList.contains('previewing') && dialog.open) layoutDialog();
    }

    function requireValidLength() {
        if (textarea.value.length <= CUSTOM_CSS_LIMIT) return;
        throw new Error(`CSS 超过 ${CUSTOM_CSS_LIMIT.toLocaleString()} 字符，请删减后再试。`);
    }

    function setView(isPreview) {
        dialog.classList.toggle('previewing', isPreview);
        edit.hidden = isPreview;
        preview.hidden = !isPreview;
        dialog.setAttribute('aria-label', isPreview ? 'CSS 预览工具条' : '自定义 CSS 编辑器');
        if (isPreview) dialog.removeAttribute('aria-labelledby');
        else dialog.setAttribute('aria-labelledby', title.id);
        layoutDialog();
        const focusTarget = isPreview ? backButton : textarea;
        if (focusTarget.disabled) pendingFocus = focusTarget;
        else focusTarget.focus();
    }

    function destroy() {
        if (destroyed) return;
        destroyed = true;
        lifetime.abort();
        if (dialog.open) dialog.close();
        host.remove();
    }

    function layoutDialog() {
        if (destroyed) return;
        const viewport = window.visualViewport;
        const width = viewport?.width ?? window.innerWidth;
        const height = viewport?.height ?? window.innerHeight;
        const left = viewport?.offsetLeft ?? 0;
        const top = viewport?.offsetTop ?? 0;
        const gap = Math.max(0, Math.min(8, width / 2, height / 2));
        const previewing = dialog.classList.contains('previewing');
        const dialogWidth = Math.min(previewing ? 560 : 760, Math.max(0, width - gap * 2));
        const availableHeight = Math.max(0, height - gap * 2);
        const dialogHeight = Math.min(720, availableHeight);
        Object.assign(dialog.style, {
            margin: '0', inset: 'auto',
            width: `${dialogWidth}px`, maxWidth: `${dialogWidth}px`,
            height: previewing ? 'auto' : `${dialogHeight}px`, maxHeight: `${availableHeight}px`,
            left: `${left + (width - dialogWidth) / 2}px`,
        });
        const measuredHeight = previewing ? dialog.getBoundingClientRect().height : dialogHeight;
        dialog.style.top = `${top + (previewing ? height - gap - measuredHeight : (height - dialogHeight) / 2)}px`;
    }

    function finish() {
        destroy();
        onClose?.();
    }

    async function run(operation) {
        if (destroyed || busy) return;
        busy = true;
        dialog.setAttribute('aria-busy', 'true');
        controls.forEach(control => { control.disabled = true; });
        showMessage();
        try {
            await operation();
        } catch (error) {
            if (!destroyed) showMessage(error?.message || '操作失败，请重试。', true);
        } finally {
            if (!destroyed) {
                busy = false;
                dialog.removeAttribute('aria-busy');
                controls.forEach(control => { control.disabled = false; });
                pendingFocus?.focus();
                pendingFocus = null;
            }
        }
    }

    const discard = () => run(async () => {
        await onCancel?.();
        if (!destroyed) finish();
    });
    const apply = () => run(async () => {
        requireValidLength();
        await onApply?.(textarea.value);
        if (!destroyed) finish();
    });

    textarea.addEventListener('input', () => { updateCount(); showMessage(); }, options);
    textarea.addEventListener('keydown', event => {
        if (event.key !== 'Tab' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
        event.preventDefault();
        textarea.setRangeText('  ', textarea.selectionStart, textarea.selectionEnd, 'end');
        updateCount();
    }, options);
    exampleButton.addEventListener('click', () => {
        textarea.value = LIGHT_EXAMPLE;
        updateCount();
        showMessage('示例已填入；点击预览查看效果，应用后才会保存。');
        textarea.focus();
    }, options);
    previewButton.addEventListener('click', () => run(async () => {
        requireValidLength();
        await onPreview?.(textarea.value);
        if (!destroyed) setView(true);
    }), options);
    backButton.addEventListener('click', () => { setView(false); showMessage(); }, options);
    cancelPreviewButton.addEventListener('click', () => run(async () => {
        await onCancel?.();
        if (!destroyed) {
            setView(false);
            showMessage('已恢复保存的样式，编辑中的代码仍保留在这里。');
        }
    }), options);
    for (const button of [applyButton, previewApplyButton]) button.addEventListener('click', apply, options);
    resetButton.addEventListener('click', () => run(async () => {
        await onReset?.();
        if (!destroyed) {
            textarea.value = '';
            updateCount();
            showMessage('默认样式已恢复并保存。');
        }
    }), options);
    closeButton.addEventListener('click', discard, options);
    dialog.addEventListener('cancel', event => { event.preventDefault(); discard(); }, options);
    dialog.addEventListener('close', discard, options);
    window.addEventListener('resize', layoutDialog, options);
    window.visualViewport?.addEventListener('resize', layoutDialog, options);
    window.visualViewport?.addEventListener('scroll', layoutDialog, options);
    updateCount();
    try {
        dialog.showModal();
        layoutDialog();
        textarea.focus();
    } catch (error) {
        destroy();
        throw error;
    }
    return { destroy };
}
