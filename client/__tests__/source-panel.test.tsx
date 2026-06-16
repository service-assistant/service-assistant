import React from 'react';

import SourcePanel from '../components/SourcePanel';
import { collectElements, findByType, getTextContent } from '../test-utils/react-tree';

jest.mock('react-native', () => {
	const React = require('react');
	const createHost = (name: string) =>
		function HostComponent({ children, ...props }: Record<string, unknown>) {
			return React.createElement(name, props, children);
		};

	return {
		Text: createHost('Text'),
		TouchableOpacity: createHost('TouchableOpacity'),
		View: createHost('View'),
	};
});

jest.mock('@expo/vector-icons', () => {
	const React = require('react');
	const Icon = ({ children, ...props }: Record<string, unknown>) =>
		React.createElement('Icon', props, children);

	return {
		Feather: Icon,
	};
});

jest.mock('../components/PdfViewer', () => {
	const React = require('react');
	return function MockPdfViewer({ children, ...props }: Record<string, unknown>) {
		return React.createElement('PdfViewer', props, children);
	};
});

jest.mock('../components/AvailableFilesList', () => {
	const React = require('react');
	return function MockAvailableFilesList({ children, ...props }: Record<string, unknown>) {
		return React.createElement('AvailableFilesList', props, children);
	};
});

describe('SourcePanel', () => {
	const files = [
		{
			id: 1,
			name: 'Manual.pdf',
			icon: 'file-pdf-box',
			color: '#EF4444',
			remoteUrl: 'https://api.example.test/manual.pdf',
		},
	];

	const baseProps = {
		showSourcePanel: true,
		sourcePanelPdf: null,
		isAvailableFilesLoading: false,
		availableFiles: files,
		isFileDownloading: false,
		downloadingFileId: null,
		downloadedFileIds: new Set<number>(),
		onOpenFile: jest.fn(),
		onDeleteDownloadedFile: jest.fn(),
		onPdfError: jest.fn(),
		onClose: jest.fn(),
	};

	test('renders nothing when hidden', () => {
		const tree = <SourcePanel {...baseProps} showSourcePanel={false} />;

		expect(collectElements(tree)).toHaveLength(0);
	});

	test('renders files list when no PDF is selected', () => {
		const tree = <SourcePanel {...baseProps} />;
		const list = findByType(tree, 'AvailableFilesList')[0];

		expect(list.props.files).toBe(files);
		expect(list.props.variant).toBe('grid');
		expect(list.props.onOpenFile).toBe(baseProps.onOpenFile);
		expect(list.props.onDeleteDownloadedFile).toBe(baseProps.onDeleteDownloadedFile);
		expect(findByType(tree, 'PdfViewer')).toHaveLength(0);
	});

	test('renders PDF viewer and passes PDF errors through', () => {
		const pdf = {
			name: 'Manual.pdf',
			source: { uri: 'file:///manual.pdf' },
			page: 4,
		};
		const tree = <SourcePanel {...baseProps} sourcePanelPdf={pdf} />;
		const viewer = findByType(tree, 'PdfViewer')[0];

		viewer.props.onError(new Error('render failed'));

		expect(viewer.props.source).toBe(pdf.source);
		expect(viewer.props.page).toBe(4);
		expect(viewer.props.preserveTop).toBe(true);
		expect(baseProps.onPdfError).toHaveBeenCalledWith(expect.any(Error));
		expect(getTextContent(tree)).toContain('Manual.pdf');
	});

	test('close overlay and close button call onClose', () => {
		const onClose = jest.fn();
		const tree = <SourcePanel {...baseProps} onClose={onClose} />;
		const buttons = findByType(tree, 'TouchableOpacity');

		buttons[0].props.onPress();
		buttons[1].props.onPress();

		expect(onClose).toHaveBeenCalledTimes(2);
	});

	test('renders as full screen without the side overlay', () => {
		const tree = <SourcePanel {...baseProps} fullScreen />;
		const buttons = findByType(tree, 'TouchableOpacity');
		const panel = findByType(tree, 'View').find((view) => view.props.style?.width === '100%');
		const list = findByType(tree, 'AvailableFilesList')[0];

		expect(panel).toBeTruthy();
		expect(buttons).toHaveLength(1);
		expect(list.props.gridColumns).toBe(2);
	});
});
