import { getTournamentState, updateTournamentState } from "../../state/tournament-store.js";

const PLATFORM_NAMES = {
    ps5: "PlayStation 5",
    "playstation-5": "PlayStation 5",
    "xbox-series": "Xbox Series X|S",
    pc: "PC",
    ps4: "PlayStation 4",
    "playstation-4": "PlayStation 4",
    "xbox-one": "Xbox One"
};

let screen;
let matchList;
let roundNotice;
let currentDeadlineInput;
let currentDeadlineError;
let nextRoundPanel;
let nextDeadlineInput;
let nextDeadlineError;
let startNextRoundButton;
let finishTournamentButton;
let activeRoundMessage;
let countdownInterval;
let previewDialog;

export async function mount(container) {
    screen = container;
    const response = await fetch(new URL("./active-round.html", import.meta.url));
    if (!response.ok) throw new Error("The active round template could not be loaded.");

    screen.innerHTML = await response.text();
    matchList = screen.querySelector("#active-match-list");
    roundNotice = screen.querySelector("#round-notice");
    currentDeadlineInput = screen.querySelector("#current-round-deadline");
    currentDeadlineError = screen.querySelector('[data-error-for="deadline"]');
    nextRoundPanel = screen.querySelector("#next-round-panel");
    nextDeadlineInput = screen.querySelector("#next-round-deadline");
    nextDeadlineError = screen.querySelector('[data-error-for="nextRoundDeadline"]');
    startNextRoundButton = screen.querySelector("#start-next-round");
    finishTournamentButton = screen.querySelector("#finish-tournament");
    activeRoundMessage = screen.querySelector("#active-round-message");

    screen.querySelector("#round-deadline-form").addEventListener("submit", handleCurrentDeadlineSubmit);
    screen.querySelector("#open-round-preview").addEventListener("click", openRoundPreview);
    matchList.addEventListener("click", handleMatchListClick);
    nextDeadlineInput.addEventListener("input", handleNextDeadlineInput);
    startNextRoundButton.addEventListener("click", handleStartNextRound);
    finishTournamentButton.addEventListener("click", handleFinishTournament);

    renderActiveRound();
    countdownInterval = window.setInterval(updateCountdown, 1000);
    return unmount;
}

function unmount() {
    window.clearInterval(countdownInterval);
    previewDialog?.remove();
    previewDialog = null;
}

function handleMatchListClick(event) {
    const submitButton = event.target.closest("[data-submit-match]");
    const editButton = event.target.closest("[data-edit-match]");

    if (submitButton) submitMatchResult(submitButton.dataset.submitMatch);
    if (editButton) reopenMatch(editButton.dataset.editMatch);
}

function submitMatchResult(matchId) {
    const card = matchList.querySelector(`[data-match-card="${matchId}"]`);
    const scoreOneInput = card?.querySelector('[data-score-field="score1"]');
    const scoreTwoInput = card?.querySelector('[data-score-field="score2"]');
    if (!card || !scoreOneInput || !scoreTwoInput) return;

    const scoreOne = parseScore(scoreOneInput.value);
    const scoreTwo = parseScore(scoreTwoInput.value);

    clearMatchError(card);

    if (scoreOne === null || scoreTwo === null) {
        showMatchError(card, "Enter two valid whole-number scores.");
        return;
    }

    if (scoreOne === scoreTwo) {
        showMatchError(card, "Knockout matches cannot finish as a draw.");
        return;
    }

    const state = getTournamentState();
    const match = state.matches.find(item => item.id === matchId);

    if (!match?.player1Id || !match?.player2Id) {
        showMatchError(card, "Both players must be assigned before entering a result.");
        return;
    }

    const winnerId = scoreOne > scoreTwo ? match.player1Id : match.player2Id;
    const winner = findPlayer(state, winnerId);
    const now = new Date().toISOString();

    updateTournamentState(current => {
        const matches = current.matches.map(item => ({ ...item }));
        const updatedMatch = matches.find(item => item.id === matchId);
        if (!updatedMatch) return current;

        updatedMatch.score1 = scoreOne;
        updatedMatch.score2 = scoreTwo;
        updatedMatch.winnerId = winnerId;
        updatedMatch.status = "completed";
        updatedMatch.completedAt = now;

        const nextMatch = matches.find(item => item.id === updatedMatch.nextMatchId);
        if (nextMatch && updatedMatch.nextSlot) nextMatch[updatedMatch.nextSlot] = winnerId;

        return {
            ...current,
            matches,
            events: [...current.events, createEvent("match-completed", `${winner?.name ?? "A player"} won Match ${updatedMatch.number} ${scoreOne}–${scoreTwo}.`, { matchId, winnerId, score1: scoreOne, score2: scoreTwo })]
        };
    }, { message: "Match result saved" });

    renderActiveRound();
}

