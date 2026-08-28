let pvAdminMode = "select";

let pvAdminSelectedPanel = null;
let pvAdminSelectedFinding = null;

let pvAdminSelectPanels = null;
let pvAdminTranslate = null;
let pvAdminModify = null;
let pvAdminDraw = null;
let pvAdminSnap = null;

let pvAdminHistory = [];
let pvAdminRedoStack = [];

let pvAdminRailElement = null;
let pvAdminPanelElement = null;

let pvAdminPanelSource = null;
let pvAdminFindingSource = null;


/* ==========================================================
   START
   ========================================================== */

function pvAdminStart() {

    pvAdminCreateUI();

    const waiter = setInterval(
        () => {

            if (
                typeof map !== "undefined"
                &&
                map
                &&
                typeof panelLayer !== "undefined"
                &&
                panelLayer
                &&
                typeof findingsLayer !== "undefined"
                &&
                findingsLayer
            ) {

                clearInterval(waiter);

                pvAdminPanelSource =
                    panelLayer.getSource();

                pvAdminFindingSource =
                    findingsLayer.getSource();

                pvAdminCreateInteractions();

                pvAdminBindMapSelection();

                console.log(
                    "PV Admin attached successfully."
                );

            }

        },
        250
    );

}


/* ==========================================================
   UI
   ========================================================== */

function pvAdminCreateUI() {

    const oldRail =
        document.getElementById(
            "pvAdminRail"
        );

    if (oldRail) {
        oldRail.remove();
    }


    const oldPanel =
        document.getElementById(
            "pvAdminPanel"
        );

    if (oldPanel) {
        oldPanel.remove();
    }


    const rail =
        document.createElement(
            "div"
        );

    rail.id =
        "pvAdminRail";


    rail.innerHTML = `
        <div class="pv-admin-head">

            <span class="pv-admin-logo">
                ⚙
            </span>

            <span class="pv-admin-title">
                ADMIN
            </span>

        </div>


        <button
            class="pv-admin-tool active"
            data-admin-mode="select"
        >
            <span class="pv-admin-icon">⌖</span>
            <span class="pv-admin-label">Selectare</span>
        </button>


        <button
            class="pv-admin-tool"
            data-admin-tab="panels"
        >
            <span class="pv-admin-icon">▭</span>
            <span class="pv-admin-label">Panouri</span>
        </button>


        <button
            class="pv-admin-tool"
            data-admin-tab="anomalies"
        >
            <span class="pv-admin-icon">⚠</span>
            <span class="pv-admin-label">Anomalii</span>
        </button>


        <button
            class="pv-admin-tool"
            data-admin-tab="thermal"
        >
            <span class="pv-admin-icon">♨</span>
            <span class="pv-admin-label">IR Review</span>
        </button>


        <button
            class="pv-admin-tool"
            data-admin-action="undo"
        >
            <span class="pv-admin-icon">↶</span>
            <span class="pv-admin-label">Undo</span>
        </button>


        <button
            class="pv-admin-tool"
            data-admin-action="redo"
        >
            <span class="pv-admin-icon">↷</span>
            <span class="pv-admin-label">Redo</span>
        </button>


        <button
            class="pv-admin-tool"
            data-admin-tab="publish"
        >
            <span class="pv-admin-icon">✓</span>
            <span class="pv-admin-label">Draft</span>
        </button>


        <button
            class="pv-admin-tool"
            data-admin-action="logout"
        >
            <span class="pv-admin-icon">⇥</span>
            <span class="pv-admin-label">Logout</span>
        </button>
    `;


    const panel =
        document.createElement(
            "div"
        );

    panel.id =
        "pvAdminPanel";

    panel.innerHTML = `
        <div
            class="pv-admin-panel-inner"
            id="pvAdminPanelContent"
        ></div>
    `;


    const badge =
        document.createElement(
            "div"
        );

    badge.className =
        "pv-admin-badge";

    badge.textContent =
        "ADMIN MODE";


    document.body.appendChild(
        rail
    );

    document.body.appendChild(
        panel
    );

    document.body.appendChild(
        badge
    );


    pvAdminRailElement =
        rail;

    pvAdminPanelElement =
        panel;


    rail
        .querySelector(
            '[data-admin-mode="select"]'
        )
        .onclick =
            () => {

                pvAdminSetEditMode(
                    "select"
                );

                pvAdminClosePanel();

            };


    rail
        .querySelector(
            '[data-admin-tab="panels"]'
        )
        .onclick =
            pvAdminShowPanels;


    rail
        .querySelector(
            '[data-admin-tab="anomalies"]'
        )
        .onclick =
            pvAdminShowAnomalies;


    rail
        .querySelector(
            '[data-admin-tab="thermal"]'
        )
        .onclick =
            pvAdminShowThermal;


    rail
        .querySelector(
            '[data-admin-tab="publish"]'
        )
        .onclick =
            pvAdminShowPublish;


    rail
        .querySelector(
            '[data-admin-action="undo"]'
        )
        .onclick =
            pvAdminUndo;


    rail
        .querySelector(
            '[data-admin-action="redo"]'
        )
        .onclick =
            pvAdminRedo;


    rail
        .querySelector(
            '[data-admin-action="logout"]'
        )
        .onclick =
            pvAdminLogout;

}


