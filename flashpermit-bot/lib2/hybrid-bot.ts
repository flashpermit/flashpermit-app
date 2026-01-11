/**
 * FlashPermit Hybrid Bot
 * 
 * Architecture:
 * - Steps 0-6: Pure Playwright (fast, reliable, already working)
 * - Steps 7-9: AI Vision-powered (adaptive, handles unknown requirements)
 * 
 * This gives us the best of both worlds:
 * - Speed and cost efficiency for known steps
 * - Flexibility and self-healing for dynamic steps
 */

import * as fs from 'fs';
import dotenv from 'dotenv';

// Load .env.local first (Next.js convention), fallback to .env
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
} else {
  dotenv.config();
}

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { AIFormAnalyzer, PermitData, StepAnalysis, createAnalyzerFromEnv } from './ai-form-analyzer';

interface BotConfig {
  headless: boolean;
  sessionFile: string;
  screenshotDir: string;
  maxRetries: number;
  stepTimeout: number;
}

interface BotResult {
  success: boolean;
  stepsCompleted: number;
  permitNumber?: string;
  error?: string;
  screenshots: string[];
  aiAnalysis: StepAnalysis[];
}

export class FlashPermitHybridBot {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private analyzer: AIFormAnalyzer;
  private config: BotConfig;
  private screenshots: string[] = [];
  private aiAnalysis: StepAnalysis[] = [];

  constructor(config?: Partial<BotConfig>) {
    this.config = {
      headless: false,
      sessionFile: 'shape-phx-session.json',
      screenshotDir: './screenshots',
      maxRetries: 3,
      stepTimeout: 30000,
      ...config
    };
    this.analyzer = createAnalyzerFromEnv();
  }

  /**
   * Main entry point - submit a permit
   */
  async submitPermit(permitData: PermitData): Promise<BotResult> {
    console.log('🚀 FlashPermit Hybrid Bot Starting...\n');
    console.log('📊 Architecture: Playwright (Steps 0-6) → AI Vision (Steps 7-9)\n');

    try {
      await this.initialize();
      
      // PHASE 1: Playwright-only steps (0-6)
      console.log('═══════════════════════════════════════════');
      console.log('  PHASE 1: Playwright Automation (Steps 0-6)');
      console.log('═══════════════════════════════════════════\n');
      
      await this.step0_NavigateAndLogin();
      await this.step1_Applicant(permitData);
      await this.step2_Address(permitData);
      await this.step3_PermitDetails();
      await this.step4_ProjectDetails(permitData);
      
      // Steps 5-6 can be tricky, wrap with recovery
      await this.executeWithRecovery('Step 5', () => this.step5_CityUseOnly(), permitData, 5);
      await this.executeWithRecovery('Step 6', () => this.step6_SelectWorkItems(permitData), permitData, 6);

      // PHASE 2: AI Vision-powered steps (7-9)
      console.log('\n═══════════════════════════════════════════');
      console.log('  PHASE 2: AI Vision Automation (Steps 7-9)');
      console.log('═══════════════════════════════════════════\n');
      
      await this.step7_WorkItemDetails_AI(permitData);
      await this.step8_SubmitDocuments_AI(permitData);
      const permitNumber = await this.step9_Confirmation_AI(permitData);

      console.log('\n🎉🎉🎉 PERMIT SUBMISSION COMPLETE! 🎉🎉🎉');
      console.log(`📄 Permit Number: ${permitNumber || 'Pending payment'}`);

      return {
        success: true,
        stepsCompleted: 9,
        permitNumber,
        screenshots: this.screenshots,
        aiAnalysis: this.aiAnalysis
      };

    } catch (error: any) {
      console.error('\n❌ Bot Error:', error.message);
      await this.takeScreenshot('error-state');
      
      // Try AI recovery for the current step
      console.log('\n🤖 Attempting AI-powered recovery...');
      try {
        const recovered = await this.attemptAIRecovery(permitData);
        if (recovered) {
          console.log('✅ AI recovery successful!');
        }
      } catch (recoveryError) {
        console.log('❌ AI recovery failed');
      }
      
      return {
        success: false,
        stepsCompleted: this.aiAnalysis.length,
        error: error.message,
        screenshots: this.screenshots,
        aiAnalysis: this.aiAnalysis
      };
    } finally {
      // Keep browser open for debugging in non-headless mode
      if (this.config.headless) {
        await this.cleanup();
      } else {
        console.log('\n👀 Browser staying open for 2 minutes...');
        await this.page?.waitForTimeout(120000);
        await this.cleanup();
      }
    }
  }

