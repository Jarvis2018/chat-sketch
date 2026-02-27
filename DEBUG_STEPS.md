# 调试步骤

## 当前问题

简单页面可以正常转换，但稍微复杂的页面（27个图层）会导致 Sketch 崩溃。

## 已实施的修复

1. **坐标验证** - 添加了坐标边界检查，防止超出范围的坐标
2. **跳过越界文本** - 跳过 x 坐标超出父容器 1000px 以上的文本图层
3. **延迟渲染** - 在创建完成后添加 100ms 延迟，让 Sketch 有时间处理
4. **使用 Group 替代 Artboard** - 避免 Artboard 的附加问题

## 测试步骤

### 1. 重新加载插件

```bash
# 在 chat-sketch 目录
npm run build

# 在 Sketch 中
Plugins → Chat Sketch → Open Panel
```

### 2. 测试简单设计（应该成功）

提示词：
```
一个简单的登录按钮
```

预期：成功创建，不崩溃

### 3. 测试中等复杂度（可能崩溃）

提示词：
```
一个符合现代 UI 风格的移动端手机号验证码登录页
```

观察：
- 查看 Sketch 插件日志：`skpm log -f`
- 注意是否有 "Skipping text layer with out-of-bounds x coordinate" 警告
- 检查是否仍然崩溃

### 4. 如果仍然崩溃

#### 方案 A：禁用圆角

在 `design-api.js` 中找到圆角应用代码（约第 1280 行），将整个 try-catch 块注释掉：

```javascript
// Apply corner radius after creation (Sketch API requires this)
if (false && cornerRadius && cornerRadius > 0) {  // 添加 false &&
  // ... 圆角代码
}
```

#### 方案 B：禁用所有样式

创建最简化版本，只创建图层结构，不应用任何样式：

在 `createLayerFromJSON` 函数开始处添加：

```javascript
// EMERGENCY: Skip all styling to test if it's a styling issue
var SKIP_STYLING = true

// 然后在所有样式应用处检查这个标志
if (!SKIP_STYLING && cornerRadius) {
  // 应用圆角
}
```

#### 方案 C：逐步禁用图层类型

按顺序禁用不同类型的图层，找出导致崩溃的具体类型：

1. 禁用所有 text 图层（返回 null）
2. 禁用所有 rectangle 图层
3. 禁用所有 group 图层

### 5. 检查 Sketch 版本

```bash
# 在终端运行
/Applications/Sketch.app/Contents/MacOS/Sketch --version
```

如果是 Sketch 2025.1 (Athens) 或更新版本，可能需要使用新的 Frame API 而不是 Group。

## 可能的根本原因

### 1. html2sketch 输出问题

html2sketch 可能生成了不合法的坐标。日志显示：
```
"获取验证码" 的 x: 395.5351257324219
父容器宽度: 327
```

这个文本完全在父容器外部！

**解决方案**：在 web-panel 中修复 html2sketch 输出，或在插件中过滤掉这些图层。

### 2. Sketch API 版本不兼容

Sketch 2025.1 引入了重大变更，Artboard 被 Frame/Graphic 替代。

**解决方案**：检测 Sketch 版本并使用相应的 API。

### 3. 内存/渲染问题

即使图层数量不多，复杂的样式组合可能导致渲染崩溃。

**解决方案**：简化样式，或分批创建图层。

## 紧急回退方案

如果所有方案都失败，可以回退到最简单的实现：

```javascript
// 只创建一个包含所有文本的 Group
function createSimplifiedDesign(sketchJSON) {
  var group = new sketch.Group({
    parent: page,
    name: 'Generated Design (Simplified)',
    frame: { x: 0, y: 0, width: 375, height: 600 }
  })
  
  // 只提取文本内容，创建简单的文本图层
  var texts = extractAllText(sketchJSON)
  var y = 20
  texts.forEach(function(text) {
    new sketch.Text({
      parent: group,
      text: text,
      frame: { x: 20, y: y, width: 335, height: 20 }
    })
    y += 30
  })
  
  return group
}
```

## 下一步

1. 测试当前版本是否仍然崩溃
2. 如果崩溃，查看日志中是否有新的警告信息
3. 尝试上述方案 A、B、C
4. 如果都不行，考虑使用紧急回退方案
