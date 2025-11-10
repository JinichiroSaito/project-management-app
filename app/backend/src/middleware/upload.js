const multer = require('multer');
const { initializeStorage } = require('../utils/storage');

// Cloud Storage初期化
initializeStorage();

// メモリストレージを使用（Cloud Storageに直接アップロード）
const storage = multer.memoryStorage();

// ファイルフィルター：PPTとPDFのみ許可
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
    'application/vnd.ms-powerpoint.presentation.macroEnabled.12', // .pptm
    'application/octet-stream' // 一部のPPTファイルはこのMIMEタイプになることがある
  ];
  
  const allowedExtensions = ['.pdf', '.ppt', '.pptx', '.pptm'];
  const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
  
  console.log('[Upload Middleware] File filter check:', {
    originalname: file.originalname,
    mimetype: file.mimetype,
    extension: fileExtension,
    mimetypeAllowed: allowedMimeTypes.includes(file.mimetype),
    extensionAllowed: allowedExtensions.includes(fileExtension)
  });
  
  if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    console.log('[Upload Middleware] File accepted');
    cb(null, true);
  } else {
    console.warn('[Upload Middleware] File rejected:', {
      mimetype: file.mimetype,
      extension: fileExtension
    });
    cb(new Error(`Only PPT and PDF files are allowed. Received: ${file.mimetype} (${fileExtension})`), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB制限
  }
});

module.exports = upload;

