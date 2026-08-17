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
let stageSelector;
let stageBracket;
let reportPreview;
let previewDialog;

export async function mount(container) {
    screen = container;
    const response = await fetch(new URL("./tournament-complete.html", import.meta.url));
    if (!response.ok) throw new Error("The tournament completion template could not be loaded.");

    screen.innerHTML = await response.text();
    stageSelector = screen.querySelector("#stage-selector");
    stageBracket = screen.querySelector("#stage-bracket");
    reportPreview = screen.querySelector("#tournament-report-preview");

    stageSelector.addEventListener("change", renderSelectedStage);
    screen.querySelector("#open-stage-preview").addEventListener("click", openStagePreview);
    screen.querySelector("#copy-tournament-report").addEventListener("click", handleCopyReport);
    screen.querySelector("#download-txt-report").addEventListener("click", handleDownloadTxt);
    screen.querySelector("#download-csv-report").addEventListener("click", handleDownloadCsv);
    screen.querySelector("#start-new-tournament").addEventListener("click", handleNewTournament);

    renderCompletionScreen();
    return unmount;
}

function unmount() {
    previewDialog?.remove();
    previewDialog = null;
}

function renderCompletionScreen() {
    const state = getTournamentState();
    renderChampion(state);
    renderSummary(state);
    renderStageSelector(state);
    renderSelectedStage();
    renderTournamentResults(state);
    renderEventHistory(state);
    reportPreview.value = generateTextReport(state);
}

function renderChampion(state) {
    const champion = getChampion(state);
    const initial = champion?.name?.trim().charAt(0).toUpperCase() || "C";

    screen.querySelector("#champion-avatar").textContent = initial;
    screen.querySelector("#champion-name").textContent = champion?.name ?? "Champion unavailable";
    screen.querySelector("#champion-player-id").textContent = `Player ID: ${champion?.playerId ?? "—"}`;
    screen.querySelector("#champion-telegram-id").textContent = `Telegram: ${champion?.telegramId ? `@${champion.telegramId}` : "—"}`;
    screen.querySelector("#champion-console").textContent = champion ? getPlatformName(champion.console) : "—";
}

function renderSummary(state) {
    const players = getPlayers(state);
    const rounds = getRounds(state);
    const playedMatches = state.matches.filter(match => match.status === "completed" && !match.isBye && match.player1Id && match.player2Id);

    screen.querySelector("#completed-player-count").textContent = String(players.length);
    screen.querySelector("#completed-round-count").textContent = String(rounds.length);
    screen.querySelector("#completed-match-count").textContent = String(playedMatches.length);
    screen.querySelector("#tournament-duration").textContent = formatTournamentDuration(state.tournament.startedAt ?? state.tournament.createdAt, state.tournament.completedAt);
}

function renderStageSelector(state) {
    const rounds = getRounds(state);
    stageSelector.replaceChildren();

    rounds.forEach(round => {
        const option = document.createElement("option");
        option.value = round.id;
        option.textContent = round.name;
        stageSelector.append(option);
    });

    if (rounds.length) stageSelector.value = rounds[0].id;
}

function renderSelectedStage() {
    const state = getTournamentState();
    const round = getSelectedRound(state);
    stageBracket.replaceChildren();

    if (!round) {
        stageBracket.append(createElement("p", "event-history__empty", "No tournament stage is available."));
        return;
    }

    const matches = getRoundMatches(state, round);
    const header = createElement("header", "stage-bracket__header");
    const heading = document.createElement("div");
    const title = createElement("h3", "", round.name);
    const deadline = createElement("p", "", round.deadline ? `Deadline: ${formatDate(round.deadline)}` : "No deadline recorded");
    const status = createElement("span", "status-badge status-badge--ready", round.status === "completed" ? "Completed" : round.status);
    const matchContainer = createElement("div", "stage-bracket__matches");

    heading.append(title, deadline);
    header.append(heading, status);
    matches.forEach(match => matchContainer.append(createStageResultCard(state, match)));
    stageBracket.append(header, matchContainer);
}

