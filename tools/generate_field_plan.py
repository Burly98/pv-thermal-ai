"""Generate deterministic field numbering and maintenance deliverables.

The MASTER panel geometry remains unchanged.  This script derives a field-facing
identifier from panel centroid positions:

* rows are ordered north to south;
* positions inside each row are ordered west to east;
* the stable field identifier is ``R###-P###``.

Outputs are written under ``web/static/field_plan`` so the same artifacts are
available locally and in the Render deployment.
"""

from __future__ import annotations

import csv
import json
import math
from collections import defaultdict
from pathlib import Path

import geopandas as gpd
import numpy as np
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "real_data" / "master" / "panels_MASTER_complete_fixed_ids.gpkg"
DEFECTS = ROOT / "web" / "static" / "manual620_visual_defects.json"
COORDINATES = ROOT / "web" / "static" / "manual620_coordinates.json"
OUTPUT_DIR = ROOT / "web" / "static" / "field_plan"

TARGET_CRS = "EPSG:3844"
ROW_TOLERANCE_METRES = 0.40


def load_inputs():
    panels = gpd.read_file(MASTER).to_crs(TARGET_CRS)
    panels["panel_id"] = panels["panel_id"].astype(str)
    defects = json.loads(DEFECTS.read_text(encoding="utf-8"))["panels"]
    coordinates = json.loads(COORDINATES.read_text(encoding="utf-8"))
    return panels, defects, coordinates


def assign_field_numbers(panels):
    centroids = panels.geometry.centroid
    records = [
        {
            "index": index,
            "panel_id": str(panel_id),
            "x": float(centroid.x),
            "y": float(centroid.y),
        }
        for index, panel_id, centroid in zip(
            panels.index,
            panels["panel_id"],
            centroids,
        )
    ]
    records.sort(key=lambda item: (-item["y"], item["x"], item["panel_id"]))

    rows = []
    for item in records:
        if not rows or abs(item["y"] - rows[-1]["mean_y"]) > ROW_TOLERANCE_METRES:
            rows.append({"items": [item], "mean_y": item["y"]})
        else:
            row = rows[-1]
            row["items"].append(item)
            row["mean_y"] = float(np.mean([entry["y"] for entry in row["items"]]))

    mapping = {}
    ordered = []
    row_summaries = []

    for row_number, row in enumerate(rows, start=1):
        items = sorted(row["items"], key=lambda item: (item["x"], item["panel_id"]))
        row_id = f"R{row_number:03d}"
        for position, item in enumerate(items, start=1):
            field_id = f"{row_id}-P{position:03d}"
            entry = {
                "panel_id": item["panel_id"],
                "field_id": field_id,
                "row": row_number,
                "position": position,
                "x_3844": round(item["x"], 3),
                "y_3844": round(item["y"], 3),
                "geometry_index": int(item["index"]),
            }
            mapping[item["panel_id"]] = entry
            ordered.append(entry)

        row_summaries.append(
            {
                "row": row_number,
                "row_id": row_id,
                "panel_count": len(items),
                "min_x": round(min(item["x"] for item in items), 3),
                "max_x": round(max(item["x"] for item in items), 3),
                "mean_y": round(row["mean_y"], 3),
            }
        )

    if len(mapping) != len(panels):
        raise RuntimeError(f"Expected {len(panels)} mappings, generated {len(mapping)}")

    return mapping, ordered, row_summaries


def build_defect_rows(mapping, defects, coordinates):
    rows = []
    for panel_id, defect in defects.items():
        field = mapping.get(panel_id)
        if not field:
            raise RuntimeError(f"Defective panel missing from MASTER mapping: {panel_id}")
        coordinate = coordinates.get(panel_id, {})
        rows.append(
            {
                "field_id": field["field_id"],
                "row": field["row"],
                "position": field["position"],
                "panel_id": panel_id,
                "anomaly": defect.get("anomaly_type")
                or defect.get("visual_defect_estimate")
                or "",
                "severity": defect.get("severity_estimate") or "",
                "latitude": coordinate.get("latitude", ""),
                "longitude": coordinate.get("longitude", ""),
                "reference_filename": defect.get("reference_filename", ""),
            }
        )
    rows.sort(key=lambda item: (item["row"], item["position"], item["panel_id"]))
    if len(rows) != 620:
        raise RuntimeError(f"Expected 620 defective panels, generated {len(rows)}")
    return rows


