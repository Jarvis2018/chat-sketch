import sketch from 'sketch'
import BrowserWindow from 'sketch-module-web-view'
import { generateDesignSpec, generateHTML } from './claude-client'
import { createDesignFromSpec, createDesignFromSketchJSON } from './design-api'
import { convertToSketchAsyncBatch } from './async-batch-api'

// Use async batch mode for complex designs to reduce crash risk.
const USE_ASYNC_BATCH = true

// System prompt for Claude
const SYSTEM_PROMPT = `你是一个专业的 UI/UX 设计助手。请根据用户需求生成 Sketch 设计规范。

要求：
- 返回严格的 JSON 格式，不要包含任何其他文本
- 遵循 iOS 设计规范
- 使用 PingFang SC 字体
- 画板尺寸 375x812（iPhone 尺寸）
- 屏幕边距 16px 或 20px
- 按钮高度 44px
- 输入框高度 44px
- 圆角 8px

支持的图层类型：
- text: 文字图层 (content, fontSize, color, align)
- rectangle: 矩形/背景 (fillColor, cornerRadius, width, height)
- button: 按钮 (text, fillColor, textColor, cornerRadius)
- input: 输入框 (placeholder, fillColor, cornerRadius)
- divider: 分割线 (color, width, height)
- icon: 图标 (name, size, fillColor)
- image: 图片占位 (name, width, height, fillColor)

返回 JSON 格式：
{
  "artboard": { "name": "页面名称", "x": 0, "y": 0, "width": 375, "height": 812 },
  "layers": [
    { "type": "text", "content": "标题文字", "x": 20, "y": 60, "fontSize": 24, "color": "#1D1D1F", "fontFamily": "PingFang SC" },
    { "type": "rectangle", "x": 20, "y": 100, "width": 335, "height": 1, "fillColor": "#E5E5E5" }
    ...
  ]
}`

export default function (context) {
  var options = {
    identifier: 'chat-sketch.open-panel',
    width: 800,
    height: 700,
    show: false,
    title: 'Chat Sketch',
    resizable: true,
    alwaysOnTop: true,
    webPreferences: {
      devTools: true
    }
  }

  var browserWindow = new BrowserWindow(options)
  var webContents = browserWindow.webContents

  // Listen for HTML generation requests
  webContents.on('generate-html', function(params) {
    console.log('[Handler] Received generate-html request')
    return handleGenerateHTML(params, context)
  })

  // Listen for Sketch conversion requests
  webContents.on('convert-to-sketch', function(params) {
    console.log('[Handler] Received convert-to-sketch request')
    
    // Use async batch processing for stability
    return new Promise(function(resolve, reject) {
      try {
        console.log('[Handler] Starting async batch conversion...')
        handleConvertToSketchAsync(params, context, function(error, result) {
          if (error) {
            console.error('[Handler] Conversion failed:', error)
            resolve({
              success: false,
              error: String(error.message || error)
            })
          } else {
            console.log('[Handler] Conversion completed successfully')
            resolve({
              success: true,
              message: 'Design created successfully'
            })
          }
        })
      } catch (error) {
        console.error('[Handler] Error setting up convert-to-sketch:', error)
        resolve({
          success: false,
          error: String(error.message || error)
        })
      }
    })
  })

  // Legacy: Listen for preview generation (backward compatibility)
  webContents.on('generate-preview', function(params) {
    console.log('[Handler] Received generate-preview request (legacy)')
    return handleGeneratePreview(params, context)
  })

  // Legacy: Listen for design creation (backward compatibility)
  webContents.on('create-design', function(params) {
    console.log('[Handler] Received create-design request (legacy)')
    return handleCreateDesign(params, context)
  })

  // Status check
  webContents.on('get-status', function() {
    console.log('[Handler] Received get-status request')
    return { status: 'ok' }
  })

  // Only show the window when it's ready to show
  browserWindow.once('ready-to-show', function() {
    browserWindow.show()
  })

  // Load from local dev server (Vite)
  browserWindow.loadURL('http://localhost:3000')
}

