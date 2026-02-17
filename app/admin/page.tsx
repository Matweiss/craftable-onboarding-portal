'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, Customer, Task, CustomerProgress } from '@/lib/supabase'
import { 
  Users, CheckCircle2, Clock, AlertTriangle, LogOut, Plus, Search,
  ChevronRight, ChevronDown, ChevronUp, X, Check, MessageSquare,
  Send, FileText, Download, UserPlus, Settings, Eye, Shield
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

export default function AdminDashboard() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<{ email: string; name: string; role: string } | null>(null)
  const [customers, setCustomers] = useState<CustomerWithProgress[]>([])
  const [omUsers, setOmUsers] = useState<OMUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // UI State
  const [searchQuery, setSearchQuery] = useState('')
  const [filterOM, setFilterOM] = useState<string>('all')
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [showAddOM, setShowAddOM] = useState(false)
  const [showOMManager, setShowOMManager] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithProgress | null>(null)
  const [customerTasks, setCustomerTasks] = useState<ProgressWithTask[]>([])
  const [expandedPhases, setExpandedPhases] = useState<number[]>([0, 1, 2, 3, 4])
  
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
    // Get all admin/OM users
    const { data: adminsData } = await supabase
      .from('admin_users')
      .select('*')
      .order('created_at')

    // Get all customers
    const { data: customersData } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false })

    // Get all tasks
    const { data: tasksData } = await supabase
      .from('tasks')
      .select('*')
      .order('sort_order')

    // Get all progress
    const { data: progressData } = await supabase
      .from('customer_progress')
      .select('*')

    // Get all comments
    const { data: commentsData } = await supabase
      .from('task_comments')
      .select('*')
      .order('created_at', { ascending: false })

    // Calculate customer counts for each OM
    const omWithCounts = (adminsData || []).map(admin => ({
      ...admin,
      customer_count: (customersData || []).filter(c => c.assigned_om === admin.name).length
    }))
    setOmUsers(omWithCounts)

    // Calculate progress for each customer
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
        progress: {
          completed,
          verified,
          total,
          percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
          lastActivity: lastCompleted?.completed_at || null
        },
        pendingVerification,
        unreadComments
      }
    })

    setCustomers(customersWithProgress)
    setLoading(false)
  }

  const loadCustomerDetails = async (customer: CustomerWithProgress) => {
    setSelectedCustomer(customer)
    
    // Get tasks with progress and comments for this customer
    const { data: tasksData } = await supabase
      .from('tasks')
      .select('*')
      .order('sort_order')

    const { data: progressData } = await supabase
      .from('customer_progress')
      .select('*')
      .eq('customer_id', customer.id)

    const { data: commentsData } = await supabase
      .from('task_comments')
      .select('*')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: true })

    const tasksWithProgress: ProgressWithTask[] = (tasksData || []).map(task => {
      const progress = progressData?.find(p => p.task_id === task.id)
      const comments = commentsData?.filter(c => progress && c.progress_id === progress.id) || []
      
      return {
        ...progress!,
        task,
        comments
      }
    }).filter(t => t.id) // Only include tasks with progress records

    setCustomerTasks(tasksWithProgress)
  }

  const verifyTask = async (progressId: string) => {
    if (!currentUser) return

    await supabase
      .from('customer_progress')
      .update({
        verified: true,
        verified_at: new Date().toISOString(),
        verified_by: currentUser.name
      })
      .eq('id', progressId)

    if (selectedCustomer) {
      await loadCustomerDetails(selectedCustomer)
    }
    await loadData()
  }

  const unverifyTask = async (progressId: string) => {
    await supabase
      .from('customer_progress')
      .update({
        verified: false,
        verified_at: null,
        verified_by: null
      })
      .eq('id', progressId)

    if (selectedCustomer) {
      await loadCustomerDetails(selectedCustomer)
    }
    await loadData()
  }

  const addComment = async (progressId: string, customerId: string) => {
    if (!currentUser || !newComment.trim()) return

    await supabase
      .from('task_comments')
      .insert({
        progress_id: progressId,
        customer_id: customerId,
        author_email: currentUser.email,
        author_name: currentUser.name,
        author_role: currentUser.role,
        message: newComment.trim()
      })

    setNewComment('')
    setReplyingTo(null)
    
    if (selectedCustomer) {
      await loadCustomerDetails(selectedCustomer)
    }
  }

  const addCustomer = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const { error } = await supabase
      .from('customers')
      .insert({
        name: newCustomer.name,
        email: newCustomer.email,
        company: newCustomer.company || newCustomer.name,
        assigned_om: newCustomer.assigned_om || currentUser?.name || 'Unassigned'
      })

    if (!error) {
      setShowAddCustomer(false)
      setNewCustomer({ name: '', email: '', company: '', assigned_om: '' })
      await loadData()
    }
  }

  const addOM = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const { error } = await supabase
      .from('admin_users')
      .insert({
        email: newOM.email.toLowerCase(),
        name: newOM.name,
        role: 'om'
      })

    if (!error) {
      setShowAddOM(false)
      setNewOM({ email: '', name: '' })
      await loadData()
    }
  }

  const updateCustomerOM = async (customerId: string, omName: string) => {
    await supabase
      .from('customers')
      .update({ assigned_om: omName })
      .eq('id', customerId)

    await loadData()
  }

  const deleteOM = async (omId: string) => {
    if (!confirm('Are you sure? This will not reassign their customers.')) return
    
    await supabase
      .from('admin_users')
      .delete()
      .eq('id', omId)

    await loadData()
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const filteredCustomers = customers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         c.email.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesOM = filterOM === 'all' || c.assigned_om === filterOM
    return matchesSearch && matchesOM
  })

  const stats = {
    total: customers.length,
    active: customers.filter(c => c.progress.percentage > 0 && c.progress.percentage < 100).length,
    completed: customers.filter(c => c.progress.percentage === 100).length,
    pendingVerification: customers.reduce((acc, c) => acc + c.pendingVerification, 0),
    unreadComments: customers.reduce((acc, c) => acc + c.unreadComments, 0)
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
      if (!groups[t.task.phase]) {
        groups[t.task.phase] = { name: t.task.phase_name, tasks: [] }
      }
      groups[t.task.phase].tasks.push(t)
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
      <header className="bg-indigo-900 text-white">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">craftable</h1>
            <p className="text-sm text-blue-200">Admin Dashboard</p>
          </div>
          <div className="flex items-center gap-4">
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
            <button
              onClick={handleSignOut}
              className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Users className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                <p className="text-sm text-gray-500">Total Customers</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-orange-100 rounded-lg">
                <Clock className="w-6 h-6 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
                <p className="text-sm text-gray-500">In Progress</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-100 rounded-lg">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.completed}</p>
                <p className="text-sm text-gray-500">Completed</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-yellow-100 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.pendingVerification}</p>
                <p className="text-sm text-gray-500">Needs Verification</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 rounded-lg">
                <MessageSquare className="w-6 h-6 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.unreadComments}</p>
                <p className="text-sm text-gray-500">New Comments</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters & Actions */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search customers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={filterOM}
            onChange={(e) => setFilterOM(e.target.value)}
            className="px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All OMs</option>
            {omUsers.map(om => (
              <option key={om.id} value={om.name}>{om.name} ({om.customer_count})</option>
            ))}
          </select>

          <button
            onClick={() => setShowAddCustomer(true)}
            className="flex items-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
          >
            <Plus size={20} />
            Add Customer
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
                        <div
                          className={`h-full ${getProgressColor(customer.progress.percentage)}`}
                          style={{ width: `${customer.progress.percentage}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">{customer.progress.percentage}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{customer.progress.verified}/{customer.progress.completed}</span>
                      {customer.pendingVerification > 0 && (
                        <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded-full">
                          {customer.pendingVerification} pending
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-500">{formatDate(customer.progress.lastActivity)}</span>
                  </td>
                  <td className="px-6 py-4">
                    <select
                      value={customer.assigned_om}
                      onChange={(e) => updateCustomerOM(customer.id, e.target.value)}
                      className="text-sm border border-gray-200 rounded px-2 py-1"
                    >
                      {omUsers.map(om => (
                        <option key={om.id} value={om.name}>{om.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {customer.unreadComments > 0 && (
                        <span className="w-5 h-5 flex items-center justify-center text-xs bg-purple-500 text-white rounded-full">
                          {customer.unreadComments}
                        </span>
                      )}
                      <button
                        onClick={() => loadCustomerDetails(customer)}
                        className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                      >
                        <Eye size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* Customer Detail Slideout */}
      {selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setSelectedCustomer(null)}>
          <div 
            className="absolute right-0 top-0 h-full w-full max-w-3xl bg-white shadow-xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedCustomer.name}</h2>
                <p className="text-sm text-gray-500">{selectedCustomer.email}</p>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              {/* Progress Summary */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Overall Progress</span>
                  <span className="text-lg font-bold text-blue-500">{selectedCustomer.progress.percentage}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${selectedCustomer.progress.percentage}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-xs text-gray-500">
                  <span>{selectedCustomer.progress.completed} completed</span>
                  <span>{selectedCustomer.progress.verified} verified</span>
                  <span>{selectedCustomer.pendingVerification} pending</span>
                </div>
              </div>

              {/* Tasks by Phase */}
              {groupTasksByPhase(customerTasks).map(([phase, group]) => (
                <div key={phase} className="mb-4">
                  <button
                    onClick={() => setExpandedPhases(prev => 
                      prev.includes(Number(phase)) 
                        ? prev.filter(p => p !== Number(phase))
                        : [...prev, Number(phase)]
                    )}
                    className={`w-full px-4 py-2 flex items-center justify-between text-white rounded-t-lg ${getPhaseColor(Number(phase))}`}
                  >
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
                                {item.completed && !item.verified && (
                                  <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded-full">
                                    Needs Verification
                                  </span>
                                )}
                                {item.verified && (
                                  <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full flex items-center gap-1">
                                    <Check size={12} /> Verified
                                  </span>
                                )}
                              </div>
                              
                              {/* Timestamps */}
                              {item.completed_at && (
                                <p className="text-xs text-gray-500 mt-1">
                                  Completed: {new Date(item.completed_at).toLocaleString()}
                                  {item.verified_at && (
                                    <span className="ml-2">• Verified: {new Date(item.verified_at).toLocaleString()} by {item.verified_by}</span>
                                  )}
                                </p>
                              )}

                              {/* Files */}
                              {item.files && (item.files as any[]).length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {(item.files as any[]).map((file, idx) => (
                                    <a
                                      key={idx}
                                      href={file.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                                    >
                                      <Download size={12} />
                                      {file.name}
                                    </a>
                                  ))}
                                </div>
                              )}

                              {/* Comments */}
                              {item.comments.length > 0 && (
                                <div className="mt-3 space-y-2">
                                  {item.comments.map((comment) => (
                                    <div
                                      key={comment.id}
                                      className={`p-2 rounded text-sm ${
                                        comment.author_role === 'customer' ? 'bg-gray-100' : 'bg-blue-50'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="font-medium text-xs">{comment.author_name}</span>
                                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                                          comment.author_role === 'customer' ? 'bg-gray-200' : 'bg-blue-200'
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

                              {/* Reply Box */}
                              {replyingTo === item.id ? (
                                <div className="mt-2 flex gap-2">
                                  <input
                                    type="text"
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    placeholder="Write a reply..."
                                    className="flex-1 text-sm p-2 border rounded-lg"
                                    onKeyDown={(e) => e.key === 'Enter' && addComment(item.id, selectedCustomer.id)}
                                  />
                                  <button
                                    onClick={() => addComment(item.id, selectedCustomer.id)}
                                    className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                                  >
                                    <Send size={16} />
                                  </button>
                                  <button
                                    onClick={() => { setReplyingTo(null); setNewComment(''); }}
                                    className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                                  >
                                    <X size={16} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setReplyingTo(item.id)}
                                  className="mt-2 text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1"
                                >
                                  <MessageSquare size={12} /> Reply
                                </button>
                              )}
                            </div>

                            {/* Verification Button */}
                            {item.completed && (
                              <div>
                                {item.verified ? (
                                  <button
                                    onClick={() => unverifyTask(item.id)}
                                    className="px-3 py-1.5 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
                                  >
                                    Unverify
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => verifyTask(item.id)}
                                    className="px-3 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-1"
                                  >
                                    <Check size={14} /> Verify
                                  </button>
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
                <input
                  type="text"
                  required
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={newCustomer.email}
                  onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                <input
                  type="text"
                  value={newCustomer.company}
                  onChange={(e) => setNewCustomer({ ...newCustomer, company: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assign to OM</label>
                <select
                  value={newCustomer.assigned_om}
                  onChange={(e) => setNewCustomer({ ...newCustomer, assigned_om: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select OM...</option>
                  {omUsers.map(om => (
                    <option key={om.id} value={om.name}>{om.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddCustomer(false)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button type="submit" className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                  Add Customer
                </button>
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
              <button onClick={() => setShowOMManager(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            {/* Current OMs */}
            <div className="space-y-2 mb-6">
              {omUsers.map(om => (
                <div key={om.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm ${
                      om.role === 'admin' ? 'bg-purple-500' : 'bg-blue-500'
                    }`}>
                      {om.role === 'admin' ? <Shield size={14} /> : om.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{om.name}</p>
                      <p className="text-xs text-gray-500">{om.email} • {om.customer_count} customers</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-xs rounded ${
                      om.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {om.role}
                    </span>
                    {om.role !== 'admin' && (
                      <button
                        onClick={() => deleteOM(om.id)}
                        className="p-1 text-red-500 hover:bg-red-50 rounded"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Add New OM */}
            {showAddOM ? (
              <form onSubmit={addOM} className="space-y-3 p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-gray-900">Add New OM</h4>
                <input
                  type="text"
                  placeholder="Name"
                  value={newOM.name}
                  onChange={(e) => setNewOM({ ...newOM, name: e.target.value })}
                  required
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={newOM.email}
                  onChange={(e) => setNewOM({ ...newOM, email: e.target.value })}
                  required
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
                <p className="text-xs text-gray-500">
                  Note: They'll need to create a login with this email in Supabase Auth to access the portal.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowAddOM(false); setNewOM({ email: '', name: '' }); }}
                    className="flex-1 px-3 py-2 border rounded-lg text-sm hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="flex-1 px-3 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">
                    Add OM
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setShowAddOM(true)}
                className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-500 hover:text-blue-500 flex items-center justify-center gap-2"
              >
                <UserPlus size={18} />
                Add New Onboarding Manager
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
