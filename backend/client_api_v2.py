import mimetypes
mimetypes.add_type("image/webp", ".webp")
import os
from pathlib import Path
from io import BytesIO
import json
import math

import numpy as np
import pandas as pd
import geopandas as gpd
import rasterio

from flask import (
    request,
    session,
    Flask,
    Response,
    jsonify,
    render_template,
    send_file,
)

from PIL import (
    Image,
    ImageDraw,
)

from rasterio.windows import Window
from rasterio.enums import Resampling

from shapely.geometry import mapping
from shapely.ops import transform as shapely_transform


# ============================================================
# PROJECT
# ============================================================

BASE = Path(__file__).resolve().parent.parent

WEB_DIR = (
    BASE
    / "web"
)


# ============================================================
# INPUTS
# ============================================================

RGB_ORTHO = (
    BASE
    / "real_data"
    / "ortho"
    / "park_01_nadir"
    / "park_01_nadir_ir_stereo70.tif"
)

WEB_RGB_RASTER = (
    BASE
    / "web"
    / "static"
    / "map_layers"
    / "rgb_aligned.jpg"
)

MASTER_PANELS_GPKG = (
    BASE
    / "real_data"
    / "master"
    / "panels_MASTER_complete_fixed_ids.gpkg"
)

VERIFIED_CSV = (
    BASE
    / "real_data"
    / "processed"
    / "park_01"
    / "oblique70_corrected_FULL_web"
    / "final_findings_oblique70_corrected_FULL.csv"
)

VERIFIED_GPKG = (
    BASE
    / "real_data"
    / "processed"
    / "park_01"
    / "oblique70_corrected_FULL_web"
    / "final_findings_oblique70_corrected_FULL.gpkg"
)

ACTIVE_LEARNING_EXACT_JSON = (
    BASE
    / "real_data"
    / "processed"
    / "park_01"
    / "active_learning_exact_web_v31_hybrid"
    / "findings_active_learning_exact_v31_hybrid.json"
)

ACTIVE_LEARNING_EXACT_GPKG = (
    BASE
    / "real_data"
    / "processed"
    / "park_01"
    / "active_learning_exact_web_v31_hybrid"
    / "panels_active_learning_exact_v31_hybrid.gpkg"
)

IMAGE_ROOT = Path(
    os.environ.get(
        "PV_THERMAL_IMAGE_ROOT",
        str(
            BASE
            / "real_data"
            / "raw"
            / "park_01"
        ),
    )
)

PREDICTION_DIR = (
    BASE
    / "real_data"
    / "processed"
    / "park_01"
    / "active_learning"
    / "predictions"
)


# ============================================================
# SETTINGS
# ============================================================

TOTAL_PANELS = 16853

TILE_SIZE = 256

MAX_ZOOM = 9


# ============================================================
# FLASK
# ============================================================

app = Flask(
    __name__,
    template_folder=str(
        WEB_DIR
        / "templates"
    ),
    static_folder=str(
        WEB_DIR
        / "static"
    ),
)

# ============================================================
# ADMIN AUTH
# ============================================================

app.secret_key = os.environ.get(
    "PV_ADMIN_SECRET_KEY",
    "CHANGE-THIS-SECRET-BEFORE-PRODUCTION"
)

ADMIN_USERNAME = "admin"

ADMIN_PASSWORD = "admin123"





ADMIN_SECRET_KEY = os.environ.get(
    "PV_ADMIN_SECRET_KEY",
    "pv-thermal-ai-local-admin-secret"
)
# ============================================================
# VALIDATE INPUTS
# ============================================================

required_paths = [
    WEB_RGB_RASTER,
    MASTER_PANELS_GPKG,
    ACTIVE_LEARNING_EXACT_JSON,
    ACTIVE_LEARNING_EXACT_GPKG,
]

for path in required_paths:

    if not path.exists():

        raise FileNotFoundError(
            f"Missing file:\n{path}"
        )


# ============================================================
# OPEN RASTER
# ============================================================

print()
print("Opening map metadata...")

COMPACT_WEB_DEPLOYMENT = os.environ.get("PV_USE_WEB_RASTERS", "0") == "1"
RASTER_SOURCE_AVAILABLE = RGB_ORTHO.exists() and not COMPACT_WEB_DEPLOYMENT

if RASTER_SOURCE_AVAILABLE:
    raster = rasterio.open(RGB_ORTHO)
    WIDTH = raster.width
    HEIGHT = raster.height
    RASTER_CRS = raster.crs
    RASTER_TRANSFORM = raster.transform
else:
    from affine import Affine

    # Georeferencing copied from the production orthomosaic. Keeping only
    # this metadata lets the web viewer use the aligned JPEGs without
    # shipping the multi-gigabyte TIFF.
    WIDTH = 40438
    HEIGHT = 45701
    RASTER_CRS = "EPSG:3844"
    RASTER_TRANSFORM = Affine(
        0.012794887495054233,
        0.0,
        296274.36155876954,
        0.0,
        -0.012794887495054233,
        652136.2321107029,
    )

    class _RasterMetadata:
        width = WIDTH
        height = HEIGHT
        count = 3
        crs = RASTER_CRS
        transform = RASTER_TRANSFORM

    raster = _RasterMetadata()

MAX_DIM = max(
    WIDTH,
    HEIGHT,
)

inverse_transform = (
    ~RASTER_TRANSFORM
)

print(
    "Raster:",
    WIDTH,
    "x",
    HEIGHT
)

print(
    "CRS:",
    RASTER_CRS
)


# ============================================================
# LOAD VERIFIED FINDINGS
# ============================================================

print()
print("Loading verified findings...")

if VERIFIED_CSV.exists() and not COMPACT_WEB_DEPLOYMENT:
    findings = pd.read_csv(VERIFIED_CSV)
else:
    exact_payload = json.loads(
        ACTIVE_LEARNING_EXACT_JSON.read_text(encoding="utf-8")
    )
    findings = pd.DataFrame([
        {
            "panel_id": str(item.get("panel_id", "")),
            "filename": (
                (item.get("observations") or [{}])[0].get("filename", "")
            ),
            "verified_observations": int(item.get("observation_count", 0) or 0),
            "observations": int(item.get("observation_count", 0) or 0),
            "anomaly_count": int(item.get("anomaly_count", 0) or 0),
            "anomaly_type": "Active Learning 45",
            "class_confidence": 1.0,
            "status": "Confirmed",
        }
        for item in exact_payload.get("findings", [])
    ])

findings[
    "panel_id"
] = (
    findings[
        "panel_id"
    ]
    .astype(str)
)

print(
    "Verified findings:",
    len(findings)
)


# ============================================================
# LOAD VERIFIED GEOMETRY
# ============================================================

verified_panels = gpd.read_file(
    VERIFIED_GPKG
    if VERIFIED_GPKG.exists() and not COMPACT_WEB_DEPLOYMENT
    else ACTIVE_LEARNING_EXACT_GPKG
)

verified_panels[
    "panel_id"
] = (
    verified_panels[
        "panel_id"
    ]
    .astype(str)
)

if (
    verified_panels.crs
    != RASTER_CRS
):

    verified_panels = (
        verified_panels
        .to_crs(
            RASTER_CRS
        )
    )


# ============================================================
# LOAD ALL MASTER PANELS
# ============================================================

print()
print("Loading master panel GeoPackage...")

all_panels = gpd.read_file(
    MASTER_PANELS_GPKG
)

all_panels[
    "panel_id"
] = (
    all_panels[
        "panel_id"
    ]
    .astype(str)
)

if (
    all_panels.crs
    != RASTER_CRS
):

    all_panels = (
        all_panels
        .to_crs(
            RASTER_CRS
        )
    )

print(
    "Master panels:",
    len(all_panels)
)


# ============================================================
# HELPERS
# ============================================================

def safe_float(
    value,
    default=0.0,
):

    try:

        if pd.isna(value):

            return default

        return float(value)

    except Exception:

        return default


def safe_int(
    value,
    default=0,
):

    try:

        if pd.isna(value):

            return default

        return int(
            float(value)
        )

    except Exception:

        return default


def safe_text(
    value,
    default="",
):

    if value is None:

        return default

    try:

        if pd.isna(value):

            return default

    except Exception:

        pass

    return str(value)


def severity_from_row(
    row,
):

    anomaly = safe_text(
        row.get(
            "anomaly_type",
            ""
        )
    )

    observations = safe_int(
        row.get(
            "verified_observations",
            1
        ),
        1,
    )

    confidence = safe_float(
        row.get(
            "class_confidence",
            0
        )
    )

    if anomaly in {
        "Offline-Module",
        "Diode-Multi",
        "Hot-Spot-Multi",
    }:

        return "Critical"

    if (
        anomaly
        in {
            "Diode",
            "Hot-Spot",
        }
        and
        (
            observations >= 3
            or
            confidence >= 0.80
        )
    ):

        return "High"

    if (
        observations >= 2
        or
        confidence >= 0.65
    ):

        return "Medium"

    return "Low"


findings[
    "severity"
] = (
    findings.apply(
        severity_from_row,
        axis=1,
    )
)


finding_lookup = (
    findings
    .drop_duplicates(
        "panel_id"
    )
    .set_index(
        "panel_id"
    )
    .to_dict(
        orient="index"
    )
)


affected_ids = set(
    findings[
        "panel_id"
    ]
    .astype(str)
    .tolist()
)


def stretch_rgb(
    arr,
):

    if arr.dtype == np.uint8:

        return arr

    output = np.zeros(
        arr.shape,
        dtype=np.uint8,
    )

    for band in range(
        min(
            3,
            arr.shape[2]
        )
    ):

        channel = (
            arr[
                :,
                :,
                band
            ]
            .astype(
                np.float32
            )
        )

        finite = channel[
            np.isfinite(
                channel
            )
        ]

        if finite.size == 0:

            continue

        low = np.percentile(
            finite,
            0.5
        )

        high = np.percentile(
            finite,
            99.5
        )

        if high <= low:

            high = (
                low + 1
            )

        channel = (
            channel - low
        ) / (
            high - low
        )

        channel = np.clip(
            channel,
            0,
            1,
        )

        output[
            :,
            :,
            band
        ] = (
            channel
            * 255
        ).astype(
            np.uint8
        )

    return output


# ============================================================
# WORLD -> PIXEL SPACE
# ============================================================

def world_to_map_pixel(
    x,
    y,
):

    col, row = (
        inverse_transform
        * (
            x,
            y
        )
    )

    # Browser map uses bottom-left origin.
    return (
        float(col),
        float(
            HEIGHT - row
        ),
    )


def geometry_to_pixel_space(
    geometry,
):

    def transform_coordinates(
        x,
        y,
        z=None,
    ):

        px, py = (
            world_to_map_pixel(
                x,
                y
            )
        )

        return (
            px,
            py
        )

    return shapely_transform(
        transform_coordinates,
        geometry
    )


# ============================================================
# THERMAL IMAGE HELPERS
# ============================================================

def resolve_ir_image(
    filename,
):

    normalized = (
        str(filename)
        .replace(
            "\\",
            "/"
        )
    )

    direct = (
        IMAGE_ROOT
        / Path(normalized)
    )

    if direct.exists():

        return direct

    basename = (
        Path(
            normalized
        ).name
    )

    matches = list(
        IMAGE_ROOT.rglob(
            basename
        )
    )

    if matches:

        return matches[0]

    return None


def prediction_json_path(
    filename,
):

    normalized = (
        str(filename)
        .replace(
            "\\",
            "/"
        )
    )

    key = "__".join(
        Path(
            normalized
        ).parts
    )

    return (
        PREDICTION_DIR
        / (
            key
            + ".json"
        )
    )



def find_manual_active_learning_panel_bbox(row):
    """
    Highest-priority panel geometry.

    Uses the panel box manually corrected in Active Learning
    when filename + PANEL_ID exist in annotations.json.
    """

    try:
        filename = safe_text(
            row.get("filename", "")
        )

        panel_id = safe_text(
            row.get("panel_id", "")
        )

        if not filename or not panel_id:
            return None

        data = _al_load()

        annotation = data.get(
            Path(filename).name
        )

        if not annotation:
            return None

        image_width = safe_float(
            annotation.get("image_width", 0)
        )

        image_height = safe_float(
            annotation.get("image_height", 0)
        )

        if image_width <= 0 or image_height <= 0:
            return None

        for item in annotation.get("items", []):

            if safe_text(
                item.get("panel_id", "")
            ) != panel_id:
                continue

            box = item.get("panel")

            if not box:
                continue

            x = safe_float(box.get("x", 0))
            y = safe_float(box.get("y", 0))
            w = safe_float(box.get("w", 0))
            h = safe_float(box.get("h", 0))

            if w <= 0 or h <= 0:
                continue

            return {
                "x1": x * image_width,
                "y1": y * image_height,
                "x2": (x + w) * image_width,
                "y2": (y + h) * image_height,
                "source": "manual_active_learning",
            }

    except Exception as exc:

        print(
            "MANUAL ACTIVE LEARNING PANEL BBOX ERROR:",
            repr(exc)
        )

    return None


