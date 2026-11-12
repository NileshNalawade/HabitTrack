/**
 * ExcelSyncService.ts - React Native / Expo File System Bridge
 * Automatically writes to Habit_Expense_Tracker.xlsx in user-accessible document storage.
 */

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { db } from './Database';
import XLSX from 'xlsx';

export const EXCEL_FILE_NAME = 'Habit_Expense_Tracker.xlsx';
export const EXCEL_FILE_PATH = `${FileSystem.documentDirectory}${EXCEL_FILE_NAME}`;

/**
 * Reads all 4 tables from SQLite and compiles them into a multi-sheet .xlsx file
 */
export async function syncDatabaseToExcelFile(): Promise<string> {
  const tasks = db.getAllSync('SELECT taskId, taskName, targetFrequency, linkedExpenseCategory, createdDate FROM Tasks_Master');
  const logs = db.getAllSync('SELECT logId, date, taskId, taskName, status, completionTimestamp, isAdhoc, linkedExpenseId, notes FROM Daily_Logs');
  const overrides = db.getAllSync('SELECT date, dayType, reason FROM Day_Overrides');
  const expenses = db.getAllSync('SELECT expenseId, date, amount, category, description, linkedTaskId, timestamp FROM Expenses');

  // Create workbook
  const wb = XLSX.utils.book_new();

  const wsTasks = XLSX.utils.json_to_sheet(tasks);
  const wsLogs = XLSX.utils.json_to_sheet(logs);
  const wsOverrides = XLSX.utils.json_to_sheet(overrides);
  const wsExpenses = XLSX.utils.json_to_sheet(expenses);

  XLSX.utils.book_append_sheet(wb, wsTasks, 'Tasks_Master');
  XLSX.utils.book_append_sheet(wb, wsLogs, 'Daily_Logs');
  XLSX.utils.book_append_sheet(wb, wsOverrides, 'Day_Overrides');
  XLSX.utils.book_append_sheet(wb, wsExpenses, 'Expenses');

  const base64Data = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

  // Write directly to device document directory
  await FileSystem.writeAsStringAsync(EXCEL_FILE_PATH, base64Data, {
    encoding: FileSystem.EncodingType.Base64
  });

  return EXCEL_FILE_PATH;
}

/**
 * Opens user share / export sheet for Habit_Expense_Tracker.xlsx
 */
export async function exportExcelFileToDevice() {
  await syncDatabaseToExcelFile();
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(EXCEL_FILE_PATH, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Export Habit & Expense Master Spreadsheet'
    });
  }
}

