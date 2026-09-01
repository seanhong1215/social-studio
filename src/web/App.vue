<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { LoaderCircle } from '@lucide/vue'
import { api, ApiError, type User } from './lib/api'
import LoginScreen from './components/LoginScreen.vue'
import WorkspaceView from './components/WorkspaceView.vue'

const user = ref<User | null>()

onMounted(async () => {
  try {
    user.value = await api.me()
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) console.error(error)
    user.value = null
  }
})

async function logout() {
  try { await api.logout() } finally { user.value = null }
}
</script>

<template>
  <main v-if="user === undefined" class="center-screen" data-testid="loading-screen">
    <LoaderCircle class="spin" :size="30" />
    <p>正在啟動工作空間…</p>
  </main>
  <LoginScreen v-else-if="user === null" @login="user = $event" />
  <WorkspaceView v-else :user="user" @logout="logout" />
</template>
