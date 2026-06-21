/**
 * src/lib/graph/router.ts
 *
 * Conditional edge routing functions for the ClaimIt LangGraph.
 * Each function receives the current state and returns the name of the
 * next node to execute (or END to terminate the graph).
 *
 * LangGraph calls these synchronously between node executions.
 * They must be pure functions — no side effects, no async.
 */

import { END } from "@langchain/langgraph";
import type { AgentState } from "./state";

/**
 * Called after intakeNode.
 *
 * Decision:
 *   - Profile has enough data → proceed to retrieval + synthesis
 *   - Profile incomplete → stop here; verdict already contains the follow-up question
 */
export function routeAfterIntake(
  state: AgentState
): "retrievalNode" | typeof END {
  if (state.profileComplete === true) {
    return "retrievalNode";
  }
  return END;
}
