const fs = require('fs');
const path = require('path');

const eventSourcePath = path.join(
	__dirname,
	'..',
	'node_modules',
	'react-native-sse',
	'src',
	'EventSource.js',
);

if (!fs.existsSync(eventSourcePath)) {
	console.warn('react-native-sse EventSource.js not found; skipping patch.');
	process.exit(0);
}

let source = fs.readFileSync(eventSourcePath, 'utf8');

const replacements = [
	['line = parts[i].trim();', 'line = parts[i].trimEnd();'],
	["line.replace(/event:?\\s*/, '')", "line.replace(/^event:? ?/, '')"],
	["line.replace(/retry:?\\s*/, '')", "line.replace(/^retry:? ?/, '')"],
	["line.replace(/data:?\\s*/, '')", "line.replace(/^data:? ?/, '')"],
	["line.replace(/id:?\\s*/, '')", "line.replace(/^id:? ?/, '')"],
];

let changed = false;

for (const [before, after] of replacements) {
	if (source.includes(after)) {
		continue;
	}

	if (!source.includes(before)) {
		console.warn('react-native-sse parser shape changed; skipping patch.');
		process.exit(0);
	}

	source = source.replace(before, after);
	changed = true;
}

if (!changed) {
	console.log('react-native-sse already patched to preserve SSE data spaces.');
	process.exit(0);
}

fs.writeFileSync(eventSourcePath, source);

console.log('react-native-sse patched to preserve SSE data spaces.');
