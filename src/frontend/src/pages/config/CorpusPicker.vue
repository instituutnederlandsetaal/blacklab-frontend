<template>
	<div :class="containerClass">
		<template v-if="corpora.isLoading()">
			<span class="fa fa-spinner fa-spin fa-4x"></span>
			{{ $t('remoteIndex.loadingCorpora') }}
		</template>
		<div v-else-if="corpora.isError()">
			{{ corpora.error.message }} <button type="button" @click="request.retry()">{{ $t('remoteIndex.retry') }}</button>
		</div>
		<template v-else-if="corpora.isLoaded()">
			<div v-for="c in corpora.value" :key="c.id">
				{{ c.id }}
				<router-link :to="{ name: 'tagset builder', params: { corpus: c.id } }">{{ $t('remoteIndex.configure') }}</router-link>
			</div>
		</template>
	</div>
</template>

<script setup lang="ts">
import { useLayout } from '@/app/shell/layout';

import { useBlackLabApi } from '@/shared/api/index.ts';
import { useRequestResource } from '@/shared/utils/loadable/loadable-request-resource';

const { containerClass } = useLayout();

const api = useBlackLabApi();
const request = useRequestResource(() => api.getCorpora());
request.run();
const corpora = request.current;
</script>
