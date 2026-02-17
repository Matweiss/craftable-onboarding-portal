'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, Customer, Task, CustomerProgress } from '@/lib/supabase'
import { 
  Users, CheckCircle2, Clock, AlertTriangle, LogOut, Plus, Search,
  ChevronDown, ChevronUp, X, Check, MessageSquare, Send, Download, 
  UserPlus, Settings, Eye, Shield, ListTodo, Pencil, Trash2, Save,
  SkipForward, User, Copy, ArrowUp, ArrowDown, EyeOff, GripVertical
} from 'lucide-react'

interface TaskComment {
  id: string
  progress_id: string
  customer_id: string
  author_email: string
  author_name: string
  author_role: string
  message: string
  created_at: string
}

interface ProgressWithTask extends CustomerProgress {
  task: Task
  comments: TaskComment[]
}

interface CustomerWithProgress extends Customer {
  progress: { completed: number; verified: number; total: number; percentage: number; lastActivity: string | null }
  pendingVerification: number
  unreadComments: number
  customTaskCount: number
  skippedTaskCount: number
  hidden_phases?: number[]
}

interface OMUser {
  id: string; email: string; name: string; role: string; created_at: string; customer_count?: number
}

interface PendingItem {
  progress: CustomerProgress; task: Task; customer: Customer; comments: TaskComment[]
}

const PHASE_OPTIONS = [
  { value: 0, label: 'Phase 0: Before We Start', color: 'bg-gray-500' },
  { value: 1, label: 'Phase 1: Immediate — Days 1-6', color: 'bg-blue-500' },
  { value: 2, label: 'Phase 2: Crawl — Weeks 1-2', color: 'bg-orange-500' },
  { value: 3, label: 'Phase 3: Walk — Weeks 3-4', color: 'bg-green-500' },
  { value: 4, label: 'Phase 4: Run — Month 2+', color: 'bg-indigo-900' },
]

const DEFAULT_TASK_FORM = {
  phase: 0, phase_name: 'Phase 0: Before We Start', task_name: '', description: '',
  owner: 'Customer', est_time: '', is_success_gate: false, unlocks_report: '', requires_upload: false
}

