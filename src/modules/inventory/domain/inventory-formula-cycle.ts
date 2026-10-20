export type FormulaEdge = { outputItemId: string; ingredientItemIds: string[] };

export function createsInventoryFormulaCycle(edges: FormulaEdge[], outputItemId: string, ingredientItemIds: string[]) {
  const graph = new Map<string, Set<string>>();
  for (const edge of edges) graph.set(edge.outputItemId, new Set(edge.ingredientItemIds));
  graph.set(outputItemId, new Set(ingredientItemIds));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of graph.get(node) ?? []) if (graph.has(next) && visit(next)) return true;
    visiting.delete(node); visited.add(node); return false;
  };
  return [...graph.keys()].some(visit);
}
