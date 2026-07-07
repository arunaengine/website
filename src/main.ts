import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { loadPortalConfig } from './lib/config'
import './assets/main.css'

void loadPortalConfig().finally(() => {
  createApp(App).use(router).mount('#app')
})