def find_real_panel_bbox(
    row,
):

    # --------------------------------------------------------
    # PRIORITY 1:
    # exact geometry manually corrected in Active Learning
    # --------------------------------------------------------

    manual_bbox = find_manual_active_learning_panel_bbox(
        row
    )

    if manual_bbox is not None:
        return manual_bbox



    filename = safe_text(
        row.get(
            "filename",
            ""
        )
    )

    prediction_path = (
        prediction_json_path(
            filename
        )
    )

    if not prediction_path.exists():

        return None

    try:

        data = json.loads(
            prediction_path
            .read_text(
                encoding=
                    "utf-8"
            )
        )

    except Exception:

        return None

    detected_panels = (
        data.get(
            "panels",
            []
        )
    )

    detected_defects = (
        data.get(
            "defects",
            []
        )
    )

    if not detected_panels:

        return None

    x1 = safe_float(
        row.get(
            "x1",
            0
        )
    )

    y1 = safe_float(
        row.get(
            "y1",
            0
        )
    )

    x2 = safe_float(
        row.get(
            "x2",
            0
        )
    )

    y2 = safe_float(
        row.get(
            "y2",
            0
        )
    )

    cx = (
        x1 + x2
    ) / 2

    cy = (
        y1 + y2
    ) / 2

    closest_defect = None
    closest_distance = None

    for defect in detected_defects:

        dcx = (
            safe_float(
                defect.get(
                    "x1"
                )
            )
            +
            safe_float(
                defect.get(
                    "x2"
                )
            )
        ) / 2

        dcy = (
            safe_float(
                defect.get(
                    "y1"
                )
            )
            +
            safe_float(
                defect.get(
                    "y2"
                )
            )
        ) / 2

        distance = math.hypot(
            dcx - cx,
            dcy - cy,
        )

        if (
            closest_distance is None
            or
            distance
            <
            closest_distance
        ):

            closest_distance = (
                distance
            )

            closest_defect = (
                defect
            )

    # --------------------------------------------------------
    # Explicit parent panel
    # --------------------------------------------------------

    if closest_defect:

        parent_id = (
            closest_defect.get(
                "parent_panel_local_id"
            )
        )

        if parent_id is not None:

            for panel in detected_panels:

                if (
                    panel.get(
                        "local_id"
                    )
                    ==
                    parent_id
                ):

                    return panel

    # --------------------------------------------------------
    # Otherwise only accept a detected panel
    # that actually contains defect center.
    # --------------------------------------------------------

    containing = []

    for panel in detected_panels:

        px1 = safe_float(
            panel.get(
                "x1"
            )
        )

        py1 = safe_float(
            panel.get(
                "y1"
            )
        )

        px2 = safe_float(
            panel.get(
                "x2"
            )
        )

        py2 = safe_float(
            panel.get(
                "y2"
            )
        )

        if (
            cx >= px1
            and
            cx <= px2
            and
            cy >= py1
            and
            cy <= py2
        ):

            containing.append(
                panel
            )

    if not containing:

        return None

    containing.sort(
        key=lambda panel:
            (
                safe_float(
                    panel.get(
                        "x2"
                    )
                )
                -
                safe_float(
                    panel.get(
                        "x1"
                    )
                )
            )
            *
            (
                safe_float(
                    panel.get(
                        "y2"
                    )
                )
                -
                safe_float(
                    panel.get(
                        "y1"
                    )
                )
            )
    )

    return containing[0]


# ============================================================
# WEB PAGE
# ============================================================

@app.route("/")
def index():

    return render_template(
        "index.html"
    )


# ============================================================
# META
# ============================================================

@app.route("/api/meta")
def api_meta():

    return jsonify(
        {
            "width":
                WIDTH,

            "height":
                HEIGHT,

            "maxDim":
                MAX_DIM,

            "tileSize":
                TILE_SIZE,

            "maxZoom":
                MAX_ZOOM,

            "totalPanels":
                TOTAL_PANELS,

            "thermalAvailable":
                False,
        }
    )


# ============================================================
# RGB TILES
# ============================================================

@app.route(
    "/tiles/<int:z>/<int:x>/<int:y>.png"
)
def tile(
    z,
    x,
    y,
):

    resolution = (
        MAX_DIM
        /
        (
            TILE_SIZE
            *
            (
                2 ** z
            )
        )
    )

    source_x = (
        x
        *
        TILE_SIZE
        *
        resolution
    )

    source_y = (
        y
        *
        TILE_SIZE
        *
        resolution
    )

    source_w = (
        TILE_SIZE
        *
        resolution
    )

    source_h = (
        TILE_SIZE
        *
        resolution
    )

    if not RASTER_SOURCE_AVAILABLE:
        with Image.open(WEB_RGB_RASTER) as web_raster:
            scale_x = web_raster.width / WIDTH
            scale_y = web_raster.height / HEIGHT
            image = web_raster.crop((
                int(source_x * scale_x),
                int(source_y * scale_y),
                int((source_x + source_w) * scale_x),
                int((source_y + source_h) * scale_y),
            )).resize(
                (TILE_SIZE, TILE_SIZE),
                Image.Resampling.BILINEAR,
            ).convert("RGB")

        buffer = BytesIO()
        image.save(buffer, format="PNG", optimize=True)
        buffer.seek(0)
        return send_file(buffer, mimetype="image/png")

    window = Window(
        source_x,
        source_y,
        source_w,
        source_h,
    )

    band_count = min(
        3,
        raster.count
    )

    data = raster.read(
        indexes=list(
            range(
                1,
                band_count + 1
            )
        ),
        window=window,
        out_shape=(
            band_count,
            TILE_SIZE,
            TILE_SIZE,
        ),
        resampling=
            Resampling.bilinear,
        boundless=True,
        fill_value=0,
    )

    if data.shape[0] == 1:

        data = np.repeat(
            data,
            3,
            axis=0,
        )

    elif data.shape[0] == 2:

        data = np.concatenate(
            [
                data,
                data[
                    0:1
                ],
            ],
            axis=0,
        )

    arr = np.moveaxis(
        data,
        0,
        -1,
    )

    arr = stretch_rgb(
        arr
    )

    image = Image.fromarray(
        arr
    ).convert(
        "RGB"
    )

    buffer = BytesIO()

    image.save(
        buffer,
        format="PNG",
        optimize=True,
    )

    buffer.seek(0)

    return send_file(
        buffer,
        mimetype=
            "image/png",
    )


# ============================================================
# ALL MASTER PANELS
# ============================================================

@app.route("/api/all-panels")
def api_all_panels():

    # ========================================================
    # MANUAL FINAL GROUND TRUTH
    # 620 panels validated manually in Active Learning.
    # This affects Web display only.
    # ========================================================

    manual_path = (
        BASE
        / "real_data"
        / "qa"
        / "manual_master_panels.json"
    )

    manual_affected_ids = set()

    if manual_path.exists():

        try:

            manual_payload = json.loads(
                manual_path.read_text(
                    encoding="utf-8-sig"
                )
            )

            manual_panels = (
                manual_payload.get(
                    "panels",
                    {}
                )
            )

            manual_affected_ids = {
                str(panel_id)
                for panel_id, record
                in manual_panels.items()
                if isinstance(record, dict)
                and record.get(
                    "active",
                    True
                )
            }

        except Exception as exc:

            print(
                "MANUAL MASTER LOAD ERROR:",
                exc
            )

    def generate_geojson():

        yield '{"type":"FeatureCollection","features":['

        first = True

        for _, row in all_panels.iterrows():

            geometry = row.geometry

            if geometry is None or geometry.is_empty:
                continue

            panel_id = safe_text(
                row.get("panel_id", "")
            )

            feature = {
                "type": "Feature",
                "geometry": mapping(
                    geometry_to_pixel_space(geometry)
                ),
                "properties": {
                    "panel_id": panel_id,
                    "affected": (
                        panel_id in manual_affected_ids
                    ),
                },
            }

            if not first:
                yield ","

            yield json.dumps(
                feature,
                separators=(",", ":"),
            )

            first = False

        yield "]}"

    # Stream the large MASTER collection so the 512 MB Render
    # instance never holds both the feature list and encoded JSON.
    return Response(
        generate_geojson(),
        mimetype="application/json",
    )


# ============================================================
# CONFIRMED45 -> LEGACY VERIFIED PANELS
# Use the exact old /api/findings display model,
# but with the 491 Active Learning 45-degree MASTER IDs.
# ============================================================

_confirmed45_legacy_json = (
    Path(__file__).resolve().parent.parent
    / "real_data"
    / "processed"
    / "park_01"
    / "confirmed45_panel_inclusive_web"
    / "findings_45_panel_inclusive_web.json"
)

if _confirmed45_legacy_json.exists():

    _confirmed45_payload = json.loads(
        _confirmed45_legacy_json.read_text(
            encoding="utf-8"
        )
    )

    _confirmed45_ids = {
        str(item.get("panel_id"))
        for item in _confirmed45_payload.get(
            "findings",
            []
        )
        if item.get("panel_id")
    }

    verified_panels = all_panels[
        all_panels["panel_id"]
        .astype(str)
        .isin(_confirmed45_ids)
    ].copy()

    print(
        "[CONFIRMED45 LEGACY] IDs:",
        len(_confirmed45_ids)
    )

    print(
        "[CONFIRMED45 LEGACY] verified_panels:",
        len(verified_panels)
    )



# ============================================================
# VERIFIED FINDINGS
# ============================================================

@app.route("/api/findings")
def api_findings():

    # ========================================================
    # MANUAL FINAL GROUND TRUTH
    # PANEL_ID = authoritative MASTER polygon
    # filename = exact IR image selected in Active Learning
    # ========================================================

    manual_path = (
        BASE
        / "real_data"
        / "qa"
        / "manual_master_panels.json"
    )

    if not manual_path.exists():

        return jsonify(
            {
                "type": "FeatureCollection",
                "features": [],
            }
        )

    try:

        payload = json.loads(
            manual_path.read_text(
                encoding="utf-8-sig"
            )
        )

        manual_panels = payload.get(
            "panels",
            {}
        )

    except Exception as exc:

        print(
            "MANUAL FINDINGS LOAD ERROR:",
            exc
        )

        return jsonify(
            {
                "type": "FeatureCollection",
                "features": [],
            }
        )

    features = []

    for _, row in all_panels.iterrows():

        panel_id = safe_text(
            row.get(
                "panel_id",
                ""
            )
        )

        manual = manual_panels.get(
            panel_id
        )

        if not isinstance(
            manual,
            dict
        ):

            continue

        if not manual.get(
            "active",
            True
        ):

            continue

        geometry = row.geometry

        if (
            geometry is None
            or geometry.is_empty
        ):

            continue

        pixel_geometry = (
            geometry_to_pixel_space(
                geometry
            )
        )

        # Keep any legacy metadata when available.
        # Geometry and membership come ONLY from manual MASTER.
        info = finding_lookup.get(
            panel_id,
            {}
        )

        reference_filename = safe_text(
            manual.get(
                "reference_filename",
                ""
            )
        )

        features.append(
            {
                "type": "Feature",

                "geometry": mapping(
                    pixel_geometry
                ),

                "properties": {

                    "panel_id":
                        panel_id,

                    "anomaly_type":
                        safe_text(
                            info.get(
                                "anomaly_type",
                                "Manual verified defect"
                            )
                        ),

                    "severity":
                        safe_text(
                            info.get(
                                "severity",
                                ""
                            )
                        ),

                    "verified_observations":
                        1,

                    "class_confidence":
                        safe_float(
                            info.get(
                                "class_confidence",
                                1.0
                            )
                        ),

                    "latitude":
                        safe_float(
                            info.get(
                                "panel_latitude",
                                info.get(
                                    "latitude",
                                    0,
                                ),
                            )
                        ),

                    "longitude":
                        safe_float(
                            info.get(
                                "panel_longitude",
                                info.get(
                                    "longitude",
                                    0,
                                ),
                            )
                        ),

                    # IMPORTANT:
                    # exact image selected manually
                    "filename":
                        reference_filename,

                    "reference_filename":
                        reference_filename,

                    "detection_id":
                        safe_text(
                            info.get(
                                "detection_id",
                                "MANUAL_" + panel_id
                            )
                        ),

                    "manual_verified":
                        True,
                },
            }
        )

    return jsonify(
        {
            "type": "FeatureCollection",
            "features": features,
        }
    )


# ============================================================
# STATS
# ============================================================

@app.route("/api/stats")
def api_stats():

    affected = (
        findings[
            "panel_id"
        ]
        .nunique()
    )

    anomaly_counts = (
        findings[
            "anomaly_type"
        ]
        .astype(str)
        .value_counts()
        .to_dict()
    )

    severity_counts = (
        findings[
            "severity"
        ]
        .astype(str)
        .value_counts()
        .to_dict()
    )

    return jsonify(
        {
            "totalPanels":
                TOTAL_PANELS,

            "affectedPanels":
                int(
                    affected
                ),

            "affectedPercentage":
                round(
                    (
                        affected
                        /
                        TOTAL_PANELS
                    )
                    *
                    100,
                    3,
                ),

            "anomalies":
                anomaly_counts,

            "severity":
                severity_counts,
        }
    )


# ============================================================
# PANEL DETAILS
# ============================================================

@app.route(
    "/api/panel/<panel_id>"
)
def api_panel(
    panel_id,
):

    match = findings[
        findings[
            "panel_id"
        ]
        .astype(str)
        ==
        str(panel_id)
    ]

    if match.empty:

        return jsonify(
            {
                "error":
                    "No verified anomaly"
            }
        ), 404

    row = (
        match.iloc[0]
    )

    return jsonify(
        {
            "panel_id":
                str(panel_id),

            "anomaly_type":
                safe_text(
                    row.get(
                        "anomaly_type",
                        ""
                    )
                ),

            "severity":
                safe_text(
                    row.get(
                        "severity",
                        ""
                    )
                ),

            "observations":
                safe_int(
                    row.get(
                        "verified_observations",
                        1
                    ),
                    1,
                ),

            "latitude":
                safe_float(
                    row.get(
                        "panel_latitude",
                        row.get(
                            "latitude",
                            0,
                        ),
                    )
                ),

            "longitude":
                safe_float(
                    row.get(
                        "panel_longitude",
                        row.get(
                            "longitude",
                            0,
                        ),
                    )
                ),

            "filename":
                Path(
                    safe_text(
                        row.get(
                            "filename",
                            ""
                        )
                    )
                ).name,

            "detection_id":
                safe_text(
                    row.get(
                        "detection_id",
                        ""
                    )
                ),
        }
    )


# ============================================================
# THERMAL IMAGE
# ============================================================

