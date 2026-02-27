import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

const app = createApp(App)
app.mount('#app')

// Remove loading indicator
if (window.removeLoading) {
  window.removeLoading()
}
