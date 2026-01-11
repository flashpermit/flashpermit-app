/**
 * Test Azure OpenAI Connection
 * 
 * Run this to verify your credentials are working:
 *   npx tsx lib/test-connection.ts
 */

import * as fs from 'fs';
import dotenv from 'dotenv';

// Load .env.local first (Next.js convention), fallback to .env
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
  console.log('📁 Loaded .env.local\n');
} else if (fs.existsSync('.env')) {
  dotenv.config({ path: '.env' });
  console.log('📁 Loaded .env\n');
} else {
  console.error('❌ No .env or .env.local found!');
  process.exit(1);
}

import { createAnalyzerFromEnv } from './ai-form-analyzer';

async function testConnection() {
  console.log('═══════════════════════════════════════════');
  console.log('  FlashPermit - Azure OpenAI Connection Test');
  console.log('═══════════════════════════════════════════\n');

  // Check environment variables
  console.log('🔍 Checking environment variables...\n');
  
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const azureKey = process.env.AZURE_OPENAI_API_KEY;
  const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (azureEndpoint) {
    console.log(`✅ AZURE_OPENAI_ENDPOINT: ${azureEndpoint.substring(0, 40)}...`);
  } else {
    console.log('❌ AZURE_OPENAI_ENDPOINT: Not set');
  }

  if (azureKey) {
    console.log(`✅ AZURE_OPENAI_API_KEY: ${azureKey.substring(0, 10)}...`);
  } else {
    console.log('❌ AZURE_OPENAI_API_KEY: Not set');
  }

  if (azureDeployment) {
    console.log(`✅ AZURE_OPENAI_DEPLOYMENT: ${azureDeployment}`);
  } else {
    console.log('⚠️ AZURE_OPENAI_DEPLOYMENT: Not set (will default to gpt-4o)');
  }

  if (openaiKey) {
    console.log(`✅ OPENAI_API_KEY: ${openaiKey.substring(0, 10)}...`);
  }

  console.log('\n🔧 Creating AI analyzer...\n');

  try {
    const analyzer = createAnalyzerFromEnv();
    console.log('✅ Analyzer created successfully!\n');

    // Test with a simple text-only request (no image)
    console.log('🧪 Testing API connection with a simple request...\n');

    // We'll use a minimal test - just verify the client can make a request
    const testPrompt = 'Say "FlashPermit connection successful!" and nothing else.';
    
    // Access the client directly for a simple test
    const response = await (analyzer as any).client.chat.completions.create({
      model: (analyzer as any).model,
      messages: [
        { role: 'user', content: testPrompt }
      ],
      max_tokens: 50,
    });

    const reply = response.choices[0]?.message?.content || '';
    console.log(`🤖 GPT-4o Response: "${reply}"\n`);

    console.log('═══════════════════════════════════════════');
    console.log('  ✅ CONNECTION SUCCESSFUL!');
    console.log('═══════════════════════════════════════════');
    console.log('\nYour Azure OpenAI setup is working correctly.');
    console.log('You can now run the bot or step analyzer:\n');
    console.log('  npx tsx lib/analyze-step.ts 7');
    console.log('  npx tsx lib/hybrid-bot.ts\n');

  } catch (error: any) {
    console.error('═══════════════════════════════════════════');
    console.error('  ❌ CONNECTION FAILED');
    console.error('═══════════════════════════════════════════\n');
    console.error('Error:', error.message);
    
    if (error.message.includes('401')) {
      console.error('\n💡 This usually means your API key is invalid.');
      console.error('   Double-check AZURE_OPENAI_API_KEY in your .env.local');
    } else if (error.message.includes('404')) {
      console.error('\n💡 This usually means the deployment name is wrong.');
      console.error('   Check AZURE_OPENAI_DEPLOYMENT matches your deployment in Azure.');
    } else if (error.message.includes('endpoint')) {
      console.error('\n💡 This usually means the endpoint URL is wrong.');
      console.error('   Check AZURE_OPENAI_ENDPOINT in your .env.local');
    }
    
    process.exit(1);
  }
}

testConnection();
