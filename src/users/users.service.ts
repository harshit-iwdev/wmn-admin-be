import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { User } from '../models';
import { QueryTypes } from 'sequelize';
import { FilterDto, FoodLogsFilterDto, IResponse } from './dto/filter.dto';
import { Resend } from 'resend';
import { group } from 'console';


@Injectable()
export class UsersService {
    constructor(
        @InjectModel(User) private readonly userModel: typeof User,
    ) { }

    async findAll(): Promise<User[]> {
        return this.userModel.findAll();
    }

    async findAllUsersList(userType: string, pageNumber: number, pageSize: number, filters: FilterDto): Promise<IResponse> {
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
                FROM public.user_follows GROUP BY "user_id") AS following ON following.id = U.id
                where U.last_seen IS NOT NULL`;

            let executeCountQuery = `SELECT COUNT(*) as count FROM auth.users as U
                JOIN public.metadata AS M on U.id = M.user_id
                WHERE U.last_seen IS NOT NULL`;
            if (searchTerm) {
                executeDataQuery += ` AND (U.email ILIKE '%${searchTerm}%' OR U.display_name ILIKE '%${searchTerm}%' OR M.first_name ILIKE '%${searchTerm}%' OR M.last_name ILIKE '%${searchTerm}%' OR M.username ILIKE '%${searchTerm}%')`;
                executeCountQuery += ` AND (U.email ILIKE '%${searchTerm}%' OR U.display_name ILIKE '%${searchTerm}%' OR M.first_name ILIKE '%${searchTerm}%' OR M.last_name ILIKE '%${searchTerm}%' OR M.username ILIKE '%${searchTerm}%')`;
            }

            if (userType === 'practitioner') {
                executeDataQuery += ` AND M.user_type = 'practitioner'`;
                executeCountQuery += ` AND M.user_type = 'practitioner'`;
            }


            // if (trial && trial.toString() === 'true') {
            //     executeDataQuery += ` AND M.trial = true`;
            //     executeCountQuery += ` AND M.trial = true`;
            // } else if (trial && trial.toString() === 'false') {
            //     executeDataQuery += ` AND M.trial = false`;
            //     executeCountQuery += ` AND M.trial = false`;
            // }

            if (gift && gift.toString() === 'true') {
                executeDataQuery += ` AND M.gift = true`;
                executeCountQuery += ` AND M.gift = true`;
            } else if (gift && gift.toString() === 'false') {
                executeDataQuery += ` AND M.gift = false`;
                executeCountQuery += ` AND M.gift = false`;
            }

            if (unsubscribed && unsubscribed.toString() === 'true') {
                executeDataQuery += ` AND M.unsubscribed = true`;
                executeCountQuery += ` AND M.unsubscribed = true`;
            } else if (unsubscribed && unsubscribed.toString() === 'false') {
                executeDataQuery += ` AND M.unsubscribed = false`;
                executeCountQuery += ` AND M.unsubscribed = false`;
            }

            if (selectedRole === 'practitioner') {
                executeDataQuery += ` AND M.user_type = 'practitioner'`;
                executeCountQuery += ` AND M.user_type = 'practitioner'`;
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

            executeDataQuery += ` LIMIT :pageSize OFFSET :offset`;

            const users = await this.userModel?.sequelize?.query(
                executeDataQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: {
                        pageSize: pageSize,
                        offset: (pageNumber - 1) * pageSize,
                    },
                }
            );

            const totalCount: any = await this.userModel?.sequelize?.query(executeCountQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                }
            );

            return {
                success: true, data: {
                    rows: users,
                    count: totalCount[0]?.count || 0,
                },
                message: 'Users fetched successfully',
            };
        } catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }

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
                // basicStartDate = new Date(lastArchiveEndDate);
                basicStartDate.setDate(basicStartDate.getDate());
            }
            if (startDate.length === 0 && endDate.length === 0) {
                // startDate = await this.formatDateLocal(lastArchiveEndDate);
                // endDate = await this.formatDateLocal(new Date());

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

            if (reviewIdsArr.length > 0) {
                let executeFoodLogsQuery = `SELECT DATE("FL"."created_at") AS log_date,
                    "RFL"."review_id", "R"."created_at" as "review_created_at", "R"."review_date" as "review_date", jsonb_agg(to_jsonb("FL"."food_groups")) AS "foodLogs",
                    jsonb_agg(to_jsonb("AIFR")) AS "aiFoodRecognition" FROM public.food_logs AS "FL"
                    LEFT JOIN public."ai_food_recognition" AS "AIFR" ON "FL"."ai_food_data_id" = "AIFR"."id"
                    JOIN public."review_food_logs" as "RFL" on "RFL"."food_log_id" = "FL"."id"
                    JOIN public."reviews" as "R" on "RFL"."review_id" = "R"."id"
                        WHERE "FL"."userId" = :id AND "FL"."id" IN (:foodLogsIdsArr)
                            GROUP BY DATE("FL"."created_at"), 
                            "RFL"."review_id", "R"."created_at", "R"."review_date"
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
                            if (item.foodGroup.toLowerCase() === 'fruit') {
                                aiConfirmedFoodGroups.fruit.count++;
                                aiConfirmedFoodGroups.fruit.description = getFlattenedDescription(item.description, aiConfirmedFoodGroups.fruit.description)
                            } else if (item.foodGroup.toLowerCase() === 'vegetable') {
                                aiConfirmedFoodGroups.vegetable.count++;
                                aiConfirmedFoodGroups.vegetable.description = getFlattenedDescription(item.description, aiConfirmedFoodGroups.vegetable.description)
                            } else if (item.foodGroup.toLowerCase() === 'grain') {
                                aiConfirmedFoodGroups.grain.count++;
                                aiConfirmedFoodGroups.grain.description = getFlattenedDescription(item.description, aiConfirmedFoodGroups.grain.description)
                            } else if (item.foodGroup.toLowerCase() === 'dairy') {
                                aiConfirmedFoodGroups.dairy.count++;
                                aiConfirmedFoodGroups.dairy.description = getFlattenedDescription(item.description, aiConfirmedFoodGroups.dairy.description)
                            } else if (item.foodGroup.toLowerCase() === 'protein') {
                                aiConfirmedFoodGroups.protein.count++;
                                aiConfirmedFoodGroups.protein.description = getFlattenedDescription(item.description, aiConfirmedFoodGroups.protein.description)
                            } else if (item.foodGroup.toLowerCase() === 'bns' || item.foodGroup.toLowerCase() === 'beansNutsSeeds') {
                                aiConfirmedFoodGroups.beansNutsSeeds.count++;
                                aiConfirmedFoodGroups.beansNutsSeeds.description = getFlattenedDescription(item.description, aiConfirmedFoodGroups.beansNutsSeeds.description)
                            } else if (item.foodGroup.toLowerCase() === 'wildcard') {
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
                    basicStartDate: basicStartDate
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
                    basicStartDate: basicStartDate
                }

