/**
 * FlashPermit Express Permit Eligibility Checker
 * 
 * Validates if a project qualifies for Phoenix "Express" (Over-the-Counter) permit
 * vs requiring a full Plan Review.
 * 
 * Express Permit Criteria (Residential HVAC):
 * - Equipment ≤ 5 tons
 * - Like-for-like replacement (same location, same capacity range)
 * - No new gas lines
 * - No electrical upgrade > 200A
 * - Residential property
 * - Ground-mounted or existing roof mount location
 */

// ============================================================
// TYPES
// ============================================================

export interface EquipmentData {
  // Equipment specs
  type: 'split-system' | 'package-unit' | 'mini-split' | 'furnace-only' | 'ac-only';
  tonnage: number;
  btuHeating?: number;
  btuCooling?: number;
  
  // Installation details
  location: 'ground' | 'roof' | 'closet' | 'attic' | 'garage';
  isNewLocation: boolean;  // Is this a NEW install location vs replacement?
  
  // Electrical
  voltage: '120V' | '240V';
  amperage: number;
  requiresElectricalUpgrade: boolean;
  
  // Gas (for furnaces)
  requiresNewGasLine: boolean;
  fuelType?: 'gas' | 'electric' | 'oil';
  
  // Refrigerant (for AC)
  refrigerantType?: string;
}

export interface ProjectData {
  // Property
  propertyType: 'residential' | 'commercial';
  
  // Scope
  isLikeForLike: boolean;  // Replacing existing with same type
  existingTonnage?: number;
  
  // Equipment
  equipment: EquipmentData;
  
  // Valuation
  estimatedValue: number;
}

export interface EligibilityResult {
  eligible: boolean;
  permitType: 'express' | 'plan-review' | 'requires-consultation';
  
  // Breakdown of checks
  checks: EligibilityCheck[];
  
  // Summary
  passedChecks: number;
  failedChecks: number;
  warningChecks: number;
  
  // Estimated fees (if eligible)
  estimatedFee?: number;
  
  // Recommendations
  recommendations: string[];
}

export interface EligibilityCheck {
  name: string;
  passed: boolean;
  severity: 'pass' | 'fail' | 'warning';
  message: string;
  details?: string;
}

// ============================================================
// PHOENIX EXPRESS PERMIT RULES
// ============================================================

const PHOENIX_RULES = {
  // Maximum tonnage for Express permit
  MAX_TONNAGE_EXPRESS: 5,
  
  // Maximum valuation before additional review
  MAX_VALUATION_EXPRESS: 25000,
  
  // Electrical limits
  MAX_AMPERAGE_WITHOUT_PERMIT: 200,
  
  // Property types allowed for Express
  ALLOWED_PROPERTY_TYPES: ['residential'] as const,
  
  // Locations that may require structural review
  STRUCTURAL_REVIEW_LOCATIONS: ['roof'] as const,
  
  // Base permit fees (approximate)
  BASE_FEES: {
    mechanical: 127.50,
    electrical: 85.00,
    plumbing: 95.00,
  },
  
  // Fee per $1000 of valuation
  VALUATION_FEE_RATE: 0.01,  // 1% of valuation
};

// ============================================================
// ELIGIBILITY CHECKER CLASS
// ============================================================

export class ExpressEligibilityChecker {
  
