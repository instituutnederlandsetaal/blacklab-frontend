<template>
	<Navbar />
	<router-view class="container main-content" />

	<footer class="container" style="padding: 20px; border-top: 1px solid rgba(0, 0, 0, 0.1)">
		Dutch Language Institute Corpus Search Interface v5.0 &copy; <a href="https://www.ivdnt.org/">INT</a> 2013-{{ new Date().getFullYear() }}
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
