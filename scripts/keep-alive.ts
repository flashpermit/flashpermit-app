import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

// Load environment variables
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

console.log('🔍 Checking environment variables...');
console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Set' : '❌ Missing');
console.log('Supabase Key:', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing');
console.log('');

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.error('❌ Missing environment variables!');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function keepAlive() {
  try {
    console.log('🔍 Checking Supabase connection...');
    console.log('URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.log('');
    
    const { data, error, count } = await supabase
      .from('permits')
      .select('id', { count: 'exact', head: false })
      .limit(1);

    if (error) {
      console.error('❌ Supabase query error:', error);
      throw error;
    }
    
    console.log('✅ Supabase is ACTIVE');
    console.log('📊 Timestamp:', new Date().toISOString());
    console.log('📈 Total permits in DB:', count || 0);
    console.log('');
    console.log('✨ Your database will stay active for another 7 days.');
  } catch (error: any) {
    console.error('❌ Keepalive failed:');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
    console.error('');
    console.error('💡 Tip: Check your internet connection and Supabase project status');
    process.exit(1);
  }
}

keepAlive();