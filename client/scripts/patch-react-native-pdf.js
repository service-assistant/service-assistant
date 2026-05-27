const fs = require('fs');
const path = require('path');

const pdfIndexPath = path.join(__dirname, '..', 'node_modules', 'react-native-pdf', 'index.js');
const pdfViewPath = path.join(
	__dirname,
	'..',
	'node_modules',
	'react-native-pdf',
	'android',
	'src',
	'main',
	'java',
	'org',
	'wonday',
	'pdf',
	'PdfView.java',
);

if (!fs.existsSync(pdfIndexPath)) {
	console.warn('react-native-pdf index.js not found; skipping patch.');
	process.exit(0);
}

let source = fs.readFileSync(pdfIndexPath, 'utf8');

if (!source.includes('_getNativeProps = () => ({')) {
	source = source.replace(
		`    _onError = (error) => {\n\n        this.props.onError && this.props.onError(error);\n\n    };\n\n`,
		`    _onError = (error) => {\n\n        this.props.onError && this.props.onError(error);\n\n    };\n\n    _getNativeProps = () => ({\n        page: this.props.page,\n        scale: this.props.scale,\n        minScale: this.props.minScale,\n        maxScale: this.props.maxScale,\n        horizontal: this.props.horizontal,\n        spacing: this.props.spacing,\n        password: this.props.password,\n        enableAntialiasing: this.props.enableAntialiasing,\n        enableAnnotationRendering: this.props.enableAnnotationRendering,\n        showsHorizontalScrollIndicator: this.props.showsHorizontalScrollIndicator,\n        showsVerticalScrollIndicator: this.props.showsVerticalScrollIndicator,\n        scrollEnabled: this.props.scrollEnabled,\n        enablePaging: this.props.enablePaging,\n        enableRTL: this.props.enableRTL,\n        fitPolicy: this.props.fitPolicy,\n        singlePage: this.props.singlePage,\n    });\n\n`,
	);
}

source = source.replace(
	`    render() {\n        if (Platform.OS === "android" || Platform.OS === "ios" || Platform.OS === "windows") {`,
	`    render() {\n        const nativeProps = this._getNativeProps();\n\n        if (Platform.OS === "android" || Platform.OS === "ios" || Platform.OS === "windows") {`,
);

source = source.replaceAll('{...this.props}', '{...nativeProps}');

fs.writeFileSync(pdfIndexPath, source);

if (fs.existsSync(pdfViewPath)) {
	let pdfViewSource = fs.readFileSync(pdfViewPath, 'utf8');

	if (!pdfViewSource.includes('import android.graphics.ColorMatrix;')) {
		pdfViewSource = pdfViewSource.replace(
			'import android.graphics.Canvas;\n',
			'import android.graphics.Canvas;\nimport android.graphics.Color;\nimport android.graphics.ColorMatrix;\nimport android.graphics.ColorMatrixColorFilter;\nimport android.graphics.Paint;\n',
		);
	}

	pdfViewSource = pdfViewSource.replace('        applyDarkPdfFilter();\n', '');

	pdfViewSource = pdfViewSource.replace(
		/\n    private void applyDarkPdfFilter\(\) \{\n        Paint paint = new Paint\(\);\n        ColorMatrix matrix = new ColorMatrix\(new float\[\] \{\n            -1, 0, 0, 0, 255,\n            0, -1, 0, 0, 255,\n            0, 0, -1, 0, 255,\n            0, 0, 0, 1, 0\n        \}\);\n        paint\.setColorFilter\(new ColorMatrixColorFilter\(matrix\)\);\n        setBackgroundColor\(Color\.BLACK\);\n        setLayerType\(View\.LAYER_TYPE_HARDWARE, paint\);\n    \}\n/,
		'\n',
	);

	if (!pdfViewSource.includes('private final Paint darkPdfPaint = new Paint();')) {
		pdfViewSource = pdfViewSource.replace(
			'    private boolean scrollEnabled = true;\n',
			'    private boolean scrollEnabled = true;\n    private final Paint darkPdfPaint = new Paint();\n',
		);
	}

	if (!pdfViewSource.includes('private void configureDarkPdfPaint()')) {
		pdfViewSource = pdfViewSource.replace(
			'    public PdfView(Context context, AttributeSet set){\n        super(context, set);\n    }\n',
			`    public PdfView(Context context, AttributeSet set){\n        super(context, set);\n        configureDarkPdfPaint();\n        setBackgroundColor(Color.BLACK);\n    }\n\n    private void configureDarkPdfPaint() {\n        ColorMatrix matrix = new ColorMatrix(new float[] {\n            -1, 0, 0, 0, 255,\n            0, -1, 0, 0, 255,\n            0, 0, -1, 0, 255,\n            0, 0, 0, 1, 0\n        });\n        darkPdfPaint.setColorFilter(new ColorMatrixColorFilter(matrix));\n    }\n\n    @Override\n    public void draw(Canvas canvas) {\n        int saveCount = canvas.saveLayer(0, 0, getWidth(), getHeight(), darkPdfPaint);\n        super.draw(canvas);\n        canvas.restoreToCount(saveCount);\n    }\n`,
		);
	}

	fs.writeFileSync(pdfViewPath, pdfViewSource);
}

console.log('react-native-pdf patched for Fabric native props and dark PDF rendering.');
