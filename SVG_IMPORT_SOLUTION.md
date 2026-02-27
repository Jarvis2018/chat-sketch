# SVG Import Solution

## 问题
html2sketch 库在转换 HTML 中的 SVG 元素时，会将其转换为 shapeGroup，但这种转换会丢失 SVG 的路径信息，导致在 Sketch 中显示不正确。

## 解决方案
使用 Sketch 官方的 `sketch.createLayerFromData()` API 来直接导入 SVG 字符串。

## 实现流程

### 1. Web Panel 端 (HTMLPreviewModal.vue)

#### 提取 SVG 数据
在 html2sketch 转换之前，提取所有 SVG 元素的原始字符串：

```javascript
function extractSVGData(doc) {
  const svgDataMap = new Map()
  const svgs = doc.querySelectorAll('svg')
  
  svgs.forEach((svg, index) => {
    const rect = svg.getBoundingClientRect()
    const svgString = new XMLSerializer().serializeToString(svg)
    
    // 使用尺寸作为 key（宽度_高度）
    const key = `${Math.round(rect.width)}_${Math.round(rect.height)}`
    
    if (!svgDataMap.has(key)) {
      svgDataMap.set(key, [])
    }
    
    svgDataMap.get(key).push({
      svgString,
      width: rect.width,
      height: rect.height,
      index
    })
  })
  
  return svgDataMap
}
```

#### 标记 SVG 图层
在 html2sketch 转换后，找到所有 name="svg" 的 group，并标记它们：

```javascript
function markSVGLayers(layer, svgDataMap) {
  // 递归查找所有 name="svg" 的 group
  // 根据尺寸匹配对应的 SVG 数据
  // 添加标记：
  childLayer._isSVGImport = true
  childLayer._svgString = svgData.svgString
}
```

### 2. Plugin 端 (design-api.js)

在 `createLayerFromJSON` 函数中，检测 SVG 标记并使用官方 API：

```javascript
case 'group':
  // 检查是否是标记的 SVG 图层
  if (layerJSON._isSVGImport && layerJSON._svgString) {
    try {
      // 使用 Sketch 官方 API 导入 SVG
      var svgLayer = sketch.createLayerFromData(layerJSON._svgString, 'svg')
      
      if (svgLayer) {
        // 设置位置和尺寸
        svgLayer.frame.x = absoluteFrame.x
        svgLayer.frame.y = absoluteFrame.y
        svgLayer.frame.width = frame.width || svgLayer.frame.width
        svgLayer.frame.height = frame.height || svgLayer.frame.height
        
        // 添加到父级
        svgLayer.parent = parent
        
        // ⚠️ 关键：立即返回，跳过子图层处理
        // html2sketch 生成的子图层（矩形路径）是错误的，会遮挡 SVG
        return svgLayer
      }
    } catch (svgError) {
      console.error('SVG import failed:', svgError)
      // 失败则使用普通 group 处理
    }
  }
  
  // 普通 group 处理...
```

### 关键修复：跳过子图层处理

**问题**：html2sketch 将 SVG 转换为 `group(name="svg") > [rectangle, shapeGroup]` 结构，其中 shapeGroup 包含多个矩形路径。如果我们导入正确的 SVG 后仍然处理这些子图层，它们会遮挡真正的 SVG 内容。

**解决**：在成功导入 SVG 后，**立即 `return svgLayer`**，跳过函数末尾的子图层处理逻辑。这样就不会创建那些错误的矩形路径。

## 优势

1. **使用官方 API**：`sketch.createLayerFromData()` 是 Sketch 官方提供的 SVG 导入方法
2. **保留完整信息**：直接使用原始 SVG 字符串，不会丢失任何路径或样式信息
3. **简单可靠**：不需要手动解析 SVG 路径或处理复杂的坐标转换
4. **向后兼容**：如果 SVG 导入失败，会自动降级到普通 group 处理

## 测试

生成包含 SVG 图标的 HTML 设计，例如：
- 导航栏图标
- 按钮图标
- 装饰性图形

检查转换后的 Sketch 图层是否正确显示 SVG 内容。
