(function () {
    "use strict";

    const COLOR = "#ffb020";
    let confirmedLayer = null;

    /* === MANUAL620_CONFIRMED_LAYER_FILTER_V2 === */

    let manual620Registry = {};


    function manual620FindAnomalyCheckbox(name) {

        const legend =
            document.getElementById(
                "anomalyLegend"
            );

        if (!legend) {
            return null;
        }


        const rows =
            legend.querySelectorAll(
                ".legend-row"
            );


        for (
            const row
            of
            rows
        ) {

            const label =
                row.querySelector(
                    ".legend-label"
                );


            if (!label) {
                continue;
            }


            if (
                String(
                    label.textContent
                    ||
                    ""
                ).trim()
                !==
                name
            ) {
                continue;
            }


            return row.querySelector(
                'input[type="checkbox"]'
            );
        }


        return null;
    }


    function manual620AnomalyEnabled(
        name
    ) {

        const checkbox =
            manual620FindAnomalyCheckbox(
                name
            );


        /*
         * If UI has not been built yet,
         * do not accidentally hide data.
         */
        if (!checkbox) {
            return true;
        }


        return Boolean(
            checkbox.checked
        );
    }


    function manual620SeverityEnabled(
        severity
    ) {

        const container =
            document.getElementById(
                "manual620SeverityFilter"
            );


        if (!container) {
            return true;
        }


        const checkboxes =
            container.querySelectorAll(
                'input[type="checkbox"]'
            );


        for (
            const checkbox
            of
            checkboxes
        ) {

            const value =
                String(
                    checkbox.dataset.severity
                    ||
                    ""
                ).trim();


            if (
                value
                ===
                severity
            ) {

                return Boolean(
                    checkbox.checked
                );
            }
        }


        return true;
    }


    function manual620FeatureVisible(
        feature
    ) {

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


        if (!panelId) {
            return false;
        }


        const info =
            manual620Registry[
                panelId
            ];


        /*
         * Only the authoritative manually validated
         * population belongs to this displayed layer.
         */
        if (!info) {
            return false;
        }


        const anomaly =
            String(
                info.anomaly_type
                ||
                info.visual_defect_estimate
                ||
                "Hot-Spot"
            );


        const severity =
            String(
                info.severity_estimate
                ||
                "Low"
            );


        /*
         * Also attach authoritative classification
         * to the OpenLayers feature itself.
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


        return (
            manual620AnomalyEnabled(
                anomaly
            )
            &&
            manual620SeverityEnabled(
                severity
            )
        );
    }


    function manual620RefreshConfirmedLayer() {

        if (
            confirmedLayer
            &&
            typeof confirmedLayer.changed
            ===
            "function"
        ) {

            confirmedLayer.changed();
        }
    }


    let currentDetail = null;
    let currentPhotoIndex = 0;
    let showPanel = true;
    let showAnomalies = true;

    function el(id) { return document.getElementById(id); }

    function removeLegacyFindingsLayer() {
        try {
            if (typeof map !== "undefined" && map && typeof findingsLayer !== "undefined" && findingsLayer) {
                try { findingsLayer.setVisible(false); } catch (_) {}
                const layers = map.getLayers().getArray();
                if (layers.indexOf(findingsLayer) !== -1) map.removeLayer(findingsLayer);
            }
        } catch (e) {
            console.warn("Confirmed45: could not remove legacy findings layer", e);
        }
    }

    function applyConfirmedCounts(featureCount, features) {
        const count = el("findingCount");
        if (count) count.textContent = `[${featureCount}]`;

        const affected = el("affectedPanels");
        if (affected) affected.textContent = String(featureCount);

        const totalNode = el("totalPanels");
        const total = Number(totalNode && totalNode.textContent) || 16853;
        const pct = el("affectedPercentage");
        if (pct && total > 0) pct.textContent = `${(featureCount / total * 100).toFixed(2)}%`;

        const table = el("findingsTable");
        if (table) {
            const tbody = table.querySelector("tbody");
            if (tbody) {
                tbody.innerHTML = "";
                (features || []).slice().sort((a,b) => String(a.get("panel_id")).localeCompare(String(b.get("panel_id")))).forEach(function (f) {
                    const tr = document.createElement("tr");
                    tr.style.cursor = "pointer";
                    const panelId = f.get("panel_id") || "";
                    const observations = f.get("observations") || 0;
                    tr.innerHTML = `<td>${panelId}</td><td>Confirmed 45°</td><td>Confirmed</td><td>${observations}</td><td>—</td><td>—</td>`;
                    tr.onclick = function () { openConfirmedPanel(panelId); };
                    tbody.appendChild(tr);
                });
            }
        }
    }

    function ensureEvidenceUi() {
        const viewer = el("thermalViewer");
        if (!viewer) return;

        if (!el("pvConfirmed45Controls")) {
            const controls = document.createElement("div");
            controls.id = "pvConfirmed45Controls";
            controls.className = "pv-confirmed45-controls";
            controls.innerHTML = `
                <label><input id="pvShowPanel" type="checkbox" checked> Show Panel</label>
                <label><input id="pvShowAnomalies" type="checkbox" checked> Show Anomalies</label>
            `;
            viewer.insertAdjacentElement("afterend", controls);
            el("pvShowPanel").onchange = function () { showPanel = this.checked; updateBoxesVisibility(); };
            el("pvShowAnomalies").onchange = function () { showAnomalies = this.checked; updateBoxesVisibility(); };
        }

        if (!el("pvConfirmed45Gallery")) {
            const gallery = document.createElement("div");
            gallery.id = "pvConfirmed45Gallery";
            gallery.className = "pv-confirmed45-gallery";
            el("pvConfirmed45Controls").insertAdjacentElement("afterend", gallery);
        }
    }

    function boxStyle(box, type) {
        if (!box) return "";
        const x = Math.max(0, Number(box.x) || 0) * 100;
        const y = Math.max(0, Number(box.y) || 0) * 100;
        const w = Math.max(0, Number(box.w) || 0) * 100;
        const h = Math.max(0, Number(box.h) || 0) * 100;
        const panel = type === "panel";
        return `position:absolute;left:${x}%;top:${y}%;width:${w}%;height:${h}%;box-sizing:border-box;pointer-events:none;z-index:${panel ? 5 : 6};`;
    }

    function updateBoxesVisibility() {
        document.querySelectorAll(".pv-confirmed45-panel-box").forEach(n => n.style.display = showPanel ? "block" : "none");
        document.querySelectorAll(".pv-confirmed45-anomaly-box").forEach(n => n.style.display = showAnomalies ? "block" : "none");
    }

    function buildStage(photo) {
        const viewer = el("thermalViewer");

        if (!viewer) {
            return;
        }

        viewer.innerHTML = "";

        viewer.style.position = "relative";
        viewer.style.overflow = "hidden";
        viewer.style.background = "#050505";


        const stage =
            document.createElement(
                "div"
            );

        stage.id =
            "pvConfirmed45Stage";

        stage.className =
            "pv-confirmed45-stage";


        const img =
            document.createElement(
                "img"
            );

        img.id =
            "thermalPhoto";

        /*
           IMPORTANT:

           The image returned by the backend
           already contains:
           - PANEL bbox
           - PANEL_ID label
           - A1 / A2 / ...
           
           Do NOT redraw any boxes here.
        */

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

        img.style.objectFit =
            "contain";


        stage.appendChild(
            img
        );

        viewer.appendChild(
            stage
        );
    }


    function renderGallery() {
        ensureEvidenceUi();
        const gallery = el("pvConfirmed45Gallery");
        if (!gallery || !currentDetail) return;
        const photos = currentDetail.photos || [];
        gallery.innerHTML = "";
        if (!photos.length) return;

        const nav = document.createElement("div");
        nav.className = "pv-confirmed45-nav";
        const prev = document.createElement("button"); prev.type="button"; prev.textContent="Previous";
        const counter = document.createElement("span"); counter.textContent = `${currentPhotoIndex + 1} / ${photos.length}`;
        const next = document.createElement("button"); next.type="button"; next.textContent="Next";
        prev.disabled = next.disabled = photos.length < 2;
        prev.onclick = function(){ currentPhotoIndex = (currentPhotoIndex - 1 + photos.length) % photos.length; showPhoto(); };
        next.onclick = function(){ currentPhotoIndex = (currentPhotoIndex + 1) % photos.length; showPhoto(); };
        nav.append(prev, counter, next);

        const thumbs = document.createElement("div");
        thumbs.className = "pv-confirmed45-thumbs";
        photos.forEach(function(photo,index){
            const button = document.createElement("button");
            button.type = "button";
            button.className = "pv-confirmed45-thumb" + (index === currentPhotoIndex ? " active" : "");
            const img = document.createElement("img"); img.src = photo.image_url; img.alt = photo.filename;
            button.title = photo.filename;
            button.onclick = function(){ currentPhotoIndex=index; showPhoto(); };
            button.appendChild(img); thumbs.appendChild(button);
        });
        gallery.append(nav, thumbs);
    }

    function showPhoto() {
        if (!currentDetail || !currentDetail.photos || !currentDetail.photos.length) return;
        const photo = currentDetail.photos[currentPhotoIndex];
        buildStage(photo);
        const filename = el("detailFilename"); if (filename) filename.textContent = photo.filename;
        const detection = el("detailDetection"); if (detection) detection.textContent = `${photo.anomaly_count} anomaly bbox`;
        renderGallery();
    }

    async function openConfirmedPanel(panelId) {
        try {
            const response = await fetch("/api/confirmed45/panel/" + encodeURIComponent(panelId));
            if (!response.ok) throw new Error("HTTP " + response.status);
            currentDetail = await response.json();
            currentPhotoIndex = 0;
            ensureEvidenceUi();
            if (el("detailTitle")) el("detailTitle").textContent = currentDetail.panel_id;
            if (el("detailSubtitle")) el("detailSubtitle").textContent = "Confirmed Active Learning 45°";
            if (el("detailSeverity")) el("detailSeverity").textContent = "Confirmed";
            if (el("detailObservations")) el("detailObservations").textContent = currentDetail.observations;
            if (el("detailLatitude")) el("detailLatitude").textContent = Number.isFinite(Number(currentDetail.latitude)) ? Number(currentDetail.latitude).toFixed(7) : "—";
            if (el("detailLongitude")) el("detailLongitude").textContent = Number.isFinite(Number(currentDetail.longitude)) ? Number(currentDetail.longitude).toFixed(7) : "—";
            if (el("detailCard")) el("detailCard").classList.remove("hidden");
            showPhoto();
        } catch (e) { console.error("Confirmed45 panel error", panelId, e); }
    }

    async function installLayer() {
        if (typeof map === "undefined" || !map) { setTimeout(installLayer, 200); return; }
        let data;
        try {
            const response = await fetch("/api/confirmed45/findings?t=" + Date.now());
            if (!response.ok) throw new Error("HTTP " + response.status);
            data = await response.json();
        } catch (e) { console.error("Confirmed45 layer error", e); return; }

        removeLegacyFindingsLayer();

        /*
         * Load authoritative manual620 V3 classification
         * before creating the displayed vector layer.
         */
        try {

            const manualResponse =
                await fetch(
                    "/static/manual620_visual_defects.json?t="
                    +
                    Date.now()
                );


            if (!manualResponse.ok) {

                throw new Error(
                    "manual620 HTTP "
                    +
                    manualResponse.status
                );
            }


            const manualData =
                await manualResponse.json();


            manual620Registry =
                manualData.panels
                ||
                {};


            console.log(
                "[MANUAL620 CONFIRMED FILTER] registry",
                Object.keys(
                    manual620Registry
                ).length
            );

        }
        catch (error) {

            console.error(
                "[MANUAL620 CONFIRMED FILTER] registry error",
                error
            );

            manual620Registry =
                {};
        }


        const features = new ol.format.GeoJSON().readFeatures(data);
        confirmedLayer = new ol.layer.Vector({
            source: new ol.source.Vector({features}),
            zIndex: 60,
            style: function(feature){

                if (
                    !manual620FeatureVisible(
                        feature
                    )
                ) {

                    return null;
                }


                return new ol.style.Style({
                    stroke:
                        new ol.style.Stroke({
                            color: COLOR,
                            width: 3.2
                        }),

                    fill:
                        new ol.style.Fill({
                            color:
                                "rgba(255,176,32,0.11)"
                        })
                });
            }
        });
        map.addLayer(confirmedLayer);


        /*
         * Repaint the REAL displayed layer whenever an
         * anomaly/severity checkbox changes.
         */
        if (
            !window.__manual620ConfirmedFilterBound
        ) {

            window.__manual620ConfirmedFilterBound =
                true;


            document.addEventListener(
                "change",
                function(event) {

                    const target =
                        event.target;


                    if (
                        !target
                        ||
                        target.type
                        !==
                        "checkbox"
                    ) {
                        return;
                    }


                    const inAnomalyLegend =
                        Boolean(
                            target.closest(
                                "#anomalyLegend"
                            )
                        );


                    const inSeverityFilter =
                        Boolean(
                            target.closest(
                                "#manual620SeverityFilter"
                            )
                        );


                    if (
                        inAnomalyLegend
                        ||
                        inSeverityFilter
                    ) {

                        setTimeout(
                            manual620RefreshConfirmedLayer,
                            0
                        );
                    }
                },
                true
            );
        }


        /*
         * Initial classification/style pass.
         */
        manual620RefreshConfirmedLayer();

        const toggle = el("findingsToggle");
        if (toggle) {
            toggle.checked = true;
            const label = toggle.closest(".switch-row");
            if (label) { const span = label.querySelector("span"); if (span) span.firstChild.textContent = "Confirmed 45° "; }
            toggle.onchange = function(){ confirmedLayer.setVisible(this.checked); };
        }

        applyConfirmedCounts(features.length, features);

        map.on("singleclick", function(event){
            let selected = null;
            map.forEachFeatureAtPixel(event.pixel, function(feature, layer){ if(layer !== confirmedLayer) return false; selected=feature; return true; }, {hitTolerance:8});
            if (!selected) return;
            const panelId = selected.get("panel_id");
            if (panelId) openConfirmedPanel(panelId);
        });

        window.pvConfirmed45Layer = confirmedLayer;
        window.openConfirmed45Panel = openConfirmedPanel;
        console.log("Confirmed45 V2 installed:", features.length, "panels; legacy layer removed");
    }

    installLayer();
})();
