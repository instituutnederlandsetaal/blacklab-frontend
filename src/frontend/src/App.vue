<template>
	<Navbar />

	<router-view />

	<footer class="container">
		<p :title="versionInfo">Dutch Language Institute Corpus Search Interface {{ version }} &copy; <a href="https://www.ivdnt.org/">INT</a> 2013-{{ new Date().getFullYear() }}</p>
		<HtmlRenderer v-if="config.footerMessage" :content="config.footerMessage" parse-string-as-html />
	</footer>
</template>

<script setup lang="ts">
import { useCfPageConfig } from '@/app/state/useCorpusContext';

import Navbar from '@/components/Navbar.vue';
import HtmlRenderer from '@/shared/ui/HtmlRenderer.vue';

const config = useCfPageConfig();
const version = BLF_VERSION;
const versionInfo = `Version: ${BLF_VERSION}\nCommit hash: ${BLF_COMMIT_HASH}\nCommit time: ${BLF_COMMIT_TIME}\nCommit message: ${BLF_COMMIT_MESSAGE}`;
</script>

<style lang="scss">
body {
	min-height: 100vh;
	display: flex;
	flex-direction: column;
}

#vue-root {
	flex-grow: 1;
	display: flex;
	flex-direction: column;
	> .main-content {
		flex-grow: 1;
	}
}

footer {
	padding: 20px;
	border-top: 1px solid rgba(0, 0, 0, 0.1);
	margin-top: auto; // push to bottom
}

@at-root {
	.container {
		&:not(.panel, .cf-panel) {
			padding-inline: 0 !important;
		}
		> * {
			margin-inline: 0 !important;
		}
	}

	.container:not(.container-fluid) {
		@media (max-width: 767px) {
			width: auto;
			margin-inline: 15px !important;
		}
	}
}
</style>
