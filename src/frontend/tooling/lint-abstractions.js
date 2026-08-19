#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parse as parseVueSfc } from '@vue/compiler-sfc';
import ts from 'typescript';

// An extracted branch is duplicated at every call site when the helper is inlined.
// Estimated savings = (direct calls - 1) * (cyclomatic complexity - 1).
// A domain concept can justify a low score; documenting the helper records that decision and exempts it.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const minimumSavings = Number(process.env.BLF_MIN_ABSTRACTION_SAVINGS ?? 2);
const maximumBodyLines = Number(process.env.BLF_MAX_ABSTRACTION_BODY_LINES ?? 4);
const maximumCallSites = Number(process.env.BLF_MAX_ABSTRACTION_CALL_SITES ?? 3);
const maximumReports = Number(process.env.BLF_MAX_ABSTRACTION_REPORTS ?? 25);
const maximumWarnings = Number(process.env.BLF_MAX_ABSTRACTION_WARNINGS ?? 0);
const sourceRoots = ['src'].map(directory => path.join(root, directory));

const sourceFiles = sourceRoots.flatMap(walk).filter(file => /\.(?:ts|tsx|vue)$/.test(file) && !file.endsWith('.d.ts'));
const typescriptFiles = sourceFiles.filter(file => !file.endsWith('.vue'));
const vueFiles = sourceFiles.filter(file => file.endsWith('.vue'));

const compilerOptions = readCompilerOptions();
const program = ts.createProgram(typescriptFiles, compilerOptions);
const checker = program.getTypeChecker();
const findings = [...inspectTypescriptFiles(), ...vueFiles.flatMap(inspectVueFile)].sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);

for (const finding of findings.slice(0, maximumReports)) {
	const relativeFile = path.relative(root, finding.file);
	console.warn(
		`${relativeFile}:${finding.line}:${finding.column}: warning: ${finding.name} has ${finding.calls} direct call sites and cyclomatic complexity ${finding.complexity}; ` +
			`estimated duplicated-branch savings ${finding.savings} is below ${minimumSavings} (${finding.bodyLines} body line${finding.bodyLines === 1 ? '' : 's'}). Review whether it earns the indirection. ` +
			'[blacklab/low-value-abstraction]',
	);
}

if (findings.length) {
	console.warn(
		`\n${findings.length} low-value abstraction candidate${findings.length === 1 ? '' : 's'}${findings.length > maximumReports ? ` (${maximumReports} shown)` : ''}. ` +
			`Threshold: ${minimumSavings}; maximum body length: ${maximumBodyLines} lines; maximum call sites: ${maximumCallSites}. ` +
			`Warning allowance: ${maximumWarnings}. Set BLF_MAX_ABSTRACTION_WARNINGS to adjust it temporarily.`,
	);
	if (findings.length > maximumWarnings) process.exitCode = 1;
}

function walk(directory) {
	if (!fs.existsSync(directory)) return [];

	return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
		const entryPath = path.join(directory, entry.name);
		return entry.isDirectory() ? walk(entryPath) : [entryPath];
	});
}

function readCompilerOptions() {
	const configPath = path.join(root, 'tsconfig.app.json');
	const result = ts.readConfigFile(configPath, file => ts.sys.readFile(file));
	if (result.error) throw new Error(ts.flattenDiagnosticMessageText(result.error.messageText, '\n'));

	return {
		...ts.parseJsonConfigFileContent(result.config, ts.sys, root).options,
		allowJs: false,
		noEmit: true,
		skipLibCheck: true,
	};
}

