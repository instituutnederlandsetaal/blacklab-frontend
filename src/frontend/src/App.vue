<template>
	<div>
		<Navbar />

		<router-view class="container main-content" />

		<footer class="container" style="padding: 20px; border-top: 1px solid rgba(0, 0, 0, 0.1)">
			<p>Dutch Language Institute Corpus Search Interface v1.3 &copy; <a href="https://www.ivdnt.org/">INT</a> 2013-{{ new Date().getFullYear() }}</p>
			<HtmlRenderer v-if="config.footerMessage" :content="config.footerMessage" parse-string-as-html />
		</footer>
	</div>
</template>

<script setup lang="ts">
import { useCfPageConfig } from '@/app/state/useCorpusContext';

import Navbar from '@/components/Navbar.vue';
import HtmlRenderer from '@/shared/ui/HtmlRenderer.vue';

const config = useCfPageConfig();
</script>

<style lang="scss">
body {
	min-height: 100vh;
	display: flex;
	flex-direction: column;
	> div {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		> .main-content {
			flex-grow: 1;
		}
	}
}
</style>
