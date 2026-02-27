<template>
  <div class="app-container">
    <!-- Chat Container -->
    <div class="chat-container" ref="chatContainer">
      <!-- Welcome Message -->
      <div v-if="messages.length === 0" class="welcome-message">
        <p>告诉我你想要的设计，我会帮你生成 Sketch 图层。</p>
      </div>

      <!-- Messages -->
      <div v-for="msg in messages" :key="msg.id" :class="['message', msg.role]">
        <div class="message-content" v-html="msg.content"></div>
      </div>

      <!-- Loading -->
      <div v-if="isProcessing" class="loading">
        <div class="loading-spinner"></div>
        <span>正在处理...</span>
      </div>
    </div>

    <!-- Input Area -->
    <div class="input-area">
      <textarea
        ref="userInputEl"
        v-model="userInput"
        @keydown.enter.prevent="sendMessage"
        @input="autoResize"
        placeholder="描述你想要的设计..."
        :disabled="isProcessing"
        rows="1"
      ></textarea>
      <button class="send-btn" @click="sendMessage" :disabled="isProcessing || !userInput.trim()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>

    <!-- HTML Preview Modal -->
    <HTMLPreviewModal
      :visible="showPreview"
      :htmlContent="generatedHTML"
      :artboardWidth="artboardWidth"
      :deviceType="deviceType"
      @close="handlePreviewClose"
      @convert="handleConvert"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { nodeToGroup } from 'html2sketch'
import HTMLPreviewModal from './components/HTMLPreviewModal.vue'

// State
const messages = ref([])
const userInput = ref('')
const isProcessing = ref(false)
const chatContainer = ref(null)
const userInputEl = ref(null)

const pendingSpec = ref(null)
const pendingPreviewId = ref(null)
const html2sketchAvailable = ref(false)

// HTML Preview Modal State
const showPreview = ref(false)
const generatedHTML = ref('')
const artboardWidth = ref(375)
const deviceType = ref('ios')

// Lifecycle
onMounted(() => {
  checkLibraryAvailability()
})

function checkLibraryAvailability() {
  try {
    // Check if html2sketch is available
    if (typeof nodeToGroup === 'function') {
      html2sketchAvailable.value = true
      console.log('[App] html2sketch library loaded successfully')
    } else {
      html2sketchAvailable.value = false
      console.error('[App] html2sketch library not available')
      addMessage('system', '错误: html2sketch 库未加载，HTML 转换功能不可用')
    }
  } catch (error) {
    html2sketchAvailable.value = false
    console.error('[App] Error checking html2sketch availability:', error)
    addMessage('system', '错误: 无法加载 html2sketch 库')
  }
}

// HTML Preview Modal Handlers
function handlePreviewClose() {
  showPreview.value = false
  isProcessing.value = false
}

async function handleConvert(data) {
  console.log('[App] handleConvert called')
  console.log('[App] Convert data:', JSON.stringify(data, null, 2))
  console.log('[App] Converting to Sketch...')
  
  showPreview.value = false
  
  addMessage('assistant', '正在创建 Sketch 图层...')
  
  try {
    console.log('[App] Calling plugin convert-to-sketch...')
    const result = await callPlugin('convert-to-sketch', {
      sketchJSON: data.sketchJSON,
      deviceType: data.deviceType,
      artboardWidth: data.artboardWidth
    })
    
    console.log('[App] Plugin returned:', result)
    
    if (result.success) {
      addMessage('assistant', `完成！${result.message || '已成功创建 Sketch 图层'}`)
    } else {
      addMessage('assistant', `创建失败: ${result.error}`)
    }
  } catch (error) {
    console.error('[App] Convert error:', error)
    addMessage('assistant', `执行失败: ${error.message}`)
  } finally {
    isProcessing.value = false
  }
}

function autoResize() {
  if (userInputEl.value) {
    userInputEl.value.style.height = 'auto'
    userInputEl.value.style.height = Math.min(userInputEl.value.scrollHeight, 120) + 'px'
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    }
  })
}

function addMessage(role, content) {
  const id = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  messages.value.push({ id, role, content })
  scrollToBottom()
  return id
}

async function sendMessage() {
  const content = userInput.value.trim()
  if (!content || isProcessing.value) return

  addMessage('user', content)
  userInput.value = ''
  if (userInputEl.value) {
    userInputEl.value.style.height = 'auto'
  }

  await generateHTML(content)
}

