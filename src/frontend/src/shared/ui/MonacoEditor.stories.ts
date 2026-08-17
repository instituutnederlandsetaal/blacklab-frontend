import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { nextTick, ref } from 'vue';

import monaco from './monacoEditor';

import MonacoEditor from './MonacoEditor.vue';

const meta = {
	title: 'Shared/UI/MonacoEditor',
	component: MonacoEditor,
	parameters: {
		layout: 'fullscreen',
	},
} satisfies Meta<typeof MonacoEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const JsonAndYaml: Story = {
	render: () => ({
		components: { MonacoEditor },
		setup() {
			const json = ref('{"version": "invalid"}');
			const yaml = ref('version: invalid');
			const shown = ref(true);
			const remount = async () => {
				shown.value = false;
				await nextTick();
				shown.value = true;
			};
			return { json, remount, shown, yaml };
		},
		template: `
			<div style="display: grid; gap: 1rem; padding: 1rem">
				<button type="button" @click="remount">Remount editors</button>
				<template v-if="shown">
					<section><h2>YAML</h2><MonacoEditor v-model="yaml" filename="storybook.blf.yaml" language="yaml" :options="{ automaticLayout: true, theme: 'vs' }" /></section>
					<section><h2>JSON</h2><MonacoEditor v-model="json" filename="storybook.blf.json" language="json" :options="{ automaticLayout: true, theme: 'vs' }" /></section>
				</template>
			</div>
		`,
	}),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await waitFor(async () => await expect(canvasElement.querySelectorAll('.monaco-editor')).toHaveLength(2));

		const findModels = () => {
			const models = monaco.editor.getModels();
			return {
				json: models.find(model => model.uri.path.endsWith('/storybook.blf.json')),
				yaml: models.find(model => model.uri.path.endsWith('/storybook.blf.yaml')),
			};
		};
		const originalModels = findModels();
		await expect(originalModels.json).toBeDefined();
		await expect(originalModels.yaml).toBeDefined();

		await waitFor(
			async () => {
				await expect(monaco.editor.getModelMarkers({ resource: originalModels.json!.uri }).length).toBeGreaterThan(0);
				await expect(monaco.editor.getModelMarkers({ resource: originalModels.yaml!.uri }).length).toBeGreaterThan(0);
			},
			{ timeout: 10_000 },
		);

		await userEvent.click(canvas.getByRole('button', { name: 'Remount editors' }));
		await waitFor(async () => {
			const remountedModels = findModels();
			await expect(remountedModels.json).toBeDefined();
			await expect(remountedModels.yaml).toBeDefined();
			await expect(remountedModels.json).not.toBe(originalModels.json);
			await expect(remountedModels.yaml).not.toBe(originalModels.yaml);
		});
	},
};
