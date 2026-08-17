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

const PLATFORM_GROUPS = {
    ps5: "current",
    "playstation-5": "current",
    "xbox-series": "current",
    pc: "current",
    ps4: "previous",
    "playstation-4": "previous",
    "xbox-one": "previous"
};

let screen;
let deadlineInput;
let deadlineError;
let priorityInput;
let matchups;
let notice;
let startButton;
let setupMessage;
let previewDialog;

export async function mount(container) {
    screen = container;
    const response = await fetch(new URL("./bracket-setup.html", import.meta.url));
    if (!response.ok) throw new Error("The bracket setup template could not be loaded.");

    screen.innerHTML = await response.text();
    deadlineInput = screen.querySelector("#round-deadline");
    deadlineError = screen.querySelector('[data-error-for="deadline"]');
    priorityInput = screen.querySelector("#prioritize-cross-platform");
    matchups = screen.querySelector("#bracket-matchups");
    notice = screen.querySelector("#bracket-notice");
    startButton = screen.querySelector("#start-tournament");
    setupMessage = screen.querySelector("#bracket-setup-message");

    screen.querySelector("#regenerate-bracket").addEventListener("click", handleRegenerate);
    screen.querySelector("#back-to-players").addEventListener("click", handleBack);
    screen.querySelector("#open-bracket-preview").addEventListener("click", openBracketPreview);
    deadlineInput.addEventListener("input", handleDeadlineInput);
    priorityInput.addEventListener("change", handlePriorityChange);
    matchups.addEventListener("change", handlePairingChange);
    startButton.addEventListener("click", handleStartTournament);

    initializeBracket();
    renderBracket();
    return unmount;
}

function unmount() {
    previewDialog?.remove();
    previewDialog = null;
}

function initializeBracket() {
    const state = getTournamentState();
    const players = getActivePlayers(state);

    if (players.length < 2) return;

    priorityInput.checked = state.settings?.prioritizeCrossPlatform !== false;
    if (!hasCurrentBracket(state, players)) updateTournamentState(current => generateBracketState(current, false), { message: "Bracket generated automatically" });
}

function handleRegenerate() {
    updateTournamentState(current => generateBracketState(current, true), { message: "Bracket regenerated" });
    renderBracket();
}

function handlePriorityChange() {
    updateTournamentState(current => ({
        ...current,
        settings: { ...current.settings, prioritizeCrossPlatform: priorityInput.checked }
    }), { message: "Pairing preference saved" });

    notice.className = "bracket-notice";
    notice.textContent = "Pairing preference changed. Press “Regenerate bracket” to apply it.";
}

function handleDeadlineInput() {
    const deadline = convertInputToISOString(deadlineInput.value);
    const state = getTournamentState();
    const firstRound = getFirstRound(state);

    if (firstRound) {
        updateTournamentState(current => ({
            ...current,
            rounds: current.rounds.map(round => round.id === firstRound.id ? { ...round, deadline } : round)
        }), { message: "Round deadline saved" });
    }

    updateValidation();
}

function handlePairingChange(event) {
    const select = event.target.closest("[data-match-id][data-slot]");
    if (!select) return;

    const playerId = select.value || null;
    updateTournamentState(current => swapBracketPlayer(current, select.dataset.matchId, select.dataset.slot, playerId), { message: "Bracket pairing updated" });
    renderBracket();
}

function handleBack() {
    updateTournamentState(current => ({
        ...current,
        workflow: { ...current.workflow, step: "player-setup" }
    }));
}

function handleStartTournament() {
    const state = getTournamentState();
    const validation = validateBracket(state);

    if (!validation.isValid) {
        updateValidation();
        return;
    }

    const firstRound = getFirstRound(state);
    const now = new Date().toISOString();

    updateTournamentState(current => ({
        ...current,
        workflow: { ...current.workflow, step: "active-round", currentRoundId: firstRound.id, currentRoundIndex: 0 },
        tournament: { ...current.tournament, status: "active", startedAt: current.tournament.startedAt ?? now },
        bracket: { ...current.bracket, isLocked: true, lockedAt: now },
        rounds: current.rounds.map(round => ({ ...round, status: round.id === firstRound.id ? "active" : "pending" })),
        events: [...current.events, createEvent("tournament-started", `${firstRound.name} started.`, { roundId: firstRound.id })]
    }), { message: "Tournament started" });
}

