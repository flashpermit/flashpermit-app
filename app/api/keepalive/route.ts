import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  try {
    const { count, error } = await supabase
      .from('permits')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;

    return NextResponse.json({
      status: 'active',
      timestamp: new Date().toISOString(),
      permits_count: count,
      message: 'Database pinged successfully'
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}