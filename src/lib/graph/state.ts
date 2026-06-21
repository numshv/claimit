/**
 * src/lib/graph/state.ts
 *
 * LangGraph state definition using Annotation.Root (v1.x API).
 * Every field that needs a custom reducer must declare one explicitly.
 * Fields without a reducer are overwritten on each node return.
 */

import { Annotation } from "@langchain/langgraph";
import type { BaseMessage } from "@langchain/core/messages";
import type { RecommendationResponse } from "@/lib/types";

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface UserProfile {
  country?: string;
  age?: number;
  maritalStatus?: string;
  dependents?: number;
  employmentStatus?: "formal" | "informal" | "unemployed" | "entrepreneur" | string;
  incomeLevel?: "very_low" | "low" | "moderate" | "middle" | "above_average";
  housingStatus?: string;
  healthConditions?: string[];
  existingPrograms?: string[];
  primaryNeed?: "health" | "food_income" | "education" | "housing" | "employment";
}

export interface ProgramDoc {
  id: string;
  name: string;
  country: string;
  primaryNeed: UserProfile["primaryNeed"];
  eligibility: string;
  description: string;
  steps: string[];
  documents: string[];
  conflicts?: string[];
}

/** The final output — either a follow-up question (string) or the structured verdict. */
export type VerdictOutput = string | RecommendationResponse | null;

// ---------------------------------------------------------------------------
// LangGraph Annotation
// ---------------------------------------------------------------------------

export const AgentStateAnnotation = Annotation.Root({
  /**
   * Full conversation history in LangChain BaseMessage format.
   * Reducer: append — nodes only need to return new messages.
   */
  messages: Annotation<BaseMessage[]>({
    reducer: (existing, incoming) => existing.concat(incoming),
    default: () => [],
  }),

  /**
   * Extracted user profile. Overwritten each time intakeNode runs.
   * null = not yet extracted.
   */
  profile: Annotation<UserProfile | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  /**
   * Documents fetched by retrievalNode for this profile.
   * Replaced wholesale on each retrieval pass.
   */
  ragContext: Annotation<ProgramDoc[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),

  /**
   * Final output written by synthesizerNode (or the follow-up question
   * written by intakeNode when profile is still incomplete).
   */
  verdict: Annotation<VerdictOutput>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  /**
   * Routing flag. Set to true by intakeNode when enough profile fields
   * are present to generate meaningful recommendations.
   */
  profileComplete: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
});

/** Convenience type inferred from the annotation. */
export type AgentState = typeof AgentStateAnnotation.State;
