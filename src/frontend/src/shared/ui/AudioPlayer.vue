<template>
	<button type="button" class="btn btn-default audio-player" @click="toggle">
		<span
			:class="{
				fa: true,
				'fa-play': !isPlaying,
				'fa-pause': isPlaying,
			}"
		></span>
	</button>
</template>

<script lang="ts">
type Player = { stop: () => void };

let activePlayer: Player | null = null;
const audioPlayerCache: Record<string, HTMLAudioElement> = {};
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';

const props = defineProps<{ url: string; startTime: number; endTime: number }>();
const isPlaying = ref(false);
const audio = computed(() => (audioPlayerCache[props.url] ??= new Audio(props.url)));
const player: Player = { stop };

function toggle() {
	if (!stopActive()) start();
}

function stop() {
	isPlaying.value = false;
	audio.value.pause();
	audio.value.removeEventListener('timeupdate', update);
	audio.value.removeEventListener('ended', stop);
	if (activePlayer === player) activePlayer = null;
}

function start() {
	stopActive();
	activePlayer = player;
	isPlaying.value = true;
	audio.value.addEventListener('timeupdate', update);
	audio.value.addEventListener('ended', stop);
	audio.value.currentTime = props.startTime;
	audio.value.play();
}

function stopActive() {
	const thisStopped = activePlayer === player;
	activePlayer?.stop();
	return thisStopped;
}

function update(event: Event) {
	if ((event.target as HTMLAudioElement).currentTime >= props.endTime) stop();
}

onBeforeUnmount(stop);
</script>

<style>
.audio-player {
	font-size: 14px;
	height: 24px;
	width: 24px;
	padding: 0;
	line-height: 1.5em;
	border-radius: 100px;

	display: inline-flex;
	justify-content: center;
	align-items: center;
}
</style>
