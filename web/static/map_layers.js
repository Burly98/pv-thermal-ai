(function () {

    "use strict";

    let rgbLayer = null;
    let irFastLayer = null;

    let activePanelIds =
        new Set();

    let activeStyle = null;
    let normalStyle = null;


    function waitForEverything() {

        if (
            typeof map === "undefined"
            ||
            !map
            ||
            typeof rasterLayer === "undefined"
            ||
            !rasterLayer
            ||
            typeof panelLayer === "undefined"
            ||
            !panelLayer
            ||
            typeof findingsGeoJSON === "undefined"
            ||
            !findingsGeoJSON
            ||
            typeof meta === "undefined"
            ||
            !meta
        ) {

            setTimeout(
                waitForEverything,
                150
            );

            return;
        }


        console.log(
            "PV FAST FINAL MAP START"
        );


        buildActivePanelIds();

        installFastRasters();

        installPanelStyles();

        installPanelClick();

        installRasterControls();

        installFindingsToggle();

        installStyleGuard();


        console.log(
            "PV FAST FINAL MAP READY"
        );
    }


    /* ========================================================
       ACTIVE PANEL IDS
       ======================================================== */

    function buildActivePanelIds() {

        activePanelIds =
            new Set();


        (
            findingsGeoJSON.features
            ||
            []
        )
        .forEach(
            function(feature) {

                const properties =
                    feature.properties
                    ||
                    {};


                const panelId =
                    properties.panel_id;


                if (panelId) {

                    activePanelIds.add(
                        String(
                            panelId
                        )
                    );
                }
            }
        );


        console.log(
            "ACTIVE DEFECTIVE PANEL IDS:",
            activePanelIds.size
        );
    }


    /* ========================================================
       FAST RGB + IR
       ======================================================== */

    function installFastRasters() {

        const extent = [

            0,
            0,

            Number(
                meta.width
            ),

            Number(
                meta.height
            )
        ];


        const projection =
            map
            .getView()
            .getProjection();


        rgbLayer =
            new ol.layer.Image({

                source:
                    new ol.source.ImageStatic({

                        url:
                            (
                                "/static/map_layers/"
                                +
                                "rgb_aligned.jpg"
                                +
                                "?v=20260902_render_rasters_3"
                            ),

                        projection:
                            projection,

                        imageExtent:
                            extent
                    }),

                visible:
                    true,

                opacity:
                    1.0
            });


        irFastLayer =
            new ol.layer.Image({

                source:
                    new ol.source.ImageStatic({

                        url:
                            (
                                "/static/map_layers/"
                                +
                                "ir_aligned.jpg"
                                +
                                "?v=20260902_render_rasters_3"
                            ),

                        projection:
                            projection,

                        imageExtent:
                            extent
                    }),

                // On Render this acts as the control proxy for the HD
                // Pulkovo tiles hosted in R2.
                visible:
                    window.location.hostname.endsWith(
                        ".onrender.com"
                    ),

                opacity:
                    0.72
            });

        window.irFastLayer =
            irFastLayer;


        rgbLayer.set(
            "pvLayer",
            "rgb-fast"
        );


        irFastLayer.set(
            "pvLayer",
            "ir-fast"
        );


        /*
         * OLD IR:
         *
         * Do not remove from map completely,
         * because old app.js may still reference rasterLayer.
         *
         * We only hide it.
         */

        rasterLayer.setVisible(
            false
        );


        /*
         * Insert fast rasters.
         */

        const layers =
            map
            .getLayers();


        layers.insertAt(
            0,
            rgbLayer
        );


        layers.insertAt(
            1,
            irFastLayer
        );


        /*
         * Explicit stack order.
         */

        rgbLayer.setZIndex(
            0
        );

        irFastLayer.setZIndex(
            5
        );

        panelLayer.setZIndex(
            20
        );


        if (
            typeof findingsLayer !==
                "undefined"
            &&
            findingsLayer
        ) {

            /*
             * We do not need duplicate finding polygons.
             * MASTER panel geometry is authoritative.
             */

            findingsLayer.setVisible(
                false
            );

            findingsLayer.setZIndex(
                10
            );
        }


        rgbLayer
            .getSource()
            .on(
                "imageloadend",
                function() {

                    console.log(
                        "RGB FAST LOADED"
                    );
                }
            );


        irFastLayer
            .getSource()
            .on(
                "imageloadend",
                function() {

                    console.log(
                        "IR FAST LOADED"
                    );
                }
            );


        rgbLayer
            .getSource()
            .on(
                "imageloaderror",
                function(event) {

                    console.error(
                        "RGB FAST LOAD ERROR",
                        event
                    );
                }
            );


        irFastLayer
            .getSource()
            .on(
                "imageloaderror",
                function(event) {

                    console.error(
                        "IR FAST LOAD ERROR",
                        event
                    );
                }
            );
    }


    /* ========================================================
       MASTER PANEL STYLE
       ======================================================== */

    function createPanelStyles() {

        normalStyle =
            new ol.style.Style({

                stroke:
                    new ol.style.Stroke({

                        color:
                            "rgba(255,255,255,0.72)",

                        width:
                            0.7
                    }),

                fill:
                    new ol.style.Fill({

                        color:
                            "rgba(255,255,255,0.01)"
                    }),

                zIndex:
                    1
            });


        activeStyle =
            new ol.style.Style({

                stroke:
                    new ol.style.Stroke({

                        color:
                            "#ff3154",

                        width:
                            3.2
                    }),

                fill:
                    new ol.style.Fill({

                        color:
                            "rgba(255,49,84,0.25)"
                    }),

                zIndex:
                    100
            });
    }


    function applyPanelStyles() {

        if (
            !activeStyle
            ||
            !normalStyle
        ) {

            createPanelStyles();
        }


        panelLayer.setStyle(

            function(feature) {

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


                const isActive =
                    activePanelIds.has(
                        panelId
                    );


                feature.set(
                    "pvDefective",
                    isActive,
                    true
                );


                return isActive
                    ?
                    activeStyle
                    :
                    normalStyle;
            }
        );


        panelLayer.changed();
    }


    function installPanelStyles() {

        applyPanelStyles();


        const features =
            panelLayer
            .getSource()
            .getFeatures();


        let matched =
            0;


        features.forEach(
            function(feature) {

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


                if (
                    activePanelIds.has(
                        panelId
                    )
                ) {

                    matched++;
                }
            }
        );


        console.log(
            "MASTER ACTIVE PANELS MATCHED:",
            matched,
            "/",
            activePanelIds.size
        );
    }


    /*
     * app.js has its own MASTER style routine and calls it
     * again when the resolution changes.
     *
     * Reapply our authoritative style immediately afterwards.
     */

    function installStyleGuard() {

        map
            .getView()
            .on(
                "change:resolution",

                function() {

                    setTimeout(
                        applyPanelStyles,
                        0
                    );
                }
            );


        /*
         * Also guard the first few seconds while old
         * initialization code finishes.
         */

        let count =
            0;


        const timer =
            setInterval(

                function() {

                    count++;

                    applyPanelStyles();


                    if (
                        count >= 20
                    ) {

                        clearInterval(
                            timer
                        );
                    }

                },

                250
            );
    }


    /* ========================================================
       ACTIVE PANEL CLICK
       ======================================================== */

    function installPanelClick() {

        if (
            window.__pvFastPanelClickInstalled
        ) {

            return;
        }

        const controlLayer =
            window.irFastLayer
            ||
            null;


        map.on(

            "singleclick",

            function(event) {

                let selected =
                    null;


                map.forEachFeatureAtPixel(

                    event.pixel,

                    function(
                        feature,
                        layer
                    ) {

                        if (
                            layer !==
                            panelLayer
                        ) {

                            return false;
                        }


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


                        // Every MASTER panel is inspectable.
                        // activePanelIds controls STYLE only.
                        // Clicking an inactive panel does NOT activate it.
                        if (!panelId) {
                            return false;
                        }

                        selected =
                            feature;


                        return true;
                    },

                    {
                        hitTolerance:
                            7
                    }
                );


                if (!selected) {

                    return;
                }


                const panelId =
                    String(
                        selected.get(
                            "panel_id"
                        )
                        ||
                        selected.get(
                            "PANEL_ID"
                        )
                        ||
                        ""
                    );


                if (!panelId) {

                    return;
                }


                if (
                    typeof window.openPanel
                    ===
                    "function"
                ) {

                    window.openPanel(
                        panelId
                    );
                }
            }
        );


        window.__pvFastPanelClickInstalled =
            true;
    }


    /* ========================================================
       VERIFIED FINDINGS TOGGLE
       ======================================================== */

    function installFindingsToggle() {

        const toggle =
            document.getElementById(
                "findingsToggle"
            );


        if (!toggle) {

            return;
        }


        /*
         * Remove old meaning:
         * old app.js toggles findingsLayer.
         *
         * Our visual findings are MASTER panel styles.
         */

        toggle.checked =
            true;


        toggle.addEventListener(

            "change",

            function() {

                panelLayer.setVisible(
                    true
                );


                if (
                    toggle.checked
                ) {

                    applyPanelStyles();

                } else {

                    panelLayer.setStyle(
                        normalStyle
                    );
                }


                if (
                    typeof findingsLayer !==
                        "undefined"
                    &&
                    findingsLayer
                ) {

                    findingsLayer.setVisible(
                        false
                    );
                }
            }
        );
    }


    /* ========================================================
       UI
       ======================================================== */

    function createRasterControl(
        name,
        layer,
        initialOpacity
    ) {

        const box =
            document.createElement(
                "div"
            );


        box.className =
            "pv-raster-control";


        const header =
            document.createElement(
                "div"
            );


        header.className =
            "pv-raster-control-header";


        const label =
            document.createElement(
                "label"
            );


        const checkbox =
            document.createElement(
                "input"
            );


        checkbox.type =
            "checkbox";


        checkbox.checked =
            true;


        const text =
            document.createElement(
                "span"
            );


        text.textContent =
            name;


        label.appendChild(
            checkbox
        );


        label.appendChild(
            text
        );


        const percent =
            document.createElement(
                "span"
            );


        percent.className =
            "pv-raster-percent";


        percent.textContent =
            Math.round(
                initialOpacity * 100
            )
            +
            "%";


        header.appendChild(
            label
        );


        header.appendChild(
            percent
        );


        const slider =
            document.createElement(
                "input"
            );


        slider.type =
            "range";


        slider.min =
            "0";


        slider.max =
            "100";


        slider.step =
            "1";


        slider.value =
            String(
                Math.round(
                    initialOpacity
                    *
                    100
                )
            );


        slider.className =
            "pv-raster-slider";


        checkbox.onchange =
            function() {

                layer.setVisible(
                    checkbox.checked
                );
            };


        slider.oninput =
            function() {

                const opacity =
                    Number(
                        slider.value
                    )
                    /
                    100;


                layer.setOpacity(
                    opacity
                );


                percent.textContent =
                    slider.value
                    +
                    "%";
            };


        box.appendChild(
            header
        );


        box.appendChild(
            slider
        );


        return box;
    }


    function installRasterControls() {

        const sidebar =
            document.querySelector(
                ".layers-panel"
            );


        if (!sidebar) {

            return;
        }


        document
            .querySelectorAll(
                "#pvRasterControls, #pvMapRasterControls"
            )
            .forEach(
                function(node) {

                    node.remove();
                }
            );


        const section =
            document.createElement(
                "div"
            );


        section.id =
            "pvRasterControls";


        section.className =
            "layer-section pv-raster-controls";


        const title =
            document.createElement(
                "div"
            );


        title.className =
            "layer-title";


        title.textContent =
            "Orthomosaic";


        const note =
            document.createElement(
                "div"
            );


        note.className =
            "pv-raster-note";


        note.textContent =
            "IR above RGB";


        section.appendChild(
            title
        );


        section.appendChild(
            note
        );


        section.appendChild(

            createRasterControl(
                "IR Thermal",
                irFastLayer,
                0.72
            )
        );


        section.appendChild(

            createRasterControl(
                "RGB Orthomosaic",
                rgbLayer,
                1.0
            )
        );


        const header =
            sidebar.querySelector(
                ".layers-header"
            );


        if (
            header
            &&
            header.nextSibling
        ) {

            sidebar.insertBefore(
                section,
                header.nextSibling
            );

        } else {

            sidebar.appendChild(
                section
            );
        }
    }


    waitForEverything();

})();



