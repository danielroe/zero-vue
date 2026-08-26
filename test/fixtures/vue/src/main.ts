import { createApp } from 'vue'
import App from './app.vue'
import { zero } from './zero'

import './main.css'

const app = createApp(App).use(zero)

app.mount('#app')
