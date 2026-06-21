export type VerdictType = "eligible" | "verify" | "not_yet";

export interface ProgramRecommendation {
  programName: string;
  whyRelevant: string;
  verdict: VerdictType;
  verdictLabel: string;
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
