// utils/s3.js
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = ['AWS_ACCESS_KEY', 'AWS_SECRET_KEY', 'AWS_REGION', 'AWS_BUCKET_NAME'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
    console.error('Missing required AWS environment variables:', missingEnvVars);
    process.exit(1);
}

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY,
    },
});

// Generate presigned URL for uploading
const putobject = async (key, contentType) => {
    try {
        const command = new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key,
            ContentType: contentType,
        });

        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 604800 });
        return signedUrl;
    } catch (error) {
        console.error('Error generating presigned URL:', error);
        throw error;
    }
};

// Generate presigned URL for getting/reading an object
const getobject = async (key) => {
    try {
        const command = new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key,
            ResponseContentDisposition: 'inline',
            ResponseContentType: key.endsWith('.txt') ? 'text/plain; charset=utf-8' : undefined,
        });

        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 604800 });
        return signedUrl;
    } catch (error) {
        console.error('Error generating get presigned URL:', error);
        throw error;
    }
};

const deleteObject = async (key) => {
    try {
        const command = new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key,
        });

        await s3Client.send(command);
    } catch (error) {
        console.error('Error deleting object:', error);
        throw error;
    }
};

// Extract the S3 key from a full URL like https://bucket.s3.region.amazonaws.com/key
function extractS3Key(url) {
    if (!url) return null;
    const match = url.match(/\.amazonaws\.com\/(.+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

// Convert a stored S3 URL to a presigned GET URL. Returns original if not an S3 URL.
async function resolveUrl(url) {
    if (!url) return url;
    const key = extractS3Key(url);
    if (!key) return url;
    return getobject(key);
}

// Resolve all image fields in a product plain object (use after .lean() or .toObject())
async function resolveProductImages(product) {
    if (!product) return product;

    const tasks = [];

    if (product.images?.length) {
        tasks.push(
            Promise.all(product.images.map(resolveUrl)).then(urls => { product.images = urls; })
        );
    }

    if (product.variants?.length) {
        for (const variant of product.variants) {
            if (variant.images?.length) {
                tasks.push(
                    Promise.all(variant.images.map(resolveUrl)).then(urls => { variant.images = urls; })
                );
            }
        }
    }

    if (product.store) {
        if (product.store.logoUrl) {
            tasks.push(resolveUrl(product.store.logoUrl).then(url => { product.store.logoUrl = url; }));
        }
        if (product.store.bannerUrl) {
            tasks.push(resolveUrl(product.store.bannerUrl).then(url => { product.store.bannerUrl = url; }));
        }
    }

    await Promise.all(tasks);
    return product;
}

// Resolve logo and banner URLs in a store plain object
async function resolveStoreImages(store) {
    if (!store) return store;
    await Promise.all([
        store.logoUrl  ? resolveUrl(store.logoUrl).then(url  => { store.logoUrl  = url; }) : Promise.resolve(),
        store.bannerUrl ? resolveUrl(store.bannerUrl).then(url => { store.bannerUrl = url; }) : Promise.resolve()
    ]);
    return store;
}

module.exports = {
    s3Client,
    putobject,
    getobject,
    deleteObject,
    resolveUrl,
    resolveProductImages,
    resolveStoreImages,
};