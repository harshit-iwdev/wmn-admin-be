import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { User } from '../models';
import { QueryTypes } from 'sequelize';
import { FilterDto, FoodLogsFilterDto, IResponse } from './dto/filter.dto';
import { Resend } from 'resend';
import * as XLSX from 'xlsx';
import axios from 'axios';
import OpenAI from 'openai';

@Injectable()
export class UsersService {
    constructor(
        @InjectModel(User) private readonly userModel: typeof User,
    ) { }

    async findAll(): Promise<User[]> {
        return this.userModel.findAll();
    }

    async findAllUsersList(userType: string, pageNumber: number, pageSize: number, filters: FilterDto, practitionerId: string): Promise<IResponse> {
        try {
            const { searchTerm, sortBy, sortOrder, selectedRole, gift } = filters;

            // Base queries
            let executeDataQuery = `SELECT to_jsonb(U) AS user, to_jsonb(M) AS userMetadata,
              COALESCE(followers.follower_count, 0) AS "followerCount",
              COALESCE(following.following_count, 0) AS "followingCount"
            FROM auth.users AS U JOIN public.metadata AS M ON U.id = M.user_id
            LEFT JOIN (SELECT "follow_user_id" AS id, COUNT(*) AS follower_count
              FROM public.user_follows GROUP BY "follow_user_id"
            ) AS followers ON followers.id = U.id
            LEFT JOIN (SELECT "user_id" AS id, COUNT(*) AS following_count
              FROM public.user_follows GROUP BY "user_id"
            ) AS following ON following.id = U.id`;

            let executeCountQuery = `SELECT COUNT(*) AS count FROM auth.users AS U JOIN public.metadata AS M ON U.id = M.user_id`;

            // --- Join with user_follows if practitionerId is present ---
            if (practitionerId && practitionerId !== 'undefined') {
                executeDataQuery += ` JOIN public.user_follows AS UF ON U.id = UF."follow_user_id" `;
                executeCountQuery += ` JOIN public.user_follows AS UF ON U.id = UF."follow_user_id" `;
            }

            // --- Where Clauses ---
            let whereClauses: string[] = [`U.last_seen IS NOT NULL`];
            let filterOpts: any = {
                pageSize,
                offset: (pageNumber - 1) * pageSize,
            };

            if (practitionerId && practitionerId !== 'undefined') {
                whereClauses.push(`UF."user_id" = :practitionerId`);
                filterOpts.practitionerId = practitionerId;
            }

            if (searchTerm) {
                whereClauses.push(`(U.email ILIKE :searchTerm OR U.display_name ILIKE :searchTerm
                OR M.first_name ILIKE :searchTerm OR M.last_name ILIKE :searchTerm OR M.username ILIKE :searchTerm)`);
                filterOpts.searchTerm = `%${searchTerm}%`;
            }

            if (userType === 'practitioner' || selectedRole === 'practitioner') {
                whereClauses.push(`M.user_type = 'practitioner'`);
            }

            if (gift && gift.toString() == 'true') {
                whereClauses.push(`M.gift = ${gift === 'true'}`);
            } else if (gift && gift.toString() == 'false') {
                whereClauses.push(`M.gift = ${gift === 'false'}`);
            }

            // --- Apply WHERE ---
            if (whereClauses.length > 0) {
                executeDataQuery += ` WHERE ${whereClauses.join(' AND ')} `;
                executeCountQuery += ` WHERE ${whereClauses.join(' AND ')} `;
            }

            // --- Sorting ---
            if (sortBy && sortOrder) {
                const allowedUserCols = ['last_seen', 'email'];
                const allowedMetaCols = ['first_name', 'last_name', 'username', 'cycle', 'pro_day', 'plan', 'renewalNumber', 'revCatTrial', 'revCatStatus'];
                if (allowedUserCols.includes(sortBy)) {
                    executeDataQuery += ` ORDER BY U.${sortBy} ${sortOrder.toUpperCase()} `;
                } else if (allowedMetaCols.includes(sortBy)) {
                    executeDataQuery += ` ORDER BY M."${sortBy}" ${sortOrder.toUpperCase()} `;
                }
            } else {
                executeDataQuery += ` ORDER BY U.last_seen DESC `;
            }

            // --- Pagination ---
            executeDataQuery += ` LIMIT :pageSize OFFSET :offset `;

            // --- Run Queries ---
            const users: any = await this.userModel?.sequelize?.query(executeDataQuery, {
                type: QueryTypes.SELECT,
                raw: true,
                replacements: filterOpts,
            });

            const totalCount: any = await this.userModel?.sequelize?.query(executeCountQuery, {
                type: QueryTypes.SELECT,
                raw: true,
                replacements: filterOpts,
            });

            // if (users && users.length>0) {
            //     for (let i = 0; i < users.length; i++) {
            //         let userId = users[i].user.id;
            //         try {
            //             // // RevCat API
            //             // const revCatData = await axios.get(`${process.env.REV_CAT_BASE_URL}/v2/projects/${process.env.REV_CAT_PROJECT_KEY}/customers/${userId}/subscriptions`, {
            //             //     headers: {
            //             //         'Authorization': `Bearer ${process.env.REV_CAT_KEY_V2}`,
            //             //         'Content-Type': 'application/json',
            //             //     },
            //             // });
            //             // if (revCatData.data.items && revCatData.data.items.length > 0) {
            //             //     let metadataCreateQuery = `UPDATE public.metadata set "revCatStatus" = :revCatStatus where "user_id" = :userId`;
            //             //     const metadataCreate: any = await this.userModel?.sequelize?.query(metadataCreateQuery, {
            //             //         type: QueryTypes.INSERT,
            //             //         raw: true,
            //             //         replacements: {
            //             //             userId: userId,
            //             //             revCatStatus: revCatData.data.items[0].status
            //             //         }
            //             //     });
            //             // }

            //             // // Encharge API
            //             // const response = await axios.get(`https://api.encharge.io/v1/segments/956329/people?limit=10000&order=asc&ignoreAnonymous=true&sort=firstName`, {
            //             //     headers: {
            //             //       'X-Encharge-Token': process.env.INGEST_API_KEY,
            //             //       'Content-Type': 'application/json',
            //             //     },
            //             //   });
            //             // const data = response.data.people;
            //             // let userData = data.find((item: any) => item.userId === userId);
            //             // if (userData && userData.type) {
            //             //     let metadataCreateQuery = `UPDATE public.metadata set "revCatStatus" = :revCatStatus where "user_id" = :userId`;
            //             //     const metadataCreate: any = await this.userModel?.sequelize?.query(metadataCreateQuery, {
            //             //         type: QueryTypes.INSERT,
            //             //         raw: true,
            //             //         replacements: {
            //             //             userId: userId,
            //             //             revCatStatus: userData.type
            //             //         }
            //             //     });
            //             // }
            //         } catch (error: any) {
            //             console.error(`Error fetching RevCat data for user ${userId}:`, error.message || error);
            //             // Continue to next iteration
            //             continue;
            //         }
            //     }
            // }

            return {
                success: true,
                data: { rows: users, count: totalCount[0]?.count || 0 },
                message: 'Users fetched successfully',
            };
        } catch (error) {
            console.error('---error---', error);
            throw new BadRequestException(error.message);
        }
    }


    // async findAllUsersList(userType: string, pageNumber: number, pageSize: number, filters: FilterDto, practitionerId: string): Promise<IResponse> {
    //     try {
    //         const { searchTerm, sortBy, sortOrder, selectedRole, gift, unsubscribed } = filters;

    //         let executeDataQuery = `SELECT to_jsonb(U) as user, to_jsonb(M) as userMetadata,
    //             COALESCE(followers.follower_count, 0) AS "followerCount",
    //             COALESCE(following.following_count, 0) AS "followingCount"
    //             FROM auth.users as U 
    //             join public.metadata as M on U.id = M.user_id
    //             LEFT JOIN (SELECT "follow_user_id" AS id, COUNT(*) AS follower_count
    //             FROM public.user_follows GROUP BY "follow_user_id") AS followers ON followers.id = U.id
    //             LEFT JOIN (SELECT "user_id" AS id, COUNT(*) AS following_count
    //             FROM public.user_follows GROUP BY "user_id") AS following ON following.id = U.id`;

    //         let executeCountQuery = `SELECT COUNT(*) as count FROM auth.users as U
    //             JOIN public.metadata AS M on U.id = M.user_id`;
    //         if (searchTerm) {
    //             executeDataQuery += ` AND (U.email ILIKE '%${searchTerm}%' OR U.display_name ILIKE '%${searchTerm}%' OR M.first_name ILIKE '%${searchTerm}%' OR M.last_name ILIKE '%${searchTerm}%' OR M.username ILIKE '%${searchTerm}%')`;
    //             executeCountQuery += ` AND (U.email ILIKE '%${searchTerm}%' OR U.display_name ILIKE '%${searchTerm}%' OR M.first_name ILIKE '%${searchTerm}%' OR M.last_name ILIKE '%${searchTerm}%' OR M.username ILIKE '%${searchTerm}%')`;
    //         }

    //         if (userType === 'practitioner') {
    //             executeDataQuery += ` AND M.user_type = 'practitioner'`;
    //             executeCountQuery += ` AND M.user_type = 'practitioner'`;
    //         }

    //         if (practitionerId && practitionerId.length > 0 && practitionerId !== 'undefined') {
    //             executeDataQuery += ` JOIN public.user_follows AS UF ON U.id = UF."follow_user_id"
    //             WHERE U.last_seen IS NOT NULL AND UF."user_id" = :practitionerId`;
    //             executeCountQuery += ` JOIN public.user_follows AS UF ON U.id = UF."follow_user_id"
    //             WHERE U.last_seen IS NOT NULL AND UF."user_id" = :practitionerId`;
    //         } else {
    //             executeDataQuery += ` WHERE U.last_seen IS NOT NULL`;
    //             executeCountQuery += ` WHERE U.last_seen IS NOT NULL`;
    //         }

    //         if (gift && gift.toString() === 'true') {
    //             executeDataQuery += ` AND M.gift = true`;
    //             executeCountQuery += ` AND M.gift = true`;
    //         } else if (gift && gift.toString() === 'false') {
    //             executeDataQuery += ` AND M.gift = false`;
    //             executeCountQuery += ` AND M.gift = false`;
    //         }

    //         if (unsubscribed && unsubscribed.toString() === 'true') {
    //             executeDataQuery += ` AND M.unsubscribed = true`;
    //             executeCountQuery += ` AND M.unsubscribed = true`;
    //         } else if (unsubscribed && unsubscribed.toString() === 'false') {
    //             executeDataQuery += ` AND M.unsubscribed = false`;
    //             executeCountQuery += ` AND M.unsubscribed = false`;
    //         }

    //         if (selectedRole === 'practitioner') {
    //             executeDataQuery += ` AND M.user_type = 'practitioner'`;
    //             executeCountQuery += ` AND M.user_type = 'practitioner'`;
    //         }

    //         if (sortBy && sortOrder) {
    //             if (sortBy === 'last_seen' || sortBy === 'email') {
    //                 executeDataQuery += ` ORDER BY U.${sortBy} ${sortOrder}`;
    //             } else if (sortBy === 'first_name' || sortBy === 'last_name' || sortBy === 'username' || sortBy === 'cycle' || sortBy === 'pro_day' || sortBy === 'plan' || sortBy === 'renewalNumber' || sortBy === 'revCatTrial') {
    //                 executeDataQuery += ` ORDER BY M."${sortBy}" ${sortOrder}`;
    //             }
    //         } else {
    //             executeDataQuery += ` ORDER BY U.last_seen DESC`;
    //         }

    //         executeDataQuery += ` LIMIT :pageSize OFFSET :offset`;

    //         let filterOpts = {
    //             pageSize: pageSize,
    //             offset: (pageNumber - 1) * pageSize,
    //         }
    //         if (practitionerId && practitionerId.length > 0 && practitionerId !== 'undefined') {
    //             filterOpts['practitionerId'] = practitionerId;
    //         }
    //         const users = await this.userModel?.sequelize?.query(executeDataQuery,
    //             {
    //                 type: QueryTypes.SELECT,
    //                 raw: true,
    //                 replacements: { ...filterOpts },
    //             }
    //         );

    //         let queryOpts = {
    //             type: QueryTypes.SELECT,
    //             raw: true,
    //         }
    //         if (practitionerId && practitionerId.length > 0 && practitionerId !== 'undefined') {
    //             queryOpts['replacements'] = { practitionerId: practitionerId };
    //         }
    //         const totalCount: any = await this.userModel?.sequelize?.query(executeCountQuery,
    //             { ...queryOpts });

    //         return {
    //             success: true, data: {
    //                 rows: users,
    //                 count: totalCount[0]?.count || 0,
    //             },
    //             message: 'Users fetched successfully',
    //         };
    //     } catch (error) {
    //         console.error(error, "---error---");
    //         throw new BadRequestException(error.message);
    //     }
    // }

    async fetchUserDetailsById(id: string): Promise<any> {
        try {
            let executeDataQuery = `SELECT to_jsonb(U) AS user, to_jsonb(M) AS metadata, to_jsonb(S) as settings
                FROM auth.users AS U
                JOIN public.metadata AS M ON U.id = M.user_id
                LEFT JOIN public.settings AS S ON M.user_id = S."user_id"
                WHERE U.id = :id`;

            const user: any = await this.userModel?.sequelize?.query(
                executeDataQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id },
                }
            );

            const userData = user[0];

            let executeFollowerQuery = `SELECT COUNT("user_id") AS "followerCount"
                FROM public.user_follows WHERE "follow_user_id" = :id`;

