import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import dtsBundleGenerator from 'dts-bundle-generator';
import ts from 'typescript';

const frontendRoot = fileURLToPath(new URL('../', import.meta.url));
const entryPath = join(frontendRoot, 'src/customization-api/external/external-api.ts');
const projectPath = join(frontendRoot, 'tsconfig.customization-api.json');
const outputPath = join(frontendRoot, 'dist/customization-api/index.d.ts');
const maximumMaterializedTypeLength = 50_000;
const bundleEntry = {
	output: {
		exportReferencedTypes: false,
		inlineDeclareGlobals: true,
		noBanner: true,
	},
};

function formatDiagnostics(diagnostics) {
	return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
		getCanonicalFileName: fileName => fileName,
		getCurrentDirectory: () => frontendRoot,
		getNewLine: () => '\n',
	});
}

function assertNoDiagnostics(program, description) {
	const diagnostics = ts.getPreEmitDiagnostics(program);
	if (diagnostics.length > 0) {
		throw new Error(`${description}:\n${formatDiagnostics(diagnostics)}`);
	}
}

function assertStandaloneDeclaration(sourceFile, contents) {
	const dependencies = [];
	if (/^\s*\/\/\/\s*<reference\b/m.test(contents)) dependencies.push('triple-slash reference');

	for (const statement of sourceFile.statements) {
		if (ts.isImportDeclaration(statement) && statement.moduleSpecifier) {
			dependencies.push(`import from ${statement.moduleSpecifier.getText(sourceFile)}`);
		}
		if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
			dependencies.push(`re-export from ${statement.moduleSpecifier.getText(sourceFile)}`);
		}
		if (ts.isImportEqualsDeclaration(statement) && ts.isExternalModuleReference(statement.moduleReference) && statement.moduleReference.expression) {
			dependencies.push(`import from ${statement.moduleReference.expression.getText(sourceFile)}`);
		}
	}

	function visit(node) {
		if (ts.isImportTypeNode(node)) dependencies.push(`import type ${node.argument.getText(sourceFile)}`);
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);

	if (dependencies.length > 0) {
		throw new Error(`The customization declaration is not dependency-free:\n- ${dependencies.join('\n- ')}`);
	}
}

function assertMaterializedMetadataField(sourceFile, contents) {
	const declaration = sourceFile.statements.find(statement => ts.isTypeAliasDeclaration(statement) && statement.name.text === 'SearchFormMetadataField');
	if (!declaration || !ts.isTypeAliasDeclaration(declaration)) {
		throw new Error('SearchFormMetadataField is missing from the bundled declaration');
	}

	let type = declaration.type;
	while (ts.isParenthesizedTypeNode(type)) type = type.type;
	if (!ts.isTypeLiteralNode(type)) {
		throw new Error(`SearchFormMetadataField was not materialized to an object: ${declaration.type.getText(sourceFile)}`);
	}

	const properties = type.members.filter(ts.isPropertySignature);
	const propertyNames = properties.map(property => property.name.getText(sourceFile)).sort();
	const expectedPropertyNames = ['defaultDescription', 'defaultDisplayName', 'id', 'uiType', 'values'];
	if (type.members.length !== properties.length || propertyNames.join() !== expectedPropertyNames.sort().join()) {
		throw new Error(`Unexpected materialized SearchFormMetadataField properties: ${propertyNames.join(', ')}`);
	}

	for (const property of properties) {
		if (!property.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ReadonlyKeyword)) {
			throw new Error(`Materialized SearchFormMetadataField.${property.name.getText(sourceFile)} is not readonly`);
		}
		const shouldBeOptional = property.name.getText(sourceFile) === 'values';
		if (!!property.questionToken !== shouldBeOptional) {
			throw new Error(`Materialized SearchFormMetadataField.${property.name.getText(sourceFile)} has unexpected optionality`);
		}
	}

	if (contents.includes('@materialize')) throw new Error('The bundled declaration leaked a build-only materialization marker');
}

function assertMaterializedTypes(sourceFile, names) {
	for (const name of names) {
		const declaration = sourceFile.statements.find(statement => ts.isTypeAliasDeclaration(statement) && statement.name.text === name);
		if (!declaration || !ts.isTypeAliasDeclaration(declaration)) throw new Error(`Materialized type ${name} is missing from the bundled declaration`);

		const unresolved = [];
		function visit(node) {
			if (ts.isTypeReferenceNode(node) || ts.isIndexedAccessTypeNode(node) || ts.isMappedTypeNode(node) || ts.isConditionalTypeNode(node) || ts.isTypeQueryNode(node)) {
				unresolved.push(node.getText(sourceFile));
			}
			ts.forEachChild(node, visit);
		}
		visit(declaration.type);
		if (unresolved.length > 0) throw new Error(`Materialized type ${name} still contains unresolved type expressions: ${unresolved.join(', ')}`);
	}
}