function renderBracket() {
    const state = getTournamentState();
    const players = getActivePlayers(state);
    const firstRound = getFirstRound(state);
    const firstRoundMatches = getRoundMatches(state, firstRound);

    screen.querySelector("#bracket-player-count").textContent = String(players.length);
    screen.querySelector("#bracket-size").textContent = state.bracket?.size ? String(state.bracket.size) : "—";
    screen.querySelector("#bracket-match-count").textContent = String(firstRoundMatches.length);
    screen.querySelector("#bracket-bye-count").textContent = String(Math.max(0, (state.bracket?.size ?? 0) - players.length));
    priorityInput.checked = state.settings?.prioritizeCrossPlatform !== false;
    deadlineInput.value = convertISOStringToInput(firstRound?.deadline);
    matchups.replaceChildren(...firstRoundMatches.map(match => createMatchCard(match, players)));

    renderBracketNotice(firstRoundMatches, players);
    updateValidation();
}

function createMatchCard(match, players) {
    const playerOne = findPlayer(players, match.player1Id);
    const playerTwo = findPlayer(players, match.player2Id);
    const isBye = Boolean(playerOne) !== Boolean(playerTwo);
    const compatible = isBye || arePlayersCompatible(playerOne, playerTwo);

    const card = createElement("article", `bracket-match-card${isBye ? " bracket-bye-card" : ""}${compatible ? "" : " has-error"}`);
    const header = createElement("header", "bracket-match-card__header");
    const number = createElement("span", "bracket-match-card__number", `Match ${match.number}`);
    const status = createElement("span", `bracket-match-card__status${compatible ? "" : " is-warning"}`, isBye ? "Automatic bye" : compatible ? "Compatible" : "Check platforms");
    const playersContainer = createElement("div", "bracket-match-card__players");
    const versus = createElement("div", "bracket-match-card__versus", "VS");
    const compatibility = createElement("footer", `bracket-compatibility ${compatible ? "is-compatible" : "is-incompatible"}`);

    header.append(number, status);
    playersContainer.append(createPlayerSlot(match, "player1Id", "A", players), versus, createPlayerSlot(match, "player2Id", "B", players));
    compatibility.textContent = getCompatibilityMessage(playerOne, playerTwo);
    card.append(header, playersContainer, compatibility);
    return card;
}

function createPlayerSlot(match, slot, position, players) {
    const wrapper = createElement("label", "bracket-player-slot");
    const marker = createElement("span", "bracket-player-slot__position", position);
    const select = document.createElement("select");

    select.dataset.matchId = match.id;
    select.dataset.slot = slot;
    select.setAttribute("aria-label", `Match ${match.number}, player ${position}`);

    const byeOption = document.createElement("option");
    byeOption.value = "";
    byeOption.textContent = "BYE — automatic advance";
    select.append(byeOption);

    players.forEach(player => {
        const option = document.createElement("option");
        option.value = player.id;
        option.textContent = `${player.name} — ${getPlatformName(player.console)}`;
        option.selected = player.id === match[slot];
        select.append(option);
    });

    if (!match[slot]) byeOption.selected = true;
    wrapper.append(marker, select);
    return wrapper;
}

