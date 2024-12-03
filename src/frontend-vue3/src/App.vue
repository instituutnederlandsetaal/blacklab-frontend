<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'

import {NavBar, Spinner} from 'int-components';
// import 'my-overrides.scss';
import 'int-components/dist/lib/css-base.css';
import 'int-components/dist/lib/css-int.css';

import * as Api from '@/api';
import { ref } from 'vue';


const loaded = ref(false);

Api.init('blacklab', BLS_URL, null);
Api.init('cf', CONTEXT_URL, null);

loaded.value = true;

</script>

<template>
  <NavBar s title="Autosearch" :int-logo="false">
    <template #links="{className, linkClassName, activeLinkClassName}"><div :class="className">
      <RouterLink :class="linkClassName" activeClass="active" exactActiveClass="active" to="/">Corpora</RouterLink>
      <RouterLink :class="linkClassName" activeClass="active" exactActiveClass="active" to="/about">About</RouterLink>
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
