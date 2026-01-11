/**
 * FlashPermit AI Form Analyzer
 * Uses GPT-4o Vision to analyze portal screenshots and determine form actions
 * 
 * Supports both:
 * - Azure OpenAI (enterprise)
 * - Regular OpenAI API (simpler setup)
 */

import OpenAI from 'openai';
import { AzureOpenAI } from 'openai';

// Types for structured AI responses
export interface FormField {
  type: 'text' | 'select' | 'checkbox' | 'radio' | 'button' | 'file-upload';
  label: string;
  selector: string;  // CSS selector or aria label
  value?: string;    // Value to fill (for text/select)
  action?: 'click' | 'fill' | 'select' | 'check' | 'upload';
  required: boolean;
  currentValue?: string;  // What's already filled
}

export interface StepAnalysis {
  stepNumber: number;
  stepName: string;
  fields: FormField[];
  nextButtonSelector: string;
  hasErrors: boolean;
  errorMessages: string[];
  isLoading: boolean;
  recommendations: string[];
  confidence: number;  // 0-100
}

export interface PermitData {
  // Contractor
  rocLicenseNumber: string;
  cityPrivilegeLicense: string;
  contractorName: string;
  contractorPhone: string;
  contractorEmail: string;
  
  // Property
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  
  // Job Details
  permitType: string;
  workType: string;
  valuationCost: number;
  
  // Equipment
  equipmentTonnage: number;
  manufacturer?: string;
  model?: string;
  btu?: number;
  
  // Installation Type
  installationType: 'ac-furnace' | 'ac-only' | 'furnace-only' | 'mini-split' | 'custom';
}

export class AIFormAnalyzer {
  private client: OpenAI | AzureOpenAI;
  private model: string;
  private isAzure: boolean;

  constructor(config: {
    // For regular OpenAI
    apiKey?: string;
    
    // For Azure OpenAI
    azureEndpoint?: string;
    azureApiKey?: string;
    azureDeploymentName?: string;
    azureApiVersion?: string;
    
    // Model name (for regular OpenAI) or deployment name (for Azure)
    model?: string;
  }) {
    // Determine which provider to use
    if (config.azureEndpoint && config.azureApiKey) {
      // Azure OpenAI
      this.isAzure = true;
      this.client = new AzureOpenAI({
        endpoint: config.azureEndpoint,
        apiKey: config.azureApiKey,
        apiVersion: config.azureApiVersion || '2024-08-01-preview',
      });
      this.model = config.azureDeploymentName || config.model || 'gpt-4o';
      console.log('🔵 Using Azure OpenAI');
    } else if (config.apiKey) {
      // Regular OpenAI
      this.isAzure = false;
      this.client = new OpenAI({
        apiKey: config.apiKey,
      });
      this.model = config.model || 'gpt-4o';
      console.log('🟢 Using OpenAI API');
    } else {
      throw new Error('Must provide either OpenAI API key or Azure OpenAI credentials');
    }
  }

