'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/supabase';

interface Permit {
  id: string;
  manufacturer: string | null;
  model_number: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  status: string;
  permit_type: string | null;
  work_type: string | null;
  created_at: string;
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [permits, setPermits] = useState<Permit[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (searchParams.get('success') === 'permit_created') {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 5000);
    }
    checkUser();
  }, [searchParams]);

  async function checkUser() {
    try {
      console.log('Dashboard - Starting checkUser');
      
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      console.log('Dashboard - User:', user);
      console.log('Dashboard - User Error:', userError);

      if (userError || !user) {
        console.log('Dashboard - No user found, waiting and trying again...');
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const { data: { user: retryUser } } = await supabase.auth.getUser();
        
        if (!retryUser) {
          console.log('Dashboard - Still no user after retry, redirecting to login');
          router.push('/login');
          return;
        }
        
        console.log('Dashboard - Got user on retry:', retryUser);
        await loadUserData(retryUser.id);
      } else {
        console.log('Dashboard - Got user immediately:', user);
        await loadUserData(user.id);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error checking user:', err);
      router.push('/login');
    }
  }

 async function loadUserData(userId: string) {
  console.log('Dashboard - Loading data for user:', userId);
  
  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (profileError) {
    console.error('Error fetching profile:', profileError);
  } else {
    console.log('Dashboard - Profile loaded:', profileData);
    
    // ADD THIS CHECK:
    if (!profileData || !profileData.onboarding_completed) {
      console.log('Dashboard - Profile incomplete, redirecting to complete-profile');
      router.push('/complete-profile');
      return; // Stop loading other data
    }
    
    setProfile(profileData);
  }

  // Only load permits if profile is complete
  const { data: permitsData, error: permitsError } = await supabase
    .from('permits')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (permitsError) {
    console.error('Error fetching permits:', permitsError);
  } else {
    console.log('Dashboard - Permits loaded:', permitsData?.length || 0);
    setPermits(permitsData || []);
  }
}

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'submitted': return 'bg-blue-100 text-blue-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft': return '📝';
      case 'submitted': return '🚀';
      case 'approved': return '✅';
      case 'rejected': return '❌';
      default: return '📄';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800">
      <nav className="bg-blue-900/50 backdrop-blur-sm border-b border-blue-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex items-center justify-center w-10 h-10 bg-yellow-400 rounded-full mr-3">
                <svg className="w-6 h-6 text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-white text-xl font-bold">FlashPermit</span>
            </div>
            <button
              onClick={handleLogout}
              className="text-blue-200 hover:text-white text-sm font-medium"
            >
              Log Out
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {showSuccess && (
          <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg flex items-center mb-6 shadow-lg">
            <span className="text-2xl mr-3">✅</span>
            <span className="font-medium">Permit created successfully!</span>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-xl p-8 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome back, {profile?.full_name || 'Contractor'}! 👋
          </h1>
          <p className="text-gray-600">
            {profile?.company_name && `${profile.company_name} • `}
            {permits.length === 0 
              ? "Ready to file your first permit?" 
              : `You have ${permits.length} permit${permits.length !== 1 ? 's' : ''} in the system.`}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="text-sm text-gray-600 mb-1">Total Permits</div>
            <div className="text-3xl font-bold text-blue-600">
              {permits.length}
            </div>
            <div className="text-sm text-gray-500">All Time</div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="text-sm text-gray-600 mb-1">Draft Permits</div>
            <div className="text-3xl font-bold text-yellow-600">
              {permits.filter(p => p.status === 'draft').length}
            </div>
            <div className="text-sm text-gray-500">Ready to Submit</div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="text-sm text-gray-600 mb-1">Subscription</div>
            <div className="text-3xl font-bold text-green-600 capitalize">
              {profile?.subscription_tier || 'Starter'}
            </div>
            <div className="text-sm text-gray-500">Current Plan</div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-xl p-8 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Quick Actions</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => router.push('/permit/new')}
              className="w-full bg-blue-600 text-white py-4 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center"
            >
              <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Submit New Permit
            </button>

            <Link href="/upload">
              <button className="w-full bg-gray-100 text-gray-700 py-4 px-6 rounded-lg font-semibold hover:bg-gray-200 transition-colors flex items-center justify-center">
                <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Upload Equipment Photo
              </button>
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-xl font-semibold text-gray-900">Recent Permits</h3>
          </div>

          {permits.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-gray-400 mb-4">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">No permits yet</h3>
              <p className="text-gray-500 mb-6">
                Submit your first permit to get started!
              </p>
              <button
                onClick={() => router.push('/permit/new')}
                className="bg-blue-600 text-white py-3 px-8 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                Get Started
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {permits.slice(0, 5).map((permit) => (
                <div
                  key={permit.id}
                  className="p-6 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => router.push(`/permit/${permit.id}`)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className="text-2xl">{getStatusIcon(permit.status)}</span>
                        <h4 className="text-lg font-semibold text-gray-900">
                          {permit.manufacturer || 'Unknown'} {permit.model_number || ''}
                        </h4>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(permit.status)}`}>
                          {permit.status?.toUpperCase()}
                        </span>
                      </div>
                      <div className="space-y-1 text-sm text-gray-600">
                        <p>
                          📍 {permit.street_address}, {permit.city}, {permit.state}
                        </p>
                        <p>
                          🔧 {permit.permit_type 
                              ? permit.permit_type.charAt(0).toUpperCase() + permit.permit_type.slice(1) 
                              : 'Unknown'} • {permit.work_type?.replace('-', ' ') || 'Unknown'}
                        </p>
                        <p>
                          📅 {new Date(permit.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="ml-4">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}