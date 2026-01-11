/**
 * FlashPermit Bot Wrapper API
 * 
 * Endpoints:
 * - POST /api/bot/process-permit - Process a single permit by ID
 * - POST /api/bot/process-permit?action=process-queue - Process all pending_bot permits
 * 
 * This API:
 * 1. Reads permit data from Supabase
 * 2. Triggers the Playwright bot
 * 3. Updates permit status based on result
 * 4. Falls back to admin on failure (after max retries)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Bot configuration
const BOT_CONFIG = {
  maxRetries: 3,
  sessionFile: 'shape-phx-session.json',
  screenshotDir: './screenshots',
  headless: true, // Run headless in production
};

// Initialize Supabase with service role for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ============================================================
// TYPES
// ============================================================

interface PermitData {
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
}

interface BotResult {
  success: boolean;
  permitNumber?: string;
  error?: string;
  stepsCompleted: number;
  screenshots: string[];
}

interface ProcessResult {
  permitId: string;
  success: boolean;
  newStatus: string;
  permitNumber?: string;
  error?: string;
  botAttempts: number;
}

// ============================================================
// MAIN HANDLER
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // Check for API key authentication (simple security)
    const apiKey = request.headers.get('x-api-key');
    const expectedKey = process.env.BOT_API_KEY;
    
    if (expectedKey && apiKey !== expectedKey) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (action === 'process-queue') {
      // Process all pending_bot permits
      return await processQueue();
    } else {
      // Process single permit by ID
      const body = await request.json();
      const { permitId } = body;

      if (!permitId) {
        return NextResponse.json(
          { error: 'permitId is required' },
          { status: 400 }
        );
      }

      const result = await processPermit(permitId);
      return NextResponse.json(result);
    }
  } catch (error: any) {
    console.error('Bot API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// ============================================================
// PROCESS QUEUE - All pending_bot permits
// ============================================================

async function processQueue(): Promise<NextResponse> {
  console.log('🤖 Processing bot queue...');

  // Fetch all permits with workflow_status = 'pending_bot'
  const { data: permits, error } = await supabase
    .from('permits')
    .select('id')
    .eq('workflow_status', 'pending_bot')
    .order('created_at', { ascending: true })
    .limit(10); // Process max 10 at a time

  if (error) {
    console.error('Failed to fetch queue:', error);
    return NextResponse.json(
      { error: 'Failed to fetch permit queue', details: error.message },
      { status: 500 }
    );
  }

  if (!permits || permits.length === 0) {
    console.log('📭 No permits in queue');
    return NextResponse.json({
      message: 'No permits to process',
      processed: 0,
      results: [],
    });
  }

  console.log(`📋 Found ${permits.length} permits to process`);

  // Process each permit
  const results: ProcessResult[] = [];
  for (const permit of permits) {
    try {
      const result = await processPermit(permit.id);
      results.push(result);
      
      // Small delay between permits to avoid overwhelming the portal
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error: any) {
      results.push({
        permitId: permit.id,
        success: false,
        newStatus: 'pending_admin',
        error: error.message,
        botAttempts: 0,
      });
    }
  }

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`✅ Processed ${results.length} permits: ${successful} success, ${failed} failed`);

  return NextResponse.json({
    message: `Processed ${results.length} permits`,
    processed: results.length,
    successful,
    failed,
    results,
  });
}

// ============================================================
// PROCESS SINGLE PERMIT
// ============================================================

async function processPermit(permitId: string): Promise<ProcessResult> {
  console.log(`\n🎯 Processing permit: ${permitId}`);

  // 1. Fetch permit data
  const { data: permit, error: fetchError } = await supabase
    .from('permits')
    .select('*')
    .eq('id', permitId)
    .single();

  if (fetchError || !permit) {
    console.error('Failed to fetch permit:', fetchError);
    return {
      permitId,
      success: false,
      newStatus: 'error',
      error: 'Permit not found',
      botAttempts: 0,
    };
  }

  // 2. Check if already processed
  if (permit.workflow_status === 'submitted') {
    console.log('⚠️ Permit already submitted');
    return {
      permitId,
      success: true,
      newStatus: 'submitted',
      permitNumber: permit.ctr_number,
      botAttempts: permit.bot_attempts || 0,
    };
  }

  // 3. Check max retries
  const botAttempts = (permit.bot_attempts || 0) + 1;
  if (botAttempts > BOT_CONFIG.maxRetries) {
    console.log('⚠️ Max retries exceeded, assigning to admin');
    await updatePermitStatus(permitId, 'pending_admin', {
      bot_error: 'Max retry attempts exceeded',
      bot_attempts: botAttempts,
    });
    return {
      permitId,
      success: false,
      newStatus: 'pending_admin',
      error: 'Max retry attempts exceeded',
      botAttempts,
    };
  }

  // 4. Update status to processing
  await updatePermitStatus(permitId, 'bot_processing', {
    bot_attempts: botAttempts,
    bot_last_attempt: new Date().toISOString(),
  });

  // 5. Run the bot
  try {
    const botResult = await runBot(permit);

    if (botResult.success) {
      // Success! Update permit with CTR number
      console.log(`✅ Bot succeeded! CTR: ${botResult.permitNumber}`);
      await updatePermitStatus(permitId, 'submitted', {
        portal_status: 'submitted',
        ctr_number: botResult.permitNumber,
        bot_error: null,
      });
      return {
        permitId,
        success: true,
        newStatus: 'submitted',
        permitNumber: botResult.permitNumber,
        botAttempts,
      };
    } else {
      // Bot failed
      console.log(`❌ Bot failed: ${botResult.error}`);
      const newStatus = botAttempts >= BOT_CONFIG.maxRetries ? 'pending_admin' : 'pending_bot';
      await updatePermitStatus(permitId, newStatus, {
        bot_error: botResult.error,
      });
      return {
        permitId,
        success: false,
        newStatus,
        error: botResult.error,
        botAttempts,
      };
    }
  } catch (error: any) {
    console.error('Bot execution error:', error);
    const newStatus = botAttempts >= BOT_CONFIG.maxRetries ? 'pending_admin' : 'pending_bot';
    await updatePermitStatus(permitId, newStatus, {
      bot_error: error.message,
    });
    return {
      permitId,
      success: false,
      newStatus,
      error: error.message,
      botAttempts,
    };
  }
}

// ============================================================
// RUN BOT
// ============================================================

async function runBot(permit: PermitData): Promise<BotResult> {
  console.log('🤖 Starting bot execution...');

  // Convert permit data to bot format
  const botPermitData = {
    // Installation type
    installationType: (permit.installation_type || 'ac-furnace') as 'ac-furnace' | 'ac-only' | 'furnace-only' | 'mini-split' | 'custom',
    
    // Contractor info
    rocLicenseNumber: permit.roc_license_number,
    cityPrivilegeLicense: permit.city_privilege_license,
    contractorName: permit.contractor_name,
    contractorPhone: permit.contractor_phone,
    contractorEmail: permit.contractor_email,
    
    // Address
    streetAddress: permit.street_address,
    city: permit.city || 'Phoenix',
    state: permit.state || 'AZ',
    zipCode: permit.zip_code,
    
    // Permit details
    permitType: 'mechanical',
    workType: 'replacement',
    valuationCost: permit.valuation_cost || 5000,
    
    // Equipment - AC
    equipmentTonnage: permit.equipment_tonnage || 3,
    manufacturer: permit.manufacturer,
    model: permit.model_number,
    serialNumber: permit.serial_number,
    btu: permit.btu,
    voltage: permit.voltage,
    seer: permit.seer_rating,
    refrigerant: permit.refrigerant,
    
    // Equipment - Furnace (if applicable)
    furnaceManufacturer: permit.furnace_manufacturer,
    furnaceModel: permit.furnace_model,
    furnaceBtu: permit.furnace_btu,
    furnaceFuelType: permit.furnace_fuel_type,
  };

  try {
    // Dynamic import of the bot (to avoid loading Playwright on every request)
    const { FlashPermitHybridBot } = await import('@/lib/playwright-bot');
    
    const bot = new FlashPermitHybridBot({
      headless: BOT_CONFIG.headless,
      sessionFile: BOT_CONFIG.sessionFile,
      screenshotDir: BOT_CONFIG.screenshotDir,
    });

    const result = await bot.submitPermit(botPermitData);
    
    return {
      success: result.success,
      permitNumber: result.permitNumber,
      error: result.error,
      stepsCompleted: result.stepsCompleted,
      screenshots: result.screenshots,
    };
  } catch (error: any) {
    console.error('Bot import/execution error:', error);
    return {
      success: false,
      error: error.message || 'Bot execution failed',
      stepsCompleted: 0,
      screenshots: [],
    };
  }
}

// ============================================================
// UPDATE PERMIT STATUS
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

  console.log(`📝 Updated permit ${permitId} → ${workflowStatus}`);
}

// ============================================================
// GET - Status endpoint
// ============================================================

export async function GET(request: NextRequest) {
  try {
    // Get queue stats
    const { data: stats, error } = await supabase
      .from('permits')
      .select('workflow_status')
      .in('workflow_status', ['pending_bot', 'bot_processing', 'pending_admin', 'submitted']);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const counts = {
      pending_bot: 0,
      bot_processing: 0,
      pending_admin: 0,
      submitted: 0,
    };

    stats?.forEach(row => {
      const status = row.workflow_status as keyof typeof counts;
      if (counts[status] !== undefined) {
        counts[status]++;
      }
    });

    return NextResponse.json({
      status: 'ok',
      queue: counts,
      total: stats?.length || 0,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}