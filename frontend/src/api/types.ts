// Response shapes of the backend API (/api/v1). Kept in step with app.py and src/pipeline.

export interface SystemPrompt {
  base_version: number
  patch_version: number | null
  conflict: boolean
  conflict_patch_version: number | null
  sections: Record<string, string> // protected sections are left out for non-admins
  protected_sections: string[]
  prompt: string
  is_admin: boolean
}

export interface Provider {
  id: string
  name: string
  key_status: 'Valid' | 'Invalid' | 'Not Set'
  key_last4: string | null
}

export interface Model {
  id: string
  context_window: number | null
  free_tier: boolean
}

export interface ModelPreference {
  provider_id: string | null
  model_id: string | null
  updated_at: string | null
}

export interface PatchVersion {
  version: number
  base_version: number
  is_active: boolean
  created_at: string
  sections: Record<string, string>
}

export interface ExecutionResult {
  output: string
  provider_id: string
  model_id: string
  base_version: number
  patch_version: number | null
  prompt_conflict: boolean
  tokens_in: number | null
  tokens_out: number | null
  correlation_id: string
}

export interface BasePrompt {
  version: number
  sections: Record<string, string>
  protected: string[]
  published_by: string | null
  published_at: string | null
}

/** One run as listed by /users/me/runs and /admin/audit (from the execution_audit table). */
export interface RunSummary {
  created_at: string
  correlation_id: string
  user_id: string
  provider_id: string
  model_id: string
  base_version: number | null
  patch_version: number | null
  status: string
  tokens_in: number | null
  tokens_out: number | null
  latency_ms: number | null
}

/** The caller's own run: also the task, and the answer when it was delivered (never a withheld one). */
export interface MyRun extends RunSummary {
  task_text: string | null
  response_text: string | null
}

export interface AuditRow {
  id: number
  user_id: string
  provider_id: string
  model_id: string
  base_version: number | null
  patch_version: number | null
  tokens_in: number | null
  tokens_out: number | null
  latency_ms: number | null
  status: string
  correlation_id: string
  created_at: string
  task_text: string | null
  response_text: string | null
}
