/**
 * Portal Integration Service
 * Handles automatic permit submission to city portals
 * Based on comprehensive research of Phoenix SHAPE PHX system
 */

export interface PortalConfig {
  name: string;
  url: string;
  city: string;
  state: string;
  supportsAutomation: boolean;
  requiresCredentials: boolean;
  portalType?: string;
  maxFileSize?: number;
  acceptedFormats?: string[];
  notes?: string;
}

export interface PermitSubmissionData {
  // Property info
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  parcelNumber?: string;
  
  // Contractor info
  contractorName: string;
  licenseNumber: string;
  rocLicenseNumber?: string; // Arizona ROC License
  cityPrivilegeLicense?: string; // Phoenix Tax License (CRITICAL!)
  phoneNumber: string;
  email: string;
  
  // Equipment info
  manufacturer: string;
  modelNumber: string;
  serialNumber?: string;
  btu?: number;
  voltage?: string;
  refrigerant?: string;
  equipmentType?: string;
  equipmentTonnage?: number; // Must be ≤ 5 tons for Express
  electricalAmps?: number;
  
  // Job info
  permitType: string;
  workType: string;
  installDate: string;
  jobDescription?: string;
  valuationCost?: number; // Job cost for permit fee calculation
  equipmentLocation?: string; // "same-location" for like-for-like
  scopeDescription?: string; // "Mechanical - Like for Like"
  
  // Attachments
  equipmentPhotoUrl?: string;
}

/**
 * Portal Registry - Based on Gemini Research (Dec 2025)
 * Phoenix uses 3 different systems - we target SHAPE PHX for residential HVAC
 */
export const PORTALS: { [key: string]: PortalConfig } = {
  'phoenix-az': {
    name: 'SHAPE PHX (Salesforce)',
    url: 'https://shapephx.phoenix.gov/s/',
    city: 'Phoenix',
    state: 'AZ',
    supportsAutomation: true,
    requiresCredentials: true,
    portalType: 'salesforce-lwc', // Lightning Web Components with Shadow DOM
    maxFileSize: 50 * 1024 * 1024, // 50MB
    acceptedFormats: ['pdf', 'jpg', 'jpeg', 'png'],
    notes: 'Express permits for equipment ≤5 tons, like-for-like replacements. Instant issuance. Requires ROC License + City Privilege License.',
  },
  'tempe-az': {
    name: 'Citizen Access (Accela)',
    url: 'https://permits.tempe.gov',
    city: 'Tempe',
    state: 'AZ',
    supportsAutomation: true,
    requiresCredentials: true,
    portalType: 'accela',
    notes: 'Different portal system than Phoenix. Accela-based.',
  },
  'scottsdale-az': {
    name: 'Digital Plan Review',
    url: 'https://permits.scottsdaleaz.gov',
    city: 'Scottsdale',
    state: 'AZ',
    supportsAutomation: false,
    requiresCredentials: true,
    portalType: 'custom',
    notes: 'Custom system with specific file naming conventions. Manual submission required.',
  },
  'mesa-az': {
    name: 'Mesa Permits Portal',
    url: 'https://permits.mesaaz.gov',
    city: 'Mesa',
    state: 'AZ',
    supportsAutomation: false,
    requiresCredentials: true,
    portalType: 'unknown',
    notes: 'Not yet researched.',
  },
};

/**
 * Determine which portal to use based on property address
 * Returns null if no portal found for that city
 */
export function getPortalForAddress(city: string, state: string): PortalConfig | null {
  const cityKey = `${city.toLowerCase()}-${state.toLowerCase()}`;
  return PORTALS[cityKey] || null;
}

/**
 * Get all available portals
 */
export function getAllPortals(): PortalConfig[] {
  return Object.values(PORTALS);
}

/**
 * Check if a portal supports automation
 */
export function isPortalAutomated(city: string, state: string): boolean {
  const portal = getPortalForAddress(city, state);
  return portal?.supportsAutomation || false;
}

/**
 * Validate permit data before submission
 * Returns validation result with specific error messages
 */