async function generateHTML(prompt) {
  isProcessing.value = true

  try {
    addLoading()

    const result = await callPlugin('generate-html', { 
      prompt,
      deviceType: deviceType.value,
      artboardWidth: artboardWidth.value,
      model: 'claude'
    })

    hideLoading()

    if (result.success && result.html) {
      // Show HTML preview
      console.log('[App] Received HTML from plugin, showing preview')
      generatedHTML.value = result.html
      artboardWidth.value = result.artboardWidth || 375
      deviceType.value = result.deviceType || 'ios'
      showPreview.value = true
    } else {
      addMessage('assistant', `错误: ${result.error || '未知错误'}`)
    }
    
    isProcessing.value = false
  } catch (error) {
    hideLoading()
    addMessage('assistant', `错误: ${error.message}`)
    isProcessing.value = false
  }
}

function addLoading() {
  addMessage('assistant', '<div class="loading"><div class="loading-spinner"></div><span>正在处理...</span></div>')
}

function hideLoading() {
  const loadingMsg = messages.value.find(m => m.content.includes('loading-spinner'))
  if (loadingMsg) {
    const idx = messages.value.indexOf(loadingMsg)
    messages.value.splice(idx, 1)
  }
}

// Legacy functions for backward compatibility
function renderLayersPreview(layers) {
  if (!layers || layers.length === 0) {
    return '<div class="preview-empty">无图层</div>'
  }

  const limitedLayers = layers.slice(0, 10)
  const moreCount = layers.length - 10

  return `
    <div class="layers-list">
      ${limitedLayers.map((layer, index) => `
        <div class="layer-item layer-type-${layer.type}">
          <span class="layer-icon">${getLayerIcon(layer.type)}</span>
          <span class="layer-info">${getLayerLabel(layer)}</span>
          <span class="layer-pos">(${layer.x}, ${layer.y})</span>
        </div>
      `).join('')}
      ${moreCount > 0 ? `<div class="layer-more">+ 还有 ${moreCount} 个图层</div>` : ''}
    </div>
  `
}

function getLayerIcon(type) {
  const icons = {
    text: 'T',
    rectangle: '□',
    button: '◼',
    input: '▭',
    divider: '—',
    icon: '●',
    image: '▣'
  }
  return icons[type] || '?'
}

function getLayerLabel(layer) {
  switch (layer.type) {
    case 'text':
      return layer.content ? (layer.content.substring(0, 20) + (layer.content.length > 20 ? '...' : '')) : '文本'
    case 'button':
      return layer.text || '按钮'
    case 'input':
      return layer.placeholder || '输入框'
    case 'divider':
      return '分割线'
    case 'icon':
      return layer.name || '图标'
    case 'image':
      return layer.name || '图片'
    default:
      return layer.type
  }
}

function cancelPreview(previewId) {
  const msg = messages.value.find(m => m.id === previewId)
  if (msg) {
    const idx = messages.value.indexOf(msg)
    messages.value.splice(idx, 1)
  }
  pendingSpec.value = null
  pendingPreviewId.value = null
  isProcessing.value = false
}

async function createDesign() {
  if (!pendingSpec.value) return

  addMessage('assistant', `正在创建画板 "${pendingSpec.value.artboard.name}"...`)

  const previewMsg = messages.value.find(m => m.id === pendingPreviewId.value)
  if (previewMsg) {
    const idx = messages.value.indexOf(previewMsg)
    messages.value.splice(idx, 1)
  }

  try {
    const result = await callPlugin('create-design', { spec: pendingSpec.value })

    if (result.success) {
      addMessage('assistant', `完成！${result.message}`)
    } else {
      addMessage('assistant', `创建失败: ${result.error}`)
    }
  } catch (error) {
    addMessage('assistant', `执行失败: ${error.message}`)
  }

  isProcessing.value = false
  pendingSpec.value = null
  pendingPreviewId.value = null
}

// Plugin communication
function callPlugin(eventName, params) {
  return new Promise(function(resolve, reject) {
    console.log('[App] Calling plugin event:', eventName, 'with params:', params)
    
    // Send to plugin via window.postMessage
    // sketch-module-web-view uses window.postMessage with event name
    window.postMessage(eventName, params)
      .then(function(results) {
        // postMessage returns array of results from all listeners
        console.log('[App] Received results from plugin:', results)
        if (results && results.length > 0) {
          const result = results[0]
          resolve(result)
        } else {
          reject(new Error('No response from plugin'))
        }
      })
      .catch(function(err) {
        console.error('[App] Plugin call error:', err)
        reject(err)
      })

    // Timeout as backup - 5 minutes for Claude CLI generation
    setTimeout(function() {
      reject(new Error('等待响应超时'))
    }, 300000)
  })
}

// Expose to window for inline handlers
window.app = {
  cancelPreview,
  createDesign
}
</script>

<style scoped>
.app-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.welcome-message {
  text-align: center;
  color: #86868b;
  padding: 40px 20px;
  font-size: 14px;
}
</style>
