const fs = require('node:fs');
const path = require('node:path');

const tsj = require('ts-json-schema-generator');

const toolingRoot = __dirname;
const assetsRoot = path.join(toolingRoot, '..', 'assets');
const config = {
	path: path.join(assetsRoot, 'blf-schema.ts'),
	tsconfig: path.join(toolingRoot, 'tsconfig.json'),
	type: 'BLFSchema',
};

const schema = tsj.createGenerator(config).createSchema(config.type);
const outputPath = path.join(assetsRoot, 'blf-schema.json');
fs.writeFile(outputPath, JSON.stringify(schema, null, 2), error => {
	if (error) throw error;
});
