/**
 * FlashPermit Address Validator
 * 
 * Uses Maricopa County and City of Phoenix GIS APIs to:
 * 1. Normalize addresses to official format
 * 2. Verify jurisdiction (Phoenix vs Tempe/Scottsdale/etc)
 * 3. Get property details (APN, owner, property type)
 * 
 * Waterfall Architecture:
 * Step 1: Maricopa Address Points → Normalize + Get Lat/Long
 * Step 2: Phoenix Zoning Layer → Verify jurisdiction
 * Step 3: Maricopa Assessor → Get APN + Property Type (optional)
 */

// ============================================================
// TYPES
// ============================================================

export interface AddressInput {
  street: string;      // "123 North First Street" or "123 N 1st St"
  city?: string;       // Optional - we'll verify it's Phoenix
  zip?: string;        // Optional - helps narrow search
}

export interface ValidationResult {
  valid: boolean;
  
  // Normalized address (if valid)
  normalizedAddress?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zip?: string;
  
  // Coordinates
  coordinates?: {
    lat: number;
    lng: number;
  };
  
  // Jurisdiction check
  jurisdiction?: string;
  isPhoenix?: boolean;
  
  // Property details (from Assessor)
  parcelInfo?: {
    apn?: string;
    ownerName?: string;
    propertyUseCode?: string;
    propertyType?: 'residential' | 'commercial' | 'unknown';
  };
  
  // Errors
  errors: ValidationError[];
}

export interface ValidationError {
  code: string;
  message: string;
  suggestion?: string;
}

// ============================================================
// API ENDPOINTS
// ============================================================

const ENDPOINTS = {
  // Maricopa County Address Points - "Source of Truth" for address format
  MARICOPA_ADDRESS_POINTS: 'https://services6.arcgis.com/clPWQMwZfdWn4MQZ/ArcGIS/rest/services/Maricopa_County_Address_Points/FeatureServer/0/query',
  
  // Phoenix Zoning - Verify jurisdiction
  PHOENIX_ZONING: 'https://maps.phoenix.gov/pub/rest/services/Public/Zoning/MapServer/0/query',
  
  // Phoenix Parcels - Alternative jurisdiction check
  PHOENIX_PARCELS: 'https://maps.phoenix.gov/pub/rest/services/Public/Parcels/MapServer/0/query',
  
  // Maricopa County Assessor - Get APN, Owner, Property Type
  MARICOPA_ASSESSOR: 'https://maps.mcassessor.maricopa.gov/agso/rest/services/Parcels/MapServer/0/query',
};

// ============================================================
// MAIN VALIDATOR CLASS
// ============================================================

export class AddressValidator {
  private timeout: number;
  
  constructor(config?: { timeout?: number }) {
    this.timeout = config?.timeout || 10000; // 10 second default timeout
  }
  
  /**
   * Main validation method - runs the full waterfall
   */
  async validate(input: AddressInput): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    
    console.log(`🔍 Validating address: "${input.street}"`);
    
    // Step 1: Normalize address via Maricopa County
    console.log('   Step 1: Querying Maricopa Address Points...');
    const addressResult = await this.queryMaricopaAddressPoints(input);
    
    if (!addressResult.found) {
      return {
        valid: false,
        errors: [{
          code: 'ADDRESS_NOT_FOUND',
          message: `Address "${input.street}" not found in Maricopa County records.`,
          suggestion: 'Please verify the street address and try again. Use format: "123 N 1ST ST"'
        }]
      };
    }
    
    console.log(`   ✅ Found: ${addressResult.normalizedAddress}`);
    console.log(`   📍 Coordinates: ${addressResult.lat}, ${addressResult.lng}`);
    
    // Step 2: Verify jurisdiction via Phoenix Zoning
    console.log('   Step 2: Checking Phoenix jurisdiction...');
    const jurisdictionResult = await this.checkPhoenixJurisdiction(
      addressResult.lat!,
      addressResult.lng!
    );
    
