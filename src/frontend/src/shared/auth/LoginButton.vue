<template>
	<SelectPicker
		v-if="enabled"
		class="username"
		data-class="btn-navbar"
		data-width="auto"
		data-menu-width="auto"
		right
		hideEmpty
		placeholder="Not logged in"
		allowUnknownValues
		:disabled="!canLogin"
		:modelValue="username"
		:options
		@update:modelValue="handle"
	/>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useLoginSystem } from '@/shared/auth/loginsystem';
import type { Option } from '@/shared/utils/options';

import SelectPicker from '@/components/SelectPicker.vue';

const loginSystem = useLoginSystem();

const username = computed(() => loginSystem.username);
const canLogin = computed(() => !!loginSystem.userManager);
const enabled = computed(() => canLogin.value || !!username.value);
const options = computed<Option[]>(() => {
	const r: Option[] = [];
	if (canLogin.value && !username.value) {
		r.push({ label: 'Log in', value: 'login' });
	}
	if (canLogin.value && username.value) {
		r.push({ label: 'Log out', value: 'logout' });
	}
	return r;
});

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
