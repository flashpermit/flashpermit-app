// Load environment variables from .env.local
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local file
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { extractEquipmentData } from './ocr';

// Test with a public sample image
async function testOCR() {
  try {
    // Verify env vars are loaded
    console.log('🔧 Checking environment variables...');
    console.log('AZURE_AI_ENDPOINT:', process.env.AZURE_AI_ENDPOINT ? '✅ Set' : '❌ Not set');
    console.log('AZURE_AI_KEY:', process.env.AZURE_AI_KEY ? '✅ Set' : '❌ Not set');
    console.log('');

    // This is a sample image for testing
    const testImageUrl = 'https://raw.githubusercontent.com/Azure-Samples/cognitive-services-REST-api-samples/master/curl/form-recognizer/rest-api/invoice.png';

    console.log('🧪 Testing OCR with sample image...');
    const result = await extractEquipmentData(testImageUrl);

    console.log('\n✅ OCR Test Results:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Manufacturer:', result.manufacturer || 'Not found');
    console.log('Model:', result.model || 'Not found');
    console.log('Serial Number:', result.serialNumber || 'Not found');
    console.log('BTU:', result.btu || 'Not found');
    console.log('Voltage:', result.voltage || 'Not found');
    console.log('SEER:', result.seer || 'Not found');
    console.log('Refrigerant:', result.refrigerant || 'Not found');
    console.log('Equipment Type:', result.equipmentType || 'Not found');
    console.log('Confidence:', result.confidence + '%');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n📄 Raw Text Preview (first 500 chars):');
    console.log(result.rawText.substring(0, 500));
    console.log('\n✅ OCR test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testOCR();