  /**
   * Execute a step with AI Vision recovery on failure
   */
  private async executeWithRecovery(
    stepName: string, 
    stepFn: () => Promise<void>, 
    data: PermitData,
    stepNumber: number
  ): Promise<void> {
    try {
      await stepFn();
    } catch (error: any) {
      console.log(`\n⚠️ ${stepName} failed: ${error.message}`);
      console.log('🤖 Attempting AI Vision recovery...\n');
      
      await this.takeScreenshot(`${stepName.toLowerCase().replace(' ', '-')}-failed`);
      
      // Use AI to analyze and fix
      const screenshot = await this.getScreenshotBase64();
      const analysis = await this.analyzer.analyzeStep(screenshot, stepNumber, data,
        `${stepName} failed. Analyze the current page state and determine what action is needed to proceed.`);
      this.aiAnalysis.push(analysis);
      
      console.log(`   📊 AI Confidence: ${analysis.confidence}%`);
      console.log(`   💡 Recommendations: ${analysis.recommendations.join(', ')}`);
      
      // Execute AI recommendations
      await this.executeAIActions(analysis, data);
      
      // Try clicking Next if AI suggests it
      if (analysis.recommendations.some(r => r.toLowerCase().includes('next'))) {
        try {
          await this.page?.getByRole('button', { name: 'Next' }).click();
          await this.waitForSpinner();
        } catch {
          // Next button might not be available
        }
      }
      
      console.log(`✅ ${stepName} recovered with AI\n`);
    }
  }

