package com.habittracker.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.widget.Toast
import com.habittracker.data.WidgetDataHelper

/**
 * BroadcastReceiver for handling background interactive widget clicks:
 * - Habits toggle (with state recorded for two-way sync)
 * - Day type cycle (Normal -> Rest Day -> Holiday)
 * - Instant direct expense logging (+₹20, +₹50, +₹100, +₹200, +₹500) directly from widget
 */
class WidgetActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            ACTION_TOGGLE_HABIT -> {
                val logId = intent.getStringExtra(EXTRA_LOG_ID) ?: return
                WidgetDataHelper.toggleHabit(context, logId)
                WidgetDataHelper.refreshHabitWidget(context)
            }
            ACTION_CYCLE_DAY_TYPE -> {
                val nextType = WidgetDataHelper.cycleDayType(context)
                WidgetDataHelper.refreshHabitWidget(context)
                Toast.makeText(context, "Day set to: $nextType", Toast.LENGTH_SHORT).show()
            }
            ACTION_QUICK_ADD_20 -> {
                WidgetDataHelper.addExpense(context, "Quick Spend", 20.0)
                val total = WidgetDataHelper.getTodayExpenseTotal(context)
                Toast.makeText(context, "Added +₹20.00! Today's Spend: ₹${String.format("%.2f", total)}", Toast.LENGTH_SHORT).show()
            }
            ACTION_QUICK_ADD_50 -> {
                WidgetDataHelper.addExpense(context, "Quick Spend", 50.0)
                val total = WidgetDataHelper.getTodayExpenseTotal(context)
                Toast.makeText(context, "Added +₹50.00! Today's Spend: ₹${String.format("%.2f", total)}", Toast.LENGTH_SHORT).show()
            }
            ACTION_QUICK_ADD_100 -> {
                WidgetDataHelper.addExpense(context, "Quick Spend", 100.0)
                val total = WidgetDataHelper.getTodayExpenseTotal(context)
                Toast.makeText(context, "Added +₹100.00! Today's Spend: ₹${String.format("%.2f", total)}", Toast.LENGTH_SHORT).show()
            }
            ACTION_QUICK_ADD_200 -> {
                WidgetDataHelper.addExpense(context, "Quick Spend", 200.0)
                val total = WidgetDataHelper.getTodayExpenseTotal(context)
                Toast.makeText(context, "Added +₹200.00! Today's Spend: ₹${String.format("%.2f", total)}", Toast.LENGTH_SHORT).show()
            }
            ACTION_QUICK_ADD_500 -> {
                WidgetDataHelper.addExpense(context, "Quick Spend", 500.0)
                val total = WidgetDataHelper.getTodayExpenseTotal(context)
                Toast.makeText(context, "Added +₹500.00! Today's Spend: ₹${String.format("%.2f", total)}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    companion object {
        const val ACTION_TOGGLE_HABIT = "com.habittracker.ACTION_TOGGLE_HABIT"
        const val ACTION_CYCLE_DAY_TYPE = "com.habittracker.ACTION_CYCLE_DAY_TYPE"
        const val ACTION_QUICK_ADD_20 = "com.habittracker.ACTION_QUICK_ADD_20"
        const val ACTION_QUICK_ADD_50 = "com.habittracker.ACTION_QUICK_ADD_50"
        const val ACTION_QUICK_ADD_100 = "com.habittracker.ACTION_QUICK_ADD_100"
        const val ACTION_QUICK_ADD_200 = "com.habittracker.ACTION_QUICK_ADD_200"
        const val ACTION_QUICK_ADD_500 = "com.habittracker.ACTION_QUICK_ADD_500"
        const val EXTRA_LOG_ID = "com.habittracker.EXTRA_LOG_ID"
    }
}
