export type {
  PlanField, PlanMapping, PlanSetting, PlanStepConfiguration, PlanStep,
  PlanWebhookTemplate, PlanQuestion, PlanCheck, WorkflowPlan,
} from '../../../../shared/workflows'

// Demo connection state is never proof of a registered webhook.
export type WebhookConnectionState = Record<string, 'connected-demo' | undefined>
