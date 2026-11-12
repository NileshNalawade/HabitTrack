package com.habittracker.widget

import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.habittracker.R
import com.habittracker.data.WidgetDataHelper

class QuickExpenseActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_quick_expense)

        val inputAmount = findViewById<EditText>(R.id.input_expense_amount)
        val inputItem = findViewById<EditText>(R.id.input_expense_item)
        val btnSave = findViewById<Button>(R.id.btn_save_expense)
        val btnCancel = findViewById<Button>(R.id.btn_cancel_expense)
        val btnClose = findViewById<TextView>(R.id.btn_dialog_close)

        // Preset amount chips
        findViewById<TextView>(R.id.chip_amt_20)?.setOnClickListener { inputAmount.setText("20.00") }
        findViewById<TextView>(R.id.chip_amt_50)?.setOnClickListener { inputAmount.setText("50.00") }
        findViewById<TextView>(R.id.chip_amt_100)?.setOnClickListener { inputAmount.setText("100.00") }
        findViewById<TextView>(R.id.chip_amt_200)?.setOnClickListener { inputAmount.setText("200.00") }
        findViewById<TextView>(R.id.chip_amt_500)?.setOnClickListener { inputAmount.setText("500.00") }

        // Category chips
        findViewById<TextView>(R.id.chip_cat_chai)?.setOnClickListener { inputItem.setText("Chai / Tea") }
        findViewById<TextView>(R.id.chip_cat_food)?.setOnClickListener { inputItem.setText("Lunch / Food") }
        findViewById<TextView>(R.id.chip_cat_groceries)?.setOnClickListener { inputItem.setText("Groceries") }
        findViewById<TextView>(R.id.chip_cat_travel)?.setOnClickListener { inputItem.setText("Travel / Auto") }

        btnCancel.setOnClickListener { finish() }
        btnClose.setOnClickListener { finish() }

        btnSave.setOnClickListener {
            val amountStr = inputAmount.text.toString().trim()
            val amount = amountStr.toDoubleOrNull() ?: 0.0

            if (amount <= 0.0) {
                Toast.makeText(this, "Please enter a valid amount", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val item = inputItem.text.toString().trim().ifBlank { "Quick Expense" }

            // Save directly to widget prefs without launching main app
            WidgetDataHelper.addExpense(this, item, amount)
            Toast.makeText(this, "Logged ₹${String.format("%.2f", amount)} for $item", Toast.LENGTH_SHORT).show()

            finish()
        }
    }
}

