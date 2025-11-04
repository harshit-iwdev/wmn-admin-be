import { Body, Controller, Get, Param, Query, Post, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { PractitionerService } from './practitioner.service';
import { FilterDto, IResponse } from 'src/users/dto/filter.dto';
import { AuthGuard } from 'src/guards/authgaurd';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('practitioner')
export class PractitionerController {

    constructor(private readonly practitionerService: PractitionerService) {}

    @Get('/all/:pageNumber/:pageSize')
    async fetchAllPractitionersList(
        @Param('pageNumber') pageNumber: number,
        @Param('pageSize') pageSize: number,
        // @Body() filters: FilterDto
    ): Promise<IResponse> {
        return await this.practitionerService.findAllPractitionersList(pageNumber, pageSize);
    }

    @UseGuards(AuthGuard)
    @Post('/data-for-pdf')
    async fetchPractitionersDataForPdf(
        @Body() filters: FilterDto,
    ) {
        return this.practitionerService.fetchPractitionersDataForPdf(filters);
    }

    @UseGuards(AuthGuard)
    @Post('/import-from-csv')
    @UseInterceptors(FileInterceptor('csvFile'))
    async importPractitionersFromCsv(
        @UploadedFile() csvFile: Express.Multer.File,
        @Body() body: any
    ) {
        console.log(csvFile, "---csvFile and body---");
        return this.practitionerService.importPractitionersFromCsv(csvFile, body);
    }

}
