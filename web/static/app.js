let map = null;
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
                    `;


                row.onclick =
                    function() {

                        activateView(
                            "mapView",
                            "mapButton"
                        );

                        window.openPanel(
                            item.panel_id
                        );

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

(function initAdminLogin() {

    const adminButton =
        document.getElementById("adminButton");

    const overlay =
        document.getElementById("adminLoginOverlay");

    const closeButton =
        document.getElementById("closeAdminLogin");

    const form =
        document.getElementById("adminLoginForm");

    const usernameInput =
        document.getElementById("adminUsername");

    const passwordInput =
        document.getElementById("adminPassword");

    const errorBox =
        document.getElementById("adminLoginError");


    if (
        !adminButton ||
        !overlay ||
        !form
    ) {

        console.warn(
            "Admin login UI nu a fost gÄƒsit."
        );

        return;
    }


    adminButton.addEventListener(
        "click",
        () => {

            overlay.hidden = false;

            errorBox.textContent = "";

            setTimeout(
                () => usernameInput.focus(),
                50
            );

        }
    );


    closeButton.addEventListener(
        "click",
        () => {

            overlay.hidden = true;

        }
    );


    overlay.addEventListener(
        "click",
        event => {

            if (event.target === overlay) {
                overlay.hidden = true;
            }

        }
    );


    document.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Escape" &&
                !overlay.hidden
            ) {

                overlay.hidden = true;

            }

        }
    );


    form.addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            errorBox.textContent = "";


            const username =
                usernameInput.value.trim();

            const password =
                passwordInput.value;


            if (!username || !password) {

                errorBox.textContent =
                    "Introdu utilizatorul È™i parola.";

                return;
            }


            try {

                const response =
                    await fetch(
                        "/api/admin/login",
                        {
                            method: "POST",

                            credentials:
                                "include",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify({
                                    username,
                                    password
                                })
                        }
                    );


                if (!response.ok) {

                    errorBox.textContent =
                        "Utilizator sau parolÄƒ incorectÄƒ.";

                    return;
                }


                const data =
                    await response.json();


                if (!data.success) {

                    errorBox.textContent =
                        "Autentificarea a eÈ™uat.";

                    return;
                }


                /*
                 * Backend-ul ne poate trimite direct
                 * URL-ul editorului.
                 */

                const editorUrl =
                    data.editor_url ||
                    "/admin/editor";


                window.open(
                    editorUrl,
                    "_blank"
                );


                overlay.hidden = true;

                passwordInput.value = "";


            } catch (error) {

                console.error(
                    "Admin login:",
                    error
                );

                errorBox.textContent =
                    "Serverul de autentificare nu rÄƒspunde.";

            }

        }
    );

})();





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
                    "/api/confirmed45/panel/"
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


            if (!photos.length) {

                throw new Error(
                    "No thermal evidence for "
                    +
                    panelId
                );
            }


            const photo =
                photos[0];


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
                photo.filename
                ||
                ""
            );


            setText(
                "detailDetection",
                (
                    photo.anomaly_count
                    ??
                    0
                )
                +
                " anomaly bbox"
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

