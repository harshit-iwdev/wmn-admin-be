// import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
// export class S3Service {
//   constructor() {}

//   async moveToBucket(file: Express.Multer.File, key: string) {
//     const s3Client = new S3Client({
//       region: process.env.AWS_REGION || '',
//       credentials: {
//         accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
//         secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
//       },
//     });

//     const { originalname, buffer } = file;
//     const fileName = `${Date.now()}-${originalname}`;

//     const uploadParams = {
//       Bucket: process.env.AWS_BUCKET!,
//       Key: `${key}${fileName}`,
//       Body: buffer,
//       ContentType: this.getContentType(originalname),
//     };

//     try {
//       // Upload the file to S3
//       const command = new PutObjectCommand(uploadParams);
//       await s3Client.send(command);
//       console.log('File uploaded successfully.');
//       return uploadParams.Key; // Return the uploaded object's key
//     } catch (error) {
//       console.error('Error in uploading file:', error);
//       throw error;
//     }
//   }

//   getContentType(filename: string) {
//     const extension = filename.split('.').pop()?.toLowerCase();

//     const contentTypes: Record<string, string> = {
//       svg: 'image/svg+xml',
//       png: 'image/png',
//       jpeg: 'image/jpeg',
//       jpg: 'image/jpeg',
//       gif: 'image/gif',
//       mp4: 'video/mp4',
//       webm: 'video/webm',
//       avi: 'video/x-msvideo',
//       mpeg: 'video/mpeg',
//       mov: 'video/quicktime',
//     };

//     if (!extension) {
//       return 'application/octet-stream';
//     }
//     return contentTypes[extension] || 'application/octet-stream';
//   }
// }
