<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'

import {NavBar, Spinner} from 'int-components';
// import 'my-overrides.scss';
import 'int-components/dist/lib/css-base.css';
import 'int-components/dist/lib/css-int.css';

import * as Api from '@/services/api';
import { provide, ref, watch, type InjectionKey, type Ref } from 'vue';
import type { WebsiteConfig } from './services/websiteconfig';
import type { NormalizedIndex } from './types/apptypes';
import { normalizeIndex } from './utils/blacklabutils';
import { getRouteTo } from './router';

const loaded = ref(false);

Api.init('blacklab', BLS_URL, null);
Api.init('cf', CONTEXT_URL, null);

const config = ref<WebsiteConfig>();
const corpus = ref<NormalizedIndex|null>(null);
const error = ref<Api.ApiError|null>(null);
const loading = ref<boolean>(false);

const route = useRoute();
watch(() => route.params.corpus as string|undefined, (cur, prev) => {
  if (cur != prev) {
    loading.value = true;
    Promise.all([
      // TODO refactor to retrieve additional info in frontend instead of backend
      cur ? Api.frontend.getCorpus(cur) : undefined,
      cur ? Api.blacklab.getRelations(cur) : undefined,
      Api.frontend.getCorpusConfig(cur)
    ])
    .then(([corpusResponse, relationsResponse, configResponse]) => {
      corpus.value = (corpusResponse && relationsResponse) ? normalizeIndex(corpusResponse, relationsResponse) : null;
      config.value = configResponse;
    })
    .catch(e => {
      console.log(e);
      error.value = e;
    })
    .finally(() => loading.value = false)
  }
}, {immediate: true})

loaded.value = true;

const test: InjectionKey<{
  config: typeof config,
  corpus: typeof corpus,
  error: typeof error,
  loading: typeof loading,
}> = Symbol('test');
provide(test, {config, corpus, error, loading});



</script>

<template>
  <NavBar s title="Autosearch" :int-logo="false">
    <template #links="{className, linkClassName, activeLinkClassName}"><div :class="className">
      <RouterLink v-if="!corpus || corpus.owner" 
        :class="linkClassName" 
        activeClass="active" 
        exactActiveClass="active" 
        to="/"
      >Corpora</RouterLink>
      <RouterLink 
        :class="linkClassName" 
        activeClass="active" 
        exactActiveClass="active" 
        :to="getRouteTo.about(corpus?.id)"
      >About</RouterLink>
      <RouterLink 
        :class="linkClassName" 
        activeClass="active" 
        exactActiveClass="active" 
        :to="getRouteTo.help(corpus?.id)"
      >Help</RouterLink>
    </div></template>
    
  </NavBar>

  <RouterView v-if="loaded"/>
  <Spinner v-else/>
</template>

<style scoped>
header {
  line-height: 1.5;
  max-height: 100vh;
}

.logo {
  display: block;
  margin: 0 auto 2rem;
}

nav {
  width: 100%;
  font-size: 12px;
  text-align: center;
  margin-top: 2rem;
}

nav a.router-link-exact-active {
  color: var(--color-text);
}

nav a.router-link-exact-active:hover {
  background-color: transparent;
}

nav a {
  display: inline-block;
  padding: 0 1rem;
  border-left: 1px solid var(--color-border);
}

nav a:first-of-type {
  border: 0;
}

@media (min-width: 1024px) {
  header {
    display: flex;
    place-items: center;
    padding-right: calc(var(--section-gap) / 2);
  }

  .logo {
    margin: 0 2rem 0 0;
  }

  header .wrapper {
    display: flex;
    place-items: flex-start;
    flex-wrap: wrap;
  }

  nav {
    text-align: left;
    margin-left: -1rem;
    font-size: 1rem;

    padding: 1rem 0;
    margin-top: 1rem;
  }
}
</style>
