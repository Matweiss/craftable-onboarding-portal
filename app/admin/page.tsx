'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, Customer, Task, CustomerProgress } from '@/lib/supabase'
import { Users, CheckCircle2, Clock, AlertTriangle, ChevronRight, LogOut, Plus, Search } from 'lucide-react'

interface CustomerWithProgress extends Customer {
  progress: {
    completed: number
    total: number
    percentage: number
    lastActivity: string | null
  }
}

export default function AdminDashboard() {
  const router = useRouter()
  const [customers, setCustomers] = useState<CustomerWithProgress[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterPhase, setFilterPhase] = useState<number | 'all'>('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', company: '' })

  useEffect(() => {
    checkAdminAndLoadData()
  }, [])

  const checkAdminAndLoadData = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      router.push('/')
      return
    }

    // Verify admin status
    const { data: adminData, error: adminError } = await supabase
      .from('admin_users')
      .select('*')
      .eq('email', session.user.email)
      .single()

    if (adminError || !adminData) {
      router.push('/dashboard')
      return
    }

    await loadData()
  }

  const loadData = async () => {
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

    if (tasksData) setTasks(tasksData)

    // Get all progress
    const { data: progressData } = await supabase
      .from('customer_progress')
      .select('*')

    // Calculate progress for each customer
    const customersWithProgress: CustomerWithProgress[] = (customersData || []).map(customer => {
      const customerProgress = progressData?.filter(p => p.customer_id === customer.id) || []
      const completed = customerProgress.filter(p => p.completed).length
      const total = customerProgress.length
      const lastCompleted = customerProgress
        .filter(p => p.completed && p.completed_at)
        .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())[0]

      return {
        ...customer,
        progress: {
          completed,
          total,
          percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
          lastActivity: lastCompleted?.completed_at || null
        }
      }
    })

    setCustomers(customersWithProgress)
    setLoading(false)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const addCustomer = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const { error } = await supabase
      .from('customers')
      .insert({
        name: newCustomer.name,
        email: newCustomer.email,
        company: newCustomer.company || newCustomer.name,
        assigned_om: 'Mat'
      })

    if (!error) {
      setShowAddModal(false)
      setNewCustomer({ name: '', email: '', company: '' })
      await loadData()
    }
  }

  const filteredCustomers = customers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         c.email.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesPhase = filterPhase === 'all' || c.current_phase === filterPhase
    return matchesSearch && matchesPhase
  })

  const stats = {
    total: customers.length,
    active: customers.filter(c => c.progress.percentage > 0 && c.progress.percentage < 100).length,
    completed: customers.filter(c => c.progress.percentage === 100).length,
    stuck: customers.filter(c => {
      if (!c.progress.lastActivity) return c.progress.percentage > 0
      const daysSince = (Date.now() - new Date(c.progress.lastActivity).getTime()) / (1000 * 60 * 60 * 24)
      return daysSince > 7 && c.progress.percentage < 100
    }).length
  }

  const getProgressColor = (percentage: number) => {
    if (percentage === 100) return 'bg-craftable-green'
    if (percentage >= 60) return 'bg-craftable-blue'
    if (percentage >= 30) return 'bg-craftable-orange'
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-craftable-blue"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-craftable-navy text-white">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">craftable</h1>
            <p className="text-sm text-blue-200">Admin Dashboard</p>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Users className="w-6 h-6 text-craftable-blue" />
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
                <Clock className="w-6 h-6 text-craftable-orange" />
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
                <CheckCircle2 className="w-6 h-6 text-craftable-green" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.completed}</p>
                <p className="text-sm text-gray-500">Completed</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-craftable-coral" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.stuck}</p>
                <p className="text-sm text-gray-500">Needs Attention</p>
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
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-craftable-blue focus:border-transparent"
            />
          </div>

          <select
            value={filterPhase === 'all' ? 'all' : filterPhase}
            onChange={(e) => setFilterPhase(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
            className="px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-craftable-blue"
          >
            <option value="all">All Phases</option>
            <option value="0">Phase 0</option>
            <option value="1">Phase 1</option>
            <option value="2">Phase 2</option>
            <option value="3">Phase 3</option>
            <option value="4">Phase 4</option>
          </select>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-6 py-3 bg-craftable-blue text-white rounded-lg hover:bg-opacity-90 transition-all"
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
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Last Activity</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Assigned OM</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500"></th>
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
                      <div className="w-32 bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full ${getProgressColor(customer.progress.percentage)} transition-all`}
                          style={{ width: `${customer.progress.percentage}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-700">
                        {customer.progress.percentage}%
                      </span>
                      <span className="text-xs text-gray-400">
                        ({customer.progress.completed}/{customer.progress.total})
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-sm ${
                      customer.progress.lastActivity && 
                      (Date.now() - new Date(customer.progress.lastActivity).getTime()) / (1000 * 60 * 60 * 24) > 7
                        ? 'text-craftable-coral font-medium'
                        : 'text-gray-500'
                    }`}>
                      {formatDate(customer.progress.lastActivity)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-700">{customer.assigned_om}</span>
                  </td>
                  <td className="px-6 py-4">
                    <button className="p-2 text-gray-400 hover:text-craftable-blue hover:bg-blue-50 rounded-lg transition-all">
                      <ChevronRight size={20} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredCustomers.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No customers found matching your criteria.
            </div>
          )}
        </div>
      </main>

      {/* Add Customer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Add New Customer</h3>
            
            <form onSubmit={addCustomer} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer Name *
                </label>
                <input
                  type="text"
                  required
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-craftable-blue"
                  placeholder="US Burger Shack"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  required
                  value={newCustomer.email}
                  onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-craftable-blue"
                  placeholder="owner@restaurant.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company
                </label>
                <input
                  type="text"
                  value={newCustomer.company}
                  onChange={(e) => setNewCustomer({ ...newCustomer, company: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-craftable-blue"
                  placeholder="US Burger Shack LLC"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-craftable-blue text-white rounded-lg hover:bg-opacity-90 transition-all"
                >
                  Add Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
