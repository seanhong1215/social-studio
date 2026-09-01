<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, FileImage, LoaderCircle, Save, Send, Sparkles, Trash2, Upload, X } from '@lucide/vue'
import { api, type CampaignDetail } from '../lib/api'

const props = defineProps<{ campaign: CampaignDetail }>()
const emit = defineEmits<{ close: []; refresh: []; globalRefresh: []; updated: [campaign: CampaignDetail]; deleted: [] }>()
const busy = ref(false)
const busyContentId = ref('')
const submitted = ref(false)
const error = ref('')
const notice = ref('')
const title = ref('')
const brief = ref('')
const scheduleAt = ref(toLocalInput(Date.now() + 60 * 60 * 1000))
const drafts = ref<Record<string, { copywriting: string; hashtags: string }>>({})

const hasAssets = computed(() => props.campaign.assets.length > 0)
const activeJob = computed(() => props.campaign.jobs.some((job) => ['queued', 'processing'].includes(job.status)))
const allContentReady = computed(() => props.campaign.contents.every((content) => drafts.value[content.id]?.copywriting.trim()))
const allApproved = computed(() => props.campaign.contents.length > 0 && props.campaign.contents.every((content) => ['approved', 'scheduled', 'published'].includes(content.status)))
const statusLabels: Record<string, string> = { draft: '草稿', generating: '生成中', ready: '待審核', scheduled: '已排程', published: '已發布', failed: '失敗' }

watch(() => props.campaign, (campaign) => {
  title.value = campaign.title
  brief.value = campaign.brief
  drafts.value = Object.fromEntries(campaign.contents.map((content) => [content.id, { copywriting: content.copywriting, hashtags: parseHashtags(content.hashtags).join(' ') }]))
  const releaseAt = campaign.contents.find((content) => content.releaseAt)?.releaseAt
  if (releaseAt) scheduleAt.value = toLocalInput(releaseAt)
}, { immediate: true })

async function reload() {
  const campaign = await api.campaign(props.campaign.id)
  emit('updated', campaign); emit('globalRefresh')
  return campaign
}

async function upload(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files?.length) return
  busy.value = true; error.value = ''; notice.value = ''
  try { await api.uploadAssets(props.campaign.id, input.files); await reload(); notice.value = '素材已上傳' }
  catch (reason) { error.value = errorMessage(reason, '上傳失敗') }
  finally { busy.value = false; input.value = '' }
}

async function saveCampaign() {
  await runAction(() => api.updateCampaign(props.campaign.id, { title: title.value, brief: brief.value }), '企劃資訊已儲存')
}

async function generate() {
  busy.value = true; error.value = ''; notice.value = ''
  try {
    await api.generate(props.campaign.id); submitted.value = true
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      const campaign = await reload()
      if (!campaign.jobs.some((job) => ['queued', 'processing'].includes(job.status))) {
        submitted.value = false
        const failed = campaign.jobs.find((job) => job.status === 'failed')
        if (failed) error.value = failed.errorMessage || '文案生成失敗'
        else notice.value = campaign.jobs[0]?.provider === 'demo' ? 'Demo 文案已產生，請編輯並核准' : 'AI 文案已產生，請編輯並核准'
        return
      }
    }
    submitted.value = false; error.value = '生成時間較長，請稍後重新開啟企劃查看結果'
  } catch (reason) { submitted.value = false; error.value = errorMessage(reason, '無法開始生成') }
  finally { busy.value = false }
}

