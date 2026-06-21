/**
 * src/lib/graph/index.ts
 *
 * Compiles and exports the ClaimIt LangGraph.
 *
 * Graph topology:
 *
 *   START
 *     │
 *     ▼
 *   intakeNode  ──(profileComplete=false)──→  END
 *     │
 *     └──(profileComplete=true)──→  retrievalNode
 *                                        │
 *                                        ▼
 *                                   synthesizerNode
 *                                        │
 *                                        ▼
 *                                       END
 */

import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentStateAnnotation } from "./state";
import { intakeNode, retrievalNode, synthesizerNode } from "./nodes";
import { routeAfterIntake } from "./router";

const graph = new StateGraph(AgentStateAnnotation)
  // ── Nodes ────────────────────────────────────────────────────────────────
  .addNode("intakeNode", intakeNode)
  .addNode("retrievalNode", retrievalNode)
  .addNode("synthesizerNode", synthesizerNode)

  // ── Fixed edges ───────────────────────────────────────────────────────────
  .addEdge(START, "intakeNode")
  .addEdge("retrievalNode", "synthesizerNode")
  .addEdge("synthesizerNode", END)

  // ── Conditional edge: intakeNode → (retrievalNode | END) ─────────────────
  .addConditionalEdges("intakeNode", routeAfterIntake, {
    retrievalNode: "retrievalNode",
    [END]: END,
  });

/**
 * The compiled, executable ClaimIt graph.
 *
 * Usage in route.ts:
 *
 *   import { claimItGraph } from "@/lib/graph";
 *   import { HumanMessage, AIMessage } from "@langchain/core/messages";
 *
 *   const langchainHistory = history.map((m) =>
 *     m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)
 *   );
 *
 *   const result = await claimItGraph.invoke({
 *     messages: [...langchainHistory, new HumanMessage(message)],
 *   });
 *
 *   // result.verdict is: string (follow-up) | RecommendationResponse | null
 *   return result.verdict;
 */
export const claimItGraph = graph.compile();

// Re-export types for convenience
export type { AgentState, UserProfile, ProgramDoc, VerdictOutput } from "./state";
