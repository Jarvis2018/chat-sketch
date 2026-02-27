# 崩溃修复测试指南

## 测试前准备

1. **重新安装插件**
   ```bash
   cd chat-sketch
   npm run build
   open chat-sketch.sketchplugin
   ```

2. **打开 Sketch 控制台**
   - 在 Sketch 中打开插件面板
   - 打开浏览器开发者工具（右键 > Inspect Element）
   - 查看 Console 标签页以监控日志

## 测试用例

### 测试 1: 简单设计（应该正常工作）

**提示词**：
```
创建一个简单的登录页面，包含标题、两个输入框和一个按钮
```

**预期结果**：
- ✅ 生成 HTML 预览
- ✅ 转换为 Sketch 无崩溃
- ✅ 图层数量 < 50
- ✅ 无警告提示

---

### 测试 2: 中等复杂度（应该正常工作）

**提示词**：
```
创建一个电商商品详情页，包含：
- 顶部导航栏
- 商品图片轮播
- 商品标题和价格
- 规格选择器
- 商品描述
- 底部购买按钮
```

**预期结果**：
- ✅ 生成 HTML 预览
- ✅ 转换为 Sketch 无崩溃
- ✅ 图层数量 100-300
- ⚠️ 可能显示轻微警告（可忽略）

---

### 测试 3: 高复杂度（应该显示警告但能完成）

**提示词**：
```
创建一个完整的社交媒体首页，包含：
- 顶部导航栏（带搜索框、通知图标、用户头像）
- 左侧边栏（导航菜单，10个选项）
- 主内容区（5个帖子卡片，每个包含头像、文字、图片、点赞评论按钮）
- 右侧边栏（推荐用户列表，热门话题）
- 底部固定导航栏
```

**预期结果**：
- ✅ 生成 HTML 预览
- ⚠️ **显示复杂度警告对话框**
- ✅ 点击"继续"后能完成转换
- ✅ 图层数量 300-500
- ℹ️ 控制台显示 "部分层被跳过" 消息

**检查点**：
1. 警告对话框应该显示具体的复杂度指标
2. 转换完成后 Sketch 不应崩溃
3. 主要结构应该完整（可能缺少一些细节）

---

### 测试 4: 极限测试（应该被限制）

**提示词**：
```
创建一个超级复杂的仪表盘页面，包含：
- 顶部导航栏（带多个下拉菜单）
- 左侧边栏（20个嵌套菜单项）
- 主内容区：
  - 10个数据卡片（每个包含图表、数字、趋势图标）
  - 3个大型表格（每个10行x8列）
  - 5个饼图
  - 3个折线图
- 右侧通知面板（20条通知）
- 底部状态栏
```

**预期结果**：
- ✅ 生成 HTML 预览
- ⚠️ **显示严重警告对话框**
- ⚠️ 警告提示：
  - 预计图层数 > 500
  - DOM 深度 > 30
  - SVG 总大小 > 2MB（如果有图表）
- ✅ 如果继续，转换应该被截断但不崩溃
- ℹ️ 控制台显示 "MAX_LAYERS reached" 消息

**检查点**：
1. Sketch 不应崩溃
2. 应该创建部分设计（前 500 个图层）
3. 控制台应该显示跳过的图层数量

---

## 控制台日志检查

### 正常日志示例
```
[design-api] createDesignFromSketchJSON called
[design-api] Sketch JSON size: 0.45 MB
[design-api] Estimated layer count: 234
[design-api] Global layer counter reset
[design-api] Using manual layer creation...
[createLayerFromJSON] Creating layer: artboard Generated Design
[createLayerFromJSON] Processing 15 of 15 child layers
[design-api] Root layer created successfully
[design-api] Total layers created: 234
[design-api] Total layers skipped: 0
```

### 警告日志示例（正常）
```
[createLayerFromJSON] Skipping empty container: Overflow 蒙层
[createLayerFromJSON] Skipping zero-size layer: divider
[createLayerFromJSON] Skipping tiny layer: icon-shadow
[design-api] Total layers skipped: 12
```

