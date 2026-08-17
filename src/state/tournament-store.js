import { createInitialTournamentState } from "./initial-state.js";
import { migrateTournamentState } from "./migrations.js";
import {
    loadPersistedTournament,
    savePersistedTournament,
    clearPersistedTournament
} from "./persistence.js";

let tournamentState = createInitialTournamentState();
let initialized = false;

const subscribers = new Set();

export function initializeStore() {
    if (initialized) return getTournamentState();

    initialized = true;
    tournamentState = loadPersistedTournament() || tournamentState;
    savePersistedTournament(tournamentState);

    return getTournamentState();
}

export function getTournamentState() {
    return cloneValue(tournamentState);
}

export function updateTournamentState(updater, options = {}) {
    if (!initialized) initializeStore();

    const currentState = getTournamentState();
    const updatedState = typeof updater === "function" ? updater(currentState) : updater;

    if (!updatedState || typeof updatedState !== "object") {
        throw new TypeError("Tournament state updates must return an object.");
    }

    const nextState = migrateTournamentState({
        ...updatedState,
        tournament: {
            ...updatedState.tournament,
            updatedAt: new Date().toISOString()
        }
    });

    savePersistedTournament(nextState);
    tournamentState = nextState;

    notifySubscribers();
    dispatchStateEvent("tournament:state-changed", getTournamentState());
    dispatchStateEvent("tournament:autosaved", {
        message: options.message || "Saved on this device",
        savedAt: tournamentState.tournament.updatedAt
    });

    return getTournamentState();
}

export function subscribeToTournamentState(callback) {
    if (typeof callback !== "function") {
        throw new TypeError("The tournament subscriber must be a function.");
    }

    subscribers.add(callback);
    return () => subscribers.delete(callback);
}

export function resetTournamentState() {
    const newState = createInitialTournamentState();

    clearPersistedTournament();
    savePersistedTournament(newState);

    tournamentState = newState;
    initialized = true;

    notifySubscribers();
    dispatchStateEvent("tournament:state-changed", getTournamentState());
    dispatchStateEvent("tournament:reset", getTournamentState());

    return getTournamentState();
}

function notifySubscribers() {
    const snapshot = getTournamentState();

    subscribers.forEach((callback) => {
        try {
            callback(snapshot);
        } catch (error) {
            console.error("Tournament subscriber failed.", error);
        }
    });
}

function dispatchStateEvent(eventName, detail) {
    if (typeof document === "undefined" || typeof CustomEvent === "undefined") return;
    document.dispatchEvent(new CustomEvent(eventName, { detail }));
}

function cloneValue(value) {
    if (globalThis.structuredClone) return globalThis.structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}