import { createRouter, createWebHistory } from 'vue-router'
import LoginView from './views/LoginView.vue'
import RegisterView from './views/RegisterView.vue'
import InviteView from './views/InviteView.vue'
import StudioShell from './components/StudioShell.vue'
import OverviewView from './views/OverviewView.vue'
import CampaignsView from './views/CampaignsView.vue'
import CampaignDetailView from './views/CampaignDetailView.vue'
import PostEditorView from './views/PostEditorView.vue'
import CalendarView from './views/CalendarView.vue'
import ReviewView from './views/ReviewView.vue'
import AnalyticsView from './views/AnalyticsView.vue'
import SettingsView from './views/SettingsView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: LoginView, meta: { public: true } },
    { path: '/register', component: RegisterView, meta: { public: true } },
    { path: '/invite/:token', component: InviteView },
    { path: '/', component: StudioShell, children: [
      { path: '', redirect: '/overview' },
      { path: 'overview', component: OverviewView },
      { path: 'campaigns', component: CampaignsView },
      { path: 'campaigns/:campaignId', component: CampaignDetailView },
      { path: 'campaigns/:campaignId/posts/:postId', component: PostEditorView },
      { path: 'calendar', component: CalendarView },
      { path: 'reviews', component: ReviewView },
      { path: 'analytics', component: AnalyticsView },
      { path: 'settings', component: SettingsView },
    ] },
  ],
})