### 限制触发日志（预期）
```
[createLayerFromJSON] Max layers 500 reached, skipped 1 layers
[createLayerFromJSON] Limiting children from 800 to 300 to prevent exceeding MAX_LAYERS
[createLayerFromJSON] Stopping child processing - MAX_LAYERS reached
[design-api] Total layers created: 500
[design-api] Total layers skipped: 156
```

### 错误日志（需要关注）
```
[createLayerFromJSON] SVG import failed: [错误信息]
[createLayerFromJSON] Error creating child layer: [图层名] [错误信息]
[design-api] Error during layer creation: [错误信息]
```

---

## 性能指标

### 预期性能
- **简单设计** (< 50 层): < 2 秒
- **中等复杂** (100-300 层): 2-5 秒
- **高复杂** (300-500 层): 5-10 秒
- **极限** (500+ 层，截断): 10-15 秒

### 内存使用
- 转换过程中 Sketch 内存增长应该 < 500MB
- 转换完成后内存应该稳定

---

## 崩溃场景测试

### 之前会崩溃的场景（现在应该修复）

1. **深度嵌套的 Flexbox 布局**
   - 提示词：创建一个包含多层嵌套 flex 容器的复杂布局
   - 预期：显示警告但不崩溃

2. **大量 SVG 图标**
   - 提示词：创建一个图标库页面，包含 50 个不同的图标
   - 预期：SVG 大小警告，部分图标可能被跳过

3. **复杂表格**
   - 提示词：创建一个 20 行 x 10 列的数据表格
   - 预期：图层数量警告，表格可能被简化

4. **多个大型图片**
   - 提示词：创建一个图片画廊，包含 30 张图片
   - 预期：正常工作（图片作为占位符）

---

## 回归测试

确保修复没有破坏现有功能：

### ✅ 基本功能
- [ ] 文本图层正常创建
- [ ] 矩形/形状正常创建
- [ ] 颜色和样式正确应用
- [ ] 圆角正确显示
- [ ] 阴影效果正常

### ✅ SVG 处理
- [ ] 简单 SVG 图标正常导入
- [ ] SVG 颜色正确
- [ ] SVG 尺寸正确

### ✅ 布局
- [ ] 元素位置正确
- [ ] 嵌套结构正确
- [ ] 响应式尺寸正确

---

## 故障排除

### 如果仍然崩溃

1. **检查 Sketch 版本**
   - 确保使用 Sketch 86.0+
   - 更新到最新版本

2. **降低限制阈值**
   - 编辑 `design-api.js`
   - 将 `MAX_LAYERS` 从 500 降到 300
   - 将 `MAX_DEPTH` 从 30 降到 20

3. **检查系统资源**
   - 关闭其他应用释放内存
   - 重启 Sketch

4. **查看崩溃日志**
   - 打开 Console.app
   - 搜索 "Sketch" 查看崩溃报告

### 如果警告过于频繁

1. **提高阈值**（谨慎）
   - 编辑 `design-api.js`
   - 适当提高 `MAX_LAYERS` 和 `MAX_DEPTH`

2. **优化 HTML 生成**
   - 修改 Claude 提示词，要求生成更简洁的 HTML
   - 避免不必要的嵌套结构

---

## 报告问题

如果发现问题，请提供：

1. **Sketch 版本**
2. **macOS 版本**
3. **使用的提示词**
4. **控制台日志**（完整输出）
5. **崩溃报告**（如果有）
6. **生成的 HTML**（如果可能）

---

## 成功标准

修复被认为成功，如果：

- ✅ 简单和中等复杂度设计 100% 成功
- ✅ 高复杂度设计 > 90% 成功（可能有警告）
- ✅ 极限测试不崩溃（即使被截断）
- ✅ Sketch 保持稳定，无内存泄漏
- ✅ 用户体验良好（有清晰的警告和反馈）