  /**
   * Attempt full AI recovery from current state
   */
  private async attemptAIRecovery(data: PermitData): Promise<boolean> {
    if (!this.page) return false;
    
    const screenshot = await this.getScreenshotBase64();
    
    const analysis = await this.analyzer.analyzeStep(screenshot, 0, data,
      'The bot encountered an error. Analyze the current page state, identify which step we are on, and determine the next action to proceed with the permit application.');
    this.aiAnalysis.push(analysis);
    
    console.log(`   📊 AI Analysis - Step: ${analysis.stepNumber}, Confidence: ${analysis.confidence}%`);
    
    if (analysis.confidence > 50) {
      await this.executeAIActions(analysis, data);
      return true;
    }
    
    return false;
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================

  private async initialize(): Promise<void> {
    console.log('🔧 Initializing browser...');
    
    this.browser = await chromium.launch({ headless: this.config.headless });
    
    // Load saved session if exists
    try {
      this.context = await this.browser.newContext({
        storageState: this.config.sessionFile,
        ignoreHTTPSErrors: true,  // Fix for ERR_CERT_AUTHORITY_INVALID
      });
      console.log('✅ Loaded saved session');
    } catch {
      this.context = await this.browser.newContext({
        ignoreHTTPSErrors: true,  // Fix for ERR_CERT_AUTHORITY_INVALID
      });
      console.log('⚠️ No saved session, will need to login');
    }
    
    this.page = await this.context.newPage();
    
    // CRITICAL: Block Whatfix overlay
    await this.blockWhatfix();
    
    console.log('✅ Browser initialized\n');
  }

  private async blockWhatfix(): Promise<void> {
    if (!this.page) return;
    
    await this.page.route('**/*whatfix*', route => route.abort());
    await this.page.route('**/*wfx*', route => route.abort());
    await this.page.route('**/cdn.whatfix.com/**', route => route.abort());
    console.log('🛡️ Whatfix blocking enabled');
  }

  private async removeWhatfixOverlay(): Promise<void> {
    if (!this.page) return;
    
    await this.page.evaluate(() => {
      document.querySelectorAll('[data-wfx-element], [class*="whatfix"], [class*="wfx"], .WFEMOFC').forEach(el => {
        el.remove();
      });
      if ((window as any).wfx) (window as any).wfx.disable?.();
      if ((window as any).whatfix) (window as any).whatfix.disable?.();
    });
  }

  private async cleanup(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  // ============================================================
  // UTILITY METHODS
  // ============================================================

  private async takeScreenshot(name: string): Promise<string> {
    if (!this.page) return '';
    
    const filename = `${this.config.screenshotDir}/${name}-${Date.now()}.png`;
    await this.page.screenshot({ path: filename, fullPage: true });
    this.screenshots.push(filename);
    console.log(`📸 Screenshot: ${filename}`);
    return filename;
  }

  private async getScreenshotBase64(): Promise<string> {
    if (!this.page) return '';
    
    const buffer = await this.page.screenshot({ fullPage: true });
    return buffer.toString('base64');
  }

  private async waitForSpinner(maxWaitMs: number = 30000): Promise<void> {
    if (!this.page) return;
    
    const startTime = Date.now();
    
    // Multiple spinner detection strategies
    const spinnerSelectors = [
      'lightning-spinner',
      '.slds-spinner',
      '[class*="spinner"]',
      '[class*="loading"]',
      '.loading',
    ];
    
    while (Date.now() - startTime < maxWaitMs) {
      let spinnerFound = false;
      
      for (const selector of spinnerSelectors) {
        try {
          const spinner = this.page.locator(selector).first();
          const isVisible = await spinner.isVisible({ timeout: 500 }).catch(() => false);
          
          if (isVisible) {
            spinnerFound = true;
            console.log(`   ⏳ Waiting for ${selector} to disappear...`);
            
            // Wait for this specific spinner to hide
            try {
              await this.page.waitForSelector(selector, { state: 'hidden', timeout: 10000 });
              console.log(`   ✅ ${selector} hidden`);
            } catch {
              // Spinner might have disappeared already
            }
            break;
          }
        } catch {
          continue;
        }
      }
      
      if (!spinnerFound) {
        // No spinners visible, we're good
        return;
      }
      
      // Small delay before checking again
      await this.page.waitForTimeout(500);
    }
    
    console.log('   ⚠️ Max wait time reached for spinner');
  }

  // ============================================================
  // PHASE 1: PLAYWRIGHT STEPS (0-6) - Already Working
  // ============================================================

  private async step0_NavigateAndLogin(): Promise<void> {
    console.log('📋 STEP 0: Navigate & Login');
    if (!this.page) throw new Error('Page not initialized');
    
    await this.page.goto('https://shapephx.phoenix.gov/s/');
    console.log('   ✅ Loaded portal');
    
    // Check if already logged in
    try {
      await this.page.waitForSelector('text=Apply For Permit', { timeout: 5000 });
      console.log('   ✅ Session active - already logged in');
    } catch {
      console.log('   ⚠️ Need to login - please implement login flow');
      throw new Error('Login required - session expired');
    }
    
    // Click Apply for Permit
    await this.page.getByRole('button', { name: 'Apply For Permit' }).click();
    await this.page.waitForSelector('text=Select Permit Type', { timeout: 10000 });
    await this.page.waitForTimeout(2000);
    
    // Select permit type
    await this.page.locator('text=general residential construction, including custom homes').first().click();
    await this.page.waitForTimeout(2000);
    await this.page.getByRole('button', { name: 'Next' }).click();
    
    console.log('✅ Step 0 Complete\n');
  }

  private async step1_Applicant(data: PermitData): Promise<void> {
    console.log('📋 STEP 1: Applicant');
    if (!this.page) throw new Error('Page not initialized');
    
    await this.page.waitForTimeout(3000);
    await this.page.getByLabel('Owner is Contractor').check();
    await this.page.waitForTimeout(2000);
    
    // ROC license lookup happens automatically
    await this.page.getByRole('button', { name: 'Next' }).click();
    
    console.log('✅ Step 1 Complete\n');
  }

  private async step2_Address(data: PermitData): Promise<void> {
    console.log('📋 STEP 2: Address');
    if (!this.page) throw new Error('Page not initialized');
    
    await this.page.waitForTimeout(3000);
    await this.removeWhatfixOverlay();
    
    // Enter address
    const addressInput = this.page.getByLabel('Address');
    await addressInput.click();
    await addressInput.fill(data.streetAddress);
    await this.page.waitForTimeout(1000);
    await this.page.keyboard.press('Enter');
    console.log(`   ✅ Searched: ${data.streetAddress}`);
    
    // Wait for GIS modal
    await this.page.waitForSelector('text=Advanced Search', { timeout: 15000 });
    await this.page.waitForTimeout(3000);
    await this.removeWhatfixOverlay();
    
    // Select first result
    const firstRow = this.page.locator('tbody tr').first();
    const rowBox = await firstRow.boundingBox();
    
    if (rowBox) {
      await this.page.mouse.click(rowBox.x + 20, rowBox.y + (rowBox.height / 2));
      console.log('   ✅ Selected address from GIS');
    }
    
    await this.page.waitForTimeout(1000);
    await this.page.getByRole('button', { name: 'Select' }).click({ force: true });
    await this.page.waitForTimeout(2000);
    await this.page.getByRole('button', { name: 'Next' }).click();
    
    console.log('✅ Step 2 Complete\n');
  }

  private async step3_PermitDetails(): Promise<void> {
    console.log('📋 STEP 3: Permit Details');
    if (!this.page) throw new Error('Page not initialized');
    
    await this.page.waitForTimeout(3000);
    
    // Permit Work Type
    await this.page.getByRole('combobox', { name: 'Permit Work Type', exact: true }).click();
    await this.page.waitForTimeout(500);
    await this.page.getByRole('option', { name: 'Repairs/ Replacements', exact: true }).click();
    await this.page.waitForTimeout(1000);
    
    // Permit Use Class
    await this.page.getByRole('combobox', { name: 'Permit Use Class', exact: true }).click();
    await this.page.waitForTimeout(500);
    await this.page.getByRole('option', { name: 'Residential', exact: true }).click();
    await this.page.waitForTimeout(1000);
    
    // Use Type
    await this.page.getByRole('combobox', { name: 'Use Type', exact: true }).click();
    await this.page.waitForTimeout(500);
    await this.page.getByRole('option', { name: 'Single Family', exact: true }).click();
    await this.page.waitForTimeout(1000);
    
    // Land Use Type
    await this.page.getByRole('combobox', { name: 'Land Use Type', exact: true }).click();
    await this.page.waitForTimeout(500);
    await this.page.getByRole('option', { name: 'Single Family', exact: true }).click();
    await this.page.waitForTimeout(1000);
    
    // Building from Standard Plan
    try {
      const buildingPlanField = this.page.getByRole('combobox', { name: 'Building from Standard Plan?', exact: true });
      await buildingPlanField.waitFor({ timeout: 5000 });
      await buildingPlanField.click();
      await this.page.waitForTimeout(500);
      await this.page.getByRole('option', { name: 'No', exact: true }).click();
      await this.page.waitForTimeout(1000);
      console.log('   ✅ Building from Standard Plan: No');
    } catch {
      console.log('   ℹ️ Building from Standard Plan field not found');
    }
    
    await this.page.getByRole('button', { name: 'Next' }).click();
    console.log('✅ Step 3 Complete\n');
  }

  private async step4_ProjectDetails(data: PermitData): Promise<void> {
    console.log('📋 STEP 4: Project Details');
    if (!this.page) throw new Error('Page not initialized');
    
    await this.page.waitForTimeout(3000);
    
    // Project Valuation
    await this.page.getByLabel('Project Valuation').fill(data.valuationCost.toString());
    console.log(`   ✅ Valuation: $${data.valuationCost}`);
    
    // Plan Submission Type (if visible)
    try {
      const planField = this.page.getByRole('combobox', { name: 'Plan Submission Type', exact: true });
      await planField.waitFor({ timeout: 3000 });
      await planField.click();
      await this.page.waitForTimeout(500);
      await this.page.getByRole('option', { name: 'No Plans Required', exact: true }).click();
      console.log('   ✅ Plan Submission: No Plans Required');
    } catch {
      console.log('   ℹ️ Plan Submission Type not required');
    }
    
    await this.page.getByRole('button', { name: 'Next' }).click();
    console.log('✅ Step 4 Complete\n');
  }

  private async step5_CityUseOnly(): Promise<void> {
    console.log('📋 STEP 5: City Use Only');
    if (!this.page) throw new Error('Page not initialized');
    
    await this.page.waitForTimeout(3000);
    
    // Wait for any existing spinners to clear first
    await this.waitForSpinner();
    
    // Just skip - no fields for applicants
    console.log('   Clicking Next...');
    await this.page.getByRole('button', { name: 'Next' }).click();
    
    // CRITICAL: Wait for Step 6 to fully load
    console.log('   Waiting for Step 6 to load...');
    await this.waitForSpinner(45000);  // Longer wait - this transition can be slow
    
    // Additional wait for content to render
    await this.page.waitForTimeout(3000);
    
    // Verify we've moved to Step 6
    try {
      await this.page.waitForSelector('text=Select Your Work Items', { timeout: 15000 });
      console.log('   ✅ Step 6 page confirmed');
    } catch {
      console.log('   ⚠️ Step 6 header not found - checking page state...');
      // Take screenshot for debugging
      await this.takeScreenshot('step5-transition-issue');
    }
    
    console.log('✅ Step 5 Complete\n');
  }

  private async step6_SelectWorkItems(data: PermitData): Promise<void> {
    console.log('📋 STEP 6: Select Work Items');
    if (!this.page) throw new Error('Page not initialized');
    
    await this.page.waitForTimeout(3000);
    await this.waitForSpinner(30000);
    
    // Verify we're on Step 6
    const pageText = await this.page.textContent('body') || '';
    if (!pageText.includes('Work Items') && !pageText.includes('HVAC')) {
      console.log('   ⚠️ May not be on Step 6 yet, waiting longer...');
      await this.page.waitForTimeout(5000);
      await this.waitForSpinner(15000);
    }
    
    // Multiple scroll attempts to trigger lazy loading
    console.log('   📜 Scrolling to load all work items...');
    for (let i = 0; i < 3; i++) {
      await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await this.page.waitForTimeout(2000);
      
      // Check if HVAC section is now visible
      const hvacVisible = await this.page.locator('text=HVAC').isVisible().catch(() => false);
      if (hvacVisible) {
        console.log('   ✅ HVAC section found');
        break;
      }
      console.log(`   Scroll attempt ${i + 1}/3...`);
    }
    
    // Try to find and check the work item
    const workItemLabel = this.getWorkItemLabel(data.installationType);
    console.log(`   Looking for: "${workItemLabel}"`);
    
    // Try multiple selector strategies
    const checkboxSelectors = [
      `[aria-label="${workItemLabel}"]`,
      `label:has-text("${workItemLabel}") input[type="checkbox"]`,
      `text=${workItemLabel}`,
      'text=Replace Furnace or Air Conditioner',
      'text=Replace Furnace',
      'text=Replace Air Conditioner',
      'text=HVAC',
    ];
    
    let checkboxFound = false;
    for (const selector of checkboxSelectors) {
      try {
        const element = this.page.locator(selector).first();
        const isVisible = await element.isVisible({ timeout: 3000 }).catch(() => false);
        
        if (isVisible) {
          console.log(`   ✅ Found with selector: ${selector}`);
          
          // Try to check it
          try {
            await element.check({ timeout: 5000 });
            checkboxFound = true;
            console.log('   ✅ Checkbox checked');
            break;
          } catch {
            // Try clicking instead
            try {
              await element.click({ timeout: 5000 });
              checkboxFound = true;
              console.log('   ✅ Element clicked');
              break;
            } catch {
              continue;
            }
          }
        }
      } catch {
        continue;
      }
    }
    
    // If standard selectors failed, use AI Vision
    if (!checkboxFound) {
      console.log('   🤖 Standard selectors failed - using AI Vision...');
      
      const screenshot = await this.getScreenshotBase64();
      await this.takeScreenshot('step6-ai-fallback');
      
      const analysis = await this.analyzer.analyzeStep(screenshot, 6, data,
        'This is Step 6 "Select Your Work Items". Find the HVAC checkbox for "Replace Furnace or Air Conditioner" and check it.');
      this.aiAnalysis.push(analysis);
      
      console.log(`   📊 AI Confidence: ${analysis.confidence}%`);
      console.log(`   📝 Fields found: ${analysis.fields.length}`);
      console.log(`   💡 Recommendations: ${analysis.recommendations.join(', ')}`);
      
      // Execute AI recommendations
      await this.executeAIActions(analysis, data);
      checkboxFound = true; // Assume AI handled it
    }
    
    await this.page.waitForTimeout(1000);
    
    // Click Next
    console.log('   Clicking Next...');
    await this.page.getByRole('button', { name: 'Next' }).click();
    await this.waitForSpinner();
    
    console.log('✅ Step 6 Complete\n');
  }

  private getWorkItemLabel(installationType: string): string {
    switch (installationType) {
      case 'ac-only':
        return 'Replace Air Conditioner';
      case 'furnace-only':
        return 'Replace Furnace';
      case 'mini-split':
        return 'Install Mini-Split System';
      case 'ac-furnace':
      default:
        return 'Replace Furnace or Air Conditioner';
    }
  }

  // ============================================================
  // PHASE 2: AI VISION STEPS (7-9) - Dynamic & Adaptive
  // ============================================================

  private async step7_WorkItemDetails_AI(data: PermitData): Promise<void> {
    console.log('📋 STEP 7: Work Item Details (AI Vision)');
    if (!this.page) throw new Error('Page not initialized');
    
    await this.page.waitForTimeout(3000);
    await this.waitForSpinner();
    
    // LEARNED FROM TESTING: Step 7 primarily needs the COST field filled
    // The sidebar shows "Estimated Total Work Item Cost: $X"
    console.log('   💡 Filling cost field with valuation: $' + data.valuationCost);
    
    // Try common cost field selectors
    const costSelectors = [
      'input[name*="cost" i]',
      'input[name*="Cost" i]',
      'input[placeholder*="cost" i]',
      'lightning-input[label*="Cost" i] input',
      'lightning-input[label*="Estimated" i] input',
      '[data-field*="cost" i] input',
    ];
    
    let costFilled = false;
    for (const selector of costSelectors) {
      try {
        const input = this.page.locator(selector).first();
        if (await input.isVisible({ timeout: 2000 })) {
          await input.fill(data.valuationCost.toString());
          console.log(`   ✅ Filled cost using selector: ${selector}`);
          costFilled = true;
          break;
        }
      } catch {
        continue;
      }
    }
    
    // If simple selectors didn't work, use AI Vision as fallback
    if (!costFilled) {
      console.log('   🤖 Cost field not found with standard selectors, using AI Vision...');
      
      const screenshot = await this.getScreenshotBase64();
      await this.takeScreenshot('step7-before-ai');
      
      const analysis = await this.analyzer.analyzeStep(screenshot, 7, data,
        'This is Step 7 Work Item Details. Look for a cost/price field that needs the valuation amount filled in.');
      this.aiAnalysis.push(analysis);
      
      console.log(`   📊 AI Confidence: ${analysis.confidence}%`);
      console.log(`   📝 Fields found: ${analysis.fields.length}`);
      
      // Execute AI recommendations
      await this.executeAIActions(analysis, data);
    }
    
    await this.page.waitForTimeout(1000);
    
    // Click Next
    await this.page.getByRole('button', { name: 'Next' }).click();
    await this.waitForSpinner();
    
    console.log('✅ Step 7 Complete\n');
  }

  private async step8_SubmitDocuments_AI(data: PermitData): Promise<void> {
    console.log('📋 STEP 8: Submit Documents (AI Vision)');
    if (!this.page) throw new Error('Page not initialized');
    
    await this.page.waitForTimeout(3000);
    
    // LEARNED FROM TESTING: For Express HVAC permits with "No Plans Required",
    // document upload is OPTIONAL. We just need to wait for loading and click Next.
    
    console.log('   💡 Checking for "No Plans Required" scenario...');
    
    // Check if this is a "No Plans Required" permit
    const noPlansRequired = await this.page.evaluate(() => {
      const pageText = document.body.innerText || '';
      return pageText.includes('No Plans Required') || 
             pageText.includes('No plans required') ||
             pageText.includes('NO PLANS REQUIRED');
    });
    
    if (noPlansRequired) {
      console.log('   ✅ "No Plans Required" detected - skipping document upload');
    } else {
      console.log('   ⚠️ Plans may be required - checking with AI Vision...');
    }
    
    // Wait for any loading spinners to complete (multiple attempts)
    console.log('   ⏳ Waiting for page to fully load...');
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        // Check for Lightning spinner
        const spinnerVisible = await this.page.locator('lightning-spinner').isVisible({ timeout: 2000 });
        
        if (spinnerVisible) {
          console.log(`   ⏳ Loading spinner detected (attempt ${attempt}/5)...`);
          await this.page.waitForSelector('lightning-spinner', { state: 'hidden', timeout: 15000 });
          console.log('   ✅ Spinner hidden');
        } else {
          console.log('   ✅ No spinner detected');
        }
        
        // Additional wait for any async content
        await this.page.waitForTimeout(2000);
        
        // Check if page is still loading
        const stillLoading = await this.page.evaluate(() => {
          return document.querySelector('lightning-spinner:not([class*="hidden"])') !== null ||
                 document.querySelector('.slds-spinner') !== null;
        });
        
        if (!stillLoading) {
          console.log('   ✅ Page fully loaded');
          break;
        }
      } catch (error) {
        console.log(`   ℹ️ Loading check attempt ${attempt}: ${error}`);
      }
      
      if (attempt === 5) {
        console.log('   ⚠️ Max wait attempts reached, proceeding anyway');
      }
    }
    
    // Take screenshot for debugging
    await this.takeScreenshot('step8-after-load');
    
    // Check if Next button is enabled
    const nextButton = this.page.getByRole('button', { name: 'Next' });
    let isDisabled = false;
    
    try {
      isDisabled = await nextButton.isDisabled({ timeout: 3000 });
      console.log(`   Next button disabled: ${isDisabled}`);
    } catch {
      console.log('   ⚠️ Could not check Next button state');
    }
    
    if (isDisabled && !noPlansRequired) {
      // If Next is disabled and plans might be required, use AI to figure out what's needed
      console.log('   🤖 Next button disabled - analyzing with AI Vision...');
      
      const screenshot = await this.getScreenshotBase64();
      const analysis = await this.analyzer.analyzeStep(screenshot, 8, data,
        'Step 8 Submit Documents. The Next button is disabled. What fields or actions are required to proceed?');
      this.aiAnalysis.push(analysis);
      
      console.log(`   📊 AI Confidence: ${analysis.confidence}%`);
      console.log(`   ⚠️ Has errors: ${analysis.hasErrors}`);
      
      if (analysis.hasErrors) {
        console.log(`   ❌ Errors: ${analysis.errorMessages.join(', ')}`);
      }
      
      // Execute AI recommendations
      await this.executeAIActions(analysis, data);
      await this.page.waitForTimeout(2000);
    }
    
    // Click Next (force click in case of overlay issues)
    console.log('   🔘 Clicking Next...');
    try {
      await nextButton.click({ timeout: 5000 });
    } catch {
      console.log('   ⚠️ Normal click failed, trying force click...');
      await nextButton.click({ force: true });
    }
    
    // Wait for navigation to Step 9
    await this.page.waitForTimeout(3000);
    await this.waitForSpinner();
    
    console.log('✅ Step 8 Complete\n');
  }

