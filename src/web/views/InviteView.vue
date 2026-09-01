<script setup lang="ts">
import { ref } from 'vue'; import { useRoute, useRouter } from 'vue-router'; import { api } from '../lib/api'; import { useSessionStore } from '../stores/session'
const route = useRoute(); const router = useRouter(); const session = useSessionStore(); const busy = ref(false); const error = ref('')
async function accept() { busy.value = true; try { const result = await api.acceptInvitation(String(route.params.token)); await session.selectWorkspace(result.workspaceId); router.push('/overview') } catch (e) { error.value = e instanceof Error ? e.message : '無法接受邀請' } finally { busy.value = false } }
</script>
<template><main class="center-page"><section class="dialog-card"><span class="brand-mark">S</span><p class="eyebrow">TEAM INVITATION</p><h1>加入內容工作空間</h1><p>接受後即可依指派角色參與企劃、編輯或審核。</p><p v-if="error" class="form-error">{{ error }}</p><button class="button primary wide" :disabled="busy" @click="accept">接受邀請</button></section></main></template>