@app.route(
    "/api/panel/<panel_id>/thermal.jpg"
)
def api_panel_thermal(
    panel_id,
):

    match = findings[
        findings[
            "panel_id"
        ]
        .astype(str)
        ==
        str(panel_id)
    ]

    if match.empty:

        return (
            "Panel not found",
            404
        )

    row = (
        match.iloc[0]
    )

    image_path = (
        resolve_ir_image(
            row.get(
                "filename",
                ""
            )
        )
    )

    if image_path is None:

        return (
            "Thermal image unavailable",
            404
        )

    image = Image.open(
        image_path
    ).convert(
        "RGB"
    )

    panel_bbox = (
        find_real_panel_bbox(
            row
        )
    )

    # Only real detected panel.
    # No anomaly bbox.
    if panel_bbox is not None:

        draw = ImageDraw.Draw(
            image
        )

        draw.rectangle(
            (
                safe_int(
                    panel_bbox.get(
                        "x1"
                    )
                ),

                safe_int(
                    panel_bbox.get(
                        "y1"
                    )
                ),

                safe_int(
                    panel_bbox.get(
                        "x2"
                    )
                ),

                safe_int(
                    panel_bbox.get(
                        "y2"
                    )
                ),
            ),

            outline=(
                70,
                255,
                120,
            ),

            width=2,
        )

    buffer = BytesIO()

    image.save(
        buffer,
        format="JPEG",
        quality=95,
    )

    buffer.seek(0)

    return send_file(
        buffer,
        mimetype=
            "image/jpeg",
    )


# ============================================================
# HEALTH
# ============================================================

@app.route("/health")
def health():

    return jsonify(
        {
            "status":
                "ok",

            "master_panels":
                len(
                    all_panels
                ),

            "verified_findings":
                len(
                    findings
                ),

            "raster_width":
                WIDTH,

            "raster_height":
                HEIGHT,
        }
    )



# ============================================================
# PV_WEB_VIEW_V3
# Improved IR panel matching + interactive-view metadata
# ============================================================

def find_panel_bbox_for_view(row):

    filename = safe_text(
        row.get(
            "filename",
            ""
        )
    )

    prediction_path = prediction_json_path(
        filename
    )

    if not prediction_path.exists():
        return None

    try:
        data = json.loads(
            prediction_path.read_text(
                encoding="utf-8"
            )
        )
    except Exception:
        return None

    detected_panels = data.get(
        "panels",
        []
    )

    detected_defects = data.get(
        "defects",
        []
    )

    if not detected_panels:
        return None

    x1 = safe_float(
        row.get("x1", 0)
    )

    y1 = safe_float(
        row.get("y1", 0)
    )

    x2 = safe_float(
        row.get("x2", 0)
    )

    y2 = safe_float(
        row.get("y2", 0)
    )

    defect_cx = (
        x1 + x2
    ) / 2.0

    defect_cy = (
        y1 + y2
    ) / 2.0

    # --------------------------------------------------------
    # FIRST CHOICE:
    # actual detected panel containing defect center.
    # --------------------------------------------------------

    containing = []

    for panel in detected_panels:

        px1 = safe_float(
            panel.get("x1", 0)
        )

        py1 = safe_float(
            panel.get("y1", 0)
        )

        px2 = safe_float(
            panel.get("x2", 0)
        )

        py2 = safe_float(
            panel.get("y2", 0)
        )

        if (
            defect_cx >= px1
            and defect_cx <= px2
            and defect_cy >= py1
            and defect_cy <= py2
        ):

            area = max(
                1,
                (px2 - px1)
                *
                (py2 - py1)
            )

            containing.append(
                (
                    area,
                    panel
                )
            )

    if containing:

        containing.sort(
            key=lambda item:
                item[0]
        )

        return containing[0][1]

    # --------------------------------------------------------
    # SECOND CHOICE:
    # closest defect JSON entry -> parent panel
    # --------------------------------------------------------

    closest_defect = None
    closest_distance = None

    for defect in detected_defects:

        dcx = (
            safe_float(
                defect.get("x1", 0)
            )
            +
            safe_float(
                defect.get("x2", 0)
            )
        ) / 2.0

        dcy = (
            safe_float(
                defect.get("y1", 0)
            )
            +
            safe_float(
                defect.get("y2", 0)
            )
        ) / 2.0

        distance = math.hypot(
            dcx - defect_cx,
            dcy - defect_cy
        )

        if (
            closest_distance is None
            or
            distance < closest_distance
        ):

            closest_distance = distance
            closest_defect = defect

    if closest_defect is not None:

        parent_id = (
            closest_defect.get(
                "parent_panel_local_id"
            )
        )

        if parent_id is not None:

            for panel in detected_panels:

                if (
                    panel.get(
                        "local_id"
                    )
                    ==
                    parent_id
                ):

                    return panel

    return None




# === MANUAL620_REFERENCE_IMAGE_V1 ===

_MANUAL620_REGISTRY_PATH = (
    BASE
    / "real_data"
    / "qa"
    / "manual_master_panels.json"
)


def manual620_reference_filename(
    panel_id,
):

    try:

        if not _MANUAL620_REGISTRY_PATH.exists():
            return ""

        data = json.loads(
            _MANUAL620_REGISTRY_PATH.read_text(
                encoding="utf-8"
            )
        )

        panels = data.get(
            "panels",
            {}
        )

        record = panels.get(
            str(panel_id),
            {}
        )

        if not record:
            return ""

        if not record.get(
            "active",
            False
        ):
            return ""

        return str(
            record.get(
                "reference_filename",
                ""
            )
            or
            ""
        ).strip()

    except Exception as exc:

        print(
            "[MANUAL620] registry error:",
            exc
        )

        return ""


def manual620_apply_reference_image(
    panel_id,
    row,
):

    reference_filename = (
        manual620_reference_filename(
            panel_id
        )
    )

    if not reference_filename:
        return row

    # pandas Series copy:
    # never mutate global findings.
    patched_row = row.copy()

    patched_row["filename"] = (
        reference_filename
    )

    patched_row["reference_filename"] = (
        reference_filename
    )

    return patched_row





# === MANUAL620_PANEL_IMAGE_V3 ===

def _manual620_panel_row_for_view(panel_id):

    panel_id = str(panel_id)

    match = findings[
        findings[
            "panel_id"
        ].astype(str)
        ==
        panel_id
    ]

    manual_path = (
        BASE
        / "real_data"
        / "qa"
        / "manual_master_panels.json"
    )

    manual = {}

    if manual_path.exists():

        try:
            import json

            data = json.loads(
                manual_path.read_text(
                    encoding="utf-8"
                )
            )

            manual = (
                data
                .get(
                    "panels",
                    {}
                )
                .get(
                    panel_id,
                    {}
                )
            ) or {}

        except Exception as exc:

            print(
                "[MANUAL620] registry read error:",
                exc
            )


    reference_filename = safe_text(
        manual.get(
            "reference_filename",
            ""
        )
    )


    if not match.empty:

        row = (
            match
            .iloc[0]
            .copy()
        )

        if reference_filename:

            row["filename"] = (
                reference_filename
            )

            row["reference_filename"] = (
                reference_filename
            )

        return row


    if not reference_filename:

        return None


    # Manual-only defective panel.
    # Enough information for the current panel-view renderer.
    return {
        "panel_id":
            panel_id,

        "filename":
            reference_filename,

        "reference_filename":
            reference_filename,

        "anomaly_type":
            "Manual verified defect",

        "severity":
            "",

        "verified_observations":
            1,

        "observations":
            1,

        "detection_id":
            "MANUAL_" + panel_id,

        "x1":
            0,

        "y1":
            0,

        "x2":
            0,

        "y2":
            0,
    }


@app.route(
    "/api/panel-view/<panel_id>"
)
def api_panel_view(
    panel_id,
):

    row = _manual620_panel_row_for_view(
        panel_id
    )

    if row is None:

        return jsonify(
            {
                "error":
                    "Panel not found"
            }
        ), 404

    # MANUAL620:
    # use exact IR filename captured during manual validation
    row = manual620_apply_reference_image(
        panel_id,
        row
    )

    x1 = safe_float(
        row.get("x1", 0)
    )

    y1 = safe_float(
        row.get("y1", 0)
    )

    x2 = safe_float(
        row.get("x2", 0)
    )

    y2 = safe_float(
        row.get("y2", 0)
    )

    defect_cx = (
        x1 + x2
    ) / 2.0

    defect_cy = (
        y1 + y2
    ) / 2.0

    panel_bbox = (
        find_panel_bbox_for_view(
            row
        )
    )

    image_width = 0
    image_height = 0

    image_path = resolve_ir_image(
        row.get(
            "filename",
            ""
        )
    )

    if image_path is not None:

        try:

            with Image.open(
                image_path
            ) as im:

                image_width = im.width
                image_height = im.height

        except Exception:
            pass

    bbox_data = None

    if panel_bbox is not None:

        bbox_data = {
            "x1":
                safe_float(
                    panel_bbox.get(
                        "x1",
                        0
                    )
                ),

            "y1":
                safe_float(
                    panel_bbox.get(
                        "y1",
                        0
                    )
                ),

            "x2":
                safe_float(
                    panel_bbox.get(
                        "x2",
                        0
                    )
                ),

            "y2":
                safe_float(
                    panel_bbox.get(
                        "y2",
                        0
                    )
                ),
        }

    return jsonify(
        {
            "panel_id":
                str(panel_id),

            "anomaly_type":
                safe_text(
                    row.get(
                        "anomaly_type",
                        ""
                    )
                ),

            "severity":
                safe_text(
                    row.get(
                        "severity",
                        ""
                    )
                ),

            "observations":
                safe_int(
                    row.get(
                        "verified_observations",
                        row.get(
                            "observations",
                            1
                        ),
                    ),
                    1,
                ),

            "latitude":
                safe_float(
                    row.get(
                        "panel_latitude",
                        row.get(
                            "latitude",
                            0
                        ),
                    )
                ),

            "longitude":
                safe_float(
                    row.get(
                        "panel_longitude",
                        row.get(
                            "longitude",
                            0
                        ),
                    )
                ),

            "filename":
                Path(
                    safe_text(
                        row.get(
                            "filename",
                            ""
                        )
                    )
                ).name,

            "detection_id":
                safe_text(
                    row.get(
                        "detection_id",
                        ""
                    )
                ),

            "defect": {
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
                "cx": defect_cx,
                "cy": defect_cy,
            },

            "panel_bbox":
                bbox_data,

            "image_width":
                image_width,

            "image_height":
                image_height,
        }
    )


@app.route(
    "/api/panel-view/<panel_id>/thermal.jpg"
)
def api_panel_view_thermal(
    panel_id,
):

    row = _manual620_panel_row_for_view(
        panel_id
    )

    if row is None:

        return (
            "Panel not found",
            404
        )

    # MANUAL620:
    # use exact IR filename captured during manual validation
    row = manual620_apply_reference_image(
        panel_id,
        row
    )

    image_path = resolve_ir_image(
        row.get(
            "filename",
            ""
        )
    )

    if image_path is None:

        return (
            "Thermal image unavailable",
            404
        )

    image = Image.open(
        image_path
    ).convert(
        "RGB"
    )

    panel_bbox = (
        find_panel_bbox_for_view(
            row
        )
    )

    # Rectangle ONLY around the panel.
    # No circle, no defect rectangle, no text.
    if panel_bbox is not None:

        draw = ImageDraw.Draw(
            image
        )

        x1 = safe_int(
            panel_bbox.get(
                "x1",
                0
            )
        )

        y1 = safe_int(
            panel_bbox.get(
                "y1",
                0
            )
        )

        x2 = safe_int(
            panel_bbox.get(
                "x2",
                0
            )
        )

        y2 = safe_int(
            panel_bbox.get(
                "y2",
                0
            )
        )

        draw.rectangle(
            (
                x1,
                y1,
                x2,
                y2,
            ),
            outline=(
                70,
                255,
                110,
            ),
            width=3,
        )


    # ========================================================
    # PV_SERVER_IR_PANEL_BOX
    # Draw the exact panel bbox directly into the IR image.
    # ========================================================

    try:

        panel_bbox = find_panel_bbox_for_view(
            row
        )

        if panel_bbox:

            px1 = int(round(float(panel_bbox.get("x1", 0))))
            py1 = int(round(float(panel_bbox.get("y1", 0))))
            px2 = int(round(float(panel_bbox.get("x2", 0))))
            py2 = int(round(float(panel_bbox.get("y2", 0))))

            px1 = max(0, min(image.width - 1, px1))
            py1 = max(0, min(image.height - 1, py1))
            px2 = max(px1 + 1, min(image.width - 1, px2))
            py2 = max(py1 + 1, min(image.height - 1, py2))

            draw = ImageDraw.Draw(
                image
            )

            line_width = max(
                4,
                int(
                    min(
                        image.width,
                        image.height
                    )
                    * 0.006
                )
            )

            # Dark outer line for contrast.
            draw.rectangle(
                (
                    px1 - 1,
                    py1 - 1,
                    px2 + 1,
                    py2 + 1,
                ),
                outline=(0, 0, 0),
                width=line_width + 2,
            )

            # Visible panel rectangle.
            draw.rectangle(
                (
                    px1,
                    py1,
                    px2,
                    py2,
                ),
                outline=(0, 255, 120),
                width=line_width,
            )

    except Exception as box_error:

        print(
            "IR PANEL BOX ERROR:",
            box_error
        )

    buffer = BytesIO()

    image.save(
        buffer,
        format="JPEG",
        quality=96,
    )

    buffer.seek(0)

    return send_file(
        buffer,
        mimetype="image/jpeg",
    )

# ============================================================
# START
# ============================================================



# ============================================================
# ADMIN SESSION CONFIG
# ============================================================

