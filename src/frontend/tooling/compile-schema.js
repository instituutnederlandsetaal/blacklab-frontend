import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createGenerator } from 'ts-json-schema-generator';

const toolingRoot = import.meta.dirname;
const assetsRoot = path.join(toolingRoot, '..', 'assets');
const config = {
	path: path.join(assetsRoot, 'blf-schema.ts'),
	tsconfig: path.join(toolingRoot, 'tsconfig.json'),
	type: 'BLFSchema',
};

const schema = createGenerator(config).createSchema(config.type);
await writeFile(path.join(assetsRoot, 'blf-schema.json'), JSON.stringify(schema, null, 2));