function renderBracketNotice(matches, players) {
    const incompatibleMatches = matches.filter(match => {
        const playerOne = findPlayer(players, match.player1Id);
        const playerTwo = findPlayer(players, match.player2Id);
        return playerOne && playerTwo && !arePlayersCompatible(playerOne, playerTwo);
    });

    notice.className = `bracket-notice ${incompatibleMatches.length ? "has-error" : "is-success"}`;

    if (incompatibleMatches.length) {
        notice.textContent = `${incompatibleMatches.length} matchup${incompatibleMatches.length === 1 ? "" : "s"} may not support cross-play. You can adjust them manually.`;
        return;
    }

    const byeCount = matches.filter(match => Boolean(match.player1Id) !== Boolean(match.player2Id)).length;
    notice.textContent = byeCount ? `All matchups are compatible. ${byeCount} player${byeCount === 1 ? " receives" : "s receive"} an automatic bye.` : "All matchups are compatible and ready.";
}

function updateValidation() {
    const validation = validateBracket(getTournamentState());
    deadlineInput.removeAttribute("aria-invalid");
    deadlineError.textContent = "";

    if (validation.deadlineError) {
        deadlineInput.setAttribute("aria-invalid", "true");
        deadlineError.textContent = validation.deadlineError;
    }

    startButton.disabled = !validation.isValid;
    setupMessage.textContent = validation.message;
}

function validateBracket(state) {
    const players = getActivePlayers(state);
    const firstRound = getFirstRound(state);
    const matches = getRoundMatches(state, firstRound);
    const assignments = matches.flatMap(match => [match.player1Id, match.player2Id]).filter(Boolean);
    const uniqueAssignments = new Set(assignments);
    const hasEmptyMatch = matches.some(match => !match.player1Id && !match.player2Id);

    if (players.length < 2) return invalidValidation("Add at least two players before creating the bracket.");
    if (!matches.length) return invalidValidation("Generate the knockout bracket before continuing.");
    if (hasEmptyMatch || assignments.length !== players.length || uniqueAssignments.size !== players.length) return invalidValidation("Every player must appear exactly once in the first round.");
    if (!firstRound?.deadline) return invalidValidation("Set the first-round deadline before starting.", "Select a deadline.");

    const deadlineTime = new Date(firstRound.deadline).getTime();
    if (!Number.isFinite(deadlineTime) || deadlineTime <= Date.now()) return invalidValidation("The first-round deadline must be in the future.", "Select a future deadline.");

    return { isValid: true, message: "The bracket is ready. Start the tournament when you have reviewed every matchup.", deadlineError: "" };
}

function invalidValidation(message, deadlineError = "") {
    return { isValid: false, message, deadlineError };
}

function generateBracketState(state, randomize) {
    const players = getActivePlayers(state);
    if (players.length < 2) return state;

    const bracketSize = getNextPowerOfTwo(players.length);
    const totalRounds = Math.log2(bracketSize);
    const firstRoundMatchCount = bracketSize / 2;
    const byeCount = bracketSize - players.length;
    const prioritizeCompatibility = state.settings?.prioritizeCrossPlatform !== false;
    const existingDeadline = getFirstRound(state)?.deadline ?? null;
    const entries = createFirstRoundEntries(players, byeCount, prioritizeCompatibility, randomize);
    const rounds = [];
    const matches = [];

    for (let roundNumber = 1; roundNumber <= totalRounds; roundNumber += 1) {
        const roundId = createId("round");
        const matchCount = bracketSize / 2 ** roundNumber;
        const round = {
            id: roundId,
            number: roundNumber,
            name: getRoundName(roundNumber, totalRounds),
            status: roundNumber === 1 ? "setup" : "pending",
            deadline: roundNumber === 1 ? existingDeadline : null,
            matchIds: []
        };

        for (let matchIndex = 0; matchIndex < matchCount; matchIndex += 1) {
            const match = {
                id: createId("match"),
                roundId,
                roundNumber,
                number: matchIndex + 1,
                player1Id: null,
                player2Id: null,
                score1: null,
                score2: null,
                winnerId: null,
                status: "pending",
                isBye: false,
                nextMatchId: null,
                nextSlot: null,
                sourceMatchIds: []
            };

            round.matchIds.push(match.id);
            matches.push(match);
        }

        rounds.push(round);
    }

    rounds.forEach((round, roundIndex) => {
        if (!roundIndex) return;

        const previousMatches = getMatchesFromCollection(matches, rounds[roundIndex - 1]);
        const currentMatches = getMatchesFromCollection(matches, round);

        currentMatches.forEach((match, index) => {
            const sources = [previousMatches[index * 2], previousMatches[index * 2 + 1]].filter(Boolean);
            match.sourceMatchIds = sources.map(source => source.id);

            sources.forEach((source, sourceIndex) => {
                source.nextMatchId = match.id;
                source.nextSlot = sourceIndex === 0 ? "player1Id" : "player2Id";
            });
        });
    });

    const firstRoundMatches = getMatchesFromCollection(matches, rounds[0]);
    firstRoundMatches.forEach((match, index) => {
        match.player1Id = entries[index]?.[0]?.id ?? null;
        match.player2Id = entries[index]?.[1]?.id ?? null;
    });

    const synchronizedMatches = synchronizeBracketMatches(matches, rounds);
    const generatedAt = new Date().toISOString();

    return {
        ...state,
        settings: {
            ...state.settings,
            automaticPairing: true,
            prioritizeCrossPlatform: prioritizeCompatibility,
            allowManualPairing: true
        },
        bracket: {
            ...state.bracket,
            isGenerated: true,
            isLocked: false,
            size: bracketSize,
            roundIds: rounds.map(round => round.id),
            playerSignature: createPlayerSignature(players),
            generatedAt
        },
        rounds,
        matches: synchronizedMatches,
        events: [...state.events, createEvent(randomize ? "bracket-regenerated" : "bracket-generated", `A ${bracketSize}-player knockout bracket was generated.`, { bracketSize, byeCount })]
    };
}

