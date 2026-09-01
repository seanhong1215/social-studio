<script setup lang="ts">
import { ref } from 'vue'
import { ArrowRight, LoaderCircle, Sparkles } from '@lucide/vue'
import { api } from '../lib/api'
import { useSessionStore } from '../stores/session'
const session = useSessionStore()
const email = ref(''); const password = ref(''); const busy = ref(false); const error = ref('')
async function login(demo = false) { busy.value = true; error.value = ''; try { await session.completeAuth(demo ? await api.demoLogin() : await api.login(email.value, password.value)) } catch (e) { error.value = e instanceof Error ? e.message : '登入失敗' } finally { busy.value = false } }
</script>
<template><main class="auth-page"><section class="auth-story"><div class="logo"><span>S</span>Social Studio</div><div><p class="eyebrow">CONTENT OPERATIONS</p><h1>讓每一則內容，<br>都走完正確的流程。</h1><p>從品牌策略、內容製作、團隊審核到排程與成效，集中在一個清楚的工作空間。</p><div class="feature-strip"><span>多品牌管理</span><span>團隊審核</span><span>內容日曆</span><span>成效回顧</span></div></div><small>Built for creators, personal brands and growing teams.</small></section><section class="auth-panel"><form class="auth-card" @submit.prevent="login(false)"><div><p class="eyebrow">WELCOME BACK</p><h2>登入工作空間</h2><p>繼續管理你的內容營運流程。</p></div><label>電子郵件<input v-model="email" type="email" autocomplete="email" required placeholder="name@brand.com"></label><label>密碼<input v-model="password" type="password" autocomplete="current-password" minlength="10" required placeholder="至少 10 個字元"></label><p v-if="error" class="form-error">{{ error }}</p><button class="button primary wide" :disabled="busy"><LoaderCircle v-if="busy" class="spin" :size="17"/><ArrowRight v-else :size="17"/>登入</button><div class="divider"><span>或</span></div><button type="button" data-testid="demo-login" class="button secondary wide" :disabled="busy" @click="login(true)"><Sparkles :size="17" />一鍵進入 Demo</button><p class="auth-link">還沒有帳號？<RouterLink to="/register">建立工作空間</RouterLink></p></form></section></main></template>
