import { Agent, OpenAIResponsesModel, Runner } from "@openai/agents";
import OpenAI from "openai";
import { z } from "zod";
import { GrowthLaneSchema, type GrowthLane } from "./schema.js";

export { GrowthLaneSchema };
export type { GrowthLane };

export const StrategyDecisionSchema = z.enum([
  "observe_more",
  "repeat",
  "repair",
  "stop",
  "propose_scale",
]);

export type StrategyDecision = z.infer<typeof StrategyDecisionSchema>;

export const ApprovalBoundarySchema = z.enum([
  "publish_instagram",
  "publish_facebook",
  "schedule_social",
  "use_media_or_likeness",
  "send_outreach",
  "join_or_post_group",
  "change_search_console",
  "merge_website_change",
  "deploy_website_change",
]);

const EvidenceClaimSchema = z.object({
  claim: z.string().min(1).max(320),
  evidenceId: z.string().min(1).max(160),
});

export const AgentStrategyProposalSchema = z.object({
  lane: GrowthLaneSchema,
  decision: StrategyDecisionSchema,
  hypothesis: z.string().min(1).max(700),
  controlledVariable: z.string().min(1).max(120),
  currentArm: z.string().max(400).nullable(),
  proposedArm: z.string().min(1).max(700),
  draftContent: z.string().min(1).max(8_000),
  callToAction: z.string().min(1).max(1_000),
  audience: z.string().min(1).max(1_000),
  primaryKpi: z.string().min(1).max(160),
  rationale: z.array(EvidenceClaimSchema).min(1).max(6),
  risks: z.array(EvidenceClaimSchema).max(6),
  maturityRule: z.string().min(1).max(400),
  comparisonRule: z.string().min(1).max(500),
  stopRule: z.string().min(1).max(500),
  scaleRule: z.string().min(1).max(500),
  requiredApprovals: z.array(ApprovalBoundarySchema).max(6),
  disclosures: z.array(z.string().min(1).max(320)).max(8),
});

export type AgentStrategyProposal = z.infer<typeof AgentStrategyProposalSchema>;

export const StrategyEvalDefectSchema = z.object({
  code: z.enum([
    "unsupported_claim",
    "invalid_evidence",
    "wrong_lane",
    "wrong_kpi",
    "multiple_variables",
    "immature_evidence",
    "privacy_or_consent",
    "paid_organic_confusion",
    "unsafe_contacting",
    "protected_index_path",
    "deprecated_search_target",
    "missing_approval",
    "missing_measurement_rule",
    "policy_conflict",
    "unclear_output",
  ]),
  message: z.string().min(1).max(400),
  target: z.enum([
    "decision",
    "hypothesis",
    "controlled_variable",
    "arm",
    "kpi",
    "rationale",
    "risk",
    "maturity",
    "comparison",
    "stop_rule",
    "scale_rule",
    "approval",
    "disclosure",
  ]),
});

export type StrategyEvalDefect = z.infer<typeof StrategyEvalDefectSchema>;

export const StrategyEvaluationSchema = z.object({
  status: z.enum(["pass", "repair", "quarantine"]),
  defects: z.array(StrategyEvalDefectSchema).max(10),
});

export type StrategyEvaluation = z.infer<typeof StrategyEvaluationSchema>;

export interface StrategyEvidence {
  id: string;
  kind: string;
  source: string;
  observedAt: string;
  summary: string;
}

export interface LaneStrategyInput {
  analysisId: string;
  lane: GrowthLane;
  eligibility: "eligible" | "observe_more" | "quarantined";
  primaryKpi: string;
  recommendedDecision: StrategyDecision;
  allowedControlledVariables: string[];
  baselineSummary: string;
  opportunitySummary: string;
  sourceCoverageSummary: string;
  maturitySummary: string;
  guardrails: string[];
  evidence: StrategyEvidence[];
}

export interface StrategyRequest {
  input: LaneStrategyInput;
  priorDefects?: StrategyEvalDefect[];
  attempt: number;
  signal?: AbortSignal;
}

export type GrowthStrategist = (
  request: StrategyRequest,
) => Promise<AgentStrategyProposal>;

export type GrowthStrategyEvaluator = (
  input: LaneStrategyInput,
  proposal: AgentStrategyProposal,
  options?: { signal?: AbortSignal },
) => Promise<StrategyEvaluation>;

export interface OpenAIGrowthOptions {
  model?: string;
  promptVersion?: string;
  apiKey?: string;
  reasoningEffort?: GrowthReasoningEffort;
}

