/* === MANUAL620_TABLE_ORTHO_IMAGE_V1 === */
﻿let map = null;
let rasterLayer = null;
let panelLayer = null;
let findingsLayer = null;

let meta = null;
let stats = null;
let allPanelsGeoJSON = null;
let findingsGeoJSON = null;

let thermalScale = 1.35;
let thermalX = 0;
let thermalY = 0;

let thermalDragging = false;
let thermalStartX = 0;
let thermalStartY = 0;
let thermalStartOffsetX = 0;
let thermalStartOffsetY = 0;


const FINDING_COLOR = "#55c878";
const NORMAL_PANEL_COLOR = "rgba(255,255,255,0.90)";
const SELECTED_COLOR = "#00d9ff";


async function init() {

    console.log("PV Thermal AI V2 starting...");

    try {

        meta = await fetch(
            "/api/meta"
        ).then(
            response => {
                if (!response.ok) {
                    throw new Error(
                        "META HTTP "
                        + response.status
                    );
                }

                return response.json();
            }
        );


        stats = await fetch(
            "/api/stats"
        ).then(
            response => {
                if (!response.ok) {
                    throw new Error(
                        "STATS HTTP "
                        + response.status
                    );
                }

                return response.json();
            }
        );


        allPanelsGeoJSON = await fetch(
            "/api/all-panels"
        ).then(
            response => {
                if (!response.ok) {
                    throw new Error(
                        "ALL PANELS HTTP "
                        + response.status
                    );
                }

                return response.json();
            }
        );


        findingsGeoJSON = await fetch(
            "/api/findings"
        ).then(
            response => {
                if (!response.ok) {
                    throw new Error(
                        "FINDINGS HTTP "
                        + response.status
                    );
                }

                return response.json();
            }
        );


        console.log(
            "META",
            meta
        );

        console.log(
            "ALL PANELS",
            allPanelsGeoJSON.features.length
        );

        console.log(
            "FINDINGS",
            findingsGeoJSON.features.length
        );


        const findingCount =
            document.getElementById(
                "findingCount"
            );

        if (findingCount) {

            findingCount.textContent =
                `[${findingsGeoJSON.features.length}]`;

        }


        buildLegend();
        buildTable();
        buildCharts();
        setupNavigation();
        setupThermalViewer();
        createMap();


        console.log(
            "PV Thermal AI V2 ready"
        );

    }
    catch (error) {

        console.error(
            "PV Thermal AI ERROR:",
            error
        );

        const findingCount =
            document.getElementById(
                "findingCount"
            );

        if (findingCount) {

            findingCount.textContent =
                "[JS ERROR]";

        }

    }

}


function createMap() {

    const width =
        Number(
            meta.width
        );

    const height =
        Number(
            meta.height
        );

    const maxDim =
        Math.max(
            width,
            height
        );

    const tileSize =
        Number(
            meta.tileSize
        );

    const maxZoom =
        Number(
            meta.maxZoom
        );


    const extent = [
        0,
        0,
        width,
        height
    ];


    const projection =
        new ol.proj.Projection({

            code:
                "PV_IMAGE",

            units:
                "pixels",

            extent:
                extent

        });


    const resolutions = [];

    for (
        let z = 0;
        z <= maxZoom;
        z++
    ) {

        resolutions.push(
            maxDim
            /
            tileSize
            /
            Math.pow(
                2,
                z
            )
        );

    }


    const tileGrid =
        new ol.tilegrid.TileGrid({

            extent: [
                0,
                0,
                width,
                height
            ],

            origin: [
                0,
                height
            ],

            tileSize:
                tileSize,

            resolutions:
                resolutions

        });


    const tileSource =
        new ol.source.TileImage({

            projection:
                projection,

            tileGrid:
                tileGrid,

            wrapX:
                false,

            tileUrlFunction:
                function(tileCoord) {

                    if (!tileCoord) {
                        return undefined;
                    }

                    const z =
                        tileCoord[0];

                    const x =
                        tileCoord[1];

                    const y =
                        tileCoord[2];

                    return (
                        `/tiles/${z}/${x}/${y}.png`
                    );

                }

        });


    rasterLayer =
        new ol.layer.Tile({

            source:
                tileSource,

            extent:
                extent

        });


    const allPanelFeatures =
        new ol.format.GeoJSON()
        .readFeatures(
            allPanelsGeoJSON
        );


    const panelSource =
        new ol.source.Vector({

            features:
                allPanelFeatures

        });


    panelLayer =
        new ol.layer.Vector({

            source:
                panelSource,

            style:
                function(feature) {

                    const affected =
                        feature.get(
                            "affected"
                        );


                    if (affected) {

                        return new ol.style.Style({

                            stroke:
                                new ol.style.Stroke({

                                    color:
                                        FINDING_COLOR,

                                    width:
                                        2.0

                                }),

                            fill:
                                new ol.style.Fill({

                                    color:
                                        "rgba(85,200,120,0.04)"

                                })

                        });

                    }


                    return new ol.style.Style({

                        stroke:
                            new ol.style.Stroke({

                                color:
                                    NORMAL_PANEL_COLOR,

                                width:
                                    2.6

                            }),

                        fill:
                            new ol.style.Fill({

                                color:
                                    "rgba(255,255,255,0)"

                            })

                    });

                }

        });


    const findingFeatures =
        new ol.format.GeoJSON()
        .readFeatures(
            findingsGeoJSON
        );


    const findingSource =
        new ol.source.Vector({

            features:
                findingFeatures

        });


    findingsLayer =
        new ol.layer.Vector({

            source:
                findingSource,

            style:
                function() {

                    return new ol.style.Style({

                        stroke:
                            new ol.style.Stroke({

                                color:
                                    FINDING_COLOR,

                                width:
                                    2.8

                            }),

                        fill:
                            new ol.style.Fill({

                                color:
                                    "rgba(85,200,120,0.06)"

                            })

                    });

                }

        });


    map =
        new ol.Map({

            target:
                "map",

            layers: [
                rasterLayer,
                panelLayer,
                findingsLayer
            ],

            view:
                new ol.View({

                    projection:
                        projection,

                    center: [
                        width / 2,
                        height / 2
                    ],

                    resolutions:
                        resolutions,

                    resolution:
                        resolutions[0],

                    extent:
                        extent

                })

        });


    fitPark();


    map.on(
        "singleclick",
        function(event) {

            let selectedFeature =
                null;


            map.forEachFeatureAtPixel(

                event.pixel,

                function(feature, layer) {

                    if (
                        layer
                        !==
                        findingsLayer
                    ) {
                        return false;
                    }


                    selectedFeature =
                        feature;

                    return true;

                },

                {
                    hitTolerance:
                        8
                }

            );


            if (!selectedFeature) {
                return;
            }


            const panelId =
                selectedFeature.get(
                    "panel_id"
                );


            if (panelId) {

                window.openPanel(
                    panelId
                );

            }

        }
    );


    const toggle =
        document.getElementById(
            "findingsToggle"
        );


    if (toggle) {

        toggle.addEventListener(
            "change",
            function() {

                const visible =
                    this.checked;

                findingsLayer.setVisible(
                    visible
                );

            }
        );

    }

}


function fitPark() {

    if (!map) {
        return;
    }


    const extent = [
        0,
        0,
        Number(meta.width),
        Number(meta.height)
    ];


    map.getView().fit(

        extent,

        {
            size:
                map.getSize(),

            padding: [
                24,
                340,
                24,
                24
            ],

            duration:
                250

        }

    );

}


async function openPanel(
    panelId
) {

    try {

        const response =
            await fetch(
                `/api/panel/${panelId}`
            );


        if (!response.ok) {

            return;

        }


        const detail =
            await response.json();

        window.pvCurrentPanelDetail =
            detail;


        document
            .getElementById(
                "detailTitle"
            )
            .textContent =
                detail.panel_id;


        document
            .getElementById(
                "detailSubtitle"
            )
            .textContent =
                detail.anomaly_type;


        document
            .getElementById(
                "detailSeverity"
            )
            .textContent =
                detail.severity;


        document
            .getElementById(
                "detailObservations"
            )
            .textContent =
                detail.observations;


        document
            .getElementById(
                "detailLatitude"
            )
            .textContent =
                Number(
                    detail.latitude
                ).toFixed(7);


        document
            .getElementById(
                "detailLongitude"
            )
            .textContent =
                Number(
                    detail.longitude
                ).toFixed(7);


        document
            .getElementById(
                "detailFilename"
            )
            .textContent =
                detail.filename;


        document
            .getElementById(
                "detailDetection"
            )
            .textContent =
                detail.detection_id;


        resetThermalView();


        document
            .getElementById(
                "thermalPhoto"
            )
            .src =
                `/api/panel-view/${panelId}/thermal.jpg?t=${Date.now()}`;


        document
            .getElementById(
                "detailCard"
            )
            .classList
            .remove(
                "hidden"
            );

    }
    catch (error) {

        console.error(
            "Panel detail error:",
            error
        );

    }

}


function buildLegend() {

    const legend =
        document.getElementById(
            "anomalyLegend"
        );


    if (!legend) {
        return;
    }


    legend.innerHTML =
        "";


    Object.entries(
        stats.anomalies || {}
    )
    .forEach(
        function(entry) {

            const name =
                entry[0];

            const count =
                entry[1];


            const row =
                document.createElement(
                    "div"
                );

            row.className =
                "legend-row";


            const swatch =
                document.createElement(
                    "span"
                );

            swatch.className =
                "legend-swatch";

            swatch.style.background =
                FINDING_COLOR;


            const label =
                document.createElement(
                    "span"
                );

            label.className =
                "legend-label";

            label.textContent =
                name;


            const value =
                document.createElement(
                    "span"
                );

            value.className =
                "legend-count";

            value.textContent =
                count;


            row.appendChild(
                swatch
            );

            row.appendChild(
                label
            );

            row.appendChild(
                value
            );

            legend.appendChild(
                row
            );

        }
    );

}


function buildTable() {

    const tbody =
        document.querySelector(
            "#findingsTable tbody"
        );


    if (!tbody) {
        return;
    }


    tbody.innerHTML =
        "";


    findingsGeoJSON.features
        .forEach(
            function(feature) {

                const item =
                    feature.properties;


                const row =
                    document.createElement(
                        "tr"
                    );


                row.innerHTML =
                    `
                    <td>${item.panel_id || ""}</td>
                    <td>${item.anomaly_type || ""}</td>
                    <td>${item.severity || ""}</td>
                    <td>${item.verified_observations || 0}</td>
                    <td>${Number(item.latitude || 0).toFixed(7)}</td>
                    <td>${Number(item.longitude || 0).toFixed(7)}</td>

                    <td class="manual620-image-cell">
                        <img
                            src="/static/panel_thumbnails/${encodeURIComponent(item.panel_id)}.webp"
                            alt="${item.panel_id || "IR"}"
                            loading="lazy"
                            style="
                                width: 100px;
                                height: 70px;
                                object-fit: cover;
                                display: block;
                                border-radius: 5px;
                                background: #111;
                            "
                            onerror="this.style.display='none'"
                        >
                    </td>
                    `;


                row.onclick =
                    function() {

                        activateView(
                            "mapView",
                            "mapButton"
                        );

                        if (
                            typeof window.pvGoToPanel
                            ===
                            "function"
                        ) {

                            window.pvGoToPanel(
                                item.panel_id
                            );

                        }
                        else {

                            window.openPanel(
                                item.panel_id
                            );

                        }

                    };


                tbody.appendChild(
                    row
                );

            }
        );

}


function buildBarChart(
    elementId,
    values
) {

    const container =
        document.getElementById(
            elementId
        );


    if (!container) {
        return;
    }


    container.innerHTML =
        "";


    const entries =
        Object.entries(
            values || {}
        );


    if (
        entries.length
        ===
        0
    ) {
        return;
    }


    const maxValue =
        Math.max(
            1,
            ...entries.map(
                item =>
                    item[1]
            )
        );


    entries.forEach(
        function(entry) {

            const name =
                entry[0];

            const value =
                entry[1];

            const percentage =
                value
                /
                maxValue
                *
                100;


            const row =
                document.createElement(
                    "div"
                );


            row.className =
                "bar-row";


            row.innerHTML =
                `
                <div class="bar-label">
                    <span>${name}</span>
                    <strong>${value}</strong>
                </div>

                <div class="bar-track">
                    <div
                        class="bar-fill"
                        style="width:${percentage}%"
                    ></div>
                </div>
                `;


            container.appendChild(
                row
            );

        }
    );

}


function buildCharts() {

    const total =
        document.getElementById(
            "totalPanels"
        );

    const affected =
        document.getElementById(
            "affectedPanels"
        );

    const percentage =
        document.getElementById(
            "affectedPercentage"
        );


    if (total) {

        total.textContent =
            stats.totalPanels;

    }


    if (affected) {

        affected.textContent =
            stats.affectedPanels;

    }


    if (percentage) {

        percentage.textContent =
            `${stats.affectedPercentage}%`;

    }


    buildBarChart(
        "anomalyChart",
        stats.anomalies
    );


    buildBarChart(
        "severityChart",
        stats.severity
    );

}


function activateView(
    viewId,
    buttonId
) {

    document
        .querySelectorAll(
            ".view"
        )
        .forEach(
            function(view) {

                view.classList.remove(
                    "active-view"
                );

            }
        );


    document
        .querySelectorAll(
            ".nav-btn"
        )
        .forEach(
            function(button) {

                button.classList.remove(
                    "active"
                );

            }
        );


    const view =
        document.getElementById(
            viewId
        );


    if (view) {

        view.classList.add(
            "active-view"
        );

    }


    const button =
        document.getElementById(
            buttonId
        );


    if (button) {

        button.classList.add(
            "active"
        );

    }


    if (
        viewId
        ===
        "mapView"
        &&
        map
    ) {

        setTimeout(
            function() {

                map.updateSize();

            },
            50
        );

    }

}


function setupNavigation() {

    const mapButton =
        document.getElementById(
            "mapButton"
        );

    const tableButton =
        document.getElementById(
            "tableButton"
        );

    const chartButton =
        document.getElementById(
            "chartButton"
        );

    const fitButton =
        document.getElementById(
            "fitButton"
        );

    const closeDetail =
        document.getElementById(
            "closeDetail"
        );

    const exportButton =
        document.getElementById(
            "exportButton"
        );


    if (mapButton) {

        mapButton.onclick =
            function() {

                activateView(
                    "mapView",
                    "mapButton"
                );

            };

    }


    if (tableButton) {

        tableButton.onclick =
            function() {

                activateView(
                    "tableView",
                    "tableButton"
                );

            };

    }


    if (chartButton) {

        chartButton.onclick =
            function() {

                activateView(
                    "chartView",
                    "chartButton"
                );

            };

    }


    if (fitButton) {

        fitButton.onclick =
            function() {

                fitPark();

            };

    }


    if (closeDetail) {

        closeDetail.onclick =
            function() {

                document
                    .getElementById(
                        "detailCard"
                    )
                    .classList
                    .add(
                        "hidden"
                    );

            };

    }


    if (exportButton) {

        exportButton.onclick =
            function() {

                window.open(
                    "/api/findings",
                    "_blank"
                );

            };

    }

}


function updateThermalTransform() {

    const image =
        document.getElementById(
            "thermalPhoto"
        );


    if (!image) {
        return;
    }


    image.style.transform =
        `translate(${thermalX}px, ${thermalY}px) scale(${thermalScale})`;

}


function resetThermalView() {

    thermalScale =
        1.5;

    thermalX =
        0;

    thermalY =
        0;

    updateThermalTransform();

}


function setupThermalViewer() {

    const viewer =
        document.getElementById(
            "thermalViewer"
        );

    const zoomIn =
        document.getElementById(
            "thermalZoomIn"
        );

    const zoomOut =
        document.getElementById(
            "thermalZoomOut"
        );

    const reset =
        document.getElementById(
            "thermalReset"
        );


    if (!viewer) {
        return;
    }


    viewer.addEventListener(
        "wheel",
        function(event) {

            event.preventDefault();


            if (
                event.deltaY
                <
                0
            ) {

                thermalScale *=
                    1.15;

            }
            else {

                thermalScale /=
                    1.15;

            }


            thermalScale =
                Math.max(
                    1.0,
                    Math.min(
                        6.0,
                        thermalScale
                    )
                );


            updateThermalTransform();

        },
        {
            passive:
                false
        }
    );


    viewer.addEventListener(
        "mousedown",
        function(event) {

            thermalDragging =
                true;

            thermalStartX =
                event.clientX;

            thermalStartY =
                event.clientY;

            thermalStartOffsetX =
                thermalX;

            thermalStartOffsetY =
                thermalY;

            viewer.classList.add(
                "dragging"
            );

        }
    );


    window.addEventListener(
        "mousemove",
        function(event) {

            if (!thermalDragging) {
                return;
            }


            thermalX =
                thermalStartOffsetX
                +
                (
                    event.clientX
                    -
                    thermalStartX
                );


            thermalY =
                thermalStartOffsetY
                +
                (
                    event.clientY
                    -
                    thermalStartY
                );


            updateThermalTransform();

        }
    );


    window.addEventListener(
        "mouseup",
        function() {

            thermalDragging =
                false;

            viewer.classList.remove(
                "dragging"
            );

        }
    );


    if (zoomIn) {

        zoomIn.onclick =
            function() {

                thermalScale =
                    Math.min(
                        6.0,
                        thermalScale
                        *
                        1.2
                    );

                updateThermalTransform();

            };

    }


    if (zoomOut) {

        zoomOut.onclick =
            function() {

                thermalScale =
                    Math.max(
                        1.0,
                        thermalScale
                        /
                        1.2
                    );

                updateThermalTransform();

            };

    }


    if (reset) {

        reset.onclick =
            function() {

                resetThermalView();

            };

    }

}


init();





/* ==========================================================
   PV_WEB_V3_ENHANCEMENTS
   ========================================================== */

const PV_WEB_V3_ENHANCEMENTS = true;


const pvAnomalyColors = {

    "Cell":
        "#f1c40f",

    "Cell-Multi":
        "#ff9f1c",

    "Diode":
        "#3498db",

    "Diode-Multi":
        "#9b59b6",

    "Hot-Spot":
        "#ff3b30",

    "Hotspot":
        "#ff3b30",

    "Hot-Spot-Multi":
        "#ff6b6b",

    "Offline-Module":
        "#7f8c8d",

    "PID":
        "#b5179e",

    "Junction Box":
        "#ff922b",

    "Junction-Box":
        "#ff922b",

    "String":
        "#22c7c9",

    "String Issue":
        "#22c7c9",

    "Module":
        "#3a86ff"

};


let pvEnabledTypes =
    new Set();


let pvThermalScale =
    1.0;

let pvThermalX =
    0;

let pvThermalY =
    0;

let pvThermalDragging =
    false;

let pvThermalStartX =
    0;

let pvThermalStartY =
    0;

let pvThermalStartOffsetX =
    0;

let pvThermalStartOffsetY =
    0;


function pvHashColor(
    text
) {

    let hash = 0;

    for (
        let i = 0;
        i < text.length;
        i++
    ) {

        hash =
            text.charCodeAt(i)
            +
            (
                (hash << 5)
                -
                hash
            );

    }

    const hue =
        Math.abs(hash)
        %
        360;

    return (
        `hsl(${hue}, 78%, 52%)`
    );

}


function pvColorForType(
    anomaly
) {

    const value =
        String(
            anomaly
            ||
            "Unknown"
        );

    return (
        pvAnomalyColors[value]
        ||
        pvHashColor(value)
    );

}


function pvApplyFindingStyles() {

    if (
        !window.findingsLayer
        &&
        typeof findingsLayer
        === "undefined"
    ) {
        return;
    }

    const layer =
        typeof findingsLayer
        !==
        "undefined"
        ?
        findingsLayer
        :
        window.findingsLayer;


    if (!layer) {
        return;
    }


    layer.setStyle(
        function(
            feature
        ) {

            const anomaly =
                String(
                    feature.get(
                        "anomaly_type"
                    )
                    ||
                    "Unknown"
                );


            if (
                pvEnabledTypes.size > 0
                &&
                !pvEnabledTypes.has(
                    anomaly
                )
            ) {

                return null;

            }


            const color =
                pvColorForType(
                    anomaly
                );


            return new ol.style.Style({

                stroke:
                    new ol.style.Stroke({

                        color:
                            color,

                        width:
                            2.8

                    }),

                fill:
                    new ol.style.Fill({

                        color:
                            "rgba(0,0,0,0)"

                    })

            });

        }
    );

}


function pvApplyMasterPanelStyle() {

    if (
        typeof panelLayer
        === "undefined"
        ||
        !panelLayer
    ) {

        return;

    }


    panelLayer.setStyle(
        function(
            feature
        ) {

            const zoom =
                map
                ?
                (
                    map
                    .getView()
                    .getZoom()
                    ||
                    0
                )
                :
                0;


            let width =
                0.55;

            let alpha =
                0.38;


            if (zoom >= 2) {

                width =
                    0.85;

                alpha =
                    0.48;

            }


            if (zoom >= 4) {

                width =
                    1.25;

                alpha =
                    0.60;

            }


            if (zoom >= 6) {

                width =
                    1.7;

                alpha =
                    0.72;

            }


            return new ol.style.Style({

                stroke:
                    new ol.style.Stroke({

                        color:
                            `rgba(255,255,255,${alpha})`,

                        width:
                            width

                    }),

                fill:
                    new ol.style.Fill({

                        color:
                            "rgba(255,255,255,0)"

                    })

            });

        }
    );

}


function pvBuildInteractiveLegend() {

    const legend =
        document.getElementById(
            "anomalyLegend"
        );


    if (
        !legend
        ||
        !stats
    ) {

        return;

    }


    legend.innerHTML =
        "";


    pvEnabledTypes =
        new Set(
            Object.keys(
                stats.anomalies
                ||
                {}
            )
        );


    Object.entries(
        stats.anomalies
        ||
        {}
    )
    .sort(
        function(a, b) {

            return (
                b[1]
                -
                a[1]
            );

        }
    )
    .forEach(
        function(entry) {

            const anomaly =
                entry[0];

            const count =
                entry[1];


            const row =
                document.createElement(
                    "label"
                );


            row.className =
                "anomaly-toggle-row";


            const check =
                document.createElement(
                    "input"
                );

            check.type =
                "checkbox";

            check.checked =
                true;


            const dot =
                document.createElement(
                    "span"
                );

            dot.className =
                "anomaly-toggle-dot";

            dot.style.background =
                pvColorForType(
                    anomaly
                );


            const name =
                document.createElement(
                    "span"
                );

            name.className =
                "anomaly-toggle-name";

            name.textContent =
                anomaly;


            const value =
                document.createElement(
                    "span"
                );

            value.className =
                "anomaly-toggle-count";

            value.textContent =
                count;


            check.addEventListener(
                "change",
                function() {

                    if (
                        this.checked
                    ) {

                        pvEnabledTypes.add(
                            anomaly
                        );

                    }
                    else {

                        pvEnabledTypes.delete(
                            anomaly
                        );

                    }

                    pvApplyFindingStyles();

                }
            );


            row.appendChild(
                check
            );

            row.appendChild(
                dot
            );

            row.appendChild(
                name
            );

            row.appendChild(
                value
            );


            legend.appendChild(
                row
            );

        }
    );


    pvApplyFindingStyles();

}


