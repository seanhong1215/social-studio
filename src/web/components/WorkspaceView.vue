<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { BarChart3, Bot, CalendarClock, ChevronRight, FileImage, FolderKanban, LayoutDashboard, LogOut, Menu, Plus, Search, Send, Settings, Sparkles, X } from '@lucide/vue'
import { api, type CalendarItem, type CampaignDetail, type CampaignSummary, type DashboardStats, type User } from '../lib/api'
import CampaignDrawer from './CampaignDrawer.vue'
import CampaignList from './CampaignList.vue'
import CreateCampaignModal from './CreateCampaignModal.vue'
import StatCard from './StatCard.vue'

const props = defineProps<{ user: User }>()
const emit = defineEmits<{ logout: [] }>()
type View = 'overview' | 'campaigns' | 'calendar' | 'settings'
const activeView = ref<View>('overview')
const stats = ref<DashboardStats | null>(null)
const campaigns = ref<CampaignSummary[]>([])
const calendarItems = ref<CalendarItem[]>([])
const selected = ref<CampaignDetail | null>(null)
const createOpen = ref(false)
const menuOpen = ref(false)
const notice = ref('')
const search = ref('')
const statusFilter = ref('all')
const statusLabels: Record<string, string> = { draft: '草稿', generating: '生成中', ready: '待審核', scheduled: '已排程', published: '已發布', failed: '失敗' }
const viewTitles: Record<View, { eyebrow: string; title: string }> = {
  overview: { eyebrow: 'WORKSPACE OVERVIEW', title: `早安，${props.user.displayName}` },
  campaigns: { eyebrow: 'CONTENT WORKFLOW', title: '內容企劃' },
  calendar: { eyebrow: 'PUBLISHING SCHEDULE', title: '內容日曆' },
  settings: { eyebrow: 'WORKSPACE SETTINGS', title: '設定' },
}

