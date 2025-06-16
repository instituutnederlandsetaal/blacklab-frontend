// https://vitepress.dev/guide/custom-theme
import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import { enhanceAppWithTabs } from 'vitepress-plugin-tabs/client'


import FileTree from './FileTree.vue'

import './style.scss'

export default {
  extends: DefaultTheme,
  enhanceApp({ app, router, siteData }) {
    app.component('FileTree', FileTree)
    enhanceAppWithTabs(app);
    // ...
  }
} satisfies Theme
