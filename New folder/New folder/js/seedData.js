/**
 * Seed data for Offline Habit & Expense Tracker
 * Covers Tasks_Master, historical Daily_Logs, Day_Overrides, and Expenses.
 */

export const INITIAL_TASKS_MASTER = [
  {
    taskId: 'TASK_001',
    taskName: 'Wake up at 6:00 AM',
    targetFrequency: 'Daily',
    linkedExpenseCategory: '',
    createdDate: '2026-10-01',
    icon: '⏰',
    color: '#3B82F6'
  },
  {
    taskId: 'TASK_002',
    taskName: 'Gym Strength Training',
    targetFrequency: 'Daily',
    linkedExpenseCategory: 'Fitness & Gym',
    createdDate: '2026-10-01',
    icon: '🏋️',
    color: '#10B981'
  },
  {
    taskId: 'TASK_003',
    taskName: 'Cardio & 10,000 Steps',
    targetFrequency: 'Daily',
    linkedExpenseCategory: '',
    createdDate: '2026-10-01',
    icon: '🏃',
    color: '#06B6D4'
  },
  {
    taskId: 'TASK_004',
    taskName: 'Clean Diet & Meal Prep',
    targetFrequency: 'Daily',
    linkedExpenseCategory: 'Food & Nutrition',
    createdDate: '2026-10-01',
    icon: '🥗',
    color: '#84CC16'
  },
  {
    taskId: 'TASK_005',
    taskName: 'Supplements & Vitamins',
    targetFrequency: 'Daily',
    linkedExpenseCategory: 'Health & Supplements',
    createdDate: '2026-10-01',
    icon: '💊',
    color: '#8B5CF6'
  },
  {
    taskId: 'TASK_006',
    taskName: 'Deep Work / Reading 30m',
    targetFrequency: 'Daily',
    linkedExpenseCategory: 'Education & Books',
    createdDate: '2026-10-01',
    icon: '📖',
    color: '#F59E0B'
  }
];

export const INITIAL_DAY_OVERRIDES = [
  {
    date: '2026-10-25',
    dayType: 'Rest Day',
    reason: 'Scheduled active recovery rest day'
  },
  {
    date: '2026-11-01',
    dayType: 'Holiday',
    reason: 'Family holiday outing'
  }
];

export const INITIAL_EXPENSES = [
  {
    expenseId: 'EXP_20261020_001',
    date: '2026-10-20',
    amount: 45.00,
    category: 'Fitness & Gym',
    description: 'Monthly gym locker & towel pass',
    linkedTaskId: 'TASK_002',
    timestamp: '2026-10-20T08:15:00Z'
  },
  {
    expenseId: 'EXP_20261022_001',
    date: '2026-10-22',
    amount: 18.50,
    category: 'Food & Nutrition',
    description: 'Organic chicken & fresh greens meal prep',
    linkedTaskId: 'TASK_004',
    timestamp: '2026-10-22T19:30:00Z'
  },
  {
    expenseId: 'EXP_20261024_001',
    date: '2026-10-24',
    amount: 32.00,
    category: 'Health & Supplements',
    description: 'Whey isolate & multivitamin pack',
    linkedTaskId: 'TASK_005',
    timestamp: '2026-10-24T12:00:00Z'
  },
  {
    expenseId: 'EXP_20261028_001',
    date: '2026-10-28',
    amount: 15.00,
    category: 'Education & Books',
    description: 'Atomic Habits & Focus Architecture audiobook',
    linkedTaskId: 'TASK_006',
    timestamp: '2026-10-28T16:20:00Z'
  },
  {
    expenseId: 'EXP_20261030_001',
    date: '2026-10-30',
    amount: 65.20,
    category: 'General',
    description: 'Weekly grocery essentials and household items',
    linkedTaskId: null,
    timestamp: '2026-10-30T17:45:00Z'
  },
  {
    expenseId: 'EXP_20261102_001',
    date: '2026-11-02',
    amount: 12.00,
    category: 'Fitness & Gym',
    description: 'Electrolyte hydration pack & protein bar',
    linkedTaskId: 'TASK_002',
    timestamp: '2026-11-02T09:10:00Z'
  },
  {
    expenseId: 'EXP_20261103_001',
    date: '2026-11-03',
    amount: 8.50,
    category: 'Food & Nutrition',
    description: 'Fresh pre-workout cold-brew & oat bowl',
    linkedTaskId: 'TASK_004',
    timestamp: '2026-11-03T07:15:00Z'
  }
];

/**
 * Generate 2 weeks of realistic historical logs ending with today (2026-11-03)
 */
export function generateSeedDailyLogs() {
  const logs = [];
  const todayStr = '2026-11-03';
  const today = new Date(todayStr);

  for (let i = 14; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    const override = INITIAL_DAY_OVERRIDES.find(o => o.date === dateStr);
    const isRestOrHoliday = override && (override.dayType === 'Rest Day' || override.dayType === 'Holiday');

    INITIAL_TASKS_MASTER.forEach((task, idx) => {
      let status = 'Completed';
      let completionTimestamp = `${dateStr}T${(7 + idx).toString().padStart(2, '0')}:30:00Z`;
      let notes = 'Completed on schedule';

      if (isRestOrHoliday) {
        status = 'Skipped';
        completionTimestamp = null;
        notes = `${override.dayType} - Streaks Protected`;
      } else if (dateStr === todayStr) {
        // Today has some completed, some pending
        if (idx < 3) {
          status = 'Completed';
          completionTimestamp = `${dateStr}T${(7 + idx).toString().padStart(2, '0')}:15:00Z`;
          notes = 'Completed this morning';
        } else {
          status = 'Pending';
          completionTimestamp = null;
          notes = '';
        }
      } else if (i === 4 && idx === 2) {
        // One skipped habit in the past that was not a rest day
        status = 'Skipped';
        completionTimestamp = null;
        notes = 'Rainy weather delay';
      }

      logs.push({
        logId: `LOG_${dateStr.replace(/-/g, '')}_${task.taskId}`,
        date: dateStr,
        taskId: task.taskId,
        taskName: task.taskName,
        status: status,
        completionTimestamp: completionTimestamp,
        isAdhoc: false,
        linkedExpenseId: (task.taskId === 'TASK_002' && dateStr === '2026-11-02') ? 'EXP_20261102_001' : 
                         (task.taskId === 'TASK_004' && dateStr === '2026-11-03') ? 'EXP_20261103_001' : null,
        notes: notes
      });
    });

    // Add an ad-hoc task for yesterday
    if (i === 1) {
      logs.push({
        logId: `LOG_${dateStr.replace(/-/g, '')}_ADHOC_001`,
        date: dateStr,
        taskId: 'ADHOC_001',
        taskName: 'Renew Vehicle Insurance',
        status: 'Completed',
        completionTimestamp: `${dateStr}T14:30:00Z`,
        isAdhoc: true,
        linkedExpenseId: null,
        notes: 'Single day ad-hoc task completed'
      });
    }
  }

  return logs;
}