    if (!jurisdictionResult.isPhoenix) {
      return {
        valid: false,
        normalizedAddress: addressResult.normalizedAddress,
        coordinates: {
          lat: addressResult.lat!,
          lng: addressResult.lng!
        },
        jurisdiction: jurisdictionResult.jurisdiction,
        isPhoenix: false,
        errors: [{
          code: 'INVALID_JURISDICTION',
          message: `This address is in ${jurisdictionResult.jurisdiction || 'another city'}, not Phoenix.`,
          suggestion: `Please use the ${jurisdictionResult.jurisdiction || 'appropriate city'} permit portal instead.`
        }]
      };
    }
    
    console.log(`   ✅ Confirmed: Address is in PHOENIX`);
    
    // Step 3: Get property details from Assessor (optional enrichment)
    console.log('   Step 3: Fetching property details...');
    const parcelInfo = await this.queryMaricopaAssessor(
      addressResult.lat!,
      addressResult.lng!
    );
    
    if (parcelInfo.found) {
      console.log(`   ✅ APN: ${parcelInfo.apn}`);
      console.log(`   ✅ Property Type: ${parcelInfo.propertyType}`);
    } else {
      console.log('   ⚠️ Could not fetch parcel details (non-critical)');
    }
    
    // Build successful result
    const result: ValidationResult = {
      valid: true,
      normalizedAddress: `${addressResult.normalizedAddress}, PHOENIX, AZ ${addressResult.zip || input.zip || ''}`.trim(),
      streetAddress: addressResult.normalizedAddress,
      city: 'PHOENIX',
      state: 'AZ',
      zip: addressResult.zip || input.zip,
      coordinates: {
        lat: addressResult.lat!,
        lng: addressResult.lng!
      },
      jurisdiction: 'PHOENIX',
      isPhoenix: true,
      errors: []
    };
    
    if (parcelInfo.found) {
      result.parcelInfo = {
        apn: parcelInfo.apn,
        ownerName: parcelInfo.ownerName,
        propertyUseCode: parcelInfo.propertyUseCode,
        propertyType: parcelInfo.propertyType
      };
    }
    
    console.log('   ✅ Validation PASSED\n');
    
