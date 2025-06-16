<template>
	<button type="button" class="btn btn-default audio-player" @click="toggle">
		<span :class="{
			'fa': true,
			'fa-play': !isPlaying,
			'fa-pause': isPlaying
		}"></span>
	</button>
</template>

<script lang="ts">
import Vue from 'vue';
let activePlayer: any = null;

const audioPlayerCache: {[key: string]: HTMLAudioElement} = {};
export default Vue.extend({
	props: {
		url: String,
		startTime: Number,
		endTime: Number
	},
	data: () => ({
		isPlaying: false,
	}),
	computed: {
		audio(): HTMLAudioElement {
			if (audioPlayerCache[this.url]) {
				return audioPlayerCache[this.url];
			}
			return audioPlayerCache[this.url] = new Audio(this.url);
		},
	},
	methods: {
		toggle(): void {
			if (!this.stopActive()) {
				this.start();
			}
		},
		stop(): void {
			this.isPlaying = false;
			this.audio.pause();
			this.audio.removeEventListener('timeupdate', this.update);
			this.audio.removeEventListener('ended', this.stop);
			if (activePlayer === this) {
				activePlayer = null;
			}
		},
		start(): void {
			this.stopActive();
			activePlayer = this;
			this.isPlaying = true;
			this.audio.addEventListener('timeupdate', this.update);
			this.audio.addEventListener('ended', this.stop);
			this.audio.currentTime = this.startTime;
			this.audio.play();
		},
		/** @return true if the active player was this */
		stopActive(): boolean {
			const thisStopped = activePlayer === this;
			if (activePlayer) {
				activePlayer.stop();
			}

			return thisStopped;
		},

		update(event: Event) {
			if ((event.target as HTMLAudioElement).currentTime >= this.endTime) {
				this.stop();
			}
		},
		ended(event: Event) {
			this.stop();
		}
	},
	beforeDestroy() {
		this.stop();
	}
});


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