import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { FilterDto, IResponse } from './dto/filter.dto';
import { AuthGuard } from 'src/guards/authgaurd';

@Controller('users')
export class UsersController {

    constructor(private readonly usersService: UsersService) {}

    @Post('/all/:pageNumber/:pageSize')
    async fetchAllUsersList(
        @Param('pageNumber') pageNumber: number,
        @Param('pageSize') pageSize: number,
        @Body() filters: FilterDto
    ): Promise<IResponse> {
        return this.usersService.findAllUsersList(pageNumber, pageSize, filters);
    }

    @UseGuards(AuthGuard)
    @Get('/:id')
    async fetchSingleUserDetails(
        @Param('id') id: string
    ) {
        return this.usersService.fetchUserDetailsById(id);
    }

}