  /**
   * Check if project qualifies for Express permit
   */
  check(project: ProjectData): EligibilityResult {
    const checks: EligibilityCheck[] = [];
    const recommendations: string[] = [];
    
    // ─────────────────────────────────────────────────────────
    // CHECK 1: Property Type
    // ─────────────────────────────────────────────────────────
    const propertyCheck = this.checkPropertyType(project);
    checks.push(propertyCheck);
    
    if (!propertyCheck.passed) {
      recommendations.push('Commercial properties require Commercial HVAC permit application.');
    }
    
    // ─────────────────────────────────────────────────────────
    // CHECK 2: Equipment Tonnage
    // ─────────────────────────────────────────────────────────
    const tonnageCheck = this.checkTonnage(project.equipment);
    checks.push(tonnageCheck);
    
    if (!tonnageCheck.passed) {
      recommendations.push(`Equipment over ${PHOENIX_RULES.MAX_TONNAGE_EXPRESS} tons requires Plan Review application.`);
    }
    
    // ─────────────────────────────────────────────────────────
    // CHECK 3: Like-for-Like Replacement
    // ─────────────────────────────────────────────────────────
    const likeForLikeCheck = this.checkLikeForLike(project);
    checks.push(likeForLikeCheck);
    
    if (!likeForLikeCheck.passed) {
      recommendations.push('New installations (not replacements) may require additional review.');
    }
    
    // ─────────────────────────────────────────────────────────
    // CHECK 4: Electrical Requirements
    // ─────────────────────────────────────────────────────────
    const electricalCheck = this.checkElectrical(project.equipment);
    checks.push(electricalCheck);
    
    if (!electricalCheck.passed) {
      recommendations.push('Electrical upgrades over 200A require separate Electrical permit.');
    }
    
    // ─────────────────────────────────────────────────────────
    // CHECK 5: Gas Line Requirements
    // ─────────────────────────────────────────────────────────
    const gasCheck = this.checkGasLine(project.equipment);
    checks.push(gasCheck);
    
    if (!gasCheck.passed) {
      recommendations.push('New gas lines require separate Plumbing/Gas permit.');
    }
    
    // ─────────────────────────────────────────────────────────
    // CHECK 6: Installation Location
    // ─────────────────────────────────────────────────────────
    const locationCheck = this.checkLocation(project.equipment);
    checks.push(locationCheck);
    
    if (locationCheck.severity === 'warning') {
      recommendations.push('Roof-mounted equipment may require structural review if supports are modified.');
    }
    
    // ─────────────────────────────────────────────────────────
    // CHECK 7: Valuation
    // ─────────────────────────────────────────────────────────
    const valuationCheck = this.checkValuation(project);
    checks.push(valuationCheck);
    
    // ─────────────────────────────────────────────────────────
    // CALCULATE RESULT
    // ─────────────────────────────────────────────────────────
    const passedChecks = checks.filter(c => c.passed).length;
    const failedChecks = checks.filter(c => c.severity === 'fail').length;
    const warningChecks = checks.filter(c => c.severity === 'warning').length;
    
    // Determine permit type
    let permitType: 'express' | 'plan-review' | 'requires-consultation';
    let eligible: boolean;
    
    if (failedChecks === 0) {
      permitType = 'express';
      eligible = true;
    } else if (failedChecks <= 2) {
      permitType = 'plan-review';
      eligible = false;
    } else {
      permitType = 'requires-consultation';
      eligible = false;
    }
    
    // Calculate estimated fee (if eligible)
    let estimatedFee: number | undefined;
    if (eligible) {
      estimatedFee = this.calculateEstimatedFee(project);
    }
    
    return {
      eligible,
      permitType,
      checks,
      passedChecks,
      failedChecks,
      warningChecks,
      estimatedFee,
      recommendations
    };
  }
  
  // ─────────────────────────────────────────────────────────
  // INDIVIDUAL CHECKS
  // ─────────────────────────────────────────────────────────
  
  private checkPropertyType(project: ProjectData): EligibilityCheck {
    const isResidential = project.propertyType === 'residential';
    
    return {
      name: 'Property Type',
      passed: isResidential,
      severity: isResidential ? 'pass' : 'fail',
      message: isResidential 
        ? 'Residential property - eligible for Express permit'
        : 'Commercial property - requires Commercial permit process',
      details: `Property type: ${project.propertyType}`
    };
  }
  
  private checkTonnage(equipment: EquipmentData): EligibilityCheck {
    const withinLimit = equipment.tonnage <= PHOENIX_RULES.MAX_TONNAGE_EXPRESS;
    
    return {
      name: 'Equipment Size',
      passed: withinLimit,
      severity: withinLimit ? 'pass' : 'fail',
      message: withinLimit
        ? `${equipment.tonnage} tons - within Express limit of ${PHOENIX_RULES.MAX_TONNAGE_EXPRESS} tons`
        : `${equipment.tonnage} tons exceeds Express limit of ${PHOENIX_RULES.MAX_TONNAGE_EXPRESS} tons`,
      details: `Tonnage: ${equipment.tonnage}, Limit: ${PHOENIX_RULES.MAX_TONNAGE_EXPRESS}`
    };
  }
  