async function saveContent(contentId: string) {
  const draft = drafts.value[contentId]
  if (!draft) return
  busyContentId.value = contentId; error.value = ''; notice.value = ''
  try {
    await api.updateContent(props.campaign.id, contentId, { copywriting: draft.copywriting, hashtags: draft.hashtags.split(/[\s,，]+/).map((tag) => tag.replace(/^#/, '').trim()).filter(Boolean) })
    await reload(); notice.value = '平台文案已儲存'
  } catch (reason) { error.value = errorMessage(reason, '文案儲存失敗') }
  finally { busyContentId.value = '' }
}

async function approve() { await runAction(() => api.approveCampaign(props.campaign.id), '六平台文案已核准') }
async function schedule() {
  const releaseAt = new Date(scheduleAt.value).getTime()
  if (!Number.isFinite(releaseAt)) { error.value = '請選擇發布日期與時間'; return }
  await runAction(() => api.scheduleCampaign(props.campaign.id, releaseAt), '已加入內容日曆')
}
async function publish() { await runAction(() => api.publishCampaign(props.campaign.id), '企劃已標記為發布完成') }

async function removeCampaign() {
  if (!window.confirm(`確定刪除「${props.campaign.title}」？此操作無法復原。`)) return
  busy.value = true; error.value = ''
  try { await api.deleteCampaign(props.campaign.id); emit('deleted'); emit('globalRefresh') }
  catch (reason) { error.value = errorMessage(reason, '企劃刪除失敗') }
  finally { busy.value = false }
}

async function runAction(action: () => Promise<unknown>, success: string) {
  busy.value = true; error.value = ''; notice.value = ''
  try { await action(); await reload(); notice.value = success }
  catch (reason) { error.value = errorMessage(reason, '操作失敗') }
  finally { busy.value = false }
}

function parseHashtags(value: string): string[] { try { return JSON.parse(value) as string[] } catch { return value.split(/\s+/).filter(Boolean) } }
function toLocalInput(timestamp: number) { const date = new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60_000); return date.toISOString().slice(0, 16) }
function errorMessage(reason: unknown, fallback: string) { return reason instanceof Error ? reason.message : fallback }
</script>

<template>
  <div class="drawer-backdrop" data-testid="campaign-drawer" @mousedown.self="emit('close')">
    <aside class="drawer">
      <div class="drawer-header"><div><span class="status" :class="campaign.status">{{ statusLabels[campaign.status] ?? campaign.status }}</span><h2>{{ campaign.title }}</h2><p>{{ campaign.brief || '尚未填寫內容簡介' }}</p></div><button class="icon-button" aria-label="關閉" @click="emit('close')"><X /></button></div>
      <div v-if="notice" class="drawer-message success">{{ notice }}</div><div v-if="error" class="drawer-message error" role="alert">{{ error }}</div>

      <section class="drawer-section">
        <div class="section-heading"><div><p class="eyebrow">CAMPAIGN</p><h3>企劃資訊</h3></div><button class="button secondary" :disabled="busy" @click="saveCampaign"><Save :size="16" />儲存</button></div>
        <div class="form-grid"><label>企劃名稱<input v-model="title" maxlength="120"></label><label>內容簡介<textarea v-model="brief" rows="3" maxlength="3000" /></label></div>
      </section>

      <section class="drawer-section">
        <div class="section-heading"><div><p class="eyebrow">MEDIA</p><h3>企劃素材</h3></div><label class="button secondary upload-button"><Upload :size="16" />上傳圖片<input data-testid="asset-input" type="file" accept="image/jpeg,image/png,image/webp" multiple @change="upload"></label></div>
        <div class="asset-grid"><img v-for="asset in campaign.assets" :key="asset.id" :src="`/api/campaigns/${campaign.id}/assets/${asset.id}`" :alt="asset.fileName"><div v-if="!hasAssets" class="asset-placeholder"><FileImage /><span>尚未上傳圖片</span></div></div>
      </section>

      <section class="drawer-section">
        <div class="section-heading"><div><p class="eyebrow">PLATFORM CONTENT</p><h3>六平台文案</h3><small class="provider-note">{{ campaign.jobs[0]?.provider === 'demo' ? 'Demo 模板內容' : 'Workers AI 生成內容' }}</small></div><button class="button primary" data-testid="generate-button" :disabled="busy || !hasAssets || activeJob || submitted" @click="generate"><LoaderCircle v-if="activeJob || submitted" class="spin" :size="16" /><Sparkles v-else :size="16" />{{ activeJob || submitted ? '生成中' : '生成文案' }}</button></div>
        <div class="platform-editor-list"><article v-for="content in campaign.contents" :key="content.id" class="platform-editor"><div class="platform-editor-head"><strong><span class="platform-dot" />{{ content.platform }}</strong><span class="status">{{ content.status }}</span></div><label>文案<textarea v-model="drafts[content.id].copywriting" rows="4" placeholder="尚未生成內容" /></label><label>Hashtags<input v-model="drafts[content.id].hashtags" placeholder="社群內容 AI文案"></label><button class="button secondary save-content" :disabled="busyContentId === content.id" @click="saveContent(content.id)"><LoaderCircle v-if="busyContentId === content.id" class="spin" :size="15" /><Save v-else :size="15" />儲存此平台</button></article></div>
      </section>

      <section class="drawer-section workflow-section">
        <div class="section-heading"><div><p class="eyebrow">WORKFLOW</p><h3>審核與發布</h3></div></div>
        <div class="workflow-steps"><div><span>1</span><div><strong>核准六平台文案</strong><small>確認內容都已完成並可進入排程。</small></div><button class="button secondary" :disabled="busy || !allContentReady || allApproved" @click="approve"><Check :size="16" />{{ allApproved ? '已核准' : '核准文案' }}</button></div><div><span>2</span><label>發布日期與時間<input v-model="scheduleAt" type="datetime-local"></label><button class="button secondary" :disabled="busy || !allApproved || campaign.status === 'published'" @click="schedule">加入日曆</button></div><div><span>3</span><div><strong>發布完成</strong><small>作品版先記錄發布狀態，社群 OAuth 將於後續串接。</small></div><button class="button primary" :disabled="busy || campaign.status !== 'scheduled'" @click="publish"><Send :size="16" />標記發布</button></div></div>
      </section>

      <section class="danger-zone"><div><strong>刪除企劃</strong><small>同時刪除平台文案、素材 metadata 與工作紀錄。</small></div><button class="button danger" :disabled="busy" @click="removeCampaign"><Trash2 :size="16" />刪除</button></section>
    </aside>
  </div>
</template>
