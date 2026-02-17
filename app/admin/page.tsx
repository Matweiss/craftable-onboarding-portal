'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, Customer, Task, CustomerProgress } from '@/lib/supabase'
import { 
  Users, CheckCircle2, Clock, AlertTriangle, LogOut, Plus, Search,
  ChevronRight, ChevronDown, ChevronUp, X, Check, MessageSquare,
  Send, FileText, Download, UserPlus, Settings, Eye, Shield,
  ListTodo, Pencil, Trash2, GripVertical, Save, RotateCcw
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
  customer?: Customer
}

interface CustomerWithProgress extends Customer {
  progress: {
    completed: number
    verified: number
    total: number
    percentage: number
    lastActivity: string | null
  }
  pendingVerification: number
  unreadComments: number
}

interface OMUser {
  id: string
  email: string
  name: string
  role: string
  created_at: string
  customer_count?: number
}

interface PendingItem {
  progress: CustomerProgress
  task: Task
  customer: Customer
  comments: TaskComment[]
}

const PHASE_OPTIONS = [
  { value: 0, label: 'Phase 0: Before We Start', color: 'bg-gray-500' },
  { value: 1, label: 'Phase 1: Immediate — Days 1-6', color: 'bg-blue-500' },
  { value: 2, label: 'Phase 2: Crawl — Weeks 1-2', color: 'bg-orange-500' },
  { value: 3, label: 'Phase 3: Walk — Weeks 3-4', color: 'bg-green-500' },
  { value: 4, label: 'Phase 4: Run — Month 2+', color: 'bg-indigo-900' },
]

