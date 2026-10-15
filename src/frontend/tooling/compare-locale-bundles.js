import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const frontendDir = fileURLToPath(new URL('../', import.meta.url));
const localesDir = join(frontendDir, 'assets/locales');
const sourceDir = join(frontendDir, 'src');

const sourceFileExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.html']);
const ignoredSourceDirs = new Set(['dist', 'node_modules']);

// Corpus-specific keys are assembled at runtime from data ids.
const sourceUsagePrefixWhitelist = ['index.'];

function loadJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function isMessageObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function flattenKeys(messages, parentKey = '') {
	return Object.entries(messages).flatMap(([key, value]) => {
		const fullKey = parentKey ? `${parentKey}.${key}` : key;
		return isMessageObject(value) ? flattenKeys(value, fullKey) : [fullKey];
	});
}

function findMissingKeys(reference, messages, parentKey = '') {
	return Object.entries(reference).flatMap(([key, value]) => {
		const fullKey = parentKey ? `${parentKey}.${key}` : key;
		if (!isMessageObject(messages) || !Object.hasOwn(messages, key)) return [fullKey];
		return isMessageObject(value) ? findMissingKeys(value, messages[key], fullKey) : [];
	});
}

function loadSourceText(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return ignoredSourceDirs.has(entry.name) ? [] : loadSourceText(path);
		return sourceFileExtensions.has(extname(entry.name)) ? [readFileSync(path, 'utf8')] : [];
	});
}

const enUs = loadJson(join(localesDir, 'en-us.json'));
const jsonFiles = readdirSync(localesDir).filter(file => file.endsWith('.json') && file !== 'en-us.json');
let hasDiscrepancies = false;

for (const jsonFile of jsonFiles) {
	const otherLocale = loadJson(join(localesDir, jsonFile));
	const missingKeys = findMissingKeys(enUs, otherLocale);
	const extraKeys = findMissingKeys(otherLocale, enUs);

	if (missingKeys.length) {
		hasDiscrepancies = true;
		console.log(`Missing keys in ${jsonFile}`);
		for (const key of missingKeys) console.log(`\t${key}`);
	}
	if (extraKeys.length) {
		hasDiscrepancies = true;
		console.log(`Extra keys in ${jsonFile}:`);
		for (const key of extraKeys) console.log(`\t${key}`);
	}
}

const source = loadSourceText(sourceDir).join('\n');
const missingSourceKeys = flattenKeys(enUs).filter(key => !source.includes(key) && !sourceUsagePrefixWhitelist.some(prefix => key.startsWith(prefix)));

if (missingSourceKeys.length) {
	hasDiscrepancies = true;
	console.log('en-us.json source usage:');
	console.log('Keys not found in source code:');
	for (const key of missingSourceKeys) console.log(`\t${key}`);
}

if (hasDiscrepancies) process.exitCode = 1;
