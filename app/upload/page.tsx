'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';


interface ExtractedData {
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  btu?: number;
  voltage?: string;
  seer?: number;
  refrigerant?: string;
  equipmentType?: string;
  rawText: string;
  confidence: number;
}

// Detect if user is on mobile
const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

export default function Upload() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string>('');
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [useCamera, setUseCamera] = useState(true); // Toggle between camera and file upload

  const compressImage = async (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d')!;

          // More aggressive compression for mobile devices
          const isMobile = isMobileDevice();
          const maxWidth = isMobile ? 1200 : 1920;
          const quality = isMobile ? 0.6 : 0.8; // 60% for mobile, 80% for desktop

          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            }
          } else {
            if (height > maxWidth) {
              width = (width * maxWidth) / height;
              height = maxWidth;
            }
          }

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                // Log compression details
                console.log('Device:', isMobile ? 'Mobile' : 'Desktop');
                console.log('Original size:', (file.size / 1024).toFixed(2), 'KB');
                console.log('Compressed size:', (blob.size / 1024).toFixed(2), 'KB');
                console.log('Reduction:', ((1 - blob.size / file.size) * 100).toFixed(1), '%');
                resolve(blob);
              } else {
                reject(new Error('Compression failed'));
              }
            },
            'image/jpeg',
            quality
          );
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError('');
      setExtractedData(null);

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = async () => {
  if (!selectedFile) return;

  setUploading(true);
  setProcessing(false);
  setError('');

  try {
    // Step 1: Compress image
    console.log('📦 Compressing image...');
    const compressedBlob = await compressImage(selectedFile);
    console.log(
      `✅ Compressed: ${(selectedFile.size / 1024).toFixed(0)}KB → ${(
        compressedBlob.size / 1024
      ).toFixed(0)}KB`
    );

    // Step 2: Upload to Azure via API route
    console.log('☁️ Uploading to Azure...');
    
    const formData = new FormData();
    formData.append('file', compressedBlob, selectedFile.name);

    const uploadResponse = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    const uploadResult = await uploadResponse.json();

    if (!uploadResult.success) {
      throw new Error(uploadResult.error || 'Upload failed');
    }

    const blobUrl = uploadResult.url; // Your API returns 'url', not 'blobUrl'
    console.log('✅ Uploaded to:', blobUrl);

    setUploading(false);
    setProcessing(true);

    // Step 3: Extract equipment data using OCR
    console.log('🤖 Extracting equipment data...');
    const ocrResponse = await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl: blobUrl }),
    });

    const ocrResult = await ocrResponse.json();

    if (ocrResult.success) {
      console.log('✅ OCR Complete:', ocrResult.data);
      setExtractedData(ocrResult.data);
    } else {
      throw new Error(ocrResult.error || 'OCR failed');
    }

    setProcessing(false);

  } catch (err: any) {
    console.error('❌ Error:', err);
    setError(err.message || 'Upload failed');
    setUploading(false);
    setProcessing(false);
  }
};

  const handleReset = () => {
    setSelectedFile(null);
    setPreview('');
    setExtractedData(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800">
      {/* Header */}
      <nav className="bg-blue-900/50 backdrop-blur-sm border-b border-blue-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/dashboard" className="flex items-center">
              <div className="flex items-center justify-center w-10 h-10 bg-yellow-400 rounded-full mr-3">
                <svg className="w-6 h-6 text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-white text-xl font-bold">FlashPermit</span>
            </Link>
            <Link href="/dashboard" className="text-blue-200 hover:text-white text-sm font-medium">
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Upload Equipment Photo</h1>
          <p className="text-gray-600 mb-8">Take a photo of the equipment nameplate for AI analysis</p>

          {/* Camera/File Toggle (Mobile Only) */}
          {isMobileDevice() && !preview && (
            <div className="mb-6 flex gap-2">
              <button
                onClick={() => setUseCamera(true)}
                className={`flex-1 py-3 rounded-lg font-semibold transition-colors ${
                  useCamera
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                📸 Take Photo
              </button>
              <button
                onClick={() => setUseCamera(false)}
                className={`flex-1 py-3 rounded-lg font-semibold transition-colors ${
                  !useCamera
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                📁 Upload File
              </button>
            </div>
          )}

          {/* Upload Area */}
          {!preview && !extractedData && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center cursor-pointer hover:border-blue-500 transition-colors"
            >
              <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-lg font-medium text-gray-700 mb-2">
                {isMobileDevice() && useCamera ? 'Take Photo' : 'Click to upload'}
              </p>
              <p className="text-sm text-gray-500">PNG, JPG up to 10MB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture={useCamera ? 'environment' : undefined}
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          )}

          {/* Preview */}
          {preview && !extractedData && (
            <div className="space-y-6">
              <div className="relative">
                <img
                  src={preview}
                  alt="Preview"
                  className="w-full max-h-96 object-contain rounded-lg border-2 border-gray-200"
                />
                <button
                  onClick={handleReset}
                  className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {selectedFile && (
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-gray-700">
                    <strong>File:</strong> {selectedFile.name}
                  </p>
                  <p className="text-sm text-gray-700">
                    <strong>Size:</strong> {(selectedFile.size / 1024).toFixed(2)} KB
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    ✓ Image will be optimized for {isMobileDevice() ? 'mobile' : 'fast'} upload
                  </p>
                </div>
              )}

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-800">{error}</p>
                </div>
              )}

              <button
                onClick={handleUpload}
                disabled={uploading || processing}
                className="w-full bg-blue-600 text-white py-4 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {uploading && (
                  <>
                    <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Uploading...
                  </>
                )}
                {processing && (
                  <>
                    <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Analyzing with AI...
                  </>
                )}
                {!uploading && !processing && '🤖 Process Photo with AI'}
              </button>
            </div>
          )}

          {/* Extracted Data */}
          {extractedData && (
            <div className="space-y-6">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-800 font-semibold">✅ Equipment Data Extracted!</p>
                <p className="text-green-700 text-sm mt-1">
                  Confidence: {extractedData.confidence}%
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Manufacturer</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {extractedData.manufacturer || 'Not detected'}
                  </p>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Model Number</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {extractedData.model || 'Not detected'}
                  </p>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Serial Number</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {extractedData.serialNumber || 'Not detected'}
                  </p>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">BTU</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {extractedData.btu ? extractedData.btu.toLocaleString() : 'Not detected'}
                  </p>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Voltage</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {extractedData.voltage || 'Not detected'}
                  </p>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">SEER Rating</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {extractedData.seer || 'Not detected'}
                  </p>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Refrigerant</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {extractedData.refrigerant || 'Not detected'}
                  </p>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Equipment Type</p>
                  <p className="text-lg font-semibold text-gray-900 capitalize">
                    {extractedData.equipmentType || 'Not detected'}
                  </p>
                </div>
              </div>

              <details className="p-4 bg-gray-50 rounded-lg">
                <summary className="cursor-pointer font-semibold text-gray-700">
                  View Raw Text
                </summary>
                <pre className="mt-4 text-sm text-gray-600 whitespace-pre-wrap">
                  {extractedData.rawText}
                </pre>
              </details>

              <div className="flex gap-4">
                <button
                  onClick={handleReset}
                  className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                >
                  Upload Another
                </button>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                  Continue to Permit
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Tips */}
        {!extractedData && (
          <div className="mt-8 bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-blue-400">
            <h3 className="text-lg font-semibold text-white mb-3">📸 Photo Tips:</h3>
            <ul className="space-y-2 text-blue-100">
              <li>• Make sure the nameplate is clearly visible</li>
              <li>• Good lighting helps with accuracy</li>
              <li>• Avoid glare and shadows</li>
              <li>• Get close enough to read the text</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}