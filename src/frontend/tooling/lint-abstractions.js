#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parse as parseVueSfc } from "@vue/compiler-sfc";
import ts from "typescript";

// An extracted branch is duplicated at every usage when the helper is inlined.
// Test and Storybook calls have reduced weight; a Vue import counts as one usage per SFC.
// Estimated savings = (effective calls - 1) * (cyclomatic complexity - 1).
// A domain concept can justify a low score; documenting the helper records that decision and exempts it.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const minimumSavings = Number(process.env.BLF_MIN_ABSTRACTION_SAVINGS ?? 2);
const maximumBodyLines = Number(process.env.BLF_MAX_ABSTRACTION_BODY_LINES ?? 4);
const maximumCallSites = Number(process.env.BLF_MAX_ABSTRACTION_CALL_SITES ?? 3);
const maximumReports = Number(process.env.BLF_MAX_ABSTRACTION_REPORTS ?? 25);
const maximumWarnings = Number(process.env.BLF_MAX_ABSTRACTION_WARNINGS ?? 0);
const testCallWeight = Number(process.env.BLF_TEST_CALL_WEIGHT ?? 1 / 3);
const sourceRoots = ["src"].map((directory) => path.join(root, directory));
const projectRoots = ["src", "test", ".storybook"].map((directory) => path.join(root, directory));

const sourceFiles = sourceRoots
  .flatMap(walk)
  .filter((file) => /\.(?:ts|tsx|vue)$/.test(file) && !file.endsWith(".d.ts"));
const projectFiles = projectRoots.flatMap(walk).filter((file) => /\.(?:ts|tsx|vue)$/.test(file));
const candidateTypescriptFiles = new Set(
  sourceFiles
    .filter((file) => !file.endsWith(".vue") && !isTestOrStoryFile(file))
    .map((file) => path.resolve(file)),
);
const typescriptFiles = projectFiles.filter((file) => !file.endsWith(".vue"));
const inspectedTypescriptFiles = new Set(
  typescriptFiles.filter((file) => !file.endsWith(".d.ts")).map((file) => path.resolve(file)),
);
const vueFiles = projectFiles.filter((file) => file.endsWith(".vue"));
const candidateVueFiles = new Set(
  sourceFiles
    .filter((file) => file.endsWith(".vue") && !isTestOrStoryFile(file))
    .map((file) => path.resolve(file)),
);

const compilerOptions = readCompilerOptions();
const program = ts.createProgram(typescriptFiles, compilerOptions);
const checker = program.getTypeChecker();
const vueModuleExportsCache = new Map();
const typescriptCandidates = inspectTypescriptFiles();
const vueFindings = vueFiles.flatMap((file) =>
  inspectVueFile(file, typescriptCandidates, candidateVueFiles.has(path.resolve(file))),
);
const findings = [...typescriptCandidates.values()]
  .filter(isFinding)
  .map(toFinding)
  .concat(vueFindings)
  .sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);

if (findings.length) {
  console.warn(
    `Low-value abstractions were found. These are functions with low cyclomatic complexity and low number of call-sites. 
		Imports in .vue componentsa are counted as 1, test/Storybook usage counted at ${testCallWeight.toFixed(3)}, other usages as 1.
		Documenting a helper exempts it from this rule, but should be done with consideration.
		Heuristic: e=p+v+${formatNumber(testCallWeight)}(t+tv), savings=(e-1)(complexity-1); report e=2..${maximumCallSites}, savings<${minimumSavings}, body<=${maximumBodyLines}.
		p=production calls, v=Vue imports, t=test/Storybook calls, tv=test/Storybook Vue imports; documented helpers exempt.
		`.replace(/\t+/g, ""),
  );

  for (const finding of findings.slice(0, maximumReports)) {
    const relativeFile = path.relative(root, finding.file);
    console.warn(
      `${relativeFile}:${finding.line}:${finding.column}: ${finding.name} has low complexity of ${finding.complexity} and only ${formatNumber(finding.effectiveCalls)} effective usages. [blacklab/low-value-abstraction]`,
    );
  }

  console.warn(
    `\n${findings.length} candidate${findings.length === 1 ? "" : "s"}${findings.length > maximumReports ? `; ${maximumReports} shown` : ""}; allowance=${maximumWarnings} (BLF_MAX_ABSTRACTION_WARNINGS).`,
  );
  if (findings.length > maximumWarnings) process.exitCode = 1;
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(entryPath) : [entryPath];
  });
}

function readCompilerOptions() {
  const configPath = path.join(root, "tsconfig.tests.json");
  const result = ts.readConfigFile(configPath, (file) => ts.sys.readFile(file));
  if (result.error)
    throw new Error(ts.flattenDiagnosticMessageText(result.error.messageText, "\n"));

  return {
    ...ts.parseJsonConfigFileContent(result.config, ts.sys, root).options,
    allowJs: false,
    noEmit: true,
    skipLibCheck: true,
  };
}

