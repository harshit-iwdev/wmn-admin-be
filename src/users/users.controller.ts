import { Body, Controller, Get, Param, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { UsersService } from './users.service';
import { FilterDto, FoodLogsFilterDto, IResponse } from './dto/filter.dto';
import { AuthGuard } from 'src/guards/authgaurd';
import { User } from 'src/models';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('users')
export class UsersController {

    constructor(private readonly usersService: UsersService) {}

    @UseGuards(AuthGuard)
    @Get('/dashboard/get-user-count')
    async getDashboardUserCount(
        @Query('practitionerId') practitionerId: string
    ) {
        return this.usersService.getDashboardUserCount(practitionerId);
    }

    @Post('/get/:userType/:pageNumber/:pageSize')
    async fetchAllUsersList(
        @Param('userType') userType: string,
        @Param('pageNumber') pageNumber: number,
        @Param('pageSize') pageSize: number,
        @Body() filters: FilterDto,
        @Query('practitionerId') practitionerId: string
    ): Promise<IResponse> {
        return this.usersService.findAllUsersList(userType, pageNumber, pageSize, filters, practitionerId);
    }

    @UseGuards(AuthGuard)
    @Get('/pro-user-count')
    async getProUserCount(
        @Query('practitionerId') practitionerId: string
    ) {
        return this.usersService.getProUserCount(practitionerId);
    }

    @UseGuards(AuthGuard)
    @Post('/user-data-for-pdf')
    async fetchUsersDataForPdf(
        @Body() filters: FilterDto,
        @Query('practitionerId') practitionerId: string,
    ) {
        return this.usersService.fetchUsersDataForPdf(filters, practitionerId);
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
    @Get('/journal/:id/:pageNumber/:pageSize')
    async fetchUserFoodLogJournal(
        @Param('id') id: string,
        @Param('pageNumber') pageNumber: number,
        @Param('pageSize') pageSize: number
    ) {
        return this.usersService.fetchUserFoodLogJournal(id, pageNumber, pageSize);
    }

    @UseGuards(AuthGuard)
    @Get('/workbook/:id')
    async fetchUserWorkbook(
        @Param('id') id: string
    ) {
        return this.usersService.fetchUserWorkbook(id);
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
        return this.usersService.createNewUser(userData);
    }

    @UseGuards(AuthGuard)
    @Get('/analytics/cohort')
    async getAnalyticsTab1Data(
        @Query('practitionerId') practitionerId: string
    ) {
        return this.usersService.getAnalyticsTab1Data(practitionerId);
    }

    @UseGuards(AuthGuard)
    @Get('/analytics/demographics')
    async getAnalyticsTab2Data(
        @Query('practitionerId') practitionerId: string
    ) {
        return this.usersService.getAnalyticsTab2Data(practitionerId);
    }

    @UseGuards(AuthGuard)
    @Get('/analytics/anthropometrics')
    async getAnalyticsTab3Data(
        @Query('practitionerId') practitionerId: string
    ) {
        return this.usersService.getAnalyticsTab3Data(practitionerId);
    }

    // @UseGuards(AuthGuard)
    @Get('/analytics/adherence')
    async getAnalyticsTab4Data(
        @Query('practitionerId') practitionerId: string
    ) {
        return this.usersService.getAnalyticsTab4Data(practitionerId);
    }

    @UseGuards(AuthGuard)
    @Get('/analytics/onboarding-reassess')
    async getAnalyticsTab5Data(
        @Query('practitionerId') practitionerId: string
    ) {
        return this.usersService.getAnalyticsTab5Data(practitionerId);
    }

    @UseGuards(AuthGuard)
    @Get('/analytics/mental-health')
    async getAnalyticsTab6Data(
        @Query('practitionerId') practitionerId: string
    ) {
        return this.usersService.getAnalyticsTab6Data(practitionerId);
    }

    @UseGuards(AuthGuard)
    @Get('/analytics/feedback')
    async getAnalyticsTab7Data() {
        return this.usersService.getAnalyticsTab7Data();
    }

    @UseGuards(AuthGuard)
    @Post('/import-users-from-csv')
    @UseInterceptors(FileInterceptor('csvFile'))
    async importUsersFromCsv(
        @UploadedFile() csvFile: Express.Multer.File,
        @Body() body: any
    ) {
        return this.usersService.importUsersFromCsv(csvFile, body);
    }

    @UseGuards(AuthGuard)
    @Post('/fetch-admin-csv-data')
    async fetchAdminCsvData(
        @Body() body : {
            userIds: string[]
        },
    ) {
        return this.usersService.fetchAdminCsvData(body.userIds);
    }

    @UseGuards(AuthGuard)
    @Get('/generate-user-summary/:userId')
    async generateUserSummary(
        @Param('userId') userId: string
    ) {
        return this.usersService.generateUserSummary(userId);
    }

    @Post('/rev-cat-webhook')
    async revCatWebhookController(
        @Body() body: any
    ) {
        return this.usersService.revCatWebhook(body);
    }

}
