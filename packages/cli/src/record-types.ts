export const recordTypes = {
  prd: {
    directory: "docs/product", prefix: "PRD", initialStatus: "proposed",
    sections: ["Problem", "Goals", "Acceptance criteria"],
  },
  adr: {
    directory: "docs/decisions", prefix: "ADR", initialStatus: "proposed",
    sections: ["Context", "Decision", "Consequences"],
  },
  story: {
    directory: "docs/work/items", prefix: "STORY", initialStatus: "pending",
    sections: ["Outcome", "Acceptance criteria", "Verification plan"],
  },
  note: {
    directory: "docs/knowledge/inbox", prefix: "NOTE", initialStatus: "inbox",
    sections: ["Discovery", "Classification"],
  },
  research: {
    directory: "docs/knowledge/research", prefix: "RESEARCH", initialStatus: "draft",
    sections: ["Question", "Sources", "Findings", "Options and trade-offs", "Open questions"],
  },
  brainstorm: {
    directory: "docs/knowledge/brainstorming", prefix: "BRAINSTORM", initialStatus: "draft",
    sections: ["Problem", "Ideas", "Ideas set aside and why", "Open questions", "Next steps"],
  },
} as const;

export type RecordType = keyof typeof recordTypes;

export const recordTypeNames = Object.keys(recordTypes) as RecordType[];
export const knowledgeTypes = recordTypeNames.filter((type) => type !== "story");
export const knowledgeAddTypes = knowledgeTypes.filter((type) => type !== "note");
