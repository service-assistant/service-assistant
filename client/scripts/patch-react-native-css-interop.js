const fs = require('fs');
const path = require('path');

const renderComponentPath = path.join(
	__dirname,
	'..',
	'node_modules',
	'react-native-css-interop',
	'dist',
	'runtime',
	'native',
	'render-component.js',
);

if (!fs.existsSync(renderComponentPath)) {
	console.warn('react-native-css-interop render-component.js not found; skipping patch.');
	process.exit(0);
}

let source = fs.readFileSync(renderComponentPath, 'utf8');

if (source.includes('Props were omitted to avoid triggering navigation getters')) {
	console.log('react-native-css-interop already patched for lightweight warnings.');
	process.exit(0);
}

const originalWarningFunction = `function printUpgradeWarning(warning, originalProps) {
    console.log(\`CssInterop upgrade warning.\\n\\n\${warning}.\\n\\nThis warning was caused by a component with the props:\\n\${stringify(originalProps)}\\n\\nIf adding or removing sibling components caused this warning you should add a unique "key" prop to your components. https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key\\n\`);
}`;

const getterSafeWarningFunction = `function printUpgradeWarning(warning, originalProps) {
    console.log(\`CssInterop upgrade warning.\\n\\n\${warning}.\\n\\nThis warning was caused by a component with the props:\\n\${stringify(originalProps)}\\n\\nIf adding or removing sibling components caused this warning you should add a unique "key" prop to your components. https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key\\n\`);
}`;

const lightweightWarningFunction = `function printUpgradeWarning(warning) {
    console.log(\`CssInterop upgrade warning.\\n\\n\${warning}.\\n\\nProps were omitted to avoid triggering navigation getters or serializing large React trees.\\n\`);
}`;

if (source.includes(originalWarningFunction)) {
	source = source.replace(originalWarningFunction, lightweightWarningFunction);
} else if (source.includes(getterSafeWarningFunction)) {
	source = source.replace(getterSafeWarningFunction, lightweightWarningFunction);
} else {
	const warningFunctionPattern =
		/function printUpgradeWarning\(warning(?:, originalProps)?\) \{\n    console\.log\(`CssInterop upgrade warning\.[\s\S]*?\n\}\nfunction stringify/;

	if (!warningFunctionPattern.test(source)) {
		console.warn('react-native-css-interop warning function shape changed; skipping patch.');
		process.exit(0);
	}

	source = source.replace(
		warningFunctionPattern,
		`${lightweightWarningFunction}\nfunction stringify`,
	);
}

fs.writeFileSync(renderComponentPath, source);

console.log('react-native-css-interop patched for lightweight warnings.');
