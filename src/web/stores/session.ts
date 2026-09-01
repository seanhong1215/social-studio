import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api, setActiveWorkspace, type Brand, type User, type Workspace } from '../lib/api'

export const useSessionStore = defineStore('session', () => {
  const user = ref<User | null>(null)
  const workspaces = ref<Workspace[]>([])
  const brands = ref<Brand[]>([])
  const workspaceId = ref(localStorage.getItem('social_workspace') ?? '')
  const brandId = ref(localStorage.getItem('social_brand') ?? '')
  const ready = ref(false)
  const workspace = computed(() => workspaces.value.find((item) => item.id === workspaceId.value) ?? null)
  const brand = computed(() => brands.value.find((item) => item.id === brandId.value) ?? null)

  async function bootstrap() {
    try { user.value = await api.me() } catch { user.value = null; ready.value = true; return }
    await loadWorkspaces(); ready.value = true
  }
  async function loadWorkspaces() {
    workspaces.value = await api.workspaces()
    if (!workspaces.value.some((item) => item.id === workspaceId.value)) workspaceId.value = workspaces.value[0]?.id ?? ''
    setActiveWorkspace(workspaceId.value); localStorage.setItem('social_workspace', workspaceId.value)
    await loadBrands()
  }
  async function loadBrands() {
    brands.value = workspaceId.value ? await api.brands() : []
    if (!brands.value.some((item) => item.id === brandId.value)) brandId.value = brands.value[0]?.id ?? ''
    localStorage.setItem('social_brand', brandId.value)
  }
  async function selectWorkspace(id: string) { workspaceId.value = id; setActiveWorkspace(id); localStorage.setItem('social_workspace', id); brandId.value = ''; await loadBrands() }
  function selectBrand(id: string) { brandId.value = id; localStorage.setItem('social_brand', id) }
  async function completeAuth(nextUser: User) { await loadWorkspaces(); user.value = nextUser; ready.value = true }
  async function logout() { await api.logout(); user.value = null; workspaces.value = []; brands.value = [] }
  return { user, workspaces, brands, workspaceId, brandId, workspace, brand, ready, bootstrap, loadWorkspaces, loadBrands, selectWorkspace, selectBrand, completeAuth, logout }
})
