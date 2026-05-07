// main.js

const tsj = require("ts-json-schema-generator");
const fs = require("fs");

/** @type {import('ts-json-schema-generator/dist/src/Config').Config} */
const config = {
    path: "blf-schema.ts",
    tsconfig: "tsconfig.json",
    type: "BLFSchema", // Or <type-name> if you want to generate schema for that one type only
};

const outputPath = "blf-schema.json";

const schema = tsj.createGenerator(config).createSchema(config.type);
const schemaString = JSON.stringify(schema, null, 2);
fs.writeFile(outputPath, schemaString, (err) => {
    if (err) throw err;
});