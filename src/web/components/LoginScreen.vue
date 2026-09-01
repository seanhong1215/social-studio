<script setup lang="ts">
import { ref } from 'vue'
import { LoaderCircle, Sparkles } from '@lucide/vue'
import { api, type User } from '../lib/api'

const emit = defineEmits<{ login: [user: User] }>()
const email = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  busy.value = true
  error.value = ''
  try {
    emit('login', await api.login(email.value, password.value))
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '無法登入'
  } finally {
    busy.value = false
  }
}

async function enterDemo() {
  busy.value = true
  error.value = ''
  try { emit('login', await api.demoLogin()) }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '無法進入 Demo' }
  finally { busy.value = false }
}
</script>

<template>
  <main class="login-layout">
    <section class="login-story">
      <div class="brand"><span class="brand-mark"><Sparkles :size="20" /></span><span>Social Studio</span></div>
      <div class="story-copy">
        <p class="eyebrow">AI CONTENT OPERATIONS</p>
        <h1>一份素材，<br>生成每個平台的好內容。</h1>
        <p>從圖片理解、文案生成到排程管理，將社群內容流程集中在一個清楚的工作空間。</p>
      </div>
      <div class="platform-row"><span>Facebook</span><span>Instagram</span><span>Threads</span><span>YouTube</span><span>TikTok</span></div>
    </section>
    <section class="login-panel">
      <form class="auth-card" data-testid="auth-form" @submit.prevent="submit">
        <div>
          <p class="eyebrow">WELCOME BACK</p>
          <h2>登入工作空間</h2>
          <p class="muted">繼續管理你的社群內容企劃，或直接進入作品 Demo。</p>
        </div>
        <label>電子郵件<input v-model="email" name="email" type="email" placeholder="you@example.com" required></label>
        <label>密碼<input v-model="password" name="password" type="password" placeholder="至少 10 個字元" required minlength="10"></label>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="button primary wide" data-testid="auth-submit" :disabled="busy">
          <LoaderCircle v-if="busy" class="spin" :size="16" />登入
        </button>
        <button class="button secondary wide" type="button" data-testid="demo-login" :disabled="busy" @click="enterDemo">一鍵進入 Demo</button>
      </form>
    </section>
  </main>
</template>