function inspectTypescriptFiles() {
  const candidatesBySymbol = new Map();

  for (const sourceFile of program.getSourceFiles()) {
    if (!candidateTypescriptFiles.has(path.resolve(sourceFile.fileName))) continue;
    collectCandidates(sourceFile, (candidate) => {
      const symbol = resolveAliasedSymbol(checker.getSymbolAtLocation(candidate.nameNode));
      if (symbol) candidatesBySymbol.set(symbol, candidate);
    });
  }

  for (const sourceFile of program.getSourceFiles()) {
    if (!inspectedTypescriptFiles.has(path.resolve(sourceFile.fileName))) continue;

    visit(sourceFile, (node) => {
      if (!ts.isIdentifier(node) || isDeclarationName(node) || isImportOrExportBinding(node))
        return;
      const candidate = candidatesBySymbol.get(
        resolveAliasedSymbol(checker.getSymbolAtLocation(node)),
      );
      if (!candidate) return;
      registerReference(candidate, node, sourceFile.fileName);
    });
  }

  return candidatesBySymbol;
}

function inspectVueFile(file, typescriptCandidates, inspectLocalCandidates) {
  const source = fs.readFileSync(file, "utf8");
  const { descriptor, errors } = parseVueSfc(source, { filename: file });
  if (errors.length) return [];

  const blocks = [descriptor.script, descriptor.scriptSetup].filter(Boolean);
  registerVueImportUsages(file, blocks, typescriptCandidates);
  if (!inspectLocalCandidates) return [];

  return blocks.flatMap((block) => {
    const kind =
      block.lang === "tsx" || block.lang === "jsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(file, block.content, ts.ScriptTarget.Latest, true, kind);
    const candidatesByName = new Map();

    collectCandidates(
      sourceFile,
      (candidate) => {
        if (candidate.topLevel) candidatesByName.set(candidate.name, candidate);
      },
      block.loc.start.line - 1,
    );

    visit(sourceFile, (node) => {
      if (!ts.isIdentifier(node) || isDeclarationName(node)) return;
      const candidate = candidatesByName.get(node.text);
      if (candidate) registerReference(candidate, node, file);
    });

    if (block === descriptor.scriptSetup && descriptor.template) {
      registerTemplateReferences(candidatesByName, descriptor.template.ast, file);
    }

    return [...candidatesByName.values()].filter(isFinding).map(toFinding);
  });
}

function registerVueImportUsages(file, blocks, typescriptCandidates) {
  const importedCandidates = new Set();

  for (const block of blocks) {
    const kind =
      block.lang === "tsx" || block.lang === "jsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(file, block.content, ts.ScriptTarget.Latest, true, kind);

    for (const statement of sourceFile.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        !statement.importClause ||
        statement.importClause.isTypeOnly ||
        !ts.isStringLiteral(statement.moduleSpecifier)
      )
        continue;
      const exports = resolveVueModuleExports(file, statement.moduleSpecifier.text);
      if (!exports) continue;

      if (statement.importClause.name)
        registerVueImportedCandidate(
          exports.get("default"),
          typescriptCandidates,
          importedCandidates,
        );
      if (
        !statement.importClause.namedBindings ||
        !ts.isNamedImports(statement.importClause.namedBindings)
      )
        continue;

      for (const specifier of statement.importClause.namedBindings.elements) {
        if (specifier.isTypeOnly) continue;
        registerVueImportedCandidate(
          exports.get((specifier.propertyName ?? specifier.name).text),
          typescriptCandidates,
          importedCandidates,
        );
      }
    }
  }

  for (const candidate of importedCandidates) {
    if (isTestOrStoryFile(file)) candidate.testVueImportUsages += 1;
    else candidate.vueImportUsages += 1;
  }
}

function resolveVueModuleExports(containingFile, moduleName) {
  const cacheKey = `${containingFile}\0${moduleName}`;
  if (vueModuleExportsCache.has(cacheKey)) return vueModuleExportsCache.get(cacheKey);

  const resolvedFile = ts.resolveModuleName(moduleName, containingFile, compilerOptions, ts.sys)
    .resolvedModule?.resolvedFileName;
  const sourceFile = resolvedFile ? program.getSourceFile(resolvedFile) : undefined;
  const moduleSymbol = sourceFile?.symbol;
  const exports = moduleSymbol
    ? new Map(
        checker
          .getExportsOfModule(moduleSymbol)
          .map((symbol) => [symbol.name, resolveAliasedSymbol(symbol)]),
      )
    : undefined;
  vueModuleExportsCache.set(cacheKey, exports);
  return exports;
}

function registerVueImportedCandidate(symbol, typescriptCandidates, importedCandidates) {
  const candidate = symbol && typescriptCandidates.get(symbol);
  if (candidate) importedCandidates.add(candidate);
}

