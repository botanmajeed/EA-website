import { initializeThemeToggle } from "./components/theme-toggle.js";
import { initializeStore } from "./state/tournament-store.js";
import { initializeAppShell } from "./app/app-shell.js";
import { initializeWorkflow } from "./app/workflow-controller.js";

async function startApplication() {
    document.documentElement.classList.add("is-loading");

    try {
        initializeThemeToggle();
        initializeStore();
        initializeAppShell();
        await initializeWorkflow();

        document.documentElement.classList.remove("is-loading");
        document.documentElement.classList.add("is-ready");
    } catch (error) {
        console.error("Unable to start the tournament manager.", error);

        document.documentElement.classList.remove("is-loading");
        document.documentElement.classList.add("has-error");

        renderApplicationError();
    }
}

function renderApplicationError() {
    const screen = document.querySelector("#workflow-screen");
    if (!screen) return;

    screen.innerHTML = `
        <section class="fatal-error" role="alert">
            <h1>The tournament manager could not start</h1>
            <p>Refresh the page to continue from your saved tournament progress.</p>
            <button class="button button--primary" type="button" data-refresh-application>Refresh page</button>
        </section>
    `;

    screen.querySelector("[data-refresh-application]")?.addEventListener("click", () => window.location.reload());
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startApplication, { once: true });
} else {
    startApplication();
}