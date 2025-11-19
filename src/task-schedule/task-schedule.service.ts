import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { User } from 'src/models';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';
// import * as fs from 'fs';
// import * as csv from 'csv-parser';

@Injectable()
export class TaskScheduleService {

    constructor(
        private readonly configService: ConfigService,
        @InjectModel(User) private readonly userModel: typeof User,
    ) { }

    async updateIngestDataCronService() {
        try {
            const apiKey = this.configService.get('INGEST_API_KEY');
            const ingestData = await axios.get(`https://api.encharge.io/v1/segments/956329/people?limit=10000&order=asc&ignoreAnonymous=true&sort=firstName`, {
                headers: {
                    'X-Encharge-Token': apiKey,
                    'Content-Type': 'application/json',
                },
            });
            console.log(ingestData.data.people.length, "---ingestData---26");

            for (let i = 0; i < ingestData.data.people.length; i++) {
                const element = ingestData.data.people[i];

                console.log(i, "---i---31");
                if (element.userId !== 'daw81' || element.userId !== 'jmp123') {
                    let executeDataQuery = `SELECT to_jsonb(U) AS user, to_jsonb(M) AS metadata
                    FROM auth.users AS U
                    JOIN public.metadata AS M ON U.id = M.user_id
                    WHERE U.id = :id`;

                    const user: any = await this.userModel?.sequelize?.query(executeDataQuery,
                        {
                            type: QueryTypes.SELECT,
                            raw: true,
                            replacements: { id: element.userId },
                        }
                    );
                    console.log(user, "---user---45");
                    
                    if (user.length > 0) {
                        const repObj = {
                            revCatTrial: element.REVCATTRIALNOTRIAL ? element.REVCATTRIALNOTRIAL : null,
                            renewalNumber: element.renewal_number ? element.renewal_number : null,
                            plan: element.REVCATPlan ? element.REVCATPlan : 'free',
                            unsubscribed: element.unsubscribed ? element.unsubscribed : null,
                            userId: element.userId
                        }
                        const metadata = user[0].metadata;
                        const userData = user[0].user;
                        console.log(userData, "---userData---59");
                        console.log(metadata, "---metadata---60");

                        let executeUpdateDataQuery = `UPDATE public.metadata SET "revCatTrial" = :revCatTrial, 
                            "renewalNumber" = :renewalNumber, plan = :plan, unsubscribed = :unsubscribed
                            WHERE user_id = :userId`;
                        const updateUser: any = await this.userModel?.sequelize?.query(executeUpdateDataQuery, {
                            type: QueryTypes.UPDATE,
                            raw: true,
                            replacements: repObj,
                        });
                        console.log(updateUser, "---updateUser---71");
                    }
                } else {
                    console.log("Skipping userId: ", element.userId, "---element.userId---74");
                }
            }
            return true;
        } catch (error) {
            console.error(error, "---error---80");
        }
    }


    // async updateUserProCycleData() {
    //     try {
    //         // Parse CSV file
    //         const results: any[] = [];
    //         const skippedUserIds: string[] = [];
    //         return new Promise((resolve, reject) => {
    //             fs.createReadStream('src/task-schedule/metadata.csv')
    //                 .pipe(csv())
    //                 .on('data', (data) => results.push(data))
    //                 .on('end', async () => {
    //                     try {
    //                         console.log(results.length, "---CSV records loaded---");
                            
    //                         // Process each record
    //                         for (let i = 0; i < results.length; i++) {
    //                             const element = results[i];
    //                             console.log(element, "---element---93");

    //                             // Validate UUID format before processing
    //                             const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    //                             if (!uuidRegex.test(element.user_id)) {
    //                                 console.log(`Skipping invalid UUID: ${element.user_id} at index ${i}`);
    //                                 skippedUserIds.push(element.user_id);
    //                                 continue;
    //                             }