/* ==========================================================
   INTERACTIONS
   ========================================================== */

function pvAdminCreateInteractions() {

    pvAdminSelectPanels =
        new ol.interaction.Select({

            layers: [
                panelLayer
            ],

            style:
                new ol.style.Style({

                    stroke:
                        new ol.style.Stroke({
                            color:
                                "#00d9ff",

                            width:
                                4
                        }),

                    fill:
                        new ol.style.Fill({
                            color:
                                "rgba(0,217,255,0.05)"
                        })

                })

        });


    pvAdminSelectPanels.on(
        "select",
        event => {

            pvAdminSelectedPanel =
                event.selected.length
                ?
                event.selected[0]
                :
                null;

            if (pvAdminSelectedPanel) {

                pvAdminShowPanels();

            }

        }
    );


    pvAdminTranslate =
        new ol.interaction.Translate({

            features:
                pvAdminSelectPanels
                .getFeatures()

        });


    pvAdminTranslate.on(
        "translatestart",
        pvAdminPushHistory
    );


    pvAdminModify =
        new ol.interaction.Modify({

            features:
                pvAdminSelectPanels
                .getFeatures()

        });


    pvAdminModify.on(
        "modifystart",
        pvAdminPushHistory
    );


    pvAdminDraw =
        new ol.interaction.Draw({

            source:
                pvAdminPanelSource,

            type:
                "Polygon"

        });


    pvAdminDraw.on(
        "drawstart",
        pvAdminPushHistory
    );


    pvAdminDraw.on(
        "drawend",
        event => {

            const count =
                pvAdminPanelSource
                    .getFeatures()
                    .length;

            event.feature.set(
                "panel_id",
                `MANUAL_${String(count + 1).padStart(5, "0")}`
            );

            event.feature.set(
                "affected",
                false
            );

        }
    );


    pvAdminSnap =
        new ol.interaction.Snap({

            source:
                pvAdminPanelSource

        });


    map.addInteraction(
        pvAdminSelectPanels
    );

    map.addInteraction(
        pvAdminSnap
    );

}


/* ==========================================================
   MODE
   ========================================================== */

function pvAdminRemoveEditInteractions() {

    [
        pvAdminTranslate,
        pvAdminModify,
        pvAdminDraw
    ]
    .forEach(
        interaction => {

            if (!interaction) {
                return;
            }

            if (
                map
                    .getInteractions()
                    .getArray()
                    .includes(
                        interaction
                    )
            ) {

                map.removeInteraction(
                    interaction
                );

            }

        }
    );

}


function pvAdminSetEditMode(
    mode
) {

    pvAdminMode =
        mode;

    pvAdminRemoveEditInteractions();


    if (
        mode ===
        "move"
    ) {

        map.addInteraction(
            pvAdminTranslate
        );

    }


    if (
        mode ===
        "modify"
    ) {

        map.addInteraction(
            pvAdminModify
        );

    }


    if (
        mode ===
        "draw"
    ) {

        map.addInteraction(
            pvAdminDraw
        );

    }

}


