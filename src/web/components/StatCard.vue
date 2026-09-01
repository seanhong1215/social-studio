<script setup lang="ts">
import type { Component } from 'vue'

withDefaults(defineProps<{
  icon: Component
  label: string
  value?: number
  detail: string
  tone?: string
}>(), { tone: 'blue' })
</script>

<template>
  <article class="stat-card">
    <span class="stat-icon" :class="tone"><component :is="icon" /></span>
    <div><p>{{ label }}</p><strong>{{ value ?? '—' }}</strong><small>{{ detail }}</small></div>
  </article>
</template>
