package com.habittracker

import android.annotation.SuppressLint
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import com.habittracker.data.WidgetDataHelper
import com.habittracker.widget.ExpenseWidgetProvider
import com.habittracker.widget.HabitWidgetProvider

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        setContentView(webView)

        webView.clearCache(true)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            loadWithOverviewMode = true
            useWideViewPort = true
            cacheMode = WebSettings.LOAD_NO_CACHE
        }

        webView.webChromeClient = WebChromeClient()
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                syncNativeWidgetToWebView()
                handleDeepLink(intent)
            }
        }

        // Bridge to refresh Android Home Screen Widgets when habits or expenses change
        webView.addJavascriptInterface(WebAppInterface(this), "AndroidBridge")

        // Load offline bundled app
        webView.loadUrl("file:///android_asset/index.html")
    }

    override fun onResume() {
        super.onResume()
        syncNativeWidgetToWebView()
    }

    private fun syncNativeWidgetToWebView() {
        webView.evaluateJavascript("if (typeof window.syncFromNativeWidget === 'function') { window.syncFromNativeWidget(); }", null)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDeepLink(intent)
    }

    private fun handleDeepLink(intent: Intent?) {
        if (intent?.data?.scheme == "habittrack") {
            when (intent.data?.host) {
                "quick-add-expense" -> {
                    webView.evaluateJavascript("if (window.ui) { window.ui.switchTab('expenses'); window.ui._openModal('modal-expense'); }", null)
                }
                "quick-add-today-only" -> {
                    webView.evaluateJavascript("if (window.ui) { window.ui.switchTab('today'); window.ui._openModal('modal-adhoc'); }", null)
                }
            }
        }
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    class WebAppInterface(private val context: Context) {
        @JavascriptInterface
        fun syncData(habitsJson: String, expensesJson: String, dayType: String?) {
            WidgetDataHelper.saveData(context, habitsJson, expensesJson, dayType ?: "Normal")
            notifyDataChanged()
        }

        @JavascriptInterface
        fun getPendingToggles(): String {
            return WidgetDataHelper.getPendingTogglesJson(context)
        }

        @JavascriptInterface
        fun clearPendingToggles() {
            WidgetDataHelper.clearPendingToggles(context)
        }

        @JavascriptInterface
        fun getPendingExpenses(): String {
            return WidgetDataHelper.getPendingExpensesJson(context)
        }

        @JavascriptInterface
        fun clearPendingExpenses() {
            WidgetDataHelper.clearPendingExpenses(context)
        }

        @JavascriptInterface
        fun getWidgetDayType(): String {
            return WidgetDataHelper.getDayType(context)
        }

        @JavascriptInterface
        fun notifyDataChanged() {
            WidgetDataHelper.refreshHabitWidget(context)
            WidgetDataHelper.refreshExpenseWidget(context)
        }
    }
}
