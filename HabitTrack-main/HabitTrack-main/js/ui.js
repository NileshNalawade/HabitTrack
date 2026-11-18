/**
 * ui.js - Primary UI Controller & Event Orchestrator
 * High-contrast dark mode aesthetic, smooth transitions, modal handling,
 * responsive tab routing, and real-time database reactivity.
 */

import { db } from './db.js';
import { excelBridge } from './excelBridge.js';
import { analytics } from './analyticsEngine.js';
import { WidgetsSimulator } from './widgetsSimulator.js';

export class AppUI {
  constructor() {
    this.currentTab = 'today';
    this.selectedDate = db.getTodayDateString();
    this.calendarMonth = new Date().getMonth();
    this.calendarYear = new Date().getFullYear();
    this.expenseFilter = 'ALL'; // 'ALL', 'HABIT', 'GENERAL', or category name
    this.pendingHabitExpenseTask = null; // For the habit-linked prompt

    this.widgetsSim = new WidgetsSimulator(() => {
      this.openExpenseModal(null, this.selectedDate);
    });
  }

  init() {
    this.bindNavigation();
    this.bindTopActions();
    this.bindModals();
    this.bindSyncStatus();

    // Subscribe to DB updates
    db.subscribe((event) => {
      this.handleDbUpdate(event);
    });

    // Initial render
    this.renderCurrentView();
    this.updateGlobalHeaderStats();

    // Setup periodic date checker for 00:00 midnight roll
    setInterval(() => {
      const today = db.getTodayDateString();
      db.ensureLogsForDate(today);
    }, 60000);
  }

