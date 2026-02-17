'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, Customer, Task, CustomerProgress, Report } from '@/lib/supabase'
import { 
  CheckCircle2, Circle, Clock, FileText, ChevronDown, ChevronUp, 
  LogOut, MessageSquare, Upload, Download, ExternalLink, Lock, 
  Unlock, BookOpen, LayoutDashboard, Send, X, Check, AlertCircle
} from 'lucide-react'

interface TaskComment {
  id: string
  progress_id: string
  author_email: string
  author_name: string
  author_role: string
  message: string
  created_at: string
}

interface TaskWithProgress extends Task {
  progress: CustomerProgress | null
  comments: TaskComment[]
  requires_upload?: boolean
  template_files?: { name: string; url: string }[]
}

interface PhaseGroup {
  phase: number
  phase_name: string
  tasks: TaskWithProgress[]
  completed: number
  verified: number
  total: number
}

interface ReportWithStatus extends Report {
  unlocked: boolean
  unlocking_task?: Task
  tasksToUnlock: number
  tasksCompleted: number
}

export default function CustomerDashboard() {
  const router = useRouter()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [phases, setPhases] = useState<PhaseGroup[]>([])
  const [reports, setReports] = useState<ReportWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedPhases, setExpandedPhases] = useState<number[]>([0, 1])
  const [updatingTask, setUpdatingTask] = useState<string | null>(null)
  const [commentingTask, setCommentingTask] = useState<string | null>(null)
  const [newComment, setNewComment] = useState('')
  const [uploadingTask, setUploadingTask] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.push('/')
        return
      }

      // Get customer record
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('email', session.user.email)
        .single()

      if (customerError || !customerData) {
        setError(`No customer record found for: ${session.user.email}`)
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

      // Get comments
      const { data: commentsData } = await supabase
        .from('task_comments')
        .select('*')
        .eq('customer_id', customerData.id)
        .order('created_at', { ascending: true })

      // Get reports
      const { data: reportsData } = await supabase
        .from('reports')
        .select('*')
        .order('sort_order')

      // Combine tasks with progress and comments
      const tasksWithProgress: TaskWithProgress[] = (tasksData || []).map(task => ({
        ...task,
        progress: progressData?.find(p => p.task_id === task.id) || null,
        comments: commentsData?.filter(c => {
          const progress = progressData?.find(p => p.task_id === task.id)
          return progress && c.progress_id === progress.id
        }) || []
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
            verified: 0,
            total: 0
          }
          phaseGroups.push(group)
        }
        group.tasks.push(task)
        group.total++
        if (task.progress?.completed) group.completed++
        if (task.progress?.verified) group.verified++
      })

      setPhases(phaseGroups.sort((a, b) => a.phase - b.phase))

      // Calculate report unlock status
      const reportsWithStatus: ReportWithStatus[] = (reportsData || []).map(report => {
        const unlockingTask = tasksWithProgress.find(t => t.unlocks_report === report.name)
        const tasksInPhase = tasksWithProgress.filter(t => t.phase <= report.phase)
        const completedInPhase = tasksInPhase.filter(t => t.progress?.completed).length
        
        // Report unlocks when the task that unlocks it is completed
        const unlocked = unlockingTask ? unlockingTask.progress?.completed === true : false

        return {
          ...report,
          unlocked,
          unlocking_task: unlockingTask,
          tasksToUnlock: unlockingTask ? 1 : 0,
          tasksCompleted: unlocked ? 1 : 0
        }
      })

      setReports(reportsWithStatus)
      setLoading(false)
    } catch (err) {
      setError(`Unexpected error: ${err}`)
      setLoading(false)
    }
  }

  const toggleTask = async (taskId: string, currentCompleted: boolean) => {
    if (!customer) return
    setUpdatingTask(taskId)

    const newCompleted = !currentCompleted
    
    const { error } = await supabase
      .from('customer_progress')
      .update({
        completed: newCompleted,
        completed_at: newCompleted ? new Date().toISOString() : null,
        // Reset verification if unchecking
        verified: newCompleted ? false : false,
        verified_at: null,
        verified_by: null
      })
      .eq('customer_id', customer.id)
      .eq('task_id', taskId)

    if (!error) {
      await loadData()
    }
    setUpdatingTask(null)
  }

  const addComment = async (taskId: string) => {
    if (!customer || !newComment.trim()) return
    
    const progress = phases.flatMap(p => p.tasks).find(t => t.id === taskId)?.progress
    if (!progress) return

    const { error } = await supabase
      .from('task_comments')
      .insert({
        progress_id: progress.id,
        customer_id: customer.id,
        author_email: customer.email,
        author_name: customer.name,
        author_role: 'customer',
        message: newComment.trim()
      })

    if (!error) {
      setNewComment('')
      setCommentingTask(null)
      await loadData()
    }
  }

  const handleFileUpload = async (taskId: string, files: FileList) => {
    if (!customer || files.length === 0) return
    setUploadingTask(taskId)

    const progress = phases.flatMap(p => p.tasks).find(t => t.id === taskId)?.progress
    if (!progress) return

    const uploadedFiles = []

    for (const file of Array.from(files)) {
      const fileName = `${customer.id}/${taskId}/${Date.now()}-${file.name}`
      
      const { data, error } = await supabase.storage
        .from('customer-files')
        .upload(fileName, file)

      if (!error && data) {
        const { data: urlData } = supabase.storage
          .from('customer-files')
          .getPublicUrl(fileName)
        
        uploadedFiles.push({
          name: file.name,
          url: urlData.publicUrl,
          uploaded_at: new Date().toISOString()
        })
      }
    }

    // Update progress with new files
    const existingFiles = progress.files || []
    const { error: updateError } = await supabase
      .from('customer_progress')
      .update({
        files: [...existingFiles, ...uploadedFiles]
      })
      .eq('id', progress.id)

    if (!updateError) {
      await loadData()
    }
    setUploadingTask(null)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const togglePhase = (phase: number) => {
    setExpandedPhases(prev =>
      prev.includes(phase) ? prev.filter(p => p !== phase) : [...prev, phase]
    )
  }

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

  const totalCompleted = phases.reduce((acc, p) => acc + p.completed, 0)
  const totalVerified = phases.reduce((acc, p) => acc + p.verified, 0)
  const totalTasks = phases.reduce((acc, p) => acc + p.total, 0)
  const overallProgress = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0

  // Find next report to unlock
  const nextReport = reports.find(r => !r.unlocked)
  const unlockedCount = reports.filter(r => r.unlocked).length

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
          <button onClick={() => router.push('/')} className="px-4 py-2 bg-blue-500 text-white rounded-lg">
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
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">craftable</h1>
              <p className="text-sm text-gray-500">Onboarding Portal</p>
            </div>
            
            {/* Quick Links */}
            <div className="flex items-center gap-3">
              <a
                href="https://app.craftable.com/signin"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-all"
              >
                <LayoutDashboard size={16} />
                Craftable App
              </a>
              <a
                href="https://help.craftable.com/learning"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-all"
              >
                <BookOpen size={16} />
                Learning Center
              </a>
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
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Overall Progress */}
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Your Onboarding Progress</h2>
              <p className="text-sm text-gray-500 mt-1">
                {totalCompleted} tasks completed • {totalVerified} verified by your OM
              </p>
            </div>
            <div className="text-right">
              <span className="text-3xl font-bold text-blue-500">{overallProgress}%</span>
              <p className="text-sm text-gray-500">{unlockedCount} of {reports.length} reports unlocked</p>
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500 rounded-full"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
          
          {/* Next Report Teaser */}
          {nextReport && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg flex items-center gap-3">
              <Lock className="text-blue-500" size={20} />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900">
                  Next unlock: <strong>{nextReport.name}</strong>
                </p>
                <p className="text-xs text-blue-700">
                  Complete "{nextReport.unlocking_task?.task_name}" to unlock
                </p>
              </div>
            </div>
          )}
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
                      {phase.completed}/{phase.total} done • {phase.verified} verified
                    </span>
                    {expandedPhases.includes(phase.phase) ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </button>

                {expandedPhases.includes(phase.phase) && (
                  <div className="divide-y divide-gray-100">
                    {phase.tasks.map((task) => (
                      <div
                        key={task.id}
                        className={`p-4 transition-all ${
                          task.progress?.verified 
                            ? 'bg-green-50' 
                            : task.progress?.completed 
                              ? 'bg-yellow-50' 
                              : 'hover:bg-gray-50'
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
                            ) : task.progress?.verified ? (
                              <CheckCircle2 className="w-5 h-5 text-green-600" />
                            ) : task.progress?.completed ? (
                              <AlertCircle className="w-5 h-5 text-yellow-500" />
                            ) : (
                              <Circle className="w-5 h-5 text-gray-300 hover:text-blue-500 transition-colors" />
                            )}
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className={`font-medium ${
                                task.progress?.verified 
                                  ? 'text-green-700' 
                                  : task.progress?.completed 
                                    ? 'text-yellow-700' 
                                    : 'text-gray-900'
                              }`}>
                                {task.task_name}
                              </h3>
                              {task.is_success_gate && (
                                <span className="px-2 py-0.5 text-xs font-medium bg-green-500 text-white rounded-full">
                                  Success Gate
                                </span>
                              )}
                              {task.progress?.completed && !task.progress?.verified && (
                                <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">
                                  Awaiting OM Verification
                                </span>
                              )}
                              {task.progress?.verified && (
                                <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full flex items-center gap-1">
                                  <Check size={12} /> Verified
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
                                  <Unlock size={12} />
                                  Unlocks: {task.unlocks_report}
                                </span>
                              )}
                            </div>

                            {/* Timestamps */}
                            {task.progress?.completed_at && (
                              <div className="mt-2 text-xs text-gray-400">
                                Completed: {new Date(task.progress.completed_at).toLocaleString()}
                                {task.progress.verified_at && (
                                  <span className="ml-3">
                                    • Verified: {new Date(task.progress.verified_at).toLocaleString()} by {task.progress.verified_by}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* File Upload Section for Phase 0 tasks */}
                            {task.requires_upload && (
                              <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                                <p className="text-xs font-medium text-gray-600 mb-2">📎 File Upload Required</p>
                                
                        {/* Download Templates */}
                        <div className="flex flex-wrap gap-2 mb-2">
                          {task.task_name === 'Complete Preflight Checklist' ? (
                            <>
                              <a href="/templates/key-contacts.xlsx" className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200">
                                <Download size={12} /> Key Contacts (Required)
                              </a>
                              <a href="/templates/vendor-loader.xlsx" className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200">
                                <Download size={12} /> Vendor Loader (Required)
                              </a>
                              <a href="/templates/category-loader.xlsx" className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200">
                                <Download size={12} /> Category Loader (Required)
                              </a>
                              <a href="/templates/item-loader-food.xlsx" className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200">
                                <Download size={12} /> Item Loader - Food (Optional)
                              </a>
                              <a href="/templates/item-loader-bev.xlsx" className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200">
                                <Download size={12} /> Item Loader - Bev (Optional)
                              </a>
                            </>
                          ) : task.task_name === 'Gather 60-90 Days of Invoices' ? (
                            <p className="text-xs text-gray-500 italic">Upload your scanned invoices directly</p>
                          ) : null}
                        </div>

                                {/* Upload Button */}
                                <label className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all">
                                  <Upload size={16} className="text-gray-500" />
                                  <span className="text-gray-600">
                                    {uploadingTask === task.id ? 'Uploading...' : 'Upload completed files'}
                                  </span>
                                  <input
                                    type="file"
                                    multiple
                                    className="hidden"
                                    onChange={(e) => e.target.files && handleFileUpload(task.id, e.target.files)}
                                    disabled={uploadingTask === task.id}
                                  />
                                </label>

                                {/* Uploaded Files */}
                                {task.progress?.files && task.progress.files.length > 0 && (
                                  <div className="mt-2 space-y-1">
                                    {(task.progress.files as any[]).map((file, idx) => (
                                      <div key={idx} className="flex items-center gap-2 text-xs text-gray-600">
                                        <FileText size={12} />
                                        <span>{file.name}</span>
                                        <CheckCircle2 size={12} className="text-green-500" />
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Comments Section */}
                            <div className="mt-3">
                              {task.comments.length > 0 && (
                                <div className="space-y-2 mb-2">
                                  {task.comments.map((comment) => (
                                    <div
                                      key={comment.id}
                                      className={`p-2 rounded-lg text-sm ${
                                        comment.author_role === 'customer'
                                          ? 'bg-gray-100 ml-0 mr-8'
                                          : 'bg-blue-50 ml-8 mr-0'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="font-medium text-xs">
                                          {comment.author_name || comment.author_email}
                                        </span>
                                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                                          comment.author_role === 'om' 
                                            ? 'bg-blue-200 text-blue-800' 
                                            : comment.author_role === 'admin'
                                              ? 'bg-purple-200 text-purple-800'
                                              : 'bg-gray-200 text-gray-600'
                                        }`}>
                                          {comment.author_role}
                                        </span>
                                        <span className="text-xs text-gray-400">
                                          {new Date(comment.created_at).toLocaleString()}
                                        </span>
                                      </div>
                                      <p className="text-gray-700">{comment.message}</p>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {commentingTask === task.id ? (
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    placeholder="Add a note or question..."
                                    className="flex-1 text-sm p-2 border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500"
                                    onKeyDown={(e) => e.key === 'Enter' && addComment(task.id)}
                                  />
                                  <button
                                    onClick={() => addComment(task.id)}
                                    className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                                  >
                                    <Send size={16} />
                                  </button>
                                  <button
                                    onClick={() => { setCommentingTask(null); setNewComment(''); }}
                                    className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setCommentingTask(task.id)}
                                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-500"
                                >
                                  <MessageSquare size={12} />
                                  {task.comments.length > 0 ? `${task.comments.length} notes` : 'Add note'}
                                </button>
                              )}
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
            {/* Reports Unlock Progress */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <FileText size={18} />
                Report Unlocks
              </h3>
              <div className="space-y-3">
                {reports.map((report) => (
                  <div
                    key={report.id}
                    className={`p-3 rounded-lg border transition-all ${
                      report.unlocked
                        ? 'bg-green-50 border-green-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {report.unlocked ? (
                        <Unlock className="w-4 h-4 text-green-600 flex-shrink-0" />
                      ) : (
                        <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      )}
                      <span className={`text-sm font-medium ${
                        report.unlocked ? 'text-green-700' : 'text-gray-500'
                      }`}>
                        {report.name}
                      </span>
                    </div>
                    
                    {report.unlocked && report.report_url && (
                      <a
                        href={report.report_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                      >
                        <ExternalLink size={12} />
                        Learn about this report
                      </a>
                    )}
                    
                    {!report.unlocked && report.unlocking_task && (
                      <p className="mt-1 text-xs text-gray-400">
                        Complete: {report.unlocking_task.task_name}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Phase Progress Summary */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Phase Progress</h3>
              <div className="space-y-3">
                {phases.map((phase) => (
                  <div key={phase.phase} className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${getPhaseColor(phase.phase)}`} />
                    <span className="flex-1 text-sm text-gray-600">Phase {phase.phase}</span>
                    <span className="text-sm font-medium">{phase.completed}/{phase.total}</span>
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
