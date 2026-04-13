<template>
	<template v-if="debug.debug"><slot/></template>
</template>
<script setup lang="ts">

import debug from '@/utils/debug';

</script>