<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ArrowRight, LoaderCircle } from '@lucide/vue'
import { api } from '../lib/api'; import { useSessionStore } from '../stores/session'
const session = useSessionStore(); const busy = ref(false); const error = ref('')
const form = reactive({ displayName: '', email: '', password: '', workspaceName: '', brandName: '' })
async function submit() { busy.value = true; error.value = ''; try { await session.completeAuth(await api.register(form)) } catch (e) { error.value = e instanceof Error ? e.message : '註冊失敗' } finally { busy.value = false } }
</script>
<template><main class="auth-page"><section class="auth-story"><div class="logo"><span>S</span>Social Studio</div><div><p class="eyebrow">START ORGANIZED</p><h1>建立你的內容<br>營運工作空間。</h1><p>先建立團隊與第一個品牌，之後可再邀請成員與新增品牌。</p></div><small>繁體中文內容團隊的工作流程。</small></section><section class="auth-panel"><form class="auth-card register" @submit.prevent="submit"><div><p class="eyebrow">CREATE WORKSPACE</p><h2>開始使用 Social Studio</h2></div><div class="two-columns"><label>你的名稱<input v-model="form.displayName" required minlength="2"></label><label>電子郵件<input v-model="form.email" type="email" required></label><label>工作空間名稱<input v-model="form.workspaceName" required minlength="2"></label><label>第一個品牌<input v-model="form.brandName" required minlength="2"></label></div><label>密碼<input v-model="form.password" type="password" required minlength="10" placeholder="至少 10 個字元"></label><p v-if="error" class="form-error">{{ error }}</p><button class="button primary wide" :disabled="busy"><LoaderCircle v-if="busy" class="spin" :size="17"/><ArrowRight v-else :size="17"/>建立帳號</button><p class="auth-link">已有帳號？<RouterLink to="/login">返回登入</RouterLink></p></form></section></main></template>
