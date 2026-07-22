const React = require('react');

module.exports = {
	ColorMatrix: ({ children }) => React.createElement(React.Fragment, null, children),
	Invert: ({ children }) => React.createElement(React.Fragment, null, children),
	concatColorMatrices: (...matrices) => matrices[0] || [],
	luminanceToAlpha: () => [],
	threshold: () => [],
};
