/**
 * FlashPermit Step Analyzer
 * 
 * Standalone tool to analyze a specific portal step with AI Vision.
 * Useful for debugging and understanding what the AI sees.
 * 
 * Usage: 
 *   npx tsx lib/analyze-step.ts [step-number]
 *   npx tsx lib/analyze-step.ts 7
 *   npx tsx lib/analyze-step.ts 8
 */

import { chromium } from 'playwright';
import { createAnalyzerFromEnv, PermitData } from './ai-form-analyzer';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// Load .env.local first (Next.js convention), fallback to .env
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
  console.log('📁 Loaded .env.local');
} else if (fs.existsSync('.env')) {
  dotenv.config({ path: '.env' });
  console.log('📁 Loaded .env');
} else {
  console.log('⚠️ No .env or .env.local found');
}

const TEST_PERMIT_DATA: PermitData = {
  rocLicenseNumber: 'ROC123456',
  cityPrivilegeLicense: 'PL789012',
  contractorName: 'Einstein Heating & Cooling',
  contractorPhone: '(602) 555-1234',
  contractorEmail: 'permits@einsteinheating.com',
  streetAddress: '3825 E CAMELBACK RD',
  city: 'Phoenix',
  state: 'AZ',
  zipCode: '85018',
  permitType: 'mechanical',
  workType: 'replacement',
  valuationCost: 5000,
  equipmentTonnage: 3.5,
  manufacturer: 'Carrier',
  model: '24ACC636A003',
  btu: 36000,
  installationType: 'ac-furnace'
};

async function analyzeCurrentStep(stepNumber: number = 7) {
  console.log('═══════════════════════════════════════════');
  console.log(`  FlashPermit Step ${stepNumber} Analyzer`);
  console.log('═══════════════════════════════════════════\n');

  // Create analyzer
  const analyzer = createAnalyzerFromEnv();
  console.log('✅ AI Analyzer initialized\n');

  // Launch browser with saved session
  const browser = await chromium.launch({ headless: false });
  
  let context;
  try {
    context = await browser.newContext({
      storageState: 'shape-phx-session.json',
      ignoreHTTPSErrors: true,  // Fix for ERR_CERT_AUTHORITY_INVALID
    });
    console.log('✅ Loaded saved session');
  } catch {
    context = await browser.newContext({
      ignoreHTTPSErrors: true,  // Fix for ERR_CERT_AUTHORITY_INVALID
    });
    console.log('⚠️ No saved session - will need to login manually');
  }

  const page = await context.newPage();

  // Block Whatfix
  await page.route('**/*whatfix*', route => route.abort());
  await page.route('**/*wfx*', route => route.abort());
  console.log('🛡️ Whatfix blocking enabled\n');

  console.log('📋 Instructions:');
  console.log('1. Navigate to the Phoenix SHAPE portal');
  console.log('2. Login if needed');
  console.log(`3. Navigate to Step ${stepNumber} of the permit wizard`);
  console.log('4. Press ENTER in this terminal when ready to analyze\n');

  // Navigate to portal
  await page.goto('https://shapephx.phoenix.gov/s/');
  console.log('🌐 Portal loaded - please navigate to the step you want to analyze');
  console.log('\n⏳ Waiting 60 seconds for you to navigate...');
  console.log('   (Or press Ctrl+C to cancel)\n');

  // Wait for user to navigate manually
  await page.waitForTimeout(60000);

  console.log('📸 Taking screenshot...');
  
  // Ensure screenshots directory exists
  const screenshotDir = './screenshots';
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  // Take screenshot
  const screenshotPath = path.join(screenshotDir, `step${stepNumber}-analysis-${Date.now()}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`✅ Screenshot saved: ${screenshotPath}\n`);

  // Get base64 for AI
  const screenshotBuffer = await page.screenshot({ fullPage: true });
  const screenshotBase64 = screenshotBuffer.toString('base64');

  console.log('🤖 Analyzing with AI Vision...');
  console.log('   (This may take 5-15 seconds)\n');

  try {
    const analysis = await analyzer.analyzeStep(
      screenshotBase64,
      stepNumber,
      TEST_PERMIT_DATA,
      `Analyzing Step ${stepNumber} of Phoenix SHAPE permit portal for HVAC replacement permit.`
    );

    // Display results
    console.log('═══════════════════════════════════════════');
    console.log('  AI ANALYSIS RESULTS');
    console.log('═══════════════════════════════════════════\n');

    console.log(`📍 Step: ${analysis.stepNumber} - ${analysis.stepName}`);
    console.log(`📊 Confidence: ${analysis.confidence}%`);
    console.log(`⏳ Loading: ${analysis.isLoading}`);
    console.log(`⚠️ Has Errors: ${analysis.hasErrors}`);

    if (analysis.errorMessages.length > 0) {
      console.log('\n❌ Error Messages:');
      analysis.errorMessages.forEach((msg, i) => {
        console.log(`   ${i + 1}. ${msg}`);
      });
    }

    console.log('\n📝 Fields Found:');
    if (analysis.fields.length === 0) {
      console.log('   (No actionable fields detected)');
    } else {
      analysis.fields.forEach((field, i) => {
        console.log(`\n   ${i + 1}. ${field.label}`);
        console.log(`      Type: ${field.type}`);
        console.log(`      Action: ${field.action}`);
        console.log(`      Required: ${field.required}`);
        console.log(`      Selector: ${field.selector}`);
        if (field.value) console.log(`      Suggested Value: ${field.value}`);
        if (field.currentValue) console.log(`      Current Value: ${field.currentValue}`);
      });
    }

    console.log('\n🔘 Next Button Selector:');
    console.log(`   ${analysis.nextButtonSelector}`);

    console.log('\n💡 AI Recommendations:');
    if (analysis.recommendations.length === 0) {
      console.log('   (No specific recommendations)');
    } else {
      analysis.recommendations.forEach((rec, i) => {
        console.log(`   ${i + 1}. ${rec}`);
      });
    }

    // Save analysis to file
    const analysisPath = path.join(screenshotDir, `step${stepNumber}-analysis-${Date.now()}.json`);
    fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));
    console.log(`\n📄 Full analysis saved: ${analysisPath}`);

  } catch (error: any) {
    console.error('\n❌ AI Analysis Error:', error.message);
    console.error('   Make sure your Azure OpenAI credentials are configured in .env');
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('👀 Browser staying open for 2 minutes for inspection...');
  console.log('   Press Ctrl+C to close earlier');
  console.log('═══════════════════════════════════════════\n');

  await page.waitForTimeout(120000);
  await browser.close();
}

// Parse step number from command line
const stepArg = process.argv[2];
const stepNumber = stepArg ? parseInt(stepArg, 10) : 7;

if (isNaN(stepNumber) || stepNumber < 1 || stepNumber > 9) {
  console.error('Usage: npx tsx lib/analyze-step.ts [step-number]');
  console.error('Step number must be between 1 and 9');
  process.exit(1);
}

analyzeCurrentStep(stepNumber).catch(console.error);