function createFirstRoundEntries(players, byeCount, prioritizeCompatibility, randomize) {
    const orderedPlayers = randomize ? shuffle(players) : [...players];
    const byePlayers = selectByePlayers(orderedPlayers, byeCount, prioritizeCompatibility);
    const byePlayerIds = new Set(byePlayers.map(player => player.id));
    const competingPlayers = orderedPlayers.filter(player => !byePlayerIds.has(player.id));
    const pairedPlayers = pairPlayers(competingPlayers, prioritizeCompatibility);
    const pairEntries = pairedPlayers.map(pair => [pair[0], pair[1]]);
    const byeEntries = byePlayers.map(player => [player, null]);
    const entries = [];
    const pairs = [...pairEntries];
    const byes = [...byeEntries];

    while (pairs.length || byes.length) {
        if (pairs.length) entries.push(pairs.shift());
        if (byes.length) entries.push(byes.shift());
    }

    return randomize ? shuffle(entries) : entries;
}

function selectByePlayers(players, byeCount, prioritizeCompatibility) {
    if (!byeCount) return [];

    const selected = [];
    const selectedIds = new Set();

    if (prioritizeCompatibility) {
        const groups = new Map();

        players.forEach(player => {
            const group = getPlatformGroup(player.console);
            if (!groups.has(group)) groups.set(group, []);
            groups.get(group).push(player);
        });

        groups.forEach(groupPlayers => {
            if (selected.length < byeCount && groupPlayers.length % 2 === 1) {
                const player = groupPlayers[groupPlayers.length - 1];
                selected.push(player);
                selectedIds.add(player.id);
            }
        });
    }

    for (let index = players.length - 1; index >= 0 && selected.length < byeCount; index -= 1) {
        const player = players[index];

        if (!selectedIds.has(player.id)) {
            selected.push(player);
            selectedIds.add(player.id);
        }
    }

    return selected;
}

function pairPlayers(players, prioritizeCompatibility) {
    const remaining = [...players];
    const pairs = [];

    while (remaining.length >= 2) {
        const playerOne = remaining.shift();
        let playerTwoIndex = 0;

        if (prioritizeCompatibility) {
            const compatibleIndex = remaining.findIndex(player => arePlayersCompatible(playerOne, player));
            if (compatibleIndex >= 0) playerTwoIndex = compatibleIndex;
        }

        const playerTwo = remaining.splice(playerTwoIndex, 1)[0];
        pairs.push([playerOne, playerTwo]);
    }

    return pairs;
}

