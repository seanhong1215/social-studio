<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from './stores/session'

const session = useSessionStore(); const route = useRoute(); const router = useRouter()
onMounted(() => session.bootstrap())
watch([() => session.ready, () => session.user, () => route.path], () => {
  if (!session.ready) return
  if (!session.user && !route.meta.public) router.replace(`/login?redirect=${encodeURIComponent(route.fullPath)}`)
  if (session.user && route.meta.public) router.replace('/overview')
})
</script>

<template>
  <div v-if="!session.ready" class="app-loading"><span class="brand-mark">S</span><p>正在準備工作空間…</p></div>
  <RouterView v-else />
</template>
