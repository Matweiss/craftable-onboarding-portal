'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, Customer, Task, CustomerProgress, Report } from '@/lib/supabase'
import { CheckCircle2, Circle, Clock, FileText, ChevronDown, ChevronUp, LogOut, MessageSquare } from 'lucide-react'

interface TaskWithProgress extends Task {
  progress: CustomerProgress | null
}

interface PhaseGroup {
  phase: number
  phase_name: string
  tasks: TaskWithProgress[]
  completed: number
  total: number
}

export default function CustomerDashboard() {
  const router = useRouter()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [phases, setPhases] = useState<PhaseGroup[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedPhases, setExpandedPhases] = useState<number[]>([0, 1])
  const [updatingTask, setUpdatingTask] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError) {
        setError(`Session error: ${sessionError.message}`)
        setLoading(false)
        return
      }

      if (!session) {
        setError('No session found. Redirecting to login...')
        setTimeout(() => router.push('/'), 2000)
        return
      }

      // Get customer record
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('email', session.user.email)
        .single()

      if (customerError) {
        setError(`Customer lookup error: ${customerError.message}. Email: ${session.user.email}`)
        setLoading(false)
        return
      }

      if (!customerData) {
        setError(`No customer record found for email: ${session.user.email}`)
        setLoading(false)
        return
      }

      setCustomer(customerData)

      // Get all tasks
      const { data: tasksData } = await supabase
        .from('tasks')
        .select('*')
        .order('sort_order')

      // Get customer progress
      const { data: progressData } = await supabase
        .from('customer_progress')
        .select('*')
        .eq('customer_id', customerData.id)

      // Get reports
      const { data: reportsData } = await supabase
        .from('reports')
        .select('*')
        .order('sort_order')

      if (reportsData) setReports(reportsData)

      // Combine tasks with progress
      const tasksWithProgress: TaskWithProgress[] = (tasksData || []).map(task => ({
        ...task,
        progress: progressData?.find(p => p.task_id === task.id) || null
      }))

      // Group by phase
      const phaseGroups: PhaseGroup[] = []
      tasksWithProgress.forEach(task => {
        let group = phaseGroups.find(g => g.phase === task.phase)
        if (!group) {
          group = {
            phase: task.phase,
            phase_name: task.phase_name,
            tasks: [],
            completed: 0,
            total: 0
          }
          phaseGroups.push(group)
        }
        group.tasks.push(task)
        group.total++
        if (task.progress?.completed) group.completed++
      })

      setPhases(phaseGroups.sort((a, b) => a.phase - b.phase))
      setLoading(false)
    } catch (err) {
      setError(`Unexpected error: ${err}`)
      setLoading(false)
    }
  }

  const toggleTask = async (taskId: string, currentCompleted: boolean) => {
    if (!customer) return
    setUpdatingTask(taskId)

    const { error } = await supabase
      .from('customer_progress')
      .update({
        completed: !currentCompleted,
        completed_at: !currentCompleted ? new Date().toISOString() : null
      })
      .eq('customer_id', customer.id)
      .eq('task_id', taskId)

    if (!error) {
      await loadData()
    }
    setUpdatingTask(null)
  }

  const updateNotes = async (taskId: string, notes: string) => {
    if (!customer) return

    await supabase
      .from('customer_progress')
      .update({ notes })
      .eq('customer_id', customer.id)
      .eq('task_id', taskId)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const togglePhase = (phase: number) => {
    setExpandedPhases(prev =>
      prev.includes(phase)
        ? prev.filter(p => p !== phase)
        : [...prev, phase]
    )
  }

  const totalCompleted = phases.reduce((acc, p) => acc + p.completed, 0)
  const totalTasks = phases.reduce((acc, p) => acc + p.total, 0)
  const overallProgress = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0

  const getPhaseColor = (phase: number) => {
    const colors: Record<number, string> = {
      0: 'bg-gray-500',
      1: 'bg-blue-500',
      2: 'bg-orange-500',
      3: 'bg-green-500',
      4: 'bg-indigo-900'
    }
    return colors[phase] || 'bg-gray-500'
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Dashboard Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">craftable</h1>
            <p className="text-sm text-gray-500">Onboarding Portal</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="font-medium text-gray-900">{customer?.name}</p>
              <p className="text-sm text-gray-500">{customer?.email}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Overall Progress */}
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Your Onboarding Progress</h2>
            <span className="text-3xl font-bold text-blue-500">{overallProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500 rounded-full"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-gray-500">
            {totalCompleted} of {totalTasks} tasks completed
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Tasks Column */}
          <div className="lg:col-span-2 space-y-4">
            {phases.map((phase) => (
              <div key={phase.phase} className="bg-white rounded-lg shadow-sm border overflow-hidden">
                <button
                  onClick={() => togglePhase(phase.phase)}
                  className={`w-full px-4 py-3 flex items-center justify-between text-white ${getPhaseColor(phase.phase)}`}
                >
                  <span className="font-semibold">{phase.phase_name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm opacity-90">
                      {phase.completed}/{phase.total}
                    </span>
                    {expandedPhases.includes(phase.phase) ? (
                      <ChevronUp size={20} />
                    ) : (
                      <ChevronDown size={20} />
                    )}
                  </div>
                </button>

                {expandedPhases.includes(phase.phase) && (
                  <div className="divide-y divide-gray-100">
                    {phase.tasks.map((task) => (
                      <div
                        key={task.id}
                        className={`p-4 transition-all ${
                          task.progress?.completed ? 'bg-green-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => toggleTask(task.id, task.progress?.completed || false)}
                            disabled={updatingTask === task.id}
                            className="mt-0.5 flex-shrink-0"
                          >
                            {updatingTask === task.id ? (
                              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            ) : task.progress?.completed ? (
                              <CheckCircle2 className="w-5 h-5 text-green-500" />
                            ) : (
                              <Circle className="w-5 h-5 text-gray-300 hover:text-blue-500 transition-colors" />
                            )}
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className={`font-medium ${
                                task.progress?.completed ? 'text-gray-500 line-through' : 'text-gray-900'
                              }`}>
                                {task.task_name}
                              </h3>
                              {task.is_success_gate && (
                                <span className="px-2 py-0.5 text-xs font-medium bg-green-500 text-white rounded-full">
                                  Success Gate
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-500 mt-1">{task.description}</p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                              <span className="flex items-center gap-1">
                                <Clock size={12} />
                                {task.est_time}
                              </span>
                              <span>Owner: {task.owner}</span>
                              {task.unlocks_report && (
                                <span className="flex items-center gap-1 text-blue-500">
                                  <FileText size={12} />
                                  Unlocks: {task.unlocks_report}
                                </span>
                              )}
                            </div>

                            {/* Notes Input */}
                            <div className="mt-3">
                              <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                                <MessageSquare size={12} />
                                Notes
                              </div>
                              <textarea
                                defaultValue={task.progress?.notes || ''}
                                onBlur={(e) => updateNotes(task.id, e.target.value)}
                                placeholder="Add notes..."
                                className="w-full text-sm p-2 border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none"
                                rows={2}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Phase Progress Summary */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Phase Progress</h3>
              <div className="space-y-3">
                {phases.map((phase) => (
                  <div key={phase.phase} className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${getPhaseColor(phase.phase)}`} />
                    <span className="flex-1 text-sm text-gray-600">Phase {phase.phase}</span>
                    <span className="text-sm font-medium">
                      {phase.completed}/{phase.total}
                    </span>
                    {phase.completed === phase.total && phase.total > 0 && (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Contact */}
            <div className="bg-indigo-900 rounded-xl p-6 text-white">
              <h3 className="font-semibold mb-2">Need Help?</h3>
              <p className="text-sm text-blue-100 mb-4">
                Your Onboarding Manager is here to help.
              </p>
              <p className="text-sm">
                <span className="text-blue-200">Assigned OM:</span>{' '}
                {customer?.assigned_om}
              </p>
              <a
                href="mailto:support@craftable.com"
                className="mt-4 block w-full text-center py-2 bg-white text-indigo-900 rounded-lg font-medium hover:bg-gray-100 transition-all"
              >
                Contact Support
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