app.config["SECRET_KEY"] = (
    ADMIN_SECRET_KEY
    if ADMIN_SECRET_KEY
    else "pv-thermal-ai-local-admin-secret"
)

# ============================================================
# ADMIN LOGIN ROUTES
# ============================================================












# ============================================================
# PV_IR_PANEL_CROP_V1
# Client IR = crop around detected panel
# ============================================================

@app.route(
    "/api/panel-view/<panel_id>/thermal-crop.jpg"
)
def api_panel_view_thermal_crop(
    panel_id,
):

    # === MANUAL620_THERMAL_CROP_V1 ===

    row = _manual620_panel_row_for_view(
        panel_id
    )

    if row is None:

        return (
            "Panel not found",
            404
        )

    # MANUAL620:
    # use exact IR filename captured during manual validation
    row = manual620_apply_reference_image(
        panel_id,
        row
    )


    image_path = resolve_ir_image(
        row.get(
            "filename",
            ""
        )
    )


    if image_path is None:

        return (
            "Thermal image unavailable",
            404
        )


    image = Image.open(
        image_path
    ).convert(
        "RGB"
    )


    # --------------------------------------------------------
    # PANEL DETECTED IN IR
    # --------------------------------------------------------

    panel_bbox = (
        find_panel_bbox_for_view(
            row
        )
    )


    if panel_bbox is None:

        # fallback:
        # serve entire image if panel cannot be resolved

        buffer = BytesIO()

        image.save(
            buffer,
            format="JPEG",
            quality=96,
        )

        buffer.seek(0)

        return send_file(
            buffer,
            mimetype="image/jpeg",
        )


    px1 = safe_int(
        panel_bbox.get(
            "x1",
            0
        )
    )

    py1 = safe_int(
        panel_bbox.get(
            "y1",
            0
        )
    )

    px2 = safe_int(
        panel_bbox.get(
            "x2",
            0
        )
    )

    py2 = safe_int(
        panel_bbox.get(
            "y2",
            0
        )
    )


    # --------------------------------------------------------
    # NORMALIZE
    # --------------------------------------------------------

    px1 = max(
        0,
        min(
            image.width - 1,
            px1
        )
    )

    py1 = max(
        0,
        min(
            image.height - 1,
            py1
        )
    )

    px2 = max(
        px1 + 1,
        min(
            image.width,
            px2
        )
    )

    py2 = max(
        py1 + 1,
        min(
            image.height,
            py2
        )
    )


    panel_w = max(
        1,
        px2 - px1
    )

    panel_h = max(
        1,
        py2 - py1
    )


    panel_cx = (
        px1 + px2
    ) / 2.0

    panel_cy = (
        py1 + py2
    ) / 2.0


    # --------------------------------------------------------
    # CROP
    #
    # We intentionally keep surrounding panels visible.
    # Similar to the reference image supplied by the user.
    # --------------------------------------------------------

    crop_w = max(
        panel_w * 3.6,
        panel_h * 2.1
    )

    crop_h = max(
        panel_h * 1.65,
        panel_w * 2.0
    )


    # keep a landscape-ish client preview

    desired_ratio = 1.45

    if (
        crop_w / crop_h
        <
        desired_ratio
    ):

        crop_w = (
            crop_h
            *
            desired_ratio
        )


    cx1 = int(
        round(
            panel_cx
            -
            crop_w / 2
        )
    )

    cy1 = int(
        round(
            panel_cy
            -
            crop_h / 2
        )
    )

    cx2 = int(
        round(
            panel_cx
            +
            crop_w / 2
        )
    )

    cy2 = int(
        round(
            panel_cy
            +
            crop_h / 2
        )
    )


    # --------------------------------------------------------
    # KEEP CROP INSIDE IMAGE
    # --------------------------------------------------------

    if cx1 < 0:

        cx2 -= cx1
        cx1 = 0


    if cy1 < 0:

        cy2 -= cy1
        cy1 = 0


    if cx2 > image.width:

        shift = (
            cx2
            -
            image.width
        )

        cx1 -= shift
        cx2 = image.width


    if cy2 > image.height:

        shift = (
            cy2
            -
            image.height
        )

        cy1 -= shift
        cy2 = image.height


    cx1 = max(
        0,
        cx1
    )

    cy1 = max(
        0,
        cy1
    )

    cx2 = min(
        image.width,
        cx2
    )

    cy2 = min(
        image.height,
        cy2
    )


    crop = image.crop(
        (
            cx1,
            cy1,
            cx2,
            cy2,
        )
    )


    # --------------------------------------------------------
    # PANEL COORDINATES INSIDE CROP
    # --------------------------------------------------------

    bx1 = (
        px1 - cx1
    )

    by1 = (
        py1 - cy1
    )

    bx2 = (
        px2 - cx1
    )

    by2 = (
        py2 - cy1
    )


    # --------------------------------------------------------
    # DRAW PANEL RECTANGLE
    # --------------------------------------------------------

    draw = ImageDraw.Draw(
        crop
    )


    line_width = max(
        2,
        int(
            min(
                crop.width,
                crop.height
            )
            *
            0.006
        )
    )


    draw.rectangle(
        (
            bx1,
            by1,
            bx2,
            by2,
        ),
        outline=(
            255,
            190,
            120,
        ),
        width=line_width,
    )


    # --------------------------------------------------------
    # OUTPUT
    # --------------------------------------------------------

    buffer = BytesIO()


    crop.save(
        buffer,
        format="JPEG",
        quality=97,
    )


    buffer.seek(0)


    return send_file(
        buffer,
        mimetype="image/jpeg",
    )




# ============================================================
# ACTIVE LEARNING WEB EVIDENCE
# ============================================================

@app.route(
    "/api/active-learning-evidence/<panel_id>"
)
def api_active_learning_evidence(panel_id):

    from flask import jsonify
    from PIL import Image

    try:

        match = findings[
            findings[
                "panel_id"
            ].astype(str)
            ==
            str(panel_id)
        ]

        if match.empty:

            return jsonify({
                "ok": False,
                "error":
                    f"Panel not found: {panel_id}"
            }), 404

        row = match.iloc[0]

        filename = str(
            row.get(
                "filename",
                ""
            )
        )

        if not filename:

            return jsonify({
                "ok": False,
                "error":
                    "Finding has no IR filename"
            }), 404


        # ----------------------------------------------------
        # FULL ORIGINAL IR IMAGE
        # ----------------------------------------------------

        image_path = (
            IMAGE_ROOT
            /
            Path(
                filename.replace(
                    "\\",
                    "/"
                )
            )
        )

        if not image_path.exists():

            return jsonify({
                "ok": False,
                "error":
                    f"IR image missing: {filename}"
            }), 404


        with Image.open(
            image_path
        ) as im:

            image_width = int(
                im.width
            )

            image_height = int(
                im.height
            )


        def safe_float(name):

            value = row.get(
                name
            )

            if value is None:
                return None

            try:

                if pd.isna(value):
                    return None

                return float(
                    value
                )

            except Exception:
                return None


        panel_bbox = None

        px1 = safe_float(
            "panel_x1"
        )
        py1 = safe_float(
            "panel_y1"
        )
        px2 = safe_float(
            "panel_x2"
        )
        py2 = safe_float(
            "panel_y2"
        )

        if None not in (
            px1,
            py1,
            px2,
            py2
        ):

            panel_bbox = {
                "x1": px1,
                "y1": py1,
                "x2": px2,
                "y2": py2,
            }


        defect_bbox = None

        dx1 = safe_float(
            "defect_x1"
        )
        dy1 = safe_float(
            "defect_y1"
        )
        dx2 = safe_float(
            "defect_x2"
        )
        dy2 = safe_float(
            "defect_y2"
        )

        if None not in (
            dx1,
            dy1,
            dx2,
            dy2
        ):

            defect_bbox = {
                "x1": dx1,
                "y1": dy1,
                "x2": dx2,
                "y2": dy2,
            }


        return jsonify({

            "ok":
                True,

            "panel_id":
                str(
                    row.get(
                        "panel_id",
                        panel_id
                    )
                ),

            "filename":
                filename,

            "image_url":
                (
                    "/api/active-learning/image/"
                    +
                    str(filename)
                ),

            "image_width":
                image_width,

            "image_height":
                image_height,

            "panel_bbox":
                panel_bbox,

            "defect_bbox":
                defect_bbox,

            "observations":
                int(
                    row.get(
                        "observations",
                        1
                    )
                ),
        })

    except Exception as exc:

        print(
            "ACTIVE LEARNING EVIDENCE ERROR:",
            exc
        )

        return jsonify({
            "ok": False,
            "error": str(exc)
        }), 500


@app.route(
    "/api/active-learning-image/<panel_id>"
)
def api_active_learning_image(panel_id):

    from flask import send_file

    match = findings[
        findings[
            "panel_id"
        ].astype(str)
        ==
        str(panel_id)
    ]

    if match.empty:

        return (
            "Panel not found",
            404
        )

    row = match.iloc[0]

    filename = str(
        row.get(
            "filename",
            ""
        )
    )

    image_path = (
        IMAGE_ROOT
        /
        Path(
            filename.replace(
                "\\",
                "/"
            )
        )
    )

    if not image_path.exists():

        return (
            f"IR image missing: {filename}",
            404
        )

    return send_file(
        image_path
    )




# ============================================================
# PV-HAWK MANUAL REVIEW API
# ============================================================

REVIEW_JSON = (
    BASE
    / "real_data"
    / "processed"
    / "park_01"
    / "pvhawk_full_final_web"
    / "review_findings.json"
)


@app.get("/api/review/findings")
def review_findings():
    if not REVIEW_JSON.exists():
        return []

    return json.loads(
        REVIEW_JSON.read_text(
            encoding="utf-8"
        )
    )


@app.post("/api/review/findings/{panel_id}")
def save_review(panel_id: str, payload: dict):

    data = json.loads(
        REVIEW_JSON.read_text(
            encoding="utf-8"
        )
    )

    found = False

    for item in data:
        if str(item["panel_id"]) == str(panel_id):

            item["review_status"] = payload.get(
                "review_status",
                item.get("review_status")
            )

            item["review_class"] = payload.get(
                "review_class",
                item.get("review_class")
            )

            found = True
            break

    if not found:
        return {
            "ok": False,
            "error": "panel not found"
        }

    REVIEW_JSON.write_text(
        json.dumps(
            data,
            indent=2,
            ensure_ascii=False
        ),
        encoding="utf-8"
    )

    return {
        "ok": True,
        "panel_id": panel_id
    }


# ============================================================
# TEMPORARY OBLIQUE OFFSET VISUAL TEST
# ============================================================

@app.get("/api/offset-test")
def api_offset_test():

    test_path = (
        BASE
        / "real_data"
        / "processed"
        / "park_01"
        / "oblique70_offset_test"
        / "offset_variants.gpkg"
    )

    test_gdf = gpd.read_file(
        test_path,
        layer="offset_variants"
    )

    # Same coordinate space used by the current raster/map.
    test_gdf = test_gdf.to_crs(
        raster.crs
    )

    # Geographic -> raster pixel coordinates.
    def world_to_pixel(geom):

        x = geom.x
        y = geom.y

        col, row = ~raster.transform * (
            x,
            y
        )

        return Point(
            float(col),
            float(-row)
        )

    test_gdf["geometry"] = (
        test_gdf.geometry.apply(
            world_to_pixel
        )
    )

    return jsonify(
        test_gdf.__geo_interface__
    )



# ============================================================
# ACTIVE LEARNING - IR ORTHOPHOTO TILES
# Dedicated endpoint. Does NOT modify the main RGB /tiles route.
# ============================================================

@app.route(
    "/active-learning-ir-tiles/<int:z>/<int:x>/<int:y>.png"
)
def active_learning_ir_tile(
    z,
    x,
    y,
):

    from flask import send_file
    from PIL import Image
    from io import BytesIO

    ir_raster_path = (
        BASE
        / "web"
        / "static"
        / "map_layers"
        / "ir_aligned.jpg"
    )

    if not ir_raster_path.exists():
        return (
            "IR raster not found",
            404,
        )

    resolution = (
        MAX_DIM
        /
        (
            TILE_SIZE
            *
            (
                2 ** z
            )
        )
    )

    source_x = (
        x
        *
        TILE_SIZE
        *
        resolution
    )

    source_y = (
        y
        *
        TILE_SIZE
        *
        resolution
    )

    source_w = (
        TILE_SIZE
        *
        resolution
    )

    source_h = (
        TILE_SIZE
        *
        resolution
    )

    with Image.open(
        ir_raster_path
    ) as ir_raster:

        scale_x = (
            ir_raster.width
            /
            WIDTH
        )

        scale_y = (
            ir_raster.height
            /
            HEIGHT
        )

        image = ir_raster.crop(
            (
                int(
                    source_x
                    *
                    scale_x
                ),
                int(
                    source_y
                    *
                    scale_y
                ),
                int(
                    (
                        source_x
                        +
                        source_w
                    )
                    *
                    scale_x
                ),
                int(
                    (
                        source_y
                        +
                        source_h
                    )
                    *
                    scale_y
                ),
            )
        ).resize(
            (
                TILE_SIZE,
                TILE_SIZE,
            ),
            Image.Resampling.BILINEAR,
        ).convert(
            "RGB"
        )

    buffer = BytesIO()

    image.save(
        buffer,
        format="PNG",
        optimize=True,
    )

    buffer.seek(0)

    return send_file(
        buffer,
        mimetype="image/png",
    )



# ============================================================
# ACTIVE LEARNING - IR + MASTER PANEL
# ============================================================

ACTIVE_LEARNING_IMAGE_ROOT = Path(
    os.environ.get(
        "PV_THERMAL_IMAGE_ROOT",
        str(
            BASE
            / "real_data"
            / "raw"
            / "park_01"
            / "Imagini IR"
        ),
    )
)