def write_json(mapping, ordered, row_summaries):
    payload = {
        "version": 1,
        "crs": TARGET_CRS,
        "numbering": {
            "rows": "north_to_south",
            "positions": "west_to_east",
            "format": "R###-P###",
        },
        "panel_count": len(mapping),
        "row_count": len(row_summaries),
        "by_panel": {
            panel_id: {
                "field_id": item["field_id"],
                "row": item["row"],
                "position": item["position"],
            }
            for panel_id, item in mapping.items()
        },
        "by_field": {item["field_id"]: item["panel_id"] for item in ordered},
        "rows": row_summaries,
    }
    path = OUTPUT_DIR / "panel_field_index.json"
    path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def write_csv(defect_rows):
    path = OUTPUT_DIR / "PV_Thermal_Defective_Panels_620.csv"
    columns = [
        "field_id",
        "row",
        "position",
        "panel_id",
        "anomaly",
        "severity",
        "latitude",
        "longitude",
        "reference_filename",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(defect_rows)


def dxf_pair(code, value):
    return f"{code}\n{value}\n"


def dxf_text(handle, layer, text, x, y, height, rotation=0):
    handle.write(dxf_pair(0, "TEXT"))
    handle.write(dxf_pair(8, layer))
    handle.write(dxf_pair(10, f"{x:.3f}"))
    handle.write(dxf_pair(20, f"{y:.3f}"))
    handle.write(dxf_pair(30, "0"))
    handle.write(dxf_pair(40, f"{height:.3f}"))
    handle.write(dxf_pair(1, text))
    handle.write(dxf_pair(50, f"{rotation:.3f}"))
    handle.write(dxf_pair(72, "1"))
    handle.write(dxf_pair(73, "2"))
    handle.write(dxf_pair(11, f"{x:.3f}"))
    handle.write(dxf_pair(21, f"{y:.3f}"))
    handle.write(dxf_pair(31, "0"))


def dxf_polyline(handle, layer, coordinates):
    handle.write(dxf_pair(0, "POLYLINE"))
    handle.write(dxf_pair(8, layer))
    handle.write(dxf_pair(66, "1"))
    handle.write(dxf_pair(70, "1"))
    for coordinate in coordinates[:-1]:
        x, y = coordinate[:2]
        handle.write(dxf_pair(0, "VERTEX"))
        handle.write(dxf_pair(8, layer))
        handle.write(dxf_pair(10, f"{x:.3f}"))
        handle.write(dxf_pair(20, f"{y:.3f}"))
        handle.write(dxf_pair(30, "0"))
    handle.write(dxf_pair(0, "SEQEND"))
    handle.write(dxf_pair(8, layer))


def write_dxf(panels, mapping, defect_ids, row_summaries):
    path = OUTPUT_DIR / "PV_Thermal_Field_Plan.dxf"
    with path.open("w", encoding="ascii", newline="\n") as handle:
        handle.write(dxf_pair(0, "SECTION"))
        handle.write(dxf_pair(2, "HEADER"))
        handle.write(dxf_pair(9, "$ACADVER"))
        handle.write(dxf_pair(1, "AC1009"))
        handle.write(dxf_pair(0, "ENDSEC"))
        handle.write(dxf_pair(0, "SECTION"))
        handle.write(dxf_pair(2, "ENTITIES"))

        for _, panel in panels.iterrows():
            panel_id = str(panel["panel_id"])
            field = mapping[panel_id]
            geometry = panel.geometry
            layer = "DEFECTIVE_PANELS" if panel_id in defect_ids else "PANELS_MASTER"
            dxf_polyline(handle, layer, list(geometry.exterior.coords))
            centroid = geometry.centroid
            dxf_text(
                handle,
                "PANEL_POSITION",
                f"P{field['position']:03d}",
                centroid.x,
                centroid.y,
                0.22,
                90,
            )
            if panel_id in defect_ids:
                dxf_text(
                    handle,
                    "DEFECT_LABELS",
                    field["field_id"],
                    centroid.x,
                    centroid.y,
                    0.32,
                    90,
                )

        label_x = min(item["min_x"] for item in row_summaries) - 6.0
        for row in row_summaries:
            dxf_text(
                handle,
                "ROW_LABELS",
                row["row_id"],
                label_x,
                row["mean_y"],
                1.5,
                0,
            )

        handle.write(dxf_pair(0, "ENDSEC"))
        handle.write(dxf_pair(0, "EOF"))


def draw_plan_page(canvas, panels, mapping, defect_ids, row_summaries):
    page_width, page_height = landscape(A3)
    margin_left = 28 * mm
    margin_right = 13 * mm
    margin_bottom = 18 * mm
    margin_top = 28 * mm
    min_x, min_y, max_x, max_y = panels.total_bounds
    drawing_width = page_width - margin_left - margin_right
    drawing_height = page_height - margin_top - margin_bottom
    scale = min(drawing_width / (max_x - min_x), drawing_height / (max_y - min_y))
    offset_x = margin_left + (drawing_width - (max_x - min_x) * scale) / 2
    offset_y = margin_bottom + (drawing_height - (max_y - min_y) * scale) / 2

    def point(x, y):
        return offset_x + (x - min_x) * scale, offset_y + (y - min_y) * scale

    canvas.setTitle("PV Thermal AI - Field Situation Plan")
    canvas.setFont("Helvetica-Bold", 17)
    canvas.drawString(18 * mm, page_height - 16 * mm, "PV Thermal AI - Plan de situatie pentru mentenanta")
    canvas.setFont("Helvetica", 8)
    canvas.drawString(
        18 * mm,
        page_height - 21 * mm,
        "Numerotare: randuri nord-sud; pozitii vest-est; cod R###-P### | CRS: EPSG:3844",
    )

    canvas.setLineWidth(0.15)
    for _, panel in panels.iterrows():
        panel_id = str(panel["panel_id"])
        coords = list(panel.geometry.exterior.coords)
        path = canvas.beginPath()
        first_x, first_y = point(*coords[0][:2])
        path.moveTo(first_x, first_y)
        for coordinate in coords[1:]:
            x, y = coordinate[:2]
            page_x, page_y = point(x, y)
            path.lineTo(page_x, page_y)
        path.close()
        if panel_id in defect_ids:
            canvas.setStrokeColor(colors.HexColor("#b91c1c"))
            canvas.setFillColor(colors.HexColor("#ef4444"))
            canvas.drawPath(path, stroke=1, fill=1)
        else:
            canvas.setStrokeColor(colors.HexColor("#64748b"))
            canvas.setFillColor(colors.HexColor("#cbd5e1"))
            canvas.drawPath(path, stroke=1, fill=1)

    canvas.setFont("Helvetica-Bold", 4.5)
    canvas.setFillColor(colors.HexColor("#0f172a"))
    label_x = min(item["min_x"] for item in row_summaries) - 4.0
    for row in row_summaries:
        x, y = point(label_x, row["mean_y"])
        canvas.drawRightString(x, y - 1.5, row["row_id"])

    canvas.setStrokeColor(colors.black)
    canvas.setFillColor(colors.black)
    north_x = page_width - 22 * mm
    north_y = page_height - 22 * mm
    canvas.setFont("Helvetica-Bold", 10)
    canvas.drawCentredString(north_x, north_y + 8 * mm, "N")
    canvas.line(north_x, north_y, north_x, north_y + 7 * mm)
    canvas.line(north_x, north_y + 7 * mm, north_x - 2 * mm, north_y + 4 * mm)
    canvas.line(north_x, north_y + 7 * mm, north_x + 2 * mm, north_y + 4 * mm)

    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(colors.HexColor("#ef4444"))
    canvas.rect(18 * mm, 8 * mm, 4 * mm, 4 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.black)
    canvas.drawString(24 * mm, 9 * mm, f"Panouri validate defecte: {len(defect_ids)}")
    canvas.setFillColor(colors.HexColor("#cbd5e1"))
    canvas.rect(68 * mm, 8 * mm, 4 * mm, 4 * mm, fill=1, stroke=1)
    canvas.setFillColor(colors.black)
    canvas.drawString(74 * mm, 9 * mm, f"Panouri MASTER: {len(panels)} | Randuri: {len(row_summaries)}")


def draw_footer(canvas, doc):
    page_width, _page_height = landscape(A3)
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#cbd5e1"))
    canvas.line(14 * mm, 10 * mm, page_width - 14 * mm, 10 * mm)
    canvas.setFillColor(colors.HexColor("#475569"))
    canvas.setFont("Helvetica", 7)
    canvas.drawString(14 * mm, 6 * mm, "PV Thermal AI - Plan de situatie pentru mentenanta")
    canvas.drawRightString(page_width - 14 * mm, 6 * mm, f"Pagina {doc.page}")
    canvas.restoreState()


def build_pdf(panels, mapping, defect_rows, row_summaries):
    path = OUTPUT_DIR / "PV_Thermal_Field_Plan.pdf"
    defect_ids = {item["panel_id"] for item in defect_rows}
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "FieldTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=18,
        alignment=TA_LEFT,
        spaceAfter=8,
    )
    note_style = ParagraphStyle(
        "FieldNote",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
    )
    small = ParagraphStyle(
        "Small",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=3.2,
        leading=3.6,
    )

    doc = SimpleDocTemplate(
        str(path),
        pagesize=landscape(A3),
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title="PV Thermal AI - Field Situation Plan",
        author="PV Thermal AI",
    )

    story = [
        PageBreak(),
        Paragraph("Index panouri defecte validate - 620", title_style),
        Paragraph(
            "Codul de teren este derivat determinist din geometria MASTER. "
            "Randurile sunt numerotate de la nord la sud, iar pozitiile de la vest la est. "
            "ID-ul tehnic PANEL_XXXXX ramane neschimbat.",
            note_style,
        ),
        Spacer(1, 4 * mm),
    ]

    table_data = [["Cod teren", "Rand", "Pozitie", "Panel ID", "Defect", "Severitate", "Latitudine", "Longitudine"]]
    for item in defect_rows:
        table_data.append(
            [
                item["field_id"],
                str(item["row"]),
                str(item["position"]),
                item["panel_id"],
                item["anomaly"],
                item["severity"],
                f"{float(item['latitude']):.7f}" if item["latitude"] != "" else "",
                f"{float(item['longitude']):.7f}" if item["longitude"] != "" else "",
            ]
        )

    index_table = Table(
        table_data,
        repeatRows=1,
        colWidths=[27 * mm, 13 * mm, 16 * mm, 27 * mm, 38 * mm, 21 * mm, 29 * mm, 29 * mm],
        hAlign="LEFT",
    )
    index_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 5.6),
                ("LEADING", (0, 0), (-1, -1), 6.5),
                ("GRID", (0, 0), (-1, -1), 0.2, colors.HexColor("#cbd5e1")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (1, 1), (2, -1), "CENTER"),
            ]
        )
    )
    story.append(index_table)

    panels_by_row = defaultdict(list)
    for _, panel in panels.iterrows():
        field = mapping[str(panel["panel_id"])]
        panels_by_row[field["row"]].append((field, panel.geometry))

    defects_by_row = defaultdict(list)
    for item in defect_rows:
        defects_by_row[item["row"]].append(item)

    for row_number in sorted(defects_by_row):
        row_id = f"R{row_number:03d}"
        row_panels = sorted(panels_by_row[row_number], key=lambda value: value[0]["position"])
        row_defects = defects_by_row[row_number]
        max_position = max(item[0]["position"] for item in row_panels)
        defect_positions = {item["position"]: item for item in row_defects}

        story.extend(
            [
                PageBreak(),
                Paragraph(f"{row_id} - schema pozitii panouri", title_style),
                Paragraph(
                    f"Vest - pozitii 001-{max_position:03d} - Est | "
                    f"Panouri defecte validate pe rand: {len(row_defects)}",
                    note_style,
                ),
                Spacer(1, 4 * mm),
            ]
        )

        cells = []
        for field, _geometry in row_panels:
            position = field["position"]
            defect = defect_positions.get(position)
            label = f"<b>{position:03d}</b>" if defect else f"{position:03d}"
            cells.append(Paragraph(label, small))

        available_width = landscape(A3)[0] - 28 * mm
        cell_width = available_width / max_position
        schematic = Table([cells], colWidths=[cell_width] * max_position, rowHeights=[17 * mm])
        schematic_commands = [
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#475569")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#e2e8f0")),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 1),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ]
        for position in defect_positions:
            schematic_commands.extend(
                [
                    ("BACKGROUND", (position - 1, 0), (position - 1, 0), colors.HexColor("#fecaca")),
                    ("TEXTCOLOR", (position - 1, 0), (position - 1, 0), colors.HexColor("#991b1b")),
                ]
            )
        schematic.setStyle(TableStyle(schematic_commands))
        story.extend([schematic, Spacer(1, 6 * mm)])

        detail_data = [["Cod teren", "Panel ID", "Defect", "Severitate", "Latitudine", "Longitudine"]]
        for item in row_defects:
            detail_data.append(
                [
                    item["field_id"],
                    item["panel_id"],
                    item["anomaly"],
                    item["severity"],
                    f"{float(item['latitude']):.7f}",
                    f"{float(item['longitude']):.7f}",
                ]
            )
        detail_table = Table(
            detail_data,
            repeatRows=1,
            colWidths=[31 * mm, 31 * mm, 48 * mm, 28 * mm, 33 * mm, 33 * mm],
            hAlign="LEFT",
        )
        detail_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#334155")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 0), (-1, -1), 7),
                    ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#cbd5e1")),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ]
            )
        )
        story.append(detail_table)

    doc.build(
        story,
        onFirstPage=lambda canvas, _doc: draw_plan_page(
            canvas,
            panels,
            mapping,
            defect_ids,
            row_summaries,
        ),
        onLaterPages=draw_footer,
    )


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    panels, defects, coordinates = load_inputs()
    mapping, ordered, row_summaries = assign_field_numbers(panels)
    defect_rows = build_defect_rows(mapping, defects, coordinates)
    defect_ids = {item["panel_id"] for item in defect_rows}

    write_json(mapping, ordered, row_summaries)
    write_csv(defect_rows)
    write_dxf(panels, mapping, defect_ids, row_summaries)
    build_pdf(panels, mapping, defect_rows, row_summaries)

    print(f"Panels: {len(mapping)}")
    print(f"Rows: {len(row_summaries)}")
    print(f"Defective panels: {len(defect_rows)}")
    for path in sorted(OUTPUT_DIR.iterdir()):
        print(f"{path.name}: {path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
