# Cross-Platform Offline Habit & Expense Tracker with Local Excel Sync & Interactive Widgets

A high-performance, **100% offline-first** habit and personal finance tracking system with **automatic bidirectional Excel (.xlsx) background synchronization** and **interactive home screen widgets** (utilizing iOS 17+ App Intents and Android RemoteViews).

---

## 🌟 Key Architecture & Highlights

- **100% Offline-First**: Zero external API calls, zero cloud telemetry, and zero mandatory network dependencies.
- **Local Database & Excel File Bridge**: Instant local SQLite/IndexedDB persistence accompanied by continuous, automatic background writes to a user-accessible spreadsheet (`Habit_Expense_Tracker.xlsx`) stored directly in device storage.
- **Bi-directional Spreadsheet Sync**: Supports one-click `.xlsx` export, real-time File System Access API disk streaming, and an import engine that parses modified `.xlsx` workbooks back into the relational schema.
- **Automated Recurring Tasks**: Automatically generates daily habits at `00:00` without manual re-entry.
- **Single-Day Ad-Hoc Items**: Floating "+ Today Only" feature that injects single-date tasks (`isAdhoc: true`) without polluting the master recurring schedule.
- **Rest Day / Holiday Mode**: Protects and preserves active streaks during scheduled rest days or holidays without penalizing completion rates.
- **Integrated Habit-Linked Expenses**: Prompt modal automatically triggers upon completing habit tasks with associated categories (e.g., Gym Day Pass, Meal Prep, Supplements).
- **Interactive Home Screen Widgets**:
  - **Habit Tracker Widget**: Live completion progress ring and interactive **1-tap checkboxes** (powered by iOS 17+ `AppIntent` & Android `RemoteViews` / `Glance`) to mark habits complete directly from the home screen without opening the app.
  - **Expense Tracker Widget**: Live running total expenditure with instant "+ Add Expense" shortcut action.
- **Retina In-App Visual Analytics**: High-contrast GitHub-style 12-week consistency heatmaps, category-wise spending donut chart, 14-day spending trend curves, and habit-tied vs. general outlay comparisons.

---

## 📂 Project Structure

```text
📁 New folder/
├── index.html                   # High-contrast dark mode application entrypoint
├── css/
│   └── styles.css               # Fluid glassmorphic dark-theme styles & widget simulator
├── js/
│   ├── app.js                   # Application bootstrap and module orchestrator
│   ├── db.js                    # Local-first relational database engine & streak calculation
│   ├── excelBridge.js           # Pure JavaScript OpenXML .xlsx & CSV engine with File System API
│   ├── analyticsEngine.js       # High-DPI canvas charts (Heatmap, Donut, Trends, Bars)
│   ├── widgetsSimulator.js      # Interactive simulated iOS 17 & Android widget engine
│   ├── ui.js                    # View routing, tab handling, modals, and event listeners
│   └── seedData.js              # 14-day pre-populated historical logs and default master habits
├── native_mobile/
│   ├── ios/
│   │   ├── HabitTrackerWidget.swift   # iOS 17+ WidgetKit with AppIntent 1-tap toggling
│   │   └── ExpenseTrackerWidget.swift # Running total spend widget with deep-linking
│   ├── android/
│   │   ├── HabitWidgetProvider.kt     # Android RemoteViews AppWidgetProvider
│   │   ├── WidgetActionReceiver.kt    # Background BroadcastReceiver for 1-tap toggles
│   │   └── ExpenseWidgetProvider.kt   # Android expense total widget
│   ├── react_native/
│   │   ├── Database.ts                # SQLite schema & local queries
│   │   └── ExcelSyncService.ts        # Expo FileSystem background .xlsx bridge
│   └── flutter/
│       └── lib/services/
│           └── excel_sync_service.dart# Flutter Excel package background sync
└── README.md
```

---

## 📊 4-Sheet Data Schema Specification

The master spreadsheet (`Habit_Expense_Tracker.xlsx`) and local database implement the following relational schema:

