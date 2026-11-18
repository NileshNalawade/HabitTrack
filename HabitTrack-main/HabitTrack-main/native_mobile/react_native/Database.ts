/**
 * React Native / Expo Local-First SQLite Schema & Queries
 * Zero external cloud dependency. High performance local queries.
 */

import * as SQLite from 'expo-sqlite';

export const db = SQLite.openDatabaseSync('habit_expense_master.db');

export function initDatabase() {
  db.execSync(`
    PRAGMA foreign_keys = ON;

    -- 1. Tasks_Master
    CREATE TABLE IF NOT EXISTS Tasks_Master (
      taskId TEXT PRIMARY KEY,
      taskName TEXT NOT NULL,
      targetFrequency TEXT NOT NULL DEFAULT 'Daily',
      linkedExpenseCategory TEXT,
      createdDate TEXT NOT NULL
    );

    -- 2. Daily_Logs
    CREATE TABLE IF NOT EXISTS Daily_Logs (
      logId TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      taskId TEXT NOT NULL,
      taskName TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('Pending', 'Completed', 'Skipped')),
      completionTimestamp TEXT,
      isAdhoc INTEGER NOT NULL DEFAULT 0,
      linkedExpenseId TEXT,
      notes TEXT
    );

    -- 3. Day_Overrides
    CREATE TABLE IF NOT EXISTS Day_Overrides (
      date TEXT PRIMARY KEY,
      dayType TEXT NOT NULL CHECK(dayType IN ('Normal', 'Rest Day', 'Holiday', 'Free Day')),
      reason TEXT
    );

    -- 4. Expenses
    CREATE TABLE IF NOT EXISTS Expenses (
      expenseId TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      linkedTaskId TEXT,
      timestamp TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_daily_logs_date ON Daily_Logs(date);
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON Expenses(date);
  `);
}

export function toggleTaskStatusNative(logId: string) {
  const current = db.getFirstSync<{ status: string }>('SELECT status FROM Daily_Logs WHERE logId = ?', [logId]);
  if (!current) return null;

  const nextStatus = current.status === 'Completed' ? 'Pending' : 'Completed';
  const timestamp = nextStatus === 'Completed' ? new Date().toISOString() : null;

  db.runSync(
    'UPDATE Daily_Logs SET status = ?, completionTimestamp = ? WHERE logId = ?',
    [nextStatus, timestamp, logId]
  );

  return nextStatus;
}

