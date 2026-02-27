# Chat Sketch

一个 Sketch 插件：输入自然语言需求，生成 HTML 预览并转换为 Sketch 画板/图层。

## 功能

- 自然语言生成界面（通过 Claude CLI）
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
- [Claude CLI](https://claude.ai/download)（需在 PATH 中可用）

## 安装与启动（开发模式）

当前插件面板默认加载 `http://localhost:3000`，所以需要先启动前端开发服务。

1. 安装依赖

```bash
npm install
cd web-panel && npm install
```

2. 启动面板开发服务

```bash
cd web-panel
npm run dev
```

3. 回到插件目录构建并链接

```bash
cd ..
npm run build
npx skpm-link
```

4. 在 Sketch 中打开

- `Plugins -> Custom Plugin -> Reload Plugins`
- `Plugins -> Chat Sketch -> Open Panel`
- 快捷键：`Ctrl + Shift + C`

## 使用流程

1. 输入页面需求（中文/英文都可以）
2. 点击生成，查看 HTML 预览
3. 点击“转换为 Sketch”
4. 插件在当前页面创建画板和图层

## 常用命令

```bash
# 构建插件
npm run build

# 监听构建
npm run watch

# 构建并自动运行插件
npm run start
```

## 项目结构

```text
chat-sketch/
├── src/                 # Sketch 插件逻辑（handler + 转换核心）
├── web-panel/           # Vue + Vite 面板
├── assets/              # 插件图标等资源
└── chat-sketch.sketchplugin/  # 构建产物
```

## 常见问题

- 点击插件没反应  
  通常是 `web-panel` 的 dev server 未启动，请先运行 `cd web-panel && npm run dev`。

- 转换复杂页面较慢  
  批处理模式会分批创建图层以提升稳定性，复杂页面耗时会增加。

## 未来规划

- 提升 HTML -> Sketch 的保真度，逐步接近基准还原
- 增强矢量路径、复杂布局、字体与间距的一致性
- 支持对已生成画板进行对话式增量修改（局部更新而非整页重建）
- 增加可回放/可追踪的设计迭代历史

## License

[MIT](./LICENSE)