### 1. `Tasks_Master`
| Column Name | Type | Description |
| :--- | :--- | :--- |
| `Task ID` | TEXT (PK) | Unique identifier (e.g., `TASK_001`) |
| `Task Name` | TEXT | Display title of the habit |
| `Target Frequency` | TEXT | `Daily`, `Weekdays`, or `Weekends` |
| `Linked Expense Category`| TEXT (Nullable) | Category prompted upon completion (e.g., `Fitness & Gym`) |
| `Created Date` | TEXT (ISO) | `YYYY-MM-DD` |

### 2. `Daily_Logs`
| Column Name | Type | Description |
| :--- | :--- | :--- |
| `Log ID` | TEXT (PK) | Unique log ID (e.g., `LOG_20261103_TASK_001`) |
| `Date` | TEXT (ISO) | Date of log (`YYYY-MM-DD`) |
| `Task ID` | TEXT (FK) | Reference to `Tasks_Master.taskId` or `ADHOC_xxx` |
| `Task Name` | TEXT | Snapshot of task name at log time |
| `Status` | TEXT | `Pending`, `Completed`, or `Skipped` |
| `Completion Timestamp` | TEXT (Nullable) | ISO 8601 completion timestamp |
| `Is_Adhoc` | BOOLEAN | `TRUE` for "+ Today Only" items; `FALSE` for recurring |
| `Linked Expense ID` | TEXT (Nullable) | Reference to `Expenses.expenseId` |
| `Notes` | TEXT | Specific notes for the day |

### 3. `Day_Overrides`
| Column Name | Type | Description |
| :--- | :--- | :--- |
| `Date` | TEXT (PK) | `YYYY-MM-DD` |
| `Day Type` | TEXT | `Normal`, `Rest Day`, `Holiday`, `Free Day` |
| `Reason/Notes` | TEXT | Description for the override |

### 4. `Expenses`
| Column Name | Type | Description |
| :--- | :--- | :--- |
| `Expense ID` | TEXT (PK) | Unique identifier (e.g., `EXP_20261103_001`) |
| `Date` | TEXT (ISO) | `YYYY-MM-DD` |
| `Amount` | REAL | Numerical expenditure amount |
| `Category` | TEXT | Spending category |
| `Description` | TEXT | Memo / purchase description |
| `Linked Task ID` | TEXT (Nullable) | Reference to `Tasks_Master.taskId` if habit-tied |
| `Timestamp` | TEXT (ISO) | ISO 8601 creation timestamp |

---

## ⚡ How to Run & Test the Application

### 1. Instant Desktop / Browser Execution
1. Simply double-click **`index.html`** or open it in Google Chrome / Edge:
   ```powershell
   Start-Process chrome.exe "c:\Users\nilesh.nalawade\Desktop\New folder\index.html"
   ```
2. The app will immediately load in high-contrast dark mode with pre-seeded historical logs, dynamic streaks, and charts.
3. Test all features:
   - **Today View**: Toggle habit checkboxes, see the progress bar update, switch day mode to `Rest Day`, and add single-day ad-hoc tasks.
   - **Excel Sync**: Click **`📥 Export .xlsx`** to download `Habit_Expense_Tracker.xlsx`. Or click **`💾 Bind Disk File`** to bind a local file for silent background auto-save.
   - **Expenses View**: Filter by category, view habit-linked vs. general spend, and log expenses.
   - **Interactive Widgets**: Navigate to the **Widgets** tab to test the simulated iOS 17 / Android interactive widget. Tap checkboxes on the simulated widget and observe real-time updates in the database and Today view!

---

## 📱 Native Mobile Integration (iOS & Android)

The `native_mobile/` directory contains ready-to-use production modules:

- **iOS 17+ WidgetKit (`native_mobile/ios/HabitTrackerWidget.swift`)**:
  - Implements `ToggleHabitIntent: AppIntent` for one-tap checklist toggles directly from the home screen without opening the main app.
  - Updates shared `AppGroup` storage and triggers `WidgetCenter.shared.reloadTimelines()`.
- **Android RemoteViews (`native_mobile/android/HabitWidgetProvider.kt`)**:
  - Uses `PendingIntent.getBroadcast` coupled with `WidgetActionReceiver.kt` to update the local SQLite database in the background.
- **Local File Sync (`native_mobile/react_native/ExcelSyncService.ts`)**:
  - Exports the 4 sheets into `FileSystem.documentDirectory` upon every state change.

