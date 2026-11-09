package com.habittracker.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import com.habittracker.R
import com.habittracker.data.WidgetDataHelper

/**
 * Android Expense Running Total & Quick Add Widget
 */
class ExpenseWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            val views = RemoteViews(context.packageName, R.layout.widget_expense_tracker)
            val todayTotal = WidgetDataHelper.getTodayExpenseTotal(context)

            views.setTextViewText(R.id.widget_expense_total_text, String.format("₹%.2f", todayTotal))

            // Deep link pending intent to launch instant quick-log sheet
            val quickAddIntent = Intent(Intent.ACTION_VIEW, Uri.parse("habittrack://quick-add-expense")).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingIntent = PendingIntent.getActivity(
                context,
                0,
                quickAddIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.btn_widget_quick_add_expense, pendingIntent)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
