<script setup lang="ts">
import { ChevronRight, FileImage, FolderKanban, Plus } from '@lucide/vue'
import type { CampaignSummary } from '../lib/api'

defineProps<{ title: string; campaigns: CampaignSummary[] }>()
const emit = defineEmits<{ open: [id: string]; create: [] }>()
const statusLabels: Record<string, string> = { draft: '草稿', generating: '生成中', ready: '待審核', scheduled: '已排程', published: '已發布', failed: '失敗' }
</script>

<template>
  <section class="content-card">
    <div class="section-heading"><div><p class="eyebrow">CAMPAIGNS</p><h2>{{ title }}</h2></div><slot /></div>
    <div v-if="campaigns.length === 0" class="empty"><FolderKanban :size="32" /><h3>沒有符合條件的企劃</h3><p>建立企劃後即可開始內容工作流。</p><button class="button primary" @click="emit('create')"><Plus :size="17" />建立企劃</button></div>
    <div v-else class="campaign-list"><button v-for="campaign in campaigns" :key="campaign.id" class="campaign-row" @click="emit('open', campaign.id)"><span class="campaign-thumb"><FileImage :size="21" /></span><span class="campaign-main"><strong>{{ campaign.title }}</strong><small>{{ campaign.brief || '尚未填寫內容簡介' }}</small></span><span class="status" :class="campaign.status">{{ statusLabels[campaign.status] ?? campaign.status }}</span><span class="campaign-meta">{{ campaign.assetCount }} 張素材</span><span class="campaign-meta">{{ new Date(campaign.updatedAt).toLocaleDateString('zh-TW') }}</span><ChevronRight :size="18" /></button></div>
  </section>
</template>
