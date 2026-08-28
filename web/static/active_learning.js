let images = [];
let currentIndex = 0;
let currentImage = null;

let canvas = null;
let ctx = null;
let image = null;

let activeTool = "panel";

let items = [];
let activePanelIndex = -1;

let selectedAnnotation = null;

let drawing = false;
let startX = 0;
let startY = 0;

let map = null;
let rasterLayer = null;
let panelsLayer = null;
let locationLayer = null;

let selectedMapPanelId = null;

let meta = null;
let allPanels = null;


/* ============================================================
   IMAGE VIEWER
   ============================================================ */

let viewerScale = 1;
let viewerX = 0;
let viewerY = 0;

let viewerPanning = false;
let viewerStartX = 0;
let viewerStartY = 0;
let viewerOriginX = 0;
let viewerOriginY = 0;


/* ============================================================
   INIT
   ============================================================ */

async function init() {

    canvas =
        document.getElementById(
            "annotationCanvas"
        );

    ctx =
        canvas.getContext("2d");

    image =
        document.getElementById(
            "thermalImage"
        );

    setupButtons();
    setupCanvas();
    setupImageViewer();


    meta = await fetch(
        "/api/meta"
    ).then(r => r.json());


    allPanels = await fetch(
        "/api/all-panels"
    ).then(r => r.json());


    createMap();


    const data = await fetch(
        "/api/active-learning/images"
    ).then(r => r.json());

    images =
        data.images || [];


    if (!images.length) {

        toast(
            "No IR images found"
        );

        return;
    }


    await loadImage(0);
}


/* ============================================================
   BUTTONS
   ============================================================ */

function setupButtons() {

    document.getElementById(
        "panelTool"
    ).onclick = () => {

        activeTool = "panel";

        setToolButton(
            "panelTool"
        );

        updateStatus();
    };


    document.getElementById(
        "anomalyTool"
    ).onclick = () => {

        if (activePanelIndex < 0) {

            toast(
                "Selecteaza sau deseneaza un panou mai intai"
            );

            return;
        }

        activeTool = "anomaly";

        setToolButton(
            "anomalyTool"
        );

        updateStatus();
    };


    document.getElementById(
        "deleteTool"
    ).onclick =
        deleteSelected;


    document.getElementById(
        "clearTool"
    ).onclick = () => {

        if (
            !confirm(
                "Stergi toate adnotarile acestei imagini?"
            )
        ) {
            return;
        }

        items = [];

        activePanelIndex = -1;
        selectedAnnotation = null;
        selectedMapPanelId = null;

        redraw();
        updateStatus();
        refreshMapStyles();
    };


    document.getElementById(
        "prevBtn"
    ).onclick = async () => {

        if (currentIndex > 0) {

            await loadImage(
                currentIndex - 1
            );
        }
    };


    document.getElementById(
        "nextBtn"
    ).onclick = async () => {

        if (
            currentIndex
            <
            images.length - 1
        ) {

            await loadImage(
                currentIndex + 1
            );
        }
    };


    document.getElementById(
        "saveBtn"
    ).onclick =
        saveAndNext;


    document.getElementById(
        "activateBtn"
    ).onclick = () => {

        if (activePanelIndex < 0) {

            toast(
                "Selecteaza panoul desenat din stanga"
            );

            return;
        }


        if (!selectedMapPanelId) {

            toast(
                "Selecteaza panoul MASTER din dreapta"
            );

            return;
        }


        items[
            activePanelIndex
        ].panel_id =
            selectedMapPanelId;


        toast(
            `PANEL ${activePanelIndex + 1} → ${selectedMapPanelId}`
        );


        selectedMapPanelId = null;

        document.getElementById(
            "selectedPanel"
        ).textContent =
            "NONE";


        document.getElementById(
            "activateBtn"
        ).disabled =
            true;


        redraw();
        updateStatus();
        refreshMapStyles();
    };
}


function setToolButton(id) {

    document
        .querySelectorAll(".tool")
        .forEach(
            b =>
                b.classList.remove(
                    "active"
                )
        );

    document
        .getElementById(id)
        .classList.add(
            "active"
        );
}



/* ============================================================
   LOAD AI PREDICTIONS
   ============================================================ */

function boxCenter(box) {

    return {
        x:
            box.x
            +
            box.w / 2,

        y:
            box.y
            +
            box.h / 2
    };
}


function centerInsideBox(
    child,
    parent
) {

    const c =
        boxCenter(child);

    return (
        c.x >= parent.x
        &&
        c.x <= parent.x + parent.w
        &&
        c.y >= parent.y
        &&
        c.y <= parent.y + parent.h
    );
}


