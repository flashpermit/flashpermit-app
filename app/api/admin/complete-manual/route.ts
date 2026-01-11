/**
 * Admin API: Manually Complete Permit
 * POST /api/admin/complete-manual
 * 
 * Body: { 
 *   permitId: string,
 *   permitNumber: string,
 *   notes?: string
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { permitId, permitNumber, notes } = await request.json();

    if (!permitId || !permitNumber) {
      return NextResponse.json(
        { success: false, error: 'permitId and permitNumber are required' },
        { status: 400 }
      );
    }

    // Check user is authenticated
    const authHeader = request.headers.get('cookie');
    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // TODO: Add admin role check here

    // Update permit as manually submitted
    const { error: updateError } = await supabase
      .from('permits')
      .update({
        workflow_status: 'submitted',
        portal_status: 'submitted',
        portal_permit_number: permitNumber,
        processing_mode: 'admin',
        bot_error: null,
        updated_at: new Date().toISOString(),
        // Store notes if provided (you may need to add admin_notes column)
      })
      .eq('id', permitId);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: 'Failed to update permit: ' + updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Permit marked as submitted',
      permitId,
      permitNumber,
    });

  } catch (error: any) {
    console.error('Admin complete-manual error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}