function inspectTypescriptFiles() {
	const candidatesBySymbol = new Map();
	const requestedFiles = new Set(typescriptFiles.map(file => path.resolve(file)));

	for (const sourceFile of program.getSourceFiles()) {
		if (!requestedFiles.has(path.resolve(sourceFile.fileName))) continue;
		const exportedSymbols = getExportedSymbols(sourceFile);
		collectCandidates(sourceFile, candidate => {
			const symbol = checker.getSymbolAtLocation(candidate.nameNode);
			if (symbol && !exportedSymbols.has(symbol)) candidatesBySymbol.set(symbol, candidate);
		});
	}

	for (const sourceFile of program.getSourceFiles()) {
		if (!requestedFiles.has(path.resolve(sourceFile.fileName))) continue;

		visit(sourceFile, node => {
			if (!ts.isIdentifier(node) || isDeclarationName(node)) return;
			const candidate = candidatesBySymbol.get(checker.getSymbolAtLocation(node));
			if (!candidate) return;
			registerReference(candidate, node);
		});
	}

	return [...candidatesBySymbol.values()].filter(isFinding).map(toFinding);
}

function getExportedSymbols(sourceFile) {
	const exportedSymbols = new Set();
	if (!sourceFile.symbol) return exportedSymbols;

	for (const symbol of checker.getExportsOfModule(sourceFile.symbol)) {
		exportedSymbols.add(symbol);
		if (symbol.flags & ts.SymbolFlags.Alias) exportedSymbols.add(checker.getAliasedSymbol(symbol));
	}
	return exportedSymbols;
}

function inspectVueFile(file) {
	const source = fs.readFileSync(file, 'utf8');
	const { descriptor, errors } = parseVueSfc(source, { filename: file });
	if (errors.length) return [];

	return [descriptor.script, descriptor.scriptSetup].filter(Boolean).flatMap(block => {
		const kind = block.lang === 'tsx' || block.lang === 'jsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
		const sourceFile = ts.createSourceFile(file, block.content, ts.ScriptTarget.Latest, true, kind);
		const candidatesByName = new Map();

		collectCandidates(
			sourceFile,
			candidate => {
				if (candidate.topLevel) candidatesByName.set(candidate.name, candidate);
			},
			block.loc.start.line - 1,
		);

		visit(sourceFile, node => {
			if (!ts.isIdentifier(node) || isDeclarationName(node)) return;
			const candidate = candidatesByName.get(node.text);
			if (candidate) registerReference(candidate, node);
		});

		if (block === descriptor.scriptSetup && descriptor.template) {
			registerTemplateReferences(candidatesByName, descriptor.template.ast);
		}

		return [...candidatesByName.values()].filter(isFinding).map(toFinding);
	});
}

function collectCandidates(sourceFile, addCandidate, lineOffset = 0) {
	visit(sourceFile, node => {
		let nameNode;
		let functionNode;
		let declarationNode;
		let topLevel;

		if (ts.isFunctionDeclaration(node) && node.name && node.body && !hasExportModifier(node)) {
			nameNode = node.name;
			functionNode = node;
			declarationNode = node;
			topLevel = node.parent === sourceFile;
		} else if (
			ts.isVariableDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			node.initializer &&
			(ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) &&
			!hasExportModifier(node.parent.parent)
		) {
			nameNode = node.name;
			functionNode = node.initializer;
			declarationNode = node.parent.parent;
			topLevel = declarationNode.parent === sourceFile;
		} else {
			return;
		}

		const body = functionNode.body;
		const start = sourceFile.getLineAndCharacterOfPosition(nameNode.getStart(sourceFile));
		const end = sourceFile.getLineAndCharacterOfPosition(body.getEnd());
		const candidate = {
			file: sourceFile.fileName,
			line: start.line + lineOffset + 1,
			column: start.character + 1,
			name: nameNode.text,
			nameNode,
			node: functionNode,
			topLevel,
			calls: 0,
			nonCallReferences: 0,
			recursive: false,
			complexity: calculateComplexity(body),
			bodyLines: end.line - sourceFile.getLineAndCharacterOfPosition(body.getStart(sourceFile)).line + 1,
			documented: hasDocumentation(sourceFile, declarationNode),
		};
		addCandidate(candidate);
	});
}

