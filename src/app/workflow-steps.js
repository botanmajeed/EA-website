export const DEFAULT_WORKFLOW_STEP = "player-setup";

export const WORKFLOW_STEPS = [
    {
        id: "player-setup",
        title: "Add players",
        label: "Add players",
        shortLabel: "Players",
        description: "Add the players participating in the tournament."
    },
    {
        id: "bracket-setup",
        title: "Set bracket",
        label: "Set bracket",
        shortLabel: "Bracket",
        description: "Generate and review the knockout bracket."
    },
    {
        id: "active-round",
        title: "Play tournament",
        label: "Play tournament",
        shortLabel: "Tournament",
        description: "Enter match scores and advance the winners."
    },
    {
        id: "tournament-complete",
        title: "Tournament complete",
        label: "Tournament complete",
        shortLabel: "Champion",
        description: "Review the champion and tournament report."
    }
];

export function isWorkflowStep(stepId) {
    return WORKFLOW_STEPS.some(step => step.id === stepId);
}

export function getWorkflowStep(stepId) {
    return WORKFLOW_STEPS.find(step => step.id === stepId) ?? WORKFLOW_STEPS[0];
}

export function getWorkflowStepIndex(stepId) {
    const index = WORKFLOW_STEPS.findIndex(step => step.id === stepId);
    return index >= 0 ? index : 0;
}

export function getNextWorkflowStep(stepId) {
    const nextIndex = getWorkflowStepIndex(stepId) + 1;
    return WORKFLOW_STEPS[nextIndex] ?? null;
}

export function getPreviousWorkflowStep(stepId) {
    const previousIndex = getWorkflowStepIndex(stepId) - 1;
    return WORKFLOW_STEPS[previousIndex] ?? null;
}