function materializeMarkedTypes(sourceFile, checker) {
	const printer = ts.createPrinter();
	const edits = [];
	const names = [];
	let count = 0;

	for (const statement of sourceFile.statements) {
		const materializeTags = ts.getJSDocTags(statement).filter(tag => tag.tagName.text === 'materialize');
		if (materializeTags.length === 0) continue;
		if (materializeTags.length > 1) throw new Error('Use one @materialize marker per type alias');
		if (!ts.isTypeAliasDeclaration(statement)) {
			throw new Error('@materialize may only be used on exported type aliases');
		}
		if (!statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
			throw new Error(`@materialize may only be used on exported type aliases: ${statement.name.text}`);
		}
		if (statement.typeParameters?.length) {
			throw new Error(`@materialize does not support generic type aliases: ${statement.name.text}`);
		}

		const resolvedType = checker.getTypeFromTypeNode(statement.type);
		const materializedNode = checker.typeToTypeNode(resolvedType, statement, ts.NodeBuilderFlags.NoTruncation | ts.NodeBuilderFlags.InTypeAlias);
		if (!materializedNode) throw new Error(`TypeScript could not materialize ${statement.name.text}`);

		const materializedText = printer.printNode(ts.EmitHint.Unspecified, materializedNode, sourceFile);
		if (materializedText.includes('/*elided*/')) {
			throw new Error(`TypeScript truncated ${statement.name.text}; recursive or excessively complex types cannot be materialized safely`);
		}
		if (materializedText.length > maximumMaterializedTypeLength) {
			throw new Error(`Materialized type ${statement.name.text} exceeds ${maximumMaterializedTypeLength} characters`);
		}

		const marker = materializeTags[0].parent;
		const markerText = sourceFile.text.slice(marker.pos, marker.end);
		if (marker.kind !== ts.SyntaxKind.JSDocComment || !/^\/\*\*\s*@materialize\s*\*\/$/.test(markerText)) {
			throw new Error(`Give ${statement.name.text} its own standalone /** @materialize */ marker`);
		}

		edits.push({ end: marker.end, start: marker.pos, text: '' });
		edits.push({
			end: statement.type.end,
			start: statement.type.getStart(sourceFile),
			text: materializedText,
		});
		names.push(statement.name.text);
		count++;
	}
	if (count === 0) throw new Error('The customization API does not contain any /** @materialize */ type aliases');

	let transformedSource = sourceFile.getFullText();
	for (const edit of edits.sort((left, right) => right.start - left.start)) {
		transformedSource = `${transformedSource.slice(0, edit.start)}${edit.text}${transformedSource.slice(edit.end)}`;
	}

	return {
		count,
		names,
		source: transformedSource,
	};
}

const configFile = ts.readConfigFile(projectPath, fileName => ts.sys.readFile(fileName));
if (configFile.error) throw new Error(formatDiagnostics([configFile.error]));

const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, dirname(projectPath), undefined, projectPath);
if (config.errors.length > 0) throw new Error(formatDiagnostics(config.errors));

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'blacklab-frontend-customization-api-build-'));
try {
	const intermediatePath = join(temporaryDirectory, 'index.unmaterialized.d.ts');
	const materializedPath = join(temporaryDirectory, 'index.materialized.d.ts');
	const finalPath = join(temporaryDirectory, 'index.d.ts');
	const [intermediateBundle] = dtsBundleGenerator.generateDtsBundle([{ ...bundleEntry, filePath: entryPath }], { preferredConfigPath: projectPath });
	await writeFile(intermediatePath, intermediateBundle);

	const intermediateProgram = ts.createProgram([intermediatePath], {
		...config.options,
		declaration: false,
		emitDeclarationOnly: false,
		noEmit: true,
		outDir: undefined,
		rootDir: undefined,
		skipLibCheck: false,
	});
	assertNoDiagnostics(intermediateProgram, 'The initial customization API bundle does not type-check');

	const sourceFile = intermediateProgram.getSourceFile(intermediatePath);
	if (!sourceFile) throw new Error(`TypeScript did not load the initial customization API bundle: ${intermediatePath}`);
	const { count, names, source } = materializeMarkedTypes(sourceFile, intermediateProgram.getTypeChecker());
	await writeFile(materializedPath, source);

	const [bundle] = dtsBundleGenerator.generateDtsBundle([{ ...bundleEntry, filePath: materializedPath }], { preferredConfigPath: projectPath });
	await writeFile(finalPath, bundle);

	const validationProgram = ts.createProgram([finalPath], {
		...config.options,
		declaration: false,
		emitDeclarationOnly: false,
		noEmit: true,
		outDir: undefined,
		rootDir: undefined,
		skipLibCheck: false,
	});
	assertNoDiagnostics(validationProgram, 'The bundled customization API declaration does not type-check');
	const finalSourceFile = validationProgram.getSourceFile(finalPath);
	if (!finalSourceFile) throw new Error(`TypeScript did not load the final customization API bundle: ${finalPath}`);
	assertStandaloneDeclaration(finalSourceFile, bundle);
	assertMaterializedTypes(finalSourceFile, names);
	assertMaterializedMetadataField(finalSourceFile, bundle);
	await mkdir(dirname(outputPath), { recursive: true });
	await writeFile(outputPath, bundle);

	console.log(`Bundled the customization API and materialized ${count} marked type${count === 1 ? '' : 's'}.`);
} finally {
	await rm(temporaryDirectory, { recursive: true, force: true });
}