  private checkLikeForLike(project: ProjectData): EligibilityCheck {
    const isReplacement = project.isLikeForLike && !project.equipment.isNewLocation;
    
    // Check if tonnage is similar (within 1 ton of existing)
    let tonnageSimilar = true;
    if (project.existingTonnage) {
      tonnageSimilar = Math.abs(project.equipment.tonnage - project.existingTonnage) <= 1;
    }
    
    const passed = isReplacement && tonnageSimilar;
    
    return {
      name: 'Like-for-Like Replacement',
      passed,
      severity: passed ? 'pass' : (project.equipment.isNewLocation ? 'fail' : 'warning'),
      message: passed
        ? 'Replacing existing equipment in same location'
        : project.equipment.isNewLocation
          ? 'New installation location requires additional review'
          : 'Significant capacity change may require review',
      details: project.existingTonnage 
        ? `Existing: ${project.existingTonnage} tons, New: ${project.equipment.tonnage} tons`
        : 'No existing equipment info provided'
    };
  }
  
  private checkElectrical(equipment: EquipmentData): EligibilityCheck {
    const noUpgrade = !equipment.requiresElectricalUpgrade && 
                      equipment.amperage <= PHOENIX_RULES.MAX_AMPERAGE_WITHOUT_PERMIT;
    
    return {
      name: 'Electrical Requirements',
      passed: noUpgrade,
      severity: noUpgrade ? 'pass' : 'fail',
      message: noUpgrade
        ? 'No electrical panel upgrade required'
        : 'Electrical upgrade required - separate Electrical permit needed',
      details: `Amperage: ${equipment.amperage}A, Upgrade needed: ${equipment.requiresElectricalUpgrade}`
    };
  }
  
  private checkGasLine(equipment: EquipmentData): EligibilityCheck {
    // Only relevant for gas furnaces
    if (equipment.fuelType !== 'gas') {
      return {
        name: 'Gas Line Requirements',
        passed: true,
        severity: 'pass',
        message: 'Electric system - no gas line check needed',
        details: `Fuel type: ${equipment.fuelType || 'electric'}`
      };
    }
    
    const noNewGasLine = !equipment.requiresNewGasLine;
    
    return {
      name: 'Gas Line Requirements',
      passed: noNewGasLine,
      severity: noNewGasLine ? 'pass' : 'fail',
      message: noNewGasLine
        ? 'Using existing gas line - no additional permit needed'
        : 'New gas line requires separate Plumbing/Gas permit',
      details: `New gas line required: ${equipment.requiresNewGasLine}`
    };
  }
  
  private checkLocation(equipment: EquipmentData): EligibilityCheck {
    const isRoof = equipment.location === 'roof';
    const isNewRoofLocation = isRoof && equipment.isNewLocation;
    
    if (!isRoof) {
      return {
        name: 'Installation Location',
        passed: true,
        severity: 'pass',
        message: `${equipment.location} mount - standard installation`,
        details: `Location: ${equipment.location}`
      };
    }
    
    if (isNewRoofLocation) {
      return {
        name: 'Installation Location',
        passed: false,
        severity: 'fail',
        message: 'New roof installation may require structural review',
        details: 'New roof-mounted equipment requires structural engineering review'
      };
    }
    
    return {
      name: 'Installation Location',
      passed: true,
      severity: 'warning',
      message: 'Roof mount replacement - verify supports are adequate',
      details: 'Replacing existing roof-mounted equipment'
    };
  }
  
  private checkValuation(project: ProjectData): EligibilityCheck {
    const withinLimit = project.estimatedValue <= PHOENIX_RULES.MAX_VALUATION_EXPRESS;
    
    return {
      name: 'Project Valuation',
      passed: withinLimit,
      severity: withinLimit ? 'pass' : 'warning',
      message: withinLimit
        ? `$${project.estimatedValue.toLocaleString()} - within standard range`
        : `$${project.estimatedValue.toLocaleString()} - high value may trigger additional review`,
      details: `Valuation: $${project.estimatedValue}, Threshold: $${PHOENIX_RULES.MAX_VALUATION_EXPRESS}`
    };
  }
  
  // ─────────────────────────────────────────────────────────
  // FEE CALCULATION
  // ─────────────────────────────────────────────────────────
  
  private calculateEstimatedFee(project: ProjectData): number {
    // Base mechanical permit fee
    let fee = PHOENIX_RULES.BASE_FEES.mechanical;
    
    // Add valuation-based fee
    const valuationFee = project.estimatedValue * PHOENIX_RULES.VALUATION_FEE_RATE;
    fee += valuationFee;
    
    // Round to nearest $0.50
    fee = Math.ceil(fee * 2) / 2;
    
    return fee;
  }
}

