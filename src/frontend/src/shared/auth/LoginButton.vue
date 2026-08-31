<template>
	<SelectPicker
		v-if="loginSystem.userManager || loginSystem.username"
		class="username"
		data-class="btn-navbar"
		data-width="auto"
		data-menu-width="auto"
		right
		hideEmpty
		placeholder="Not logged in"
		allowUnknownValues
		:disabled="!loginSystem.userManager"
		:modelValue="loginSystem.username"
		:options="loginSystem.userManager ? [{ label: loginSystem.username ? 'Log out' : 'Log in', value: loginSystem.username ? 'logout' : 'login' }] : []"
		@update:modelValue="handle"
	/>
</template>

<script setup lang="ts">
import { useLoginSystem } from '@/shared/auth/loginsystem';

import SelectPicker from '@/shared/ui/SelectPicker.vue';

const loginSystem = useLoginSystem();

function handle(value: string) {
	if (value === 'login') {
		loginSystem.login();
	} else if (value === 'logout') {
		loginSystem.logout();
	}
}
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