function createStageResultCard(state, match) {
    const playerOne = findPlayer(state, match.player1Id);
    const playerTwo = findPlayer(state, match.player2Id);
    const card = createElement("article", "stage-result-card");
    const header = createElement("header", "stage-result-card__header");
    const number = createElement("span", "", `Match ${match.number}`);
    const status = createElement("span", "", match.isBye ? "Automatic bye" : match.status === "completed" ? "Completed" : "Pending");

    header.append(number, status);
    card.append(header, createStagePlayerRow(playerOne, match.score1, match.winnerId, match.isBye), createStagePlayerRow(playerTwo, match.score2, match.winnerId, match.isBye));
    return card;
}

function createStagePlayerRow(player, score, winnerId, isBye) {
    const row = createElement("div", `stage-result-player${player?.id === winnerId ? " is-winner" : ""}`);
    const identity = createElement("div", "stage-result-player__identity");
    const name = createElement("strong", "", player?.name ?? "BYE");
    const platform = createElement("small", "", player ? getPlatformName(player.console) : "Automatic advance");
    const scoreElement = createElement("span", "stage-result-player__score", player && !isBye ? String(score ?? "—") : "—");

    identity.append(name, platform);
    row.append(identity, scoreElement);
    return row;
}

function renderTournamentResults(state) {
    const container = screen.querySelector("#tournament-results");
    container.replaceChildren();

    getRounds(state).forEach(round => {
        const matches = getRoundMatches(state, round);
        const section = createElement("section", "results-round");
        const header = createElement("header", "results-round__header");
        const title = createElement("h3", "", round.name);
        const summary = createElement("span", "", `${matches.length} match${matches.length === 1 ? "" : "es"} · ${round.deadline ? formatDate(round.deadline) : "No deadline"}`);
        const rows = createElement("div", "results-round__matches");

        header.append(title, summary);
        matches.forEach(match => rows.append(createResultRow(state, match)));
        section.append(header, rows);
        container.append(section);
    });
}

function createResultRow(state, match) {
    const playerOne = findPlayer(state, match.player1Id);
    const playerTwo = findPlayer(state, match.player2Id);
    const winner = findPlayer(state, match.winnerId);
    const row = createElement("div", "result-row");
    const number = createElement("span", "result-row__number", `Match ${match.number}`);
    const firstPlayer = createElement("span", "result-row__player", playerOne?.name ?? "BYE");
    const score = createElement("strong", "result-row__score", match.isBye ? "BYE" : `${match.score1 ?? "—"} – ${match.score2 ?? "—"}`);
    const secondPlayer = createElement("span", "result-row__player", playerTwo?.name ?? "BYE");
    const winnerLabel = createElement("span", "result-row__winner", winner ? `Winner: ${winner.name}` : "No winner");

    row.append(number, firstPlayer, score, secondPlayer, winnerLabel);
    return row;
}

function renderEventHistory(state) {
    const container = screen.querySelector("#event-history");
    container.replaceChildren();

    const events = [...(state.events ?? [])].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    if (!events.length) {
        const empty = createElement("li", "event-history__empty", "No notable events were recorded.");
        container.append(empty);
        return;
    }

    events.forEach(event => {
        const item = createElement("li", "event-history__item");
        const marker = createElement("span", "event-history__marker");
        const content = createElement("div", "event-history__content");
        const message = createElement("strong", "", event.message ?? formatEventType(event.type));
        const time = document.createElement("time");

        time.dateTime = event.createdAt ?? "";
        time.textContent = event.createdAt ? formatDate(event.createdAt) : "Unknown time";
        content.append(message, time);
        item.append(marker, content);
        container.append(item);
    });
}

