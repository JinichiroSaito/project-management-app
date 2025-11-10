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
          // ファイルを公開（または署名付きURLを生成）
          await fileObj.makePublic();
          
          const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
          
          resolve({
            url: publicUrl,
            fileName: fileName,
            originalName: file.originalname,
            contentType: file.mimetype,
            size: file.size
          });
        } catch (error) {
          console.error('Error making file public:', error);
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
    const urlParts = fileUrl.split('/');
    const fileName = urlParts.slice(urlParts.indexOf(bucket.name) + 1).join('/');
    
    if (fileName) {
      await bucket.file(fileName).delete();
      console.log(`File deleted: ${fileName}`);
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

