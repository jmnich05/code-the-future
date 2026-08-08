import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_SDK_MAX_TURNS,
  AGENT_SDK_MODEL_MAX_RETRIES,
  DEFAULT_GROWTH_MODEL,
  OPENAI_PROVIDER_MAX_RETRIES,
  AgentStrategyProposalSchema,
  createNoRetryOpenAIClient,
  validateStrategyProposal,
  type LaneStrategyInput,
} from "../src/assessor.js";

const laneInput: LaneStrategyInput = {
  analysisId: "analysis-social-synthetic",
  lane: "organic_social",
  eligibility: "eligible",
  primaryKpi: "organic_net_new_followers_60d_instagram",
  recommendedDecision: "repeat",
  allowedControlledVariables: ["hook", "format", "call_to_action", "publishing_window"],
  baselineSummary: "Synthetic baseline is complete for Instagram.",
  opportunitySummary: "A responsible-AI carousel is directionally promising.",
  sourceCoverageSummary: "Synthetic Instagram insight export is complete.",
  maturitySummary: "Three comparable executions are older than 72 hours.",
  guardrails: ["Keep paid and organic reach separate", "Require scoped media consent"],
  evidence: [
    {
      id: "evidence-social-synthetic-1",
      kind: "post_insight",
      source: "synthetic_instagram",
      observedAt: "2026-08-08T12:00:00.000Z",
      summary: "Synthetic mature organic carousel insight.",
    },
  ],
};

function proposalFixture() {
  return AgentStrategyProposalSchema.parse({
    lane: "organic_social",
    decision: "repeat",
    hypothesis: "A clearer first-slide hook may improve profile-to-follow rate.",
    controlledVariable: "hook",
    currentArm: "Current responsible-AI headline",
    proposedArm: "Question-led responsible-AI headline",
    draftContent: "What should every young person know about responsible AI? Build, question, and create with Code the Future.",
    callToAction: "Follow for the next build session.",
    audience: "Louisville-area parents and guardians",
    primaryKpi: "organic_net_new_followers_60d_instagram",
    rationale: [
      {
        claim: "The synthetic mature carousel is directionally promising.",
        evidenceId: "evidence-social-synthetic-1",
      },
    ],
    risks: [],
    maturityRule: "Wait at least 72 hours after each publication.",
    comparisonRule: "Compare three executions per arm on profile-to-follow rate.",
    stopRule: "Stop if hides or unfollows materially increase.",
    scaleRule: "Only propose scale after three mature, guardrail-safe executions.",
    requiredApprovals: ["publish_instagram"],
    disclosures: ["Synthetic fixture; no live post or learner data."],
  });
}

test("disables provider and SDK retries and bounds each SDK run to one turn", () => {
  const client = createNoRetryOpenAIClient("synthetic-api-key");
  assert.equal(client.maxRetries, 0);
  assert.equal(OPENAI_PROVIDER_MAX_RETRIES, 0);
  assert.equal(AGENT_SDK_MODEL_MAX_RETRIES, 0);
  assert.equal(AGENT_SDK_MAX_TURNS, 1);
  assert.equal(DEFAULT_GROWTH_MODEL, "gpt-5.6-terra");
});

test("accepts one evidence-backed controlled variable", () => {
  assert.deepEqual(validateStrategyProposal(laneInput, proposalFixture()), {
    status: "pass",
    defects: [],
  });
});

test("rejects unknown evidence, a wrong KPI, and an uncontrolled variable", () => {
  const proposal = proposalFixture();
  proposal.primaryKpi = "combined_social_followers";
  proposal.controlledVariable = "hook_and_format";
  proposal.rationale[0]!.evidenceId = "missing";
  const result = validateStrategyProposal(laneInput, proposal);
  assert.equal(result.status, "repair");
  assert.deepEqual(
    result.defects.map((defect) => defect.code),
    ["wrong_kpi", "multiple_variables", "invalid_evidence"],
  );
});

test("does not allow immature evidence to produce a scale proposal", () => {
  const input = { ...laneInput, eligibility: "observe_more" as const };
  const proposal = proposalFixture();
  proposal.decision = "propose_scale";
  const result = validateStrategyProposal(input, proposal);
  assert.ok(result.defects.some((defect) => defect.code === "immature_evidence"));
});

test("does not let model judgment outrun the deterministic scale decision", () => {
  const input = { ...laneInput, recommendedDecision: "repeat" as const };
  const proposal = proposalFixture();
  proposal.decision = "propose_scale";
  const result = validateStrategyProposal(input, proposal);
  assert.ok(result.defects.some((defect) => defect.code === "policy_conflict"));
});

test("blocks deprecated SEO targets and protected index paths", () => {
  const input: LaneStrategyInput = {
    ...laneInput,
    lane: "search_console",
    primaryKpi: "nonbrand_parent_intent_gsc_clicks_28d",
    allowedControlledVariables: ["title_meta_alignment"],
  };
  const proposal = proposalFixture();
  proposal.lane = "search_console";
  proposal.primaryKpi = input.primaryKpi;
  proposal.controlledVariable = "title_meta_alignment";
  proposal.hypothesis = "Win an FAQ rich result for /platform/private-learning.";
  proposal.proposedArm = "Index /platform/private-learning.";
  const result = validateStrategyProposal(input, proposal);
  assert.ok(
    result.defects.some((defect) => defect.code === "deprecated_search_target"),
  );
  assert.ok(result.defects.some((defect) => defect.code === "protected_index_path"));
});