                return { success: true, data: result, message: 'User food logs fetched successfully' };
            }
        } catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }

    async fetchUserFoodLogJournal(id: string, pageNumber: number, pageSize: number): Promise<any> {
        try {
            const offset = (pageNumber - 1) * pageSize;

            const executeFoodLogJournalQuery = `SELECT jsonb_build_object('id', R.id, 'user_id', R."user_id", 'review_date', R."review_date",
                'whatWentWell', R."whatWentWell", 'whatCouldBeBetter', R."whatCouldBeBetter",
                'correctiveMeasures', R."correctiveMeasures", 'thoughts', R."thoughts", 'created_at', R."created_at",
                'foodLogs', COALESCE(jsonb_agg(to_jsonb(FL) ORDER BY FL."created_at" DESC) FILTER (WHERE FL.id IS NOT NULL), '[]'::jsonb),
                'foodLogsCount', COUNT(FL.id)) AS review FROM public.reviews AS R
                LEFT JOIN public.review_food_logs AS RFL ON R.id = RFL."review_id"
                LEFT JOIN public.food_logs AS FL ON FL.id = RFL."food_log_id"
                WHERE R."user_id" = :id
                GROUP BY R.id, R."user_id", R."whatWentWell", R."whatCouldBeBetter", 
                R."correctiveMeasures", R."thoughts", R."created_at"
                ORDER BY Date(R."review_date") DESC LIMIT :pageSize OFFSET :offset`;
            let foodLogJournal: any = await this.userModel?.sequelize?.query(
                executeFoodLogJournalQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id, pageSize: pageSize, offset: offset },
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
                    if(intentionsCheckData.length > 0) {
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

            let assignmentsData : any[] = [];
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
                intakeScreenerData['page-' + (i+1)] = {
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

            let executeAdherenceListQuery = `SELECT json_build_object('quesContent', "Q"."content", 'quesData', "Q"."data", 'quesSlug', "A"."question_slug", 'ansValue', "A"."values", 'uid', "A"."uid", 'userId', "A"."user_id") as "adherenceObj"
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

    async getProUserCount(): Promise<any> {
        try {
            const proUserCount: any = await this.userModel?.sequelize?.query(
                `SELECT COUNT(DISTINCT(M.user_id)) as "proUserCount" FROM public.metadata AS M
                WHERE M."user_type" != 'practitioner' AND M."plan" NOT IN ('free', 'trial', 'dev')`);

            const activeUserCount: any = await this.userModel?.sequelize?.query(
                `SELECT COUNT(DISTINCT(U.id)) as "activeUserCount" FROM auth.users AS U WHERE U.last_seen IS NOT NULL AND U.last_seen > NOW() - INTERVAL '28 day'`);

            const onboardedUserCount: any = await this.userModel?.sequelize?.query(
                `SELECT COUNT(DISTINCT(M.user_id)) as "onboardedUserCount" FROM public.metadata AS M
                WHERE M."onboarded" = true`);

            const newCustomerCount: any = await this.userModel?.sequelize?.query(
                `SELECT COUNT(id) AS "newCustomerCount" FROM auth.users
                WHERE created_at >= NOW() - INTERVAL '28 days'`);

            const newPractitionerCount: any = await this.userModel?.sequelize?.query(
                `SELECT COUNT(id) AS "newPractitionerCount" FROM auth.users as U
                JOIN public.metadata as M ON U.id = M.user_id
                WHERE M."user_type" = 'practitioner' AND U.created_at >= NOW() - INTERVAL '28 days'`);

            return {
                success: true, data: {
                    proUserCount: proUserCount[0][0]?.proUserCount || 0,
                    activeUserCount: activeUserCount[0][0]?.activeUserCount || 0,
                    onboardedUserCount: onboardedUserCount[0][0]?.onboardedUserCount || 0,
                    newCustomerCount: newCustomerCount[0][0]?.newCustomerCount || 0,
                    newPractitionerCount: newPractitionerCount[0][0]?.newPractitionerCount || 0
                }, message: 'Pro user count fetched successfully'
            };
        } catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }

    async createNewUser(userData: Partial<User>): Promise<IResponse> {
        try {
            const newUser = await this.userModel.create(userData);

            const displayName = userData.display_name ?? '';
            const email = userData.email ?? '';
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

    async fetchUserDataForPdf(): Promise<any> {
        try {
            let executeDataQuery = `SELECT to_jsonb(U) as user, to_jsonb(M) as userMetadata, to_jsonb(S) as userSettings, to_jsonb(FL) as userFoodLogs, to_jsonb(I) as userIntentions, to_jsonb(P) as userPins, to_jsonb(R) as userReviews FROM auth.users as U 
                join public.metadata as M on U.id = M.user_id
                join public.settings as S on U.id = S."user_id"
                left join public.food_logs as FL on U.id = FL."userId"
                left join public.intentions as I on U.id = I."user_id"
                left join public.pins as P on U.id = P."user_id"
                left join public.reviews as R on U.id = R."user_id"
                where U.last_seen IS NOT NULL ORDER BY U.last_seen DESC`;

            const userData: any = await this.userModel?.sequelize?.query(
                executeDataQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                }
            );

            return { success: true, data: userData, message: 'User data fetched successfully' };
        } catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }

}