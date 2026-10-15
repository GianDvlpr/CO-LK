export type ProductionBoardStatus = "DRAFT" | "RELEASED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type ProductionBoardColumnStatus = "DRAFT" | "IN_PROGRESS" | "COMPLETED";

const transitions = {
  DRAFT: { target: "RELEASED", action: "release", permission: "production.release" },
  RELEASED: { target: "IN_PROGRESS", action: "start", permission: "production.start" },
  IN_PROGRESS: { target: "COMPLETED", action: "complete", permission: "production.complete" },
} as const;

export function productionBoardTransition(current: string, target: string) {
  const transition = transitions[current as keyof typeof transitions];
  return transition?.target === target ? transition : null;
}

export function productionBoardColumnStatus(status: string): ProductionBoardColumnStatus | null {
  if (status === "DRAFT" || status === "RELEASED") return "DRAFT";
  if (status === "IN_PROGRESS" || status === "COMPLETED") return status;
  return null;
}