/* ==========================================================
   MAP CLICK - FINDINGS
   ========================================================== */

function pvAdminBindMapSelection() {

    map.on(
        "singleclick",
        event => {

            if (
                pvAdminMode !==
                "select"
            ) {
                return;
            }


            let finding =
                null;


            map.forEachFeatureAtPixel(
                event.pixel,
                (feature, layer) => {

                    if (
                        layer ===
                        findingsLayer
                    ) {

                        finding =
                            feature;

                        return true;

                    }

                }
            );


            if (finding) {

                pvAdminSelectedFinding =
                    finding;

                pvAdminShowAnomalies();

            }

        }
    );

}


/* ==========================================================
   PANEL TAB
   ========================================================== */

function pvAdminShowPanels() {

    const id =
        pvAdminSelectedPanel
        ?
        (
            pvAdminSelectedPanel
                .get(
                    "panel_id"
                )
            ||
            "-"
        )
        :
        "niciun panou";


    const content =
        document.getElementById(
            "pvAdminPanelContent"
        );


    content.innerHTML = `
        <div class="pv-admin-panel-title">

            <h3>Panouri</h3>

            <button
                id="pvAdminClose"
                class="pv-admin-close"
            >
                ×
            </button>

        </div>


        <div class="pv-admin-info">

            Selectat:
            <strong>${id}</strong>

        </div>


        <button
            id="pvPanelSelect"
            class="pv-admin-primary"
        >
            Selectează panou
        </button>


        <button
            id="pvPanelMove"
            class="pv-admin-primary"
        >
            Mută panou
        </button>


        <button
            id="pvPanelModify"
            class="pv-admin-primary"
        >
            Modifică forma / colțurile
        </button>


        <button
            id="pvPanelDraw"
            class="pv-admin-primary"
        >
            + Adaugă panou
        </button>


        <button
            id="pvPanelDuplicate"
            class="pv-admin-primary"
        >
            Duplică panou
        </button>


        <button
            id="pvPanelDelete"
            class="
                pv-admin-primary
                pv-admin-danger
            "
        >
            Șterge panou
        </button>
    `;


    document
        .getElementById(
            "pvAdminClose"
        )
        .onclick =
            pvAdminClosePanel;


    document
        .getElementById(
            "pvPanelSelect"
        )
        .onclick =
            () =>
                pvAdminSetEditMode(
                    "select"
                );


    document
        .getElementById(
            "pvPanelMove"
        )
        .onclick =
            () =>
                pvAdminSetEditMode(
                    "move"
                );


    document
        .getElementById(
            "pvPanelModify"
        )
        .onclick =
            () =>
                pvAdminSetEditMode(
                    "modify"
                );


    document
        .getElementById(
            "pvPanelDraw"
        )
        .onclick =
            () =>
                pvAdminSetEditMode(
                    "draw"
                );


    document
        .getElementById(
            "pvPanelDuplicate"
        )
        .onclick =
            pvAdminDuplicatePanel;


    document
        .getElementById(
            "pvPanelDelete"
        )
        .onclick =
            pvAdminDeletePanel;


    pvAdminOpenPanel();

}


/* ==========================================================
   PANEL ACTIONS
   ========================================================== */

function pvAdminDuplicatePanel() {

    if (!pvAdminSelectedPanel) {

        alert(
            "Selectează întâi un panou."
        );

        return;
    }


    pvAdminPushHistory();


    const clone =
        pvAdminSelectedPanel
            .clone();


    clone
        .getGeometry()
        .translate(
            15,
            15
        );


    const oldId =
        pvAdminSelectedPanel
            .get(
                "panel_id"
            )
        ||
        "PANEL";


    clone.set(
        "panel_id",
        `${oldId}_COPY`
    );


    pvAdminPanelSource
        .addFeature(
            clone
        );

}