ACTIVE_LEARNING_DIR = (
    BASE
    / "real_data"
    / "active_learning"
    / "oblique45"
)

ACTIVE_LEARNING_DIR.mkdir(
    parents=True,
    exist_ok=True
)

ACTIVE_LEARNING_JSON = (
    ACTIVE_LEARNING_DIR
    / "annotations.json"
)


def _al_load():

    import json

    if not ACTIVE_LEARNING_JSON.exists():
        return {}

    try:

        with open(
            ACTIVE_LEARNING_JSON,
            "r",
            encoding="utf-8"
        ) as f:

            return json.load(f)

    except Exception:

        return {}


def _al_save(data):

    import json

    tmp = ACTIVE_LEARNING_JSON.with_suffix(
        ".tmp"
    )

    with open(
        tmp,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            data,
            f,
            ensure_ascii=False,
            indent=2
        )

    tmp.replace(
        ACTIVE_LEARNING_JSON
    )


@app.get("/active-learning")
def active_learning_page():

    from flask import render_template

    return render_template(
        "active_learning.html"
    )


# QA inspection page removed - workflow retired.
@app.get("/api/active-learning/images")
def active_learning_images():

    images = sorted([
        p.name
        for p in ACTIVE_LEARNING_IMAGE_ROOT.glob(
            "*_T.jpeg"
        )
    ])

    return jsonify({
        "images": images,
        "count": len(images)
    })


@app.get(
    "/api/active-learning/image/<path:filename>"
)
def active_learning_image(filename):

    from flask import send_file

    filename = Path(
        filename
    ).name

    path = (
        ACTIVE_LEARNING_IMAGE_ROOT
        / filename
    )

    if not path.exists():

        return jsonify({
            "error":
                "image not found"
        }), 404

    return send_file(
        path
    )


@app.get(
    "/api/active-learning/annotation/<path:filename>"
)
def active_learning_annotation(filename):

    filename = Path(
        filename
    ).name

    data = _al_load()

    if filename not in data:

        return jsonify({
            "exists": False
        })

    return jsonify({
        "exists": True,
        "annotation":
            data[filename]
    })


@app.post(
    "/api/active-learning/save"
)
def active_learning_save():

    from flask import request
    from datetime import datetime

    payload = request.get_json(
        force=True
    )

    filename = Path(
        str(
            payload.get(
                "filename",
                ""
            )
        )
    ).name

    if not filename:

        return jsonify({
            "error":
                "filename missing"
        }), 400


    items = payload.get(
        "items"
    )

    if not isinstance(
        items,
        list
    ):

        return jsonify({
            "error":
                "items missing or invalid"
        }), 400


    if len(items) == 0:

        return jsonify({
            "error":
                "no panels to save"
        }), 400


    # ========================================================
    # Validate every panel independently
    # ========================================================

    for index, item in enumerate(
        items,
        start=1
    ):

        if not isinstance(
            item,
            dict
        ):

            return jsonify({
                "error":
                    f"PANEL {index}: invalid data"
            }), 400


        if not item.get(
            "panel"
        ):

            return jsonify({
                "error":
                    f"PANEL {index}: panel box missing"
            }), 400


        anomalies = item.get(
            "anomalies",
            []
        )

        if (
            not isinstance(
                anomalies,
                list
            )
            or
            len(anomalies) == 0
        ):

            return jsonify({
                "error":
                    f"PANEL {index}: no anomalies"
            }), 400


        panel_id = item.get(
            "panel_id"
        )

        if not panel_id:

            return jsonify({
                "error":
                    f"PANEL {index}: MASTER panel not assigned"
            }), 400


    # ========================================================
    # Save annotation
    # ========================================================

    data = _al_load()

    payload[
        "updated_at"
    ] = datetime.now().isoformat()

    payload[
        "panel_count"
    ] = len(
        items
    )

    payload[
        "anomaly_count"
    ] = sum(
        len(
            item.get(
                "anomalies",
                []
            )
        )
        for item in items
    )


    data[
        filename
    ] = payload


    _al_save(
        data
    )


    print(
        "ACTIVE LEARNING SAVED:",
        filename,
        "| panels:",
        payload["panel_count"],
        "| anomalies:",
        payload["anomaly_count"]
    )


    return jsonify({

        "ok":
            True,

        "filename":
            filename,

        "panels":
            payload[
                "panel_count"
            ],

        "anomalies":
            payload[
                "anomaly_count"
            ],

        "panel_ids": [
            item.get(
                "panel_id"
            )
            for item in items
        ]
    })


@app.get(
    "/api/active-learning/location/<path:filename>"
)
def active_learning_location(filename):

    import subprocess
    import json
    import math

    from pyproj import Transformer

    filename = Path(
        filename
    ).name

    path = (
        ACTIVE_LEARNING_IMAGE_ROOT
        / filename
    )

    if not path.exists():

        return jsonify({
            "ok": False,
            "error":
                "image not found"
        })


    try:

        raw = subprocess.check_output(
            [
                "exiftool",
                "-j",
                "-n",
                "-GPSLatitude",
                "-GPSLongitude",
                "-RelativeAltitude",
                "-GimbalPitchDegree",
                "-GimbalYawDegree",
                "-FlightYawDegree",
                str(path),
            ],
            text=True,
            encoding="utf-8"
        )

        info = json.loads(
            raw
        )[0]


        lat = float(
            info[
                "GPSLatitude"
            ]
        )

        lon = float(
            info[
                "GPSLongitude"
            ]
        )


        altitude = float(
            info.get(
                "RelativeAltitude",
                0.0
            )
        )


        pitch = float(
            info.get(
                "GimbalPitchDegree",
                -90.0
            )
        )


        gimbal_yaw = float(
            info.get(
                "GimbalYawDegree",
                0.0
            )
        )


        flight_yaw = float(
            info.get(
                "FlightYawDegree",
                0.0
            )
        )


        transformer = (
            Transformer.from_crs(
                "EPSG:4326",
                raster.crs,
                always_xy=True
            )
        )


        # ----------------------------------------------------
        # Drone position in raster CRS (Stereo70)
        # ----------------------------------------------------

        drone_x, drone_y = (
            transformer.transform(
                lon,
                lat
            )
        )


        # ----------------------------------------------------
        # Estimate ground point seen by image centre.
        #
        # DJI:
        #   pitch -90 = straight down
        #   pitch -45 = 45 degrees down from horizon
        #
        # horizontal distance:
        #   altitude / tan(abs(pitch))
        #
        # DJI yaw:
        #   0   = north
        #   90  = east
        # ----------------------------------------------------

        abs_pitch = abs(
            pitch
        )


        if (
            altitude > 0
            and
            5.0 < abs_pitch < 89.5
        ):

            ground_distance = (
                altitude
                /
                math.tan(
                    math.radians(
                        abs_pitch
                    )
                )
            )

        else:

            ground_distance = 0.0


        # Prefer gimbal yaw.
        # It describes the actual viewing direction.
        view_yaw = gimbal_yaw


        yaw_rad = math.radians(
            view_yaw
        )


        # Stereo70:
        # X ~ east
        # Y ~ north
        #
        # DJI yaw:
        # 0 = north
        # +90 = east

        offset_x = (
            ground_distance
            *
            math.sin(
                yaw_rad
            )
        )

        offset_y = (
            ground_distance
            *
            math.cos(
                yaw_rad
            )
        )


        target_x = (
            drone_x
            +
            offset_x
        )

        target_y = (
            drone_y
            +
            offset_y
        )


        # ----------------------------------------------------
        # Convert BOTH drone and estimated target
        # to exact pixel-space convention used by main web.
        # ----------------------------------------------------

        drone_col, drone_row = (
            inverse_transform
            *
            (
                drone_x,
                drone_y
            )
        )


        target_col, target_row = (
            inverse_transform
            *
            (
                target_x,
                target_y
            )
        )


        return jsonify({

            "ok":
                True,

            # Estimated centre of photographed area.
            "x":
                float(
                    target_col
                ),

            "y":
                float(
                    HEIGHT
                    -
                    target_row
                ),

            # Drone position too, useful for debugging.
            "drone_x":
                float(
                    drone_col
                ),

            "drone_y":
                float(
                    HEIGHT
                    -
                    drone_row
                ),

            "lat":
                lat,

            "lon":
                lon,

            "altitude":
                altitude,

            "pitch":
                pitch,

            "yaw":
                gimbal_yaw,

            "flight_yaw":
                flight_yaw,

            "view_yaw":
                view_yaw,

            "ground_offset_m":
                float(
                    ground_distance
                ),

            "offset_east_m":
                float(
                    offset_x
                ),

            "offset_north_m":
                float(
                    offset_y
                )
        })


    except Exception as exc:

        return jsonify({
            "ok": False,
            "error":
                str(exc)
        })



# ============================================================
# ACTIVE LEARNING 45 DEG - CALIBRATED PANEL SUGGESTION
# ============================================================

@app.post("/api/active-learning/suggest-panel")
def active_learning_suggest_panel():

    from flask import request
    import subprocess
    import json
    import math
    import numpy as np
    import geopandas as gpd
    from shapely.geometry import Point
    from pyproj import Transformer

    payload = request.get_json(force=True)

    filename = Path(
        str(payload.get("filename", ""))
    ).name

    u = float(
        payload.get("u", 0.5)
    )

    v = float(
        payload.get("v", 0.5)
    )

    image_path = (
        ACTIVE_LEARNING_IMAGE_ROOT
        / filename
    )

    calibration_path = (
        BASE
        / "real_data"
        / "active_learning"
        / "oblique45"
        / "calibration_45.json"
    )

    hybrid_calibration_path = (
        BASE
        / "real_data"
        / "active_learning"
        / "oblique45"
        / "calibration_45_hybrid.json"
    )

    if not image_path.exists():

        return jsonify({
            "ok": False,
            "error": "image not found"
        }), 404

    if not calibration_path.exists():

        return jsonify({
            "ok": False,
            "error": "calibration_45.json not found"
        }), 404


    # --------------------------------------------------------
    # Load global calibration first.
    # --------------------------------------------------------

    calibration = json.loads(
        calibration_path.read_text(
            encoding="utf-8"
        )
    )

    selected_calibration = calibration
    calibration_source = "GLOBAL"
    flight_id = None


    # --------------------------------------------------------
    # Identify flight/segment from DJI timestamp in filename.
    # --------------------------------------------------------

    try:
        stamp = filename.split("_")[1]
    except Exception:
        stamp = ""


    if "20260811171816" <= stamp <= "20260811172640":
        flight_id = "F1"

    elif "20260811175750" <= stamp <= "20260811175926":
        flight_id = "F2"

    elif "20260811181608" <= stamp <= "20260811181749":
        flight_id = "F3"

    elif "20260811182330" <= stamp <= "20260811182715":
        flight_id = "F4"

    elif "20260812173432" <= stamp <= "20260812175309":
        flight_id = "F5"

    elif "20260817180602" <= stamp <= "20260817181007":
        flight_id = "F6"


    # --------------------------------------------------------
    # Cross-validation-approved strategy:
    #
    # F1 -> LOCAL
    # F2 -> GLOBAL
    # F3 -> LOCAL
    # F4 -> GLOBAL
    # F5 -> LOCAL
    # F6 -> GLOBAL
    #
    # Unknown files always use GLOBAL.
    # --------------------------------------------------------

    if (
        hybrid_calibration_path.exists()
        and
        flight_id in {"F1", "F3", "F5"}
    ):

        try:

            hybrid_calibration = json.loads(
                hybrid_calibration_path.read_text(
                    encoding="utf-8"
                )
            )

            local = (
                hybrid_calibration
                .get("flights", {})
                .get(flight_id)
            )

            if (
                isinstance(local, dict)
                and
                "coef_x" in local
                and
                "coef_y" in local
            ):

                selected_calibration = local
                calibration_source = (
                    flight_id + "_LOCAL"
                )

        except Exception as exc:

            print(
                "[AL CALIBRATION] Hybrid load failed:",
                repr(exc)
            )


    coef_x = np.asarray(
        selected_calibration["coef_x"],
        dtype=float
    )

    coef_y = np.asarray(
        selected_calibration["coef_y"],
        dtype=float
    )


    raw = subprocess.check_output(
        [
            "exiftool",
            "-j",
            "-n",
            "-GPSLatitude",
            "-GPSLongitude",
            "-RelativeAltitude",
            "-GimbalPitchDegree",
            "-GimbalYawDegree",
            str(image_path),
        ],
        text=True,
        encoding="utf-8"
    )

    info = json.loads(raw)[0]

    lat = float(info["GPSLatitude"])
    lon = float(info["GPSLongitude"])

    altitude = float(
        info.get(
            "RelativeAltitude",
            0.0
        )
    )

    pitch = float(
        info.get(
            "GimbalPitchDegree",
            -45.0
        )
    )

    yaw = float(
        info.get(
            "GimbalYawDegree",
            0.0
        )
    )


    transformer = Transformer.from_crs(
        "EPSG:4326",
        raster.crs,
        always_xy=True
    )

    drone_x, drone_y = (
        transformer.transform(
            lon,
            lat
        )
    )


    abs_pitch = abs(pitch)

    if (
        altitude > 0
        and
        5 < abs_pitch < 89.5
    ):

        ground_distance = (
            altitude
            /
            math.tan(
                math.radians(
                    abs_pitch
                )
            )
        )

    else:

        ground_distance = 0.0


    yaw_rad = math.radians(yaw)

    image_center_x = (
        drone_x
        +
        ground_distance
        *
        math.sin(yaw_rad)
    )

    image_center_y = (
        drone_y
        +
        ground_distance
        *
        math.cos(yaw_rad)
    )


    features = np.asarray([
        1.0,
        altitude * (u - 0.5),
        altitude * (v - 0.5),
    ])


    dx = float(
        features @ coef_x
    )

    dy = float(
        features @ coef_y
    )


    predicted_x = (
        image_center_x
        +
        dx
    )

    predicted_y = (
        image_center_y
        +
        dy
    )


    # MASTER is already the authoritative panel geometry.
    panels = all_panels.copy()

    if panels.crs != raster.crs:
        panels = panels.to_crs(
            raster.crs
        )


    target = Point(
        predicted_x,
        predicted_y
    )


    distances = (
        panels.geometry.distance(
            target
        )
    )


    nearest_indices = (
        distances
        .sort_values()
        .head(5)
        .index
    )


    candidates = []

    for idx in nearest_indices:

        row = panels.loc[idx]

        center = (
            row.geometry.centroid
        )

        px, py = (
            world_to_map_pixel(
                center.x,
                center.y
            )
        )

        candidates.append({
            "panel_id":
                str(
                    row["panel_id"]
                ),

            "distance_m":
                float(
                    distances.loc[idx]
                ),

            "x":
                float(px),

            "y":
                float(py)
        })


    pred_px, pred_py = (
        world_to_map_pixel(
            predicted_x,
            predicted_y
        )
    )


    return jsonify({

        "ok":
            True,

        "filename":
            filename,

        "u":
            u,

        "v":
            v,

        "predicted_x":
            float(pred_px),

        "predicted_y":
            float(pred_py),

        "best_panel_id":
            candidates[0]["panel_id"]
            if candidates
            else None,

        "best_distance_m":
            candidates[0]["distance_m"]
            if candidates
            else None,

        "candidates":
            candidates
    })




