import { AzureKeyCredential, DocumentAnalysisClient } from '@azure/ai-form-recognizer';

// Lazy-load credentials (only when needed, not at import time)
function getClient(): DocumentAnalysisClient {
  const endpoint = process.env.AZURE_AI_ENDPOINT;
  const key = process.env.AZURE_AI_KEY;

  if (!endpoint || !key) {
    throw new Error(
      'Azure AI credentials not configured. Check .env.local\n' +
      `AZURE_AI_ENDPOINT: ${endpoint ? 'Set' : 'NOT SET'}\n` +
      `AZURE_AI_KEY: ${key ? 'Set' : 'NOT SET'}`
    );
  }

  return new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key));
}

export interface ExtractedEquipmentData {
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  btu?: number;
  voltage?: string;
  seer?: number;
  refrigerant?: string;
  equipmentType?: string;
  rawText: string;
  confidence: number;
}

/**
 * Extract text from equipment nameplate photo
 */
export async function extractEquipmentData(imageUrl: string): Promise<ExtractedEquipmentData> {
  try {
    console.log('🔍 Starting OCR analysis for:', imageUrl);

    // Get client (will throw if credentials not set)
    const client = getClient();

    // Use prebuilt-read model for general text extraction
    const poller = await client.beginAnalyzeDocumentFromUrl('prebuilt-read', imageUrl);
    const result = await poller.pollUntilDone();

    // Extract all text
    let rawText = '';
    if (result.content) {
      rawText = result.content;
    }

    console.log('📄 Extracted text:', rawText);

    // Parse equipment data from text
    const parsed = parseEquipmentData(rawText);

    return {
      ...parsed,
      rawText,
      confidence: calculateConfidence(parsed),
    };
  } catch (error) {
    console.error('❌ OCR Error:', error);
    throw error;
  }
}

/**
 * Parse equipment data from raw text - IMPROVED VERSION
 */
