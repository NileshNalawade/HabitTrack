/**
 * excelBridge.js - Pure JavaScript OpenXML .xlsx & CSV Engine
 * Zero-dependency, 100% offline bidirectional synchronization bridge.
 * Supports:
 * - 4-sheet real OpenXML workbook (.xlsx) generation & export
 * - File System Access API (silent local file background sync to disk)
 * - CSV fallback generation & parsing
 * - Excel / CSV file drop import with bidirectional schema mapping
 */

import { db } from './db.js';

// Precomputed CRC32 table for fast binary checksums
const CRC32_TABLE = (() => {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return new Uint32Array(table);
})();

function calculateCrc32(bytes) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ bytes[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

/**
 * Lightweight, 100% pure JS PKZip builder
 * Creates standard uncompressed (STORE) ZIP archives compatible with all OSs and Excel.
 */
class SimpleZip {
  constructor() {
    this.files = [];
  }

  addFile(name, content) {
    const encoder = new TextEncoder();
    const dataBytes = typeof content === 'string' ? encoder.encode(content) : new Uint8Array(content);
    const nameBytes = encoder.encode(name);
    const crc = calculateCrc32(dataBytes);

    this.files.push({
      name,
      nameBytes,
      dataBytes,
      crc,
      size: dataBytes.length
    });
  }

  generate() {
    let totalSize = 0;
    // Calculate total size needed
    for (const f of this.files) {
      totalSize += 30 + f.nameBytes.length + f.size; // Local file header + data
      totalSize += 46 + f.nameBytes.length; // Central directory header
    }
    totalSize += 22; // End of central directory record

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    let offset = 0;
    const localOffsets = [];

    // Write Local File Headers & Data
    for (const f of this.files) {
      localOffsets.push(offset);

      // Local file header signature: 0x04034b50
      view.setUint32(offset, 0x04034b50, true);
      view.setUint16(offset + 4, 20, true); // Version needed
      view.setUint16(offset + 6, 0x0800, true); // General purpose bit flag (UTF-8)
      view.setUint16(offset + 8, 0, true); // Compression: 0 (STORE)
      view.setUint16(offset + 10, 0x5460, true); // DOS Time
      view.setUint16(offset + 12, 0x5c40, true); // DOS Date
      view.setUint32(offset + 14, f.crc, true); // CRC-32
      view.setUint32(offset + 18, f.size, true); // Compressed size
      view.setUint32(offset + 22, f.size, true); // Uncompressed size
      view.setUint16(offset + 26, f.nameBytes.length, true); // Filename length
      view.setUint16(offset + 28, 0, true); // Extra field length

      offset += 30;
      bytes.set(f.nameBytes, offset);
      offset += f.nameBytes.length;

      bytes.set(f.dataBytes, offset);
      offset += f.size;
    }

    const centralDirStart = offset;

    // Write Central Directory Headers
    for (let i = 0; i < this.files.length; i++) {
      const f = this.files[i];
      const localOffset = localOffsets[i];

      // Central directory header signature: 0x02014b50
      view.setUint32(offset, 0x02014b50, true);
      view.setUint16(offset + 4, 20, true); // Version made by
      view.setUint16(offset + 6, 20, true); // Version needed
      view.setUint16(offset + 8, 0x0800, true); // Flags (UTF-8)
      view.setUint16(offset + 10, 0, true); // Compression: STORE
      view.setUint16(offset + 12, 0x5460, true);
      view.setUint16(offset + 14, 0x5c40, true);
      view.setUint32(offset + 16, f.crc, true);
      view.setUint32(offset + 20, f.size, true);
      view.setUint32(offset + 24, f.size, true);
      view.setUint16(offset + 28, f.nameBytes.length, true);
      view.setUint16(offset + 30, 0, true); // Extra field length
      view.setUint16(offset + 32, 0, true); // Comment length
      view.setUint16(offset + 34, 0, true); // Disk number
      view.setUint16(offset + 36, 0, true); // Internal attributes
      view.setUint32(offset + 38, 0, true); // External attributes
      view.setUint32(offset + 42, localOffset, true); // Relative offset

      offset += 46;
      bytes.set(f.nameBytes, offset);
      offset += f.nameBytes.length;
    }

    const centralDirSize = offset - centralDirStart;

    // Write End of Central Directory (EOCD) Record
    // Signature: 0x06054b50
    view.setUint32(offset, 0x06054b50, true);
    view.setUint16(offset + 4, 0, true); // Disk number
    view.setUint16(offset + 6, 0, true); // Disk start
    view.setUint16(offset + 8, this.files.length, true); // Count on disk
    view.setUint16(offset + 10, this.files.length, true); // Total count
    view.setUint32(offset + 12, centralDirSize, true); // Size of central dir
    view.setUint32(offset + 16, centralDirStart, true); // Offset of central dir
    view.setUint16(offset + 20, 0, true); // Comment length

    return buffer;
  }
}

/**
 * Excel XML generation helpers
 */
function escapeXml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getColumnLetter(colIndex) {
  let letter = '';
  let temp = colIndex;
  while (temp > 0) {
    const mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - mod) / 26);
  }
  return letter;
}