// ============================================================
// CONVENIENCE EXPORT
// ============================================================

export const eligibilityChecker = new ExpressEligibilityChecker();

// ============================================================
// CLI TEST
// ============================================================

async function main() {
  const checker = new ExpressEligibilityChecker();
  
  console.log('═══════════════════════════════════════════');
  console.log('  FlashPermit Express Eligibility Checker');
  console.log('═══════════════════════════════════════════\n');
  
  // Test projects
  const testProjects: { name: string; project: ProjectData }[] = [
    {
      name: 'Standard 3-Ton AC+Furnace Replacement',
      project: {
        propertyType: 'residential',
        isLikeForLike: true,
        existingTonnage: 3,
        estimatedValue: 5000,
        equipment: {
          type: 'split-system',
          tonnage: 3,
          location: 'ground',
          isNewLocation: false,
          voltage: '240V',
          amperage: 30,
          requiresElectricalUpgrade: false,
          requiresNewGasLine: false,
          fuelType: 'gas'
        }
      }
    },
    {
      name: '6-Ton System (Over Limit)',
      project: {
        propertyType: 'residential',
        isLikeForLike: true,
        existingTonnage: 5,
        estimatedValue: 8000,
        equipment: {
          type: 'split-system',
          tonnage: 6,
          location: 'ground',
          isNewLocation: false,
          voltage: '240V',
          amperage: 50,
          requiresElectricalUpgrade: false,
          requiresNewGasLine: false,
          fuelType: 'gas'
        }
      }
    },
    {
      name: 'Commercial HVAC',
      project: {
        propertyType: 'commercial',
        isLikeForLike: true,
        existingTonnage: 4,
        estimatedValue: 15000,
        equipment: {
          type: 'package-unit',
          tonnage: 4,
          location: 'roof',
          isNewLocation: false,
          voltage: '240V',
          amperage: 40,
          requiresElectricalUpgrade: false,
          requiresNewGasLine: false,
          fuelType: 'gas'
        }
      }
    },
    {
      name: 'New Installation (Not Replacement)',
      project: {
        propertyType: 'residential',
        isLikeForLike: false,
        estimatedValue: 7000,
        equipment: {
          type: 'mini-split',
          tonnage: 2,
          location: 'ground',
          isNewLocation: true,
          voltage: '240V',
          amperage: 25,
          requiresElectricalUpgrade: false,
          requiresNewGasLine: false,
          fuelType: 'electric'
        }
      }
    },
    {
      name: 'Requires Electrical Upgrade',
      project: {
        propertyType: 'residential',
        isLikeForLike: true,
        existingTonnage: 3,
        estimatedValue: 6000,
        equipment: {
          type: 'split-system',
          tonnage: 4,
          location: 'ground',
          isNewLocation: false,
          voltage: '240V',
          amperage: 250,
          requiresElectricalUpgrade: true,
          requiresNewGasLine: false,
          fuelType: 'electric'
        }
      }
    }
  ];
  
  for (const { name, project } of testProjects) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📋 Test: ${name}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    
    const result = checker.check(project);
    
    // Show result
    console.log(`   Result: ${result.eligible ? '✅ ELIGIBLE' : '❌ NOT ELIGIBLE'}`);
    console.log(`   Permit Type: ${result.permitType.toUpperCase()}`);
    console.log(`   Checks: ${result.passedChecks} passed, ${result.failedChecks} failed, ${result.warningChecks} warnings`);
    
    if (result.estimatedFee) {
      console.log(`   Estimated Fee: $${result.estimatedFee.toFixed(2)}`);
    }
    
    console.log('\n   Check Details:');
    for (const check of result.checks) {
      const icon = check.severity === 'pass' ? '✅' : check.severity === 'fail' ? '❌' : '⚠️';
      console.log(`   ${icon} ${check.name}: ${check.message}`);
    }
    
    if (result.recommendations.length > 0) {
      console.log('\n   Recommendations:');
      for (const rec of result.recommendations) {
        console.log(`   💡 ${rec}`);
      }
    }
  }
  
  console.log('\n═══════════════════════════════════════════');
  console.log('  Test Complete');
  console.log('═══════════════════════════════════════════\n');
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
