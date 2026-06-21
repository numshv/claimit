export type VerdictType = "eligible" | "verify" | "not_yet";

export type SourceType = "RAG_VERIFIED" | "GENERAL_KNOWLEDGE";

export interface ProgramRecommendation {
  programName: string;
  whyRelevant: string;
  verdict: VerdictType;
  verdictLabel: string;
  /** Whether this recommendation came from our verified document DB or LLM general knowledge. */
  source_type?: SourceType;
  /** Brief explanation of why this program was chosen and where the data came from. */
  reasoning?: string;
  pros: string[];
  cons: string[];
  steps: string[];
  documents: string[];
}

export interface RecommendationResponse {
  recommendations: ProgramRecommendation[];
  conflicts: string | null;
  synergies: string | null;
  priorityAction: string;
}

export interface SummaryResponse {
  summary: {
    situationDescription: string;
    recommendations: {
      programName: string;
      verdict: string;
      firstStep: string;
    }[];
    priorityAction: string;
    disclaimer: string;
  };
}

export interface ChatMessage {
  role: "user" | "model";
  content: string;
}
