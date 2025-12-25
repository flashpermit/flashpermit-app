/**
 * FlashPermit - SHAPE PHX Playwright Automation Bot
 * 
 * Automates permit submission to Phoenix SHAPE PHX portal
 * Architecture: State machine with idempotent step handlers
 * Payment: Human-in-loop (pauses for manual payment)
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { createClient } from '@supabase/supabase-js';

// Types
interface PermitData {
  permitId: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  contractorName: string;
  rocLicenseNumber: string;
  valuationCost: number;
  manufacturer?: string;
  modelNumber?: string;
  equipmentTonnage?: number;
  btu?: number;
  equipmentPhotoUrl?: string;
}

interface AutomationState {
  currentStep: string;
  lastCompletedStep: string;
  data: Record<string, any>;
  errors: string[];
  screenshots: string[];
}

interface StepResult {
  success: boolean;
  nextStep: string;
  error?: string;
  screenshot?: string;
}

// Workflow Steps
const WORKFLOW_STEPS = {
  STEP_0_LOGIN: 'login',
  STEP_1_APPLICANT: 'applicant',
  STEP_2_ADDRESS: 'address',
  STEP_3_PERMIT_DETAILS: 'permit_details',
  STEP_4_PROJECT_DETAILS: 'project_details',
  STEP_5_CITY_USE: 'city_use',
  STEP_6_WORK_ITEMS: 'work_items',
  STEP_7_WORK_DETAILS: 'work_details',
  STEP_8_DOCUMENTS: 'documents',
  STEP_9_CONFIRMATION: 'confirmation',
  PAYMENT_REDIRECT: 'payment_redirect',
  PAYMENT_COMPLETE: 'payment_complete',
  DOWNLOAD_PERMIT: 'download_permit',
  COMPLETE: 'complete'
};

/**
 * Main Playwright Bot Class
 */
export class ShapePhxBot {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private permitData: PermitData;
  private state: AutomationState;
  private supabase: any;

