import { getTournamentState, subscribeToTournamentState } from "../state/tournament-store.js";

import { selectWorkflowStep } from "../state/selectors.js";

const screenModules = {
    "player-setup": () => import("../features/player-setup/player-setup.js"),
    "bracket-setup": () => import("../features/bracket-setup/bracket-setup.js"),
    "active-round": () => import("../features/active-round/active-round.js"),
    "tournament-complete": () => import("../features/tournament-complete/tournament-complete.js")
};

let initialized = false;
let activeStepId = null;
let cleanupActiveScreen = null;
let unsubscribeFromState = null;
let renderSequence = 0;

export async function initializeWorkflow() {
    if (initialized) return;

    initialized = true;

    const initialState = getTournamentState();
    await renderWorkflowScreen(selectWorkflowStep(initialState));

    unsubscribeFromState = subscribeToTournamentState((state) => {
        const nextStepId = selectWorkflowStep(state);
        if (nextStepId !== activeStepId) renderWorkflowScreen(nextStepId);
    });

    return destroyWorkflow;
}

async function renderWorkflowScreen(stepId) {
    const container = document.querySelector("#workflow-screen");
    if (!container) throw new Error("The workflow screen container is missing.");

    const loadScreenModule = screenModules[stepId];
    if (!loadScreenModule) throw new Error(`Unknown workflow step: ${stepId}`);

    const currentSequence = ++renderSequence;

    cleanupActiveScreen?.();
    cleanupActiveScreen = null;
    activeStepId = stepId;

    container.innerHTML = '<div class="screen-loader" role="status">Loading tournament step…</div>';

    try {
        const screenModule = await loadScreenModule();
        if (currentSequence !== renderSequence) return;

        if (typeof screenModule.mount !== "function") {
            throw new TypeError(`The ${stepId} screen does not export a mount function.`);
        }

        cleanupActiveScreen = await screenModule.mount(container);
        container.focus({ preventScroll: true });
        window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
        console.error(`Unable to load the ${stepId} screen.`, error);
        renderScreenError(container);
    }
}

function renderScreenError(container) {
    container.innerHTML = `
        <section class="fatal-error" role="alert">
            <h1>This tournament step could not be loaded</h1>
            <p>Your progress is still saved. Refresh the page to try again.</p>
            <button class="button button--primary" type="button" data-refresh-screen>Refresh page</button>
        </section>
    `;

    container.querySelector("[data-refresh-screen]")?.addEventListener("click", () => window.location.reload());
}

function destroyWorkflow() {
    renderSequence++;
    cleanupActiveScreen?.();
    unsubscribeFromState?.();

    cleanupActiveScreen = null;
    unsubscribeFromState = null;
    activeStepId = null;
    initialized = false;
}