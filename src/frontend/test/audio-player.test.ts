// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { afterEach, expect, test, vi } from 'vitest';

import AudioPlayer from '@/shared/ui/AudioPlayer.vue';

afterEach(() => vi.unstubAllGlobals());

test('shares audio and transfers playback ownership with clipping and cleanup', async () => {
	const events: string[] = [];
	const created: AudioStub[] = [];
	class AudioStub extends EventTarget {
		currentTime = 0;
		readonly added: string[] = [];
		readonly removed: string[] = [];

		constructor(readonly url: string) {
			super();
			created.push(this);
		}

		pause() {
			events.push('pause');
		}

		play() {
			events.push('play');
			return Promise.resolve();
		}

		override addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
			this.added.push(type);
			super.addEventListener(type, callback, options);
		}

		override removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
			this.removed.push(type);
			super.removeEventListener(type, callback, options);
		}
	}
	vi.stubGlobal('Audio', AudioStub);
	const first = mount(AudioPlayer, { props: { endTime: 2, startTime: 1, url: '/shared.mp3' } });
	const second = mount(AudioPlayer, { props: { endTime: 6, startTime: 5, url: '/shared.mp3' } });

	await first.get('button').trigger('click');
	expect(created).toHaveLength(1);
	expect(created[0].currentTime).toBe(1);
	expect(events).toEqual(['play']);

	await second.get('button').trigger('click');
	expect(created).toHaveLength(1);
	expect(created[0].currentTime).toBe(5);
	expect(events).toEqual(['play', 'pause', 'play']);

	await second.get('button').trigger('click');
	expect(events).toEqual(['play', 'pause', 'play', 'pause']);
	await second.get('button').trigger('click');
	created[0].currentTime = 6;
	created[0].dispatchEvent(new Event('timeupdate'));
	expect(events).toEqual(['play', 'pause', 'play', 'pause', 'play', 'pause']);

	const afterClip = [...events];
	created[0].dispatchEvent(new Event('timeupdate'));
	created[0].dispatchEvent(new Event('ended'));
	expect(events).toEqual(afterClip);
	expect(created[0].added).toContain('timeupdate');
	expect(created[0].added).toContain('ended');
	expect(created[0].removed).toContain('timeupdate');
	expect(created[0].removed).toContain('ended');

	await first.get('button').trigger('click');
	first.unmount();
	const afterUnmount = [...events];
	created[0].dispatchEvent(new Event('timeupdate'));
	created[0].dispatchEvent(new Event('ended'));
	expect(events).toEqual(afterUnmount);
	await second.get('button').trigger('click');
	expect(events).toEqual([...afterUnmount, 'play']);
	second.unmount();
});
