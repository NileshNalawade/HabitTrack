package com.habittracker.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import com.habittracker.MainActivity
import com.habittracker.R
import com.habittracker.data.WidgetDataHelper

/**
 * Android RemoteViews Interactive Habit Tracker Widget
 * Shows ALL habits, Day Type selector, + Today Only button, and 1-tap toggles.
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

            // 1. Progress & Header
            views.setTextViewText(R.id.widget_progress_text, "${todayData.percentage}%")
            views.setProgressBar(R.id.widget_progress_bar, 100, todayData.percentage, false)

            // 2. Day Type Selector (Normal, Rest Day, Holiday)
            val dayType = WidgetDataHelper.getDayType(context)
            val dayLabel = when (dayType) {
                "Rest Day" -> "🏖️ Rest Day"
                "Holiday"  -> "🎉 Holiday"
                else       -> "☀️ Normal"
            }
            views.setTextViewText(R.id.btn_widget_day_type, dayLabel)

            val cycleIntent = Intent(context, WidgetActionReceiver::class.java).apply {
                action = WidgetActionReceiver.ACTION_CYCLE_DAY_TYPE
            }
            val cyclePendingIntent = PendingIntent.getBroadcast(
                context,
                201,
                cycleIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.btn_widget_day_type, cyclePendingIntent)

            // 3. + Today Only shortcut button
            val todayOnlyIntent = Intent(Intent.ACTION_VIEW, Uri.parse("habittrack://quick-add-today-only")).apply {
                setClass(context, MainActivity::class.java)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val todayOnlyPendingIntent = PendingIntent.getActivity(
                context,
                202,
                todayOnlyIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.btn_widget_today_only, todayOnlyPendingIntent)

            // 4. Render Tasks for today or empty state (never blank!)
            views.removeAllViews(R.id.widget_task_container)

            if (todayData.tasks.isEmpty()) {
                val emptyView = RemoteViews(context.packageName, R.layout.widget_empty_state_row)
                views.addView(R.id.widget_task_container, emptyView)
            } else {
                todayData.tasks.forEach { task ->
                    val rowView = RemoteViews(context.packageName, R.layout.widget_task_row_item)
                    rowView.setTextViewText(R.id.widget_item_text, task.name)

                    val checkIcon = if (task.isCompleted) R.drawable.ic_check_circle else R.drawable.ic_circle_outline
                    rowView.setImageViewResource(R.id.widget_item_btn_check, checkIcon)

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
                    // Allow tapping either the checkbox icon or the task text
                    rowView.setOnClickPendingIntent(R.id.widget_item_btn_check, pendingIntent)
                    rowView.setOnClickPendingIntent(R.id.widget_item_text, pendingIntent)

                    views.addView(R.id.widget_task_container, rowView)
                }
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
