const STORAGE_KEY = "eakurd-theme";
const supportedThemes = new Set(["dark", "light"]);

export function initializeThemeToggle() {
    applyTheme(loadTheme());

    const button = document.querySelector("#theme-toggle");
    if (!button) return;

    const handleClick = () => {
        const currentTheme = document.documentElement.dataset.theme;
        const nextTheme = currentTheme === "dark" ? "light" : "dark";

        saveTheme(nextTheme);
        applyTheme(nextTheme);
    };

    const handleStorageChange = (event) => {
        if (event.key === STORAGE_KEY && supportedThemes.has(event.newValue)) applyTheme(event.newValue);
    };

    button.addEventListener("click", handleClick);
    window.addEventListener("storage", handleStorageChange);

    return () => {
        button.removeEventListener("click", handleClick);
        window.removeEventListener("storage", handleStorageChange);
    };
}

function applyTheme(theme) {
    const selectedTheme = supportedThemes.has(theme) ? theme : "dark";
    document.documentElement.dataset.theme = selectedTheme;
    updateThemeButton(selectedTheme);

    document.dispatchEvent(new CustomEvent("theme:changed", { detail: { theme: selectedTheme } }));
}

function updateThemeButton(theme) {
    const button = document.querySelector("#theme-toggle");
    if (!button) return;

    const darkModeActive = theme === "dark";
    const nextThemeLabel = darkModeActive ? "Light mode" : "Dark mode";

    button.setAttribute("aria-label", `Switch to ${nextThemeLabel.toLowerCase()}`);

    const icon = button.querySelector("[data-theme-icon]");
    const label = button.querySelector("[data-theme-label]");

    if (icon) icon.textContent = darkModeActive ? "☀" : "☾";
    if (label) label.textContent = nextThemeLabel;
}

function loadTheme() {
    try {
        const savedTheme = localStorage.getItem(STORAGE_KEY);
        return supportedThemes.has(savedTheme) ? savedTheme : "dark";
    } catch {
        return "dark";
    }
}

function saveTheme(theme) {
    try {
        localStorage.setItem(STORAGE_KEY, theme);
    } catch {
        // The theme still changes even when browser storage is unavailable.
        console.warn("Unable to save theme preference to localStorage.");
    }
}