function collectCandidates(sourceFile, addCandidate, lineOffset = 0) {
  visit(sourceFile, (node) => {
    let nameNode;
    let functionNode;
    let declarationNode;
    let topLevel;

    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      nameNode = node.name;
      functionNode = node;
      declarationNode = node;
      topLevel = node.parent === sourceFile;
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
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
      productionCalls: 0,
      testCalls: 0,
      vueImportUsages: 0,
      testVueImportUsages: 0,
      nonCallReferences: 0,
      recursive: false,
      complexity: calculateComplexity(body),
      bodyLines:
        end.line - sourceFile.getLineAndCharacterOfPosition(body.getStart(sourceFile)).line + 1,
      documented: hasDocumentation(sourceFile, declarationNode),
    };
    addCandidate(candidate);
  });
}

function registerReference(candidate, identifier, file) {
  if (isDirectCall(identifier)) {
    registerDirectCall(candidate, file);
    if (contains(candidate.node, identifier)) candidate.recursive = true;
  } else {
    candidate.nonCallReferences += 1;
  }
}

function registerDirectCall(candidate, file) {
  if (isTestOrStoryFile(file)) candidate.testCalls += 1;
  else candidate.productionCalls += 1;
}

function effectiveCalls(candidate) {
  return (
    candidate.productionCalls +
    candidate.vueImportUsages +
    (candidate.testCalls + candidate.testVueImportUsages) * testCallWeight
  );
}

function isFinding(candidate) {
  const calls = effectiveCalls(candidate);
  const savings = (calls - 1) * (candidate.complexity - 1);
  return (
    calls <= maximumCallSites &&
    candidate.nonCallReferences === 0 &&
    !candidate.recursive &&
    !candidate.documented &&
    candidate.bodyLines <= maximumBodyLines &&
    savings < minimumSavings
  );
}

function toFinding(candidate) {
  const calls = effectiveCalls(candidate);
  return {
    ...candidate,
    effectiveCalls: calls,
    savings: (calls - 1) * (candidate.complexity - 1),
  };
}

function formatNumber(value) {
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : String(value);
}

function calculateComplexity(body) {
  let branches = 0;

  const inspect = (node) => {
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
    } else if (
      ts.isBinaryExpression(node) &&
      [
        ts.SyntaxKind.AmpersandAmpersandToken,
        ts.SyntaxKind.BarBarToken,
        ts.SyntaxKind.QuestionQuestionToken,
      ].includes(node.operatorToken.kind)
    ) {
      branches += 1;
    }
    ts.forEachChild(node, inspect);
  };

  inspect(body);
  return branches + 1;
}

function visit(node, callback) {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}

function isDeclarationName(identifier) {
  const parent = identifier.parent;
  return (
    (ts.isFunctionDeclaration(parent) ||
      ts.isFunctionExpression(parent) ||
      ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isClassDeclaration(parent)) &&
    parent.name === identifier
  );
}

function isDirectCall(identifier) {
  return ts.isCallExpression(identifier.parent) && identifier.parent.expression === identifier;
}

function contains(container, node) {
  return node.pos >= container.pos && node.end <= container.end;
}

function resolveAliasedSymbol(symbol) {
  const seen = new Set();
  while (symbol && symbol.flags & ts.SymbolFlags.Alias && !seen.has(symbol)) {
    seen.add(symbol);
    symbol = checker.getAliasedSymbol(symbol);
  }
  return symbol;
}

function isImportOrExportBinding(identifier) {
  const parent = identifier.parent;
  return (
    ts.isImportSpecifier(parent) ||
    ts.isImportClause(parent) ||
    ts.isNamespaceImport(parent) ||
    ts.isImportEqualsDeclaration(parent) ||
    ts.isExportSpecifier(parent) ||
    ts.isExportAssignment(parent)
  );
}

function isTestOrStoryFile(file) {
  const relativeFile = path.relative(root, file).split(path.sep).join("/");
  return (
    relativeFile.startsWith("test/") ||
    relativeFile.startsWith(".storybook/") ||
    /\.(?:test|spec|stories)\.(?:[cm]?[jt]sx?|vue)$/.test(relativeFile)
  );
}

function hasDocumentation(sourceFile, node) {
  return sourceFile.text.slice(node.getFullStart(), node.getStart(sourceFile)).includes("/**");
}

function registerTemplateReferences(candidatesByName, templateAst, file) {
  for (const expression of collectTemplateExpressions(templateAst)) {
    const sourceFile = ts.createSourceFile(
      "template-expression.ts",
      `(${expression})`,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    visit(sourceFile, (node) => {
      if (!ts.isIdentifier(node) || isDeclarationName(node) || isPropertyNameOnly(node)) return;
      const candidate = candidatesByName.get(node.text);
      if (!candidate) return;
      if (isDirectCall(node)) registerDirectCall(candidate, file);
      else candidate.nonCallReferences += 1;
    });
  }
}

function collectTemplateExpressions(templateAst) {
  const expressions = [];
  const seen = new WeakSet();
  const inspect = (value) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (value.type === 4 && value.isStatic === false && typeof value.content === "string") {
      expressions.push(value.content);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === "loc" || key === "codegenNode" || key === "forParseResult") continue;
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
