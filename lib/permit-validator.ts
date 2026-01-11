/**
 * FlashPermit Permit Validator API
 * 
 * Combines Address Validation + Express Eligibility checking
 * into a single validation endpoint.
 * 
 * This is the "gatekeeper" that runs BEFORE the bot attempts submission.
 */

import { AddressValidator, AddressInput, ValidationResult as AddressResult } from './address-validator';
import { ExpressEligibilityChecker, ProjectData, EligibilityResult } from './eligibility-checker';

// ============================================================
// TYPES
// ============================================================

export interface PermitValidationRequest {
  // Address
  address: {
    street: string;
    city?: string;
    zip?: string;
  };
  
  // Project details
  propertyType: 'residential' | 'commercial';
  installationType: 'ac-furnace' | 'ac-only' | 'furnace-only' | 'mini-split' | 'custom';
  
  // Equipment (for HVAC)
  equipment?: {
    tonnage: number;
    location: 'ground' | 'roof' | 'closet' | 'attic' | 'garage';
    isReplacement: boolean;
    existingTonnage?: number;
    fuelType?: 'gas' | 'electric';
    requiresElectricalUpgrade?: boolean;
    requiresNewGasLine?: boolean;
  };
  
  // Valuation
  estimatedValue: number;
  
  // Custom project (if installationType === 'custom')
  customProject?: {
    category: string;
    description: string;
  };
}

export interface PermitValidationResponse {
  // Overall result
  valid: boolean;
  
  // Routing decision
  processingMode: 'bot' | 'admin';
  
  // Address validation
  address: {
    valid: boolean;
    normalized?: string;
    jurisdiction?: string;
    isPhoenix: boolean;
    propertyType?: 'residential' | 'commercial' | 'unknown';
    apn?: string;
    coordinates?: { lat: number; lng: number };
    errors: string[];
  };
  
  // Eligibility (for bot-processable permits)
  eligibility?: {
    eligible: boolean;
    permitType: 'express' | 'plan-review' | 'requires-consultation';
    estimatedFee?: number;
    checks: {
      name: string;
      passed: boolean;
      message: string;
    }[];
    recommendations: string[];
  };
  
  // Overall summary
  summary: {
    canProceed: boolean;
    blockers: string[];
    warnings: string[];
    nextSteps: string[];
  };
}

// ============================================================
// PERMIT VALIDATOR CLASS
// ============================================================

export class PermitValidator {
  private addressValidator: AddressValidator;
  private eligibilityChecker: ExpressEligibilityChecker;
  
  constructor() {
    this.addressValidator = new AddressValidator();
    this.eligibilityChecker = new ExpressEligibilityChecker();
  }
  
  /**
   * Main validation method
   */
  async validate(request: PermitValidationRequest): Promise<PermitValidationResponse> {
    console.log('═══════════════════════════════════════════');
    console.log('  FlashPermit Permit Validator');
    console.log('═══════════════════════════════════════════\n');
    
    const blockers: string[] = [];
    const warnings: string[] = [];
    const nextSteps: string[] = [];
    
    // ─────────────────────────────────────────────────────────
    // STEP 1: Address Validation
    // ─────────────────────────────────────────────────────────
    console.log('📍 STEP 1: Validating Address...\n');
    
    const addressResult = await this.addressValidator.validate(request.address);
    
    const addressResponse = {
      valid: addressResult.valid,
      normalized: addressResult.normalizedAddress,
      jurisdiction: addressResult.jurisdiction,
      isPhoenix: addressResult.isPhoenix || false,
      propertyType: addressResult.parcelInfo?.propertyType,
      apn: addressResult.parcelInfo?.apn,
      coordinates: addressResult.coordinates,
      errors: addressResult.errors.map(e => e.message)
    };
    
    if (!addressResult.valid) {
      for (const err of addressResult.errors) {
        blockers.push(err.message);
        if (err.suggestion) {
          nextSteps.push(err.suggestion);
        }
      }
    }
    
    // ─────────────────────────────────────────────────────────
    // STEP 2: Determine Processing Mode
    // ─────────────────────────────────────────────────────────
    const processingMode = this.determineProcessingMode(request);
    console.log(`\n🔀 Processing Mode: ${processingMode.toUpperCase()}\n`);
    
    // ─────────────────────────────────────────────────────────
    // STEP 3: Eligibility Check (if bot-processable)
    // ─────────────────────────────────────────────────────────
    let eligibilityResponse: PermitValidationResponse['eligibility'] | undefined;
    
    if (processingMode === 'bot' && request.equipment) {
      console.log('📋 STEP 2: Checking Express Eligibility...\n');
      
      const projectData: ProjectData = {
        propertyType: request.propertyType,
        isLikeForLike: request.equipment.isReplacement,
        existingTonnage: request.equipment.existingTonnage,
        estimatedValue: request.estimatedValue,
        equipment: {
          type: this.mapInstallationType(request.installationType),
          tonnage: request.equipment.tonnage,
          location: request.equipment.location,
          isNewLocation: !request.equipment.isReplacement,
          voltage: '240V',
          amperage: request.equipment.tonnage * 10, // Rough estimate
          requiresElectricalUpgrade: request.equipment.requiresElectricalUpgrade || false,
          requiresNewGasLine: request.equipment.requiresNewGasLine || false,
          fuelType: request.equipment.fuelType
        }
      };
      
      const eligibilityResult = this.eligibilityChecker.check(projectData);
      
      eligibilityResponse = {
        eligible: eligibilityResult.eligible,
        permitType: eligibilityResult.permitType,
        estimatedFee: eligibilityResult.estimatedFee,
        checks: eligibilityResult.checks.map(c => ({
          name: c.name,
          passed: c.passed,
          message: c.message
        })),
        recommendations: eligibilityResult.recommendations
      };
      
      if (!eligibilityResult.eligible) {
        blockers.push(`Project requires ${eligibilityResult.permitType} (not Express permit)`);
        for (const rec of eligibilityResult.recommendations) {
          nextSteps.push(rec);
        }
      }
      
      // Add warnings
      for (const check of eligibilityResult.checks) {
        if (check.severity === 'warning') {
          warnings.push(check.message);
        }
      }
    }
    
    // ─────────────────────────────────────────────────────────
    // STEP 4: Build Response
    // ─────────────────────────────────────────────────────────
    
    // Determine overall validity
    const isValid = addressResult.valid && 
                   (processingMode === 'admin' || (eligibilityResponse?.eligible ?? true));
    
    // Build next steps
    if (isValid) {
      if (processingMode === 'bot') {
        nextSteps.push('Your permit qualifies for Express processing!');
        nextSteps.push('Click "Submit" to file your permit automatically.');
      } else {
        nextSteps.push('This permit will be handled by our permit team.');
        nextSteps.push('We\'ll review your request and contact you within 1 business day.');
      }
    }
    
    const response: PermitValidationResponse = {
      valid: isValid,
      processingMode,
      address: addressResponse,
      eligibility: eligibilityResponse,
      summary: {
        canProceed: blockers.length === 0,
        blockers,
        warnings,
        nextSteps
      }
    };
    
    // Log summary
    console.log('═══════════════════════════════════════════');
    console.log('  VALIDATION RESULT');
    console.log('═══════════════════════════════════════════');
    console.log(`\n   Valid: ${response.valid ? '✅ YES' : '❌ NO'}`);
    console.log(`   Processing Mode: ${response.processingMode.toUpperCase()}`);
    console.log(`   Address Valid: ${response.address.valid ? '✅' : '❌'}`);
    if (response.eligibility) {
      console.log(`   Express Eligible: ${response.eligibility.eligible ? '✅' : '❌'}`);
    }
    if (blockers.length > 0) {
      console.log(`\n   Blockers:`);
      for (const b of blockers) {
        console.log(`   ❌ ${b}`);
      }
    }
    if (warnings.length > 0) {
      console.log(`\n   Warnings:`);
      for (const w of warnings) {
        console.log(`   ⚠️ ${w}`);
      }
    }
    console.log('\n');
    
    return response;
  }
  