function intersectionArea(
    a,
    b
) {

    const x1 =
        Math.max(
            a.x,
            b.x
        );

    const y1 =
        Math.max(
            a.y,
            b.y
        );

    const x2 =
        Math.min(
            a.x + a.w,
            b.x + b.w
        );

    const y2 =
        Math.min(
            a.y + a.h,
            b.y + b.h
        );

    const w =
        Math.max(
            0,
            x2 - x1
        );

    const h =
        Math.max(
            0,
            y2 - y1
        );

    return w * h;
}


async function loadAIPredictions(
    filename
) {

    const response =
        await fetch(
            "/api/active-learning/predictions/"
            +
            encodeURIComponent(
                filename
            )
        );


    if (!response.ok) {

        console.warn(
            "AI predictions HTTP:",
            response.status
        );

        return [];
    }


    const data =
        await response.json();


    if (
        !data.ok
        ||
        !data.exists
    ) {

        return [];
    }


    const aiPanels =
        Array.isArray(
            data.panels
        )
        ?
        data.panels
        :
        [];


    const aiAnomalies =
        Array.isArray(
            data.anomalies
        )
        ?
        data.anomalies
        :
        [];


    const result =
        aiPanels.map(
            panel => ({
                panel: {
                    x: panel.x,
                    y: panel.y,
                    w: panel.w,
                    h: panel.h,

                    confidence:
                        panel.confidence,

                    source:
                        "ai"
                },

                anomalies: [],

                panel_id:
                    null,

                source:
                    "ai"
            })
        );


    // --------------------------------------------------------
    // Assign each anomaly to best matching AI panel
    // --------------------------------------------------------

    for (
        const anomaly
        of
        aiAnomalies
    ) {

        let bestIndex =
            -1;

        let bestScore =
            -1;


        // Prefer center containment.
        for (
            let i = 0;
            i < result.length;
            i++
        ) {

            if (
                centerInsideBox(
                    anomaly,
                    result[i].panel
                )
            ) {

                bestIndex =
                    i;

                break;
            }
        }


        // Otherwise use greatest intersection.
        if (
            bestIndex
            <
            0
        ) {

            for (
                let i = 0;
                i < result.length;
                i++
            ) {

                const score =
                    intersectionArea(
                        anomaly,
                        result[i].panel
                    );


                if (
                    score
                    >
                    bestScore
                ) {

                    bestScore =
                        score;

                    bestIndex =
                        i;
                }
            }
        }


        if (
            bestIndex
            >=
            0
        ) {

            result[
                bestIndex
            ].anomalies.push({
                x:
                    anomaly.x,

                y:
                    anomaly.y,

                w:
                    anomaly.w,

                h:
                    anomaly.h,

                confidence:
                    anomaly.confidence,

                source:
                    "ai"
            });
        }
    }


    console.log(
        "AI PRELOAD:",
        filename,
        "| panels:",
        result.length,
        "| anomalies:",
        aiAnomalies.length
    );


    return result;
}


/* ============================================================
   LOAD IMAGE
   ============================================================ */

async function loadImage(index) {

    currentIndex =
        index;

    currentImage =
        images[index];

    items = [];
    activePanelIndex = -1;

    selectedAnnotation = null;
    selectedMapPanelId = null;


    document.getElementById(
        "selectedPanel"
    ).textContent =
        "NONE";


    document.getElementById(
        "activateBtn"
    ).disabled =
        true;


    document.getElementById(
        "counter"
    ).textContent =
        `${index + 1} / ${images.length}`;


    document.getElementById(
        "imageName"
    ).textContent =
        currentImage;


    try {

        const saved =
            await fetch(
                "/api/active-learning/annotation/"
                +
                encodeURIComponent(
                    currentImage
                )
            )
            .then(r => r.json());


        if (
            saved.exists
            &&
            saved.annotation
        ) {

            const a =
                saved.annotation;


            if (
                Array.isArray(
                    a.items
                )
            ) {

                items =
                    a.items;

            }

            // backward compatibility
            else if (a.panel) {

                items = [{
                    panel:
                        a.panel,

                    anomalies:
                        a.anomalies || [],

                    panel_id:
                        a.panel_id || null
                }];
            }


            if (items.length) {

                activePanelIndex = 0;
            }
        }

        // No manual/saved annotation:
        // preload YOLO predictions.
        if (!items.length) {

            items =
                await loadAIPredictions(
                    currentImage
                );

            if (items.length) {

                activePanelIndex = 0;

                selectedAnnotation = {
                    type:
                        "panel",

                    panelIndex:
                        0
                };

                // Ask MASTER suggestion for each AI panel.
                for (
                    let i = 0;
                    i < items.length;
                    i++
                ) {

                    await suggestMasterPanel(
                        i
                    );

                    if (
                        selectedMapPanelId
                    ) {

                        items[i].panel_id =
                            selectedMapPanelId;

                        selectedMapPanelId =
                            null;
                    }
                }
            }
        }

    } catch (e) {

        console.warn(
            "Load annotation / AI preload:",
            e
        );
    }


    image.onload =
        async () => {

            resetViewer();

            resizeCanvas();
            redraw();
            updateStatus();
            refreshMapStyles();

            await locateCurrentImage();
        };


    image.src =
        "/api/active-learning/image/"
        +
        encodeURIComponent(
            currentImage
        )
        +
        "?t="
        +
        Date.now();
}


