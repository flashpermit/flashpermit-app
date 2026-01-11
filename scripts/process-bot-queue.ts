#!/usr/bin/env npx tsx
/**
 * FlashPermit Bot Queue Processor
 * 
 * Run this script to process all pending_bot permits:
 *   npx tsx scripts/process-bot-queue.ts
 * 
 * Process a single permit:
 *   npx tsx scripts/process-bot-queue.ts --permit-id <uuid>
 * 
 * Options:
 *   --headless       Run browser in headless mode
 *   --dry-run        Show what would be processed without running
 *   --limit N        Process max N permits (default: 10)
 */

import * as fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

import { createClient } from '@supabase/supabase-js';
import { FlashPermitHybridBot } from '../lib/playwright-bot';

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  maxRetries: 3,
  sessionFile: 'shape-phx-session.json',
  screenshotDir: './screenshots',
  delayBetweenPermits: 5000, // 5 seconds between permits
};

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  headless: args.includes('--headless'),
  dryRun: args.includes('--dry-run'),
  permitId: args.includes('--permit-id') ? args[args.indexOf('--permit-id') + 1] : null,
  limit: args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : 10,
};

// Initialize Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ============================================================
// TYPES
// ============================================================

interface PermitRecord {
  id: string;
  user_id: string;
  installation_type: string;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  contractor_name: string;
  contractor_phone: string;
  contractor_email: string;
  roc_license_number: string;
  city_privilege_license: string;
  manufacturer: string;
  model_number: string;
  serial_number: string;
  btu: number;
  voltage: string;
  seer_rating: number;
  refrigerant: string;
  equipment_tonnage: number;
  valuation_cost: number;
  furnace_manufacturer?: string;
  furnace_model?: string;
  furnace_btu?: number;
  furnace_fuel_type?: string;
  workflow_status: string;
  bot_attempts: number;
  created_at: string;
}

interface ProcessResult {
  permitId: string;
  address: string;
  success: boolean;
  newStatus: string;
  permitNumber?: string;
  error?: string;
  botAttempts: number;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  FLASHPERMIT BOT QUEUE PROCESSOR');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`📋 Options: ${JSON.stringify(options, null, 2)}\n`);

  // Check session file
  if (!fs.existsSync(CONFIG.sessionFile)) {
    console.error('❌ Session file not found:', CONFIG.sessionFile);
    console.error('   Run: npx tsx lib/save-session.ts');
    process.exit(1);
  }

  if (options.permitId) {
    // Process single permit
    await processSinglePermit(options.permitId);
  } else {
    // Process queue
    await processQueue();
  }
}

// ============================================================
// PROCESS QUEUE
// ============================================================

