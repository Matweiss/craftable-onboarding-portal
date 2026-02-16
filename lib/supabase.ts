import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Client-side singleton
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

// Server-side client (for optional SSR)
export const createClient = () => {
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return undefined
      },
      set(name: string, value: string, options: any) {
        // SSR
      },
      remove(name: string, options: any) {
        // SSR
      },
    },
  })
}

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
}

export interface TaskWithProgress extends Task {
  progress: CustomerProgress | null
}
