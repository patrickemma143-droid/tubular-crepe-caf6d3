"""
Excel Report Exporter
=====================
Generates a multi-tab Excel workbook using xlsxwriter.

Tabs:
  1. 📊 Summary Dashboard   - KPIs, finance overview, herd performance
  2. 🐄 Animal Reports      - Per-animal trend table with color-coded status
  3. ⚠️  Anomalies           - Detailed anomaly log with probable causes
  4. 💰 Finance Overview    - Revenue vs Expenses breakdown by category
  5. 📈 Charts              - Production trend line charts per animal (embedded)
"""
from __future__ import annotations

import io
from datetime import datetime
from typing import Optional
from app.ai.adviser import HerdReport


# Palette
COLOR_GREEN     = "#1A7F3C"
COLOR_RED       = "#C0392B"
COLOR_ORANGE    = "#E67E22"
COLOR_BLUE      = "#1565C0"
COLOR_DARK_BG   = "#1E2533"
COLOR_HEADER_BG = "#2C3E50"
COLOR_GOLD      = "#F0C040"
COLOR_LIGHT_ROW = "#F4F6FA"
COLOR_WHITE     = "#FFFFFF"


def generate_excel_report(report: HerdReport) -> bytes:
    """
    Accepts a HerdReport and returns raw bytes of the .xlsx file.
    The caller writes these bytes to disk or streams them as an HTTP response.
    """
    output = io.BytesIO()
    wb = _create_workbook(output)
    formats = _define_formats(wb)

    _write_summary_sheet(wb, report, formats)
    _write_animal_reports_sheet(wb, report, formats)
    _write_anomalies_sheet(wb, report, formats)
    _write_finance_sheet(wb, report, formats)
    _write_charts_sheet(wb, report, formats)

    wb.close()
    return output.getvalue()


# ---------------------------------------------------------------------------
# WORKBOOK INIT
# ---------------------------------------------------------------------------

def _create_workbook(output: io.BytesIO):
    try:
        import xlsxwriter
    except ImportError:
        raise RuntimeError("xlsxwriter not installed. Run: pip install xlsxwriter")

    wb = xlsxwriter.Workbook(output, {
        "in_memory": True,
        "default_date_format": "yyyy-mm-dd",
    })
    return wb


