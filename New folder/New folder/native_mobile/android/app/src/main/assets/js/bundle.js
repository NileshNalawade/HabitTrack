/**
 * HabitTrack — bundle.js
 * 100% offline, zero-dependency, single IIFE.
 * Clean separation: Habits are tracked independently; Expenses are standalone.
 * Expense quick-add only asks Item & Amount (Date is auto-set to Today).
 */
(function () {
  'use strict';

  // ── STORAGE KEYS ──────────────────────────────────────────
  var KEYS = {
    TASKS:    'ht_tasks_master',
    LOGS:     'ht_daily_logs',
    OVERRIDES:'ht_day_overrides',
    EXPENSES: 'ht_expenses'
  };

  // ── SEED DATA (Clean, day 0 start) ─────────────────────────
  var SEED_TASKS = [];

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2,'0') + '-' +
      String(d.getDate()).padStart(2,'0');
  }

  function offsetDate(base, days) {
    var d = new Date(base + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2,'0') + '-' +
      String(d.getDate()).padStart(2,'0');
  }

  function seedLogs() {
    return [];
  }

  var SEED_OVERRIDES = [];

  var SEED_EXPENSES = [];

  // ── LOCAL DATABASE ─────────────────────────────────────────
  var db = {
    tasks: [],
    logs: [],
    overrides: [],
    expenses: [],
    _listeners: [],

    init: function() {
      try {
        // Enforce Day 0 clean start (purge any previous dummy seed data)
        if (localStorage.getItem('ht_clean_v3') !== 'true') {
          localStorage.removeItem(KEYS.TASKS);
          localStorage.removeItem(KEYS.LOGS);
          localStorage.removeItem(KEYS.OVERRIDES);
          localStorage.removeItem(KEYS.EXPENSES);
          localStorage.setItem('ht_clean_v3', 'true');
        }

        var st = localStorage.getItem(KEYS.TASKS);
        if (st) {
          this.tasks    = JSON.parse(localStorage.getItem(KEYS.TASKS)    || '[]');
          this.logs     = JSON.parse(localStorage.getItem(KEYS.LOGS)     || '[]');
          this.overrides= JSON.parse(localStorage.getItem(KEYS.OVERRIDES)|| '[]');
          this.expenses = JSON.parse(localStorage.getItem(KEYS.EXPENSES) || '[]');
        } else {
          this.tasks    = [];
          this.logs     = [];
          this.overrides= [];
          this.expenses = [];
        }
        // Normalize any old expense records (item vs description)
        this.expenses.forEach(function(e) {
          if (!e.item && e.description) e.item = e.description;
          if (!e.item) e.item = 'Expense';
        });
        this._createLogsForDate(todayStr());
        this._saveAll();
      } catch(e) {
        console.warn('DB init error:', e);
        this.tasks    = [];
        this.logs     = [];
        this.overrides= [];
        this.expenses = [];
        this._createLogsForDate(todayStr());
      }
    },

    _saveAll: function() {
      try {
        localStorage.setItem(KEYS.TASKS,     JSON.stringify(this.tasks));
        localStorage.setItem(KEYS.LOGS,      JSON.stringify(this.logs));
        localStorage.setItem(KEYS.OVERRIDES, JSON.stringify(this.overrides));
        localStorage.setItem(KEYS.EXPENSES,  JSON.stringify(this.expenses));
        // Real-time sync with native Android Home Screen Widgets if running in APK
        if (window.AndroidBridge && typeof window.AndroidBridge.syncData === 'function') {
          var ds = todayStr();
          var todayHabits = this.logs.filter(function(l){ return l.date === ds; }).map(function(l) {
            return {
              logId: l.logId,
              taskId: l.taskId || '',
              taskName: l.taskName,
              status: l.status,
              isAdhoc: !!l.isAdhoc,
              date: l.date
            };
          });
          var ovr = this.getOverride ? this.getOverride(ds) : null;
          var dayType = ovr ? ovr.dayType : 'Normal';
          window.AndroidBridge.syncData(JSON.stringify(todayHabits), JSON.stringify(this.expenses), dayType);
        } else if (window.AndroidBridge && typeof window.AndroidBridge.notifyDataChanged === 'function') {
          window.AndroidBridge.notifyDataChanged();
        }
      } catch(e) { console.warn('Save failed:', e); }
    },

    _notify: function(evt) {
      this._saveAll();
      var ev = evt || {};
      this._listeners.forEach(function(fn) {
        try { fn(ev); } catch(e) { console.error('Listener error:', e); }
      });
    },

    subscribe: function(fn) {
      this._listeners.push(fn);
    },

    _createLogsForDate: function(ds) {
      var existing = this.logs.filter(function(l){ return l.date === ds; });
      if (existing.length > 0) return;
      var ovr = this.getOverride(ds);
      var isRest = ovr && (ovr.dayType === 'Rest Day' || ovr.dayType === 'Holiday' || ovr.dayType === 'Free Day');
      var self = this;
      this.tasks.forEach(function(t) {
        self.logs.push({
          logId: 'L_' + ds.replace(/-/g,'') + '_' + t.taskId + '_' + Date.now(),
          date: ds,
          taskId: t.taskId,
          taskName: t.taskName,
          status: isRest ? 'Skipped' : 'Pending',
          completionTimestamp: null,
          isAdhoc: false,
          notes: isRest ? ovr.dayType + ' — streak protected' : ''
        });
      });
    },

    getLogsForDate: function(ds) {
      this._createLogsForDate(ds);
      return this.logs.filter(function(l){ return l.date === ds; });
    },

    getOverride: function(ds) {
      var o = this.overrides.find(function(x){ return x.date === ds; });
      return o || { date: ds, dayType: 'Normal', reason: '' };
    },

    setOverride: function(ds, dayType) {
      var idx = this.overrides.findIndex(function(x){ return x.date === ds; });
      if (dayType === 'Normal') {
        if (idx >= 0) this.overrides.splice(idx, 1);
      } else {
        if (idx >= 0) { this.overrides[idx].dayType = dayType; }
        else { this.overrides.push({ date: ds, dayType: dayType, reason: '' }); }
      }
      var isRest = (dayType === 'Rest Day' || dayType === 'Holiday' || dayType === 'Free Day');
      this.logs.forEach(function(l) {
        if (l.date === ds && !l.isAdhoc) {
          if (isRest && l.status === 'Pending') { l.status = 'Skipped'; l.notes = dayType + ' — streak protected'; }
          else if (!isRest && l.status === 'Skipped') { l.status = 'Pending'; l.notes = ''; }
        }
      });
      this._notify({ type: 'OVERRIDE_SET', date: ds });
    },

    toggleTask: function(logId) {
      var log = this.logs.find(function(l){ return l.logId === logId; });
      if (!log) return null;
      var prev = log.status;
      if (log.status === 'Completed') {
        log.status = 'Pending'; log.completionTimestamp = null;
      } else {
        log.status = 'Completed'; log.completionTimestamp = new Date().toISOString();
      }
      this._notify({ type: 'TASK_TOGGLED', logId: logId, taskId: log.taskId, status: log.status, prev: prev });
      return log;
    },

    addAdHoc: function(ds, name, notes) {
      this.logs.push({
        logId: 'ADHOC_' + Date.now(),
        date: ds, taskId: null, taskName: name,
        status: 'Pending', completionTimestamp: null,
        isAdhoc: true, notes: notes || ''
      });
      this._notify({ type: 'ADHOC_ADDED' });
    },

    // Standalone Expense: automatically takes today's date
    addExpense: function(item, amount) {
      var exp = {
        expenseId: 'E_' + Date.now(),
        date: todayStr(), // Always automatically today
        item: item.trim(),
        amount: parseFloat(amount) || 0,
        timestamp: new Date().toISOString()
      };
      this.expenses.unshift(exp);
      this._notify({ type: 'EXPENSE_ADDED' });
      return exp;
    },

    deleteExpense: function(id) {
      this.expenses = this.expenses.filter(function(e){ return e.expenseId !== id; });
      this._notify({ type: 'EXPENSE_DELETED' });
    },

    addTask: function(obj) {
      obj.taskId = 'T_' + Date.now();
      obj.createdDate = todayStr();
      this.tasks.push(obj);
      // Immediately inject into today's daily checklist if today exists
      var today = todayStr();
      var ovr = this.getOverride(today);
      var isRest = ovr && (ovr.dayType === 'Rest Day' || ovr.dayType === 'Holiday' || ovr.dayType === 'Free Day');
      var alreadyInToday = this.logs.some(function(l){ return l.date === today && l.taskId === obj.taskId; });
      if (!alreadyInToday) {
        this.logs.push({
          logId: 'L_' + today.replace(/-/g,'') + '_' + obj.taskId + '_' + Date.now(),
          date: today,
          taskId: obj.taskId,
          taskName: obj.taskName,
          status: isRest ? 'Skipped' : 'Pending',
          completionTimestamp: null,
          isAdhoc: false,
          notes: isRest ? ovr.dayType + ' — streak protected' : ''
        });
      }
      this._notify({ type: 'TASK_MASTER_ADDED' });
    },

    deleteTask: function(id) {
      this.tasks = this.tasks.filter(function(t){ return t.taskId !== id; });
      var today = todayStr();
      this.logs = this.logs.filter(function(l){
        // Preserve any completed logs (today and past) - never wipe completion history
        if (l.taskId === id && l.status === 'Completed') return true;
        // Preserve all historical logs from past days
        if (l.taskId === id && l.date < today) return true;
        // Only remove today's pending/incomplete log
        return l.taskId !== id;
      });
      this._notify({ type: 'TASK_MASTER_DELETED' });
    },

    getTaskById: function(id) {
      return this.tasks.find(function(t){ return t.taskId === id; }) || null;
    },

    getStreaks: function() {
      var today = todayStr();
      var allDates = [];
      var d = new Date(today + 'T12:00:00');
      for (var i = 0; i < 60; i++) {
        allDates.unshift(
          d.getFullYear() + '-' +
          String(d.getMonth()+1).padStart(2,'0') + '-' +
          String(d.getDate()).padStart(2,'0')
        );
        d.setDate(d.getDate() - 1);
      }

      var currentStreak = 0, bestStreak = 0, tempStreak = 0;
      for (var j = 0; j < allDates.length; j++) {
        var ds = allDates[j];
        var ovr = this.getOverride(ds);
        var isRest = ovr.dayType === 'Rest Day' || ovr.dayType === 'Holiday' || ovr.dayType === 'Free Day';
        var dayLogs = this.logs.filter(function(l){ return l.date === ds && !l.isAdhoc; });
        var completed = dayLogs.filter(function(l){ return l.status === 'Completed'; }).length;
        var success = isRest || (dayLogs.length > 0 && completed > 0);
        if (success) {
          tempStreak++;
          if (tempStreak > bestStreak) bestStreak = tempStreak;
        } else {
          if (ds < today) tempStreak = 0;
        }
      }
      currentStreak = tempStreak;
      return { current: currentStreak, best: Math.max(currentStreak, bestStreak) };
    },

    getTodaySpend: function() {
      var today = todayStr();
      return this.expenses
        .filter(function(e){ return e.date === today; })
        .reduce(function(s, e){ return s + (Number(e.amount) || 0); }, 0);
    },

    getTotalSpend: function() {
      return this.expenses.reduce(function(s, e){ return s + (Number(e.amount) || 0); }, 0);
    },

    exportAll: function() {
      return { Tasks_Master: this.tasks, Daily_Logs: this.logs, Day_Overrides: this.overrides, Expenses: this.expenses };
    }
  };

  // ── EXCEL BRIDGE (OpenXML 4-sheet generator) ────────────────
  var excelBridge = {
    fileHandle: null,
    syncCb: null,

    onSyncChange: function(fn) { this.syncCb = fn; },

    _notify: function(msg) {
      if (this.syncCb) this.syncCb(msg);
    },

    triggerSync: function() {
      var self = this;
      if (this.fileHandle) {
        this._writeToBound();
      } else {
        setTimeout(function(){ self._notify('Auto-saved in memory'); }, 80);
      }
    },

    async bindLocalFile() {
      if (!window.showSaveFilePicker) { alert('File System Access API not supported in this browser.'); return false; }
      try {
        this.fileHandle = await window.showSaveFilePicker({
          suggestedName: 'Habit_Expense_Tracker.xlsx',
          types: [{ description: 'Excel Workbook', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }]
        });
        await this._writeToBound();
        return true;
      } catch(e) { return false; }
    },

    async _writeToBound() {
      if (!this.fileHandle) return;
      try {
        var buf = this._buildXlsx();
        var writable = await this.fileHandle.createWritable();
        await writable.write(buf);
        await writable.close();
        this._notify('Saved to ' + this.fileHandle.name);
      } catch(e) { console.warn('Write error:', e); }
    },

    downloadXlsx: function() {
      try {
        var buf = this._buildXlsx();
        var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'Habit_Expense_Tracker.xlsx';
        document.body.appendChild(a); a.click();
        setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 300);
        return true;
      } catch(e) { console.error('Download error:', e); return false; }
    },

    _buildXlsx: function() {
      var data = db.exportAll();
      var zip = new _SimpleZip();

      function esc(v) {
        if (v == null) return '';
        return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      }

      function buildSheet(headers, rows) {
        var cols = headers.map(function(_,i){ return '<col min="'+(i+1)+'" max="'+(i+1)+'" width="20" customWidth="1"/>'; }).join('');
        var xml = '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>'+cols+'</cols><sheetData>';
        var all = [headers].concat(rows);
        all.forEach(function(row, ri) {
          xml += '<row r="'+(ri+1)+'">';
          row.forEach(function(cell, ci) {
            var addr = String.fromCharCode(65+ci)+(ri+1);
            var v = esc(cell);
            if (ri === 0 || typeof cell === 'string') {
              xml += '<c r="'+addr+'" t="inlineStr"><is><t>'+v+'</t></is></c>';
            } else {
              xml += '<c r="'+addr+'"><v>'+v+'</v></c>';
            }
          });
          xml += '</row>';
        });
        xml += '</sheetData></worksheet>';
        return xml;
      }

      var sheet1 = buildSheet(
        ['Task ID','Task Name','Frequency','Created Date'],
        data.Tasks_Master.map(function(t){ return [t.taskId, t.taskName, t.targetFrequency, t.createdDate]; })
      );
      var sheet2 = buildSheet(
        ['Log ID','Date','Task ID','Task Name','Status','Completed At','Is Adhoc','Notes'],
        data.Daily_Logs.map(function(l){ return [l.logId, l.date, l.taskId||'', l.taskName, l.status, l.completionTimestamp||'', l.isAdhoc?'TRUE':'FALSE', l.notes||'']; })
      );
      var sheet3 = buildSheet(
        ['Date','Day Type','Reason'],
        data.Day_Overrides.map(function(o){ return [o.date, o.dayType, o.reason||'']; })
      );
      var sheet4 = buildSheet(
        ['Expense ID','Date','Item Name','Amount','Timestamp'],
        data.Expenses.map(function(e){ return [e.expenseId, e.date, e.item||e.description||'Expense', Number(e.amount)||0, e.timestamp||'']; })
      );

      var ct = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
      var rootRels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
      var wbRels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/></Relationships>';
      var wb = '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Tasks_Master" sheetId="1" r:id="rId1"/><sheet name="Daily_Logs" sheetId="2" r:id="rId2"/><sheet name="Day_Overrides" sheetId="3" r:id="rId3"/><sheet name="Expenses" sheetId="4" r:id="rId4"/></sheets></workbook>';

      zip.add('[Content_Types].xml', ct);
      zip.add('_rels/.rels', rootRels);
      zip.add('xl/_rels/workbook.xml.rels', wbRels);
      zip.add('xl/workbook.xml', wb);
      zip.add('xl/worksheets/sheet1.xml', sheet1);
      zip.add('xl/worksheets/sheet2.xml', sheet2);
      zip.add('xl/worksheets/sheet3.xml', sheet3);
      zip.add('xl/worksheets/sheet4.xml', sheet4);
      return zip.generate();
    }
  };

  // ── SIMPLE ZIP ─────────────────────────────────────────────
  function _SimpleZip() { this.files = []; }
  _SimpleZip.prototype.add = function(name, content) {
    var enc = new TextEncoder();
    var data = enc.encode(content);
    var nameB = enc.encode(name);
    var crc = _crc32(data);
    this.files.push({ name: name, nameB: nameB, data: data, crc: crc });
  };
  _SimpleZip.prototype.generate = function() {
    var files = this.files;
    var totalSz = 0;
    files.forEach(function(f){ totalSz += 30 + f.nameB.length + f.data.length + 46 + f.nameB.length; });
    totalSz += 22;
    var buf = new ArrayBuffer(totalSz);
    var view = new DataView(buf);
    var bytes = new Uint8Array(buf);
    var off = 0, offsets = [];
    files.forEach(function(f) {
      offsets.push(off);
      view.setUint32(off, 0x04034b50, true); view.setUint16(off+4, 20, true);
      view.setUint16(off+6, 0x0800, true);   view.setUint16(off+8, 0, true);
      view.setUint16(off+10, 0, true);        view.setUint16(off+12, 0, true);
      view.setUint32(off+14, f.crc, true);
      view.setUint32(off+18, f.data.length, true);
      view.setUint32(off+22, f.data.length, true);
      view.setUint16(off+26, f.nameB.length, true);
      view.setUint16(off+28, 0, true);
      off += 30;
      bytes.set(f.nameB, off); off += f.nameB.length;
      bytes.set(f.data, off);  off += f.data.length;
    });
    var cdStart = off;
    files.forEach(function(f, i) {
      view.setUint32(off, 0x02014b50, true); view.setUint16(off+4, 20, true);
      view.setUint16(off+6, 20, true);       view.setUint16(off+8, 0, true);
      view.setUint16(off+10, 0x0800, true);  view.setUint16(off+12, 0, true);
      view.setUint16(off+14, 0, true);       view.setUint32(off+16, f.crc, true);
      view.setUint32(off+20, f.data.length, true);
      view.setUint32(off+24, f.data.length, true);
      view.setUint16(off+28, f.nameB.length, true);
      view.setUint16(off+30, 0, true);       view.setUint16(off+32, 0, true);
      view.setUint16(off+34, 0, true);       view.setUint16(off+36, 0, true);
      view.setUint32(off+38, 0, true);       view.setUint32(off+42, offsets[i], true);
      off += 46;
      bytes.set(f.nameB, off); off += f.nameB.length;
    });
    var cdSz = off - cdStart;
    view.setUint32(off, 0x06054b50, true); view.setUint16(off+4, 0, true);
    view.setUint16(off+6, 0, true);        view.setUint16(off+8, files.length, true);
    view.setUint16(off+10, files.length, true);
    view.setUint32(off+12, cdSz, true);   view.setUint32(off+16, cdStart, true);
    view.setUint16(off+20, 0, true);
    return buf;
  };

  var _CRC32_TABLE = (function() {
    var t = new Uint32Array(256), c;
    for (var n = 0; n < 256; n++) {
      c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();

  function _crc32(bytes) {
    var crc = 0 ^ -1;
    for (var i = 0; i < bytes.length; i++) crc = (crc >>> 8) ^ _CRC32_TABLE[(crc ^ bytes[i]) & 0xFF];
    return (crc ^ -1) >>> 0;
  }

  // ── ANALYTICS ENGINE ──────────────────────────────────────
  var analytics = {
    _canvas: function(id) {
      var c = document.getElementById(id);
      if (!c) return null;
      var w = c.parentElement ? c.parentElement.clientWidth : (c.width || 600);
      c.width = Math.max(w, 200);
      var ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      return { ctx: ctx, w: c.width, h: c.height };
    },

    drawHeatmap: function(id) {
      var r = this._canvas(id);
      if (!r) return;
      var ctx = r.ctx, W = r.w, H = r.h;
      var today = todayStr();
      var cols = 13, rows = 7;
      var cellW = (W - 30) / cols, cellH = (H - 14) / rows;
      var days = ['S','M','T','W','T','F','S'];
      days.forEach(function(d, i) {
        ctx.fillStyle = '#4B6180'; ctx.font = '9px sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(d, 26, (i + 0.75) * cellH + 7);
      });
      for (var col = 0; col < cols; col++) {
        for (var row = 0; row < rows; row++) {
          var daysAgo = (cols - 1 - col) * 7 + (6 - row);
          var d2 = new Date(today + 'T12:00:00');
          d2.setDate(d2.getDate() - daysAgo);
          var ds2 = d2.getFullYear()+'-'+String(d2.getMonth()+1).padStart(2,'0')+'-'+String(d2.getDate()).padStart(2,'0');
          var logs = db.logs.filter(function(l){ return l.date === ds2 && !l.isAdhoc; });
          var done = logs.filter(function(l){ return l.status === 'Completed'; }).length;
          var total = logs.length;
          var ovr = db.getOverride(ds2);
          var isRest = ovr.dayType !== 'Normal';
          var rate = total > 0 ? done / total : 0;
          var color;
          if (isRest) color = 'rgba(239, 68, 68, 0.45)'; // Glowy red-tinted rest indicator
          else if (rate >= 0.8) color = '#2563EB';
          else if (rate >= 0.5) color = 'rgba(37,99,235,0.6)';
          else if (rate > 0) color = 'rgba(37,99,235,0.25)';
          else color = 'rgba(255,255,255,0.04)';
          var x = 30 + col * cellW + 1, y = row * cellH + 7 + 1;
          ctx.fillStyle = color;
          var r2 = 2, rw = cellW - 3, rh = cellH - 3;
          ctx.beginPath(); ctx.moveTo(x+r2,y); ctx.lineTo(x+rw-r2,y);
          ctx.quadraticCurveTo(x+rw,y,x+rw,y+r2); ctx.lineTo(x+rw,y+rh-r2);
          ctx.quadraticCurveTo(x+rw,y+rh,x+rw-r2,y+rh); ctx.lineTo(x+r2,y+rh);
          ctx.quadraticCurveTo(x,y+rh,x,y+rh-r2); ctx.lineTo(x,y+r2);
          ctx.quadraticCurveTo(x,y,x+r2,y); ctx.closePath(); ctx.fill();
        }
      }
    },

    drawBars: function(id) {
      var r = this._canvas(id);
      if (!r) return;
      var ctx = r.ctx, W = r.w, H = r.h;
      var weeks = ['Wk -3','Wk -2','Wk -1','This Wk'];
      var today = todayStr();
      var rates = weeks.map(function(_, i) {
        var offset = (3 - i) * 7;
        var total = 0, done = 0;
        for (var d = 0; d < 7; d++) {
          var dt = new Date(today + 'T12:00:00');
          dt.setDate(dt.getDate() - offset + d);
          var ds3 = dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
          var logs = db.logs.filter(function(l){ return l.date === ds3 && !l.isAdhoc; });
          total += logs.length;
          done  += logs.filter(function(l){ return l.status === 'Completed'; }).length;
        }
        return total > 0 ? Math.round((done / total) * 100) : 0;
      });
      var padX = 30, padY = 28, bw = 34;
      var step = (W - padX * 2) / weeks.length;
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(padX, padY, W - padX * 2, H - padY * 2);
      rates.forEach(function(rate, i) {
        var x = padX + i * step + (step - bw) / 2;
        var bh = Math.max(2, (rate / 100) * (H - padY * 2));
        var y = H - padY - bh;
        var grad = ctx.createLinearGradient(0, y, 0, H - padY);
        grad.addColorStop(0, '#2563EB');
        grad.addColorStop(1, '#153580');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, bw, bh, 4) : ctx.rect(x, y, bw, bh);
        ctx.fill();
        ctx.fillStyle = '#E2E8F0'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(rate + '%', x + bw/2, y - 5);
        ctx.fillStyle = '#4B6180'; ctx.font = '9px sans-serif';
        ctx.fillText(weeks[i], x + bw/2, H - padY + 14);
      });
    },

    drawTrend: function(id) {
      var r = this._canvas(id);
      if (!r) return;
      var ctx = r.ctx, W = r.w, H = r.h;
      var today = todayStr();
      var pts = [];
      for (var i = 13; i >= 0; i--) {
        var d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() - i);
        var ds = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
        var total = db.expenses.filter(function(e){ return e.date === ds; })
          .reduce(function(s,e){ return s + (Number(e.amount)||0); }, 0);
        pts.push({ x: 0, y: 0, total: total, label: (d.getMonth()+1)+'/'+d.getDate() });
      }
      var padX = 40, padY = 28;
      var plotW = W - padX*2, plotH = H - padY*2;
      var maxV = Math.max.apply(null, pts.map(function(p){ return p.total; }).concat([30]));
      pts.forEach(function(p, i) {
        p.x = padX + (i / (pts.length - 1)) * plotW;
        p.y = H - padY - (p.total / maxV) * plotH;
      });
      // Gradient fill under curve with a touch of glowy red + blue
      ctx.beginPath(); ctx.moveTo(pts[0].x, H - padY);
      pts.forEach(function(p){ ctx.lineTo(p.x, p.y); });
      ctx.lineTo(pts[pts.length-1].x, H - padY); ctx.closePath();
      var grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, 'rgba(239,68,68,0.22)');
      grad.addColorStop(0.6, 'rgba(37,99,235,0.12)');
      grad.addColorStop(1, 'rgba(37,99,235,0)');
      ctx.fillStyle = grad; ctx.fill();

      // Trend line
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      pts.forEach(function(p){ ctx.lineTo(p.x, p.y); });
      ctx.strokeStyle = '#EF4444'; ctx.lineWidth = 2.2; ctx.stroke();

      // Points & glow
      pts.forEach(function(p, i) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI*2);
        ctx.fillStyle = p.total > 0 ? '#EF4444' : '#1F2D42'; ctx.fill();
        if (i % 2 === 0) {
          ctx.fillStyle = '#4B6180'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(p.label, p.x, H - padY + 14);
        }
        if (p.total > 0) {
          ctx.fillStyle = '#F87171'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('₹'+p.total.toFixed(0), p.x, p.y - 8);
        }
      });
    }
  };

  // ── APP UI ─────────────────────────────────────────────────
  var ui = {
    tab: 'today',
    selDate: todayStr(),
    calYear: new Date().getFullYear(),
    calMonth: new Date().getMonth(),
    widgetStyle: 'android',

    init: function() {
      this._bindNav();
      this._bindTopBar();
      this._bindModals();
      this._bindSync();

      // Check if launched directly in widget mode (e.g. HabitTrack_Widget.exe)
      if (window.location.hash === '#widgets' || window.location.hash === '#widget' || window.location.search.indexOf('widget') !== -1) {
        document.body.classList.add('widget-standalone-mode');
        this.switchTab('widgets');
      }

      var self = this;
      window.addEventListener('hashchange', function() {
        if (window.location.hash === '#widgets' || window.location.hash === '#widget') {
          document.body.classList.add('widget-standalone-mode');
          self.switchTab('widgets');
        }
      });

      db.subscribe(function(evt) {
        ui._onDbChange(evt);
      });

      this._render();
      this._updateHeader();
    },

    switchTab: function(tabName) {
      this.tab = tabName;
      document.querySelectorAll('.bottom-nav-item').forEach(function(b){
        b.classList.toggle('active', b.getAttribute('data-tab') === tabName);
      });
      document.querySelectorAll('.view-container').forEach(function(v){
        v.classList.toggle('active', v.id === 'view-' + tabName);
      });
      this._render();
    },

    _onDbChange: function(evt) {
      this._updateHeader();
      this._render();
      excelBridge.triggerSync();
    },

    _updateHeader: function() {
      var st = db.getStreaks();
      // Match both sets of possible IDs
      var el = document.getElementById('header-streak-count') || document.getElementById('hdr-streak');
      if (el) el.textContent = st.current + 'd';

      var bl = document.getElementById('header-best-streak') || document.getElementById('hdr-best');
      if (bl) bl.textContent = st.best + 'd';

      var sl = document.getElementById('header-today-spend') || document.getElementById('hdr-spend');
      if (sl) sl.textContent = '₹' + db.getTodaySpend().toFixed(2);
    },

    _render: function() {
      switch (this.tab) {
        case 'today':     this._renderToday();     break;
        case 'calendar':  this._renderCalendar();  break;
        case 'expenses':  this._renderExpenses();  break;
        case 'analytics': this._renderAnalytics(); break;
        case 'widgets':   this._renderWidgets();   break;
      }
    },

    _bindNav: function() {
      document.querySelectorAll('.bottom-nav-item').forEach(function(btn) {
        btn.addEventListener('click', function() {
          ui.tab = btn.getAttribute('data-tab');
          document.querySelectorAll('.bottom-nav-item').forEach(function(b){
            b.classList.toggle('active', b === btn);
          });
          document.querySelectorAll('.view-container').forEach(function(v){
            v.classList.toggle('active', v.id === 'view-' + ui.tab);
          });
          ui._render();
        });
      });
    },

    _bindTopBar: function() {
      // Sandwich Drawer Controls
      var menuToggle = document.getElementById('btn-menu-toggle');
      var menuClose = document.getElementById('btn-menu-close');
      var drawer = document.getElementById('sandwich-drawer');
      var backdrop = document.getElementById('sandwich-backdrop');

      var openDrawer = function() {
        if (drawer) drawer.classList.add('open');
        if (backdrop) backdrop.classList.add('open');
      };
      var closeDrawer = function() {
        if (drawer) drawer.classList.remove('open');
        if (backdrop) backdrop.classList.remove('open');
      };

      if (menuToggle) menuToggle.addEventListener('click', openDrawer);
      if (menuClose) menuClose.addEventListener('click', closeDrawer);
      if (backdrop) backdrop.addEventListener('click', closeDrawer);

      // Theme Toggle (Light / Dark)
      var themeBtn = document.getElementById('btn-theme-toggle');
      var applyTheme = function(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('habittrack_theme', theme);
        var labelEl = themeBtn ? themeBtn.querySelector('.drawer-item-label') : null;
        var iconEl = themeBtn ? themeBtn.querySelector('.drawer-item-icon') : null;
        if (labelEl) labelEl.textContent = theme === 'light' ? 'Light Theme Active' : 'Dark Theme Active';
        if (iconEl) iconEl.textContent = theme === 'light' ? '☀️' : '🌙';
      };
      var savedTheme = localStorage.getItem('habittrack_theme') || 'dark';
      applyTheme(savedTheme);
      if (themeBtn) {
        themeBtn.addEventListener('click', function() {
          var cur = document.documentElement.getAttribute('data-theme') || 'dark';
          applyTheme(cur === 'light' ? 'dark' : 'light');
          closeDrawer();
        });
      }

      var dlBtn = document.getElementById('btn-download-xlsx');
      if (dlBtn) dlBtn.addEventListener('click', function() {
        closeDrawer();
        excelBridge.downloadXlsx();
        ui._toast('Exported 4-sheet Habit_Expense_Tracker.xlsx', 'success');
      });

      var bindBtn = document.getElementById('btn-bind-file');
      if (bindBtn) bindBtn.addEventListener('click', async function() {
        closeDrawer();
        var ok = await excelBridge.bindLocalFile();
        if (ok) ui._toast('Bound to local disk file for auto-saving!', 'success');
        else     ui._toast('Bind cancelled or not supported.', 'info');
      });

      var impBtn = document.getElementById('btn-import-modal');
      if (impBtn) impBtn.addEventListener('click', function() {
        closeDrawer();
        ui._openModal('modal-import');
      });

      var habBtn = document.getElementById('btn-manage-master');
      if (habBtn) habBtn.addEventListener('click', function() {
        closeDrawer();
        ui._renderMasterModal();
        ui._openModal('modal-master-tasks');
      });

      var resetBtn = document.getElementById('btn-reset-data');
      if (resetBtn) resetBtn.addEventListener('click', function() {
        closeDrawer();
        if (confirm('Clear all habits & expenses to start fresh from Day 0?')) {
          localStorage.clear();
          localStorage.setItem('ht_clean_v3', 'true');
          db.tasks = [];
          db.logs = [];
          db.overrides = [];
          db.expenses = [];
          db._saveAll();
          ui._render();
          ui._toast('All data cleared. Streaks started from Day 0.', 'info');
        }
      });
    },

    _bindSync: function() {
      excelBridge.onSyncChange(function(msg) {
        var pill = document.getElementById('sync-status-pill');
        var lbl  = document.getElementById('sync-time-label');
        if (pill) { pill.className = 'sync-pill synced'; pill.innerHTML = '<span class="sync-dot active"></span> Excel Synced'; }
        if (lbl)  lbl.textContent = msg;
      });
    },

    _bindModals: function() {
      // Close on overlay click or ×
      document.querySelectorAll('.modal-overlay').forEach(function(ov) {
        ov.addEventListener('click', function(e) {
          if (e.target === ov || e.target.classList.contains('btn-modal-close') || e.target.closest('.btn-modal-close')) {
            ov.classList.remove('show');
          }
        });
      });

      // Ad-Hoc form
      var adhocForm = document.getElementById('form-adhoc-task');
      if (adhocForm) adhocForm.addEventListener('submit', function(e) {
        e.preventDefault();
        var date = document.getElementById('adhoc-date-input').value;
        var name = document.getElementById('adhoc-name-input').value.trim();
        var notes= document.getElementById('adhoc-notes-input').value;
        if (name) {
          db.addAdHoc(date || todayStr(), name, notes);
          ui._closeModal('modal-adhoc');
          adhocForm.reset();
          ui._toast('Ad-hoc task added for today!', 'success');
        }
      });

      // Quick Expense modal form (Item & Amount only, auto today)
      var expForm = document.getElementById('form-add-expense');
      if (expForm) expForm.addEventListener('submit', function(e) {
        e.preventDefault();
        var item   = document.getElementById('exp-item-input').value;
        var amount = parseFloat(document.getElementById('exp-amount-input').value);
        if (item.trim() && amount > 0) {
          db.addExpense(item, amount);
          ui._closeModal('modal-expense');
          expForm.reset();
          ui._toast('Logged ₹' + amount.toFixed(2) + ' for ' + item.trim(), 'success');
        }
      });

      // Import dropzone
      var dropzone = document.getElementById('excel-dropzone');
      var fileInput = document.getElementById('excel-file-input');
      if (dropzone && fileInput) {
        dropzone.addEventListener('click', function() { fileInput.click(); });
        dropzone.addEventListener('dragover', function(e) { e.preventDefault(); dropzone.style.borderColor='#3B82F6'; });
        dropzone.addEventListener('dragleave', function() { dropzone.style.borderColor=''; });
        dropzone.addEventListener('drop', function(e) {
          e.preventDefault(); dropzone.style.borderColor='';
          if (e.dataTransfer.files[0]) ui._importFile(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', function() {
          if (fileInput.files[0]) ui._importFile(fileInput.files[0]);
        });
      }
    },

    _importFile: function(file) {
      if (file.name.endsWith('.json')) {
        var reader = new FileReader();
        reader.onload = function(e) {
          try {
            var data = JSON.parse(e.target.result);
            if (data.Tasks_Master) db.tasks = data.Tasks_Master;
            if (data.Daily_Logs)   db.logs  = data.Daily_Logs;
            if (data.Day_Overrides) db.overrides = data.Day_Overrides;
            if (data.Expenses)     db.expenses = data.Expenses;
            db._notify({ type: 'IMPORT' });
            ui._closeModal('modal-import');
            ui._toast('Restored data successfully!', 'success');
          } catch(err) { ui._toast('Import failed: invalid JSON.', 'error'); }
        };
        reader.readAsText(file);
      } else {
        ui._toast('Upload a JSON backup file.', 'info');
      }
    },

    _openModal: function(id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.classList.add('show');
      if (id === 'modal-expense') {
        var dateEl = document.getElementById('modal-today-date-text');
        if (dateEl) dateEl.textContent = todayStr();
        var itemInp = document.getElementById('exp-item-input');
        if (itemInp) { itemInp.value = ''; setTimeout(function(){ itemInp.focus(); }, 100); }
        var amtInp = document.getElementById('exp-amount-input');
        if (amtInp) amtInp.value = '';
      }
    },

    _closeModal: function(id) { var el = document.getElementById(id); if (el) el.classList.remove('show'); },

    _toast: function(msg, type) {
      var c = document.getElementById('toast-container');
      if (!c) return;
      var t = document.createElement('div');
      t.className = 'toast-msg toast-' + (type||'info');
      t.textContent = msg;
      c.appendChild(t);
      setTimeout(function() {
        t.classList.add('fade-out');
        setTimeout(function(){ if (t.parentNode) t.parentNode.removeChild(t); }, 350);
      }, 2600);
    },

    // ── TODAY VIEW ───────────────────────────────────────────
    _renderToday: function() {
      var con = document.getElementById('view-today');
      if (!con) return;
      var today = todayStr();
      var logs  = db.getLogsForDate(today);
      var ovr   = db.getOverride(today);
      var regular = logs.filter(function(l){ return !l.isAdhoc; });
      var adhoc   = logs.filter(function(l){ return l.isAdhoc; });
      var done  = regular.filter(function(l){ return l.status === 'Completed'; }).length;
      var pct   = regular.length > 0 ? Math.round((done / regular.length) * 100) : 0;
      var isRest = ovr.dayType !== 'Normal';
      var dateFmt = new Date().toLocaleDateString('en-US', { weekday:'long', month:'short', day:'numeric', year:'numeric' });

      con.innerHTML =
        '<div class="view-header">' +
          '<div class="date-meta">' +
            '<h2 class="view-title">Today\'s Habits</h2>' +
            '<span class="sub-date">' + dateFmt + '</span>' +
          '</div>' +
          '<div style="display:flex;gap:6px;align-items:center;">' +
            '<button class="btn-primary-action" id="btn-add-recurring" title="Add a habit tracked daily hereafter">+ Daily Habit</button>' +
            '<button class="btn-secondary-action" id="btn-adhoc-open" title="One-off task for today only">+ Today Only</button>' +
          '</div>' +
        '</div>' +
        '<div class="override-banner' + (isRest ? ' active-rest' : '') + '">' +
          '<div class="override-info">' +
            '<span class="override-badge">' + (isRest ? '🛡️ ' + ovr.dayType + ' — Protected Streak' : '⚡ Normal Training Day') + '</span>' +
            '<span class="override-text">' + (isRest ? 'Rest day activated. Habits do not penalize your streak.' : 'Complete daily recurring habits to keep your streak burning!') + '</span>' +
          '</div>' +
          '<div class="override-controls">' +
            '<label class="switch-label">Mode:</label>' +
            '<select class="override-select" id="mode-select">' +
              '<option value="Normal"'   + (ovr.dayType==='Normal'   ?' selected':'') + '>Normal Day</option>' +
              '<option value="Rest Day"' + (ovr.dayType==='Rest Day' ?' selected':'') + '>Rest Day</option>' +
              '<option value="Holiday"'  + (ovr.dayType==='Holiday'  ?' selected':'') + '>Holiday</option>' +
              '<option value="Free Day"' + (ovr.dayType==='Free Day' ?' selected':'') + '>Free Day</option>' +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="today-progress-card">' +
          '<div class="progress-details">' +
            '<div>' +
              '<span class="progress-headline">' + done + ' of ' + regular.length + ' Habits Done</span>' +
              '<span class="progress-subtext">' + (pct===100 ? '🎉 All habits completed!' : (regular.length - done) + ' remaining today') + '</span>' +
            '</div>' +
            '<span class="progress-percentage-label">' + pct + '%</span>' +
          '</div>' +
          '<div class="progress-bar-rail"><div class="progress-bar-fill" style="width:' + pct + '%"></div></div>' +
        '</div>' +
        '<div class="task-section">' +
          '<div class="section-title-row">' +
            '<h3 class="section-title">Recurring Habits (Tracked Daily)</h3>' +
            '<div style="display:flex;gap:6px;align-items:center;">' +
              '<span class="task-counter">' + regular.length + ' habits</span>' +
              '<button class="btn-secondary-action" id="btn-add-recurring-sec" style="padding:2px 8px;font-size:10px;">⚙️ Manage / + Add</button>' +
            '</div>' +
          '</div>' +
          '<div class="task-cards-list">' +
            regular.map(function(l){ return ui._taskCardHtml(l); }).join('') +
          '</div>' +
        '</div>' +
        (adhoc.length > 0 ?
          '<div class="task-section adhoc-section">' +
            '<div class="section-title-row">' +
              '<h3 class="section-title">Single-Day Tasks</h3>' +
              '<span class="adhoc-counter-badge">' + adhoc.length + ' today only</span>' +
            '</div>' +
            '<div class="task-cards-list">' +
              adhoc.map(function(l){ return ui._taskCardHtml(l, true); }).join('') +
            '</div>' +
          '</div>'
        : '');

      // Checkbox click
      con.querySelectorAll('.task-checkbox-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          db.toggleTask(btn.getAttribute('data-log-id'));
        });
      });

      var modeSelect = con.querySelector('#mode-select');
      if (modeSelect) modeSelect.addEventListener('change', function() {
        db.setOverride(today, modeSelect.value);
      });

      var adhocBtn = con.querySelector('#btn-adhoc-open');
      if (adhocBtn) adhocBtn.addEventListener('click', function() {
        var inp = document.getElementById('adhoc-date-input');
        if (inp) inp.value = today;
        ui._openModal('modal-adhoc');
      });

      // Daily Recurring Habit add triggers
      var openRecurringModal = function() {
        ui._renderMasterModal();
        ui._openModal('modal-master-tasks');
      };
      var addRecBtn = con.querySelector('#btn-add-recurring');
      if (addRecBtn) addRecBtn.addEventListener('click', openRecurringModal);
      var addRecSecBtn = con.querySelector('#btn-add-recurring-sec');
      if (addRecSecBtn) addRecSecBtn.addEventListener('click', openRecurringModal);
    },

    _taskCardHtml: function(log, isAdhoc) {
      var isAd = isAdhoc || log.isAdhoc;
      var tm = !isAd ? db.getTaskById(log.taskId) : null;
      var done   = log.status === 'Completed';
      var skip   = log.status === 'Skipped';
      var icon   = tm ? (tm.icon || '⭐') : '📌';
      var timeLbl = done && log.completionTimestamp
        ? '<span class="timestamp-tag">✓ Done ' + new Date(log.completionTimestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) + '</span>'
        : '';
      var noteLbl = log.notes && !done
        ? '<span class="task-notes-text">' + log.notes + '</span>'
        : '';

      return '<div class="task-card' + (done?' is-completed':'') + (skip?' is-skipped':'') + '" data-log-id="' + log.logId + '">' +
        '<div class="task-card-left">' +
          '<button class="task-checkbox-btn' + (done?' checked':'') + (skip?' skipped':'') + '" data-log-id="' + log.logId + '">' +
            (done ? '✓' : skip ? '⏸' : '') +
          '</button>' +
          '<div class="task-card-info">' +
            '<div class="task-title-line">' +
              '<span class="task-icon">' + icon + '</span>' +
              '<span class="task-name' + (done?' strikethrough':'') + '">' + log.taskName + '</span>' +
              (isAd ? '<span class="adhoc-tag">Today Only</span>' : '') +
            '</div>' +
            (timeLbl || noteLbl ? '<div class="task-subline">' + timeLbl + noteLbl + '</div>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
    },

    // ── CALENDAR VIEW ────────────────────────────────────────
    _renderCalendar: function() {
      var con = document.getElementById('view-calendar');
      if (!con) return;
      var yr = this.calYear, mo = this.calMonth;
      var firstDay = new Date(yr, mo, 1).getDay();
      var daysInMo = new Date(yr, mo + 1, 0).getDate();
      var monthName = new Date(yr, mo, 1).toLocaleDateString('en-US', { month:'long', year:'numeric' });
      var selLogs = db.getLogsForDate(this.selDate);
      var selOvr  = db.getOverride(this.selDate);

      var calDays = Array(firstDay).fill('<div class="cal-day empty"></div>').join('');
      for (var d = 1; d <= daysInMo; d++) {
        var ds = yr + '-' + String(mo+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
        var ovr = db.getOverride(ds);
        var isRest = ovr.dayType !== 'Normal';
        var dayLogs = db.logs.filter(function(l){ return l.date === ds && !l.isAdhoc; });
        var doneCt = dayLogs.filter(function(l){ return l.status === 'Completed'; }).length;
        var isSel = ds === this.selDate;
        calDays += '<div class="cal-day' +
          (isRest ? ' day-rest' : doneCt > 0 ? ' day-complete' : '') +
          (isSel ? ' selected' : '') +
          '" data-date="' + ds + '">' +
          '<span class="day-number">' + d + '</span>' +
          '<div class="day-indicator">' + (isRest ? '★' : doneCt > 0 ? String(doneCt) : '') + '</div>' +
          '</div>';
      }

      con.innerHTML =
        '<div class="view-header">' +
          '<h2 class="view-title">History & Calendar</h2>' +
          '<span class="sub-date">View & log past habits</span>' +
        '</div>' +
        '<div class="calendar-card">' +
          '<div class="calendar-header-nav">' +
            '<button class="cal-nav-btn" id="cal-prev">◀</button>' +
            '<span class="cal-month-title">' + monthName + '</span>' +
            '<button class="cal-nav-btn" id="cal-next">▶</button>' +
          '</div>' +
          '<div class="calendar-weekdays"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div>' +
          '<div class="calendar-grid">' + calDays + '</div>' +
        '</div>' +
        '<div class="history-detail-card">' +
          '<div class="history-detail-header">' +
            '<h3>' + this.selDate + ' &mdash; ' + selOvr.dayType + '</h3>' +
          '</div>' +
          '<div class="task-cards-list">' +
            selLogs.map(function(l){ return ui._taskCardHtml(l, l.isAdhoc); }).join('') +
          '</div>' +
        '</div>';

      con.querySelector('#cal-prev').onclick = function() {
        ui.calMonth--;
        if (ui.calMonth < 0) { ui.calMonth = 11; ui.calYear--; }
        ui._renderCalendar();
      };
      con.querySelector('#cal-next').onclick = function() {
        ui.calMonth++;
        if (ui.calMonth > 11) { ui.calMonth = 0; ui.calYear++; }
        ui._renderCalendar();
      };
      con.querySelectorAll('.cal-day:not(.empty)').forEach(function(el) {
        el.onclick = function() { ui.selDate = el.getAttribute('data-date'); ui._renderCalendar(); };
      });
      con.querySelectorAll('.task-checkbox-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          db.toggleTask(btn.getAttribute('data-log-id'));
        });
      });
    },

    // ── EXPENSES VIEW (Separate & Simple: Item & Amount, Date auto today) ─
    _renderExpenses: function() {
      var con = document.getElementById('view-expenses');
      if (!con) return;
      var today = todayStr();
      var all = db.expenses.slice();
      var todaySpend = db.getTodaySpend();
      var totalSpend = db.getTotalSpend();

      con.innerHTML =
        '<div class="view-header">' +
          '<div>' +
            '<h2 class="view-title">Expenses Ledger</h2>' +
            '<span class="sub-date">Separate standalone financial logging</span>' +
          '</div>' +
          '<button class="btn-primary-action btn-red-glow" id="btn-open-exp-modal">+ Quick Log</button>' +
        '</div>' +

        // Metric cards with subtle red glow
        '<div class="expense-metrics-grid">' +
          '<div class="metric-card glow-card-red">' +
            '<span class="metric-title">🔥 Today\'s Spend</span>' +
            '<span class="metric-value red-accent-text">₹' + todaySpend.toFixed(2) + '</span>' +
          '</div>' +
          '<div class="metric-card">' +
            '<span class="metric-title">💳 Total Outlay</span>' +
            '<span class="metric-value">₹' + totalSpend.toFixed(2) + '</span>' +
          '</div>' +
          '<div class="metric-card">' +
            '<span class="metric-title">📝 Logged Items</span>' +
            '<span class="metric-value" style="color:var(--silver)">' + all.length + '</span>' +
          '</div>' +
        '</div>' +

        // Instant Quick-Add Bar right inside the Expense tab:
        '<div class="quick-expense-box">' +
          '<div class="quick-exp-header">' +
            '<span>⚡ Add Expense for <strong>Today (' + today + ')</strong></span>' +
          '</div>' +
          '<form id="form-inline-expense" class="quick-exp-form">' +
            '<input type="text" class="form-input quick-exp-item" id="inline-exp-item" placeholder="Item name (e.g. Coffee, Lunch, Fuel, Gym)" required>' +
            '<input type="number" step="0.01" min="0.01" class="form-input quick-exp-amount" id="inline-exp-amount" placeholder="₹ Amount" required>' +
            '<button type="submit" class="btn-primary-action btn-red-glow quick-exp-btn">+ Add</button>' +
          '</form>' +
        '</div>' +

        // Ledger of recent items
        '<div class="ledger-container glow-border-subtle">' +
          '<div class="ledger-header-row">' +
            '<span>Item</span>' +
            '<span>Date</span>' +
            '<span class="text-right">Amount</span>' +
            '<span class="text-center">Action</span>' +
          '</div>' +
          '<div class="ledger-body">' +
            (all.length > 0 ? all.map(function(e){
              var isToday = (e.date === today);
              return '<div class="ledger-row">' +
                '<div class="ledger-item-col">' +
                  '<span class="ledger-item-name">' + (e.item || e.description || 'Expense') + '</span>' +
                  (isToday ? '<span class="today-tag-pill">Today</span>' : '') +
                '</div>' +
                '<span class="ledger-date">' + e.date + '</span>' +
                '<span class="ledger-amount red-accent-amount">₹' + Number(e.amount).toFixed(2) + '</span>' +
                '<span class="text-center"><button class="btn-delete-expense" data-id="' + e.expenseId + '" title="Delete">✕</button></span>' +
              '</div>';
            }).join('') :
            '<div style="padding:32px;text-align:center;color:var(--text-m);font-size:12px;">No expenses logged yet. Use the quick box above to add your first expense!</div>'
            ) +
          '</div>' +
        '</div>';

      // Inline quick expense submit
      var inlineForm = con.querySelector('#form-inline-expense');
      if (inlineForm) {
        inlineForm.onsubmit = function(e) {
          e.preventDefault();
          var itemInp = con.querySelector('#inline-exp-item');
          var amtInp  = con.querySelector('#inline-exp-amount');
          var item = itemInp.value.trim();
          var amt  = parseFloat(amtInp.value);
          if (item && amt > 0) {
            db.addExpense(item, amt);
            itemInp.value = '';
            amtInp.value = '';
            itemInp.focus();
            ui._toast('Added ₹' + amt.toFixed(2) + ' for ' + item, 'success');
          }
        };
      }

      con.querySelector('#btn-open-exp-modal').onclick = function() {
        ui._openModal('modal-expense');
      };

      con.querySelectorAll('.btn-delete-expense').forEach(function(btn) {
        btn.onclick = function() { db.deleteExpense(btn.getAttribute('data-id')); };
      });
    },

    // ── ANALYTICS VIEW ───────────────────────────────────────
    _renderAnalytics: function() {
      var con = document.getElementById('view-analytics');
      if (!con) return;
      var st = db.getStreaks();
      var totalLogs = db.logs.filter(function(l){ return !l.isAdhoc; });
      var totalDone = totalLogs.filter(function(l){ return l.status==='Completed'; }).length;
      var rate = totalLogs.length > 0 ? Math.round((totalDone/totalLogs.length)*100) : 0;
      var totalSpend = db.getTotalSpend();

      con.innerHTML =
        '<div class="view-header">' +
          '<h2 class="view-title">Performance Analytics</h2>' +
          '<span class="sub-date">Habit consistency & expenditure trends</span>' +
        '</div>' +
        '<div class="analytics-hero-grid">' +
          '<div class="streak-card current glow-red-box">' +
            '<div class="streak-icon-wrap glow-flame">🔥</div>' +
            '<div class="streak-details">' +
              '<span class="streak-val red-neon-val">' + st.current + ' Days</span>' +
              '<span class="streak-title">Current Active Streak</span>' +
            '</div>' +
          '</div>' +
          '<div class="streak-card best">' +
            '<div class="streak-icon-wrap">🏆</div>' +
            '<div class="streak-details">' +
              '<span class="streak-val best">' + st.best + ' Days</span>' +
              '<span class="streak-title">All-Time Best Streak</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="analytics-hero-grid" style="margin-bottom:14px;">' +
          '<div class="streak-card">' +
            '<div class="streak-icon-wrap">✅</div>' +
            '<div class="streak-details">' +
              '<span class="streak-val" style="color:var(--emerald)">' + totalDone + '</span>' +
              '<span class="streak-title">Total Habits Done</span>' +
            '</div>' +
          '</div>' +
          '<div class="streak-card">' +
            '<div class="streak-icon-wrap">💳</div>' +
            '<div class="streak-details">' +
              '<span class="streak-val red-neon-val">₹' + totalSpend.toFixed(2) + '</span>' +
              '<span class="streak-title">Total Money Logged</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="chart-panel">' +
          '<h3 class="panel-title" style="margin-bottom:10px;">Consistency Heatmap — Last 13 Weeks</h3>' +
          '<div class="canvas-wrapper"><canvas id="chart-heatmap" height="110"></canvas></div>' +
        '</div>' +
        '<div class="chart-panel" style="margin-bottom:14px;">' +
          '<h3 class="panel-title" style="margin-bottom:10px;">Weekly Completion Rate</h3>' +
          '<div class="canvas-wrapper"><canvas id="chart-bars" height="150"></canvas></div>' +
        '</div>' +
        '<div class="chart-panel glow-card-red">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
            '<h3 class="panel-title">14-Day Expenditure Trend</h3>' +
            '<span style="font-size:10px;color:var(--red-neon)">● Daily Spend (₹)</span>' +
          '</div>' +
          '<div class="canvas-wrapper"><canvas id="chart-trend" height="160"></canvas></div>' +
        '</div>';

      setTimeout(function() {
        analytics.drawHeatmap('chart-heatmap');
        analytics.drawBars('chart-bars');
        analytics.drawTrend('chart-trend');
      }, 40);
    },

    // ── WIDGETS VIEW ─────────────────────────────────────────
    _renderWidgets: function() {
      var con = document.getElementById('view-widgets');
      if (!con) return;
      var today = todayStr();
      var logs  = db.getLogsForDate(today).filter(function(l){ return !l.isAdhoc; });
      // Fallback if no logs yet
      if (!logs.length) {
        db._createLogsForDate(today);
        logs = db.logs.filter(function(l){ return l.date === today && !l.isAdhoc; });
      }
      var done  = logs.filter(function(l){ return l.status==='Completed'; }).length;
      var pct   = logs.length > 0 ? Math.round((done/logs.length)*100) : 0;
      var spend = db.getTodaySpend();
      var isAndroid = (ui.widgetStyle === 'android');

      con.innerHTML =
        '<div class="view-header">' +
          '<div>' +
            '<h2 class="view-title">Interactive Home Screen Widgets</h2>' +
            '<span class="sub-date">Live 1-Tap Checkboxes &amp; Quick-Add Spend (Click tasks to toggle)</span>' +
          '</div>' +
          '<div style="display:flex;gap:6px;">' +
            '<button class="sim-tab-btn' + (isAndroid?' active':'') + '" id="btn-style-android">🤖 Android (Material You)</button>' +
            '<button class="sim-tab-btn' + (!isAndroid?' active':'') + '" id="btn-style-ios">🍎 iOS 17+ (Glassmorphism)</button>' +
          '</div>' +
        '</div>' +
        '<div class="widgets-layout-grid">' +
          '<div class="sim-phone-outer glow-phone">' +
            '<div class="sim-device-header">' +
              '<span style="font-size:10px;font-weight:600;color:var(--silver-d);">' + (isAndroid ? 'Android 14 Launcher' : 'iOS 17 Home Screen') + '</span>' +
              '<span style="font-size:9.5px;color:var(--text-m);">' + today + '</span>' +
            '</div>' +
            '<div class="widget-phone-screen ' + (isAndroid ? 'mode-android' : 'mode-ios') + '">' +
              '<!-- Widget 1: Habit Tracker Widget -->' +
              '<div class="widget-box widget-habit-box">' +
                '<div class="widget-title-row">' +
                  '<div style="display:flex;align-items:center;gap:6px;">' +
                    '<span style="font-size:14px;">⚡</span>' +
                    '<span class="widget-title">Daily Habits</span>' +
                  '</div>' +
                  '<span class="widget-badge-progress">' + done + ' / ' + logs.length + ' (' + pct + '%)</span>' +
                '</div>' +
                '<div class="widget-tasks-list">' +
                  logs.slice(0, 5).map(function(l) {
                    var isCompleted = l.status === 'Completed';
                    return '<div class="widget-task-interactive" data-log-id="' + l.logId + '" title="Tap to toggle">' +
                      '<div class="widget-check-box' + (isCompleted ? ' is-done' : '') + '">' +
                        (isCompleted ? '✓' : '') +
                      '</div>' +
                      '<span class="widget-task-label' + (isCompleted ? ' text-strikethrough' : '') + '">' + l.taskName + '</span>' +
                    '</div>';
                  }).join('') +
                '</div>' +
                '<div class="widget-progress-rail">' +
                  '<div class="widget-progress-fill" style="width:' + pct + '%;"></div>' +
                '</div>' +
              '</div>' +
              '<!-- Widget 2: Standalone Expense Tracker Widget -->' +
              '<div class="widget-box widget-expense-box glow-card-red">' +
                '<div class="widget-title-row">' +
                  '<div style="display:flex;align-items:center;gap:6px;">' +
                    '<span style="font-size:14px;">💳</span>' +
                    '<span class="widget-title">Today\'s Spend</span>' +
                  '</div>' +
                  '<span class="widget-badge-red">Live Total</span>' +
                '</div>' +
                '<div class="widget-expense-amount red-accent-text">₹' + spend.toFixed(2) + '</div>' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">' +
                  '<span style="font-size:9.5px;color:var(--text-m);">' + (db.expenses.filter(function(e){ return e.date===today; }).length) + ' items today</span>' +
                  '<button class="widget-action-btn btn-red-glow" id="widget-add-exp-btn">+ Add Expense</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="native-code-panel">' +
            '<div class="code-panel-header">' +
              '<h3>📱 Native Widget Architecture</h3>' +
              '<p>Configured in <code>/native_mobile/android</code> & <code>/native_mobile/ios</code></p>' +
            '</div>' +
            '<div class="code-content-wrap">' +
              '<pre><code>// Android RemoteViews 1-Tap Toggle\nclass WidgetActionReceiver : BroadcastReceiver() {\n  override fun onReceive(ctx: Context, intent: Intent) {\n    val logId = intent.getStringExtra("EXTRA_LOG_ID")\n    WidgetDataHelper.toggleHabit(ctx, logId)\n    // Instantly refreshes launcher widget without opening main UI\n    AppWidgetManager.getInstance(ctx).updateAppWidget(...)\n  }\n}\n\n// iOS 17+ WidgetKit AppIntent\nstruct ToggleHabitIntent: AppIntent {\n  @Parameter(title: "Log ID") var logId: String\n  func perform() async throws -> some IntentResult {\n    WidgetDataStore.shared.toggle(logId)\n    WidgetCenter.shared.reloadAllTimelines()\n    return .result()\n  }\n}</code></pre>' +
            '</div>' +
          '</div>' +
        '</div>';

      // Style switchers
      var btnAndroid = con.querySelector('#btn-style-android');
      if (btnAndroid) btnAndroid.onclick = function() { ui.widgetStyle = 'android'; ui._renderWidgets(); };
      var btnIos = con.querySelector('#btn-style-ios');
      if (btnIos) btnIos.onclick = function() { ui.widgetStyle = 'ios'; ui._renderWidgets(); };

      // Interactive 1-tap checkbox toggles inside widget preview
      con.querySelectorAll('.widget-task-interactive').forEach(function(row) {
        row.onclick = function(e) {
          e.stopPropagation();
          var logId = row.getAttribute('data-log-id');
          db.toggleTask(logId);
        };
      });

      // Quick add expense inside widget preview
      var widgetBtn = con.querySelector('#widget-add-exp-btn');
      if (widgetBtn) widgetBtn.onclick = function() { ui._openModal('modal-expense'); };
    },

    // ── MASTER HABITS MODAL ──────────────────────────────────
    _renderMasterModal: function() {
      var list = document.getElementById('master-tasks-list');
      if (!list) return;
      list.innerHTML = db.tasks.map(function(t) {
        return '<div class="master-task-item">' +
          '<div class="master-task-left">' +
            '<span>' + (t.icon||'⭐') + '</span>' +
            '<strong>' + t.taskName + '</strong>' +
            '<span style="font-size:10px;color:var(--text-m);">(' + t.targetFrequency + ')</span>' +
          '</div>' +
          '<button class="btn-delete-master" data-tid="' + t.taskId + '">Delete</button>' +
        '</div>';
      }).join('') || '<div style="color:var(--text-m);font-size:12px;padding:8px 0;">No recurring habits configured.</div>';

      list.querySelectorAll('.btn-delete-master').forEach(function(btn) {
        btn.onclick = function() { db.deleteTask(btn.getAttribute('data-tid')); ui._renderMasterModal(); };
      });

      var form = document.getElementById('form-add-master-task');
      if (form) {
        form.onsubmit = function(e) {
          e.preventDefault();
          var name = document.getElementById('master-name-input').value.trim();
          var icon = document.getElementById('master-icon-input').value.trim() || '⭐';
          var freq = document.getElementById('master-freq-input').value;
          if (name) {
            db.addTask({ taskName:name, icon:icon, targetFrequency:freq });
            form.reset();
            document.getElementById('master-icon-input').value = '⭐';
            ui._renderMasterModal();
            ui._toast('Added habit to recurring daily schedule!', 'success');
          }
        };
      }
    }
  };

  // ── TWO-WAY NATIVE WIDGET SYNCHRONIZER ─────────────────────
  window.syncFromNativeWidget = function() {
    if (!window.AndroidBridge) return;
    try {
      var changed = false;

      // 1. Ingest any habit checkbox toggles clicked on home screen widget
      if (typeof window.AndroidBridge.getPendingToggles === 'function') {
        var togglesStr = window.AndroidBridge.getPendingToggles();
        if (togglesStr && togglesStr !== '{}') {
          var toggles = JSON.parse(togglesStr);
          for (var logId in toggles) {
            var newStatus = toggles[logId];
            var targetLog = db.logs.find(function(l){ return l.logId === logId; });
            if (targetLog && targetLog.status !== newStatus) {
              targetLog.status = newStatus;
              targetLog.completionTimestamp = (newStatus === 'Completed' ? new Date().toISOString() : null);
              changed = true;
            }
          }
          if (typeof window.AndroidBridge.clearPendingToggles === 'function') {
            window.AndroidBridge.clearPendingToggles();
          }
        }
      }

      // 2. Ingest any expenses logged directly from widget
      if (typeof window.AndroidBridge.getPendingExpenses === 'function') {
        var expStr = window.AndroidBridge.getPendingExpenses();
        if (expStr && expStr !== '[]') {
          var pendingExpenses = JSON.parse(expStr);
          if (Array.isArray(pendingExpenses) && pendingExpenses.length > 0) {
            pendingExpenses.forEach(function(pe) {
              db.expenses.unshift({
                expenseId: pe.expenseId || ('E_' + Date.now()),
                date: pe.date || todayStr(),
                item: pe.item || 'Quick Expense',
                amount: parseFloat(pe.amount) || 0,
                timestamp: pe.timestamp || new Date().toISOString()
              });
            });
            changed = true;
            if (typeof window.AndroidBridge.clearPendingExpenses === 'function') {
              window.AndroidBridge.clearPendingExpenses();
            }
          }
        }
      }

      if (changed) {
        db._saveAll();
        if (window.ui && typeof window.ui._render === 'function') {
          window.ui._render();
        }
      }
    } catch(err) {
      console.warn('Native widget sync error:', err);
    }
  };

  // ── BOOTSTRAP ─────────────────────────────────────────────
  function startApp() {
    try {
      db.init();
      ui.init();
      window.syncFromNativeWidget();
      excelBridge._notify('Habit_Expense_Tracker.xlsx ready');
      console.log('✅ HabitTrack loaded smoothly.');
    } catch(e) {
      console.error('Fatal boot error:', e);
      document.body.innerHTML = '<div style="color:#EF4444;padding:40px;font-family:sans-serif;">' +
        '<h2>Startup Error</h2><pre>' + e.message + '</pre></div>';
    }
  }

  // Expose for Android WebView & deep linking
  window.ui = ui;
  window.db = db;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
  } else {
    startApp();
  }

})();
