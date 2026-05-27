const { AndroidConfig, withAndroidStyles, withMainActivity } = require('@expo/config-plugins');

const IMPORTS = `import android.os.Handler
import android.os.Build
import android.os.Looper
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController`;

const METHODS = `  private val hideSystemBarsHandler = Handler(Looper.getMainLooper())
  private val hideSystemBarsRunnable = Runnable { hideSystemBars() }

  override fun onResume() {
    super.onResume()
    scheduleHideSystemBars()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)

    if (hasFocus) {
      scheduleHideSystemBars()
    }
  }

  private fun scheduleHideSystemBars() {
    hideSystemBarsHandler.removeCallbacks(hideSystemBarsRunnable)
    hideSystemBars()
    hideSystemBarsHandler.postDelayed(hideSystemBarsRunnable, 300)
    hideSystemBarsHandler.postDelayed(hideSystemBarsRunnable, 1000)
  }

  private fun hideSystemBars() {
    window.decorView.post {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        window.setDecorFitsSystemWindows(false)
        window.insetsController?.apply {
          systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
          hide(WindowInsets.Type.systemBars())
        }
      } else {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility =
          View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
            View.SYSTEM_UI_FLAG_FULLSCREEN or
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
      }
    }
  }

`;

function addImports(source) {
	let nextSource = source;

	for (const importLine of IMPORTS.split('\n')) {
		if (!nextSource.includes(importLine)) {
			nextSource = nextSource.replace(
				'import android.os.Bundle',
				`import android.os.Bundle\n${importLine}`,
			);
		}
	}

	return nextSource;
}

function callFromOnCreate(source) {
	if (source.includes('window.decorView.setOnSystemUiVisibilityChangeListener')) {
		return source;
	}

	return source.replace(
		'super.onCreate(null)',
		`super.onCreate(null)
    window.decorView.setOnSystemUiVisibilityChangeListener {
      scheduleHideSystemBars()
    }
    scheduleHideSystemBars()`,
	);
}

function addMethods(source) {
	if (source.includes('private fun hideSystemBars()')) {
		return source;
	}

	return source.replace(
		'\n  /**\n   * Returns the name of the main component registered from JavaScript.',
		`\n${METHODS}  /**\n   * Returns the name of the main component registered from JavaScript.`,
	);
}

function setAppThemeStyleItem(styles, name, value) {
	return AndroidConfig.Styles.assignStylesValue(styles, {
		add: true,
		parent: AndroidConfig.Styles.getAppThemeGroup(),
		name,
		value,
	});
}

function withSystemBarStyles(config) {
	return withAndroidStyles(config, (config) => {
		let styles = config.modResults;

		styles = setAppThemeStyleItem(styles, 'android:enforceNavigationBarContrast', 'false');
		styles = setAppThemeStyleItem(
			styles,
			'android:navigationBarColor',
			'@android:color/transparent',
		);
		styles = setAppThemeStyleItem(
			styles,
			'android:windowLayoutInDisplayCutoutMode',
			'shortEdges',
		);

		config.modResults = styles;
		return config;
	});
}

module.exports = function withHideNavigationBar(config) {
	config = withMainActivity(config, (config) => {
		if (config.modResults.language === 'kt') {
			config.modResults.contents = addMethods(
				callFromOnCreate(addImports(config.modResults.contents)),
			);
		}

		return config;
	});

	return withSystemBarStyles(config);
};
