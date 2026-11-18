//
//  HabitTrackerWidget.swift
//  HabitTrack iOS 17+ Interactive WidgetKit Implementation
//

import WidgetKit
import SwiftUI
import AppIntents

// MARK: - 1. AppIntent for Direct 1-Tap Toggle (Background Execution)
@available(iOS 17.0, *)
struct ToggleHabitIntent: AppIntent {
    static var title: LocalizedStringResource = "Toggle Habit Completion"
    static var description = IntentDescription("Toggles a habit completion status directly from the Home Screen widget without opening the app.")

    @Parameter(title: "Log ID")
    var logId: String

    init() {}

    init(logId: String) {
        self.logId = logId
    }

    func perform() async throws -> some IntentResult {
        // Access App Group shared container for local SQLite & Excel bridge
        let sharedContainer = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.habittracker.app")
        
        // Execute instant SQLite status toggle
        WidgetDataStore.shared.toggleHabit(logId: logId)
        
        // Background sync to local Habit_Expense_Tracker.xlsx
        ExcelBridgeNative.shared.syncLocalExcelFile()

        // Invalidate timeline so widget updates immediately
        WidgetCenter.shared.reloadTimelines(ofKind: "HabitTrackerWidget")
        
        return .result()
    }
}

// MARK: - 2. Timeline Provider
struct HabitTimelineProvider: TimelineProvider {
    typealias Entry = HabitWidgetEntry

    func placeholder(in context: Context) -> HabitWidgetEntry {
        HabitWidgetEntry(date: Date(), tasks: [
            WidgetTask(id: "1", name: "Wake up at 6:00 AM", isCompleted: true),
            WidgetTask(id: "2", name: "Gym Strength Training", isCompleted: false),
            WidgetTask(id: "3", name: "Clean Diet & Nutrition", isCompleted: false)
        ], completionPercentage: 33)
    }

    func getSnapshot(in context: Context, completion: @escaping (HabitWidgetEntry) -> Void) {
        let entry = WidgetDataStore.shared.getTodayHabitEntry()
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HabitWidgetEntry>) -> Void) {
        let entry = WidgetDataStore.shared.getTodayHabitEntry()
        // Refresh every 30 minutes or immediately upon intent trigger
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }
}

// MARK: - 3. Widget Entry Model
struct HabitWidgetEntry: TimelineEntry {
    let date: Date
    let tasks: [WidgetTask]
    let completionPercentage: Int
}

struct WidgetTask: Identifiable {
    let id: String
    let name: String
    let isCompleted: Bool
}

// MARK: - 4. Interactive Widget View (SwiftUI)
struct HabitTrackerWidgetEntryView: View {
    var entry: HabitTimelineProvider.Entry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header: Title & Progress Bar
            HStack {
                Label("Daily Habits", systemImage: "bolt.fill")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
                
                Spacer()
                
                Text("\(entry.completionPercentage)%")
                    .font(.system(size: 12, weight: .heavy))
                    .foregroundColor(Color(hex: "#10B981"))
            }

            // Progress Bar
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color.white.opacity(0.12))
                    
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color(hex: "#10B981"))
                        .frame(width: geo.size.width * CGFloat(entry.completionPercentage) / 100.0)
                }
            }
            .frame(height: 6)

            Divider().background(Color.white.opacity(0.1))

            // Task List with 1-Tap iOS 17 Button
            VStack(spacing: 6) {
                ForEach(entry.tasks.prefix(3)) { task in
                    HStack(spacing: 8) {
                        if #available(iOS 17.0, *) {
                            Button(intent: ToggleHabitIntent(logId: task.id)) {
                                Image(systemName: task.isCompleted ? "checkmark.circle.fill" : "circle")
                                    .font(.system(size: 18))
                                    .foregroundColor(task.isCompleted ? Color(hex: "#10B981") : Color.gray)
                            }
                            .buttonStyle(.plain)
                        } else {
                            Image(systemName: task.isCompleted ? "checkmark.circle.fill" : "circle")
                                .font(.system(size: 18))
                                .foregroundColor(task.isCompleted ? Color(hex: "#10B981") : Color.gray)
                        }

                        Text(task.name)
                            .font(.system(size: 12, weight: .medium))
                            .strikethrough(task.isCompleted)
                            .foregroundColor(task.isCompleted ? .gray : .white)
                            .lineLimit(1)

                        Spacer()
                    }
                    .padding(.vertical, 2)
                }
            }
        }
        .padding(14)
        .containerBackground(Color(hex: "#0F172A"), for: .widget)
    }
}

// MARK: - 5. Widget Configuration
struct HabitTrackerWidget: Widget {
    let kind: String = "HabitTrackerWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: HabitTimelineProvider()) { entry in
            HabitTrackerWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Habit Tracker")
        .description("Interactive 1-tap habit checklist and daily completion progress.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

