import { DEFAULT_WORKFLOW_STEP, WORKFLOW_STEPS, getWorkflowStepIndex, isWorkflowStep } from "../app/workflow-steps.js";

export function renderWorkflowStepper(stateOrStep) {
    const requestedStep = typeof stateOrStep === "string" ? stateOrStep : stateOrStep?.workflow?.step;
    const currentStep = isWorkflowStep(requestedStep) ? requestedStep : DEFAULT_WORKFLOW_STEP;
    const list = document.querySelector("#workflow-progress, #workflow-stepper");
    if (!list) return;

    const currentIndex = getWorkflowStepIndex(currentStep);
    list.replaceChildren(...WORKFLOW_STEPS.map((step, index) => createStepElement(step, index, currentIndex)));
}

function createStepElement(step, index, currentIndex) {
    const item = document.createElement("li");
    const marker = document.createElement("span");
    const label = document.createElement("span");

    item.className = "workflow-progress__step";
    marker.className = "workflow-progress__marker";
    label.className = "workflow-progress__label";
    marker.textContent = index < currentIndex ? "✓" : String(index + 1);
    label.textContent = step.shortLabel;
    marker.setAttribute("aria-hidden", "true");

    if (index < currentIndex) item.classList.add("is-complete", "is-completed");

    if (index === currentIndex) {
        item.classList.add("is-active", "is-current");
        item.setAttribute("aria-current", "step");
    }

    const status = index < currentIndex ? ", completed" : index === currentIndex ? ", current step" : "";
    item.setAttribute("aria-label", `Step ${index + 1}: ${step.title}${status}`);
    item.append(marker, label);
    return item;
}