function pvUpdateThermalTransform() {

    const image =
        document.getElementById(
            "thermalPhoto"
        );


    if (!image) {
        return;
    }


    image.style.transform =
        `translate(-50%, -50%) translate(${pvThermalX}px, ${pvThermalY}px) scale(${pvThermalScale})`;

}


function pvResetThermal() {

    pvThermalScale =
        1.0;

    pvThermalX =
        0;

    pvThermalY =
        0;

    pvUpdateThermalTransform();

}


function pvInitialIrZoom(
    detail
) {

    const viewer =
        document.getElementById(
            "thermalViewer"
        );

    const image =
        document.getElementById(
            "thermalPhoto"
        );


    if (
        !viewer
        ||
        !image
        ||
        !detail
        ||
        !detail.defect
    ) {

        return;

    }


    const iw =
        Number(
            detail.image_width
            ||
            image.naturalWidth
            ||
            1
        );

    const ih =
        Number(
            detail.image_height
            ||
            image.naturalHeight
            ||
            1
        );


    const vw =
        viewer.clientWidth;

    const vh =
        viewer.clientHeight;


    const defectX =
        Number(
            detail.defect.cx
        );

    const defectY =
        Number(
            detail.defect.cy
        );


    // Base image fits viewer width.
    const baseScale =
        vw
        /
        iw;


    // Start around 2.1x over fit-to-width.
    pvThermalScale =
        2.1;


    const displayedW =
        iw
        *
        baseScale
        *
        pvThermalScale;

    const displayedH =
        ih
        *
        baseScale
        *
        pvThermalScale;


    const normalizedX =
        defectX
        /
        iw;

    const normalizedY =
        defectY
        /
        ih;


    const defectDisplayX =
        normalizedX
        *
        displayedW;

    const defectDisplayY =
        normalizedY
        *
        displayedH;


    pvThermalX =
        (
            displayedW
            /
            2
        )
        -
        defectDisplayX;


    pvThermalY =
        (
            displayedH
            /
            2
        )
        -
        defectDisplayY;


    pvUpdateThermalTransform();

}


function pvSetupThermalViewer() {

    const viewer =
        document.getElementById(
            "thermalViewer"
        );

    const zoomIn =
        document.getElementById(
            "thermalZoomIn"
        );

    const zoomOut =
        document.getElementById(
            "thermalZoomOut"
        );

    const reset =
        document.getElementById(
            "thermalReset"
        );


    if (!viewer) {
        return;
    }


    viewer.onwheel =
        function(event) {

            event.preventDefault();


            const rect =
                viewer
                .getBoundingClientRect();


            const mouseX =
                event.clientX
                -
                (
                    rect.left
                    +
                    rect.width
                    /
                    2
                );


            const mouseY =
                event.clientY
                -
                (
                    rect.top
                    +
                    rect.height
                    /
                    2
                );


            const oldScale =
                pvThermalScale;


            if (
                event.deltaY
                <
                0
            ) {

                pvThermalScale *=
                    1.18;

            }
            else {

                pvThermalScale /=
                    1.18;

            }


            pvThermalScale =
                Math.max(
                    0.7,
                    Math.min(
                        8.0,
                        pvThermalScale
                    )
                );


            const ratio =
                pvThermalScale
                /
                oldScale;


            pvThermalX =
                mouseX
                -
                (
                    mouseX
                    -
                    pvThermalX
                )
                *
                ratio;


            pvThermalY =
                mouseY
                -
                (
                    mouseY
                    -
                    pvThermalY
                )
                *
                ratio;


            pvUpdateThermalTransform();

        };


    viewer.onmousedown =
        function(event) {

            pvThermalDragging =
                true;

            pvThermalStartX =
                event.clientX;

            pvThermalStartY =
                event.clientY;

            pvThermalStartOffsetX =
                pvThermalX;

            pvThermalStartOffsetY =
                pvThermalY;

            viewer.classList.add(
                "dragging"
            );

        };


    window.addEventListener(
        "mousemove",
        function(event) {

            if (
                !pvThermalDragging
            ) {

                return;

            }


            pvThermalX =
                pvThermalStartOffsetX
                +
                (
                    event.clientX
                    -
                    pvThermalStartX
                );


            pvThermalY =
                pvThermalStartOffsetY
                +
                (
                    event.clientY
                    -
                    pvThermalStartY
                );


            pvUpdateThermalTransform();

        }
    );


    window.addEventListener(
        "mouseup",
        function() {

            pvThermalDragging =
                false;

            viewer.classList.remove(
                "dragging"
            );

        }
    );


    viewer.ondblclick =
        function() {

            pvResetThermal();

        };


    if (zoomIn) {

        zoomIn.onclick =
            function() {

                pvThermalScale =
                    Math.min(
                        8.0,
                        pvThermalScale
                        *
                        1.22
                    );

                pvUpdateThermalTransform();

            };

    }


    if (zoomOut) {

        zoomOut.onclick =
            function() {

                pvThermalScale =
                    Math.max(
                        0.7,
                        pvThermalScale
                        /
                        1.22
                    );

                pvUpdateThermalTransform();

            };

    }


    if (reset) {

        reset.onclick =
            function() {

                pvResetThermal();

            };

    }

}


// ----------------------------------------------------------
// Replace panel detail opening with enhanced endpoint.
// ----------------------------------------------------------

window.openPanel =
async function(
    panelId
) {

    try {

        const response =
            await fetch(
                `/api/panel-view/${panelId}`
            );


        if (!response.ok) {

            throw new Error(
                "PANEL VIEW HTTP "
                +
                response.status
            );

        }


        const detail =
            await response.json();

        window.pvCurrentPanelDetail =
            detail;



        const setText =
            function(
                id,
                value
            ) {

                const element =
                    document.getElementById(
                        id
                    );

                if (element) {

                    element.textContent =
                        value;

                }

            };


        setText(
            "detailTitle",
            detail.panel_id
        );


        setText(
            "detailSubtitle",
            detail.anomaly_type
        );


        setText(
            "detailSeverity",
            detail.severity
        );


        setText(
            "detailObservations",
            detail.observations
        );


        setText(
            "detailLatitude",
            Number(
                detail.latitude
                ||
                0
            ).toFixed(7)
        );


        setText(
            "detailLongitude",
            Number(
                detail.longitude
                ||
                0
            ).toFixed(7)
        );


        setText(
            "detailFilename",
            detail.filename
        );


        setText(
            "detailDetection",
            detail.detection_id
        );


        const image =
            document.getElementById(
                "thermalPhoto"
            );


        pvResetThermal();


        if (image) {

            image.onload =
                function() {

                    requestAnimationFrame(
                        function() {

                            pvInitialIrZoom(
                                detail
                            );

                            requestAnimationFrame(
                                function() {
                                    /* JS panel overlay disabled - bbox is drawn directly in thermal.jpg */
                                }
                            );

                        }
                    );

                };


            image.src =
                `/api/panel-view/${panelId}/thermal.jpg?t=${Date.now()}`;

        }


        const card =
            document.getElementById(
                "detailCard"
            );


        if (card) {

            card.classList.remove(
                "hidden"
            );

        }

    }
    catch (error) {

        console.error(
            "Enhanced panel view error:",
            error
        );

    }

};


function pvStartEnhancements() {

    let tries =
        0;


    const timer =
        setInterval(
            function() {

                tries++;


                if (
                    typeof map
                    !==
                    "undefined"
                    &&
                    map
                    &&
                    typeof findingsLayer
                    !==
                    "undefined"
                    &&
                    findingsLayer
                ) {

                    clearInterval(
                        timer
                    );


                    pvBuildInteractiveLegend();

                    pvApplyMasterPanelStyle();

                    pvSetupThermalViewer();


                    map
                        .getView()
                        .on(
                            "change:resolution",
                            function() {

                                pvApplyMasterPanelStyle();

                            }
                        );

                }


                if (
                    tries
                    >
                    100
                ) {

                    clearInterval(
                        timer
                    );

                }

            },
            100
        );

}


pvStartEnhancements();



/* PV_PANEL_CENTER_V4 */

/*
Client IR behaviour:
- panel rectangle comes from backend panel_bbox
- viewer automatically zooms around PANEL, not only defect
- wheel zoom and drag remain available afterwards
*/

function pvInitialIrZoom(detail) {

    const viewer =
        document.getElementById(
            "thermalViewer"
        );

    const image =
        document.getElementById(
            "thermalPhoto"
        );

    if (
        !viewer
        ||
        !image
        ||
        !detail
    ) {
        return;
    }


    const iw =
        Number(
            detail.image_width
            ||
            image.naturalWidth
            ||
            1
        );

    const ih =
        Number(
            detail.image_height
            ||
            image.naturalHeight
            ||
            1
        );

    const vw =
        Math.max(
            1,
            viewer.clientWidth
        );

    const vh =
        Math.max(
            1,
            viewer.clientHeight
        );


    let targetX;
    let targetY;

    let targetW;
    let targetH;


    // ========================================================
    // PREFER PANEL BBOX
    // ========================================================

    if (
        detail.panel_bbox
        &&
        Number(detail.panel_bbox.x2)
            >
        Number(detail.panel_bbox.x1)
        &&
        Number(detail.panel_bbox.y2)
            >
        Number(detail.panel_bbox.y1)
    ) {

        const p =
            detail.panel_bbox;

        const x1 =
            Number(p.x1);

        const y1 =
            Number(p.y1);

        const x2 =
            Number(p.x2);

        const y2 =
            Number(p.y2);


        targetX =
            (
                x1
                +
                x2
            )
            /
            2;

        targetY =
            (
                y1
                +
                y2
            )
            /
            2;


        targetW =
            Math.max(
                1,
                x2
                -
                x1
            );

        targetH =
            Math.max(
                1,
                y2
                -
                y1
            );

    }

    // ========================================================
    // FALLBACK TO DEFECT
    // ========================================================

    else if (
        detail.defect
    ) {

        targetX =
            Number(
                detail.defect.cx
            );

        targetY =
            Number(
                detail.defect.cy
            );

        targetW =
            Math.max(
                40,
                Number(detail.defect.x2)
                -
                Number(detail.defect.x1)
            );

        targetH =
            Math.max(
                40,
                Number(detail.defect.y2)
                -
                Number(detail.defect.y1)
            );

    }

    else {

        pvResetThermal();
        return;

    }


    /*
    CSS displays image initially at viewer width.
    Therefore this is the base image scale.
    */

    const baseScale =
        vw
        /
        iw;


    /*
    Make selected PANEL approximately 62% of viewer.
    This gives enough surrounding context while making
    the selected panel unmistakable.
    */

    const scaleForWidth =
        (
            vw
            *
            0.62
        )
        /
        (
            targetW
            *
            baseScale
        );


    const scaleForHeight =
        (
            vh
            *
            0.68
        )
        /
        (
            targetH
            *
            baseScale
        );


    pvThermalScale =
        Math.min(
            scaleForWidth,
            scaleForHeight
        );


    pvThermalScale =
        Math.max(
            1.0,
            Math.min(
                7.0,
                pvThermalScale
            )
        );


    const displayedW =
        iw
        *
        baseScale
        *
        pvThermalScale;


    const displayedH =
        ih
        *
        baseScale
        *
        pvThermalScale;


    const targetDisplayX =
        (
            targetX
            /
            iw
        )
        *
        displayedW;


    const targetDisplayY =
        (
            targetY
            /
            ih
        )
        *
        displayedH;


    /*
    Offset so PANEL CENTER = VIEWER CENTER.
    */

    pvThermalX =
        (
            displayedW
            /
            2
        )
        -
        targetDisplayX;


    pvThermalY =
        (
            displayedH
            /
            2
        )
        -
        targetDisplayY;


    pvUpdateThermalTransform();

}





// ==========================================================
// ADMIN LOGIN
// ==========================================================







/* PV_IR_PANEL_BOX_FINAL */

window.pvCurrentPanelDetail = null;


function pvDrawCurrentIrPanelBox() {

    const detail =
        window.pvCurrentPanelDetail;

    const image =
        document.getElementById(
            "thermalPhoto"
        );

    if (
        !detail
        ||
        !detail.panel_bbox
        ||
        !image
        ||
        !image.naturalWidth
    ) {
        return;
    }


    const parent =
        image.parentElement;

    if (!parent) {
        return;
    }


    if (
        getComputedStyle(parent).position
        ===
        "static"
    ) {
        parent.style.position =
            "relative";
    }


    let box =
        document.getElementById(
            "pvIrPanelBox"
        );


    if (!box) {

        box =
            document.createElement(
                "div"
            );

        box.id =
            "pvIrPanelBox";

        box.style.position =
            "absolute";

        box.style.pointerEvents =
            "none";

        box.style.zIndex =
            "100";

        box.style.border =
            "3px solid #39ff88";

        box.style.boxSizing =
            "border-box";

        box.style.borderRadius =
            "2px";

        box.style.boxShadow =
            "0 0 0 1px rgba(0,0,0,0.65)";

        parent.appendChild(
            box
        );
    }


    /*
    IMPORTANT:
    getBoundingClientRect() includes the current
    CSS zoom / translation applied to thermalPhoto.
    Therefore the rectangle follows the image while
    the user zooms and pans.
    */

    const imageRect =
        image.getBoundingClientRect();

    const parentRect =
        parent.getBoundingClientRect();


    const iw =
        Number(
            detail.image_width
            ||
            image.naturalWidth
        );

    const ih =
        Number(
            detail.image_height
            ||
            image.naturalHeight
        );


    const bbox =
        detail.panel_bbox;


    const left =
        imageRect.left
        -
        parentRect.left
        +
        (
            Number(bbox.x1)
            /
            iw
            *
            imageRect.width
        );


    const top =
        imageRect.top
        -
        parentRect.top
        +
        (
            Number(bbox.y1)
            /
            ih
            *
            imageRect.height
        );


    const width =
        (
            Number(bbox.x2)
            -
            Number(bbox.x1)
        )
        /
        iw
        *
        imageRect.width;


    const height =
        (
            Number(bbox.y2)
            -
            Number(bbox.y1)
        )
        /
        ih
        *
        imageRect.height;


    box.style.left =
        `${left}px`;

    box.style.top =
        `${top}px`;

    box.style.width =
        `${width}px`;

    box.style.height =
        `${height}px`;

    box.style.display =
        "block";
}


/*
Keep rectangle attached while the existing
IR zoom/pan transform changes.
*/

(function pvHookThermalTransform() {

    if (
        typeof pvUpdateThermalTransform
        !==
        "function"
    ) {
        setTimeout(
            pvHookThermalTransform,
            200
        );

        return;
    }


    if (
        window
        .__pvPanelBoxTransformHook
    ) {
        return;
    }


    window
        .__pvPanelBoxTransformHook =
        true;


    const original =
        pvUpdateThermalTransform;


    pvUpdateThermalTransform =
        function() {

            const result =
                original.apply(
                    this,
                    arguments
                );


            requestAnimationFrame(
                function() {
                    /* JS panel overlay disabled - bbox is drawn directly in thermal.jpg */
                }
            );


            return result;
        };

})();


window.addEventListener(
    "resize",
    function() {

        requestAnimationFrame(
            pvDrawCurrentIrPanelBox
        );

    }
);






/* ============================================================
   PV IR FULL IMAGE - INITIAL ZOOM
   Full IR image stays available.
   Initial view uses moderate zoom.
   Zoom-out can return to the complete image.
   ============================================================ */

function pvInitialIrZoom(detail) {

    const viewer =
        document.getElementById("thermalViewer");

    const image =
        document.getElementById("thermalPhoto");

    if (!viewer || !image) {
        return;
    }

    // Moderate initial zoom
    pvThermalScale = 1.55;

    // Start centered
    pvThermalX = 0;
    pvThermalY = 0;

    /*
       If defect coordinates exist,
       gently center the view toward the defect.
       We deliberately do NOT tightly crop/zoom.
    */

    if (
        detail &&
        detail.defect &&
        image.naturalWidth &&
        image.naturalHeight
    ) {

        const iw =
            Number(detail.image_width) ||
            image.naturalWidth;

        const ih =
            Number(detail.image_height) ||
            image.naturalHeight;

        const vw =
            viewer.clientWidth;

        const cx =
            Number(detail.defect.cx);

        const cy =
            Number(detail.defect.cy);

        if (
            Number.isFinite(cx) &&
            Number.isFinite(cy) &&
            iw > 0 &&
            ih > 0 &&
            vw > 0
        ) {

            const baseScale =
                vw / iw;

            const displayedW =
                iw *
                baseScale *
                pvThermalScale;

            const displayedH =
                ih *
                baseScale *
                pvThermalScale;

            const px =
                (cx / iw) *
                displayedW;

            const py =
                (cy / ih) *
                displayedH;

            /*
               Partial centering only.
               0.55 keeps plenty of surrounding
               thermal context visible.
            */

            pvThermalX =
                (
                    displayedW / 2 -
                    px
                ) * 0.55;

            pvThermalY =
                (
                    displayedH / 2 -
                    py
                ) * 0.55;
        }
    }

    if (
        typeof pvUpdateThermalTransform ===
        "function"
    ) {
        pvUpdateThermalTransform();
    }
}


/*
   Helper used after thermal image has loaded.
*/

function pvLoadInitialIrView(detail) {

    const image =
        document.getElementById("thermalPhoto");

    if (!image) {
        return;
    }

    if (image.complete && image.naturalWidth > 0) {

        requestAnimationFrame(
            function () {
                pvInitialIrZoom(detail);
            }
        );

        return;
    }

    image.addEventListener(
        "load",
        function pvInitialIrLoadHandler() {

            image.removeEventListener(
                "load",
                pvInitialIrLoadHandler
            );

            requestAnimationFrame(
                function () {
                    pvInitialIrZoom(detail);
                }
            );
        }
    );
}

/* END PV IR FULL IMAGE - INITIAL ZOOM */





/* ============================================================
   PV_ACTIVE_LEARNING_IR_V1

   Full original IR image.
   Cyan  = panel bbox from Active Learning.
   Red   = defect bbox from Active Learning.

   No crop.
   ============================================================ */

(function () {

    let pvAlScale = 1.0;
    let pvAlX = 0;
    let pvAlY = 0;

    let pvAlDragging = false;
    let pvAlDragX = 0;
    let pvAlDragY = 0;


    function pvAlPanelIdFromArgs(args) {

        if (!args || !args.length) {
            return null;
        }

        const first = args[0];

        if (
            typeof first === "string"
            ||
            typeof first === "number"
        ) {
            return String(first);
        }

        if (
            first
            &&
            typeof first === "object"
        ) {

            return String(
                first.panel_id
                ||
                first.panelId
                ||
                first.id
                ||
                ""
            );
        }

        return null;
    }


    function pvAlApplyTransform() {

        const stage =
            document.getElementById(
                "pvActiveLearningStage"
            );

        if (!stage) {
            return;
        }

        stage.style.transform =
            `translate(${pvAlX}px, ${pvAlY}px) scale(${pvAlScale})`;
    }


    function pvAlResetView() {

        pvAlScale = 1.0;
        pvAlX = 0;
        pvAlY = 0;

        pvAlApplyTransform();
    }


    function pvAlBoxStyle(
        bbox,
        width,
        height,
        type
    ) {

        if (
            !bbox
            ||
            !width
            ||
            !height
        ) {
            return "";
        }

        const left =
            bbox.x1 / width * 100;

        const top =
            bbox.y1 / height * 100;

        const boxWidth =
            (
                bbox.x2
                -
                bbox.x1
            )
            /
            width
            *
            100;

        const boxHeight =
            (
                bbox.y2
                -
                bbox.y1
            )
            /
            height
            *
            100;

        const color =
            type === "panel"
            ? "#00e7ff"
            : "#ff3030";

        const borderWidth =
            type === "panel"
            ? 3
            : 2;

        return `
            position:absolute;
            left:${left}%;
            top:${top}%;
            width:${boxWidth}%;
            height:${boxHeight}%;
            border:${borderWidth}px solid ${color};
            box-sizing:border-box;
            pointer-events:none;
            z-index:${type === "panel" ? 5 : 6};
        `;
    }


    async function pvLoadActiveLearningEvidence(
        panelId
    ) {

        if (!panelId) {
            return;
        }

        const viewer =
            document.getElementById(
                "thermalViewer"
            );

        if (!viewer) {
            return;
        }

        try {

            const response =
                await fetch(
                    "/api/active-learning-evidence/"
                    +
                    encodeURIComponent(
                        panelId
                    )
                );

            if (!response.ok) {

                console.warn(
                    "Active Learning evidence HTTP",
                    response.status
                );

                return;
            }

            const data =
                await response.json();

            if (
                !data
                ||
                !data.ok
            ) {

                console.warn(
                    "Active Learning evidence:",
                    data
                );

                return;
            }


            viewer.innerHTML = "";

            viewer.style.position =
                "relative";

            viewer.style.overflow =
                "hidden";

            viewer.style.background =
                "#050505";

            viewer.style.cursor =
                "grab";


            const stage =
                document.createElement(
                    "div"
                );

            stage.id =
                "pvActiveLearningStage";

            stage.style.position =
                "relative";

            stage.style.display =
                "inline-block";

            stage.style.width =
                "100%";

            stage.style.height =
                "auto";

            stage.style.transformOrigin =
                "0 0";

            stage.style.willChange =
                "transform";


            const img =
                document.createElement(
                    "img"
                );

            // Keep original ID so existing UI code
            // still sees the thermal image.
            img.id =
                "thermalPhoto";

            img.src =
                data.image_url;

            img.alt =
                "Full thermal image";

            img.draggable =
                false;

            img.style.display =
                "block";

            img.style.width =
                "100%";

            img.style.height =
                "auto";

            img.style.maxWidth =
                "none";

            img.style.objectFit =
                "contain";


            stage.appendChild(
                img
            );


            // =================================================
            // PANEL BOX - ALWAYS DISPLAY IF AVAILABLE
            // =================================================

            if (
                data.panel_bbox
            ) {

                const panelBox =
                    document.createElement(
                        "div"
                    );

                panelBox.className =
                    "pv-active-panel-box";

                panelBox.setAttribute(
                    "style",
                    pvAlBoxStyle(
                        data.panel_bbox,
                        data.image_width,
                        data.image_height,
                        "panel"
                    )
                );

                stage.appendChild(
                    panelBox
                );
            }


            // =================================================
            // DEFECT BOX
            //
            // User said defect box is optional.
            // Keep it visible for now; can be disabled below.
            // =================================================

            const SHOW_DEFECT_BOX =
                true;

            if (
                SHOW_DEFECT_BOX
                &&
                data.defect_bbox
            ) {

                const defectBox =
                    document.createElement(
                        "div"
                    );

                defectBox.className =
                    "pv-active-defect-box";

                defectBox.setAttribute(
                    "style",
                    pvAlBoxStyle(
                        data.defect_bbox,
                        data.image_width,
                        data.image_height,
                        "defect"
                    )
                );

                stage.appendChild(
                    defectBox
                );
            }


            viewer.appendChild(
                stage
            );


            // =================================================
            // FIT FULL IMAGE
            // =================================================

            pvAlScale = 1.0;
            pvAlX = 0;
            pvAlY = 0;

            pvAlApplyTransform();


            // =================================================
            // WHEEL = ZOOM
            // =================================================

            viewer.onwheel = function (
                event
            ) {

                event.preventDefault();

                const rect =
                    viewer.getBoundingClientRect();

                const mx =
                    event.clientX
                    -
                    rect.left;

                const my =
                    event.clientY
                    -
                    rect.top;

                const oldScale =
                    pvAlScale;

                let newScale =
                    oldScale
                    *
                    (
                        event.deltaY < 0
                        ? 1.18
                        : 1 / 1.18
                    );

                newScale =
                    Math.max(
                        1.0,
                        Math.min(
                            8.0,
                            newScale
                        )
                    );


                if (
                    Math.abs(
                        newScale
                        -
                        oldScale
                    )
                    <
                    0.0001
                ) {

                    return;
                }


                const imageX =
                    (
                        mx
                        -
                        pvAlX
                    )
                    /
                    oldScale;

                const imageY =
                    (
                        my
                        -
                        pvAlY
                    )
                    /
                    oldScale;


                pvAlScale =
                    newScale;

                pvAlX =
                    mx
                    -
                    imageX
                    *
                    newScale;

                pvAlY =
                    my
                    -
                    imageY
                    *
                    newScale;


                if (
                    newScale === 1.0
                ) {

                    pvAlX = 0;
                    pvAlY = 0;
                }


                pvAlApplyTransform();
            };


            // =================================================
            // RIGHT MOUSE DRAG = PAN
            // =================================================

            viewer.onmousedown =
                function (
                    event
                ) {

                    if (
                        event.button
                        !==
                        2
                    ) {
                        return;
                    }

                    event.preventDefault();

                    pvAlDragging =
                        true;

                    pvAlDragX =
                        event.clientX;

                    pvAlDragY =
                        event.clientY;

                    viewer.style.cursor =
                        "grabbing";
                };


            viewer.onmousemove =
                function (
                    event
                ) {

                    if (
                        !pvAlDragging
                    ) {
                        return;
                    }

                    const dx =
                        event.clientX
                        -
                        pvAlDragX;

                    const dy =
                        event.clientY
                        -
                        pvAlDragY;

                    pvAlX += dx;
                    pvAlY += dy;

                    pvAlDragX =
                        event.clientX;

                    pvAlDragY =
                        event.clientY;

                    pvAlApplyTransform();
                };


            viewer.onmouseup =
            viewer.onmouseleave =
                function () {

                    pvAlDragging =
                        false;

                    viewer.style.cursor =
                        "grab";
                };


            viewer.oncontextmenu =
                function (
                    event
                ) {

                    event.preventDefault();
                };


            console.log(
                "ACTIVE LEARNING IR:",
                panelId,
                data.filename,
                data.panel_bbox,
                data.defect_bbox
            );

        }

        catch (error) {

            console.error(
                "Active Learning IR error:",
                error
            );
        }
    }


    // ========================================================
    // WRAP EXISTING openPanel()
    // ========================================================

    function pvInstallActiveLearningOpenPanel() {

        if (
            window.__pvAlOpenPanelInstalled
        ) {
            return;
        }

        if (
            typeof window.openPanel
            !==
            "function"
        ) {

            setTimeout(
                pvInstallActiveLearningOpenPanel,
                250
            );

            return;
        }


        const originalOpenPanel =
            window.openPanel;


        window.openPanel =
            async function () {

                const args =
                    Array.from(
                        arguments
                    );

                const result =
                    await originalOpenPanel.apply(
                        this,
                        args
                    );


                const panelId =
                    pvAlPanelIdFromArgs(
                        args
                    );


                if (panelId) {

                    // Let original detail panel finish rendering.
                    setTimeout(
                        function () {

                            pvLoadActiveLearningEvidence(
                                panelId
                            );

                        },
                        100
                    );
                }


                return result;
            };


        window.__pvAlOpenPanelInstalled =
            true;


        console.log(
            "PV Active Learning IR viewer installed"
        );
    }


    pvInstallActiveLearningOpenPanel();


    // Expose reset if needed.
    window.pvActiveLearningIrReset =
        pvAlResetView;

})();



