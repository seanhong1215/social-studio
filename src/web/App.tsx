import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart3, Bot, CalendarClock, ChevronRight, CircleUserRound, FileImage, FolderKanban,
  LayoutDashboard, LoaderCircle, LogOut, Menu, Plus, Send, Settings, Sparkles, Upload, X,
} from 'lucide-react'
import { api, ApiError, type CampaignDetail, type CampaignSummary, type DashboardStats, type User } from './lib/api'

const statusLabels: Record<string, string> = {
  draft: '草稿', generating: '生成中', ready: '待審核', scheduled: '已排程', published: '已發布', failed: '失敗',
}

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => {
    api.me().then(setUser).catch((error) => {
      if (error instanceof ApiError && error.status === 401) setUser(null)
      else setUser(null)
    })
  }, [])

  if (user === undefined) return <LoadingScreen />
  if (!user) return <LoginScreen onLogin={setUser} />
  return <Workspace user={user} onLogout={() => api.logout().finally(() => setUser(null))} />
}

function LoadingScreen() {
  return <main className="center-screen"><LoaderCircle className="spin" size={30} /><p>正在啟動工作空間…</p></main>
}

function LoginScreen({ onLogin }: { onLogin: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'bootstrap'>('login')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const email = String(form.get('email'))
      const password = String(form.get('password'))
      if (mode === 'bootstrap') {
        await api.bootstrap({ email, password, displayName: String(form.get('displayName')), token: String(form.get('token')) })
      }
      onLogin(await api.login(email, password))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '無法登入')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-layout">
      <section className="login-story">
        <div className="brand"><span className="brand-mark"><Sparkles size={20} /></span><span>Social Studio</span></div>
        <div className="story-copy">
          <p className="eyebrow">AI CONTENT OPERATIONS</p>
          <h1>一份素材，<br />生成每個平台的好內容。</h1>
          <p>從圖片理解、文案生成到排程管理，將社群內容流程集中在一個清楚的工作空間。</p>
        </div>
        <div className="platform-row"><span>Facebook</span><span>Instagram</span><span>Threads</span><span>YouTube</span><span>TikTok</span></div>
      </section>
      <section className="login-panel">
        <form className="auth-card" onSubmit={submit}>
          <div>
            <p className="eyebrow">WELCOME BACK</p>
            <h2>{mode === 'login' ? '登入工作空間' : '建立第一位管理員'}</h2>
            <p className="muted">{mode === 'login' ? '繼續管理你的社群內容企劃。' : '僅能在全新資料庫執行一次。'}</p>
          </div>
          {mode === 'bootstrap' && <label>顯示名稱<input name="displayName" placeholder="你的名稱" required minLength={2} /></label>}
          <label>電子郵件<input name="email" type="email" placeholder="you@example.com" required /></label>
          <label>密碼<input name="password" type="password" placeholder="至少 10 個字元" required minLength={10} /></label>
          {mode === 'bootstrap' && <label>Bootstrap Token<input name="token" type="password" required /></label>}
          {error && <p className="form-error">{error}</p>}
          <button className="button primary wide" disabled={busy}>{busy && <LoaderCircle className="spin" size={16} />}{mode === 'login' ? '登入' : '初始化並登入'}</button>
          <button className="text-button" type="button" onClick={() => setMode(mode === 'login' ? 'bootstrap' : 'login')}>
            {mode === 'login' ? '第一次使用？初始化管理員' : '返回登入'}
          </button>
        </form>
      </section>
    </main>
  )
}

function Workspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [selected, setSelected] = useState<CampaignDetail | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    const [nextStats, nextCampaigns] = await Promise.all([api.stats(), api.campaigns()])
    setStats(nextStats)
    setCampaigns(nextCampaigns)
  }, [])

  useEffect(() => { refresh().catch(() => setNotice('資料載入失敗，請稍後重試。')) }, [refresh])

  async function openCampaign(id: string) {
    setSelected(await api.campaign(id))
  }

  return (
    <div className="app-shell">
      <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
        <div className="brand sidebar-brand"><span className="brand-mark"><Sparkles size={18} /></span><span>Social Studio</span></div>
        <nav>
          <a className="active"><LayoutDashboard size={18} />總覽</a>
          <a><FolderKanban size={18} />內容企劃<span className="nav-count">{stats?.campaignCount ?? 0}</span></a>
          <a><CalendarClock size={18} />內容日曆</a>
          <a><BarChart3 size={18} />成效分析<span className="soon">SOON</span></a>
        </nav>
        <div className="sidebar-bottom">
          <a><Settings size={18} />設定</a>
          <button className="profile" onClick={onLogout}>
            <span className="avatar">{user.displayName.slice(0, 1).toUpperCase()}</span>
            <span><strong>{user.displayName}</strong><small>{user.role}</small></span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMenuOpen(!menuOpen)}><Menu size={20} /></button>
          <div><p className="eyebrow">WORKSPACE OVERVIEW</p><h1>早安，{user.displayName}</h1></div>
          <button className="button primary" onClick={() => setCreateOpen(true)}><Plus size={17} />建立企劃</button>
        </header>

        {notice && <div className="notice">{notice}<button onClick={() => setNotice('')}><X size={16} /></button></div>}

        <section className="hero-card">
          <div><span className="hero-icon"><Bot /></span><p className="eyebrow">AI GENERATION</p><h2>把下一個靈感，變成六個平台的內容。</h2><p>建立企劃、上傳圖片，AI 會依平台語氣產生可編輯文案與標籤。</p></div>
          <button className="button light" onClick={() => setCreateOpen(true)}>開始建立<ChevronRight size={17} /></button>
        </section>

        <section className="stats-grid">
          <Stat icon={<FolderKanban />} label="內容企劃" value={stats?.campaignCount} detail="所有企劃" />
          <Stat icon={<Sparkles />} label="待審核" value={stats?.readyCount} detail="等待確認內容" tone="violet" />
          <Stat icon={<FileImage />} label="素材庫" value={stats?.assetCount} detail="已上傳圖片" tone="amber" />
          <Stat icon={<Send />} label="處理中" value={stats?.activeJobCount} detail={`AI：${stats?.aiProvider ?? '—'}`} tone="green" />
        </section>

        <section className="content-card">
          <div className="section-heading"><div><p className="eyebrow">RECENT CAMPAIGNS</p><h2>最近企劃</h2></div><button className="text-button">查看全部</button></div>
          {campaigns.length === 0 ? (
            <div className="empty"><FolderKanban size={32} /><h3>還沒有內容企劃</h3><p>建立第一個企劃，開始生成多平台文案。</p><button className="button primary" onClick={() => setCreateOpen(true)}><Plus size={17} />建立企劃</button></div>
          ) : (
            <div className="campaign-list">{campaigns.map((campaign) => (
              <button className="campaign-row" key={campaign.id} onClick={() => openCampaign(campaign.id)}>
                <span className="campaign-thumb"><FileImage size={21} /></span>
                <span className="campaign-main"><strong>{campaign.title}</strong><small>{campaign.brief || '尚未填寫內容簡介'}</small></span>
                <span className={`status ${campaign.status}`}>{statusLabels[campaign.status] ?? campaign.status}</span>
                <span className="campaign-meta">{campaign.assetCount} 張素材</span>
                <span className="campaign-meta">{new Date(campaign.updatedAt).toLocaleDateString('zh-TW')}</span>
                <ChevronRight size={18} />
              </button>
            ))}</div>
          )}
        </section>
      </main>

      {createOpen && <CreateCampaign onClose={() => setCreateOpen(false)} onCreated={async (id) => { setCreateOpen(false); await refresh(); await openCampaign(id) }} />}
      {selected && <CampaignDrawer campaign={selected} onClose={() => setSelected(null)} onRefresh={async () => setSelected(await api.campaign(selected.id))} onGlobalRefresh={refresh} />}
    </div>
  )
}