/* ============================================================
   CANVAS
   ============================================================ */

function resizeCanvas() {

    const rect =
        image.getBoundingClientRect();

    const stage =
        document
            .getElementById(
                "imageStage"
            )
            .getBoundingClientRect();


    canvas.width =
        Math.round(
            image.clientWidth
        );

    canvas.height =
        Math.round(
            image.clientHeight
        );


    canvas.style.width =
        image.clientWidth
        +
        "px";

    canvas.style.height =
        image.clientHeight
        +
        "px";


    canvas.style.left =
        (
            rect.left
            -
            stage.left
            -
            viewerX
        )
        +
        "px";


    canvas.style.top =
        (
            rect.top
            -
            stage.top
            -
            viewerY
        )
        +
        "px";
}


function setupCanvas() {

    canvas.addEventListener(
        "mousedown",
        event => {

            if (viewerPanning) {
                return;
            }


            const p =
                eventPos(event);


            /*
               IMPORTANT:
               In anomaly mode DO NOT select the
               panel underneath the cursor.

               Otherwise an anomaly can never
               be drawn inside a panel.
            */

            if (
                activeTool
                ===
                "anomaly"
            ) {

                if (
                    activePanelIndex
                    <
                    0
                ) {

                    toast(
                        "Selecteaza un PANEL mai intai"
                    );

                    return;
                }


                drawing = true;

                startX = p.x;
                startY = p.y;

                selectedAnnotation =
                    null;

                return;
            }


            /*
               PANEL MODE:
               click existing panel = select it
               drag empty area = create another panel
            */

            const hit =
                findAnnotationAt(
                    p.x,
                    p.y
                );


            if (
                hit
                &&
                hit.type
                ===
                "panel"
            ) {

                activePanelIndex =
                    hit.panelIndex;

                selectedAnnotation =
                    hit;


                redraw();
                updateStatus();
                refreshMapStyles();

                return;
            }


            drawing = true;

            startX = p.x;
            startY = p.y;

            selectedAnnotation =
                null;
        }
    );


    canvas.addEventListener(
        "mouseup",
        event => {

            if (!drawing) {
                return;
            }

            drawing = false;


            const p =
                eventPos(event);


            let box =
                normalizeBox(
                    startX,
                    startY,
                    p.x,
                    p.y
                );


            if (
                box.w < 0.004
                ||
                box.h < 0.004
            ) {

                return;
            }


            if (
                activeTool
                ===
                "panel"
            ) {

                items.push({

                    panel:
                        box,

                    anomalies:
                        [],

                    panel_id:
                        null
                });


                activePanelIndex =
                    items.length - 1;


                selectedAnnotation = {
                    type:
                        "panel",

                    panelIndex:
                        activePanelIndex
                };


                activeTool =
                    "anomaly";


                setToolButton(
                    "anomalyTool"
                );


                toast(
                    `PANEL ${activePanelIndex + 1} creat. Deseneaza anomaliile.`
                );


                suggestMasterPanel(
                    activePanelIndex
                );

            } else {

                if (
                    activePanelIndex
                    <
                    0
                ) {

                    return;
                }


                const panel =
                    items[
                        activePanelIndex
                    ].panel;


                box =
                    clampBoxToPanel(
                        box,
                        panel
                    );


                if (
                    box.w < 0.003
                    ||
                    box.h < 0.003
                ) {

                    toast(
                        "Anomaly trebuie sa fie in interiorul panoului"
                    );

                    return;
                }


                items[
                    activePanelIndex
                ]
                .anomalies
                .push(
                    box
                );


                selectedAnnotation = {

                    type:
                        "anomaly",

                    panelIndex:
                        activePanelIndex,

                    anomalyIndex:
                        items[
                            activePanelIndex
                        ]
                        .anomalies
                        .length
                        -
                        1
                };
            }


            redraw();
            updateStatus();
        }
    );


    /*
       Double click on panel selects it.
       Useful when several overlap.
    */

    canvas.addEventListener(
        "dblclick",
        event => {

            const p =
                eventPos(event);


            const panelIndex =
                findPanelAt(
                    p.x,
                    p.y
                );


            if (
                panelIndex
                >=
                0
            ) {

                activePanelIndex =
                    panelIndex;

                activeTool =
                    "anomaly";


                setToolButton(
                    "anomalyTool"
                );


                redraw();
                updateStatus();
                refreshMapStyles();
            }
        }
    );
}


