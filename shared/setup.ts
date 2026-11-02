import type {
  PlanStep,
  PlanWebhookTemplate,
  WorkflowPlan,
} from "./workflows.ts";

export const fieldReferencePattern =
  /^\{\{[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*){1,8}\}\}$/;
export function webhookAddressIssue(address: string): string | null {
  try {
    const url = new URL(address.trim());
    if (
      (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port)) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return "Use an HTTPS address, or the backend's configured local test receiver, without credentials, query parameters, or fragments.";
  } catch {
    return "Enter a valid HTTPS endpoint address.";
  }
  return null;
}
export function webhookEndpointIssue(template: PlanWebhookTemplate): string | null {
  const issue = webhookAddressIssue(template.endpoint.urlTemplate);
  if (issue) return issue;
  const url = new URL(template.endpoint.urlTemplate.trim());
  if (url.hostname.endsWith(".invalid") || /[{}]/.test(template.endpoint.urlTemplate))
    return "Replace the placeholder endpoint with the address you intend to use.";
  return null;
}
export function webhookAuthenticationIssue(
  template: PlanWebhookTemplate,
): string | null {
  if (!/^[A-Za-z0-9-]{1,100}$/.test(template.authentication.headerName))
    return "Enter a valid authentication header name.";
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(
      template.authentication.secretRef,
    )
  )
    return "Enter a credential reference name, not the secret value.";
  return null;
}
export function webhookPayloadIssue(
  template: PlanWebhookTemplate,
): string | null {
  const entries = Object.entries(template.payloadTemplate);
  if (!entries.length || entries.length > 20)
    return "Add between 1 and 20 payload fields.";
  if (
    entries.some(
      ([key, value]) =>
        !/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(key) ||
        value.length > 204 ||
        !fieldReferencePattern.test(value),
    )
  )
    return "Use simple field names and references such as {{order.id}} for payload values.";
  return null;
}
export function webhookSetupIssues(template: PlanWebhookTemplate): string[] {
  const automatic = template.configuredBy === 'muse' && !!template.connectionId;
  return [
    webhookEndpointIssue(template),
    webhookAuthenticationIssue(template),
    webhookPayloadIssue(template),
    !automatic && !template.setup?.endpointReviewed ? "Review the endpoint." : null,
    !automatic && !template.setup?.authenticationReviewed
      ? "Review the authentication reference."
      : null,
    !automatic && !template.setup?.payloadReviewed ? "Review the payload mappings." : null,
  ].filter((issue): issue is string => !!issue);
}
export function webhookMappingsIssue(
  step: PlanStep,
  template: PlanWebhookTemplate,
): string | null {
  for (const [name, reference] of Object.entries(template.payloadTemplate)) {
    if (!fieldReferencePattern.test(reference))
      return "Review the webhook payload references.";
    const source =
      template.direction === "incoming"
        ? `webhook.payload.${name}`
        : reference.slice(2, -2);
    const target =
      template.direction === "incoming"
        ? reference.slice(2, -2)
        : `webhook.payload.${name}`;
    if (
      !step.mappings.some(
        (mapping) => mapping.source === source && mapping.target === target,
      )
    )
      return "The linked step mappings do not match the reviewed webhook payload.";
  }
  return null;
}
export function stepSetupIssues(step: PlanStep): string[] {
  const issues: string[] = [];
  if (!step.title.trim()) issues.push("Enter a step name.");
  if (!step.operation.trim()) issues.push("Describe the operation.");
  if (
    step.configuration.some(
      (setting) =>
        !setting.label.trim() || !setting.value.trim() || setting.needsInput,
    )
  )
    issues.push(
      "Complete the configuration settings and clear Needs input when resolved.",
    );
  if (step.role === "decision" && !step.configuration.length)
    issues.push("Add the condition used by this decision.");
  for (const fields of [step.inputs, step.outputs]) {
    if (
      fields.some((field) => !field.name.trim()) ||
      new Set(fields.map((field) => field.name.trim())).size !== fields.length
    )
      issues.push(
        "Input and output field names must be present and unique within each list.",
      );
  }
  if (
    step.mappings.some(
      (mapping) => !mapping.source.trim() || !mapping.target.trim(),
    )
  )
    issues.push("Complete both sides of every field mapping.");
  return issues;
}
export function workflowSetupSummary(plan: WorkflowPlan) {
  const reviewedSteps = plan.steps.filter(
    (step) => step.reviewed && !stepSetupIssues(step).length,
  ).length;
  const configuredSteps = plan.steps.filter(
    (step) => (step.reviewed || step.configuredBy === 'muse') && !stepSetupIssues(step).length,
  ).length;
  const configuredWebhooks = plan.webhooks.filter((webhook) => {
    const step = plan.steps.find(
      (item) => item.webhookTemplateId === webhook.id,
    );
    return (
      !!step &&
      !webhookSetupIssues(webhook).length &&
      !webhookMappingsIssue(step, webhook)
    );
  }).length;
  const answeredQuestions = plan.questions.filter((question) =>
    question.answer?.trim(),
  ).length;
  const complete =
    !!plan.steps.length &&
    !!plan.structureReviewed &&
    configuredSteps === plan.steps.length &&
    configuredWebhooks === plan.webhooks.length &&
    answeredQuestions === plan.questions.length;
  return { reviewedSteps, configuredSteps, configuredWebhooks, answeredQuestions, complete };
}
export function refreshPlanChecks(plan: WorkflowPlan): WorkflowPlan {
  const summary = workflowSetupSummary(plan);
  return {
    ...plan,
    checks: [
      {
        id: "structure",
        title: "Workflow structure",
        description: `${plan.steps.length} steps and ${plan.edges.length} connections.`,
        status: plan.structureReviewed ? "reviewed" : "pending",
      },
      {
        id: "configuration",
        title: "Step setup",
        description: `${summary.configuredSteps} of ${plan.steps.length} steps configured.`,
        status:
          summary.configuredSteps === plan.steps.length
            ? plan.steps.some((step) => step.configuredBy === 'muse' && !step.reviewed) ? "configured" : "reviewed"
            : "needs-input",
      },
      {
        id: "webhooks",
        title: "Webhook setup",
        description: `${summary.configuredWebhooks} of ${plan.webhooks.length} webhooks configured. See outgoing delivery history for test results.`,
        status:
          summary.configuredWebhooks === plan.webhooks.length
            ? plan.webhooks.some((hook) => hook.configuredBy === 'muse') ? "configured" : "reviewed"
            : "needs-input",
      },
      {
        id: "questions",
        title: "Open questions",
        description: `${summary.answeredQuestions} of ${plan.questions.length} questions answered.`,
        status:
          summary.answeredQuestions === plan.questions.length
            ? "reviewed"
            : "needs-input",
      },
      {
        id: "execution",
        title: "Live execution",
        description: "Start a saved workflow on the canvas. Execution results are recorded with each run.",
        status: "not-run",
      },
    ],
  };
}