export default function AdminDashboard() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<{ email: string; name: string; role: string } | null>(null)
  const [customers, setCustomers] = useState<CustomerWithProgress[]>([])
  const [omUsers, setOmUsers] = useState<OMUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [allProgress, setAllProgress] = useState<CustomerProgress[]>([])
  const [allComments, setAllComments] = useState<TaskComment[]>([])
  const [allCustomers, setAllCustomers] = useState<Customer[]>([])
  
  const [searchQuery, setSearchQuery] = useState('')
  const [filterOM, setFilterOM] = useState<string>('all')
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [showAddOM, setShowAddOM] = useState(false)
  const [showOMManager, setShowOMManager] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithProgress | null>(null)
  const [customerTasks, setCustomerTasks] = useState<ProgressWithTask[]>([])
  const [expandedPhases, setExpandedPhases] = useState<number[]>([0, 1, 2, 3, 4])
  
  const [showVerificationPanel, setShowVerificationPanel] = useState(false)
  const [showCommentsPanel, setShowCommentsPanel] = useState(false)
  const [showActivePanel, setShowActivePanel] = useState(false)
  const [showCompletedPanel, setShowCompletedPanel] = useState(false)
  
  const [taskEditor, setTaskEditor] = useState<{
    isOpen: boolean
    mode: 'global' | 'customer'
    customer: CustomerWithProgress | null
    isFormOpen: boolean
    editingTask: Task | null
  }>({ isOpen: false, mode: 'global', customer: null, isFormOpen: false, editingTask: null })
  
  const [taskForm, setTaskForm] = useState(DEFAULT_TASK_FORM)
  const [savingTask, setSavingTask] = useState(false)
  const [movingTask, setMovingTask] = useState<string | null>(null)
  
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', company: '', assigned_om: '' })
  const [newOM, setNewOM] = useState({ email: '', name: '' })
  const [newComment, setNewComment] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)

  useEffect(() => { checkAdminAndLoadData() }, [])

  const checkAdminAndLoadData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/'); return }

      const { data: adminData, error: adminError } = await supabase
        .from('admin_users').select('*').eq('email', session.user.email).single()

      if (adminError || !adminData) { setError('Not authorized as admin'); return }

      setCurrentUser({ email: adminData.email, name: adminData.name || adminData.email, role: adminData.role })
      await loadData()
    } catch (err) { setError(`Error: ${err}`) }
  }

  const loadData = async () => {
    const { data: adminsData } = await supabase.from('admin_users').select('*').order('created_at')
    const { data: customersData } = await supabase.from('customers').select('*').order('created_at', { ascending: false })
    const { data: tasksData } = await supabase.from('tasks').select('*').order('phase').order('sort_order')
    const { data: progressData } = await supabase.from('customer_progress').select('*')
    const { data: commentsData } = await supabase.from('task_comments').select('*').order('created_at', { ascending: false })

    setAllTasks(tasksData || [])
    setAllProgress(progressData || [])
    setAllComments(commentsData || [])
    setAllCustomers(customersData || [])

    const omWithCounts = (adminsData || []).map(admin => ({
      ...admin, customer_count: (customersData || []).filter(c => c.assigned_om === admin.name).length
    }))
    setOmUsers(omWithCounts)

    const customersWithProgress: CustomerWithProgress[] = (customersData || []).map(customer => {
      const customerTaskIds = (tasksData || [])
        .filter(t => !t.customer_id || t.customer_id === customer.id)
        .map(t => t.id)
      
      const customerProgress = (progressData || []).filter(p => 
        p.customer_id === customer.id && customerTaskIds.includes(p.task_id) && !p.is_skipped
      )
      const completed = customerProgress.filter(p => p.completed).length
      const verified = customerProgress.filter(p => p.verified).length
      const total = customerProgress.length
      const pendingVerification = completed - verified
      
      const customerComments = (commentsData || []).filter(c => c.customer_id === customer.id)
      const customerReplies = customerComments.filter(c => c.author_role !== 'customer')
      const unreadComments = customerComments.filter(c => 
        c.author_role === 'customer' && !customerReplies.some(r => new Date(r.created_at) > new Date(c.created_at))
      ).length

      const lastCompleted = customerProgress.filter(p => p.completed && p.completed_at)
        .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())[0]

      const customTaskCount = (tasksData || []).filter(t => t.customer_id === customer.id).length
      const skippedTaskCount = (progressData || []).filter(p => p.customer_id === customer.id && p.is_skipped).length

      return {
        ...customer,
        progress: { completed, verified, total, percentage: total > 0 ? Math.round((completed / total) * 100) : 0, lastActivity: lastCompleted?.completed_at || null },
        pendingVerification, unreadComments, customTaskCount, skippedTaskCount,
        hidden_phases: customer.hidden_phases || []
      }
    })

    setCustomers(customersWithProgress)
    setLoading(false)
  }

  const getPendingVerifications = (): PendingItem[] => {
    return allProgress.filter(p => p.completed && !p.verified && !p.is_skipped).map(progress => {
      const task = allTasks.find(t => t.id === progress.task_id)
      const customer = allCustomers.find(c => c.id === progress.customer_id)
      const comments = allComments.filter(c => c.progress_id === progress.id)
      return task && customer ? { progress, task, customer, comments } : null
    }).filter((x): x is PendingItem => x !== null)
      .sort((a, b) => new Date(b.progress.completed_at || 0).getTime() - new Date(a.progress.completed_at || 0).getTime())
  }

  const getUnreadComments = () => {
    const unread: { comment: TaskComment; task: Task; customer: Customer; progress: CustomerProgress }[] = []
    const commentsByProgress: Record<string, TaskComment[]> = {}
    allComments.forEach(c => {
      if (!commentsByProgress[c.progress_id]) commentsByProgress[c.progress_id] = []
      commentsByProgress[c.progress_id].push(c)
    })
    Object.entries(commentsByProgress).forEach(([progressId, comments]) => {
      const sorted = comments.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      sorted.forEach((comment, idx) => {
        if (comment.author_role === 'customer' && !sorted.slice(idx + 1).some(c => c.author_role !== 'customer')) {
          const progress = allProgress.find(p => p.id === progressId)
          const task = allTasks.find(t => progress && t.id === progress.task_id)
          const customer = allCustomers.find(c => c.id === comment.customer_id)
          if (progress && task && customer) unread.push({ comment, task, customer, progress })
        }
      })
    })
    return unread.sort((a, b) => new Date(b.comment.created_at).getTime() - new Date(a.comment.created_at).getTime())
  }

  const loadCustomerDetails = async (customer: CustomerWithProgress) => {
    setSelectedCustomer(customer)
    
    const { data: tasksData } = await supabase
      .from('tasks').select('*')
      .or(`customer_id.is.null,customer_id.eq.${customer.id}`)
      .order('phase').order('sort_order')

    const { data: progressData } = await supabase
      .from('customer_progress').select('*').eq('customer_id', customer.id)

    const { data: commentsData } = await supabase
      .from('task_comments').select('*').eq('customer_id', customer.id)
      .order('created_at', { ascending: true })

    const tasksWithProgress: ProgressWithTask[] = (tasksData || []).map(task => {
      const progress = progressData?.find(p => p.task_id === task.id)
      const comments = commentsData?.filter(c => progress && c.progress_id === progress.id) || []
      return { ...progress!, task, comments }
    }).filter(t => t.id)

    setCustomerTasks(tasksWithProgress)
  }

  // Task Editor Functions
  const openGlobalTaskEditor = () => {
    setTaskEditor({ isOpen: true, mode: 'global', customer: null, isFormOpen: false, editingTask: null })
    setTaskForm(DEFAULT_TASK_FORM)
  }

  const openCustomerTaskEditor = (customer: CustomerWithProgress) => {
    setTaskEditor({ isOpen: true, mode: 'customer', customer, isFormOpen: false, editingTask: null })
    setTaskForm(DEFAULT_TASK_FORM)
  }

  const closeTaskEditor = () => {
    setTaskEditor({ isOpen: false, mode: 'global', customer: null, isFormOpen: false, editingTask: null })
    setTaskForm(DEFAULT_TASK_FORM)
  }

  const openAddForm = () => {
    setTaskForm(DEFAULT_TASK_FORM)
    setTaskEditor(prev => ({ ...prev, isFormOpen: true, editingTask: null }))
  }

  const openEditForm = (task: Task) => {
    setTaskForm({
      phase: task.phase, phase_name: task.phase_name, task_name: task.task_name,
      description: task.description || '', owner: task.owner, est_time: task.est_time || '',
      is_success_gate: task.is_success_gate, unlocks_report: task.unlocks_report || '',
      requires_upload: task.requires_upload || false
    })
    setTaskEditor(prev => ({ ...prev, isFormOpen: true, editingTask: task }))
  }

  const closeForm = () => {
    setTaskEditor(prev => ({ ...prev, isFormOpen: false, editingTask: null }))
    setTaskForm(DEFAULT_TASK_FORM)
  }

  const handlePhaseChange = (phase: number) => {
    const phaseOption = PHASE_OPTIONS.find(p => p.value === phase)
    setTaskForm({ ...taskForm, phase, phase_name: phaseOption?.label || '' })
  }

  const saveTask = async () => {
    if (!taskForm.task_name.trim()) return
    setSavingTask(true)
    
    try {
      const customerId = taskEditor.mode === 'customer' ? taskEditor.customer?.id : null

      if (taskEditor.editingTask) {
        // Update existing task
        const { error } = await supabase.from('tasks').update({
          phase: taskForm.phase, 
          phase_name: taskForm.phase_name, 
          task_name: taskForm.task_name,
          description: taskForm.description, 
          owner: taskForm.owner, 
          est_time: taskForm.est_time,
          is_success_gate: taskForm.is_success_gate, 
          unlocks_report: taskForm.unlocks_report || null,
          requires_upload: taskForm.requires_upload
        }).eq('id', taskEditor.editingTask.id)
        
        if (error) {
          console.error('Error updating task:', error)
          alert('Failed to update task: ' + error.message)
          setSavingTask(false)
          return
        }
      } else {
        // Create new task
        const tasksInPhase = allTasks.filter(t => t.phase === taskForm.phase)
        const maxOrder = tasksInPhase.length > 0 ? Math.max(...tasksInPhase.map(t => t.sort_order)) : 0

        const { data: newTask, error: taskError } = await supabase.from('tasks').insert({
          phase: taskForm.phase, 
          phase_name: taskForm.phase_name, 
          task_name: taskForm.task_name,
          description: taskForm.description || '', 
          owner: taskForm.owner, 
          est_time: taskForm.est_time || '',
          sort_order: maxOrder + 1, 
          is_success_gate: taskForm.is_success_gate,
          unlocks_report: taskForm.unlocks_report || null, 
          requires_upload: taskForm.requires_upload,
          customer_id: customerId || null
        }).select().single()

        if (taskError) {
          console.error('Error creating task:', taskError)
          alert('Failed to create task: ' + taskError.message)
          setSavingTask(false)
          return
        }
        
        if (newTask) {
          // Create progress records
          if (customerId) {
            // Custom task - only for this customer
            const { error: progressError } = await supabase.from('customer_progress').insert({ 
              customer_id: customerId, 
              task_id: newTask.id 
            })
            if (progressError) {
              console.error('Error creating progress:', progressError)
            }
          } else {
            // Global task - for all customers
            if (allCustomers.length > 0) {
              const progressRecords = allCustomers.map(c => ({ customer_id: c.id, task_id: newTask.id }))
              const { error: progressError } = await supabase.from('customer_progress').insert(progressRecords)
              if (progressError) {
                console.error('Error creating progress:', progressError)
              }
            }
          }
        }
      }

      closeForm()
      await loadData()
    } catch (err) {
      console.error('Save error:', err)
      alert('Failed to save task: ' + String(err))
    }
    
    setSavingTask(false)
  }

  const deleteTask = async (taskId: string) => {
    if (!confirm('Delete this task? All progress will be removed.')) return
    await supabase.from('customer_progress').delete().eq('task_id', taskId)
    await supabase.from('tasks').delete().eq('id', taskId)
    await loadData()
  }

  const toggleSkipTask = async (progressId: string, currentSkipped: boolean) => {
    await supabase.from('customer_progress').update({ is_skipped: !currentSkipped }).eq('id', progressId)
    await loadData()
  }

  const duplicateTaskForCustomer = async (task: Task, customerId: string) => {
    const tasksInPhase = allTasks.filter(t => t.phase === task.phase)
    const maxOrder = tasksInPhase.length > 0 ? Math.max(...tasksInPhase.map(t => t.sort_order)) : 0
    
    const { data: newTask, error } = await supabase.from('tasks').insert({
      phase: task.phase, phase_name: task.phase_name, task_name: `${task.task_name} (Custom)`,
      description: task.description || '', owner: task.owner, est_time: task.est_time || '',
      sort_order: maxOrder + 1, is_success_gate: task.is_success_gate,
      unlocks_report: task.unlocks_report, requires_upload: task.requires_upload,
      customer_id: customerId
    }).select().single()

    if (error) {
      alert('Failed to duplicate task: ' + error.message)
      return
    }

    if (newTask) {
      await supabase.from('customer_progress').insert({ customer_id: customerId, task_id: newTask.id })
    }
    await loadData()
  }

  // Reorder tasks - simplified and fixed
  const moveTaskInDirection = async (task: Task, direction: 'up' | 'down') => {
    setMovingTask(task.id)
    
    try {
      // Get tasks in same phase, sorted by sort_order
      const tasksInPhase = allTasks
        .filter(t => t.phase === task.phase && (taskEditor.mode === 'global' ? !t.customer_id : true))
        .sort((a, b) => a.sort_order - b.sort_order)
      
      const currentIndex = tasksInPhase.findIndex(t => t.id === task.id)
      
      if (direction === 'up' && currentIndex > 0) {
        const prevTask = tasksInPhase[currentIndex - 1]
        // Swap sort_order values
        const tempOrder = task.sort_order
        await supabase.from('tasks').update({ sort_order: prevTask.sort_order }).eq('id', task.id)
        await supabase.from('tasks').update({ sort_order: tempOrder }).eq('id', prevTask.id)
      } else if (direction === 'down' && currentIndex < tasksInPhase.length - 1) {
        const nextTask = tasksInPhase[currentIndex + 1]
        // Swap sort_order values
        const tempOrder = task.sort_order
        await supabase.from('tasks').update({ sort_order: nextTask.sort_order }).eq('id', task.id)
        await supabase.from('tasks').update({ sort_order: tempOrder }).eq('id', nextTask.id)
      }
      
      await loadData()
    } catch (err) {
      console.error('Move error:', err)
      alert('Failed to move task')
    }
    
    setMovingTask(null)
  }

  const moveTaskToPhase = async (task: Task, newPhase: number) => {
    if (task.phase === newPhase) return
    
    setMovingTask(task.id)
    
    try {
      const phaseOption = PHASE_OPTIONS.find(p => p.value === newPhase)
      const tasksInNewPhase = allTasks.filter(t => t.phase === newPhase)
      const maxOrder = tasksInNewPhase.length > 0 ? Math.max(...tasksInNewPhase.map(t => t.sort_order)) : 0
      
      const { error } = await supabase.from('tasks').update({ 
        phase: newPhase, 
        phase_name: phaseOption?.label || `Phase ${newPhase}`,
        sort_order: maxOrder + 1
      }).eq('id', task.id)
      
      if (error) {
        console.error('Move to phase error:', error)
        alert('Failed to move task: ' + error.message)
      } else {
        await loadData()
      }
    } catch (err) {
      console.error('Move error:', err)
      alert('Failed to move task')
    }
    
    setMovingTask(null)
  }

  // Toggle phase visibility for customer
  const togglePhaseVisibility = async (customerId: string, phase: number, currentHidden: boolean) => {
    const customer = customers.find(c => c.id === customerId)
    if (!customer) return
    
    const currentHiddenPhases = customer.hidden_phases || []
    const newHiddenPhases = currentHidden 
      ? currentHiddenPhases.filter(p => p !== phase)
      : [...currentHiddenPhases, phase]
    
    await supabase.from('customers').update({ hidden_phases: newHiddenPhases }).eq('id', customerId)
    await loadData()
    
    // Update taskEditor customer if open
    if (taskEditor.customer?.id === customerId) {
      setTaskEditor(prev => ({
        ...prev,
        customer: { ...prev.customer!, hidden_phases: newHiddenPhases }
      }))
    }
  }

  const verifyTask = async (progressId: string) => {
    if (!currentUser) return
    await supabase.from('customer_progress').update({ verified: true, verified_at: new Date().toISOString(), verified_by: currentUser.name }).eq('id', progressId)
    if (selectedCustomer) await loadCustomerDetails(selectedCustomer)
    await loadData()
  }

  const verifyAllForCustomer = async (customerId: string) => {
    if (!currentUser) return
    await supabase.from('customer_progress').update({ verified: true, verified_at: new Date().toISOString(), verified_by: currentUser.name }).eq('customer_id', customerId).eq('completed', true).eq('verified', false)
    await loadData()
  }

  const unverifyTask = async (progressId: string) => {
    await supabase.from('customer_progress').update({ verified: false, verified_at: null, verified_by: null }).eq('id', progressId)
    if (selectedCustomer) await loadCustomerDetails(selectedCustomer)
    await loadData()
  }

  const addCommentToProgress = async (progressId: string, customerId: string) => {
    if (!currentUser || !newComment.trim()) return
    
    // Add comment
    await supabase.from('task_comments').insert({ 
      progress_id: progressId, 
      customer_id: customerId, 
      author_email: currentUser.email, 
      author_name: currentUser.name, 
      author_role: currentUser.role, 
      message: newComment.trim() 
    })
    
    // Mark as has unread reply for customer
    await supabase.from('customer_progress').update({ has_unread_reply: true }).eq('id', progressId)
    
    setNewComment(''); setReplyingTo(null)
    if (selectedCustomer) await loadCustomerDetails(selectedCustomer)
    await loadData()
  }

  const addCustomer = async (e: React.FormEvent) => {
    e.preventDefault()
    await supabase.from('customers').insert({ name: newCustomer.name, email: newCustomer.email, company: newCustomer.company || newCustomer.name, assigned_om: newCustomer.assigned_om || currentUser?.name || 'Unassigned' })
    setShowAddCustomer(false); setNewCustomer({ name: '', email: '', company: '', assigned_om: '' })
    await loadData()
  }

  const addOM = async (e: React.FormEvent) => {
    e.preventDefault()
    await supabase.from('admin_users').insert({ email: newOM.email.toLowerCase(), name: newOM.name, role: 'om' })
    setShowAddOM(false); setNewOM({ email: '', name: '' })
    await loadData()
  }

  const updateCustomerOM = async (customerId: string, omName: string) => {
    await supabase.from('customers').update({ assigned_om: omName }).eq('id', customerId)
    await loadData()
  }

  const deleteOM = async (omId: string) => {
    if (!confirm('Are you sure?')) return
    await supabase.from('admin_users').delete().eq('id', omId)
    await loadData()
  }

  const handleSignOut = async () => { await supabase.auth.signOut(); router.push('/') }

  const filteredCustomers = customers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.email.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch && (filterOM === 'all' || c.assigned_om === filterOM)
  })

  const stats = {
    total: customers.length,
    active: customers.filter(c => c.progress.percentage > 0 && c.progress.percentage < 100).length,
    completed: customers.filter(c => c.progress.percentage === 100).length,
    pendingVerification: customers.reduce((acc, c) => acc + c.pendingVerification, 0),
    unreadComments: getUnreadComments().length
  }

  const getProgressColor = (pct: number) => pct === 100 ? 'bg-green-500' : pct >= 60 ? 'bg-blue-500' : pct >= 30 ? 'bg-orange-500' : 'bg-gray-300'
  const formatDate = (d: string | null) => { if (!d) return 'No activity'; const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000); return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : diff < 7 ? `${diff} days ago` : new Date(d).toLocaleDateString() }
  const getPhaseColor = (p: number) => ({ 0: 'bg-gray-500', 1: 'bg-blue-500', 2: 'bg-orange-500', 3: 'bg-green-500', 4: 'bg-indigo-900' }[p] || 'bg-gray-500')

  const groupTasksByPhase = (tasks: ProgressWithTask[]) => {
    const groups: Record<number, { name: string; tasks: ProgressWithTask[] }> = {}
    tasks.forEach(t => {
      if (!groups[t.task.phase]) groups[t.task.phase] = { name: t.task.phase_name, tasks: [] }
      groups[t.task.phase].tasks.push(t)
    })
    return Object.entries(groups).sort(([a], [b]) => Number(a) - Number(b))
  }

  const groupAllTasksByPhase = (tasksToGroup: Task[]) => {
    const groups: Record<number, { name: string; tasks: Task[] }> = {}
    tasksToGroup.forEach(t => {
      if (!groups[t.phase]) groups[t.phase] = { name: t.phase_name, tasks: [] }
      groups[t.phase].tasks.push(t)
    })
    return Object.entries(groups).sort(([a], [b]) => Number(a) - Number(b))
  }

  const pendingVerifications = getPendingVerifications()
  const unreadComments = getUnreadComments()

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div></div>
  if (error) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="bg-white p-8 rounded-lg shadow-lg text-center"><p className="text-red-600 mb-4">{error}</p><button onClick={() => router.push('/')} className="px-4 py-2 bg-blue-500 text-white rounded-lg">Back to Login</button></div></div>

  const editorTasks = taskEditor.mode === 'global' 
    ? allTasks.filter(t => !t.customer_id).sort((a, b) => a.phase - b.phase || a.sort_order - b.sort_order)
    : allTasks.filter(t => !t.customer_id || t.customer_id === taskEditor.customer?.id).sort((a, b) => a.phase - b.phase || a.sort_order - b.sort_order)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-indigo-900 text-white">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div><h1 className="text-2xl font-bold">craftable</h1><p className="text-sm text-blue-200">Admin Dashboard</p></div>
          <div className="flex items-center gap-4">
            <button onClick={openGlobalTaskEditor} className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20"><ListTodo size={18} />Edit Global Tasks</button>
            <button onClick={() => setShowOMManager(true)} className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20"><Settings size={18} />Manage OMs</button>
            <div className="text-right text-sm"><p className="font-medium">{currentUser?.name}</p><p className="text-blue-200">{currentUser?.role}</p></div>
            <button onClick={handleSignOut} className="p-2 bg-white/10 rounded-lg hover:bg-white/20"><LogOut size={18} /></button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <button onClick={() => { setSearchQuery(''); setFilterOM('all'); }} className="bg-white rounded-xl shadow-sm border p-6 hover:shadow-md text-left">
            <div className="flex items-center gap-3"><div className="p-3 bg-blue-100 rounded-lg"><Users className="w-6 h-6 text-blue-500" /></div><div><p className="text-2xl font-bold">{stats.total}</p><p className="text-sm text-gray-500">Total Customers</p></div></div>
          </button>
          <button onClick={() => setShowActivePanel(true)} className="bg-white rounded-xl shadow-sm border p-6 hover:shadow-md hover:border-orange-300 text-left">
            <div className="flex items-center gap-3"><div className="p-3 bg-orange-100 rounded-lg"><Clock className="w-6 h-6 text-orange-500" /></div><div><p className="text-2xl font-bold">{stats.active}</p><p className="text-sm text-gray-500">In Progress</p></div></div>
          </button>
          <button onClick={() => setShowCompletedPanel(true)} className="bg-white rounded-xl shadow-sm border p-6 hover:shadow-md hover:border-green-300 text-left">
            <div className="flex items-center gap-3"><div className="p-3 bg-green-100 rounded-lg"><CheckCircle2 className="w-6 h-6 text-green-500" /></div><div><p className="text-2xl font-bold">{stats.completed}</p><p className="text-sm text-gray-500">Completed</p></div></div>
          </button>
          <button onClick={() => setShowVerificationPanel(true)} className={`bg-white rounded-xl shadow-sm border p-6 hover:shadow-md text-left ${stats.pendingVerification > 0 ? 'border-yellow-300' : ''}`}>
            <div className="flex items-center gap-3"><div className="p-3 bg-yellow-100 rounded-lg"><AlertTriangle className="w-6 h-6 text-yellow-500" /></div><div><p className="text-2xl font-bold">{stats.pendingVerification}</p><p className="text-sm text-gray-500">Needs Verification</p></div></div>
          </button>
          <button onClick={() => setShowCommentsPanel(true)} className={`bg-white rounded-xl shadow-sm border p-6 hover:shadow-md text-left ${stats.unreadComments > 0 ? 'border-purple-300' : ''}`}>
            <div className="flex items-center gap-3"><div className="p-3 bg-purple-100 rounded-lg"><MessageSquare className="w-6 h-6 text-purple-500" /></div><div><p className="text-2xl font-bold">{stats.unreadComments}</p><p className="text-sm text-gray-500">New Comments</p></div></div>
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input type="text" placeholder="Search customers..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-3 border rounded-lg" />
          </div>
          <select value={filterOM} onChange={(e) => setFilterOM(e.target.value)} className="px-4 py-3 border rounded-lg">
            <option value="all">All OMs</option>
            {omUsers.map(om => <option key={om.id} value={om.name}>{om.name} ({om.customer_count})</option>)}
          </select>
          <button onClick={() => setShowAddCustomer(true)} className="flex items-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"><Plus size={20} />Add Customer</button>
        </div>

        {/* Customer List */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Customer</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Progress</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Custom</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Last Activity</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Assigned OM</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredCustomers.map((customer) => (
                <tr key={customer.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4"><p className="font-medium">{customer.name}</p><p className="text-sm text-gray-500">{customer.email}</p></td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-24 bg-gray-200 rounded-full h-2"><div className={`h-full rounded-full ${getProgressColor(customer.progress.percentage)}`} style={{ width: `${customer.progress.percentage}%` }} /></div>
                      <span className="text-sm font-medium">{customer.progress.percentage}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      {customer.customTaskCount > 0 && <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full">{customer.customTaskCount} custom</span>}
                      {customer.skippedTaskCount > 0 && <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">{customer.skippedTaskCount} skipped</span>}
                      {(customer.hidden_phases?.length || 0) > 0 && <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full">{customer.hidden_phases?.length} hidden</span>}
                      {customer.customTaskCount === 0 && customer.skippedTaskCount === 0 && (customer.hidden_phases?.length || 0) === 0 && <span className="text-xs text-gray-400">Default</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4"><span className="text-sm text-gray-500">{formatDate(customer.progress.lastActivity)}</span></td>
                  <td className="px-6 py-4">
                    <select value={customer.assigned_om} onChange={(e) => updateCustomerOM(customer.id, e.target.value)} className="text-sm border rounded px-2 py-1">
                      {omUsers.map(om => <option key={om.id} value={om.name}>{om.name}</option>)}
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      {customer.unreadComments > 0 && <span className="w-5 h-5 flex items-center justify-center text-xs bg-purple-500 text-white rounded-full">{customer.unreadComments}</span>}
                      <button onClick={() => openCustomerTaskEditor(customer)} className="p-2 text-gray-400 hover:text-purple-500 hover:bg-purple-50 rounded-lg" title="Customize Tasks"><ListTodo size={18} /></button>
                      <button onClick={() => loadCustomerDetails(customer)} className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg" title="View Details"><Eye size={18} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* Task Editor Panel */}
      {taskEditor.isOpen && (
        <div className="fixed inset-0 bg-black/50 z-50" onClick={closeTaskEditor}>
          <div className="absolute right-0 top-0 h-full w-full max-w-4xl bg-white shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b px-6 py-4 z-10">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold">
                      {taskEditor.mode === 'global' ? 'Global Task Templates' : `Tasks for ${taskEditor.customer?.name}`}
                    </h2>
                    {taskEditor.mode === 'customer' && (
                      <span className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded-full flex items-center gap-1">
                        <User size={12} /> Customer-Specific
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    {taskEditor.mode === 'global' 
                      ? 'These tasks apply to all customers • Use arrows to reorder'
                      : 'Add custom tasks, skip tasks, or hide phases for this customer'
                    }
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={openAddForm} className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                    <Plus size={18} /> Add {taskEditor.mode === 'customer' ? 'Custom ' : ''}Task
                  </button>
                  <button onClick={closeTaskEditor} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
                </div>
              </div>
            </div>

            <div className="p-6">
              {/* Task Form */}
              {taskEditor.isFormOpen && (
                <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h3 className="font-semibold mb-4">{taskEditor.editingTask ? 'Edit Task' : 'New Task'}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phase</label>
                      <select value={taskForm.phase} onChange={(e) => handlePhaseChange(Number(e.target.value))} className="w-full px-3 py-2 border rounded-lg bg-white">
                        {PHASE_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Owner</label>
                      <select value={taskForm.owner} onChange={(e) => setTaskForm({ ...taskForm, owner: e.target.value })} className="w-full px-3 py-2 border rounded-lg bg-white">
                        <option value="Customer">Customer</option><option value="OM">OM</option><option value="Both">Both</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Task Name *</label>
                      <input type="text" value={taskForm.task_name} onChange={(e) => setTaskForm({ ...taskForm, task_name: e.target.value })} className="w-full px-3 py-2 border rounded-lg" placeholder="e.g., Complete Invoice Setup" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                      <textarea value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} className="w-full px-3 py-2 border rounded-lg" rows={2} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Time</label>
                      <input type="text" value={taskForm.est_time} onChange={(e) => setTaskForm({ ...taskForm, est_time: e.target.value })} className="w-full px-3 py-2 border rounded-lg" placeholder="e.g., 30-45 min" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Unlocks Reports <span className="font-normal text-gray-400">(comma-separated)</span></label>
                      <input type="text" value={taskForm.unlocks_report} onChange={(e) => setTaskForm({ ...taskForm, unlocks_report: e.target.value })} className="w-full px-3 py-2 border rounded-lg" placeholder="e.g., Sales by Hour, Labor Report" />
                    </div>
                    <div className="col-span-2 flex items-center gap-6">
                      <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={taskForm.is_success_gate} onChange={(e) => setTaskForm({ ...taskForm, is_success_gate: e.target.checked })} className="w-4 h-4 rounded" /><span className="text-sm">Success Gate</span></label>
                      <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={taskForm.requires_upload} onChange={(e) => setTaskForm({ ...taskForm, requires_upload: e.target.checked })} className="w-4 h-4 rounded" /><span className="text-sm">Requires File Upload</span></label>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <button type="button" onClick={closeForm} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                    <button type="button" onClick={saveTask} disabled={!taskForm.task_name.trim() || savingTask} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2">
                      <Save size={16} />{savingTask ? 'Saving...' : 'Save Task'}
                    </button>
                  </div>
                </div>
              )}

              {/* Task List */}
              {groupAllTasksByPhase(editorTasks).map(([phase, group]) => {
                const phaseNum = Number(phase)
                const isPhaseHidden = taskEditor.mode === 'customer' && taskEditor.customer?.hidden_phases?.includes(phaseNum)
                const tasksInPhase = group.tasks.sort((a, b) => a.sort_order - b.sort_order)
                
                return (
                  <div key={phase} className={`mb-6 ${isPhaseHidden ? 'opacity-60' : ''}`}>
                    <div className={`px-4 py-2 rounded-t-lg text-white flex items-center justify-between ${getPhaseColor(phaseNum)}`}>
                      <div>
                        <span className="font-semibold">{group.name}</span>
                        <span className="ml-2 text-sm opacity-75">({group.tasks.length} tasks)</span>
                        {isPhaseHidden && <span className="ml-2 text-xs bg-white/20 px-2 py-0.5 rounded">Hidden from customer</span>}
                      </div>
                      {taskEditor.mode === 'customer' && taskEditor.customer && (
                        <button 
                          type="button"
                          onClick={() => togglePhaseVisibility(taskEditor.customer!.id, phaseNum, isPhaseHidden || false)}
                          className={`p-1.5 rounded ${isPhaseHidden ? 'bg-white/30 hover:bg-white/40' : 'hover:bg-white/20'}`}
                          title={isPhaseHidden ? 'Show phase to customer' : 'Hide phase from customer'}
                        >
                          <EyeOff size={16} />
                        </button>
                      )}
                    </div>
                    <div className="border border-t-0 rounded-b-lg divide-y">
                      {tasksInPhase.map((task, idx) => {
                        const isCustomTask = !!task.customer_id
                        const progress = taskEditor.mode === 'customer' && taskEditor.customer 
                          ? allProgress.find(p => p.task_id === task.id && p.customer_id === taskEditor.customer?.id)
                          : null
                        const isSkipped = progress?.is_skipped || false
                        const isFirst = idx === 0
                        const isLast = idx === tasksInPhase.length - 1
                        const isMoving = movingTask === task.id

                        return (
                          <div key={task.id} className={`p-3 flex items-center gap-3 hover:bg-gray-50 ${isSkipped ? 'opacity-50 bg-gray-100' : ''} ${isMoving ? 'bg-blue-50' : ''}`}>
                            {/* Reorder buttons */}
                            <div className="flex flex-col gap-0.5">
                              <button 
                                type="button"
                                onClick={() => moveTaskInDirection(task, 'up')}
                                disabled={isFirst || isMoving}
                                className={`p-1 rounded transition-colors ${isFirst || isMoving ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-blue-500 hover:bg-blue-100'}`}
                                title="Move up"
                              >
                                <ArrowUp size={14} />
                              </button>
                              <button 
                                type="button"
                                onClick={() => moveTaskInDirection(task, 'down')}
                                disabled={isLast || isMoving}
                                className={`p-1 rounded transition-colors ${isLast || isMoving ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-blue-500 hover:bg-blue-100'}`}
                                title="Move down"
                              >
                                <ArrowDown size={14} />
                              </button>
                            </div>
                            
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`font-medium ${isSkipped ? 'line-through text-gray-500' : 'text-gray-900'}`}>{task.task_name}</span>
                                {isCustomTask && <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">Custom</span>}
                                {task.is_success_gate && <span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">Gate</span>}
                                {task.requires_upload && <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">Upload</span>}
                                {task.unlocks_report && <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">Unlocks: {task.unlocks_report}</span>}
                                {isSkipped && <span className="px-1.5 py-0.5 text-xs bg-gray-200 text-gray-600 rounded">Skipped</span>}
                              </div>
                              {task.description && <p className="text-sm text-gray-500 mt-1">{task.description}</p>}
                            </div>
                            
                            <div className="flex items-center gap-1">
                              {/* Move to phase dropdown */}
                              <select 
                                value={task.phase}
                                onChange={(e) => moveTaskToPhase(task, Number(e.target.value))}
                                disabled={isMoving}
                                className="text-xs border rounded px-2 py-1 text-gray-600 bg-white cursor-pointer hover:border-blue-400"
                                title="Move to phase"
                              >
                                {PHASE_OPTIONS.map(p => (
                                  <option key={p.value} value={p.value}>Phase {p.value}</option>
                                ))}
                              </select>
                              
                              {/* Customer mode: skip/unskip global tasks */}
                              {taskEditor.mode === 'customer' && !isCustomTask && progress && (
                                <button type="button" onClick={() => toggleSkipTask(progress.id, isSkipped)} className={`p-2 rounded-lg ${isSkipped ? 'text-green-500 hover:bg-green-50' : 'text-gray-400 hover:text-orange-500 hover:bg-orange-50'}`} title={isSkipped ? 'Unskip Task' : 'Skip Task'}>
                                  <SkipForward size={16} />
                                </button>
                              )}
                              {/* Customer mode: duplicate global task for customization */}
                              {taskEditor.mode === 'customer' && !isCustomTask && taskEditor.customer && (
                                <button type="button" onClick={() => duplicateTaskForCustomer(task, taskEditor.customer!.id)} className="p-2 text-gray-400 hover:text-purple-500 hover:bg-purple-50 rounded-lg" title="Create Custom Copy">
                                  <Copy size={16} />
                                </button>
                              )}
                              {/* Edit task - global in global mode, or custom tasks in customer mode */}
                              {(taskEditor.mode === 'global' || isCustomTask) && (
                                <button type="button" onClick={() => openEditForm(task)} className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg" title="Edit Task">
                                  <Pencil size={16} />
                                </button>
                              )}
                              {/* Delete - global in global mode, custom in customer mode */}
                              {(taskEditor.mode === 'global' || isCustomTask) && (
                                <button type="button" onClick={() => deleteTask(task.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg" title="Delete Task">
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Customer Detail Slideout */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setSelectedCustomer(null)}>
          <div className="absolute right-0 top-0 h-full w-full max-w-3xl bg-white shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-xl font-bold">{selectedCustomer.name}</h2>
                <p className="text-sm text-gray-500">{selectedCustomer.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openCustomerTaskEditor(selectedCustomer)} className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 text-sm flex items-center gap-1"><ListTodo size={16} /> Customize Tasks</button>
                {selectedCustomer.pendingVerification > 0 && (
                  <button onClick={() => verifyAllForCustomer(selectedCustomer.id)} className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm flex items-center gap-1"><Check size={16} /> Verify All ({selectedCustomer.pendingVerification})</button>
                )}
                <button onClick={() => setSelectedCustomer(null)} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
              </div>
            </div>

            <div className="p-6">
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Overall Progress</span>
                  <span className="text-lg font-bold text-blue-500">{selectedCustomer.progress.percentage}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${selectedCustomer.progress.percentage}%` }} /></div>
                <div className="flex justify-between mt-2 text-xs text-gray-500">
                  <span>{selectedCustomer.progress.completed} completed</span>
                  <span>{selectedCustomer.progress.verified} verified</span>
                  <span>{selectedCustomer.pendingVerification} pending</span>
                </div>
              </div>

              {groupTasksByPhase(customerTasks).map(([phase, group]) => (
                <div key={phase} className="mb-4">
                  <button onClick={() => setExpandedPhases(prev => prev.includes(Number(phase)) ? prev.filter(p => p !== Number(phase)) : [...prev, Number(phase)])} className={`w-full px-4 py-2 flex items-center justify-between text-white rounded-t-lg ${getPhaseColor(Number(phase))}`}>
                    <span className="font-medium">{group.name}</span>
                    {expandedPhases.includes(Number(phase)) ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                  {expandedPhases.includes(Number(phase)) && (
                    <div className="border border-t-0 rounded-b-lg divide-y">
                      {group.tasks.filter(t => !t.is_skipped).map((item) => (
                        <div key={item.id} className={`p-4 ${item.verified ? 'bg-green-50' : item.completed ? 'bg-yellow-50' : ''}`}>
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-medium">{item.task.task_name}</h4>
                                {item.task.customer_id && <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full">Custom</span>}
                                {item.completed && !item.verified && <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded-full">Needs Verification</span>}
                                {item.verified && <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full flex items-center gap-1"><Check size={12} /> Verified</span>}
                              </div>
                              {item.completed_at && <p className="text-xs text-gray-500 mt-1">Completed: {new Date(item.completed_at).toLocaleString()}{item.verified_at && <span className="ml-2">• Verified by {item.verified_by}</span>}</p>}
                              {item.files && (item.files as any[]).length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {(item.files as any[]).map((file, idx) => <a key={idx} href={file.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"><Download size={12} />{file.name}</a>)}
                                </div>
                              )}
                              {item.comments.length > 0 && (
                                <div className="mt-3 space-y-2">
                                  {item.comments.map((comment) => (
                                    <div key={comment.id} className={`p-2 rounded text-sm ${comment.author_role === 'customer' ? 'bg-gray-100' : 'bg-blue-50'}`}>
                                      <div className="flex items-center gap-2 mb-1"><span className="font-medium text-xs">{comment.author_name}</span><span className={`text-xs px-1.5 py-0.5 rounded ${comment.author_role === 'customer' ? 'bg-gray-200' : 'bg-blue-200'}`}>{comment.author_role}</span></div>
                                      <p className="text-gray-700">{comment.message}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {replyingTo === item.id ? (
                                <div className="mt-2 flex gap-2">
                                  <input type="text" value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Reply..." className="flex-1 text-sm p-2 border rounded-lg" onKeyDown={(e) => e.key === 'Enter' && addCommentToProgress(item.id, selectedCustomer.id)} />
                                  <button onClick={() => addCommentToProgress(item.id, selectedCustomer.id)} className="p-2 bg-blue-500 text-white rounded-lg"><Send size={16} /></button>
                                  <button onClick={() => { setReplyingTo(null); setNewComment(''); }} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><X size={16} /></button>
                                </div>
                              ) : (
                                <button onClick={() => setReplyingTo(item.id)} className="mt-2 text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1"><MessageSquare size={12} /> Reply</button>
                              )}
                            </div>
                            {item.completed && (
                              <div>
                                {item.verified ? (
                                  <button onClick={() => unverifyTask(item.id)} className="px-3 py-1.5 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">Unverify</button>
                                ) : (
                                  <button onClick={() => verifyTask(item.id)} className="px-3 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-1"><Check size={14} /> Verify</button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Verification Panel */}
      {showVerificationPanel && (
        <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowVerificationPanel(false)}>
          <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-yellow-50 border-b px-6 py-4 flex items-center justify-between">
              <div><h2 className="text-xl font-bold">Pending Verifications</h2><p className="text-sm text-gray-500">{pendingVerifications.length} tasks</p></div>
              <button onClick={() => setShowVerificationPanel(false)} className="p-2 hover:bg-yellow-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              {pendingVerifications.length === 0 ? (
                <div className="text-center py-12 text-gray-500"><CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500" /><p>All caught up!</p></div>
              ) : pendingVerifications.map((item) => (
                <div key={item.progress.id} className="bg-white border rounded-lg p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">{item.customer.name}</span>
                        {item.task.customer_id && <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded">Custom</span>}
                      </div>
                      <h4 className="font-medium">{item.task.task_name}</h4>
                      {item.progress.completed_at && <p className="text-xs text-gray-400 mt-1">Completed: {new Date(item.progress.completed_at).toLocaleString()}</p>}
                    </div>
                    <button onClick={() => verifyTask(item.progress.id)} className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-1"><Check size={16} /> Verify</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Comments Panel */}
      {showCommentsPanel && (
        <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowCommentsPanel(false)}>
          <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-purple-50 border-b px-6 py-4 flex items-center justify-between">
              <div><h2 className="text-xl font-bold">New Comments</h2><p className="text-sm text-gray-500">{unreadComments.length} comments</p></div>
              <button onClick={() => setShowCommentsPanel(false)} className="p-2 hover:bg-purple-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              {unreadComments.length === 0 ? (
                <div className="text-center py-12 text-gray-500"><MessageSquare className="w-12 h-12 mx-auto mb-4 text-purple-500" /><p>All caught up!</p></div>
              ) : unreadComments.map(({ comment, task, customer, progress }) => (
                <div key={comment.id} className="bg-white border rounded-lg p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">{customer.name}</span>
                    <span className="text-xs text-gray-400">on "{task.task_name}"</span>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 mb-3">
                    <p className="text-gray-700">{comment.message}</p>
                    <p className="text-xs text-gray-400 mt-1">{new Date(comment.created_at).toLocaleString()}</p>
                  </div>
                  {replyingTo === comment.id ? (
                    <div className="flex gap-2">
                      <input type="text" value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Reply..." className="flex-1 text-sm p-2 border rounded-lg" onKeyDown={(e) => e.key === 'Enter' && addCommentToProgress(progress.id, customer.id)} />
                      <button onClick={() => addCommentToProgress(progress.id, customer.id)} className="px-4 py-2 bg-purple-500 text-white rounded-lg"><Send size={16} /></button>
                      <button onClick={() => { setReplyingTo(null); setNewComment(''); }} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><X size={16} /></button>
                    </div>
                  ) : (
                    <button onClick={() => setReplyingTo(comment.id)} className="text-sm text-purple-600 flex items-center gap-1"><Send size={14} /> Reply</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Active Panel */}
      {showActivePanel && (
        <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowActivePanel(false)}>
          <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-orange-50 border-b px-6 py-4 flex items-center justify-between">
              <div><h2 className="text-xl font-bold">Active Customers</h2></div>
              <button onClick={() => setShowActivePanel(false)} className="p-2 hover:bg-orange-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-3">
              {customers.filter(c => c.progress.percentage > 0 && c.progress.percentage < 100).map(customer => (
                <div key={customer.id} className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md cursor-pointer" onClick={() => { setShowActivePanel(false); loadCustomerDetails(customer); }}>
                  <div className="flex items-center justify-between">
                    <div><h4 className="font-medium">{customer.name}</h4><p className="text-sm text-gray-500">{customer.email}</p></div>
                    <div className="text-right"><p className="text-2xl font-bold text-orange-500">{customer.progress.percentage}%</p></div>
                  </div>
                  <div className="mt-3 w-full bg-gray-200 rounded-full h-2"><div className="h-full bg-orange-500 rounded-full" style={{ width: `${customer.progress.percentage}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Completed Panel */}
      {showCompletedPanel && (
        <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowCompletedPanel(false)}>
          <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-green-50 border-b px-6 py-4 flex items-center justify-between">
              <div><h2 className="text-xl font-bold">Completed Customers</h2></div>
              <button onClick={() => setShowCompletedPanel(false)} className="p-2 hover:bg-green-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-3">
              {customers.filter(c => c.progress.percentage === 100).map(customer => (
                <div key={customer.id} className="bg-white border border-green-200 rounded-lg p-4 shadow-sm hover:shadow-md cursor-pointer" onClick={() => { setShowCompletedPanel(false); loadCustomerDetails(customer); }}>
                  <div className="flex items-center gap-3"><CheckCircle2 className="w-8 h-8 text-green-500" /><div><h4 className="font-medium">{customer.name}</h4><p className="text-sm text-gray-500">{customer.email}</p></div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      {showAddCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4">Add New Customer</h3>
            <form onSubmit={addCustomer} className="space-y-4">
              <div><label className="block text-sm font-medium mb-1">Name *</label><input type="text" required value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} className="w-full px-4 py-2 border rounded-lg" /></div>
              <div><label className="block text-sm font-medium mb-1">Email *</label><input type="email" required value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} className="w-full px-4 py-2 border rounded-lg" /></div>
              <div><label className="block text-sm font-medium mb-1">Company</label><input type="text" value={newCustomer.company} onChange={(e) => setNewCustomer({ ...newCustomer, company: e.target.value })} className="w-full px-4 py-2 border rounded-lg" /></div>
              <div><label className="block text-sm font-medium mb-1">Assign to OM</label><select value={newCustomer.assigned_om} onChange={(e) => setNewCustomer({ ...newCustomer, assigned_om: e.target.value })} className="w-full px-4 py-2 border rounded-lg"><option value="">Select...</option>{omUsers.map(om => <option key={om.id} value={om.name}>{om.name}</option>)}</select></div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowAddCustomer(false)} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">Add</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* OM Manager Modal */}
      {showOMManager && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">Manage OMs</h3>
              <button onClick={() => setShowOMManager(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="space-y-2 mb-6">
              {omUsers.map(om => (
                <div key={om.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm ${om.role === 'admin' ? 'bg-purple-500' : 'bg-blue-500'}`}>{om.role === 'admin' ? <Shield size={14} /> : om.name.charAt(0)}</div>
                    <div><p className="font-medium">{om.name}</p><p className="text-xs text-gray-500">{om.email} • {om.customer_count} customers</p></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-xs rounded ${om.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{om.role}</span>
                    {om.role !== 'admin' && <button onClick={() => deleteOM(om.id)} className="p-1 text-red-500 hover:bg-red-50 rounded"><X size={16} /></button>}
                  </div>
                </div>
              ))}
            </div>
            {showAddOM ? (
              <form onSubmit={addOM} className="space-y-3 p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium">Add New OM</h4>
                <input type="text" placeholder="Name" value={newOM.name} onChange={(e) => setNewOM({ ...newOM, name: e.target.value })} required className="w-full px-3 py-2 border rounded-lg text-sm" />
                <input type="email" placeholder="Email" value={newOM.email} onChange={(e) => setNewOM({ ...newOM, email: e.target.value })} required className="w-full px-3 py-2 border rounded-lg text-sm" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setShowAddOM(false); setNewOM({ email: '', name: '' }); }} className="flex-1 px-3 py-2 border rounded-lg text-sm">Cancel</button>
                  <button type="submit" className="flex-1 px-3 py-2 bg-blue-500 text-white rounded-lg text-sm">Add</button>
                </div>
              </form>
            ) : (
              <button onClick={() => setShowAddOM(true)} className="w-full py-3 border-2 border-dashed rounded-lg text-gray-500 hover:border-blue-500 hover:text-blue-500 flex items-center justify-center gap-2"><UserPlus size={18} />Add OM</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