const filteredCampaigns = computed(() => campaigns.value.filter((campaign) => {
  const keyword = search.value.trim().toLowerCase()
  const matchesKeyword = !keyword || `${campaign.title} ${campaign.brief}`.toLowerCase().includes(keyword)
  return matchesKeyword && (statusFilter.value === 'all' || campaign.status === statusFilter.value)
}))
const calendarGroups = computed(() => {
  const groups = new Map<string, CalendarItem[]>()
  for (const item of calendarItems.value) {
    const key = new Date(item.releaseAt).toLocaleDateString('zh-TW')
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return Array.from(groups.entries())
})

async function refresh() {
  const [nextStats, nextCampaigns] = await Promise.all([api.stats(), api.campaigns()])
  stats.value = nextStats; campaigns.value = nextCampaigns
}
async function loadCalendar() { calendarItems.value = await api.calendar() }
async function switchView(view: View) {
  activeView.value = view; menuOpen.value = false
  if (view === 'calendar') await loadCalendar().catch(() => { notice.value = '內容日曆載入失敗' })
}
async function openCampaign(id: string) { selected.value = await api.campaign(id) }
async function refreshSelected() { if (selected.value) selected.value = await api.campaign(selected.value.id) }
async function created(id: string) { createOpen.value = false; await refresh(); await openCampaign(id) }
async function deleted() { selected.value = null; await refresh(); if (activeView.value === 'calendar') await loadCalendar() }

onMounted(() => refresh().catch(() => { notice.value = '資料載入失敗，請確認 Worker 是否啟動。' }))
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar" :class="{ open: menuOpen }">
      <div class="brand sidebar-brand"><span class="brand-mark"><Sparkles :size="18" /></span><span>Social Studio</span></div>
      <nav>
        <button :class="{ active: activeView === 'overview' }" @click="switchView('overview')"><LayoutDashboard :size="18" />總覽</button>
        <button :class="{ active: activeView === 'campaigns' }" @click="switchView('campaigns')"><FolderKanban :size="18" />內容企劃<span class="nav-count">{{ stats?.campaignCount ?? 0 }}</span></button>
        <button :class="{ active: activeView === 'calendar' }" @click="switchView('calendar')"><CalendarClock :size="18" />內容日曆</button>
        <button disabled title="待串接社群平台後開放"><BarChart3 :size="18" />成效分析<span class="soon">SOON</span></button>
      </nav>
      <div class="sidebar-bottom"><button :class="{ active: activeView === 'settings' }" @click="switchView('settings')"><Settings :size="18" />設定</button><button class="profile" @click="emit('logout')"><span class="avatar">{{ user.displayName.slice(0, 1).toUpperCase() }}</span><span><strong>{{ user.displayName }}</strong><small>{{ user.role }}</small></span><LogOut :size="16" /></button></div>
    </aside>

    <main class="workspace">
      <header class="topbar"><button class="icon-button mobile-menu" aria-label="開啟選單" @click="menuOpen = !menuOpen"><Menu :size="20" /></button><div><p class="eyebrow">{{ viewTitles[activeView].eyebrow }}</p><h1>{{ viewTitles[activeView].title }}</h1></div><button v-if="activeView !== 'settings'" class="button primary" data-testid="create-campaign" @click="createOpen = true"><Plus :size="17" />建立企劃</button></header>
      <div v-if="notice" class="notice">{{ notice }}<button @click="notice = ''"><X :size="16" /></button></div>

      <template v-if="activeView === 'overview'">
        <section class="hero-card"><div><span class="hero-icon"><Bot /></span><p class="eyebrow">AI GENERATION</p><h2>從素材到發布，完成一條內容工作流。</h2><p>{{ stats?.aiProvider === 'demo' ? '目前使用 Demo 模板 Provider；可切換 Workers AI 進行圖片理解。' : '目前使用 Workers AI 進行圖片理解與文案生成。' }}</p></div><button class="button light" @click="createOpen = true">開始建立<ChevronRight :size="17" /></button></section>
        <section class="stats-grid"><StatCard :icon="FolderKanban" label="內容企劃" :value="stats?.campaignCount" detail="所有企劃" /><StatCard :icon="Sparkles" label="待審核／已排程" :value="stats?.readyCount" detail="等待下一步" tone="violet" /><StatCard :icon="FileImage" label="素材庫" :value="stats?.assetCount" detail="已上傳圖片" tone="amber" /><StatCard :icon="Send" label="處理中" :value="stats?.activeJobCount" :detail="`Provider：${stats?.aiProvider ?? '—'}`" tone="green" /></section>
        <CampaignList title="最近企劃" :campaigns="campaigns.slice(0, 5)" @open="openCampaign" @create="createOpen = true"><button class="text-button" @click="switchView('campaigns')">查看全部</button></CampaignList>
      </template>

      <template v-else-if="activeView === 'campaigns'">
        <section class="page-toolbar"><label class="search-box"><Search :size="17" /><input v-model="search" placeholder="搜尋企劃名稱或簡介"></label><select v-model="statusFilter"><option value="all">全部狀態</option><option v-for="(label, value) in statusLabels" :key="value" :value="value">{{ label }}</option></select></section>
        <CampaignList title="全部企劃" :campaigns="filteredCampaigns" @open="openCampaign" @create="createOpen = true"><span class="result-count">{{ filteredCampaigns.length }} 筆</span></CampaignList>
      </template>

      <template v-else-if="activeView === 'calendar'">
        <section v-if="calendarGroups.length" class="calendar-board"><div v-for="([date, items]) in calendarGroups" :key="date" class="calendar-day"><div class="calendar-date"><CalendarClock :size="18" /><strong>{{ date }}</strong><span>{{ items.length }} 則內容</span></div><button v-for="item in items" :key="item.id" class="calendar-item" @click="openCampaign(item.campaignId)"><span class="platform-pill">{{ item.platform }}</span><span><strong>{{ item.campaignTitle }}</strong><small>{{ new Date(item.releaseAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) }} · {{ item.status }}</small></span><ChevronRight :size="17" /></button></div></section>
        <section v-else class="content-card empty standalone"><CalendarClock :size="34" /><h3>還沒有排程內容</h3><p>完成文案核准並加入發布時間後，內容會出現在這裡。</p><button class="button primary" @click="switchView('campaigns')">前往內容企劃</button></section>
      </template>

      <template v-else>
        <section class="settings-grid"><article class="settings-card"><p class="eyebrow">ACCOUNT</p><h2>Demo 工作空間</h2><dl><div><dt>顯示名稱</dt><dd>{{ user.displayName }}</dd></div><div><dt>電子郵件</dt><dd>{{ user.email }}</dd></div><div><dt>權限</dt><dd>{{ user.role }}</dd></div></dl></article><article class="settings-card"><p class="eyebrow">AI PROVIDER</p><h2>{{ stats?.aiProvider === 'demo' ? 'Demo 模板' : 'Cloudflare Workers AI' }}</h2><p>{{ stats?.aiProvider === 'demo' ? '不消耗 AI 額度，產生可重現的作品展示文案。' : '使用 Cloudflare 帳戶的 Workers AI 額度分析圖片。' }}</p><span class="provider-badge">{{ stats?.aiProvider }}</span></article></section>
      </template>
    </main>

    <CreateCampaignModal v-if="createOpen" @close="createOpen = false" @created="created" />
    <CampaignDrawer v-if="selected" :campaign="selected" @close="selected = null" @refresh="refreshSelected" @updated="selected = $event" @deleted="deleted" @global-refresh="refresh" />
  </div>
</template>
