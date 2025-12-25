'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function PermitDetailPage() {
  const router = useRouter();
  const params = useParams();
  const permitId = params.id as string;
  
  const [permit, setPermit] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPermit();
  }, [permitId]);

  async function loadPermit() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/login');
        return;
      }

      const { data, error } = await supabase
        .from('permits')
        .select('*')
        .eq('id', permitId)
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      
      setPermit(data);
      setLoading(false);
    } catch (err: any) {
      console.error('Error loading permit:', err);
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!permit) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
        <div className="text-white text-xl">Permit not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-t-lg p-6 border-b">
          <h1 className="text-3xl font-bold text-gray-900">Permit Details</h1>
          <p className="text-gray-600 mt-1">ID: {permit.id}</p>
        </div>

        <div className="bg-white shadow-xl rounded-b-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Equipment Information</h2>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <div className="text-sm text-gray-600">Manufacturer</div>
              <div className="text-lg font-medium">{permit.manufacturer || 'N/A'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Model</div>
              <div className="text-lg font-medium">{permit.model_number || 'N/A'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">BTU</div>
              <div className="text-lg font-medium">{permit.btu || 'N/A'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Tonnage</div>
              <div className="text-lg font-medium">{permit.equipment_tonnage || 'N/A'} tons</div>
            </div>
          </div>

          <h2 className="text-xl font-semibold mb-4">Property Information</h2>
          <div className="mb-6">
            <div className="text-sm text-gray-600">Address</div>
            <div className="text-lg font-medium">
              {permit.street_address}<br />
              {permit.city}, {permit.state} {permit.zip_code}
            </div>
          </div>

          <h2 className="text-xl font-semibold mb-4">Contractor Information</h2>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <div className="text-sm text-gray-600">Company</div>
              <div className="text-lg font-medium">{permit.contractor_name || 'N/A'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">ROC License</div>
              <div className="text-lg font-medium">{permit.roc_license_number || 'N/A'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">City Privilege License</div>
              <div className="text-lg font-medium">{permit.city_privilege_license || 'N/A'}</div>
            </div>
          </div>

          <h2 className="text-xl font-semibold mb-4">Phoenix Portal Requirements</h2>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <div className="text-sm text-gray-600">Equipment Tonnage</div>
              <div className="text-lg font-medium">{permit.equipment_tonnage || 'N/A'} tons</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Electrical Amperage</div>
              <div className="text-lg font-medium">{permit.electrical_amps || 'N/A'} amps</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Job Valuation</div>
              <div className="text-lg font-medium">${permit.valuation_cost || 'N/A'}</div>
            </div>
          </div>

          <div className="flex gap-4 mt-8">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
            >
              ← Back to Dashboard
            </button>
            <button
              onClick={() => alert('Portal integration coming soon!\n\nWould submit to: SHAPE PHX\nURL: https://shapephx.phoenix.gov/s/')}
              className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Submit to SHAPE PHX
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}