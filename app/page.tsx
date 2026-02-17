'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)
  const [usePassword, setUsePassword] = useState(true)

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setMessage(error.message)
      setIsSuccess(false)
      setLoading(false)
      return
    }

    if (data.session) {
      const { data: adminData } = await supabase
        .from('admin_users')
        .select('*')
        .eq('email', email)
        .single()

      if (adminData) {
        router.push('/admin')
      } else {
        router.push('/dashboard')
      }
    }
    setLoading(false)
  }

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setMessage(error.message)
      setIsSuccess(false)
    } else {
      setMessage('Check your email for the login link!')
      setIsSuccess(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-craftable-navy to-craftable-blue">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-craftable-navy">craftable</h1>
          <p className="text-gray-500 mt-2">Onboarding Portal</p>
        </div>

        <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
          <button
            type="button"
            onClick={() => setUsePassword(true)}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
              usePassword
                ? 'bg-white shadow text-craftable-navy'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Password
          </button>
          <button
            type="button"
            onClick={() => setUsePassword(false)}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
              !usePassword
                ? 'bg-white shadow text-craftable-navy'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Magic Link
          </button>
        </div>

        <form onSubmit={usePassword ? handlePasswordLogin : handleMagicLink} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@restaurant.com"
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-craftable-blue focus:border-transparent transition-all"
            />
          </div>

          {usePassword && (
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-craftable-blue focus:border-transparent transition-all"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-craftable-blue text-white py-3 px-4 rounded-lg font-medium hover:bg-opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : usePassword ? 'Sign In' : 'Send Magic Link'}
          </button>
        </form>

        {message && (
          <div className={`mt-4 p-4 rounded-lg text-center text-sm ${
            isSuccess ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {message}
          </div>
        )}

        <p className="mt-6 text-center text-sm text-gray-500">
          {usePassword 
            ? 'Enter your email and password to sign in.'
            : "We'll send you a magic link. No password needed."
          }
        </p>

        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <p className="text-xs font-medium text-gray-500 mb-2">Test Accounts:</p>
          <p className="text-xs text-gray-400">Admin: mat@craftable.com</p>
          <p className="text-xs text-gray-400">Customer: owner@usburgershack.com</p>
          <p className="text-xs text-gray-400">Password: Craftable123!</p>
        </div>
      </div>
    </div>
  )
}
