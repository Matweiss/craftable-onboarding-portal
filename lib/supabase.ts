import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types for our database
export interface Customer {
  id: string
  name: string
  email: string
  company: string | null
  phone: string | null
  assigned_om: string
  start_date: string
  current_phase: number
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  phase: number
  phase_name: string
  task_name: string
  description: string | null
  owner: string
  est_time: string | null
  sort_order: number
  is_success_gate: boolean
  unlocks_report: string | null
  requires_upload?: boolean
  template_files?: { name: string; url: string }[]
}

export interface CustomerProgress {
  id: string
  customer_id: string
  task_id: string
  completed: boolean
  completed_at: string | null
  notes: string | null
  file_url: string | null
  file_name: string | null
  files: { name: string; url: string; uploaded_at: string }[] | null
  verified: boolean
  verified_at: string | null
  verified_by: string | null
  is_skipped: boolean
  updated_at: string
}

export interface Report {
  id: string
  name: string
  phase: number
  description: string | null
  key_metric: string | null
  report_url: string | null
  sort_order: number | null
  unlocking_task_id: string | null
}

export interface TaskComment {
  id: string
  progress_id: string
  customer_id: string
  author_email: string
  author_name: string | null
  author_role: string
  message: string
  created_at: string
}

export interface TaskWithProgress extends Task {
  progress: CustomerProgress | null
}
