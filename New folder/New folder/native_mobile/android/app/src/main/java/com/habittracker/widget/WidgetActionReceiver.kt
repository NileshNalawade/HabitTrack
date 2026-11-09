package com.habittracker.widget

import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import com.habittracker.data.WidgetDataHelper

/**
 * BroadcastReceiver for handling interactive widget clicks (habits toggle + day type cycle)
 */
class WidgetActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            ACTION_TOGGLE_HABIT -> {
                val logId = intent.getStringExtra(EXTRA_LOG_ID) ?: return
                WidgetDataHelper.toggleHabit(context, logId)
                refreshAllWidgets(context)
            }
            ACTION_CYCLE_DAY_TYPE -> {
                WidgetDataHelper.cycleDayType(context)
                refreshAllWidgets(context)
            }
        }
    }

    private fun refreshAllWidgets(context: Context) {
        val appWidgetManager = AppWidgetManager.getInstance(context)
        val habitComponentName = ComponentName(context, HabitWidgetProvider::class.java)
        val habitIds = appWidgetManager.getAppWidgetIds(habitComponentName)
        for (id in habitIds) {
            HabitWidgetProvider.updateAppWidget(context, appWidgetManager, id)
        }
    }

    companion object {
        const val ACTION_TOGGLE_HABIT = "com.habittracker.ACTION_TOGGLE_HABIT"
        const val ACTION_CYCLE_DAY_TYPE = "com.habittracker.ACTION_CYCLE_DAY_TYPE"
        const val EXTRA_LOG_ID = "com.habittracker.EXTRA_LOG_ID"
    }
}
