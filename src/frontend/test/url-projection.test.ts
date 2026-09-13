import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, test } from 'vitest';
import { nextTick, reactive } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { createUrlProjection } from '@/url/url-projection';

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach(stop => stop()));

async function setup() {
	const router = createRouter({ history: createMemoryHistory(), routes: [{ name: 'search', path: '/search', component: {} }] });
	await router.push('/search?q=initial');
	const state = reactive({ query: '', draft: '' });
	const saved: string[] = [];
	const context = {};
	const projection = createUrlProjection(router, {
		context: () => context,
		read: route => {
			state.query = state.draft = String(route.query.q ?? '');
		},
		write: () => ({ name: 'search', query: { q: state.query } }),
		published: route => saved.push(String(route.query.q)),
	});
	cleanup.push(projection.stop);
	return { router, state, saved };
}

describe('URL projection', () => {
	test('Back and Forward restore previously published entries without adding saved history', async () => {
		const { router, state, saved } = await setup();
		state.query = 'second';
		await flushPromises();
		state.draft = 'unsent draft';
		state.query = 'third';
		await flushPromises();
		expect(router.currentRoute.value.query.q).toBe('third');
		expect(state.draft).toBe('unsent draft');
		expect(saved).toEqual(['second', 'third']);

		router.back();
		await flushPromises();
		expect(router.currentRoute.value.query.q).toBe('second');
		expect(state).toEqual({ query: 'second', draft: 'second' });
		router.forward();
		await flushPromises();
		expect(router.currentRoute.value.query.q).toBe('third');
		expect(state).toEqual({ query: 'third', draft: 'third' });
		expect(saved).toEqual(['second', 'third']);
	});

	test('the latest overlapping state publication wins and preserves the draft', async () => {
		const { router, state, saved } = await setup();
		state.query = 'intermediate';
		await nextTick();
		expect(router.currentRoute.value.query.q).toBe('initial');
		state.query = 'latest';
		state.draft = 'unsent draft';
		await flushPromises();
		expect(router.currentRoute.value.query.q).toBe('latest');
		expect(state).toEqual({ query: 'latest', draft: 'unsent draft' });
		expect(saved).toEqual(['latest']);

		router.back();
		await flushPromises();
		expect(state).toEqual({ query: 'initial', draft: 'initial' });
	});

	test('incoming navigation supersedes a pending publication without saving the cancelled state', async () => {
		const { router, state, saved } = await setup();
		state.query = 'pending';
		await nextTick();
		expect(router.currentRoute.value.query.q).toBe('initial');
		await router.push('/search?q=incoming');
		await flushPromises();
		expect(router.currentRoute.value.query.q).toBe('incoming');
		expect(state).toEqual({ query: 'incoming', draft: 'incoming' });
		expect(saved).toEqual([]);

		router.back();
		await flushPromises();
		expect(state).toEqual({ query: 'initial', draft: 'initial' });
	});
});
