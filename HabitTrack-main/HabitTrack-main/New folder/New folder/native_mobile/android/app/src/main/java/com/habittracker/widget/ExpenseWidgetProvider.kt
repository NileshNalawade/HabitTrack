package com.habittracker.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.habittracker.R
import com.habittracker.data.WidgetDataHelper

/**
 * Android Expense Running Total & Quick Add Widget
 * Supports:
 * - Instant 1-tap +₹20, +₹50, +₹100, +₹200, +₹500 buttons directly on widget without opening anything.
 * - + Custom button that opens lightweight floating QuickExpenseActivity (no main app).
 */
class ExpenseWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    companion object {
        fun updateAppWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val views = RemoteViews(context.packageName, R.layout.widget_expense_tracker)
            val todayTotal = WidgetDataHelper.getTodayExpenseTotal(context)

            views.setTextViewText(R.id.widget_expense_total_text, String.format("₹%.2f", todayTotal))

            fun createBroadcastPendingIntent(action: String, requestCode: Int): PendingIntent {
                val intent = Intent(context, WidgetActionReceiver::class.java).apply {
                    this.action = action
                }
                return PendingIntent.getBroadcast(
                    context,
                    requestCode,
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
            }

            views.setOnClickPendingIntent(R.id.btn_widget_quick_20, createBroadcastPendingIntent(WidgetActionReceiver.ACTION_QUICK_ADD_20, 520))
            views.setOnClickPendingIntent(R.id.btn_widget_quick_50, createBroadcastPendingIntent(WidgetActionReceiver.ACTION_QUICK_ADD_50, 550))
            views.setOnClickPendingIntent(R.id.btn_widget_quick_100, createBroadcastPendingIntent(WidgetActionReceiver.ACTION_QUICK_ADD_100, 600))
            views.setOnClickPendingIntent(R.id.btn_widget_quick_200, createBroadcastPendingIntent(WidgetActionReceiver.ACTION_QUICK_ADD_200, 700))
            views.setOnClickPendingIntent(R.id.btn_widget_quick_500, createBroadcastPendingIntent(WidgetActionReceiver.ACTION_QUICK_ADD_500, 800))

            // Floating Quick Expense Dialog (No main app open)
            val quickExpenseIntent = Intent(context, QuickExpenseActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingDialog = PendingIntent.getActivity(
                context,
                503,
                quickExpenseIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.btn_widget_open_dialog, pendingDialog)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
