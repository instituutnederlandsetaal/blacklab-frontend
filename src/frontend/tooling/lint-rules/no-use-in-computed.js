/**
 * Custom linter rule to catch cases of use*() functions inside computeds.
 * This may seem harmless, but often the computed is evaluated outside of the component lifecycle,
 * and injections or other reactive context that depends on having an active component/app will fail and blow up the application.
 * Because this only happens in specific circumstances, it is easy to miss and hard to debug. Therefore, we enforce this rule to catch the most common cases.
 *
 * See:
 * https://github.com/orgs/vuejs/discussions/9974
 * https://oxc.rs/docs/guide/usage/linter/js-plugins.html
 *
 */

const USE_COMPOSABLE_PATTERN = /^use[A-Z]/;

const unwrapExpression = node => {
	while (
		node &&
		(node.type === 'ChainExpression' ||
			node.type === 'ParenthesizedExpression' ||
			node.type === 'TSAsExpression' ||
			node.type === 'TSSatisfiesExpression' ||
			node.type === 'TSNonNullExpression' ||
			node.type === 'TSTypeAssertion' ||
			node.type === 'TSInstantiationExpression')
	) {
		node = node.expression;
	}

	return node;
};

const getIdentifierName = node => {
	const unwrapped = unwrapExpression(node);
	return unwrapped?.type === 'Identifier' ? unwrapped.name : null;
};

const getPropertyName = node => {
	if (node?.type !== 'Property' || node.computed) return null;

	const key = unwrapExpression(node.key);
	if (key?.type === 'Identifier' || key?.type === 'StringLiteral') return key.name ?? key.value;
	return null;
};

const isComputedCall = node => node?.type === 'CallExpression' && getIdentifierName(node.callee) === 'computed';

const isComputedGetterArgument = node => {
	const parent = node.parent;
	return isComputedCall(parent) && unwrapExpression(parent.arguments[0]) === node;
};

const isComputedOptionObject = node => node?.type === 'ObjectExpression' && getPropertyName(node.parent) === 'computed' && unwrapExpression(node.parent.value) === node;

const isComputedGetterProperty = node => {
	const objectExpression = node?.parent;
	const computedCall = objectExpression?.parent;

	return getPropertyName(node) === 'get' && objectExpression?.type === 'ObjectExpression' && isComputedCall(computedCall) && unwrapExpression(computedCall.arguments[0]) === objectExpression;
};

const isOptionsComputedEntry = node => node?.type === 'Property' && isComputedOptionObject(node.parent);

const isOptionsComputedGetterProperty = node => {
	const parentProperty = node?.parent?.parent;
	return getPropertyName(node) === 'get' && node.parent?.type === 'ObjectExpression' && isOptionsComputedEntry(parentProperty) && unwrapExpression(parentProperty.value) === node.parent;
};

const isInsideComputedGetter = node => {
	for (let current = node.parent; current; current = current.parent) {
		if ((current.type === 'ArrowFunctionExpression' || current.type === 'FunctionExpression') && isComputedGetterArgument(current)) return true;
		if (current.type === 'Property' && (isComputedGetterProperty(current) || isOptionsComputedEntry(current) || isOptionsComputedGetterProperty(current))) return true;
	}

	return false;
};

const noUseInComputed = {
	meta: {
		type: 'problem',
		docs: {
			description: 'Disallow use* composables inside computed properties',
		},
		messages: {
			noUseInComputed: 'Do not call {{name}}() inside a computed property. Call it outside the computed property and read the returned value inside instead.',
		},
	},
	create(context) {
		return {
			CallExpression(node) {
				const name = getIdentifierName(node.callee);
				if (!name || !USE_COMPOSABLE_PATTERN.test(name) || !isInsideComputedGetter(node)) return;

				context.report({
					node,
					messageId: 'noUseInComputed',
					data: { name },
				});
			},
		};
	},
};

export default {
	meta: {
		name: 'blacklab',
	},
	rules: {
		'no-use-in-computed': noUseInComputed,
	},
};
