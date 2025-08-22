import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { JsonWebTokenError } from 'jsonwebtoken';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      return response
        .status(exception.getStatus())
        .json(exception.getResponse());
    }
    if (exception instanceof JsonWebTokenError) {
      Logger.error('JWT Error:', exception);
      return response.status(400).json({
        // message: exception.message,
        status: 400,
      });
    }

    console.error('Unhandled Exception:', exception);
    return response.status(500).json({ message: 'Internal server error' });
  }
}
