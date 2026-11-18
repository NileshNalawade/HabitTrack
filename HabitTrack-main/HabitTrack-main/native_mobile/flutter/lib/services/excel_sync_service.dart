import 'dart:io';
import 'package:excel/excel.dart';
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

class FlutterExcelSyncService {
  static const String fileName = 'Habit_Expense_Tracker.xlsx';

  /// Background sync to device document directory
  static Future<File> syncDatabaseToExcel(Database db) async {
    final excel = Excel.createExcel();

    // 1. Tasks_Master
    final Sheet sheetTasks = excel['Tasks_Master'];
    sheetTasks.appendRow([
      TextCellValue('Task ID'),
      TextCellValue('Task Name'),
      TextCellValue('Target Frequency'),
      TextCellValue('Linked Expense Category'),
      TextCellValue('Created Date'),
    ]);
    final List<Map<String, dynamic>> tasks = await db.query('Tasks_Master');
    for (var t in tasks) {
      sheetTasks.appendRow([
        TextCellValue(t['taskId'] ?? ''),
        TextCellValue(t['taskName'] ?? ''),
        TextCellValue(t['targetFrequency'] ?? 'Daily'),
        TextCellValue(t['linkedExpenseCategory'] ?? ''),
        TextCellValue(t['createdDate'] ?? ''),
      ]);
    }

    // 2. Daily_Logs
    final Sheet sheetLogs = excel['Daily_Logs'];
    sheetLogs.appendRow([
      TextCellValue('Log ID'),
      TextCellValue('Date'),
      TextCellValue('Task ID'),
      TextCellValue('Task Name'),
      TextCellValue('Status'),
      TextCellValue('Completion Timestamp'),
      TextCellValue('Is_Adhoc'),
      TextCellValue('Linked Expense ID'),
      TextCellValue('Notes'),
    ]);
    final List<Map<String, dynamic>> logs = await db.query('Daily_Logs');
    for (var l in logs) {
      sheetLogs.appendRow([
        TextCellValue(l['logId'] ?? ''),
        TextCellValue(l['date'] ?? ''),
        TextCellValue(l['taskId'] ?? ''),
        TextCellValue(l['taskName'] ?? ''),
        TextCellValue(l['status'] ?? 'Pending'),
        TextCellValue(l['completionTimestamp'] ?? ''),
        TextCellValue(l['isAdhoc'] == 1 ? 'TRUE' : 'FALSE'),
        TextCellValue(l['linkedExpenseId'] ?? ''),
        TextCellValue(l['notes'] ?? ''),
      ]);
    }

    // 3. Day_Overrides
    final Sheet sheetOverrides = excel['Day_Overrides'];
    sheetOverrides.appendRow([
      TextCellValue('Date'),
      TextCellValue('Day Type'),
      TextCellValue('Reason/Notes'),
    ]);
    final List<Map<String, dynamic>> overrides = await db.query('Day_Overrides');
    for (var o in overrides) {
      sheetOverrides.appendRow([
        TextCellValue(o['date'] ?? ''),
        TextCellValue(o['dayType'] ?? 'Normal'),
        TextCellValue(o['reason'] ?? ''),
      ]);
    }

    // 4. Expenses
    final Sheet sheetExpenses = excel['Expenses'];
    sheetExpenses.appendRow([
      TextCellValue('Expense ID'),
      TextCellValue('Date'),
      TextCellValue('Amount'),
      TextCellValue('Category'),
      TextCellValue('Description'),
      TextCellValue('Linked Task ID'),
      TextCellValue('Timestamp'),
    ]);
    final List<Map<String, dynamic>> expenses = await db.query('Expenses');
    for (var e in expenses) {
      sheetExpenses.appendRow([
        TextCellValue(e['expenseId'] ?? ''),
        TextCellValue(e['date'] ?? ''),
        DoubleCellValue((e['amount'] as num?)?.toDouble() ?? 0.0),
        TextCellValue(e['category'] ?? 'General'),
        TextCellValue(e['description'] ?? ''),
        TextCellValue(e['linkedTaskId'] ?? ''),
        TextCellValue(e['timestamp'] ?? ''),
      ]);
    }

    // Delete default Sheet1
    excel.delete('Sheet1');

    // Save to user documents directory
    final directory = await getApplicationDocumentsDirectory();
    final file = File('${directory.path}/$fileName');
    final fileBytes = excel.save();

    if (fileBytes != null) {
      await file.writeAsBytes(fileBytes, flush: true);
    }

    return file;
  }
}

