const multer = require("multer");
const multerS3 = require("multer-s3");
const s3 = require("../config/s3");

function uploadToS3(folder) {

    return multer({
        storage: multerS3({
            s3,
            bucket: process.env.AWS_BUCKET_NAME,
            contentType: multerS3.AUTO_CONTENT_TYPE,
            key: function (req, file, cb) {
                const fileName =
                    folder + "/" +
                    Date.now() +
                    "-" +
                    Math.round(Math.random() * 1e9) +
                    "-" +
                    file.originalname;

                cb(null, fileName);
            },
        }),

        limits: {
            fileSize: 20 * 1024 * 1024, // 20 MB file size limit
        },
    });
}

module.exports = uploadToS3;