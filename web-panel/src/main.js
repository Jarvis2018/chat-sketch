import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

function showLoadError(message) {
  var el = document.getElementById('app-loading')
  if (el) {
    el.textContent = message
    el.style.color = '#c00'
    el.style.whiteSpace = 'pre-wrap'
    el.style.padding = '24px'
    el.style.fontSize = '13px'
  }
}

window.addEventListener('error', function (e) {
  showLoadError('加载失败: ' + (e.message || String(e.error || '')))
})
window.addEventListener('unhandledrejection', function (e) {
  showLoadError('加载失败: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)))
})

try {
  var app = createApp(App)
  app.config.errorHandler = function (err) {
    console.error(err)
    showLoadError('界面错误: ' + (err && err.message ? err.message : String(err)))
  }
  app.mount('#app')
  if (window.removeLoading) {
    window.removeLoading()
  }
} catch (err) {
  console.error(err)
  showLoadError('启动失败: ' + (err && err.message ? err.message : String(err)))
}
