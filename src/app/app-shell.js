import { getTournamentState, subscribeToTournamentState } from "../state/tournament-store.js";
import { renderAppHeader } from "../components/app-header.js";
import { initializeNotifications } from "../components/notification.js";
import { renderWorkflowStepper } from "../components/workflow-stepper.js";

let initialized = false;
let unsubscribeFromState = null;

export function initializeAppShell() {
    if (initialized) return destroyAppShell;
    initialized = true;
    initializeNotifications();

    const renderShell = state => {
        renderAppHeader(state);
        renderWorkflowStepper(state.workflow?.step);
    };

    renderShell(getTournamentState());
    unsubscribeFromState = subscribeToTournamentState(renderShell);
    return destroyAppShell;
}

export function destroyAppShell() {
    unsubscribeFromState?.();
    unsubscribeFromState = null;
    initialized = false;
}