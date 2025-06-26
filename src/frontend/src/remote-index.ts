import Vue from 'vue';
import $ from 'jquery';

import RemoteIndexPageComponent from '@/pages/remote-index/RemoteIndexPage.vue';
import * as loginSystem from '@/utils/loginsystem';
import {init as initApi} from '@/api';

import '@/global.scss';
import {i18n} from '@/utils/i18n';


$(document).ready(async () => {
	const user = await loginSystem.awaitInit();
	initApi('blacklab', BLS_URL, user);
	initApi('cf', CONTEXT_URL, user);

	new Vue({
		i18n,
		render: v => v(RemoteIndexPageComponent)
	})
	.$mount(document.querySelector('#vue-root')!);
});
