#!/usr/bin/env npx tsx
/**
 * FlashPermit HVAC Bot Test Runner
 * 
 * Usage:
 *   npx tsx test-hvac-types.ts ac-only
 *   npx tsx test-hvac-types.ts furnace-only
 *   npx tsx test-hvac-types.ts mini-split
 *   npx tsx test-hvac-types.ts ac-furnace
 *   npx tsx test-hvac-types.ts --all
 * 
 * Prerequisites:
 *   - .env.local with SHAPE_PHX_USERNAME, SHAPE_PHX_PASSWORD
 *   - Azure OpenAI credentials for AI Vision steps
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

// ============================================================
// TEST DATA FOR EACH HVAC TYPE
// ============================================================

const TEST_DATA = {
  'ac-only': {
    installationType: 'ac-only',
    useType: 'Single Family',
    
    // Property - VERIFIED ADDRESS ✅
    streetAddress: '3142 W CARIBBEAN LN',
    city: 'Phoenix',
    state: 'AZ',
    zipCode: '85053',
    parcelNumber: '',
    
    // Contractor
    contractorName: 'Desert Cool HVAC LLC',
    rocLicenseNumber: 'ROC123456',
    cityPrivilegeLicense: 'PHX-2024-12345',
    contractorPhone: '602-555-0101',
    contractorEmail: 'permits@desertcool.com',
    
    // AC Equipment
    acManufacturer: 'Carrier',
    acModel: '24ACC636A003',
    acSerialNumber: '2623E12345',
    acBtu: 36000,
    acVoltage: '240V',
    acSeer: '16',
    acRefrigerant: 'R-410A',
    
    // Job Details
    equipmentTonnage: 3,
    electricalAmps: 30,
    valuationCost: 4500,
    equipmentLocation: 'same-location',
    scopeDescription: 'Replace existing AC unit - like for like',
  },
  
  'furnace-only': {
    installationType: 'furnace-only',
    useType: 'Single Family',
    
    // Property - VERIFIED ADDRESS ✅
    streetAddress: '7520 N 15TH AVE',
    city: 'Phoenix',
    state: 'AZ',
    zipCode: '85021',
    parcelNumber: '',
    
    // Contractor
    contractorName: 'Desert Cool HVAC LLC',
    rocLicenseNumber: 'ROC123456',
    cityPrivilegeLicense: 'PHX-2024-12345',
    contractorPhone: '602-555-0101',
    contractorEmail: 'permits@desertcool.com',
    
    // Furnace Equipment
    furnaceManufacturer: 'Lennox',
    furnaceModel: 'ML180UH090P48C',
    furnaceSerialNumber: '5823G67890',
    furnaceBtu: 90000,
    furnaceFuelType: 'gas',
    
    // Job Details
    equipmentTonnage: 3,
    electricalAmps: 15,
    valuationCost: 3500,
    equipmentLocation: 'same-location',
    scopeDescription: 'Replace existing gas furnace - like for like',
  },
  
  'mini-split': {
    installationType: 'mini-split',
    useType: 'Single Family',
    
    // Property - VERIFIED ADDRESS ✅
    streetAddress: '3825 E CAMELBACK RD',
    city: 'Phoenix',
    state: 'AZ',
    zipCode: '85018',
    parcelNumber: '',
    
    // Contractor
    contractorName: 'Desert Cool HVAC LLC',
    rocLicenseNumber: 'ROC123456',
    cityPrivilegeLicense: 'PHX-2024-12345',
    contractorPhone: '602-555-0101',
    contractorEmail: 'permits@desertcool.com',
    
    // Mini-Split Equipment
    manufacturer: 'Mitsubishi',
    model: 'MSZ-GL24NA',
    serialNumber: 'MZ24K98765',
    btu: 24000,
    voltage: '240V',
    seer: '20',
    refrigerant: 'R-410A',
    numberOfZones: 1,
    indoorUnitType: 'wall-mounted',
    outdoorUnitType: 'single-zone',
    
    // Job Details
    equipmentTonnage: 2,
    electricalAmps: 25,
    valuationCost: 5000,
    equipmentLocation: 'same-location',
    scopeDescription: 'Install ductless mini-split system',
  },
  
  'ac-furnace': {
    installationType: 'ac-furnace',
    useType: 'Single Family',
    
    // Property - VERIFIED ADDRESS ✅
    streetAddress: '3825 E CAMELBACK RD',
    city: 'Phoenix',
    state: 'AZ',
    zipCode: '85018',
    parcelNumber: '',
    
    // Contractor
    contractorName: 'Desert Cool HVAC LLC',
    rocLicenseNumber: 'ROC123456',
    cityPrivilegeLicense: 'PHX-2024-12345',
    contractorPhone: '602-555-0101',
    contractorEmail: 'permits@desertcool.com',
    
    // AC Equipment
    acManufacturer: 'Trane',
    acModel: 'XR15-060',
    acSerialNumber: 'TR2024AC001',
    acBtu: 60000,
    acVoltage: '240V',
    acSeer: '15',
    acRefrigerant: 'R-410A',
    
    // Furnace Equipment
    furnaceManufacturer: 'Trane',
    furnaceModel: 'S9X2B080U4PSB',
    furnaceSerialNumber: 'TR2024FU001',
    furnaceBtu: 80000,
    furnaceFuelType: 'gas',
    
    // Job Details
    equipmentTonnage: 5,
    electricalAmps: 50,
    valuationCost: 8500,
    equipmentLocation: 'same-location',
    scopeDescription: 'Replace AC and furnace - complete system',
  },
};

// ============================================================
// MAIN TEST RUNNER
// ============================================================

async function runTest(installationType: string) {
  console.log('\n' + '═'.repeat(60));
  console.log(`  FLASHPERMIT BOT TEST: ${installationType.toUpperCase()}`);
  console.log('═'.repeat(60) + '\n');
  
  // Check for saved session file
  const fs = await import('fs');
  const path = await import('path');
  const sessionPath = path.join(process.cwd(), 'shape-phx-session.json');
  
  if (!fs.existsSync(sessionPath)) {
    console.error('❌ No saved session found!');
    console.error(`   Expected session at: ${sessionPath}`);
    console.error('');
    console.error('   To create a session, run:');
    console.error('   npx tsx lib/save-session.ts');
    console.error('');
    console.error('   This will open a browser where you can log in manually.');
    console.error('   The session will be saved for future bot runs.');
    process.exit(1);
  }
  
  console.log(`✅ Found saved session at: ${sessionPath}\n`);
  
  // Check for Azure OpenAI (for AI Vision steps)
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const azureKey = process.env.AZURE_OPENAI_API_KEY;
  
  if (!azureEndpoint || !azureKey) {
    console.warn('⚠️  Missing Azure OpenAI credentials');
    console.warn('   AI Vision steps may fail');
    console.warn('   Add to .env.local:');
    console.warn('   AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com');
    console.warn('   AZURE_OPENAI_API_KEY=your_key');
    console.warn('');
  }
  
  // Get test data
  const testData = TEST_DATA[installationType as keyof typeof TEST_DATA];
  
  if (!testData) {
    console.error(`❌ Unknown installation type: ${installationType}`);
    console.error('   Valid types: ac-only, furnace-only, mini-split, ac-furnace');
    process.exit(1);
  }
  
  console.log('📋 Test Data:');
  console.log(`   Type: ${testData.installationType}`);
  console.log(`   Address: ${testData.streetAddress}, ${testData.city}, ${testData.state} ${testData.zipCode}`);
  console.log(`   Contractor: ${testData.contractorName}`);
  console.log(`   Tonnage: ${testData.equipmentTonnage} tons`);
  console.log(`   Valuation: $${testData.valuationCost}`);
  console.log('');
  
  // Import and run the bot
  try {
    console.log('🤖 Starting bot...\n');
    
    // Dynamic import of the bot - try different export styles
    const botModule = await import('./lib/playwright-bot');
    
    // Debug: Show what's exported
    console.log('📦 Available exports:', Object.keys(botModule));
    
    // Try to find the bot class (could be default export or named export)
    const BotClass = botModule.FlashPermitHybridBot ||
                     botModule.HybridPermitBot || 
                     botModule.default || 
                     botModule.PermitBot ||
                     botModule.Bot;
    
    if (!BotClass) {
      console.error('❌ Could not find bot class in playwright-bot.ts');
      console.error('   Available exports:', Object.keys(botModule));
      process.exit(1);
    }
    
    const bot = new BotClass({
      headless: false,  // Show browser for testing
      slowMo: 100,      // Slow down for visibility
      sessionPath: 'shape-phx-session.json',  // Use saved session JSON file
    });
    
    // Convert test data to PermitData format
    const permitData = {
      ...testData,
    };
    
    // Run the bot
    // Try different method names
    const submitMethod = bot.submitPermit || bot.submit || bot.run || bot.execute;
    
    if (typeof submitMethod !== 'function') {
      console.error('❌ Could not find submit method on bot');
      console.error('   Available methods:', Object.keys(bot));
      process.exit(1);
    }
    
    const result = await submitMethod.call(bot, permitData);
    
    console.log('\n' + '─'.repeat(60));
    if (result.success) {
      console.log('✅ TEST PASSED!');
      console.log(`   Reference: ${result.referenceNumber || 'N/A'}`);
      console.log(`   Status: ${result.status}`);
    } else {
      console.log('❌ TEST FAILED!');
      console.log(`   Error: ${result.error}`);
      console.log(`   Step: ${result.failedAtStep || 'Unknown'}`);
    }
    console.log('─'.repeat(60) + '\n');
    
    return result;
    
  } catch (error: any) {
    console.error('\n❌ Bot execution failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// ============================================================
// CLI ENTRY POINT
// ============================================================

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
FlashPermit HVAC Bot Test Runner
================================

Usage:
  npx tsx test-hvac-types.ts <type>

Types:
  ac-only       Test AC-only replacement
  furnace-only  Test furnace-only replacement
  mini-split    Test mini-split installation
  ac-furnace    Test AC + furnace replacement
  --all         Run all tests sequentially

Examples:
  npx tsx test-hvac-types.ts ac-only
  npx tsx test-hvac-types.ts --all
`);
  process.exit(0);
}

async function main() {
  if (args[0] === '--all') {
    console.log('🚀 Running ALL HVAC type tests...\n');
    
    const types = ['ac-only', 'furnace-only', 'mini-split', 'ac-furnace'];
    const results: Record<string, boolean> = {};
    
    for (const type of types) {
      const result = await runTest(type);
      results[type] = result?.success || false;
      
      // Wait between tests
      console.log('⏳ Waiting 5 seconds before next test...\n');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('  TEST SUMMARY');
    console.log('═'.repeat(60));
    for (const [type, passed] of Object.entries(results)) {
      console.log(`  ${passed ? '✅' : '❌'} ${type}`);
    }
    console.log('═'.repeat(60) + '\n');
    
  } else {
    await runTest(args[0]);
  }
}

main().catch(console.error);