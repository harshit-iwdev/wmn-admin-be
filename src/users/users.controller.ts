import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { FilterDto } from './dto/filter.dto';

@Controller('users')
export class UsersController {

    constructor(private readonly usersService: UsersService) {}

    @Post('/all/:pageNumber/:pageSize')
    async findAll(
        @Param('pageNumber') pageNumber: number,
        @Param('pageSize') pageSize: number,
        @Body() filters: FilterDto
    ) {
        return this.usersService.findAllUsers(pageNumber, pageSize, filters);
    }

}