# ============================================================
# ACTIVE LEARNING - YOLO V1 PREDICTIONS
# ============================================================

@app.get("/api/active-learning/predictions/<path:filename>")
def active_learning_predictions(filename):

    filename = Path(filename).name

    label_path = (
        BASE
        / "runs"
        / "active_learning_45"
        / "active_learning_45_constrained_v31_predictions"
        / "labels"
        / (Path(filename).stem + ".txt")
    )

    panel_label_path = (
        BASE
        / "runs"
        / "active_learning_45"
        / "active_learning_45_v1_panels_all4160_predictions"
        / "labels"
        / (Path(filename).stem + ".txt")
    )

    if not label_path.exists() and not panel_label_path.exists():

        return jsonify({
            "ok": True,
            "exists": False,
            "panels": [],
            "anomalies": []
        })


    panels = []
    anomalies = []


    for raw_line in label_path.read_text(
        encoding="utf-8"
    ).splitlines():

        line = raw_line.strip()

        if not line:
            continue

        parts = line.split()

        if len(parts) < 5:
            continue


        class_id = int(
            float(parts[0])
        )

        cx = float(parts[1])
        cy = float(parts[2])
        w = float(parts[3])
        h = float(parts[4])

        confidence = (
            float(parts[5])
            if len(parts) >= 6
            else None
        )


        box = {
            "x": cx - w / 2,
            "y": cy - h / 2,
            "w": w,
            "h": h,
            "confidence": confidence,
            "source": "ai"
        }


        if class_id == 0:
            continue

        elif class_id == 1:
            if (
                confidence is None
                or confidence >= 0.05
            ):
                anomalies.append(box)


    # PANEL geometry comes exclusively from V1 all4160.
    # Ignore weak V1 detections below 0.05.
    if panel_label_path.exists():

        for raw_line in panel_label_path.read_text(
            encoding="utf-8"
        ).splitlines():

            parts = raw_line.strip().split()

            if len(parts) < 5:
                continue

            class_id = int(float(parts[0]))

            if class_id != 0:
                continue

            confidence = (
                float(parts[5])
                if len(parts) >= 6
                else None
            )

            if (
                confidence is not None
                and confidence < 0.05
            ):
                continue

            cx = float(parts[1])
            cy = float(parts[2])
            w = float(parts[3])
            h = float(parts[4])

            panels.append({
                "x": cx - w / 2,
                "y": cy - h / 2,
                "w": w,
                "h": h,
                "confidence": confidence,
                "source": "ai"
            })


    # Keep only anomalies whose CENTER lies inside
    # one of the accepted V1 panel boxes.
    filtered_anomalies = []

    for anomaly in anomalies:

        acx = anomaly["x"] + anomaly["w"] / 2
        acy = anomaly["y"] + anomaly["h"] / 2

        inside_panel = False

        for panel in panels:

            if (
                panel["x"] <= acx <= panel["x"] + panel["w"]
                and
                panel["y"] <= acy <= panel["y"] + panel["h"]
            ):
                inside_panel = True
                break

        if inside_panel:
            filtered_anomalies.append(anomaly)


    return jsonify({
        "ok": True,
        "exists": True,
        "panels": panels,
        "anomalies": filtered_anomalies
    })


# ============================================================
# CONFIRMED45 WEB V1
# Final Active Learning 45-degree findings
# ============================================================

CONFIRMED45_PROJECT_ROOT = Path(__file__).resolve().parent.parent



CONFIRMED45_WEB_JSON = (
    CONFIRMED45_PROJECT_ROOT
    / "real_data"
    / "processed"
    / "park_01"
    / "active_learning_exact_web_v31_hybrid"
    / "findings_active_learning_exact_v31_hybrid.json"
)

CONFIRMED45_WEB_GPKG = (
    CONFIRMED45_PROJECT_ROOT
    / "real_data"
    / "processed"
    / "park_01"
    / "active_learning_exact_web_v31_hybrid"
    / "panels_active_learning_exact_v31_hybrid.gpkg"
)


def _confirmed45_load():

    if not CONFIRMED45_WEB_JSON.exists():
        return None, {}

    data = json.loads(
        CONFIRMED45_WEB_JSON.read_text(
            encoding="utf-8"
        )
    )

    lookup = {
        str(item["panel_id"]): item
        for item in data.get(
            "findings",
            []
        )
    }

    return data, lookup


def _confirmed45_geojson():

    data, lookup = _confirmed45_load()

    if data is None:
        return None

    if not CONFIRMED45_WEB_GPKG.exists():
        return None

    gdf = gpd.read_file(
        CONFIRMED45_WEB_GPKG
    )

    # Browser/OpenLayers expects WGS84.
    if gdf.crs is not None:
        gdf = gdf.to_crs(
            epsg=4326
        )

    features = []

    for _, row in gdf.iterrows():

        panel_id = str(
            row.get(
                "panel_id",
                ""
            )
        )

        finding = lookup.get(
            panel_id,
            {}
        )

        geometry = row.geometry

        if geometry is None:
            continue

        observations = finding.get(
            "observations",
            []
        )

        properties = {
            "panel_id":
                panel_id,

            "anomaly":
                "Confirmed anomaly",

            "anomaly_type":
                "Confirmed anomaly",

            "severity":
                "confirmed",

            "observations":
                len(observations),

            "observation_count":
                len(observations),

            "anomaly_count":
                finding.get(
                    "anomaly_count",
                    0
                ),

            "confirmed45":
                True,
        }

        centroid = geometry.centroid

        properties["longitude"] = (
            float(centroid.x)
        )

        properties["latitude"] = (
            float(centroid.y)
        )

        features.append({
            "type": "Feature",
            "geometry":
                geometry.__geo_interface__,
            "properties":
                properties,
        })

    return {
        "type":
            "FeatureCollection",

        "count":
            len(features),

        "features":
            features,
    }


@app.get(
    "/api/confirmed45/findings"
)
def api_confirmed45_findings():

    result = _confirmed45_geojson()

    if result is None:
        return jsonify({
            "error":
                "confirmed45 dataset not found"
        }), 404

    return jsonify(
        result
    )


@app.get(
    "/api/confirmed45/panel/<panel_id>"
)
def api_confirmed45_panel(
    panel_id
):

    data, lookup = _confirmed45_load()

    if data is None:
        return jsonify({
            "error":
                "confirmed45 dataset not found"
        }), 404

    finding = lookup.get(
        str(panel_id)
    )

    if finding is None:
        return jsonify({
            "error":
                "panel not found"
        }), 404

    observations = []

    for index, obs in enumerate(
        finding.get(
            "observations",
            []
        )
    ):

        filename = str(
            obs.get(
                "filename",
                ""
            )
        )

        panel_bbox = obs.get(
            "panel_bbox"
        )

        anomalies = obs.get(
            "anomalies",
            []
        )

        observations.append({
            "index":
                index,

            "filename":
                filename,

            "image_url":
                (
                    "/api/active-learning/image/"
                    +
                    filename
                ),

            "marked_image_url":
                (
                    "/api/confirmed45/marked-image/"
                    +
                    str(panel_id)
                    +
                    "/"
                    +
                    str(index)
                ),

            "panel_bbox":
                panel_bbox,

            "panel":
                panel_bbox,

            "anomalies":
                anomalies,

            "anomaly_count":
                len(anomalies),

            # compatibility with existing
            # Active Learning viewer
            "defect_bbox":
                (
                    anomalies[0]
                    if anomalies
                    else None
                ),

            "assignment_source":
                obs.get(
                    "assignment_source"
                ),

            "best_distance_m":
                obs.get(
                    "best_distance_m"
                ),
        })

    first = (
        observations[0]
        if observations
        else {}
    )

    return jsonify({
        "ok":
            True,

        "panel_id":
            str(panel_id),

        "confirmed45":
            True,

        "observation_count":
            len(observations),

        "anomaly_count":
            finding.get(
                "anomaly_count",
                0
            ),

        "observations":
            observations,

        # Same observations under the name expected by
        # web/static/confirmed45.js
        "photos":
            observations,

        # compatibility with current viewer
        "filename":
            first.get(
                "filename"
            ),

        "image_url":
            first.get(
                "image_url"
            ),

        "panel_bbox":
            first.get(
                "panel_bbox"
            ),

        "defect_bbox":
            first.get(
                "defect_bbox"
            ),
    })


print(
    "[CONFIRMED45] dataset:",
    CONFIRMED45_WEB_JSON
)




# ============================================================
# CONFIRMED45_HIGH_RECALL_PANEL_V2
# Final web panel evidence:
# - 619 unique MASTER panels
# - original 45-degree image
# - Panel bbox
# - all Anomaly bboxes
# - MASTER panel centre coordinates
# ============================================================

CONFIRMED45_HIGH_RECALL_JSON = (
    Path(__file__).resolve().parent.parent
    / "real_data"
    / "processed"
    / "park_01"
    / "confirmed45_panel_inclusive_web"
    / "findings_45_panel_inclusive_web.json"
)


def _confirmed45_high_recall_lookup():

    payload = json.loads(
        CONFIRMED45_HIGH_RECALL_JSON.read_text(
            encoding="utf-8"
        )
    )

    return {
        str(item["panel_id"]): item
        for item in payload.get(
            "findings",
            []
        )
    }


@app.get(
    "/api/confirmed45-panel-inclusive/panel/<panel_id>"
)
def api_confirmed45_panel_inclusive(
    panel_id
):

    lookup = _confirmed45_high_recall_lookup()

    finding = lookup.get(
        str(panel_id)
    )

    # --------------------------------------------------------
    # MASTER INSPECTION
    # Inactive MASTER panels are valid inspection targets.
    # Clicking them must NOT activate or modify findings.
    # --------------------------------------------------------
    is_active = finding is not None

    # --------------------------------------------------------
    # MASTER panel centre.
    # all_panels is already the authoritative MASTER dataset.
    # --------------------------------------------------------

    panel_rows = all_panels[
        all_panels["panel_id"]
        .astype(str)
        ==
        str(panel_id)
    ]

    longitude = None
    latitude = None
    center_x = None
    center_y = None

    if not panel_rows.empty:

        master_geom = (
            panel_rows
            .iloc[0]
            .geometry
        )

        if master_geom is not None:

            centroid = master_geom.centroid

            # Centre in raster/world CRS.
            center_x = float(
                centroid.x
            )

            center_y = float(
                centroid.y
            )

            try:

                geo_center = gpd.GeoSeries(
                    [centroid],
                    crs=all_panels.crs
                ).to_crs(
                    epsg=4326
                ).iloc[0]

                longitude = float(
                    geo_center.x
                )

                latitude = float(
                    geo_center.y
                )

            except Exception:
                pass

    if finding is None:
        finding = {
            "panel_id": str(panel_id),
            "observations": [],
            "anomaly_count": 0,
        }

    photos = []

    for index, obs in enumerate(
        finding.get(
            "observations",
            []
        )
    ):

        filename = str(
            obs.get(
                "filename",
                ""
            )
        )

        anomalies = (
            obs.get(
                "anomalies",
                []
            )
            or
            []
        )

        panel_bbox = obs.get(
            "panel_bbox"
        )

        photos.append({
            "index":
                index,

            "filename":
                filename,

            "image_url":
                (
                    "/api/active-learning/image/"
                    +
                    filename
                ),

            # YOLO normalized center bbox
            "panel":
                panel_bbox,

            "panel_bbox":
                panel_bbox,

            "anomalies":
                anomalies,

            "anomaly_count":
                len(anomalies),

            "assignment_source":
                obs.get(
                    "assignment_source"
                ),

            "best_distance_m":
                obs.get(
                    "best_distance_m"
                ),
        })

    return jsonify({

        "ok":
            True,

        "panel_id":
            str(panel_id),

        "confirmed45":
            bool(is_active),

        "active":
            bool(is_active),

        "inspection_only":
            not bool(is_active),

        "high_recall":
            bool(is_active),

        "latitude":
            latitude,

        "longitude":
            longitude,

        "center_x":
            center_x,

        "center_y":
            center_y,

        "observations":
            len(photos),

        "observation_count":
            len(photos),

        "anomaly_count":
            finding.get(
                "anomaly_count",
                0
            ),

        "photos":
            photos,
    })





# ============================================================
# ACTIVE LEARNING MARKED IMAGE FOR WEB
# Rasterized exactly from Panel + Anomaly geometry.
# ============================================================