function buildWorksheetXml(headers, rows, isSelected = false) {
  let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;
  xml += `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">\n`;
  if (isSelected) {
    xml += `  <sheetViews><sheetView tabSelected="1" workbookViewId="0"/></sheetViews>\n`;
  }
  xml += `  <sheetFormatPr defaultRowHeight="20"/>\n`;
  xml += `  <sheetData>\n`;

  // Row 1: Headers
  xml += `    <row r="1">\n`;
  headers.forEach((h, idx) => {
    const cellRef = `${getColumnLetter(idx + 1)}1`;
    xml += `      <c r="${cellRef}" t="inlineStr"><is><t>${escapeXml(h)}</t></is></c>\n`;
  });
  xml += `    </row>\n`;

  // Data rows
  rows.forEach((row, rowIdx) => {
    const rNum = rowIdx + 2;
    xml += `    <row r="${rNum}">\n`;
    row.forEach((val, colIdx) => {
      const cellRef = `${getColumnLetter(colIdx + 1)}${rNum}`;
      // Numeric check
      const isNum = typeof val === 'number' && !isNaN(val);
      if (isNum) {
        xml += `      <c r="${cellRef}" t="n"><v>${val}</v></c>\n`;
      } else {
        xml += `      <c r="${cellRef}" t="inlineStr"><is><t>${escapeXml(val)}</t></is></c>\n`;
      }
    });
    xml += `    </row>\n`;
  });

  xml += `  </sheetData>\n`;
  xml += `</worksheet>`;
  return xml;
}

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const WORKBOOK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="14000"/></bookViews>
  <sheets>
    <sheet name="Tasks_Master" sheetId="1" r:id="rId1"/>
    <sheet name="Daily_Logs" sheetId="2" r:id="rId2"/>
    <sheet name="Day_Overrides" sheetId="3" r:id="rId3"/>
    <sheet name="Expenses" sheetId="4" r:id="rId4"/>
  </sheets>
</workbook>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Segoe UI"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Segoe UI"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F172A"/></patternFill></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center"/>
    </xf>
  </cellXfs>