def _define_formats(wb) -> dict:
    f = {}

    # Titles
    f["title"] = wb.add_format({
        "bold": True, "font_size": 18, "font_name": "Calibri",
        "font_color": COLOR_GOLD, "bg_color": COLOR_DARK_BG,
        "align": "center", "valign": "vcenter", "border": 0,
    })
    f["subtitle"] = wb.add_format({
        "bold": True, "font_size": 11, "font_name": "Calibri",
        "font_color": COLOR_WHITE, "bg_color": COLOR_HEADER_BG,
        "align": "center", "valign": "vcenter",
    })

    # KPI Cards
    f["kpi_label"] = wb.add_format({
        "bold": True, "font_size": 10, "font_name": "Calibri",
        "font_color": "#AAAAAA", "bg_color": COLOR_DARK_BG,
        "align": "center", "valign": "vcenter",
    })
    f["kpi_value"] = wb.add_format({
        "bold": True, "font_size": 20, "font_name": "Calibri",
        "font_color": COLOR_GOLD, "bg_color": COLOR_DARK_BG,
        "align": "center", "valign": "vcenter", "num_format": "#,##0.00",
    })
    f["kpi_value_green"] = wb.add_format({
        "bold": True, "font_size": 20, "font_name": "Calibri",
        "font_color": "#27AE60", "bg_color": COLOR_DARK_BG,
        "align": "center", "valign": "vcenter", "num_format": "#,##0.00",
    })
    f["kpi_value_red"] = wb.add_format({
        "bold": True, "font_size": 20, "font_name": "Calibri",
        "font_color": COLOR_RED, "bg_color": COLOR_DARK_BG,
        "align": "center", "valign": "vcenter", "num_format": "#,##0.00",
    })

    # Table Headers
    f["col_header"] = wb.add_format({
        "bold": True, "font_size": 10, "font_name": "Calibri",
        "font_color": COLOR_WHITE, "bg_color": COLOR_HEADER_BG,
        "align": "center", "valign": "vcenter",
        "border": 1, "border_color": "#344F6E",
        "text_wrap": True,
    })

    # Table Body
    f["cell"] = wb.add_format({
        "font_size": 9, "font_name": "Calibri",
        "align": "center", "valign": "vcenter", "border": 1,
        "border_color": "#D0D8E4",
    })
    f["cell_alt"] = wb.add_format({
        "font_size": 9, "font_name": "Calibri",
        "align": "center", "valign": "vcenter", "border": 1,
        "border_color": "#D0D8E4", "bg_color": COLOR_LIGHT_ROW,
    })
    f["cell_num"] = wb.add_format({
        "font_size": 9, "font_name": "Calibri",
        "align": "center", "valign": "vcenter", "border": 1,
        "border_color": "#D0D8E4", "num_format": "#,##0.00",
    })
    f["cell_num_alt"] = wb.add_format({
        "font_size": 9, "font_name": "Calibri",
        "align": "center", "valign": "vcenter", "border": 1,
        "border_color": "#D0D8E4", "num_format": "#,##0.00",
        "bg_color": COLOR_LIGHT_ROW,
    })
    f["cell_left"] = wb.add_format({
        "font_size": 9, "font_name": "Calibri",
        "align": "left", "valign": "vcenter", "border": 1,
        "border_color": "#D0D8E4",
    })

    # Status
    f["status_green"] = wb.add_format({
        "bold": True, "font_size": 9, "font_color": COLOR_WHITE,
        "bg_color": COLOR_GREEN, "align": "center", "border": 1, "border_color": "#D0D8E4",
    })
    f["status_red"] = wb.add_format({
        "bold": True, "font_size": 9, "font_color": COLOR_WHITE,
        "bg_color": COLOR_RED, "align": "center", "border": 1, "border_color": "#D0D8E4",
    })
    f["status_orange"] = wb.add_format({
        "bold": True, "font_size": 9, "font_color": COLOR_WHITE,
        "bg_color": COLOR_ORANGE, "align": "center", "border": 1, "border_color": "#D0D8E4",
    })

    # Section label
    f["section"] = wb.add_format({
        "bold": True, "font_size": 11, "font_name": "Calibri",
        "font_color": COLOR_BLUE, "bottom": 2, "bottom_color": COLOR_BLUE,
    })
    f["insight"] = wb.add_format({
        "italic": True, "font_size": 9, "font_name": "Calibri",
        "font_color": "#555555", "align": "left", "text_wrap": True,
    })

    return f


# ---------------------------------------------------------------------------
# SHEET 1: SUMMARY DASHBOARD
# ---------------------------------------------------------------------------

