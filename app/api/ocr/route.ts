import { NextRequest, NextResponse } from 'next/server';
import { extractEquipmentData } from '@/lib/ocr';

export async function POST(request: NextRequest) {
  try {
    const { imageUrl } = await request.json();

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'Image URL is required' },
        { status: 400 }
      );
    }

    console.log('🔍 OCR API: Processing image:', imageUrl);

    // Extract equipment data using Azure AI
    const result = await extractEquipmentData(imageUrl);

    console.log('✅ OCR API: Extraction complete:', result);

    return NextResponse.json({
      success: true,
      data: result,
    });

  } catch (error: any) {
    console.error('❌ OCR API Error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Failed to extract equipment data'
      },
      { status: 500 }
    );
  }
}