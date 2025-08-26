import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { User } from 'src/models';
import { InjectModel } from '@nestjs/sequelize';
import { QueryTypes } from 'sequelize';


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

            for (let i = 340; i < ingestData.data.people.length; i++) {
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
                            pro_day: element.pro_day ? element.pro_day : 0,
                            cycle: element.cycle ? element.cycle : 0,
                            userId: element.userId
                        }
                        const metadata = user[0].metadata;
                        const userData = user[0].user;
                        console.log(userData, "---userData---59");
                        console.log(metadata, "---metadata---60");

                        let executeUpdateDataQuery = `UPDATE public.metadata SET "revCatTrial" = :revCatTrial, 
                            "renewalNumber" = :renewalNumber, plan = :plan, unsubscribed = :unsubscribed, 
                            "pro_day" = :pro_day, cycle = :cycle,
                            "last_updated" = :last_updated WHERE user_id = :userId`;
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

}