function pvAdminDeletePanel() {

    if (!pvAdminSelectedPanel) {

        alert(
            "Selectează întâi un panou."
        );

        return;
    }


    if (
        !confirm(
            "Ștergi panoul selectat din Draft?"
        )
    ) {
        return;
    }


    pvAdminPushHistory();


    pvAdminPanelSource
        .removeFeature(
            pvAdminSelectedPanel
        );


    pvAdminSelectedPanel =
        null;


    pvAdminSelectPanels
        .getFeatures()
        .clear();


    pvAdminShowPanels();

}


/* ==========================================================
   ANOMALIES
   ========================================================== */

function pvAdminShowAnomalies() {

    const content =
        document.getElementById(
            "pvAdminPanelContent"
        );


    let info =
        "Nicio anomalie selectată";


    if (pvAdminSelectedFinding) {

        const id =
            pvAdminSelectedFinding
                .get(
                    "detection_id"
                )
            ||
            pvAdminSelectedFinding
                .get(
                    "panel_id"
                )
            ||
            "finding";


        const type =
            pvAdminSelectedFinding
                .get(
                    "anomaly_type"
                )
            ||
            "-";


        info =
            `${id} · ${type}`;

    }


    content.innerHTML = `
        <div class="pv-admin-panel-title">

            <h3>Anomalii</h3>

            <button
                id="pvAdminClose"
                class="pv-admin-close"
            >
                ×
            </button>

        </div>


        <div
            class="
                pv-admin-info
                pv-admin-selected-hint
            "
        >
            ${info}
        </div>


        <button
            id="pvSelectFinding"
            class="pv-admin-primary"
        >
            Selectează anomalie de pe hartă
        </button>


        <button
            id="pvDeleteFinding"
            class="
                pv-admin-primary
                pv-admin-danger
            "
        >
            Șterge anomalia selectată
        </button>


        <div class="pv-admin-separator"></div>


        <div class="pv-admin-info">

            Pentru moment ștergerea modifică Draft-ul
            Admin din hartă.

            În pasul următor conectăm Save Draft +
            Validate pentru persistență și client.

        </div>
    `;


    document
        .getElementById(
            "pvAdminClose"
        )
        .onclick =
            pvAdminClosePanel;


    document
        .getElementById(
            "pvSelectFinding"
        )
        .onclick =
            () => {

                pvAdminMode =
                    "select";

                pvAdminClosePanel();

            };


    document
        .getElementById(
            "pvDeleteFinding"
        )
        .onclick =
            pvAdminDeleteFinding;


    pvAdminOpenPanel();

}


function pvAdminDeleteFinding() {

    if (!pvAdminSelectedFinding) {

        alert(
            "Selectează întâi anomalia direct de pe hartă."
        );

        return;
    }


    if (
        !confirm(
            "Ștergi această anomalie din Draft?"
        )
    ) {
        return;
    }


    pvAdminPushHistory();


    pvAdminFindingSource
        .removeFeature(
            pvAdminSelectedFinding
        );


    pvAdminSelectedFinding =
        null;


    findingsLayer.changed();


    pvAdminShowAnomalies();

}


/* ==========================================================
   IR
   ========================================================== */

function pvAdminShowThermal() {

    const content =
        document.getElementById(
            "pvAdminPanelContent"
        );


    content.innerHTML = `
        <div class="pv-admin-panel-title">

            <h3>IR Review</h3>

            <button
                id="pvAdminClose"
                class="pv-admin-close"
            >
                ×
            </button>

        </div>


        <div class="pv-admin-info">

            Viewer-ul IR este deja cel din platforma client.

            Următorul patch va lega aici:
            modificarea chenarului panoului,
            adăugarea mai multor defecte,
            Confirm și Not defect.

        </div>
    `;


    document
        .getElementById(
            "pvAdminClose"
        )
        .onclick =
            pvAdminClosePanel;


    pvAdminOpenPanel();

}


/* ==========================================================
   HISTORY
   ========================================================== */

