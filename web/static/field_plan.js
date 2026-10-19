(function () {
    "use strict";

    const INDEX_URL = "/static/field_plan/panel_field_index.json";
    let byPanel = Object.create(null);
    let byField = Object.create(null);
    let indexPromise = null;
    let indexLoaded = false;
    let searchRequestToken = 0;

    function normalizeFieldCode(value) {
        const match = String(value || "")
            .trim()
            .toUpperCase()
            .match(/^R\s*0*(\d{1,3})\s*[-/]?\s*P\s*0*(\d{1,3})$/);

        if (!match) {
            return null;
        }

        return `R${String(Number(match[1])).padStart(3, "0")}-P${String(Number(match[2])).padStart(3, "0")}`;
    }

    function waitForPanelData(callback, token, startedAt) {
        let ready = false;
        try {
            ready = Boolean(
                typeof allPanelsGeoJSON !== "undefined"
                && allPanelsGeoJSON
                && Array.isArray(allPanelsGeoJSON.features)
                && allPanelsGeoJSON.features.length
            );
        } catch (_error) {
            ready = false;
        }

        if (token !== searchRequestToken) {
            return;
        }
        if (ready || Date.now() - startedAt > 30000) {
            callback();
            return;
        }
        window.setTimeout(function () {
            waitForPanelData(callback, token, startedAt);
        }, 150);
    }

    function installSearchBridge() {
        const input = document.getElementById("pvPanelSearchInput");
        const button = document.getElementById("pvPanelSearchButton");
        if (!input || !button) {
            return;
        }

        function waitForIndex(event) {
            const fieldCode = normalizeFieldCode(input.value);
            if (!fieldCode) {
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();
            const token = ++searchRequestToken;

            (indexPromise || loadIndex()).then(function () {
                if (byField[fieldCode]) {
                    input.value = byField[fieldCode];
                    waitForPanelData(function () {
                        button.click();
                    }, token, Date.now());
                    return;
                }
                if (indexLoaded) {
                    window.alert(`Codul de teren ${fieldCode} nu a fost gasit.`);
                }
            });
        }

        button.addEventListener("click", function (event) {
            waitForIndex(event);
        }, true);

        input.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                waitForIndex(event);
            }
        }, true);
    }

    function currentPanelId() {
        const title = document.getElementById("detailTitle");
        const text = title ? title.textContent : "";
        const match = String(text).toUpperCase().match(/PANEL_\d{5}/);
        return match ? match[0] : null;
    }

    function updateDetailPosition() {
        const record = byPanel[currentPanelId()] || null;
        const id = document.getElementById("fieldDetailId");
        const row = document.getElementById("fieldDetailRow");
        const position = document.getElementById("fieldDetailPosition");
        if (!id || !row || !position) {
            return;
        }

        id.textContent = record ? record.field_id : "-";
        row.textContent = record ? String(record.row) : "-";
        position.textContent = record ? String(record.position) : "-";
    }

    function installDetailObserver() {
        const title = document.getElementById("detailTitle");
        if (!title) {
            return;
        }
        new MutationObserver(updateDetailPosition).observe(title, {
            childList: true,
            characterData: true,
            subtree: true
        });
        updateDetailPosition();
    }

    function enhanceTable() {
        document.querySelectorAll("#findingsTable tbody tr").forEach(function (row) {
            const cell = row.cells && row.cells[0];
            if (!cell) {
                return;
            }
            const match = cell.textContent.toUpperCase().match(/PANEL_\d{5}/);
            const record = match ? byPanel[match[0]] : null;
            let label = cell.querySelector(".field-code-inline");
            if (!record) {
                if (label) {
                    label.remove();
                }
                return;
            }
            if (!label) {
                label = document.createElement("span");
                label.className = "field-code-inline";
                cell.appendChild(label);
            }
            if (label.textContent !== record.field_id) {
                label.textContent = record.field_id;
            }
        });
    }

    function installTableObserver() {
        const body = document.querySelector("#findingsTable tbody");
        if (!body) {
            return;
        }
        new MutationObserver(enhanceTable).observe(body, {
            childList: true,
            subtree: true
        });
        enhanceTable();
    }

    function installModal() {
        const modal = document.getElementById("fieldPlanModal");
        const open = document.getElementById("fieldPlanButton");
        const close = document.getElementById("fieldPlanClose");
        if (!modal || !open || !close) {
            return;
        }

        function setOpen(value) {
            modal.classList.toggle("is-open", value);
            modal.setAttribute("aria-hidden", value ? "false" : "true");
            document.body.style.overflow = value ? "hidden" : "";
            if (value) {
                close.focus();
            }
        }

        open.addEventListener("click", function () { setOpen(true); });
        close.addEventListener("click", function () { setOpen(false); });
        modal.addEventListener("click", function (event) {
            if (event.target === modal) {
                setOpen(false);
            }
        });
        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && modal.classList.contains("is-open")) {
                setOpen(false);
            }
        });
    }

    function loadIndex() {
        return fetch(INDEX_URL, { cache: "force-cache" })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error(`Field index returned ${response.status}`);
                }
                return response.json();
            })
            .then(function (payload) {
                byPanel = payload.by_panel || Object.create(null);
                byField = payload.by_field || Object.create(null);
                indexLoaded = true;
                updateDetailPosition();
                enhanceTable();
            })
            .catch(function (error) {
                console.warn("Field plan index unavailable:", error);
            });
    }

    function init() {
        installModal();
        installSearchBridge();
        installDetailObserver();
        installTableObserver();
        indexPromise = loadIndex();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
