/**
 * FlashPermit Validator API Route
 * 
 * Endpoint: POST /api/validate-permit
 * 
 * This is a Next.js API route that can be added to the FlashPermit app.
 * Copy this file to: app/api/validate-permit/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';

// Import the validator (adjust path based on where you put the lib files)
// import { permitValidator } from '@/lib/validator/permit-validator';

// ============================================================
// INLINE IMPLEMENTATION (for standalone use)
// ============================================================

// Types
interface AddressInput {
  street: string;
  city?: string;
  zip?: string;
}

interface PermitValidationRequest {
  address: AddressInput;
  propertyType: 'residential' | 'commercial';
  installationType: 'ac-furnace' | 'ac-only' | 'furnace-only' | 'mini-split' | 'custom';
  equipment?: {
    tonnage: number;
    location: 'ground' | 'roof' | 'closet' | 'attic' | 'garage';
    isReplacement: boolean;
    existingTonnage?: number;
    fuelType?: 'gas' | 'electric';
    requiresElectricalUpgrade?: boolean;
    requiresNewGasLine?: boolean;
  };
  estimatedValue: number;
  customProject?: {
    category: string;
    description: string;
  };
}

// API Endpoints
const ENDPOINTS = {
  MARICOPA_ADDRESS_POINTS: 'https://services6.arcgis.com/clPWQMwZfdWn4MQZ/ArcGIS/rest/services/Maricopa_County_Address_Points/FeatureServer/0/query',
  PHOENIX_ZONING: 'https://maps.phoenix.gov/pub/rest/services/Public/Zoning/MapServer/0/query',
};

// Phoenix Rules
const PHOENIX_RULES = {
  MAX_TONNAGE_EXPRESS: 5,
  MAX_VALUATION_EXPRESS: 25000,
  BASE_FEE: 127.50,
};

// ============================================================
// API ROUTE HANDLER
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const body: PermitValidationRequest = await request.json();
    
    // Validate request
    if (!body.address?.street) {
      return NextResponse.json(
        { error: 'Address street is required' },
        { status: 400 }
      );
    }
    
    // Step 1: Validate address
    const addressResult = await validateAddress(body.address);
    
    if (!addressResult.valid) {
      return NextResponse.json({
        valid: false,
        processingMode: 'admin',
        address: addressResult,
        summary: {
          canProceed: false,
          blockers: addressResult.errors,
          warnings: [],
          nextSteps: ['Please verify the address and try again.']
        }
      });
    }
    
    // Step 2: Determine processing mode
    const processingMode = determineProcessingMode(body);
    
    // Step 3: Check eligibility (for bot-processable permits)
    let eligibility = null;
    const blockers: string[] = [];
    const warnings: string[] = [];
    const nextSteps: string[] = [];
    
    if (processingMode === 'bot' && body.equipment) {
      eligibility = checkEligibility(body);
      
      if (!eligibility.eligible) {
        blockers.push(`Project requires ${eligibility.permitType} (not Express permit)`);
        nextSteps.push(...eligibility.recommendations);
      }
      
      for (const check of eligibility.checks) {
        if (!check.passed && check.severity === 'warning') {
          warnings.push(check.message);
        }
      }
    }
    
    // Build next steps
    if (blockers.length === 0) {
      if (processingMode === 'bot') {
        nextSteps.push('Your permit qualifies for Express processing!');
        if (eligibility?.estimatedFee) {
          nextSteps.push(`Estimated permit fee: $${eligibility.estimatedFee.toFixed(2)}`);
        }
      } else {
        nextSteps.push('This permit will be handled by our permit team.');
        nextSteps.push('We\'ll contact you within 1 business day.');
      }
    }
    
    return NextResponse.json({
      valid: blockers.length === 0,
      processingMode,
      address: addressResult,
      eligibility,
      summary: {
        canProceed: blockers.length === 0,
        blockers,
        warnings,
        nextSteps
      }
    });
    
  } catch (error: any) {
    console.error('Validation error:', error);
    return NextResponse.json(
      { error: 'Validation failed', details: error.message },
      { status: 500 }
    );
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

async function validateAddress(input: AddressInput) {
  const errors: string[] = [];
  
  try {
    // Query Maricopa Address Points
    const searchPattern = buildAddressSearchPattern(input.street);
    console.log('Search pattern:', searchPattern); // Debug log
    
    const params = new URLSearchParams({
      where: searchPattern,
      outFields: '*',
      returnGeometry: 'true',
      outSR: '4326',
      f: 'json',
      resultRecordCount: '5'
    });
    
    const addressResponse = await fetch(
      `${ENDPOINTS.MARICOPA_ADDRESS_POINTS}?${params}`,
      { next: { revalidate: 3600 } }
    );
    
    if (!addressResponse.ok) {
      throw new Error('Address lookup failed');
    }
    
    const addressData = await addressResponse.json();
    console.log('API Response:', addressData); // Debug log
    
    if (!addressData.features || addressData.features.length === 0) {
      return {
        valid: false,
        errors: ['Address not found in Maricopa County records. Please verify the address.']
      };
    }
    
    const feature = addressData.features[0];
    const attrs = feature.attributes;
    
    // Use correct field names
    const normalizedAddress = attrs.AddressWithCity || attrs.AddressWithCityAndZip || 
      `${attrs.HseNo} ${attrs.StDir} ${attrs.StName} ${attrs.StType}`.trim();
    const lat = feature.geometry?.y;
    const lng = feature.geometry?.x;
    const zip = attrs.Zip?.toString();
    

    // Check Phoenix jurisdiction
    const jurisdictionParams = new URLSearchParams({
      geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
      geometryType: 'esriGeometryPoint',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: '*',
      returnGeometry: 'false',
      f: 'json'
    });
    
    const jurisdictionResponse = await fetch(
      `${ENDPOINTS.PHOENIX_ZONING}?${jurisdictionParams}`,
      { next: { revalidate: 3600 } }
    );
    
    let isPhoenix = false;
    let jurisdiction = 'Unknown';
    
    if (jurisdictionResponse.ok) {
      const jurisdictionData = await jurisdictionResponse.json();
      isPhoenix = jurisdictionData.features && jurisdictionData.features.length > 0;
      jurisdiction = isPhoenix ? 'PHOENIX' : 'Outside Phoenix';
    }
    
    if (!isPhoenix) {
      return {
        valid: false,
        normalized: `${normalizedAddress}, AZ ${zip}`,
        isPhoenix: false,
        jurisdiction,
        coordinates: { lat, lng },
        errors: ['This address is outside Phoenix city limits. Please use the appropriate city permit portal.']
      };
    }
    
    return {
      valid: true,
      normalized: normalizedAddress.includes('PHOENIX') 
        ? `${normalizedAddress}, AZ ${zip}`
        : `${normalizedAddress}, PHOENIX, AZ ${zip}`,
      isPhoenix: true,
      jurisdiction: 'PHOENIX',
      coordinates: { lat, lng },
      errors: []
    };
    
  } catch (error: any) {
    return {
      valid: false,
      errors: [`Address validation error: ${error.message}`]
    };
  }
}

function buildAddressSearchPattern(street: string): string {
  let normalized = street.toUpperCase().trim();
  
  const replacements: [RegExp, string][] = [
    [/\bNORTH\b/g, 'N'],
    [/\bSOUTH\b/g, 'S'],
    [/\bEAST\b/g, 'E'],
    [/\bWEST\b/g, 'W'],
    [/\bSTREET\b/g, 'ST'],
    [/\bAVENUE\b/g, 'AVE'],
    [/\bBOULEVARD\b/g, 'BLVD'],
    [/\bDRIVE\b/g, 'DR'],
    [/\bROAD\b/g, 'RD'],
  ];
  
  for (const [pattern, replacement] of replacements) {
    normalized = normalized.replace(pattern, replacement);
  }
  
  // Use AddressWithCity field (verified from API)
  const match = normalized.match(/^(\d+)\s+(.+)$/);
  
  if (match) {
    const streetNumber = match[1];
    const streetRest = match[2].replace(/[,\.]/g, '').split(/\s+/).join('%');
    return `AddressWithCity LIKE '%${streetNumber}%${streetRest}%'`;
  }
  
  return `AddressWithCity LIKE '%${normalized.split(/\s+/).join('%')}%'`;
}

function determineProcessingMode(request: PermitValidationRequest): 'bot' | 'admin' {
  if (request.installationType === 'custom') return 'admin';
  if (request.propertyType === 'commercial') return 'admin';
  
  const botProcessableTypes = ['ac-furnace', 'ac-only', 'furnace-only', 'mini-split'];
  return botProcessableTypes.includes(request.installationType) ? 'bot' : 'admin';
}

function checkEligibility(request: PermitValidationRequest) {
  const checks: { name: string; passed: boolean; severity: string; message: string }[] = [];
  const recommendations: string[] = [];
  
  const equipment = request.equipment!;
  
  // Check 1: Tonnage
  const tonnageOk = equipment.tonnage <= PHOENIX_RULES.MAX_TONNAGE_EXPRESS;
  checks.push({
    name: 'Equipment Size',
    passed: tonnageOk,
    severity: tonnageOk ? 'pass' : 'fail',
    message: tonnageOk 
      ? `${equipment.tonnage} tons - within Express limit`
      : `${equipment.tonnage} tons exceeds ${PHOENIX_RULES.MAX_TONNAGE_EXPRESS} ton limit`
  });
  if (!tonnageOk) {
    recommendations.push('Equipment over 5 tons requires Plan Review application.');
  }
  
  // Check 2: Property Type
  const residentialOk = request.propertyType === 'residential';
  checks.push({
    name: 'Property Type',
    passed: residentialOk,
    severity: residentialOk ? 'pass' : 'fail',
    message: residentialOk ? 'Residential property' : 'Commercial property requires different process'
  });
  
  // Check 3: Replacement vs New
  const replacementOk = equipment.isReplacement;
  checks.push({
    name: 'Replacement',
    passed: replacementOk,
    severity: replacementOk ? 'pass' : 'warning',
    message: replacementOk ? 'Replacing existing equipment' : 'New installation may require additional review'
  });
  
  // Check 4: Electrical
  const electricalOk = !equipment.requiresElectricalUpgrade;
  checks.push({
    name: 'Electrical',
    passed: electricalOk,
    severity: electricalOk ? 'pass' : 'fail',
    message: electricalOk ? 'No electrical upgrade needed' : 'Electrical upgrade requires separate permit'
  });
  if (!electricalOk) {
    recommendations.push('Electrical upgrades require a separate Electrical permit.');
  }
  
  // Check 5: Gas
  const gasOk = !equipment.requiresNewGasLine;
  checks.push({
    name: 'Gas Line',
    passed: gasOk,
    severity: gasOk ? 'pass' : 'fail',
    message: gasOk ? 'Using existing gas line' : 'New gas line requires separate permit'
  });
  if (!gasOk) {
    recommendations.push('New gas lines require a separate Plumbing/Gas permit.');
  }
  
  // Calculate result
  const failedChecks = checks.filter(c => c.severity === 'fail').length;
  const eligible = failedChecks === 0;
  
  // Calculate estimated fee
  let estimatedFee = PHOENIX_RULES.BASE_FEE;
  estimatedFee += request.estimatedValue * 0.01;
  estimatedFee = Math.ceil(estimatedFee * 2) / 2;
  
  return {
    eligible,
    permitType: eligible ? 'express' : 'plan-review',
    estimatedFee: eligible ? estimatedFee : undefined,
    checks,
    recommendations
  };
}

// ============================================================
// GET handler for testing
// ============================================================

export async function GET() {
  return NextResponse.json({
    name: 'FlashPermit Validator API',
    version: '1.0.0',
    endpoints: {
      'POST /api/validate-permit': 'Validate address and check Express permit eligibility'
    },
    example: {
      address: { street: '3825 E Camelback Rd' },
      propertyType: 'residential',
      installationType: 'ac-furnace',
      equipment: {
        tonnage: 3,
        location: 'ground',
        isReplacement: true,
        fuelType: 'gas'
      },
      estimatedValue: 5000
    }
  });
}
