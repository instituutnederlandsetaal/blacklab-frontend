<template>
	<SelectPicker v-if="enabled"
		class="username"
		data-class="btn-navbar"
		data-width="auto"
		data-menu-width="auto"
		right
		hideEmpty
		placeholder="Not logged in"
		allowUnknownValues

		:disabled="!canLogin"
		:value="username"
		:options="options"

		@input="handle"
	/>
</template>

<script lang="ts">
import Vue from 'vue';
import SelectPicker, { Option } from '@/components/SelectPicker.vue';
import * as LoginSystem from '@/utils/loginsystem';

export default Vue.extend({
	components: {SelectPicker},
	data: () => ({
		username: null as string|null,
	}),
	computed: {
		canLogin(): boolean { return !!LoginSystem.userManager; },
		enabled(): boolean { return this.canLogin || !!this.username; },
		options(): Option[] {
			const r: Option[] = [];
			if (this.canLogin && !this.username) {
				r.push({label: 'Log in', value: 'login'});
			}
			if (this.canLogin && this.username) {
				r.push({label: 'Log out', value: 'logout'});
			}
			return r;
		}
	},
	methods: {
		handle(value: string) {
			if (value === 'login') { LoginSystem.login(); }
			else if (value === 'logout') { LoginSystem.logout(); }
		}
	},
	created() {
		LoginSystem.userName.then(username => this.username = username);
	}
})

</script>

<style lang="scss">

.username *:disabled .menu-caret {
	display: none;
}

.username .menu-value:before {
	content: '\f007'; // fa-user
	font-family: 'FontAwesome';
	display: inline-block;
	width: 1em;
}


</style>