function eventPos(event) {

    const rect =
        canvas
        .getBoundingClientRect();


    return {

        x:
            (
                event.clientX
                -
                rect.left
            )
            /
            rect.width,

        y:
            (
                event.clientY
                -
                rect.top
            )
            /
            rect.height
    };
}


function normalizeBox(
    x1,
    y1,
    x2,
    y2
) {

    const left =
        Math.max(
            0,
            Math.min(
                x1,
                x2
            )
        );


    const right =
        Math.min(
            1,
            Math.max(
                x1,
                x2
            )
        );


    const top =
        Math.max(
            0,
            Math.min(
                y1,
                y2
            )
        );


    const bottom =
        Math.min(
            1,
            Math.max(
                y1,
                y2
            )
        );


    return {

        x:
            left,

        y:
            top,

        w:
            right
            -
            left,

        h:
            bottom
            -
            top
    };
}


function clampBoxToPanel(
    box,
    panel
) {

    const x1 =
        Math.max(
            box.x,
            panel.x
        );

    const y1 =
        Math.max(
            box.y,
            panel.y
        );

    const x2 =
        Math.min(
            box.x + box.w,
            panel.x + panel.w
        );

    const y2 =
        Math.min(
            box.y + box.h,
            panel.y + panel.h
        );


    return {

        x:
            x1,

        y:
            y1,

        w:
            Math.max(
                0,
                x2 - x1
            ),

        h:
            Math.max(
                0,
                y2 - y1
            )
    };
}


/* ============================================================
   SELECT
   ============================================================ */

function pointInBox(
    x,
    y,
    box
) {

    return (
        x >= box.x
        &&
        x <= box.x + box.w
        &&
        y >= box.y
        &&
        y <= box.y + box.h
    );
}


function findPanelAt(
    x,
    y
) {

    for (
        let i =
            items.length - 1;
        i >= 0;
        i--
    ) {

        if (
            pointInBox(
                x,
                y,
                items[i].panel
            )
        ) {

            return i;
        }
    }

    return -1;
}


function findAnnotationAt(
    x,
    y
) {

    for (
        let p =
            items.length - 1;
        p >= 0;
        p--
    ) {

        const anomalies =
            items[p].anomalies;


        for (
            let a =
                anomalies.length - 1;
            a >= 0;
            a--
        ) {

            if (
                pointInBox(
                    x,
                    y,
                    anomalies[a]
                )
            ) {

                return {
                    type:
                        "anomaly",

                    panelIndex:
                        p,

                    anomalyIndex:
                        a
                };
            }
        }


        if (
            pointInBox(
                x,
                y,
                items[p].panel
            )
        ) {

            return {

                type:
                    "panel",

                panelIndex:
                    p
            };
        }
    }


    return null;
}


/* ============================================================
   DELETE
   ============================================================ */

function deleteSelected() {

    if (
        !selectedAnnotation
    ) {

        toast(
            "Selecteaza un obiect"
        );

        return;
    }


    if (
        selectedAnnotation.type
        ===
        "panel"
    ) {

        const p =
            selectedAnnotation
            .panelIndex;


        items.splice(
            p,
            1
        );


        if (
            items.length
            ===
            0
        ) {

            activePanelIndex =
                -1;

        } else {

            activePanelIndex =
                Math.min(
                    p,
                    items.length - 1
                );
        }

    } else {

        items[
            selectedAnnotation
                .panelIndex
        ]
        .anomalies
        .splice(
            selectedAnnotation
                .anomalyIndex,
            1
        );
    }


    selectedAnnotation =
        null;


    redraw();
    updateStatus();
    refreshMapStyles();
}


/* ============================================================
   DRAW
   ============================================================ */

function redraw() {

    if (!ctx) {
        return;
    }


    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );


    items.forEach(
        (
            item,
            panelIndex
        ) => {

            const active =
                panelIndex
                ===
                activePanelIndex;


            const panelLabel =
                item.panel_id
                ?
                `PANEL ${panelIndex + 1} → ${item.panel_id}`
                :
                `PANEL ${panelIndex + 1}`;


            drawBox(
                item.panel,

                active
                    ?
                    "#00ffff"
                    :
                    "#00a8cc",

                panelLabel,

                active
                    ?
                    4
                    :
                    2
            );


            item.anomalies.forEach(
                (
                    anomaly,
                    anomalyIndex
                ) => {

                    drawBox(
                        anomaly,

                        "#ff3b30",

                        `A${anomalyIndex + 1}`,

                        2.5
                    );
                }
            );
        }
    );
}


