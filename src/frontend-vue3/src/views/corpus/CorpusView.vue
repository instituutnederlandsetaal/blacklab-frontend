<template>
    <div>viewing corpus {{corpus}}</div>
    <RouterView/>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const corpus = ref(route.params.corpus);

</script>