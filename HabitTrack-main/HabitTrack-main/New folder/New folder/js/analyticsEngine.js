/**
 * analyticsEngine.js - In-App Analytics & Visual Canvas Charts
 * 100% Offline-first, Zero-dependency Retina Canvas Renderers:
 * 1. Consistency Heatmap (GitHub-style 12-week matrix with Rest Day indicators)
 * 2. Category Spending Donut Chart with center total & legend
 * 3. Daily / Weekly Expense Trend Line Chart
 * 4. Monthly Habit Completion Percentage Bar Chart
 * 5. Habit-Tied vs. General Outlay Comparison Breakdown
 */

import { db } from './db.js';

export class AnalyticsEngine {
  constructor() {
    this.colorPalette = [
      '#10B981', '#06B6D4', '#8B5CF6', '#F59E0B', 
      '#EC4899', '#3B82F6', '#14B8A6', '#F43F5E'
    ];
  }

  getMetrics() {
    const streaks = db.calculateStreaks();
    const expenses = db.getExpenses();

    // Calculate total spend
    const totalSpend = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    // Habit linked vs General
    const habitLinkedExpenses = expenses.filter(e => !!e.linkedTaskId);
    const generalExpenses = expenses.filter(e => !e.linkedTaskId);

    const habitSpend = habitLinkedExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const generalSpend = generalExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const habitPercentage = totalSpend > 0 ? Math.round((habitSpend / totalSpend) * 100) : 0;
    const generalPercentage = totalSpend > 0 ? 100 - habitPercentage : 0;

    return {
      currentStreak: streaks.currentStreak,
      bestStreak: streaks.bestStreak,
      completionRate: streaks.completionRate,
      totalCompleted: streaks.totalCompleted,
      totalSpend,
      habitSpend,
      generalSpend,
      habitPercentage,
      generalPercentage
    };
  }

