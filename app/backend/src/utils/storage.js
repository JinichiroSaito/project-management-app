const { Storage } = require('@google-cloud/storage');

// Cloud Storage初期化
let storage;
let bucket;

function initializeStorage() {
  if (!storage) {
    try {
      // GCP環境では自動的に認証情報が使用される
      // ローカル開発環境では環境変数 GOOGLE_APPLICATION_CREDENTIALS を設定
      storage = new Storage({
        projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID || 'saito-test-gcp'
      });
      
      const bucketName = process.env.GCS_BUCKET_NAME || 'pm-app-uploads-dev';
      bucket = storage.bucket(bucketName);
      
      console.log(`✓ Cloud Storage initialized: ${bucketName}`);
    } catch (error) {
      console.error('Failed to initialize Cloud Storage:', error);
    }
  }
  return { storage, bucket };
}

// ファイルをアップロード
async function uploadFile(file, projectId, userId) {
  try {
    const { bucket } = initializeStorage();
    if (!bucket) {
      throw new Error('Cloud Storage bucket not initialized');
    }

    // ファイル名を生成: projects/{projectId}/{userId}/{timestamp}-{originalName}
    const timestamp = Date.now();
    const sanitizedFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `projects/${projectId || 'draft'}/${userId}/${timestamp}-${sanitizedFileName}`;
    
    const fileObj = bucket.file(fileName);
    
    // ファイルをアップロード
    const stream = fileObj.createWriteStream({
      metadata: {
        contentType: file.mimetype,
        metadata: {
          originalName: file.originalname,
          uploadedBy: userId,
          projectId: projectId || 'draft'
        }
      },
      resumable: false
    });

    return new Promise((resolve, reject) => {
      stream.on('error', (error) => {
        console.error('File upload error:', error);
        reject(error);
      });

      stream.on('finish', async () => {
        try {
          // Uniform bucket-level accessが有効な場合、makePublic()は使用できない
          // 代わりに署名付きURLを生成（有効期限: 1年）
          const [signedUrl] = await fileObj.getSignedUrl({
            action: 'read',
            expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1年後
          });
          
          resolve({
            url: signedUrl,
            fileName: fileName,
            originalName: file.originalname,
            contentType: file.mimetype,
            size: file.size
          });
        } catch (error) {
          console.error('Error generating signed URL:', error);
          reject(error);
        }
      });

      stream.end(file.buffer);
    });
  } catch (error) {
    console.error('Upload file error:', error);
    throw error;
  }
}

// ファイルを削除
async function deleteFile(fileUrl) {
  try {
    const { bucket } = initializeStorage();
    if (!bucket || !fileUrl) {
      return;
    }

    // URLからファイル名を抽出
    // 署名付きURLの場合、クエリパラメータを除去
    let urlToParse = fileUrl.split('?')[0]; // クエリパラメータを除去
    const urlParts = urlToParse.split('/');
    const bucketIndex = urlParts.findIndex(part => part === bucket.name);
    
    if (bucketIndex >= 0 && bucketIndex < urlParts.length - 1) {
      const fileName = urlParts.slice(bucketIndex + 1).join('/');
      if (fileName) {
        await bucket.file(fileName).delete();
        console.log(`File deleted: ${fileName}`);
      }
    } else {
      console.warn(`Could not extract file name from URL: ${fileUrl}`);
    }
  } catch (error) {
    console.error('Error deleting file:', error);
    // ファイル削除エラーは致命的ではないので、エラーを投げない
  }
}

module.exports = {
  initializeStorage,
  uploadFile,
  deleteFile
};