/* ============================================================
   CONFIRMED45 CLEAN FINAL VIEWER
   Single implementation.
   Map remains legacy/proven.
   Evidence image comes already marked from backend.
   ============================================================ */

(function () {

    console.log(
        "CONFIRMED45 CLEAN FINAL VIEWER installed"
    );


    async function openConfirmed45Panel(
        panelId
    ) {

        try {

            const response =
                await fetch(
                    "/api/confirmed45-panel-inclusive/panel/"
                    +
                    encodeURIComponent(
                        panelId
                    )
                    +
                    "?t="
                    +
                    Date.now()
                );


            if (!response.ok) {

                throw new Error(
                    "CONFIRMED45 HTTP "
                    +
                    response.status
                );
            }


            const detail =
                await response.json();


            const photos =
                detail.photos
                ||
                detail.observations
                ||
                [];


            function pvPhotoScore(photo) {

                if (
                    !photo
                    ||
                    !photo.panel_bbox
                ) {
                    return [
                        9,
                        999,
                        999
                    ];
                }

                const panel =
                    photo.panel_bbox;

                const px =
                    Number(panel.x);

                const py =
                    Number(panel.y);

                const pw =
                    Number(panel.w);

                const ph =
                    Number(panel.h);


                if (
                    !Number.isFinite(px)
                    ||
                    !Number.isFinite(py)
                    ||
                    !Number.isFinite(pw)
                    ||
                    !Number.isFinite(ph)
                    ||
                    pw <= 0
                    ||
                    ph <= 0
                ) {
                    return [
                        8,
                        999,
                        999
                    ];
                }


                const panelImageCenterDistance =
                    Math.hypot(
                        px - 0.5,
                        py - 0.5
                    );


                const anomalies =
                    Array.isArray(
                        photo.anomalies
                    )
                    ?
                    photo.anomalies
                    :
                    [];


                let bestAnomalyDistance =
                    Infinity;


                anomalies.forEach(
                    function(anomaly) {

                        const ax =
                            Number(anomaly.x);

                        const ay =
                            Number(anomaly.y);


                        if (
                            !Number.isFinite(ax)
                            ||
                            !Number.isFinite(ay)
                        ) {
                            return;
                        }


                        const inside =
                            ax >= px - pw / 2
                            &&
                            ax <= px + pw / 2
                            &&
                            ay >= py - ph / 2
                            &&
                            ay <= py + ph / 2;


                        if (!inside) {
                            return;
                        }


                        // Distance of anomaly centre from
                        // panel centre, normalized by panel size.
                        const dx =
                            (ax - px)
                            /
                            (pw / 2);

                        const dy =
                            (ay - py)
                            /
                            (ph / 2);


                        const distance =
                            Math.hypot(
                                dx,
                                dy
                            );


                        if (
                            distance
                            <
                            bestAnomalyDistance
                        ) {
                            bestAnomalyDistance =
                                distance;
                        }
                    }
                );


                if (
                    Number.isFinite(
                        bestAnomalyDistance
                    )
                ) {
                    // Best class:
                    // valid anomaly inside this panel.
                    return [
                        0,
                        bestAnomalyDistance,
                        panelImageCenterDistance
                    ];
                }


                // Fallback:
                // no valid anomaly inside panel.
                return [
                    1,
                    panelImageCenterDistance,
                    0
                ];
            }


            const sortedPhotos =
                photos.slice().sort(
                    function(a, b) {

                        const sa =
                            pvPhotoScore(a);

                        const sb =
                            pvPhotoScore(b);


                        for (
                            let i = 0;
                            i < sa.length;
                            i++
                        ) {
                            if (sa[i] < sb[i]) {
                                return -1;
                            }

                            if (sa[i] > sb[i]) {
                                return 1;
                            }
                        }

                        return 0;
                    }
                );


            /* === MANUAL620_PHOTO_FALLBACK_V1 === */

            let photo =
                sortedPhotos.length
                ?
                sortedPhotos[0]
                :
                null;


            /*
             * Preserve the existing CONFIRMED45 photo whenever
             * one exists.
             *
             * Only manual-only panels receive this fallback.
             * /api/panel-view/<id>/thermal.jpg was audited:
             * 620 / 620 manual panels return HTTP 200.
             */
            if (!photo) {

                try {

                    const manualResponse =
                        await fetch(
                            "/api/panel-view/"
                            +
                            encodeURIComponent(panelId)
                            +
                            "?t="
                            +
                            Date.now()
                        );


                    if (manualResponse.ok) {

                        const manualDetail =
                            await manualResponse.json();


                        if (
                            manualDetail
                            &&
                            manualDetail.filename
                        ) {

                            photo = {

                                filename:
                                    manualDetail.filename,

                                image_url:
                                    (
                                        "/api/panel-view/"
                                        +
                                        encodeURIComponent(panelId)
                                        +
                                        "/thermal.jpg"
                                    ),

                                marked_image_url:
                                    null,

                                anomalies:
                                    [],

                                anomaly_count:
                                    1,

                                panel_bbox:
                                    {
                                        x: 0.5,
                                        y: 0.5,
                                        w: 0,
                                        h: 0
                                    },

                                manual_reference:
                                    true
                            };


                            console.log(
                                "MANUAL620 PHOTO FALLBACK:",
                                panelId,
                                manualDetail.filename
                            );
                        }
                    }

                }
                catch (manualError) {

                    console.warn(
                        "MANUAL620 fallback error:",
                        panelId,
                        manualError
                    );
                }
            }


            if (photo) {

                console.log(
                    "BEST CENTERED THERMAL PHOTO:",
                    panelId,
                    photo.filename,
                    pvPhotoScore(photo)
                );
            }


            window.pvCurrentPanelDetail =
                detail;


            function setText(
                id,
                value
            ) {

                const node =
                    document.getElementById(
                        id
                    );

                if (!node) {
                    return;
                }

                node.textContent =
                    (
                        value === null
                        ||
                        value === undefined
                    )
                    ?
                    ""
                    :
                    String(value);
            }


            setText(
                "detailTitle",
                detail.panel_id
                ||
                panelId
            );


            setText(
                "detailSubtitle",
                "Confirmed Active Learning 45?"
            );


            setText(
                "detailSeverity",
                "Confirmed"
            );


            setText(
                "detailObservations",
                detail.observation_count
                ??
                photos.length
            );


            setText(
                "detailLatitude",
                Number.isFinite(
                    Number(
                        detail.latitude
                    )
                )
                ?
                Number(
                    detail.latitude
                ).toFixed(7)
                :
                "?"
            );


            setText(
                "detailLongitude",
                Number.isFinite(
                    Number(
                        detail.longitude
                    )
                )
                ?
                Number(
                    detail.longitude
                ).toFixed(7)
                :
                "?"
            );


            setText(
                "detailFilename",
                photo
                ?
                (
                    photo.filename
                    ||
                    ""
                )
                :
                "No reliable inspection image"
            );


            setText(
                "detailDetection",
                photo
                ?
                (
                    (
                        photo.anomaly_count
                        ??
                        0
                    )
                    +
                    " anomaly bbox"
                )
                :
                "Inactive MASTER panel"
            );


            const viewer =
                document.getElementById(
                    "thermalViewer"
                );


            if (viewer) {

                viewer.innerHTML =
                    "";


                viewer.style.position =
                    "relative";

                viewer.style.overflow =
                    "hidden";

                viewer.style.background =
                    "#050505";


                if (photo) {

                    const img =
                        document.createElement(
                            "img"
                        );


                    img.id =
                        "thermalPhoto";


                    img.src =
                        (
                            photo.marked_image_url
                            ||
                            photo.image_url
                        )
                        +
                        "?t="
                        +
                        Date.now();


                    img.alt =
                        photo.filename
                        ||
                        "Thermal evidence";


                    img.draggable =
                        false;


                    img.style.display =
                        "block";

                    img.style.width =
                        "100%";

                    img.style.height =
                        "auto";

                    img.style.maxWidth =
                        "none";

                    img.style.objectFit =
                        "contain";

                    img.style.position =
                        "relative";

                    img.style.left =
                        "0";

                    img.style.top =
                        "0";

                    img.style.transform =
                        "none";


                    viewer.appendChild(
                        img
                    );

                } else {

                    const empty =
                        document.createElement(
                            "div"
                        );

                    empty.textContent =
                        "No reliable inspection image";

                    empty.style.padding =
                        "32px 16px";

                    empty.style.textAlign =
                        "center";

                    empty.style.opacity =
                        "0.75";

                    viewer.appendChild(
                        empty
                    );
                }
            }


            const card =
                document.getElementById(
                    "detailCard"
                );


            if (card) {

                card.classList.remove(
                    "hidden"
                );
            }

        }
        catch (error) {

            console.error(
                "CONFIRMED45 CLEAN VIEWER ERROR:",
                panelId,
                error
            );
        }
    }


    window.openPanel =
        openConfirmed45Panel;

})();



// ============================================================
// PV PANEL DETAIL - HIDE UNUSED FIELDS
// ============================================================
(function () {

    function hideUnusedPanelFields() {

        const subtitle =
            document.getElementById("detailSubtitle");

        if (subtitle) {
            subtitle.style.display = "none";
        }


        const observations =
            document.getElementById("detailObservations");

        if (observations && observations.parentElement) {
            observations.parentElement.style.display = "none";
        }
    }

    if (document.readyState === "loading") {

        document.addEventListener(
            "DOMContentLoaded",
            hideUnusedPanelFields,
            { once: true }
        );

    } else {

        hideUnusedPanelFields();
    }

})();

// ============================================================
// PV PANEL DETAIL - CLOSE ONLY
// ============================================================
(function () {

    function installPanelClose() {

        const button =
            document.getElementById("panelDetailClose");

        const card =
            document.getElementById("detailCard");

        if (!button || !card) {
            return;
        }

        button.addEventListener(
            "click",
            function () {
                card.classList.add("hidden");
            }
        );
    }

    if (document.readyState === "loading") {

        document.addEventListener(
            "DOMContentLoaded",
            installPanelClose,
            { once: true }
        );

    } else {

        installPanelClose();
    }

})();



/* === PV_PANEL_SEARCH_NAV_V1 === */

(function () {

    function normalizePanelId(value) {

        let text = String(value || "")
            .trim()
            .toUpperCase();

        if (!text) {
            return "";
        }

        /*
        Accept:
            PANEL_00014
            panel_00014
            00014
            14
        */

        if (/^\d+$/.test(text)) {

            text =
                "PANEL_"
                +
                text.padStart(
                    5,
                    "0"
                );

        }

        return text;
    }


    function findPanelFeature(panelId) {

        const wanted =
            normalizePanelId(panelId);

        if (
            !wanted
            ||
            !window.allPanelsGeoJSON
            ||
            !Array.isArray(
                window.allPanelsGeoJSON.features
            )
        ) {

            /*
            allPanelsGeoJSON is normally global `let`,
            so also try direct variable access below.
            */

        }


        let collection = null;

        try {

            collection =
                allPanelsGeoJSON;

        }
        catch (e) {

            collection =
                window.allPanelsGeoJSON;

        }


        if (
            !collection
            ||
            !Array.isArray(
                collection.features
            )
        ) {
            return null;
        }


        return collection.features.find(
            function(feature) {

                const id =
                    normalizePanelId(
                        feature
                        &&
                        feature.properties
                        &&
                        feature.properties.panel_id
                    );

                return id === wanted;

            }
        ) || null;
    }


    function findOpenLayersFeature(panelId) {

        const wanted =
            normalizePanelId(panelId);

        let source = null;

        try {

            if (
                typeof allPanelsLayer !== "undefined"
                &&
                allPanelsLayer
                &&
                allPanelsLayer.getSource
            ) {

                source =
                    allPanelsLayer.getSource();

            }

        }
        catch (e) {}


        if (!source) {

            try {

                if (
                    typeof panelLayer !== "undefined"
                    &&
                    panelLayer
                    &&
                    panelLayer.getSource
                ) {

                    source =
                        panelLayer.getSource();

                }

            }
            catch (e) {}

        }


        if (!source) {

            /*
            Last safe fallback:
            inspect vector layers already attached to map.
            */

            try {

                const layers =
                    map.getLayers().getArray();

                for (const layer of layers) {

                    if (
                        !layer
                        ||
                        !layer.getSource
                    ) {
                        continue;
                    }

                    const candidate =
                        layer.getSource();

                    if (
                        candidate
                        &&
                        candidate.getFeatures
                    ) {

                        const found =
                            candidate
                            .getFeatures()
                            .find(
                                function(feature) {

                                    return (
                                        normalizePanelId(
                                            feature.get(
                                                "panel_id"
                                            )
                                        )
                                        ===
                                        wanted
                                    );

                                }
                            );

                        if (found) {
                            return found;
                        }

                    }

                }

            }
            catch (e) {}

            return null;
        }


        return source
            .getFeatures()
            .find(
                function(feature) {

                    return (
                        normalizePanelId(
                            feature.get(
                                "panel_id"
                            )
                        )
                        ===
                        wanted
                    );

                }
            )
            ||
            null;
    }


    window.pvGoToPanel =
    async function(panelId) {

        const wanted =
            normalizePanelId(panelId);

        if (!wanted) {
            return false;
        }


        const geoFeature =
            findPanelFeature(
                wanted
            );

        const olFeature =
            findOpenLayersFeature(
                wanted
            );


        if (
            !geoFeature
            &&
            !olFeature
        ) {

            alert(
                "Panelul "
                +
                wanted
                +
                " nu a fost gasit."
            );

            return false;
        }


        /*
        Switch to map.
        */

        try {

            activateView(
                "mapView",
                "mapButton"
            );

        }
        catch (e) {}


        /*
        Zoom exactly around MASTER polygon.
        */

        if (
            olFeature
            &&
            olFeature.getGeometry
        ) {

            const geometry =
                olFeature.getGeometry();

            if (geometry) {

                const extent =
                    geometry.getExtent();

                map.getView().fit(
                    extent,
                    {
                        size:
                            map.getSize(),

                        padding: [
                            150,
                            430,
                            150,
                            150
                        ],

                        maxZoom:
                            12,

                        duration:
                            550
                    }
                );

            }

        }


        /*
        Open the existing detail card.
        This keeps the existing thermal image logic.
        */

        if (
            typeof window.openPanel
            ===
            "function"
        ) {

            await window.openPanel(
                wanted
            );

        }


        return true;
    };


    function installPanelSearch() {

        const input =
            document.getElementById(
                "pvPanelSearchInput"
            );

        const button =
            document.getElementById(
                "pvPanelSearchButton"
            );


        if (!input || !button) {
            return;
        }


        button.onclick =
            function() {

                window.pvGoToPanel(
                    input.value
                );

            };


        input.addEventListener(
            "keydown",
            function(event) {

                if (
                    event.key
                    ===
                    "Enter"
                ) {

                    event.preventDefault();

                    window.pvGoToPanel(
                        input.value
                    );

                }

            }
        );

    }


    if (
        document.readyState
        ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            installPanelSearch
        );

    }
    else {

        installPanelSearch();

    }

})();





/* === MANUAL620_TABLE_IMAGE_V2 === */

(function () {

    function addManual620ImageHeader() {

        const imageCell =
            document.querySelector(
                ".manual620-image-cell"
            );

        if (!imageCell) {
            return;
        }

        const table =
            imageCell.closest("table");

        if (!table) {
            return;
        }

        const headerRow =
            table.querySelector(
                "thead tr"
            );

        if (!headerRow) {
            return;
        }

        const headers =
            Array.from(
                headerRow.querySelectorAll("th")
            );

        const alreadyExists =
            headers.some(
                function (th) {
                    return (
                        th.textContent
                        ||
                        ""
                    ).trim().toLowerCase()
                    ===
                    "image";
                }
            );

        if (!alreadyExists) {

            const th =
                document.createElement("th");

            th.textContent =
                "Image";

            headerRow.appendChild(th);
        }
    }


    const observer =
        new MutationObserver(
            addManual620ImageHeader
        );


    function start() {

        observer.observe(
            document.body,
            {
                childList: true,
                subtree: true
            }
        );

        addManual620ImageHeader();
    }


    if (
        document.readyState
        ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            start,
            { once: true }
        );

    } else {

        start();
    }

})();




/* === MANUAL620_MASTER_COORDINATES_V1 === */

(function () {

    let pvManual620Coordinates = null;


    async function pvLoadManual620Coordinates() {

        if (pvManual620Coordinates) {
            return pvManual620Coordinates;
        }

        try {

            const response =
                await fetch(
                    "/static/manual620_coordinates.json?t="
                    +
                    Date.now()
                );

            if (!response.ok) {
                throw new Error(
                    "Coordinates HTTP "
                    +
                    response.status
                );
            }

            pvManual620Coordinates =
                await response.json();

            console.log(
                "MANUAL620 MASTER coordinates loaded:",
                Object.keys(
                    pvManual620Coordinates
                ).length
            );

            return pvManual620Coordinates;

        }
        catch (error) {

            console.error(
                "MANUAL620 coordinates error:",
                error
            );

            return {};
        }
    }


    function pvCoordinateFor(
        coordinates,
        panelId
    ) {

        if (!panelId) {
            return null;
        }

        return (
            coordinates[String(panelId)]
            ||
            null
        );
    }


    async function pvFixTableCoordinates() {

        const coordinates =
            await pvLoadManual620Coordinates();

        const rows =
            document.querySelectorAll(
                "table tbody tr"
            );

        rows.forEach(
            function (row) {

                const cells =
                    row.querySelectorAll("td");

                /*
                 * Current table:
                 * 0 Panel ID
                 * 1 Anomaly
                 * 2 Severity
                 * 3 Observations
                 * 4 Latitude
                 * 5 Longitude
                 * 6 Image (when installed)
                 */
                if (cells.length < 6) {
                    return;
                }

                const panelId =
                    (
                        cells[0].textContent
                        ||
                        ""
                    ).trim();

                const coord =
                    pvCoordinateFor(
                        coordinates,
                        panelId
                    );

                if (!coord) {
                    return;
                }

                const lat =
                    Number(
                        coord.latitude
                    );

                const lon =
                    Number(
                        coord.longitude
                    );

                if (
                    Number.isFinite(lat)
                    &&
                    Number.isFinite(lon)
                ) {

                    cells[4].textContent =
                        lat.toFixed(7);

                    cells[5].textContent =
                        lon.toFixed(7);
                }
            }
        );
    }


    /*
     * Table rows are generated dynamically.
     * Observe changes and replace the old 0.0000000 values.
     */
    let pvCoordinateTimer = null;

    const observer =
        new MutationObserver(
            function () {

                clearTimeout(
                    pvCoordinateTimer
                );

                pvCoordinateTimer =
                    setTimeout(
                        pvFixTableCoordinates,
                        50
                    );
            }
        );


    function pvStartCoordinatePatch() {

        observer.observe(
            document.body,
            {
                childList: true,
                subtree: true
            }
        );

        pvFixTableCoordinates();
    }


    /*
     * Also fix coordinates in right-side panel detail.
     * Preserve current working openPanel implementation.
     */
    const originalOpenPanel =
        window.openPanel;


    if (
        typeof originalOpenPanel
        ===
        "function"
    ) {

        window.openPanel =
            async function (panelId) {

                const result =
                    await originalOpenPanel(
                        panelId
                    );

                const coordinates =
                    await pvLoadManual620Coordinates();

                const coord =
                    pvCoordinateFor(
                        coordinates,
                        panelId
                    );

                if (coord) {

                    const latNode =
                        document.getElementById(
                            "detailLatitude"
                        );

                    const lonNode =
                        document.getElementById(
                            "detailLongitude"
                        );

                    const lat =
                        Number(
                            coord.latitude
                        );

                    const lon =
                        Number(
                            coord.longitude
                        );

                    if (
                        latNode
                        &&
                        Number.isFinite(lat)
                    ) {

                        latNode.textContent =
                            lat.toFixed(7);
                    }

                    if (
                        lonNode
                        &&
                        Number.isFinite(lon)
                    ) {

                        lonNode.textContent =
                            lon.toFixed(7);
                    }
                }

                return result;
            };
    }


    if (
        document.readyState
        ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            pvStartCoordinatePatch,
            { once: true }
        );

    }
    else {

        pvStartCoordinatePatch();
    }


    window.pvFixTableCoordinates =
        pvFixTableCoordinates;

})();




