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

    async findAllUsersList(pageNumber: number, pageSize: number, filters: FilterDto): Promise<IResponse> {
        try {
            const { searchTerm, sortBy, sortOrder, selectedRole } = filters;

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

            if (selectedRole === 'practitioner') {
                executeDataQuery += ` AND M.user_type = 'practitioner'`;
                executeCountQuery += ` AND M.user_type = 'practitioner'`;
            }

            if (sortBy && sortOrder) {
                if (sortBy === 'last_seen' || sortBy === 'email') {
                    executeDataQuery += ` ORDER BY U.${sortBy} ${sortOrder}`;
                } else if (sortBy === 'first_name' || sortBy === 'last_name' || sortBy === 'username' || sortBy === 'cycle' || sortBy === 'pro_day' || sortBy === 'plan' || sortBy === 'renewalNumber') {
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

    async fetchUserFoodLogs(payload: FoodLogsFilterDto): Promise<any> {
        try {
            const { id, startDate, endDate } = payload;

            let executeFoodLogsQuery = `SELECT DATE(FL."created_at") AS log_date, jsonb_agg(to_jsonb(FL."food_groups")) AS "foodLogs",
                jsonb_agg(to_jsonb(AIFR)) AS "aiFoodRecognition" FROM public.food_logs AS FL
                LEFT JOIN public.ai_food_recognition AS AIFR ON FL."ai_food_data_id" = AIFR.id
                WHERE FL."userId" = :id AND FL."created_at" >= :startDate AND FL."created_at" <= :endDate
                GROUP BY DATE(FL."created_at") ORDER BY log_date ASC;`;

            const foodLogs: any = await this.userModel?.sequelize?.query(
                executeFoodLogsQuery,
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
            // Calculate real food group distribution
            const foodGroupCounts = {
                fruit: 0,
                vegetable: 0,
                grain: 0,
                dairy: 0,
                protein: 0,
                beansNutsSeeds: 0,
                wildcard: 0
            }

            let executeRangedArchivedFoodLogsQuery = `SELECT * FROM public.food_group_archives AS FGA
                WHERE FGA."userId" = :id and Date(FGA."start_date") >= :startDate and Date(FGA."end_date") <= :endDate`;

            const rangedArchivedFoodLogs: any = await this.userModel?.sequelize?.query(
                executeRangedArchivedFoodLogsQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id, startDate: startDate, endDate: endDate },
                }
            );

            let consecutive = 0;
            // data from food logs
            foodLogs.forEach((log: any) => {
                if (log.foodLogs && log.foodLogs.length > 0) {
                    const oneGroup = log.foodLogs.flat();
                    let grp = oneGroup.map((group: string) => group.toLowerCase());
                    grp.forEach((g: string) => {
                        if (g === 'f') foodGroupCounts.fruit++
                        else if (g === 'v') foodGroupCounts.vegetable++
                        else if (g === 'g') foodGroupCounts.grain++
                        else if (g === 'd') foodGroupCounts.dairy++
                        else if (g === 'p') foodGroupCounts.protein++
                        else if (g === 'bns') foodGroupCounts.beansNutsSeeds++
                        else foodGroupCounts.wildcard++;
                    })

                    // calculate consecutive logs
                    const foodGroupsOrder = ['f', 'v', 'g', 'd', 'p', 'bns'];
                    const uniqueFoodGroups = [...new Set(grp)];
                    const hasAllGroups = foodGroupsOrder.every(g => uniqueFoodGroups.includes(g));
                    if (hasAllGroups) {
                        consecutive++;
                    }
                }
            });

            let executeAllArchivedFoodLogsQuery = `SELECT * FROM public.food_group_archives AS FGA
            WHERE FGA."userId" = :id`;
            const allArchivedFoodLogs: any = await this.userModel?.sequelize?.query(
                executeAllArchivedFoodLogsQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id },
                }
            );
            // data from archived food logs
            rangedArchivedFoodLogs.forEach((log: any) => {
                if (log.food_groups) {
                    let consecKey: string[] = [];
                    Object.keys(log.food_groups).forEach((key: string) => {
                        const groupCount = log.food_groups[key]
                        if (key.toLowerCase().includes('bns')) {
                            consecKey.push('bns');
                            foodGroupCounts.beansNutsSeeds += groupCount;
                        } else if (key.toLowerCase().includes('fruit')) {
                            consecKey.push('f');
                            foodGroupCounts.fruit += groupCount;
                        } else if (key.toLowerCase().includes('vegetable')) {
                            consecKey.push('v');
                            foodGroupCounts.vegetable += groupCount;
                        } else if (key.toLowerCase().includes('grain')) {
                            consecKey.push('g');
                            foodGroupCounts.grain += groupCount;
                        } else if (key.toLowerCase().includes('dairy')) {
                            consecKey.push('d');
                            foodGroupCounts.dairy += groupCount;
                        } else if (key.toLowerCase().includes('protein')) {
                            consecKey.push('p');
                            foodGroupCounts.protein += groupCount;
                        } else {
                            consecKey.push('w');
                            foodGroupCounts.wildcard += groupCount;
                        }
                    })
                    // calculate consecutive logs
                    const foodGroupsOrder = ['f', 'v', 'g', 'd', 'p', 'bns'];
                    const uniqueFoodGroups = [...new Set(consecKey)];
                    const hasAllGroups = foodGroupsOrder.every(g => uniqueFoodGroups.includes(g));
                    if (hasAllGroups) {
                        consecutive++;
                    }
                }
            });

            // Calculate days between first and last log (inclusive)
            const timeDiff = new Date(endDate).getTime() - new Date(startDate).getTime();
            let totalDays = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1; // +1 to include both start and end dates

            const avgFoodLogsPerDay = {
                fruit: foodGroupCounts.fruit > 0 ? (foodGroupCounts.fruit / totalDays).toFixed(1) : 0,
                vegetable: foodGroupCounts.vegetable > 0 ? (foodGroupCounts.vegetable / totalDays).toFixed(1) : 0,
                grain: foodGroupCounts.grain > 0 ? (foodGroupCounts.grain / totalDays).toFixed(1) : 0,
                dairy: foodGroupCounts.dairy > 0 ? (foodGroupCounts.dairy / totalDays).toFixed(1) : 0,
                protein: foodGroupCounts.protein > 0 ? (foodGroupCounts.protein / totalDays).toFixed(1) : 0,
                beansNutsSeeds: foodGroupCounts.beansNutsSeeds > 0 ? (foodGroupCounts.beansNutsSeeds / totalDays).toFixed(1) : 0,
                wildcard: foodGroupCounts.wildcard > 0 ? (foodGroupCounts.wildcard / totalDays).toFixed(1) : 0
            };

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

            const avgFoodLogCountPerDay = Object.values(foodGroupCounts).reduce((acc: number, curr: number) => {
                return (acc + curr);
            });

            let dataToDisplay = false;
            if (parseInt(foodLogsCount[0]?.count) > 0) {
                dataToDisplay = true;
            } else if (parseInt(rangedArchivedFoodLogs.length) > 0) {
                dataToDisplay = true;
            } else {
                Object.values(foodGroupCounts).forEach((count: number) => {
                    if (parseInt(count.toString()) > 0) {
                        dataToDisplay = true;
                    }
                });
            }

            const result = {
                // foodLogs: { rows: foodLogs, count: foodLogsCount[0]?.count || 0 },
                foodLogsArchived: allArchivedFoodLogs,
                foodGroupDistribution: foodGroupCounts,
                averageLogsPerDay: avgFoodLogsPerDay,
                totalDays: totalDays,
                consecutiveLogs: consecutive,
                count: foodLogsCount[0]?.count || 0,
                dataToDisplay: dataToDisplay,
                avgFoodLogCountPerDay: (avgFoodLogCountPerDay / totalDays).toFixed(1)
            }

            return { success: true, data: result, message: 'User food logs fetched successfully' };
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
                `SELECT COUNT(DISTINCT(U.id)) as "activeUserCount" FROM auth.users AS U
                WHERE U.last_seen IS NOT NULL AND U.last_seen > NOW() - INTERVAL '7 day'`);

            const onboardedUserCount: any = await this.userModel?.sequelize?.query(
                `SELECT COUNT(DISTINCT(M.user_id)) as "onboardedUserCount" FROM public.metadata AS M
                WHERE M."onboarded" = true`);

            return {
                success: true, data: {
                    proUserCount: proUserCount[0][0]?.proUserCount || 0,
                    activeUserCount: activeUserCount[0][0]?.activeUserCount || 0,
                    onboardedUserCount: onboardedUserCount[0][0]?.onboardedUserCount || 0
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