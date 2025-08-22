// import {
//   CanActivate,
//   ExecutionContext,
//   Injectable,
//   UnauthorizedException,
//   ForbiddenException,
// } from '@nestjs/common';
// import { User } from 'src/models';
// import { Request } from 'express';
// import { InjectModel } from '@nestjs/sequelize';
// import { Model } from 'sequelize';


// @Injectable()
// export class VerifyAdminGuard implements CanActivate {
//   constructor(
//     @InjectModel(User) private readonly userModel: Model<User>
//   ) {}

//   async canActivate(context: ExecutionContext): Promise<boolean> {
//     const request = context.switchToHttp().getRequest<Request>();
//     const user = request['user'] as User;

//     if (!user || !user.id) {
//       throw new UnauthorizedException('User information is missing');
//     }

//     const existingUser = await this.userModel.findOne({ where: { id: user.id } });

//     if (!existingUser) {
//       throw new UnauthorizedException('User does not exist');
//     }

//     if (existingUser.role !== 'admin') {
//       throw new ForbiddenException('Access denied: Admins only');
//     }

//     return true;
//   }
// }
