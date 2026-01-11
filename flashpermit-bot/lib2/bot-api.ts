/**
 * FlashPermit Bot API Runner
 * 
 * This module provides an API-friendly interface to the hybrid bot.
 * Can be called from Next.js API routes or as a standalone service.
 */

import { FlashPermitHybridBot } from './hybrid-bot';
import { PermitData } from './ai-form-analyzer';
import * as fs from 'fs';
import dotenv from 'dotenv';

// Load .env.local first (Next.js convention), fallback to .env
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

export interface SubmitPermitRequest {
  // From FlashPermit database
  permitId: string;
  
  // Contractor info (from profile)
  rocLicenseNumber: string;
  cityPrivilegeLicense: string;
  contractorName: string;
  contractorPhone: string;
  contractorEmail: string;
  
  // Property info
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  
  // Job details
  valuationCost: number;
  installationType: 'ac-furnace' | 'ac-only' | 'furnace-only' | 'mini-split';
  
  // Equipment (optional - from OCR)
  equipmentTonnage?: number;
  manufacturer?: string;
  model?: string;
  btu?: number;
}

export interface SubmitPermitResponse {
  success: boolean;
  permitId: string;
  phoenixPermitNumber?: string;
  status: 'submitted' | 'pending_payment' | 'failed';
  stepsCompleted: number;
  error?: string;
  screenshots: string[];
  processingTimeMs: number;
}

/**
 * Submit a permit to Phoenix SHAPE portal
 */
export async function submitPermitToPhoenix(
  request: SubmitPermitRequest
): Promise<SubmitPermitResponse> {
  const startTime = Date.now();
  
  console.log(`\n🚀 Starting permit submission: ${request.permitId}`);
  console.log(`📍 Address: ${request.streetAddress}, ${request.city}`);
  console.log(`🏢 Contractor: ${request.contractorName}`);
  console.log(`🔧 Type: ${request.installationType}\n`);

  // Convert request to PermitData format
  const permitData: PermitData = {
    rocLicenseNumber: request.rocLicenseNumber,
    cityPrivilegeLicense: request.cityPrivilegeLicense,
    contractorName: request.contractorName,
    contractorPhone: request.contractorPhone,
    contractorEmail: request.contractorEmail,
    streetAddress: request.streetAddress,
    city: request.city,
    state: request.state,
    zipCode: request.zipCode,
    permitType: 'mechanical',
    workType: 'replacement',
    valuationCost: request.valuationCost,
    equipmentTonnage: request.equipmentTonnage || 3.5,
    manufacturer: request.manufacturer,
    model: request.model,
    btu: request.btu,
    installationType: request.installationType,
  };

  // Create and run bot
  const bot = new FlashPermitHybridBot({
    headless: process.env.BOT_HEADLESS === 'true',
    screenshotDir: process.env.BOT_SCREENSHOT_DIR || './screenshots',
    sessionFile: process.env.BOT_SESSION_FILE || 'shape-phx-session.json',
  });

  const result = await bot.submitPermit(permitData);
  const processingTimeMs = Date.now() - startTime;

  // Determine status
  let status: 'submitted' | 'pending_payment' | 'failed';
  if (result.success) {
    status = result.permitNumber ? 'submitted' : 'pending_payment';
  } else {
    status = 'failed';
  }

  const response: SubmitPermitResponse = {
    success: result.success,
    permitId: request.permitId,
    phoenixPermitNumber: result.permitNumber,
    status,
    stepsCompleted: result.stepsCompleted,
    error: result.error,
    screenshots: result.screenshots,
    processingTimeMs,
  };

  console.log(`\n📊 Submission complete in ${processingTimeMs}ms`);
  console.log(`   Status: ${status}`);
  if (result.permitNumber) {
    console.log(`   Phoenix Permit #: ${result.permitNumber}`);
  }

  return response;
}

/**
 * Example: Next.js API route handler
 * 
 * File: app/api/bot/submit/route.ts
 * 
 * ```typescript
 * import { NextResponse } from 'next/server';
 * import { submitPermitToPhoenix } from '@/lib/bot-api';
 * 
 * export async function POST(request: Request) {
 *   const body = await request.json();
 *   const result = await submitPermitToPhoenix(body);
 *   return NextResponse.json(result);
 * }
 * ```
 */

// CLI test runner
async function testSubmission() {
  const testRequest: SubmitPermitRequest = {
    permitId: 'test-permit-001',
    rocLicenseNumber: 'ROC123456',
    cityPrivilegeLicense: 'PL789012',
    contractorName: 'Einstein Heating & Cooling',
    contractorPhone: '(602) 555-1234',
    contractorEmail: 'permits@einsteinheating.com',
    streetAddress: '3825 E CAMELBACK RD',
    city: 'Phoenix',
    state: 'AZ',
    zipCode: '85018',
    valuationCost: 5000,
    installationType: 'ac-furnace',
    equipmentTonnage: 3.5,
    manufacturer: 'Carrier',
    model: '24ACC636A003',
    btu: 36000,
  };

  const response = await submitPermitToPhoenix(testRequest);
  
  console.log('\n═══════════════════════════════════════════');
  console.log('  API RESPONSE');
  console.log('═══════════════════════════════════════════');
  console.log(JSON.stringify(response, null, 2));
}

// Run if called directly
if (require.main === module) {
  testSubmission().catch(console.error);
}
