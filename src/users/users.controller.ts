import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { FilterDto, FoodLogsFilterDto, IResponse } from './dto/filter.dto';
import { AuthGuard } from 'src/guards/authgaurd';
import { User } from 'src/models';

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
    @Get('/pro-user-count')
    async getProUserCount() {
        return this.usersService.getProUserCount();
    }

    @UseGuards(AuthGuard)
    @Get('/user-data-for-pdf')
    async fetchUserDataForPdf() {
        return this.usersService.fetchUserDataForPdf();
    }

    @UseGuards(AuthGuard)
    @Get('/:id')
    async fetchSingleUserDetails(
        @Param('id') id: string
    ) {
        return this.usersService.fetchUserDetailsById(id);
    }

    @UseGuards(AuthGuard)
    @Get('/followers/:id')
    async fetchUserFollowers(
        @Param('id') id: string
    ) {
        return this.usersService.fetchUserFollowers(id);
    }

    @UseGuards(AuthGuard)
    @Get('/following/:id')
    async fetchUserFollowing(
        @Param('id') id: string
    ) {
        return this.usersService.fetchUserFollowing(id);
    }

    @UseGuards(AuthGuard)
    @Post('/food-logs')
    async fetchUserFoodLogs(
        @Body() body: FoodLogsFilterDto
    ) {
        return this.usersService.fetchUserFoodLogs(body);
    }

    @UseGuards(AuthGuard)
    @Get('/reviews/:id/:pageNumber/:pageSize')
    async fetchUserReviews(
        @Param('id') id: string,
        @Param('pageNumber') pageNumber: number,
        @Param('pageSize') pageSize: number
    ) {
        return this.usersService.fetchUserReviews(id, pageNumber, pageSize);
    }

    @UseGuards(AuthGuard)
    @Get('/intentions/:id/:pageNumber/:pageSize')
    async fetchUserIntentions(
        @Param('id') id: string,
        @Param('pageNumber') pageNumber: number,
        @Param('pageSize') pageSize: number
    ) {
        return this.usersService.fetchUserIntentions(id, pageNumber, pageSize);
    }

    @UseGuards(AuthGuard)
    @Post('/create-new-user')
    async createNewUser(@Body() userData: Partial<User>) {
        console.log(userData, "---userData---");
        return this.usersService.createNewUser(userData);
    }

}