export function validatePermitData(data: PermitSubmissionData): { 
  valid: boolean; 
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Required fields
  if (!data.streetAddress) errors.push('Street address is required');
  if (!data.city) errors.push('City is required');
  if (!data.state) errors.push('State is required');
  if (!data.zipCode) errors.push('ZIP code is required');
  if (!data.contractorName) errors.push('Contractor name is required');
  if (!data.licenseNumber) errors.push('License number is required');
  if (!data.phoneNumber) errors.push('Phone number is required');
  if (!data.email) errors.push('Email is required');
  if (!data.manufacturer) errors.push('Manufacturer is required');
  if (!data.modelNumber) errors.push('Model number is required');
  
  // Phoenix-specific validation
  if (data.city.toLowerCase() === 'phoenix' && data.state.toLowerCase() === 'az') {
    if (!data.rocLicenseNumber) {
      errors.push('ROC License Number is required for Phoenix');
    }
    if (!data.cityPrivilegeLicense) {
      errors.push('City Privilege License (Phoenix Tax License) is required');
    }
    if (!data.equipmentTonnage) {
      errors.push('Equipment tonnage is required for Phoenix');
    } else if (data.equipmentTonnage > 5) {
      errors.push('Equipment tonnage must be ≤ 5 tons for Express Permit');
    }
    if (!data.electricalAmps) {
      errors.push('Electrical amperage is required for Phoenix');
    }
    if (!data.valuationCost) {
      errors.push('Job valuation cost is required for Phoenix permit fee calculation');
    }
  }
  
  // Warnings (non-blocking)
  if (!data.serialNumber) {
    warnings.push('Serial number not provided - may be required for inspection');
  }
  if (!data.parcelNumber) {
    warnings.push('Parcel number not provided - portal may auto-fill this');
  }
  if (!data.equipmentPhotoUrl) {
    warnings.push('No equipment photo attached - may be required for inspection');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Format address for portal submission
 * Phoenix GIS requires exact formatting
 */
export function formatAddressForPortal(address: string, city: string, state: string): string {
  // Basic cleanup
  let formatted = address.trim();
  
  // Expand common abbreviations for Phoenix
  if (city.toLowerCase() === 'phoenix') {
    formatted = formatted
      .replace(/\bSt\b/g, 'Street')
      .replace(/\bAve\b/g, 'Avenue')
      .replace(/\bDr\b/g, 'Drive')
      .replace(/\bRd\b/g, 'Road')
      .replace(/\bBlvd\b/g, 'Boulevard')
      .replace(/\bLn\b/g, 'Lane')
      .replace(/\bCt\b/g, 'Court')
      .replace(/\bPl\b/g, 'Place');
  }
  
  return formatted;
}

/**
 * Calculate tonnage from BTU (if not provided)
 * 1 ton = 12,000 BTU
 */
export function calculateTonnageFromBTU(btu: number): number {
  return Math.round((btu / 12000) * 2) / 2; // Round to nearest 0.5 ton
}

/**
 * Get permit type description for portal
 */
export function getPortalPermitType(permitType: string, workType: string): string {
  if (permitType === 'mechanical' && workType === 'replacement') {
    return 'Mechanical - Like for Like';
  }
  if (permitType === 'mechanical' && workType === 'new-installation') {
    return 'Mechanical - New Installation';
  }
  return 'Mechanical';
}

/**
 * Submit permit to portal
 * This is a placeholder - actual implementation will use Playwright
 */
export async function submitToPortal(
  portal: PortalConfig,
  data: PermitSubmissionData
): Promise<{ 
  success: boolean; 
  confirmationNumber?: string; 
  error?: string;
  details?: any;
}> {
  // Validate data first
  const validation = validatePermitData(data);
  if (!validation.valid) {
    return {
      success: false,
      error: `Validation failed: ${validation.errors.join(', ')}`,
    };
  }
  
  // Check if portal supports automation
  if (!portal.supportsAutomation) {
    return {
      success: false,
      error: `${portal.name} does not support automated submission. Manual submission required.`,
    };
  }
  
  // Log submission attempt
  console.log('=== PORTAL SUBMISSION ATTEMPT ===');
  console.log('Portal:', portal.name);
  console.log('URL:', portal.url);
  console.log('Data:', data);
  console.log('Validation warnings:', validation.warnings);
  
  // TODO: Implement Playwright automation
  // This is where we'll add the browser automation logic
  
  // For now, return mock response
  return {
    success: false,
    error: 'Portal automation not yet implemented. Playwright integration coming in next session.',
    details: {
      portal: portal.name,
      city: data.city,
      state: data.state,
      validationPassed: true,
      warnings: validation.warnings,
    },
  };
}

/**
 * Get submission status message for user
 */
export function getSubmissionStatusMessage(status: string): string {
  switch (status) {
    case 'pending':
      return 'Preparing to submit to portal...';
    case 'submitting':
      return 'Submitting permit to city portal...';
    case 'submitted':
      return 'Successfully submitted! Awaiting confirmation.';
    case 'confirmed':
      return 'Permit confirmed and issued!';
    case 'failed':
      return 'Submission failed. Please review errors.';
    default:
      return 'Unknown status';
  }
}

/**
 * SHAPE PHX Workflow (7 Steps)
 * This documents the manual process for future automation
 */
export const SHAPE_PHX_WORKFLOW = {
  step1: 'Login to SHAPE PHX with contractor account',
  step2: 'Navigate to "Apply for Permit" → "Residential" → "Express"',
  step3: 'Enter property address (must match GIS database exactly)',
  step4: 'Select scope: "Mechanical - Like for Like"',
  step5: 'Enter job valuation cost',
  step6: 'Pay permit fee via credit card',
  step7: 'Receive instant permit PDF',
  notes: [
    'Salesforce Lightning Web Components (Shadow DOM)',
    'Use Playwright for automation (handles shadow DOM)',
    'Convert photos to PDF before upload ("Equipment_Spec_Sheet.pdf")',
    'Address must match Phoenix GIS format exactly',
    'ROC License + City Privilege License are mandatory',
    'Equipment must be ≤ 5 tons for Express path',
  ],
};


/**
 * Detect which portal to use based on permit location
 */
export function detectPortal(city: string, state: string): PortalConfig | null {
  const cityKey = `${city.toLowerCase()}-${state.toLowerCase()}`;
  return PORTALS[cityKey] || null;
}

/**
 * Validate if permit is eligible for automation
 */
export interface ValidationResult {
  eligible: boolean;
  issues: string[];
  portal?: PortalConfig;
}

export function validateAutomationEligibility(permit: any): ValidationResult {
  const issues: string[] = [];

  // Detect portal
  const portal = detectPortal(permit.city, permit.state);

  if (!portal) {
    return {
      eligible: false,
      issues: ['City not supported yet. Currently only Phoenix is automated.']
    };
  }

  if (!portal.supportsAutomation) {
    return {
      eligible: false,
      issues: [`${portal.city} automation coming soon!`],
      portal
    };
  }

  // Check required fields for Phoenix
  if (portal.city === 'Phoenix') {
    if (!permit.rocLicenseNumber && !permit.roc_license_number) {
      issues.push('ROC license number is required for Phoenix permits');
    }

    if (!permit.cityPrivilegeLicense && !permit.city_privilege_license) {
      issues.push('City Privilege License (Phoenix Tax License) is required');
    }

    // Check tonnage limit for Express permits
    if (permit.equipmentTonnage || permit.equipment_tonnage) {
      const tonnage = permit.equipmentTonnage || permit.equipment_tonnage;
      if (tonnage > 5) {
        issues.push('Equipment exceeds 5 tons - requires plan review (not automated)');
      }
    }

    // Check for like-for-like
    if (permit.equipmentLocation && permit.equipmentLocation !== 'same-location') {
      issues.push('Equipment relocation requires plan review (not automated)');
    }

    // Check scope description
    if (permit.scopeDescription && permit.scopeDescription.includes('duct')) {
      issues.push('Ductwork changes require plan review (not automated)');
    }
  }

  return {
    eligible: issues.length === 0,
    issues,
    portal
  };
}

/**
 * Normalize address using USPS standards
 */
export function normalizeAddress(address: string): string {
  return address.toUpperCase()
    .replace(/NORTH/g, 'N')
    .replace(/SOUTH/g, 'S')
    .replace(/EAST/g, 'E')
    .replace(/WEST/g, 'W')
    .replace(/STREET/g, 'ST')
    .replace(/AVENUE/g, 'AVE')
    .replace(/ROAD/g, 'RD')
    .replace(/DRIVE/g, 'DR')
    .replace(/BOULEVARD/g, 'BLVD')
    .replace(/LANE/g, 'LN')
    .replace(/COURT/g, 'CT');
}

/**
 * Submit permit to portal via API
 * This triggers the Playwright automation
 */
export async function submitPermitToPortal(permitId: string): Promise<{
  success: boolean;
  status: string;
  paymentUrl?: string;
  error?: string;
}> {
  try {
    const response = await fetch('/api/submit-portal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ permitId })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Submission failed');
    }

    return data;

  } catch (error: any) {
    console.error('Portal submission error:', error);
    return {
      success: false,
      status: 'failed',
      error: error.message
    };
  }
}

/**
 * Resume automation after payment
 */
export async function resumeAfterPayment(permitId: string): Promise<{
  success: boolean;
  status: string;
  permitNumber?: string;
  error?: string;
}> {
  try {
    const response = await fetch('/api/submit-portal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        permitId,
        action: 'resume'
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Resume failed');
    }

    return data;

  } catch (error: any) {
    console.error('Resume error:', error);
    return {
      success: false,
      status: 'failed',
      error: error.message
    };
  }
}

/**
 * Check submission status
 */
export async function checkSubmissionStatus(permitId: string): Promise<{
  status: string;
  currentStep?: string;
  confirmationNumber?: string;
  errorMessage?: string;
}> {
  try {
    const response = await fetch(`/api/submit-portal?permitId=${permitId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Status check failed');
    }

    return data;

  } catch (error: any) {
    console.error('Status check error:', error);
    return {
      status: 'error',
      errorMessage: error.message
    };
  }
}