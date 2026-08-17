import { STATE_VERSION, createInitialTournamentState } from "./initial-state.js";

const VALID_WORKFLOW_STEPS = new Set(["player-setup", "bracket-setup", "active-round", "tournament-complete"]);

export function migrateTournamentState(savedState) {
    const fallback = createInitialTournamentState();
    if (!isObject(savedState)) return fallback;

    const players = Array.isArray(savedState.players) ? savedState.players : [];
    const rounds = Array.isArray(savedState.rounds) ? savedState.rounds : [];
    const matches = Array.isArray(savedState.matches) ? savedState.matches : [];
    const events = Array.isArray(savedState.events) ? savedState.events : [];
    const tournament = { ...fallback.tournament, ...safeObject(savedState.tournament) };
    const settings = { ...fallback.settings, ...safeObject(savedState.settings) };
    const bracket = normalizeBracket(savedState.bracket, tournament, players, rounds);
    const workflow = normalizeWorkflow(savedState.workflow, tournament, bracket, rounds);

    return {
        ...fallback,
        ...savedState,
        version: STATE_VERSION,
        workflow,
        tournament,
        settings,
        players,
        bracket,
        rounds,
        matches,
        events
    };
}

function normalizeWorkflow(savedWorkflow, tournament, bracket, rounds) {
    const workflow = safeObject(savedWorkflow);
    const activeRound = rounds.find(round => round.status === "active");
    const completed = tournament.status === "completed" || Boolean(tournament.championId);
    const active = tournament.status === "active" || Boolean(activeRound) || bracket.isLocked;
    let step = VALID_WORKFLOW_STEPS.has(workflow.step) ? workflow.step : inferWorkflowStep(bracket, rounds);

    if (completed) step = "tournament-complete";
    else if (active) step = "active-round";

    const savedRound = rounds.find(round => round.id === workflow.currentRoundId);
    const currentRound = savedRound ?? activeRound ?? rounds[Number(workflow.currentRoundIndex) || 0] ?? null;
    const currentRoundIndex = currentRound ? Math.max(0, rounds.findIndex(round => round.id === currentRound.id)) : 0;

    return {
        ...workflow,
        step,
        currentRoundId: currentRound?.id ?? null,
        currentRoundIndex
    };
}

function normalizeBracket(savedBracket, tournament, players, rounds) {
    const bracket = safeObject(savedBracket);
    const firstRound = [...rounds].sort((a, b) => a.number - b.number)[0];
    const inferredSize = firstRound?.matchIds?.length ? firstRound.matchIds.length * 2 : 0;
    const tournamentStarted = tournament.status === "active" || tournament.status === "completed";

    return {
        isGenerated: bracket.isGenerated ?? rounds.length > 0,
        isLocked: bracket.isLocked ?? tournamentStarted,
        size: Number(bracket.size) || inferredSize,
        roundIds: Array.isArray(bracket.roundIds) ? bracket.roundIds : rounds.map(round => round.id),
        playerSignature: bracket.playerSignature ?? players.filter(player => player.status !== "removed").map(player => player.id).sort().join("|"),
        generatedAt: bracket.generatedAt ?? null,
        lockedAt: bracket.lockedAt ?? tournament.startedAt ?? null
    };
}

function inferWorkflowStep(bracket, rounds) {
    if (rounds.some(round => round.status === "active")) return "active-round";
    if (bracket.isGenerated || rounds.length) return "bracket-setup";
    return "player-setup";
}

function safeObject(value) {
    return isObject(value) ? value : {};
}

function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}