function Stat({ icon, label, value, detail, tone = 'blue' }: { icon: React.ReactNode; label: string; value?: number; detail: string; tone?: string }) {
  return <article className="stat-card"><span className={`stat-icon ${tone}`}>{icon}</span><div><p>{label}</p><strong>{value ?? '—'}</strong><small>{detail}</small></div></article>
}

function CreateCampaign({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('')
    const form = new FormData(event.currentTarget)
    try { onCreated((await api.createCampaign(String(form.get('title')), String(form.get('brief')))).id) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '建立失敗'); setBusy(false) }
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
    <div className="modal-title"><div><p className="eyebrow">NEW CAMPAIGN</p><h2>建立內容企劃</h2></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div>
    <label>企劃名稱<input name="title" placeholder="例如：秋季新品上市" minLength={2} maxLength={120} required autoFocus /></label>
    <label>內容簡介<textarea name="brief" placeholder="說明品牌、產品特色、受眾與希望傳達的訊息…" rows={5} maxLength={3000} /></label>
    {error && <p className="form-error">{error}</p>}
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={busy}>{busy && <LoaderCircle className="spin" size={16} />}建立企劃</button></div>
  </form></div>
}

function CampaignDrawer({ campaign, onClose, onRefresh, onGlobalRefresh }: { campaign: CampaignDetail; onClose: () => void; onRefresh: () => Promise<void>; onGlobalRefresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const hasAssets = campaign.assets.length > 0
  const activeJob = useMemo(() => campaign.jobs.some((job) => ['queued', 'processing'].includes(job.status)), [campaign.jobs])

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setBusy(true); setError('')
    try { await api.uploadAssets(campaign.id, files); await onRefresh(); await onGlobalRefresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : '上傳失敗') }
    finally { setBusy(false) }
  }
  async function generate() {
    setBusy(true); setError('')
    try { await api.generate(campaign.id); await onRefresh(); await onGlobalRefresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : '無法開始生成') }
    finally { setBusy(false) }
  }

  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="drawer" onMouseDown={(event) => event.stopPropagation()}>
    <div className="drawer-header"><div><span className={`status ${campaign.status}`}>{statusLabels[campaign.status] ?? campaign.status}</span><h2>{campaign.title}</h2><p>{campaign.brief || '尚未填寫內容簡介'}</p></div><button className="icon-button" onClick={onClose}><X /></button></div>
    <section className="drawer-section"><div className="section-heading"><div><p className="eyebrow">MEDIA</p><h3>企劃素材</h3></div><label className="button secondary upload-button"><Upload size={16} />上傳圖片<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => upload(event.target.files)} /></label></div>
      <div className="asset-grid">{campaign.assets.map((asset) => <img key={asset.id} src={`/api/campaigns/${campaign.id}/assets/${asset.id}`} alt={asset.fileName} />)}{!hasAssets && <div className="asset-placeholder"><FileImage /><span>尚未上傳圖片</span></div>}</div>
    </section>
    <section className="drawer-section"><div className="section-heading"><div><p className="eyebrow">PLATFORM CONTENT</p><h3>多平台文案</h3></div><button className="button primary" onClick={generate} disabled={busy || !hasAssets || activeJob}>{activeJob ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}{activeJob ? '生成中' : 'AI 生成'}</button></div>
      {error && <p className="form-error">{error}</p>}
      <div className="platform-content-list">{campaign.contents.map((content) => <article key={content.id}><div><span className="platform-dot" /><strong>{content.platform}</strong></div><p>{content.copywriting || '尚未生成內容'}</p>{content.hashtags !== '[]' && <small>{safeHashtags(content.hashtags)}</small>}</article>)}</div>
    </section>
  </aside></div>
}

function safeHashtags(value: string) {
  try { return (JSON.parse(value) as string[]).map((tag) => `#${tag.replace(/^#/, '')}`).join(' ') }
  catch { return value }
}