function registerReference(candidate, identifier) {
	if (isDirectCall(identifier)) {
		candidate.calls += 1;
		if (contains(candidate.node, identifier)) candidate.recursive = true;
	} else {
		candidate.nonCallReferences += 1;
	}
}

function isFinding(candidate) {
	const savings = (candidate.calls - 1) * (candidate.complexity - 1);
	return (
		candidate.calls >= 2 &&
		candidate.calls <= maximumCallSites &&
		candidate.nonCallReferences === 0 &&
		!candidate.recursive &&
		!candidate.documented &&
		candidate.bodyLines <= maximumBodyLines &&
		savings < minimumSavings
	);
}

function toFinding(candidate) {
	return {
		...candidate,
		savings: (candidate.calls - 1) * (candidate.complexity - 1),
	};
}

function calculateComplexity(body) {
	let branches = 0;

	const inspect = node => {
		if (node !== body && ts.isFunctionLike(node)) return;
		if (
			ts.isIfStatement(node) ||
			ts.isConditionalExpression(node) ||
			ts.isForStatement(node) ||
			ts.isForInStatement(node) ||
			ts.isForOfStatement(node) ||
			ts.isWhileStatement(node) ||
			ts.isDoStatement(node) ||
			ts.isCatchClause(node) ||
			ts.isCaseClause(node)
		) {
			branches += 1;
		} else if (ts.isBinaryExpression(node) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) {
			branches += 1;
		}
		ts.forEachChild(node, inspect);
	};

	inspect(body);
	return branches + 1;
}

function visit(node, callback) {
	callback(node);
	ts.forEachChild(node, child => visit(child, callback));
}

function isDeclarationName(identifier) {
	const parent = identifier.parent;
	return (
		(ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent) || ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isClassDeclaration(parent)) && parent.name === identifier
	);
}

function isDirectCall(identifier) {
	return ts.isCallExpression(identifier.parent) && identifier.parent.expression === identifier;
}

function contains(container, node) {
	return node.pos >= container.pos && node.end <= container.end;
}

function hasExportModifier(node) {
	return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword || modifier.kind === ts.SyntaxKind.DefaultKeyword);
}

function hasDocumentation(sourceFile, node) {
	return sourceFile.text.slice(node.getFullStart(), node.getStart(sourceFile)).includes('/**');
}

function registerTemplateReferences(candidatesByName, templateAst) {
	for (const expression of collectTemplateExpressions(templateAst)) {
		const sourceFile = ts.createSourceFile('template-expression.ts', `(${expression})`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
		visit(sourceFile, node => {
			if (!ts.isIdentifier(node) || isDeclarationName(node) || isPropertyNameOnly(node)) return;
			const candidate = candidatesByName.get(node.text);
			if (!candidate) return;
			if (isDirectCall(node)) candidate.calls += 1;
			else candidate.nonCallReferences += 1;
		});
	}
}

function collectTemplateExpressions(templateAst) {
	const expressions = [];
	const seen = new WeakSet();
	const inspect = value => {
		if (!value || typeof value !== 'object' || seen.has(value)) return;
		seen.add(value);
		if (value.type === 4 && value.isStatic === false && typeof value.content === 'string') {
			expressions.push(value.content);
			return;
		}
		for (const [key, child] of Object.entries(value)) {
			if (key === 'loc' || key === 'codegenNode' || key === 'forParseResult') continue;
			if (Array.isArray(child)) child.forEach(inspect);
			else inspect(child);
		}
	};
	inspect(templateAst);
	return expressions;
}

function isPropertyNameOnly(identifier) {
	const parent = identifier.parent;
	return (
		(ts.isPropertyAccessExpression(parent) && parent.name === identifier) ||
		(ts.isPropertyAssignment(parent) && parent.name === identifier) ||
		(ts.isMethodDeclaration(parent) && parent.name === identifier) ||
		(ts.isPropertyDeclaration(parent) && parent.name === identifier)
	);
}
