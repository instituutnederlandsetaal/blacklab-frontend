import { createRouter, createWebHistory } from 'vue-router'
import Spinner from 'int-components';
/** Base url of the app on the client. Never ends in '/' */
declare const CONTEXT_URL: string;

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
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () => import('../views/AboutView.vue')
    },
    {
      name: 'corpus',
      path: '/:corpus/',
      component: () => import('../views/corpus/CorpusView.vue'),
      children: [{
        path: 'search',
        name: '/:corpus/search',
        component: () => import('../views/corpus/search/SearchView.vue'),
      }],
      
    }
  ]
})

export default router