/* === MANUAL620_TABLE_DEFECTS_PDF_V1 === */

(function () {

    const DEFECTS_URL =
        "/static/manual620_visual_defects.json";

    const COORDS_URL =
        "/static/manual620_coordinates.json";

    let defectPromise = null;
    let coordPromise = null;


    function loadDefects() {

        if (!defectPromise) {

            defectPromise =
                fetch(
                    DEFECTS_URL
                    +
                    "?t="
                    +
                    Date.now()
                )
                .then(function (r) {

                    if (!r.ok) {
                        throw new Error(
                            "Visual defects HTTP "
                            +
                            r.status
                        );
                    }

                    return r.json();
                })
                .then(function (data) {

                    return (
                        data.panels
                        ||
                        {}
                    );
                })
                .catch(function (err) {

                    console.error(
                        "[MANUAL620] visual defects:",
                        err
                    );

                    return {};
                });
        }

        return defectPromise;
    }


    function loadCoordinates() {

        if (!coordPromise) {

            coordPromise =
                fetch(
                    COORDS_URL
                    +
                    "?t="
                    +
                    Date.now()
                )
                .then(function (r) {

                    if (!r.ok) {
                        throw new Error(
                            "Coordinates HTTP "
                            +
                            r.status
                        );
                    }

                    return r.json();
                })
                .catch(function (err) {

                    console.error(
                        "[MANUAL620] coordinates:",
                        err
                    );

                    return {};
                });
        }

        return coordPromise;
    }


    function panelIdFromRow(row) {

        if (
            !row
            ||
            !row.cells
            ||
            !row.cells.length
        ) {
            return null;
        }

        const value =
            String(
                row.cells[0].textContent
                ||
                ""
            )
            .trim();

        if (
            !value
            ||
            !/^PANEL_/i.test(value)
        ) {
            return null;
        }

        return value;
    }


    function findFindingsTable() {

        const rows =
            document.querySelectorAll(
                "tbody tr"
            );

        for (const row of rows) {

            if (
                panelIdFromRow(row)
                &&
                row.querySelector(
                    ".manual620-image-cell"
                )
            ) {

                return row.closest(
                    "table"
                );
            }
        }

        return null;
    }


    function makeCell(
        className,
        text
    ) {

        const td =
            document.createElement(
                "td"
            );

        td.className =
            className;

        td.textContent =
            text
            ||
            "";

        td.style.verticalAlign =
            "middle";

        return td;
    }


    function severityStyle(
        td,
        severity
    ) {

        td.style.fontWeight =
            "700";

        if (
            severity
            ===
            "Critical"
        ) {

            td.style.background =
                "rgba(220, 38, 38, 0.16)";

        }
        else if (
            severity
            ===
            "High"
        ) {

            td.style.background =
                "rgba(234, 88, 12, 0.14)";

        }
        else if (
            severity
            ===
            "Medium"
        ) {

            td.style.background =
                "rgba(202, 138, 4, 0.12)";

        }
    }


    async function enhanceTable() {

        /*
         * Disabled after FINAL TABLE installation.
         * The final table owns the DOM layout.
         */
        if (
            window.__manual620FinalTableActive
        ) {
            return;
        }

        const table =
            findFindingsTable();

        if (!table) {
            return;
        }


        const defects =
            await loadDefects();


        const tbody =
            table.querySelector(
                "tbody"
            );

        if (!tbody) {
            return;
        }


        /*
         * Existing physical column order:
         *
         * 0 Panel ID
         * 1 Anomaly
         * 2 old Severity
         * 3 old Observations
         * 4 Latitude
         * 5 Longitude
         * 6 Image
         *
         * IMPORTANT:
         * keep 4/5 unchanged because the existing
         * coordinate patch relies on them.
         */


        const rows =
            tbody.querySelectorAll(
                "tr"
            );


        rows.forEach(function (row) {

            const panelId =
                panelIdFromRow(
                    row
                );

            if (!panelId) {
                return;
            }


            /*
             * Hide old Severity + Observations,
             * but do not remove them.
             */
            if (row.cells[2]) {
                row.cells[2].style.display =
                    "none";
            }

            if (row.cells[3]) {
                row.cells[3].style.display =
                    "none";
            }


            const rec =
                defects[
                    panelId
                ]
                ||
                {};


            let imageCell =
                row.querySelector(
                    ".manual620-image-cell"
                );


            if (!imageCell) {
                return;
            }


            if (
                !row.querySelector(
                    ".manual620-visual-defect"
                )
            ) {

                const defectCell =
                    makeCell(
                        "manual620-visual-defect",
                        rec.visual_defect_estimate
                        ||
                        "Uncertain"
                    );


                const severityCell =
                    makeCell(
                        "manual620-visual-severity",
                        rec.severity_estimate
                        ||
                        ""
                    );

                severityStyle(
                    severityCell,
                    rec.severity_estimate
                );


                const confidenceCell =
                    makeCell(
                        "manual620-visual-confidence",
                        rec.confidence
                        ||
                        ""
                    );


                row.insertBefore(
                    defectCell,
                    imageCell
                );

                row.insertBefore(
                    severityCell,
                    imageCell
                );

                row.insertBefore(
                    confidenceCell,
                    imageCell
                );
            }


            /*
             * Keep orthophoto image as the last/right column.
             */
            const img =
                imageCell.querySelector(
                    "img"
                );

            if (img) {

                img.src =
                    "/static/panel_thumbnails/"
                    +
                    encodeURIComponent(
                        panelId
                    )
                    +
                    ".webp";

                img.alt =
                    panelId
                    +
                    " orthophoto crop";

                img.style.width =
                    "110px";

                img.style.height =
                    "82px";

                img.style.objectFit =
                    "cover";
            }
        });


        /*
         * Header.
         */
        const headerRow =
            table.querySelector(
                "thead tr"
            );

        if (
            headerRow
            &&
            headerRow.cells.length >= 6
        ) {

            if (headerRow.cells[2]) {
                headerRow.cells[2].style.display =
                    "none";
            }

            if (headerRow.cells[3]) {
                headerRow.cells[3].style.display =
                    "none";
            }


            if (
                !headerRow.querySelector(
                    ".manual620-head-defect"
                )
            ) {

                let imageHead =
                    null;


                for (
                    let i = 0;
                    i < headerRow.cells.length;
                    i++
                ) {

                    const txt =
                        String(
                            headerRow.cells[i].textContent
                            ||
                            ""
                        )
                        .trim()
                        .toLowerCase();

                    if (
                        txt === "image"
                        ||
                        txt === "imagine"
                    ) {
                        imageHead =
                            headerRow.cells[i];
                        break;
                    }
                }


                if (!imageHead) {

                    imageHead =
                        headerRow.cells[
                            headerRow.cells.length - 1
                        ];
                }


                const h1 =
                    document.createElement(
                        "th"
                    );

                h1.className =
                    "manual620-head-defect";

                h1.textContent =
                    "Visual defect";


                const h2 =
                    document.createElement(
                        "th"
                    );

                h2.className =
                    "manual620-head-severity";

                h2.textContent =
                    "Severity";


                const h3 =
                    document.createElement(
                        "th"
                    );

                h3.className =
                    "manual620-head-confidence";

                h3.textContent =
                    "Confidence";


                headerRow.insertBefore(
                    h1,
                    imageHead
                );

                headerRow.insertBefore(
                    h2,
                    imageHead
                );

                headerRow.insertBefore(
                    h3,
                    imageHead
                );
            }
        }


        installPdfButton(
            table
        );
    }


    function escapeHtml(value) {

        return String(
            value
            ??
            ""
        )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
    }


    async function exportPdf() {

        /*
         * Open immediately from the click event so
         * the browser does not block the popup.
         */
        const win =
            window.open(
                "",
                "_blank"
            );


        if (!win) {

            alert(
                "Browser-ul a blocat fereastra PDF. Permite pop-up pentru aceasta pagina."
            );

            return;
        }


        win.document.write(
            "<html><body style='font-family:Arial;padding:30px'>"
            +
            "<h2>Preparing PV inspection report...</h2>"
            +
            "<p>Loading 620 panels and images.</p>"
            +
            "</body></html>"
        );


        try {

            /*
             * PDF V2:
             * use the authoritative 620-panel visual registry directly.
             * Do NOT depend on /api/findings response shape.
             */
            const responses =
                await Promise.all([
                    loadDefects(),
                    loadCoordinates()
                ]);


            const defects =
                responses[0]
                ||
                {};

            const coordinates =
                responses[1]
                ||
                {};


            const panelIds =
                Object.keys(
                    defects
                );


            if (
                panelIds.length
                !==
                620
            ) {

                throw new Error(
                    "Expected 620 classified panels, received "
                    +
                    panelIds.length
                );
            }


            const rows =
                [];


            panelIds.forEach(
                function (panelId) {

                    const defect =
                        defects[
                            panelId
                        ]
                        ||
                        {};


                    const coord =
                        coordinates[
                            panelId
                        ]
                        ||
                        {};


                    const latitude =
                        Number(
                            coord.latitude
                            ??
                            0
                        );


                    const longitude =
                        Number(
                            coord.longitude
                            ??
                            0
                        );


                    rows.push(
                        {
                            panelId:
                                panelId,

                            /*
                             * These are the 620 manually validated
                             * defective MASTER panels.
                             *
                             * The visual classification remains
                             * separate below.
                             */
                            anomaly:
                                defect.anomaly_type
                                ||
                                defect.visual_defect_estimate
                                ||
                                "Hot-Spot",

                            severity:
                                defect.severity_estimate
                                ||
                                "",

                            confidence:
                                defect.confidence
                                ||
                                "",

                            latitude:
                                latitude,

                            longitude:
                                longitude
                        }
                    );
                }
            );


            rows.sort(
                function (a, b) {

                    return a.panelId.localeCompare(
                        b.panelId,
                        undefined,
                        {
                            numeric:
                                true
                        }
                    );
                }
            );


            let bodyRows =
                "";


            rows.forEach(function (r) {

                const imageUrl =
                    location.origin
                    +
                    "/static/panel_thumbnails/"
                    +
                    encodeURIComponent(
                        r.panelId
                    )
                    +
                    ".webp";


                bodyRows +=
                    "<tr>"
                    +
                    "<td>"
                    +
                    escapeHtml(
                        r.panelId
                    )
                    +
                    "</td>"
                    +
                    "<td>"
                    +
                    escapeHtml(
                        r.anomaly
                    )
                    +
                    "</td>"
                    +
                    "<td class='sev "
                    +
                    escapeHtml(
                        r.severity.toLowerCase()
                    )
                    +
                    "'>"
                    +
                    escapeHtml(
                        r.severity
                    )
                    +
                    "</td>"
                    +
                    "<td>"
                    +
                    (
                        Number.isFinite(
                            r.latitude
                        )
                        ?
                        r.latitude.toFixed(7)
                        :
                        ""
                    )
                    +
                    "</td>"
                    +
                    "<td>"
                    +
                    (
                        Number.isFinite(
                            r.longitude
                        )
                        ?
                        r.longitude.toFixed(7)
                        :
                        ""
                    )
                    +
                    "</td>"
                    +
                    "<td class='image-cell'>"
                    +
                    "<img src='"
                    +
                    imageUrl
                    +
                    "' alt='"
                    +
                    escapeHtml(
                        r.panelId
                    )
                    +
                    "'>"
                    +
                    "</td>"
                    +
                    "</tr>";
            });


            const html =
`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>PV Thermal Inspection - 620 Validated Panels</title>

<style>

@page {
    size: A4 landscape;
    margin: 8mm;
}

* {
    box-sizing: border-box;
}

body {
    font-family: Arial, Helvetica, sans-serif;
    color: #111;
    margin: 0;
    background: #fff;
}

.report-header {
    margin-bottom: 8mm;
}

.report-header h1 {
    font-size: 20px;
    margin: 0 0 4px 0;
}

.report-header p {
    font-size: 10px;
    margin: 2px 0;
    color: #444;
}

table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 7.5px;
}

thead {
    display: table-header-group;
}

tr {
    break-inside: avoid;
    page-break-inside: avoid;
}

th,
td {
    border: 1px solid #aaa;
    padding: 3px 4px;
    vertical-align: middle;
    overflow-wrap: anywhere;
}

th {
    background: #ececec;
    font-size: 7.5px;
}

th:nth-child(1),
td:nth-child(1) {
    width: 11%;
}

th:nth-child(2),
td:nth-child(2) {
    width: 18%;
}

th:nth-child(3),
td:nth-child(3) {
    width: 9%;
}

th:nth-child(4),
td:nth-child(4) {
    width: 9%;
}

th:nth-child(5),
td:nth-child(5),
th:nth-child(6),
td:nth-child(6) {
    width: 12%;
}

th:nth-child(7),
td:nth-child(7) {
    width: 29%;
}

.image-cell {
    text-align: center;
    height: 34mm;
}

.image-cell img {
    display: block;
    width: 46mm;
    height: 30mm;
    object-fit: cover;
    margin: 0 auto;
}

.sev {
    font-weight: 700;
}

.sev.critical {
    background: #f7cccc;
}

.sev.high {
    background: #f8ddc8;
}

.sev.medium {
    background: #f7ecc8;
}

.footer-note {
    margin-top: 6mm;
    font-size: 8px;
    color: #555;
}

@media print {

    .no-print {
        display: none !important;
    }

    body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
}

</style>
</head>

<body>

<div class="report-header">

    <h1>
        PV Thermal Inspection Report
    </h1>

    <p>
        Manually validated defective MASTER panels: ${rows.length}
    </p>


</div>

<table>

<thead>
<tr>
    <th>Panel ID</th>
    <th>Anomaly</th>
    <th>Severity</th>
    <th>Latitude</th>
    <th>Longitude</th>
    <th>Image</th>
</tr>
</thead>

<tbody>
${bodyRows}
</tbody>

</table>

<div class="footer-note">
    Generated from the manually validated PV inspection dataset.
</div>

</body>
</html>`;


            win.document.open();

            win.document.write(
                html
            );

            win.document.close();


            /*
             * Wait for all orthophoto crops before printing.
             */
            const imgs =
                Array.from(
                    win.document.images
                );


            await Promise.all(
                imgs.map(
                    function (img) {

                        if (
                            img.complete
                            &&
                            img.naturalWidth > 0
                        ) {
                            return Promise.resolve();
                        }


                        return new Promise(
                            function (resolve) {

                                const done =
                                    function () {
                                        resolve();
                                    };

                                img.addEventListener(
                                    "load",
                                    done,
                                    {
                                        once:
                                            true
                                    }
                                );

                                img.addEventListener(
                                    "error",
                                    done,
                                    {
                                        once:
                                            true
                                    }
                                );


                                setTimeout(
                                    done,
                                    15000
                                );
                            }
                        );
                    }
                )
            );


            /*
             * Small rendering buffer.
             */
            await new Promise(
                function (resolve) {

                    setTimeout(
                        resolve,
                        600
                    );
                }
            );


            win.focus();

            win.print();

        }
        catch (err) {

            console.error(
                "[MANUAL620 PDF]",
                err
            );


            win.document.open();

            win.document.write(
                "<html><body style='font-family:Arial;padding:30px'>"
                +
                "<h2>PDF export error</h2>"
                +
                "<pre>"
                +
                escapeHtml(
                    String(
                        err
                    )
                )
                +
                "</pre>"
                +
                "</body></html>"
            );

            win.document.close();
        }
    }


    function installPdfButton(
        table
    ) {

        if (
            document.getElementById(
                "manual620ExportPdf"
            )
        ) {
            return;
        }


        const button =
            document.createElement(
                "button"
            );

        button.id =
            "manual620ExportPdf";

        button.type =
            "button";

        button.textContent =
            "Export PDF";

        button.title =
            "Export all validated panels with orthophoto images";


        button.style.margin =
            "8px 8px 10px 0";

        button.style.padding =
            "8px 14px";

        button.style.border =
            "1px solid #666";

        button.style.borderRadius =
            "6px";

        button.style.cursor =
            "pointer";

        button.style.fontWeight =
            "700";


        button.addEventListener(
            "click",
            exportPdf
        );


        table.parentNode.insertBefore(
            button,
            table
        );
    }


    /*
     * Table is rebuilt dynamically by existing frontend,
     * therefore reapply only presentation/enrichment.
     */
    let scheduled =
        false;


    const observer =
        new MutationObserver(
            function () {

                if (scheduled) {
                    return;
                }

                scheduled =
                    true;


                setTimeout(
                    function () {

                        scheduled =
                            false;

                        enhanceTable();

                    },
                    150
                );
            }
        );


    observer.observe(
        document.documentElement,
        {
            childList:
                true,

            subtree:
                true
        }
    );


    setTimeout(
        enhanceTable,
        300
    );

    setTimeout(
        enhanceTable,
        1000
    );


    window.manual620ExportPdf =
        exportPdf;

})();


/* === MANUAL620_PDF_FIX_V2 === */

/* === MANUAL620_PDF_REMOVE_NOTE_V1 === */



/* === MANUAL620_FINAL_TABLE_PDF_V1 === */

(function () {

    window.__manual620FinalTableActive =
        true;

    let classificationPromise = null;


    function loadClassification() {

        if (!classificationPromise) {

            classificationPromise =
                fetch(
                    "/static/manual620_visual_defects.json?t="
                    +
                    Date.now()
                )
                .then(function (response) {

                    if (!response.ok) {

                        throw new Error(
                            "Classification HTTP "
                            +
                            response.status
                        );
                    }

                    return response.json();
                })
                .then(function (data) {

                    return (
                        data.panels
                        ||
                        {}
                    );
                })
                .catch(function (error) {

                    console.error(
                        "[MANUAL620 FINAL]",
                        error
                    );

                    return {};
                });
        }


        return classificationPromise;
    }


    function getPanelId(row) {

        if (
            !row
            ||
            !row.cells
            ||
            !row.cells.length
        ) {
            return null;
        }


        const id =
            String(
                row.cells[0].textContent
                ||
                ""
            ).trim();


        if (
            !/^PANEL_/i.test(id)
        ) {
            return null;
        }


        return id;
    }


    function applySeverityStyle(
        cell,
        severity
    ) {

        cell.style.fontWeight =
            "700";

        cell.style.background =
            "";


        if (
            severity
            ===
            "Critical"
        ) {

            cell.style.background =
                "rgba(220,38,38,.18)";
        }
        else if (
            severity
            ===
            "High"
        ) {

            cell.style.background =
                "rgba(234,88,12,.16)";
        }
        else if (
            severity
            ===
            "Medium"
        ) {

            cell.style.background =
                "rgba(202,138,4,.14)";
        }
    }


    async function normalizeTable() {

        const classifications =
            await loadClassification();


        const rows =
            document.querySelectorAll(
                "tbody tr"
            );


        rows.forEach(function (row) {

            const panelId =
                getPanelId(
                    row
                );


            if (!panelId) {
                return;
            }


            const imageCell =
                row.querySelector(
                    ".manual620-image-cell"
                );


            if (!imageCell) {
                return;
            }


            const rec =
                classifications[
                    panelId
                ]
                ||
                {};


            /*
             * Remove V1 enrichment cells.
             * We will reuse the original columns instead.
             */

            row.querySelectorAll(
                ".manual620-visual-defect,"
                +
                ".manual620-visual-severity,"
                +
                ".manual620-visual-confidence"
            )
            .forEach(function (cell) {

                cell.remove();
            });


            /*
             * At this point the original physical cells are:
             *
             * 0 Panel
             * 1 old anomaly
             * 2 old severity
             * 3 old observations
             * 4 latitude
             * 5 longitude
             * 6 image
             */


            if (row.cells.length < 7) {
                return;
            }


            const anomaly =
                rec.anomaly_type
                ||
                rec.visual_defect_estimate
                ||
                "Hot-Spot";


            const severity =
                rec.severity_estimate
                ||
                "";


            const confidence =
                rec.confidence
                ||
                "";


            /*
             * Reuse the old columns.
             */
            row.cells[1].textContent =
                anomaly;

            row.cells[2].textContent =
                severity;

            row.cells[3].textContent =
                confidence;


            row.cells[1].style.display =
                "";

            row.cells[2].style.display =
                "";

            /*
             * Confidence remains physically present so
             * Latitude/Longitude stay at indexes 4/5,
             * but it is permanently hidden from Table.
             */
            row.cells[3].style.display =
                "none";


            applySeverityStyle(
                row.cells[2],
                severity
            );


            /*
             * Keep orthophoto crop.
             */
            const img =
                imageCell.querySelector(
                    "img"
                );


            if (img) {

                img.src =
                    "/static/panel_thumbnails/"
                    +
                    encodeURIComponent(
                        panelId
                    )
                    +
                    ".webp";

                img.alt =
                    panelId
                    +
                    " orthophoto crop";

                img.style.width =
                    "110px";

                img.style.height =
                    "82px";

                img.style.objectFit =
                    "cover";
            }
        });


        /*
         * Header cleanup.
         */
        const table =
            Array.from(
                document.querySelectorAll(
                    "table"
                )
            )
            .find(function (candidate) {

                return candidate.querySelector(
                    ".manual620-image-cell"
                );
            });


        if (!table) {
            return;
        }


        const header =
            table.querySelector(
                "thead tr"
            );


        if (
            !header
            ||
            header.cells.length < 7
        ) {
            return;
        }


        /*
         * Remove dynamically inserted V1 headers.
         */
        header.querySelectorAll(
            ".manual620-head-defect,"
            +
            ".manual620-head-severity,"
            +
            ".manual620-head-confidence"
        )
        .forEach(function (cell) {

            cell.remove();
        });


        if (
            header.cells.length >= 7
        ) {

            header.cells[0].textContent =
                "Panel ID";

            header.cells[1].textContent =
                "Anomaly";

            header.cells[2].textContent =
                "Severity";

            header.cells[3].textContent =
                "Confidence";

            header.cells[4].textContent =
                "Latitude";

            header.cells[5].textContent =
                "Longitude";

            header.cells[6].textContent =
                "Image";


            for (
                let i = 0;
                i < 7;
                i++
            ) {

                header.cells[i].style.display =
                    (
                        i === 3
                        ?
                        "none"
                        :
                        ""
                    );
            }
        }
    }


    let pending =
        false;


    const observer =
        new MutationObserver(
            function () {

                if (pending) {
                    return;
                }


                pending =
                    true;


                setTimeout(
                    function () {

                        pending =
                            false;

                        normalizeTable();

                    },
                    180
                );
            }
        );


    observer.observe(
        document.documentElement,
        {
            childList:
                true,

            subtree:
                true
        }
    );


    setTimeout(
        normalizeTable,
        300
    );

    setTimeout(
        normalizeTable,
        1200
    );

})();



