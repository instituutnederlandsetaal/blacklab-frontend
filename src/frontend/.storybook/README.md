# Storybook Test Wiring

This folder configures both the interactive Storybook UI and the generated Storybook Vitest suite.

## How stories become tests

- `.storybook/main.ts` declares which files count as stories.
- `vite.config.ts` defines a dedicated Vitest project named `storybook`.
- That project enables `@storybook/addon-vitest/vitest-plugin`, which turns each named story export into one browser test.
- Failures are reported as `<story file> > <story display name>`.

Example:

- `src/features/form/stories/FieldCatalog.stories.ts > Built In Controllers`
- This maps back to the `BuiltInControllers` export in `src/features/form/stories/FieldCatalog.stories.ts`.

The display name is just Storybook's formatted version of the export name.

## How to debug a failing Storybook test

- Run only the generated Storybook suite: `npx vitest --project storybook --run`
- Run one story file: `npx vitest --project storybook --run src/features/form/stories/FieldCatalog.stories.ts`
- If the failure prints a Storybook URL, open it to inspect the story directly.
