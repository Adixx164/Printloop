"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadFromS3 = downloadFromS3;
const client_s3_1 = require("@aws-sdk/client-s3");
const config_1 = require("../config");
let s3Client = null;
function getClient() {
    if (!s3Client) {
        s3Client = new client_s3_1.S3Client({
            region: config_1.config.s3.region,
            endpoint: config_1.config.s3.endpoint,
            credentials: {
                accessKeyId: config_1.config.s3.accessKeyId,
                secretAccessKey: config_1.config.s3.secretAccessKey,
            },
            forcePathStyle: config_1.config.s3.forcePathStyle,
        });
    }
    return s3Client;
}
async function downloadFromS3(key) {
    const client = getClient();
    const command = new client_s3_1.GetObjectCommand({ Bucket: config_1.config.s3.bucket, Key: key });
    const response = await client.send(command);
    if (!response.Body)
        throw new Error(`S3 object ${key} has no body`);
    const chunks = [];
    for await (const chunk of response.Body) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}
//# sourceMappingURL=s3.js.map