  /**
   * Determine if permit should be processed by bot or admin
   */
  private determineProcessingMode(request: PermitValidationRequest): 'bot' | 'admin' {
    // Custom projects always go to admin
    if (request.installationType === 'custom') {
      return 'admin';
    }
    
    // Commercial properties go to admin
    if (request.propertyType === 'commercial') {
      return 'admin';
    }
    
    // Standard HVAC types can be processed by bot
    const botProcessableTypes = ['ac-furnace', 'ac-only', 'furnace-only', 'mini-split'];
    if (botProcessableTypes.includes(request.installationType)) {
      return 'bot';
    }
    
    // Default to admin
    return 'admin';
  }
  
  /**
   * Map FlashPermit installation type to eligibility checker type
   */
  private mapInstallationType(type: string): 'split-system' | 'package-unit' | 'mini-split' | 'furnace-only' | 'ac-only' {
    switch (type) {
      case 'ac-furnace':
        return 'split-system';
      case 'ac-only':
        return 'ac-only';
      case 'furnace-only':
        return 'furnace-only';
      case 'mini-split':
        return 'mini-split';
      default:
        return 'split-system';
    }
  }
}

// ============================================================
// CONVENIENCE EXPORT
// ============================================================

export const permitValidator = new PermitValidator();

// ============================================================
// CLI TEST
// ============================================================

async function main() {
  const validator = new PermitValidator();
  
  // Test 1: Valid Express permit
  console.log('\n\n🧪 TEST 1: Valid Express HVAC Permit\n');
  await validator.validate({
    address: { street: '3825 E Camelback Rd' },
    propertyType: 'residential',
    installationType: 'ac-furnace',
    equipment: {
      tonnage: 3,
      location: 'ground',
      isReplacement: true,
      existingTonnage: 3,
      fuelType: 'gas',
      requiresElectricalUpgrade: false,
      requiresNewGasLine: false
    },
    estimatedValue: 5000
  });
  
  // Test 2: Custom project (goes to admin)
  console.log('\n\n🧪 TEST 2: Custom Project (Water Heater)\n');
  await validator.validate({
    address: { street: '3825 E Camelback Rd' },
    propertyType: 'residential',
    installationType: 'custom',
    estimatedValue: 1500,
    customProject: {
      category: 'water-heater',
      description: 'Replace 50-gallon gas water heater'
    }
  });
  
  // Test 3: Over-size equipment
  console.log('\n\n🧪 TEST 3: Over-Size Equipment (6 tons)\n');
  await validator.validate({
    address: { street: '3825 E Camelback Rd' },
    propertyType: 'residential',
    installationType: 'ac-furnace',
    equipment: {
      tonnage: 6,
      location: 'ground',
      isReplacement: true,
      existingTonnage: 5,
      fuelType: 'gas'
    },
    estimatedValue: 8000
  });
  
  // Test 4: Commercial property
  console.log('\n\n🧪 TEST 4: Commercial Property\n');
  await validator.validate({
    address: { street: '3825 E Camelback Rd' },
    propertyType: 'commercial',
    installationType: 'ac-furnace',
    equipment: {
      tonnage: 4,
      location: 'roof',
      isReplacement: true,
      fuelType: 'gas'
    },
    estimatedValue: 15000
  });
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
