import { describe, it, expect } from "vitest";
import { TIERS, SITE_ENV, envNameFor, modelFor, openRouterSlug } from "@/kernel/ai/models";

describe("lib/ai/models", () => {
  it("tiers pin one spelling per model", () => {
    expect(TIERS.fast).toBe("claude-haiku-4-5");
    expect(TIERS.standard).toBe("claude-sonnet-5");
    expect(TIERS.deep).toBe("claude-opus-5");
  });

  it("modelFor falls back to the tier default", () => {
    expect(modelFor("resume-extract", "fast", {})).toBe("claude-haiku-4-5");
    expect(modelFor("resume-screen", "standard", {})).toBe("claude-sonnet-5");
  });

  it("the seven legacy env override names still work, plus the new interview one", () => {
    const cases: [string, string][] = [
      ["admin-chat", "CHATBOT_MODEL"],
      ["team-chat", "CHATBOT_MODEL"],
      ["program-plan", "CHATBOT_MODEL"],
      ["publish-editor", "WRITER_CLAUDE_MODEL"],
      ["brand-writer", "WRITER_CLAUDE_MODEL"],
      ["campaign-seo", "WRITER_CLAUDE_MODEL"],
      ["entry-copy", "WRITER_CLAUDE_MODEL"],
      ["admin-idea-plan", "IDEAS_CLAUDE_MODEL"],
      ["idea-trends", "IDEAS_CLAUDE_MODEL"],
      ["meeting-summary", "MEETINGS_CLAUDE_MODEL"],
      ["review-summary", "REVIEW_CLAUDE_MODEL"],
      ["coaching-text", "COACHING_CLAUDE_MODEL"],
      ["coaching-summary", "COACHING_CLAUDE_MODEL"],
      ["roadmap-assist", "ROADMAP_ASSIST_MODEL"],
      ["interview-panelist", "INTERVIEW_CLAUDE_MODEL"],
    ];
    for (const [site, envName] of cases) {
      expect(SITE_ENV[site], site).toBe(envName);
      expect(modelFor(site, "standard", { [envName]: "custom-model" }), site).toBe("custom-model");
    }
  });

  it("AI_MODEL_<SITE> is derived from the logAiUsage site name", () => {
    expect(envNameFor("interview-panelist")).toBe("AI_MODEL_INTERVIEW_PANELIST");
    expect(envNameFor("htt-summarize")).toBe("AI_MODEL_HTT_SUMMARIZE");
    expect(modelFor("sprint-extract", "fast", { AI_MODEL_SPRINT_EXTRACT: "x" })).toBe("x");
  });

  it("AI_MODEL_<SITE> beats the legacy shared name; blanks are ignored", () => {
    const env = { CHATBOT_MODEL: "shared", AI_MODEL_ADMIN_CHAT: "specific" };
    expect(modelFor("admin-chat", "standard", env)).toBe("specific");
    expect(modelFor("team-chat", "standard", env)).toBe("shared");
    expect(modelFor("team-chat", "standard", { CHATBOT_MODEL: "  " })).toBe("claude-sonnet-5");
  });

  it("openRouterSlug maps the registry spelling to OpenRouter's dotted one", () => {
    expect(openRouterSlug("claude-haiku-4-5")).toBe("anthropic/claude-haiku-4.5");
    expect(openRouterSlug("claude-sonnet-5")).toBe("anthropic/claude-sonnet-5");
  });
});
