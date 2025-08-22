import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import * as CryptoJs from 'crypto-js';
import * as zlib from 'zlib';
import * as dotenv from 'dotenv';

dotenv.config();

@Injectable()
export class EncryptionInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<{ encryptedData: string }> {
    return next.handle().pipe(
      map((data) => {
        try {
          if (typeof data !== 'object' || data === null) {
            throw new Error('Response data must be a serializable object');
          }
          const encryptionKey =
            process.env.ENCRYPTION_KEY || 'default-secret-key';

          // Compress the stringified JSON
          const json = JSON.stringify(data);
          const compressed = zlib.gzipSync(json); // returns a Buffer

          // Convert compressed buffer to WordArray (for CryptoJS)
          const wordArray = CryptoJs.lib.WordArray.create(compressed);

          // Encrypt compressed data
          const encrypted = CryptoJs.AES.encrypt(
            wordArray,
            encryptionKey,
          ).toString();

          return { encryptedData: encrypted };
        } catch (error) {
          console.error('Encryption Error:', error);
          throw new Error('Failed to encrypt response data');
        }
      }),
    );
  }
}