function generateTextReport(state) {
    const tournament = state.tournament;
    const champion = getChampion(state);
    const players = getPlayers(state);
    const rounds = getRounds(state);
    const lines = [];

    lines.push("EAKURD KNOCKOUT TOURNAMENT REPORT");
    lines.push("=================================");
    lines.push("");
    lines.push("TOURNAMENT SUMMARY");
    lines.push("------------------");
    lines.push(`Name: ${tournament.name ?? "EAKurd Knockout Tournament"}`);
    lines.push(`Tournament ID: ${tournament.id ?? "—"}`);
    lines.push(`Format: Single elimination`);
    lines.push(`Status: ${tournament.status ?? "completed"}`);
    lines.push(`Bracket size: ${state.bracket?.size ?? "—"}`);
    lines.push(`Created: ${formatDate(tournament.createdAt)}`);
    lines.push(`Started: ${formatDate(tournament.startedAt)}`);
    lines.push(`Completed: ${formatDate(tournament.completedAt)}`);
    lines.push(`Duration: ${formatTournamentDuration(tournament.startedAt ?? tournament.createdAt, tournament.completedAt)}`);
    lines.push("");

    lines.push("CHAMPION");
    lines.push("--------");
    lines.push(`Name: ${champion?.name ?? "—"}`);
    lines.push(`Player ID: ${champion?.playerId ?? "—"}`);
    lines.push(`Telegram: ${champion?.telegramId ? `@${champion.telegramId}` : "—"}`);
    lines.push(`Console: ${champion ? getPlatformName(champion.console) : "—"}`);
    lines.push("");

    lines.push("PLAYER PROGRESS");
    lines.push("---------------");

    players.forEach((player, index) => {
        const progress = getPlayerProgress(state, player);

        lines.push(`${index + 1}. ${player.name}`);
        lines.push(`   Player ID: ${player.playerId}`);
        lines.push(`   Telegram: @${player.telegramId}`);
        lines.push(`   Console: ${getPlatformName(player.console)}`);
        lines.push(`   Matches played: ${progress.matchesPlayed}`);
        lines.push(`   Wins: ${progress.wins}`);
        lines.push(`   Losses: ${progress.losses}`);
        lines.push(`   Automatic byes: ${progress.byes}`);
        lines.push(`   Result: ${progress.result}`);
        lines.push("");
    });

    lines.push("STAGES AND MATCH RESULTS");
    lines.push("------------------------");

    rounds.forEach(round => {
        lines.push("");
        lines.push(round.name.toUpperCase());
        lines.push(`Deadline: ${formatDate(round.deadline)}`);

        getRoundMatches(state, round).forEach(match => {
            const playerOne = findPlayer(state, match.player1Id);
            const playerTwo = findPlayer(state, match.player2Id);
            const winner = findPlayer(state, match.winnerId);
            const result = match.isBye ? "Automatic bye" : `${match.score1 ?? "—"}–${match.score2 ?? "—"}`;

            lines.push(`Match ${match.number}: ${playerOne?.name ?? "BYE"} vs ${playerTwo?.name ?? "BYE"} | Score: ${result} | Winner: ${winner?.name ?? "—"}`);
        });
    });

    lines.push("");
    lines.push("NOTABLE EVENTS");
    lines.push("--------------");

    if (!state.events?.length) {
        lines.push("No events recorded.");
    } else {
        [...state.events].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).forEach(event => {
            lines.push(`${formatDate(event.createdAt)} — ${event.message ?? formatEventType(event.type)}`);
        });
    }

    lines.push("");
    lines.push(`Report generated: ${formatDate(new Date().toISOString())}`);
    return lines.join("\n");
}