    return result;
  }
  
  // ============================================================
  // STEP 1: Maricopa County Address Points
  // ============================================================
  
  private async queryMaricopaAddressPoints(input: AddressInput): Promise<{
    found: boolean;
    normalizedAddress?: string;
    lat?: number;
    lng?: number;
    zip?: string;
  }> {
    try {
      // Build search query - fuzzy match on address
      const searchPattern = this.buildAddressSearchPattern(input.street);
      
      const params = new URLSearchParams({
        where: searchPattern,
        outFields: 'Full_Address,ZIP_Code,ST_PreDir,ST_Name,ST_Type,ST_Number',
        returnGeometry: 'true',
        outSR: '4326', // WGS84 for lat/long
        f: 'json',
        resultRecordCount: '5'
      });
      
      const response = await fetch(`${ENDPOINTS.MARICOPA_ADDRESS_POINTS}?${params}`, {
        signal: AbortSignal.timeout(this.timeout)
      });
      
      if (!response.ok) {
        console.error('   ❌ Maricopa API error:', response.status);
        return { found: false };
      }
      
      const data = await response.json();
      
      if (!data.features || data.features.length === 0) {
        return { found: false };
      }
      
      // Get the best match (first result)
      const feature = data.features[0];
      const attrs = feature.attributes;
      const geom = feature.geometry;
      
      return {
        found: true,
        normalizedAddress: attrs.Full_Address || this.buildNormalizedAddress(attrs),
        lat: geom?.y,
        lng: geom?.x,
        zip: attrs.ZIP_Code?.toString()
      };
      
    } catch (error: any) {
      console.error('   ❌ Address lookup error:', error.message);
      return { found: false };
    }
  }
  
  /**
   * Build a fuzzy search pattern for ArcGIS
   * Converts "123 North First Street" to a LIKE query
   */
  private buildAddressSearchPattern(street: string): string {
    // Normalize input
    let normalized = street.toUpperCase().trim();
    
    // Replace common abbreviations for search
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
      [/\bLANE\b/g, 'LN'],
      [/\bCOURT\b/g, 'CT'],
      [/\bCIRCLE\b/g, 'CIR'],
      [/\bPLACE\b/g, 'PL'],
      [/\bPARKWAY\b/g, 'PKWY'],
      [/\bFIRST\b/g, '1ST'],
      [/\bSECOND\b/g, '2ND'],
      [/\bTHIRD\b/g, '3RD'],
      [/\bFOURTH\b/g, '4TH'],
      [/\bFIFTH\b/g, '5TH'],
    ];
    
    for (const [pattern, replacement] of replacements) {
      normalized = normalized.replace(pattern, replacement);
    }
    
    // Extract street number and rest
    const match = normalized.match(/^(\d+)\s+(.+)$/);
    
    if (match) {
      const streetNumber = match[1];
      const streetRest = match[2]
        .replace(/[,\.]/g, '')  // Remove punctuation
        .split(/\s+/)           // Split into words
        .filter(w => w.length > 0)
        .join('%');             // Join with wildcards
      
      // Build LIKE query: "123 % N % 1ST %"
      return `Full_Address LIKE '${streetNumber} %${streetRest}%'`;
    }
    
    // Fallback: just use wildcards
    const words = normalized.split(/\s+/).filter(w => w.length > 0);
    return `Full_Address LIKE '%${words.join('%')}%'`;
  }
  
  private buildNormalizedAddress(attrs: any): string {
    const parts = [
      attrs.ST_Number,
      attrs.ST_PreDir,
      attrs.ST_Name,
      attrs.ST_Type
    ].filter(Boolean);
    
    return parts.join(' ');
  }
  
  // ============================================================
  // STEP 2: Phoenix Jurisdiction Check
  // ============================================================
  
  private async checkPhoenixJurisdiction(lat: number, lng: number): Promise<{
    isPhoenix: boolean;
    jurisdiction?: string;
  }> {
    try {
      // Query Phoenix Zoning layer with the coordinates
      const params = new URLSearchParams({
        geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
        geometryType: 'esriGeometryPoint',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: '*',
        returnGeometry: 'false',
        f: 'json'
      });
      
      const response = await fetch(`${ENDPOINTS.PHOENIX_ZONING}?${params}`, {
        signal: AbortSignal.timeout(this.timeout)
      });
      
      if (!response.ok) {
        // Try fallback to parcels layer
        return this.checkPhoenixParcels(lat, lng);
      }
      
      const data = await response.json();
      
      // If we get features back, the point is within Phoenix
      if (data.features && data.features.length > 0) {
        return {
          isPhoenix: true,
          jurisdiction: 'PHOENIX'
        };
      }
      
      // No features = outside Phoenix
      return {
        isPhoenix: false,
        jurisdiction: 'Unknown (outside Phoenix city limits)'
      };
      
    } catch (error: any) {
      console.error('   ⚠️ Jurisdiction check error:', error.message);
      // On error, try fallback
      return this.checkPhoenixParcels(lat, lng);
    }
  }
  
  /**
   * Fallback jurisdiction check using Phoenix Parcels layer
   */
  private async checkPhoenixParcels(lat: number, lng: number): Promise<{
    isPhoenix: boolean;
    jurisdiction?: string;
  }> {
    try {
      const params = new URLSearchParams({
        geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
        geometryType: 'esriGeometryPoint',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: '*',
        returnGeometry: 'false',
        f: 'json'
      });
      
      const response = await fetch(`${ENDPOINTS.PHOENIX_PARCELS}?${params}`, {
        signal: AbortSignal.timeout(this.timeout)
      });
      
      if (!response.ok) {
        // Can't verify - assume not Phoenix to be safe
        return { isPhoenix: false, jurisdiction: 'Unable to verify' };
      }
      
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        return {
          isPhoenix: true,
          jurisdiction: 'PHOENIX'
        };
      }
      
      return {
        isPhoenix: false,
        jurisdiction: 'Unknown (not in Phoenix parcel database)'
      };
      
    } catch (error: any) {
      console.error('   ⚠️ Parcels check error:', error.message);
      return { isPhoenix: false, jurisdiction: 'Unable to verify' };
    }
  }
  
  // ============================================================
  // STEP 3: Maricopa Assessor (Property Details)
  // ============================================================
  
  private async queryMaricopaAssessor(lat: number, lng: number): Promise<{
    found: boolean;
    apn?: string;
    ownerName?: string;
    propertyUseCode?: string;
    propertyType?: 'residential' | 'commercial' | 'unknown';
  }> {
    try {
      const params = new URLSearchParams({
        geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
        geometryType: 'esriGeometryPoint',
        spatialRel: 'esriSpatialRelIntersects',
        outFields: '*',
        returnGeometry: 'false',
        f: 'json'
      });
      
      const response = await fetch(`${ENDPOINTS.MARICOPA_ASSESSOR}?${params}`, {
        signal: AbortSignal.timeout(this.timeout)
      });
      
      if (!response.ok) {
        return { found: false };
      }
      
      const data = await response.json();
      
      if (!data.features || data.features.length === 0) {
        return { found: false };
      }
      
      const attrs = data.features[0].attributes;
      
      // Determine property type from use code
      // Common Maricopa County property use codes:
      // 01xx = Residential
      // 02xx = Apartment
      // 03xx = Commercial
      // 04xx = Industrial
      const useCode = attrs.PROPERTY_USE_CODE || attrs.PropertyUseCode || '';
      let propertyType: 'residential' | 'commercial' | 'unknown' = 'unknown';
      
      if (useCode.startsWith('01') || useCode.startsWith('1')) {
        propertyType = 'residential';
      } else if (useCode.startsWith('02') || useCode.startsWith('03') || 
                 useCode.startsWith('2') || useCode.startsWith('3')) {
        propertyType = 'commercial';
      }
      
      return {
        found: true,
        apn: attrs.APN || attrs.PARCEL_ID || attrs.ParcelNumber,
        ownerName: attrs.OWNER_NAME || attrs.OwnerName,
        propertyUseCode: useCode,
        propertyType
      };
      
    } catch (error: any) {
      console.error('   ⚠️ Assessor lookup error:', error.message);
      return { found: false };
    }
  }
}