@app.get(
    "/api/confirmed45/marked-image/<panel_id>/<int:photo_index>"
)
def api_confirmed45_marked_image(
    panel_id,
    photo_index
):

    from io import BytesIO

    from flask import send_file
    from PIL import (
        Image,
        ImageDraw,
        ImageFont,
    )


    # --------------------------------------------------------
    # Get the same observation used by the WEB detail viewer.
    # --------------------------------------------------------

    data, lookup = _confirmed45_load()

    if data is None:

        return (
            "Confirmed45 dataset not found",
            404
        )


    finding = lookup.get(
        str(panel_id)
    )

    if finding is None:

        return (
            "Panel not found",
            404
        )


    observations = (
        finding.get(
            "observations",
            []
        )
        or
        []
    )


    if (
        photo_index < 0
        or
        photo_index >= len(observations)
    ):

        return (
            "Photo index out of range",
            404
        )


    obs = observations[
        photo_index
    ]


    filename = str(
        obs.get(
            "filename",
            ""
        )
    )


    image_path = (
        ACTIVE_LEARNING_IMAGE_ROOT
        /
        Path(filename).name
    )


    if not image_path.exists():

        return (
            "Image not found",
            404
        )


    # --------------------------------------------------------
    # PANEL GEOMETRY PRIORITY
    #
    # 1. Exact manual PANEL drawn in Active Learning
    # 2. Existing Confirmed45 geometry as fallback
    # --------------------------------------------------------

    manual_panel_box = (
        find_manual_active_learning_panel_bbox({
            "filename": filename,
            "panel_id": str(panel_id),
        })
    )

    if manual_panel_box is not None:

        # Helper returns pixel coordinates x1/y1/x2/y2.
        # Convert back to normalized x/y/w/h because the
        # marked-image renderer below expects normalized boxes.

        with Image.open(image_path) as _probe:
            _iw, _ih = _probe.size

        panel_box = {
            "x":
                manual_panel_box["x1"] / _iw,

            "y":
                manual_panel_box["y1"] / _ih,

            "w":
                (
                    manual_panel_box["x2"]
                    -
                    manual_panel_box["x1"]
                ) / _iw,

            "h":
                (
                    manual_panel_box["y2"]
                    -
                    manual_panel_box["y1"]
                ) / _ih,
        }

    else:

        panel_box = (
            obs.get("panel_bbox")
            or
            obs.get("panel")
        )


    anomalies = (
        obs.get(
            "anomalies",
            []
        )
        or
        []
    )


    # --------------------------------------------------------
    # Original IR image.
    # --------------------------------------------------------

    image = Image.open(
        image_path
    ).convert(
        "RGB"
    )

    draw = ImageDraw.Draw(
        image
    )

    W, H = image.size


    # --------------------------------------------------------
    # Same visual logic as Active Learning drawBox().
    # --------------------------------------------------------

    try:

        font = ImageFont.truetype(
            "arialbd.ttf",
            13
        )

    except Exception:

        font = ImageFont.load_default()


    def _box_values(box):

        if not isinstance(
            box,
            dict
        ):
            return None

        try:

            x = float(
                box.get("x")
            )

            y = float(
                box.get("y")
            )

            w = float(
                box.get("w")
            )

            h = float(
                box.get("h")
            )

        except Exception:

            return None


        return (
            x,
            y,
            w,
            h
        )


    def _draw_box(
        box,
        color,
        label,
        width
    ):

        values = _box_values(
            box
        )

        if values is None:
            return


        x, y, w, h = values


        # Active Learning stores normalized top-left
        # rectangle coordinates.
        px = int(
            round(
                x * W
            )
        )

        py = int(
            round(
                y * H
            )
        )

        pw = int(
            round(
                w * W
            )
        )

        ph = int(
            round(
                h * H
            )
        )


        x2 = px + pw
        y2 = py + ph


        # Canvas strokeRect equivalent.
        draw.rectangle(
            [
                px,
                py,
                x2,
                y2,
            ],
            outline=color,
            width=max(
                1,
                int(
                    round(width)
                )
            )
        )


        # JS:
        # ctx.font = "bold 13px Arial"
        # tw = measureText(label).width
        try:

            bbox = draw.textbbox(
                (0, 0),
                label,
                font=font
            )

            tw = (
                bbox[2]
                -
                bbox[0]
            )

        except Exception:

            tw = (
                len(label)
                *
                8
            )


        label_y = max(
            0,
            py - 18
        )


        # ctx.fillRect(x, max(0,y-18), tw+9,18)
        draw.rectangle(
            [
                px,
                label_y,
                px + tw + 9,
                label_y + 18,
            ],
            fill=color
        )


        # ctx.fillStyle = "#000"
        # ctx.fillText(label, x+4, max(13,y-4))
        text_y = max(
            13,
            py - 4
        )


        # Pillow uses top-left text origin;
        # compensate to visually match canvas baseline.
        draw.text(
            (
                px + 4,
                text_y - 13
            ),
            label,
            fill="#000000",
            font=font
        )


    # --------------------------------------------------------
    # PANEL.
    # Active Learning selected panel uses cyan + width 4.
    # --------------------------------------------------------

    if panel_box:

        _draw_box(
            panel_box,
            "#00ffff",
            f"PANEL 1 -> {panel_id}",
            4
        )


    # --------------------------------------------------------
    # ANOMALIES.
    # --------------------------------------------------------

    for anomaly_index, anomaly in enumerate(
        []
    ):

        _draw_box(
            anomaly,
            "#ff3b30",
            f"A{anomaly_index + 1}",
            2.5
        )


    # --------------------------------------------------------
    # Return rasterized image.
    # --------------------------------------------------------

    output = BytesIO()

    image.save(
        output,
        format="JPEG",
        quality=95
    )

    output.seek(0)


    return send_file(
        output,
        mimetype="image/jpeg",
        download_name=(
            Path(filename).stem
            +
            "_marked.jpg"
        )
    )



# ============================================================
# ACTIVE LEARNING LIVE WEB
#
# AUTHORITATIVE SOURCE:
# real_data/active_learning/oblique45/annotations.json
#
# No 619 / 673 static dataset.
# Every manually saved Active Learning PANEL_ID enters WEB.
# ============================================================

def _pv_al_live_collect():

    from collections import defaultdict

    data = _al_load()

    by_panel = defaultdict(list)

    total_items = 0
    total_anomalies = 0


    for filename, annotation in data.items():

        if not isinstance(annotation, dict):
            continue


        image_width = annotation.get(
            "image_width"
        )

        image_height = annotation.get(
            "image_height"
        )


        for item in annotation.get(
            "items",
            []
        ):

            if not isinstance(item, dict):
                continue


            panel_id = safe_text(
                item.get(
                    "panel_id",
                    ""
                )
            )

            panel_box = item.get(
                "panel"
            )


            if (
                not panel_id
                or
                not panel_box
            ):
                continue


            anomalies = (
                item.get(
                    "anomalies",
                    []
                )
                or
                []
            )


            observation = {

                "filename":
                    Path(filename).name,

                "panel_bbox":
                    panel_box,

                "panel":
                    panel_box,

                "anomalies":
                    anomalies,

                "anomaly_count":
                    len(anomalies),

                "image_width":
                    image_width,

                "image_height":
                    image_height,

                "assignment_source":
                    "manual_active_learning",
            }


            by_panel[
                panel_id
            ].append(
                observation
            )


            total_items += 1
            total_anomalies += len(
                anomalies
            )


    return (
        by_panel,
        total_items,
        total_anomalies,
    )


def _pv_al_master_subset(
    panel_ids
):

    ids = {
        str(x)
        for x in panel_ids
    }


    gdf = all_panels[
        all_panels[
            "panel_id"
        ]
        .astype(str)
        .isin(ids)
    ].copy()


    if gdf.crs is not None:

        gdf = gdf.to_crs(
            epsg=4326
        )


    return gdf


def _pv_al_live_findings():

    from flask import jsonify
    from shapely.geometry import mapping


    by_panel, total_items, total_anomalies = (
        _pv_al_live_collect()
    )


    master = _pv_al_master_subset(
        by_panel.keys()
    )


    features = []


    for _, row in master.iterrows():

        panel_id = str(
            row[
                "panel_id"
            ]
        )


        observations = by_panel.get(
            panel_id,
            []
        )


        if not observations:
            continue


        geom = row.geometry


        features.append({

            "type":
                "Feature",

            "geometry":
                mapping(
                    geom
                ),

            "properties": {

                "panel_id":
                    panel_id,

                "anomaly_type":
                    "Active Learning",

                "severity":
                    "Confirmed",

                "status":
                    "Confirmed",

                "observations":
                    len(
                        observations
                    ),

                "anomaly_count":
                    sum(
                        len(
                            o.get(
                                "anomalies",
                                []
                            )
                        )
                        for o in observations
                    ),

                "source":
                    "manual_active_learning",
            }
        })


    missing = (
        set(
            by_panel.keys()
        )
        -
        set(
            master[
                "panel_id"
            ]
            .astype(str)
            .tolist()
        )
    )


    print(
        "[AL LIVE WEB]",
        "unique panels =",
        len(features),
        "| observations =",
        total_items,
        "| anomalies =",
        total_anomalies,
        "| missing MASTER =",
        len(missing)
    )


    return jsonify({

        "type":
            "FeatureCollection",

        "features":
            features,

        "stats": {

            "unique_panels":
                len(features),

            "observations":
                total_items,

            "anomalies":
                total_anomalies,

            "missing_master":
                len(missing),
        }
    })


def _pv_al_live_panel(
    panel_id
):

    from flask import jsonify


    panel_id = str(
        panel_id
    )


    by_panel, _, _ = (
        _pv_al_live_collect()
    )


    observations = by_panel.get(
        panel_id
    )


    if not observations:

        return jsonify({
            "ok":
                False,

            "error":
                "Panel not found in Active Learning"
        }), 404


    master = _pv_al_master_subset(
        [panel_id]
    )


    latitude = None
    longitude = None


    if not master.empty:

        geom = master.iloc[
            0
        ].geometry

        center = geom.centroid

        longitude = float(
            center.x
        )

        latitude = float(
            center.y
        )


    photos = []


    for index, obs in enumerate(
        observations
    ):

        filename = obs[
            "filename"
        ]


        photos.append({

            **obs,

            "index":
                index,

            "image_url":
                (
                    "/api/active-learning/image/"
                    +
                    filename
                ),

            "marked_image_url":
                (
                    "/api/confirmed45/marked-image/"
                    +
                    panel_id
                    +
                    "/"
                    +
                    str(index)
                ),
        })


    return jsonify({

        "ok":
            True,

        "panel_id":
            panel_id,

        "confirmed45":
            True,

        "source":
            "manual_active_learning_live",

        "latitude":
            latitude,

        "longitude":
            longitude,

        "observation_count":
            len(
                photos
            ),

        "observations":
            photos,

        "photos":
            photos,
    })


def _pv_al_live_marked_image(
    panel_id,
    photo_index
):

    from io import BytesIO

    from flask import send_file

    from PIL import (
        Image,
        ImageDraw,
        ImageFont,
    )


    panel_id = str(
        panel_id
    )


    by_panel, _, _ = (
        _pv_al_live_collect()
    )


    observations = by_panel.get(
        panel_id,
        []
    )


    if (
        photo_index < 0
        or
        photo_index >= len(
            observations
        )
    ):

        return (
            "Photo index out of range",
            404
        )


    obs = observations[
        photo_index
    ]


    filename = obs[
        "filename"
    ]


    image_path = (
        ACTIVE_LEARNING_IMAGE_ROOT
        /
        Path(
            filename
        ).name
    )


    if not image_path.exists():

        return (
            "Image not found",
            404
        )


    image = Image.open(
        image_path
    ).convert(
        "RGB"
    )


    draw = ImageDraw.Draw(
        image
    )


    W, H = image.size


    panel = obs.get(
        "panel"
    )


    if panel:

        x = float(
            panel.get(
                "x",
                0
            )
        )

        y = float(
            panel.get(
                "y",
                0
            )
        )

        w = float(
            panel.get(
                "w",
                0
            )
        )

        h = float(
            panel.get(
                "h",
                0
            )
        )


        x1 = int(
            round(
                x * W
            )
        )

        y1 = int(
            round(
                y * H
            )
        )

        x2 = int(
            round(
                (
                    x + w
                )
                * W
            )
        )

        y2 = int(
            round(
                (
                    y + h
                )
                * H
            )
        )


        # PANEL ONLY.
        # No anomaly boxes in WEB image.
        draw.rectangle(
            (
                x1,
                y1,
                x2,
                y2
            ),
            outline=(
                0,
                255,
                255
            ),
            width=4
        )


        label = (
            "PANEL 1 -> "
            +
            panel_id
        )


        try:

            font = ImageFont.truetype(
                "arialbd.ttf",
                13
            )

        except Exception:

            font = ImageFont.load_default()


        try:

            tb = draw.textbbox(
                (0, 0),
                label,
                font=font
            )

            tw = (
                tb[2]
                -
                tb[0]
            )

        except Exception:

            tw = (
                len(label)
                *
                8
            )


        label_y = max(
            0,
            y1 - 18
        )


        draw.rectangle(
            (
                x1,
                label_y,
                x1 + tw + 9,
                label_y + 18
            ),
            fill=(
                0,
                255,
                255
            )
        )


        draw.text(
            (
                x1 + 4,
                label_y + 2
            ),
            label,
            fill=(
                0,
                0,
                0
            ),
            font=font
        )


    output = BytesIO()


    image.save(
        output,
        format="JPEG",
        quality=95
    )


    output.seek(0)


    return send_file(
        output,
        mimetype="image/jpeg"
    )


# ------------------------------------------------------------
# Replace EXISTING routes without creating duplicate URLs.
# ------------------------------------------------------------


# ============================================================
# ACTIVE LEARNING EXACT -> MAIN WEB FINDINGS
# ============================================================