/* === MANUAL620_TABLE_STABLE_V3 === */

(function () {

    let timer = null;


    function stabilize() {

        const imageCells =
            document.querySelectorAll(
                ".manual620-image-cell"
            );


        if (!imageCells.length) {
            return;
        }


        let table = null;


        imageCells.forEach(
            function (cell) {

                if (!table) {
                    table = cell.closest(
                        "table"
                    );
                }


                /*
                 * Lock image column geometry.
                 */
                cell.style.width =
                    "130px";

                cell.style.minWidth =
                    "130px";

                cell.style.maxWidth =
                    "130px";

                cell.style.height =
                    "92px";

                cell.style.minHeight =
                    "92px";

                cell.style.padding =
                    "5px";

                cell.style.verticalAlign =
                    "middle";


                const img =
                    cell.querySelector(
                        "img"
                    );


                if (img) {

                    /*
                     * HTML dimensions reserve the space
                     * before the WebP finishes loading.
                     *
                     * SRC IS NOT TOUCHED.
                     */
                    img.width =
                        110;

                    img.height =
                        82;


                    img.style.width =
                        "110px";

                    img.style.height =
                        "82px";

                    img.style.minWidth =
                        "110px";

                    img.style.maxWidth =
                        "110px";

                    img.style.minHeight =
                        "82px";

                    img.style.maxHeight =
                        "82px";

                    img.style.objectFit =
                        "cover";

                    img.style.display =
                        "block";

                    img.style.margin =
                        "0 auto";
                }
            }
        );


        if (table) {

            table.style.tableLayout =
                "fixed";

            table.style.width =
                "100%";


            /*
             * Final visible table:
             *
             * Panel ID
             * Anomaly
             * Severity
             * Confidence
             * Latitude
             * Longitude
             * Image
             */

            const widths = [
                "14%",
                "18%",
                "10%",
                "10%",
                "15%",
                "15%",
                "18%"
            ];


            table
                .querySelectorAll(
                    "tr"
                )
                .forEach(
                    function (row) {

                        if (
                            row.cells.length
                            !==
                            7
                        ) {
                            return;
                        }


                        for (
                            let i = 0;
                            i < 7;
                            i++
                        ) {

                            row.cells[i]
                                .style.width =
                                    widths[i];
                        }
                    }
                );
        }
    }


    /*
     * Debounced observer:
     * reacts to actual table rebuilds but does not itself
     * modify DOM structure and therefore cannot create
     * an add/remove loop.
     */
    const observer =
        new MutationObserver(
            function () {

                clearTimeout(
                    timer
                );


                timer =
                    setTimeout(
                        stabilize,
                        120
                    );
            }
        );


    observer.observe(
        document.documentElement,
        {
            childList:
                true,

            subtree:
                true
        }
    );


    /*
     * Initial passes only.
     */
    setTimeout(
        stabilize,
        100
    );

    setTimeout(
        stabilize,
        500
    );

    setTimeout(
        stabilize,
        1500
    );


    window.manual620StabilizeTable =
        stabilize;

})();




/* === MANUAL620_REMOVE_CONFIDENCE_V1 === */

(function () {

    let timer = null;


    function removeConfidence() {

        const tables =
            document.querySelectorAll(
                "table"
            );


        tables.forEach(function (table) {

            const imageCell =
                table.querySelector(
                    ".manual620-image-cell"
                );

            if (!imageCell) {
                return;
            }


            /*
             * Identify Confidence by header instead of
             * hard-coded index.
             */
            const header =
                table.querySelector(
                    "thead tr"
                );

            if (!header) {
                return;
            }


            let confidenceIndex =
                -1;


            for (
                let i = 0;
                i < header.cells.length;
                i++
            ) {

                const value =
                    String(
                        header.cells[i].textContent
                        ||
                        ""
                    )
                    .trim()
                    .toLowerCase();


                if (
                    value
                    ===
                    "confidence"
                ) {

                    confidenceIndex =
                        i;

                    break;
                }
            }


            if (
                confidenceIndex < 0
            ) {
                return;
            }


            /*
             * Remove same physical column from body first.
             */
            table
                .querySelectorAll(
                    "tbody tr"
                )
                .forEach(function (row) {

                    if (
                        row.cells[
                            confidenceIndex
                        ]
                    ) {

                        row.cells[
                            confidenceIndex
                        ].remove();
                    }
                });


            /*
             * Then header.
             */
            if (
                header.cells[
                    confidenceIndex
                ]
            ) {

                header.cells[
                    confidenceIndex
                ].remove();
            }


            /*
             * Stable final geometry:
             *
             * Panel ID
             * Anomaly
             * Severity
             * Latitude
             * Longitude
             * Image
             */
            table.style.tableLayout =
                "fixed";

            table.style.width =
                "100%";


            const widths = [
                "15%",
                "20%",
                "11%",
                "17%",
                "17%",
                "20%"
            ];


            table
                .querySelectorAll(
                    "tr"
                )
                .forEach(function (row) {

                    if (
                        row.cells.length
                        !==
                        6
                    ) {
                        return;
                    }


                    for (
                        let i = 0;
                        i < 6;
                        i++
                    ) {

                        row.cells[i]
                            .style.width =
                                widths[i];
                    }
                });
        });
    }


    /*
     * Existing frontend can rebuild the table,
     * so remove Confidence again only after a rebuild.
     */
    const observer =
        new MutationObserver(
            function () {

                clearTimeout(
                    timer
                );

                timer =
                    setTimeout(
                        removeConfidence,
                        150
                    );
            }
        );


    observer.observe(
        document.documentElement,
        {
            childList: true,
            subtree: true
        }
    );


    setTimeout(
        removeConfidence,
        100
    );

    setTimeout(
        removeConfidence,
        700
    );

})();





/* === MANUAL620_REMOVE_CONFIDENCE_V2 === */

(function () {

    function hideConfidenceFinal() {

        document
            .querySelectorAll(
                "table"
            )
            .forEach(function (table) {

                if (
                    !table.querySelector(
                        ".manual620-image-cell"
                    )
                ) {
                    return;
                }


                const header =
                    table.querySelector(
                        "thead tr"
                    );


                if (
                    header
                    &&
                    header.cells[3]
                ) {

                    header.cells[3]
                        .style
                        .setProperty(
                            "display",
                            "none",
                            "important"
                        );
                }


                table
                    .querySelectorAll(
                        "tbody tr"
                    )
                    .forEach(function (row) {

                        if (
                            row.cells[3]
                        ) {

                            row.cells[3]
                                .style
                                .setProperty(
                                    "display",
                                    "none",
                                    "important"
                                );
                        }
                    });
            });
    }


    setTimeout(
        hideConfidenceFinal,
        100
    );

    setTimeout(
        hideConfidenceFinal,
        600
    );

    setTimeout(
        hideConfidenceFinal,
        1500
    );


    window.manual620HideConfidence =
        hideConfidenceFinal;

})();





/* === MANUAL620_DASHBOARD_EXPORT_V1 === */

(function () {

    const DATA_URL =
        "/static/manual620_visual_defects.json";

    const COORD_URL =
        "/static/manual620_coordinates.json";


    const ANOMALY_ORDER = [
        "Hot-Spot-Multi",
        "Diode-Multi",
        "Diode",
        "Hot-Spot",
        "Bypassed-Substring",
        "String-Open-Circuit"
    ];


    let dataPromise = null;
    let coordPromise = null;


    function loadManual620() {

        if (!dataPromise) {

            dataPromise =
                fetch(
                    DATA_URL
                    +
                    "?t="
                    +
                    Date.now()
                )
                .then(function (response) {

                    if (!response.ok) {

                        throw new Error(
                            "Manual620 HTTP "
                            +
                            response.status
                        );
                    }

                    return response.json();
                });
        }

        return dataPromise;
    }


    function loadCoordinates() {

        if (!coordPromise) {

            coordPromise =
                fetch(
                    COORD_URL
                    +
                    "?t="
                    +
                    Date.now()
                )
                .then(function (response) {

                    if (!response.ok) {

                        throw new Error(
                            "Coordinates HTTP "
                            +
                            response.status
                        );
                    }

                    return response.json();
                });
        }

        return coordPromise;
    }


    function getCounts(data) {

        const panels =
            data.panels
            ||
            {};

        const anomalyCounts =
            {};

        ANOMALY_ORDER.forEach(
            function (name) {

                anomalyCounts[name] =
                    0;
            }
        );


        const severityCounts = {
            Low: 0,
            Medium: 0,
            High: 0,
            Critical: 0
        };


        Object.values(
            panels
        )
        .forEach(function (rec) {

            const anomaly =
                rec.anomaly_type
                ||
                rec.visual_defect_estimate
                ||
                "Hot-Spot";


            if (
                anomalyCounts[
                    anomaly
                ]
                ===
                undefined
            ) {

                anomalyCounts[
                    anomaly
                ] = 0;
            }


            anomalyCounts[
                anomaly
            ]++;


            const severity =
                rec.severity_estimate
                ||
                "Low";


            if (
                severityCounts[
                    severity
                ]
                ===
                undefined
            ) {

                severityCounts[
                    severity
                ] = 0;
            }


            severityCounts[
                severity
            ]++;
        });


        return {
            total:
                Object.keys(
                    panels
                ).length,

            anomaly:
                anomalyCounts,

            severity:
                severityCounts
        };
    }


    /*
     * -------------------------------------------------------
     * MAP / SIDEBAR COUNTS
     * -------------------------------------------------------
     */
    function updateMapStats(
        counts
    ) {

        const findingCount =
            document.getElementById(
                "findingCount"
            );


        if (findingCount) {

            findingCount.textContent =
                "["
                +
                counts.total
                +
                "]";
        }


        const affected =
            document.getElementById(
                "affectedPanels"
            );


        if (affected) {

            affected.textContent =
                String(
                    counts.total
                );
        }


        const totalPanels =
            document.getElementById(
                "totalPanels"
            );


        if (totalPanels) {

            totalPanels.textContent =
                "16928";
        }


        const affectedPercentage =
            document.getElementById(
                "affectedPercentage"
            );


        if (affectedPercentage) {

            affectedPercentage.textContent =
                (
                    counts.total
                    /
                    16928
                    *
                    100
                ).toFixed(2)
                +
                "%";
        }


        /*
         * Update existing legend rows instead of replacing
         * the legend functionality.
         */
        const legend =
            document.getElementById(
                "anomalyLegend"
            );


        if (!legend) {
            return;
        }


        const existingRows =
            Array.from(
                legend.querySelectorAll(
                    ".legend-row"
                )
            );


        const found =
            new Set();


        existingRows.forEach(
            function (row) {

                const label =
                    row.querySelector(
                        ".legend-label"
                    );

                const value =
                    row.querySelector(
                        ".legend-count"
                    );


                if (
                    !label
                    ||
                    !value
                ) {
                    return;
                }


                const name =
                    String(
                        label.textContent
                        ||
                        ""
                    ).trim();


                if (
                    Object.prototype
                        .hasOwnProperty
                        .call(
                            counts.anomaly,
                            name
                        )
                ) {

                    value.textContent =
                        counts.anomaly[
                            name
                        ];

                    found.add(
                        name
                    );
                }
            }
        );


        /*
         * If the old legend did not contain one of the
         * V3 categories, add a simple row for it.
         */
        ANOMALY_ORDER.forEach(
            function (name) {

                if (
                    found.has(
                        name
                    )
                ) {
                    return;
                }


                const row =
                    document.createElement(
                        "div"
                    );

                row.className =
                    "legend-row";


                const swatch =
                    document.createElement(
                        "span"
                    );

                swatch.className =
                    "legend-swatch";


                const label =
                    document.createElement(
                        "span"
                    );

                label.className =
                    "legend-label";

                label.textContent =
                    name;


                const value =
                    document.createElement(
                        "span"
                    );

                value.className =
                    "legend-count";

                value.textContent =
                    counts.anomaly[
                        name
                    ]
                    ||
                    0;


                row.appendChild(
                    swatch
                );

                row.appendChild(
                    label
                );

                row.appendChild(
                    value
                );

                legend.appendChild(
                    row
                );
            }
        );
    }


    /*
     * -------------------------------------------------------
     * CHARTS
     * -------------------------------------------------------
     *
     * Reuse existing chart renderer but feed it the
     * authoritative V3 counts instead of /api/stats.
     */
    function updateCharts(
        counts
    ) {

        if (
            typeof buildBarChart
            !==
            "function"
        ) {

            console.warn(
                "[MANUAL620] buildBarChart unavailable"
            );

            return;
        }


        buildBarChart(
            "anomalyChart",
            counts.anomaly
        );


        buildBarChart(
            "severityChart",
            counts.severity
        );
    }


    /*
     * -------------------------------------------------------
     * REMOVE EXPORT TAB
     * -------------------------------------------------------
     */
    function removeExportTab() {

        const button =
            document.getElementById(
                "exportButton"
            );


        if (button) {

            button.remove();
        }


        const exportView =
            document.getElementById(
                "exportView"
            );


        if (exportView) {

            exportView.remove();
        }
    }


    /*
     * -------------------------------------------------------
     * EXCEL EXPORT
     *
     * Excel-compatible .xls HTML workbook.
     * No images.
     * -------------------------------------------------------
     */
    function escapeHtml(
        value
    ) {

        return String(
            value
            ??
            ""
        )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
    }


    async function exportExcel() {

        try {

            const responses =
                await Promise.all([
                    loadManual620(),
                    loadCoordinates()
                ]);


            const data =
                responses[0];

            const coordinates =
                responses[1]
                ||
                {};


            const panels =
                data.panels
                ||
                {};


            const ids =
                Object.keys(
                    panels
                );


            if (
                ids.length
                !==
                620
            ) {

                throw new Error(
                    "Expected 620 panels, found "
                    +
                    ids.length
                );
            }


            ids.sort(
                function (a, b) {

                    return a.localeCompare(
                        b,
                        undefined,
                        {
                            numeric:
                                true
                        }
                    );
                }
            );


            let rows =
                "";


            ids.forEach(
                function (panelId) {

                    const rec =
                        panels[
                            panelId
                        ]
                        ||
                        {};


                    const coord =
                        coordinates[
                            panelId
                        ]
                        ||
                        {};


                    const anomaly =
                        rec.anomaly_type
                        ||
                        rec.visual_defect_estimate
                        ||
                        "Hot-Spot";


                    const severity =
                        rec.severity_estimate
                        ||
                        "";


                    const latitude =
                        Number(
                            coord.latitude
                            ??
                            0
                        );


                    const longitude =
                        Number(
                            coord.longitude
                            ??
                            0
                        );


                    rows +=
                        "<tr>"
                        +
                        "<td>"
                        +
                        escapeHtml(
                            panelId
                        )
                        +
                        "</td>"
                        +
                        "<td>"
                        +
                        escapeHtml(
                            anomaly
                        )
                        +
                        "</td>"
                        +
                        "<td>"
                        +
                        escapeHtml(
                            severity
                        )
                        +
                        "</td>"
                        +
                        "<td>"
                        +
                        (
                            Number.isFinite(
                                latitude
                            )
                            ?
                            latitude.toFixed(7)
                            :
                            ""
                        )
                        +
                        "</td>"
                        +
                        "<td>"
                        +
                        (
                            Number.isFinite(
                                longitude
                            )
                            ?
                            longitude.toFixed(7)
                            :
                            ""
                        )
                        +
                        "</td>"
                        +
                        "</tr>";
                }
            );


            const workbook =
`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
table {
    border-collapse: collapse;
}
th, td {
    border: 1px solid #999;
    padding: 5px 8px;
}
th {
    font-weight: bold;
    background: #e9e9e9;
}
</style>
</head>
<body>

<table>
<thead>
<tr>
    <th>Panel ID</th>
    <th>Anomaly</th>
    <th>Severity</th>
    <th>Latitude</th>
    <th>Longitude</th>
</tr>
</thead>
<tbody>
${rows}
</tbody>
</table>

</body>
</html>`;


            const blob =
                new Blob(
                    [
                        "\ufeff",
                        workbook
                    ],
                    {
                        type:
                            "application/vnd.ms-excel;charset=utf-8"
                    }
                );


            const url =
                URL.createObjectURL(
                    blob
                );


            const link =
                document.createElement(
                    "a"
                );


            link.href =
                url;

            link.download =
                "PV_Thermal_Validated_620.xls";


            document.body.appendChild(
                link
            );

            link.click();

            link.remove();


            setTimeout(
                function () {

                    URL.revokeObjectURL(
                        url
                    );

                },
                1500
            );

        }
        catch (error) {

            console.error(
                "[MANUAL620 Excel]",
                error
            );


            alert(
                "Excel export error: "
                +
                String(
                    error
                )
            );
        }
    }


    /*
     * -------------------------------------------------------
     * TABLE EXPORT BUTTONS
     * -------------------------------------------------------
     */
    function installExcelButton() {

        if (
            document.getElementById(
                "manual620ExportExcel"
            )
        ) {
            return;
        }


        const pdf =
            document.getElementById(
                "manual620ExportPdf"
            );


        if (!pdf) {
            return;
        }


        const button =
            document.createElement(
                "button"
            );


        button.id =
            "manual620ExportExcel";

        button.type =
            "button";

        button.textContent =
            "Export Excel";

        button.title =
            "Export Excel without images";


        button.style.margin =
            "8px 8px 10px 0";

        button.style.padding =
            "8px 14px";

        button.style.border =
            "1px solid #666";

        button.style.borderRadius =
            "6px";

        button.style.cursor =
            "pointer";

        button.style.fontWeight =
            "700";


        button.addEventListener(
            "click",
            exportExcel
        );


        pdf.insertAdjacentElement(
            "afterend",
            button
        );
    }


    /*
     * -------------------------------------------------------
     * APPLY
     * -------------------------------------------------------
     */
    async function applyManual620Dashboard() {

        try {

            const data =
                await loadManual620();


            const counts =
                getCounts(
                    data
                );


            if (
                counts.total
                !==
                620
            ) {

                throw new Error(
                    "Expected 620 panels, got "
                    +
                    counts.total
                );
            }


            updateMapStats(
                counts
            );


            updateCharts(
                counts
            );


            removeExportTab();

            installExcelButton();


            console.log(
                "[MANUAL620] dashboard updated",
                counts
            );

        }
        catch (error) {

            console.error(
                "[MANUAL620 dashboard]",
                error
            );
        }
    }


    /*
     * Existing code can repaint legend/charts when
     * navigation changes. Reapply after those events,
     * but without rebuilding Table rows.
     */
    setTimeout(
        applyManual620Dashboard,
        250
    );

    setTimeout(
        applyManual620Dashboard,
        1000
    );

    setTimeout(
        applyManual620Dashboard,
        2500
    );


    const chartButton =
        document.getElementById(
            "chartButton"
        );


    if (chartButton) {

        chartButton.addEventListener(
            "click",
            function () {

                setTimeout(
                    applyManual620Dashboard,
                    100
                );
            }
        );
    }


    const tableButton =
        document.getElementById(
            "tableButton"
        );


    if (tableButton) {

        tableButton.addEventListener(
            "click",
            function () {

                setTimeout(
                    installExcelButton,
                    150
                );
            }
        );
    }


    window.manual620ExportExcel =
        exportExcel;

    window.manual620RefreshDashboard =
        applyManual620Dashboard;

})();





/* === MANUAL620_LEGEND_REPLACE_V1 === */

(function () {

    const ORDER = [
        "Hot-Spot-Multi",
        "Diode-Multi",
        "Diode",
        "Hot-Spot",
        "Bypassed-Substring",
        "String-Open-Circuit"
    ];


    const COLORS = {
        "Hot-Spot-Multi": "#ff6b75",
        "Diode-Multi": "#9b59c6",
        "Diode": "#3498db",
        "Hot-Spot": "#ff3b30",
        "Bypassed-Substring": "#9226e8",
        "String-Open-Circuit": "#8bdc24"
    };


    async function rebuildLegend() {

        try {

            const response =
                await fetch(
                    "/static/manual620_visual_defects.json?t="
                    +
                    Date.now()
                );


            if (!response.ok) {
                return;
            }


            const data =
                await response.json();


            const panels =
                data.panels
                ||
                {};


            const counts =
                {};


            ORDER.forEach(
                function (name) {

                    counts[name] =
                        0;
                }
            );


            Object.values(
                panels
            )
            .forEach(function (rec) {

                const anomaly =
                    rec.anomaly_type
                    ||
                    rec.visual_defect_estimate
                    ||
                    "Hot-Spot";


                if (
                    counts[
                        anomaly
                    ]
                    ===
                    undefined
                ) {

                    counts[
                        anomaly
                    ] = 0;
                }


                counts[
                    anomaly
                ]++;
            });


            const legend =
                document.getElementById(
                    "anomalyLegend"
                );


            if (!legend) {
                return;
            }


            /*
             * Important:
             * remove old legend entirely.
             */
            legend.innerHTML =
                "";


            ORDER.forEach(
                function (name) {

                    const row =
                        document.createElement(
                            "div"
                        );

                    row.className =
                        "legend-row";


                    const checkbox =
                        document.createElement(
                            "input"
                        );

                    checkbox.type =
                        "checkbox";

                    checkbox.checked =
                        true;

                    checkbox.disabled =
                        true;

                    checkbox.style.marginRight =
                        "8px";


                    const swatch =
                        document.createElement(
                            "span"
                        );

                    swatch.className =
                        "legend-swatch";

                    swatch.style.background =
                        COLORS[
                            name
                        ];


                    const label =
                        document.createElement(
                            "span"
                        );

                    label.className =
                        "legend-label";

                    label.textContent =
                        name;


                    const value =
                        document.createElement(
                            "span"
                        );

                    value.className =
                        "legend-count";

                    value.textContent =
                        counts[
                            name
                        ]
                        ||
                        0;


                    row.appendChild(
                        checkbox
                    );

                    row.appendChild(
                        swatch
                    );

                    row.appendChild(
                        label
                    );

                    row.appendChild(
                        value
                    );


                    legend.appendChild(
                        row
                    );
                }
            );


            const findingCount =
                document.getElementById(
                    "findingCount"
                );


            if (findingCount) {

                findingCount.textContent =
                    "[620]";
            }

        }
        catch (error) {

            console.error(
                "[MANUAL620 LEGEND]",
                error
            );
        }
    }


    setTimeout(
        rebuildLegend,
        200
    );

    setTimeout(
        rebuildLegend,
        1000
    );

    setTimeout(
        rebuildLegend,
        2500
    );


    const mapButton =
        document.getElementById(
            "mapButton"
        );


    if (mapButton) {

        mapButton.addEventListener(
            "click",
            function () {

                setTimeout(
                    rebuildLegend,
                    100
                );
            }
        );
    }


    window.manual620RebuildLegend =
        rebuildLegend;

})();





