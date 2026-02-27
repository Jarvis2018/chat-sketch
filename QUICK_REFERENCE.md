# 崩溃修复快速参考

## 🔧 关键修改

### 1. 资源限制（design-api.js）
```javascript
MAX_DEPTH: 50 → 30              // 降低 40%
MAX_LAYERS: 1000 → 500          // 降低 50%
MAX_JSON_SIZE: 10MB → 5MB       // 降低 50%
CHILDREN_BATCH_SIZE: 50 → 20    // 降低 60%
MAX_SVG_SIZE: 新增 512KB        // 新增限制
```

### 2. SVG 安全增强
- ✅ 内容清理（移除 script、foreignObject）
- ✅ 大小限制（512KB）
- ✅ 超时保护（3秒）

### 3. 前端警告（HTMLPreviewModal.vue）
- ✅ 预转换复杂度检测
- ✅ 用户确认对话框
- ✅ SVG 总大小检测

### 4. 错误追踪
- ✅ `skippedLayerCount` 计数器
- ✅ 批处理错误统计
- ✅ 改进的日志输出

---

## 📊 限制对照表

| 指标 | 之前 | 现在 | 说明 |
|------|------|------|------|
| 最大深度 | 50 | 30 | 防止栈溢出 |
| 最大图层 | 1000 | 500 | 防止内存溢出 |
| JSON 大小 | 10MB | 5MB | 减少解析压力 |
| 批处理大小 | 50 | 20 | 减少单次处理 |
| SVG 单个 | 1MB | 512KB | 防止 API 崩溃 |
| SVG 总计 | 无限制 | 2MB | 前端警告 |

---

## 🚦 用户体验流程

### 简单设计（< 200 元素）
```
用户输入 → 生成 HTML → 预览 → 转换 → ✅ 完成
```

### 中等复杂（200-400 元素）
```
用户输入 → 生成 HTML → 预览 → 转换 → ✅ 完成
（可能有轻微警告日志）
```

### 高复杂（400-600 元素）
```
用户输入 → 生成 HTML → 预览 → ⚠️ 警告对话框 → 
用户确认 → 转换 → ✅ 完成（部分截断）
```

### 极限（> 600 元素）
```
用户输入 → 生成 HTML → 预览 → 🚫 严重警告 → 
建议简化 → 用户确认 → 转换 → ⚠️ 大量截断
```

---

## 🔍 调试命令

### 查看当前限制
```javascript
// 在 Sketch 插件控制台执行
console.log('MAX_DEPTH:', MAX_DEPTH)
console.log('MAX_LAYERS:', MAX_LAYERS)
console.log('MAX_JSON_SIZE:', MAX_JSON_SIZE)
```

### 监控图层创建
```javascript
// 转换前
console.log('Starting conversion...')

// 转换后
console.log('Total layers:', globalLayerCount)
console.log('Skipped layers:', skippedLayerCount)
```

---

## ⚙️ 调整参数

### 如果需要更严格限制（更稳定）
```javascript
// design-api.js
const MAX_DEPTH = 20              // 更低
const MAX_LAYERS = 300            // 更低
const MAX_SVG_SIZE = 256 * 1024   // 256KB
```

### 如果需要更宽松限制（更完整）
```javascript
// design-api.js
const MAX_DEPTH = 40              // 更高（谨慎）
const MAX_LAYERS = 700            // 更高（谨慎）
const MAX_SVG_SIZE = 1024 * 1024  // 1MB
```

⚠️ **警告**：提高限制可能导致崩溃风险增加

---

## 📝 常见问题

### Q: 为什么我的设计被截断了？
A: 设计超过了 500 个图层的限制。建议：
- 简化设计结构
- 减少嵌套层级
- 移除不必要的装饰元素

### Q: SVG 图标没有显示？
A: 可能原因：
- SVG 文件过大（> 512KB）
- SVG 包含不支持的元素
- SVG 导入超时（> 3秒）

### Q: 转换很慢怎么办？
A: 优化建议：
- 减少元素数量
- 降低嵌套深度
- 避免大量 SVG

### Q: 如何知道设计会不会崩溃？
A: 查看警告对话框：
- 绿色：安全（< 300 层）
- 黄色：注意（300-500 层）
- 红色：危险（> 500 层）

---

## 🎯 最佳实践

### ✅ 推荐做法
1. 从简单设计开始测试
2. 逐步增加复杂度
3. 注意警告提示
4. 定期保存 Sketch 文件
5. 监控控制台日志

### ❌ 避免做法
1. 一次性创建超复杂设计
2. 忽略警告对话框
3. 使用过大的 SVG 文件
4. 过深的嵌套结构（> 30 层）
5. 不保存就转换大型设计

---

## 🔄 回滚步骤

如果修复导致问题：

1. **恢复原始参数**
   ```bash
   git checkout chat-sketch/src/design-api.js
   git checkout chat-sketch/web-panel/src/components/HTMLPreviewModal.vue
   ```

2. **重新构建**
   ```bash
   cd chat-sketch
   npm run build
   ```

3. **重新安装**
   ```bash
   open chat-sketch.sketchplugin
   ```

---

## 📞 获取帮助

- 查看 `CRASH_FIX.md` 了解详细技术说明
- 查看 `TESTING_GUIDE.md` 了解测试方法
- 检查控制台日志获取错误信息
- 查看 Sketch 崩溃报告（Console.app）