function drawBox(
    box,
    color,
    label,
    width
) {

    const x =
        box.x
        *
        canvas.width;

    const y =
        box.y
        *
        canvas.height;

    const w =
        box.w
        *
        canvas.width;

    const h =
        box.h
        *
        canvas.height;


    ctx.strokeStyle =
        color;

    ctx.lineWidth =
        width;


    ctx.strokeRect(
        x,
        y,
        w,
        h
    );


    ctx.font =
        "bold 13px Arial";


    const tw =
        ctx
        .measureText(
            label
        )
        .width;


    ctx.fillStyle =
        color;


    ctx.fillRect(
        x,
        Math.max(
            0,
            y - 18
        ),
        tw + 9,
        18
    );


    ctx.fillStyle =
        "#000";


    ctx.fillText(
        label,
        x + 4,
        Math.max(
            13,
            y - 4
        )
    );
}


/* ============================================================
   STATUS
   ============================================================ */

function updateStatus() {

    const panelCount =
        document.getElementById(
            "panelCount"
        );

    const anomalyCount =
        document.getElementById(
            "anomalyCount"
        );


    if (panelCount) {

        panelCount.textContent =
            items.length;
    }


    const totalAnomalies =
        items.reduce(
            (
                total,
                item
            ) =>
                total
                +
                item.anomalies.length,
            0
        );


    if (anomalyCount) {

        anomalyCount.textContent =
            totalAnomalies;
    }


    let message =
        "Draw Panel";


    if (
        activePanelIndex
        >=
        0
    ) {

        const item =
            items[
                activePanelIndex
            ];


        message =
            `ACTIVE: PANEL ${activePanelIndex + 1}`
            +
            ` | anomalies: ${item.anomalies.length}`
            +
            ` | MASTER: ${item.panel_id || "NOT ASSIGNED"}`;
    }


    document.getElementById(
        "annotationStatus"
    ).textContent =
        message;
}


