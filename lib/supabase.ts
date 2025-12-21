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
  shape_phx_username: string | null
  shape_phx_password_encrypted: string | null
  subscription_tier: 'starter' | 'professional' | 'enterprise'
  subscription_status: 'active' | 'inactive' | 'cancelled'
  permits_used_this_month: number
  onboarding_completed: boolean
  last_login_at: string | null
}

export type Permit = {
  id: string
  user_id: string
  upload_id: string | null
  created_at: string
  updated_at: string
  property_address: string
  property_city: string
  property_state: string
  property_zip: string | null
  equipment_type: 'hvac' | 'plumbing' | 'electrical' | 'other' | null
  manufacturer: string | null
  model_number: string | null
  serial_number: string | null
  btu: number | null
  voltage: string | null
  seer_rating: number | null
  refrigerant_type: string | null
  additional_data: any
  permit_type: string | null
  portal_used: string | null
  submission_status: 'draft' | 'validating' | 'submitting' | 'submitted' | 'approved' | 'rejected' | 'cancelled'
  city_permit_number: string | null
  submitted_at: string | null
  approved_at: string | null
  rejected_at: string | null
  rejection_reason: string | null
  validation_confidence: number | null
  validation_warnings: any
  validation_errors: any
}