package com.habittracker.widget

import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import com.habittracker.data.AppDatabase
import com.habittracker.data.ExcelSyncBridge

/**
 * BroadcastReceiver for handling interactive widget clicks in background
 */
class WidgetActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == ACTION_TOGGLE_HABIT) {
            val logId = intent.getStringExtra(EXTRA_LOG_ID) ?: return

            // 1. Direct SQLite database update
            val db = AppDatabase.getInstance(context)
            db.dailyLogsDao().toggleStatus(logId)

            // 2. Automatic background write to local Habit_Expense_Tracker.xlsx
            ExcelSyncBridge.syncToLocalStorage(context)

            // 3. Notify widget manager to re-render
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val componentName = ComponentName(context, HabitWidgetProvider::class.java)
            val ids = appWidgetManager.getAppWidgetIds(componentName)

            for (id in ids) {
                HabitWidgetProvider.updateAppWidget(context, appWidgetManager, id)
            }
        }
    }

    companion object {
        const val ACTION_TOGGLE_HABIT = "com.habittracker.ACTION_TOGGLE_HABIT"
        const val EXTRA_LOG_ID = "com.habittracker.EXTRA_LOG_ID"
    }
}