/* ============================================================
   MAP - EXACT SAME CONFIG AS MAIN WEB
   ============================================================ */

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

            extent:
                extent,

            origin: [
                0,
                height
            ],

            tileSize:
                tileSize,

            resolutions:
                resolutions
        });


    rasterLayer =
        new ol.layer.Tile({

            extent:
                extent,

            source:
                new ol.source.TileImage({

                    projection:
                        projection,

                    tileGrid:
                        tileGrid,

                    wrapX:
                        false,

                    tileUrlFunction:
                        tileCoord => {

                            if (!tileCoord) {
                                return undefined;
                            }


                            return (
                                `/tiles/`
                                +
                                `${tileCoord[0]}/`
                                +
                                `${tileCoord[1]}/`
                                +
                                `${tileCoord[2]}.png`
                            );
                        }
                })
        });


    const features =
        new ol.format.GeoJSON()
        .readFeatures(
            allPanels
        );


    panelsLayer =
        new ol.layer.Vector({

            source:
                new ol.source.Vector({
                    features:
                        features
                }),

            style:
                feature => {

                    const id =
                        String(
                            feature.get(
                                "panel_id"
                            )
                            ||
                            ""
                        );


                    let assigned =
                        false;


                    let activeAssigned =
                        false;


                    items.forEach(
                        (
                            item,
                            index
                        ) => {

                            if (
                                item.panel_id
                                ===
                                id
                            ) {

                                assigned =
                                    true;


                                if (
                                    index
                                    ===
                                    activePanelIndex
                                ) {

                                    activeAssigned =
                                        true;
                                }
                            }
                        }
                    );


                    if (
                        activeAssigned
                    ) {

                        return new ol.style.Style({

                            stroke:
                                new ol.style.Stroke({
                                    color:
                                        "#00ffff",
                                    width:
                                        4
                                }),

                            fill:
                                new ol.style.Fill({
                                    color:
                                        "rgba(0,255,255,.28)"
                                })
                        });
                    }


                    if (assigned) {

                        return new ol.style.Style({

                            stroke:
                                new ol.style.Stroke({
                                    color:
                                        "#00ff70",
                                    width:
                                        3
                                }),

                            fill:
                                new ol.style.Fill({
                                    color:
                                        "rgba(0,255,112,.18)"
                                })
                        });
                    }


                    if (
                        id
                        ===
                        selectedMapPanelId
                    ) {

                        return new ol.style.Style({

                            stroke:
                                new ol.style.Stroke({
                                    color:
                                        "#ffd700",
                                    width:
                                        4
                                }),

                            fill:
                                new ol.style.Fill({
                                    color:
                                        "rgba(255,215,0,.22)"
                                })
                        });
                    }


                    return new ol.style.Style({

                        stroke:
                            new ol.style.Stroke({
                                color:
                                    "rgba(255,255,255,.90)",
                                width:
                                    2
                            }),

                        fill:
                            new ol.style.Fill({
                                color:
                                    "rgba(255,255,255,0)"
                            })
                    });
                }
        });


    locationLayer =
        new ol.layer.Vector({

            source:
                new ol.source.Vector(),

            style:
                new ol.style.Style({

                    image:
                        new ol.style.Circle({

                            radius:
                                9,

                            fill:
                                new ol.style.Fill({
                                    color:
                                        "rgba(255,215,0,.95)"
                                }),

                            stroke:
                                new ol.style.Stroke({
                                    color:
                                        "#000",
                                    width:
                                        2
                                })
                        })
                })
        });


    map =
        new ol.Map({

            target:
                "map",

            layers: [
                rasterLayer,
                panelsLayer,
                locationLayer
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


    map
        .getView()
        .fit(
            extent,
            {
                size:
                    map.getSize(),

                padding: [
                    20,
                    20,
                    20,
                    20
                ]
            }
        );


    map.on(
        "singleclick",
        event => {

            let selected =
                null;


            map.forEachFeatureAtPixel(

                event.pixel,

                (
                    feature,
                    layer
                ) => {

                    if (
                        layer
                        !==
                        panelsLayer
                    ) {

                        return false;
                    }


                    selected =
                        feature;

                    return true;
                },

                {
                    hitTolerance:
                        8
                }
            );


            if (!selected) {
                return;
            }


            selectedMapPanelId =
                String(
                    selected.get(
                        "panel_id"
                    )
                );


            document.getElementById(
                "selectedPanel"
            ).textContent =
                selectedMapPanelId;


            document.getElementById(
                "activateBtn"
            ).disabled =
                false;


            refreshMapStyles();
        }
    );
}


function refreshMapStyles() {

    if (panelsLayer) {

        panelsLayer.changed();
    }
}


/* ============================================================
   IMAGE APPROX LOCATION
   ============================================================ */

async function locateCurrentImage() {

    try {

        const data =
            await fetch(
                "/api/active-learning/location/"
                +
                encodeURIComponent(
                    currentImage
                )
            )
            .then(r => r.json());


        const source =
            locationLayer
            .getSource();


        source.clear();


        if (!data.ok) {

            document.getElementById(
                "gpsStatus"
            ).textContent =
                "No GPS";

            return;
        }


        source.addFeature(

            new ol.Feature({

                geometry:
                    new ol.geom.Point([
                        data.x,
                        data.y
                    ])
            })
        );


        document.getElementById(
            "gpsStatus"
        ).textContent =
            `Approx location | pitch ${data.pitch ?? "-"}°`;


        /*
           Do NOT zoom too close.
           We want enough surrounding panels
           for manual ground-truth selection.
        */

        const resolutions =
            map
            .getView()
            .getResolutions();


        const zoomIndex =
            Math.min(
                resolutions.length - 1,
                Math.max(
                    0,
                    resolutions.length - 4
                )
            );


        map
            .getView()
            .animate({

                center: [
                    data.x,
                    data.y
                ],

                resolution:
                    resolutions[
                        zoomIndex
                    ],

                duration:
                    300
            });


    } catch (e) {

        console.warn(
            "GPS:",
            e
        );
    }
}



/* ============================================================
   AUTO SUGGEST MASTER PANEL
   ============================================================ */

async function suggestMasterPanel(
    panelIndex
) {

    if (
        panelIndex < 0
        ||
        panelIndex >= items.length
    ) {
        return;
    }

    const box =
        items[panelIndex].panel;

    if (!box) {
        return;
    }

    const u =
        box.x
        +
        box.w / 2;

    const v =
        box.y
        +
        box.h / 2;

    try {

        const response =
            await fetch(
                "/api/active-learning/suggest-panel",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            filename:
                                currentImage,

                            u:
                                u,

                            v:
                                v
                        })
                }
            );


        const data =
            await response.json();


        if (
            !response.ok
            ||
            !data.ok
        ) {

            console.warn(
                "PANEL SUGGEST FAILED:",
                data
            );

            return;
        }


        selectedMapPanelId =
            data.best_panel_id
            || null;


        if (
            selectedMapPanelId
        ) {

            document.getElementById(
                "selectedPanel"
            ).textContent =
                selectedMapPanelId
                +
                (
                    data.best_distance_m
                    !== null
                    &&
                    data.best_distance_m
                    !== undefined
                    ?
                    ` (${Number(data.best_distance_m).toFixed(2)} m)`
                    :
                    ""
                );


            document.getElementById(
                "activateBtn"
            ).disabled =
                false;


            refreshMapStyles();


            const candidate =
                Array.isArray(
                    data.candidates
                )
                &&
                data.candidates.length
                ?
                data.candidates[0]
                :
                null;


            if (
                candidate
                &&
                map
            ) {

                map.getView().animate({

                    center: [
                        candidate.x,
                        candidate.y
                    ],

                    duration:
                        250
                });
            }


            toast(
                `Suggested: ${selectedMapPanelId}`
            );
        }

    } catch (error) {

        console.error(
            "AUTO PANEL SUGGEST ERROR:",
            error
        );
    }
}