  /**
   * Helper to set high-DPI scaling on Canvas
   */
  setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || canvas.width;
    const height = rect.height || canvas.height;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return { ctx, width, height };
  }

  /**
   * 1. Render GitHub-style Consistency Heatmap (past 12-14 weeks)
   */
  renderHeatmap(canvasId, tooltipContainerId = null) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const { ctx, width, height } = this.setupCanvas(canvas);

    ctx.clearRect(0, 0, width, height);

    // Prepare 12 weeks of data (84 days) ending today
    const numDays = 84;
    const days = [];
    const today = new Date(db.getTodayDateString());

    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];

      const override = db.getDayOverride(dateStr);
      const isRestOrHoliday = override.dayType === 'Rest Day' || override.dayType === 'Holiday' || override.dayType === 'Free Day';
      const logs = db.dailyLogs.filter(l => l.date === dateStr && !l.isAdhoc);
      const completed = logs.filter(l => l.status === 'Completed').length;
      const total = logs.length;
      const rate = total > 0 ? completed / total : 0;

      days.push({
        date: dateStr,
        dayOfWeek: d.getDay(), // 0 = Sun, 1 = Mon...
        completed,
        total,
        rate,
        isRestOrHoliday,
        overrideType: override.dayType
      });
    }

    const numCols = 12;
    const numRows = 7;
    const paddingLeft = 32;
    const paddingTop = 24;
    const cellSize = Math.floor((width - paddingLeft - 20) / numCols) - 4;
    const gap = 4;

    // Day of week labels on left
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#64748B';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    [1, 3, 5].forEach(dayIdx => {
      const y = paddingTop + dayIdx * (cellSize + gap) + cellSize / 2;
      ctx.fillText(dayLabels[dayIdx], paddingLeft - 8, y);
    });

    // Render cells
    days.forEach((day, idx) => {
      const col = Math.floor(idx / 7);
      const row = idx % 7;
      const x = paddingLeft + col * (cellSize + gap);
      const y = paddingTop + row * (cellSize + gap);

      // Color based on completion rate
      let cellColor = '#1E293B'; // empty
      if (day.isRestOrHoliday) {
        cellColor = '#F59E0B'; // Amber for rest day (protected)
      } else if (day.rate >= 0.99) {
        cellColor = '#10B981'; // 100% emerald
      } else if (day.rate >= 0.6) {
        cellColor = '#059669'; // 60-90%
      } else if (day.rate >= 0.3) {
        cellColor = '#047857'; // 30-60%
      } else if (day.rate > 0) {
        cellColor = '#064E3B'; // 1-30%
      }

      ctx.fillStyle = cellColor;
      this.drawRoundedRect(ctx, x, y, cellSize, cellSize, 3);
      ctx.fill();

      // Rest Day golden star or dot
      if (day.isRestOrHoliday) {
        ctx.fillStyle = '#FEF3C7';
        ctx.beginPath();
        ctx.arc(x + cellSize / 2, y + cellSize / 2, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Month headers
    ctx.fillStyle = '#94A3B8';
    ctx.textAlign = 'left';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('Consistency Heatmap (Last 12 Weeks)', paddingLeft, 12);
  }

  /**
   * 2. Category Spending Donut Chart
   */
  renderSpendingDonut(canvasId, legendId = null) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const { ctx, width, height } = this.setupCanvas(canvas);

    ctx.clearRect(0, 0, width, height);

    const expenses = db.getExpenses();
    const categoryTotals = {};

    expenses.forEach(e => {
      const cat = e.category || 'General';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + (Number(e.amount) || 0);
    });

    const categories = Object.keys(categoryTotals).sort((a, b) => categoryTotals[b] - categoryTotals[a]);
    const totalAmount = categories.reduce((sum, c) => sum + categoryTotals[c], 0);

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(centerX, centerY) - 20;
    const innerRadius = radius * 0.62;

    if (totalAmount === 0 || categories.length === 0) {
      // Empty state
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = radius - innerRadius;
      ctx.stroke();

      ctx.fillStyle = '#64748B';
      ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No expenses yet', centerX, centerY);
      return;
    }

    let startAngle = -Math.PI / 2;
    const legendItems = [];

    categories.forEach((cat, idx) => {
      const amount = categoryTotals[cat];
      const sliceAngle = (amount / totalAmount) * Math.PI * 2;
      const endAngle = startAngle + sliceAngle;
      const color = this.colorPalette[idx % this.colorPalette.length];

      ctx.beginPath();
      ctx.arc(centerX, centerY, (radius + innerRadius) / 2, startAngle, endAngle);
      ctx.strokeStyle = color;
      ctx.lineWidth = radius - innerRadius;
      ctx.stroke();

      startAngle = endAngle;

      legendItems.push({
        category: cat,
        amount,
        percentage: Math.round((amount / totalAmount) * 100),
        color
      });
    });

    // Center total text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#F8FAFC';
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`$${totalAmount.toFixed(2)}`, centerX, centerY - 6);

    ctx.fillStyle = '#94A3B8';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText('TOTAL SPENT', centerX, centerY + 14);

    // Update HTML legend if container provided
    if (legendId) {
      const legendEl = document.getElementById(legendId);
      if (legendEl) {
        legendEl.innerHTML = legendItems.map(item => `
          <div class="donut-legend-item">
            <span class="legend-color-dot" style="background-color: ${item.color};"></span>
            <span class="legend-name">${item.category}</span>
            <span class="legend-amount">$${item.amount.toFixed(2)} (${item.percentage}%)</span>
          </div>
        `).join('');
      }
    }
  }

  /**
   * 3. Expenditure Trend Line Chart (Past 14 Days)
   */
  renderExpenseTrend(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const { ctx, width, height } = this.setupCanvas(canvas);

    ctx.clearRect(0, 0, width, height);

    const numDays = 14;
    const today = new Date(db.getTodayDateString());
    const dataPoints = [];

    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayExpenses = db.expenses.filter(e => e.date === dateStr);
      const total = dayExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

      dataPoints.push({
        date: dateStr,
        dayLabel: `${d.getMonth() + 1}/${d.getDate()}`,
        total
      });
    }

    const paddingX = 40;
    const paddingY = 30;
    const plotWidth = width - paddingX * 2;
    const plotHeight = height - paddingY * 2;

    const maxVal = Math.max(...dataPoints.map(p => p.total), 50);

    // Draw horizontal grid lines
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 1;
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = '#64748B';
    ctx.textAlign = 'right';

    for (let i = 0; i <= 3; i++) {
      const val = Math.round((maxVal / 3) * i);
      const y = height - paddingY - (i / 3) * plotHeight;

      ctx.beginPath();
      ctx.moveTo(paddingX, y);
      ctx.lineTo(width - paddingX, y);
      ctx.stroke();

      ctx.fillText(`$${val}`, paddingX - 8, y + 3);
    }

    // Points calculation
    const points = dataPoints.map((p, idx) => {
      const x = paddingX + (idx / (dataPoints.length - 1)) * plotWidth;
      const y = height - paddingY - (p.total / maxVal) * plotHeight;
      return { x, y, ...p };
    });

    // Draw Gradient Area Under Curve
    const gradient = ctx.createLinearGradient(0, paddingY, 0, height - paddingY);
    gradient.addColorStop(0, 'rgba(6, 182, 212, 0.35)');
    gradient.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

    ctx.beginPath();
    ctx.moveTo(points[0].x, height - paddingY);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, height - paddingY);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw Trend Line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = '#06B6D4';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Draw circles on points
    points.forEach((p, idx) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = p.total > 0 ? '#06B6D4' : '#334155';
      ctx.fill();
      ctx.strokeStyle = '#0B0F17';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // X-axis date labels every 3 days
      if (idx % 3 === 0 || idx === points.length - 1) {
        ctx.fillStyle = '#94A3B8';
        ctx.textAlign = 'center';
        ctx.fillText(p.dayLabel, p.x, height - paddingY + 16);
      }
    });
  }

  /**
   * 4. Monthly Habit Completion Percentage Bar Chart
   */
  renderMonthlyBarChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const { ctx, width, height } = this.setupCanvas(canvas);

    ctx.clearRect(0, 0, width, height);

    // Group last 4 weeks into weekly bars
    const weeks = [];
    const today = new Date(db.getTodayDateString());

    for (let w = 3; w >= 0; w--) {
      let completed = 0;
      let total = 0;
      for (let d = 0; d < 7; d++) {
        const date = new Date(today);
        date.setDate(date.getDate() - (w * 7 + d));
        const dStr = date.toISOString().split('T')[0];

        const override = db.getDayOverride(dStr);
        const isRest = override.dayType === 'Rest Day' || override.dayType === 'Holiday';

        const logs = db.dailyLogs.filter(l => l.date === dStr && !l.isAdhoc);
        if (isRest) {
          completed += logs.length; // Rest day preserved
        } else {
          completed += logs.filter(l => l.status === 'Completed').length;
        }
        total += logs.length;
      }

      const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
      weeks.push({
        label: w === 0 ? 'This Wk' : `Wk -${w}`,
        rate
      });
    }

    const paddingX = 35;
    const paddingY = 25;
    const barWidth = 28;
    const availWidth = width - paddingX * 2;
    const step = availWidth / weeks.length;

    // Target 80% line
    const targetY = height - paddingY - (0.80 * (height - paddingY * 2));
    ctx.strokeStyle = '#F59E0B';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(paddingX, targetY);
    ctx.lineTo(width - paddingX, targetY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#F59E0B';
    ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Target (80%)', width - paddingX, targetY - 4);

    // Draw Bars
    weeks.forEach((wk, i) => {
      const x = paddingX + i * step + (step - barWidth) / 2;
      const barHeight = (wk.rate / 100) * (height - paddingY * 2);
      const y = height - paddingY - barHeight;

      // Color: emerald if >= 80%, cyan otherwise
      const grad = ctx.createLinearGradient(0, y, 0, height - paddingY);
      if (wk.rate >= 80) {
        grad.addColorStop(0, '#10B981');
        grad.addColorStop(1, '#047857');
      } else {
        grad.addColorStop(0, '#06B6D4');
        grad.addColorStop(1, '#0891B2');
      }

      ctx.fillStyle = grad;
      this.drawRoundedRect(ctx, x, y, barWidth, barHeight, 4);
      ctx.fill();

      // Percentage label on top of bar
      ctx.fillStyle = '#F8FAFC';
      ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${wk.rate}%`, x + barWidth / 2, y - 6);

      // Week label
      ctx.fillStyle = '#94A3B8';
      ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(wk.label, x + barWidth / 2, height - paddingY + 16);
    });
  }

  drawRoundedRect(ctx, x, y, width, height, radius) {
    if (height <= 0) return;
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

export const analytics = new AnalyticsEngine();