  constructor(permitData: PermitData) {
    this.permitData = permitData;
    this.state = {
      currentStep: WORKFLOW_STEPS.STEP_0_LOGIN,
      lastCompletedStep: '',
      data: {},
      errors: [],
      screenshots: []
    };

    // Initialize Supabase (for logging)
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * Initialize browser and context
   */
  async init() {
    this.browser = await chromium.launch({
      headless: process.env.NODE_ENV === 'production',
      slowMo: 50 // Slight delay for stability
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });

    this.page = await this.context.newPage();
  }

  /**
   * Run the complete automation workflow
   */
  async run(): Promise<{ success: boolean; permitNumber?: string; error?: string }> {
    try {
      await this.init();

      // Load saved state if exists
      await this.loadState();

      // Execute workflow steps
      while (this.state.currentStep !== WORKFLOW_STEPS.COMPLETE) {
        console.log(`Executing step: ${this.state.currentStep}`);

        const result = await this.executeStep(this.state.currentStep);

        if (!result.success) {
          throw new Error(`Step ${this.state.currentStep} failed: ${result.error}`);
        }

        // Save checkpoint
        await this.saveCheckpoint(this.state.currentStep);

        // Move to next step
        this.state.lastCompletedStep = this.state.currentStep;
        this.state.currentStep = result.nextStep;

        // Stop at payment redirect
        if (this.state.currentStep === WORKFLOW_STEPS.PAYMENT_REDIRECT) {
          return {
            success: true,
            error: 'AWAITING_PAYMENT'
          };
        }
      }

      return { success: true, permitNumber: this.state.data.permitNumber };

    } catch (error: any) {
      console.error('Automation error:', error);
      await this.handleError(error);
      return { success: false, error: error.message };

    } finally {
      await this.cleanup();
    }
  }

  /**
   * Resume automation after payment completion
   */
  async resumeAfterPayment(): Promise<{ success: boolean; permitNumber?: string; error?: string }> {
    try {
      await this.init();
      await this.loadState();

      // Jump to post-payment steps
      this.state.currentStep = WORKFLOW_STEPS.PAYMENT_COMPLETE;

      while (this.state.currentStep !== WORKFLOW_STEPS.COMPLETE) {
        const result = await this.executeStep(this.state.currentStep);

        if (!result.success) {
          throw new Error(`Step ${this.state.currentStep} failed: ${result.error}`);
        }

        this.state.currentStep = result.nextStep;
      }

      return { success: true, permitNumber: this.state.data.permitNumber };

    } catch (error: any) {
      return { success: false, error: error.message };
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Execute individual workflow step
   */
  private async executeStep(step: string): Promise<StepResult> {
    try {
      switch (step) {
        case WORKFLOW_STEPS.STEP_0_LOGIN:
          return await this.loginStep();
        case WORKFLOW_STEPS.STEP_1_APPLICANT:
          return await this.applicantStep();
        case WORKFLOW_STEPS.STEP_2_ADDRESS:
          return await this.addressStep();
        case WORKFLOW_STEPS.STEP_3_PERMIT_DETAILS:
          return await this.permitDetailsStep();
        case WORKFLOW_STEPS.STEP_4_PROJECT_DETAILS:
          return await this.projectDetailsStep();
        case WORKFLOW_STEPS.STEP_5_CITY_USE:
          return await this.cityUseStep();
        case WORKFLOW_STEPS.STEP_6_WORK_ITEMS:
          return await this.workItemsStep();
        case WORKFLOW_STEPS.STEP_7_WORK_DETAILS:
          return await this.workDetailsStep();
        case WORKFLOW_STEPS.STEP_8_DOCUMENTS:
          return await this.documentsStep();
        case WORKFLOW_STEPS.STEP_9_CONFIRMATION:
          return await this.confirmationStep();
        case WORKFLOW_STEPS.PAYMENT_COMPLETE:
          return await this.paymentCompleteStep();
        case WORKFLOW_STEPS.DOWNLOAD_PERMIT:
          return await this.downloadPermitStep();
        default:
          throw new Error(`Unknown step: ${step}`);
      }
    } catch (error: any) {
      return { success: false, nextStep: step, error: error.message };
    }
  }

  /**
   * STEP 0: Login
   */
  private async loginStep(): Promise<StepResult> {
    if (!this.page) throw new Error('Page not initialized');

    await this.page.goto('https://shapephx.phoenix.gov/s/login');

    // TODO: Get credentials from environment or secure storage
    const email = process.env.SHAPE_PHX_EMAIL!;
    const password = process.env.SHAPE_PHX_PASSWORD!;

    await this.page.getByLabel('Email').fill(email);
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', { name: 'Log In' }).click();

    // Wait for login success
    await this.page.waitForURL(/.*\/s\/$/, { timeout: 10000 });

    await this.takeScreenshot('login_success');

    return {
      success: true,
      nextStep: WORKFLOW_STEPS.STEP_1_APPLICANT
    };
  }

  /**
   * STEP 1: Applicant
   */
  private async applicantStep(): Promise<StepResult> {
    if (!this.page) throw new Error('Page not initialized');

    // Navigate to Apply for Permit
    await this.page.goto('https://shapephx.phoenix.gov/s/');
    await this.page.getByRole('button', { name: 'Apply For Permit' }).click();

    // Select Construction and Trades Residential
    await this.page.waitForSelector('text=Construction and Trades Residential Permit');
    await this.page.click('text=Construction and Trades Residential Permit');
    await this.page.getByRole('button', { name: 'Next' }).click();

    // Fill Registered Contractor
    await this.page.waitForSelector('text=Applicant');
    await this.page.getByLabel('Registered Contractor').click();
    await this.page.getByLabel('Registered Contractor').fill(this.permitData.rocLicenseNumber);
    
    // Wait for dropdown and select
    await this.page.waitForTimeout(1000); // Wait for search results
    await this.page.keyboard.press('ArrowDown');
    await this.page.keyboard.press('Enter');

    await this.takeScreenshot('applicant_filled');

    await this.page.getByRole('button', { name: 'Next' }).click();

    return {
      success: true,
      nextStep: WORKFLOW_STEPS.STEP_2_ADDRESS
    };
  }

  /**
   * STEP 2: Address (GIS Autocomplete)
   */
  private async addressStep(): Promise<StepResult> {
    if (!this.page) throw new Error('Page not initialized');

    await this.page.waitForSelector('text=Address');

    // Build full address
    const fullAddress = `${this.permitData.streetAddress} ${this.permitData.city} ${this.permitData.state} ${this.permitData.zipCode}`;

    // Type partial address to trigger autocomplete
    const addressInput = this.page.getByLabel('Address');
    await addressInput.click();
    await addressInput.fill(fullAddress.substring(0, 25));

    // Wait for autocomplete dropdown
    await this.page.waitForTimeout(2000);

    // Select first matching result
    await this.page.keyboard.press('ArrowDown');
    await this.page.keyboard.press('Enter');

    await this.takeScreenshot('address_selected');

    await this.page.getByRole('button', { name: 'Next' }).click();

    return {
      success: true,
      nextStep: WORKFLOW_STEPS.STEP_3_PERMIT_DETAILS
    };
  }

  /**
   * STEP 3: Permit Details
   */
  private async permitDetailsStep(): Promise<StepResult> {
    if (!this.page) throw new Error('Page not initialized');

    await this.page.waitForSelector('text=Permit Details');

    // Select dropdowns
    await this.page.getByLabel('Permit Work Type').selectOption('Repairs/ Replacements');
    await this.page.getByLabel('Permit Use Class').selectOption('Residential');
    await this.page.getByLabel('Use Type').selectOption('Single Family');
    await this.page.getByLabel('Land Use Type').selectOption('Single Family');
    await this.page.getByLabel('Building from Standard Plan').selectOption('No');

    await this.takeScreenshot('permit_details_filled');

    await this.page.getByRole('button', { name: 'Next' }).click();

    return {
      success: true,
      nextStep: WORKFLOW_STEPS.STEP_4_PROJECT_DETAILS
    };
  }

  /**
   * STEP 4: Project Details
   */
  private async projectDetailsStep(): Promise<StepResult> {
    if (!this.page) throw new Error('Page not initialized');

    await this.page.waitForSelector('text=Project Details');

    await this.page.getByLabel('Plan Submission Type').selectOption('No Plans Required');
    await this.page.getByLabel('Project Valuation').fill(this.permitData.valuationCost.toString());

    await this.takeScreenshot('project_details_filled');

    await this.page.getByRole('button', { name: 'Next' }).click();

    return {
      success: true,
      nextStep: WORKFLOW_STEPS.STEP_5_CITY_USE
    };
  }

  /**
   * STEP 5: For City Use Only
   */
  private async cityUseStep(): Promise<StepResult> {
    if (!this.page) throw new Error('Page not initialized');

    await this.page.waitForSelector('text=For City Use Only');

    // Fill ROC license number
    await this.page.getByLabel('ROC license #').fill(this.permitData.rocLicenseNumber);

    await this.takeScreenshot('city_use_filled');

    await this.page.getByRole('button', { name: 'Next' }).click();

    return {
      success: true,
      nextStep: WORKFLOW_STEPS.STEP_6_WORK_ITEMS
    };
  }

  /**
   * STEP 6: Select Your Work Items
   */
  private async workItemsStep(): Promise<StepResult> {
    if (!this.page) throw new Error('Page not initialized');

    await this.page.waitForSelector('text=Select Your Work Items');

    // Check HVAC option
    await this.page.getByLabel('Replace Furnace or Air Conditioner').check();

    await this.takeScreenshot('work_items_selected');

    await this.page.getByRole('button', { name: 'Next' }).click();

    return {
      success: true,
      nextStep: WORKFLOW_STEPS.STEP_7_WORK_DETAILS
    };
  }

  /**
   * STEP 7: Work Item Details
   */
  private async workDetailsStep(): Promise<StepResult> {
    if (!this.page) throw new Error('Page not initialized');

    await this.page.waitForSelector('text=Work Item Details');

    // Optional: Customize description with equipment details
    if (this.permitData.manufacturer && this.permitData.modelNumber) {
      const description = `Replace Furnace or Air Conditioner - ${this.permitData.manufacturer} ${this.permitData.modelNumber}, ${this.permitData.equipmentTonnage} Ton, ${this.permitData.btu} BTU`;
      await this.page.getByLabel('Description').fill(description);
    }

    await this.takeScreenshot('work_details_filled');

    await this.page.getByRole('button', { name: 'Next' }).click();

    return {
      success: true,
      nextStep: WORKFLOW_STEPS.STEP_8_DOCUMENTS
    };
  }

  /**
   * STEP 8: Submit Documents
   */
  private async documentsStep(): Promise<StepResult> {
    if (!this.page) throw new Error('Page not initialized');

    await this.page.waitForSelector('text=Submit Documents');

    // TODO: Upload equipment photo if available
    // For MVP, skip document upload
    // Will implement in Phase 2

    await this.takeScreenshot('documents_page');

    await this.page.getByRole('button', { name: 'Next' }).click();

    return {
      success: true,
      nextStep: WORKFLOW_STEPS.STEP_9_CONFIRMATION
    };
  }

  /**
   * STEP 9: Confirmation
   */
  private async confirmationStep(): Promise<StepResult> {
    if (!this.page) throw new Error('Page not initialized');

    await this.page.waitForSelector('text=Confirmation');

    await this.takeScreenshot('confirmation_page');

    // Click Next to proceed to payment
    await this.page.getByRole('button', { name: 'Next' }).click();

    // Wait for payment redirect
    await this.page.waitForURL(/.*payment.*/, { timeout: 10000 });

    // Extract payment URL and fee
    const paymentUrl = this.page.url();
    
    // Try to extract fee amount
    let feeAmount = 'Unknown';
    try {
      const feeElement = await this.page.locator('.total-fee, .cart-total').first();
      feeAmount = await feeElement.textContent() || 'Unknown';
    } catch (e) {
      // Fee element not found - that's okay
    }

    await this.takeScreenshot('payment_redirect');

    // Save payment info
    this.state.data.paymentUrl = paymentUrl;
    this.state.data.feeAmount = feeAmount;

    // PAUSE HERE - waiting for manual payment
    return {
      success: true,
      nextStep: WORKFLOW_STEPS.PAYMENT_REDIRECT
    };
  }

  /**
   * PAYMENT COMPLETE: Resume after manual payment
   */
  private async paymentCompleteStep(): Promise<StepResult> {
    if (!this.page) throw new Error('Page not initialized');

    // Wait for confirmation page
    await this.page.waitForURL(/.*confirmation.*|.*receipt.*/, { timeout: 30000 });

    return {
      success: true,
      nextStep: WORKFLOW_STEPS.DOWNLOAD_PERMIT
    };
  }

  /**
   * DOWNLOAD PERMIT: Get instant PDF
   */
  private async downloadPermitStep(): Promise<StepResult> {
    if (!this.page) throw new Error('Page not initialized');

    // Extract permit number
    const permitNumber = await this.page.locator('.permit-number, .confirmation-number').first().textContent();
    this.state.data.permitNumber = permitNumber?.trim();

    await this.takeScreenshot('permit_issued');

    // Look for download button
    const downloadButton = this.page.getByRole('button', { name: /view permit|print permit|download/i });

    // Set up download listener
    const downloadPromise = this.page.waitForEvent('download');
    await downloadButton.click();
    const download = await downloadPromise;

    // Save PDF path
    const pdfPath = `/tmp/${this.permitData.permitId}_${this.state.data.permitNumber}.pdf`;
    await download.saveAs(pdfPath);
    this.state.data.pdfPath = pdfPath;

    // TODO: Upload to Azure Blob Storage

    return {
      success: true,
      nextStep: WORKFLOW_STEPS.COMPLETE
    };
  }

  /**
   * Take screenshot for debugging
   */
  private async takeScreenshot(name: string) {
    if (!this.page) return;

    const screenshotPath = `/tmp/screenshots/${this.permitData.permitId}_${name}.png`;
    await this.page.screenshot({ path: screenshotPath, fullPage: true });
    this.state.screenshots.push(screenshotPath);
  }

  /**
   * Save checkpoint to database
   */
  private async saveCheckpoint(step: string) {
    await this.supabase
      .from('portal_submissions')
      .upsert({
        permit_id: this.permitData.permitId,
        current_step: step,
        state_data: this.state,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'permit_id'
      });
  }

  /**
   * Load saved state from database
   */
  private async loadState() {
    const { data } = await this.supabase
      .from('portal_submissions')
      .select('*')
      .eq('permit_id', this.permitData.permitId)
      .single();

    if (data && data.state_data) {
      this.state = data.state_data;
    }
  }

  /**
   * Handle error
   */
  private async handleError(error: Error) {
    if (this.page) {
      await this.takeScreenshot('error');
    }

    this.state.errors.push(error.message);
    await this.saveCheckpoint(this.state.currentStep);

    // Log to database
    await this.supabase
      .from('portal_submissions')
      .update({
        submission_status: 'failed',
        error_message: error.message
      })
      .eq('permit_id', this.permitData.permitId);
  }

  /**
   * Cleanup browser resources
   */
  private async cleanup() {
    if (this.page) await this.page.close();
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
  }
}

/**
 * Helper function to run automation
 */
export async function runShapePhxAutomation(permitData: PermitData) {
  const bot = new ShapePhxBot(permitData);
  return await bot.run();
}

/**
 * Helper function to resume after payment
 */
export async function resumeShapePhxAutomation(permitData: PermitData) {
  const bot = new ShapePhxBot(permitData);
  return await bot.resumeAfterPayment();
}
