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
 * Parse equipment data from raw text
 */
function parseEquipmentData(text: string): Partial<ExtractedEquipmentData> {
  const data: Partial<ExtractedEquipmentData> = {};
  const upperText = text.toUpperCase();

  // Common manufacturer patterns
  const manufacturers = [
    'CARRIER', 'TRANE', 'LENNOX', 'YORK', 'GOODMAN', 'RHEEM', 
    'RUUD', 'AMERICAN STANDARD', 'BRYANT', 'PAYNE', 'COLEMAN',
    'TEMPSTAR', 'HEIL', 'ARMSTRONG', 'DUCANE', 'LUXAIRE'
  ];

  for (const mfr of manufacturers) {
    if (upperText.includes(mfr)) {
      data.manufacturer = mfr.charAt(0) + mfr.slice(1).toLowerCase();
      break;
    }
  }

  // Model number (usually alphanumeric, 8-20 chars)
  const modelMatch = text.match(/MODEL[:\s#]*([A-Z0-9-]{8,20})/i);
  if (modelMatch) {
    data.model = modelMatch[1];
  }

  // Serial number
  const serialMatch = text.match(/SERIAL[:\s#]*([A-Z0-9-]{8,20})/i);
  if (serialMatch) {
    data.serialNumber = serialMatch[1];
  }

  // BTU (British Thermal Units)
  const btuMatch = text.match(/(\d{2,3})[,\s]?(\d{3})\s*BTU/i);
  if (btuMatch) {
    data.btu = parseInt(btuMatch[1] + btuMatch[2]);
  }

  // Voltage
  const voltageMatch = text.match(/(\d{3}[-/]\d{3})\s*V/i);
  if (voltageMatch) {
    data.voltage = voltageMatch[1];
  } else {
    const simpleVoltageMatch = text.match(/(\d{3})\s*V/i);
    if (simpleVoltageMatch) {
      data.voltage = simpleVoltageMatch[1];
    }
  }

  // SEER rating
  const seerMatch = text.match(/SEER[:\s]*(\d{1,2}\.?\d?)/i);
  if (seerMatch) {
    data.seer = parseFloat(seerMatch[1]);
  }

  // Refrigerant type
  const refrigerantMatch = text.match(/R[-\s]?(\d{3}[A-Z]?)/i);
  if (refrigerantMatch) {
    data.refrigerant = 'R-' + refrigerantMatch[1];
  }

  // Equipment type detection
  if (upperText.includes('AIR CONDITION') || upperText.includes('A/C') || upperText.includes('COOLING')) {
    data.equipmentType = 'hvac';
  } else if (upperText.includes('FURNACE') || upperText.includes('HEATING')) {
    data.equipmentType = 'hvac';
  } else if (upperText.includes('HEAT PUMP')) {
    data.equipmentType = 'hvac';
  } else if (upperText.includes('WATER HEATER')) {
    data.equipmentType = 'plumbing';
  }

  return data;
}

/**
 * Calculate confidence score based on how much data we extracted
 */
function calculateConfidence(data: Partial<ExtractedEquipmentData>): number {
  let score = 0;
  const weights = {
    manufacturer: 20,
    model: 25,
    serialNumber: 25,
    btu: 10,
    voltage: 5,
    seer: 5,
    refrigerant: 5,
    equipmentType: 5,
  };

  for (const [key, weight] of Object.entries(weights)) {
    if (data[key as keyof typeof data]) {
      score += weight;
    }
  }

  return Math.min(score, 100);
}