package com.habittracker.data

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import com.habittracker.widget.ExpenseWidgetProvider
import com.habittracker.widget.HabitWidgetProvider
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class HabitItem(
    val logId: String,
    val taskId: String = "",
    val name: String,
    val isCompleted: Boolean,
    val isAdhoc: Boolean = false
)

data class HabitSummary(
    val percentage: Int,
    val tasks: List<HabitItem>
)

object WidgetDataHelper {

    private const val PREFS_NAME = "HabitTrackWidgetPrefs"
    private const val KEY_HABITS = "cached_habits"
    private const val KEY_EXPENSES = "cached_expenses"
    private const val KEY_DAY_TYPE = "cached_day_type"
    private const val KEY_DATE = "cached_date"
    private const val KEY_PENDING_TOGGLES = "pending_toggles"
    private const val KEY_PENDING_EXPENSES = "pending_expenses"

    fun getTodayDateStr(): String {
        return SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
    }

    /**
     * Retrieves today's habits. Automatically checks if the date rolled over to a new day:
     * - Discards yesterday's "Today Only" (adhoc) tasks so they never leak into the next day.
     * - Resets recurring daily habits to "Pending".
     */
    fun getTodayHabitSummary(context: Context): HabitSummary {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val today = getTodayDateStr()
        val cachedDate = prefs.getString(KEY_DATE, "") ?: ""
        val habitsJson = prefs.getString(KEY_HABITS, null)

        val taskList = mutableListOf<HabitItem>()

        if (habitsJson != null) {
            try {
                val array = JSONArray(habitsJson)
                val isNewDay = cachedDate.isNotEmpty() && cachedDate != today

                val updatedArray = JSONArray()

                for (i in 0 until array.length()) {
                    val obj = array.getJSONObject(i)
                    val isAdhoc = obj.optBoolean("isAdhoc", false)

                    // On a new day, discard any "Today Only" (adhoc) tasks from yesterday
                    if (isNewDay && isAdhoc) {
                        continue
                    }

                    val logId = obj.optString("logId", "LOG_$i")
                    val taskId = obj.optString("taskId", "")
                    val name = obj.optString("taskName", "Habit")

                    // On a new day, reset recurring habits to Pending
                    val isCompleted = if (isNewDay) {
                        obj.put("status", "Pending")
                        false
                    } else {
                        obj.optString("status") == "Completed"
                    }

                    taskList.add(
                        HabitItem(
                            logId = logId,
                            taskId = taskId,
                            name = name,
                            isCompleted = isCompleted,
                            isAdhoc = isAdhoc
                        )
                    )
                    updatedArray.put(obj)
                }

                if (isNewDay) {
                    prefs.edit()
                        .putString(KEY_HABITS, updatedArray.toString())
                        .putString(KEY_DATE, today)
                        .remove(KEY_PENDING_TOGGLES) // Reset old day pending widget clicks
                        .apply()
                } else if (cachedDate.isEmpty()) {
                    prefs.edit().putString(KEY_DATE, today).apply()
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        val completedCount = taskList.count { it.isCompleted }
        val percentage = if (taskList.isNotEmpty()) (completedCount * 100) / taskList.size else 0

        return HabitSummary(percentage, taskList)
    }

    /**
     * Saves habits, expenses, and dayType from the main web application.
     * Safely preserves any pending widget toggles that have not yet synced into the web app,
     * so they are never accidentally wiped out!
     */
    fun saveData(context: Context, habitsJson: String, expensesJson: String, dayType: String = "Normal") {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val today = getTodayDateStr()

        // Merge any un-ingested pending toggles from the widget into the incoming habits JSON
        val pendingStr = prefs.getString(KEY_PENDING_TOGGLES, "{}")
        val mergedHabitsJson = if (!pendingStr.isNullOrBlank() && pendingStr != "{}") {
            try {
                val pendingObj = JSONObject(pendingStr)
                val habitsArray = JSONArray(habitsJson)
                for (i in 0 until habitsArray.length()) {
                    val h = habitsArray.getJSONObject(i)
                    val logId = h.optString("logId", "")
                    val taskId = h.optString("taskId", "")
                    val taskName = h.optString("taskName", "")

                    var pendingStatus: String? = null
                    if (logId.isNotEmpty() && pendingObj.has(logId)) {
                        val v = pendingObj.get(logId)
                        pendingStatus = if (v is JSONObject) v.optString("status") else v.toString()
                    } else if (taskId.isNotEmpty() && pendingObj.has(taskId)) {
                        val v = pendingObj.get(taskId)
                        pendingStatus = if (v is JSONObject) v.optString("status") else v.toString()
                    } else if (taskName.isNotEmpty() && pendingObj.has(taskName)) {
                        val v = pendingObj.get(taskName)
                        pendingStatus = if (v is JSONObject) v.optString("status") else v.toString()
                    }

                    if (pendingStatus != null) {
                        h.put("status", pendingStatus)
                    }
                }
                habitsArray.toString()
            } catch (e: Exception) {
                habitsJson
            }
        } else {
            habitsJson
        }

        prefs.edit()
            .putString(KEY_HABITS, mergedHabitsJson)
            .putString(KEY_EXPENSES, expensesJson)
            .putString(KEY_DAY_TYPE, dayType)
            .putString(KEY_DATE, today)
            .apply()
    }

    fun getDayType(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(KEY_DAY_TYPE, "Normal") ?: "Normal"
    }

    fun cycleDayType(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val current = prefs.getString(KEY_DAY_TYPE, "Normal") ?: "Normal"
        val next = when (current) {
            "Normal" -> "Rest Day"
            "Rest Day" -> "Holiday"
            else -> "Normal"
        }
        prefs.edit().putString(KEY_DAY_TYPE, next).apply()
        return next
    }

    /**
     * Toggles a habit directly from the widget and registers a pending toggle
     * so that the main app syncs the checked status when opened!
     */
    fun toggleHabit(context: Context, logId: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val today = getTodayDateStr()
        val habitsJson = prefs.getString(KEY_HABITS, null) ?: return

        try {
            val array = JSONArray(habitsJson)
            var newStatus = "Pending"
            var matchedTaskId = ""
            var matchedTaskName = ""

            for (i in 0 until array.length()) {
                val obj = array.getJSONObject(i)
                val currLogId = obj.optString("logId", "")
                val currTaskId = obj.optString("taskId", "")
                val currTaskName = obj.optString("taskName", "")

                if (currLogId == logId || (currTaskId.isNotEmpty() && currTaskId == logId)) {
                    val current = obj.optString("status")
                    newStatus = if (current == "Completed") "Pending" else "Completed"
                    obj.put("status", newStatus)
                    matchedTaskId = currTaskId
                    matchedTaskName = currTaskName
                    break
                }
            }

            // Save updated habits JSON and ensure KEY_DATE is today
            val editor = prefs.edit()
            editor.putString(KEY_HABITS, array.toString())
            editor.putString(KEY_DATE, today)

            // Record in pending_toggles so MainActivity updates its local storage!
            val pendingStr = prefs.getString(KEY_PENDING_TOGGLES, "{}")
            val pendingObj = try { JSONObject(pendingStr ?: "{}") } catch (e: Exception) { JSONObject() }
            val itemInfo = JSONObject().apply {
                put("status", newStatus)
                put("logId", logId)
                put("taskId", matchedTaskId)
                put("taskName", matchedTaskName)
            }
            pendingObj.put(logId, itemInfo)
            if (matchedTaskId.isNotEmpty()) pendingObj.put(matchedTaskId, itemInfo)
            if (matchedTaskName.isNotEmpty()) pendingObj.put(matchedTaskName, itemInfo)
            editor.putString(KEY_PENDING_TOGGLES, pendingObj.toString())

            editor.apply()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    /**
     * Adds an expense directly from the widget (or quick dialog) without launching the main app.
     * Updates widget running total immediately and stores pending expense for main app import.
     */
    fun addExpense(context: Context, item: String, amount: Double) {
        if (amount <= 0.0) return
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val today = getTodayDateStr()
        val timestamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.getDefault()).format(Date())

        val newExp = JSONObject().apply {
            put("expenseId", "E_WIDGET_${System.currentTimeMillis()}")
            put("date", today)
            put("item", item.ifBlank { "Quick Spend" })
            put("amount", amount)
            put("timestamp", timestamp)
        }

        try {
            // 1. Add to cached_expenses so widget displays new total immediately
            val expJson = prefs.getString(KEY_EXPENSES, "[]")
            val expArray = try { JSONArray(expJson ?: "[]") } catch (e: Exception) { JSONArray() }
            expArray.put(newExp)

            // 2. Add to pending_expenses so WebView imports it next time app opens
            val pendingExpJson = prefs.getString(KEY_PENDING_EXPENSES, "[]")
            val pendingArray = try { JSONArray(pendingExpJson ?: "[]") } catch (e: Exception) { JSONArray() }
            pendingArray.put(newExp)

            prefs.edit()
                .putString(KEY_EXPENSES, expArray.toString())
                .putString(KEY_PENDING_EXPENSES, pendingArray.toString())
                .putString(KEY_DATE, today)
                .apply()

            // 3. Update the expense widget view immediately
            refreshExpenseWidget(context)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun getTodayExpenseTotal(context: Context): Double {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val expensesJson = prefs.getString(KEY_EXPENSES, null) ?: return 0.0
        var total = 0.0
        val today = getTodayDateStr()

        try {
            val array = JSONArray(expensesJson)
            for (i in 0 until array.length()) {
                val obj = array.getJSONObject(i)
                if (obj.optString("date") == today) {
                    total += obj.optDouble("amount", 0.0)
                }
            }
        } catch (e: Exception) {
            total = 0.0
        }
        return total
    }

    fun getPendingTogglesJson(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(KEY_PENDING_TOGGLES, "{}") ?: "{}"
    }

    fun clearPendingToggles(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().remove(KEY_PENDING_TOGGLES).apply()
    }

    fun getPendingExpensesJson(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(KEY_PENDING_EXPENSES, "[]") ?: "[]"
    }

    fun clearPendingExpenses(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().remove(KEY_PENDING_EXPENSES).apply()
    }

    fun refreshExpenseWidget(context: Context) {
        val appWidgetManager = AppWidgetManager.getInstance(context)
        val ids = appWidgetManager.getAppWidgetIds(ComponentName(context, ExpenseWidgetProvider::class.java))
        for (id in ids) {
            ExpenseWidgetProvider.updateAppWidget(context, appWidgetManager, id)
        }
    }

    fun refreshHabitWidget(context: Context) {
        val appWidgetManager = AppWidgetManager.getInstance(context)
        val ids = appWidgetManager.getAppWidgetIds(ComponentName(context, HabitWidgetProvider::class.java))
        for (id in ids) {
            HabitWidgetProvider.updateAppWidget(context, appWidgetManager, id)
        }
    }
}
