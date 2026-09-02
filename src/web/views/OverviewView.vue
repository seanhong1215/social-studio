<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, BarChart3, CalendarClock, CheckCircle2, ChevronRight, CircleDot, Eye, FolderKanban, MousePointerClick, Plus, Send, ShieldCheck, Sparkles, TrendingUp, Users, WandSparkles } from '@lucide/vue'
import { api, type Analytics, type CampaignSummary, type Dashboard } from '../lib/api'
import { useSessionStore } from '../stores/session'

const session = useSessionStore()
const router = useRouter()
const stats = ref<Dashboard | null>(null)
const campaigns = ref<CampaignSummary[]>([])
const analytics = ref<Analytics | null>(null)
const error = ref('')

async function load() {
  try {
    ;[stats.value, campaigns.value, analytics.value] = await Promise.all([
      api.dashboard(), api.campaigns(session.brandId), api.analytics(session.brandId),
    ])
  } catch (exception) {
    error.value = exception instanceof Error ? exception.message : '無法載入總覽資料'
  }
}

const number = new Intl.NumberFormat('zh-TW')
const totals = computed(() => analytics.value?.totals ?? { reach: 0, impressions: 0, engagements: 0, clicks: 0, videoViews: 0, engagementRate: 0 })
const dailySeries = computed(() => {
  const grouped = new Map<string, number>()
  for (const item of analytics.value?.series ?? []) grouped.set(item.metricDate, (grouped.get(item.metricDate) ?? 0) + item.reach)
  const entries = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-7)
  const max = Math.max(...entries.map(([, value]) => value), 1)
  return entries.map(([date, value]) => ({ date, value, height: Math.max(12, Math.round((value / max) * 100)), label: new Date(`${date}T00:00:00`).toLocaleDateString('zh-TW', { weekday: 'short' }) }))
})
const trendRate = computed(() => {
  if (dailySeries.value.length < 2) return 0
  const first = dailySeries.value[0].value
  const last = dailySeries.value[dailySeries.value.length - 1].value
  return first ? ((last - first) / first) * 100 : 0
})
const platformSeries = computed(() => {
  const grouped = new Map<string, number>()
  for (const item of analytics.value?.series ?? []) grouped.set(item.platform, (grouped.get(item.platform) ?? 0) + item.reach)
  const total = [...grouped.values()].reduce((sum, value) => sum + value, 0) || 1
  return [...grouped.entries()].map(([platform, value]) => ({ platform, value, percent: Math.round((value / total) * 100) })).sort((a, b) => b.value - a.value)
})
const workflow = computed(() => [
  { label: '內容製作', value: stats.value?.postCount ?? 0, note: '篇內容納入企劃', icon: WandSparkles, tone: 'coral' },
  { label: '協作審核', value: stats.value?.reviewCount ?? 0, note: '筆等待團隊確認', icon: ShieldCheck, tone: 'violet' },
  { label: '排程待發', value: stats.value?.scheduledCount ?? 0, note: '筆已進入發布佇列', icon: CalendarClock, tone: 'blue' },
  { label: '觸及受眾', value: totals.value.reach, note: '近 7 日全平台總和', icon: TrendingUp, tone: 'green' },
])
const healthRate = computed(() => {
  const total = (stats.value?.scheduledCount ?? 0) + (stats.value?.failedCount ?? 0)
  return total ? Math.round(((stats.value?.scheduledCount ?? 0) / total) * 100) : 100
})
function statusLabel(status: string) { return ({ active: '進行中', draft: '籌備中', completed: '已完成', archived: '已歸檔' } as Record<string, string>)[status] ?? status }
function platformLabel(platform: string) { return ({ instagram: 'Instagram', facebook: 'Facebook', threads: 'Threads' } as Record<string, string>)[platform] ?? platform }
onMounted(load)
</script>

