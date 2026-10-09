# 世界书悬浮管理

在 SillyTavern / TauriTavern 聊天界面中直接查看世界书、调整绑定和条目开关。当前为 v0.1.0 试用版。

## 链接安装（推荐）

1. 打开酒馆的「扩展」菜单，选择「安装扩展」。
2. 粘贴下面的仓库地址，确认安装。
3. 刷新酒馆页面（TauriTavern 也可重新打开应用），在扩展管理中启用「世界书悬浮管理」。聊天界面会出现书本悬浮按钮。

```text
https://github.com/shuerryyyy/worldbook-float
```

这是 Git 仓库安装链接，不是网页预览或 ZIP 下载链接。TauriTavern 的扩展安装支持公开的 HTTP(S) Git 仓库；无需酒馆助手、Node 后端插件或额外 API 密钥。如果已安装旧版本，可在扩展管理中手动检查更新。

## 使用

- 点击书本按钮展开，再次点击收起。也可点击面板的「收起」或按 Escape。
- 按住按钮约 450 毫秒，再拖动；松手后自动保存位置。支持鼠标和触屏。
- 「设置」里上传 PNG / JPG / WebP 图片，设置 36–100px 按钮大小，或重置图片和位置。图片在本地缩至最长边 256px，保存到当前酒馆用户的扩展设置，不发送到外部服务。
- 面板根据可视区域向内展开，支持左右边缘、手机横屏、窗口缩放及软键盘导致的视口变化。
- 点击书名查看条目；点击条目名称展开内容；条目支持名称、关键词和正文搜索。
- 条目开关保留内容、关键词、触发策略及其他扩展的自定义字段。

## 开关的范围

在「设置 → 默认管理范围」里选择「当前聊天」或「全局世界书」，选择会自动保存。面板顶部可以临时切换范围，再次展开时恢复默认设置。SillyTavern 原生当前聊天世界书绑定只有一个位置：启用另一本会替换旧绑定。「全局」开关控制全局世界书列表，可启用多本。

书名下的「全局 / 聊天 / 角色 / 用户」是关联来源。取消聊天绑定不会移除其他来源的绑定。本版直接管理聊天和全局绑定，角色和用户的绑定仅标记；需要改变它们时，请使用酒馆对应的原生设置。

**条目开关保存在原世界书中，会影响所有引用这本书的聊天。** 开启条目表示允许按原有规则触发，并不表示这条内容一定进入每一轮提示词。

## 本地安装

将整个 `worldbook-float` 文件夹（包含 `manifest.json`、四个 JS 文件、`style.css`、`assets`）复制到：

```text
SillyTavern/public/scripts/extensions/third-party/worldbook-float/
```

这是「为所有用户安装」位置。也可以安装到当前用户目录：

```text
SillyTavern/data/<用户目录>/extensions/worldbook-float/
```

刷新酒馆页面，并在扩展管理中启用「世界书悬浮管理」。不要把文件夹额外嵌套一层。无需安装酒馆助手或配置额外 API 密钥。

## 离线预览

直接双击 `preview.html`。这是带虚构世界书的交互演示，可测试移动、图片、大小和开关；它不会读取或修改真实酒馆数据。预览设置与实际插件设置分开存储。

## 兼容性与验证

兼容目标是 SillyTavern 1.13+；实际接口按 2026-10-09 读取的官方 release 源码实现。依赖官方 `SillyTavern.getContext()`、世界书读写 HTTP 接口，以及 `/scripts/world-info.js` 导出的世界书缓存和绑定状态。内部导出在未来版本可能变化；启动时会检查必要接口。

TauriTavern 使用兼容的酒馆前端和世界书接口，本插件为纯前端扩展；已对照官方项目源码检查安装流程及相关接口。**尚未在真实 TauriTavern 实例完成安装和读写测试**，不同版本、平台及云酒馆供应商的扩展限制仍需实测。如果启动失败，先查看扩展是否启用及应用控制台中带 `[worldbook-float]` 的错误。

已用模拟酒馆接口验证保存成功、HTTP 失败、连续写入、切换聊天、数据字段保留；用浏览器验证桌面和手机交互。同一本世界书若仍有原生待保存修改，会等待原生缓存与磁盘一致后再写入，最多等待 5 秒，超时提示重试；不会取消其他世界书的原生延迟保存任务。**尚未连接用户的真实 SillyTavern 实例完成实机测试**。多个浏览器标签页同时编辑同一本世界书时，酒馆的整本保存机制不能保证跨标签页冲突合并。

开发检查：

```text
npm install
npm test
node dev/build-preview.js
npm run test:ui
npm run test:integration
```

浏览器测试默认使用 Windows Edge，可按本机路径修改 `dev/ui-test.js`。开发用的 `node_modules`、测试源码、截图和上游参考源码不需要分发。

## 来源

- 官方开发指南：https://docs.sillytavern.app/for-contributors/writing-extensions/
- 官方世界书实现：https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/world-info.js
- TauriTavern：https://github.com/Darkatse/TauriTavern
- 默认书本图标：Lucide `book-open`，ISC 许可证，见 `assets/LUCIDE-LICENSE.txt`。
