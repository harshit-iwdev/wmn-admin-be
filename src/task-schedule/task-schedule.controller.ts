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

    // @Cron('30 * * * * *')
    // // @Interval(10000)
    // updateIngestDataCron() {
    //     // this.taskScheduleService.updateIngestDataCronService();
    //     console.log('---Called when the current second is 30---');
    // }

}