/* === MANUAL620_TABLE_EXPORT_BINDINGS_V1 === */

(function () {

    const DATA_URL =
        "/static/manual620_visual_defects.json";

    const COORD_URL =
        "/static/manual620_coordinates.json";


    function esc(value) {

        return String(
            value
            ??
            ""
        )
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }


    async function getRows() {

        const responses =
            await Promise.all([
                fetch(
                    DATA_URL
                    +
                    "?t="
                    +
                    Date.now()
                ),
                fetch(
                    COORD_URL
                    +
                    "?t="
                    +
                    Date.now()
                )
            ]);


        if (
            !responses[0].ok
            ||
            !responses[1].ok
        ) {

            throw new Error(
                "Nu pot incarca datele pentru export."
            );
        }


        const defects =
            await responses[0].json();

        const coordinates =
            await responses[1].json();


        const panels =
            defects.panels
            ||
            {};


        const ids =
            Object.keys(
                panels
            );


        ids.sort(
            function (a, b) {

                return a.localeCompare(
                    b,
                    undefined,
                    {
                        numeric: true
                    }
                );
            }
        );


        return ids.map(
            function (panelId) {

                const defect =
                    panels[
                        panelId
                    ]
                    ||
                    {};


                const coord =
                    coordinates[
                        panelId
                    ]
                    ||
                    {};


                return {
                    panelId:
                        panelId,

                    anomaly:
                        defect.anomaly_type
                        ||
                        defect.visual_defect_estimate
                        ||
                        "",

                    severity:
                        defect.severity_estimate
                        ||
                        "",

                    latitude:
                        coord.latitude,

                    longitude:
                        coord.longitude,

                    image:
                        "/static/panel_thumbnails/"
                        +
                        encodeURIComponent(
                            panelId
                        )
                        +
                        ".webp"
                };
            }
        );
    }


    async function exportPdf() {

        try {

            const rows =
                await getRows();


            let body =
                "";


            rows.forEach(
                function (r) {

                    body +=
                        "<tr>"
                        +
                        "<td>"
                        +
                        esc(r.panelId)
                        +
                        "</td>"
                        +
                        "<td>"
                        +
                        esc(r.anomaly)
                        +
                        "</td>"
                        +
                        "<td>"
                        +
                        esc(r.severity)
                        +
                        "</td>"
                        +
                        "<td>"
                        +
                        (
                            Number.isFinite(
                                Number(
                                    r.latitude
                                )
                            )
                            ?
                            Number(
                                r.latitude
                            ).toFixed(7)
                            :
                            ""
                        )
                        +
                        "</td>"
                        +
                        "<td>"
                        +
                        (
                            Number.isFinite(
                                Number(
                                    r.longitude
                                )
                            )
                            ?
                            Number(
                                r.longitude
                            ).toFixed(7)
                            :
                            ""
                        )
                        +
                        "</td>"
                        +
                        "<td>"
                        +
                        '<img src="'
                        +
                        r.image
                        +
                        '" style="width:110px;height:82px;object-fit:cover;">'
                        +
                        "</td>"
                        +
                        "</tr>";
                }
            );


            const w =
                window.open(
                    "",
                    "_blank"
                );


            if (!w) {

                alert(
                    "Browserul a blocat fereastra PDF."
                );

                return;
            }


            w.document.open();

            w.document.write(
`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>PV Thermal Validated Findings</title>
<style>

@page {
    size: A4 landscape;
    margin: 8mm;
}

body {
    font-family: Arial, sans-serif;
    margin: 0;
    padding: 0;
}

h1 {
    font-size: 18px;
    margin: 0 0 10px 0;
}

table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
}

th,
td {
    border: 1px solid #888;
    padding: 4px 5px;
    font-size: 9px;
    vertical-align: middle;
    word-wrap: break-word;
}

th {
    background: #eee;
}

img {
    display: block;
    margin: 0 auto;
}

tr {
    page-break-inside: avoid;
}

</style>
</head>

<body>

<h1>Verified Findings - 620 Panels</h1>

<table>
<thead>
<tr>
    <th>Panel ID</th>
    <th>Anomaly</th>
    <th>Severity</th>
    <th>Latitude</th>
    <th>Longitude</th>
    <th>Image</th>
</tr>
</thead>

<tbody>
${body}
</tbody>

</table>

<script>
(function () {

    const images =
        Array.from(
            document.images
        );

    Promise.all(
        images.map(
            function (img) {

                if (img.complete) {
                    return Promise.resolve();
                }

                return new Promise(
                    function (resolve) {

                        img.onload =
                            resolve;

                        img.onerror =
                            resolve;
                    }
                );
            }
        )
    )
    .then(
        function () {

            setTimeout(
                function () {

                    window.print();

                },
                300
            );
        }
    );

})();
<\/script>

</body>
</html>`
            );

            w.document.close();

        }
        catch (error) {

            console.error(
                "[MANUAL620 PDF]",
                error
            );

            alert(
                "PDF export error: "
                +
                String(
                    error
                )
            );
        }
    }


    async function exportExcel() {

        try {

            const rows =
                await getRows();


            let body =
                "";


            rows.forEach(
                function (r) {

                    body +=
                        "<tr>"
                        +
                        "<td>"
                        +
                        esc(r.panelId)
                        +
                        "</td>"
                        +
                        "<td>"
                        +
                        esc(r.anomaly)
                        +
                        "</td>"
                        +
                        "<td>"
                        +
                        esc(r.severity)
                        +
                        "</td>"
                        +
                        "<td>"
                        +
                        (
                            Number.isFinite(
                                Number(
                                    r.latitude
                                )
                            )
                            ?
                            Number(
                                r.latitude
                            ).toFixed(7)
                            :
                            ""
                        )
                        +
                        "</td>"
                        +
                        "<td>"
                        +
                        (
                            Number.isFinite(
                                Number(
                                    r.longitude
                                )
                            )
                            ?
                            Number(
                                r.longitude
                            ).toFixed(7)
                            :
                            ""
                        )
                        +
                        "</td>"
                        +
                        "</tr>";
                }
            );


            const workbook =
`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
</head>

<body>

<table border="1">
<thead>
<tr>
    <th>Panel ID</th>
    <th>Anomaly</th>
    <th>Severity</th>
    <th>Latitude</th>
    <th>Longitude</th>
</tr>
</thead>

<tbody>
${body}
</tbody>
</table>

</body>
</html>`;


            const blob =
                new Blob(
                    [
                        "\ufeff",
                        workbook
                    ],
                    {
                        type:
                            "application/vnd.ms-excel;charset=utf-8"
                    }
                );


            const url =
                URL.createObjectURL(
                    blob
                );


            const link =
                document.createElement(
                    "a"
                );


            link.href =
                url;

            link.download =
                "PV_Thermal_Validated_620.xls";


            document.body.appendChild(
                link
            );

            link.click();

            link.remove();


            setTimeout(
                function () {

                    URL.revokeObjectURL(
                        url
                    );

                },
                1500
            );

        }
        catch (error) {

            console.error(
                "[MANUAL620 EXCEL]",
                error
            );

            alert(
                "Excel export error: "
                +
                String(
                    error
                )
            );
        }
    }


    function bind() {

        const pdf =
            document.getElementById(
                "manual620ExportPdf"
            );


        const excel =
            document.getElementById(
                "manual620ExportExcel"
            );


        if (pdf) {

            pdf.onclick =
                exportPdf;
        }


        if (excel) {

            excel.onclick =
                exportExcel;
        }
    }


    bind();

    setTimeout(
        bind,
        500
    );

})();





/* === IR_PULKOVO_CONTROL_FIX_V1 === */

