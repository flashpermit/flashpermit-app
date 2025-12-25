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

  // NEW: Installation Type
  const [installationType, setInstallationType] = useState('ac-furnace');

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

  // NEW: Separate AC and Furnace data
  const [acData, setAcData] = useState({
    manufacturer: '',
    model: '',
    serialNumber: '',
    btu: '',
    voltage: '',
    seer: '',
    refrigerant: '',
    tonnage: '',
  });

  const [furnaceData, setFurnaceData] = useState({
    manufacturer: '',
    model: '',
    serialNumber: '',
    btu: '',
    fuelType: 'gas', // gas or electric
  });

  const [miniSplitData, setMiniSplitData] = useState({
    manufacturer: '',
    model: '',
    serialNumber: '',
    btu: '',
    numberOfZones: '',
    indoorUnitType: 'wall-mounted',
    outdoorUnitType: 'single-zone',
  });

  // Property information
  const [propertyData, setPropertyData] = useState({
    streetAddress: '',
    city: '',
    state: 'AZ',
    zipCode: '',
    parcelNumber: '',
  });

  // Add new equipment state
  const [additionalData, setAdditionalData] = useState({
    equipmentTonnage: '',
    electricalAmps: '',
    valuationCost: '',
    equipmentLocation: 'same-location',
    scopeDescription: 'Mechanical - Like for Like',
  });

  // Contractor information
  const [contractorData, setContractorData] = useState({
    contractorName: '',
    licenseNumber: '',
    rocLicenseNumber: '',
    cityPrivilegeLicense: '',
    phoneNumber: '',
    email: '',
  });

  // Job details
  const [jobData, setJobData] = useState({
    permitType: 'mechanical',
    workType: 'replacement',
    installDate: '',
    jobDescription: '',
  });

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
          licenseNumber: profileData.license_number || profileData.roc_license_number || '',
          rocLicenseNumber: profileData.roc_license_number || '',
          cityPrivilegeLicense: profileData.city_privilege_license || '',
          phoneNumber: profileData.phone || '',
          email: user.email || '',
        });
      }
      setLoadingProfile(false);
    } catch (err: any) {
      console.error('Load profile error:', err);
      setLoadingProfile(false);
    }
  }

  // Get equipment data based on installation type
  const getEquipmentForSubmission = () => {
    switch (installationType) {
      case 'ac-only':
        return {
          manufacturer: acData.manufacturer,
          model_number: acData.model,
          serial_number: acData.serialNumber,
          btu: acData.btu ? parseInt(acData.btu) : null,
          voltage: acData.voltage,
          seer_rating: acData.seer ? parseFloat(acData.seer) : null,
          refrigerant: acData.refrigerant,
          equipment_type: 'ac',
        };
      case 'furnace-only':
        return {
          manufacturer: furnaceData.manufacturer,
          model_number: furnaceData.model,
          serial_number: furnaceData.serialNumber,
          btu: furnaceData.btu ? parseInt(furnaceData.btu) : null,
          equipment_type: 'furnace',
        };
      case 'mini-split':
        return {
          manufacturer: miniSplitData.manufacturer,
          model_number: miniSplitData.model,
          serial_number: miniSplitData.serialNumber,
          btu: miniSplitData.btu ? parseInt(miniSplitData.btu) : null,
          equipment_type: 'mini-split',
        };
      case 'ac-furnace':
      default:
        // For AC+Furnace, use combined or just AC data
        return {
          manufacturer: acData.manufacturer || equipmentData.manufacturer,
          model_number: acData.model || equipmentData.model,
          serial_number: acData.serialNumber || equipmentData.serialNumber,
          btu: (acData.btu || equipmentData.btu) ? parseInt(acData.btu || equipmentData.btu) : null,
          voltage: acData.voltage || equipmentData.voltage,
          seer_rating: (acData.seer || equipmentData.seer) ? parseFloat(acData.seer || equipmentData.seer) : null,
          refrigerant: acData.refrigerant || equipmentData.refrigerant,
          equipment_type: 'hvac',
        };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('You must be logged in to submit a permit');
      }

      const equipmentForSubmission = getEquipmentForSubmission();

      // Create permit in database
      const { data: permit, error: permitError } = await supabase
        .from('permits')
        .insert([
          {
            user_id: user.id,
            // Equipment data (dynamic based on type)
            ...equipmentForSubmission,
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
            job_description: `${installationType.toUpperCase()} - ${jobData.jobDescription}`,
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
          <p className="text-gray-600 mt-2">Select installation type and complete the permit details</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-b-lg shadow-xl">
          
          {/* NEW: Installation Type Selector */}
          <div className="p-6 border-b bg-blue-50">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">🔧 What are you installing?</h2>
            <select
              value={installationType}
              onChange={(e) => setInstallationType(e.target.value)}
              className="w-full px-4 py-3 border-2 border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 font-medium text-lg bg-white"
              required
            >
              <option value="ac-furnace">AC + Furnace Replacement (Complete System)</option>
              <option value="ac-only">AC Only (Air Conditioning Unit)</option>
              <option value="furnace-only">Furnace Only (Heating Unit)</option>
              <option value="mini-split">Mini-Split System</option>
            </select>
            <p className="text-sm text-gray-600 mt-2">
              {installationType === 'ac-furnace' && '✅ Replacing both cooling and heating units'}
              {installationType === 'ac-only' && '❄️ Replacing only the air conditioning unit'}
              {installationType === 'furnace-only' && '🔥 Replacing only the furnace/heating unit'}
              {installationType === 'mini-split' && '💨 Installing ductless mini-split system'}
            </p>
          </div>

          {/* Equipment Information - Conditional Based on Type */}
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">📦 Equipment Information</h2>

            {/* AC + Furnace */}
            {installationType === 'ac-furnace' && (
              <>
                <h3 className="font-semibold text-blue-700 mb-3">Air Conditioning Unit</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">AC Manufacturer *</label>
                    <input
                      type="text"
                      value={acData.manufacturer}
                      onChange={(e) => setAcData({...acData, manufacturer: e.target.value})}
                      placeholder="Carrier, Trane, etc."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">AC Model Number *</label>
                    <input
                      type="text"
                      value={acData.model}
                      onChange={(e) => setAcData({...acData, model: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">AC Serial Number</label>
                    <input
                      type="text"
                      value={acData.serialNumber}
                      onChange={(e) => setAcData({...acData, serialNumber: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">BTU</label>
                    <input
                      type="text"
                      value={acData.btu}
                      onChange={(e) => setAcData({...acData, btu: e.target.value})}
                      placeholder="36000"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Voltage</label>
                    <input
                      type="text"
                      value={acData.voltage}
                      onChange={(e) => setAcData({...acData, voltage: e.target.value})}
                      placeholder="240V"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Refrigerant</label>
                    <input
                      type="text"
                      value={acData.refrigerant}
                      onChange={(e) => setAcData({...acData, refrigerant: e.target.value})}
                      placeholder="R-410A"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                  </div>
                </div>

                <h3 className="font-semibold text-orange-700 mb-3 mt-6">Furnace Unit</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Furnace Manufacturer *</label>
                    <input
                      type="text"
                      value={furnaceData.manufacturer}
                      onChange={(e) => setFurnaceData({...furnaceData, manufacturer: e.target.value})}
                      placeholder="Carrier, Trane, etc."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Furnace Model Number *</label>
                    <input
                      type="text"
                      value={furnaceData.model}
                      onChange={(e) => setFurnaceData({...furnaceData, model: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Furnace Serial Number</label>
                    <input
                      type="text"
                      value={furnaceData.serialNumber}
                      onChange={(e) => setFurnaceData({...furnaceData, serialNumber: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Furnace BTU</label>
                    <input
                      type="text"
                      value={furnaceData.btu}
                      onChange={(e) => setFurnaceData({...furnaceData, btu: e.target.value})}
                      placeholder="80000"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fuel Type *</label>
                    <select
                      value={furnaceData.fuelType}
                      onChange={(e) => setFurnaceData({...furnaceData, fuelType: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                      required
                    >
                      <option value="gas">Natural Gas</option>
                      <option value="electric">Electric</option>
                      <option value="propane">Propane</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* AC Only */}
            {installationType === 'ac-only' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturer *</label>
                  <input
                    type="text"
                    value={acData.manufacturer}
                    onChange={(e) => setAcData({...acData, manufacturer: e.target.value})}
                    placeholder="Carrier, Trane, etc."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Model Number *</label>
                  <input
                    type="text"
                    value={acData.model}
                    onChange={(e) => setAcData({...acData, model: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number</label>
                  <input
                    type="text"
                    value={acData.serialNumber}
                    onChange={(e) => setAcData({...acData, serialNumber: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">BTU</label>
                  <input
                    type="text"
                    value={acData.btu}
                    onChange={(e) => setAcData({...acData, btu: e.target.value})}
                    placeholder="36000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Voltage</label>
                  <input
                    type="text"
                    value={acData.voltage}
                    onChange={(e) => setAcData({...acData, voltage: e.target.value})}
                    placeholder="240V"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Refrigerant</label>
                  <input
                    type="text"
                    value={acData.refrigerant}
                    onChange={(e) => setAcData({...acData, refrigerant: e.target.value})}
                    placeholder="R-410A"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                  />
                </div>
              </div>
            )}

            {/* Furnace Only */}
            {installationType === 'furnace-only' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturer *</label>
                  <input
                    type="text"
                    value={furnaceData.manufacturer}
                    onChange={(e) => setFurnaceData({...furnaceData, manufacturer: e.target.value})}
                    placeholder="Carrier, Trane, etc."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Model Number *</label>
                  <input
                    type="text"
                    value={furnaceData.model}
                    onChange={(e) => setFurnaceData({...furnaceData, model: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number</label>
                  <input
                    type="text"
                    value={furnaceData.serialNumber}
                    onChange={(e) => setFurnaceData({...furnaceData, serialNumber: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">BTU</label>
                  <input
                    type="text"
                    value={furnaceData.btu}
                    onChange={(e) => setFurnaceData({...furnaceData, btu: e.target.value})}
                    placeholder="80000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fuel Type *</label>
                  <select
                    value={furnaceData.fuelType}
                    onChange={(e) => setFurnaceData({...furnaceData, fuelType: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                    required
                  >
                    <option value="gas">Natural Gas</option>
                    <option value="electric">Electric</option>
                    <option value="propane">Propane</option>
                  </select>
                </div>
              </div>
            )}

            {/* Mini-Split */}
            {installationType === 'mini-split' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturer *</label>
                  <input
                    type="text"
                    value={miniSplitData.manufacturer}
                    onChange={(e) => setMiniSplitData({...miniSplitData, manufacturer: e.target.value})}
                    placeholder="Mitsubishi, Daikin, etc."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Model Number *</label>
                  <input
                    type="text"
                    value={miniSplitData.model}
                    onChange={(e) => setMiniSplitData({...miniSplitData, model: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number</label>
                  <input
                    type="text"
                    value={miniSplitData.serialNumber}
                    onChange={(e) => setMiniSplitData({...miniSplitData, serialNumber: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">BTU</label>
                  <input
                    type="text"
                    value={miniSplitData.btu}
                    onChange={(e) => setMiniSplitData({...miniSplitData, btu: e.target.value})}
                    placeholder="24000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Number of Zones *</label>
                  <input
                    type="number"
                    value={miniSplitData.numberOfZones}
                    onChange={(e) => setMiniSplitData({...miniSplitData, numberOfZones: e.target.value})}
                    placeholder="2"
                    min="1"
                    max="8"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Indoor Unit Type *</label>
                  <select
                    value={miniSplitData.indoorUnitType}
                    onChange={(e) => setMiniSplitData({...miniSplitData, indoorUnitType: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900"
                    required
                  >
                    <option value="wall-mounted">Wall Mounted</option>
                    <option value="ceiling-cassette">Ceiling Cassette</option>
                    <option value="floor-mounted">Floor Mounted</option>
                    <option value="concealed-duct">Concealed Duct</option>
                  </select>
                </div>
              </div>
            )}
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