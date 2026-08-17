export function renderAppHeader(state) {
    const header = document.querySelector(".app-header");
    if (!header) return;

    header.dataset.tournamentStatus = state.tournament.status;
    header.dataset.workflowStep = state.workflow.step;

    const savedAt = formatSavedTime(state.tournament.updatedAt);
    setAutosaveStatus(savedAt, "saved");
}

export function setAutosaveStatus(message, status = "saved") {
    const container = document.querySelector("#autosave-status");
    const text = document.querySelector("#autosave-status-text");

    if (!container || !text) return;

    text.textContent = message;
    container.dataset.status = status;
    container.setAttribute("aria-busy", String(status === "saving"));

    container.classList.toggle("is-saved", status === "saved");
    container.classList.toggle("is-saving", status === "saving");
    container.classList.toggle("has-error", status === "error");
}

function formatSavedTime(value) {
    if (!value) return "Saved on this device";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Saved on this device";

    const time = new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit"
    }).format(date);

    return `Saved at ${time}`;
}