<template>
  <div class="page-stack overview-page">
    <section class="overview-hero">
      <div class="hero-copy">
        <div class="hero-badge"><Sparkles :size="14" /> SOCIAL CONTENT OPERATIONS</div>
        <h2>讓好內容不只被看見，<br><span>還能持續被管理、放大。</span></h2>
        <p>Social Studio 將品牌策略、AI 共創、團隊審核、跨平台排程與成效追蹤，收旂在同一個內容營運工作台。</p>
        <div class="hero-actions"><button class="button hero-primary" @click="router.push('/campaigns')"><Plus :size="17" />開始新企劃</button><button class="button hero-secondary" @click="router.push('/analytics')">查看成效 <ArrowRight :size="16" /></button></div>
        <div class="hero-proof"><span><CheckCircle2 :size="15" /> AI 內容生成</span><span><CheckCircle2 :size="15" /> 多角色審核</span><span><CheckCircle2 :size="15" /> 自動排程發布</span></div>
      </div>
      <div class="hero-dashboard">
        <div class="hero-dashboard-head"><div><small>PERFORMANCE PULSE</small><strong>近 7 日品牌聲量</strong></div><span><CircleDot :size="12" /> LIVE</span></div>
        <div class="hero-total"><div><small>總觸及</small><strong>{{ number.format(totals.reach) }}</strong></div><span><TrendingUp :size="15" /> {{ trendRate >= 0 ? '+' : '' }}{{ trendRate.toFixed(1) }}%</span></div>
        <div v-if="dailySeries.length" class="hero-chart" aria-label="近七日觸及趨勢"><div v-for="item in dailySeries" :key="item.date"><span :style="{ height: `${item.height}%` }"><i>{{ number.format(item.value) }}</i></span><small>{{ item.label }}</small></div></div>
        <div v-else class="hero-chart placeholder-chart"><div v-for="(height, index) in [36, 52, 44, 68, 58, 76, 92]" :key="index"><span :style="{height: `${height}%`}"/><small>{{ ['一','二','三','四','五','六','日'][index] }}</small></div></div>
        <div class="hero-mini-metrics"><div><Eye :size="15" /><span><small>曝光</small><strong>{{ number.format(totals.impressions) }}</strong></span></div><div><Users :size="15" /><span><small>互動率</small><strong>{{ totals.engagementRate.toFixed(1) }}%</strong></span></div><div><MousePointerClick :size="15" /><span><small>點擊</small><strong>{{ number.format(totals.clicks) }}</strong></span></div></div>
      </div>
    </section>

    <p v-if="error" class="form-error banner">{{ error }}</p>
    <section class="overview-section-head"><div><p class="eyebrow">WORKSPACE PULSE</p><h3>今日營運全貌</h3></div><p>{{ session.brand?.name }} · 即時更新</p></section>
    <section class="metric-grid overview-metrics"><article v-for="item in workflow" :key="item.label"><span class="metric-icon" :class="item.tone"><component :is="item.icon" /></span><div><small>{{ item.label }}</small><strong>{{ number.format(item.value) }}</strong><p>{{ item.note }}</p></div></article></section>

    <section class="overview-insight-grid">
      <article class="panel workflow-panel">
        <div class="panel-head"><div><p class="eyebrow">CONTENT PIPELINE</p><h3>內容工作流健康度</h3></div><strong class="health-score">{{ healthRate }}<small>%</small></strong></div>
        <div class="workflow-track"><div><span class="workflow-dot coral"><WandSparkles :size="16" /></span><strong>創意與製作</strong><small>{{ stats?.postCount ?? 0 }} 篇內容</small></div><ChevronRight :size="17" /><div><span class="workflow-dot violet"><ShieldCheck :size="16" /></span><strong>團隊審核</strong><small>{{ stats?.reviewCount ?? 0 }} 筆待確認</small></div><ChevronRight :size="17" /><div><span class="workflow-dot blue"><CalendarClock :size="16" /></span><strong>排程管理</strong><small>{{ stats?.scheduledCount ?? 0 }} 筆待發布</small></div><ChevronRight :size="17" /><div><span class="workflow-dot green"><Send :size="16" /></span><strong>成效追蹤</strong><small>{{ number.format(totals.engagements) }} 次互動</small></div></div>
        <div class="health-bar"><span :style="{width: `${healthRate}%`}" /></div><p class="workflow-note"><CheckCircle2 :size="14" /> 發布流程運作良好，{{ stats?.failedCount ?? 0 }} 筆需要處理</p>
      </article>
      <article class="panel channel-panel"><div class="panel-head"><div><p class="eyebrow">CHANNEL MIX</p><h3>觸及來源</h3></div><BarChart3 :size="19" /></div><div v-if="platformSeries.length" class="channel-list"><div v-for="item in platformSeries" :key="item.platform"><div><strong>{{ platformLabel(item.platform) }}</strong><span>{{ item.percent }}%</span></div><div class="channel-bar"><span :class="item.platform" :style="{width: `${item.percent}%`}" /></div><small>{{ number.format(item.value) }} 觸及</small></div></div><div v-else class="empty-block"><BarChart3 /><p>發布內容後即會顯示渠道成效</p></div></article>
    </section>

    <div class="overview-grid portfolio-lists">
      <section class="panel"><div class="panel-head"><div><p class="eyebrow">CAMPAIGN PORTFOLIO</p><h3>進行中的品牌企劃</h3></div><RouterLink to="/campaigns">檢視全部 <ArrowRight :size="13" /></RouterLink></div><div v-if="campaigns.length" class="portfolio-campaign-list"><button v-for="item in campaigns.slice(0, 4)" :key="item.id" @click="router.push(`/campaigns/${item.id}`)"><span class="campaign-index">{{ String(campaigns.indexOf(item) + 1).padStart(2, '0') }}</span><span class="campaign-summary"><strong>{{ item.name }}</strong><small>{{ item.objective || item.brief || '品牌內容整合企劃' }}</small><i><b>{{ item.postCount }}</b> 篇內容 · <b>{{ item.reviewCount }}</b> 待審核 · <b>{{ item.scheduledCount }}</b> 已排程</i></span><em class="status-chip" :class="item.status">{{ statusLabel(item.status) }}</em></button></div><div v-else class="empty-block"><FolderKanban /><p>建立第一個企劃，開始管理品牌內容</p></div></section>
      <section class="panel"><div class="panel-head"><div><p class="eyebrow">UP NEXT</p><h3>即將發布</h3></div><RouterLink to="/calendar">內容日曆 <ArrowRight :size="13" /></RouterLink></div><div v-if="stats?.upcoming.length" class="cover-timeline"><article v-for="item in stats.upcoming.slice(0, 5)" :key="item.id"><time><strong>{{ new Date(item.scheduledAt).toLocaleDateString('zh-TW', { day: '2-digit' }) }}</strong><small>{{ new Date(item.scheduledAt).toLocaleDateString('zh-TW', { month: 'short' }) }}</small></time><span><strong>{{ item.postTitle }}</strong><small>{{ platformLabel(item.platform) }} · {{ new Date(item.scheduledAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) }}</small></span><i class="status-chip" :class="item.status">{{ item.status === 'failed' ? '需處理' : '已排程' }}</i></article></div><div v-else class="empty-block"><CalendarClock /><p>尚無即將發布的內容</p></div></section>
    </div>

    <section class="capability-strip"><div><small>FROM IDEA TO IMPACT</small><strong>一個系統，串起完整內容生命週期</strong></div><ol><li><span>01</span>品牌策略</li><li><span>02</span>AI 共創</li><li><span>03</span>協作審核</li><li><span>04</span>多平台排程</li><li><span>05</span>成效洞察</li></ol></section>
  </div>
</template>
