/**
 * app.js - Main Application Entrypoint
 * Cross-Platform Offline Habit & Expense Tracker
 */

import { db } from './db.js';
import { ui } from './ui.js';
import { excelBridge } from './excelBridge.js';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('⚡ Initializing Offline Habit & Expense Tracker with Local Excel Sync...');
  
  try {
    // 1. Initialize local database
    await db.init();
    
    // 2. Initialize UI controller and views
    ui.init();

    // 3. Setup Master Spreadsheet engine
    excelBridge.notifySyncStatus('SYNCED', 'Habit_Expense_Tracker.xlsx initialized in memory.');

    console.log('✅ Offline Tracker Ready. Zero external dependencies. 100% Local-First.');
  } catch (err) {
    console.error('Fatal initialization error:', err);
  }
});