function swapBracketPlayer(state, matchId, slot, selectedPlayerId) {
    const firstRound = getFirstRound(state);
    if (!firstRound || !["player1Id", "player2Id"].includes(slot)) return state;

    const matches = state.matches.map(match => ({ ...match }));
    const matchesById = new Map(matches.map(match => [match.id, match]));
    const targetMatch = matchesById.get(matchId);
    if (!targetMatch || !firstRound.matchIds.includes(matchId)) return state;

    const previousPlayerId = targetMatch[slot];
    if (previousPlayerId === selectedPlayerId) return state;

    const otherSlot = findAssignedSlot(matchesById, firstRound.matchIds, selectedPlayerId, matchId, slot);
    if (!otherSlot) return state;

    targetMatch[slot] = selectedPlayerId;
    otherSlot.match[otherSlot.slot] = previousPlayerId;

    return {
        ...state,
        bracket: { ...state.bracket, manuallyAdjustedAt: new Date().toISOString() },
        matches: synchronizeBracketMatches(matches, state.rounds)
    };
}

function findAssignedSlot(matchesById, matchIds, playerId, excludedMatchId, excludedSlot) {
    for (const matchId of matchIds) {
        const match = matchesById.get(matchId);

        for (const slot of ["player1Id", "player2Id"]) {
            if (matchId === excludedMatchId && slot === excludedSlot) continue;
            if (match?.[slot] === playerId) return { match, slot };
        }
    }

    return null;
}

function synchronizeBracketMatches(matches, rounds) {
    const synchronized = matches.map(match => ({ ...match }));
    const matchesById = new Map(synchronized.map(match => [match.id, match]));
    const firstRound = [...rounds].sort((a, b) => a.number - b.number)[0];

    rounds.filter(round => round.number > 1).forEach(round => {
        round.matchIds.forEach(matchId => {
            const match = matchesById.get(matchId);
            if (!match) return;

            match.player1Id = null;
            match.player2Id = null;
            match.score1 = null;
            match.score2 = null;
            match.winnerId = null;
            match.status = "pending";
            match.isBye = false;
        });
    });

    firstRound?.matchIds.forEach(matchId => {
        const match = matchesById.get(matchId);
        if (!match) return;

        match.score1 = null;
        match.score2 = null;
        match.winnerId = null;
        match.status = "pending";
        match.isBye = false;

        const participants = [match.player1Id, match.player2Id].filter(Boolean);

        if (participants.length === 1) {
            match.winnerId = participants[0];
            match.status = "completed";
            match.isBye = true;

            const nextMatch = matchesById.get(match.nextMatchId);
            if (nextMatch && match.nextSlot) nextMatch[match.nextSlot] = match.winnerId;
        }
    });

    return synchronized;
}

