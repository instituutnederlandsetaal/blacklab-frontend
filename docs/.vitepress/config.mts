import { DefaultTheme, defineConfig, UserConfig } from 'vitepress'
import {withSidebar} from 'vitepress-sidebar'
import { SidebarItem } from 'vitepress-sidebar/types';
import { tabsMarkdownPlugin } from 'vitepress-plugin-tabs'
import githubLinkPlugin from './theme/github-link'
import path from 'path';

/**
 * Remove leading numbers and separators from each path segment.
 */
function stripNumbersFromLink(str: string|undefined): string|undefined {
  return str?.split('/').map(stripNumbersFromText).join('/');
}

function stripNumbersFromText(text: string|undefined): string|undefined {
  return text?.replace(/^\d+[-_]+/, '');
}

function capitalizeFirstLetterAndRemoveUndercores(str: string|undefined): string|undefined {
  str = str?.replaceAll(/[-_]+/g, ' ');
  return str && (str.charAt(0).toUpperCase() + str.slice(1));
}

/**
 * vitepress-sidebar can strip numbers from the display, but not from the links themselves.
 * vitepress itself can strip numbers from the links, but not from the display.
 * 
 * When we enable both, we have good display names and good links, 
 * but the active state of the page in the sidebar is not set correctly.
 * So we need to fix up the links anyway...
 * 
 * @param config 
 * @returns 
 */
function stripNumbersFromLinksInSidebar(config: ReturnType<typeof defineConfig>): ReturnType<typeof defineConfig> {
  function processItems(items: SidebarItem[]|undefined): SidebarItem[]|undefined {
    return items?.map(item => ({
      ...item,
      link: stripNumbersFromLink(item.link),
      text: capitalizeFirstLetterAndRemoveUndercores(stripNumbersFromText(item.text)),
      items: processItems(item.items),
    }));
  }

  if (!config.themeConfig?.sidebar) return config;
  
  if (Array.isArray(config.themeConfig.sidebar)) { // SidebarItem[]
    config.themeConfig.sidebar = processItems(config.themeConfig.sidebar);
  } else { // Record<path, SidebarItem[]|{items, base}>
    config.themeConfig.sidebar = Object.fromEntries(Object.entries(config.themeConfig.sidebar).map(([path, item]) => [
      stripNumbersFromLink(path),
      Array.isArray(item) ? processItems(item) : {
        ...item,
        base: stripNumbersFromLink(item.base),
        items: processItems(item.items)
      }
    ]));
  }
  return config;
}


// https://vitepress.dev/reference/site-config
export default stripNumbersFromLinksInSidebar(defineConfig(withSidebar({
  title: "/ BlackLab Frontend /",
  description: "Documentation for the BlackLab Frontend, a webinterface for searching and publishing BlackLab corpora",
  srcDir: 'src',
  
  
  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
    },
    // No other locales for now, but setup so that we can add them later
  },

  vue: {
    template: {
      compilerOptions: {
        whitespace: 'preserve',
      }
    }
  },

  markdown: {
    config(md) { 
      md.use(tabsMarkdownPlugin); 
      const projectRoot = path.resolve(__dirname, '../../');
      md.use(githubLinkPlugin({
        organisation: 'instituutnederlandsetaal',
        repository: 'blacklab-frontend',
        branch: 'dev',
        projectRoot, // absolute path to the project root
      })); 
    },
  },

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    
    logo: '/img/ivdnt-logo-4regels.svg',
    
    nav: [
      { text: 'Installation', link: '/installation/install_using_docker' },
      { text: 'Configuration', link: '/configuration/global_settings' },
      { text: 'Development', link: '/development/development_setup' },
      { text: 'BlackLab', link: 'https://blacklab.ivdnt.org/' },
      { text: '/INT/', link: 'https://ivdnt.org/' },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/instituutnederlandsetaal/blacklab-frontend/' }
    ],

    search: {
      provider: 'local'
    },
    editLink: {
      pattern: `https://github.com/instituutnederlandsetaal/blacklab-frontend/edit/dev/docs/src/:path`,
    },
    footer: {
      message: 'Apache license 2.0',
      copyright: 'Copyright © 2010-present Dutch Language Institute',
    },
    lastUpdated: {}, // enabled, but defaults are fine. removing this line disables it
    docFooter: {
      next: false,
      prev: false,
    },

    outline: [2,3]
  },
  
  rewrites: id => stripNumbersFromLink(id)!,
  ignoreDeadLinks: 'localhostLinks' // some examples refer to localhost
} satisfies UserConfig<DefaultTheme.Config>, {
  // Sidebar generator options
  useTitleFromFrontmatter: true, // precedence
  useTitleFromFileHeading: true, // secondary
  useFolderTitleFromIndexFile: true, // tertiary
  documentRootPath: 'src', // needs to be set to the same as srcDir
  capitalizeFirst: true, // capitalize first letter of folder names (probably files too, but we set explicit titles)

  sortMenusByFrontmatterOrder: true, // "order: " in frontmatter
  excludePattern: ['_*'], // Do not show files and directories starting with an underscore in the sidebar. They are still compiled and can be linked to, but not shown in the sidebar.
  useFolderLinkFromIndexFile: true, // clicking folder entry in sidebar opens the index.md file

  collapseDepth: 1,
  includeRootIndexFile: true,

  excludeFilesByFrontmatterFieldName: 'excludeFromSidebar'
})))