(function () {

    let pulkovoLayer = null;


    function sourceText(layer) {

        try {

            const source =
                layer.getSource
                ?
                layer.getSource()
                :
                null;


            if (!source) {
                return "";
            }


            let text = "";


            if (
                typeof source.getUrl
                ===
                "function"
            ) {

                text +=
                    String(
                        source.getUrl()
                        ||
                        ""
                    );
            }


            if (
                typeof source.getUrls
                ===
                "function"
            ) {

                const urls =
                    source.getUrls();

                if (
                    Array.isArray(
                        urls
                    )
                ) {

                    text +=
                        " "
                        +
                        urls.join(
                            " "
                        );
                }
            }


            return text.toLowerCase();

        }
        catch (_) {

            return "";
        }
    }


    function layerText(layer) {

        try {

            return [
                layer.get("title"),
                layer.get("name"),
                layer.get("id"),
                sourceText(layer)
            ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        }
        catch (_) {

            return "";
        }
    }


    function findLayers() {

        if (
            typeof map
            ===
            "undefined"
            ||
            !map
        ) {
            return false;
        }


        const layers =
            map
                .getLayers()
                .getArray();


        pulkovoLayer =
            null;


        /*
         * Find authoritative Pulkovo WebP layer.
         */
        for (
            const layer
            of
            layers
        ) {

            const txt =
                layerText(
                    layer
                );


            if (
                txt.includes(
                    "ir_pulkovo_tiles"
                )
                ||
                txt.includes(
                    "ir pulkovo hd"
                )
                ||
                txt.includes(
                    "pulkovo"
                )
            ) {

                pulkovoLayer =
                    layer;

                break;
            }
        }


        if (!pulkovoLayer) {

            console.warn(
                "[IR FIX] Pulkovo layer not found yet"
            );

            return false;
        }


        /*
         * Disable every OTHER legacy IR raster.
         * Never touch RGB.
         */
        layers.forEach(
            function (layer) {

                if (
                    layer
                    ===
                    pulkovoLayer
                ) {
                    return;
                }


                const txt =
                    layerText(
                        layer
                    );


                const looksIr =
                    (
                        txt.includes(
                            "ir_aligned"
                        )
                        ||
                        txt.includes(
                            "thermal orthomosaic"
                        )
                        ||
                        txt.includes(
                            "ir thermal"
                        )
                        ||
                        (
                            txt.includes(
                                "thermal"
                            )
                            &&
                            !txt.includes(
                                "finding"
                            )
                        )
                    );


                const looksRgb =
                    txt.includes(
                        "rgb"
                    );


                if (
                    looksIr
                    &&
                    !looksRgb
                ) {

                    try {

                        layer.setVisible(
                            false
                        );

                        layer.setOpacity(
                            0
                        );

                    }
                    catch (_) {}
                }
            }
        );


        return true;
    }


    function findIrControls() {

        /*
         * First try likely element IDs.
         */
        const possibleChecks = [
            "irToggle",
            "irThermalToggle",
            "thermalToggle",
            "irLayerToggle"
        ];


        const possibleRanges = [
            "irOpacity",
            "irOpacitySlider",
            "thermalOpacity",
            "irLayerOpacity"
        ];


        let checkbox =
            null;

        let slider =
            null;


        for (
            const id
            of
            possibleChecks
        ) {

            const el =
                document.getElementById(
                    id
                );


            if (
                el
                &&
                el.type
                ===
                "checkbox"
            ) {

                checkbox =
                    el;

                break;
            }
        }


        for (
            const id
            of
            possibleRanges
        ) {

            const el =
                document.getElementById(
                    id
                );


            if (
                el
                &&
                el.type
                ===
                "range"
            ) {

                slider =
                    el;

                break;
            }
        }


        /*
         * Fallback:
         * locate controls by the label text "IR Thermal".
         */
        if (
            !checkbox
            ||
            !slider
        ) {

            const labels =
                Array.from(
                    document.querySelectorAll(
                        "label, .switch-row, .layer-row, .layer-section"
                    )
                );


            for (
                const node
                of
                labels
            ) {

                const txt =
                    String(
                        node.textContent
                        ||
                        ""
                    )
                    .replace(
                        /\s+/g,
                        " "
                    )
                    .trim()
                    .toLowerCase();


                if (
                    !txt.includes(
                        "ir thermal"
                    )
                ) {
                    continue;
                }


                if (!checkbox) {

                    checkbox =
                        node.querySelector(
                            'input[type="checkbox"]'
                        );
                }


                if (!slider) {

                    slider =
                        node.querySelector(
                            'input[type="range"]'
                        );


                    /*
                     * Slider may be sibling below label.
                     */
                    if (
                        !slider
                        &&
                        node.parentElement
                    ) {

                        slider =
                            node.parentElement
                                .querySelector(
                                    'input[type="range"]'
                                );
                    }
                }


                if (
                    checkbox
                    &&
                    slider
                ) {
                    break;
                }
            }
        }


        return {
            checkbox:
                checkbox,

            slider:
                slider
        };
    }


    function setPercentLabel(
        slider,
        percent
    ) {

        if (!slider) {
            return;
        }


        const parent =
            slider.parentElement;


        if (!parent) {
            return;
        }


        const candidates =
            Array.from(
                parent.querySelectorAll(
                    "span, strong, div"
                )
            );


        for (
            const el
            of
            candidates
        ) {

            const txt =
                String(
                    el.textContent
                    ||
                    ""
                ).trim();


            if (
                /^\d+\s*%$/.test(
                    txt
                )
            ) {

                el.textContent =
                    percent
                    +
                    "%";

                break;
            }
        }
    }


    function applyUiState() {

        if (
            !findLayers()
        ) {
            return;
        }


        const controls =
            findIrControls();


        const checkbox =
            controls.checkbox;

        const slider =
            controls.slider;


        if (!checkbox) {

            console.warn(
                "[IR FIX] IR checkbox not found"
            );

            return;
        }


        const enabled =
            Boolean(
                checkbox.checked
            );


        let opacity =
            1;


        if (slider) {

            const max =
                Number(
                    slider.max
                    ||
                    100
                );


            const value =
                Number(
                    slider.value
                    ||
                    0
                );


            opacity =
                max > 0
                ?
                value / max
                :
                0;


            opacity =
                Math.max(
                    0,
                    Math.min(
                        1,
                        opacity
                    )
                );
        }


        /*
         * Authoritative state:
         *
         * OFF = invisible, opacity zero.
         * ON  = visible, slider controls opacity.
         */
        if (!enabled) {

            pulkovoLayer.setVisible(
                false
            );

            pulkovoLayer.setOpacity(
                0
            );

        }
        else {

            pulkovoLayer.setVisible(
                true
            );

            pulkovoLayer.setOpacity(
                opacity
            );
        }


        setPercentLabel(
            slider,
            Math.round(
                enabled
                ?
                opacity * 100
                :
                0
            )
        );
    }


    function bind() {

        if (
            !findLayers()
        ) {
            return false;
        }


        const controls =
            findIrControls();


        if (!controls.checkbox) {
            return false;
        }


        if (
            !controls.checkbox
                .dataset
                .pulkovoBound
        ) {

            controls.checkbox
                .dataset
                .pulkovoBound =
                    "1";


            controls.checkbox
                .addEventListener(
                    "change",
                    function () {

                        applyUiState();

                    },
                    true
                );
        }


        if (
            controls.slider
            &&
            !controls.slider
                .dataset
                .pulkovoBound
        ) {

            controls.slider
                .dataset
                .pulkovoBound =
                    "1";


            controls.slider
                .addEventListener(
                    "input",
                    function () {

                        applyUiState();

                    },
                    true
                );


            controls.slider
                .addEventListener(
                    "change",
                    function () {

                        applyUiState();

                    },
                    true
                );
        }


        applyUiState();

        return true;
    }


    /*
     * Existing old listeners may run AFTER our handler.
     * Reassert authoritative state after each interaction.
     */
    document.addEventListener(
        "change",
        function (event) {

            const target =
                event.target;


            if (
                target
                &&
                (
                    target.type
                    ===
                    "checkbox"
                    ||
                    target.type
                    ===
                    "range"
                )
            ) {

                setTimeout(
                    applyUiState,
                    0
                );

                setTimeout(
                    applyUiState,
                    50
                );
            }

        },
        true
    );


    document.addEventListener(
        "input",
        function (event) {

            const target =
                event.target;


            if (
                target
                &&
                target.type
                ===
                "range"
            ) {

                setTimeout(
                    applyUiState,
                    0
                );
            }

        },
        true
    );


    /*
     * Wait until map + custom Pulkovo layer exist.
     */
    let tries =
        0;


    const timer =
        setInterval(
            function () {

                tries++;


                if (
                    bind()
                ) {

                    clearInterval(
                        timer
                    );


                    console.log(
                        "[IR FIX] Pulkovo controls bound"
                    );
                }


                if (
                    tries
                    >
                    100
                ) {

                    clearInterval(
                        timer
                    );
                }

            },
            100
        );


    setTimeout(
        applyUiState,
        1000
    );

    setTimeout(
        applyUiState,
        2500
    );


    window.pvApplyPulkovoIrState =
        applyUiState;

})();





/* === MANUAL620_EXPORTS_FORCE_V2 === */

(function () {

    const DATA_URL =
        "/static/manual620_visual_defects.json";

    const COORD_URL =
        "/static/manual620_coordinates.json";


    function esc(v) {

        return String(
            v ?? ""
        )
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }


    async function loadRows() {

        const result =
            await Promise.all([
                fetch(
                    DATA_URL
                    +
                    "?t="
                    +
                    Date.now()
                ),
                fetch(
                    COORD_URL
                    +
                    "?t="
                    +
                    Date.now()
                )
            ]);


        if (
            !result[0].ok
            ||
            !result[1].ok
        ) {

            throw new Error(
                "Nu pot incarca datele de export."
            );
        }


        const defects =
            await result[0].json();

        const coords =
            await result[1].json();


        const panels =
            defects.panels
            ||
            {};


        const ids =
            Object.keys(
                panels
            );


        ids.sort(
            function (a, b) {

                return a.localeCompare(
                    b,
                    undefined,
                    {
                        numeric: true
                    }
                );
            }
        );


        return ids.map(
            function (panelId) {

                const d =
                    panels[
                        panelId
                    ]
                    ||
                    {};


                const c =
                    coords[
                        panelId
                    ]
                    ||
                    {};


                return {

                    panelId:
                        panelId,

                    anomaly:
                        d.anomaly_type
                        ||
                        d.visual_defect_estimate
                        ||
                        "",

                    severity:
                        d.severity_estimate
                        ||
                        "",

                    latitude:
                        c.latitude,

                    longitude:
                        c.longitude,

                    image:
                        "/static/panel_thumbnails/"
                        +
                        encodeURIComponent(
                            panelId
                        )
                        +
                        ".webp"
                };
            }
        );
    }


    function num7(value) {

        const n =
            Number(
                value
            );


        return Number.isFinite(
            n
        )
        ?
        n.toFixed(7)
        :
        "";
    }


    async function exportPdf() {

        try {

            const rows =
                await loadRows();


            let body =
                "";


            rows.forEach(
                function (r) {

                    body +=
                        "<tr>"
                        +
                        "<td>"
                        +
                        esc(r.panelId)
                        +
                        "</td>"
                        +
                        "<td>"
                        +
                        esc(r.anomaly)
                        +
                        "</td>"
                        +
                        "<td>"
                        +
                        esc(r.severity)
                        +
                        "</td>"
                        +
                        "<td>"
                        +
                        num7(r.latitude)
                        +
                        "</td>"
                        +
                        "<td>"
                        +
                        num7(r.longitude)
                        +
                        "</td>"
                        +
                        '<td><img src="'
                        +
                        r.image
                        +
                        '"></td>'
                        +
                        "</tr>";
                }
            );


            const w =
                window.open(
                    "",
                    "_blank"
                );


            if (!w) {

                alert(
                    "Browserul a blocat fereastra PDF."
                );

                return;
            }


            w.document.write(
`<!doctype html>
<html>
<head>

<meta charset="utf-8">

<title>
PV Thermal - Verified Findings
</title>

<style>

@page {
    size: A4 landscape;
    margin: 7mm;
}

body {
    font-family: Arial, sans-serif;
}

h1 {
    font-size: 17px;
}

table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
}

th,
td {
    border: 1px solid #888;
    padding: 4px;
    font-size: 9px;
    vertical-align: middle;
}

th {
    background: #eee;
}

img {
    width: 110px;
    height: 82px;
    object-fit: cover;
    display: block;
    margin: auto;
}

tr {
    break-inside: avoid;
}

</style>

</head>

<body>

<h1>
Verified Findings - 620 Panels
</h1>

<table>

<thead>
<tr>
<th>Panel ID</th>
<th>Anomaly</th>
<th>Severity</th>
<th>Latitude</th>
<th>Longitude</th>
<th>Image</th>
</tr>
</thead>

<tbody>
${body}
</tbody>

</table>

<script>

Promise.all(
    Array.from(
        document.images
    )
    .map(
        function(img) {

            if (
                img.complete
            ) {
                return Promise.resolve();
            }

            return new Promise(
                function(resolve) {

                    img.onload =
                        resolve;

                    img.onerror =
                        resolve;
                }
            );
        }
    )
)
.then(
    function() {

        setTimeout(
            function() {

                window.print();

            },
            300
        );
    }
);

<\/script>

</body>
</html>`
            );


            w.document.close();

        }
        catch (e) {

            console.error(
                "[PDF EXPORT]",
                e
            );

            alert(
                "PDF export error: "
                +
                e
            );
        }
    }


    async function exportExcel() {

        try {

            const rows =
                await loadRows();


            let body =
                "";


            rows.forEach(
                function (r) {

                    body +=
                        "<tr>"
                        +
                        "<td>"
                        +
                        esc(r.panelId)
                        +
                        "</td>"
                        +
                        "<td>"
                        +
                        esc(r.anomaly)
                        +
                        "</td>"
                        +
                        "<td>"
                        +
                        esc(r.severity)
                        +
                        "</td>"
                        +
                        "<td>"
                        +
                        num7(r.latitude)
                        +
                        "</td>"
                        +
                        "<td>"
                        +
                        num7(r.longitude)
                        +
                        "</td>"
                        +
                        "</tr>";
                }
            );


            const html =
`<html>
<head>
<meta charset="utf-8">
</head>

<body>

<table border="1">

<thead>
<tr>
<th>Panel ID</th>
<th>Anomaly</th>
<th>Severity</th>
<th>Latitude</th>
<th>Longitude</th>
</tr>
</thead>

<tbody>
${body}
</tbody>

</table>

</body>
</html>`;


            const blob =
                new Blob(
                    [
                        "\ufeff",
                        html
                    ],
                    {
                        type:
                            "application/vnd.ms-excel;charset=utf-8"
                    }
                );


            const url =
                URL.createObjectURL(
                    blob
                );


            const a =
                document.createElement(
                    "a"
                );


            a.href =
                url;

            a.download =
                "PV_Thermal_Validated_620.xls";


            document.body.appendChild(
                a
            );

            a.click();

            a.remove();


            setTimeout(
                function () {

                    URL.revokeObjectURL(
                        url
                    );

                },
                1500
            );

        }
        catch (e) {

            console.error(
                "[EXCEL EXPORT]",
                e
            );

            alert(
                "Excel export error: "
                +
                e
            );
        }
    }


    function makeButton(
        id,
        text
    ) {

        const button =
            document.createElement(
                "button"
            );


        button.id =
            id;

        button.type =
            "button";

        button.textContent =
            text;


        button.style.padding =
            "9px 16px";

        button.style.border =
            "1px solid #666";

        button.style.borderRadius =
            "6px";

        button.style.cursor =
            "pointer";

        button.style.fontWeight =
            "700";

        button.style.fontSize =
            "14px";


        return button;
    }


    function ensureToolbar() {

        const table =
            document.getElementById(
                "findingsTable"
            );


        if (!table) {
            return false;
        }


        /*
         * Remove broken/duplicate toolbar if present.
         */
        let toolbar =
            document.getElementById(
                "manual620ExportsForceToolbar"
            );


        if (!toolbar) {

            toolbar =
                document.createElement(
                    "div"
                );


            toolbar.id =
                "manual620ExportsForceToolbar";


            toolbar.style.display =
                "flex";

            toolbar.style.gap =
                "10px";

            toolbar.style.alignItems =
                "center";

            toolbar.style.margin =
                "0 0 14px 0";


            const pdf =
                makeButton(
                    "manual620ExportPdfForce",
                    "Export PDF"
                );


            const excel =
                makeButton(
                    "manual620ExportExcelForce",
                    "Export Excel"
                );


            pdf.onclick =
                exportPdf;


            excel.onclick =
                exportExcel;


            toolbar.appendChild(
                pdf
            );

            toolbar.appendChild(
                excel
            );


            table.parentNode.insertBefore(
                toolbar,
                table
            );
        }


        toolbar.style.display =
            "flex";


        return true;
    }


    /*
     * Initial creation.
     */
    setTimeout(
        ensureToolbar,
        100
    );

    setTimeout(
        ensureToolbar,
        500
    );

    setTimeout(
        ensureToolbar,
        1500
    );


    /*
     * Table navigation.
     */
    const tableButton =
        document.getElementById(
            "tableButton"
        );


    if (tableButton) {

        tableButton.addEventListener(
            "click",
            function () {

                setTimeout(
                    ensureToolbar,
                    20
                );

                setTimeout(
                    ensureToolbar,
                    200
                );
            }
        );
    }


    /*
     * Protection against Table rebuild.
     */
    const observer =
        new MutationObserver(
            function () {

                if (
                    document.getElementById(
                        "findingsTable"
                    )
                    &&
                    !document.getElementById(
                        "manual620ExportsForceToolbar"
                    )
                ) {

                    ensureToolbar();
                }
            }
        );


    observer.observe(
        document.body,
        {
            childList: true,
            subtree: true
        }
    );


    window.manual620EnsureExports =
        ensureToolbar;

})();





/* === MANUAL620_DIRECT_PDF_BUTTON_V1 === */

(function () {

    function bindDirectPdf() {

        const ids = [
            "manual620ExportPdfForce",
            "manual620ExportPdf"
        ];


        for (
            const id
            of ids
        ) {

            const button =
                document.getElementById(
                    id
                );


            if (!button) {
                continue;
            }


            button.onclick =
                function (event) {

                    event.preventDefault();

                    event.stopPropagation();


                    const link =
                        document.createElement(
                            "a"
                        );


                    link.href =
                        "/api/export/manual620.pdf"
                        +
                        "?t="
                        +
                        Date.now();


                    link.download =
                        "PV_Thermal_Validated_620.pdf";


                    document.body.appendChild(
                        link
                    );

                    link.click();

                    link.remove();
                };
        }
    }


    setTimeout(
        bindDirectPdf,
        300
    );

    setTimeout(
        bindDirectPdf,
        1200
    );


    const tableButton =
        document.getElementById(
            "tableButton"
        );


    if (tableButton) {

        tableButton.addEventListener(
            "click",
            function () {

                setTimeout(
                    bindDirectPdf,
                    100
                );
            }
        );
    }

})();





/* === MANUAL620_UI_CLEANUP_V4 === */

(function () {

    const DEFECT_URL =
        "/static/manual620_visual_defects.json";


    const COORD_URL =
        "/static/manual620_coordinates.json";


    const ANOMALY_ORDER = [
        "Hot-Spot-Multi",
        "Diode-Multi",
        "Diode",
        "Hot-Spot",
        "Bypassed-Substring",
        "String-Open-Circuit"
    ];


    let authoritativeCounts =
        null;


    /*
     * ======================================================
     * DATA
     * ======================================================
     */

    async function loadAuthoritativeData() {

        const response =
            await fetch(
                DEFECT_URL
                +
                "?t="
                +
                Date.now()
            );


        if (!response.ok) {

            throw new Error(
                "manual620_visual_defects HTTP "
                +
                response.status
            );
        }


        const data =
            await response.json();


        const panels =
            data.panels
            ||
            {};


        const anomalies =
            {};

        const severity = {
            Low: 0,
            Medium: 0,
            High: 0,
            Critical: 0
        };


        ANOMALY_ORDER.forEach(
            function (name) {

                anomalies[name] =
                    0;
            }
        );


        Object.values(
            panels
        )
        .forEach(function (item) {

            const anomaly =
                item.anomaly_type
                ||
                item.visual_defect_estimate
                ||
                "Hot-Spot";


            if (
                anomalies[
                    anomaly
                ]
                ===
                undefined
            ) {

                anomalies[
                    anomaly
                ] =
                    0;
            }


            anomalies[
                anomaly
            ]++;


            const sev =
                item.severity_estimate
                ||
                "Low";


            if (
                severity[
                    sev
                ]
                ===
                undefined
            ) {

                severity[
                    sev
                ] =
                    0;
            }


            severity[
                sev
            ]++;
        });


        const total =
            Object.keys(
                panels
            ).length;


        if (
            total
            !==
            620
        ) {

            throw new Error(
                "Expected 620 panels, got "
                +
                total
            );
        }


        authoritativeCounts = {
            total:
                total,

            anomalies:
                anomalies,

            severity:
                severity
        };


        /*
         * Critical:
         * legacy builders still use global stats.
         * Give those builders the correct source too.
         */
        try {

            if (
                typeof stats
                !==
                "undefined"
                &&
                stats
            ) {

                stats.anomalies =
                    Object.assign(
                        {},
                        anomalies
                    );


                stats.severity =
                    Object.assign(
                        {},
                        severity
                    );
            }

        }
        catch (_) {}


        return authoritativeCounts;
    }


    /*
     * ======================================================
     * LEGEND
     * ======================================================
     *
     * Do NOT rebuild the legend.
     * Preserve existing checkboxes/filter handlers.
     *
     * Only replace the stale numbers.
     * ======================================================
     */

    function enforceLegend() {

        if (
            !authoritativeCounts
        ) {
            return;
        }


        const findingCount =
            document.getElementById(
                "findingCount"
            );


        if (findingCount) {

            findingCount.textContent =
                "[620]";
        }


        const legend =
            document.getElementById(
                "anomalyLegend"
            );


        if (!legend) {
            return;
        }


        const rows =
            legend.querySelectorAll(
                ".legend-row"
            );


        rows.forEach(
            function (row) {

                const label =
                    row.querySelector(
                        ".legend-label"
                    );


                const count =
                    row.querySelector(
                        ".legend-count"
                    );


                if (
                    !label
                    ||
                    !count
                ) {
                    return;
                }


                const name =
                    String(
                        label.textContent
                        ||
                        ""
                    )
                    .trim();


                if (
                    Object.prototype
                        .hasOwnProperty
                        .call(
                            authoritativeCounts
                                .anomalies,
                            name
                        )
                ) {

                    const wanted =
                        String(
                            authoritativeCounts
                                .anomalies[
                                    name
                                ]
                        );


                    if (
                        count.textContent
                        !==
                        wanted
                    ) {

                        count.textContent =
                            wanted;
                    }
                }
            }
        );
    }


    let legendTimer =
        null;


    const legendObserver =
        new MutationObserver(
            function () {

                clearTimeout(
                    legendTimer
                );


                legendTimer =
                    setTimeout(
                        enforceLegend,
                        30
                    );
            }
        );


    function watchLegend() {

        const legend =
            document.getElementById(
                "anomalyLegend"
            );


        if (!legend) {
            return;
        }


        legendObserver.disconnect();


        legendObserver.observe(
            legend,
            {
                childList: true,
                subtree: true,
                characterData: true
            }
        );


        enforceLegend();
    }


    /*
     * ======================================================
     * EXPORT DATA
     * ======================================================
     */

    function escapeHtml(value) {

        return String(
            value
            ??
            ""
        )
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }


    function number7(value) {

        const number =
            Number(
                value
            );


        return Number.isFinite(
            number
        )
        ?
        number.toFixed(7)
        :
        "";
    }


    async function loadExportRows() {

        const result =
            await Promise.all([
                fetch(
                    DEFECT_URL
                    +
                    "?t="
                    +
                    Date.now()
                ),

                fetch(
                    COORD_URL
                    +
                    "?t="
                    +
                    Date.now()
                )
            ]);


        if (
            !result[0].ok
            ||
            !result[1].ok
        ) {

            throw new Error(
                "Nu pot incarca datele pentru export."
            );
        }


        const defects =
            await result[0].json();


        const coordinates =
            await result[1].json();


        const panels =
            defects.panels
            ||
            {};


        const ids =
            Object.keys(
                panels
            );


        ids.sort(
            function (a, b) {

                return a.localeCompare(
                    b,
                    undefined,
                    {
                        numeric: true
                    }
                );
            }
        );


        return ids.map(
            function (panelId) {

                const defect =
                    panels[
                        panelId
                    ]
                    ||
                    {};


                const coord =
                    coordinates[
                        panelId
                    ]
                    ||
                    {};


                return {
                    panelId:
                        panelId,

                    anomaly:
                        defect.anomaly_type
                        ||
                        defect.visual_defect_estimate
                        ||
                        "",

                    severity:
                        defect.severity_estimate
                        ||
                        "",

                    latitude:
                        coord.latitude,

                    longitude:
                        coord.longitude
                };
            }
        );
    }


    /*
     * ======================================================
     * DIRECT PDF
     * ======================================================
     */

    async function directPdfDownload() {

        const button =
            document.getElementById(
                "manual620ExportPdfForce"
            );


        const oldText =
            button
            ?
            button.textContent
            :
            "";


        try {

            if (button) {

                button.disabled =
                    true;

                button.textContent =
                    "Generating PDF...";
            }


            const response =
                await fetch(
                    "/api/export/manual620.pdf?t="
                    +
                    Date.now(),
                    {
                        cache: "no-store"
                    }
                );


            if (!response.ok) {

                let message =
                    "";


                try {

                    message =
                        await response.text();

                }
                catch (_) {}


                throw new Error(
                    "PDF HTTP "
                    +
                    response.status
                    +
                    (
                        message
                        ?
                        " - "
                        +
                        message.slice(
                            0,
                            250
                        )
                        :
                        ""
                    )
                );
            }


            const blob =
                await response.blob();


            if (
                blob.size
                <
                1000
            ) {

                throw new Error(
                    "PDF generat este prea mic: "
                    +
                    blob.size
                    +
                    " bytes"
                );
            }


            const url =
                URL.createObjectURL(
                    blob
                );


            const link =
                document.createElement(
                    "a"
                );


            link.href =
                url;


            link.download =
                "PV_Thermal_Validated_620.pdf";


            document.body.appendChild(
                link
            );


            link.click();


            link.remove();


            setTimeout(
                function () {

                    URL.revokeObjectURL(
                        url
                    );

                },
                3000
            );

        }
        catch (error) {

            console.error(
                "[MANUAL620 PDF]",
                error
            );


            alert(
                "PDF export error:\n"
                +
                String(
                    error.message
                    ||
                    error
                )
            );
        }
        finally {

            if (button) {

                button.disabled =
                    false;

                button.textContent =
                    oldText
                    ||
                    "Export PDF";
            }
        }
    }


    /*
     * ======================================================
     * EXCEL
     * ======================================================
     */

    async function exportExcel() {

        try {

            const rows =
                await loadExportRows();


            let body =
                "";


            rows.forEach(
                function (row) {

                    body +=
                        "<tr>"
                        +
                        "<td>"
                        +
                        escapeHtml(
                            row.panelId
                        )
                        +
                        "</td>"
                        +
                        "<td>"
                        +
                        escapeHtml(
                            row.anomaly
                        )
                        +
                        "</td>"
                        +
                        "<td>"
                        +
                        escapeHtml(
                            row.severity
                        )
                        +
                        "</td>"
                        +
                        "<td>"
                        +
                        number7(
                            row.latitude
                        )
                        +
                        "</td>"
                        +
                        "<td>"
                        +
                        number7(
                            row.longitude
                        )
                        +
                        "</td>"
                        +
                        "</tr>";
                }
            );


            const workbook =
`<!doctype html>
<html>
<head>
<meta charset="utf-8">
</head>
<body>

<table border="1">
<thead>
<tr>
<th>Panel ID</th>
<th>Anomaly</th>
<th>Severity</th>
<th>Latitude</th>
<th>Longitude</th>
</tr>
</thead>

<tbody>
${body}
</tbody>
</table>

</body>
</html>`;


            const blob =
                new Blob(
                    [
                        "\ufeff",
                        workbook
                    ],
                    {
                        type:
                            "application/vnd.ms-excel;charset=utf-8"
                    }
                );


            const url =
                URL.createObjectURL(
                    blob
                );


            const link =
                document.createElement(
                    "a"
                );


            link.href =
                url;


            link.download =
                "PV_Thermal_Validated_620.xls";


            document.body.appendChild(
                link
            );


            link.click();


            link.remove();


            setTimeout(
                function () {

                    URL.revokeObjectURL(
                        url
                    );

                },
                2000
            );

        }
        catch (error) {

            console.error(
                "[MANUAL620 EXCEL]",
                error
            );


            alert(
                "Excel export error:\n"
                +
                String(
                    error.message
                    ||
                    error
                )
            );
        }
    }


    /*
     * ======================================================
     * ONE TOOLBAR ONLY
     * ======================================================
     */

    function createButton(
        id,
        label
    ) {

        const button =
            document.createElement(
                "button"
            );


        button.id =
            id;


        button.type =
            "button";


        button.textContent =
            label;


        button.style.padding =
            "9px 16px";


        button.style.border =
            "1px solid #666";


        button.style.borderRadius =
            "6px";


        button.style.cursor =
            "pointer";


        button.style.fontWeight =
            "700";


        button.style.fontSize =
            "14px";


        return button;
    }


    function ensureSingleToolbar() {

        const table =
            document.getElementById(
                "findingsTable"
            );


        if (!table) {
            return;
        }


        /*
         * Remove every obsolete export UI.
         */
        [
            "manual620TableExportToolbar",
            "manual620ExportPdf",
            "manual620ExportExcel"
        ]
        .forEach(
            function (id) {

                const element =
                    document.getElementById(
                        id
                    );


                if (element) {

                    /*
                     * Never remove the table itself;
                     * these IDs belong only to old export UI.
                     */
                    element.remove();
                }
            }
        );


        let toolbar =
            document.getElementById(
                "manual620ExportsForceToolbar"
            );


        if (!toolbar) {

            toolbar =
                document.createElement(
                    "div"
                );


            toolbar.id =
                "manual620ExportsForceToolbar";


            table.parentNode.insertBefore(
                toolbar,
                table
            );
        }


        /*
         * Make THIS toolbar authoritative.
         * Clearing it eliminates duplicate buttons.
         */
        toolbar.innerHTML =
            "";


        toolbar.style.display =
            "flex";


        toolbar.style.gap =
            "10px";


        toolbar.style.alignItems =
            "center";


        toolbar.style.margin =
            "0 0 14px 0";


        const pdf =
            createButton(
                "manual620ExportPdfForce",
                "Export PDF"
            );


        const excel =
            createButton(
                "manual620ExportExcelForce",
                "Export Excel"
            );


        /*
         * Replace previous onclick owners.
         */
        pdf.onclick =
            directPdfDownload;


        excel.onclick =
            exportExcel;


        toolbar.appendChild(
            pdf
        );


        toolbar.appendChild(
            excel
        );
    }


    /*
     * ======================================================
     * START
     * ======================================================
     */

    async function initializeFinalUi() {

        try {

            await loadAuthoritativeData();


            /*
             * Give old builders correct global stats.
             */
            try {

                if (
                    typeof buildCharts
                    ===
                    "function"
                ) {

                    buildCharts();
                }

            }
            catch (_) {}


            enforceLegend();

            watchLegend();

            ensureSingleToolbar();


            /*
             * Legacy delayed renderers may still execute.
             * Reassert without adding duplicate UI.
             */
            setTimeout(
                enforceLegend,
                250
            );


            setTimeout(
                enforceLegend,
                1000
            );


            setTimeout(
                enforceLegend,
                3000
            );


            setTimeout(
                ensureSingleToolbar,
                500
            );


            setTimeout(
                ensureSingleToolbar,
                1600
            );


            console.log(
                "[MANUAL620 FINAL UI]",
                authoritativeCounts
            );

        }
        catch (error) {

            console.error(
                "[MANUAL620 FINAL UI]",
                error
            );
        }
    }


    const mapButton =
        document.getElementById(
            "mapButton"
        );


    if (mapButton) {

        mapButton.addEventListener(
            "click",
            function () {

                setTimeout(
                    enforceLegend,
                    50
                );


                setTimeout(
                    watchLegend,
                    100
                );
            }
        );
    }


    const tableButton =
        document.getElementById(
            "tableButton"
        );


    if (tableButton) {

        tableButton.addEventListener(
            "click",
            function () {

                setTimeout(
                    ensureSingleToolbar,
                    50
                );
            }
        );
    }


    initializeFinalUi();


    window.manual620FinalEnforceLegend =
        enforceLegend;


    window.manual620FinalToolbar =
        ensureSingleToolbar;

})();





/* === MANUAL620_PDF_STATIC_FINAL_V1 === */

(function () {

    const PDF_URL =
        "/static/exports/PV_Thermal_Validated_620.pdf";


    function installFinalPdfButton() {

        /*
         * The currently authoritative toolbar.
         */
        const toolbar =
            document.getElementById(
                "manual620ExportsForceToolbar"
            );


        if (!toolbar) {
            return false;
        }


        /*
         * Find whichever PDF button survived previous patches.
         */
        let oldButton =
            document.getElementById(
                "manual620ExportPdfForce"
            );


        if (!oldButton) {

            oldButton =
                Array.from(
                    toolbar.querySelectorAll(
                        "button"
                    )
                )
                .find(
                    function (button) {

                        return String(
                            button.textContent
                            ||
                            ""
                        )
                        .trim()
                        .toLowerCase()
                        ===
                        "export pdf";
                    }
                );
        }


        if (!oldButton) {
            return false;
        }


        /*
         * cloneNode removes ALL old:
         * - onclick
         * - addEventListener handlers
         * - backend fetch handlers
         * - print handlers
         */
        const button =
            oldButton.cloneNode(
                true
            );


        button.id =
            "manual620ExportPdfForce";


        button.textContent =
            "Export PDF";


        button.disabled =
            false;


        oldButton.replaceWith(
            button
        );


        /*
         * One single final action:
         * direct browser download of static PDF.
         */
        button.onclick =
            function (event) {

                event.preventDefault();

                event.stopImmediatePropagation();


                const link =
                    document.createElement(
                        "a"
                    );


                link.href =
                    PDF_URL
                    +
                    "?t="
                    +
                    Date.now();


                link.download =
                    "PV_Thermal_Validated_620.pdf";


                document.body.appendChild(
                    link
                );


                link.click();


                link.remove();
            };


        button.dataset.pdfStaticFinal =
            "1";


        return true;
    }


    /*
     * Install after all previous startup patches.
     */
    setTimeout(
        installFinalPdfButton,
        500
    );


    setTimeout(
        installFinalPdfButton,
        1800
    );


    setTimeout(
        installFinalPdfButton,
        3500
    );


    /*
     * Every time Table is opened, replace any button
     * recreated by legacy code.
     */
    const tableButton =
        document.getElementById(
            "tableButton"
        );


    if (tableButton) {

        tableButton.addEventListener(
            "click",
            function () {

                setTimeout(
                    installFinalPdfButton,
                    100
                );


                setTimeout(
                    installFinalPdfButton,
                    500
                );
            }
        );
    }


    /*
     * Last protection:
     * if an old patch rebuilds the toolbar later,
     * clean the PDF button again.
     */
    let timer =
        null;


    const observer =
        new MutationObserver(
            function () {

                clearTimeout(
                    timer
                );


                timer =
                    setTimeout(
                        function () {

                            const button =
                                document.getElementById(
                                    "manual620ExportPdfForce"
                                );


                            if (
                                button
                                &&
                                button.dataset
                                    .pdfStaticFinal
                                !==
                                "1"
                            ) {

                                installFinalPdfButton();
                            }

                        },
                        100
                    );
            }
        );


    observer.observe(
        document.body,
        {
            childList: true,
            subtree: true
        }
    );


    window.manual620InstallFinalPdfButton =
        installFinalPdfButton;

})();





/* === MANUAL620_PDF_OPEN_FINAL_V2 === */

(function () {

    const PDF_URL =
        "/static/exports/PV_Thermal_Validated_620.pdf";


    function bindFinalPdf() {

        const oldButton =
            document.getElementById(
                "manual620ExportPdfForce"
            );


        if (!oldButton) {
            return false;
        }


        /*
         * Replace the node itself.
         * This removes all previous PDF handlers.
         */
        const button =
            oldButton.cloneNode(
                true
            );


        button.id =
            "manual620ExportPdfForce";

        button.textContent =
            "Export PDF";

        button.disabled =
            false;

        button.dataset.pdfOpenFinal =
            "1";


        oldButton.replaceWith(
            button
        );


        button.addEventListener(
            "click",
            function (event) {

                event.preventDefault();

                event.stopPropagation();

                event.stopImmediatePropagation();


                /*
                 * Do NOT use:
                 * - fetch
                 * - Blob
                 * - download attribute
                 * - backend PDF generator
                 *
                 * Open the already generated PDF directly.
                 */
                window.open(
                    PDF_URL
                    +
                    "?v=620",
                    "_blank",
                    "noopener"
                );

            },
            true
        );


        return true;
    }


    function ensure() {

        const button =
            document.getElementById(
                "manual620ExportPdfForce"
            );


        if (
            button
            &&
            button.dataset.pdfOpenFinal
            ===
            "1"
        ) {
            return;
        }


        bindFinalPdf();
    }


    setTimeout(
        ensure,
        500
    );

    setTimeout(
        ensure,
        1800
    );

    setTimeout(
        ensure,
        3500
    );


    const tableButton =
        document.getElementById(
            "tableButton"
        );


    if (tableButton) {

        tableButton.addEventListener(
            "click",
            function () {

                setTimeout(
                    ensure,
                    150
                );

                setTimeout(
                    ensure,
                    700
                );
            }
        );
    }


    let timer = null;


    const observer =
        new MutationObserver(
            function () {

                clearTimeout(
                    timer
                );


                timer =
                    setTimeout(
                        ensure,
                        100
                    );
            }
        );


    observer.observe(
        document.body,
        {
            childList: true,
            subtree: true
        }
    );


    window.manual620BindFinalPdf =
        bindFinalPdf;

})();





/* === MANUAL620_ANOMALY_SEVERITY_FILTER_V1 === */

(function () {

    const DATA_URL =
        "/static/manual620_visual_defects.json";


    const ANOMALIES = [
        "Hot-Spot-Multi",
        "Diode-Multi",
        "Diode",
        "Hot-Spot",
        "Bypassed-Substring",
        "String-Open-Circuit"
    ];


    const SEVERITIES = [
        "Low",
        "Medium",
        "High",
        "Critical"
    ];


    const enabledAnomalies =
        new Set(
            ANOMALIES
        );


    const enabledSeverities =
        new Set(
            SEVERITIES
        );


    let registry =
        {};


    let originalFindingStyle =
        null;


    /*
     * ======================================================
     * LOAD V3 REGISTRY
     * ======================================================
     */

    async function loadRegistry() {

        const response =
            await fetch(
                DATA_URL
                +
                "?t="
                +
                Date.now()
            );


        if (!response.ok) {

            throw new Error(
                "manual620_visual_defects HTTP "
                +
                response.status
            );
        }


        const data =
            await response.json();


        registry =
            data.panels
            ||
            {};


        if (
            Object.keys(
                registry
            ).length
            !==
            620
        ) {

            throw new Error(
                "Expected 620 V3 panels."
            );
        }
    }


    /*
     * ======================================================
     * ASSOCIATE EACH MAP PANEL WITH V3 DATA
     * ======================================================
     */

    function attachV3Properties() {

        if (
            typeof findingsLayer
            ===
            "undefined"
            ||
            !findingsLayer
        ) {
            return false;
        }


        const source =
            findingsLayer.getSource
            ?
            findingsLayer.getSource()
            :
            null;


        if (!source) {
            return false;
        }


        const features =
            source.getFeatures();


        features.forEach(
            function (feature) {

                const panelId =
                    String(
                        feature.get(
                            "panel_id"
                        )
                        ||
                        feature.get(
                            "PANEL_ID"
                        )
                        ||
                        ""
                    );


                const item =
                    registry[
                        panelId
                    ];


                if (!item) {

                    feature.set(
                        "manual620_v3",
                        false,
                        true
                    );

                    return;
                }


                const anomaly =
                    item.anomaly_type
                    ||
                    item.visual_defect_estimate
                    ||
                    "Hot-Spot";


                const severity =
                    item.severity_estimate
                    ||
                    "Low";


                /*
                 * Override stale properties with
                 * authoritative V3 values.
                 */
                feature.set(
                    "anomaly_type",
                    anomaly,
                    true
                );


                feature.set(
                    "severity",
                    severity,
                    true
                );


                feature.set(
                    "manual620_v3",
                    true,
                    true
                );
            }
        );


        return true;
    }


    /*
     * ======================================================
     * MAP FILTER
     * ======================================================
     */

    function featureEnabled(
        feature
    ) {

        if (
            !feature.get(
                "manual620_v3"
            )
        ) {
            return true;
        }


        const anomaly =
            String(
                feature.get(
                    "anomaly_type"
                )
                ||
                ""
            );


        const severity =
            String(
                feature.get(
                    "severity"
                )
                ||
                ""
            );


        return (
            enabledAnomalies.has(
                anomaly
            )
            &&
            enabledSeverities.has(
                severity
            )
        );
    }


    function installLayerFilter() {

        if (
            typeof findingsLayer
            ===
            "undefined"
            ||
            !findingsLayer
        ) {
            return false;
        }


        if (
            findingsLayer.get(
                "manual620FilterInstalled"
            )
        ) {

            findingsLayer.changed();

            return true;
        }


        originalFindingStyle =
            findingsLayer.getStyle();


        findingsLayer.setStyle(
            function (
                feature,
                resolution
            ) {

                if (
                    !featureEnabled(
                        feature
                    )
                ) {

                    return null;
                }


                if (
                    typeof originalFindingStyle
                    ===
                    "function"
                ) {

                    return originalFindingStyle(
                        feature,
                        resolution
                    );
                }


                return originalFindingStyle;
            }
        );


        findingsLayer.set(
            "manual620FilterInstalled",
            true
        );


        findingsLayer.changed();


        return true;
    }


    function refreshMap() {

        attachV3Properties();

        installLayerFilter();


        if (
            typeof findingsLayer
            !==
            "undefined"
            &&
            findingsLayer
        ) {

            findingsLayer.changed();
        }
    }


    /*
     * ======================================================
     * CHECKBOX HELPERS
     * ======================================================
     */

    function setToggle(
        set,
        value,
        enabled
    ) {

        if (enabled) {

            set.add(
                value
            );

        }
        else {

            set.delete(
                value
            );
        }


        refreshMap();
    }


    /*
     * ======================================================
     * AUTHORITATIVE ANOMALY LEGEND
     * ======================================================
     */

    function bindAnomalyCheckboxes() {

        const legend =
            document.getElementById(
                "anomalyLegend"
            );


        if (!legend) {
            return;
        }


        const rows =
            legend.querySelectorAll(
                ".legend-row"
            );


        rows.forEach(
            function (row) {

                const label =
                    row.querySelector(
                        ".legend-label"
                    );


                const checkbox =
                    row.querySelector(
                        'input[type="checkbox"]'
                    );


                if (
                    !label
                    ||
                    !checkbox
                ) {
                    return;
                }


                const anomaly =
                    String(
                        label.textContent
                        ||
                        ""
                    ).trim();


                if (
                    !ANOMALIES.includes(
                        anomaly
                    )
                ) {
                    return;
                }


                /*
                 * Re-enable checkbox if an earlier patch
                 * made it disabled.
                 */
                checkbox.disabled =
                    false;


                checkbox.checked =
                    enabledAnomalies.has(
                        anomaly
                    );


                /*
                 * Remove only our own previous listener
                 * by replacing checkbox node.
                 */
                if (
                    checkbox.dataset
                        .manual620Filter
                    ===
                    "1"
                ) {
                    return;
                }


                checkbox.dataset
                    .manual620Filter =
                        "1";


                checkbox.addEventListener(
                    "change",
                    function () {

                        setToggle(
                            enabledAnomalies,
                            anomaly,
                            checkbox.checked
                        );
                    }
                );
            }
        );
    }


    /*
     * ======================================================
     * SEVERITY FILTER UI
     * ======================================================
     */

    function createSeverityUi() {

        const legend =
            document.getElementById(
                "anomalyLegend"
            );


        if (!legend) {
            return;
        }


        let container =
            document.getElementById(
                "manual620SeverityFilter"
            );


        if (!container) {

            container =
                document.createElement(
                    "div"
                );


            container.id =
                "manual620SeverityFilter";


            container.style.marginTop =
                "18px";


            container.style.paddingTop =
                "12px";


            container.style.borderTop =
                "1px solid rgba(120,120,120,.25)";


            const title =
                document.createElement(
                    "div"
                );


            title.textContent =
                "Severity";


            title.style.fontWeight =
                "700";


            title.style.marginBottom =
                "9px";


            container.appendChild(
                title
            );


            SEVERITIES.forEach(
                function (severity) {

                    const row =
                        document.createElement(
                            "label"
                        );


                    row.style.display =
                        "flex";


                    row.style.alignItems =
                        "center";


                    row.style.gap =
                        "9px";


                    row.style.margin =
                        "8px 0";


                    row.style.cursor =
                        "pointer";


                    const checkbox =
                        document.createElement(
                            "input"
                        );


                    checkbox.type =
                        "checkbox";


                    checkbox.checked =
                        true;


                    checkbox.dataset
                        .severity =
                            severity;


                    const text =
                        document.createElement(
                            "span"
                        );


                    text.textContent =
                        severity;


                    /*
                     * Show current V3 population beside it.
                     */
                    const count =
                        document.createElement(
                            "span"
                        );


                    count.style.marginLeft =
                        "auto";


                    count.style.opacity =
                        ".7";


                    let value =
                        0;


                    Object.values(
                        registry
                    )
                    .forEach(
                        function (item) {

                            if (
                                (
                                    item.severity_estimate
                                    ||
                                    "Low"
                                )
                                ===
                                severity
                            ) {

                                value++;
                            }
                        }
                    );


                    count.textContent =
                        String(
                            value
                        );


                    checkbox.addEventListener(
                        "change",
                        function () {

                            setToggle(
                                enabledSeverities,
                                severity,
                                checkbox.checked
                            );
                        }
                    );


                    row.appendChild(
                        checkbox
                    );


                    row.appendChild(
                        text
                    );


                    row.appendChild(
                        count
                    );


                    container.appendChild(
                        row
                    );
                }
            );


            /*
             * Put severity directly below anomaly legend.
             */
            legend.insertAdjacentElement(
                "afterend",
                container
            );
        }
    }


    /*
     * ======================================================
     * MASTER TOGGLES
     * ======================================================
     */

    function setAllAnomalies(
        enabled
    ) {

        enabledAnomalies.clear();


        if (enabled) {

            ANOMALIES.forEach(
                function (item) {

                    enabledAnomalies.add(
                        item
                    );
                }
            );
        }


        const legend =
            document.getElementById(
                "anomalyLegend"
            );


        if (legend) {

            legend
                .querySelectorAll(
                    'input[type="checkbox"]'
                )
                .forEach(
                    function (checkbox) {

                        checkbox.checked =
                            enabled;
                    }
                );
        }


        refreshMap();
    }


    function setAllSeverities(
        enabled
    ) {

        enabledSeverities.clear();


        if (enabled) {

            SEVERITIES.forEach(
                function (item) {

                    enabledSeverities.add(
                        item
                    );
                }
            );
        }


        const container =
            document.getElementById(
                "manual620SeverityFilter"
            );


        if (container) {

            container
                .querySelectorAll(
                    'input[type="checkbox"]'
                )
                .forEach(
                    function (checkbox) {

                        checkbox.checked =
                            enabled;
                    }
                );
        }


        refreshMap();
    }


    /*
     * ======================================================
     * INITIALIZE
     * ======================================================
     */

    async function initialize() {

        try {

            await loadRegistry();


            let tries =
                0;


            const timer =
                setInterval(
                    function () {

                        tries++;


                        const attached =
                            attachV3Properties();


                        const filtered =
                            installLayerFilter();


                        bindAnomalyCheckboxes();

                        createSeverityUi();


                        if (
                            attached
                            &&
                            filtered
                        ) {

                            clearInterval(
                                timer
                            );


                            console.log(
                                "[MANUAL620 FILTER] READY"
                            );
                        }


                        if (
                            tries
                            >
                            100
                        ) {

                            clearInterval(
                                timer
                            );
                        }

                    },
                    100
                );


            /*
             * Legend may still be rebuilt by older code.
             * Rebind controls without rebuilding it.
             */
            const legend =
                document.getElementById(
                    "anomalyLegend"
                );


            if (legend) {

                let bindTimer =
                    null;


                const observer =
                    new MutationObserver(
                        function () {

                            clearTimeout(
                                bindTimer
                            );


                            bindTimer =
                                setTimeout(
                                    function () {

                                        bindAnomalyCheckboxes();

                                        refreshMap();

                                    },
                                    50
                                );
                        }
                    );


                observer.observe(
                    legend,
                    {
                        childList: true,
                        subtree: true
                    }
                );
            }


        }
        catch (error) {

            console.error(
                "[MANUAL620 FILTER]",
                error
            );
        }
    }


    initialize();


    /*
     * Convenient console controls if ever needed.
     */
    window.manual620EnableAllAnomalies =
        function () {

            setAllAnomalies(
                true
            );
        };


    window.manual620DisableAllAnomalies =
        function () {

            setAllAnomalies(
                false
            );
        };


    window.manual620EnableAllSeverities =
        function () {

            setAllSeverities(
                true
            );
        };


    window.manual620DisableAllSeverities =
        function () {

            setAllSeverities(
                false
            );
        };


    window.manual620ActiveAnomalies =
        enabledAnomalies;


    window.manual620ActiveSeverities =
        enabledSeverities;

})();





/* === MANUAL620_SIDEBAR_ANOMALY_ONLY_V1 === */

(function () {

    const ANOMALIES = [
        ["Hot-Spot-Multi", 110],
        ["Diode-Multi", 46],
        ["Diode", 15],
        ["Hot-Spot", 449],
        ["Bypassed-Substring", 0],
        ["String-Open-Circuit", 0]
    ];


    function makeRow(name, value) {

        const row =
            document.createElement("div");

        row.style.display =
            "flex";

        row.style.alignItems =
            "center";

        row.style.justifyContent =
            "space-between";

        row.style.gap =
            "12px";

        row.style.padding =
            "6px 0";


        const label =
            document.createElement("span");

        label.textContent =
            name;


        const count =
            document.createElement("span");

        count.textContent =
            String(value);

        count.style.minWidth =
            "32px";

        count.style.textAlign =
            "right";

        count.style.opacity =
            ".75";


        row.appendChild(label);
        row.appendChild(count);

        return row;
    }


    function rebuildSidebar() {

        const legend =
            document.getElementById(
                "anomalyLegend"
            );


        if (!legend) {
            return;
        }


        /*
         * Remove old checkboxes, colors and rows.
         */
        legend.innerHTML =
            "";


        ANOMALIES.forEach(
            function (item) {

                legend.appendChild(
                    makeRow(
                        item[0],
                        item[1]
                    )
                );
            }
        );


        /*
         * Remove Severity UI from previous patch.
         */
        [
            "manual620SeverityFilter",
            "manual620SeveritySummary"
        ]
        .forEach(
            function (id) {

                const element =
                    document.getElementById(id);

                if (element) {
                    element.remove();
                }
            }
        );


        const findingCount =
            document.getElementById(
                "findingCount"
            );


        if (findingCount) {

            findingCount.textContent =
                "[620]";
        }
    }


    /*
     * Run after older sidebar builders.
     */
    setTimeout(
        rebuildSidebar,
        300
    );

    setTimeout(
        rebuildSidebar,
        1200
    );

    setTimeout(
        rebuildSidebar,
        3000
    );


    const mapButton =
        document.getElementById(
            "mapButton"
        );


    if (mapButton) {

        mapButton.addEventListener(
            "click",
            function () {

                setTimeout(
                    rebuildSidebar,
                    100
                );

                setTimeout(
                    rebuildSidebar,
                    500
                );
            }
        );
    }


    window.manual620RebuildAnomalySidebar =
        rebuildSidebar;

})();




/* === MANUAL620_SIDEBAR_AUTHORITATIVE_FINAL_V2 === */
(() => {
    "use strict";

    const FINAL_ROWS = [
        ["Hot-Spot-Multi", 110],
        ["Diode-Multi", 46],
        ["Diode", 15],
        ["Hot-Spot", 449],
        ["Bypassed-Substring", 0],
        ["String-Open-Circuit", 0]
    ];

    let sidebarFixing = false;

    function buildManual620Sidebar() {
        const legend = document.getElementById("anomalyLegend");
        if (!legend || sidebarFixing) return;

        sidebarFixing = true;

        const html = FINAL_ROWS.map(([name, value]) =>
            '<div class="manual620-final-row">' +
                '<span>' + name + '</span>' +
                '<span>' + value + '</span>' +
            '</div>'
        ).join("");

        if (legend.innerHTML !== html) {
            legend.innerHTML = html;
        }

        legend.classList.add("manual620-ready");

        const count = document.getElementById("findingCount");
        if (count) {
            count.textContent = "[620]";
        }

        document.getElementById("manual620SeverityFilter")?.remove();
        document.getElementById("manual620SeveritySummary")?.remove();

        sidebarFixing = false;
    }

    function installManual620SidebarGuard() {
        const legend = document.getElementById("anomalyLegend");
        if (!legend) return;

        if (legend.dataset.manual620FinalGuard === "1") {
            buildManual620Sidebar();
            return;
        }

        legend.dataset.manual620FinalGuard = "1";

        const observer = new MutationObserver(() => {
            if (sidebarFixing) return;

            const oldContent =
                legend.querySelector("input") ||
                legend.querySelector("label") ||
                legend.querySelector(".legend-color") ||
                legend.querySelector(".legend-swatch");

            const finalRows =
                legend.querySelectorAll(".manual620-final-row");

            if (oldContent || finalRows.length !== 6) {
                buildManual620Sidebar();
            }
        });

        observer.observe(legend, {
            childList: true,
            subtree: true
        });

        buildManual620Sidebar();
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            installManual620SidebarGuard,
            { once: true }
        );
    } else {
        installManual620SidebarGuard();
    }

    window.manual620RebuildAnomalySidebar =
        buildManual620Sidebar;
})();


