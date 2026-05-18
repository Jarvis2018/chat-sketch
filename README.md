# Chat Sketch

一个 Sketch 插件：输入自然语言需求，生成 HTML 预览并转换为 Sketch 画板/图层。

## 功能

- 自然语言生成界面（通过 Claude Code）
- 预览 HTML 后再执行转换
- 支持大页面批量转换（`async-batch`，降低 Sketch 崩溃概率）
- 支持常见样式：文本、圆角、边框、渐变、阴影、SVG 图标等

## 当前实现能力

- 从自然语言生成页面 HTML，并在面板中预览
- 将预览结果转换为 Sketch 画板与图层
- 对复杂页面启用批处理转换，优先保证稳定性
- 支持一次生成一次转换的工作流（单轮）

## 当前限制

- 暂未实现“基准还原”级别的像素一致性  
  HTML 渲染模型与 Sketch 图层模型存在差异，复杂布局/矢量路径仍可能出现偏差。

- 暂未实现“对话式修改已生成画板”  
  当前流程是重新生成并再次转换，不能直接在已生成画板上按对话进行增量编辑。

## 环境要求

- macOS + Sketch
- Node.js 18+
- [Claude Code](https://claude.com/product/claude-code)（需在 PATH 中可用）

## 安装与启动

默认从插件包内的 `Contents/Resources/dist` 加载面板（`npm run build` 会先打包 `web-panel` 再运行 skpm）。

1. 安装依赖

```bash
npm install
cd web-panel && npm install && cd ..
```

2. 构建并（可选）链接到 Sketch

```bash
npm run build
npx skpm-link
```

3. 在 Sketch 中打开

- `Plugins -> Manage Plugins...` 双击 `chat-sketch.sketchplugin`，或
- `Plugins -> Custom Plugin -> Reload Plugins`（已链接时）
- `Plugins -> Chat Sketch -> Open Panel`
- 快捷键：`Ctrl + Shift + C`

### 开发（插件热编译）

1. 首次在本仓库执行 `npm run sketch:link`（或装完依赖后 `postinstall` 已链过），把插件指到 Sketch 插件目录。
2. 在 **`chat-sketch` 根目录**跑着：

```bash
npm run watch
```

这样会 **`skpm-build --watch`**：改 `src/` 里插件逻辑会自动重新编译。在 Sketch 里执行 **Plugins → Reload Plugins**，再打开面板即可生效。

面板默认仍走打包好的 **`web-panel/dist`**（和正式包一致）。若改了 Vue，请另执行一次 **`npm run build:web-panel`**（或先完整 `npm run build`）。

**可选**：需要 Vite 浏览器热更新时，再开**第二个终端**跑 `npm run dev:web-panel`，且本终端用  
`cross-env CHAT_SKETCH_USE_LOCAL_PANEL=1 npm run watch`，这样会加载 `http://localhost:3000`（需两终端同时在线）。

3. 发版给别人用：**`npm run build`**（面板打进 `.sketchplugin`，不依赖 Vite）。

## 使用流程

1. 输入页面需求（中文/英文都可以）
2. 点击生成，查看 HTML 预览
3. 点击“转换为 Sketch”
4. 插件在当前页面创建画板和图层

## 常用命令

```bash
# 生产构建
npm run build

# 开发：监听并编译插件（改 src 后 Sketch 里 Reload Plugins）
npm run watch

# 监听编译并尝试启动 Sketch
npm run start

# 仅链接插件到 Sketch 插件目录
npm run sketch:link

# 仅启动 Vite 开发服（面板 HMR 时需配合 CHAT_SKETCH_USE_LOCAL_PANEL=1 的 watch，见上文）
npm run dev:web-panel
```

## 项目结构

```text
chat-sketch/
├── src/                      # Sketch 插件逻辑（handler + 转换核心）
├── web-panel/                # Vue + Vite 面板
├── webpack.skpm.config.js   # CHAT_SKETCH_USE_LOCAL_PANEL=1 时用本机 Vite
├── assets/                   # 插件图标等资源
└── chat-sketch.sketchplugin/ # 构建产物
```

## 常见问题

- 点击插件没反应  
  若仍指向 `http://localhost:3000`，且本机未跑 Vite，则窗口不会 `ready-to-show`。请使用 `dist/index.html`（见上文默认构建），或启动 `cd web-panel && npm run dev`。

- 转换复杂页面较慢  
  批处理模式会分批创建图层以提升稳定性，复杂页面耗时会增加。

## 未来规划

- 提升 HTML -> Sketch 的保真度，逐步接近基准还原
- 增强矢量路径、复杂布局、字体与间距的一致性
- 支持对已生成画板进行对话式增量修改（局部更新而非整页重建）
- 增加可回放/可追踪的设计迭代历史

## License

[MIT](./LICENSE)