/* ============================================================
   SAVE
   ============================================================ */

async function saveAndNext() {

    if (!items.length) {

        toast(
            "Deseneaza cel putin un panou"
        );

        return;
    }


    for (
        let i = 0;
        i < items.length;
        i++
    ) {

        if (
            !items[i].anomalies.length
        ) {

            toast(
                `PANEL ${i + 1} nu are Anomaly`
            );

            activePanelIndex =
                i;

            redraw();
            updateStatus();

            return;
        }


        if (
            !items[i].panel_id
        ) {

            toast(
                `PANEL ${i + 1} nu este legat de MASTER`
            );

            activePanelIndex =
                i;

            redraw();
            updateStatus();

            return;
        }
    }


    const payload = {

        filename:
            currentImage,

        image_width:
            image.naturalWidth,

        image_height:
            image.naturalHeight,

        items:
            items,

        panel_count:
            items.length,

        anomaly_count:
            items.reduce(
                (
                    n,
                    item
                ) =>
                    n
                    +
                    item.anomalies.length,
                0
            )
    };


    const response =
        await fetch(

            "/api/active-learning/save",

            {
                method:
                    "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify(
                        payload
                    )
            }
        );


    if (!response.ok) {

        let message =
            "Save failed";

        try {

            const data =
                await response.json();

            message =
                data.error
                ||
                message;

            console.error(
                "SAVE ERROR:",
                data
            );

        } catch (e) {

            const text =
                await response.text();

            if (text) {
                message = text;
            }

            console.error(
                "SAVE ERROR:",
                text
            );
        }

        toast(
            message
        );

        alert(
            "SAVE FAILED:\n\n"
            +
            message
        );

        return;
    }


    toast(
        `Saved ${items.length} panels`
    );


    if (
        currentIndex
        <
        images.length - 1
    ) {

        await loadImage(
            currentIndex + 1
        );
    }
}


/* ============================================================
   VIEWER ZOOM / PAN
   ============================================================ */

function applyViewerTransform() {

    const transform =
        `translate(${viewerX}px,${viewerY}px) scale(${viewerScale})`;


    image.style.transform =
        transform;

    canvas.style.transform =
        transform;


    const label =
        document.getElementById(
            "zoomLabel"
        );


    if (label) {

        label.textContent =
            Math.round(
                viewerScale
                *
                100
            )
            +
            "%";
    }
}


function resetViewer() {

    viewerScale = 1;

    viewerX = 0;
    viewerY = 0;

    applyViewerTransform();
}


function changeViewerZoom(
    factor,
    centerX = null,
    centerY = null
) {

    const stage =
        document.getElementById(
            "imageStage"
        );


    const rect =
        stage.getBoundingClientRect();


    if (
        centerX
        ===
        null
    ) {

        centerX =
            rect.width / 2;
    }


    if (
        centerY
        ===
        null
    ) {

        centerY =
            rect.height / 2;
    }


    const old =
        viewerScale;


    const next =
        Math.min(
            8,
            Math.max(
                0.25,
                old * factor
            )
        );


    const ratio =
        next / old;


    viewerX =
        centerX
        -
        (
            centerX
            -
            viewerX
        )
        *
        ratio;


    viewerY =
        centerY
        -
        (
            centerY
            -
            viewerY
        )
        *
        ratio;


    viewerScale =
        next;


    applyViewerTransform();
}


function setupImageViewer() {

    const stage =
        document.getElementById(
            "imageStage"
        );


    const zin =
        document.getElementById(
            "zoomInBtn"
        );

    const zout =
        document.getElementById(
            "zoomOutBtn"
        );

    const fit =
        document.getElementById(
            "zoomFitBtn"
        );


    if (zin) {

        zin.onclick =
            event => {

                event.stopPropagation();

                changeViewerZoom(
                    1.25
                );
            };
    }


    if (zout) {

        zout.onclick =
            event => {

                event.stopPropagation();

                changeViewerZoom(
                    0.8
                );
            };
    }


    if (fit) {

        fit.onclick =
            event => {

                event.stopPropagation();

                resetViewer();
            };
    }


    stage.addEventListener(

        "wheel",

        event => {

            event.preventDefault();


            const rect =
                stage
                .getBoundingClientRect();


            changeViewerZoom(

                event.deltaY < 0
                    ?
                    1.15
                    :
                    0.87,

                event.clientX
                -
                rect.left,

                event.clientY
                -
                rect.top
            );
        },

        {
            passive:
                false
        }
    );


    stage.addEventListener(

        "mousedown",

        event => {

            const pan =
                event.button === 1
                ||
                (
                    event.button === 0
                    &&
                    event.shiftKey
                );


            if (!pan) {
                return;
            }


            event.preventDefault();
            event.stopPropagation();


            viewerPanning =
                true;


            viewerStartX =
                event.clientX;

            viewerStartY =
                event.clientY;

            viewerOriginX =
                viewerX;

            viewerOriginY =
                viewerY;
        },

        true
    );


    window.addEventListener(

        "mousemove",

        event => {

            if (!viewerPanning) {
                return;
            }


            viewerX =
                viewerOriginX
                +
                event.clientX
                -
                viewerStartX;


            viewerY =
                viewerOriginY
                +
                event.clientY
                -
                viewerStartY;


            applyViewerTransform();
        }
    );


    window.addEventListener(

        "mouseup",

        () => {

            viewerPanning =
                false;
        }
    );
}


