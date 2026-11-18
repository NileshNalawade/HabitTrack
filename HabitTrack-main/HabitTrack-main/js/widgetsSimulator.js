/**
 * widgetsSimulator.js - Cross-Platform Interactive Home Screen Widget Simulation
 * Faithfully simulates:
 * 1. iOS 17+ WidgetKit with AppIntents (one-tap interactive checkbox toggling)
 * 2. Android Material You RemoteViews / Glance interactive widgets
 * 3. Expense Tracker Quick-Add Widget
 * Bidirectionally synchronized with db.js and the Excel Bridge.
 */

import { db } from './db.js';

export class WidgetsSimulator {
  constructor(onQuickExpenseRequest = null) {
    this.onQuickExpenseRequest = onQuickExpenseRequest;
    this.widgetStyle = 'ios'; // 'ios' or 'android'

    db.subscribe(() => {
      this.render();
    });
  }

  setWidgetStyle(style) {
    this.widgetStyle = style;
    this.render();
  }

  render() {
    const container = document.getElementById('widgets-simulator-container');
    if (!container) return;

    const todayStr = db.getTodayDateString();
    const logs = db.getDailyLogs(todayStr);
    const regularLogs = logs.filter(l => !l.isAdhoc);
    const completedCount = regularLogs.filter(l => l.status === 'Completed').length;
    const totalCount = regularLogs.length;
    const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    // Today's expenses
    const todayExpenses = db.expenses.filter(e => e.date === todayStr);
    const todayExpenseTotal = todayExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const isIos = this.widgetStyle === 'ios';

    container.innerHTML = `
      <div class="simulator-wrapper ${isIos ? 'mode-ios' : 'mode-android'}">
        <!-- Phone Frame Header / Status Bar -->
        <div class="sim-phone-header">
          <span class="sim-time">9:41</span>
          <div class="sim-dynamic-island">
            <span class="sim-island-pill"></span>
          </div>
          <div class="sim-icons">
            <span class="sim-signal">●●●●</span>
            <span class="sim-wifi">📶</span>
            <span class="sim-battery">🔋 98%</span>
          </div>
        </div>

        <div class="sim-style-picker">
          <button class="sim-tab-btn ${isIos ? 'active' : ''}" id="sim-btn-ios">
            <span class="platform-icon"></span> iOS 17 Interactive Widget
          </button>
          <button class="sim-tab-btn ${!isIos ? 'active' : ''}" id="sim-btn-android">
            <span class="platform-icon">🤖</span> Android RemoteViews
          </button>
        </div>

        <!-- Simulated Home Screen Canvas -->
        <div class="sim-home-screen">
          <div class="sim-date-banner">
            <div class="sim-weekday">${new Date().toLocaleDateString('en-US', { weekday: 'long' })}</div>
            <div class="sim-fulldate">${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</div>
          </div>

          <!-- WIDGET 1: Interactive Habit Tracker Widget -->
          <div class="sim-widget habit-widget ${isIos ? 'glass-ios' : 'material-android'}">
            <div class="widget-header">
              <div class="widget-title-area">
                <span class="widget-icon">⚡</span>
                <span class="widget-name">Daily Habits</span>
              </div>
              <div class="widget-progress-badge">
                <span class="progress-num">${percentage}%</span>
              </div>
            </div>

            <!-- Mini Progress Bar -->
            <div class="widget-progress-track">
              <div class="widget-progress-fill" style="width: ${percentage}%"></div>
            </div>

            <!-- Interactive Task List with 1-Tap AppIntent Checkboxes -->
            <div class="widget-task-list">
              ${logs.slice(0, 4).map(log => `
                <div class="widget-task-row ${log.status === 'Completed' ? 'done' : ''}" data-log-id="${log.logId}">
                  <button class="widget-check-btn ${log.status === 'Completed' ? 'checked' : ''}" title="Tap to toggle (iOS AppIntent / Android PendingIntent)">
                    ${log.status === 'Completed' ? '✓' : ''}
                  </button>
                  <span class="widget-task-label">${log.taskName}</span>
                  ${log.isAdhoc ? '<span class="widget-adhoc-pill">Today</span>' : ''}
                </div>
              `).join('')}
              ${logs.length > 4 ? `<div class="widget-more-hint">+${logs.length - 4} more habits in app</div>` : ''}
            </div>

            <div class="widget-footer-caption">
              <span class="intent-badge">⚡ AppIntent Direct Tap</span>
              <span class="sync-dot-live">● Live Sync</span>
            </div>
          </div>

          <!-- WIDGET 2: Interactive Expense Tracker Widget -->
          <div class="sim-widget expense-widget ${isIos ? 'glass-ios' : 'material-android'}">
            <div class="widget-header">
              <div class="widget-title-area">
                <span class="widget-icon">💳</span>
                <span class="widget-name">Today's Spend</span>
              </div>
              <span class="expense-count-pill">${todayExpenses.length} entries</span>
            </div>

            <div class="expense-widget-body">
              <div class="expense-running-total">
                <span class="curr-sign">$</span>
                <span class="amount-val">${todayExpenseTotal.toFixed(2)}</span>
              </div>

              <!-- Direct Quick-Add Button on Widget -->
              <button class="widget-quick-add-btn" id="sim-quick-add-expense-btn">
                <span>+ Log Expense</span>
              </button>
            </div>

            <div class="widget-footer-caption">
              <span class="intent-badge">Instant Deep Link / Quick Sheet</span>
            </div>
          </div>
        </div>

        <div class="sim-app-dock">
          <div class="dock-icon">📞</div>
          <div class="dock-icon">💬</div>
          <div class="dock-icon active-app">⚡</div>
          <div class="dock-icon">⚙️</div>
        </div>
      </div>
    `;

    // Attach Interactive Widget Click Handlers
    container.querySelectorAll('.widget-check-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const row = btn.closest('.widget-task-row');
        const logId = row.getAttribute('data-log-id');
        this.handleWidgetCheckboxClick(btn, logId);
      });
    });

    const quickAddBtn = container.querySelector('#sim-quick-add-expense-btn');
    if (quickAddBtn) {
      quickAddBtn.addEventListener('click', () => {
        if (typeof this.onQuickExpenseRequest === 'function') {
          this.onQuickExpenseRequest();
        }
      });
    }

    const iosBtn = container.querySelector('#sim-btn-ios');
    const androidBtn = container.querySelector('#sim-btn-android');
    if (iosBtn) iosBtn.addEventListener('click', () => this.setWidgetStyle('ios'));
    if (androidBtn) androidBtn.addEventListener('click', () => this.setWidgetStyle('android'));
  }

  handleWidgetCheckboxClick(buttonEl, logId) {
    // Visual tactile feedback simulation
    buttonEl.classList.add('haptic-pulse');
    setTimeout(() => buttonEl.classList.remove('haptic-pulse'), 300);

    // Call underlying db
    db.toggleTaskStatus(logId);
  }
}