    //                             try {
    //                                 const user = await this.userModel?.sequelize?.query(
    //                                     `SELECT * FROM public.metadata WHERE user_id = :id`,
    //                                     {
    //                                         type: QueryTypes.SELECT,
    //                                         raw: true,
    //                                         replacements: { id: element.user_id },
    //                                     }
    //                                 );
    //                                 console.log(user, "---user---95");
                                    
    //                                 if (user && user.length > 0) {
    //                                     const repObj = {
    //                                         pro_day: element.pro_day ? parseFloat(element.pro_day) : 0,
    //                                         cycle: element.cycle ? parseFloat(element.cycle) : 0,
    //                                         userId: element.user_id
    //                                     }

    //                                     let executeUpdateDataQuery = `UPDATE public.metadata SET "pro_day" = :pro_day, cycle = :cycle WHERE user_id = :userId`;
    //                                     const updateUser: any = await this.userModel?.sequelize?.query(executeUpdateDataQuery, {
    //                                         type: QueryTypes.UPDATE,
    //                                         raw: true,
    //                                         replacements: repObj,
    //                                     });
    //                                     console.log(updateUser, "---updateUser---71");
    //                                 }
    //                             } catch (dbError) {
    //                                 console.error(`Database error for userId ${element.user_id}:`, dbError);
    //                                 // Continue processing other records even if one fails
    //                                 continue;
    //                             }
    //                         }
                            
    //                         console.log("results", results);
    //                         console.log(skippedUserIds, "---skippedUserIds---144");
    //                         console.log("CSV processing completed successfully");
    //                         resolve(true);
    //                     } catch (error) {
    //                         console.error("Error processing CSV data:", error);
    //                         reject(error);
    //                     }
    //                 })
    //                 .on('error', (error) => {
    //                     console.error("Error reading CSV file:", error);
    //                     reject(error);
    //                 });
    //         });

    //     } catch (error) {
    //         console.error(error, "---error---89");
    //         throw error;
    //     }
    // }


    async getSpecificUserDataService() {
        try {
            const apiKey = this.configService.get('INGEST_API_KEY');
            // const ingestData = await axios.get(`https://api.encharge.io/v1/people?people[0][email]=jessiemaydwell@gmail.com`, {
            const ingestData = await axios.get(`https://api.encharge.io/v1/people?people[0][userId]=1e2f889e-4281-4ffc-b7ec-680281433bae`, {
                headers: {
                    'X-Encharge-Token': apiKey,
                    'Content-Type': 'application/json',
                },
            });
            console.log(ingestData, ingestData.data, "---ingestData---172");

            return true;
        } catch (error) {
            console.error(error, "---error---174");
        }
    }

    async updateAllUserStatusService() {
        try {
            const response = await axios.get(`https://api.encharge.io/v1/segments/956329/people?limit=10000&order=asc&ignoreAnonymous=true&sort=firstName`, {
                headers: {
                  'X-Encharge-Token': process.env.INGEST_API_KEY,
                  'Content-Type': 'application/json',
                },
              });

            const allData = response.data.people;

            let peopleData = allData.filter((item: any) => item.userId && item.type);

            for (let i = 0; i < peopleData.length; i++) {
                const element = peopleData[i];

                if (element && element.type) {
                    let metadataUpdateQuery = `UPDATE public.metadata set "revCatStatus" = :revCatStatus where "user_id" = :userId`;
                    const metadataUpdate: any = await this.userModel?.sequelize?.query(metadataUpdateQuery, {
                        type: QueryTypes.INSERT,
                        raw: true,
                        replacements: {
                            userId: element.userId,
                            revCatStatus: element.type
                        }
                    });
                }
                else {
                    console.log("Skipping userId: ", element.userId, "---element.userId---");
                    continue;
                }
            }

            return "all done successfully";
        }
        catch (error) {
            console.error(error, "---error---184");
            return "error in updating all user status";
        }
    }



}
