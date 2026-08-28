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
                                "?v=20260828_render_1"
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
                                "?v=20260828_render_1"
                            ),

                        projection:
                            projection,

                        imageExtent:
                            extent
                    }),

                visible:
                    true,

                opacity:
                    0.72
            });


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


                        if (
                            !activePanelIds.has(
                                panelId
                            )
                        ) {

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