  bindNavigation() {
    const tabs = document.querySelectorAll('.bottom-nav-item');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetView = tab.getAttribute('data-tab');
        this.switchTab(targetView);
      });
    });
  }

  switchTab(tabId) {
    this.currentTab = tabId;
    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });

    document.querySelectorAll('.view-container').forEach(view => {
      view.classList.toggle('active', view.id === `view-${tabId}`);
    });

    this.renderCurrentView();
  }

  renderCurrentView() {
    switch (this.currentTab) {
      case 'today':
        this.renderTodayView();
        break;
      case 'calendar':
        this.renderCalendarView();
        break;
      case 'expenses':
        this.renderExpensesView();
        break;
      case 'analytics':
        this.renderAnalyticsView();
        break;
      case 'widgets':
        this.renderWidgetsView();
        break;
    }
  }

  handleDbUpdate(event) {
    this.updateGlobalHeaderStats();
    this.renderCurrentView();

    // Check if a completed task has a linked expense category
    if (event.type === 'TASK_TOGGLED' && event.status === 'Completed') {
      const taskMaster = db.getTaskMasterById(event.taskId);
      if (taskMaster && taskMaster.linkedExpenseCategory) {
        // Trigger Habit-Linked Expense Prompt
        this.promptHabitLinkedExpense(taskMaster, event.logId);
      }
    }
  }

  updateGlobalHeaderStats() {
    const streaks = db.calculateStreaks();
    const streakEl = document.getElementById('header-streak-count');
    if (streakEl) streakEl.textContent = `${streaks.currentStreak}d`;

    const bestStreakEl = document.getElementById('header-best-streak');
    if (bestStreakEl) bestStreakEl.textContent = `${streaks.bestStreak}d`;

    // Today's spend
    const todayStr = db.getTodayDateString();
    const todayExpenses = db.expenses.filter(e => e.date === todayStr);
    const todaySpend = todayExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const spendEl = document.getElementById('header-today-spend');
    if (spendEl) spendEl.textContent = `$${todaySpend.toFixed(2)}`;
  }

  bindSyncStatus() {
    const syncPill = document.getElementById('sync-status-pill');
    const syncTime = document.getElementById('sync-time-label');

    excelBridge.onSyncStatusChange((info) => {
      if (syncPill) {
        if (info.status === 'SYNCING') {
          syncPill.className = 'sync-pill syncing';
          syncPill.innerHTML = `<span class="sync-dot pulse"></span> Syncing Excel...`;
        } else if (info.status === 'BOUND') {
          syncPill.className = 'sync-pill bound';
          syncPill.innerHTML = `<span class="sync-dot active"></span> Local File Linked`;
          this.showToast(`Auto-sync active to local file: ${info.fileName}`, 'success');
        } else if (info.status === 'ERROR') {
          syncPill.className = 'sync-pill error';
          syncPill.innerHTML = `<span class="sync-dot error"></span> Sync Failed`;
        } else {
          syncPill.className = 'sync-pill synced';
          syncPill.innerHTML = `<span class="sync-dot active"></span> Excel Synced`;
        }
      }

      if (syncTime && info.time) {
        const hours = String(info.time.getHours()).padStart(2, '0');
        const mins = String(info.time.getMinutes()).padStart(2, '0');
        const secs = String(info.time.getSeconds()).padStart(2, '0');
        syncTime.textContent = `Auto-saved at ${hours}:${mins}:${secs}`;
      }
    });
  }

  bindTopActions() {
    // Download Excel
    const btnDownloadXlsx = document.getElementById('btn-download-xlsx');
    if (btnDownloadXlsx) {
      btnDownloadXlsx.addEventListener('click', () => {
        excelBridge.downloadExcelFile();
        this.showToast('Downloaded Habit_Expense_Tracker.xlsx (4 sheets)', 'success');
      });
    }

    // Bind Local File (Silent File System Access sync)
    const btnBindFile = document.getElementById('btn-bind-file');
    if (btnBindFile) {
      btnBindFile.addEventListener('click', async () => {
        const success = await excelBridge.bindLocalFile();
        if (success) {
          this.showToast('File bound! Every action writes directly to disk.', 'success');
        }
      });
    }

    // Import Excel Modal trigger
    const btnImportModal = document.getElementById('btn-import-modal');
    if (btnImportModal) {
      btnImportModal.addEventListener('click', () => {
        this.openModal('modal-import');
      });
    }

    // Manage Master Habits Modal trigger
    const btnManageMaster = document.getElementById('btn-manage-master');
    if (btnManageMaster) {
      btnManageMaster.addEventListener('click', () => {
        this.renderMasterTasksModal();
        this.openModal('modal-master-tasks');
      });
    }
  }

  // ==========================================
  // 1. TODAY VIEW
  // ==========================================
  renderTodayView() {
    const container = document.getElementById('view-today');
    if (!container) return;

    const todayStr = db.getTodayDateString();
    const logs = db.getDailyLogs(todayStr);
    const dayOverride = db.getDayOverride(todayStr);

    const regularLogs = logs.filter(l => !l.isAdhoc);
    const adhocLogs = logs.filter(l => l.isAdhoc);

    const completedCount = regularLogs.filter(l => l.status === 'Completed').length;
    const totalRegular = regularLogs.length;
    const completionPercent = totalRegular > 0 ? Math.round((completedCount / totalRegular) * 100) : 0;

    const isRestDay = dayOverride.dayType === 'Rest Day' || dayOverride.dayType === 'Holiday' || dayOverride.dayType === 'Free Day';

    const dateFormatted = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    container.innerHTML = `
      <div class="view-header">
        <div class="date-meta">
          <h2 class="view-title">Today's Habits & Tasks</h2>
          <span class="sub-date">${dateFormatted}</span>
        </div>

        <!-- Quick "+ Today Only" Ad-Hoc Button -->
        <button class="btn-primary-action" id="btn-open-adhoc-modal">
          <span class="action-icon">+</span> Today Only
        </button>
      </div>

      <!-- Rest Day / Holiday Mode Bar -->
      <div class="override-banner ${isRestDay ? 'active-rest' : ''}">
        <div class="override-info">
          <span class="override-badge ${dayOverride.dayType.toLowerCase().replace(/\s+/g, '-')}">
            ${isRestDay ? '🛡️ ' + dayOverride.dayType + ' Active' : '⚡ Normal Training Day'}
          </span>
          <span class="override-text">
            ${isRestDay
        ? 'Streaks are protected! Habits marked as rest will not penalize your streak.'
        : 'Complete your daily recurring habits to keep your active streak burning!'}
          </span>
        </div>

        <div class="override-controls">
          <label class="switch-label">Day Mode:</label>
          <select id="today-mode-select" class="override-select">
            <option value="Normal" ${dayOverride.dayType === 'Normal' ? 'selected' : ''}>Normal Day</option>
            <option value="Rest Day" ${dayOverride.dayType === 'Rest Day' ? 'selected' : ''}>Rest Day (Protected)</option>
            <option value="Holiday" ${dayOverride.dayType === 'Holiday' ? 'selected' : ''}>Holiday (Protected)</option>
            <option value="Free Day" ${dayOverride.dayType === 'Free Day' ? 'selected' : ''}>Free Day</option>
          </select>
        </div>
      </div>

      <!-- Progress Card -->
      <div class="today-progress-card">
        <div class="progress-details">
          <div class="progress-text-group">
            <span class="progress-headline">${completedCount} of ${totalRegular} Habits Done</span>
            <span class="progress-subtext">${completionPercent === 100 ? '🎉 All habits completed for today!' : `${totalRegular - completedCount} habits remaining`}</span>
          </div>
          <span class="progress-percentage-label">${completionPercent}%</span>
        </div>
        <div class="progress-bar-rail">
          <div class="progress-bar-fill" style="width: ${completionPercent}%"></div>
        </div>
      </div>

      <!-- Task Lists Section -->
      <div class="task-section">
        <div class="section-title-row">
          <h3 class="section-title">Recurring Habits</h3>
          <span class="task-counter">${regularLogs.length} items</span>
        </div>

        <div class="task-cards-list">
          ${regularLogs.map(log => this.renderTaskCardHtml(log)).join('')}
        </div>
      </div>

      <!-- Ad-Hoc Tasks Section (Single-day items) -->
      ${adhocLogs.length > 0 ? `
        <div class="task-section adhoc-section">
          <div class="section-title-row">
            <h3 class="section-title">Single-Day Ad-Hoc Tasks</h3>
            <span class="adhoc-counter-badge">${adhocLogs.length} today only</span>
          </div>
          <div class="task-cards-list">
            ${adhocLogs.map(log => this.renderTaskCardHtml(log, true)).join('')}
          </div>
        </div>
      ` : ''}
    `;

    // Bind Today View events
    container.querySelectorAll('.task-checkbox-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const logId = btn.getAttribute('data-log-id');
        db.toggleTaskStatus(logId);
      });
    });

    container.querySelectorAll('.btn-add-linked-expense').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskId = btn.getAttribute('data-task-id');
        const taskMaster = db.getTaskMasterById(taskId);
        if (taskMaster) {
          this.openExpenseModal(taskMaster, todayStr);
        }
      });
    });

    const modeSelect = container.querySelector('#today-mode-select');
    if (modeSelect) {
      modeSelect.addEventListener('change', (e) => {
        const newMode = e.target.value;
        db.setDayOverride(todayStr, newMode, newMode !== 'Normal' ? `${newMode} toggled from Today view` : '');
        this.showToast(`Set day mode to: ${newMode}`, 'info');
      });
    }

    const btnOpenAdhoc = container.querySelector('#btn-open-adhoc-modal');
    if (btnOpenAdhoc) {
      btnOpenAdhoc.addEventListener('click', () => {
        this.openAdHocModal(todayStr);
      });
    }
  }

  renderTaskCardHtml(log, isAdhoc = false) {
    const taskMaster = !isAdhoc ? db.getTaskMasterById(log.taskId) : null;
    const isCompleted = log.status === 'Completed';
    const isSkipped = log.status === 'Skipped';
    const hasLinkedExpense = !!log.linkedExpenseId;

    return `
      <div class="task-card ${isCompleted ? 'is-completed' : ''} ${isSkipped ? 'is-skipped' : ''}" data-log-id="${log.logId}">
        <div class="task-card-left">
          <button class="task-checkbox-btn ${isCompleted ? 'checked' : ''} ${isSkipped ? 'skipped' : ''}" data-log-id="${log.logId}" title="Tap to toggle status">
            ${isCompleted ? '✓' : isSkipped ? '⏸' : ''}
          </button>

          <div class="task-card-info">
            <div class="task-title-line">
              ${taskMaster?.icon ? `<span class="task-icon">${taskMaster.icon}</span>` : ''}
              <span class="task-name ${isCompleted ? 'strikethrough' : ''}">${log.taskName}</span>
              ${isAdhoc ? `<span class="adhoc-tag">Today Only</span>` : ''}
              ${taskMaster?.targetFrequency ? `<span class="freq-tag">${taskMaster.targetFrequency}</span>` : ''}
            </div>

            <div class="task-subline">
              ${isCompleted && log.completionTimestamp ? `<span class="timestamp-tag">Done at ${new Date(log.completionTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>` : ''}
              ${log.notes ? `<span class="task-notes-text">📝 ${log.notes}</span>` : ''}
              ${taskMaster?.linkedExpenseCategory ? `
                <span class="linked-category-tag">💳 Category: ${taskMaster.linkedExpenseCategory}</span>
              ` : ''}
              ${hasLinkedExpense ? `<span class="expense-attached-tag">✓ Expense Linked</span>` : ''}
            </div>
          </div>
        </div>

        <div class="task-card-actions">
          ${taskMaster?.linkedExpenseCategory ? `
            <button class="btn-add-linked-expense" data-task-id="${log.taskId}" title="Log expense linked to this habit">
              + Expense
            </button>
          ` : ''}
          ${isAdhoc ? `
            <button class="btn-delete-adhoc" data-log-id="${log.logId}" title="Delete ad-hoc task">✕</button>
          ` : ''}
        </div>
      </div>
    `;
  }

  // ==========================================
  // 2. CALENDAR & HISTORY VIEW
  // ==========================================
  renderCalendarView() {
    const container = document.getElementById('view-calendar');
    if (!container) return;

    const currentYear = this.calendarYear;
    const currentMonth = this.calendarMonth;

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const monthName = new Date(currentYear, currentMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Selected Date Details
    const selLogs = db.getDailyLogs(this.selectedDate);
    const selOverride = db.getDayOverride(this.selectedDate);
    const selFormatted = new Date(this.selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'short', day: 'numeric', year: 'numeric'
    });

    container.innerHTML = `
      <div class="view-header">
        <h2 class="view-title">History & Calendar</h2>
        <span class="sub-date">Retroactively view, complete, or log past tasks</span>
      </div>

      <div class="calendar-card">
        <div class="calendar-header-nav">
          <button class="cal-nav-btn" id="cal-prev-month">◀</button>
          <span class="cal-month-title">${monthName}</span>
          <button class="cal-nav-btn" id="cal-next-month">▶</button>
        </div>

        <div class="calendar-weekdays">
          <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
        </div>

        <div class="calendar-grid">
          ${Array(firstDay).fill('').map(() => `<div class="cal-day empty"></div>`).join('')}
          ${Array.from({ length: daysInMonth }, (_, i) => i + 1).map(dayNum => {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      const override = db.getDayOverride(dateStr);
      const isRest = override.dayType === 'Rest Day' || override.dayType === 'Holiday' || override.dayType === 'Free Day';
      const logs = db.dailyLogs.filter(l => l.date === dateStr);
      const completed = logs.filter(l => l.status === 'Completed').length;
      const total = logs.filter(l => !l.isAdhoc).length;

      const isSelected = dateStr === this.selectedDate;
      const isToday = dateStr === db.getTodayDateString();

      let statusClass = 'day-none';
      if (isRest) statusClass = 'day-rest';
      else if (total > 0 && completed === total) statusClass = 'day-complete';
      else if (completed > 0) statusClass = 'day-partial';
      else if (total > 0 && dateStr < db.getTodayDateString()) statusClass = 'day-missed';

      return `
              <div class="cal-day ${statusClass} ${isSelected ? 'selected' : ''} ${isToday ? 'today-highlight' : ''}" data-date="${dateStr}">
                <span class="day-number">${dayNum}</span>
                <div class="day-indicator">
                  ${isRest ? '★' : completed > 0 ? `${completed}/${total}` : ''}
                </div>
              </div>
            `;
    }).join('')}
        </div>
      </div>

      <!-- Selected Day Inspector -->
      <div class="history-detail-card">
        <div class="history-detail-header">
          <div>
            <h3 class="history-date-heading">${selFormatted}</h3>
            <span class="override-pill ${selOverride.dayType.toLowerCase().replace(/\s+/g, '-')}">
              ${selOverride.dayType} ${selOverride.reason ? `(${selOverride.reason})` : ''}
            </span>
          </div>

          <div class="history-actions">
            <button class="btn-secondary-action" id="btn-retroactive-adhoc">+ Add Task Here</button>
            <button class="btn-secondary-action" id="btn-retroactive-expense">+ Expense</button>
          </div>
        </div>

        <div class="task-cards-list">
          ${selLogs.map(log => this.renderTaskCardHtml(log, log.isAdhoc)).join('')}
        </div>
      </div>
    `;

    // Calendar navigation
    container.querySelector('#cal-prev-month').addEventListener('click', () => {
      this.calendarMonth--;
      if (this.calendarMonth < 0) {
        this.calendarMonth = 11;
        this.calendarYear--;
      }
      this.renderCalendarView();
    });

    container.querySelector('#cal-next-month').addEventListener('click', () => {
      this.calendarMonth++;
      if (this.calendarMonth > 11) {
        this.calendarMonth = 0;
        this.calendarYear++;
      }
      this.renderCalendarView();
    });

    // Calendar day selection
    container.querySelectorAll('.cal-day:not(.empty)').forEach(el => {
      el.addEventListener('click', () => {
        this.selectedDate = el.getAttribute('data-date');
        this.renderCalendarView();
      });
    });

    // Checkbox toggling in history inspector
    container.querySelectorAll('.task-checkbox-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const logId = btn.getAttribute('data-log-id');
        db.toggleTaskStatus(logId);
      });
    });

    container.querySelector('#btn-retroactive-adhoc')?.addEventListener('click', () => {
      this.openAdHocModal(this.selectedDate);
    });

    container.querySelector('#btn-retroactive-expense')?.addEventListener('click', () => {
      this.openExpenseModal(null, this.selectedDate);
    });
  }

  // ==========================================
  // 3. EXPENSES VIEW
  // ==========================================
  renderExpensesView() {
    const container = document.getElementById('view-expenses');
    if (!container) return;

    const allExpenses = db.getExpenses();
    let filtered = allExpenses;

    if (this.expenseFilter === 'HABIT') {
      filtered = allExpenses.filter(e => !!e.linkedTaskId);
    } else if (this.expenseFilter === 'GENERAL') {
      filtered = allExpenses.filter(e => !e.linkedTaskId);
    } else if (this.expenseFilter !== 'ALL') {
      filtered = allExpenses.filter(e => e.category === this.expenseFilter);
    }

    const totalSpend = allExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const habitSpend = allExpenses.filter(e => !!e.linkedTaskId).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const generalSpend = totalSpend - habitSpend;

    const categories = Array.from(new Set(allExpenses.map(e => e.category || 'General')));

    container.innerHTML = `
      <div class="view-header">
        <div>
          <h2 class="view-title">Expenses Ledger</h2>
          <span class="sub-date">Track habit-tied investments & general spending</span>
        </div>

        <button class="btn-primary-action" id="btn-open-expense-modal">
          <span class="action-icon">+</span> Log Expense
        </button>
      </div>

      <!-- Financial Metric Cards -->
      <div class="expense-metrics-grid">
        <div class="metric-card cyan">
          <span class="metric-title">Total Outlay</span>
          <span class="metric-value">$${totalSpend.toFixed(2)}</span>
          <span class="metric-sub">${allExpenses.length} total entries</span>
        </div>
        <div class="metric-card emerald">
          <span class="metric-title">Habit-Linked Spend</span>
          <span class="metric-value">$${habitSpend.toFixed(2)}</span>
          <span class="metric-sub">${totalSpend > 0 ? Math.round((habitSpend / totalSpend) * 100) : 0}% of all spend</span>
        </div>
        <div class="metric-card slate">
          <span class="metric-title">General Spend</span>
          <span class="metric-value">$${generalSpend.toFixed(2)}</span>
          <span class="metric-sub">${totalSpend > 0 ? Math.round((generalSpend / totalSpend) * 100) : 0}% of all spend</span>
        </div>
      </div>

      <!-- Filter Bar -->
      <div class="expense-filter-bar">
        <button class="filter-chip ${this.expenseFilter === 'ALL' ? 'active' : ''}" data-filter="ALL">All (${allExpenses.length})</button>
        <button class="filter-chip ${this.expenseFilter === 'HABIT' ? 'active' : ''}" data-filter="HABIT">⚡ Habit-Linked</button>
        <button class="filter-chip ${this.expenseFilter === 'GENERAL' ? 'active' : ''}" data-filter="GENERAL">General</button>
        ${categories.map(cat => `
          <button class="filter-chip ${this.expenseFilter === cat ? 'active' : ''}" data-filter="${cat}">${cat}</button>
        `).join('')}
      </div>

      <!-- Ledger Table -->
      <div class="ledger-container">
        <div class="ledger-header">
          <span>Date</span>
          <span>Category & Description</span>
          <span>Linked Habit</span>
          <span class="text-right">Amount</span>
          <span class="text-center">Action</span>
        </div>

        <div class="ledger-body">
          ${filtered.length === 0 ? `
            <div class="empty-state">No expenses found for this filter.</div>
          ` : filtered.map(exp => {
      const linkedTask = exp.linkedTaskId ? db.getTaskMasterById(exp.linkedTaskId) : null;
      return `
              <div class="ledger-row" data-expense-id="${exp.expenseId}">
                <span class="ledger-date">${exp.date}</span>
                <div class="ledger-desc-group">
                  <span class="ledger-cat-pill">${exp.category}</span>
                  <span class="ledger-desc">${exp.description || 'No description'}</span>
                </div>
                <div class="ledger-habit-col">
                  ${linkedTask ? `
                    <span class="linked-habit-badge">
                      ${linkedTask.icon || '⚡'} ${linkedTask.taskName}
                    </span>
                  ` : `<span class="unlinked-muted">—</span>`}
                </div>
                <span class="ledger-amount text-right">$${Number(exp.amount).toFixed(2)}</span>
                <span class="ledger-action text-center">
                  <button class="btn-delete-expense" data-expense-id="${exp.expenseId}" title="Delete expense">✕</button>
                </span>
              </div>
            `;
    }).join('')}
        </div>
      </div>
    `;

    // Bind Expenses events
    container.querySelector('#btn-open-expense-modal').addEventListener('click', () => {
      this.openExpenseModal(null, db.getTodayDateString());
    });

    container.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this.expenseFilter = chip.getAttribute('data-filter');
        this.renderExpensesView();
      });
    });

    container.querySelectorAll('.btn-delete-expense').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-expense-id');
        if (confirm('Delete this expense entry?')) {
          db.deleteExpense(id);
          this.showToast('Expense removed', 'info');
        }
      });
    });
  }

  // ==========================================
  // 4. ANALYTICS VIEW
  // ==========================================
  renderAnalyticsView() {
    const container = document.getElementById('view-analytics');
    if (!container) return;

    const metrics = analytics.getMetrics();

    container.innerHTML = `
      <div class="view-header">
        <div>
          <h2 class="view-title">Performance Analytics</h2>
          <span class="sub-date">Habit consistency heatmaps & expenditure distribution</span>
        </div>
      </div>

      <!-- Streak & Completion Highlights -->
      <div class="analytics-hero-grid">
        <div class="streak-card current">
          <div class="streak-icon-wrap">🔥</div>
          <div class="streak-details">
            <span class="streak-val">${metrics.currentStreak} Days</span>
            <span class="streak-title">Current Active Streak</span>
            <span class="streak-tip">Rest days & holidays preserve your streak!</span>
          </div>
        </div>

        <div class="streak-card best">
          <div class="streak-icon-wrap">🏆</div>
          <div class="streak-details">
            <span class="streak-val">${metrics.bestStreak} Days</span>
            <span class="streak-title">All-Time Best Streak</span>
            <span class="streak-tip">Personal record consistency</span>
          </div>
        </div>

        <div class="streak-card completion">
          <div class="streak-icon-wrap">📊</div>
          <div class="streak-details">
            <span class="streak-val">${metrics.completionRate}%</span>
            <span class="streak-title">Overall Completion Rate</span>
            <span class="streak-tip">${metrics.totalCompleted} total habits fulfilled</span>
          </div>
        </div>
      </div>

      <!-- Consistency Heatmap Card -->
      <div class="chart-panel">
        <div class="panel-header">
          <h3 class="panel-title">Habit Consistency Heatmap</h3>
          <div class="heatmap-legend">
            <span>Less</span>
            <span class="legend-cell l0"></span>
            <span class="legend-cell l1"></span>
            <span class="legend-cell l2"></span>
            <span class="legend-cell l3"></span>
            <span class="legend-cell l4"></span>
            <span class="legend-cell l-rest"></span>
            <span>More / Rest</span>
          </div>
        </div>
        <div class="canvas-wrapper">
          <canvas id="chart-heatmap" width="800" height="180"></canvas>
        </div>
      </div>

      <!-- Charts 2-Column Grid -->
      <div class="charts-two-col">
        <!-- Monthly Habit Completion Bar Chart -->
        <div class="chart-panel">
          <div class="panel-header">
            <h3 class="panel-title">Weekly Habit Completion</h3>
            <span class="panel-sub">Goal: 80%</span>
          </div>
          <div class="canvas-wrapper">
            <canvas id="chart-weekly-bars" width="380" height="220"></canvas>
          </div>
        </div>

        <!-- Category Spending Donut -->
        <div class="chart-panel">
          <div class="panel-header">
            <h3 class="panel-title">Category Spending Share</h3>
            <span class="panel-sub">$${metrics.totalSpend.toFixed(2)} Total</span>
          </div>
          <div class="canvas-wrapper donut-canvas-wrap">
            <canvas id="chart-spending-donut" width="220" height="220"></canvas>
            <div id="donut-legend-container" class="donut-legend-wrap"></div>
          </div>
        </div>
      </div>

      <!-- Spending Trend Line Chart -->
      <div class="chart-panel">
        <div class="panel-header">
          <h3 class="panel-title">14-Day Expenditure Trend</h3>
          <span class="panel-sub">Daily Financial Cashflow</span>
        </div>
        <div class="canvas-wrapper">
          <canvas id="chart-spending-trend" width="800" height="200"></canvas>
        </div>
      </div>

      <!-- Habit-Linked vs General Outlay Comparison -->
      <div class="chart-panel">
        <div class="panel-header">
          <h3 class="panel-title">Financial Outlay Comparison: Habits vs. General</h3>
          <span class="panel-sub">Direct Habit Investment ROI</span>
        </div>
        <div class="outlay-bar-wrap">
          <div class="outlay-progress-rail">
            <div class="outlay-fill-habit" style="width: ${metrics.habitPercentage}%"></div>
            <div class="outlay-fill-general" style="width: ${metrics.generalPercentage}%"></div>
          </div>
          <div class="outlay-legend-row">
            <div class="outlay-legend-item">
              <span class="color-dot habit-dot"></span>
              <span>Habit-Tied Expenses: <strong>$${metrics.habitSpend.toFixed(2)}</strong> (${metrics.habitPercentage}%)</span>
            </div>
            <div class="outlay-legend-item">
              <span class="color-dot general-dot"></span>
              <span>General Expenses: <strong>$${metrics.generalSpend.toFixed(2)}</strong> (${metrics.generalPercentage}%)</span>
            </div>
          </div>
        </div>
      </div>
    `;

    // Render Canvas Charts
    setTimeout(() => {
      analytics.renderHeatmap('chart-heatmap');
      analytics.renderMonthlyBarChart('chart-weekly-bars');
      analytics.renderSpendingDonut('chart-spending-donut', 'donut-legend-container');
      analytics.renderExpenseTrend('chart-spending-trend');
    }, 50);
  }

  // ==========================================
  // 5. WIDGETS SIMULATOR & NATIVE CODE VIEW
  // ==========================================
  renderWidgetsView() {
    const container = document.getElementById('view-widgets');
    if (!container) return;

    container.innerHTML = `
      <div class="view-header">
        <div>
          <h2 class="view-title">Interactive Home Screen Widgets</h2>
          <span class="sub-date">1-Tap Completion via iOS 17 AppIntents & Android RemoteViews</span>
        </div>
      </div>

      <div class="widgets-layout-grid">
        <!-- Interactive Simulated Device -->
        <div class="sim-phone-outer">
          <div id="widgets-simulator-container"></div>
        </div>

        <!-- Native Code Architecture Showcase -->
        <div class="native-code-panel">
          <div class="code-panel-header">
            <h3>📱 Native Mobile Architecture</h3>
            <p>Production Swift (WidgetKit) and Kotlin (Glance / RemoteViews) implementations are fully included in the project directory.</p>
          </div>

          <div class="code-tabs">
            <button class="code-tab-btn active" data-code="swift">iOS 17 WidgetKit (Swift)</button>
            <button class="code-tab-btn" data-code="kotlin">Android RemoteViews (Kotlin)</button>
            <button class="code-tab-btn" data-code="bridge">Local Excel Sync Bridge</button>
          </div>

          <div class="code-content-wrap">
            <pre><code id="code-display-block"></code></pre>
          </div>
        </div>
      </div>
    `;

    this.widgetsSim.render();

    // Code snippet switcher
    const codeBlock = container.querySelector('#code-display-block');
    const updateCode = (type) => {
      if (type === 'swift') {
        codeBlock.textContent = `// iOS 17+ Interactive WidgetKit Implementation
import WidgetKit
import SwiftUI
import AppIntents

struct ToggleHabitIntent: AudioRecordingIntent {
    static var title: LocalizedStringResource = "Toggle Habit Completion"
    
    @Parameter(title: "Log ID")
    var logId: String
    
    func perform() async throws -> some IntentResult {
        // Direct background execution without launching the main app
        let db = LocalDatabaseBridge.shared
        db.toggleTaskStatus(logId: logId)
        
        // Instant bidirectional Excel sync
        ExcelSyncBridge.shared.syncToDeviceStorage()
        
        // Refresh all widget timelines
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}`;
      } else if (type === 'kotlin') {
        codeBlock.textContent = `// Android Glance & RemoteViews Interactive Widget
package com.habittracker.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

class HabitTrackerAppWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            val views = RemoteViews(context.packageName, R.layout.widget_habit_tracker)
            
            // Set 1-tap PendingIntent to complete habit in background
            val intent = Intent(context, WidgetActionReceiver::class.java).apply {
                action = "ACTION_TOGGLE_HABIT"
                putExtra("LOG_ID", logId)
            }
            views.setOnClickPendingIntent(R.id.btn_check_habit, pendingIntent)
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}`;
      } else {
        codeBlock.textContent = `// Local-First Excel Bridge Sync
import { openDocumentFile, saveDocumentFile } from 'react-native-fs';

export async function syncExcelToDeviceStorage(data) {
  const binaryBuffer = generateOpenXmlSpreadsheet(data);
  const path = \`\${DocumentDirectoryPath}/Habit_Expense_Tracker.xlsx\`;
  await writeFile(path, binaryBuffer, 'base64');
  console.log('Instant background sync completed to:', path);
}`;
      }
    };

    updateCode('swift');

    container.querySelectorAll('.code-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.code-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateCode(btn.getAttribute('data-code'));
      });
    });
  }

  // ==========================================
  // MODALS & PROMPTS
  // ==========================================
  bindModals() {
    // Close modal on backdrop or close button click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.classList.contains('btn-modal-close')) {
          overlay.classList.remove('show');
        }
      });
    });

    // Ad-Hoc Task Modal Submission
    const adhocForm = document.getElementById('form-adhoc-task');
    if (adhocForm) {
      adhocForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const dateInput = document.getElementById('adhoc-date-input').value;
        const taskName = document.getElementById('adhoc-name-input').value;
        const notes = document.getElementById('adhoc-notes-input').value;

        if (taskName.trim()) {
          db.addAdHocTask(dateInput, taskName, notes);
          this.closeModal('modal-adhoc');
          adhocForm.reset();
          this.showToast('Added single-day ad-hoc task!', 'success');
        }
      });
    }

    // Expense Modal Submission
    const expenseForm = document.getElementById('form-add-expense');
    if (expenseForm) {
      expenseForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const date = document.getElementById('exp-date-input').value;
        const amount = document.getElementById('exp-amount-input').value;
        const category = document.getElementById('exp-category-input').value;
        const description = document.getElementById('exp-desc-input').value;
        const linkedTaskId = document.getElementById('exp-linked-task-input').value || null;

        if (amount && parseFloat(amount) > 0) {
          db.addExpense({
            date,
            amount: parseFloat(amount),
            category,
            description,
            linkedTaskId
          });
          this.closeModal('modal-expense');
          expenseForm.reset();
          this.showToast(`Logged $${parseFloat(amount).toFixed(2)} for ${category}`, 'success');
        }
      });
    }

    // Import File Dropzone
    const dropzone = document.getElementById('excel-dropzone');
    const fileInput = document.getElementById('excel-file-input');

    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());

      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });

      dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));

      dropzone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
          await this.processImportFile(e.dataTransfer.files[0]);
        }
      });

      fileInput.addEventListener('change', async (e) => {
        if (e.target.files.length > 0) {
          await this.processImportFile(e.target.files[0]);
        }
      });
    }
  }

  async processImportFile(file) {
    try {
      this.showToast(`Importing ${file.name}...`, 'info');
      await excelBridge.importFile(file);
      this.closeModal('modal-import');
      this.showToast('Bidirectional sync restored successfully!', 'success');
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  }

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('show');
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('show');
  }

  openAdHocModal(dateStr) {
    const dateInput = document.getElementById('adhoc-date-input');
    if (dateInput) dateInput.value = dateStr;
    this.openModal('modal-adhoc');
  }

  openExpenseModal(taskMaster = null, dateStr = null) {
    const dateInput = document.getElementById('exp-date-input');
    const catInput = document.getElementById('exp-category-input');
    const taskInput = document.getElementById('exp-linked-task-input');
    const descInput = document.getElementById('exp-desc-input');
    const titleEl = document.getElementById('expense-modal-title');

    if (dateInput) dateInput.value = dateStr || db.getTodayDateString();

    if (taskMaster) {
      if (catInput) catInput.value = taskMaster.linkedExpenseCategory || 'Fitness & Gym';
      if (taskInput) taskInput.value = taskMaster.taskId;
      if (descInput) descInput.value = `${taskMaster.taskName} expense`;
      if (titleEl) titleEl.textContent = `Log Habit Expense: ${taskMaster.taskName}`;
    } else {
      if (taskInput) taskInput.value = '';
      if (descInput) descInput.value = '';
      if (titleEl) titleEl.textContent = 'Log Standalone Expense';
    }

    this.openModal('modal-expense');
  }

  /**
   * Habit-Linked Expense Prompt Modal
   */
  promptHabitLinkedExpense(taskMaster, logId) {
    const modal = document.getElementById('modal-habit-expense-prompt');
    if (!modal) return;

    modal.querySelector('#prompt-task-name').textContent = taskMaster.taskName;
    modal.querySelector('#prompt-category-name').textContent = taskMaster.linkedExpenseCategory;

    const amountInput = modal.querySelector('#prompt-expense-amount');
    const descInput = modal.querySelector('#prompt-expense-desc');
    amountInput.value = '';
    descInput.value = `${taskMaster.taskName} daily item`;

    modal.classList.add('show');

    // Confirm button
    const btnConfirm = modal.querySelector('#btn-confirm-prompt-expense');
    const btnSkip = modal.querySelector('#btn-skip-prompt-expense');

    const handleConfirm = () => {
      const amt = parseFloat(amountInput.value);
      if (amt && amt > 0) {
        db.addExpense({
          date: db.getTodayDateString(),
          amount: amt,
          category: taskMaster.linkedExpenseCategory,
          description: descInput.value,
          linkedTaskId: taskMaster.taskId
        });
        this.showToast(`Logged $${amt.toFixed(2)} for ${taskMaster.taskName}`, 'success');
      }
      modal.classList.remove('show');
      cleanup();
    };

    const handleSkip = () => {
      modal.classList.remove('show');
      cleanup();
    };

    const cleanup = () => {
      btnConfirm.removeEventListener('click', handleConfirm);
      btnSkip.removeEventListener('click', handleSkip);
    };

    btnConfirm.addEventListener('click', handleConfirm);
    btnSkip.addEventListener('click', handleSkip);
  }

  renderMasterTasksModal() {
    const listContainer = document.getElementById('master-tasks-list');
    if (!listContainer) return;

    const tasks = db.getTasksMaster();

    listContainer.innerHTML = tasks.map(t => `
      <div class="master-task-item" data-task-id="${t.taskId}">
        <div class="master-task-left">
          <span class="master-icon">${t.icon || '⭐'}</span>
          <div>
            <div class="master-name">${t.taskName}</div>
            <div class="master-meta">
              <span>Freq: ${t.targetFrequency}</span>
              ${t.linkedExpenseCategory ? `<span>• Linked: ${t.linkedExpenseCategory}</span>` : ''}
            </div>
          </div>
        </div>
        <button class="btn-delete-master" data-task-id="${t.taskId}">Delete</button>
      </div>
    `).join('');

    listContainer.querySelectorAll('.btn-delete-master').forEach(btn => {
      btn.addEventListener('click', () => {
        const taskId = btn.getAttribute('data-task-id');
        if (confirm('Delete this recurring habit from master schedule?')) {
          db.deleteTaskMaster(taskId);
          this.renderMasterTasksModal();
        }
      });
    });

    const form = document.getElementById('form-add-master-task');
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        const name = document.getElementById('master-name-input').value;
        const freq = document.getElementById('master-freq-input').value;
        const cat = document.getElementById('master-category-input').value;
        const icon = document.getElementById('master-icon-input').value || '⚡';

        if (name.trim()) {
          db.addTaskMaster({
            taskName: name,
            targetFrequency: freq,
            linkedExpenseCategory: cat,
            icon
          });
          form.reset();
          this.renderMasterTasksModal();
          this.showToast('Added new recurring habit to master schedule!', 'success');
        }
      };
    }
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-msg toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 400);
    }, 3200);
  }
}

export const ui = new AppUI();