_PV_AL_EXACT_GDF = None
_PV_AL_EXACT_GEOJSON = None


def _pv_load_active_learning_exact_geojson():

    global _PV_AL_EXACT_GDF
    global _PV_AL_EXACT_GEOJSON

    if _PV_AL_EXACT_GEOJSON is not None:
        return _PV_AL_EXACT_GEOJSON

    import geopandas as gpd
    import json

    gdf = gpd.read_file(
        CONFIRMED45_WEB_GPKG
    )

    if (
        gdf.crs is not None
        and
        str(gdf.crs).upper() != "EPSG:4326"
    ):
        gdf = gdf.to_crs(
            epsg=4326
        )

    _PV_AL_EXACT_GDF = gdf

    geojson = json.loads(
        gdf.to_json()
    )

    # --------------------------------------------------------
    # Frontend compatibility.
    #
    # app.js styles findings using anomaly_type.
    # Without it, features become "Unknown" and can be hidden
    # by the interactive legend.
    # --------------------------------------------------------

    exact_data, exact_lookup = (
        _confirmed45_load()
    )

    for feature in geojson.get(
        "features",
        []
    ):

        props = feature.setdefault(
            "properties",
            {}
        )

        panel_id = str(
            props.get(
                "panel_id",
                ""
            )
        )

        finding = exact_lookup.get(
            panel_id,
            {}
        )

        observation_count = int(
            finding.get(
                "observation_count",
                0
            )
            or 0
        )

        anomaly_count = int(
            finding.get(
                "anomaly_count",
                0
            )
            or 0
        )

        props[
            "anomaly_type"
        ] = "Active Learning 45"

        props[
            "severity"
        ] = "Confirmed"

        props[
            "status"
        ] = "Confirmed"

        props[
            "verified_observations"
        ] = observation_count

        props[
            "observations"
        ] = observation_count

        props[
            "anomaly_count"
        ] = anomaly_count

        props[
            "source"
        ] = "active_learning_exact"

    _PV_AL_EXACT_GEOJSON = geojson

    print(
        "[AL EXACT WEB] loaded",
        len(gdf),
        "defective panels"
    )

    return _PV_AL_EXACT_GEOJSON


def _pv_active_learning_exact_findings():

    data = (
        _pv_load_active_learning_exact_geojson()
    )

    return jsonify(data)


# Replace ONLY the main /api/findings endpoint.
for _rule in list(
    app.url_map.iter_rules()
):

    if _rule.rule == "/api/findings":

        # MANUAL620:
        # Keep the original api_findings handler registered above.
        # The old ACTIVE LEARNING EXACT dataset is retained on disk
        # but no longer overrides /api/findings.
        print(
            "[MANUAL620] /api/findings -> manual MASTER dataset"
        )

        break


# AL LIVE WEB route overrides DISABLED.
# Web now uses the prebuilt ACTIVE LEARNING EXACT dataset.
print(
    "[AL EXACT WEB] prebuilt dataset is authoritative"
)



# ============================================================
# QA INSPECTION - NEW 90/70 IR ORTHOMOSAIC
# Completely isolated from the main Web and Active Learning map.
# GeoTIFF is the georeferencing authority.
# ============================================================

_QA_ORTHO_TIF = (
    BASE
    / "real_data"
    / "processed"
    / "park_01"
    / "orthomosaic_new"
    / "ir_orthomosaic_90_70_georef.tif"
)

_QA_ORTHO_WEB = (
    BASE
    / "real_data"
    / "processed"
    / "park_01"
    / "orthomosaic_new"
    / "ir_orthomosaic_90_70_web.jpg"
)

_QA_TILE_SIZE = 256


def _qa_raster_metadata():

    import math
    import rasterio

    with rasterio.open(
        _QA_ORTHO_TIF
    ) as src:

        width = int(
            src.width
        )

        height = int(
            src.height
        )

        max_dim = max(
            width,
            height,
        )

        max_zoom = int(
            math.ceil(
                math.log2(
                    max_dim
                    /
                    _QA_TILE_SIZE
                )
            )
        )

        return {
            "width":
                width,

            "height":
                height,

            "maxDim":
                max_dim,

            "tileSize":
                _QA_TILE_SIZE,

            "maxZoom":
                max_zoom,

            "totalPanels":
                len(
                    all_panels
                ),

            "thermalAvailable":
                True,
        }


@app.route("/api/qa/meta")
def api_qa_meta():

    if not _QA_ORTHO_TIF.exists():

        return jsonify(
            {
                "ok":
                    False,

                "error":
                    "QA GeoTIFF not found",

                "path":
                    str(
                        _QA_ORTHO_TIF
                    ),
            }
        ), 404

    return jsonify(
        _qa_raster_metadata()
    )


@app.route("/api/qa/all-panels")
def api_qa_all_panels():

    import rasterio

    from shapely.affinity import (
        affine_transform
    )

    from shapely.geometry import (
        mapping
    )

    if not _QA_ORTHO_TIF.exists():

        return jsonify(
            {
                "type":
                    "FeatureCollection",

                "features":
                    [],

                "error":
                    "QA GeoTIFF not found",
            }
        ), 404


    with rasterio.open(
        _QA_ORTHO_TIF
    ) as src:

        raster_crs = (
            src.crs
        )

        width = int(
            src.width
        )

        height = int(
            src.height
        )

        inv = (
            ~src.transform
        )


    panels_geo = (
        all_panels
    )

    if (
        raster_crs is not None
        and
        panels_geo.crs is not None
        and
        str(
            panels_geo.crs
        )
        !=
        str(
            raster_crs
        )
    ):

        panels_geo = (
            panels_geo.to_crs(
                raster_crs
            )
        )


    # Inverse raster transform:
    #
    # world -> raster:
    #   col = a*x + b*y + c
    #   row = d*x + e*y + f
    #
    # OpenLayers PV_IMAGE has Y upwards,
    # while raster rows grow downwards:
    #
    #   pixel_y = height - row
    #
    qa_affine = [
        float(
            inv.a
        ),

        float(
            inv.b
        ),

        float(
            -inv.d
        ),

        float(
            -inv.e
        ),

        float(
            inv.c
        ),

        float(
            height
            -
            inv.f
        ),
    ]


    features = []


    for _, row in (
        panels_geo.iterrows()
    ):

        geometry = (
            row.geometry
        )

        if (
            geometry is None
            or
            geometry.is_empty
        ):

            continue


        panel_id = safe_text(
            row.get(
                "panel_id",
                ""
            )
        )


        pixel_geometry = (
            affine_transform(
                geometry,
                qa_affine
            )
        )


        features.append(
            {
                "type":
                    "Feature",

                "geometry":
                    mapping(
                        pixel_geometry
                    ),

                "properties": {
                    "panel_id":
                        panel_id,

                    "affected":
                        panel_id
                        in
                        affected_ids,
                },
            }
        )


    return jsonify(
        {
            "type":
                "FeatureCollection",

            "features":
                features,
        }
    )


@app.route(
    "/qa-ir-tiles/<int:z>/<int:x>/<int:y>.png"
)
def qa_ir_tile(
    z,
    x,
    y,
):

    from flask import send_file
    from io import BytesIO

    import numpy as np
    import rasterio

    from rasterio.enums import Resampling
    from rasterio.windows import Window
    from PIL import Image


    if not _QA_ORTHO_TIF.exists():

        return (
            "QA IR GeoTIFF not found",
            404,
        )


    meta = _qa_raster_metadata()

    width = int(meta["width"])
    height = int(meta["height"])
    max_dim = int(meta["maxDim"])
    max_zoom = int(meta["maxZoom"])


    if (
        z < 0
        or
        z > max_zoom
        or
        x < 0
        or
        y < 0
    ):

        return (
            "Invalid QA tile",
            404,
        )


    resolution = (
        max_dim
        /
        (
            _QA_TILE_SIZE
            *
            (2 ** z)
        )
    )


    source_x = (
        x
        *
        _QA_TILE_SIZE
        *
        resolution
    )

    source_y = (
        y
        *
        _QA_TILE_SIZE
        *
        resolution
    )

    source_w = (
        _QA_TILE_SIZE
        *
        resolution
    )

    source_h = (
        _QA_TILE_SIZE
        *
        resolution
    )


    # Tile completely outside the real raster.
    if (
        source_x >= width
        or
        source_y >= height
        or
        source_x + source_w <= 0
        or
        source_y + source_h <= 0
    ):

        return (
            "QA tile outside raster",
            404,
        )


    with rasterio.open(
        _QA_ORTHO_TIF
    ) as src:

        window = Window(
            col_off=source_x,
            row_off=source_y,
            width=source_w,
            height=source_h,
        )


        # Read only the requested GeoTIFF window.
        # The browser never loads the entire 49002 x 37416 image.
        data = src.read(
            indexes=[1, 2, 3],
            window=window,
            out_shape=(
                3,
                _QA_TILE_SIZE,
                _QA_TILE_SIZE,
            ),
            boundless=True,
            fill_value=0,
            resampling=Resampling.bilinear,
        )


        rgb = np.moveaxis(
            data,
            0,
            2,
        )


        if rgb.dtype != np.uint8:

            rgb = np.clip(
                rgb,
                0,
                255,
            ).astype(
                np.uint8
            )


        image = Image.fromarray(
            rgb,
            mode="RGB",
        )


        buffer = BytesIO()

        image.save(
            buffer,
            format="PNG",
            optimize=False,
        )

        buffer.seek(0)


        return send_file(
            buffer,
            mimetype="image/png",
        )




# QA inspection support removed - workflow retired.

# ============================================================
# MANUAL MASTER VALIDATION
# ============================================================

MANUAL_MASTER_STATE = (
    BASE
    / "real_data"
    / "qa"
    / "manual_master_panels.json"
)


def _manual_master_read():

    try:
        data = json.loads(
            MANUAL_MASTER_STATE.read_text(
                encoding="utf-8-sig"
            )
        )
    except Exception:
        data = {
            "version": 1,
            "panels": {}
        }

    if not isinstance(
        data.get("panels"),
        dict
    ):
        data["panels"] = {}

    return data


def _manual_master_write(data):

    MANUAL_MASTER_STATE.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    MANUAL_MASTER_STATE.write_text(
        json.dumps(
            data,
            indent=2
        ),
        encoding="utf-8"
    )


@app.get("/api/manual-master/state")
def manual_master_state():

    return jsonify(
        _manual_master_read()
    )


@app.post("/api/manual-master/activate")
def manual_master_activate():

    payload = request.get_json(
        silent=True
    ) or {}

    panel_id = str(
        payload.get("panel_id", "")
    ).strip()

    filename = str(
        payload.get("filename", "")
    ).strip()

    if not panel_id or not filename:
        return jsonify({
            "ok": False,
            "error":
                "panel_id and filename required"
        }), 400

    data = _manual_master_read()

    data["panels"][panel_id] = {
        "active": True,
        "reference_filename":
            filename,
        "updated_at":
            datetime.now().isoformat()
    }

    _manual_master_write(data)

    return jsonify({
        "ok": True,
        "panel_id": panel_id,
        "reference_filename":
            filename
    })


@app.post("/api/manual-master/delete")
def manual_master_delete():

    payload = request.get_json(
        silent=True
    ) or {}

    panel_id = str(
        payload.get("panel_id", "")
    ).strip()

    if not panel_id:
        return jsonify({
            "ok": False,
            "error": "panel_id required"
        }), 400

    data = _manual_master_read()

    data["panels"].pop(
        panel_id,
        None
    )

    _manual_master_write(data)

    return jsonify({
        "ok": True,
        "panel_id": panel_id
    })





# === MANUAL620_DIRECT_PDF_V1 ===

@app.route(
    "/api/export/manual620.pdf"
)
def export_manual620_pdf():

    import importlib.util
    import tempfile
    from flask import send_file

    generator_path = (
        BASE
        / "tools"
        / "generate_manual620_pdf.py"
    )

    spec = (
        importlib.util
        .spec_from_file_location(
            "manual620_pdf_generator",
            generator_path
        )
    )

    module = (
        importlib.util
        .module_from_spec(
            spec
        )
    )

    spec.loader.exec_module(
        module
    )

    output_dir = (
        BASE
        / "real_data"
        / "qa"
        / "exports"
    )

    output_dir.mkdir(
        parents=True,
        exist_ok=True
    )

    output = (
        output_dir
        / "PV_Thermal_Validated_620.pdf"
    )

    module.generate_manual620_pdf(
        output
    )

    return send_file(
        output,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=(
            "PV_Thermal_Validated_620.pdf"
        ),
        max_age=0,
    )




# === MANUAL620_CACHED_PDF_V2 ===

@app.route(
    "/api/export/manual620-ready.pdf"
)
def export_manual620_ready_pdf():

    from flask import (
        send_file,
        abort,
    )

    pdf_path = (
        BASE
        / "real_data"
        / "qa"
        / "exports"
        / "PV_Thermal_Validated_620.pdf"
    )

    if not pdf_path.exists():
        abort(
            404,
            description=(
                "PDF not generated yet."
            )
        )

    return send_file(
        pdf_path,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=(
            "PV_Thermal_Validated_620.pdf"
        ),
        max_age=0,
    )


if __name__ == "__main__":

    print()
    print("=" * 70)
    print("PV THERMAL AI")
    print("WEB CLIENT BACKEND V2")
    print("=" * 70)

    print()
    print(
        "Master panels:",
        len(
            all_panels
        )
    )

    print(
        "Verified findings:",
        len(
            findings
        )
    )

    print()
    print(
        "Open:"
    )

    print(
        "http://0.0.0.0:"
        + os.environ.get("PORT", "5070")
    )

    print()

    app.run(
        host=
            "0.0.0.0",

        port=
            int(os.environ.get("PORT", "5070")),

        debug=
            False,

        threaded=
            True,
    )