export default function AdminDashboard() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<{ email: string; name: string; role: string } | null>(null)
  const [customers, setCustomers] = useState<CustomerWithProgress[]>([])
  const [omUsers, setOmUsers] = useState<OMUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // All data for quick actions
  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [allProgress, setAllProgress] = useState<CustomerProgress[]>([])
  const [allComments, setAllComments] = useState<TaskComment[]>([])
  const [allCustomers, setAllCustomers] = useState<Customer[]>([])
  
  // UI State
  const [searchQuery, setSearchQuery] = useState('')
  const [filterOM, setFilterOM] = useState<string>('all')
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [showAddOM, setShowAddOM] = useState(false)
  const [showOMManager, setShowOMManager] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithProgress | null>(null)
  const [customerTasks, setCustomerTasks] = useState<ProgressWithTask[]>([])
  const [expandedPhases, setExpandedPhases] = useState<number[]>([0, 1, 2, 3, 4])
  
  // Quick Action Panels
  const [showVerificationPanel, setShowVerificationPanel] = useState(false)
  const [showCommentsPanel, setShowCommentsPanel] = useState(false)
  const [showActivePanel, setShowActivePanel] = useState(false)
  const [showCompletedPanel, setShowCompletedPanel] = useState(false)
  
  // Task Template Editor
  const [showTaskEditor, setShowTaskEditor] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [taskForm, setTaskForm] = useState({
    phase: 0,
    phase_name: 'Phase 0: Before We Start',
    task_name: '',
    description: '',
    owner: 'Customer',
    est_time: '',
    is_success_gate: false,
    unlocks_report: '',
    requires_upload: false
  })
  const [savingTask, setSavingTask] = useState(false)
  
  // Form State
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', company: '', assigned_om: '' })
  const [newOM, setNewOM] = useState({ email: '', name: '' })
  const [newComment, setNewComment] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)

  useEffect(() => {
    checkAdminAndLoadData()
  }, [])

  const checkAdminAndLoadData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        router.push('/')
        return
      }

      const { data: adminData, error: adminError } = await supabase
        .from('admin_users')
        .select('*')
        .eq('email', session.user.email)
        .single()

      if (adminError || !adminData) {
        setError('Not authorized as admin')
        return
      }

      setCurrentUser({
        email: adminData.email,
        name: adminData.name || adminData.email,
        role: adminData.role
      })

      await loadData()
    } catch (err) {
      setError(`Error: ${err}`)
    }
  }

  const loadData = async () => {
    const { data: adminsData } = await supabase.from('admin_users').select('*').order('created_at')
    const { data: customersData } = await supabase.from('customers').select('*').order('created_at', { ascending: false })
    const { data: tasksData } = await supabase.from('tasks').select('*').order('sort_order')
    const { data: progressData } = await supabase.from('customer_progress').select('*')
    const { data: commentsData } = await supabase.from('task_comments').select('*').order('created_at', { ascending: false })

    setAllTasks(tasksData || [])
    setAllProgress(progressData || [])
    setAllComments(commentsData || [])
    setAllCustomers(customersData || [])

    const omWithCounts = (adminsData || []).map(admin => ({
      ...admin,
      customer_count: (customersData || []).filter(c => c.assigned_om === admin.name).length
    }))
    setOmUsers(omWithCounts)

    const customersWithProgress: CustomerWithProgress[] = (customersData || []).map(customer => {
      const customerProgress = progressData?.filter(p => p.customer_id === customer.id) || []
      const completed = customerProgress.filter(p => p.completed).length
      const verified = customerProgress.filter(p => p.verified).length
      const total = customerProgress.length
      const pendingVerification = completed - verified
      
      const customerComments = commentsData?.filter(c => c.customer_id === customer.id) || []
      const customerReplies = customerComments.filter(c => c.author_role !== 'customer')
      const unreadComments = customerComments.filter(c => 
        c.author_role === 'customer' && 
        !customerReplies.some(r => new Date(r.created_at) > new Date(c.created_at))
      ).length

      const lastCompleted = customerProgress
        .filter(p => p.completed && p.completed_at)
        .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())[0]

      return {
        ...customer,
        progress: { completed, verified, total, percentage: total > 0 ? Math.round((completed / total) * 100) : 0, lastActivity: lastCompleted?.completed_at || null },
        pendingVerification,
        unreadComments
      }
    })

    setCustomers(customersWithProgress)
    setLoading(false)
  }

  // Task Template Functions
  const openTaskEditor = (task?: Task) => {
    if (task) {
      setEditingTask(task)
      setTaskForm({
        phase: task.phase,
        phase_name: task.phase_name,
        task_name: task.task_name,
        description: task.description || '',
        owner: task.owner,
        est_time: task.est_time || '',
        is_success_gate: task.is_success_gate,
        unlocks_report: task.unlocks_report || '',
        requires_upload: task.requires_upload || false
      })
    } else {
      setEditingTask(null)
      setTaskForm({
        phase: 0,
        phase_name: 'Phase 0: Before We Start',
        task_name: '',
        description: '',
        owner: 'Customer',
        est_time: '',
        is_success_gate: false,
        unlocks_report: '',
        requires_upload: false
      })
    }
  }

  const handlePhaseChange = (phase: number) => {
    const phaseOption = PHASE_OPTIONS.find(p => p.value === phase)
    setTaskForm({
      ...taskForm,
      phase,
      phase_name: phaseOption?.label || ''
    })
  }

  const saveTask = async () => {
    setSavingTask(true)
    
    if (editingTask) {
      // Update existing task
      const { error } = await supabase
        .from('tasks')
        .update({
          phase: taskForm.phase,
          phase_name: taskForm.phase_name,
          task_name: taskForm.task_name,
          description: taskForm.description,
          owner: taskForm.owner,
          est_time: taskForm.est_time,
          is_success_gate: taskForm.is_success_gate,
          unlocks_report: taskForm.unlocks_report || null,
          requires_upload: taskForm.requires_upload
        })
        .eq('id', editingTask.id)

      if (error) {
        alert('Error updating task: ' + error.message)
      }
    } else {
      // Create new task - get max sort_order for the phase
      const maxOrder = allTasks
        .filter(t => t.phase === taskForm.phase)
        .reduce((max, t) => Math.max(max, t.sort_order), 0)

      const { error } = await supabase
        .from('tasks')
        .insert({
          phase: taskForm.phase,
          phase_name: taskForm.phase_name,
          task_name: taskForm.task_name,
          description: taskForm.description,
          owner: taskForm.owner,
          est_time: taskForm.est_time,
          sort_order: maxOrder + 1,
          is_success_gate: taskForm.is_success_gate,
          unlocks_report: taskForm.unlocks_report || null,
          requires_upload: taskForm.requires_upload
        })

      if (error) {
        alert('Error creating task: ' + error.message)
      } else {
        // Add progress records for all existing customers
        const { data: newTask } = await supabase
          .from('tasks')
          .select('*')
          .eq('task_name', taskForm.task_name)
          .single()

        if (newTask) {
          const progressRecords = allCustomers.map(c => ({
            customer_id: c.id,
            task_id: newTask.id
          }))
          
          if (progressRecords.length > 0) {
            await supabase.from('customer_progress').insert(progressRecords)
          }
        }
      }
    }

    setSavingTask(false)
    setEditingTask(null)
    await loadData()
  }

  const deleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task? This will also delete all customer progress for this task.')) {
      return
    }

    // Delete progress records first
    await supabase.from('customer_progress').delete().eq('task_id', taskId)
    
    // Delete the task
    const { error } = await supabase.from('tasks').delete().eq('id', taskId)
    
    if (error) {
      alert('Error deleting task: ' + error.message)
    }
    
    await loadData()
  }

  const moveTask = async (taskId: string, direction: 'up' | 'down') => {
    const taskIndex = allTasks.findIndex(t => t.id === taskId)
    if (taskIndex === -1) return

    const task = allTasks[taskIndex]
    const swapIndex = direction === 'up' ? taskIndex - 1 : taskIndex + 1
    
    if (swapIndex < 0 || swapIndex >= allTasks.length) return
    
    const swapTask = allTasks[swapIndex]
    
    // Swap sort_order values
    await supabase.from('tasks').update({ sort_order: swapTask.sort_order }).eq('id', task.id)
    await supabase.from('tasks').update({ sort_order: task.sort_order }).eq('id', swapTask.id)
    
    await loadData()
  }

  // Get all pending verification items
  const getPendingVerifications = (): PendingItem[] => {
    const pending: PendingItem[] = []
    allProgress.filter(p => p.completed && !p.verified).forEach(progress => {
      const task = allTasks.find(t => t.id === progress.task_id)
      const customer = allCustomers.find(c => c.id === progress.customer_id)
      const comments = allComments.filter(c => c.progress_id === progress.id)
      if (task && customer) {
        pending.push({ progress, task, customer, comments })
      }
    })
    return pending.sort((a, b) => 
      new Date(b.progress.completed_at || 0).getTime() - new Date(a.progress.completed_at || 0).getTime()
    )
  }

  // Get all unread comments
  const getUnreadComments = (): { comment: TaskComment; task: Task; customer: Customer; progress: CustomerProgress }[] => {
    const unread: { comment: TaskComment; task: Task; customer: Customer; progress: CustomerProgress }[] = []
    
    const commentsByProgress: Record<string, TaskComment[]> = {}
    allComments.forEach(c => {
      if (!commentsByProgress[c.progress_id]) {
        commentsByProgress[c.progress_id] = []
      }
      commentsByProgress[c.progress_id].push(c)
    })

    Object.entries(commentsByProgress).forEach(([progressId, comments]) => {
      const sorted = comments.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      
      sorted.forEach((comment, idx) => {
        if (comment.author_role === 'customer') {
          const hasReply = sorted.slice(idx + 1).some(c => c.author_role !== 'customer')
          if (!hasReply) {
            const progress = allProgress.find(p => p.id === progressId)
            const task = allTasks.find(t => progress && t.id === progress.task_id)
            const customer = allCustomers.find(c => c.id === comment.customer_id)
            if (progress && task && customer) {
              unread.push({ comment, task, customer, progress })
            }
          }
        }
      })
    })

    return unread.sort((a, b) => 
      new Date(b.comment.created_at).getTime() - new Date(a.comment.created_at).getTime()
    )
  }

  const loadCustomerDetails = async (customer: CustomerWithProgress) => {
    setSelectedCustomer(customer)
    
    const { data: tasksData } = await supabase.from('tasks').select('*').order('sort_order')
    const { data: progressData } = await supabase.from('customer_progress').select('*').eq('customer_id', customer.id)
    const { data: commentsData } = await supabase.from('task_comments').select('*').eq('customer_id', customer.id).order('created_at', { ascending: true })

    const tasksWithProgress: ProgressWithTask[] = (tasksData || []).map(task => {
      const progress = progressData?.find(p => p.task_id === task.id)
      const comments = commentsData?.filter(c => progress && c.progress_id === progress.id) || []
      return { ...progress!, task, comments }
    }).filter(t => t.id)

    setCustomerTasks(tasksWithProgress)
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
    await supabase.from('task_comments').insert({ progress_id: progressId, customer_id: customerId, author_email: currentUser.email, author_name: currentUser.name, author_role: currentUser.role, message: newComment.trim() })
    setNewComment('')
    setReplyingTo(null)
    if (selectedCustomer) await loadCustomerDetails(selectedCustomer)
    await loadData()
  }

  const addCustomer = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.from('customers').insert({ name: newCustomer.name, email: newCustomer.email, company: newCustomer.company || newCustomer.name, assigned_om: newCustomer.assigned_om || currentUser?.name || 'Unassigned' })
    if (!error) {
      setShowAddCustomer(false)
      setNewCustomer({ name: '', email: '', company: '', assigned_om: '' })
      await loadData()
    }
  }

  const addOM = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.from('admin_users').insert({ email: newOM.email.toLowerCase(), name: newOM.name, role: 'om' })
    if (!error) {
      setShowAddOM(false)
      setNewOM({ email: '', name: '' })
      await loadData()
    }
  }

  const updateCustomerOM = async (customerId: string, omName: string) => {
    await supabase.from('customers').update({ assigned_om: omName }).eq('id', customerId)
    await loadData()
  }

  const deleteOM = async (omId: string) => {
    if (!confirm('Are you sure? This will not reassign their customers.')) return
    await supabase.from('admin_users').delete().eq('id', omId)
    await loadData()
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const filteredCustomers = customers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.email.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesOM = filterOM === 'all' || c.assigned_om === filterOM
    return matchesSearch && matchesOM
  })

  const stats = {
    total: customers.length,
    active: customers.filter(c => c.progress.percentage > 0 && c.progress.percentage < 100).length,
    completed: customers.filter(c => c.progress.percentage === 100).length,
    pendingVerification: customers.reduce((acc, c) => acc + c.pendingVerification, 0),
    unreadComments: getUnreadComments().length
  }

  const getProgressColor = (percentage: number) => {
    if (percentage === 100) return 'bg-green-500'
    if (percentage >= 60) return 'bg-blue-500'
    if (percentage >= 30) return 'bg-orange-500'
    return 'bg-gray-300'
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'No activity'
    const date = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    return date.toLocaleDateString()
  }

  const getPhaseColor = (phase: number) => {
    const colors: Record<number, string> = { 0: 'bg-gray-500', 1: 'bg-blue-500', 2: 'bg-orange-500', 3: 'bg-green-500', 4: 'bg-indigo-900' }
    return colors[phase] || 'bg-gray-500'
  }

  const groupTasksByPhase = (tasks: ProgressWithTask[]) => {
    const groups: Record<number, { name: string; tasks: ProgressWithTask[] }> = {}
    tasks.forEach(t => {
      if (!groups[t.task.phase]) groups[t.task.phase] = { name: t.task.phase_name, tasks: [] }
      groups[t.task.phase].tasks.push(t)
    })
    return Object.entries(groups).sort(([a], [b]) => Number(a) - Number(b))
  }

  const groupAllTasksByPhase = () => {
    const groups: Record<number, { name: string; tasks: Task[] }> = {}
    allTasks.forEach(t => {
      if (!groups[t.phase]) groups[t.phase] = { name: t.phase_name, tasks: [] }
      groups[t.phase].tasks.push(t)
    })
    return Object.entries(groups).sort(([a], [b]) => Number(a) - Number(b))
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-lg text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button onClick={() => router.push('/')} className="px-4 py-2 bg-blue-500 text-white rounded-lg">Back to Login</button>
        </div>
      </div>
    )
  }

  const pendingVerifications = getPendingVerifications()
  const unreadComments = getUnreadComments()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-indigo-900 text-white">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">craftable</h1>
            <p className="text-sm text-blue-200">Admin Dashboard</p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowTaskEditor(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all"
            >
              <ListTodo size={18} />
              Edit Tasks
            </button>
            <button
              onClick={() => setShowOMManager(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all"
            >
              <Settings size={18} />
              Manage OMs
            </button>
            <div className="text-right text-sm">
              <p className="font-medium">{currentUser?.name}</p>
              <p className="text-blue-200">{currentUser?.role}</p>
            </div>
            <button onClick={handleSignOut} className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Clickable Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <button onClick={() => { setSearchQuery(''); setFilterOM('all'); }} className="bg-white rounded-xl shadow-sm border p-6 hover:shadow-md transition-all text-left">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 rounded-lg"><Users className="w-6 h-6 text-blue-500" /></div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                <p className="text-sm text-gray-500">Total Customers</p>
              </div>
            </div>
          </button>

          <button onClick={() => setShowActivePanel(true)} className="bg-white rounded-xl shadow-sm border p-6 hover:shadow-md hover:border-orange-300 transition-all text-left">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-orange-100 rounded-lg"><Clock className="w-6 h-6 text-orange-500" /></div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
                <p className="text-sm text-gray-500">In Progress</p>
              </div>
            </div>
          </button>

          <button onClick={() => setShowCompletedPanel(true)} className="bg-white rounded-xl shadow-sm border p-6 hover:shadow-md hover:border-green-300 transition-all text-left">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-100 rounded-lg"><CheckCircle2 className="w-6 h-6 text-green-500" /></div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.completed}</p>
                <p className="text-sm text-gray-500">Completed</p>
              </div>
            </div>
          </button>

          <button onClick={() => setShowVerificationPanel(true)} className={`bg-white rounded-xl shadow-sm border p-6 hover:shadow-md transition-all text-left ${stats.pendingVerification > 0 ? 'border-yellow-300 hover:border-yellow-400' : ''}`}>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-yellow-100 rounded-lg"><AlertTriangle className="w-6 h-6 text-yellow-500" /></div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.pendingVerification}</p>
                <p className="text-sm text-gray-500">Needs Verification</p>
              </div>
            </div>
            {stats.pendingVerification > 0 && <p className="text-xs text-yellow-600 mt-2">Click to review →</p>}
          </button>

          <button onClick={() => setShowCommentsPanel(true)} className={`bg-white rounded-xl shadow-sm border p-6 hover:shadow-md transition-all text-left ${stats.unreadComments > 0 ? 'border-purple-300 hover:border-purple-400' : ''}`}>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 rounded-lg"><MessageSquare className="w-6 h-6 text-purple-500" /></div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.unreadComments}</p>
                <p className="text-sm text-gray-500">New Comments</p>
              </div>
            </div>
            {stats.unreadComments > 0 && <p className="text-xs text-purple-600 mt-2">Click to reply →</p>}
          </button>
        </div>

        {/* Filters & Actions */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input type="text" placeholder="Search customers..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>

          <select value={filterOM} onChange={(e) => setFilterOM(e.target.value)} className="px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500">
            <option value="all">All OMs</option>
            {omUsers.map(om => <option key={om.id} value={om.name}>{om.name} ({om.customer_count})</option>)}
          </select>

          <button onClick={() => setShowAddCustomer(true)} className="flex items-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all">
            <Plus size={20} />Add Customer
          </button>
        </div>

        {/* Customer List */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Customer</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Progress</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Verification</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Last Activity</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Assigned OM</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredCustomers.map((customer) => (
                <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-gray-900">{customer.name}</p>
                      <p className="text-sm text-gray-500">{customer.email}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-24 bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div className={`h-full ${getProgressColor(customer.progress.percentage)}`} style={{ width: `${customer.progress.percentage}%` }} />
                      </div>
                      <span className="text-sm font-medium">{customer.progress.percentage}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{customer.progress.verified}/{customer.progress.completed}</span>
                      {customer.pendingVerification > 0 && <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded-full">{customer.pendingVerification} pending</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4"><span className="text-sm text-gray-500">{formatDate(customer.progress.lastActivity)}</span></td>
                  <td className="px-6 py-4">
                    <select value={customer.assigned_om} onChange={(e) => updateCustomerOM(customer.id, e.target.value)} className="text-sm border border-gray-200 rounded px-2 py-1">
                      {omUsers.map(om => <option key={om.id} value={om.name}>{om.name}</option>)}
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {customer.unreadComments > 0 && <span className="w-5 h-5 flex items-center justify-center text-xs bg-purple-500 text-white rounded-full">{customer.unreadComments}</span>}
                      <button onClick={() => loadCustomerDetails(customer)} className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"><Eye size={18} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* Task Template Editor */}
      {showTaskEditor && (
        <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowTaskEditor(false)}>
          <div className="absolute right-0 top-0 h-full w-full max-w-4xl bg-white shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Task Template Editor</h2>
                <p className="text-sm text-gray-500">{allTasks.length} tasks across {PHASE_OPTIONS.length} phases</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openTaskEditor()} className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                  <Plus size={18} /> Add Task
                </button>
                <button onClick={() => setShowTaskEditor(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Task Form */}
              {editingTask !== null || taskForm.task_name !== '' || editingTask === null && taskForm.task_name === '' && document.activeElement?.closest('.task-form') ? null : null}
              
              {(editingTask !== null || (!editingTask && taskForm.task_name !== '')) ? (
                <div className="task-form mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h3 className="font-semibold text-gray-900 mb-4">{editingTask ? 'Edit Task' : 'New Task'}</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phase</label>
                      <select
                        value={taskForm.phase}
                        onChange={(e) => handlePhaseChange(Number(e.target.value))}
                        className="w-full px-3 py-2 border rounded-lg"
                      >
                        {PHASE_OPTIONS.map(p => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Owner</label>
                      <select
                        value={taskForm.owner}
                        onChange={(e) => setTaskForm({ ...taskForm, owner: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                      >
                        <option value="Customer">Customer</option>
                        <option value="OM">OM</option>
                        <option value="Both">Both</option>
                      </select>
                    </div>

                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Task Name *</label>
                      <input
                        type="text"
                        value={taskForm.task_name}
                        onChange={(e) => setTaskForm({ ...taskForm, task_name: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="e.g., Complete Invoice Setup"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                      <textarea
                        value={taskForm.description}
                        onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                        rows={2}
                        placeholder="Brief description of what the customer needs to do..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Time</label>
                      <input
                        type="text"
                        value={taskForm.est_time}
                        onChange={(e) => setTaskForm({ ...taskForm, est_time: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="e.g., 30-45 min"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Unlocks Reports <span className="font-normal text-gray-400">(comma-separated)</span></label>
                      <input
                        type="text"
                        value={taskForm.unlocks_report}
                        onChange={(e) => setTaskForm({ ...taskForm, unlocks_report: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="e.g., Sales by Hour, Labor by Hour, Heartbeat Analytics"
                      />
                    </div>

                    <div className="col-span-2 flex items-center gap-6">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={taskForm.is_success_gate}
                          onChange={(e) => setTaskForm({ ...taskForm, is_success_gate: e.target.checked })}
                          className="w-4 h-4 rounded"
                        />
                        <span className="text-sm text-gray-700">Success Gate (key milestone)</span>
                      </label>

                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={taskForm.requires_upload}
                          onChange={(e) => setTaskForm({ ...taskForm, requires_upload: e.target.checked })}
                          className="w-4 h-4 rounded"
                        />
                        <span className="text-sm text-gray-700">Requires File Upload</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 mt-4">
                    <button
                      onClick={() => { setEditingTask(null); setTaskForm({ phase: 0, phase_name: 'Phase 0: Before We Start', task_name: '', description: '', owner: 'Customer', est_time: '', is_success_gate: false, unlocks_report: '', requires_upload: false }); }}
                      className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveTask}
                      disabled={!taskForm.task_name || savingTask}
                      className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
                    >
                      <Save size={16} />
                      {savingTask ? 'Saving...' : editingTask ? 'Update Task' : 'Create Task'}
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Task List by Phase */}
              {groupAllTasksByPhase().map(([phase, group]) => (
                <div key={phase} className="mb-6">
                  <div className={`px-4 py-2 rounded-t-lg text-white ${getPhaseColor(Number(phase))}`}>
                    <span className="font-semibold">{group.name}</span>
                    <span className="ml-2 text-sm opacity-75">({group.tasks.length} tasks)</span>
                  </div>
                  
                  <div className="border border-t-0 rounded-b-lg divide-y">
                    {group.tasks.map((task, index) => (
                      <div key={task.id} className="p-3 flex items-center gap-3 hover:bg-gray-50">
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => moveTask(task.id, 'up')}
                            disabled={index === 0}
                            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                          >
                            <ChevronUp size={14} />
                          </button>
                          <button
                            onClick={() => moveTask(task.id, 'down')}
                            disabled={index === group.tasks.length - 1}
                            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                          >
                            <ChevronDown size={14} />
                          </button>
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{task.task_name}</span>
                            {task.is_success_gate && (
                              <span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded">Gate</span>
                            )}
                            {task.requires_upload && (
                              <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">Upload</span>
                            )}
                            {task.unlocks_report && (
                              <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">Unlocks: {task.unlocks_report}</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500">{task.description}</p>
                          <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
                            <span>Owner: {task.owner}</span>
                            {task.est_time && <span>Est: {task.est_time}</span>}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openTaskEditor(task)}
                            className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => deleteTask(task.id)}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
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
              <div>
                <h2 className="text-xl font-bold text-gray-900">Pending Verifications</h2>
                <p className="text-sm text-gray-500">{pendingVerifications.length} tasks awaiting verification</p>
              </div>
              <button onClick={() => setShowVerificationPanel(false)} className="p-2 hover:bg-yellow-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              {pendingVerifications.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500" />
                  <p>All caught up! No pending verifications.</p>
                </div>
              ) : (
                pendingVerifications.map((item) => (
                  <div key={item.progress.id} className="bg-white border rounded-lg p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">{item.customer.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${getPhaseColor(item.task.phase)} text-white`}>Phase {item.task.phase}</span>
                        </div>
                        <h4 className="font-medium text-gray-900">{item.task.task_name}</h4>
                        <p className="text-sm text-gray-500 mt-1">{item.task.description}</p>
                        {item.progress.completed_at && <p className="text-xs text-gray-400 mt-2">Completed: {new Date(item.progress.completed_at).toLocaleString()}</p>}
                        {item.progress.files && (item.progress.files as any[]).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(item.progress.files as any[]).map((file, idx) => (
                              <a key={idx} href={file.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200">
                                <Download size={12} />{file.name}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={() => verifyTask(item.progress.id)} className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-1 whitespace-nowrap">
                        <Check size={16} /> Verify
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Comments Panel */}
      {showCommentsPanel && (
        <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowCommentsPanel(false)}>
          <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-purple-50 border-b px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">New Comments</h2>
                <p className="text-sm text-gray-500">{unreadComments.length} comments need response</p>
              </div>
              <button onClick={() => setShowCommentsPanel(false)} className="p-2 hover:bg-purple-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              {unreadComments.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <MessageSquare className="w-12 h-12 mx-auto mb-4 text-purple-500" />
                  <p>All caught up! No new comments.</p>
                </div>
              ) : (
                unreadComments.map(({ comment, task, customer, progress }) => (
                  <div key={comment.id} className="bg-white border rounded-lg p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">{customer.name}</span>
                      <span className="text-xs text-gray-400">on "{task.task_name}"</span>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 mb-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{comment.author_name || customer.name}</span>
                        <span className="text-xs text-gray-400">{new Date(comment.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-gray-700">{comment.message}</p>
                    </div>
                    {replyingTo === comment.id ? (
                      <div className="flex gap-2">
                        <input type="text" value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Write a reply..." className="flex-1 text-sm p-2 border rounded-lg" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') addCommentToProgress(progress.id, customer.id) }} />
                        <button onClick={() => addCommentToProgress(progress.id, customer.id)} className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"><Send size={16} /></button>
                        <button onClick={() => { setReplyingTo(null); setNewComment(''); }} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><X size={16} /></button>
                      </div>
                    ) : (
                      <button onClick={() => setReplyingTo(comment.id)} className="text-sm text-purple-600 hover:text-purple-800 flex items-center gap-1"><Send size={14} /> Reply</button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Active Panel */}
      {showActivePanel && (
        <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowActivePanel(false)}>
          <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-orange-50 border-b px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Active Customers</h2>
                <p className="text-sm text-gray-500">{stats.active} customers in progress</p>
              </div>
              <button onClick={() => setShowActivePanel(false)} className="p-2 hover:bg-orange-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-3">
              {customers.filter(c => c.progress.percentage > 0 && c.progress.percentage < 100).map(customer => (
                <div key={customer.id} className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md cursor-pointer transition-all" onClick={() => { setShowActivePanel(false); loadCustomerDetails(customer); }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-gray-900">{customer.name}</h4>
                      <p className="text-sm text-gray-500">{customer.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-orange-500">{customer.progress.percentage}%</p>
                      <p className="text-xs text-gray-400">{customer.progress.completed}/{customer.progress.total} tasks</p>
                    </div>
                  </div>
                  <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
                    <div className="h-full bg-orange-500 rounded-full" style={{ width: `${customer.progress.percentage}%` }} />
                  </div>
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
              <div>
                <h2 className="text-xl font-bold text-gray-900">Completed Customers</h2>
                <p className="text-sm text-gray-500">{stats.completed} customers finished onboarding</p>
              </div>
              <button onClick={() => setShowCompletedPanel(false)} className="p-2 hover:bg-green-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-3">
              {customers.filter(c => c.progress.percentage === 100).length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Clock className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p>No completed customers yet.</p>
                </div>
              ) : (
                customers.filter(c => c.progress.percentage === 100).map(customer => (
                  <div key={customer.id} className="bg-white border border-green-200 rounded-lg p-4 shadow-sm hover:shadow-md cursor-pointer transition-all" onClick={() => { setShowCompletedPanel(false); loadCustomerDetails(customer); }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-8 h-8 text-green-500" />
                        <div>
                          <h4 className="font-medium text-gray-900">{customer.name}</h4>
                          <p className="text-sm text-gray-500">{customer.email}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-green-600">100% Complete</p>
                        <p className="text-xs text-gray-400">{customer.progress.verified}/{customer.progress.total} verified</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
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
                <h2 className="text-xl font-bold text-gray-900">{selectedCustomer.name}</h2>
                <p className="text-sm text-gray-500">{selectedCustomer.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {selectedCustomer.pendingVerification > 0 && (
                  <button onClick={() => verifyAllForCustomer(selectedCustomer.id)} className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm flex items-center gap-1">
                    <Check size={16} /> Verify All ({selectedCustomer.pendingVerification})
                  </button>
                )}
                <button onClick={() => setSelectedCustomer(null)} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
              </div>
            </div>

            <div className="p-6">
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Overall Progress</span>
                  <span className="text-lg font-bold text-blue-500">{selectedCustomer.progress.percentage}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${selectedCustomer.progress.percentage}%` }} />
                </div>
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
                      {group.tasks.map((item) => (
                        <div key={item.id} className={`p-4 ${item.verified ? 'bg-green-50' : item.completed ? 'bg-yellow-50' : ''}`}>
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-medium text-gray-900">{item.task.task_name}</h4>
                                {item.completed && !item.verified && <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded-full">Needs Verification</span>}
                                {item.verified && <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full flex items-center gap-1"><Check size={12} /> Verified</span>}
                              </div>
                              {item.completed_at && <p className="text-xs text-gray-500 mt-1">Completed: {new Date(item.completed_at).toLocaleString()}{item.verified_at && <span className="ml-2">• Verified: {new Date(item.verified_at).toLocaleString()} by {item.verified_by}</span>}</p>}
                              {item.files && (item.files as any[]).length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {(item.files as any[]).map((file, idx) => <a key={idx} href={file.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"><Download size={12} />{file.name}</a>)}
                                </div>
                              )}
                              {item.comments.length > 0 && (
                                <div className="mt-3 space-y-2">
                                  {item.comments.map((comment) => (
                                    <div key={comment.id} className={`p-2 rounded text-sm ${comment.author_role === 'customer' ? 'bg-gray-100' : 'bg-blue-50'}`}>
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="font-medium text-xs">{comment.author_name}</span>
                                        <span className={`text-xs px-1.5 py-0.5 rounded ${comment.author_role === 'customer' ? 'bg-gray-200' : 'bg-blue-200'}`}>{comment.author_role}</span>
                                        <span className="text-xs text-gray-400">{new Date(comment.created_at).toLocaleString()}</span>
                                      </div>
                                      <p className="text-gray-700">{comment.message}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {replyingTo === item.id ? (
                                <div className="mt-2 flex gap-2">
                                  <input type="text" value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Write a reply..." className="flex-1 text-sm p-2 border rounded-lg" onKeyDown={(e) => e.key === 'Enter' && addCommentToProgress(item.id, selectedCustomer.id)} />
                                  <button onClick={() => addCommentToProgress(item.id, selectedCustomer.id)} className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"><Send size={16} /></button>
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

      {/* Add Customer Modal */}
      {showAddCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4">Add New Customer</h3>
            <form onSubmit={addCustomer} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name *</label>
                <input type="text" required value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" required value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                <input type="text" value={newCustomer.company} onChange={(e) => setNewCustomer({ ...newCustomer, company: e.target.value })} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assign to OM</label>
                <select value={newCustomer.assigned_om} onChange={(e) => setNewCustomer({ ...newCustomer, assigned_om: e.target.value })} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500">
                  <option value="">Select OM...</option>
                  {omUsers.map(om => <option key={om.id} value={om.name}>{om.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowAddCustomer(false)} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">Add Customer</button>
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
              <h3 className="text-xl font-semibold">Manage Onboarding Managers</h3>
              <button onClick={() => setShowOMManager(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <div className="space-y-2 mb-6">
              {omUsers.map(om => (
                <div key={om.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm ${om.role === 'admin' ? 'bg-purple-500' : 'bg-blue-500'}`}>
                      {om.role === 'admin' ? <Shield size={14} /> : om.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{om.name}</p>
                      <p className="text-xs text-gray-500">{om.email} • {om.customer_count} customers</p>
                    </div>
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
                <h4 className="font-medium text-gray-900">Add New OM</h4>
                <input type="text" placeholder="Name" value={newOM.name} onChange={(e) => setNewOM({ ...newOM, name: e.target.value })} required className="w-full px-3 py-2 border rounded-lg text-sm" />
                <input type="email" placeholder="Email" value={newOM.email} onChange={(e) => setNewOM({ ...newOM, email: e.target.value })} required className="w-full px-3 py-2 border rounded-lg text-sm" />
                <p className="text-xs text-gray-500">Note: Create a user in Supabase Auth with this email for them to log in.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setShowAddOM(false); setNewOM({ email: '', name: '' }); }} className="flex-1 px-3 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                  <button type="submit" className="flex-1 px-3 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">Add OM</button>
                </div>
              </form>
            ) : (
              <button onClick={() => setShowAddOM(true)} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-500 hover:text-blue-500 flex items-center justify-center gap-2">
                <UserPlus size={18} />Add New Onboarding Manager
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