/* === IR_PULKOVO_WEBP_V1 === */

(function installIrPulkovoWebP() {

    const isRender =
        window.location.hostname.endsWith(
            ".onrender.com"
        );

    const tileBaseUrl =
        isRender
            ? "https://pub-09771315fe014e92a6a9dab1eba118a1.r2.dev/ir_pulkovo_tiles"
            : "/static/ir_pulkovo_tiles";

    function tryInstall() {

        if (
            typeof map === "undefined"
            ||
            !map
        ) {
            setTimeout(
                tryInstall,
                250
            );
            return;
        }

        /*
         * New IR GeoTIFF:
         *
         * EPSG:3844
         * 39962 x 45261
         *
         * Native raster bounds:
         * L = 296273.84966294124
         * B = 651549.5298370887
         * R = 296792.34777301387
         * T = 652136.7812999784
         *
         * Main Web raster:
         * 40438 x 45701
         *
         * Main Web affine:
         * pixel size = 0.012794887495054233
         * origin X   = 296274.36155876954
         * origin Y   = 652136.2321107029
         */

        const MAIN_H =
            45701;

        const MAIN_PIXEL =
            0.012794887495054233;

        const MAIN_X0 =
            296274.36155876954;

        const MAIN_Y0 =
            652136.2321107029;


        const IR_LEFT =
            296273.84966294124;

        const IR_BOTTOM =
            651549.5298370887;

        const IR_RIGHT =
            296792.34777301387;

        const IR_TOP =
            652136.7812999784;


        function worldToPv(
            x,
            y
        ) {

            const col =
                (
                    x
                    -
                    MAIN_X0
                )
                /
                MAIN_PIXEL;

            const row =
                (
                    MAIN_Y0
                    -
                    y
                )
                /
                MAIN_PIXEL;

            return [
                col,
                MAIN_H - row
            ];
        }


        const bottomLeft =
            worldToPv(
                IR_LEFT,
                IR_BOTTOM
            );

        const topRight =
            worldToPv(
                IR_RIGHT,
                IR_TOP
            );


        const irExtent = [
            Math.min(
                bottomLeft[0],
                topRight[0]
            ),

            Math.min(
                bottomLeft[1],
                topRight[1]
            ),

            Math.max(
                bottomLeft[0],
                topRight[0]
            ),

            Math.max(
                bottomLeft[1],
                topRight[1]
            )
        ];


        /*
         * WebP pyramid:
         *
         * z0 = 157 x 177
         * ...
         * z8 = 39962 x 45261
         *
         * At z8:
         * one tile-image pixel corresponds to one
         * source IR pixel.
         *
         * Convert source-pixel resolution to
         * PV_IMAGE pixels.
         */

        const IR_W =
            39962;

        const IR_H =
            45261;

        const MAX_ZOOM =
            8;

        const TILE_SIZE =
            256;


        const pvWidth =
            irExtent[2]
            -
            irExtent[0];

        const pvHeight =
            irExtent[3]
            -
            irExtent[1];


        const nativeResolution =
            Math.max(
                pvWidth / IR_W,
                pvHeight / IR_H
            );


        const resolutions = [];

        for (
            let z = 0;
            z <= MAX_ZOOM;
            z++
        ) {

            resolutions.push(
                nativeResolution
                *
                Math.pow(
                    2,
                    MAX_ZOOM - z
                )
            );
        }


        const tileGrid =
            new ol.tilegrid.TileGrid({

                extent:
                    irExtent,

                origin: [
                    irExtent[0],
                    irExtent[3]
                ],

                tileSize:
                    TILE_SIZE,

                resolutions:
                    resolutions
            });


        const source =
            new ol.source.TileImage({

                projection:
                    map
                    .getView()
                    .getProjection(),

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

                        if (
                            z < 0
                            ||
                            z > MAX_ZOOM
                            ||
                            x < 0
                            ||
                            y < 0
                        ) {
                            return undefined;
                        }

                        /*
                         * Pyramid layout generated earlier:
                         *
                         * z / y / x.webp
                         */

                        return (
                            tileBaseUrl
                            +
                            "/"
                            +
                            z
                            +
                            "/"
                            +
                            y
                            +
                            "/"
                            +
                            x
                            +
                            ".webp"
                        );
                    }
            });


        const layer =
            new ol.layer.Tile({

                source:
                    source,

                extent:
                    irExtent,

                visible:
                    true,

                opacity:
                    isRender && controlLayer
                        ? controlLayer.getOpacity()
                        : 1.0
            });


        layer.setZIndex(
            5
        );


        layer.set(
            "pvLayer",
            "ir-pulkovo-webp"
        );

        layer.set(
            "title",
            "IR Pulkovo HD"
        );


        /*
         * Put IR below vector panel layers.
         */
        map
            .getLayers()
            .insertAt(
                1,
                layer
            );


        window.irPulkovoLayer =
            layer;


        if (
            isRender
            &&
            controlLayer
        ) {
            // Keep the existing IR checkbox and opacity slider, while
            // avoiding the lower-resolution JPEG download on Render.
            controlLayer.setSource(null);

            controlLayer.on(
                "change:visible",
                function() {
                    layer.setVisible(
                        controlLayer.getVisible()
                    );
                }
            );

            controlLayer.on(
                "change:opacity",
                function() {
                    layer.setOpacity(
                        controlLayer.getOpacity()
                    );
                }
            );
        }

        window.irPulkovoExtent =
            irExtent;


        console.log(
            "[IR PULKOVO] installed",
            {
                extent:
                    irExtent,

                resolutions:
                    resolutions,

                nativeResolution:
                    nativeResolution
            }
        );
    }


    tryInstall();

})();

