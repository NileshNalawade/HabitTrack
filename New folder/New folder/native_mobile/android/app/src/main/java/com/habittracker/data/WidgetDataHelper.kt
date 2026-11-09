package com.habittracker.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class HabitItem(val logId: String, val name: String, val isCompleted: Boolean)
data class HabitSummary(val percentage: Int, val tasks: List<HabitItem>)

object WidgetDataHelper {

    private const val PREFS_NAME = "HabitTrackWidgetPrefs"
    private const val KEY_HABITS = "cached_habits"
    private const val KEY_EXPENSES = "cached_expenses"

    fun getTodayHabitSummary(context: Context): HabitSummary {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val habitsJson = prefs.getString(KEY_HABITS, null)

        val taskList = mutableListOf<HabitItem>()
        if (habitsJson != null) {
            try {
                val array = JSONArray(habitsJson)
                for (i in 0 until array.length()) {
                    val obj = array.getJSONObject(i)
                    taskList.add(
                        HabitItem(
                            logId = obj.optString("logId", "LOG_$i"),
                            name = obj.optString("taskName", "Habit"),
                            isCompleted = obj.optString("status") == "Completed"
                        )
                    )
                }
            } catch (e: Exception) {
                // Fallback default habits if parse error
            }
        }

        if (taskList.isEmpty()) {
            taskList.add(HabitItem("L1", "Wake up at 6:00 AM", true))
            taskList.add(HabitItem("L2", "Gym Strength Training", false))
            taskList.add(HabitItem("L3", "Cardio & 10,000 Steps", false))
            taskList.add(HabitItem("L4", "Clean Diet & Meal Prep", false))
        }

        val completedCount = taskList.count { it.isCompleted }
        val percentage = if (taskList.isNotEmpty()) (completedCount * 100) / taskList.size else 0

        return HabitSummary(percentage, taskList)
    }

    fun toggleHabit(context: Context, logId: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val habitsJson = prefs.getString(KEY_HABITS, null) ?: return

        try {
            val array = JSONArray(habitsJson)
            for (i in 0 until array.length()) {
                val obj = array.getJSONObject(i)
                if (obj.optString("logId") == logId) {
                    val current = obj.optString("status")
                    val newStatus = if (current == "Completed") "Pending" else "Completed"
                    obj.put("status", newStatus)
                    break
                }
            }
            prefs.edit().putString(KEY_HABITS, array.toString()).apply()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun saveData(context: Context, habitsJson: String, expensesJson: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(KEY_HABITS, habitsJson)
            .putString(KEY_EXPENSES, expensesJson)
            .apply()
    }

    fun getTodayExpenseTotal(context: Context): Double {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val expensesJson = prefs.getString(KEY_EXPENSES, null) ?: return 8.50

        var total = 0.0
        val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())

        try {
            val array = JSONArray(expensesJson)
            for (i in 0 until array.length()) {
                val obj = array.getJSONObject(i)
                if (obj.optString("date") == today) {
                    total += obj.optDouble("amount", 0.0)
                }
            }
        } catch (e: Exception) {
            total = 8.50
        }
        return total
    }
}