function parseEquipmentData(text: string): Partial<ExtractedEquipmentData> {
  const data: Partial<ExtractedEquipmentData> = {};
  const upperText = text.toUpperCase();

  // ============================================
  // MANUFACTURER DETECTION - EXPANDED LIST
  // ============================================
  const manufacturers = [
    'CARRIER', 'TRANE', 'LENNOX', 'YORK', 'GOODMAN', 'RHEEM', 
    'RUUD', 'AMERICAN STANDARD', 'BRYANT', 'PAYNE', 'COLEMAN',
    'TEMPSTAR', 'HEIL', 'ARMSTRONG', 'DUCANE', 'LUXAIRE',
    'HISENSE', 'FRIGIDAIRE', 'LG', 'SAMSUNG', 'WHIRLPOOL',
    'GE', 'FRIEDRICH', 'MITSUBISHI', 'DAIKIN', 'FUJITSU',
    'HAIER', 'GREE', 'MIDEA', 'TCL', 'HONEYWELL'
  ];

// Try to find manufacturer in first 200 characters (usually at top)
  const topSection = text.substring(0, 200).toUpperCase();
  for (const mfr of manufacturers) {
    if (topSection.includes(mfr) || upperText.includes(mfr)) {
      // Proper case with special handling for multi-word names
      if (mfr.includes(' ')) {
        // Multi-word: "AMERICAN STANDARD" -> "American Standard"
        data.manufacturer = mfr.split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
      } else {
        // Single word: "CARRIER" -> "Carrier"
        data.manufacturer = mfr.charAt(0).toUpperCase() + mfr.slice(1).toLowerCase();
      }
      break;
    }
  }

  // ============================================
  // MODEL NUMBER - IMPROVED PATTERNS
  // ============================================
  // Pattern 1: "MODEL: XXXXX" or "MODEL# XXXXX"
  let modelMatch = text.match(/MODEL[#:\s]+([A-Z0-9][-A-Z0-9]{6,25})/i);
  if (modelMatch) {
    data.model = modelMatch[1].trim();
  } else {
    // Pattern 2: "M/N" or "MN" followed by model
    modelMatch = text.match(/M[\/]?N[:\s]+([A-Z0-9][-A-Z0-9]{6,25})/i);
    if (modelMatch) {
      data.model = modelMatch[1].trim();
    }
  }

  // ============================================
  // SERIAL NUMBER - IMPROVED PATTERNS
  // ============================================
  // Pattern 1: "SERIAL: XXXXX" or "S/N: XXXXX"
  let serialMatch = text.match(/SERIAL[#:\s]+([A-Z0-9]{6,25})/i);
  if (serialMatch) {
    data.serialNumber = serialMatch[1].trim();
  } else {
    // Pattern 2: "S/N" or "SN"
    serialMatch = text.match(/S[\/]?N[:\s]+([A-Z0-9]{6,25})/i);
    if (serialMatch) {
      data.serialNumber = serialMatch[1].trim();
    }
  }

  // ============================================
  // BTU - SUPER FLEXIBLE PATTERNS
  // ============================================
  
  // Pattern 0: Explicit comma format "25,200 Btu/hr"
  let btuMatch = text.match(/(\d{2,3}),(\d{3})\s*Btu/i);
  if (btuMatch) {
    // Combine digits: "25" + "200" = "25200"
    const btuValue = parseInt(btuMatch[1] + btuMatch[2]);
    if (btuValue >= 5000 && btuValue <= 999999) {
      data.btu = btuValue;
    }
  }
  
  // Pattern 0A: REVERSE - "Btu/hr" followed by number on next line
  if (!data.btu) {
    btuMatch = text.match(/Btu\/hr\s*[\r\n]+\s*(\d{2,3})[,\s]?(\d{3})/i);
    if (btuMatch) {
      const btuValue = parseInt(btuMatch[1] + btuMatch[2]);
      if (btuValue >= 5000 && btuValue <= 999999) {
        data.btu = btuValue;
      }
    }
  }

  // Pattern 0B: Just look for "25,200" or "23,500" anywhere (common BTU values)
  if (!data.btu) {
    btuMatch = text.match(/(\d{2})[,\s](\d{3})/);
    if (btuMatch) {
      const btuValue = parseInt(btuMatch[1] + btuMatch[2]);
      // Common BTU ranges: 5000-60000 for residential
      if (btuValue >= 5000 && btuValue <= 60000) {
        data.btu = btuValue;
      }
    }
  }

  // Pattern 1: Any number followed by BTU (if Pattern 0 didn't work)
  if (!data.btu) {
    btuMatch = text.match(/(\d[\d,\s]{3,7})\s*BTU/i);
    if (btuMatch) {
      // Clean up: remove ALL commas, spaces, and dots
      const btuString = btuMatch[1].replace(/[,\s.]/g, '');
      const btuValue = parseInt(btuString);
      // Only accept if > 5000 (real AC units are 5000+ BTU)
      if (btuValue >= 5000 && btuValue <= 999999) {
        data.btu = btuValue;
      }
    }
  }
  
  // Pattern 2: If not found, look specifically near CAPACITY
  if (!data.btu) {
    // Match "CAPACITY" followed by BTU within next 200 chars
    const capacitySection = text.match(/CAPACITY[\s\S]{0,200}/i);
    if (capacitySection) {
      const btuInCapacity = capacitySection[0].match(/(\d[\d,\s]{3,7})\s*BTU/i);
      if (btuInCapacity) {
        const btuString = btuInCapacity[1].replace(/[,\s.]/g, '');
        const btuValue = parseInt(btuString);
        if (btuValue >= 5000 && btuValue <= 999999) {
          data.btu = btuValue;
        }
      }
    }
  }
  
  // Pattern 3: Look for common format "XX,XXX Btu/hr" anywhere
  if (!data.btu) {
    const allBtuMatches = text.matchAll(/(\d{2,3})[,\s]+(\d{3})\s*Btu/gi);
    for (const match of allBtuMatches) {
      const btuString = (match[1] + match[2]).replace(/\D/g, '');
      const btuValue = parseInt(btuString);
      if (btuValue >= 5000 && btuValue <= 999999) {
        data.btu = btuValue;
        break; // Take first valid match
      }
    }
  }
  // ============================================
  // VOLTAGE - IMPROVED PATTERNS
  // ============================================
  // Pattern 1: "208-230V" or "115V" or "220V"
  let voltageMatch = text.match(/(\d{3}[-\/]\d{3})\s*V/i);
  if (voltageMatch) {
    data.voltage = voltageMatch[1];
  } else {
    // Pattern 2: Simple voltage "115V" or "220V"
    voltageMatch = text.match(/(\d{3})\s*V[^\w]/i);
    if (voltageMatch) {
      data.voltage = voltageMatch[1];
    } else {
      // Pattern 3: "1PH/115V" format
      voltageMatch = text.match(/(\d{1,3})V/i);
      if (voltageMatch) {
        data.voltage = voltageMatch[1];
      }
    }
  }

  // ============================================
  // SEER RATING - IMPROVED
  // ============================================
  // Pattern 1: "SEER: 16" or "SEER 16.5"
  let seerMatch = text.match(/SEER[:\s]*(\d{1,2}\.?\d?)/i);
  if (seerMatch) {
    data.seer = parseFloat(seerMatch[1]);
  } else {
    // Pattern 2: "EER" (Energy Efficiency Ratio) - similar to SEER
    const eerMatch = text.match(/EER[:\s]*(\d{1,2}\.?\d?)/i);
    if (eerMatch) {
      // EER is roughly SEER/1.1, but we'll just note it
      data.seer = parseFloat(eerMatch[1]);
    }
  }

  // ============================================
  // REFRIGERANT - IMPROVED PATTERNS
  // ============================================
  // Pattern 1: "R410A" or "R-410A" or "R 410A"
  let refrigerantMatch = text.match(/R[-\s]?(\d{2,3}[A-Z]?)/i);
  if (refrigerantMatch) {
    // Standardize format: "R-410A"
    const refNum = refrigerantMatch[1].toUpperCase();
    data.refrigerant = 'R-' + refNum;
  }
  
  // Special case: Fix common OCR errors
  if (data.refrigerant === 'R-750') {
    // OCR often misreads R-410A as R-750
    // Check if "410" appears anywhere in text
    if (text.match(/410/)) {
      data.refrigerant = 'R-410A';
    }
  }

  // ============================================
  // EQUIPMENT TYPE - IMPROVED DETECTION
  // ============================================
  if (upperText.includes('AIR CONDITION') || 
      upperText.includes('A/C') || 
      upperText.includes('COOLING') ||
      upperText.includes('PORTABLE AIR')) {
    data.equipmentType = 'hvac';
  } else if (upperText.includes('FURNACE') || 
             upperText.includes('HEATING') ||
             upperText.includes('HEAT PUMP')) {
    data.equipmentType = 'hvac';
  } else if (upperText.includes('WATER HEATER') ||
             upperText.includes('TANKLESS')) {
    data.equipmentType = 'plumbing';
  } else if (upperText.includes('ELECTRICAL PANEL') ||
             upperText.includes('BREAKER')) {
    data.equipmentType = 'electrical';
  }

  return data;
}

/**
 * Calculate confidence score - IMPROVED WEIGHTS
 */
function calculateConfidence(data: Partial<ExtractedEquipmentData>): number {
  let score = 0;
  
  // Updated weights based on importance for permits
  const weights = {
    manufacturer: 15,      // Important but not critical
    model: 30,            // CRITICAL - unique identifier
    serialNumber: 20,     // CRITICAL - unique identifier
    btu: 15,             // Important for capacity
    voltage: 10,         // Important for electrical
    seer: 5,             // Nice to have
    refrigerant: 5,      // Nice to have
    equipmentType: 10,   // Important for routing
  };

  for (const [key, weight] of Object.entries(weights)) {
    if (data[key as keyof typeof data]) {
      score += weight;
    }
  }

  return Math.min(score, 100);
}