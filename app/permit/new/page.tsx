'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

function PermitFormContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<any>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

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


// Add new equipment state
const [additionalData, setAdditionalData] = useState({
  equipmentTonnage: '',
  electricalAmps: '',
  valuationCost: '',
  equipmentLocation: 'same-location', // Default for like-for-like
  scopeDescription: 'Mechanical - Like for Like', // Default
});

  // Contractor information
const [contractorData, setContractorData] = useState({
  contractorName: '',
  licenseNumber: '',
  rocLicenseNumber: '', // NEW
  cityPrivilegeLicense: '', // NEW
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



  // useEffect:
  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/login');
        return;
      }

      // Load contractor profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('Profile load error:', profileError);
        setLoadingProfile(false);
        return;
      }

      setProfile(profileData);

      // AUTO-FILL contractor data from profile
      if (profileData) {
  setContractorData({
    contractorName: profileData.company_name || '',
    licenseNumber: profileData.license_number || profileData.roc_license_number || '', // Use ROC if regular license is empty
    rocLicenseNumber: profileData.roc_license_number || '',
    cityPrivilegeLicense: profileData.city_privilege_license || '',
    phoneNumber: profileData.phone || '',
    email: user.email || '', // Get email from user object!
  });
}
      setLoadingProfile(false);
    } catch (err: any) {
      console.error('Load profile error:', err);
      setLoadingProfile(false);
    }
  }

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

      // Normalize equipment type to lowercase (database constraint requires lowercase)
    const normalizedEquipmentType = equipmentData.equipmentType?.toLowerCase() || null;

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
            equipment_type: normalizedEquipmentType, // ← Use normalized value (lowercase)
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
            // NEW FIELDS
      roc_license_number: contractorData.rocLicenseNumber,
      city_privilege_license: contractorData.cityPrivilegeLicense,
      equipment_tonnage: additionalData.equipmentTonnage ? parseFloat(additionalData.equipmentTonnage) : null,
      electrical_amps: additionalData.electricalAmps ? parseInt(additionalData.electricalAmps) : null,
      valuation_cost: additionalData.valuationCost ? parseFloat(additionalData.valuationCost) : null,
      equipment_location: additionalData.equipmentLocation,
      scope_description: additionalData.scopeDescription,
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

  if (loadingProfile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Loading your profile...</p>
        </div>
      </div>
    );
  }

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

          
          {/* AUTO-FILLED CONTRACTOR INFO */}
          {profile && profile.onboarding_completed && (
            <div className="p-6 border-b">
              <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
                <div className="flex items-start">
                  <svg className="w-6 h-6 text-green-600 mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1">
                    <h3 className="font-semibold text-green-800 mb-2">
                      ✅ Contractor Information (Auto-filled from your profile)
                    </h3>
                    <div className="text-sm space-y-1 text-gray-700">
                      <p><strong>Company:</strong> {profile.company_name}</p>
                      <p><strong>ROC License:</strong> {profile.roc_license_number}</p>
                      {profile.city_privilege_license && (
                        <p><strong>City Privilege License:</strong> {profile.city_privilege_license}</p>
                      )}
                      <p><strong>Phone:</strong> {profile.phone}</p>
                    </div>
                    <a 
                      href="/profile/edit" 
                      className="text-blue-600 hover:underline text-sm inline-block mt-2"
                    >
                      Edit profile →
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

         
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
  <label className="block text-sm font-medium text-gray-700 mb-1">
    ROC License Number * (Arizona)
  </label>
  <input
    type="text"
    value={contractorData.rocLicenseNumber}
    onChange={(e) => setContractorData({...contractorData, rocLicenseNumber: e.target.value})}
    placeholder="ROC123456"
    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
    required
  />
</div>

<div>
  <label className="block text-sm font-medium text-gray-700 mb-1">
    City Privilege License * (Phoenix Tax License)
  </label>
  <input
    type="text"
    value={contractorData.cityPrivilegeLicense}
    onChange={(e) => setContractorData({...contractorData, cityPrivilegeLicense: e.target.value})}
    placeholder="PL123456"
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

        {/* SHAPE PHX Specific Fields */}
<div className="p-6 border-b">
  <h2 className="text-xl font-semibold text-gray-900 mb-4">📋 Phoenix Portal Requirements</h2>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Equipment Tonnage * (must be ≤ 5 tons)
      </label>
      <input
        type="number"
        step="0.5"
        value={additionalData.equipmentTonnage}
        onChange={(e) => setAdditionalData({...additionalData, equipmentTonnage: e.target.value})}
        placeholder="3.5"
        max="5"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
        required
      />
    </div>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Electrical Amperage *
      </label>
      <input
        type="number"
        value={additionalData.electricalAmps}
        onChange={(e) => setAdditionalData({...additionalData, electricalAmps: e.target.value})}
        placeholder="40"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
        required
      />
    </div>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Job Valuation Cost *
      </label>
      <input
        type="number"
        value={additionalData.valuationCost}
        onChange={(e) => setAdditionalData({...additionalData, valuationCost: e.target.value})}
        placeholder="5000"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
        required
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