const multer = require("multer");
const fs = require("fs");
const path = require("path");

const tempDir = path.join(process.cwd(), "public", "temp");

// Ensure temp directory exists
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, tempDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + "-" + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Middleware that accepts any file field name (e.g. 'file', 'image', 'media', 'attachment')
const uploadAny = upload.any();

const uploadMessageFile = (req, res, next) => {
    uploadAny(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({
                success: false,
                message: `File upload error: ${err.message}`
            });
        } else if (err) {
            return res.status(500).json({
                success: false,
                message: `Upload error: ${err.message}`
            });
        }

        // Map first uploaded file to req.file so controller works seamlessly
        if (req.files && req.files.length > 0) {
            req.file = req.files[0];
        }

        next();
    });
};

module.exports = { upload, uploadMessageFile };
