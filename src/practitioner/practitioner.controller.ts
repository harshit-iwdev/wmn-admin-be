import { Body, Controller, Get, Param } from '@nestjs/common';
import { PractitionerService } from './practitioner.service';
import { FilterDto, IResponse } from 'src/users/dto/filter.dto';

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

}
