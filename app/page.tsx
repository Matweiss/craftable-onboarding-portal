'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [debug, setDebug] = useState('')

  // Check if already logged in
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setDebug(`Already logged in as: ${session.user.email}`)
        // Check if admin
        const { data: adminData } = await supabase
          .from('admin_users')
          .select('*')
          .eq('email', session.user.email)
          .single()
        
        if (adminData) {
          window.location.href = '/admin'
        } else {
          window.location.href = '/dashboard'
        }
      }
    }
    checkSession()
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')
    setDebug('')

    try {
      setDebug('Attempting login...')
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })

      if (error) {
        setMessage(error.message)
        setDebug(`Auth error: ${JSON.stringify(error)}`)
        setLoading(false)
        return
      }

      if (data.session) {
        setDebug(`Login successful! User: ${data.session.user.email}`)
        
        // Check if admin
        const { data: adminData, error: adminError } = await supabase
          .from('admin_users')
          .select('*')
          .eq('email', email.trim().toLowerCase())
          .single()

        setDebug(prev => prev + ` | Admin check: ${adminData ? 'IS ADMIN' : 'NOT ADMIN'} | Error: ${adminError?.message || 'none'}`)

        // Use window.location for hard redirect (ensures session is saved)
        if (adminData) {
          setDebug(prev => prev + ' | Redirecting to /admin...')
          window.location.href = '/admin'
        } else {
          setDebug(prev => prev + ' | Redirecting to /dashboard...')
          window.location.href = '/dashboard'
        }
      } else {
        setMessage('Login failed - no session created')
        setDebug('No session in response')
      }
    } catch (err) {
      setMessage('Unexpected error')
      setDebug(`Catch: ${err}`)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 to-blue-600">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800">craftable</h1>
          <p className="text-gray-500 mt-2">Onboarding Portal</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@restaurant.com"
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-600 transition-all disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {message && (
          <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg text-center text-sm">
            {message}
          </div>
        )}

        {debug && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800 break-all">
            <strong>Debug:</strong> {debug}
          </div>
        )}

        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <p className="text-xs font-medium text-gray-500 mb-2">Test Accounts:</p>
          <p className="text-xs text-gray-400">Admin: mat@craftable.com</p>
          <p className="text-xs text-gray-400">Customer: owner@usburgershack.com</p>
          <p className="text-xs text-gray-400">Password: test1234</p>
        </div>
      </div>
    </div>
  )
}
