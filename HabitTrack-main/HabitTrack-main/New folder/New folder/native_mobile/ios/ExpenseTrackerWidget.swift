//
//  ExpenseTrackerWidget.swift
//  HabitTrack iOS 17+ WidgetKit Implementation
//

import WidgetKit
import SwiftUI
import AppIntents

struct ExpenseWidgetEntry: TimelineEntry {
    let date: Date
    let todayTotal: Double
    let entryCount: Int
}

struct ExpenseTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> ExpenseWidgetEntry {
        ExpenseWidgetEntry(date: Date(), todayTotal: 42.50, entryCount: 3)
    }

    func getSnapshot(in context: Context, completion: @escaping (ExpenseWidgetEntry) -> Void) {
        completion(WidgetDataStore.shared.getTodayExpenseEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ExpenseWidgetEntry>) -> Void) {
        let entry = WidgetDataStore.shared.getTodayExpenseEntry()
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }
}

struct ExpenseTrackerWidgetEntryView: View {
    var entry: ExpenseWidgetEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label("Today's Spend", systemImage: "creditcard.fill")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
                Spacer()
                Text("\(entry.entryCount) items")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(Color(hex: "#94A3B8"))
            }

            Spacer()

            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text("$")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(Color(hex: "#06B6D4"))
                Text(String(format: "%.2f", entry.todayTotal))
                    .font(.system(size: 28, weight: .heavy))
                    .foregroundColor(.white)
            }

            Spacer()

            // Quick Add Shortcut Button (Deep link into app quick sheet)
            Link(destination: URL(string: "habittrack://quick-add-expense")!) {
                HStack {
                    Spacer()
                    Text("+ Add Expense")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(.black)
                    Spacer()
                }
                .padding(.vertical, 7)
                .background(Color(hex: "#06B6D4"))
                .cornerRadius(8)
            }
        }
        .padding(14)
        .containerBackground(Color(hex: "#0F172A"), for: .widget)
    }
}

struct ExpenseTrackerWidget: Widget {
    let kind: String = "ExpenseTrackerWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ExpenseTimelineProvider()) { entry in
            ExpenseTrackerWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Expense Tracker")
        .description("Today's total expenditure with quick-log action.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

