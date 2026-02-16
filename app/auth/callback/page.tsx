'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handleAuthCallback = async () => {
      const code = searchParams.get('code')
      
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        
        if (exchangeError) {
          console.error('Auth exchange error:', exchangeError)
          setError(exchangeError.message)
          return
        }
      }

      // Get session after exchange
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError) {
        console.error('Session error:', sessionError)
        setError(sessionError.message)
        return
      }

      if (session?.user?.email) {
        // Check if user is admin
        const { data: adminData, error: adminError } = await supabase
          .from('admin_users')
          .select('*')
          .eq('email', session.user.email)
          .maybeSingle()

        if (adminError) {
          console.error('Admin check error:', adminError)
        }

        // Refresh router cache before redirect
        router.refresh()
        
        if (adminData) {
          window.location.href = '/admin'
        } else {
          window.location.href = '/dashboard'
        }
      } else {
        setError('No session found after authentication')
      }
    }

    handleAuthCallback()
  }, [router, searchParams])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8 bg-white rounded-lg shadow-lg">
          <h1 className="text-red-600 text-xl font-bold mb-4">Authentication Error</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={() => router.push('/')}
            className="bg-craftable-blue text-white px-4 py-2 rounded hover:opacity-90"
          >
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-craftable-blue mx-auto"></div>
        <p className="mt-4 text-gray-600">Completing sign in...</p>
      </div>
    </div>
  )
}