async function processQueue() {
  console.log('📬 Fetching pending permits from queue...\n');

  // Fetch pending_bot permits
  const { data: permits, error } = await supabase
    .from('permits')
    .select('*')
    .eq('workflow_status', 'pending_bot')
    .order('created_at', { ascending: true })
    .limit(options.limit);

  if (error) {
    console.error('❌ Failed to fetch queue:', error.message);
    process.exit(1);
  }

  if (!permits || permits.length === 0) {
    console.log('📭 No permits in queue. Nothing to process.\n');
    
    // Show queue stats
    await showQueueStats();
    return;
  }

  console.log(`📋 Found ${permits.length} permit(s) to process:\n`);
  
  // Display permit summary
  permits.forEach((p, i) => {
    console.log(`   ${i + 1}. ${p.street_address}, ${p.city} - ${p.installation_type}`);
  });
  console.log('');

  if (options.dryRun) {
    console.log('🔍 DRY RUN - No permits will be processed.\n');
    return;
  }

  // Process each permit
  const results: ProcessResult[] = [];
  
  for (let i = 0; i < permits.length; i++) {
    const permit = permits[i] as PermitRecord;
    console.log(`\n───────────────────────────────────────────────────────────`);
    console.log(`Processing ${i + 1}/${permits.length}: ${permit.street_address}`);
    console.log(`───────────────────────────────────────────────────────────`);
    
    const result = await processPermit(permit);
    results.push(result);
    
    // Delay between permits (except last one)
    if (i < permits.length - 1) {
      console.log(`\n⏳ Waiting ${CONFIG.delayBetweenPermits / 1000}s before next permit...`);
      await sleep(CONFIG.delayBetweenPermits);
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  PROCESSING COMPLETE');
  console.log('═══════════════════════════════════════════════════════════\n');

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`✅ Successful: ${successful.length}`);
  successful.forEach(r => {
    console.log(`   • ${r.address} → CTR: ${r.permitNumber || 'pending'}`);
  });

  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length}`);
    failed.forEach(r => {
      console.log(`   • ${r.address} → ${r.error} (attempts: ${r.botAttempts})`);
    });
  }

  console.log('');
  await showQueueStats();
}

// ============================================================
// PROCESS SINGLE PERMIT
// ============================================================

async function processSinglePermit(permitId: string) {
  console.log(`🎯 Processing single permit: ${permitId}\n`);

  // Fetch permit
  const { data: permit, error } = await supabase
    .from('permits')
    .select('*')
    .eq('id', permitId)
    .single();

  if (error || !permit) {
    console.error('❌ Permit not found:', error?.message);
    process.exit(1);
  }

  console.log(`📍 Address: ${permit.street_address}, ${permit.city}`);
  console.log(`🔧 Type: ${permit.installation_type}`);
  console.log(`📊 Status: ${permit.workflow_status}`);
  console.log(`🔄 Bot Attempts: ${permit.bot_attempts || 0}\n`);

  if (options.dryRun) {
    console.log('🔍 DRY RUN - Permit will not be processed.\n');
    return;
  }

  const result = await processPermit(permit as PermitRecord);

  console.log('\n───────────────────────────────────────────────────────────');
  console.log('RESULT:');
  console.log(`   Success: ${result.success}`);
  console.log(`   New Status: ${result.newStatus}`);
  if (result.permitNumber) console.log(`   CTR Number: ${result.permitNumber}`);
  if (result.error) console.log(`   Error: ${result.error}`);
  console.log('───────────────────────────────────────────────────────────\n');
}

// ============================================================
// PROCESS PERMIT (Core Logic)
// ============================================================

async function processPermit(permit: PermitRecord): Promise<ProcessResult> {
  const botAttempts = (permit.bot_attempts || 0) + 1;

  // Check max retries
  if (botAttempts > CONFIG.maxRetries) {
    console.log('⚠️ Max retries exceeded, assigning to admin');
    await updatePermitStatus(permit.id, 'pending_admin', {
      bot_error: 'Max retry attempts exceeded',
      bot_attempts: botAttempts,
    });
    return {
      permitId: permit.id,
      address: `${permit.street_address}, ${permit.city}`,
      success: false,
      newStatus: 'pending_admin',
      error: 'Max retry attempts exceeded',
      botAttempts,
    };
  }

  // Update status to processing
  await updatePermitStatus(permit.id, 'bot_processing', {
    bot_attempts: botAttempts,
    bot_last_attempt: new Date().toISOString(),
  });

  // Convert to bot format
  const botPermitData = {
    installationType: permit.installation_type || 'ac-furnace',
    rocLicenseNumber: permit.roc_license_number,
    cityPrivilegeLicense: permit.city_privilege_license,
    contractorName: permit.contractor_name,
    contractorPhone: permit.contractor_phone,
    contractorEmail: permit.contractor_email,
    streetAddress: permit.street_address,
    city: permit.city || 'Phoenix',
    state: permit.state || 'AZ',
    zipCode: permit.zip_code,
    permitType: 'mechanical',
    workType: 'replacement',
    valuationCost: permit.valuation_cost || 5000,
    equipmentTonnage: permit.equipment_tonnage || 3,
    manufacturer: permit.manufacturer,
    model: permit.model_number,
    serialNumber: permit.serial_number,
    btu: permit.btu,
    voltage: permit.voltage,
    seer: permit.seer_rating,
    refrigerant: permit.refrigerant,
    furnaceManufacturer: permit.furnace_manufacturer,
    furnaceModel: permit.furnace_model,
    furnaceBtu: permit.furnace_btu,
    furnaceFuelType: permit.furnace_fuel_type,
  };

  try {
    // Initialize and run bot
    const bot = new FlashPermitHybridBot({
      headless: options.headless,
      sessionFile: CONFIG.sessionFile,
      screenshotDir: CONFIG.screenshotDir,
    });

    const result = await bot.submitPermit(botPermitData);

    if (result.success) {
      console.log(`\n✅ Bot succeeded! CTR: ${result.permitNumber || 'pending'}`);
      await updatePermitStatus(permit.id, 'submitted', {
        portal_status: 'submitted',
        ctr_number: result.permitNumber,
        bot_error: null,
      });
      return {
        permitId: permit.id,
        address: `${permit.street_address}, ${permit.city}`,
        success: true,
        newStatus: 'submitted',
        permitNumber: result.permitNumber,
        botAttempts,
      };
    } else {
      console.log(`\n❌ Bot failed: ${result.error}`);
      const newStatus = botAttempts >= CONFIG.maxRetries ? 'pending_admin' : 'pending_bot';
      await updatePermitStatus(permit.id, newStatus, {
        bot_error: result.error,
      });
      return {
        permitId: permit.id,
        address: `${permit.street_address}, ${permit.city}`,
        success: false,
        newStatus,
        error: result.error,
        botAttempts,
      };
    }
  } catch (error: any) {
    console.error('\n❌ Bot execution error:', error.message);
    const newStatus = botAttempts >= CONFIG.maxRetries ? 'pending_admin' : 'pending_bot';
    await updatePermitStatus(permit.id, newStatus, {
      bot_error: error.message,
    });
    return {
      permitId: permit.id,
      address: `${permit.street_address}, ${permit.city}`,
      success: false,
      newStatus,
      error: error.message,
      botAttempts,
    };
  }
}

// ============================================================
// HELPERS
// ============================================================

async function updatePermitStatus(
  permitId: string,
  workflowStatus: string,
  additionalFields: Record<string, any> = {}
): Promise<void> {
  const { error } = await supabase
    .from('permits')
    .update({
      workflow_status: workflowStatus,
      updated_at: new Date().toISOString(),
      ...additionalFields,
    })
    .eq('id', permitId);

  if (error) {
    console.error('Failed to update permit status:', error);
    throw new Error(`Failed to update permit: ${error.message}`);
  }

  console.log(`📝 Updated permit → ${workflowStatus}`);
}

async function showQueueStats(): Promise<void> {
  const { data: stats } = await supabase
    .from('permits')
    .select('workflow_status');

  if (!stats) return;

  const counts: Record<string, number> = {};
  stats.forEach(row => {
    const status = row.workflow_status || 'unknown';
    counts[status] = (counts[status] || 0) + 1;
  });

  console.log('📊 Queue Statistics:');
  Object.entries(counts).forEach(([status, count]) => {
    console.log(`   ${status}: ${count}`);
  });
  console.log('');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// RUN
// ============================================================

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});