import { Controller, Get, Injectable, Logger } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { TaskScheduleService } from './task-schedule.service';


@Injectable()
@Controller('task-schedule')
export class TaskScheduleController {
    private readonly logger = new Logger(TaskScheduleController.name);
    constructor(private readonly taskScheduleService: TaskScheduleService) { }


    @Get('update-ingest-data')
    updateIngestData() {
        this.taskScheduleService.updateIngestDataCronService();
    }

    @Cron('59 23 * * *')
    updateIngestDataCron() {
        console.log('---invoked scheduler for updating Ingest data---');
        this.taskScheduleService.updateIngestDataCronService();
    }

    // @Get('get-specific-user-data')
    // async getSpecificUserData() {
    //     return await this.taskScheduleService.getSpecificUserDataService();
    // }

}