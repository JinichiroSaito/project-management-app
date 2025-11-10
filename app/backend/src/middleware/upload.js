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
    'application/vnd.ms-powerpoint.presentation.macroEnabled.12' // .pptm
  ];
  
  const allowedExtensions = ['.pdf', '.ppt', '.pptx', '.pptm'];
  const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
  
  if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error('Only PPT and PDF files are allowed'), false);
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

