import { getTournamentState, updateTournamentState } from "../../state/tournament-store.js";

const CONSOLE_NAMES = {
    ps5: "PlayStation 5",
    "xbox-series": "Xbox Series X|S",
    pc: "PC",
    ps4: "PlayStation 4",
    "xbox-one": "Xbox One"
};

let screen;
let form;
let playerList;
let playerTotal;
let setupMessage;
let continueButton;

export async function mount(container) {
    screen = container;
    const response = await fetch(new URL("./player-setup.html", import.meta.url));
    if (!response.ok) throw new Error("The player setup template could not be loaded.");

    screen.innerHTML = await response.text();
    form = screen.querySelector("#player-form");
    playerList = screen.querySelector("#player-list");
    playerTotal = screen.querySelector("#player-total");
    setupMessage = screen.querySelector("#player-setup-message");
    continueButton = screen.querySelector("#continue-to-bracket");

    form.addEventListener("submit", handlePlayerSubmit);
    playerList.addEventListener("click", handlePlayerListClick);
    continueButton.addEventListener("click", handleContinue);
    renderPlayers();

    return unmount;
}

function unmount() {
    form?.removeEventListener("submit", handlePlayerSubmit);
    playerList?.removeEventListener("click", handlePlayerListClick);
    continueButton?.removeEventListener("click", handleContinue);
}

function handlePlayerSubmit(event) {
    event.preventDefault();
    const state = getTournamentState();
    const result = validatePlayer(new FormData(form), state.players);

    showValidationErrors(result.errors);
    if (Object.keys(result.errors).length) return;

    const player = createPlayer(result.values);
    const tournamentEvent = createEvent("player-added", player.id, `${player.name} was added to the tournament.`);

    updateTournamentState(currentState => ({
        ...currentState,
        players: [...currentState.players, player],
        events: [...currentState.events, tournamentEvent]
    }));

    form.reset();
    renderPlayers();
    form.querySelector("#player-name").focus();
}

function handlePlayerListClick(event) {
    const removeButton = event.target.closest("[data-remove-player]");
    if (!removeButton) return;

    const state = getTournamentState();
    const player = state.players.find(item => item.id === removeButton.dataset.removePlayer);
    if (!player) return;

    updateTournamentState(currentState => ({
        ...currentState,
        players: currentState.players.filter(item => item.id !== player.id),
        events: [...currentState.events, createEvent("player-removed", player.id, `${player.name} was removed from the tournament.`)]
    }));

    renderPlayers();
}

function handleContinue() {
    const state = getTournamentState();
    if (state.players.length < 2) return;

    updateTournamentState(currentState => ({
        ...currentState,
        workflow: { ...currentState.workflow, step: "bracket-setup" }
    }));
}

function renderPlayers() {
    const players = getTournamentState().players;
    playerTotal.textContent = String(players.length);
    continueButton.disabled = players.length < 2;
    setupMessage.textContent = getSetupMessage(players.length);
    playerList.replaceChildren();

    if (!players.length) {
        playerList.append(createEmptyState());
        return;
    }

    players.forEach((player, index) => playerList.append(createPlayerCard(player, index)));
}

function createPlayerCard(player, index) {
    const card = document.createElement("article");
    card.className = "player-card";

    const number = document.createElement("div");
    number.className = "player-card__number";
    number.textContent = String(index + 1);

    const content = document.createElement("div");
    content.className = "player-card__content";

    const heading = document.createElement("div");
    heading.className = "player-card__heading";

    const name = document.createElement("h3");
    name.textContent = player.name;

    const consoleBadge = document.createElement("span");
    consoleBadge.className = "platform-badge";
    consoleBadge.textContent = CONSOLE_NAMES[player.console] ?? player.console;

    const details = document.createElement("div");
    details.className = "player-card__details";

    const gameId = document.createElement("span");
    gameId.textContent = `Player ID: ${player.playerId}`;

    const telegramId = document.createElement("span");
    telegramId.textContent = `Telegram: @${player.telegramId}`;

    const removeButton = document.createElement("button");
    removeButton.className = "button button--danger player-card__remove";
    removeButton.type = "button";
    removeButton.dataset.removePlayer = player.id;
    removeButton.textContent = "Remove";
    removeButton.setAttribute("aria-label", `Remove ${player.name}`);

    heading.append(name, consoleBadge);
    details.append(gameId, telegramId);
    content.append(heading, details);
    card.append(number, content, removeButton);
    return card;
}

function createEmptyState() {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";

    const icon = document.createElement("div");
    icon.className = "empty-state__icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "+";

    const title = document.createElement("h3");
    title.textContent = "No players added";

    const description = document.createElement("p");
    description.textContent = "Players will appear here after you add them.";

    emptyState.append(icon, title, description);
    return emptyState;
}

function validatePlayer(formData, players) {
    const values = {
        name: String(formData.get("name") ?? "").trim(),
        playerId: String(formData.get("playerId") ?? "").trim(),
        telegramId: String(formData.get("telegramId") ?? "").trim().replace(/^@/, ""),
        console: String(formData.get("console") ?? "")
    };

    const errors = {};
    if (!values.name) errors.name = "Enter the player's name.";
    if (!values.playerId) errors.playerId = "Enter the player's game ID.";
    if (!values.telegramId) errors.telegramId = "Enter the player's Telegram ID.";
    if (values.telegramId && !/^[A-Za-z0-9_]{5,32}$/.test(values.telegramId)) errors.telegramId = "Enter a valid Telegram username.";
    if (!CONSOLE_NAMES[values.console]) errors.console = "Select the player's console.";
    if (players.some(player => player.playerId.toLowerCase() === values.playerId.toLowerCase())) errors.playerId = "This player ID has already been added.";
    if (players.some(player => player.telegramId.toLowerCase() === values.telegramId.toLowerCase())) errors.telegramId = "This Telegram ID has already been added.";

    return { values, errors };
}

function showValidationErrors(errors) {
    form.querySelectorAll("[data-error-for]").forEach(element => element.textContent = "");
    form.querySelectorAll("input, select").forEach(element => element.removeAttribute("aria-invalid"));

    Object.entries(errors).forEach(([fieldName, message]) => {
        const field = form.elements[fieldName];
        const error = form.querySelector(`[data-error-for="${fieldName}"]`);
        if (field) field.setAttribute("aria-invalid", "true");
        if (error) error.textContent = message;
    });

    const firstInvalidField = form.querySelector('[aria-invalid="true"]');
    firstInvalidField?.focus();
}

function createPlayer(values) {
    return {
        id: createId("player"),
        name: values.name,
        playerId: values.playerId,
        telegramId: values.telegramId,
        console: values.console,
        status: "active",
        seed: null,
        createdAt: new Date().toISOString()
    };
}

function createEvent(type, playerId, message) {
    return { id: createId("event"), type, playerId, message, createdAt: new Date().toISOString() };
}

function createId(prefix) {
    return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function getSetupMessage(playerCount) {
    if (!playerCount) return "Add at least two players to continue.";
    if (playerCount === 1) return "Add one more player to continue.";
    return `${playerCount} players are ready. You can create the knockout bracket.`;
}