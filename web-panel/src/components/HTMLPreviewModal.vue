<template>
  <div v-if="visible" class="modal-overlay" @click.self="close">
    <div class="modal-container">
      <div class="modal-header">
        <h2>设计预览</h2>
        <button class="close-btn" @click="close">×</button>
      </div>
      
      <div class="preview-container">
        <iframe
          ref="previewFrame"
          :srcdoc="htmlContent"
          :width="artboardWidth"
          @load="onIframeLoad"
          class="preview-iframe"
        ></iframe>
      </div>
      
      <div class="modal-actions">
        <button @click="close" class="btn-secondary">取消</button>
        <button 
          @click="convertToSketch" 
          :disabled="!iframeLoaded || converting"
          class="btn-primary"
        >
          {{ converting ? '转换中...' : '转换为 Sketch' }}
        </button>
      </div>
      
      <div v-if="error" class="error-message">
        {{ error }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { nodeToGroup } from 'html2sketch'

const props = defineProps({
  visible: Boolean,
  htmlContent: String,
  artboardWidth: Number,
  deviceType: String
})

const emit = defineEmits(['close', 'convert'])

const previewFrame = ref(null)
const iframeLoaded = ref(false)
const converting = ref(false)
const error = ref(null)

// Reset state when modal opens
watch(() => props.visible, (newVal) => {
  if (newVal) {
    iframeLoaded.value = false
    converting.value = false
    error.value = null
  }
})

function onIframeLoad() {
  console.log('[HTMLPreviewModal] Iframe loaded')
  iframeLoaded.value = true
}

/**
 * Estimate the complexity of the DOM structure
 * Returns estimated layer count and warnings
 */
function estimateDOMComplexity(element) {
  let elementCount = 0
  let maxDepth = 0
  let depthWarning = false
  let svgCount = 0
  let svgTotalSize = 0

  function countElements(el, currentDepth) {
    elementCount++
    maxDepth = Math.max(maxDepth, currentDepth)

    if (currentDepth > 30) {
      depthWarning = true
    }
    
    // Count SVG elements and their size
    if (el.tagName === 'svg') {
      svgCount++
      const svgString = new XMLSerializer().serializeToString(el)
      svgTotalSize += svgString.length
    }

    for (let i = 0; i < el.children.length; i++) {
      countElements(el.children[i], currentDepth + 1)
    }
  }

  countElements(element, 1)

  return {
    elementCount,
    maxDepth,
    depthWarning,
    svgCount,
    svgTotalSize,
    // Estimate Sketch layers (roughly 1-3 layers per DOM element depending on styling)
    estimatedLayers: elementCount * 2
  }
}

async function convertToSketch() {
  converting.value = true
  error.value = null

  try {
    console.log('[HTMLPreviewModal] Starting conversion...')
    const iframe = previewFrame.value

    if (!iframe) {
      throw new Error('Preview iframe not found')
    }

    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document
    const rootElement = iframeDoc.body

    if (!rootElement) {
      throw new Error('Iframe body not found')
    }

    console.log('[HTMLPreviewModal] Root element:', rootElement)
    console.log('[HTMLPreviewModal] Root element HTML length:', rootElement.innerHTML.length)

    // Pre-conversion validation: check DOM complexity
    const complexity = estimateDOMComplexity(rootElement)
    console.log('[HTMLPreviewModal] DOM complexity:', complexity)

    // Balanced limits - allow complex designs with proper backend cleanup
    // Backend has strong memory management to handle complex conversions
    const MAX_ESTIMATED_LAYERS = 500  // Allow complex designs
    const MAX_DEPTH = 30              // Allow deep nesting
    const MAX_SVG_TOTAL_SIZE = 2 * 1024 * 1024 // 2MB - reasonable limit
    const MAX_ELEMENT_COUNT = 200     // Allow complex HTML structures

    // Collect warnings (non-blocking)
    const warnings = []
    
    // Only show warnings, don't block conversion
    // Backend has proper cleanup and memory management
    if (complexity.estimatedLayers > MAX_ESTIMATED_LAYERS) {
      warnings.push(`预计生成 ${complexity.estimatedLayers} 个图层，较多但会尝试转换`)
      console.warn(`[HTMLPreviewModal] Warning: Estimated ${complexity.estimatedLayers} layers exceeds recommended ${MAX_ESTIMATED_LAYERS}`)
    }

    if (complexity.maxDepth > MAX_DEPTH) {
      warnings.push(`DOM 嵌套深度 ${complexity.maxDepth} 较深，可能需要较长时间`)
      console.warn(`[HTMLPreviewModal] Warning: DOM depth ${complexity.maxDepth} exceeds recommended ${MAX_DEPTH}`)
    }
    
    if (complexity.svgTotalSize > MAX_SVG_TOTAL_SIZE) {
      warnings.push(`SVG 总大小 ${(complexity.svgTotalSize / 1024 / 1024).toFixed(2)}MB 较大`)
      console.warn(`[HTMLPreviewModal] Warning: SVG total size ${complexity.svgTotalSize} exceeds recommended ${MAX_SVG_TOTAL_SIZE}`)
    }
    
    if (complexity.elementCount > MAX_ELEMENT_COUNT) {
      warnings.push(`DOM 元素数量 ${complexity.elementCount} 较多，转换可能需要时间`)
      console.warn(`[HTMLPreviewModal] Warning: Element count ${complexity.elementCount} exceeds recommended ${MAX_ELEMENT_COUNT}`)
    }
    
    // Show warnings if any (but allow to continue)
    if (warnings.length > 0) {
      const warningMessage = '⚠️ 设计较复杂：\n\n' + warnings.join('\n') + '\n\n转换可能需要较长时间。是否继续？'
      if (!confirm(warningMessage)) {
        throw new Error('用户取消转换')
      }
    }
    
    // Extract SVG elements and their data before conversion
    console.log('[HTMLPreviewModal] Extracting SVG data...')
    const svgDataMap = extractSVGData(iframeDoc)
    console.log('[HTMLPreviewModal] Found', svgDataMap.size, 'SVG elements')
    
    console.log('[HTMLPreviewModal] Converting DOM to Sketch JSON using nodeToGroup...')
    
    // Convert HTML to Sketch Group using html2sketch
    // According to npm docs, nodeToGroup returns a Group object that has a toSketchJSON() method
    const groupObject = await nodeToGroup(rootElement)
    
    console.log('[HTMLPreviewModal] Group object type:', typeof groupObject)
    console.log('[HTMLPreviewModal] Group object constructor:', groupObject?.constructor?.name)
    console.log('[HTMLPreviewModal] Group object keys:', Object.keys(groupObject))
    console.log('[HTMLPreviewModal] Has toSketchJSON method:', typeof groupObject.toSketchJSON === 'function')
    
    // If it's a Group object with toSketchJSON method, call it to get the JSON
    // Otherwise use the object directly (might already be JSON)
    let sketchGroup
    if (typeof groupObject.toSketchJSON === 'function') {
      console.log('[HTMLPreviewModal] Calling toSketchJSON()...')
      sketchGroup = groupObject.toSketchJSON()
      console.log('[HTMLPreviewModal] toSketchJSON() returned:', sketchGroup)
    } else {
      console.log('[HTMLPreviewModal] Using groupObject directly (no toSketchJSON method)')
      sketchGroup = groupObject
    }
    
    console.log('[HTMLPreviewModal] Conversion successful')
    console.log('[HTMLPreviewModal] Sketch Group keys:', Object.keys(sketchGroup))
    console.log('[HTMLPreviewModal] Group _class:', sketchGroup._class)
    console.log('[HTMLPreviewModal] Group do_objectID:', sketchGroup.do_objectID)
    console.log('[HTMLPreviewModal] Group frame:', sketchGroup.frame)
    console.log('[HTMLPreviewModal] Group layers count:', sketchGroup.layers ? sketchGroup.layers.length : 0)
    
    if (sketchGroup.layers && sketchGroup.layers.length > 0) {
      console.log('[HTMLPreviewModal] First layer sample:')
      console.log('[HTMLPreviewModal]   - keys:', Object.keys(sketchGroup.layers[0]))
      console.log('[HTMLPreviewModal]   - _class:', sketchGroup.layers[0]._class)
      console.log('[HTMLPreviewModal]   - name:', sketchGroup.layers[0].name)
      console.log('[HTMLPreviewModal]   - frame:', sketchGroup.layers[0].frame)
    }
    
    console.log('[HTMLPreviewModal] Full Sketch Group structure (first 2000 chars):', 
      JSON.stringify(sketchGroup, null, 2).substring(0, 2000))
    
    // Post-process: Mark SVG layers with their original SVG string
    console.log('[HTMLPreviewModal] Marking SVG layers...')
    markSVGLayers(sketchGroup, svgDataMap)
    
    // Calculate artboard height from content
    const artboardHeight = rootElement.scrollHeight || 812
    
    console.log('[HTMLPreviewModal] Artboard height:', artboardHeight)
    
    // Create Sketch JSON structure with artboard
    // Use the layers from the group
    const sketchJSON = {
      _class: 'artboard',
      name: 'Generated Design',
      frame: {
        x: 0,
        y: 0,
        width: props.artboardWidth,
        height: artboardHeight
      },
      layers: sketchGroup.layers || []
    }
    
    console.log('[HTMLPreviewModal] Sketch JSON created')
    console.log('[HTMLPreviewModal] Sketch JSON structure:', JSON.stringify(sketchJSON, null, 2))
    
    // Emit convert event with Sketch JSON
    console.log('[HTMLPreviewModal] Emitting convert event...')
    emit('convert', {
      sketchJSON,
      deviceType: props.deviceType,
      artboardWidth: props.artboardWidth
    })
    
    console.log('[HTMLPreviewModal] Convert event emitted')
    
  } catch (err) {
    error.value = `转换失败: ${err.message}`
    console.error('[HTMLPreviewModal] Conversion error:', err)
    console.error('[HTMLPreviewModal] Error stack:', err.stack)
  } finally {
    converting.value = false
  }
}

function close() {
  emit('close')
}

/**
 * Extract SVG elements from document and store their string representation
 * Returns a Map keyed by SVG size for matching
 */
function extractSVGData(doc) {
  const svgDataMap = new Map()
  const svgs = doc.querySelectorAll('svg')
  
  console.log('[HTMLPreviewModal] Found', svgs.length, 'SVG elements')
  
  svgs.forEach((svg, index) => {
    const rect = svg.getBoundingClientRect()
    
    // Clone the SVG to apply computed styles
    const svgClone = svg.cloneNode(true)
    
    // Apply computed styles to all elements with fill/stroke
    const applyComputedStyles = (element, originalElement) => {
      if (element.nodeType !== 1) return // Skip non-element nodes
      
      const computedStyle = window.getComputedStyle(originalElement)
      
      // Apply fill color if it's set via CSS
      const fill = computedStyle.fill
      if (fill && fill !== 'none' && !element.hasAttribute('fill')) {
        element.setAttribute('fill', fill)
      }
      
      // Apply stroke color if it's set via CSS
      const stroke = computedStyle.stroke
      if (stroke && stroke !== 'none' && !element.hasAttribute('stroke')) {
        element.setAttribute('stroke', stroke)
      }
      
      // Apply opacity
      const opacity = computedStyle.opacity
      if (opacity && opacity !== '1' && !element.hasAttribute('opacity')) {
        element.setAttribute('opacity', opacity)
      }
      
      // Recursively apply to children
      const children = element.children
      const originalChildren = originalElement.children
      for (let i = 0; i < children.length; i++) {
        applyComputedStyles(children[i], originalChildren[i])
      }
    }
    
    applyComputedStyles(svgClone, svg)
    
    const svgString = new XMLSerializer().serializeToString(svgClone)
    
    // Use size as key (width_height) since position might change during conversion
    const key = `${Math.round(rect.width)}_${Math.round(rect.height)}`
    
    // Store multiple SVGs with same size in an array
    if (!svgDataMap.has(key)) {
      svgDataMap.set(key, [])
    }
    
    svgDataMap.get(key).push({
      svgString,
      width: rect.width,
      height: rect.height,
      index
    })
    
    console.log('[HTMLPreviewModal] SVG #' + index + ':', key, 'size:', rect.width, 'x', rect.height)
    console.log('[HTMLPreviewModal] SVG string preview:', svgString.substring(0, 300))
  })
  
  return svgDataMap
}

/**
 * Mark SVG layers in Sketch JSON with their original SVG string
 * This allows the plugin to use sketch.createLayerFromData() API
 */
function markSVGLayers(layer, svgDataMap) {
  if (!layer || !layer.layers) return
  
  const usedIndices = new Set() // Track which SVGs we've already used
  
  function processLayer(currentLayer) {
    if (!currentLayer || !currentLayer.layers) return
    
    for (let i = 0; i < currentLayer.layers.length; i++) {
      const childLayer = currentLayer.layers[i]
      
      // html2sketch creates: group(name="svg") > [rectangle, shapeGroup]
      // We want to replace the entire "svg" group with the original SVG
      if (childLayer.name === 'svg' && childLayer._class === 'group') {
        console.log('[HTMLPreviewModal] Found svg group, frame:', JSON.stringify(childLayer.frame))
        
        const frame = childLayer.frame
        const key = `${Math.round(frame.width)}_${Math.round(frame.height)}`
        
        const svgDataArray = svgDataMap.get(key)
        if (svgDataArray && svgDataArray.length > 0) {
          // Find first unused SVG with this size
          const svgData = svgDataArray.find(data => !usedIndices.has(data.index))
          
          if (svgData) {
            console.log('[HTMLPreviewModal] Marking svg group with SVG data, index:', svgData.index)
            
            // Mark this layer for SVG import
            childLayer._isSVGImport = true
            childLayer._svgString = svgData.svgString
            
            usedIndices.add(svgData.index)
            
            console.log('[HTMLPreviewModal] SVG string length:', svgData.svgString.length)
          } else {
            console.log('[HTMLPreviewModal] No unused SVG found for size:', key)
          }
        } else {
          console.log('[HTMLPreviewModal] No SVG data found for size:', key)
        }
      }
      
      // Recursively process children
      if (childLayer.layers && childLayer.layers.length > 0) {
        processLayer(childLayer)
      }
    }
  }
  
  processLayer(layer)
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-container {
  background: white;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #e5e5e7;
}

.modal-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1d1d1f;
}

.close-btn {
  background: none;
  border: none;
  font-size: 28px;
  color: #86868b;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: background-color 0.2s;
}

.close-btn:hover {
  background-color: #f5f5f7;
}

.preview-container {
  flex: 1;
  overflow: auto;
  padding: 24px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  background-color: #f5f5f7;
  min-height: 0;
}

.preview-iframe {
  border: 1px solid #d2d2d7;
  background: white;
  border-radius: 8px;
  min-height: 400px;
  height: 100%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.modal-actions {
  display: flex;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid #e5e5e7;
  justify-content: flex-end;
}

.btn-secondary,
.btn-primary {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-secondary {
  background-color: #f5f5f7;
  color: #1d1d1f;
}

.btn-secondary:hover {
  background-color: #e8e8ed;
}

.btn-primary {
  background-color: #007aff;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background-color: #0051d5;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-message {
  padding: 12px 24px;
  background-color: #fff3cd;
  border-top: 1px solid #ffc107;
  color: #856404;
  font-size: 14px;
}
</style>