function generateCsvReport(state) {
    const rows = [[
        "Record Type",
        "Stage",
        "Match",
        "Player",
        "Player ID",
        "Telegram ID",
        "Console",
        "Opponent",
        "Score",
        "Opponent Score",
        "Result",
        "Deadline",
        "Date",
        "Details"
    ]];

    const champion = getChampion(state);

    rows.push([
        "Tournament",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        state.tournament.status,
        "",
        state.tournament.completedAt,
        `${state.tournament.name}; Format: Single elimination; Bracket size: ${state.bracket?.size ?? "—"}`
    ]);

    if (champion) {
        rows.push([
            "Champion",
            "Final",
            "",
            champion.name,
            champion.playerId,
            champion.telegramId,
            getPlatformName(champion.console),
            "",
            "",
            "",
            "Champion",
            "",
            state.tournament.completedAt,
            "Tournament winner"
        ]);
    }

    getPlayers(state).forEach(player => {
        const progress = getPlayerProgress(state, player);

        rows.push([
            "Player",
            "",
            "",
            player.name,
            player.playerId,
            player.telegramId,
            getPlatformName(player.console),
            "",
            "",
            "",
            progress.result,
            "",
            player.createdAt,
            `Matches: ${progress.matchesPlayed}; Wins: ${progress.wins}; Losses: ${progress.losses}; Byes: ${progress.byes}`
        ]);
    });

    getRounds(state).forEach(round => {
        getRoundMatches(state, round).forEach(match => {
            const playerOne = findPlayer(state, match.player1Id);
            const playerTwo = findPlayer(state, match.player2Id);
            const winner = findPlayer(state, match.winnerId);

            rows.push([
                "Match",
                round.name,
                match.number,
                playerOne?.name ?? "BYE",
                playerOne?.playerId ?? "",
                playerOne?.telegramId ?? "",
                playerOne ? getPlatformName(playerOne.console) : "",
                playerTwo?.name ?? "BYE",
                match.score1 ?? "",
                match.score2 ?? "",
                match.isBye ? "Automatic bye" : `Winner: ${winner?.name ?? "—"}`,
                round.deadline,
                match.completedAt,
                match.status
            ]);
        });
    });

    (state.events ?? []).forEach(event => {
        rows.push([
            "Event",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            event.createdAt,
            event.message ?? formatEventType(event.type)
        ]);
    });

    return rows.map(row => row.map(escapeCsvValue).join(",")).join("\n");
}

async function handleCopyReport(event) {
    const button = event.currentTarget;
    const originalText = button.textContent;

    try {
        await copyText(reportPreview.value);
        button.textContent = "Copied";
        notify("Tournament report copied.", "success");
    } catch {
        notify("The report could not be copied.", "error");
    }

    window.setTimeout(() => button.textContent = originalText, 1600);
}

function handleDownloadTxt() {
    const state = getTournamentState();
    const filename = `${createReportFilename(state)}.txt`;
    downloadFile(filename, reportPreview.value, "text/plain;charset=utf-8");
    notify("TXT report downloaded.", "success");
}

function handleDownloadCsv() {
    const state = getTournamentState();
    const filename = `${createReportFilename(state)}.csv`;
    downloadFile(filename, generateCsvReport(state), "text/csv;charset=utf-8");
    notify("CSV report downloaded.", "success");
}

