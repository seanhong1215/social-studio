<script setup lang="ts">
import { ref } from 'vue'
import { LoaderCircle, X } from '@lucide/vue'
import { api } from '../lib/api'

const emit = defineEmits<{ close: []; created: [id: string] }>()
const title = ref('')
const brief = ref('')
const busy = ref(false)
const error = ref('')

async function submit() {
  busy.value = true
  error.value = ''
  try { emit('created', (await api.createCampaign(title.value, brief.value)).id) }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '建立失敗'; busy.value = false }
}
</script>

<template>
  <div class="modal-backdrop" data-testid="campaign-modal" @mousedown.self="emit('close')">
    <form class="modal" @submit.prevent="submit">
      <div class="modal-title"><div><p class="eyebrow">NEW CAMPAIGN</p><h2>建立內容企劃</h2></div><button type="button" class="icon-button" aria-label="關閉" @click="emit('close')"><X /></button></div>
      <label>企劃名稱<input v-model="title" name="title" placeholder="例如：秋季新品上市" minlength="2" maxlength="120" required autofocus></label>
      <label>內容簡介<textarea v-model="brief" name="brief" placeholder="說明品牌、產品特色、受眾與希望傳達的訊息…" rows="5" maxlength="3000" /></label>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <div class="modal-actions"><button type="button" class="button secondary" @click="emit('close')">取消</button><button class="button primary" data-testid="campaign-submit" :disabled="busy"><LoaderCircle v-if="busy" class="spin" :size="16" />建立企劃</button></div>
    </form>
  </div>
</template>
