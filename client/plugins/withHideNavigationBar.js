const { withMainActivity } = require('@expo/config-plugins');

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
      nextSource = nextSource.replace('import android.os.Bundle', `import android.os.Bundle\n${importLine}`);
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
    scheduleHideSystemBars()`
  );
}

function addMethods(source) {
  if (source.includes('private fun hideSystemBars()')) {
    return source;
  }

  return source.replace(
    '\n  /**\n   * Returns the name of the main component registered from JavaScript.',
    `\n${METHODS}  /**\n   * Returns the name of the main component registered from JavaScript.`
  );
}

module.exports = function withHideNavigationBar(config) {
  return withMainActivity(config, (config) => {
    if (config.modResults.language === 'kt') {
      config.modResults.contents = addMethods(callFromOnCreate(addImports(config.modResults.contents)));
    }

    return config;
  });
};