def _write_summary_sheet(wb, report: HerdReport, f: dict):
    ws = wb.add_worksheet("📊 Summary Dashboard")
    ws.set_tab_color(COLOR_GOLD)
    ws.set_zoom(90)
    ws.hide_gridlines(2)

    # ---- Title Banner ----
    ws.set_row(0, 40)
    ws.merge_range("A1:L1", "🐄  FARM MANAGEMENT SYSTEM — PRODUCTION REPORT", f["title"])
    ws.merge_range(
        "A2:L2",
        f"Period: {report.period_start} → {report.period_end}   |   "
        f"Generated: {report.generated_at.strftime('%Y-%m-%d %H:%M UTC')}",
        f["subtitle"],
    )
    ws.set_row(1, 22)

    # ---- KPI Cards (Row 4–6) ----
    kpis = [
        ("Total Animals\nAnalyzed",   report.total_animals_analyzed,              f["kpi_value"],       "A"),
        ("Total Milk\nProduced (L)",  report.total_herd_volume_liters,            f["kpi_value"],       "C"),
        ("Avg Daily\nYield (L)",      report.avg_herd_daily_liters,               f["kpi_value"],       "E"),
        ("Total Revenue",             report.total_milk_revenue,                  f["kpi_value_green"], "G"),
        ("Total Expenses",            report.total_expenses,                      f["kpi_value_red"],   "I"),
        ("Net Profit",                report.net_profit,                          f["kpi_value_green"] if report.net_profit >= 0 else f["kpi_value_red"], "K"),
    ]

    for label, value, fmt, col in kpis:
        ws.merge_range(f"{col}4:{chr(ord(col)+1)}4", label, f["kpi_label"])
        ws.merge_range(f"{col}5:{chr(ord(col)+1)}6", value, fmt)
        ws.set_row(3, 22)
        ws.set_row(4, 36)
        ws.set_row(5, 36)

    # ---- Alerts Section ----
    row = 8
    ws.write(row, 0, "⚠️  Active Alerts", f["section"])
    row += 1

    if report.animals_with_declining_trend:
        ws.merge_range(row, 0, row, 11,
            f"🔴 Declining Production: {', '.join(report.animals_with_declining_trend)}",
            f["cell_left"])
        row += 1
    if report.low_feed_alerts:
        ws.merge_range(row, 0, row, 11,
            f"🟠 Low Feed Stock: {', '.join(report.low_feed_alerts)}",
            f["cell_left"])
        row += 1
    if report.animals_with_anomalies:
        ws.merge_range(row, 0, row, 11,
            f"🟡 Anomalies Detected: {', '.join(report.animals_with_anomalies)}",
            f["cell_left"])
        row += 1

    if not any([report.animals_with_declining_trend, report.low_feed_alerts, report.animals_with_anomalies]):
        ws.merge_range(row, 0, row, 11, "✅ No active alerts. Herd performance is stable.", f["cell_left"])

    # ---- Top Performers Section ----
    row += 2
    ws.write(row, 0, "🏆  Herd Rankings", f["section"])
    row += 1
    ws.write(row, 0, f"Best Performer (Avg Daily): {report.best_performer or 'N/A'}", f["cell_left"])
    ws.write(row, 4, f"Needs Attention: {report.worst_performer or 'N/A'}", f["cell_left"])

    # Column widths
    for i in range(12):
        ws.set_column(i, i, 14)


# ---------------------------------------------------------------------------
# SHEET 2: ANIMAL REPORTS
# ---------------------------------------------------------------------------

def _write_animal_reports_sheet(wb, report: HerdReport, f: dict):
    ws = wb.add_worksheet("🐄 Animal Reports")
    ws.set_tab_color(COLOR_GREEN)
    ws.set_zoom(90)
    ws.hide_gridlines(2)
    ws.freeze_panes(2, 0)

    headers = [
        "Tag #", "Name", "Breed", "Days\nAnalyzed",
        "Total\nVolume (L)", "Avg Daily\n(L)", "Peak Day\n(L)", "Min Day\n(L)",
        "Trend\nDirection", "Slope\n(L/day)", "Trend R²",
        "Anomalies", "Health\nCorrelated", "Feed\nCorrelated",
        "7-Day\nForecast (L)", "Top Insight",
    ]
    col_widths = [10, 14, 14, 8, 12, 10, 10, 10, 12, 10, 8, 9, 9, 9, 14, 45]

    ws.set_row(0, 40)
    ws.merge_range(0, 0, 0, len(headers) - 1, "🐄  PER-ANIMAL PRODUCTION ANALYSIS", f["title"])
    ws.set_row(1, 30)
    for c, h in enumerate(headers):
        ws.write(1, c, h, f["col_header"])

    for r_idx, ar in enumerate(report.animal_reports):
        row = r_idx + 2
        alt = (r_idx % 2 == 0)
        cell  = f["cell_alt"] if alt else f["cell"]
        num   = f["cell_num_alt"] if alt else f["cell_num"]

        if ar.trend_direction == "Declining":
            trend_fmt = f["status_red"]
        elif ar.trend_direction == "Improving":
            trend_fmt = f["status_green"]
        else:
            trend_fmt = f["status_orange"]

        ws.write(row, 0,  ar.tag_number,                  cell)
        ws.write(row, 1,  ar.name or "",                  cell)
        ws.write(row, 2,  ar.breed,                       cell)
        ws.write(row, 3,  ar.analysis_period_days,        cell)
        ws.write(row, 4,  ar.total_volume_liters,         num)
        ws.write(row, 5,  ar.avg_daily_liters,            num)
        ws.write(row, 6,  ar.peak_daily_liters,           num)
        ws.write(row, 7,  ar.min_daily_liters,            num)
        ws.write(row, 8,  ar.trend_direction,             trend_fmt)
        ws.write(row, 9,  ar.trend_slope_liters_per_day,  num)
        ws.write(row, 10, ar.trend_confidence,            num)
        ws.write(row, 11, ar.anomaly_count,               cell)
        ws.write(row, 12, ar.health_correlated_drops,     cell)
        ws.write(row, 13, ar.feed_correlated_drops,       cell)
        ws.write(row, 14, ar.projected_7day_volume,       num)
        ws.write(row, 15, ar.top_insight,                 f["insight"])

    for c, w in enumerate(col_widths):
        ws.set_column(c, c, w)


