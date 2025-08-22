// import {
//   CanActivate,
//   ExecutionContext,
//   Injectable,
//   UnauthorizedException,
// } from '@nestjs/common';
// import { InjectModel } from '@nestjs/sequelize';
// import { Request } from 'express'; // Adjust the path to your User schema
// import { Model } from 'sequelize';
// import { User } from 'src/models';


// @Injectable()
// export class VerifyUserGuard implements CanActivate {
//   constructor(
//     @InjectModel(User) private readonly userModel: Model<User>
//   ) {}

//   async canActivate(context: ExecutionContext): Promise<boolean> {
//     const request = context.switchToHttp().getRequest<Request>();
//     const user = request['user'] as User; // Extracted from AuthGuard

//     if (!user || !user.id) {
//       throw new UnauthorizedException('User information is missing');
//     }

//     const existingUser = await this.userModel.findOne({ where: { id: user.id } });
//     if (!existingUser) {
//       throw new UnauthorizedException('User does not exist');
//     }
//     return true;
//   }
// }