export const DEFAULT_GROWTH_MODEL = "gpt-5.6-terra";
export const GrowthReasoningEffortSchema = z.enum([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);
export type GrowthReasoningEffort = z.infer<
  typeof GrowthReasoningEffortSchema
>;
export const DEFAULT_GROWTH_REASONING_EFFORT: GrowthReasoningEffort = "low";
export const OPENAI_PROVIDER_MAX_RETRIES = 0;
export const AGENT_SDK_MODEL_MAX_RETRIES = 0;
export const AGENT_SDK_MAX_TURNS = 1;

export function createNoRetryOpenAIClient(apiKey?: string): OpenAI {
  const resolvedApiKey = apiKey ?? process.env.OPENAI_API_KEY;
  if (!resolvedApiKey) {
    throw new Error("OPENAI_API_KEY is required for growth strategy nodes");
  }
  return new OpenAI({
    apiKey: resolvedApiKey,
    maxRetries: OPENAI_PROVIDER_MAX_RETRIES,
  });
}

function createPrivateRunner(): Runner {
  return new Runner({
    tracingDisabled: true,
    traceIncludeSensitiveData: false,
  });
}

const strategistInstructions = `You are the bounded strategy node in the Code the Future growth graph. Return only the declared structured output.

Hard rules:
- Use only the lane analysis and redacted evidence supplied in the request.
- Every rationale and risk claim must cite one supplied evidenceId.
- Keep Instagram and Facebook metrics separate. Never present paid or boosted distribution as organic.
- Never infer consent from a filename, prior website permission, or publication screen.
- Never propose collecting children, private-group members, personal parent profiles, or unconsented referred-parent data.
- Never propose publishing, sending, joining, posting, spending, changing an account/property, merging, or deploying. You may prepare a proposal that names the exact human approval it would require.
- Change exactly one allowed material variable. Use the supplied primary KPI and maturity rules.
- Copy controlledVariable exactly from allowedControlledVariables. If the evidence cannot establish that every other material attribute is held constant, choose observe_more or repair instead of inventing a comparable arm.
- draftContent must be the exact proposed caption, outreach copy, or SEO change specification—not a placeholder. State the exact call to action and intended audience separately.
- requiredApprovals is mandatory when the draft could lead to an external action: use publish_instagram or publish_facebook for that exact social platform, send_outreach for a public contact draft, join_or_post_group in addition to send_outreach for a group post, and merge_website_change plus deploy_website_change for an SEO change. Include use_media_or_likeness whenever a social asset is in scope.
- Do not optimize for FAQ rich results. Do not propose indexing learner, platform, curriculum, admin, docs, API, or checkout-success paths.
- If evidence is incomplete or immature, choose observe_more or repair. Do not manufacture a winner.
- The five allowed decisions are observe_more, repeat, repair, stop, and propose_scale.`;

const evaluatorInstructions = `You are the independent evaluator node for the Code the Future growth graph. Return only the declared structured output.

Check the proposal against the supplied evidence, deterministic analysis, privacy policy, maturity rules, lane KPI, single-variable rule, and approval boundary. Identify concrete defects; do not rewrite the proposal. Quarantine a repeated or unsafe privacy, consent, child-data, private-group, protected-index-path, or unauthorized-action defect. Use pass only when every material claim is supported and the proposal remains a local draft awaiting exact human review.`;

function strategyPrompt(request: StrategyRequest): string {
  return JSON.stringify(
    {
      task: "Propose the next bounded hill-climbing decision for one growth lane",
      attempt: request.attempt,
      priorDefects: request.priorDefects ?? [],
      laneAnalysis: request.input,
    },
    null,
    2,
  );
}

export function createOpenAIGrowthStrategist(
  options: OpenAIGrowthOptions = {},
): GrowthStrategist {
  const model =
    options.model ?? process.env.CODE_THE_FUTURE_STRATEGY_MODEL ?? DEFAULT_GROWTH_MODEL;
  const modelRuntime = new OpenAIResponsesModel(
    createNoRetryOpenAIClient(options.apiKey),
    model,
  );
  const runner = createPrivateRunner();
  const agent = new Agent({
    name: "Code the Future growth strategist",
    model: modelRuntime,
    instructions: `${strategistInstructions}\nPrompt version: ${options.promptVersion ?? "ctf-growth-strategy-v1"}`,
    outputType: AgentStrategyProposalSchema,
    modelSettings: {
      retry: { maxRetries: AGENT_SDK_MODEL_MAX_RETRIES },
      reasoning: {
        effort: options.reasoningEffort ?? DEFAULT_GROWTH_REASONING_EFFORT,
      },
      store: false,
    },
  });

  return async (request) => {
    const result = await runner.run(agent, strategyPrompt(request), {
      maxTurns: AGENT_SDK_MAX_TURNS,
      ...(request.signal ? { signal: request.signal } : {}),
    });
    if (!result.finalOutput) {
      throw new Error("Growth strategist returned no structured output");
    }
    return AgentStrategyProposalSchema.parse(result.finalOutput);
  };
}

export function createOpenAIGrowthStrategyEvaluator(
  options: OpenAIGrowthOptions = {},
): GrowthStrategyEvaluator {
  const model =
    options.model ?? process.env.CODE_THE_FUTURE_EVAL_MODEL ?? DEFAULT_GROWTH_MODEL;
  const modelRuntime = new OpenAIResponsesModel(
    createNoRetryOpenAIClient(options.apiKey),
    model,
  );
  const runner = createPrivateRunner();
  const agent = new Agent({
    name: "Code the Future independent growth evaluator",
    model: modelRuntime,
    instructions: `${evaluatorInstructions}\nPrompt version: ${options.promptVersion ?? "ctf-growth-eval-v1"}`,
    outputType: StrategyEvaluationSchema,
    modelSettings: {
      retry: { maxRetries: AGENT_SDK_MODEL_MAX_RETRIES },
      reasoning: {
        effort: options.reasoningEffort ?? DEFAULT_GROWTH_REASONING_EFFORT,
      },
      store: false,
    },
  });

  return async (input, proposal, runOptions) => {
    const result = await runner.run(
      agent,
      JSON.stringify(
        {
          task: "Evaluate one bounded growth proposal",
          laneAnalysis: input,
          proposal,
        },
        null,
        2,
      ),
      {
        maxTurns: AGENT_SDK_MAX_TURNS,
        ...(runOptions?.signal ? { signal: runOptions.signal } : {}),
      },
    );
    if (!result.finalOutput) {
      throw new Error("Growth evaluator returned no structured output");
    }
    return StrategyEvaluationSchema.parse(result.finalOutput);
  };
}

export function validateStrategyProposal(
  input: LaneStrategyInput,
  proposal: AgentStrategyProposal,
): StrategyEvaluation {
  const defects: StrategyEvalDefect[] = [];
  const evidenceIds = new Set(input.evidence.map((evidence) => evidence.id));

  if (proposal.lane !== input.lane) {
    defects.push({
      code: "wrong_lane",
      message: `Proposal lane ${proposal.lane} does not match ${input.lane}`,
      target: "decision",
    });
  }
  if (proposal.primaryKpi !== input.primaryKpi) {
    defects.push({
      code: "wrong_kpi",
      message: `Proposal must use the lane KPI ${input.primaryKpi}`,
      target: "kpi",
    });
  }
  if (!input.allowedControlledVariables.includes(proposal.controlledVariable)) {
    defects.push({
      code: "multiple_variables",
      message: `Controlled variable must be exactly one allowed value: ${input.allowedControlledVariables.join(", ")}`,
      target: "controlled_variable",
    });
  }
  for (const [target, claims] of [
    ["rationale", proposal.rationale],
    ["risk", proposal.risks],
  ] as const) {
    for (const claim of claims) {
      if (!evidenceIds.has(claim.evidenceId)) {
        defects.push({
          code: "invalid_evidence",
          message: `${target} cites unknown evidence ${claim.evidenceId}`,
          target,
        });
      }
    }
  }
  if (
    input.eligibility !== "eligible" &&
    !["observe_more", "repair", "stop"].includes(proposal.decision)
  ) {
    defects.push({
      code: "immature_evidence",
      message: `A ${input.eligibility} lane cannot repeat or propose scale`,
      target: "decision",
    });
  }
  if (
    proposal.decision === "propose_scale" &&
    input.recommendedDecision !== "propose_scale"
  ) {
    defects.push({
      code: "policy_conflict",
      message:
        "A model proposal cannot scale unless deterministic analysis recommends propose_scale",
      target: "decision",
    });
  }
  if (
    proposal.decision === "repeat" &&
    !["repeat", "propose_scale"].includes(input.recommendedDecision)
  ) {
    defects.push({
      code: "policy_conflict",
      message:
        "A model proposal cannot repeat when deterministic analysis requires observation, repair, or stop",
      target: "decision",
    });
  }
  const searchable = JSON.stringify(proposal);
  if (/faq\s+rich\s+result/i.test(searchable)) {
    defects.push({
      code: "deprecated_search_target",
      message: "FAQ rich-result appearance is not an allowed 2026 success target",
      target: "hypothesis",
    });
  }
  if (
    proposal.lane === "search_console" &&
    /\/(?:platform|curriculum|admin|docs|api)(?:\/|\b)|checkout-success/i.test(
      searchable,
    )
  ) {
    defects.push({
      code: "protected_index_path",
      message: "Proposal references a path that must remain outside public indexing",
      target: "arm",
    });
  }

  return {
    status: defects.length === 0 ? "pass" : "repair",
    defects,
  };
}
