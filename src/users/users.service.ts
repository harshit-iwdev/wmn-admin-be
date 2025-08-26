import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { User } from '../models';
import { QueryTypes } from 'sequelize';
import { FilterDto, IResponse } from './dto/filter.dto';


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
            let executeDataQuery = `SELECT to_jsonb(U) as user, to_jsonb(M) as userMetadata FROM auth.users as U 
                join public.metadata as M on U.id = M.user_id
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

            const totalCount: any = await this.userModel?.sequelize?.query(
                executeCountQuery,
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

            let executeFollowerQuery = `SELECT COUNT("follow_user_id") AS "followingCount"
                FROM public.user_follows WHERE "user_id" = :id`;

            const follower: any = await this.userModel?.sequelize?.query(
                executeFollowerQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id },
                }
            );

            let executeFollowingQuery = `SELECT COUNT("user_id") AS "followerCount"
                FROM public.user_follows WHERE "follow_user_id" = :id`;

            const following: any = await this.userModel?.sequelize?.query(
                executeFollowingQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id },
                }
            );

            userData.followerCount = follower[0]?.followingCount || 0;
            userData.followingCount = following[0]?.followerCount || 0;

            let executeActivityDataQuery = `SELECT COUNT(FL.id) as "foodLogs", COUNT(I.id) as "intentions", COUNT(P.id) as "pins"
                FROM public.food_logs AS FL
                LEFT JOIN public.intentions AS I ON FL."userId" = I."user_id"
                LEFT JOIN public.pins AS P ON FL."userId" = P."user_id"
                WHERE FL."userId" = :id`;

            const activityData: any = await this.userModel?.sequelize?.query(
                executeActivityDataQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id },
                }
            );

            userData.activityData = activityData[0] || { foodLogs: 0, intentions: 0, pins: 0 };
            return { success: true, data: userData, message: 'User details fetched successfully' };
        } catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }

    async fetchUserFollowers(id: string): Promise<any> {
        try {
            let executeFollowersQuery = `SELECT U.id, U.email, U.display_name, U.last_seen, U.avatar_url,
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
            let executeFollowingQuery = `SELECT U.id, U.email, U.display_name, U.last_seen, U.avatar_url,
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

    async fetchUserFoodLogs(id: string, pageNumber: number, pageSize: number): Promise<any> {
        try {
            const offset = (pageNumber - 1) * pageSize;
            let executeFoodLogsQuery = `SELECT to_jsonb(FL) as "foodLogs", to_jsonb(AIFR) as "aiFoodRecognition"
                FROM public.food_logs AS FL
                LEFT JOIN public.ai_food_recognition AS AIFR ON FL."ai_food_data_id" = AIFR.id
                WHERE FL."userId" = :id
                ORDER BY FL."created_at" DESC
                LIMIT :pageSize OFFSET :offset`;

            const foodLogs: any = await this.userModel?.sequelize?.query(
                executeFoodLogsQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id, pageSize: pageSize, offset: offset },
                }
            );

            let executeFoodLogsCountQuery = `SELECT COUNT(FL.id) as "count" FROM public.food_logs AS FL
                WHERE FL."userId" = :id`;

            const foodLogsCount: any = await this.userModel?.sequelize?.query(
                executeFoodLogsCountQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                    replacements: { id: id },
                }
            );

            return { success: true, data: { rows: foodLogs, count: foodLogsCount[0]?.count || 0 }, message: 'User food logs fetched successfully' };
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

            return { success: true, data: {
                proUserCount: proUserCount[0][0]?.proUserCount || 0,
                activeUserCount: activeUserCount[0][0]?.activeUserCount || 0,
                onboardedUserCount: onboardedUserCount[0][0]?.onboardedUserCount || 0
            }, message: 'Pro user count fetched successfully' };
        } catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }

    async findOne(id: number): Promise<User | null> {
        return this.userModel.findByPk(id);
    }

    async findByEmail(email: string): Promise<User | null> {
        return this.userModel.findOne({ where: { email } });
    }

    async create(userData: Partial<User>): Promise<User> {
        return this.userModel.create(userData);
    }

    async update(id: number, userData: Partial<User>): Promise<[number, User[]]> {
        return this.userModel.update(userData, {
            where: { id },
            returning: true,
        });
    }

    async delete(id: number): Promise<number> {
        return this.userModel.destroy({ where: { id } });
    }
} 