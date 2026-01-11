/**
 * FlashPermit - Save Login Session
 * 
 * This script opens the Phoenix portal, lets you login manually,
 * then saves the session cookies for the bot to reuse.
 * 
 * Run: npx tsx lib/save-session.ts
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const SESSION_FILE = 'shape-phx-session.json';

async function waitForEnter(prompt: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

async function saveLoginSession() {
  console.log('═══════════════════════════════════════════');
  console.log('  FlashPermit - Login Session Saver');
  console.log('═══════════════════════════════════════════\n');

  console.log('📋 Instructions:');
  console.log('1. Browser will open to Phoenix SHAPE portal');
  console.log('2. Click "Login" button');
  console.log('3. Enter your email and password');
  console.log('4. Complete any 2FA if required');
  console.log('5. Wait until you see your name/dashboard');
  console.log('6. Come back here and press ENTER to save\n');

  // Launch browser (visible so user can login)
  const browser = await chromium.launch({ headless: false });
  
  // Create context with ignoreHTTPSErrors to fix SSL issues
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
  });
  
  const page = await context.newPage();

  // Block Whatfix
  await page.route('**/*whatfix*', route => route.abort());
  await page.route('**/*wfx*', route => route.abort());

  // Navigate to portal
  console.log('🌐 Opening Phoenix SHAPE portal...\n');
  await page.goto('https://shapephx.phoenix.gov/s/');

  console.log('════════════════════════════════════════════');
  console.log('  👆 BROWSER IS OPEN - PLEASE LOGIN NOW');
  console.log('════════════════════════════════════════════\n');

  // Wait for user to manually confirm they're logged in
  await waitForEnter('✋ Press ENTER here AFTER you have fully logged in... ');

  // Verify login by checking for user-specific elements
  console.log('\n🔍 Verifying login status...');
  
  const pageContent = await page.textContent('body') || '';
  const currentUrl = page.url();
  
  // Check for indicators that user is logged in
  const loggedInIndicators = [
    await page.locator('text=Logout').isVisible().catch(() => false),
    await page.locator('text=My Account').isVisible().catch(() => false),
    await page.locator('[class*="user"]').isVisible().catch(() => false),
    await page.locator('text=REQUESTS').isVisible().catch(() => false),
    await page.locator('text=PAY').isVisible().catch(() => false),
    await page.locator('text=Balance').isVisible().catch(() => false),
    pageContent.includes('Logout'),
    pageContent.includes('Balance'),
    !currentUrl.includes('login'),
  ];
  
  const loginScore = loggedInIndicators.filter(Boolean).length;
  console.log(`   Login confidence: ${loginScore}/${loggedInIndicators.length} indicators`);

  if (loginScore < 2) {
    console.log('\n⚠️  Warning: Login may not be complete!');
    console.log('   Make sure you see your name or "Logout" button on the page.\n');
    await waitForEnter('Press ENTER to save session anyway, or Ctrl+C to cancel... ');
  } else {
    console.log('   ✅ Login appears successful!\n');
  }

  // Save the session
  console.log('💾 Saving session...');
  
  try {
    // Wait a moment for all cookies to be set
    await page.waitForTimeout(2000);
    
    const storageState = await context.storageState();
    fs.writeFileSync(SESSION_FILE, JSON.stringify(storageState, null, 2));
    
    console.log(`✅ Session saved to: ${path.resolve(SESSION_FILE)}`);
    console.log(`   Contains ${storageState.cookies.length} cookies`);
    
    if (storageState.cookies.length < 3) {
      console.log('\n⚠️  Warning: Very few cookies saved. Login may not have completed.');
    }
    
    // Verify the file was created
    if (fs.existsSync(SESSION_FILE)) {
      const stats = fs.statSync(SESSION_FILE);
      console.log(`   File size: ${stats.size} bytes\n`);
    }

    console.log('═══════════════════════════════════════════');
    console.log('  ✅ SESSION SAVED!');
    console.log('═══════════════════════════════════════════');
    console.log('\nYou can now run the bot:');
    console.log('  npx tsx lib/hybrid-bot.ts\n');

  } catch (error: any) {
    console.error('❌ Failed to save session:', error.message);
  }

  // Close browser
  await browser.close();
}

saveLoginSession().catch(console.error);
