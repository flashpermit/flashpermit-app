/**
 * API Route: Submit Permit to Portal
 * POST /api/submit-portal
 * 
 * Triggers Playwright automation for SHAPE PHX portal submission
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runShapePhxAutomation, resumeShapePhxAutomation } from '@/lib/playwright-bot';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { permitId, action } = await request.json();

    if (!permitId) {
      return NextResponse.json(
        { error: 'Permit ID is required' },
        { status: 400 }
      );
    }

    // Get permit data from database
    const { data: permit, error: permitError } = await supabase
      .from('permits')
      .select('*')
      .eq('id', permitId)
      .single();

    if (permitError || !permit) {
      return NextResponse.json(
        { error: 'Permit not found' },
        { status: 404 }
      );
    }

    // Validate required fields
    if (!permit.street_address || !permit.city || !permit.state || !permit.zip_code) {
      return NextResponse.json(
        { error: 'Missing required address fields' },
        { status: 400 }
      );
    }

    if (!permit.roc_license_number) {
      return NextResponse.json(
        { error: 'ROC license number is required' },
        { status: 400 }
      );
    }

    if (!permit.valuation_cost) {
      return NextResponse.json(
        { error: 'Project valuation cost is required' },
        { status: 400 }
      );
    }

    // Create portal submission record
    const { data: submission, error: submissionError } = await supabase
      .from('portal_submissions')
      .insert({
        permit_id: permitId,
        user_id: permit.user_id,
        portal_name: 'SHAPE PHX',
        portal_url: 'https://shapephx.phoenix.gov/s/',
        submission_method: 'automated',
        submission_status: 'pending',
        current_step: 'initializing'
      })
      .select()
      .single();

    if (submissionError) {
      return NextResponse.json(
        { error: 'Failed to create submission record' },
        { status: 500 }
      );
    }

    // Prepare permit data for automation
    const permitData = {
      permitId: permit.id,
      streetAddress: permit.street_address,
      city: permit.city,
      state: permit.state,
      zipCode: permit.zip_code,
      contractorName: permit.contractor_name || '',
      rocLicenseNumber: permit.roc_license_number,
      valuationCost: permit.valuation_cost,
      manufacturer: permit.manufacturer,
      modelNumber: permit.model_number,
      equipmentTonnage: permit.equipment_tonnage,
      btu: permit.btu
    };

    // Run automation (async - don't wait for completion)
    let result;
    
    if (action === 'resume') {
      // Resume after payment
      result = await resumeShapePhxAutomation(permitData);
    } else {
      // Start new automation
      result = await runShapePhxAutomation(permitData);
    }

    // Handle result
    if (result.success) {
      if (result.error === 'AWAITING_PAYMENT') {
        // Get payment URL from submission record
        const { data: updatedSubmission } = await supabase
          .from('portal_submissions')
          .select('*')
          .eq('permit_id', permitId)
          .single();

        return NextResponse.json({
          success: true,
          status: 'awaiting_payment',
          paymentUrl: updatedSubmission?.state_data?.paymentUrl,
          feeAmount: updatedSubmission?.state_data?.feeAmount
        });
      }

      // Permit issued successfully
      await supabase
        .from('permits')
        .update({
          status: 'approved',
          portal_status: 'approved',
          portal_confirmation_number: result.permitNumber,
          portal_submission_date: new Date().toISOString(),
          auto_submitted: true
        })
        .eq('id', permitId);

      return NextResponse.json({
        success: true,
        status: 'completed',
        permitNumber: result.permitNumber
      });
    } else {
      // Automation failed
      await supabase
        .from('portal_submissions')
        .update({
          submission_status: 'failed',
          error_message: result.error
        })
        .eq('permit_id', permitId);

      return NextResponse.json({
        success: false,
        error: result.error
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Portal submission error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to check submission status
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const permitId = searchParams.get('permitId');

    if (!permitId) {
      return NextResponse.json(
        { error: 'Permit ID is required' },
        { status: 400 }
      );
    }

    // Get submission status
    const { data: submission, error } = await supabase
      .from('portal_submissions')
      .select('*')
      .eq('permit_id', permitId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !submission) {
      return NextResponse.json(
        { error: 'Submission not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: submission.submission_status,
      currentStep: submission.current_step,
      confirmationNumber: submission.confirmation_number,
      errorMessage: submission.error_message,
      submittedAt: submission.submitted_at,
      confirmedAt: submission.confirmed_at
    });

  } catch (error: any) {
    console.error('Status check error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
