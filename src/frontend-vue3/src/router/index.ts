import { createRouter, createWebHistory, type RouteLocationAsRelativeGeneric } from 'vue-router'

export const getRouteTo = {
  about: (indexId?: string): RouteLocationAsRelativeGeneric => ({
    name: indexId ? 'corpus-about' : 'about',
    params: indexId ? { corpus: indexId } : undefined
  }),
  help: (indexId?: string): RouteLocationAsRelativeGeneric => ({
    name: indexId ? 'corpus-help' : 'help',
    params: indexId ? { corpus: indexId } : undefined
  }),
  search: (indexId: string): RouteLocationAsRelativeGeneric => ({
    name: 'search',
    params: { corpus: indexId }
  }),
}

const router = createRouter({
  history: createWebHistory(CONTEXT_URL),
  routes: [
    {
      path: '/',
      name: 'corpora',
      component: () => import('../views/corpora/CorporaView.vue')
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('../views/about/AboutView.vue')
    },
    {
      path: '/help',
      name: 'help',
      // TODO make this a generic page where the backend supplies the content.
      component: () => import ('../views/help/HelpView.vue')
    },
    {
      name: 'corpus',
      path: '/:corpus/',
      component: () => import('../views/corpus/CorpusView.vue'),
      children: [{
        path: 'search',
        name: 'search',
        component: () => import('../views/corpus/CorpusSearchView.vue')
      }, {
        path: 'about',
        name: 'corpus-about',
        component: () => import ('../views/about/AboutView.vue')
      },
      {
        path: 'help',
        name: 'corpus-help',
        component: () => import ('../views/help/HelpView.vue')
      }],
      
    }
  ],
})

router.getRoutes

export default router