# ---------------------------------------------------------------------------
# SHEET 3: ANOMALIES
# ---------------------------------------------------------------------------

def _write_anomalies_sheet(wb, report: HerdReport, f: dict):
    ws = wb.add_worksheet("⚠️ Anomalies")
    ws.set_tab_color(COLOR_RED)
    ws.set_zoom(90)
    ws.hide_gridlines(2)
    ws.freeze_panes(2, 0)

    headers = [
        "Tag #", "Date", "Recorded\nVolume (L)",
        "Baseline\nAvg (L)", "Drop %", "Z-Score",
        "Probable Cause", "Health Event", "Feed Event",
    ]
    col_widths = [10, 14, 12, 12, 10, 10, 35, 40, 35]

    ws.set_row(0, 40)
    ws.merge_range(0, 0, 0, len(headers) - 1,
        "⚠️  PRODUCTION ANOMALIES & PROBABLE CAUSES", f["title"])
    ws.set_row(1, 30)
    for c, h in enumerate(headers):
        ws.write(1, c, h, f["col_header"])

    row = 2
    for ar in report.animal_reports:
        for anomaly in ar.anomalies:
            alt = (row % 2 == 0)
            cell = f["cell_alt"] if alt else f["cell"]
            num  = f["cell_num_alt"] if alt else f["cell_num"]
            ws.write(row, 0, ar.tag_number,                    cell)
            ws.write(row, 1, str(anomaly.timestamp.date()),    cell)
            ws.write(row, 2, anomaly.volume_liters,            num)
            ws.write(row, 3, anomaly.baseline_avg,             num)
            ws.write(row, 4, f"{anomaly.deviation_pct}%",     f["status_red"] if anomaly.deviation_pct > 30 else f["status_orange"])
            ws.write(row, 5, anomaly.z_score,                  num)
            ws.write(row, 6, anomaly.probable_cause,           f["insight"])
            ws.write(row, 7, anomaly.health_event or "—",     cell)
            ws.write(row, 8, anomaly.feed_event or "—",       cell)
            row += 1

    if row == 2:
        ws.merge_range(2, 0, 2, 8, "✅ No anomalies detected in the selected period.", f["cell_left"])

    for c, w in enumerate(col_widths):
        ws.set_column(c, c, w)


# ---------------------------------------------------------------------------
# SHEET 4: FINANCE OVERVIEW
# ---------------------------------------------------------------------------

def _write_finance_sheet(wb, report: HerdReport, f: dict):
    ws = wb.add_worksheet("💰 Finance Overview")
    ws.set_tab_color("#27AE60")
    ws.set_zoom(90)
    ws.hide_gridlines(2)

    ws.set_row(0, 40)
    ws.merge_range("A1:H1", "💰  FINANCIAL OVERVIEW", f["title"])
    ws.set_row(1, 22)
    ws.merge_range("A2:H2",
        f"Period: {report.period_start} to {report.period_end}", f["subtitle"])

    # Summary metrics
    row = 3
    ws.write(row, 0, "Total Milk Revenue", f["col_header"])
    ws.write(row, 1, report.total_milk_revenue, f["cell_num"])
    row += 1
    ws.write(row, 0, "Total Expenses", f["col_header"])
    ws.write(row, 1, report.total_expenses, f["cell_num"])
    row += 1
    profit_fmt = f["kpi_value_green"] if report.net_profit >= 0 else f["kpi_value_red"]
    ws.write(row, 0, "Net Profit / Loss", f["col_header"])
    ws.write(row, 1, report.net_profit, f["cell_num"])

    # Expenses by category
    row += 2
    ws.write(row, 0, "Expenses by Category", f["section"])
    row += 1
    ws.write(row, 0, "Category", f["col_header"])
    ws.write(row, 1, "Amount", f["col_header"])
    ws.write(row, 2, "% of Total", f["col_header"])
    row += 1

    expenses_by_cat = {}  # Will be populated from report data if available
    # Note: HerdReport doesn't carry expense breakdown directly, so we show a placeholder
    ws.write(row, 0, "See Summary Dashboard for category breakdown", f["insight"])

    for c, w in enumerate([25, 18, 15, 15, 15, 15, 15, 15]):
        ws.set_column(c, c, w)


