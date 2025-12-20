'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';

// Detect if user is on mobile
const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

// Enhanced image compression with mobile optimization
const compressImage = (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // More aggressive compression for mobile devices
        const isMobile = isMobileDevice();
        const maxWidth = isMobile ? 1200 : 1600;
        const quality = isMobile ? 0.6 : 0.7; // 60% for mobile, 70% for desktop

        // Calculate new dimensions
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              
              // Log compression details
              console.log('Device:', isMobile ? 'Mobile' : 'Desktop');
              console.log('Original size:', (file.size / 1024).toFixed(2), 'KB');
              console.log('Compressed size:', (blob.size / 1024).toFixed(2), 'KB');
              console.log('Reduction:', ((1 - blob.size / file.size) * 100).toFixed(1), '%');
              
              resolve(compressedFile);
            } else {
              reject(new Error('Compression failed'));
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

export default function Upload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState('');
  const [useCamera, setUseCamera] = useState(true); // Toggle between camera and file upload
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadSuccess(false);
      setError('');
      
      try {
        // Compress image before setting
        const compressedFile = await compressImage(file);
        setSelectedFile(compressedFile);
        
        // Create preview
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreviewUrl(reader.result as string);
        };
        reader.readAsDataURL(compressedFile);
      } catch (err) {
        console.error('Compression error:', err);
        setError('Failed to process image. Please try again.');
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setUploadSuccess(true);
        console.log('Upload successful:', data);
      } else {
        setError(data.error || 'Upload failed');
      }
    } catch (err) {
      setError('Upload failed. Please try again.');
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewUrl('');
    setUploadSuccess(false);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
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
            <Link href="/dashboard" className="text-blue-200 hover:text-white text-sm">
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">
            Upload Equipment Photo
          </h1>
          <p className="text-xl text-blue-100">
            Take a clear photo of the equipment nameplate
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-xl p-8">
          {/* Success State */}
          {uploadSuccess ? (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6">
                <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-3">
                Photo Uploaded Successfully!
              </h2>
              <p className="text-gray-600 mb-6">
                Your equipment photo has been saved to Azure Storage
              </p>
              
              {previewUrl && (
                <div className="mb-6">
                  <img 
                    src={previewUrl} 
                    alt="Uploaded" 
                    className="max-w-md mx-auto rounded-lg shadow-md"
                  />
                </div>
              )}

              <div className="space-y-3">
                <button
                  onClick={handleReset}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                  Upload Another Photo
                </button>
                <Link href="/dashboard">
                  <button className="w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors">
                    Back to Dashboard
                  </button>
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Camera/File Toggle (Mobile Only) */}
              {isMobileDevice() && (
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
              <div className="mb-6">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture={useCamera ? 'environment' : undefined}
                  onChange={handleFileSelect}
                  className="hidden"
                />
                
                {!previewUrl ? (
                  <div 
                    onClick={triggerFileInput}
                    className="border-2 border-dashed border-gray-300 rounded-lg p-12 hover:border-blue-500 cursor-pointer transition-colors"
                  >
                    <div className="text-center">
                      <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <p className="text-lg font-semibold text-gray-700 mb-2">
                        {useCamera ? 'Take Photo' : 'Upload Image'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {useCamera 
                          ? 'Click to open camera'
                          : 'Click to select from files'
                        }
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <img 
                      src={previewUrl} 
                      alt="Preview" 
                      className="max-w-full rounded-lg shadow-md mx-auto"
                    />
                    <button
                      onClick={handleReset}
                      className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {/* Error Message */}
              {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-800 text-center">{error}</p>
                </div>
              )}

              {/* Upload Info */}
              {selectedFile && (
                <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-gray-700">
                    <strong>File:</strong> {selectedFile.name}
                  </p>
                  <p className="text-sm text-gray-700">
                    <strong>Size:</strong> {(selectedFile.size / 1024).toFixed(2)} KB
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    ✓ Image optimized for {isMobileDevice() ? 'mobile' : 'fast'} upload
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={handleUpload}
                  disabled={!selectedFile || uploading}
                  className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                    !selectedFile || uploading
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {uploading ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Uploading...
                    </span>
                  ) : (
                    '📤 Upload to Azure Storage'
                  )}
                </button>

                <Link href="/dashboard">
                  <button className="w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors">
                    Cancel
                  </button>
                </Link>
              </div>
            </>
          )}
        </div>

        {/* Tips */}
        <div className="mt-8 bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-blue-400">
          <h3 className="text-lg font-semibold text-white mb-3">📸 Photo Tips:</h3>
          <ul className="space-y-2 text-blue-100">
            <li>• Make sure the nameplate is clearly visible</li>
            <li>• Good lighting helps with accuracy</li>
            <li>• Avoid glare and shadows</li>
            <li>• Get close enough to read the text</li>
          </ul>
        </div>
      </div>
    </div>
  );
}