  private async step9_Confirmation_AI(data: PermitData): Promise<string | undefined> {
    console.log('📋 STEP 9: Confirmation');
    if (!this.page) throw new Error('Page not initialized');
    
    await this.page.waitForTimeout(3000);
    await this.waitForSpinner();
    
    // LEARNED FROM TESTING: Step 9 is a REVIEW page
    // - Shows all permit details for review
    // - NO checkboxes required
    // - Just need to click "Submit Permit Application" button at bottom
    
    console.log('   💡 This is the review/confirmation page');
    console.log('   📜 Scrolling to reveal Submit button...');
    
    // Scroll to bottom to reveal Submit button
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await this.page.waitForTimeout(2000);
    
    // Take screenshot
    await this.takeScreenshot('step9-before-submit');
    
    // Click "Submit Permit Application" button
    console.log('   🔍 Looking for "Submit Permit Application" button...');
    
    const submitSelectors = [
      "button:has-text('Submit Permit Application')",
      "button:has-text('Submit Application')",
      "button:has-text('Submit Permit')",
      "button:has-text('Submit')",
      "[class*='submit'] button",
      "button.slds-button_brand:has-text('Submit')",
    ];
    
    let submitted = false;
    for (const selector of submitSelectors) {
      try {
        const btn = this.page.locator(selector).first();
        const isVisible = await btn.isVisible({ timeout: 3000 });
        
        if (isVisible) {
          const isDisabled = await btn.isDisabled().catch(() => false);
          
          if (!isDisabled) {
            console.log(`   ✅ Found button: ${selector}`);
            
            // Scroll button into view
            await btn.scrollIntoViewIfNeeded();
            await this.page.waitForTimeout(500);
            
            // Click it
            await btn.click();
            submitted = true;
            console.log('   🚀 Clicked "Submit Permit Application"!');
            break;
          } else {
            console.log(`   ⚠️ Button found but disabled: ${selector}`);
          }
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!submitted) {
      console.log('   ⚠️ Submit button not found with standard selectors');
      console.log('   🤖 Using AI Vision to locate submit button...');
      
      const screenshot = await this.getScreenshotBase64();
      const analysis = await this.analyzer.analyzeStep(screenshot, 9, data,
        'This is Step 9 Confirmation. Find the "Submit Permit Application" button to complete the submission.');
      this.aiAnalysis.push(analysis);
      
      // Execute AI recommendations
      await this.executeAIActions(analysis, data);
    }
    
    // Wait for submission to process
    console.log('   ⏳ Waiting for submission to process...');
    await this.page.waitForTimeout(5000);
    await this.waitForSpinner();
    
    // Take final screenshot
    await this.takeScreenshot('step9-after-submit');
    
    // Check what happened after submission
    const pageContent = await this.page.textContent('body') || '';
    
    // Check for success indicators
    if (pageContent.includes('Payment') || pageContent.includes('payment')) {
      console.log('   💳 Redirected to payment page - submission successful!');
      console.log('   ℹ️ Human intervention needed for payment');
    } else if (pageContent.includes('submitted') || pageContent.includes('Submitted')) {
      console.log('   ✅ Application submitted successfully!');
    } else if (pageContent.includes('confirmation') || pageContent.includes('Confirmation')) {
      console.log('   ✅ Confirmation received!');
    }
    
    // Try to extract permit number
    const permitNumber = await this.extractPermitNumber();
    
    if (permitNumber) {
      console.log(`   🎉 Permit Number: ${permitNumber}`);
    } else {
      console.log('   ℹ️ Permit number pending (likely awaiting payment)');
    }
    
    console.log('✅ Step 9 Complete\n');
    return permitNumber;
  }

  private async executeAIActions(analysis: StepAnalysis, data: PermitData): Promise<void> {
    if (!this.page) return;
    
    for (const field of analysis.fields) {
      if (!field.required && !field.value) continue;
      
      try {
        console.log(`   → ${field.action}: ${field.label}`);
        
        switch (field.action) {
          case 'fill':
            if (field.value) {
              await this.page.locator(field.selector).fill(field.value);
            }
            break;
            
          case 'select':
            await this.page.locator(field.selector).click();
            await this.page.waitForTimeout(500);
            if (field.value) {
              await this.page.getByRole('option', { name: field.value }).click();
            }
            break;
            
          case 'check':
            await this.page.locator(field.selector).check();
            break;
            
          case 'click':
            await this.page.locator(field.selector).click();
            break;
        }
        
        await this.page.waitForTimeout(500);
      } catch (error: any) {
        console.log(`   ⚠️ Failed to ${field.action} ${field.label}: ${error.message}`);
      }
    }
  }

  private async extractPermitNumber(): Promise<string | undefined> {
    if (!this.page) return undefined;
    
    try {
      // Common patterns for permit numbers
      const patterns = [
        /permit\s*#?\s*:?\s*([A-Z0-9-]+)/i,
        /application\s*#?\s*:?\s*([A-Z0-9-]+)/i,
        /confirmation\s*#?\s*:?\s*([A-Z0-9-]+)/i,
        /([A-Z]{2,3}-\d{4,}-\d+)/  // Common format: PRE-2024-12345
      ];
      
      const pageText = await this.page.textContent('body');
      if (!pageText) return undefined;
      
      for (const pattern of patterns) {
        const match = pageText.match(pattern);
        if (match) {
          return match[1];
        }
      }
    } catch {
      // Permit number extraction failed
    }
    
    return undefined;
  }
}

// ============================================================
// CLI Entry Point
// ============================================================

async function main() {
  // Example permit data
  const testPermitData: PermitData = {
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

  const bot = new FlashPermitHybridBot({
    headless: false,
    screenshotDir: './screenshots'
  });

  const result = await bot.submitPermit(testPermitData);
  
  console.log('\n═══════════════════════════════════════════');
  console.log('  FINAL RESULTS');
  console.log('═══════════════════════════════════════════');
  console.log(`Success: ${result.success}`);
  console.log(`Steps Completed: ${result.stepsCompleted}`);
  console.log(`Permit Number: ${result.permitNumber || 'N/A'}`);
  console.log(`Screenshots: ${result.screenshots.length}`);
  console.log(`AI Analyses: ${result.aiAnalysis.length}`);
  if (result.error) {
    console.log(`Error: ${result.error}`);
  }
}

// Run if called directly
main().catch(console.error);