  /**
   * Analyze a screenshot and determine what fields exist and what actions to take
   */
  async analyzeStep(
    screenshotBase64: string,
    currentStep: number,
    permitData: PermitData,
    previousContext?: string
  ): Promise<StepAnalysis> {
    
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(currentStep, permitData, previousContext);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${screenshotBase64}`,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 2000,
        temperature: 0.1,  // Low temperature for consistent analysis
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from AI');
      }

      return this.parseAnalysis(content, currentStep);
    } catch (error) {
      console.error('AI Analysis Error:', error);
      throw error;
    }
  }

  /**
   * Determine the next action to take based on current state
   */
  async determineAction(
    screenshotBase64: string,
    analysis: StepAnalysis,
    permitData: PermitData
  ): Promise<{
    action: 'fill_field' | 'click_button' | 'wait' | 'scroll' | 'error';
    target: string;
    value?: string;
    reason: string;
  }> {
    
    const prompt = `Based on this form analysis and screenshot, what is the SINGLE next action to take?

Current Step: ${analysis.stepNumber} - ${analysis.stepName}
Has Errors: ${analysis.hasErrors}
Is Loading: ${analysis.isLoading}
Unfilled Required Fields: ${analysis.fields.filter(f => f.required && !f.currentValue).map(f => f.label).join(', ') || 'None'}

Available permit data:
- Valuation Cost: $${permitData.valuationCost}
- Equipment Tonnage: ${permitData.equipmentTonnage} tons
- Contractor: ${permitData.contractorName}
- Address: ${permitData.streetAddress}, ${permitData.city}, ${permitData.state} ${permitData.zipCode}

Respond in JSON format:
{
  "action": "fill_field" | "click_button" | "wait" | "scroll" | "error",
  "target": "selector or button name",
  "value": "value to fill if applicable",
  "reason": "brief explanation"
}`;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: 'You are a form automation expert. Respond only with valid JSON.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${screenshotBase64}`,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 500,
        temperature: 0,
      });

      const content = response.choices[0]?.message?.content || '{}';
      return JSON.parse(content.replace(/```json\n?|\n?```/g, ''));
    } catch (error) {
      return {
        action: 'error',
        target: '',
        reason: `AI action determination failed: ${error}`
      };
    }
  }

  private buildSystemPrompt(): string {
    return `You are an expert at analyzing web form screenshots for automation purposes.
You are helping automate HVAC permit submissions on the Phoenix SHAPE PHX portal.

Your task is to:
1. Identify the current step/page in the permit wizard
2. List all visible form fields with their types and current values
3. Determine the correct CSS selectors or ARIA labels for each field
4. Identify any validation errors or loading states
5. Recommend what data to fill based on the permit information provided

IMPORTANT CONTEXT about Phoenix SHAPE Portal:
- It uses Salesforce Lightning Web Components (LWC)
- Dropdowns use 'lightning-combobox' with role="combobox"
- Checkboxes often use 'lightning-input' with type="checkbox"
- Buttons have role="button" and specific text
- There's a "Whatfix" overlay that may block interactions (ignore it in analysis)
- Steps are numbered 1-9, with a progress indicator usually visible

For selectors, prefer:
1. getByRole('combobox', { name: 'Field Name' }) for dropdowns
2. getByRole('button', { name: 'Button Text' }) for buttons  
3. getByLabel('Field Label') for inputs
4. getByText('Text Content') for clickable text

Always respond in valid JSON format.`;
  }

  private buildUserPrompt(step: number, data: PermitData, previousContext?: string): string {
    return `Analyze this screenshot of Step ${step} of the Phoenix SHAPE PHX permit portal.

PERMIT DATA TO FILL:
- Installation Type: ${data.installationType}
- Valuation Cost: $${data.valuationCost}
- Equipment Tonnage: ${data.equipmentTonnage} tons
- Street Address: ${data.streetAddress}
- City: ${data.city}, ${data.state} ${data.zipCode}
- Contractor: ${data.contractorName}
- ROC License: ${data.rocLicenseNumber}
- City Privilege License: ${data.cityPrivilegeLicense}
${data.manufacturer ? `- Equipment Manufacturer: ${data.manufacturer}` : ''}
${data.model ? `- Equipment Model: ${data.model}` : ''}
${data.btu ? `- BTU Rating: ${data.btu}` : ''}

${previousContext ? `PREVIOUS CONTEXT: ${previousContext}` : ''}

Respond with JSON in this exact format:
{
  "stepNumber": ${step},
  "stepName": "Name of this step",
  "fields": [
    {
      "type": "text|select|checkbox|radio|button|file-upload",
      "label": "Field Label",
      "selector": "playwright selector string",
      "value": "recommended value to fill",
      "action": "click|fill|select|check|upload",
      "required": true|false,
      "currentValue": "already filled value or null"
    }
  ],
  "nextButtonSelector": "selector for Next button",
  "hasErrors": true|false,
  "errorMessages": ["list of any error messages visible"],
  "isLoading": true|false,
  "recommendations": ["list of recommended actions in order"],
  "confidence": 85
}`;
  }

  private parseAnalysis(content: string, expectedStep: number): StepAnalysis {
    try {
      // Clean the response (remove markdown code blocks if present)
      const cleaned = content.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      
      return {
        stepNumber: parsed.stepNumber || expectedStep,
        stepName: parsed.stepName || `Step ${expectedStep}`,
        fields: parsed.fields || [],
        nextButtonSelector: parsed.nextButtonSelector || "button:has-text('Next')",
        hasErrors: parsed.hasErrors || false,
        errorMessages: parsed.errorMessages || [],
        isLoading: parsed.isLoading || false,
        recommendations: parsed.recommendations || [],
        confidence: parsed.confidence || 50,
      };
    } catch (error) {
      console.error('Failed to parse AI response:', content);
      return {
        stepNumber: expectedStep,
        stepName: `Step ${expectedStep}`,
        fields: [],
        nextButtonSelector: "button:has-text('Next')",
        hasErrors: false,
        errorMessages: [],
        isLoading: false,
        recommendations: ['Manual intervention may be required'],
        confidence: 0,
      };
    }
  }
}

/**
 * Factory function to create analyzer from environment variables
 * 
 * Supports two configurations:
 * 
 * 1. Regular OpenAI (simpler):
 *    OPENAI_API_KEY=sk-...
 * 
 * 2. Azure OpenAI (enterprise):
 *    AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
 *    AZURE_OPENAI_API_KEY=...
 *    AZURE_OPENAI_DEPLOYMENT=gpt-4o
 */
export function createAnalyzerFromEnv(): AIFormAnalyzer {
  // Check for regular OpenAI first (simpler setup)
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    console.log('📍 Found OPENAI_API_KEY - using OpenAI API');
    return new AIFormAnalyzer({
      apiKey: openaiKey,
      model: process.env.OPENAI_MODEL || 'gpt-4o',
    });
  }

  // Check for Azure OpenAI
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const azureApiKey = process.env.AZURE_OPENAI_API_KEY;
  
  if (azureEndpoint && azureApiKey) {
    console.log('📍 Found Azure OpenAI credentials');
    return new AIFormAnalyzer({
      azureEndpoint,
      azureApiKey,
      azureDeploymentName: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o',
      azureApiVersion: process.env.AZURE_OPENAI_API_VERSION,
    });
  }

  // No credentials found
  throw new Error(`
Missing AI configuration. Set one of these in .env:

Option 1 - OpenAI (recommended for quick start):
  OPENAI_API_KEY=sk-your-key-here

Option 2 - Azure OpenAI:
  AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
  AZURE_OPENAI_API_KEY=your-key-here
  AZURE_OPENAI_DEPLOYMENT=gpt-4o
`);
}