function openStagePreview() {
    previewDialog?.remove();

    const state = getTournamentState();
    const round = getSelectedRound(state);
    const section = screen.querySelector(".tournament-complete");
    if (!section || !round) return;

    const dialog = createElement("dialog", "stage-preview-dialog");
    const preview = createElement("section", "stage-preview");
    const header = createElement("header", "stage-preview__header");
    const heading = document.createElement("div");
    const title = createElement("h2", "", round.name);
    const deadline = createElement("p", "", round.deadline ? `Deadline: ${formatDate(round.deadline)}` : "No deadline recorded");
    const closeButton = createElement("button", "button button--secondary", "Close");
    const matches = createElement("div", "stage-preview__matches");
    const footer = createElement("footer", "stage-preview__footer");

    closeButton.type = "button";
    closeButton.addEventListener("click", () => dialog.close());

    getRoundMatches(state, round).forEach(match => matches.append(createStageResultCard(state, match)));
    footer.append(createElement("span", "", state.tournament.name ?? "EAKurd Knockout Tournament"), createElement("span", "", `Completed ${formatDate(round.completedAt ?? state.tournament.completedAt)}`));
    heading.append(title, deadline);
    header.append(heading, closeButton);
    preview.append(header, matches, footer);
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

function handleNewTournament() {
    const confirmed = window.confirm("Create a new tournament? The current tournament will be replaced. Download your reports first if you want to keep them.");
    if (!confirmed) return;

    updateTournamentState(current => createFreshTournamentState(current), { message: "New tournament created" });
}

function createFreshTournamentState(current) {
    const now = new Date().toISOString();

    return {
        version: current.version ?? 1,
        workflow: { step: "player-setup", currentRoundId: null, currentRoundIndex: 0 },
        tournament: {
            id: createId("tournament"),
            name: current.tournament?.name ?? "EAKurd Knockout Tournament",
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
            prioritizeCrossPlatform: current.settings?.prioritizeCrossPlatform !== false,
            allowManualPairing: true
        },
        players: [],
        bracket: { isGenerated: false, isLocked: false, size: 0, roundIds: [] },
        rounds: [],
        matches: [],
        events: []
    };
}

function getPlayerProgress(state, player) {
    const matches = state.matches.filter(match => match.player1Id === player.id || match.player2Id === player.id);
    const playedMatches = matches.filter(match => match.status === "completed" && !match.isBye && match.player1Id && match.player2Id);
    const wins = matches.filter(match => match.winnerId === player.id && !match.isBye).length;
    const losses = playedMatches.filter(match => match.winnerId !== player.id).length;
    const byes = matches.filter(match => match.isBye && match.winnerId === player.id).length;
    const lostMatch = playedMatches.find(match => match.winnerId !== player.id);
    const lostRound = lostMatch ? state.rounds.find(round => round.id === lostMatch.roundId) : null;
    const result = state.tournament.championId === player.id ? "Champion" : lostRound ? `Eliminated in ${lostRound.name}` : "Tournament completed";

    return { matchesPlayed: playedMatches.length, wins, losses, byes, result };
}

function getChampion(state) {
    const championId = state.tournament.championId ?? getRounds(state).at(-1)?.matchIds.map(id => state.matches.find(match => match.id === id)?.winnerId).find(Boolean);
    return findPlayer(state, championId);
}

function getSelectedRound(state) {
    return state.rounds.find(round => round.id === stageSelector.value) ?? getRounds(state)[0] ?? null;
}

function getPlayers(state) {
    return state.players.filter(player => player.status !== "removed");
}

function getRounds(state) {
    return [...(state.rounds ?? [])].sort((a, b) => a.number - b.number);
}

function getRoundMatches(state, round) {
    if (!round) return [];
    return round.matchIds.map(matchId => state.matches.find(match => match.id === matchId)).filter(Boolean).sort((a, b) => a.number - b.number);
}

function findPlayer(state, playerId) {
    return state.players.find(player => player.id === playerId) ?? null;
}

function getPlatformName(consoleName) {
    return PLATFORM_NAMES[consoleName] ?? consoleName ?? "Unknown platform";
}

function createReportFilename(state) {
    const name = String(state.tournament.name ?? "tournament-report").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const date = new Date(state.tournament.completedAt ?? Date.now()).toISOString().slice(0, 10);
    return `${name || "tournament-report"}-${date}`;
}

function downloadFile(filename, content, type) {
    const blob = new Blob(["\uFEFF", content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    reportPreview.focus();
    reportPreview.select();

    if (!document.execCommand("copy")) throw new Error("Copy failed.");
}

function escapeCsvValue(value) {
    const text = String(value ?? "");
    return `"${text.replaceAll('"', '""')}"`;
}

function notify(message, type = "success") {
    document.dispatchEvent(new CustomEvent("notification:show", { detail: { message, type } }));
}

function formatEventType(type) {
    return String(type ?? "event").replaceAll("-", " ").replace(/\b\w/g, character => character.toUpperCase());
}

function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "—";
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatTournamentDuration(startValue, endValue) {
    if (!startValue || !endValue) return "—";

    const difference = Math.max(0, new Date(endValue).getTime() - new Date(startValue).getTime());
    const totalMinutes = Math.floor(difference / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor(totalMinutes % 1440 / 60);
    const minutes = totalMinutes % 60;

    if (days) return `${days}d ${hours}h`;
    if (hours) return `${hours}h ${minutes}m`;
    return totalMinutes ? `${totalMinutes}m` : "Less than a minute";
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