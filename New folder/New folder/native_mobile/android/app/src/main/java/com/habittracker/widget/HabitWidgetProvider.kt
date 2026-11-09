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
 * Android RemoteViews Interactive Habit Tracker Widget
 * Updates in real-time, displays progress bar, and triggers 1-tap completion via BroadcastReceiver.
 */
class HabitWidgetProvider : AppWidgetProvider() {

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
            val views = RemoteViews(context.packageName, R.layout.widget_habit_tracker)
            val todayData = WidgetDataHelper.getTodayHabitSummary(context)

            // Update Header & Progress
            views.setTextViewText(R.id.widget_progress_text, "${todayData.percentage}%")
            views.setProgressBar(R.id.widget_progress_bar, 100, todayData.percentage, false)

            // Bind list of items
            views.removeAllViews(R.id.widget_task_container)

            todayData.tasks.take(4).forEach { task ->
                val rowView = RemoteViews(context.packageName, R.layout.widget_task_row_item)
                rowView.setTextViewText(R.id.widget_item_text, task.name)

                val checkIcon = if (task.isCompleted) R.drawable.ic_check_circle else R.drawable.ic_circle_outline
                rowView.setImageViewResource(R.id.widget_item_btn_check, checkIcon)

                // 1-Tap PendingIntent that fires directly into WidgetActionReceiver without opening MainActivity
                val intent = Intent(context, WidgetActionReceiver::class.java).apply {
                    action = WidgetActionReceiver.ACTION_TOGGLE_HABIT
                    putExtra(WidgetActionReceiver.EXTRA_LOG_ID, task.logId)
                }
                val pendingIntent = PendingIntent.getBroadcast(
                    context,
                    task.logId.hashCode(),
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                rowView.setOnClickPendingIntent(R.id.widget_item_btn_check, pendingIntent)

                views.addView(R.id.widget_task_container, rowView)
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}