function handleGenerateHTML(params, context) {
  console.log('[Handler] handleGenerateHTML called with params:', params)
  
  try {
    var prompt = params.prompt
    var deviceType = params.deviceType || 'ios'
    var artboardWidth = params.artboardWidth || 375
    var model = params.model || 'claude'
    
    console.log('[Handler] Generating HTML for:', deviceType, artboardWidth)
    
    var htmlPromise = generateHTML(prompt, {
      deviceType: deviceType,
      artboardWidth: artboardWidth,
      model: model
    })

    return htmlPromise.then(function(html) {
      console.log('[Handler] HTML generated successfully, length:', html.length)
      
      // Return result directly - it will be sent back to webview
      return {
        success: true,
        html: html,
        deviceType: deviceType,
        artboardWidth: artboardWidth
      }
    }).catch(function(err) {
      console.error('[Handler] HTML generation error:', err)
      
      return {
        success: false,
        error: err.message
      }
    })

  } catch (error) {
    console.error('[Handler] Exception in handleGenerateHTML:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

function handleConvertToSketchAsync(params, context, callback) {
  console.log('[Handler] handleConvertToSketchAsync called')
  console.log('[Handler] Params keys:', Object.keys(params))
  
  var sketchJSON = params.sketchJSON
  
  console.log('[Handler] Sketch JSON _class:', sketchJSON._class)
  console.log('[Handler] Sketch JSON name:', sketchJSON.name)
  console.log('[Handler] Sketch JSON frame:', sketchJSON.frame)
  
  if (USE_ASYNC_BATCH) {
    // ASYNC BATCH MODE: Create layers in small batches with delays
    console.log('[Handler] Using ASYNC BATCH MODE conversion')
    var document = sketch.getSelectedDocument()
    var page = document.selectedPage
    
    // Show initial message
    sketch.UI.message('⏳ 开始创建图层...')
    
    // Progress callback
    var lastPercent = 0
    function onProgress(progress) {
      console.log('[Handler] Progress:', progress.current, '/', progress.total, '(' + progress.percent + '%)')
      
      // Update message every 10%
      if (progress.percent && progress.percent >= lastPercent + 10) {
        sketch.UI.message('⏳ 创建中 ' + progress.percent + '%')
        lastPercent = progress.percent
      }
    }
    
    // Start async conversion
    convertToSketchAsyncBatch(sketchJSON, page, onProgress)
      .then(function(rootGroup) {
        console.log('[Handler] Async batch conversion completed')
        sketch.UI.message('✅ 设计已创建')
        callback(null, rootGroup)
      })
      .catch(function(error) {
        console.error('[Handler] Async batch conversion failed:', error)
        sketch.UI.message('❌ 转换失败: ' + error.message)
        callback(error)
      })
  } else {
    // NORMAL MODE: Original conversion (may crash)
    console.log('[Handler] Using NORMAL MODE conversion')
    
    try {
      createDesignFromSketchJSON(sketchJSON, context)
      console.log('[Handler] Layer created successfully')
      callback(null)
    } catch (error) {
      console.error('[Handler] Conversion failed:', error)
      sketch.UI.message('❌ 转换失败: ' + error.message)
      callback(error)
    }
  }
}

function handleGeneratePreview(params, context) {
  console.log('[Handler] handleGeneratePreview called with params:', params)
  
  try {
    var fullPrompt = SYSTEM_PROMPT + '\n\n用户需求：' + params.prompt
    console.log('[Handler] Full prompt length:', fullPrompt.length)
    
    var spec = generateDesignSpec(fullPrompt)

    return spec.then(function(result) {
      console.log('[Handler] Promise resolved with result:', result)
      return {
        success: true,
        spec: result,
        message: 'Generated preview for "' + result.artboard.name + '"'
      }
    }).catch(function(err) {
      console.error('[Handler] Promise rejected with error:', err)
      return {
        success: false,
        error: err.message
      }
    })

  } catch (error) {
    console.error('[Handler] Exception in handleGeneratePreview:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

function handleCreateDesign(params, context) {
  try {
    var spec = params.spec
    createDesignFromSpec(spec, context)

    return {
      success: true,
      message: 'Created artboard "' + spec.artboard.name + '" with ' + spec.layers.length + ' layers'
    }

  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
}