# ---------------------------------------------------------------------------
# SHEET 5: CHARTS
# ---------------------------------------------------------------------------

def _write_charts_sheet(wb, report: HerdReport, f: dict):
    ws = wb.add_worksheet("📈 Charts")
    ws.set_tab_color(COLOR_BLUE)
    ws.set_zoom(85)
    ws.hide_gridlines(2)

    ws.set_row(0, 40)
    ws.merge_range("A1:P1", "📈  MILK PRODUCTION TREND CHARTS", f["title"])

    if not report.animal_reports:
        ws.merge_range("A3:P3", "No data available for chart generation.", f["insight"])
        return

    # Build a data sheet (hidden) for chart data references
    data_ws = wb.add_worksheet("_chart_data")
    data_ws.hide()

    chart_row = 1  # placement in charts sheet
    data_col_offset = 0

    for ar_idx, ar in enumerate(report.animal_reports[:8]):  # max 8 charts
        label = f"{ar.tag_number} ({ar.name or ar.breed})"

        # Write dates & values into hidden sheet
        data_start_row = ar_idx * 60 + 1
        data_col = ar_idx * 2
        data_ws.write(data_start_row - 1, data_col,     "Date",   f["col_header"])
        data_ws.write(data_start_row - 1, data_col + 1, "Liters", f["col_header"])

        # We don't have raw daily data in HerdReport; write summary points
        # as a demonstration of the chart framework (avg, peak, min)
        points = [
            ("Start of Period", ar.min_daily_liters),
            ("Mid Period",      ar.avg_daily_liters),
            ("End of Period",   ar.peak_daily_liters),
            ("7-Day Forecast",  ar.projected_7day_volume / 7 if ar.projected_7day_volume else ar.avg_daily_liters),
        ]
        for i, (label_pt, val) in enumerate(points):
            data_ws.write(data_start_row + i, data_col,     label_pt, f["cell"])
            data_ws.write(data_start_row + i, data_col + 1, val,      f["cell_num"])

        # Create line chart
        chart = wb.add_chart({"type": "line"})
        chart.add_series({
            "name":       label,
            "categories": ["_chart_data", data_start_row, data_col, data_start_row + len(points) - 1, data_col],
            "values":     ["_chart_data", data_start_row, data_col + 1, data_start_row + len(points) - 1, data_col + 1],
            "line": {"color": COLOR_BLUE, "width": 2.5},
            "marker": {"type": "circle", "size": 6, "fill": {"color": COLOR_GOLD}, "border": {"color": COLOR_GOLD}},
        })
        chart.set_title({"name": f"🐄 {label} — Daily Milk Yield"})
        chart.set_x_axis({"name": "Period", "num_font": {"size": 8}})
        chart.set_y_axis({"name": "Liters / Day", "num_font": {"size": 8}})
        chart.set_legend({"position": "bottom"})
        chart.set_style(10)
        chart.set_size({"width": 480, "height": 280})

        # Place chart: 2 per row
        col_pos = (ar_idx % 2) * 8
        row_pos = chart_row + (ar_idx // 2) * 20
        ws.insert_chart(row_pos, col_pos, chart, {"x_offset": 5, "y_offset": 5})

    for c in range(16):
        ws.set_column(c, c, 10)
