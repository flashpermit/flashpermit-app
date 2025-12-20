import { BlobServiceClient } from '@azure/storage-blob';

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = 'permit-photos';

export async function uploadPhoto(file: File): Promise<string> {
  if (!connectionString) {
    throw new Error('Azure Storage connection string not found');
  }

  try {
    // Create blob service client
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    
    // Get container client
    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    // Create unique blob name
    const timestamp = Date.now();
    const blobName = `${timestamp}-${file.name}`;
    
    // Get block blob client
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    
    // Upload file
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: {
        blobContentType: file.type,
      },
    });
    
    // Return the URL
    return blockBlobClient.url;
  } catch (error) {
    console.error('Upload error:', error);
    throw new Error('Failed to upload photo');
  }
}