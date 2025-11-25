<template>

	<div class="container">
		<h2>Welcome to the config helper page</h2>
		<div>
			This is a page where some experimental stuff is hidden away.
			Eventually we may develop it into a full-fledged config helper.
			But for now, it only contains a tagset builder and the stub of a search page settings page.

			First pick your corpus, then you will be presented with some different things you can do for that corpus.
		</div>

		<router-view/>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';

export default Vue.extend({
	components: {
	},
})
</script>