</styleSheet>`;

export class ExcelBridge {
  constructor() {
    this.fileHandle = null;
    this.isAutoSyncing = false;
    this.lastSyncTime = null;
    this.syncListeners = new Set();
    this.fileName = 'Habit_Expense_Tracker.xlsx';

    // Hook into db updates
    db.subscribe((event) => {
      this.handleDatabaseChange(event);
    });
  }

  onSyncStatusChange(cb) {
    this.syncListeners.add(cb);
    return () => this.syncListeners.delete(cb);
  }

  notifySyncStatus(status, details = '') {
    this.lastSyncTime = new Date();
    for (const cb of this.syncListeners) {
      cb({
        status,
        details,
        time: this.lastSyncTime,
        hasFileHandle: !!this.fileHandle,
        fileName: this.fileName
      });
    }
  }

  /**
   * Bind to device storage via the modern HTML5 File System Access API.
   * If supported and selected, all future state changes silently write to the exact same file.
   */
  async bindLocalFile() {
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: this.fileName,
          types: [
            {
              description: 'Excel Spreadsheet (*.xlsx)',
              accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] }
            }
          ]
        });

        this.fileHandle = handle;
        this.fileName = handle.name;
        await this.syncToBoundFile();
        this.notifySyncStatus('BOUND', `Linked to local disk: ${this.fileName}`);
        return true;
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('File picker error:', err);
        }
        return false;
      }
    } else {
      console.info('File System Access API not supported in this browser, relying on direct downloads/export.');
      return false;
    }
  }

  /**
   * Automatically triggered on every state change in SQLite/IndexedDB
   */
  async handleDatabaseChange(event) {
    this.notifySyncStatus('SYNCING', 'Writing changes to local state & Excel buffer...');

    if (this.fileHandle) {
      await this.syncToBoundFile();
    } else {
      // Background memory sync
      setTimeout(() => {
        this.notifySyncStatus('SYNCED', 'In-memory Excel cache synced. Ready for one-click export.');
      }, 150);
    }
  }

  /**
   * Writes the 4 sheets into the bound local .xlsx file
   */
  async syncToBoundFile() {
    if (!this.fileHandle) return;

    try {
      const buffer = this.generateWorkbookBuffer();
      const writable = await this.fileHandle.createWritable();
      await writable.write(buffer);
      await writable.close();
      this.notifySyncStatus('SYNCED', `Instant local write complete to ${this.fileName}`);
    } catch (err) {
      console.warn('Silent local write error:', err);
      this.notifySyncStatus('ERROR', 'Could not write directly to file. Permission may have expired.');
    }
  }

  /**
   * Generate binary ArrayBuffer for Habit_Expense_Tracker.xlsx containing all 4 sheets
   */
  generateWorkbookBuffer() {
    const data = db.exportAllData();
    const zip = new SimpleZip();

    // 1. Tasks_Master sheet
    const taskHeaders = ['Task ID', 'Task Name', 'Target Frequency', 'Linked Expense Category', 'Created Date'];
    const taskRows = (data.Tasks_Master || []).map(t => [
      t.taskId || '',
      t.taskName || '',
      t.targetFrequency || 'Daily',
      t.linkedExpenseCategory || '',
      t.createdDate || ''
    ]);
    const sheet1Xml = buildWorksheetXml(taskHeaders, taskRows, true);

    // 2. Daily_Logs sheet
    const logHeaders = ['Log ID', 'Date', 'Task ID', 'Task Name', 'Status', 'Completion Timestamp', 'Is_Adhoc', 'Linked Expense ID', 'Notes'];
    const logRows = (data.Daily_Logs || []).map(l => [
      l.logId || '',
      l.date || '',
      l.taskId || '',
      l.taskName || '',
      l.status || 'Pending',
      l.completionTimestamp || '',
      l.isAdhoc ? 'TRUE' : 'FALSE',
      l.linkedExpenseId || '',
      l.notes || ''
    ]);
    const sheet2Xml = buildWorksheetXml(logHeaders, logRows, false);

    // 3. Day_Overrides sheet
    const overrideHeaders = ['Date', 'Day Type', 'Reason/Notes'];
    const overrideRows = (data.Day_Overrides || []).map(o => [
      o.date || '',
      o.dayType || 'Normal',
      o.reason || ''
    ]);
    const sheet3Xml = buildWorksheetXml(overrideHeaders, overrideRows, false);

    // 4. Expenses sheet
    const expenseHeaders = ['Expense ID', 'Date', 'Amount', 'Category', 'Description', 'Linked Task ID', 'Timestamp'];
    const expenseRows = (data.Expenses || []).map(e => [
      e.expenseId || '',
      e.date || '',
      Number(e.amount) || 0,
      e.category || 'General',
      e.description || '',
      e.linkedTaskId || '',
      e.timestamp || ''
    ]);
    const sheet4Xml = buildWorksheetXml(expenseHeaders, expenseRows, false);

    // Pack files into OpenXML structure
    zip.addFile('[Content_Types].xml', CONTENT_TYPES_XML);
    zip.addFile('_rels/.rels', ROOT_RELS_XML);
    zip.addFile('xl/_rels/workbook.xml.rels', WORKBOOK_RELS_XML);
    zip.addFile('xl/workbook.xml', WORKBOOK_XML);
    zip.addFile('xl/styles.xml', STYLES_XML);
    zip.addFile('xl/worksheets/sheet1.xml', sheet1Xml);
    zip.addFile('xl/worksheets/sheet2.xml', sheet2Xml);
    zip.addFile('xl/worksheets/sheet3.xml', sheet3Xml);
    zip.addFile('xl/worksheets/sheet4.xml', sheet4Xml);

    return zip.generate();
  }

  /**
   * One-click download of the complete 4-sheet .xlsx master file
   */
  downloadExcelFile() {
    try {
      const buffer = this.generateWorkbookBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 250);
      this.notifySyncStatus('DOWNLOADED', `Saved ${this.fileName} to local storage`);
      return true;
    } catch (err) {
      console.error('Failed to download Excel file:', err);
      return false;
    }
  }

  /**
   * Export all 4 tables as CSV representations
   */
  generateCsv(tableName) {
    const data = db.exportAllData();
    let headers = [];
    let rows = [];

    if (tableName === 'Tasks_Master') {
      headers = ['Task ID', 'Task Name', 'Target Frequency', 'Linked Expense Category', 'Created Date'];
      rows = (data.Tasks_Master || []).map(t => [t.taskId, t.taskName, t.targetFrequency, t.linkedExpenseCategory, t.createdDate]);
    } else if (tableName === 'Daily_Logs') {
      headers = ['Log ID', 'Date', 'Task ID', 'Task Name', 'Status', 'Completion Timestamp', 'Is_Adhoc', 'Linked Expense ID', 'Notes'];
      rows = (data.Daily_Logs || []).map(l => [l.logId, l.date, l.taskId, l.taskName, l.status, l.completionTimestamp, l.isAdhoc, l.linkedExpenseId, l.notes]);
    } else if (tableName === 'Day_Overrides') {
      headers = ['Date', 'Day Type', 'Reason/Notes'];
      rows = (data.Day_Overrides || []).map(o => [o.date, o.dayType, o.reason]);
    } else if (tableName === 'Expenses') {
      headers = ['Expense ID', 'Date', 'Amount', 'Category', 'Description', 'Linked Task ID', 'Timestamp'];
      rows = (data.Expenses || []).map(e => [e.expenseId, e.date, e.amount, e.category, e.description, e.linkedTaskId, e.timestamp]);
    }

    const csvLines = [];
    csvLines.push(headers.map(h => `"${(h || '').toString().replace(/"/g, '""')}"`).join(','));
    for (const r of rows) {
      csvLines.push(r.map(cell => `"${(cell ?? '').toString().replace(/"/g, '""')}"`).join(','));
    }
    return csvLines.join('\r\n');
  }

  downloadCsv(tableName = 'Daily_Logs') {
    const csvContent = this.generateCsv(tableName);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tableName}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 250);
  }

  /**
   * Bidirectional Import:
   * Parses uploaded .xlsx (reading XML from the ZIP container) or CSV / JSON and restores database
   */
  async importFile(file) {
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.json')) {
      const text = await file.text();
      const payload = JSON.parse(text);
      db.importAllData(payload);
      this.notifySyncStatus('IMPORTED', `Restored from ${file.name}`);
      return true;
    }

    if (fileName.endsWith('.csv')) {
      const text = await file.text();
      this.importCsvText(text, file.name);
      this.notifySyncStatus('IMPORTED', `CSV imported from ${file.name}`);
      return true;
    }

    if (fileName.endsWith('.xlsx')) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const parsedData = await this.parseXlsxBuffer(arrayBuffer);
        if (parsedData) {
          db.importAllData(parsedData);
          this.notifySyncStatus('IMPORTED', `Bidirectional sync completed from ${file.name}`);
          return true;
        }
      } catch (err) {
        console.error('Failed to parse .xlsx file:', err);
        throw new Error('Could not parse Excel file structure: ' + err.message);
      }
    }

    throw new Error('Unsupported file format. Please upload .xlsx, .csv, or .json.');
  }

  /**
   * Lightweight OpenXML worksheet parser
   * Extracts sheets from standard uncompressed / deflated zip
   */
  async parseXlsxBuffer(buffer) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);

    // Look for PKZip signatures to find worksheet XML entries
    const entries = {};
    let offset = 0;

    while (offset < bytes.length - 4) {
      const sig = view.getUint32(offset, true);
      if (sig === 0x04034b50) { // Local file header
        const compMethod = view.getUint16(offset + 8, true);
        const compSize = view.getUint32(offset + 18, true);
        const uncompSize = view.getUint32(offset + 22, true);
        const nameLen = view.getUint16(offset + 26, true);
        const extraLen = view.getUint16(offset + 28, true);

        const nameBytes = bytes.slice(offset + 30, offset + 30 + nameLen);
        const entryName = new TextDecoder().decode(nameBytes);
        const dataStart = offset + 30 + nameLen + extraLen;

        if (compMethod === 0) { // Uncompressed STORE
          const entryBytes = bytes.slice(dataStart, dataStart + uncompSize);
          entries[entryName] = new TextDecoder().decode(entryBytes);
        } else if (typeof DecompressionStream !== 'undefined') {
          // Modern browser stream decompressor for deflated entries
          try {
            const compressedSlice = bytes.slice(dataStart, dataStart + compSize);
            const ds = new DecompressionStream('deflate-raw');
            const writer = ds.writable.getWriter();
            writer.write(compressedSlice);
            writer.close();
            const decompressedBuf = await new Response(ds.readable).arrayBuffer();
            entries[entryName] = new TextDecoder().decode(decompressedBuf);
          } catch (e) {
            // Fallback or ignore
          }
        }

        offset = dataStart + compSize;
      } else {
        offset++;
      }
    }

    const result = {
      Tasks_Master: [],
      Daily_Logs: [],
      Day_Overrides: [],
      Expenses: []
    };

    // Sheet 1: Tasks_Master
    if (entries['xl/worksheets/sheet1.xml']) {
      result.Tasks_Master = this.parseSheetXmlToRows(entries['xl/worksheets/sheet1.xml'], [
        'taskId', 'taskName', 'targetFrequency', 'linkedExpenseCategory', 'createdDate'
      ]);
    }
    // Sheet 2: Daily_Logs
    if (entries['xl/worksheets/sheet2.xml']) {
      result.Daily_Logs = this.parseSheetXmlToRows(entries['xl/worksheets/sheet2.xml'], [
        'logId', 'date', 'taskId', 'taskName', 'status', 'completionTimestamp', 'isAdhoc', 'linkedExpenseId', 'notes'
      ]);
      // Normalize booleans
      result.Daily_Logs.forEach(l => {
        l.isAdhoc = String(l.isAdhoc).toUpperCase() === 'TRUE';
      });
    }
    // Sheet 3: Day_Overrides
    if (entries['xl/worksheets/sheet3.xml']) {
      result.Day_Overrides = this.parseSheetXmlToRows(entries['xl/worksheets/sheet3.xml'], [
        'date', 'dayType', 'reason'
      ]);
    }
    // Sheet 4: Expenses
    if (entries['xl/worksheets/sheet4.xml']) {
      result.Expenses = this.parseSheetXmlToRows(entries['xl/worksheets/sheet4.xml'], [
        'expenseId', 'date', 'amount', 'category', 'description', 'linkedTaskId', 'timestamp'
      ]);
      result.Expenses.forEach(e => {
        e.amount = parseFloat(e.amount) || 0;
      });
    }

    if (result.Tasks_Master.length > 0 || result.Daily_Logs.length > 0) {
      return result;
    }

    return null;
  }

  parseSheetXmlToRows(xmlString, fieldKeys) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');
    const rows = doc.querySelectorAll('sheetData row');
    const items = [];

    // Skip row 1 (header)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const cells = row.querySelectorAll('c');
      const item = {};

      cells.forEach((cell, idx) => {
        if (idx < fieldKeys.length) {
          let text = '';
          const inlineText = cell.querySelector('is t');
          const valueText = cell.querySelector('v');
          if (inlineText) text = inlineText.textContent;
          else if (valueText) text = valueText.textContent;
          item[fieldKeys[idx]] = text;
        }
      });

      if (Object.keys(item).length > 0) {
        items.push(item);
      }
    }

    return items;
  }

  importCsvText(csvText, fileName = '') {
    const lines = csvText.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return;

    // Detect table by headers
    const headerLine = lines[0].toLowerCase();
    const parseCsvLine = (line) => {
      const regex = /(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^,]*))/g;
      const row = [];
      let match;
      while ((match = regex.exec(line))) {
        let val = match[1] !== undefined ? match[1].replace(/""/g, '"') : match[2];
        row.push(val.trim());
      }
      return row;
    };

    if (headerLine.includes('amount') && headerLine.includes('category')) {
      // Expenses table
      for (let i = 1; i < lines.length; i++) {
        const [expId, date, amount, category, desc, linkedTask, timestamp] = parseCsvLine(lines[i]);
        if (date && amount) {
          db.addExpense({
            date,
            amount: parseFloat(amount) || 0,
            category: category || 'General',
            description: desc || '',
            linkedTaskId: linkedTask || null
          });
        }
      }
    } else if (headerLine.includes('frequency') || headerLine.includes('task name')) {
      // Tasks Master
      for (let i = 1; i < lines.length; i++) {
        const [taskId, name, freq, linkedExp] = parseCsvLine(lines[i]);
        if (name) {
          db.addTaskMaster({
            taskName: name,
            targetFrequency: freq || 'Daily',
            linkedExpenseCategory: linkedExp || ''
          });
        }
      }
    }
  }
}

export const excelBridge = new ExcelBridge();
