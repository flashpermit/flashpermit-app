'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

interface Permit {
  id: string;
  created_at: string;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  installation_type: string;
  contractor_name: string;
  contractor_phone: string;
  roc_license_number: string;
  workflow_status: string;
  bot_attempts: number;
  bot_error: string | null;
  portal_permit_number: string | null;
  valuation_cost: number;
  equipment_tonnage: number;
  manufacturer: string;
  model_number: string;
}

// Modal Component using Portal
function Modal({ permit, onClose, onSubmit, manualEntry, setManualEntry }: any) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  if (!mounted) return null;

  const modalContent = (
    <div 
      className="fixed inset-0 flex items-center justify-center p-4" 
      style={{ 
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Permit Details</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-3xl leading-none hover:bg-gray-100 rounded px-2"
            >
              ×
            </button>
          </div>

          {/* Permit Info Grid */}
          <div className="space-y-4 mb-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500 font-medium mb-1">Address</p>
                <p className="font-semibold text-gray-900">{permit.street_address}</p>
                <p className="text-gray-700">{permit.city}, {permit.state} {permit.zip_code}</p>
              </div>
              <div>
                <p className="text-gray-500 font-medium mb-1">Contractor</p>
                <p className="font-semibold text-gray-900">{permit.contractor_name}</p>
                <p className="text-gray-600">{permit.contractor_phone}</p>
                <p className="text-gray-600">ROC: {permit.roc_license_number}</p>
              </div>
              <div>
                <p className="text-gray-500 font-medium mb-1">Installation Type</p>
                <p className="font-semibold text-gray-900 capitalize">
                  {permit.installation_type?.replace(/-/g, ' ')}
                </p>
              </div>
              <div>
                <p className="text-gray-500 font-medium mb-1">Equipment</p>
                <p className="font-semibold text-gray-900">{permit.manufacturer}</p>
                <p className="text-gray-600">Model: {permit.model_number}</p>
              </div>
              <div>
                <p className="text-gray-500 font-medium mb-1">Tonnage</p>
                <p className="font-semibold text-gray-900">{permit.equipment_tonnage} tons</p>
              </div>
              <div>
                <p className="text-gray-500 font-medium mb-1">Valuation</p>
                <p className="font-semibold text-gray-900">${permit.valuation_cost}</p>
              </div>
            </div>
          </div>

          {/* Manual Entry Form */}
          {permit.workflow_status === 'pending_admin' && (
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-900">Manual Permit Entry</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Portal Permit Number *
                  </label>
                  <input
                    type="text"
                    value={manualEntry.permitNumber}
                    onChange={(e) => setManualEntry({ ...manualEntry, permitNumber: e.target.value })}
                    placeholder="CTR-2024-XXXXX"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes (optional)
                  </label>
                  <textarea
                    value={manualEntry.notes}
                    onChange={(e) => setManualEntry({ ...manualEntry, notes: e.target.value })}
                    placeholder="Any notes about this submission..."
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                  />
                </div>
                <button
                  onClick={() => onSubmit(permit.id)}
                  disabled={!manualEntry.permitNumber.trim()}
                  className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  ✅ Mark as Submitted
                </button>
              </div>
            </div>
          )}

          {/* Close Button */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default function AdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [permits, setPermits] = useState<Permit[]>([]);
  const [selectedPermit, setSelectedPermit] = useState<Permit | null>(null);
  const [processingPermitId, setProcessingPermitId] = useState<string | null>(null);
  const [manualEntry, setManualEntry] = useState({ permitNumber: '', notes: '' });
  const [filter, setFilter] = useState<'pending_admin' | 'bot_processing' | 'all'>('pending_admin');

  useEffect(() => {
    checkAuth();
    loadPermits();
  }, [filter]);

  async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }
  }

  async function loadPermits() {
    setLoading(true);
    try {
      let query = supabase
        .from('permits')
        .select('*')
        .order('created_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('workflow_status', filter);
      } else {
        query = query.in('workflow_status', ['pending_admin', 'bot_processing', 'admin_processing']);
      }

      const { data, error } = await query;

      if (error) throw error;
      setPermits(data || []);
    } catch (error: any) {
      console.error('Error loading permits:', error);
      alert('Failed to load permits');
    } finally {
      setLoading(false);
    }
  }

  async function triggerBot(permitId: string) {
    if (!confirm('Start bot submission for this permit?')) return;

    setProcessingPermitId(permitId);
    
    try {
      const response = await fetch('/api/admin/trigger-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permitId }),
      });

      const result = await response.json();

      if (result.success) {
        alert(`Bot started! Run: npx tsx scripts/process-bot-queue.ts --permit-id ${permitId}`);
        loadPermits();
      } else {
        alert(`Bot failed: ${result.error}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setProcessingPermitId(null);
    }
  }

  async function completeManually(permitId: string) {
    if (!manualEntry.permitNumber.trim()) {
      alert('Please enter permit number');
      return;
    }

    if (!confirm('Mark this permit as manually submitted?')) return;

    try {
      const response = await fetch('/api/admin/complete-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          permitId,
          permitNumber: manualEntry.permitNumber,
          notes: manualEntry.notes,
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert('Permit marked as submitted!');
        setSelectedPermit(null);
        setManualEntry({ permitNumber: '', notes: '' });
        loadPermits();
      } else {
        alert(`Failed: ${result.error}`);
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  }

  function getStatusBadge(status: string) {
    const styles: Record<string, string> = {
      pending_admin: 'bg-yellow-100 text-yellow-800',
      bot_processing: 'bg-blue-100 text-blue-800',
      admin_processing: 'bg-purple-100 text-purple-800',
      submitted: 'bg-green-100 text-green-800',
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading permits...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gray-100">
        {/* Header */}
        <div className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
                <p className="text-gray-600 mt-1">Manage permit submissions</p>
              </div>
              <button
                onClick={() => router.push('/dashboard')}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                ← Back to Dashboard
              </button>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <div className="flex gap-2">
              <button
                onClick={() => setFilter('pending_admin')}
                className={`px-4 py-2 rounded-lg font-medium ${
                  filter === 'pending_admin'
                    ? 'bg-yellow-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Pending ({permits.filter(p => p.workflow_status === 'pending_admin').length})
              </button>
              <button
                onClick={() => setFilter('bot_processing')}
                className={`px-4 py-2 rounded-lg font-medium ${
                  filter === 'bot_processing'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Processing ({permits.filter(p => p.workflow_status === 'bot_processing').length})
              </button>
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-lg font-medium ${
                  filter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              <button
                onClick={loadPermits}
                className="ml-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          {/* Permits Grid */}
          <div className="grid grid-cols-1 gap-6">
            {permits.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <p className="text-gray-500 text-lg">No permits to display</p>
              </div>
            ) : (
              permits.map((permit) => (
                <div
                  key={permit.id}
                  className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow"
                >
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-xl font-bold text-gray-900">
                            {permit.street_address}
                          </h3>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(permit.workflow_status)}`}>
                            {permit.workflow_status.replace(/_/g, ' ').toUpperCase()}
                          </span>
                        </div>
                        <p className="text-gray-600">
                          {permit.city}, {permit.state} {permit.zip_code}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-500">
                          {new Date(permit.created_at).toLocaleDateString()}
                        </p>
                        <p className="text-sm text-gray-500">
                          {new Date(permit.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>

                    {/* Permit Details Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
                      <div>
                        <p className="text-gray-500">Type</p>
                        <p className="font-medium text-gray-900">{permit.installation_type}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Contractor</p>
                        <p className="font-medium text-gray-900">{permit.contractor_name}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Equipment</p>
                        <p className="font-medium text-gray-900">
                          {permit.manufacturer} {permit.model_number}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Valuation</p>
                        <p className="font-medium text-gray-900">${permit.valuation_cost}</p>
                      </div>
                    </div>

                    {/* Bot Attempts & Error */}
                    {permit.bot_attempts > 0 && (
                      <div className="mb-4 p-3 bg-yellow-50 rounded-lg">
                        <p className="text-sm text-yellow-800">
                          🤖 Bot attempts: {permit.bot_attempts}
                        </p>
                        {permit.bot_error && (
                          <p className="text-sm text-red-600 mt-1">Error: {permit.bot_error}</p>
                        )}
                      </div>
                    )}

                    {/* Permit Number */}
                    {permit.portal_permit_number && (
                      <div className="mb-4 p-3 bg-green-50 rounded-lg">
                        <p className="text-sm text-green-800">
                          ✅ Permit #: {permit.portal_permit_number}
                        </p>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                      <button
                        onClick={() => setSelectedPermit(permit)}
                        className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
                      >
                        📋 View Details
                      </button>
                      
                      {permit.workflow_status === 'pending_admin' && (
                        <>
                          <button
                            onClick={() => triggerBot(permit.id)}
                            disabled={processingPermitId === permit.id}
                            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                          >
                            {processingPermitId === permit.id ? '⏳ Starting...' : '🤖 Submit to Phoenix'}
                          </button>
                          <button
                            onClick={() => {
                              setSelectedPermit(permit);
                              setManualEntry({ permitNumber: '', notes: '' });
                            }}
                            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                          >
                            ✍️ Manual Entry
                          </button>
                        </>
                      )}

                      {permit.workflow_status === 'bot_processing' && (
                        <div className="flex-1 px-4 py-2 bg-blue-100 text-blue-800 rounded-lg text-center font-medium">
                          ⏳ Bot is processing...
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal using React Portal */}
      {selectedPermit && (
        <Modal
          permit={selectedPermit}
          onClose={() => {
            setSelectedPermit(null);
            setManualEntry({ permitNumber: '', notes: '' });
          }}
          onSubmit={completeManually}
          manualEntry={manualEntry}
          setManualEntry={setManualEntry}
        />
      )}
    </>
  );
}