function reopenMatch(matchId) {
    const state = getTournamentState();
    const match = state.matches.find(item => item.id === matchId);
    if (!match || match.isBye) return;

    updateTournamentState(current => {
        const matches = current.matches.map(item => ({ ...item }));
        const updatedMatch = matches.find(item => item.id === matchId);
        if (!updatedMatch) return current;

        const previousWinnerId = updatedMatch.winnerId;
        const nextMatch = matches.find(item => item.id === updatedMatch.nextMatchId);

        if (nextMatch && updatedMatch.nextSlot && nextMatch[updatedMatch.nextSlot] === previousWinnerId) nextMatch[updatedMatch.nextSlot] = null;

        updatedMatch.score1 = null;
        updatedMatch.score2 = null;
        updatedMatch.winnerId = null;
        updatedMatch.status = "pending";
        updatedMatch.completedAt = null;

        return {
            ...current,
            matches,
            events: [...current.events, createEvent("match-reopened", `Match ${updatedMatch.number} was reopened for correction.`, { matchId })]
        };
    }, { message: "Match reopened" });

    renderActiveRound();
}

function handleCurrentDeadlineSubmit(event) {
    event.preventDefault();
    const error = validateFutureDeadline(currentDeadlineInput.value);

    currentDeadlineInput.removeAttribute("aria-invalid");
    currentDeadlineError.textContent = "";

    if (error) {
        currentDeadlineInput.setAttribute("aria-invalid", "true");
        currentDeadlineError.textContent = error;
        return;
    }

    const deadline = convertInputToISOString(currentDeadlineInput.value);
    const state = getTournamentState();
    const currentRound = getCurrentRound(state);
    if (!currentRound) return;

    updateTournamentState(current => ({
        ...current,
        rounds: current.rounds.map(round => round.id === currentRound.id ? { ...round, deadline } : round),
        events: [...current.events, createEvent("round-deadline-updated", `${currentRound.name} deadline was updated.`, { roundId: currentRound.id, deadline })]
    }), { message: "Round deadline updated" });

    updateCountdown();
}

function handleNextDeadlineInput() {
    const state = getTournamentState();
    const currentRound = getCurrentRound(state);
    const nextRound = getNextRound(state, currentRound);
    if (!nextRound) return;

    const deadline = convertInputToISOString(nextDeadlineInput.value);

    updateTournamentState(current => ({
        ...current,
        rounds: current.rounds.map(round => round.id === nextRound.id ? { ...round, deadline } : round)
    }), { message: "Next-stage deadline saved" });

    updateNextRoundValidation();
}

