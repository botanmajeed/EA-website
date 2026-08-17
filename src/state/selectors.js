import { DEFAULT_WORKFLOW_STEP, isWorkflowStep } from "../app/workflow-steps.js";

export function selectWorkflowStep(state) {
    return isWorkflowStep(state.workflow?.step) ? state.workflow.step : DEFAULT_WORKFLOW_STEP;
}

export function selectActivePlayers(state) {
    return state.players.filter((player) => player.status !== "removed");
}

export function selectPlayerCount(state) {
    return selectActivePlayers(state).length;
}

export function selectPlayerById(state, playerId) {
    return state.players.find((player) => player.id === playerId) || null;
}

export function selectPlayersByConsole(state, consoleName) {
    return selectActivePlayers(state).filter((player) => player.console === consoleName);
}

export function selectCanContinueFromPlayerSetup(state) {
    return selectPlayerCount(state) >= 2;
}

export function selectCurrentRound(state) {
    const currentRoundId = state.workflow?.currentRoundId;
    if (!currentRoundId) return null;

    return state.rounds.find((round) => round.id === currentRoundId) || null;
}

export function selectRoundById(state, roundId) {
    return state.rounds.find((round) => round.id === roundId) || null;
}

export function selectRoundMatches(state, roundId) {
    return state.matches
        .filter((match) => match.roundId === roundId)
        .sort((firstMatch, secondMatch) => firstMatch.position - secondMatch.position);
}

export function selectCurrentRoundMatches(state) {
    const currentRound = selectCurrentRound(state);
    return currentRound ? selectRoundMatches(state, currentRound.id) : [];
}

export function selectCompletedMatches(state) {
    return state.matches.filter((match) => match.status === "completed");
}

export function selectPendingMatches(state) {
    return state.matches.filter((match) => ["pending", "scheduled"].includes(match.status));
}

export function selectIsRoundComplete(state, roundId) {
    const matches = selectRoundMatches(state, roundId);

    return matches.length > 0 && matches.every((match) => {
        return match.status === "completed" || match.status === "bye";
    });
}

export function selectCanStartCurrentRound(state) {
    const round = selectCurrentRound(state);
    if (!round?.deadline) return false;

    const matches = selectRoundMatches(state, round.id);
    if (matches.length === 0) return false;

    return matches.every((match) => {
        if (match.status === "bye") return Boolean(match.playerOneId || match.playerTwoId);
        return Boolean(match.playerOneId && match.playerTwoId);
    });
}

export function selectNextIncompleteMatch(state) {
    return selectCurrentRoundMatches(state).find((match) => {
        return !["completed", "bye"].includes(match.status);
    }) || null;
}

export function selectChampion(state) {
    return selectPlayerById(state, state.tournament.championId);
}

export function selectTournamentProgress(state) {
    const playableMatches = state.matches.filter((match) => match.status !== "bye");
    const completedMatches = playableMatches.filter((match) => match.status === "completed");
    const total = playableMatches.length;
    const completed = completedMatches.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, percentage };
}