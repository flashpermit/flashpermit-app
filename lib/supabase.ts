import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database types
export type Profile = {
  id: string
  created_at: string
  updated_at: string
  full_name: string | null
  company_name: string | null
  phone: string | null
  license_number: string | null
  license_state: string
  roc_license_number: string | null           // Add this
  roc_expiration_date: string | null          // ADD THIS (NEW!)
  city_privilege_license: string | null       // Add this
  business_address: string | null             // ADD THIS (NEW!)
  business_city: string | null                // ADD THIS (NEW!)
  business_state: string | null               // ADD THIS (NEW!)
  business_zip: string | null                 // ADD THIS (NEW!)
  shape_phx_username: string | null
  shape_phx_password_encrypted: string | null
  subscription_tier: 'starter' | 'professional' | 'enterprise'
  subscription_status: 'active' | 'inactive' | 'cancelled'
  permits_used_this_month: number
  onboarding_completed: boolean
  profile_completed_at: string | null         // ADD THIS (NEW!)
  last_login_at: string | null
}

// ADD THIS NEW TYPE:
export type SavedProperty = {
  id: string
  user_id: string
  nickname: string | null
  street_address: string
  city: string
  state: string
  zip_code: string | null
  parcel_number: string | null
  owner_name: string | null
  owner_phone: string | null
  owner_email: string | null
  times_used: number
  last_used: string | null
  created_at: string
  updated_at: string
}

export type Permit = {
  id: string
  user_id: string
  upload_id: string | null
  created_at: string
  updated_at: string
  
  // Legacy property address fields
  property_address: string | null
  property_city: string | null
  property_state: string | null
  property_zip: string | null
  
  // New property address fields (Phoenix SHAPE PHX)
  street_address: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  parcel_number: string | null
  
  // Equipment data
  equipment_type: 'hvac' | 'plumbing' | 'electrical' | 'other' | null
  manufacturer: string | null
  model_number: string | null
  serial_number: string | null
  btu: number | null
  voltage: string | null
  seer_rating: number | null
  refrigerant_type: string | null
  refrigerant: string | null // Alternative field name
  additional_data: any
  
  // Phoenix-specific equipment fields
  equipment_tonnage: number | null
  electrical_amps: number | null
  
  // Contractor data
  contractor_name: string | null
  contractor_license: string | null
  contractor_phone: string | null
  contractor_email: string | null
  roc_license_number: string | null      // Arizona ROC License
  city_privilege_license: string | null  // Phoenix Tax License
  
  // Job data
  permit_type: string | null
  work_type: string | null
  install_date: string | null
  job_description: string | null
  valuation_cost: number | null          // Job cost for permit fees
  equipment_location: string | null      // 'same-location' for like-for-like
  scope_description: string | null       // 'Mechanical - Like for Like'
  
  // Portal/submission data
  portal_used: string | null
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | null
  submission_status: 'draft' | 'validating' | 'submitting' | 'submitted' | 'approved' | 'rejected' | 'cancelled'
  portal_status: 'not_submitted' | 'pending_review' | 'approved' | null
  portal_confirmation_number: string | null
  portal_url: string | null
  portal_submission_date: string | null
  portal_notes: string | null
  submitted_by: string | null
  auto_submitted: boolean | null
  
  // Legacy portal fields
  city_permit_number: string | null
  submitted_at: string | null
  approved_at: string | null
  rejected_at: string | null
  rejection_reason: string | null
  
  // Validation data
  validation_confidence: number | null
  validation_warnings: any
  validation_errors: any
}

export type Upload = {
  id: string
  user_id: string
  permit_id: string | null
  created_at: string
  file_url: string
  file_name: string
  file_size: number
  mime_type: string
  upload_status: string
  ocr_status: string | null
  ocr_confidence: number | null
}

export type PortalSubmission = {
  id: string
  permit_id: string
  user_id: string
  created_at: string
  portal_name: string
  portal_url: string
  submission_method: 'manual' | 'automated' | 'semi-automated'
  submission_status: 'pending' | 'submitted' | 'confirmed' | 'failed'
  current_step: string | null
  confirmation_number: string | null
  submitted_at: string | null
  confirmed_at: string | null
  error_message: string | null
  retry_count: number
  state_data: any
  metadata: any
}