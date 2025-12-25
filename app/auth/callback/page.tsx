'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    handleCallback();
  }, []);

  async function handleCallback() {
    try {
      // Get the current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error('Auth callback error:', userError);
        router.push('/login');
        return;
      }

      console.log('Auth callback - User confirmed:', user.email);

      // Check if profile is complete
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', user.id)
        .single();

      console.log('Auth callback - Profile:', profile);

      if (!profile || !profile.onboarding_completed) {
        console.log('Auth callback - Profile incomplete, going to complete-profile');
        router.push('/complete-profile');
      } else {
        console.log('Auth callback - Profile complete, going to dashboard');
        router.push('/dashboard');
      }
    } catch (err) {
      console.error('Auth callback error:', err);
      router.push('/login');
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
      <div className="text-white text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
        <p className="text-xl">Confirming your email...</p>
      </div>
    </div>
  );
}