            const follower: any = await this.userModel?.sequelize?.query(
                executeFollowerQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id },
                }
            );

            let executeFollowingQuery = `SELECT COUNT("follow_user_id") AS "followingCount"
                FROM public.user_follows WHERE "user_id" = :id`;

            const following: any = await this.userModel?.sequelize?.query(
                executeFollowingQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id },
                }
            );

            userData.followerCount = follower[0]?.followerCount || 0;
            userData.followingCount = following[0]?.followingCount || 0;

            const executeLogCountsQuery = `SELECT
                (SELECT COUNT(*) FROM public.food_logs WHERE "userId" = :id) AS "foodLogs",
                (SELECT COUNT(*) FROM public.reviews WHERE "user_id" = :id) AS "reviews",
                (SELECT COUNT(*) FROM public.pins WHERE "user_id" = :id) AS "pins",
                (SELECT COUNT(*) FROM public.intentions WHERE "user_id" = :id) AS "intentions"`;

            const logCounts: any = await this.userModel?.sequelize?.query(
                executeLogCountsQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id },
                }
            );

            userData.activityData = { foodLogs: logCounts[0]?.foodLogs || 0, reviews: logCounts[0]?.reviews || 0, pins: logCounts[0]?.pins || 0, intentions: logCounts[0]?.intentions || 0 };
            return { success: true, data: userData, message: 'User details fetched successfully' };
        } catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }

    async fetchUserFollowers(id: string): Promise<any> {
        try {
            let executeFollowersQuery = `SELECT U.id, U.email, U.display_name, U.last_seen, U.avatar_url, U.created_at,
                M.first_name, M.last_name, M.user_type, M.username
                FROM auth.users AS U
                JOIN public.user_follows AS UF ON U.id = UF."user_id"
                JOIN public.metadata AS M ON UF."user_id" = M."user_id"
                WHERE UF."follow_user_id" = :id`;

            const followers: any = await this.userModel?.sequelize?.query(
                executeFollowersQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id },
                }
            );

            return { success: true, data: followers, message: 'User followers fetched successfully' };
        } catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }

    async fetchUserFollowing(id: string): Promise<any> {
        try {
            let executeFollowingQuery = `SELECT U.id, U.email, U.display_name, U.last_seen, U.avatar_url, U.created_at,
                M.first_name, M.last_name, M.user_type, M.username
                FROM auth.users AS U
                JOIN public.user_follows AS UF ON U.id = UF."follow_user_id"
                JOIN public.metadata AS M ON UF."follow_user_id" = M."user_id"
                WHERE UF."user_id" = :id`;

            const following: any = await this.userModel?.sequelize?.query(
                executeFollowingQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id },
                }
            );

            return { success: true, data: following, message: 'User following fetched successfully' };
        } catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }

    async formatDateLocal(date: Date | string) {
        if (typeof date === 'string') {
            date = new Date(date);
        }
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    async formatDateUTC(date: Date | string) {
        if (typeof date === 'string') {
            date = new Date(date);
        }
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // UTC month
        const day = String(date.getUTCDate()).padStart(2, '0'); // UTC day
        return `${year}-${month}-${day}`;
    };

    async mergeFoodLogs(data: any[]): Promise<any[]> {
        const merged: Record<string, any> = {};

        data.forEach(item => {
            if (!merged[item.review_id]) {
                merged[item.review_id] = {
                    review_id: item.review_id,
                    review_created_at: item.review_created_at,
                    review_date: item.review_date,
                    hunger: parseInt(item.hunger),
                    fullness: parseInt(item.fullness),
                    log_dates: [item.log_date],   // keep all log dates if needed
                    foodLogs: [...item.foodLogs],
                    aiFoodRecognition: [...item.aiFoodRecognition],
                };
            } else {
                merged[item.review_id].log_dates.push(item.log_date);
                merged[item.review_id].foodLogs.push(...item.foodLogs);
                merged[item.review_id].aiFoodRecognition.push(...item.aiFoodRecognition);
            }
        });

        return Object.values(merged);
    }

    async fetchUserFoodLogs(payload: FoodLogsFilterDto): Promise<any> {
        try {
            let { id, startDate, endDate } = payload;
            let lastArchiveEndDate: any = '';
            let basicStartDate: any = '';
            const lastArchiveDate: any = await this.userModel?.sequelize?.query(
                `SELECT "end_date" as "endDate" FROM public.food_group_archives
                    WHERE "userId" = :id ORDER BY "end_date" DESC LIMIT 1`,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id },
                }
            );
            if (lastArchiveDate[0]?.endDate) {
                let tempEndDate = lastArchiveDate[0]?.endDate;
                lastArchiveEndDate = tempEndDate;
                tempEndDate = new Date(tempEndDate);
                tempEndDate.setDate(tempEndDate.getDate() + 1);
                tempEndDate = await this.formatDateUTC(tempEndDate);
                basicStartDate = tempEndDate;
            } else {
                const userCreationDate: any = await this.userModel?.sequelize?.query(
                    `SELECT "created_at" as "createdAt" FROM auth.users WHERE "id" = :id`,
                    {
                        type: QueryTypes.SELECT,
                        raw: true,
                        replacements: { id: id },
                    }
                );
                lastArchiveEndDate = userCreationDate[0]?.createdAt;
                basicStartDate = lastArchiveEndDate;
                basicStartDate.setDate(basicStartDate.getDate());
            }
            if (startDate.length === 0 && endDate.length === 0) {
                startDate = lastArchiveEndDate;
                endDate = new Date().toISOString();
            }

            let executeReviewFoodLogsQuery = `Select "R"."id", "R"."user_id", "RFL"."food_log_id" from public.reviews as "R"
                join public."review_food_logs" as "RFL" on "RFL"."review_id" = "R"."id"
                where "R"."user_id" = :id and Date("R"."review_date") >= :startDate and Date("R"."review_date") <= :endDate`;

            const reviewFoodLogs: any = await this.userModel?.sequelize?.query(
                executeReviewFoodLogsQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id, startDate: startDate, endDate: endDate },
                }
            );
            const foodLogsIdsArr = Array.from(new Set(reviewFoodLogs.map((review: any) => review.food_log_id)));
            const reviewIdsArr = Array.from(new Set(reviewFoodLogs.map((review: any) => review.id)));
            let executeAllArchivedFoodLogsQuery = `SELECT * FROM public.food_group_archives AS FGA
                    WHERE FGA."userId" = :id ORDER BY FGA."created_at" DESC`;
            const allArchivedFoodLogs: any = await this.userModel?.sequelize?.query(
                executeAllArchivedFoodLogsQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id },
                }
            );

            allArchivedFoodLogs.forEach((log: any) => {
                if (log.food_groups && Object.keys(log.food_groups).length > 0) {
                    const sortedEntries = Object.entries(log.food_groups).sort(
                        ([, a], [, b]) => Number(b) - Number(a)
                    );
                    log.food_groups = Object.fromEntries(sortedEntries);
                }
            })

            let aiConfirmedFoodGroups = {
                fruit: { count: 0, description: [] as string[] },
                vegetable: { count: 0, description: [] as string[] },
                grain: { count: 0, description: [] as string[] },
                dairy: { count: 0, description: [] as string[] },
                protein: { count: 0, description: [] as string[] },
                beansNutsSeeds: { count: 0, description: [] as string[] },
                wildcard: { count: 0, description: [] as string[] }
            };

            // Calculate real food group distribution
            const foodGroupCounts = {
                fruit: 0,
                vegetable: 0,
                grain: 0,
                dairy: 0,
                protein: 0,
                beansNutsSeeds: 0,
            }

            // Calculate days between first and last log (inclusive)
            const timeDiff = new Date(endDate).getTime() - new Date(startDate).getTime();
            const totalDays = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1; // +1 to include both start and end dates
            const totalReviewCount = reviewIdsArr.length;

            let hungerFullnessData = {
                lowHungerCount: 0,
                highFullnessCount: 0,
                avgPreMealHunger: 0,
                avgPostMealFullness: 0,
                totalMeals: 0
            };

            if (reviewIdsArr.length > 0) {
                let executeFoodLogsQuery = `SELECT DATE("FL"."created_at") AS log_date, "FL"."hunger" as hunger, "FL"."fullness" as fullness,
                    "RFL"."review_id", "R"."created_at" as "review_created_at", "R"."review_date" as "review_date", jsonb_agg(to_jsonb("FL"."food_groups")) AS "foodLogs",
                    jsonb_agg(to_jsonb("AIFR")) AS "aiFoodRecognition" FROM public.food_logs AS "FL"
                    LEFT JOIN public."ai_food_recognition" AS "AIFR" ON "FL"."ai_food_data_id" = "AIFR"."id"
                    JOIN public."review_food_logs" as "RFL" on "RFL"."food_log_id" = "FL"."id"
                    JOIN public."reviews" as "R" on "RFL"."review_id" = "R"."id"
                        WHERE "FL"."userId" = :id AND "FL"."id" IN (:foodLogsIdsArr)
                            GROUP BY DATE("FL"."created_at"), "RFL"."review_id", "R"."created_at",
                            "R"."review_date", "FL"."hunger", "FL"."fullness"
                            ORDER BY log_date ASC;`;

                const allFoodLogs: any = await this.userModel?.sequelize?.query(
                    executeFoodLogsQuery,
                    {
                        type: QueryTypes.SELECT,
                        raw: true,
                        replacements: {
                            id: id,
                            startDate: startDate,
                            endDate: endDate,
                            foodLogsIdsArr: foodLogsIdsArr
                        },
                    }
                );
                const foodLogs = await this.mergeFoodLogs(allFoodLogs);

                foodLogs.map((dt: any) => {
                    if (dt.hunger <= 2) {
                        hungerFullnessData.lowHungerCount += 1;
                    }
                    if (dt.fullness >= 7) {
                        hungerFullnessData.highFullnessCount += 1;
                    }
                })

                hungerFullnessData.avgPreMealHunger = hungerFullnessData.lowHungerCount / 10;
                hungerFullnessData.avgPostMealFullness = hungerFullnessData.highFullnessCount / 10;
                hungerFullnessData.totalMeals = foodLogs.length;

                let foodLogsIdsArrAvgCountQuery = `SELECT COUNT(id) as "count" FROM public.food_logs
                    WHERE "userId" = :id and "id" IN (:foodLogsIdsArr) and "food_type" NOT IN ('Other', '')`;
                const foodLogsIdsArrAvgCount: any = await this.userModel?.sequelize?.query(
                    foodLogsIdsArrAvgCountQuery,
                    {
                        type: QueryTypes.SELECT,
                        raw: true,
                        replacements: {
                            id: id,
                            foodLogsIdsArr: foodLogsIdsArr
                        },
                    }
                );

                let executeAiFoodLogsQuery = `SELECT * FROM public.ai_food_recognition 
                    WHERE "userId" = :id AND "createdAt" >= :startDate AND "createdAt" <= :endDate`;

                const aiFoodLogs: any = await this.userModel?.sequelize?.query(
                    executeAiFoodLogsQuery,
                    {
                        type: QueryTypes.SELECT,
                        raw: true,
                        replacements: {
                            id: id,
                            startDate: startDate,
                            endDate: endDate
                        },
                    }
                );

                const getFlattenedDescription = (description: string, descriptionArray: string[]) => {
                    description.split(',').forEach((item: string) => {
                        if (item.length > 0) { descriptionArray.push(item.trim()) }
                    });
                    descriptionArray = Array.from(new Set(descriptionArray));
                    return descriptionArray;
                }

                aiFoodLogs.forEach((log: any) => {
                    if (log.foodAiData.length > 0) {
                        log.foodAiData.forEach((item: any) => {
                            if (item.foodGroup && item.foodGroup.toLowerCase() === 'fruit') {
                                aiConfirmedFoodGroups.fruit.count++;
                                aiConfirmedFoodGroups.fruit.description = getFlattenedDescription(item.description, aiConfirmedFoodGroups.fruit.description)
                            } else if (item.foodGroup && item.foodGroup.toLowerCase() === 'vegetable') {
                                aiConfirmedFoodGroups.vegetable.count++;
                                aiConfirmedFoodGroups.vegetable.description = getFlattenedDescription(item.description, aiConfirmedFoodGroups.vegetable.description)
                            } else if (item.foodGroup && item.foodGroup.toLowerCase() === 'grain') {
                                aiConfirmedFoodGroups.grain.count++;
                                aiConfirmedFoodGroups.grain.description = getFlattenedDescription(item.description, aiConfirmedFoodGroups.grain.description)
                            } else if (item.foodGroup && item.foodGroup.toLowerCase() === 'dairy') {
                                aiConfirmedFoodGroups.dairy.count++;
                                aiConfirmedFoodGroups.dairy.description = getFlattenedDescription(item.description, aiConfirmedFoodGroups.dairy.description)
                            } else if (item.foodGroup && item.foodGroup.toLowerCase() === 'protein') {
                                aiConfirmedFoodGroups.protein.count++;
                                aiConfirmedFoodGroups.protein.description = getFlattenedDescription(item.description, aiConfirmedFoodGroups.protein.description)
                            } else if (item.foodGroup && (item.foodGroup.toLowerCase() === 'bns' || item.foodGroup.toLowerCase() === 'beansNutsSeeds')) {
                                aiConfirmedFoodGroups.beansNutsSeeds.count++;
                                aiConfirmedFoodGroups.beansNutsSeeds.description = getFlattenedDescription(item.description, aiConfirmedFoodGroups.beansNutsSeeds.description)
                            } else if (item.foodGroup && item.foodGroup.toLowerCase() === 'wildcard') {
                                aiConfirmedFoodGroups.wildcard.count++;
                                aiConfirmedFoodGroups.wildcard.description = getFlattenedDescription(item.description, aiConfirmedFoodGroups.wildcard.description)
                            }
                        })
                    }
                })

                let consecutive = 0;
                // data from food logs
                foodLogs.forEach((log: any) => {
                    if (log.foodLogs && log.foodLogs.length > 0) {
                        const oneGroup = log.foodLogs.flat();
                        let grp = oneGroup.map((group: string) => group && group.toLowerCase());
                        grp.forEach((g: string) => {
                            if (g === 'f') foodGroupCounts.fruit++
                            else if (g === 'v') foodGroupCounts.vegetable++
                            else if (g === 'g') foodGroupCounts.grain++
                            else if (g === 'd') foodGroupCounts.dairy++
                            else if (g === 'p') foodGroupCounts.protein++
                            else if (g === 'bns') foodGroupCounts.beansNutsSeeds++
                        })

                        // calculate consecutive logs
                        const foodGroupsOrder = ['f', 'v', 'g', 'd', 'p', 'bns'];
                        const uniqueFoodGroups = [...new Set(grp)];
                        const hasAllGroups = foodGroupsOrder.every(g => uniqueFoodGroups.includes(g));
                        if (hasAllGroups) {
                            consecutive++;
                        } else {
                            consecutive = 0;
                        }
                    }
                });

                const avgFoodLogsPerDay = {
                    fruit: foodGroupCounts.fruit > 0 ? (foodGroupCounts.fruit / totalReviewCount).toFixed(1) : 0,
                    vegetable: foodGroupCounts.vegetable > 0 ? (foodGroupCounts.vegetable / totalReviewCount).toFixed(1) : 0,
                    grain: foodGroupCounts.grain > 0 ? (foodGroupCounts.grain / totalReviewCount).toFixed(1) : 0,
                    dairy: foodGroupCounts.dairy > 0 ? (foodGroupCounts.dairy / totalReviewCount).toFixed(1) : 0,
                    protein: foodGroupCounts.protein > 0 ? (foodGroupCounts.protein / totalReviewCount).toFixed(1) : 0,
                    beansNutsSeeds: foodGroupCounts.beansNutsSeeds > 0 ? (foodGroupCounts.beansNutsSeeds / totalReviewCount).toFixed(1) : 0,
                };

                const finalFoodGroupCounts = {
                    "Fruit (F)": avgFoodLogsPerDay.fruit,
                    "Vegetable (V)": avgFoodLogsPerDay.vegetable,
                    "Grain (G)": avgFoodLogsPerDay.grain,
                    "Dairy (D)": avgFoodLogsPerDay.dairy,
                    "Protein (P)": avgFoodLogsPerDay.protein,
                    "Beans/Nuts/Seeds (bns)": avgFoodLogsPerDay.beansNutsSeeds
                }

                // Convert to entries, parse values as numbers, sort descending
                const sortedEntries = Object.entries(finalFoodGroupCounts).sort(
                    ([, a], [, b]) => Number(b) - Number(a)
                );
                const sortedObj = Object.fromEntries(sortedEntries);

                let executeFoodLogsCountQuery = `SELECT COUNT(FL.id) as "count" FROM public.food_logs AS FL
                    WHERE FL."userId" = :id and FL."created_at" >= :startDate and FL."created_at" <= :endDate`;
                const foodLogsCount: any = await this.userModel?.sequelize?.query(
                    executeFoodLogsCountQuery,
                    {
                        type: QueryTypes.SELECT,
                        raw: true,
                        replacements: { id: id, startDate: startDate, endDate: endDate },
                    }
                );

                const avgFoodLogCountPerDay = (foodLogsIdsArrAvgCount[0]?.count / totalReviewCount).toFixed(1);
                // const avgFoodLogCountPerDay = Math.round(foodLogsIdsArr.length / totalReviewCount);

                let dataToDisplay = false;
                if (parseInt(foodLogsCount[0]?.count) > 0) {
                    dataToDisplay = true;
                } else {
                    Object.values(foodGroupCounts).forEach((count: number) => {
                        if (parseInt(count.toString()) > 0) {
                            dataToDisplay = true;
                        }
                    });
                }

                const result = {
                    foodLogsArchived: allArchivedFoodLogs,
                    foodGroupDistribution: foodGroupCounts,
                    averageFoodLogsPerDay: sortedObj,
                    totalDays: totalDays,
                    totalReviewCount: totalReviewCount,
                    consecutiveLogs: consecutive,
                    count: foodLogsCount[0]?.count || 0,
                    dataToDisplay: dataToDisplay,
                    avgFoodLogCountPerDay: avgFoodLogCountPerDay,
                    aiConfirmedFoodGroups: aiConfirmedFoodGroups,
                    lastArchiveEndDate: lastArchiveEndDate,
                    basicStartDate: basicStartDate,
                    hungerFullnessData
                }

                return { success: true, data: result, message: 'User food logs fetched successfully' };
            } else {
                const result = {
                    foodLogsArchived: allArchivedFoodLogs,
                    foodGroupDistribution: {
                        "Fruit (F)": 0,
                        "Vegetable (V)": 0,
                        "Grain (G)": 0,
                        "Dairy (D)": 0,
                        "Protein (P)": 0,
                        "Beans/Nuts/Seeds (bns)": 0
                    },
                    averageFoodLogsPerDay: {
                        "Fruit (F)": 0,
                        "Vegetable (V)": 0,
                        "Grain (G)": 0,
                        "Dairy (D)": 0,
                        "Protein (P)": 0,
                        "Beans/Nuts/Seeds (bns)": 0
                    },
                    totalDays: totalDays,
                    totalReviewCount: totalReviewCount,
                    consecutiveLogs: 0,
                    count: 0,
                    dataToDisplay: true,
                    avgFoodLogCountPerDay: 0,
                    aiConfirmedFoodGroups: {
                        fruit: { count: 0, description: [''] },
                        vegetable: { count: 0, description: [''] },
                        grain: { count: 0, description: [''] },
                        dairy: { count: 0, description: [''] },
                        protein: { count: 0, description: [''] },
                        beansNutsSeeds: { count: 0, description: [''] },
                        wildcard: { count: 0, description: [''] }
                    },
                    lastArchiveEndDate: lastArchiveEndDate,
                    basicStartDate: basicStartDate,
                    hungerFullnessData
                }

                return { success: true, data: result, message: 'User food logs fetched successfully' };
            }
        } catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }

    async fetchUserFoodLogJournal(id: string, pageNumber: number | null, pageSize: number | null): Promise<any> {
        try {

            let executeFoodLogJournalQuery = `SELECT jsonb_build_object('id', R.id, 'user_id', R."user_id", 'review_date', R."review_date",
                'whatWentWell', R."whatWentWell", 'whatCouldBeBetter', R."whatCouldBeBetter",
                'correctiveMeasures', R."correctiveMeasures", 'thoughts', R."thoughts", 'created_at', R."created_at",
                'foodLogs', COALESCE(jsonb_agg(to_jsonb(FL) ORDER BY FL."created_at" DESC) FILTER (WHERE FL.id IS NOT NULL), '[]'::jsonb),
                'foodLogsCount', COUNT(FL.id)) AS review FROM public.reviews AS R
                LEFT JOIN public.review_food_logs AS RFL ON R.id = RFL."review_id"
                LEFT JOIN public.food_logs AS FL ON FL.id = RFL."food_log_id"
                WHERE R."user_id" = :id
                GROUP BY R.id, R."user_id", R."whatWentWell", R."whatCouldBeBetter", 
                R."correctiveMeasures", R."thoughts", R."created_at"
                ORDER BY Date(R."review_date") DESC`;

                if (pageNumber && pageSize) {
                    const offset = (pageNumber - 1) * pageSize;
                    executeFoodLogJournalQuery += ` LIMIT ${pageSize} OFFSET ${offset}`;
                }
            let foodLogJournal: any = await this.userModel?.sequelize?.query(
                executeFoodLogJournalQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id },
                }
            );

            let executeFoodLogJournalCountQuery = `SELECT COUNT(id) as "count" FROM public.reviews WHERE "user_id" = :id`;
            const foodLogJournalCount: any = await this.userModel?.sequelize?.query(
                executeFoodLogJournalCountQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id },
                }
            );

            let executeUserIntentionsDataQuery = `SELECT "intentions" as "intentions" FROM public.metadata WHERE "user_id" = :id`;
            const userIntentionsData: any = await this.userModel?.sequelize?.query(
                executeUserIntentionsDataQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id },
                }
            );
            let intentionArr = userIntentionsData[0].intentions;
            intentionArr = [...intentionArr, 'review-corrective-measures', 'review-do-well', 'review-done-better'];
            let userIntentions: any = [];
            intentionArr.forEach(async (item: any) => {
                if (item) {
                    let executeIntentionsDataQuery = `SELECT * FROM public.intentions WHERE "user_id" = :id AND "question_slug" = :question_slug`;
                    const intentionsData: any = await this.userModel?.sequelize?.query(
                        executeIntentionsDataQuery,
                        {
                            type: QueryTypes.SELECT,
                            raw: true,
                            replacements: { id: id, question_slug: item },
                        }
                    );
                    if (intentionsData.length > 0) {
                        userIntentions.push(intentionsData[0]);
                    }
                }
            });

            for (let i = 0; i < foodLogJournal.length; i++) {
                const item = foodLogJournal[i];

                let dailyIntentionsData: any = [];
                for (let i = 0; i < intentionArr.length; i++) {
                    const element = intentionArr[i];

                    let executeIntentionsCheckQuery = `SELECT "question_slug" as "question_slug", "values", "uid", "created_at" FROM public.answers WHERE "user_id" = :id 
                        AND "question_slug" = :question_slug AND uid = :uid`;

                    const intentionsCheckData: any = await this.userModel?.sequelize?.query(
                        executeIntentionsCheckQuery,
                        {
                            type: QueryTypes.SELECT,
                            raw: true,
                            replacements: { id: id, question_slug: element, uid: 'review-' + item.review.review_date },
                        }
                    );
                    if (intentionsCheckData.length > 0) {
                        dailyIntentionsData.push(intentionsCheckData[0]);
                    }
                }

                let dailyIntentionsArr: any = [];
                dailyIntentionsData.map((item: any) => {
                    if (item.question_slug.startsWith('intention-')) {
                        const newSlugName = item.question_slug.split('-')[1].charAt(0).toUpperCase() + item.question_slug.split('-')[1].slice(1)
                        dailyIntentionsArr.push({
                            ...item,
                            question_slug: newSlugName
                        });
                    }
                });
                item.review['dailyIntentions'] = dailyIntentionsArr;
                item.review.whatCouldBeBetter = dailyIntentionsData.find((item: any) => item.question_slug === 'review-done-better')?.values;
                item.review.whatWentWell = dailyIntentionsData.find((item: any) => item.question_slug === 'review-do-well')?.values;
                item.review.correctiveMeasures = dailyIntentionsData.find((item: any) => item.question_slug === 'review-corrective-measures')?.values;

                // Calculate real food group distribution
                const foodGroupCounts = {
                    fruit: 0,
                    vegetable: 0,
                    grain: 0,
                    dairy: 0,
                    protein: 0,
                    beansNutsSeeds: 0,
                }

                item.review.foodLogs.forEach((log: any) => {
                    if (log.food_groups && log.food_groups.length > 0) {
                        const oneGroup = log.food_groups;
                        let grp = oneGroup.map((group: string) => group && group.toLowerCase());
                        grp.forEach((g: string) => {
                            if (g === 'f') foodGroupCounts.fruit++
                            else if (g === 'v') foodGroupCounts.vegetable++
                            else if (g === 'g') foodGroupCounts.grain++
                            else if (g === 'd') foodGroupCounts.dairy++
                            else if (g === 'p') foodGroupCounts.protein++
                            else if (g === 'bns') foodGroupCounts.beansNutsSeeds++
                        });
                    }
                });

                item.review.foodGroupDistribution = foodGroupCounts;
            }

            let executeIntentionsDataQuery = `SELECT * FROM public.intentions WHERE "user_id" = :id`;
            const intentionsData: any = await this.userModel?.sequelize?.query(
                executeIntentionsDataQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id },
                }
            );

            let finalPreviousIntentionsData: any = [];
            intentionsData.forEach((item: any) => {
                let index = userIntentions.findIndex((dt: any) => {
                    if (dt.question_slug === item.question_slug) {
                        return true;
                    }
                })
                if (index === -1) {
                    finalPreviousIntentionsData.push({
                        ...item,
                        question_slug: item.question_slug.split('-')[1].charAt(0).toUpperCase() + item.question_slug.split('-')[1].slice(1)
                    });
                }
            });

            let finalCurrentIntentionsData: any = [];
            userIntentions.forEach((item: any) => {
                finalCurrentIntentionsData.push({
                    ...item,
                    question_slug: item.question_slug.split('-')[1].charAt(0).toUpperCase() + item.question_slug.split('-')[1].slice(1)
                });
            });

            return {
                success: true,
                data: {
                    rows: foodLogJournal,
                    count: foodLogJournalCount[0]?.count || 0,
                    previousIntentions: finalPreviousIntentionsData,
                    currentIntentions: finalCurrentIntentionsData,
                },
                message: 'User food log journal fetched successfully'
            };
        }
        catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }

    async fetchUserWorkbook(id: string): Promise<any> {
        try {
            let workbookResponseData: any = {
                userType: '',
                module: 0,
                cycle: 0,
                goals: [] as any,
                onboardingQues: [] as any,
                reassessScreeners: {},
                supplementsList: [] as any,
                adherenceList: [] as any,
                personalInfo: [] as any,
                mentalScreeners: {},
                initialReassessScreeners: {},
                feedbackData: [] as any,
            }

            let executeUserMetadataQuery = `SELECT * FROM public.metadata WHERE "user_id" = :id`;
            const userMetadata: any = await this.userModel?.sequelize?.query(
                executeUserMetadataQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id },
                }
            );
            let userCurrCycle = userMetadata[0].cycle;
            workbookResponseData.userType = userMetadata[0].user_type || 'patient';
            workbookResponseData.module = parseInt(userMetadata[0].pro_day) || 0;
            workbookResponseData.cycle = parseInt(userCurrCycle) || 0;

            let onboardingGoalSlugArr: string[] = [];
            if (workbookResponseData.userType === 'practitioner') {
                onboardingGoalSlugArr.push('onboarding-practitioner-use', 'personal-14-health-cooking', 'personal-15-health-meditation', 'onboarding-practitioner-type');
            } else if (workbookResponseData.userType === 'patient') {
                onboardingGoalSlugArr.push('onboarding-goals-why-now', 'onboarding-goals-why-here', 'personal-13-health-body', 'intake-08-ed-13-extra', 'personal-12-health-food', 'intake-03-anxiety-09-extra', 'personal-14-health-cooking', 'personal-15-health-meditation', 'personal-16-health-sleep-hours', 'personal-17-health-sleep-qual');
            }
            let executeOnboardingGoalsQuery = `SELECT "A"."values", "Q"."content" as "question_content", "Q"."slug" as "question_slug", "Q"."data" as "quesData" FROM public.answers as "A"
                JOIN public.questions as "Q" ON "Q"."slug" = "A"."question_slug"
                WHERE "user_id" = :id AND "A"."uid" = 'cycle-0' AND "A"."question_slug" in (:onboardingGoalSlugArr)`;
            const onboardingGoalsData: any = await this.userModel?.sequelize?.query(
                executeOnboardingGoalsQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id, onboardingGoalSlugArr: onboardingGoalSlugArr },
                }
            );
            onboardingGoalsData.map((dt: any) => {
                let ansValue = '';
                if (dt.quesData.render && dt.quesData.render.length > 0) {
                    ansValue = dt.quesData.render[parseInt(dt.values)]
                } else if (dt.quesData.choices && dt.quesData.choices.length > 0) {
                    ansValue = dt.values
                } else if (dt.values && dt.values.length > 0) {
                    if (dt.quesData.placeholder === '%') {
                        ansValue = dt.values + '%'
                    } else {
                        ansValue = dt.values
                    }
                }
                if (dt.question_slug === 'onboarding-goals-why-now' || dt.question_slug === 'onboarding-goals-why-here') {
                    workbookResponseData.goals.push({
                        question_slug: dt.question_slug,
                        quesContent: dt.question_content,
                        ansValue: ansValue
                    })
                } else {
                    workbookResponseData.onboardingQues.push({
                        question_slug: dt.question_slug,
                        quesContent: dt.question_content,
                        ansValue: ansValue
                    })
                }
            })

            let executeCheckQuery = `SELECT pq."program_day", pm."title" as "moduleName",
                json_agg(json_build_object('program_question_id', pq.id, 'program_day', pq."program_day", 'question_id', q.id, 'category', q."category", 'content', q."content", 'slug', q."slug", 'data', q."data", 'field_type', q."field_type", 'answer_id', a.id, 'uid', a.uid, 'values', a.values, 'question_slug', a.question_slug)) AS questions
                FROM public."program_questions" pq
                JOIN public."questions" q ON q.slug = pq.question_slug
                LEFT JOIN public."answers" a ON a.question_slug = q.slug AND a.user_id = :userId AND a.uid = :uid
                LEFT JOIN public."programs" pm ON pm.day = pq.program_day
                WHERE pq.program_day <= :programDay AND (a.question_slug ILIKE 'program-%' OR a.question_slug IS NULL)
                GROUP BY pq."program_day", pm."title" ORDER BY pq."program_day" DESC;`
            const assignmentQuestionsData: any = await this.userModel?.sequelize?.query(
                executeCheckQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { userId: id, programDay: workbookResponseData.module, uid: 'cycle-' + parseInt(userCurrCycle) },
                }
            );

            let executePinnedGemsQuery = `SELECT "P"."pinned_at", "P"."cycle",
                jsonb_agg(to_jsonb("PG")) FILTER (WHERE "PG".id IS NOT NULL AND "PG"."program_day" <= :programDay) AS "gems",
                jsonb_agg(to_jsonb("PL")) FILTER (WHERE "PL".id IS NOT NULL AND "PL"."program_day" <= :programDay) AS "links"
                FROM public.pins AS "P"
                LEFT JOIN public.program_gems AS "PG" ON "PG"."id" = "P"."target_id" AND "P"."pin_type" = 'gem'
                LEFT JOIN public.program_links AS "PL" ON "PL"."id" = "P"."target_id" AND "P"."pin_type" = 'link'
                WHERE "P"."user_id" = :id AND "P".pin_type in ('gem', 'link') AND "P"."cycle" = :cycle
                GROUP BY "P"."pinned_at", "P"."cycle" ORDER BY "P"."pinned_at" DESC;`

            const pinnedItemsData: any = await this.userModel?.sequelize?.query(
                executePinnedGemsQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id, cycle: parseInt(userCurrCycle), programDay: workbookResponseData.module },
                }
            );
            const pinnedItems = {
                gems: pinnedItemsData.filter((item: any) => item.gems).map((item: any) => item.gems).flat() || [],
                links: pinnedItemsData.filter((item: any) => item.links).map((item: any) => item.links).flat() || []
            }

            let assignmentsData: any[] = [];
            for (let i = 0; i < assignmentQuestionsData.length; i++) {
                const element = assignmentQuestionsData[i];

                assignmentsData.push({
                    ...element,
                    questions: element.questions.filter((item: any) => item.program_day <= workbookResponseData.module),
                    gems: [],
                    links: []
                })

                pinnedItems.gems.forEach((gem: any) => {
                    if (gem.program_day === parseInt(element.program_day)) {
                        assignmentsData[i]['gems'].push(gem)
                    }
                })

                pinnedItems.links.forEach((link: any) => {
                    if (link.program_day === parseInt(element.program_day)) {
                        assignmentsData[i]['links'].push(link)
                    }
                })
            }
            workbookResponseData['assignmentData'] = assignmentsData;

            let executeMentalScreenerQuery = `SELECT sl.id, sl.title, sl.slug,
                json_agg(json_build_object('survey', 
                    json_build_object('id', s.id, 'title', s.title, 'slug', s.slug, 'survey_status', 
                        COALESCE(ss_data.status, '[]'::json), 'survey_questions', 
                        COALESCE(sq_data.questions, '[]'::json))) ORDER BY sls."order" ASC) as "survey_list_surveys"
                FROM public.survey_list sl
                LEFT JOIN public.survey_list_surveys sls ON sl.slug = sls.survey_list_slug
                LEFT JOIN public.surveys s ON sls.survey_slug = s.slug
                LEFT JOIN LATERAL (SELECT json_agg(json_build_object('survey_slug', ss.survey_slug, 'uid', ss.uid, 'status', ss.status)) as status
                    FROM survey_status ss WHERE ss.survey_slug = s.slug AND ss.uid = :uid) ss_data ON true
                LEFT JOIN LATERAL (SELECT json_agg(json_build_object('id', sq.id, 'order', sq."order",
                            'question', json_build_object('id', q.id, 'slug', q.slug, 'content', q.content, 'category', q.category, 'field_type', q.field_type, 'data', q.data, 'answers', COALESCE(a_data.answers, '[]'::json))
                        ) ORDER BY sq."order" ASC) as questions
                    FROM survey_questions sq
                    JOIN questions q ON sq.question_slug = q.slug
                    LEFT JOIN LATERAL (SELECT json_agg(json_build_object('id', a.id, 'values', a.values, 'uid', a.uid, 'question_slug', a.question_slug, 'answer_date', a.created_at)) as answers
                        FROM answers a WHERE a.question_slug = q.slug AND a.user_id = :id AND a.uid = :uid
                    ) a_data ON true WHERE sq.survey_slug = s.slug
                ) sq_data ON true WHERE sl.slug = :surveySlug GROUP BY sl.id, sl.title, sl.slug;`
            const mentalScreener: any = await this.userModel?.sequelize?.query(
                executeMentalScreenerQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id, uid: 'cycle-0', surveySlug: 'intake-list' },
                }
            );

            const intakeScreenerData = {};
            for (let i = 0; i < mentalScreener[0].survey_list_surveys.length; i++) {
                const element = mentalScreener[0].survey_list_surveys[i];
                intakeScreenerData['page-' + (i + 1)] = {
                    title: element.survey.title,
                    slug: element.survey.slug,
                    survey_questions: element.survey.survey_questions.map((dt: any) => {
                        return {
                            question: dt.question.content,
                            renderData: dt.question.data,
                            answer: dt.question.answers && dt.question.answers.length > 0 ? dt.question.answers[0].values : '',
                            question_slug: dt.question.answers && dt.question.answers.length > 0 ? dt.question.answers[0].question_slug : '',
                            answer_date: dt.question.answers && dt.question.answers.length > 0 ? dt.question.answers[0].answer_date : '',
                        }
                    }),
                }
            }
            workbookResponseData['mentalScreeners'] = intakeScreenerData;

            const reassessList: any = await this.userModel?.sequelize?.query(
                executeMentalScreenerQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id, uid: 'cycle-' + parseInt(userCurrCycle), surveySlug: 'reassess-list' },
                }
            );
            const reassessScreenerData = {};
            for (let i = 0; i < reassessList[0].survey_list_surveys.length; i++) {
                if (i === 0) {
                    const feedbackElement = reassessList[0].survey_list_surveys[i];
                    const feedbackData = {
                        title: feedbackElement.survey.title,
                        slug: feedbackElement.survey.slug,
                        survey_questions: feedbackElement.survey.survey_questions.map((dt: any) => {
                            return {
                                quesContent: dt.question.content,
                                quesData: dt.question.data,
                                ansValue: dt.question.answers && dt.question.answers.length > 0 ? dt.question.answers[0].values : '',
                                quesSlug: dt.question.answers && dt.question.answers.length > 0 ? dt.question.answers[0].question_slug : '',
                                answer_date: dt.question.answers && dt.question.answers.length > 0 ? dt.question.answers[0].answer_date : '',
                            }
                        }),
                    }
                    workbookResponseData['feedbackData'] = feedbackData.survey_questions
                } else {
                    const element = reassessList[0].survey_list_surveys[i];
                    reassessScreenerData['page-' + (i)] = {
                        title: element.survey.title,
                        slug: element.survey.slug,
                        survey_questions: element.survey.survey_questions.map((dt: any) => {
                            return {
                                question: dt.question.content,
                                renderData: dt.question.data,
                                answer: dt.question.answers && dt.question.answers.length > 0 ? dt.question.answers[0].values : '',
                                question_slug: dt.question.answers && dt.question.answers.length > 0 ? dt.question.answers[0].question_slug : '',
                                answer_date: dt.question.answers && dt.question.answers.length > 0 ? dt.question.answers[0].answer_date : '',
                            }
                        }),
                    }
                }
            }
            workbookResponseData['reassessScreeners'] = reassessScreenerData;

            const initialReassessList: any = await this.userModel?.sequelize?.query(
                executeMentalScreenerQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id, uid: 'cycle-0', surveySlug: 'reassess-list' },
                }
            );
            const initialReassessData = {};
            for (let i = 1; i < initialReassessList[0].survey_list_surveys.length; i++) {
                const element = initialReassessList[0].survey_list_surveys[i];
                initialReassessData['page-' + (i)] = {
                    title: element.survey.title,
                    slug: element.survey.slug,
                    survey_questions: element.survey.survey_questions.map((dt: any) => {
                        return {
                            question: dt.question.content,
                            renderData: dt.question.data,
                            answer: dt.question.answers && dt.question.answers.length > 0 ? dt.question.answers[0].values : '',
                            question_slug: dt.question.answers && dt.question.answers.length > 0 ? dt.question.answers[0].question_slug : '',
                            answer_date: dt.question.answers && dt.question.answers.length > 0 ? dt.question.answers[0].answer_date : '',
                        }
                    }),
                }
            }
            workbookResponseData['initialReassessScreeners'] = initialReassessData;

            let personalInfoSlugArr = ['personal-06-demo-continent', 'personal-01-demo-age', 'personal-07-demo-city', 'personal-02-demo-gender', 'personal-04-demo-edu', 'personal-03-demo-ethnicity', 'personal-05-demo-par-edu', 'personal-08-anthro-weight', 'personal-09-anthro-weight-high', 'personal-11-anthro-weight-freq', 'personal-10-anthro-weight-low', 'personal-08-anthro-height'];
            let executePersonalInfoQuery = `SELECT json_build_object('quesContent', "Q"."content", 'quesData', "Q"."data", 'quesSlug', "A"."question_slug", 'ansValue', "A"."values", 'uid', "A"."uid", 'userId', "A"."user_id") as "personalInfoObj"
                FROM public.answers AS "A"
                LEFT JOIN public.questions AS "Q" ON "Q"."slug" = "A"."question_slug"
                WHERE "A"."user_id" = :id AND "A"."question_slug" in (:personalInfoSlug) AND "A"."uid" = :uid
                ORDER BY "A"."uid" DESC`;

            const personalInfoList: any = await this.userModel?.sequelize?.query(
                executePersonalInfoQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id, uid: 'cycle-' + parseInt(userCurrCycle), personalInfoSlug: personalInfoSlugArr },
                }
            );
            let tempPersonalInfoList: any = {
                demographics: [],
                anthropometrics: []
            };
            for (let i = 0; i < personalInfoList.length; i++) {
                const element = personalInfoList[i];
                if (element.personalInfoObj) {
                    if (element.personalInfoObj.quesSlug.includes('-demo-')) {
                        tempPersonalInfoList.demographics.push({ ...element.personalInfoObj });
                    } else if (element.personalInfoObj.quesSlug.includes('-anthro-')) {
                        element.personalInfoObj = {
                            ...element.personalInfoObj,
                            quesContent: element.personalInfoObj.quesContent.replace(/\\n/g, " "),
                        }
                        tempPersonalInfoList.anthropometrics.push({ ...element.personalInfoObj });
                    }
                }
            }
            workbookResponseData['personalInfo'] = { ...tempPersonalInfoList };

            let executeSupplementListQuery = `SELECT json_build_object('quesContent', "Q"."content", 'quesData', "Q"."data", 'quesSlug', "A"."question_slug", 'ansValue', "A"."values", 'uid', "A"."uid", 'userId', "A"."user_id") as "supplementObj"
                FROM public.answers AS "A"
                LEFT JOIN public.questions AS "Q" ON "Q"."slug" = "A"."question_slug"
                WHERE "A"."user_id" = :id AND "A"."question_slug" ilike 'supplement%' AND "A"."uid" = :uid
                ORDER BY "A"."uid" DESC`;

            const supplementList: any = await this.userModel?.sequelize?.query(
                executeSupplementListQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id, uid: 'cycle-' + parseInt(userCurrCycle) },
                }
            );
            supplementList.map((dt: any) => {
                if (dt.supplementObj) {
                    workbookResponseData['supplementsList'].push({ ...dt.supplementObj });
                }
            })

            let executeAdherenceListQuery = `SELECT json_build_object('quesContent', "Q"."content", 'quesData', "Q"."data", 'quesSlug', "A"."question_slug", 'ansValue', "A"."values", 'uid', "A"."uid", 'userId', "A"."user_id", 'answer_date', "A"."created_at") as "adherenceObj"
                FROM public.answers AS "A"
                LEFT JOIN public.questions AS "Q" ON "Q"."slug" = "A"."question_slug"
                WHERE "A"."user_id" = :id AND "A"."question_slug" ilike 'adherence%' AND "A"."uid" = :uid
                ORDER BY "A"."uid" DESC`;

            const adherenceList: any = await this.userModel?.sequelize?.query(
                executeAdherenceListQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id, uid: 'cycle-' + parseInt(userCurrCycle) },
                }
            );
            adherenceList.map((dt: any) => {
                if (dt.adherenceObj) {
                    workbookResponseData.adherenceList.push({ ...dt.adherenceObj });
                }
            })

            return { success: true, data: workbookResponseData, message: 'User workbook fetched successfully' };
        } catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }

    async fetchUserReviews(id: string, pageNumber: number, pageSize: number): Promise<any> {
        try {
            const offset = (pageNumber - 1) * pageSize;
            let executeReviewsQuery = `SELECT * FROM public.reviews WHERE "user_id" = :id
                ORDER BY "created_at" DESC LIMIT :pageSize OFFSET :offset`;

            const reviews: any = await this.userModel?.sequelize?.query(
                executeReviewsQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id, pageSize: pageSize, offset: offset },
                }
            );

            let executeReviewsCountQuery = `SELECT COUNT(id) as "count" FROM public.reviews WHERE "user_id" = :id`;

            const reviewsCount: any = await this.userModel?.sequelize?.query(
                executeReviewsCountQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id },
                }
            );
            return { success: true, data: { rows: reviews, count: reviewsCount[0]?.count || 0 }, message: 'User reviews fetched successfully' };
        } catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }

    async fetchUserIntentions(id: string, pageNumber: number, pageSize: number): Promise<any> {
        try {
            const offset = (pageNumber - 1) * pageSize;
            let executeIntentionsQuery = `SELECT * FROM public.intentions WHERE "user_id" = :id LIMIT :pageSize OFFSET :offset`;

            const intentions: any = await this.userModel?.sequelize?.query(
                executeIntentionsQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id, pageSize: pageSize, offset: offset },
                }
            );

            let executeIntentionsCountQuery = `SELECT COUNT(id) as "count" FROM public.intentions WHERE "user_id" = :id`;

            const intentionsCount: any = await this.userModel?.sequelize?.query(
                executeIntentionsCountQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id },
                }
            );
            return { success: true, data: { rows: intentions, count: intentionsCount[0]?.count || 0 }, message: 'User intentions fetched successfully' };
        } catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }

    async getProUserCount(practitionerId: string): Promise<any> {
        try {
            let queryOpts = {
                type: QueryTypes.SELECT,
                raw: true,
            }
            let proUserCountQuery = `SELECT COUNT(DISTINCT(M.user_id)) as "proUserCount" FROM public.metadata AS M
                WHERE M."user_type" != 'practitioner' AND M."plan" NOT IN ('free', 'trial', 'dev')`;
            if (practitionerId && practitionerId.length > 0 && practitionerId !== 'undefined') {
                proUserCountQuery += ` AND M.practitioner_id = :practitionerId`;
                queryOpts['replacements'] = { practitionerId: practitionerId };
            }
            const proUserCount: any = await this.userModel?.sequelize?.query(proUserCountQuery, { ...queryOpts });

            let activeUserCountQuery = `SELECT COUNT(DISTINCT(U.id)) as "activeUserCount" FROM auth.users AS U
                JOIN public.metadata as M ON U.id = M.user_id
                WHERE U.last_seen IS NOT NULL AND U.last_seen > NOW() - INTERVAL '28 day'`;
            if (practitionerId && practitionerId.length > 0 && practitionerId !== 'undefined') {
                activeUserCountQuery += ` AND M.practitioner_id = :practitionerId`;
                queryOpts['replacements'] = { practitionerId: practitionerId };
            }
            const activeUserCount: any = await this.userModel?.sequelize?.query(activeUserCountQuery, { ...queryOpts });

            let onboardedUserCountQuery = `SELECT COUNT(DISTINCT(M.user_id)) as "onboardedUserCount" FROM public.metadata AS M
                WHERE M."onboarded" = true`;
            if (practitionerId && practitionerId.length > 0 && practitionerId !== 'undefined') {
                onboardedUserCountQuery += ` AND M.practitioner_id = :practitionerId`;
                queryOpts['replacements'] = { practitionerId: practitionerId };
            }
            const onboardedUserCount: any = await this.userModel?.sequelize?.query(onboardedUserCountQuery, { ...queryOpts });

            let newCustomerCountQuery = `SELECT COUNT(id) AS "newCustomerCount" FROM auth.users AS U
                JOIN public.metadata as M ON U.id = M.user_id
                WHERE U.created_at >= NOW() - INTERVAL '28 days'`;
            if (practitionerId && practitionerId.length > 0 && practitionerId !== 'undefined') {
                newCustomerCountQuery += ` AND M.practitioner_id = :practitionerId`;
                queryOpts['replacements'] = { practitionerId: practitionerId };
            }
            const newCustomerCount: any = await this.userModel?.sequelize?.query(newCustomerCountQuery, { ...queryOpts });

            const newPractitionerCount: any = await this.userModel?.sequelize?.query(`SELECT COUNT(DISTINCT(U.id)) AS "newPractitionerCount" FROM auth.users as U
                JOIN public.metadata as M ON U.id = M.user_id
                WHERE M."user_type" = 'practitioner' AND U.created_at >= NOW() - INTERVAL '28 days'`);

            return {
                success: true, data: {
                    proUserCount: parseInt(proUserCount[0]?.proUserCount) || 0,
                    activeUserCount: parseInt(activeUserCount[0]?.activeUserCount) || 0,
                    onboardedUserCount: parseInt(onboardedUserCount[0]?.onboardedUserCount) || 0,
                    newCustomerCount: parseInt(newCustomerCount[0]?.newCustomerCount) || 0,
                    newPractitionerCount: parseInt(newPractitionerCount[0][0]?.newPractitionerCount) || 0
                }, message: 'Pro user count fetched successfully'
            };
        } catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }

    async getDashboardUserCount(practitionerId: string): Promise<any> {
        try {
            let queryOpts = {
                type: QueryTypes.SELECT,
                raw: true,
            }
            let patientCountQuery = `SELECT COUNT(*) as count FROM auth.users as U
                JOIN public.metadata AS M on U.id = M.user_id
                WHERE U.last_seen IS NOT NULL `;
            // AND M."user_type" != 'practitioner'`;
            if (practitionerId && practitionerId.length > 0 && practitionerId !== 'undefined') {
                patientCountQuery += ` AND M.practitioner_id = :practitionerId`;
                queryOpts['replacements'] = { practitionerId: practitionerId };
            }
            const patientCount: any = await this.userModel?.sequelize?.query(patientCountQuery, { ...queryOpts });

            let practitionerCountQuery = `SELECT COUNT(DISTINCT(U.id)) as "practitionerCount" FROM auth.users AS U
                JOIN public.metadata as M ON U.id = M.user_id
                WHERE U.last_seen IS NOT NULL AND M."user_type" = 'practitioner'`;
            const practitionerCount: any = await this.userModel?.sequelize?.query(practitionerCountQuery, { ...queryOpts });

            return {
                success: true, data: {
                    patientCount: parseInt(patientCount[0]?.count) || 0,
                    practitionerCount: parseInt(practitionerCount[0]?.practitionerCount) || 0,
                }, message: 'Dashboard user count fetched successfully'
            };
        } catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }

    async createNewUser(userData: any): Promise<IResponse> {
        try {
            const newUser = await this.userModel.create(userData);

            const displayName = userData.display_name ? userData.display_name : userData.firstName;
            const email = userData.email ? userData.email : userData.email;
            await this.sendRegistrationEmail(displayName, email);

            return { success: true, data: newUser, message: 'User created successfully' };
        } catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }

    async sendRegistrationEmail(displayName: string, email: string): Promise<any> {
        try {
            await this.sendEmail({
                to: email,
                subject: 'Welcome to Wise Mind Nutrition - Invitation',
                html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #6b46c1;">Welcome to Wise Mind Nutrition!</h2>
                  <p>Hello ${displayName},</p>
                  <p>You have been invited to join Wise Mind Nutrition by your practitioner.</p>
                  <p>You can now sign up through the mobile app using your email address: <strong>${email}</strong></p>
                  <p>Get Android app from <a href="https://play.google.com/store/apps/details?id=com.wisemindnutrition.app">Google Play</a></p>
                  <p>Get iOS app from <a href="https://apps.apple.com/us/app/wisemindnutrition/id6749000000">Apple App Store</a></p>
                  <p>If you have any questions, please contact your practitioner.</p>
                  <p>Best regards,<br>The Wise Mind Nutrition Team</p>
                </div>
              `
            })
        } catch (emailError: any) {
            console.error('Email sending error:', emailError)
            throw new BadRequestException(emailError.message || emailError);
        }
    }

    async sendPractitionerLoginEmail(practitionerName: string, email: string): Promise<any> {
        try {
            const timestamp = new Date().getTime();
            await this.sendEmail({
                to: email,
                subject: 'Practitioner Login Notification',
                html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #6b46c1;">Welcome to Wise Mind Nutrition!</h2>
                  <p>Hello ${practitionerName},</p>
                  <p>Log in to your account as practitioner to view the user's details.</p>
                  <p>Click the button below to log in:</p>
                  <a href="${process.env.NEXT_PUBLIC_FE_DOMAIN}/practitioners/login?timestamp=${timestamp}&email=${email}">
                    <button style="background-color: #6b46c1; color: white; padding: 10px 20px; border-radius: 5px; text-decoration: none; cursor: pointer;">Login</button>
                  </a>
                  <p>Best regards,<br>The Wise Mind Nutrition Team</p>
                </div>
              `,
            });
        } catch (error) {
            console.error(error, 'Email sending error');
            throw new BadRequestException(error.message || error);
        }
    }

    async sendEmail(options: { to: string; subject: string; html: string; text?: string }) {
        const mailOptions = {
            from: process.env.NEXT_PUBLIC_SMTP_USER || 'noreply@yourdomain.com',
            to: options.to,
            subject: options.subject,
            html: options.html,
            text: options.text || options.html.replace(/<[^>]*>/g, ''),
        }

        const resend = new Resend(process.env.NEXT_PUBLIC_SMTP_PASSWORD)

        try {
            const info = await resend.emails.send({
                from: 'Wise Mind Nutrition <noreply@wisemindnutrition.com>',
                to: [mailOptions.to],
                subject: mailOptions.subject,
                html: mailOptions.html,
            });
            return { success: true, messageId: info }
        } catch (error) {
            console.error('Failed to send email:', error)
            throw error
        }
    }

    async fetchUsersDataForPdf(filters: FilterDto, practitionerId: string): Promise<any> {
        try {
            const { searchTerm, sortBy, sortOrder, selectedRole, gift, unsubscribed } = filters;

            let executeDataQuery = `SELECT to_jsonb(U) as user, to_jsonb(M) as userMetadata,
                COALESCE(followers.follower_count, 0) AS "followerCount",
                COALESCE(following.following_count, 0) AS "followingCount"
                FROM auth.users as U 
                join public.metadata as M on U.id = M.user_id
                LEFT JOIN (SELECT "follow_user_id" AS id, COUNT(*) AS follower_count
                FROM public.user_follows GROUP BY "follow_user_id") AS followers ON followers.id = U.id
                LEFT JOIN (SELECT "user_id" AS id, COUNT(*) AS following_count
                FROM public.user_follows GROUP BY "user_id") AS following ON following.id = U.id`;

            if (searchTerm) {
                executeDataQuery += ` AND (U.email ILIKE '%${searchTerm}%' OR U.display_name ILIKE '%${searchTerm}%' OR M.first_name ILIKE '%${searchTerm}%' OR M.last_name ILIKE '%${searchTerm}%' OR M.username ILIKE '%${searchTerm}%')`;
            }

            if (practitionerId && practitionerId.length > 0 && practitionerId !== 'undefined') {
                executeDataQuery += ` JOIN public.user_follows AS UF ON U.id = UF."follow_user_id"
                WHERE U.last_seen IS NOT NULL AND UF."user_id" = :practitionerId`;
            } else {
                executeDataQuery += ` WHERE U.last_seen IS NOT NULL`;
            }

            if (gift && gift.toString() === 'true') {
                executeDataQuery += ` AND M.gift = true`;
            } else if (gift && gift.toString() === 'false') {
                executeDataQuery += ` AND M.gift = false`;
            }

            if (unsubscribed && unsubscribed.toString() === 'true') {
                executeDataQuery += ` AND M.unsubscribed = true`;
            } else if (unsubscribed && unsubscribed.toString() === 'false') {
                executeDataQuery += ` AND M.unsubscribed = false`;
            }

            if (selectedRole === 'practitioner') {
                executeDataQuery += ` AND M.user_type = 'practitioner'`;
            }

            if (sortBy && sortOrder) {
                if (sortBy === 'last_seen' || sortBy === 'email') {
                    executeDataQuery += ` ORDER BY U.${sortBy} ${sortOrder}`;
                } else if (sortBy === 'first_name' || sortBy === 'last_name' || sortBy === 'username' || sortBy === 'cycle' || sortBy === 'pro_day' || sortBy === 'plan' || sortBy === 'renewalNumber' || sortBy === 'revCatTrial') {
                    executeDataQuery += ` ORDER BY M."${sortBy}" ${sortOrder}`;
                }
            } else {
                executeDataQuery += ` ORDER BY U.last_seen DESC`;
            }

            let filterOpts = {};
            if (practitionerId && practitionerId.length > 0 && practitionerId !== 'undefined') {
                filterOpts['practitionerId'] = practitionerId;
            }
            const users = await this.userModel?.sequelize?.query(executeDataQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { ...filterOpts },
                }
            );

            return {
                success: true, data: users,
                message: 'Users fetched successfully',
            };
        } catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }

    async getPatientByPractitionerId(practitionerId: string): Promise<any> {
        try {
            const patients: any = await this.userModel?.sequelize?.query(
                `SELECT follow_user_id as "patientId" FROM public.user_follows WHERE user_id = :practitionerId`,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { practitionerId: practitionerId },
                }
            );

            const patientIds = patients?.map((patient: any) => patient.patientId) || [];
            return patientIds;
        } catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message || error);
        }
    }

    async getAnalyticsTab1Data(practitionerId: string): Promise<any> {
        try {

            let patientIds = [];
            let filterOpts = {};
            if (practitionerId && practitionerId.length > 0 && practitionerId !== 'undefined') {
                patientIds = await this.getPatientByPractitionerId(practitionerId);
            }

            let totalUserCohortQuery = `SELECT COUNT(*) as "totalUserCohort" FROM auth.users as U
                WHERE U.last_seen IS NOT NULL`;
            let giftedUserQuery = `SELECT COUNT(DISTINCT(U.id)) as "giftedUserCount" FROM auth.users AS U
                JOIN public.metadata as M on U.id = M.user_id
                WHERE M."gift" = true`;
            let dailyActiveUserQuery = `SELECT COUNT(DISTINCT(U.id)) as "dailyActiveUsers" FROM auth.users AS U
                JOIN public.metadata as M on U.id = M.user_id
                WHERE U.last_seen IS NOT NULL AND U.last_seen > NOW() - INTERVAL '1 day'`;
            let weeklyActiveUserQuery = `SELECT COUNT(DISTINCT(U.id)) as "weeklyActiveUsers" FROM auth.users AS U
                JOIN public.metadata as M on U.id = M.user_id
                WHERE U.last_seen IS NOT NULL AND U.last_seen > NOW() - INTERVAL '7 day'`
            let monthlyActiveUserQuery = `SELECT COUNT(DISTINCT(U.id)) as "monthlyActiveUsers" FROM auth.users AS U
                JOIN public.metadata as M on U.id = M.user_id
                WHERE U.last_seen IS NOT NULL AND U.last_seen > NOW() - INTERVAL '30 day'`
            let reassessSubmittedUserCountQuery = `Select Count(Distinct(user_id)) as "reassessSubmittedUserCount" from public.survey_list_status 
                where survey_list_slug ilike 'reassess-list' and status = 'completed'`;
            let reassessSubmitGiftedUserCountQuery = `Select Count(Distinct("SLS".user_id)) as "reassessSubmitGiftedUserCount" from public.survey_list_status "SLS"
                join public.metadata as M on "SLS".user_id = M.user_id
                where "SLS".survey_list_slug ilike 'reassess-list' and "SLS".status = 'completed' and M."gift" = true`;

            if (patientIds.length > 0) {
                totalUserCohortQuery += ` AND U.id IN (:patientIds)`;
                giftedUserQuery += ` AND U.id IN (:patientIds)`;
                dailyActiveUserQuery += ` AND U.id IN (:patientIds)`;
                weeklyActiveUserQuery += ` AND U.id IN (:patientIds)`;
                monthlyActiveUserQuery += ` AND U.id IN (:patientIds)`;
                reassessSubmittedUserCountQuery += ` AND user_id IN (:patientIds)`;
                reassessSubmitGiftedUserCountQuery += ` AND "SLS".user_id IN (:patientIds)`;
                filterOpts['patientIds'] = patientIds;
            }
            const totalUserCohort: any = await this.userModel?.sequelize?.query(
                totalUserCohortQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { ...filterOpts },
                }
            );

            let subscribedUserCount: any = 0;
            if (patientIds.length > 0 && practitionerId.length > 0 && practitionerId !== 'undefined') {
                const subsQuery = `SELECT COUNT(DISTINCT(user_id)) as "subscribedUserCount" FROM public.metadata WHERE user_id IN (:patientIds) AND plan not in ('free')`;
                let subscribedUserCountData: any = await this.userModel?.sequelize?.query(
                    subsQuery,
                    {
                        type: QueryTypes.SELECT,
                        raw: true,
                        replacements: { patientIds: patientIds },
                    }
                );
                subscribedUserCount = subscribedUserCountData[0]?.subscribedUserCount || 0;
            } else {
                const apiKey = process.env.REV_CAT_KEY_V2 || process.env.REVENUECAT_API_KEY;
                const projectKey = process.env.REV_CAT_PROJECT_KEY;
                let revCatUrl = `https://api.revenuecat.com/v2/projects/${projectKey}/metrics/overview`
                const response = await fetch(revCatUrl, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                });
                const data = await response.json();
                let subscribedUserData = data.metrics.find((metric: any) => metric.id === 'active_subscriptions');
                subscribedUserCount = subscribedUserData.value || 0;
            }

            const giftedUserCount: any = await this.userModel?.sequelize?.query(
                giftedUserQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { ...filterOpts },
                }
            );

            const dailyActiveUserCount: any = await this.userModel?.sequelize?.query(
                dailyActiveUserQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { ...filterOpts },
                }
            );

            const weeklyActiveUserCount: any = await this.userModel?.sequelize?.query(
                weeklyActiveUserQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { ...filterOpts },
                }
            );

            const monthlyActiveUserCount: any = await this.userModel?.sequelize?.query(
                monthlyActiveUserQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { ...filterOpts },
                }
            );

            const reassessSubmittedUserCount: any = await this.userModel?.sequelize?.query(
                reassessSubmittedUserCountQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { ...filterOpts },
                }
            );

            const reassessSubmitGiftedUserCount: any = await this.userModel?.sequelize?.query(
                reassessSubmitGiftedUserCountQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { ...filterOpts },
                }
            );

            return {
                success: true, data: {
                    totalUserCohort: parseInt(totalUserCohort[0]?.totalUserCohort) || 0,
                    cohortData: {
                        subscribedUserCount: parseInt(subscribedUserCount),
                        giftedUserCount: parseInt(giftedUserCount[0]?.giftedUserCount) || 0,
                        dailyActiveUserCount: parseInt(dailyActiveUserCount[0]?.dailyActiveUsers) || 0,
                        weeklyActiveUserCount: parseInt(weeklyActiveUserCount[0]?.weeklyActiveUsers) || 0,
                        monthlyActiveUserCount: parseInt(monthlyActiveUserCount[0]?.monthlyActiveUsers) || 0,
                    },
                    retentionData: {
                        dailyActiveUserCount: parseInt(dailyActiveUserCount[0]?.dailyActiveUsers),
                        weeklyActiveUserCount: parseInt(weeklyActiveUserCount[0]?.weeklyActiveUsers),
                        monthlyActiveUserCount: parseInt(monthlyActiveUserCount[0]?.monthlyActiveUsers),
                    },
                    completionData: {
                        total: parseInt(reassessSubmittedUserCount[0]?.reassessSubmittedUserCount),
                        subscribed: parseInt(subscribedUserCount),
                        gifted: parseInt(reassessSubmitGiftedUserCount[0]?.reassessSubmitGiftedUserCount),
                    }

                }, message: 'Analytics cohort data fetched successfully'
            };
        }
        catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }

    async getAnalyticsTab2Data(practitionerId: string): Promise<any> {
        try {

            let patientIds = [];
            let filterOpts = {};
            if (practitionerId && practitionerId.length > 0 && practitionerId !== 'undefined') {
                patientIds = await this.getPatientByPractitionerId(practitionerId);
            }

            let executeSelfEducationInfoQuery = `SELECT CASE trim(both '"' from "A"."values"::text)
                    WHEN '0' THEN 'Less than High School'
                    WHEN '1' THEN 'High School'
                    WHEN '2' THEN 'Some College'
                    WHEN '3' THEN 'College'
                    WHEN '4' THEN 'Graduate School'
                    ELSE 'Missing'
                END AS education_level, COUNT(*) AS n, ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS percent
                FROM public.answers AS "A" WHERE "A"."question_slug" = 'personal-04-demo-edu'`;
            if (patientIds.length > 0) {
                executeSelfEducationInfoQuery += ` AND "A"."user_id" IN (:patientIds) GROUP BY education_level ORDER BY education_level`;
                filterOpts['patientIds'] = patientIds;
            } else {
                executeSelfEducationInfoQuery += ` GROUP BY education_level ORDER BY education_level`;
            }

            const selfEducationInfoList: any = await this.userModel?.sequelize?.query(
                executeSelfEducationInfoQuery,
                { type: QueryTypes.SELECT, raw: true, replacements: { ...filterOpts } }
            );

            let executeParentEducationInfoQuery = `SELECT CASE trim(both '"' from "A"."values"::text)
                    WHEN '0' THEN 'Less than High School'
                    WHEN '1' THEN 'High School'
                    WHEN '2' THEN 'Some College'
                    WHEN '3' THEN 'College'
                    WHEN '4' THEN 'Graduate School'
                    ELSE 'Missing'
                END AS education_level, COUNT(*) AS n, ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS percent
                FROM public.answers AS "A" WHERE "A"."question_slug" = 'personal-05-demo-par-edu'`;
            if (patientIds.length > 0) {
                executeParentEducationInfoQuery += ` AND "A"."user_id" IN (:patientIds) GROUP BY education_level ORDER BY education_level`;
                filterOpts['patientIds'] = patientIds;
            } else {
                executeParentEducationInfoQuery += ` GROUP BY education_level ORDER BY education_level`;
            }

            const parentEducationInfoList: any = await this.userModel?.sequelize?.query(
                executeParentEducationInfoQuery,
                { type: QueryTypes.SELECT, raw: true, replacements: { ...filterOpts } }
            );

            let executeEthnicityInfoQuery = `SELECT CASE trim(both '"' from "A"."values"::text)
                    WHEN 'White' THEN 'White'
                    WHEN 'Other/Mixed' THEN 'Mixed'
                    WHEN 'Asian' THEN 'Asian'
                    WHEN 'Hisp./Latinx' THEN 'Hispanic'
                    WHEN 'Black' THEN 'Black'
                    ELSE 'Missing'
                END AS ethnicity, COUNT(*) AS n, ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS percent
                FROM public.answers AS "A" WHERE "A"."question_slug" = 'personal-03-demo-ethnicity'`;
            if (patientIds.length > 0) {
                executeEthnicityInfoQuery += ` AND "A"."user_id" IN (:patientIds) GROUP BY ethnicity ORDER BY ethnicity`;
                filterOpts['patientIds'] = patientIds;
            } else {
                executeEthnicityInfoQuery += ` GROUP BY ethnicity ORDER BY ethnicity`;
            }

            const ethnicityInfoList: any = await this.userModel?.sequelize?.query(
                executeEthnicityInfoQuery,
                { type: QueryTypes.SELECT, raw: true, replacements: { ...filterOpts } }
            );

            let executeGenderInfoQuery = `SELECT CASE trim(both '"' from "A"."values"::text)
                    WHEN 'Man' THEN 'Man'
                    WHEN 'Woman' THEN 'Woman'
                    WHEN 'Other' THEN 'Other'
                    ELSE 'Missing'
                END AS gender, COUNT(*) AS n, ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS percent
                FROM public.answers AS "A" WHERE "A"."question_slug" = 'personal-02-demo-gender'`;
            if (patientIds.length > 0) {
                executeGenderInfoQuery += ` AND "A"."user_id" IN (:patientIds) GROUP BY gender ORDER BY gender`;
                filterOpts['patientIds'] = patientIds;
            } else {
                executeGenderInfoQuery += ` GROUP BY gender ORDER BY gender`;
            }

            const genderInfoList: any = await this.userModel?.sequelize?.query(
                executeGenderInfoQuery,
                { type: QueryTypes.SELECT, raw: true, replacements: { ...filterOpts } }
            );

            let executeContinentInfoQuery = `SELECT CASE trim(both '"' from "A"."values"::text)
                    WHEN '0' THEN 'North America'
                    WHEN '1' THEN 'South America'
                    WHEN '2' THEN 'Europe'
                    WHEN '3' THEN 'Australia/Oceania'
                    WHEN '4' THEN 'Asia'
                    WHEN '5' THEN 'Africa'
                    WHEN '6' THEN 'Antarctica'
                    ELSE 'Missing'
                END AS continent, COUNT(*) AS n, ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS percent
                FROM public.answers AS "A" WHERE "A"."question_slug" = 'personal-06-demo-continent'`;
            if (patientIds.length > 0) {
                executeContinentInfoQuery += ` AND "A"."user_id" IN (:patientIds) GROUP BY continent ORDER BY continent`;
                filterOpts['patientIds'] = patientIds;
            } else {
                executeContinentInfoQuery += ` GROUP BY continent ORDER BY continent`;
            }

            const continentInfoList: any = await this.userModel?.sequelize?.query(
                executeContinentInfoQuery,
                { type: QueryTypes.SELECT, raw: true, replacements: { ...filterOpts } }
            );

            let executeAgeInfoQuery = `SELECT COUNT(*) FILTER (WHERE "A"."values"::text = '""')::int AS missing_count,
                COUNT(*) FILTER (WHERE "A"."values"::text <> '""')::int AS total_responses,
                ROUND(100.0 * COUNT(*) FILTER (WHERE "A"."values"::text = '""') / COUNT(*), 2) AS missing_percent,
                ROUND(AVG(("A"."values"->>0)::numeric) FILTER (WHERE ("A"."values"->>0) ~ '^[0-9]+$'), 2) AS mean_age,
                ROUND(STDDEV(("A"."values"->>0)::numeric) FILTER (WHERE ("A"."values"->>0) ~ '^[0-9]+$'), 2) AS sd_age
                FROM public.answers AS "A" WHERE "A"."question_slug" = 'personal-01-demo-age'`;
            if (patientIds.length > 0) {
                executeAgeInfoQuery += ` AND "A"."user_id" IN (:patientIds)`;
                filterOpts['patientIds'] = patientIds;
            }

            const ageInfoList: any = await this.userModel?.sequelize?.query(
                executeAgeInfoQuery,
                { type: QueryTypes.SELECT, raw: true, replacements: { ...filterOpts } }
            );

            return {
                success: true, data: {
                    selfEducationInfo: selfEducationInfoList,
                    parentEducationInfo: parentEducationInfoList,
                    ethnicityInfo: ethnicityInfoList,
                    genderInfo: genderInfoList,
                    continentInfo: continentInfoList,
                    ageInfo: ageInfoList
                }, message: 'Analytics tab 2 data fetched successfully'
            };
        } catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }

    async getAnalyticsTab3Data(practitionerId: string): Promise<any> {
        try {
            let patientIds = [];
            if (practitionerId && practitionerId.length > 0 && practitionerId !== 'undefined') {
                patientIds = await this.getPatientByPractitionerId(practitionerId);
            }

            let anthropometricsData: any[] = [];
            for (let i = 0; i < 5; i++) {
                let executeWeightInfoQuery = `SELECT 
                    COUNT(*) FILTER (WHERE "A"."values"::text = '""')::int AS missing_count,
                    COUNT(*) FILTER (WHERE "A"."values"::text <> '""')::int AS total_responses,
                    ROUND(
                      100.0 * COUNT(*) FILTER (WHERE "A"."values"::text = '""') / NULLIF(COUNT(*), 0), 
                      2
                    ) AS missing_percent,
                
                    -- mean and sd in lbs
                    ROUND(AVG((regexp_replace("A"."values"->>0, '[^0-9]', '', 'g'))::numeric)
                          FILTER (WHERE regexp_replace("A"."values"->>0, '[^0-9]', '', 'g') ~ '^[0-9]+$'), 2) AS mean_weight_lbs,
                    ROUND(STDDEV((regexp_replace("A"."values"->>0, '[^0-9]', '', 'g'))::numeric)
                          FILTER (WHERE regexp_replace("A"."values"->>0, '[^0-9]', '', 'g') ~ '^[0-9]+$'), 2) AS sd_weight_lbs,
                
                    -- mean and sd converted to kg
                    ROUND(AVG((regexp_replace("A"."values"->>0, '[^0-9]', '', 'g'))::numeric * 0.453592)
                          FILTER (WHERE regexp_replace("A"."values"->>0, '[^0-9]', '', 'g') ~ '^[0-9]+$'), 2) AS mean_weight_kg,
                    ROUND(STDDEV((regexp_replace("A"."values"->>0, '[^0-9]', '', 'g'))::numeric * 0.453592)
                          FILTER (WHERE regexp_replace("A"."values"->>0, '[^0-9]', '', 'g') ~ '^[0-9]+$'), 2) AS sd_weight_kg
                
                    FROM public.answers AS "A"
                    WHERE "A"."question_slug" = :quesSlug AND "A"."uid" = :cycle`;

                let weightReplaceFilterOpts = {
                    cycle: 'cycle-' + i,
                    quesSlug: i === 0 ? 'personal-08-anthro-weight' : 'reassess-03-personal-08-anthro-weight'
                }
                if (patientIds.length > 0) {
                    executeWeightInfoQuery += ` AND "A"."user_id" IN (:patientIds)`;
                    weightReplaceFilterOpts['patientIds'] = patientIds;
                }
                const weightInfoList: any = await this.userModel?.sequelize?.query(
                    executeWeightInfoQuery,
                    {
                        type: QueryTypes.SELECT,
                        raw: true,
                        replacements: { ...weightReplaceFilterOpts }
                    }
                );

                let executeHeightInfoQuery = `SELECT 
                    COUNT(*) FILTER (WHERE "A"."values"::text = '""')::int AS missing_count,
                    COUNT(*) FILTER (WHERE "A"."values"::text <> '""')::int AS total_responses,
                    ROUND(100.0 * COUNT(*) FILTER (WHERE "A"."values"::text = '""') / NULLIF(COUNT(*), 0), 
                    2) AS missing_percent,
                  
                    -- mean and sd in inches
                    ROUND(AVG((regexp_replace("A"."values"::text, '[^0-9]', '', 'g'))::numeric)
                          FILTER (WHERE regexp_replace("A"."values"::text, '[^0-9]', '', 'g') ~ '^[0-9]+$'), 2) AS mean_height_in,
                    ROUND(STDDEV((regexp_replace("A"."values"::text, '[^0-9]', '', 'g'))::numeric)
                          FILTER (WHERE regexp_replace("A"."values"::text, '[^0-9]', '', 'g') ~ '^[0-9]+$'), 2) AS sd_height_in,
                  
                    -- mean and sd converted to cm
                    ROUND(AVG((regexp_replace("A"."values"::text, '[^0-9]', '', 'g'))::numeric * 2.54)
                          FILTER (WHERE regexp_replace("A"."values"::text, '[^0-9]', '', 'g') ~ '^[0-9]+$'), 2) AS mean_height_cm,
                    ROUND(STDDEV((regexp_replace("A"."values"::text, '[^0-9]', '', 'g'))::numeric * 2.54)
                          FILTER (WHERE regexp_replace("A"."values"::text, '[^0-9]', '', 'g') ~ '^[0-9]+$'), 2) AS sd_height_cm
                
                    FROM public.answers AS "A"
                    WHERE "A"."question_slug" = 'personal-08-anthro-height' AND "A"."uid" = :cycle`;

                let heightReplaceFilterOpts = {
                    cycle: 'cycle-' + i
                }
                if (patientIds.length > 0) {
                    executeHeightInfoQuery += ` AND "A"."user_id" IN (:patientIds)`;
                    heightReplaceFilterOpts['patientIds'] = patientIds;
                }
                const heightInfoList: any = await this.userModel?.sequelize?.query(
                    executeHeightInfoQuery,
                    { type: QueryTypes.SELECT, raw: true, replacements: { ...heightReplaceFilterOpts } }
                );

                let executeWeightFreqInfoQuery = `SELECT CASE trim(both '"' from "A"."values"::text)
                        WHEN '0' THEN 'Never'
                        WHEN '1' THEN 'Yearly'
                        WHEN '2' THEN 'Monthly'
                        WHEN '3' THEN 'Weekly'
                        WHEN '4' THEN 'Most Days'
                        WHEN '5' THEN 'Daily'
                        WHEN '6' THEN 'More than Daily'
                        ELSE 'Missing'
                    END AS weight_freq, COUNT(*) AS n,
                    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS percent
                    FROM public.answers AS "A"
                    WHERE "A"."question_slug" = :quesSlug AND "A"."uid" = :cycle`;

                let weightFreqReplaceFilterOpts = {
                    cycle: 'cycle-' + i,
                    quesSlug: i === 0 ? 'personal-11-anthro-weight-freq' : 'reassess-03-personal-11-anthro-weight-freq'
                }
                if (patientIds.length > 0) {
                    executeWeightFreqInfoQuery += ` AND "A"."user_id" IN (:patientIds) GROUP BY weight_freq ORDER BY weight_freq`;
                    weightFreqReplaceFilterOpts['patientIds'] = patientIds;
                } else {
                    executeWeightFreqInfoQuery += ` GROUP BY weight_freq ORDER BY weight_freq`;
                }
                const weightFreqInfoList: any = await this.userModel?.sequelize?.query(
                    executeWeightFreqInfoQuery,
                    { type: QueryTypes.SELECT, raw: true, replacements: { ...weightFreqReplaceFilterOpts } }
                );

                let executeHighWeightQuery = `SELECT 
                    COUNT(*) FILTER (WHERE "A"."values"::text = '""')::int AS missing_count,
                    COUNT(*) FILTER (WHERE "A"."values"::text <> '""')::int AS total_responses,
                    ROUND(100.0 * COUNT(*) FILTER (WHERE "A"."values"::text = '""') / NULLIF(COUNT(*), 0), 2) AS missing_percent,
                    ROUND(AVG(CASE WHEN "A"."values"::text ~ '[0-9]' THEN
                        regexp_replace("A"."values"::text, '[^0-9\.]', '', 'g')::numeric *
                        CASE WHEN lower("A"."values"::text) LIKE '%lb%' THEN 0.45359237 ELSE 1 END ELSE NULL
                    END), 2) AS mean_weight_kg,
                    ROUND(STDDEV(CASE WHEN "A"."values"::text ~ '[0-9]' THEN
                        regexp_replace("A"."values"::text, '[^0-9\.]', '', 'g')::numeric *
                        CASE WHEN lower("A"."values"::text) LIKE '%lb%' THEN 0.45359237 ELSE 1 END ELSE NULL
                    END), 2) AS sd_weight_kg
                    FROM public.answers AS "A" WHERE "A"."question_slug" = 'personal-09-anthro-weight-high' AND "A"."uid" = :cycle`;

                let highWeightReplaceFilterOpts = {
                    cycle: 'cycle-' + i
                }
                if (patientIds.length > 0) {
                    executeHighWeightQuery += ` AND "A"."user_id" IN (:patientIds)`;
                    highWeightReplaceFilterOpts['patientIds'] = patientIds;
                }
                const highWeightInfoList: any = await this.userModel?.sequelize?.query(
                    executeHighWeightQuery,
                    {
                        type: QueryTypes.SELECT,
                        raw: true,
                        replacements: { ...highWeightReplaceFilterOpts }
                    }
                );

                let executeLowWeightQuery = `SELECT 
                    COUNT(*) FILTER (WHERE "A"."values"::text = '""')::int AS missing_count,
                    COUNT(*) FILTER (WHERE "A"."values"::text <> '""')::int AS total_responses,
                    ROUND(100.0 * COUNT(*) FILTER (WHERE "A"."values"::text = '""') / NULLIF(COUNT(*), 0), 2) AS missing_percent,
                    ROUND(AVG(CASE WHEN "A"."values"::text ~ '[0-9]' THEN
                        regexp_replace("A"."values"::text, '[^0-9\.]', '', 'g')::numeric *
                        CASE WHEN lower("A"."values"::text) LIKE '%lb%' THEN 0.45359237 ELSE 1 END ELSE NULL
                    END), 2) AS mean_weight_kg,
                    ROUND(STDDEV(CASE WHEN "A"."values"::text ~ '[0-9]' THEN
                        regexp_replace("A"."values"::text, '[^0-9\.]', '', 'g')::numeric *
                        CASE WHEN lower("A"."values"::text) LIKE '%lb%' THEN 0.45359237 ELSE 1 END ELSE NULL
                    END), 2) AS sd_weight_kg
                    FROM public.answers AS "A" WHERE "A"."question_slug" = 'personal-10-anthro-weight-low' AND "A"."uid" = :cycle`;

                let lowWeightReplaceFilterOpts = {
                    cycle: 'cycle-' + i
                }
                if (patientIds.length > 0) {
                    executeLowWeightQuery += ` AND "A"."user_id" IN (:patientIds)`;
                    lowWeightReplaceFilterOpts['patientIds'] = patientIds;
                }
                const lowWeightInfoList: any = await this.userModel?.sequelize?.query(
                    executeLowWeightQuery,
                    {
                        type: QueryTypes.SELECT,
                        raw: true,
                        replacements: { ...lowWeightReplaceFilterOpts }
                    }
                );

                anthropometricsData.push({
                    ['cycle-' + i]: {
                        weightInfo: weightInfoList,
                        heightInfo: heightInfoList,
                        weightFreqInfo: weightFreqInfoList,
                        highWeightInfo: highWeightInfoList,
                        lowWeightInfo: lowWeightInfoList,
                    }
                })
            }

            let executeWeightFreqReassessInfoQuery = `SELECT CASE trim(both '"' from "A"."values"::text)
                    WHEN '0' THEN 'Never'
                    WHEN '1' THEN 'Yearly'
                    WHEN '2' THEN 'Monthly'
                    WHEN '3' THEN 'Weekly'
                    WHEN '4' THEN 'Most Days'
                    WHEN '5' THEN 'Daily'
                    WHEN '6' THEN 'More than Daily'
                    ELSE 'Missing'
                END AS weight_freq, COUNT(*) AS n,
                ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS percent
                FROM public.answers AS "A"
                WHERE "A"."question_slug" = :quesSlug AND "A"."uid" = :cycle
                GROUP BY weight_freq ORDER BY weight_freq`;

            const weightFreqReassessInfoList: any = await this.userModel?.sequelize?.query(
                executeWeightFreqReassessInfoQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: {
                        cycle: 'cycle-0',
                        quesSlug: 'reassess-03-personal-11-anthro-weight-freq'
                    }
                }
            );

            return { success: true, data: { anthropometricsData, weightFreqInfo: weightFreqReassessInfoList }, message: 'Analytics tab 3 data fetched successfully' };
        } catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }

    async getAnalyticsTab4Data(practitionerId: string): Promise<any> {
        try {
            let patientIds = [];
            if (practitionerId && practitionerId.length > 0 && practitionerId !== 'undefined') {
                patientIds = await this.getPatientByPractitionerId(practitionerId);
            }

            let executeAdherenceModInfoQuery = `WITH slugs AS (
                SELECT unnest(ARRAY['adherence-01-food-log', 'adherence-02-nightly-review', 'adherence-03-videos', 'adherence-04-assignments', 'adherence-05-gems', 'adherence-06-links', 'adherence-07-recipes', 'adherence-08-cooking', 'adherence-09-meditation', 'adherence-10-guiding-principles']) AS slug),
                counts AS (SELECT s.slug AS question_slug,
                    CASE trim(both '"' from "A"."values"::text)
                        WHEN '0' THEN 'Not Doing This'
                        WHEN '1' THEN 'Doing Sometimes'
                        WHEN '2' THEN 'Doing Most Times'
                        WHEN '3' THEN 'Doing Currently'
                        ELSE 'Missing'
                    END AS mod, COUNT(*) AS n FROM slugs s
                    LEFT JOIN public.answers AS "A" ON "A"."question_slug" = s.slug
                    /**WHERE_CONDITION**/
                    GROUP BY s.slug, mod
                ),
                per_slug AS (SELECT question_slug, jsonb_object_agg(mod, n) AS mods
                    FROM counts GROUP BY question_slug)
                SELECT jsonb_object_agg(question_slug, mods) AS result FROM per_slug;`;

            let filterOpts = {}
            if (patientIds.length > 0) {
                executeAdherenceModInfoQuery = executeAdherenceModInfoQuery.replace("/**WHERE_CONDITION**/", ` AND "A"."user_id" IN (:patientIds)`);
                filterOpts['patientIds'] = patientIds;
            } else {
                executeAdherenceModInfoQuery = executeAdherenceModInfoQuery.replace("/**WHERE_CONDITION**/", '');
            }
            const adherenceModInfoList: any = await this.userModel?.sequelize?.query(
                executeAdherenceModInfoQuery,
                { type: QueryTypes.SELECT, raw: true, replacements: { ...filterOpts } }
            );

            let executeAdherenceReassessInfoQuery = `WITH slugs AS (
                SELECT unnest(ARRAY['reassess-02-adherence-01-food-log', 'reassess-02-adherence-02-food-log', 'reassess-02-adherence-03-videos', 'reassess-02-adherence-04-assignments', 'reassess-02-adherence-05-gems', 'reassess-02-adherence-06-links', 'reassess-02-adherence-07-recipes', 'reassess-02-adherence-08-cooking', 'reassess-02-adherence-09-meditation', 'reassess-02-adherence-10-guiding-principles']) AS slug),
                counts AS (SELECT s.slug AS question_slug,
                    CASE trim(both '"' from "A"."values"::text)
                        WHEN '0' THEN 'Not Doing This'
                        WHEN '1' THEN 'Doing Sometimes'
                        WHEN '2' THEN 'Doing Most Times'
                        WHEN '3' THEN 'Doing Currently'
                        ELSE 'Missing'
                    END AS mod, COUNT(*) AS n FROM slugs s
                    LEFT JOIN public.answers AS "A" ON "A"."question_slug" = s.slug
                    /**WHERE_CONDITION**/
                    GROUP BY s.slug, mod
                ),
                per_slug AS (SELECT question_slug, jsonb_object_agg(mod, n) AS mods
                    FROM counts GROUP BY question_slug)
                SELECT jsonb_object_agg(question_slug, mods) AS result FROM per_slug;`;

            if (patientIds.length > 0) {
                executeAdherenceReassessInfoQuery = executeAdherenceReassessInfoQuery.replace("/**WHERE_CONDITION**/", ` AND "A"."user_id" IN (:patientIds)`);
                filterOpts['patientIds'] = patientIds;
            } else {
                executeAdherenceReassessInfoQuery = executeAdherenceReassessInfoQuery.replace("/**WHERE_CONDITION**/", '');
            }
            const adherenceReassessInfoList: any = await this.userModel?.sequelize?.query(
                executeAdherenceReassessInfoQuery,
                { type: QueryTypes.SELECT, raw: true, replacements: { ...filterOpts } }
            );

            const finalResult = {
                adherenceModInfo: {
                    'food-log': adherenceModInfoList[0].result['adherence-01-food-log'],
                    'nightly-review': adherenceModInfoList[0].result['adherence-02-nightly-review'],
                    'videos': adherenceModInfoList[0].result['adherence-03-videos'],
                    'assignments': adherenceModInfoList[0].result['adherence-04-assignments'],
                    'gems': adherenceModInfoList[0].result['adherence-05-gems'],
                    'links': adherenceModInfoList[0].result['adherence-06-links'],
                    'recipes': adherenceModInfoList[0].result['adherence-07-recipes'],
                    'cooking': adherenceModInfoList[0].result['adherence-08-cooking'],
                    'meditation': adherenceModInfoList[0].result['adherence-09-meditation'],
                    'guiding-principles': adherenceModInfoList[0].result['adherence-10-guiding-principles'],
                },
                adherenceReassessInfo: {
                    'food-log': adherenceReassessInfoList[0].result['reassess-02-adherence-01-food-log'],
                    'nightly-review': adherenceReassessInfoList[0].result['reassess-02-adherence-02-food-log'],
                    'videos': adherenceReassessInfoList[0].result['reassess-02-adherence-03-videos'],
                    'assignments': adherenceReassessInfoList[0].result['reassess-02-adherence-04-assignments'],
                    'gems': adherenceReassessInfoList[0].result['reassess-02-adherence-05-gems'],
                    'links': adherenceReassessInfoList[0].result['reassess-02-adherence-06-links'],
                    'recipes': adherenceReassessInfoList[0].result['reassess-02-adherence-07-recipes'],
                    'cooking': adherenceReassessInfoList[0].result['reassess-02-adherence-08-cooking'],
                    'meditation': adherenceReassessInfoList[0].result['reassess-02-adherence-09-meditation'],
                    'guiding-principles': adherenceReassessInfoList[0].result['reassess-02-adherence-10-guiding-principles'],
                },
            }

            return { success: true, data: finalResult, message: 'Analytics tab 4 data fetched successfully' };
        } catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }

    async normalizeReassessKeys(data): Promise<any> {
        return data.map(cycleObj => {
            const cycleKey = Object.keys(cycleObj)[0];
            const cycleData = cycleObj[cycleKey];

            const normalizedData = {};
            for (const [key, value] of Object.entries(cycleData)) {
                // remove 'reassess-03-' prefix if present
                const newKey = key.replace(/^reassess-03-/, '');
                normalizedData[newKey] = value;
            }

            return { [cycleKey]: normalizedData };
        });
    }

    async getAnalyticsTab5Data(practitionerId: string): Promise<any> {
        try {
            let patientIds: any[] = [];
            if (practitionerId && practitionerId.length > 0 && practitionerId !== 'undefined') {
                patientIds = await this.getPatientByPractitionerId(practitionerId);
            }

            let executeDistinctUserQuery = `SELECT user_id FROM public.answers WHERE uid = 'cycle-0' AND values <> '""'
                    AND question_slug IN ('personal-12-health-food','personal-13-health-body','personal-14-health-cooking','personal-15-health-meditation','personal-16-health-sleep-hours','personal-17-health-sleep-qual')`
            if (patientIds.length > 0) {
                executeDistinctUserQuery += ` AND user_id IN (:patientIds) GROUP BY user_id HAVING COUNT(DISTINCT question_slug) = 6;`;
            } else {
                executeDistinctUserQuery += ` GROUP BY user_id HAVING COUNT(DISTINCT question_slug) = 6;`;
            }

            let userResult: any = await this.userModel?.sequelize?.query(
                executeDistinctUserQuery,
                { type: QueryTypes.SELECT, raw: true, replacements: { patientIds: patientIds } }
            );
            let userIds = userResult.map((dt: any) => dt.user_id)
            patientIds = Array.from(new Set(userIds));

            let executeFeedbackQuery = `WITH base_questions AS (SELECT unnest(ARRAY['personal-12-health-food','personal-13-health-body','personal-14-health-cooking','personal-15-health-meditation','personal-16-health-sleep-hours','personal-17-health-sleep-qual']) AS base_slug),
                ques AS (SELECT CASE WHEN :cycle = 'cycle-0' THEN base_slug ELSE 'reassess-03-' || base_slug END AS question_slug
                FROM base_questions),
                stats AS (
                SELECT q.question_slug,
                    COUNT(*) FILTER (WHERE "A"."values"::text = '""')::int AS missing_count,
                    COUNT(*) FILTER (WHERE "A"."values"::text <> '""')::int AS total_responses,
                    ROUND(100.0 * COUNT(*) FILTER (WHERE "A"."values"::text = '""') / NULLIF(COUNT(*), 0), 2) AS missing_percent,
                    ROUND(AVG(("A"."values"->>0)::numeric) FILTER (WHERE ("A"."values"->>0) ~ '^[0-9]+$'), 2) AS mean_overall,
                    ROUND(STDDEV(("A"."values"->>0)::numeric) FILTER (WHERE ("A"."values"->>0) ~ '^[0-9]+$'), 2) AS sd_overall
                FROM ques q
                LEFT JOIN public.answers AS "A" ON "A"."question_slug" = q.question_slug
                /**WHERE_CONDITION**/
                AND "A"."uid" = :cycle GROUP BY q.question_slug)
                SELECT jsonb_object_agg(
                question_slug,
                jsonb_build_object(
                    'missing_count', missing_count,
                    'total_responses', total_responses,
                    'missing_percent', missing_percent,
                    'mean_overall', mean_overall,
                    'sd_overall', sd_overall
                )
                ) AS result FROM stats;`;

            let feedback: any[] = [];
            for (let i = 0; i < 5; i++) {
                let filterOpts = {
                    cycle: 'cycle-' + i
                }
                if (patientIds.length > 0) {
                    executeFeedbackQuery = executeFeedbackQuery.replace("/**WHERE_CONDITION**/", ` AND "A"."user_id" IN (:patientIds)`);
                    filterOpts['patientIds'] = patientIds;
                } else {
                    executeFeedbackQuery = executeFeedbackQuery.replace("/**WHERE_CONDITION**/", '');
                }
                let result: any = await this.userModel?.sequelize?.query(
                    executeFeedbackQuery,
                    { type: QueryTypes.SELECT, raw: true, replacements: { ...filterOpts } }
                );

                feedback.push({
                    ['cycle-' + i]: result[0].result
                })
            }

            const normalized = await this.normalizeReassessKeys(feedback);

            return { success: true, data: normalized, message: 'Analytics tab 5 data fetched successfully' };
        } catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }

    async getAnalyticsTab6Data(practitionerId: string): Promise<any> {
        try {
            let patientIds = [];
            if (practitionerId && practitionerId.length > 0 && practitionerId !== 'undefined') {
                patientIds = await this.getPatientByPractitionerId(practitionerId);
            }

            // let executeDistinctUserQuery = `SELECT user_id FROM public.answers WHERE uid = 'cycle-0' AND values <> '""'
            //         AND question_slug IN ('intake-01-adhd-a-01', 'intake-01-adhd-a-02', 'intake-01-adhd-a-03', 'intake-01-adhd-a-04', 'intake-01-adhd-a-05', 'intake-01-adhd-a-06', 'intake-01-adhd-a-07', 'intake-01-adhd-a-08', 'intake-01-adhd-a-09',
            //         'intake-02-adhd-b-10', 'intake-02-adhd-b-11', 'intake-02-adhd-b-12', 'intake-02-adhd-b-13', 'intake-02-adhd-b-14', 'intake-02-adhd-b-15', 'intake-02-adhd-b-16', 'intake-02-adhd-b-17', 'intake-02-adhd-b-18',
            //         'intake-03-anxiety-00', 'intake-03-anxiety-01', 'intake-03-anxiety-02', 'intake-03-anxiety-03', 'intake-03-anxiety-04', 'intake-03-anxiety-05', 'intake-03-anxiety-06', 'intake-03-anxiety-07', 'intake-03-anxiety-08', 'intake-03-anxiety-09',
            //         'intake-04-depression-00', 'intake-04-depression-01', 'intake-04-depression-02', 'intake-04-depression-03', 'intake-04-depression-04', 'intake-04-depression-05', 'intake-04-depression-06', 'intake-04-depression-07', 'intake-04-depression-08', 'intake-04-depression-09', 'intake-04-depression-10-mod',
            //         'intake-05-ptsd-00', 'intake-05-ptsd-01', 'intake-05-ptsd-02', 'intake-05-ptsd-03', 'intake-05-ptsd-04', 'intake-05-ptsd-05', 'intake-05-ptsd-06', 'intake-05-ptsd-07', 'intake-05-ptsd-08', 'intake-05-ptsd-09', 'intake-05-ptsd-10', 'intake-05-ptsd-11', 'intake-05-ptsd-12', 'intake-05-ptsd-13', 'intake-05-ptsd-14', 'intake-05-ptsd-15', 'intake-05-ptsd-16', 'intake-05-ptsd-17', 'intake-05-ptsd-18', 'intake-05-ptsd-19',
            //         'intake-06-sud-00', 'intake-06-sud-01', 'intake-06-sud-02', 'intake-06-sud-03', 'intake-06-sud-04', 'intake-06-sud-05', 'intake-06-sud-06',
            //         'intake-07-fa-00', 'intake-07-fa-01', 'intake-07-fa-02', 'intake-07-fa-03', 'intake-07-fa-04', 'intake-07-fa-05', 'intake-07-fa-06', 'intake-07-fa-07', 'intake-07-fa-08', 'intake-07-fa-09', 'intake-07-fa-10', 'intake-07-fa-11', 'intake-07-fa-12', 'intake-07-fa-13',
            //         'intake-08-ed-00', 'intake-08-ed-01', 'intake-08-ed-02', 'intake-08-ed-03', 'intake-08-ed-04', 'intake-08-ed-05', 'intake-08-ed-06', 'intake-08-ed-07', 'intake-08-ed-08', 'intake-08-ed-09', 'intake-08-ed-10', 'intake-08-ed-10-next', 'intake-08-ed-11', 'intake-08-ed-12', 'intake-08-ed-13-extra',
            //         'intake-09-resilience-00', 'intake-09-resilience-01', 'intake-09-resilience-02', 'intake-09-resilience-03', 'intake-09-resilience-04', 'intake-09-resilience-05', 'intake-09-resilience-06',
            //         'intake-10-social-support-00', 'intake-10-social-support-01', 'intake-10-social-support-02', 'intake-10-social-support-03', 'intake-10-social-support-04', 'intake-10-social-support-05', 'intake-10-social-support-06', 'intake-10-social-support-07', 'intake-10-social-support-08', 'intake-10-social-support-09', 'intake-10-social-support-10', 'intake-10-social-support-11', 'intake-10-social-support-12',
            //         'intake-11-ace-00', 'intake-11-ace-01', 'intake-11-ace-02', 'intake-11-ace-03', 'intake-11-ace-04', 'intake-11-ace-05', 'intake-11-ace-06', 'intake-11-ace-07', 'intake-11-ace-08', 'intake-11-ace-09', 'intake-11-ace-10',
            //         'intake-12-ace-exp-00', 'intake-12-ace-exp-01', 'intake-12-ace-exp-02', 'intake-12-ace-exp-03', 'intake-12-ace-exp-04', 'intake-12-ace-exp-05', 'intake-12-ace-exp-06', 'intake-12-ace-exp-07', 'intake-12-ace-exp-08', 'intake-12-ace-exp-09', 'intake-12-ace-exp-10-mod')`
            // if (patientIds.length > 0) {
            //     executeDistinctUserQuery += ` AND user_id IN (:patientIds) GROUP BY user_id HAVING COUNT(DISTINCT question_slug) = 6;`;
            // } else {
            //     executeDistinctUserQuery += ` GROUP BY user_id HAVING COUNT(DISTINCT question_slug) = 6;`;
            // }

            // let userResult: any = await this.userModel?.sequelize?.query(
            //     executeDistinctUserQuery,
            //     { type: QueryTypes.SELECT, raw: true, replacements: { patientIds: patientIds } }
            // );
            // let userIds = userResult.map((dt: any) => dt.user_id)
            // patientIds = Array.from(new Set(userIds));

            let executeBaselineDataQuery = `WITH question_stats AS (SELECT 
                        SQ.survey_slug, COUNT(*) FILTER (WHERE A.values::text = '""')::int AS missing_count,
                        COUNT(*) FILTER (WHERE A.values::text <> '""')::int AS total_responses,
                        ROUND(100.0 * COUNT(*) FILTER (WHERE A.values::text = '""') / NULLIF(COUNT(*), 0), 2) AS missing_percent,
                        ROUND(AVG((A.values->>0)::numeric) FILTER (WHERE (A.values->>0) ~ '^[0-9]+$'), 2) AS mean_overall,
                        ROUND(STDDEV((A.values->>0)::numeric) FILTER (WHERE (A.values->>0) ~ '^[0-9]+$'), 2) AS sd_overall
                    FROM public.questions AS q
                    LEFT JOIN public.answers AS A ON A.question_slug = q.slug
                    LEFT JOIN public.survey_questions AS SQ ON SQ.question_slug = q.slug
                    LEFT JOIN public.survey_list_surveys AS SLS ON SLS.survey_slug = SQ.survey_slug
                    WHERE A.uid = 'cycle-0' /**WHERE_CONDITION**/ AND SLS.survey_list_slug = 'intake-list'
                    GROUP BY q.slug, SQ.survey_slug
                ),
                survey_aggregated AS (SELECT survey_slug, MIN(total_responses) AS total_responses, SUM(missing_count) AS missing_count,
                    ROUND(AVG(missing_percent), 2) AS missing_percent, ROUND(AVG(mean_overall), 2) AS mean_overall,
                    ROUND(AVG(sd_overall), 2) AS sd_overall FROM question_stats GROUP BY survey_slug)
                SELECT jsonb_object_agg(survey_slug, jsonb_build_object(
                    'total_responses', total_responses, 'missing_count', missing_count,
                    'missing_percent', missing_percent, 'mean_overall', mean_overall,
                    'sd_overall', sd_overall)) AS result
                FROM survey_aggregated`;
            let filterOpts = {}
            if (patientIds.length > 0) {
                executeBaselineDataQuery = executeBaselineDataQuery.replace("/**WHERE_CONDITION**/", ` AND A.user_id IN (:patientIds)`);
                filterOpts['patientIds'] = patientIds;
            } else {
                executeBaselineDataQuery = executeBaselineDataQuery.replace("/**WHERE_CONDITION**/", '');
            }
            const baselineData: any = await this.userModel?.sequelize?.query(
                executeBaselineDataQuery,
                { type: QueryTypes.SELECT, raw: true, replacements: { ...filterOpts } }
            );

            let reassessData: any[] = [];
            for (let i = 1; i < 5; i++) {
                let executeReassessDataQuery = `WITH ques AS (
                        SELECT SQ.question_slug, SQ.survey_slug FROM public.survey_questions AS SQ
                        JOIN public.survey_list_surveys AS SLS ON SLS.survey_slug = SQ.survey_slug
                        WHERE SLS.survey_list_slug = 'reassess-list'
                    ),
                    stats AS (
                        SELECT q.survey_slug,
                            COUNT(*) FILTER (WHERE A.values::text = '""')::int AS missing_count,
                            COUNT(*) FILTER (WHERE A.values::text <> '""')::int AS total_responses,
                            ROUND(100.0 * COUNT(*) FILTER (WHERE A.values::text = '""') / COUNT(*), 2) AS missing_percent,
                            ROUND(AVG((A.values->>0)::numeric) 
                                FILTER (WHERE (A.values->>0) ~ '^[0-9]+$'), 2) AS mean_overall,
                            ROUND(STDDEV((A.values->>0)::numeric) 
                                FILTER (WHERE (A.values->>0) ~ '^[0-9]+$'), 2) AS sd_overall
                        FROM ques q
                        LEFT JOIN public.answers AS A ON A.question_slug = q.question_slug
                        WHERE A.uid = :cycle /**WHERE_CONDITION**/ GROUP BY q.survey_slug
                    )
                    SELECT jsonb_object_agg(survey_slug, 
                        jsonb_build_object(
                            'missing_count', missing_count,
                            'total_responses', total_responses,
                            'missing_percent', missing_percent,
                            'mean_overall', mean_overall,
                            'sd_overall', sd_overall
                        )) AS result FROM stats;`
                let filterOpts = {
                    cycle: 'cycle-' + i
                }
                if (patientIds.length > 0) {
                    executeReassessDataQuery = executeReassessDataQuery.replace("/**WHERE_CONDITION**/", ` AND A.user_id IN (:patientIds)`);
                    filterOpts['patientIds'] = patientIds;
                } else {
                    executeReassessDataQuery = executeReassessDataQuery.replace("/**WHERE_CONDITION**/", '');
                }
                let result: any = await this.userModel?.sequelize?.query(
                    executeReassessDataQuery,
                    { type: QueryTypes.SELECT, raw: true, replacements: { ...filterOpts } }
                );

                reassessData.push({
                    ['cycle-' + i]: result[0].result
                })
            }

            return {
                success: true, data: {
                    baselineData: {
                        ...baselineData[0].result,
                        "intake-food-addiction": { ...baselineData[0].result["intake-fa"] }
                    },
                    reassessData: reassessData
                }, message: 'Analytics tab 6 data fetched successfully'
            };
        } catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }

    async getAnalyticsTab7Data(): Promise<any> {
        try {

            let executeFeedbackQuery = `WITH ques AS (
                SELECT unnest(ARRAY['reassess-01-feedback-03-nightly-review', 'reassess-01-feedback-09-links', 'reassess-01-feedback-05-education', 'reassess-01-feedback-12-science', 'reassess-01-feedback-04-intake', 'reassess-01-feedback-16-recommendations', 'reassess-01-feedback-00', 'reassess-01-feedback-08-gems', 'reassess-01-feedback-13-spirituality', 'reassess-01-feedback-11-other', 'reassess-01-feedback-10-recipes', 'reassess-01-feedback-01-app', 'reassess-01-feedback-06-videos', 'reassess-01-feedback-14-david-wiss', 'reassess-01-feedback-02-food-log', 'reassess-01-feedback-07-assignments']) AS question_slug),
                    stats AS (
                    SELECT q.question_slug,
                        COUNT(*) FILTER (WHERE "A"."values"::text = '""')::int AS missing_count,
                        COUNT(*) FILTER (WHERE "A"."values"::text <> '""')::int AS total_responses,
                        ROUND(100.0 * COUNT(*) FILTER (WHERE "A"."values"::text = '""') / COUNT(*), 2) AS missing_percent,
                        ROUND(AVG(("A"."values"->>0)::numeric) 
                            FILTER (WHERE ("A"."values"->>0) ~ '^[0-9]+$'), 2) AS mean_overall,
                        ROUND(STDDEV(("A"."values"->>0)::numeric) 
                            FILTER (WHERE ("A"."values"->>0) ~ '^[0-9]+$'), 2) AS sd_overall
                    FROM ques q
                    LEFT JOIN public.answers AS "A" ON "A"."question_slug" = q.question_slug
                    GROUP BY q.question_slug)
                    SELECT jsonb_object_agg(question_slug, 
                        jsonb_build_object(
                          'missing_count', missing_count,
                          'total_responses', total_responses,
                          'missing_percent', missing_percent,
                          'mean_overall', mean_overall,
                          'sd_overall', sd_overall
                        )) AS result FROM stats;`
            const feedback: any = await this.userModel?.sequelize?.query(
                executeFeedbackQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                }
            );

            let executeOtherFeedbackQuery = `WITH stats AS (
                    SELECT COUNT(*)::int AS total_count,
                        COUNT(*) FILTER (WHERE "values" IS NULL OR trim(both '"' FROM "values"::text) = ''
                        )::int AS missing_count
                    FROM public.answers WHERE question_slug = 'reassess-01-feedback-15-other-feedback'
                ),
                user_summaries AS (SELECT  "A"."user_id", "A"."created_at", "U"."username" AS user_name,
                    "U"."first_name" AS first_name, "U"."last_name" AS last_name,
                        jsonb_agg(DISTINCT "A"."values" ORDER BY "A"."values") AS distinct_values
                    FROM public.answers AS "A"
                    JOIN public.metadata AS "U" ON "U"."user_id" = "A"."user_id"
                    WHERE "A".question_slug = 'reassess-01-feedback-15-other-feedback'
                    AND ("A"."values" IS NOT NULL AND trim(both '"' FROM "A"."values"::text) <> '')
                    GROUP BY "A"."user_id", "A"."created_at", "U"."username", "U"."first_name", 
                    "U"."last_name")
                SELECT jsonb_build_object(
                    'total_count', (SELECT total_count FROM stats),
                    'missing_count', (SELECT missing_count FROM stats),
                    'summary', COALESCE(
                        jsonb_agg(
                            jsonb_build_object(
                                'user_id', user_summaries.user_id,
                                'created_at', user_summaries.created_at,
                                'user_name', user_summaries.user_name,
                                'first_name', user_summaries.first_name,
                                'last_name', user_summaries.last_name,
                                'distinct_values', user_summaries.distinct_values
                            )
                            ORDER BY user_summaries.created_at DESC
                        ),
                        '[]'::jsonb
                    )
                ) AS result FROM user_summaries`;
            const otherFeedback: any = await this.userModel?.sequelize?.query(
                executeOtherFeedbackQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                }
            );

            let executeRecommendationFeedbackQuery = `WITH stats AS (
                    SELECT COUNT(*)::int AS total_count,
                        COUNT(*) FILTER (WHERE "values" IS NULL OR trim(both '"' FROM "values"::text) = '')::int AS missing_count
                    FROM public.answers WHERE question_slug = 'reassess-01-feedback-16-recommendations'
                ),
                user_summaries AS (SELECT "A"."user_id", "A"."created_at", "U"."username" AS user_name, 
                        "U"."first_name" AS first_name, "U"."last_name" AS last_name,
                        jsonb_agg(DISTINCT "A"."values" ORDER BY "A"."values") AS distinct_values
                    FROM public.answers AS "A"
                    JOIN public.metadata AS "U" ON "U"."user_id" = "A"."user_id"
                    WHERE "A".question_slug = 'reassess-01-feedback-16-recommendations'
                        AND ("A"."values" IS NOT NULL AND trim(both '"' FROM "A"."values"::text) <> '')
                    GROUP BY "A"."user_id", "A"."created_at", "U"."username", "U"."first_name", "U"."last_name")
                SELECT jsonb_build_object(
                    'total_count', (SELECT total_count FROM stats),
                    'missing_count', (SELECT missing_count FROM stats),
                    'summary', COALESCE(
                        jsonb_agg(
                            jsonb_build_object(
                                'user_id', user_summaries.user_id,
                                'created_at', user_summaries.created_at,
                                'user_name', user_summaries.user_name,
                                'first_name', user_summaries.first_name,
                                'last_name', user_summaries.last_name,
                                'distinct_values', user_summaries.distinct_values
                            )
                            ORDER BY user_summaries.created_at DESC
                        ), 
                        '[]'::jsonb
                    )
                ) AS result FROM user_summaries`;
            const recommendationFeedbackFeedback: any = await this.userModel?.sequelize?.query(
                executeRecommendationFeedbackQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                }
            );

            return {
                success: true,
                data: {
                    feedback: feedback[0].result,
                    otherFeedback: otherFeedback[0].result,
                    recommendations: recommendationFeedbackFeedback[0].result
                },
                message: 'Analytics tab 7 data fetched successfully'
            };
        } catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }

    async importUsersFromCsv(file: Express.Multer.File, body: any): Promise<any> {
        try {
            // ✅ Step 1: Validate file
            if (!file) {
                throw new BadRequestException('No file provided');
            }

            console.log('📄 Uploaded File:', {
                name: file.originalname,
                mimetype: file.mimetype,
                size: file.size,
            });
            console.log('📩 Received Body:', JSON.stringify(body, null, 2));

            // ✅ Step 2: Read workbook from buffer
            const workbook = XLSX.read(file.buffer, { type: 'buffer' });

            // ✅ Step 3: Get the first sheet
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            // ✅ Step 4: Convert sheet to JSON
            const data = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

            if (!data.length) {
                throw new BadRequestException('Spreadsheet contains no data');
            }

            // ✅ Step 5: Validate required columns
            const requiredKeys = ['firstName', 'lastName', 'email'];
            const headers = Object.keys(data[0] || {}).map(h => h.trim());

            const missingKeys = requiredKeys.filter(key => !headers.includes(key));
            if (missingKeys.length > 0) {
                throw new BadRequestException(
                    `Missing required columns: ${missingKeys.join(', ')}`
                );
            }

            // ✅ Step 6: Log parsed content
            console.log('✅ Parsed Spreadsheet Data:', JSON.stringify(data, null, 2));

            for (let i = 0; i < data.length; i++) {
                const element: any = data[i];

                // Validate email exists
                if (!element.email || element.email.trim() === '') {
                    console.log(`Skipping row ${i + 1}: No email provided`);
                    continue;
                }

                const email = element.email.trim().toLowerCase();

                // Check if user already exists
                let checkUserQuery = `SELECT id, email FROM auth.users WHERE email = :email`;
                const checkUser: any = await this.userModel?.sequelize?.query(checkUserQuery, {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { email: email }
                });

                if (checkUser.length > 0) {
                    console.log(`User ${email} already exists, skipping creation`);
                    continue;
                }

                console.log(`User ${email} does not exist, creating new user`);

                try {
                    const newUser = await this.createNewUser(element);
                    console.log(newUser, "---newUser---");
                    if (newUser.success) {
                        console.log(`User ${email} created successfully`);

                        // let metadataCreateQuery = `INSERT INTO public.metadata (user_id, first_name, last_name, user_type, pro_day, cycle, gift, updated_at) 
                        //     VALUES (:userId, :first_name, :last_name, :user_type, :pro_day, :cycle, :gift, :updatedAt)`;
                        // const metadataCreate: any = await this.userModel?.sequelize?.query(metadataCreateQuery, {
                        //     type: QueryTypes.INSERT,
                        //     raw: true,
                        //     replacements: {
                        //         userId: newUser.data.id,
                        //         first_name: element.firstName,
                        //         last_name: element.lastName,
                        //         user_type: body.userType,
                        //         pro_day: 0,
                        //         cycle: 0,
                        //         gift: body.isGift === 'true' ? true : false,
                        //         updated_at: new Date()
                        //     }
                        // });
                    }
                } catch (userError) {
                    console.error(`Failed to create user ${email}:`, userError.message);
                    // Continue with next user instead of stopping the entire process
                    continue;
                }
            }

            // ✅ Step 7: Return structured response
            return {
                success: true,
                message: 'Spreadsheet converted to JSON successfully',
                fileName: file.originalname,
                body,
                headers,
                totalRows: data.length,
                data,
                jsonString: JSON.stringify(data, null, 2),
            };
        } catch (error: any) {
            console.error('❌ Error while parsing file:', error);
            throw new BadRequestException(error.message || 'Failed to process spreadsheet file');
        }
    }


    async fetchAdminCsvData(userIds: string[]): Promise<any> {
        try {

            if (userIds && userIds.length === 0) {
                return { success: true, data: { personalInfoData: [], onboardingData: [], mentalScreener: [] }, message: 'No users found' };
            }

            const getQuestionInfoValue = (quesSlug: string, ansValue: string, mainDataObj: any) => {
                if (quesSlug === 'personal-08-anthro-height') { return ansValue; }
                if (quesSlug === 'personal-08-anthro-weight') { return ansValue; }
                if (quesSlug === 'personal-09-anthro-weight-high') { return ansValue; }
                if (quesSlug === 'personal-10-anthro-weight-low') { return ansValue; }
                if (quesSlug === 'personal-01-demo-age') { return ansValue; }
                if (quesSlug === 'personal-02-demo-gender') { return ansValue; }
                if (quesSlug === 'personal-03-demo-ethnicity') { return ansValue; }
                if (quesSlug === 'reassess-03-personal-16-health-sleep-hours') { return ansValue }
                if (quesSlug === 'reassess-03-personal-13-health-body') { return ansValue }
                if (quesSlug === 'reassess-03-personal-12-health-food') { return ansValue }
                if (quesSlug === 'reassess-03-personal-08-anthro-weight') { return ansValue }

                if (quesSlug === 'onboarding-practitioner-type' || quesSlug === 'onboarding-practitioner-use') { return ansValue; }

                let obj = mainDataObj[0].questionInfoObj.find((item: any) => item.quesSlug === quesSlug);
                if (obj && ansValue && obj.quesData.render && obj.quesData.render.length > 0) {
                    return obj.quesData.render[parseInt(ansValue)];
                }
                return '';
            }

            let finalResponse: any[] = [];
            for (let i = 0; i < userIds.length; i++) {
                let finalResp02 = {
                    "UserId": "",
                    "UserType": "",
                    "Prac_Type": "",
                    "Prac_Use": "",
                    "Perc_Day_Food": "",
                    "Diets_Life": "",
                    "Perc_Day_Body": "",
                    "BI_Anx": "",
                    "Comf_Cook": "",
                    "Comf_Med": "",
                    "Hrs_Sleep": "",
                    "Sleep_Qual": "",
                    "Age": "",
                    "Gender": "",
                    "Race_Eth": "",
                    "Highest_Edu": "",
                    "Parental_Edu": "",
                    "Cont": "",
                    "Height": "",
                    "Weight": "",
                    "High_Ad_Wt": "",
                    "Low_Ad_Wt": "",
                    "Weigh_Often": "",
                    "FoodLog_Count": "",
                    "Review_Count": "",
                    "Avg_Logs_Day": "",
                    "Avg_Freq_F": "",
                    "Avg_Freq_V": "",
                    "Avg_Freq_G": "",
                    "Avg_Freq_D": "",
                    "Avg_Freq_P": "",
                    "Avg_Freq_BNS": "",
                    "ADHDA_1": "",
                    "ADHDA_TOT": "",
                    "ACE_TOT": "",
                    "Ad_FoodLog": "",
                    "Ad_NightlyRev": "",
                    "Weight_Post1": "",
                    "Weigh_Often_Post1": "",
                    "Perc_Day_Food_Post1": "",
                    "Perc_Day_Body_Post1": "",
                    "Comf_Cook_Post1": "",
                    "Comf_Med_Post1": "",
                    "Hrs_Sleep_Post1": "",
                    "Sleep_Qual_Post1": "",
                    "Weight_Post2": "",
                    "Weigh_Often_Post2": "",
                    "Perc_Day_Food_Post2": "",
                    "Perc_Day_Body_Post2": "",
                    "Comf_Cook_Post2": "",
                    "Comf_Med_Post2": "",
                    "Hrs_Sleep_Post2": "",
                    "Sleep_Qual_Post2": "",
                    "ADHDA_1_Post1": "",
                    "ADHDA_TOT_Post1": "",
                };
                const userId = userIds[i];
                finalResp02.UserId = userId;

                const userData: any = await this.userModel?.sequelize?.query(`SELECT user_type from public.metadata where user_id = :userId`,
                    { type: QueryTypes.SELECT, raw: true, replacements: { userId: userId } }
                );
                finalResp02.UserType = userData[0].user_type || '';

                // Cycle-0 Data
                let commonSlug = ['intake-03-anxiety-09-extra', 'intake-03-anxiety-09-extra', 'intake-08-ed-13-extra', 'onboarding-goals-why-here', 'onboarding-goals-why-now', 'onboarding-practitioner-type', 'onboarding-practitioner-use', 'personal-01-demo-age', 'personal-02-demo-gender', 'personal-03-demo-ethnicity', 'personal-04-demo-edu', 'personal-05-demo-par-edu', 'personal-06-demo-continent', 'personal-08-anthro-height', 'personal-08-anthro-weight', 'personal-09-anthro-weight-high', 'personal-10-anthro-weight-low', 'personal-11-anthro-weight-freq', 'personal-12-health-food', 'personal-13-health-body', 'personal-14-health-cooking', 'personal-15-health-meditation', 'personal-16-health-sleep-hours', 'personal-17-health-sleep-qual'];
                let initialInfoDataQuery = `Select jsonb_agg(jsonb_build_object('quesContent', "Q"."content", 'quesData', "Q"."data", 'quesSlug', "A"."question_slug", 'ansValue', "A"."values", 'uid', "A"."uid", 'userId', "A"."user_id")) as "questionInfoObj"
                    FROM public.answers AS "A"
                    LEFT JOIN public.questions AS "Q" ON "Q"."slug" = "A"."question_slug"
                    WHERE "A"."user_id" = :userId AND "A"."question_slug" in (:commonSlug) AND "A"."uid" = :uid
                    GROUP BY "A"."user_id"`;
                const initialInfoData: any = await this.userModel?.sequelize?.query(initialInfoDataQuery,
                    { type: QueryTypes.SELECT, raw: true, replacements: { userId: userId, commonSlug: commonSlug, uid: 'cycle-0' } }
                );

                finalResp02.Parental_Edu = getQuestionInfoValue('personal-05-demo-par-edu', initialInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'personal-05-demo-par-edu')?.ansValue, initialInfoData) || '';
                finalResp02.Cont = getQuestionInfoValue('personal-06-demo-continent', initialInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'personal-06-demo-continent')?.ansValue, initialInfoData) || '';
                finalResp02.Age = getQuestionInfoValue('personal-01-demo-age', initialInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'personal-01-demo-age')?.ansValue, initialInfoData) || '';
                finalResp02.Gender = getQuestionInfoValue('personal-02-demo-gender', initialInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'personal-02-demo-gender')?.ansValue, initialInfoData) || '';
                finalResp02.Race_Eth = getQuestionInfoValue('personal-03-demo-ethnicity', initialInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'personal-03-demo-ethnicity')?.ansValue, initialInfoData) || '';
                finalResp02.Highest_Edu = getQuestionInfoValue('personal-04-demo-edu', initialInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'personal-04-demo-edu')?.ansValue, initialInfoData) || '';
                finalResp02.Height = getQuestionInfoValue('personal-08-anthro-height', initialInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'personal-08-anthro-height')?.ansValue, initialInfoData) || '';
                finalResp02.Weight = getQuestionInfoValue('personal-08-anthro-weight', initialInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'personal-08-anthro-weight')?.ansValue, initialInfoData) || '';
                finalResp02.High_Ad_Wt = getQuestionInfoValue('personal-09-anthro-weight-high', initialInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'personal-09-anthro-weight-high')?.ansValue, initialInfoData) || '';
                finalResp02.Low_Ad_Wt = getQuestionInfoValue('personal-10-anthro-weight-low', initialInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'personal-10-anthro-weight-low')?.ansValue, initialInfoData) || '';
                finalResp02.Weigh_Often = getQuestionInfoValue('personal-11-anthro-weight-freq', initialInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'personal-11-anthro-weight-freq')?.ansValue, initialInfoData) || '';

                finalResp02.Prac_Type = getQuestionInfoValue('onboarding-practitioner-type', initialInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'onboarding-practitioner-type')?.ansValue, initialInfoData) || '';
                finalResp02.Prac_Use = getQuestionInfoValue('onboarding-practitioner-use', initialInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'onboarding-practitioner-use')?.ansValue, initialInfoData) || '';
                finalResp02.Perc_Day_Food = getQuestionInfoValue('personal-12-health-food', initialInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'personal-12-health-food')?.ansValue, initialInfoData) || '';
                finalResp02.Diets_Life = getQuestionInfoValue('personal-14-health-cooking', initialInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'personal-14-health-cooking')?.ansValue, initialInfoData) || '';
                finalResp02.Perc_Day_Body = getQuestionInfoValue('personal-13-health-body', initialInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'personal-13-health-body')?.ansValue, initialInfoData) || '';
                finalResp02.BI_Anx = getQuestionInfoValue('intake-03-anxiety-09-extra', initialInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'intake-03-anxiety-09-extra')?.ansValue, initialInfoData) || '';
                finalResp02.Comf_Cook = getQuestionInfoValue('personal-14-health-cooking', initialInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'personal-14-health-cooking')?.ansValue, initialInfoData) || '';
                finalResp02.Comf_Med = getQuestionInfoValue('personal-15-health-meditation', initialInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'personal-15-health-meditation')?.ansValue, initialInfoData) || '';
                finalResp02.Hrs_Sleep = getQuestionInfoValue('personal-16-health-sleep-hours', initialInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'personal-16-health-sleep-hours')?.ansValue, initialInfoData) || '';
                finalResp02.Sleep_Qual = getQuestionInfoValue('personal-17-health-sleep-qual', initialInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'personal-17-health-sleep-qual')?.ansValue, initialInfoData) || '';

                // Cycle-1 & 2 Data
                let commonSlugReassess = ['reassess-03-personal-08-anthro-weight', 'reassess-03-personal-11-anthro-weight-freq', 'reassess-03-personal-12-health-food', 'reassess-03-personal-13-health-body', 'reassess-03-personal-14-health-cooking', 'reassess-03-personal-15-health-meditation', 'reassess-03-personal-16-health-sleep-hours', 'reassess-03-personal-17-health-sleep-qual'];
                for (let ind = 1; ind < 3; ind++) {
                    let reassessInfoDataQuery = `Select jsonb_agg(jsonb_build_object('quesContent', "Q"."content", 'quesData', "Q"."data", 'quesSlug', "A"."question_slug", 'ansValue', "A"."values", 'uid', "A"."uid", 'userId', "A"."user_id")) as "questionInfoObj"
                        FROM public.answers AS "A"
                        LEFT JOIN public.questions AS "Q" ON "Q"."slug" = "A"."question_slug"
                        WHERE "A"."user_id" = :userId AND "A"."question_slug" in (:commonSlug) AND "A"."uid" = :uid
                        GROUP BY "A"."user_id"`;
                    const reassessInfoData: any = await this.userModel?.sequelize?.query(reassessInfoDataQuery,
                        { type: QueryTypes.SELECT, raw: true, replacements: { userId: userId, commonSlug: commonSlugReassess, uid: `cycle-${ind}` } }
                    );
                    if (ind === 1) {
                        finalResp02.Weight_Post1 = reassessInfoData.length > 0 && reassessInfoData[0]?.questionInfoObj ? getQuestionInfoValue('reassess-03-personal-08-anthro-weight', reassessInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'reassess-03-personal-08-anthro-weight')?.ansValue, reassessInfoData) : '';
                        finalResp02.Weigh_Often_Post1 = reassessInfoData.length > 0 && reassessInfoData[0]?.questionInfoObj ? getQuestionInfoValue('reassess-03-personal-11-anthro-weight-freq', reassessInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'reassess-03-personal-11-anthro-weight-freq')?.ansValue, reassessInfoData) : '';
                        finalResp02.Perc_Day_Food_Post1 = reassessInfoData.length > 0 && reassessInfoData[0]?.questionInfoObj ? getQuestionInfoValue('reassess-03-personal-12-health-food', reassessInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'reassess-03-personal-12-health-food')?.ansValue, reassessInfoData) : '';
                        finalResp02.Perc_Day_Body_Post1 = reassessInfoData.length > 0 && reassessInfoData[0]?.questionInfoObj ? getQuestionInfoValue('reassess-03-personal-13-health-body', reassessInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'reassess-03-personal-13-health-body')?.ansValue, reassessInfoData) : '';
                        finalResp02.Comf_Cook_Post1 = reassessInfoData.length > 0 && reassessInfoData[0]?.questionInfoObj ? getQuestionInfoValue('reassess-03-personal-14-health-cooking', reassessInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'reassess-03-personal-14-health-cooking')?.ansValue, reassessInfoData) : '';
                        finalResp02.Comf_Med_Post1 = reassessInfoData.length > 0 && reassessInfoData[0]?.questionInfoObj ? getQuestionInfoValue('reassess-03-personal-15-health-meditation', reassessInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'reassess-03-personal-15-health-meditation')?.ansValue, reassessInfoData) : '';
                        finalResp02.Hrs_Sleep_Post1 = reassessInfoData.length > 0 && reassessInfoData[0]?.questionInfoObj ? getQuestionInfoValue('reassess-03-personal-16-health-sleep-hours', reassessInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'reassess-03-personal-16-health-sleep-hours')?.ansValue, reassessInfoData) : '';
                        finalResp02.Sleep_Qual_Post1 = reassessInfoData.length > 0 && reassessInfoData[0]?.questionInfoObj ? getQuestionInfoValue('reassess-03-personal-17-health-sleep-qual', reassessInfoData[0].questionInfoObj.find((item: any) => item.quesSlug === 'reassess-03-personal-17-health-sleep-qual')?.ansValue, reassessInfoData) : '';
                    }
                    if (ind === 2) {
                        finalResp02.Weight_Post2 = reassessInfoData.length > 0 && reassessInfoData[1]?.questionInfoObj ? getQuestionInfoValue('reassess-03-personal-08-anthro-weight', reassessInfoData[1].questionInfoObj.find((item: any) => item.quesSlug === 'reassess-03-personal-08-anthro-weight')?.ansValue, reassessInfoData) : '';
                        finalResp02.Weigh_Often_Post2 = reassessInfoData.length > 0 && reassessInfoData[1]?.questionInfoObj ? getQuestionInfoValue('reassess-03-personal-11-anthro-weight-freq', reassessInfoData[1].questionInfoObj.find((item: any) => item.quesSlug === 'reassess-03-personal-11-anthro-weight-freq')?.ansValue, reassessInfoData) : '';
                        finalResp02.Perc_Day_Food_Post2 = reassessInfoData.length > 0 && reassessInfoData[1]?.questionInfoObj ? getQuestionInfoValue('reassess-03-personal-12-health-food', reassessInfoData[1].questionInfoObj.find((item: any) => item.quesSlug === 'reassess-03-personal-12-health-food')?.ansValue, reassessInfoData) : '';
                        finalResp02.Perc_Day_Body_Post2 = reassessInfoData.length > 0 && reassessInfoData[1]?.questionInfoObj ? getQuestionInfoValue('reassess-03-personal-13-health-body', reassessInfoData[1].questionInfoObj.find((item: any) => item.quesSlug === 'reassess-03-personal-13-health-body')?.ansValue, reassessInfoData) : '';
                        finalResp02.Comf_Cook_Post2 = reassessInfoData.length > 0 && reassessInfoData[1]?.questionInfoObj ? getQuestionInfoValue('reassess-03-personal-14-health-cooking', reassessInfoData[1].questionInfoObj.find((item: any) => item.quesSlug === 'reassess-03-personal-14-health-cooking')?.ansValue, reassessInfoData) : '';
                        finalResp02.Comf_Med_Post2 = reassessInfoData.length > 0 && reassessInfoData[1]?.questionInfoObj ? getQuestionInfoValue('reassess-03-personal-15-health-meditation', reassessInfoData[1].questionInfoObj.find((item: any) => item.quesSlug === 'reassess-03-personal-15-health-meditation')?.ansValue, reassessInfoData) : '';
                        finalResp02.Hrs_Sleep_Post2 = reassessInfoData.length > 0 && reassessInfoData[1]?.questionInfoObj ? getQuestionInfoValue('reassess-03-personal-16-health-sleep-hours', reassessInfoData[1].questionInfoObj.find((item: any) => item.quesSlug === 'reassess-03-personal-16-health-sleep-hours')?.ansValue, reassessInfoData) : '';
                        finalResp02.Sleep_Qual_Post2 = reassessInfoData.length > 0 && reassessInfoData[1]?.questionInfoObj ? getQuestionInfoValue('reassess-03-personal-17-health-sleep-qual', reassessInfoData[1].questionInfoObj.find((item: any) => item.quesSlug === 'reassess-03-personal-17-health-sleep-qual')?.ansValue, reassessInfoData) : '';
                    }
                }

                let foodLogsDataResponse = await this.fetchUserFoodLogs({ id: userId, startDate: '', endDate: '' });

                finalResp02.FoodLog_Count = foodLogsDataResponse.data.count || 0;
                finalResp02.Review_Count = foodLogsDataResponse.data.totalReviewCount || 0;
                finalResp02.Avg_Logs_Day = foodLogsDataResponse.data.avgFoodLogCountPerDay || 0;
                finalResp02.Avg_Freq_F = foodLogsDataResponse.data.averageFoodLogsPerDay['Fruit (F)'] || 0;
                finalResp02.Avg_Freq_V = foodLogsDataResponse.data.averageFoodLogsPerDay['Vegetable (V)'] || 0;
                finalResp02.Avg_Freq_G = foodLogsDataResponse.data.averageFoodLogsPerDay['Grain (G)'] || 0;
                finalResp02.Avg_Freq_D = foodLogsDataResponse.data.averageFoodLogsPerDay['Dairy (D)'] || 0;
                finalResp02.Avg_Freq_P = foodLogsDataResponse.data.averageFoodLogsPerDay['Protein (P)'] || 0;
                finalResp02.Avg_Freq_BNS = foodLogsDataResponse.data.averageFoodLogsPerDay['Beans/Nuts/Seeds (BNS)'] || 0;

                let mentalIntakeSlugs = ['intake-01-adhd-a-01', 'intake-01-adhd-a-02', 'intake-01-adhd-a-03', 'intake-01-adhd-a-04', 'intake-01-adhd-a-05', 'intake-01-adhd-a-06', 'intake-01-adhd-a-07', 'intake-01-adhd-a-08', 'intake-01-adhd-a-09',
                    'intake-02-adhd-b-10', 'intake-02-adhd-b-11', 'intake-02-adhd-b-12', 'intake-02-adhd-b-13', 'intake-02-adhd-b-14', 'intake-02-adhd-b-15', 'intake-02-adhd-b-16', 'intake-02-adhd-b-17', 'intake-02-adhd-b-18',
                    'intake-03-anxiety-00', 'intake-03-anxiety-01', 'intake-03-anxiety-02', 'intake-03-anxiety-03', 'intake-03-anxiety-04', 'intake-03-anxiety-05', 'intake-03-anxiety-06', 'intake-03-anxiety-07', 'intake-03-anxiety-08', 'intake-03-anxiety-09',
                    'intake-04-depression-00', 'intake-04-depression-01', 'intake-04-depression-02', 'intake-04-depression-03', 'intake-04-depression-04', 'intake-04-depression-05', 'intake-04-depression-06', 'intake-04-depression-07', 'intake-04-depression-08', 'intake-04-depression-09', 'intake-04-depression-10-mod',
                    'intake-05-ptsd-00', 'intake-05-ptsd-01', 'intake-05-ptsd-02', 'intake-05-ptsd-03', 'intake-05-ptsd-04', 'intake-05-ptsd-05', 'intake-05-ptsd-06', 'intake-05-ptsd-07', 'intake-05-ptsd-08', 'intake-05-ptsd-09', 'intake-05-ptsd-10', 'intake-05-ptsd-11', 'intake-05-ptsd-12', 'intake-05-ptsd-13', 'intake-05-ptsd-14', 'intake-05-ptsd-15', 'intake-05-ptsd-16', 'intake-05-ptsd-17', 'intake-05-ptsd-18', 'intake-05-ptsd-19',
                    'intake-06-sud-00', 'intake-06-sud-01', 'intake-06-sud-02', 'intake-06-sud-03', 'intake-06-sud-04', 'intake-06-sud-05', 'intake-06-sud-06',
                    'intake-07-fa-00', 'intake-07-fa-01', 'intake-07-fa-02', 'intake-07-fa-03', 'intake-07-fa-04', 'intake-07-fa-05', 'intake-07-fa-06', 'intake-07-fa-07', 'intake-07-fa-08', 'intake-07-fa-09', 'intake-07-fa-10', 'intake-07-fa-11', 'intake-07-fa-12', 'intake-07-fa-13',
                    'intake-08-ed-00', 'intake-08-ed-01', 'intake-08-ed-02', 'intake-08-ed-03', 'intake-08-ed-04', 'intake-08-ed-05', 'intake-08-ed-06', 'intake-08-ed-07', 'intake-08-ed-08', 'intake-08-ed-09', 'intake-08-ed-10', 'intake-08-ed-10-next', 'intake-08-ed-11', 'intake-08-ed-12', 'intake-08-ed-13-extra',
                    'intake-09-resilience-00', 'intake-09-resilience-01', 'intake-09-resilience-02', 'intake-09-resilience-03', 'intake-09-resilience-04', 'intake-09-resilience-05', 'intake-09-resilience-06',
                    'intake-10-social-support-00', 'intake-10-social-support-01', 'intake-10-social-support-02', 'intake-10-social-support-03', 'intake-10-social-support-04', 'intake-10-social-support-05', 'intake-10-social-support-06', 'intake-10-social-support-07', 'intake-10-social-support-08', 'intake-10-social-support-09', 'intake-10-social-support-10', 'intake-10-social-support-11', 'intake-10-social-support-12',
                    'intake-11-ace-00', 'intake-11-ace-01', 'intake-11-ace-02', 'intake-11-ace-03', 'intake-11-ace-04', 'intake-11-ace-05', 'intake-11-ace-06', 'intake-11-ace-07', 'intake-11-ace-08', 'intake-11-ace-09', 'intake-11-ace-10',
                    'intake-12-ace-exp-00', 'intake-12-ace-exp-01', 'intake-12-ace-exp-02', 'intake-12-ace-exp-03', 'intake-12-ace-exp-04', 'intake-12-ace-exp-05', 'intake-12-ace-exp-06', 'intake-12-ace-exp-07', 'intake-12-ace-exp-08', 'intake-12-ace-exp-09', 'intake-12-ace-exp-10-mod'];
                let initialMentalDataQuery = `Select jsonb_agg(jsonb_build_object('quesContent', "Q"."content", 'quesData', "Q"."data", 'quesSlug', "A"."question_slug", 'ansValue', "A"."values", 'uid', "A"."uid", 'userId', "A"."user_id")) as "questionInfoObj"
                    FROM public.answers AS "A"
                    LEFT JOIN public.questions AS "Q" ON "Q"."slug" = "A"."question_slug"
                    WHERE "A"."user_id" = :userId AND "A"."question_slug" in (:commonSlug) AND "A"."uid" = 'cycle-0'
                    GROUP BY "A"."user_id"`;
                const initialMentalInfoData: any = await this.userModel?.sequelize?.query(initialMentalDataQuery,
                    { type: QueryTypes.SELECT, raw: true, replacements: { userId: userId, commonSlug: mentalIntakeSlugs } }
                );

                const resp01: any = {}
                if (initialMentalInfoData.length > 0) {
                    initialMentalInfoData[0]?.questionInfoObj?.map((dt: any) => {
                        resp01[dt.quesSlug] = dt.quesData.render && dt.quesData.render.length > 0 ? dt.quesData.render[parseInt(dt.ansValue)] : dt.ansValue
                    })
                }

                finalResp02 = { ...finalResp02, ...resp01 };

                let mentalIntakeReassessSlugs = ['reassess-01-feedback-00', 'reassess-01-feedback-01-app', 'reassess-01-feedback-02-food-log', 'reassess-01-feedback-03-nightly-review', 'reassess-01-feedback-04-intake', 'reassess-01-feedback-05-education', 'reassess-01-feedback-06-videos', 'reassess-01-feedback-07-assignments', 'reassess-01-feedback-08-gems', 'reassess-01-feedback-09-links', 'reassess-01-feedback-10-recipes', 'reassess-01-feedback-11-other', 'reassess-01-feedback-12-science', 'reassess-01-feedback-13-spirituality', 'reassess-01-feedback-14-david-wiss', 'reassess-01-feedback-15-other-feedback', 'reassess-01-feedback-16-recommendations',
                    'reassess-02-adherence-01-food-log', 'reassess-02-adherence-02-food-log', 'reassess-02-adherence-03-videos', 'reassess-02-adherence-04-assignments', 'reassess-02-adherence-05-gems', 'reassess-02-adherence-06-links', 'reassess-02-adherence-07-recipes', 'reassess-02-adherence-08-cooking', 'reassess-02-adherence-09-meditation', 'reassess-02-adherence-10-guiding-principles',
                    'reassess-03-personal-00', 'reassess-03-personal-08-anthro-weight', 'reassess-03-personal-11-anthro-weight-freq', 'reassess-03-personal-12-health-food', 'reassess-03-personal-13-health-body', 'reassess-03-personal-14-health-cooking', 'reassess-03-personal-15-health-meditation', 'reassess-03-personal-16-health-sleep-hours', 'reassess-03-personal-17-health-sleep-qual',
                    'reassess-04-adhd-a', 'reassess-04-adhd-a-01', 'reassess-04-adhd-a-02', 'reassess-04-adhd-a-03', 'reassess-04-adhd-a-04', 'reassess-04-adhd-a-05', 'reassess-04-adhd-a-06', 'reassess-04-adhd-a-07', 'reassess-04-adhd-a-08', 'reassess-04-adhd-a-09',
                    'reassess-05-adhd-b', 'reassess-05-adhd-b-10', 'reassess-05-adhd-b-11', 'reassess-05-adhd-b-12', 'reassess-05-adhd-b-13', 'reassess-05-adhd-b-14', 'reassess-05-adhd-b-15', 'reassess-05-adhd-b-16', 'reassess-05-adhd-b-17', 'reassess-05-adhd-b-18',
                    'reassess-06-anxiety-00', 'reassess-06-anxiety-01', 'reassess-06-anxiety-02', 'reassess-06-anxiety-03', 'reassess-06-anxiety-04', 'reassess-06-anxiety-05', 'reassess-06-anxiety-06', 'reassess-06-anxiety-07', 'reassess-06-anxiety-08-mod', 'reassess-06-anxiety-09-extra',
                    'reassess-07-depression-00', 'reassess-07-depression-01', 'reassess-07-depression-02', 'reassess-07-depression-03', 'reassess-07-depression-04', 'reassess-07-depression-05', 'reassess-07-depression-06', 'reassess-07-depression-07', 'reassess-07-depression-08', 'reassess-07-depression-09', 'reassess-07-depression-10-mod',
                    'reassess-08-ptsd-00', 'reassess-08-ptsd-01', 'reassess-08-ptsd-02', 'reassess-08-ptsd-03', 'reassess-08-ptsd-04', 'reassess-08-ptsd-05', 'reassess-08-ptsd-06', 'reassess-08-ptsd-07', 'reassess-08-ptsd-08', 'reassess-08-ptsd-09', 'reassess-08-ptsd-10', 'reassess-08-ptsd-11', 'reassess-08-ptsd-12', 'reassess-08-ptsd-13', 'reassess-08-ptsd-14', 'reassess-08-ptsd-15', 'reassess-08-ptsd-16', 'reassess-08-ptsd-17', 'reassess-08-ptsd-18', 'reassess-08-ptsd-19', 'reassess-08-ptsd-20',
                    'reassess-09-sud-00', 'reassess-09-sud-01', 'reassess-09-sud-02', 'reassess-09-sud-03', 'reassess-09-sud-04', 'reassess-09-sud-05-extra', 'reassess-09-sud-06',
                    'reassess-10-food-addiction-00', 'reassess-10-food-addiction-01', 'reassess-10-food-addiction-02', 'reassess-10-food-addiction-03', 'reassess-10-food-addiction-04', 'reassess-10-food-addiction-05-cs', 'reassess-10-food-addiction-06-cs', 'reassess-10-food-addiction-07', 'reassess-10-food-addiction-08', 'reassess-10-food-addiction-09', 'reassess-10-food-addiction-10', 'reassess-10-food-addiction-11', 'reassess-10-food-addiction-12', 'reassess-10-food-addiction-13',
                    'reassess-11-ed-00', 'reassess-11-ed-01', 'reassess-11-ed-02', 'reassess-11-ed-03', 'reassess-11-ed-04', 'reassess-11-ed-05', 'reassess-11-ed-06', 'reassess-11-ed-07', 'reassess-11-ed-08', 'reassess-11-ed-09', 'reassess-11-ed-10', 'reassess-11-ed-10-next', 'reassess-11-ed-11', 'reassess-11-ed-12', 'reassess-11-ed-13-extra',
                    'reassess-12-resilience-00', 'reassess-12-resilience-01', 'reassess-12-resilience-02', 'reassess-12-resilience-03', 'reassess-12-resilience-04', 'reassess-12-resilience-05', 'reassess-12-resilience-06',
                    'reassess-13-social-support-00', 'reassess-13-social-support-01', 'reassess-13-social-support-02', 'reassess-13-social-support-03', 'reassess-13-social-support-04', 'reassess-13-social-support-05', 'reassess-13-social-support-06', 'reassess-13-social-support-07', 'reassess-13-social-support-08', 'reassess-13-social-support-09', 'reassess-13-social-support-10', 'reassess-13-social-support-11', 'reassess-13-social-support-12'];

                let reassessMentalDataQuery = `Select jsonb_agg(jsonb_build_object('quesContent', "Q"."content", 'quesData', "Q"."data", 'quesSlug', "A"."question_slug", 'ansValue', "A"."values", 'uid', "A"."uid", 'userId', "A"."user_id")) as "questionInfoObj"
                    FROM public.answers AS "A"
                    LEFT JOIN public.questions AS "Q" ON "Q"."slug" = "A"."question_slug"
                    WHERE "A"."user_id" = :userId AND "A"."question_slug" in (:commonSlug) AND "A"."uid" = :uid
                    GROUP BY "A"."user_id"`;
                for (let i = 1; i < 3; i++) {
                    const reassessMentalInfoData: any = await this.userModel?.sequelize?.query(reassessMentalDataQuery,
                        { type: QueryTypes.SELECT, raw: true, replacements: { userId: userId, uid: 'cycle-' + i, commonSlug: mentalIntakeReassessSlugs } }
                    );
                    const resp02: any = {};
                    if (reassessMentalInfoData.length > 0) {
                        reassessMentalInfoData[0]?.questionInfoObj?.map((dt: any) => {
                            resp02[dt.quesSlug + '-cycle-' + i] = dt.quesData.render && dt.quesData.render.length > 0 ? dt.quesData.render[parseInt(dt.ansValue)] : dt.ansValue
                        })
                    }

                    finalResp02 = { ...finalResp02, ...resp02 };
                }

                finalResponse.push(finalResp02);
            }

            return { success: true, data: finalResponse, message: 'Admin CSV data fetched successfully' };
        } catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }

    async generateUserSummary(userId: string): Promise<any> {
        try {

            // return {
            //     "success": true,
            //     "data": {
            //         "clinicalSummary": "CLINICAL NUTRITION SUMMARY  \nGenerated: 2025-11-20 12:08  \nPeriod: 2025-10-21 to 2025-11-20  \nType: Full Summary  \n\nProgram Engagement  \n- Current Module: 29  \n- Days in Program: 44  \n\nEating Pattern Analysis  \nThe current food logging patterns indicate a lack of recorded meals, with an average of 0.0 food logs per day and no evidence of food group intake across fruits, vegetables, grains, dairy/alternatives, protein/alternatives, and beans/nuts/seeds. This suggests a significant limitation in dietary intake and a potential lack of structured meal timing or frequency. The absence of documented meals may reflect challenges in meal preparation, motivation, or awareness of dietary patterns.\n\nFood Group Distribution shows severe limitations, as no food items from any major food group have been logged, indicating a need for immediate attention to dietary variety and nutrient adequacy.\n\nNew foods introduced: None recorded  \nFood variety trajectory: Stable (at zero variety)\n\nHunger-Satiety Regulation  \n- Episodes of overfullness: Not applicable due to lack of food intake data  \n- Client showing no recorded awareness of hunger or fullness, as no patterns are established.\n\nTherapeutic Insights  \nMost recent intention: None stated  \n\nNightly Review Themes:  \n- Theme 1: Lack of engagement with food logging and meal planning  \n- Theme 2: Absence of feedback or reflections on dietary choices  \n- Theme 3: No recorded emotional or contextual factors related to eating  \n\nClinical Impressions  \nThe client shows a concerning pattern of minimal to no engagement in dietary practices, as evidenced by the absence of food logging and food group consumption. This lack of intake may hinder progress toward therapeutic goals and suggests a need for intervention to support motivation and awareness. Continued monitoring and encouragement are essential to foster engagement and a more varied diet.\n\nRecommendations for Clinical Team  \nConsider: Implementing structured meal planning sessions to enhance engagement  \nConsider: Encouraging the client to start a simple food diary to promote awareness of eating patterns  \nConsider: Exploring potential barriers to food preparation or motivation in future sessions",
            //         "summaryMetadata": {
            //             "generatedDate": "2025-11-20 12:08",
            //             "periodStart": "2025-10-21",
            //             "periodEnd": "2025-11-20",
            //             "userId": "87161e13-2ea3-4fc3-91b7-3aae0d89994e",
            //             "userName": "Sue Gardner",
            //             "userEmail": "sgardner555@outlook.com"
            //         },
            //     },
            //     "message": "User summary generated successfully"
            // }

            const prevUserSummary: any = await this.userModel.sequelize?.query(
                `SELECT * FROM public.user_summary WHERE "user_id" = :userId
                    ORDER BY end_date DESC LIMIT 1`, {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { userId: userId }
                }
            )

            let startDate = '';
            let endDate = '';
            if (prevUserSummary.length == 0) {
                const userResp: any = await this.userModel.sequelize?.query(
                    `SELECT * FROM auth.users WHERE "id" = :userId`, {
                        type: QueryTypes.SELECT,
                        raw: true,
                        replacements: { userId: userId }
                    }
                )
                startDate = userResp[0].created_at;
                endDate = new Date().toISOString();
            } else {
                let tempEndDate : any = new Date(prevUserSummary[0]?.end_date);
                tempEndDate.setDate(tempEndDate.getDate() + 1);
                startDate = await this.formatDateUTC(tempEndDate);
                endDate = await this.formatDateUTC(new Date());
            }

            let userDataResponse = await this.fetchUserDetailsById(userId);
            let foodLogsDataResponse = await this.fetchUserFoodLogs({ id: userId, startDate: startDate, endDate: endDate });
            let reviewsDataResponse = await this.fetchUserFoodLogJournal(userId, null, null);
            let workbookDataResponse = await this.fetchUserWorkbook(userId);

            // Extract data from responses
            const userData = userDataResponse.data;
            const foodLogsData = foodLogsDataResponse.data;
            const reviewsData = reviewsDataResponse.data;
            const workbookData = workbookDataResponse.data;

            // Get user creation date for days in program calculation
            const userCreatedAt = userData?.user?.created_at ? new Date(userData.user.created_at) : new Date();
            const daysInProgram = Math.floor((new Date().getTime() - userCreatedAt.getTime()) / (1000 * 60 * 60 * 24));

            // Module Progress
            const currentModule = workbookData?.module || userData?.metadata?.pro_day || 0;
            const currentCycle = workbookData?.cycle || userData?.metadata?.cycle || 0;

            // Food Logging Patterns
            const consecutiveLogs = foodLogsData?.consecutiveLogs || 0;
            const avgFoodLogsPerDay = parseFloat(foodLogsData?.avgFoodLogCountPerDay) || 0;
            const totalReviewCount = foodLogsData?.totalReviewCount || 0;

            // Average Food Group Frequency
            const avgFoodGroups = foodLogsData?.averageFoodLogsPerDay || {};
            const fruitFreq = parseFloat(avgFoodGroups['Fruit (F)'] || avgFoodGroups['fruit'] || 0);
            const vegetableFreq = parseFloat(avgFoodGroups['Vegetable (V)'] || avgFoodGroups['vegetable'] || 0);
            const grainFreq = parseFloat(avgFoodGroups['Grain (G)'] || avgFoodGroups['grain'] || 0);
            const dairyFreq = parseFloat(avgFoodGroups['Dairy (D)'] || avgFoodGroups['dairy'] || 0);
            const proteinFreq = parseFloat(avgFoodGroups['Protein (P)'] || avgFoodGroups['protein'] || 0);
            const bnsFreq = parseFloat(avgFoodGroups['Beans/Nuts/Seeds (bns)'] || avgFoodGroups['Beans/Nuts/Seeds (BNS)'] || avgFoodGroups['beansNutsSeeds'] || 0);

            // New Foods Introduced (from AI recognition - past week)
            const aiFoodGroups = foodLogsData?.aiConfirmedFoodGroups || {};
            const newFoods: string[] = [];
            Object.values(aiFoodGroups).forEach((group: any) => {
                if (group?.description && Array.isArray(group.description)) {
                    newFoods.push(...group.description.filter((f: string) => f && f.trim()));
                }
            });
            const uniqueNewFoods = Array.from(new Set(newFoods)).slice(0, 10); // Limit to 10 most recent

            // Hunger/Fullness Patterns - Query food logs for hunger/fullness data
            let hungerFullnessData = { ...foodLogsDataResponse.data.hungerFullnessData };

            // Intentions
            const currentIntentions = reviewsData?.intentions || [];
            const activeIntentions = currentIntentions.filter((int: any) => int && !int.completed).map((int: any) => int.text || int).slice(0, 3);

            // Analyze Nightly Review Themes
            const reviews = reviewsData?.reviews || [];
            const reviewThemes = {
                emotionalPatterns: [] as string[],
                recurringChallenges: [] as string[],
                breakthroughMoments: [] as string[],
                insights: [] as string[]
            };

            reviews.forEach((review: any) => {
                const reviewObj = typeof review === 'object' && review.review ? review.review : review;
                const whatWentWell = reviewObj?.whatWentWell || '';
                const whatCouldBeBetter = reviewObj?.whatCouldBeBetter || '';
                const correctiveMeasures = reviewObj?.correctiveMeasures || '';
                const thoughts = reviewObj?.thoughts || '';

                // Extract emotional patterns (keywords: stress, anxious, worried, emotional, feeling)
                const emotionalKeywords = ['stress', 'anxious', 'worried', 'emotional', 'feeling', 'upset', 'frustrated', 'overwhelmed'];
                const allText = `${whatWentWell} ${whatCouldBeBetter} ${thoughts}`.toLowerCase();
                if (emotionalKeywords.some(keyword => allText.includes(keyword))) {
                    const snippet = thoughts || whatCouldBeBetter || whatWentWell;
                    if (snippet && snippet.length > 10 && reviewThemes.emotionalPatterns.length < 3) {
                        reviewThemes.emotionalPatterns.push(snippet.substring(0, 100));
                    }
                }

                // Extract breakthrough moments (positive language in whatWentWell)
                if (whatWentWell && whatWentWell.length > 20) {
                    const positiveKeywords = ['celebrate', 'success', 'proud', 'breakthrough', 'improved', 'better', 'tried', 'new'];
                    if (positiveKeywords.some(keyword => whatWentWell.toLowerCase().includes(keyword))) {
                        if (reviewThemes.breakthroughMoments.length < 3) {
                            reviewThemes.breakthroughMoments.push(whatWentWell.substring(0, 100));
                        }
                    }
                }

                // Extract recurring challenges (patterns in whatCouldBeBetter)
                if (whatCouldBeBetter && whatCouldBeBetter.length > 20) {
                    if (reviewThemes.recurringChallenges.length < 3) {
                        reviewThemes.recurringChallenges.push(whatCouldBeBetter.substring(0, 100));
                    }
                }

                // Extract insights (from thoughts)
                if (thoughts && thoughts.length > 30) {
                    if (reviewThemes.insights.length < 3) {
                        reviewThemes.insights.push(thoughts.substring(0, 150));
                    }
                }
            });

            // Workbook Assignments
            const pinnedGems = workbookData?.pinnedGems || [];
            const gemsCount = Array.isArray(pinnedGems) ? pinnedGems.length : (pinnedGems?.gems?.length || 0);
            const assignmentQuestions = workbookData?.assignmentQuestionsData || [];
            const completedAssignments = assignmentQuestions.filter((aq: any) => 
                aq.questions && aq.questions.some((q: any) => q.answer_id && q.values)
            ).length;

            // Generate Clinical Summary using OpenAI
            const currentDate = new Date();
            const generatedDate = currentDate.toISOString().split('T')[0] + ' ' + 
                currentDate.toTimeString().split(' ')[0].substring(0, 5);

            // Calculate period (last 30 days or since program start)
            const periodStart = new Date(currentDate);
            periodStart.setDate(periodStart.getDate() - 30);
            const periodStartStr = periodStart.toISOString().split('T')[0];
            const periodEndStr = currentDate.toISOString().split('T')[0];

            // Prepare data summary for OpenAI
            const dataSummary = {
                programEngagement: {
                    currentModule: currentModule,
                    moduleName: workbookData?.moduleName || '',
                    daysInProgram: daysInProgram,
                    currentCycle: currentCycle
                },
                eatingPatterns: {
                    avgFoodLogsPerDay: avgFoodLogsPerDay.toFixed(1),
                    consecutiveLogsWithAllGroups: consecutiveLogs,
                    totalReviews: totalReviewCount
                },
                foodGroupFrequency: {
                    fruit: fruitFreq.toFixed(1),
                    vegetable: vegetableFreq.toFixed(1),
                    grain: grainFreq.toFixed(1),
                    dairy: dairyFreq.toFixed(1),
                    protein: proteinFreq.toFixed(1),
                    beansNutsSeeds: bnsFreq.toFixed(1)
                },
                newFoods: uniqueNewFoods.slice(0, 10),
                hungerFullness: hungerFullnessData,
                intentions: activeIntentions,
                reviewThemes: {
                    emotionalPatterns: reviewThemes.emotionalPatterns,
                    recurringChallenges: reviewThemes.recurringChallenges,
                    breakthroughMoments: reviewThemes.breakthroughMoments,
                    insights: reviewThemes.insights
                },
                workbookProgress: {
                    gemsPinned: gemsCount,
                    assignmentsCompleted: completedAssignments
                }
            };

            // Prepare sample reviews for context (last 5 reviews)
            const sampleReviews = reviews.slice(0, 5).map((review: any) => {
                const reviewObj = typeof review === 'object' && review.review ? review.review : review;
                return {
                    date: reviewObj?.review_date || '',
                    whatWentWell: reviewObj?.whatWentWell || '',
                    whatCouldBeBetter: reviewObj?.whatCouldBeBetter || '',
                    correctiveMeasures: reviewObj?.correctiveMeasures || '',
                    thoughts: reviewObj?.thoughts || ''
                };
            });

            // Create comprehensive prompt
            const prompt = `You are a clinical nutritionist generating a professional clinical summary for functional medicine or therapy notes.
                REQUIREMENTS:
                1. Use clinical but accessible language
                2. Be concise - aim for 1 page maximum
                3. Focus on patterns, not individual meals
                4. Highlight clinically relevant changes
                5. Avoid diagnosis or medical advice
                6. Present observations objectively
                7. Flag concerning patterns without alarm

                ANALYSIS PRIORITIES:
                1. Eating behavior patterns (timing, frequency, context)
                2. Hunger/satiety dysregulation
                3. Food variety and restriction patterns
                4. Emotional eating indicators
                5. Progress toward therapeutic goals

                CLIENT DATA:
                Program Engagement:
                - Current Module: ${dataSummary.programEngagement.currentModule}${dataSummary.programEngagement.moduleName ? ' - ' + dataSummary.programEngagement.moduleName : ''}
                - Days in Program: ${dataSummary.programEngagement.daysInProgram}
                - Current Cycle: ${dataSummary.programEngagement.currentCycle}

                Food Logging Patterns:
                - Average food logs per day: ${dataSummary.eatingPatterns.avgFoodLogsPerDay}
                - Consecutive reviews with all food groups: ${dataSummary.eatingPatterns.consecutiveLogsWithAllGroups}
                - Total reviews: ${dataSummary.eatingPatterns.totalReviews}

                Average Food Group Frequency (daily averages):
                - Fruits (F): ${dataSummary.foodGroupFrequency.fruit} times/day
                - Vegetables (V): ${dataSummary.foodGroupFrequency.vegetable} times/day
                - Grains (G): ${dataSummary.foodGroupFrequency.grain} times/day
                - Dairy/Alternatives (D): ${dataSummary.foodGroupFrequency.dairy} times/day
                - Protein/Alternatives (P): ${dataSummary.foodGroupFrequency.protein} times/day
                - Beans/nuts/seeds (BNS): ${dataSummary.foodGroupFrequency.beansNutsSeeds} times/day

                New Foods Introduced: ${dataSummary.newFoods.length > 0 ? dataSummary.newFoods.join(', ') : 'None recorded'}

                Hunger/Fullness Patterns:
                ${dataSummary.hungerFullness.totalMeals > 0 ? `
                - Count of meals with hunger ≤2 (not hungry enough): ${dataSummary.hungerFullness.lowHungerCount}
                - Count of meals with fullness ≥7 (overly full): ${dataSummary.hungerFullness.highFullnessCount}
                - Average pre-meal hunger: ${dataSummary.hungerFullness.avgPreMealHunger.toFixed(1)}/10
                - Average post-meal fullness: ${dataSummary.hungerFullness.avgPostMealFullness.toFixed(1)}/10
                ` : '- Data not available'}

                Current Intentions: ${dataSummary.intentions.length > 0 ? dataSummary.intentions.join('; ') : 'None'}

                Nightly Review Themes (from recent reviews):
                ${dataSummary.reviewThemes.emotionalPatterns.length > 0 ? `- Emotional patterns: ${dataSummary.reviewThemes.emotionalPatterns.join('; ')}\n` : ''}
                ${dataSummary.reviewThemes.recurringChallenges.length > 0 ? `- Recurring challenges: ${dataSummary.reviewThemes.recurringChallenges.join('; ')}\n` : ''}
                ${dataSummary.reviewThemes.breakthroughMoments.length > 0 ? `- Breakthrough moments: ${dataSummary.reviewThemes.breakthroughMoments.join('; ')}\n` : ''}

                Workbook Assignments:
                - Gems saved/pinned: ${dataSummary.workbookProgress.gemsPinned}
                - Assignments completed: ${dataSummary.workbookProgress.assignmentsCompleted}

                Sample Recent Reviews:
                ${JSON.stringify(sampleReviews, null, 2)}

                Generate a clinical summary in the following format (match this structure exactly):

                CLINICAL NUTRITION SUMMARY
                Generated: ${generatedDate}
                Period: ${periodStartStr} to ${periodEndStr}
                Type: Full Summary

                Program Engagement
                - Current Module: [module number] - [module name if available]
                - Days in Program: [days]

                Eating Pattern Analysis
                [Analyze meal timing, frequency, and food group distribution. Be specific about patterns observed.]

                Food Group Distribution shows [describe adequacy/limitations of each group with specific numbers].

                New foods introduced: [list if any]
                Food variety trajectory: [Expanding/Developing/Stable]

                Hunger-Satiety Regulation
                - Episodes of overfullness: [count] times ([context if available])
                - Client showing [observation about hunger/fullness awareness]

                Therapeutic Insights
                Most recent intention: "[intention text]"

                Nightly Review Themes:
                - [Theme 1 with specific example]
                - [Theme 2 with specific example]
                - [Theme 3 with specific example]

                Clinical Impressions
                [2-3 sentences summarizing key observations about client progress, patterns, and areas needing attention. Be objective and clinical.]

                Recommendations for Clinical Team
                Consider: [specific recommendation 1]
                Consider: [specific recommendation 2]
                Consider: [specific recommendation 3]

                Generate the summary now:`;
                console.log(prompt, "---prompt---3296");

                            // Initialize OpenAI client
            const openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY,
            });
            let clinicalSummary = '';
            try {
                // Call OpenAI API
                const completion = await openai.chat.completions.create({
                    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a clinical nutritionist writing professional clinical summaries for functional medicine practitioners and therapists. Your summaries are objective, evidence-based, and focus on patterns and observations rather than diagnoses.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 2000,
                });

                clinicalSummary = completion.choices[0]?.message?.content || '';

                // If OpenAI fails, fall back to basic summary
                if (!clinicalSummary || clinicalSummary.trim().length === 0) {
                    throw new Error('OpenAI returned empty response');
                }
            } catch (openaiError: any) {
                console.error('OpenAI error:', openaiError);
                // Fallback to basic summary if OpenAI fails
                clinicalSummary = `CLINICAL NUTRITION SUMMARY
                    Generated: ${generatedDate}
                    Period: ${periodStartStr} to ${periodEndStr}
                    Type: Full Summary

                    Program Engagement
                    - Current Module: ${currentModule}${workbookData?.moduleName ? ' - ' + workbookData.moduleName : ''}
                    - Days in Program: ${daysInProgram}

                    Eating Pattern Analysis
                    Client maintains ${avgFoodLogsPerDay.toFixed(1)} food logs per day on average. ${consecutiveLogs > 0 ? `Consecutive reviews with all food groups: ${consecutiveLogs}.` : ''}

                    Food Group Distribution shows ${proteinFreq > 0 ? `adequate protein (${proteinFreq.toFixed(1)} times/day), ` : ''}${grainFreq > 0 ? `grain intake (${grainFreq.toFixed(1)} times/day), ` : ''}${vegetableFreq > 0 ? `vegetable intake (${vegetableFreq.toFixed(1)} times/day), ` : ''}${fruitFreq < 1 ? `limited fruit consumption (${fruitFreq.toFixed(1)} times/day), ` : ''}${bnsFreq < 1 ? `limited beans/nuts/seeds (${bnsFreq.toFixed(1)} times/day), ` : ''}${dairyFreq > 0 ? `moderate dairy intake (${dairyFreq.toFixed(1)} servings/day).` : ''}

                    ${uniqueNewFoods.length > 0 ? `New foods introduced: ${uniqueNewFoods.slice(0, 5).join(', ')}\nFood variety trajectory: ${uniqueNewFoods.length >= 3 ? 'Expanding' : 'Developing'}\n` : ''}

                    Therapeutic Insights
                    ${activeIntentions.length > 0 ? `Most recent intention: "${activeIntentions[0]}"\n` : ''}

                    Clinical Impressions
                    Client demonstrates ${reviewThemes.emotionalPatterns.length > 0 ? 'increasing awareness of emotional eating triggers. ' : ''}${uniqueNewFoods.length >= 3 ? 'Positive expansion in food variety suggests reduced food anxiety. ' : ''}${consecutiveLogs > 0 ? 'Consistent food logging indicates good program engagement.' : ''}

                    Recommendations for Clinical Team
                    ${reviewThemes.emotionalPatterns.length > 0 ? 'Consider: Exploring stress coping strategies beyond food\n' : ''}${reviewThemes.breakthroughMoments.length > 0 ? 'Consider: Reinforcing success with food variety expansion\n' : ''}${fruitFreq < 1 ? 'Consider: Supporting gradual fruit intake increase' : 'Continue monitoring progress and support client goals'}`;
            }

            await this.userModel.sequelize?.query(
                `UPDATE public.user_summary SET start_date = :startDate, end_date = :endDate WHERE user_id = :userId`,
                {
                    type: QueryTypes.UPDATE, raw: true,
                    replacements: { startDate, endDate, userId }
                }
            )

            return {
                success: true,
                data: {
                    clinicalSummary: clinicalSummary,
                    summaryMetadata: {
                        generatedDate: generatedDate,
                        periodStart: periodStartStr,
                        periodEnd: periodEndStr,
                        userId: userId,
                        userName: userData?.metadata?.first_name && userData?.metadata?.last_name 
                            ? `${userData.metadata.first_name} ${userData.metadata.last_name}` 
                            : userData?.user?.email || 'Unknown',
                        userEmail: userData?.user?.email || ''
                    },
                    metrics: {
                        programEngagement: {
                            currentModule: currentModule,
                            moduleName: workbookData?.moduleName || '',
                            daysInProgram: daysInProgram,
                            currentCycle: currentCycle
                        },
                        eatingPatterns: {
                            avgFoodLogsPerDay: avgFoodLogsPerDay,
                            consecutiveLogs: consecutiveLogs,
                            totalReviews: totalReviewCount
                        },
                        foodGroupFrequency: {
                            fruit: fruitFreq,
                            vegetable: vegetableFreq,
                            grain: grainFreq,
                            dairy: dairyFreq,
                            protein: proteinFreq,
                            beansNutsSeeds: bnsFreq
                        },
                        newFoods: uniqueNewFoods,
                        hungerFullness: hungerFullnessData,
                        intentions: activeIntentions,
                        reviewThemes: reviewThemes,
                        workbookProgress: {
                            gemsPinned: gemsCount,
                            assignmentsCompleted: completedAssignments
                        }
                    },
                    rawData: {
                        userData: userData,
                        foodLogsData: foodLogsData,
                        reviewsData: reviewsData,
                        workbookData: workbookData
                    }
                },
                message: 'User summary generated successfully'
            };

        } catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }

}
