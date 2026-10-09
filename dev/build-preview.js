import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const core = (await read('core.js')).replace(/^export /gm, '');
const editor = (await read('theme-editor.js')).replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const ui = (await read('ui.js')).replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const css = await read('style.css');
const demo = await read('dev/preview.js');
const script = `const PREVIEW_STYLE = ${JSON.stringify(css)};\n${core}\n${editor}\n${ui}\n${demo}`;
const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>世界书悬浮管理 · 交互预览</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#181c20;color:#e6e5df;font:15px/1.85 'Segoe UI','Microsoft YaHei',sans-serif}header{padding:16px 24px;border-bottom:1px solid #39403c;display:flex;align-items:center;gap:16px}header strong{font-size:17px}header span{font-size:12px;color:#b9c3bd}main{max-width:720px;margin:55px auto;padding:0 24px}article{border-bottom:1px solid #39403c;padding:22px 0}h1{font-size:24px;margin:0 0 6px}p{margin:12px 0}.byline{color:#baddb5;font-size:12px}.intro{color:#b9c3bd;font-size:13px}.input{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);width:min(680px,calc(100% - 32px));background:#30363a;color:#b9c3bd;padding:12px 18px;border-radius:8px}.synthetic{color:#b9c3bd;font-size:12px}@media(max-width:600px){main{margin-top:28px}header{padding:12px 16px;flex-wrap:wrap;gap:4px 14px}}
</style></head><body>
<header><strong>世界书悬浮管理</strong><span>独立交互预览 · 使用虚构演示数据</span><details id="preview-extension-settings"><summary>扩展设置</summary><div id="extensions_settings2"></div></details></header>
<main><h1>聊天继续，设定随手调整。</h1><p class="intro">点击右侧书本按钮展开管理；长按约半秒拖动。设置里可以上传图片、调整大小。此页面不会连接或修改你的酒馆。</p>
<article><div class="byline">旅人</div><p>你推开了旧书店的门。铃声落下时，窗外的雾已经漫过了第三级石阶。</p><p>店主抬起头，把一张折好的地图推到灯下：“如果要去钟楼，最好在下一次涨潮前动身。”</p></article>
<article><div class="byline">你</div><p>我收起地图，询问钟楼的方向。</p></article><p class="synthetic">上面的对话和面板里的世界书均为演示内容。</p></main>
<div class="input">演示聊天界面</div>
<script type="module">${script.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
await writeFile(new URL('preview.html', root), html);
console.log('已生成可直接双击打开的 preview.html');