function handleStartNextRound() {
    const state = getTournamentState();
    const currentRound = getCurrentRound(state);
    const nextRound = getNextRound(state, currentRound);
    if (!currentRound || !nextRound || !isRoundComplete(state, currentRound)) return;

    const deadlineError = validateFutureDeadline(nextDeadlineInput.value);

    if (deadlineError) {
        updateNextRoundValidation();
        return;
    }

    const nextMatches = getRoundMatches(state, nextRound);
    const missingPlayers = nextMatches.some(match => !match.player1Id || !match.player2Id);

    if (missingPlayers) {
        nextDeadlineError.textContent = "Some winners have not advanced correctly.";
        startNextRoundButton.disabled = true;
        return;
    }

    const deadline = convertInputToISOString(nextDeadlineInput.value);
    const now = new Date().toISOString();

    updateTournamentState(current => ({
        ...current,
        workflow: { ...current.workflow, currentRoundId: nextRound.id, currentRoundIndex: nextRound.number - 1 },
        rounds: current.rounds.map(round => {
            if (round.id === currentRound.id) return { ...round, status: "completed", completedAt: now };
            if (round.id === nextRound.id) return { ...round, status: "active", deadline, startedAt: now };
            return round;
        }),
        events: [
            ...current.events,
            createEvent("round-completed", `${currentRound.name} was completed.`, { roundId: currentRound.id }),
            createEvent("round-started", `${nextRound.name} started.`, { roundId: nextRound.id, deadline })
        ]
    }), { message: `${nextRound.name} started` });

    renderActiveRound();
    screen.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function handleFinishTournament() {
    const state = getTournamentState();
    const currentRound = getCurrentRound(state);
    const finalMatch = getRoundMatches(state, currentRound)[0];

    if (!currentRound || !isRoundComplete(state, currentRound) || !finalMatch?.winnerId) return;

    const champion = findPlayer(state, finalMatch.winnerId);
    const now = new Date().toISOString();

    updateTournamentState(current => ({
        ...current,
        workflow: { ...current.workflow, step: "tournament-complete" },
        tournament: { ...current.tournament, status: "completed", championId: finalMatch.winnerId, completedAt: now },
        rounds: current.rounds.map(round => round.id === currentRound.id ? { ...round, status: "completed", completedAt: now } : round),
        events: [...current.events, createEvent("tournament-completed", `${champion?.name ?? "The winner"} became the tournament champion.`, { championId: finalMatch.winnerId })]
    }), { message: "Tournament completed" });
}

function renderActiveRound() {
    const state = getTournamentState();
    const currentRound = getCurrentRound(state);

    if (!currentRound) {
        roundNotice.className = "round-notice has-error";
        roundNotice.textContent = "The current tournament stage could not be found.";
        matchList.replaceChildren();
        return;
    }

    const matches = getRoundMatches(state, currentRound);
    const completedMatches = matches.filter(match => match.status === "completed");
    const progress = matches.length ? Math.round(completedMatches.length / matches.length * 100) : 0;

    screen.querySelector("#active-round-title").textContent = `${currentRound.name} in progress`;
    screen.querySelector("#active-round-description").textContent = `Enter the ${currentRound.name.toLowerCase()} results to advance each winner automatically.`;
    screen.querySelector("#current-round-name").textContent = currentRound.name;
    screen.querySelector("#current-round-match-count").textContent = String(matches.length);
    screen.querySelector("#completed-match-count").textContent = String(completedMatches.length);
    screen.querySelector("#round-progress-label").textContent = `${completedMatches.length} of ${matches.length} completed`;
    screen.querySelector("#round-progress-bar").style.width = `${progress}%`;
    currentDeadlineInput.value = convertISOStringToInput(currentRound.deadline);
    matchList.replaceChildren(...matches.map(match => createMatchCard(state, match)));

    renderRoundNotice(matches, completedMatches.length);
    renderNextRoundPanel(state, currentRound);
    updateCountdown();
}

function createMatchCard(state, match) {
    const playerOne = findPlayer(state, match.player1Id);
    const playerTwo = findPlayer(state, match.player2Id);
    const completed = match.status === "completed";
    const card = createElement("article", `active-match-card${completed ? " is-completed" : ""}${match.isBye ? " is-bye" : ""}`);

    card.dataset.matchCard = match.id;

    const header = createElement("header", "active-match-card__header");
    const number = createElement("span", "active-match-card__number", `Match ${match.number}`);
    const status = createElement("span", "active-match-card__status", getMatchStatus(match));
    const players = createElement("div", "active-match-card__players");
    const versus = createElement("div", "active-match-card__versus", "VS");
    const footer = createElement("footer", "active-match-card__footer");
    const error = createElement("span", "active-match-card__error");
    const actions = createElement("div", "active-match-card__actions");

    header.append(number, status);
    players.append(createPlayerRow(match, playerOne, "player1Id", "score1", "A"), versus, createPlayerRow(match, playerTwo, "player2Id", "score2", "B"));

    if (!match.isBye && completed) {
        const editButton = createElement("button", "button button--secondary", "Edit result");
        editButton.type = "button";
        editButton.dataset.editMatch = match.id;
        actions.append(editButton);
    }

    if (!match.isBye && !completed) {
        const submitButton = createElement("button", "button button--primary", "Confirm result");
        submitButton.type = "button";
        submitButton.dataset.submitMatch = match.id;
        submitButton.disabled = !playerOne || !playerTwo;
        actions.append(submitButton);
    }

    if (match.isBye) error.textContent = `${playerOne?.name ?? playerTwo?.name ?? "Player"} advanced automatically.`;
    if (!playerOne && !playerTwo) error.textContent = "Waiting for players from the previous stage.";

    footer.append(error, actions);
    card.append(header, players, footer);
    return card;
}

function createPlayerRow(match, player, playerField, scoreField, position) {
    const row = createElement("div", `active-match-player${match.winnerId && match.winnerId === player?.id ? " is-winner" : ""}`);
    const marker = createElement("span", "active-match-player__position", position);
    const identity = createElement("div", "active-match-player__identity");
    const name = createElement("strong", "", player?.name ?? "BYE");
    const platform = createElement("small", "", player ? getPlatformName(player.console) : "Automatic advance");
    const score = document.createElement("input");

    score.className = "active-match-player__score";
    score.type = "number";
    score.min = "0";
    score.max = "99";
    score.step = "1";
    score.inputMode = "numeric";
    score.dataset.scoreField = scoreField;
    score.value = match[scoreField] ?? "";
    score.placeholder = "—";
    score.disabled = match.status === "completed" || !player || match.isBye;
    score.setAttribute("aria-label", `${player?.name ?? position} score`);
    score.dataset.playerField = playerField;

    identity.append(name, platform);
    row.append(marker, identity, score);
    return row;
}

function renderRoundNotice(matches, completedCount) {
    const remaining = matches.length - completedCount;
    roundNotice.className = `round-notice${remaining ? "" : " is-success"}`;

    if (!remaining) {
        roundNotice.textContent = "Every match is complete. The winners have advanced automatically.";
        return;
    }

    roundNotice.textContent = `${remaining} match${remaining === 1 ? "" : "es"} remaining in this stage.`;
}

function renderNextRoundPanel(state, currentRound) {
    const complete = isRoundComplete(state, currentRound);
    const nextRound = getNextRound(state, currentRound);

    nextRoundPanel.hidden = !complete || !nextRound;
    finishTournamentButton.hidden = !complete || Boolean(nextRound);

    if (!complete) {
        activeRoundMessage.textContent = "Complete every match to continue.";
        return;
    }

    if (!nextRound) {
        activeRoundMessage.textContent = "The final is complete. Confirm the tournament champion.";
        return;
    }

    screen.querySelector("#next-round-name").textContent = nextRound.name;
    screen.querySelector("#next-round-match-count").textContent = `${nextRound.matchIds.length} match${nextRound.matchIds.length === 1 ? "" : "es"}`;
    screen.querySelector("#next-round-description").textContent = `The ${currentRound.name.toLowerCase()} winners have advanced automatically.`;
    nextDeadlineInput.value = convertISOStringToInput(nextRound.deadline);
    activeRoundMessage.textContent = `Set the ${nextRound.name.toLowerCase()} deadline to continue.`;
    updateNextRoundValidation();
}

function updateNextRoundValidation() {
    if (nextRoundPanel.hidden) return;

    const error = validateFutureDeadline(nextDeadlineInput.value);
    nextDeadlineInput.removeAttribute("aria-invalid");
    nextDeadlineError.textContent = "";

    if (error) {
        nextDeadlineInput.setAttribute("aria-invalid", "true");
        nextDeadlineError.textContent = error;
    }

    startNextRoundButton.disabled = Boolean(error);
}

function updateCountdown() {
    if (!screen?.isConnected) return;

    const state = getTournamentState();
    const currentRound = getCurrentRound(state);
    const countdown = screen.querySelector("#deadline-countdown");
    const status = screen.querySelector("#deadline-status");
    const summary = screen.querySelector(".round-summary__item--deadline");
    const deadline = currentRound?.deadline;

    summary?.classList.remove("is-warning", "is-expired");
    status?.classList.remove("is-active", "is-warning", "is-expired");

    if (!deadline) {
        countdown.textContent = "Not set";
        status.textContent = "Not set";
        return;
    }

    const difference = new Date(deadline).getTime() - Date.now();

    if (difference <= 0) {
        countdown.textContent = "Expired";
        status.textContent = "Deadline passed";
        summary?.classList.add("is-expired");
        status?.classList.add("is-expired");
        return;
    }

    countdown.textContent = formatDuration(difference);
    status.textContent = `Ends ${formatDate(deadline)}`;

    if (difference <= 24 * 60 * 60 * 1000) {
        summary?.classList.add("is-warning");
        status?.classList.add("is-warning");
    } else {
        status?.classList.add("is-active");
    }
}

function openRoundPreview() {
    previewDialog?.remove();

    const state = getTournamentState();
    const currentRound = getCurrentRound(state);
    const matches = getRoundMatches(state, currentRound);
    const section = screen.querySelector(".active-round");
    if (!section || !currentRound || !matches.length) return;

    const dialog = createElement("dialog", "round-preview-dialog");
    const preview = createElement("section", "round-preview");
    const header = createElement("header", "round-preview__header");
    const heading = document.createElement("div");
    const title = createElement("h2", "", currentRound.name);
    const deadline = createElement("p", "", currentRound.deadline ? `Deadline: ${formatDate(currentRound.deadline)}` : "Deadline not set");
    const closeButton = createElement("button", "button button--secondary", "Close");
    const previewMatches = createElement("div", "round-preview__matches");

    closeButton.type = "button";
    closeButton.addEventListener("click", () => dialog.close());

    matches.forEach(match => {
        const card = createElement("article", "round-preview-match");
        const matchTitle = createElement("div", "round-preview-match__title", `Match ${match.number}`);
        const playerOne = createPreviewPlayer(findPlayer(state, match.player1Id), match.score1, match.winnerId);
        const playerTwo = createPreviewPlayer(findPlayer(state, match.player2Id), match.score2, match.winnerId);
        card.append(matchTitle, playerOne, playerTwo);
        previewMatches.append(card);
    });

    heading.append(title, deadline);
    header.append(heading, closeButton);
    preview.append(header, previewMatches);
    dialog.append(preview);
    section.append(dialog);

    dialog.addEventListener("close", () => {
        dialog.remove();
        if (previewDialog === dialog) previewDialog = null;
    }, { once: true });

    previewDialog = dialog;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
}

function createPreviewPlayer(player, score, winnerId) {
    const row = createElement("div", `round-preview-match__player${player?.id === winnerId ? " is-winner" : ""}`);
    const identity = document.createElement("div");
    const name = createElement("strong", "", player?.name ?? "BYE");
    const platform = createElement("small", "", player ? getPlatformName(player.console) : "Automatic advance");
    const scoreElement = createElement("span", "round-preview-match__score", player ? String(score ?? "—") : "BYE");

    identity.append(name, platform);
    row.append(identity, scoreElement);
    return row;
}

function getCurrentRound(state) {
    const currentRoundId = state.workflow?.currentRoundId;
    const byId = state.rounds.find(round => round.id === currentRoundId);
    if (byId) return byId;

    const activeRound = state.rounds.find(round => round.status === "active");
    if (activeRound) return activeRound;

    const index = Number(state.workflow?.currentRoundIndex ?? 0);
    return [...state.rounds].sort((a, b) => a.number - b.number)[index] ?? null;
}

function getNextRound(state, currentRound) {
    if (!currentRound) return null;
    return state.rounds.find(round => round.number === currentRound.number + 1) ?? null;
}

function getRoundMatches(state, round) {
    if (!round) return [];
    return round.matchIds.map(matchId => state.matches.find(match => match.id === matchId)).filter(Boolean).sort((a, b) => a.number - b.number);
}

function isRoundComplete(state, round) {
    const matches = getRoundMatches(state, round);
    return Boolean(matches.length) && matches.every(match => match.status === "completed" && match.winnerId);
}

function findPlayer(state, playerId) {
    return state.players.find(player => player.id === playerId) ?? null;
}

function getMatchStatus(match) {
    if (match.isBye) return "Automatic bye";
    if (match.status === "completed") return "Completed";
    if (!match.player1Id || !match.player2Id) return "Waiting";
    return "Score required";
}

function showMatchError(card, message) {
    card.classList.add("has-error");
    card.querySelector(".active-match-card__error").textContent = message;
    card.querySelectorAll(".active-match-player__score").forEach(input => input.setAttribute("aria-invalid", "true"));
}

function clearMatchError(card) {
    card.classList.remove("has-error");
    card.querySelector(".active-match-card__error").textContent = "";
    card.querySelectorAll(".active-match-player__score").forEach(input => input.removeAttribute("aria-invalid"));
}

function parseScore(value) {
    if (!/^\d+$/.test(value)) return null;
    const score = Number(value);
    return Number.isInteger(score) && score >= 0 && score <= 99 ? score : null;
}

function validateFutureDeadline(value) {
    if (!value) return "Select a deadline.";
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return "Select a valid deadline.";
    if (time <= Date.now()) return "The deadline must be in the future.";
    return "";
}

function getPlatformName(consoleName) {
    return PLATFORM_NAMES[consoleName] ?? consoleName ?? "Unknown platform";
}

function createEvent(type, message, metadata = {}) {
    return { id: createId("event"), type, message, metadata, createdAt: new Date().toISOString() };
}

function createId(prefix) {
    return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function createElement(tagName, className = "", text = "") {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
}

function convertInputToISOString(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function convertISOStringToInput(value) {
    if (!value) return "";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 16);
}

function formatDate(value) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDuration(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor(totalSeconds % 86400 / 3600);
    const minutes = Math.floor(totalSeconds % 3600 / 60);
    const seconds = totalSeconds % 60;

    if (days) return `${days}d ${hours}h`;
    if (hours) return `${hours}h ${minutes}m`;
    return `${minutes}m ${seconds}s`;
}