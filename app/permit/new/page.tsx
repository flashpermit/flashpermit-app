'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

function PermitFormContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Equipment data from OCR
  const [equipmentData, setEquipmentData] = useState({
    manufacturer: searchParams.get('manufacturer') || '',
    model: searchParams.get('model') || '',
    serialNumber: searchParams.get('serialNumber') || '',
    btu: searchParams.get('btu') || '',
    voltage: searchParams.get('voltage') || '',
    seer: searchParams.get('seer') || '',
    refrigerant: searchParams.get('refrigerant') || '',
    equipmentType: searchParams.get('equipmentType') || '',
  });

  // Property information
  const [propertyData, setPropertyData] = useState({
    streetAddress: '',
    city: '',
    state: 'AZ', // Default to Arizona
    zipCode: '',
    parcelNumber: '',
  });

  // Contractor information
  const [contractorData, setContractorData] = useState({
    contractorName: '',
    licenseNumber: '',
    phoneNumber: '',
    email: '',
  });

  // Job details
  const [jobData, setJobData] = useState({
    permitType: 'mechanical', // mechanical, electrical, plumbing
    workType: 'replacement', // new-installation, replacement, repair
    installDate: '',
    jobDescription: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('You must be logged in to submit a permit');
      }

      // Create permit in database
      const { data: permit, error: permitError } = await supabase
        .from('permits')
        .insert([
          {
            user_id: user.id,
            // Equipment data
            manufacturer: equipmentData.manufacturer,
            model_number: equipmentData.model,
            serial_number: equipmentData.serialNumber,
            btu: equipmentData.btu ? parseInt(equipmentData.btu) : null,
            voltage: equipmentData.voltage,
            seer_rating: equipmentData.seer ? parseFloat(equipmentData.seer) : null,
            refrigerant: equipmentData.refrigerant,
            equipment_type: equipmentData.equipmentType,
            // Property data
            street_address: propertyData.streetAddress,
            city: propertyData.city,
            state: propertyData.state,
            zip_code: propertyData.zipCode,
            parcel_number: propertyData.parcelNumber,
            // Contractor data
            contractor_name: contractorData.contractorName,
            contractor_license: contractorData.licenseNumber,
            contractor_phone: contractorData.phoneNumber,
            contractor_email: contractorData.email,
            // Job data
            permit_type: jobData.permitType,
            work_type: jobData.workType,
            install_date: jobData.installDate,
            job_description: jobData.jobDescription,
            // Status
            status: 'draft',
            portal_status: 'not_submitted',
          },
        ])
        .select()
        .single();

      if (permitError) throw permitError;

      // Success! Redirect to dashboard
      router.push('/dashboard?success=permit_created');

    } catch (err: any) {
      console.error('Submit error:', err);
      setError(err.message || 'Failed to create permit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-t-lg p-6 border-b">
          <h1 className="text-3xl font-bold text-gray-900">New Permit Application</h1>
          <p className="text-gray-600 mt-2">Review extracted data and complete the permit details</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-b-lg shadow-xl">
          {/* Equipment Information */}
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">📦 Equipment Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturer</label>
                <input
                  type="text"
                  value={equipmentData.manufacturer}
                  onChange={(e) => setEquipmentData({...equipmentData, manufacturer: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" 
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model Number</label>
                <input
                  type="text"
                  value={equipmentData.model}
                  onChange={(e) => setEquipmentData({...equipmentData, model: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" 
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number</label>
                <input
                  type="text"
                  value={equipmentData.serialNumber}
                  onChange={(e) => setEquipmentData({...equipmentData, serialNumber: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">BTU</label>
                <input
                  type="text"
                  value={equipmentData.btu}
                  onChange={(e) => setEquipmentData({...equipmentData, btu: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Voltage</label>
                <input
                  type="text"
                  value={equipmentData.voltage}
                  onChange={(e) => setEquipmentData({...equipmentData, voltage: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Refrigerant</label>
                <input
                  type="text"
                  value={equipmentData.refrigerant}
                  onChange={(e) => setEquipmentData({...equipmentData, refrigerant: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" 
                />
              </div>
            </div>
          </div>

          {/* Property Information */}
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">🏠 Property Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Street Address *</label>
                <input
                  type="text"
                  value={propertyData.streetAddress}
                  onChange={(e) => setPropertyData({...propertyData, streetAddress: e.target.value})}
                  placeholder="123 Main St"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" 
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                <input
                  type="text"
                  value={propertyData.city}
                  onChange={(e) => setPropertyData({...propertyData, city: e.target.value})}
                  placeholder="Phoenix"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" 
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                <select
                  value={propertyData.state}
                  onChange={(e) => setPropertyData({...propertyData, state: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" 
                  required
                >
                  <option value="AZ">Arizona</option>
                  <option value="CA">California</option>
                  <option value="NV">Nevada</option>
                  <option value="TX">Texas</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code *</label>
                <input
                  type="text"
                  value={propertyData.zipCode}
                  onChange={(e) => setPropertyData({...propertyData, zipCode: e.target.value})}
                  placeholder="85001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" 
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parcel Number</label>
                <input
                  type="text"
                  value={propertyData.parcelNumber}
                  onChange={(e) => setPropertyData({...propertyData, parcelNumber: e.target.value})}
                  placeholder="123-45-678"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" 
                />
              </div>
            </div>
          </div>

          {/* Contractor Information */}
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">👷 Contractor Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
                <input
                  type="text"
                  value={contractorData.contractorName}
                  onChange={(e) => setContractorData({...contractorData, contractorName: e.target.value})}
                  placeholder="ACME HVAC"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" 
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">License Number *</label>
                <input
                  type="text"
                  value={contractorData.licenseNumber}
                  onChange={(e) => setContractorData({...contractorData, licenseNumber: e.target.value})}
                  placeholder="ROC123456"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" 
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
                <input
                  type="tel"
                  value={contractorData.phoneNumber}
                  onChange={(e) => setContractorData({...contractorData, phoneNumber: e.target.value})}
                  placeholder="(602) 555-1234"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" 
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  value={contractorData.email}
                  onChange={(e) => setContractorData({...contractorData, email: e.target.value})}
                  placeholder="contractor@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" 
                  required
                />
              </div>
            </div>
          </div>

          {/* Job Details */}
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">🔧 Job Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Permit Type *</label>
                <select
                  value={jobData.permitType}
                  onChange={(e) => setJobData({...jobData, permitType: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" 
                  required
                >
                  <option value="mechanical">Mechanical (HVAC)</option>
                  <option value="electrical">Electrical</option>
                  <option value="plumbing">Plumbing</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Work Type *</label>
                <select
                  value={jobData.workType}
                  onChange={(e) => setJobData({...jobData, workType: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" 
                  required
                >
                  <option value="new-installation">New Installation</option>
                  <option value="replacement">Replacement</option>
                  <option value="repair">Repair</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Installation Date *</label>
                <input
                  type="date"
                  value={jobData.installDate}
                  onChange={(e) => setJobData({...jobData, installDate: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" 
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Job Description</label>
                <textarea
                  value={jobData.jobDescription}
                  onChange={(e) => setJobData({...jobData, jobDescription: e.target.value})}
                  placeholder="Brief description of the work being performed..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900" 
                />
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-6 border-b">
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            </div>
          )}

          {/* Submit Buttons */}
          <div className="p-6 flex gap-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
            >
              ← Back
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting...' : 'Submit Permit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PermitNewPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PermitFormContent />
    </Suspense>
  );
}