/* ============================================================
   TOAST
   ============================================================ */

function toast(message) {

    const el =
        document.getElementById(
            "toast"
        );


    el.textContent =
        message;

    el.style.display =
        "block";


    setTimeout(
        () => {

            el.style.display =
                "none";
        },
        1700
    );
}


window.addEventListener(
    "resize",
    () => {

        if (
            image
            &&
            image.complete
        ) {

            resizeCanvas();
            redraw();
        }


        if (map) {

            map.updateSize();
        }
    }
);


init();

/* ============================================================
   SAFE SELECT OBJECT
   Append-only extension.
   Does NOT modify image loading / AI preload / redraw.
   ============================================================ */

(function setupSafeSelectObject() {

    function install() {

        const panelButton =
            document.getElementById(
                "panelTool"
            );

        const canvasEl =
            document.getElementById(
                "annotationCanvas"
            );

        if (
            !panelButton
            ||
            !canvasEl
        ) {

            setTimeout(
                install,
                250
            );

            return;
        }


        // ----------------------------------------------------
        // Create button dynamically.
        // No HTML modification needed.
        // ----------------------------------------------------

        let selectButton =
            document.getElementById(
                "selectTool"
            );


        if (!selectButton) {

            selectButton =
                document.createElement(
                    "button"
                );

            selectButton.id =
                "selectTool";

            selectButton.className =
                "tool";

            selectButton.textContent =
                "Select Object";


            panelButton.parentNode.insertBefore(
                selectButton,
                panelButton
            );
        }


        // ----------------------------------------------------
        // Activate SELECT mode
        // ----------------------------------------------------

        selectButton.onclick =
            function(event) {

                event.preventDefault();
                event.stopPropagation();

                activeTool =
                    "select";


                document
                    .querySelectorAll(
                        ".tool"
                    )
                    .forEach(
                        button =>
                            button.classList.remove(
                                "active"
                            )
                    );


                selectButton.classList.add(
                    "active"
                );


                toast(
                    "Select Object activ"
                );
            };


        // ----------------------------------------------------
        // SELECT interception.
        //
        // Capture=true means we intercept ONLY when
        // Select Object is active.
        //
        // Existing drawing system remains untouched otherwise.
        // ----------------------------------------------------

        canvasEl.addEventListener(

            "mousedown",

            function(event) {

                if (
                    activeTool
                    !==
                    "select"
                ) {

                    return;
                }


                event.preventDefault();

                event.stopPropagation();
                event.stopImmediatePropagation();


                const p =
                    eventPos(
                        event
                    );


                const hit =
                    findAnnotationAt(
                        p.x,
                        p.y
                    );


                if (!hit) {

                    selectedAnnotation =
                        null;


                    toast(
                        "Niciun obiect aici"
                    );

                    return;
                }


                selectedAnnotation =
                    hit;


                activePanelIndex =
                    hit.panelIndex;


                const item =
                    items[
                        activePanelIndex
                    ];


                if (
                    hit.type
                    ===
                    "panel"
                ) {

                    toast(
                        `PANEL ${activePanelIndex + 1} selectat`
                    );


                    const selectedPanelEl =
                        document.getElementById(
                            "selectedPanel"
                        );


                    if (
                        selectedPanelEl
                    ) {

                        selectedPanelEl.textContent =
                            item.panel_id
                            ||
                            "NOT ASSIGNED";
                    }

                } else {

                    toast(
                        `ANOMALY ${hit.anomalyIndex + 1} | PANEL ${activePanelIndex + 1}`
                    );
                }


                updateStatus();
                refreshMapStyles();

            },

            true
        );


        console.log(
            "SAFE SELECT OBJECT READY"
        );
    }


    if (
        document.readyState
        ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            install
        );

    } else {

        install();
    }

})();

