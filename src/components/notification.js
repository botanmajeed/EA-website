const supportedTypes = new Set(["success", "error", "warning", "info"]);

let initialized = false;

export function initializeNotifications() {
    if (initialized) return;

    initialized = true;
    document.addEventListener("notification:show", handleNotificationRequest);
}

export function requestNotification(message, type = "success", duration = 4000) {
    document.dispatchEvent(new CustomEvent("notification:show", {
        detail: { message, type, duration }
    }));
}

function handleNotificationRequest(event) {
    const message = String(event.detail?.message || "Action completed.");
    const type = supportedTypes.has(event.detail?.type) ? event.detail.type : "info";
    const duration = Number(event.detail?.duration) || 4000;

    showNotification(message, type, duration);
}

function showNotification(message, type, duration) {
    const region = document.querySelector("#notification-region");
    if (!region) return;

    while (region.children.length >= 4) region.firstElementChild?.remove();

    const notification = document.createElement("div");
    const messageElement = document.createElement("span");
    const closeButton = document.createElement("button");

    notification.className = `notification notification--${type}`;
    notification.setAttribute("role", type === "error" ? "alert" : "status");

    messageElement.className = "notification__message";
    messageElement.textContent = message;

    closeButton.className = "notification__close";
    closeButton.type = "button";
    closeButton.textContent = "×";
    closeButton.setAttribute("aria-label", "Dismiss notification");

    const timeoutId = window.setTimeout(() => notification.remove(), duration);

    closeButton.addEventListener("click", () => {
        window.clearTimeout(timeoutId);
        notification.remove();
    });

    notification.append(messageElement, closeButton);
    region.appendChild(notification);
}