function openBracketPreview() {
    previewDialog?.remove();

    const state = getTournamentState();
    const players = getActivePlayers(state);
    const firstRound = getFirstRound(state);
    const matches = getRoundMatches(state, firstRound);
    const section = screen.querySelector(".bracket-setup");
    if (!section || !matches.length) return;

    const dialog = createElement("dialog", "bracket-preview-dialog");
    const preview = createElement("section", "bracket-preview");
    const header = createElement("header", "bracket-preview__header");
    const heading = document.createElement("div");
    const title = createElement("h2", "", firstRound.name);
    const deadline = createElement("p", "", firstRound.deadline ? `Deadline: ${formatDate(firstRound.deadline)}` : "Deadline not set");
    const actions = createElement("div", "bracket-preview__actions");
    const closeButton = createElement("button", "button button--secondary", "Close");
    const previewMatches = createElement("div", "bracket-preview__matches");

    closeButton.type = "button";
    closeButton.addEventListener("click", () => dialog.close());

    matches.forEach(match => {
        const card = createElement("article", "bracket-preview-match");
        const matchTitle = createElement("div", "bracket-preview-match__title", `Match ${match.number}`);
        const playerOne = createPreviewPlayer(findPlayer(players, match.player1Id));
        const playerTwo = createPreviewPlayer(findPlayer(players, match.player2Id));
        card.append(matchTitle, playerOne, playerTwo);
        previewMatches.append(card);
    });

    heading.append(title, deadline);
    actions.append(closeButton);
    header.append(heading, actions);
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

function createPreviewPlayer(player) {
    const row = createElement("div", "bracket-preview-match__player");
    const name = createElement("span", "", player?.name ?? "BYE");
    const platform = createElement("span", "platform-badge", player ? getPlatformName(player.console) : "Automatic advance");
    row.append(name, platform);
    return row;
}

function hasCurrentBracket(state, players) {
    const firstRound = getFirstRound(state);
    const matches = getRoundMatches(state, firstRound);
    const bracketSize = state.bracket?.size ?? 0;
    const assignments = matches.flatMap(match => [match.player1Id, match.player2Id]).filter(Boolean);
    const uniqueAssignments = new Set(assignments);
    const expectedByes = bracketSize - players.length;
    const actualByes = matches.filter(match => Boolean(match.player1Id) !== Boolean(match.player2Id)).length;
    const hasEmptyMatch = matches.some(match => !match.player1Id && !match.player2Id);

    return Boolean(
        state.bracket?.isGenerated &&
        state.bracket.playerSignature === createPlayerSignature(players) &&
        matches.length === bracketSize / 2 &&
        assignments.length === players.length &&
        uniqueAssignments.size === players.length &&
        actualByes === expectedByes &&
        !hasEmptyMatch
    );
}

function getActivePlayers(state) {
    return state.players.filter(player => player.status !== "removed");
}

function getFirstRound(state) {
    return [...(state.rounds ?? [])].sort((a, b) => a.number - b.number)[0] ?? null;
}

function getRoundMatches(state, round) {
    if (!round) return [];
    return round.matchIds.map(matchId => state.matches.find(match => match.id === matchId)).filter(Boolean).sort((a, b) => a.number - b.number);
}

function getMatchesFromCollection(matches, round) {
    return round.matchIds.map(matchId => matches.find(match => match.id === matchId)).filter(Boolean);
}

function findPlayer(players, playerId) {
    return players.find(player => player.id === playerId) ?? null;
}

function arePlayersCompatible(playerOne, playerTwo) {
    if (!playerOne || !playerTwo) return true;
    return getPlatformGroup(playerOne.console) === getPlatformGroup(playerTwo.console);
}

function getCompatibilityMessage(playerOne, playerTwo) {
    if (!playerOne || !playerTwo) return "The assigned player advances automatically.";
    if (arePlayersCompatible(playerOne, playerTwo)) return `${getPlatformName(playerOne.console)} and ${getPlatformName(playerTwo.console)} can play together.`;
    return `${getPlatformName(playerOne.console)} and ${getPlatformName(playerTwo.console)} may not support cross-play.`;
}

function getPlatformGroup(consoleName) {
    return PLATFORM_GROUPS[consoleName] ?? `unknown:${consoleName}`;
}

function getPlatformName(consoleName) {
    return PLATFORM_NAMES[consoleName] ?? consoleName ?? "Unknown platform";
}

function getNextPowerOfTwo(number) {
    return 2 ** Math.ceil(Math.log2(number));
}

function getRoundName(roundNumber, totalRounds) {
    const roundsRemaining = totalRounds - roundNumber;
    if (roundsRemaining === 0) return "Final";
    if (roundsRemaining === 1) return "Semifinals";
    if (roundsRemaining === 2) return "Quarterfinals";
    return `Round of ${2 ** (roundsRemaining + 1)}`;
}

function createPlayerSignature(players) {
    return players.map(player => player.id).sort().join("|");
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

function shuffle(items) {
    const result = [...items];

    for (let index = result.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
    }

    return result;
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