function pvAdminSnapshot() {

    return {

        panels:
            new ol.format.GeoJSON()
                .writeFeaturesObject(
                    pvAdminPanelSource
                        .getFeatures()
                ),

        findings:
            new ol.format.GeoJSON()
                .writeFeaturesObject(
                    pvAdminFindingSource
                        .getFeatures()
                )

    };

}


function pvAdminPushHistory() {

    if (
        !pvAdminPanelSource
        ||
        !pvAdminFindingSource
    ) {
        return;
    }


    pvAdminHistory.push(
        JSON.stringify(
            pvAdminSnapshot()
        )
    );


    if (
        pvAdminHistory.length
        >
        40
    ) {

        pvAdminHistory.shift();

    }


    pvAdminRedoStack =
        [];

}


function pvAdminRestore(
    text
) {

    const state =
        JSON.parse(
            text
        );


    const projection =
        map
            .getView()
            .getProjection();


    const format =
        new ol.format.GeoJSON();


    const panelFeatures =
        format.readFeatures(
            state.panels,
            {
                featureProjection:
                    projection
            }
        );


    const findingFeatures =
        format.readFeatures(
            state.findings,
            {
                featureProjection:
                    projection
            }
        );


    pvAdminPanelSource.clear();

    pvAdminPanelSource.addFeatures(
        panelFeatures
    );


    pvAdminFindingSource.clear();

    pvAdminFindingSource.addFeatures(
        findingFeatures
    );


    pvAdminSelectedPanel =
        null;

    pvAdminSelectedFinding =
        null;


    pvAdminSelectPanels
        .getFeatures()
        .clear();


    panelLayer.changed();

    findingsLayer.changed();

}


function pvAdminUndo() {

    if (!pvAdminHistory.length) {
        return;
    }


    pvAdminRedoStack.push(
        JSON.stringify(
            pvAdminSnapshot()
        )
    );


    pvAdminRestore(
        pvAdminHistory.pop()
    );

}


function pvAdminRedo() {

    if (!pvAdminRedoStack.length) {
        return;
    }


    pvAdminHistory.push(
        JSON.stringify(
            pvAdminSnapshot()
        )
    );


    pvAdminRestore(
        pvAdminRedoStack.pop()
    );

}


/* ==========================================================
   DRAFT
   ========================================================== */

function pvAdminShowPublish() {

    const content =
        document.getElementById(
            "pvAdminPanelContent"
        );


    content.innerHTML = `
        <div class="pv-admin-panel-title">

            <h3>Draft / Validate</h3>

            <button
                id="pvAdminClose"
                class="pv-admin-close"
            >
                ×
            </button>

        </div>


        <button
            id="pvSaveDraft"
            class="pv-admin-primary"
        >
            Salvează Draft
        </button>


        <button
            id="pvValidate"
            class="
                pv-admin-primary
                pv-admin-success
            "
        >
            Validează Project
        </button>


        <div class="pv-admin-info">

            Persistența va fi conectată în backend
            imediat după ce verificăm editarea vizuală.

        </div>
    `;


    document
        .getElementById(
            "pvAdminClose"
        )
        .onclick =
            pvAdminClosePanel;


    document
        .getElementById(
            "pvSaveDraft"
        )
        .onclick =
            () => {

                console.log(
                    "ADMIN DRAFT",
                    pvAdminSnapshot()
                );

                alert(
                    "Draft-ul vizual este pregătit. Persistența backend este următorul pas."
                );

            };


    pvAdminOpenPanel();

}


/* ==========================================================
   FLYOUT
   ========================================================== */

function pvAdminOpenPanel() {

    pvAdminPanelElement
        .classList
        .add(
            "visible"
        );

}


function pvAdminClosePanel() {

    pvAdminPanelElement
        .classList
        .remove(
            "visible"
        );

}


/* ==========================================================
   LOGOUT
   ========================================================== */

async function pvAdminLogout() {

    await fetch(
        "/api/admin/logout",
        {
            method:
                "POST"
        }
    );


    window.location.href =
        "/";

}


/* ==========================================================
   RUN
   ========================================================== */

pvAdminStart();
