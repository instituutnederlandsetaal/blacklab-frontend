<template>
	<Navbar />
	<router-view class="container main-content" />

	<footer class="container" style="padding: 20px; border-top: 1px solid rgba(0, 0, 0, 0.1)">
		Dutch Language Institute Corpus Search Interface v5.0 &copy;
		<a href="https://www.ivdnt.org/">INT</a> 2013-{{ new Date().getFullYear() }}
	</footer>
</template>

<script setup lang="ts">
import Navbar from './Navbar.vue';
</script>

<style lang="scss">
body {
	min-height: 100vh;
	display: flex;
	flex-direction: column;
}

#vue-root {
	display: contents;
}
.main-content {
	display: block;
	flex-grow: 1;
}

@media (max-width: 767px) {
	.container:not(.container-fluid) {
		width: min(750px, 100%);
	}
}
.container-fluid {
	width: 100%;
}
</style>
