import { migrateTournamentState } from "./migrations.js";

export const TOURNAMENT_STORAGE_KEY = "eakurd-knockout-tournament";

export function loadPersistedTournament() {
    if (!isStorageAvailable()) return null;

    const savedValue = localStorage.getItem(TOURNAMENT_STORAGE_KEY);
    if (!savedValue) return null;

    try {
        return migrateTournamentState(JSON.parse(savedValue));
    } catch (error) {
        console.error("Unable to load the saved tournament.", error);
        return null;
    }
}

export function savePersistedTournament(state) {
    if (!isStorageAvailable()) throw new Error("Browser storage is unavailable.");

    try {
        localStorage.setItem(TOURNAMENT_STORAGE_KEY, JSON.stringify(state));
        return state.tournament.updatedAt;
    } catch (error) {
        if (isStorageQuotaError(error)) throw new Error("Browser storage is full.");
        throw error;
    }
}

export function clearPersistedTournament() {
    if (!isStorageAvailable()) return false;

    localStorage.removeItem(TOURNAMENT_STORAGE_KEY);
    return true;
}

export function hasPersistedTournament() {
    if (!isStorageAvailable()) return false;
    return localStorage.getItem(TOURNAMENT_STORAGE_KEY) !== null;
}

function isStorageAvailable() {
    const testKey = `${TOURNAMENT_STORAGE_KEY}-test`;

    try {
        localStorage.setItem(testKey, "test");
        localStorage.removeItem(testKey);
        return true;
    } catch {
        return false;
    }
}

function isStorageQuotaError(error) {
    return error instanceof DOMException && [
        "QuotaExceededError",
        "NS_ERROR_DOM_QUOTA_REACHED"
    ].includes(error.name);
}