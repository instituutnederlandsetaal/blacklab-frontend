<template>
	<template v-if="debug"><slot/></template>
</template>
<script setup lang="ts">

import debug from '@/_new/app/features/debug/debug';

</script>