/* === MANUAL620_UI_FINAL_CLEAN_V3 === */
(() => {
    "use strict";

    const FINAL_ROWS = [
        ["Hot-Spot-Multi", 110],
        ["Diode-Multi", 46],
        ["Diode", 15],
        ["Hot-Spot", 449],
        ["Bypassed-Substring", 0],
        ["String-Open-Circuit", 0]
    ];

    let fixing = false;

    function cleanSeverity() {
        /*
         * Remove known severity containers first.
         */
        [
            "manual620SeverityFilter",
            "manual620SeveritySummary",
            "severityFilter",
            "severityLegend",
            "severityFilters"
        ].forEach(id => {
            document.getElementById(id)?.remove();
        });

        /*
         * Legacy versions may not have IDs.
         * Find the visible "Severity" heading in the right sidebar
         * and remove its containing section.
         */
        const sidebar =
            document.querySelector(".sidebar") ||
            document.querySelector("#sidebar") ||
            document.querySelector(".layers-panel") ||
            document.body;

        const nodes = sidebar.querySelectorAll(
            "h2, h3, h4, h5, strong, .section-title, .legend-title"
        );

        for (const node of nodes) {
            if (node.textContent.trim().toLowerCase() !== "severity") {
                continue;
            }

            let section = node.parentElement;

            /*
             * Prefer a reasonably small parent containing the
             * Severity controls rather than removing the sidebar.
             */
            while (
                section &&
                section !== sidebar &&
                section.parentElement !== sidebar &&
                section.children.length <= 2
            ) {
                section = section.parentElement;
            }

            if (
                section &&
                section !== sidebar &&
                !section.contains(
                    document.getElementById("anomalyLegend")
                )
            ) {
                section.remove();
            } else {
                node.remove();
            }
        }
    }

    function renderAnomalies() {
        const legend = document.getElementById("anomalyLegend");
        if (!legend || fixing) return;

        fixing = true;

        legend.innerHTML = FINAL_ROWS.map(([name, count]) =>
            '<div class="manual620-final-row">' +
                '<span>' + name + '</span>' +
                '<span>' + count + '</span>' +
            '</div>'
        ).join("");

        legend.classList.add("manual620-ready");

        const findingCount =
            document.getElementById("findingCount");

        if (findingCount) {
            findingCount.textContent = "[620]";
        }

        cleanSeverity();

        fixing = false;
    }

    function installGuard() {
        renderAnomalies();

        const sidebar =
            document.querySelector(".sidebar") ||
            document.querySelector("#sidebar") ||
            document.querySelector(".layers-panel");

        if (!sidebar || sidebar.dataset.manual620FinalGuardV3 === "1") {
            return;
        }

        sidebar.dataset.manual620FinalGuardV3 = "1";

        const observer = new MutationObserver(() => {
            if (fixing) return;

            const legend =
                document.getElementById("anomalyLegend");

            if (legend) {
                const rows =
                    legend.querySelectorAll(".manual620-final-row");

                if (
                    rows.length !== 6 ||
                    legend.querySelector("input") ||
                    legend.querySelector("label")
                ) {
                    renderAnomalies();
                    return;
                }
            }

            cleanSeverity();
        });

        observer.observe(sidebar, {
            childList: true,
            subtree: true
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            installGuard,
            { once: true }
        );
    } else {
        installGuard();
    }
})();


/* === PV_RECENTER_SAFE_V2 === */
(() => {
    "use strict";

    let homeCenter = null;
    let homeZoom = null;

    function getMap() {
        try {
            if (
                window.map &&
                typeof window.map.getView === "function"
            ) {
                return window.map;
            }
        } catch (_) {}

        try {
            if (
                typeof map !== "undefined" &&
                map &&
                typeof map.getView === "function"
            ) {
                return map;
            }
        } catch (_) {}

        return null;
    }

    function findOrthomosaicTitle() {
        const candidates = document.querySelectorAll(
            "h2, h3, h4, .section-title, .layer-title, strong"
        );

        for (const el of candidates) {
            if (
                el.textContent.trim().toLowerCase() ===
                "orthomosaic"
            ) {
                return el;
            }
        }

        return null;
    }

    function install() {
        const pvMap = getMap();

        if (!pvMap) {
            setTimeout(install, 250);
            return;
        }

        const view = pvMap.getView();

        if (!homeCenter) {
            const c = view.getCenter();

            if (c) {
                homeCenter = c.slice();
            }

            homeZoom = view.getZoom();
        }

        if (document.getElementById("pvRecenterSafe")) {
            return;
        }

        const title = findOrthomosaicTitle();

        if (!title) {
            setTimeout(install, 250);
            return;
        }

        title.classList.add("pv-ortho-title-with-recenter");

        const button = document.createElement("button");

        button.id = "pvRecenterSafe";
        button.type = "button";
        button.textContent = "Recenter";
        button.title = "Recenter orthomosaic";

        button.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (!homeCenter) return;

            view.animate({
                center: homeCenter.slice(),
                zoom: homeZoom,
                duration: 400
            });
        });

        title.appendChild(button);
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            () => setTimeout(install, 250),
            { once: true }
        );
    } else {
        setTimeout(install, 250);
    }
})();

/* === PV_INFINITE_PAN_SAFE_V1 === */
(() => {
    "use strict";

    function getPvMap() {
        try {
            if (
                window.map &&
                typeof window.map.getView === "function"
            ) {
                return window.map;
            }
        } catch (_) {}

        try {
            if (
                typeof map !== "undefined" &&
                map &&
                typeof map.getView === "function"
            ) {
                return map;
            }
        } catch (_) {}

        return null;
    }

    function unlockPan() {
        const pvMap = getPvMap();

        if (!pvMap) {
            setTimeout(unlockPan, 250);
            return;
        }

        const view = pvMap.getView();

        if (!view) {
            setTimeout(unlockPan, 250);
            return;
        }

        /*
         * OpenLayers normally constrains the center through
         * view.constraints_.center.
         *
         * Replace ONLY the center constraint with pass-through.
         *
         * Important:
         * - projection extent is NOT changed
         * - raster extent is NOT changed
         * - IR/RGB layers are NOT changed
         * - zoom constraints remain untouched
         */
        if (
            view.constraints_ &&
            typeof view.constraints_.center === "function"
        ) {
            if (!view.__pvOriginalCenterConstraint) {
                view.__pvOriginalCenterConstraint =
                    view.constraints_.center;
            }

            view.constraints_.center = function(center) {
                return center;
            };

            view.__pvInfinitePan = true;

            console.log(
                "[PV] Infinite pan enabled - center constraint removed"
            );

            return;
        }

        /*
         * Retry because some OpenLayers builds finish creating
         * constraints shortly after the map object becomes visible.
         */
        setTimeout(unlockPan, 300);
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            () => setTimeout(unlockPan, 300),
            { once: true }
        );
    } else {
        setTimeout(unlockPan, 300);
    }

    /*
     * Expose helper in case another legacy script rebuilds the View.
     */
    window.pvUnlockInfinitePan = unlockPan;

})();
