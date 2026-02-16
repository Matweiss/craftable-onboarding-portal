'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const handleAuthCallback = async () => {
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (error) {
        console.error('Auth error:', error)
        router.push('/')
        return
      }

      if (session) {
        // Check if user is admin
        const { data: adminData } = await supabase
          .from('admin_users')
          .select('*')
          .eq('email', session.user.email)
          .single()

        if (adminData) {
          router.push('/admin')
        } else {
          router.push('/dashboard')
        }
      } else {
        router.push('/')
      }
    }

    handleAuthCallback()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-craftable-blue mx-auto"></div>
        <p className="mt-4 text-gray-600">Signing you in...</p>
      </div>
    </div>
  )
}
