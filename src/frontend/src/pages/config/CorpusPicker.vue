<template>
	<div class="container">
		<template v-if="corpora.isLoading()">
			<span class="fa fa-spinner fa-spin fa-4x"></span>
			{{ $t('remoteIndex.loadingCorpora') }}
		</template>
		<div v-else-if="corpora.isError()">
			{{ corpora.error }} <button type="button" @click="corpora.retry()">{{ $t('remoteIndex.retry') }}</button>
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
import { useBlackLabApi } from '@/shared/api/index.ts';
import { loadableFromRequest } from '@/shared/utils/loadable/loadable-datasource';

const api = useBlackLabApi();
const corpora = loadableFromRequest(() => api.getCorpora());
</script>
