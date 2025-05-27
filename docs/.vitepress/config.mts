import { defineConfig } from 'vitepress'
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
  title: "Corpus Frontend",
  description: "Documentation for the Corpus Frontend, a webinterface for searching and publishing BlackLab corpora",
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
        repository: 'corpus-frontend',
        branch: 'dev',
        projectRoot, // absolute path to the project root
      })); 
    },
  },

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    
    logo: '/img/ivdnt-logo-4regels.svg',
    nav: [
      { text: 'About', link: '/about' },
      { text: 'Examples', link: '/markdown-examples' }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/instituutnederlandsetaal/corpus-frontend/' }
    ],

    search: {
      provider: 'local'
    }
  },
  
  rewrites: id => {
    const rewritten = stripNumbersFromLink(id)!;
    console.log('rewriting', id, 'to', rewritten);
    return rewritten;
  },
  ignoreDeadLinks: 'localhostLinks' // some examples refer to localhost
}, {
  // Sidebar generator options
  useTitleFromFrontmatter: true, // precedence
  useTitleFromFileHeading: true, // secondary
  useFolderTitleFromIndexFile: true, // tertiary
  documentRootPath: 'src', // needs to be set to the same as srcDir
  capitalizeFirst: true, // capitalize first letter of folder names (probably files too, but we set explicit titles)
  
  // sortMenusByFrontmatterOrder: true, // "order: " in frontmatter
  excludePattern: ['_*'], // files and directories starting with _ are ignored (we use those for image directories and templates)
  useFolderLinkFromIndexFile: true, // clicking folder entry in sidebar opens the index.md file

  collapseDepth: 1,

  // usually the main heading in the sidebar is configuring using index.md, 
  // e.g. /path/index.md configures the sidebar entry for /path
  // But this leads to lots of index.md files everywhere, 
  // This settings makes it so that we can also use /path/path.md 
  // E.g. /sidebar/sidebar.md 
  // Which is a little friendlier to navigate in the workspace.
  // useFolderLinkFromSameNameSubFile: true 
})))

