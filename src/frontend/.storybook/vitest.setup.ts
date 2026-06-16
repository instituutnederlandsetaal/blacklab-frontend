/*
See https://github.com/storybookjs/storybook/issues/25523
Caused by using a string as template in a vue component in a storybook file
Constructs like this: 
export const SearchAndExploreTabs: Story = {
	args: {} as any,
	render: () => ({
		components: { FormSystemStoryHarness },
		setup: () => createFullFormStoryModel(),
		template: '<FormSystemStoryHarness :definition :context :initial-state="initialState" :initial-submitted="initialSubmitted" />',
	}),
};
*/
const ignoredVueCompilerWarning = '[@vue/compiler-core] decodeEntities option is passed but will be ignored in non-browser builds.';
const warn = console.warn.bind(console);

console.warn = (...args) => {
	if (args.some(arg => typeof arg === 'string' && arg.includes(ignoredVueCompilerWarning))) return;
	warn(...args);
};
