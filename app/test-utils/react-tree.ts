import React from 'react';

export type ElementNode = React.ReactElement & {
	props: Record<string, any>;
};

export const isElement = (value: unknown): value is ElementNode => React.isValidElement(value);

const renderElement = (node: ElementNode) => {
	const elementType = node.type as any;
	if (elementType === React.Fragment) {
		return React.Children.toArray(node.props.children);
	}
	if (typeof elementType === 'function') {
		return elementType(node.props);
	}
	return node;
};

export const collectElements = (node: unknown): ElementNode[] => {
	if (node === null || node === undefined || typeof node === 'boolean') return [];
	if (Array.isArray(node)) return node.flatMap(collectElements);
	if (!isElement(node)) return [];

	const rendered = renderElement(node);
	if (rendered !== node) return collectElements(rendered);

	return [
		node,
		...React.Children.toArray(node.props.children).flatMap((child) => collectElements(child)),
	];
};

export const getTextContent = (node: unknown): string => {
	if (node === null || node === undefined || typeof node === 'boolean') return '';
	if (typeof node === 'string' || typeof node === 'number') return String(node);
	if (Array.isArray(node)) return node.map(getTextContent).join('');
	if (!isElement(node)) return '';

	const rendered = renderElement(node);
	if (rendered !== node) return getTextContent(rendered);

	return React.Children.toArray(node.props.children).map(getTextContent).join('');
};

export const findByType = (node: unknown, type: string) =>
	collectElements(node).filter((element) => element.type === type);

export const findByText = (node: unknown, text: string) =>
	collectElements(node).find((element) => getTextContent(element).includes(text));