// ============================================================
// CONVENIENCE EXPORT
// ============================================================

export const addressValidator = new AddressValidator();

// ============================================================
// CLI TEST
// ============================================================

async function main() {
  const validator = new AddressValidator();
  
  console.log('═══════════════════════════════════════════');
  console.log('  FlashPermit Address Validator Test');
  console.log('═══════════════════════════════════════════\n');
  
  // Test addresses
  const testAddresses = [
    { street: '3825 E Camelback Rd' },           // Should pass (Phoenix)
    { street: '123 North First Street' },        // Fuzzy match test
    { street: '2000 E Rio Salado Pkwy' },        // Tempe - should fail jurisdiction
    { street: '7014 E Camelback Rd' },           // Scottsdale - should fail
    { street: '99999 Fake Street' },             // Should fail - not found
  ];
  
  for (const addr of testAddresses) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    const result = await validator.validate(addr);
    
    if (result.valid) {
      console.log('   📍 Result: ✅ VALID');
      console.log(`   📮 Normalized: ${result.normalizedAddress}`);
      console.log(`   🏛️ Jurisdiction: ${result.jurisdiction}`);
      if (result.parcelInfo) {
        console.log(`   🏠 Property Type: ${result.parcelInfo.propertyType}`);
        console.log(`   📋 APN: ${result.parcelInfo.apn}`);
      }
    } else {
      console.log('   📍 Result: ❌ INVALID');
      for (const err of result.errors) {
        console.log(`   ⚠️ ${err.code}: ${err.message}`);
        if (err.suggestion) {
          console.log(`   💡 ${err.suggestion}`);
        }
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
