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
 * - Instant 1-tap +₹50 and +₹100 buttons right on widget without opening anything.
 * - + Log / + Custom button that opens lightweight floating QuickExpenseActivity (no main app).
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

            // 1. Direct 1-tap +₹50 button (executes silently in background)
            val intent50 = Intent(context, WidgetActionReceiver::class.java).apply {
                action = WidgetActionReceiver.ACTION_QUICK_ADD_50
            }
            val pending50 = PendingIntent.getBroadcast(
                context,
                501,
                intent50,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.btn_widget_quick_50, pending50)

            // 2. Direct 1-tap +₹100 button (executes silently in background)
            val intent100 = Intent(context, WidgetActionReceiver::class.java).apply {
                action = WidgetActionReceiver.ACTION_QUICK_ADD_100
            }
            val pending100 = PendingIntent.getBroadcast(
                context,
                502,
                intent100,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.btn_widget_quick_100, pending100)

            // 3. Floating Quick Expense Dialog (No main app open)
            val quickExpenseIntent = Intent(context, QuickExpenseActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingDialog = PendingIntent.getActivity(
                context,
                503,
                quickExpenseIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.btn_widget_quick_add_expense, pendingDialog)
            views.setOnClickPendingIntent(R.id.btn_widget_open_dialog, pendingDialog)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
