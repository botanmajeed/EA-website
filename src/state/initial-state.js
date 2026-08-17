export const STATE_VERSION = 2;

export function createInitialTournamentState() {
    const now = new Date().toISOString();

    return {
        version: STATE_VERSION,
        workflow: {
            step: "player-setup",
            currentRoundId: null,
            currentRoundIndex: 0
        },
        tournament: {
            id: createTournamentId(),
            name: "EAKurd Knockout Tournament",
            format: "single-elimination",
            status: "setup",
            createdAt: now,
            updatedAt: now,
            startedAt: null,
            completedAt: null,
            championId: null
        },
        settings: {
            automaticPairing: true,
            prioritizeCrossPlatform: true,
            allowManualPairing: true
        },
        players: [],
        bracket: {
            isGenerated: false,
            isLocked: false,
            size: 0,
            roundIds: [],
            playerSignature: "",
            generatedAt: null,
            lockedAt: null
        },
        rounds: [],
        matches: [],
        events: []
    };
}

function createTournamentId() {
    return `tournament-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}