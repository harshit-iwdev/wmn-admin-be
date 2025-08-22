import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { User } from '../models';
import { QueryTypes } from 'sequelize';
import { FilterDto } from './dto/filter.dto';


@Injectable()
export class UsersService {
    constructor(
        @InjectModel(User) private readonly userModel: typeof User,
    ) { }

    async findAll(): Promise<User[]> {
        return this.userModel.findAll();
    }

    async findAllUsers(pageNumber: number, pageSize: number, filters: FilterDto): Promise<any> {
        try {
            const { search, sort_by, order_by, userType } = filters;

            let executeDataQuery = `SELECT U.*, M.* FROM auth.users as U 
                join public.metadata as M on U.id = M.user_id
                where U.last_seen is not null and M.user_type = 'user'`;
            let executeCountQuery = `SELECT COUNT(*) as count FROM auth.users as U
                join public.metadata as M on U.id = M.user_id
                where U.last_seen is not null and M.user_type = 'user'`;
            if (search) {
                executeDataQuery += ` AND (U.email ILIKE '%${search}%' OR U.display_name ILIKE '%${search}%' OR M.first_name ILIKE '%${search}%' OR M.last_name ILIKE '%${search}%')`;
                executeCountQuery += ` AND (U.email ILIKE '%${search}%' OR U.display_name ILIKE '%${search}%' OR M.first_name ILIKE '%${search}%' OR M.last_name ILIKE '%${search}%')`;
            }

            if (userType) {
                executeDataQuery += ` AND M.user_type = '${userType}'`;
                executeCountQuery += ` AND M.user_type = '${userType}'`;
            }

            if (sort_by && order_by) {
                if (sort_by === 'last_seen' || sort_by === 'email') {
                    executeDataQuery += ` ORDER BY U.${sort_by} ${order_by}`;
                } else if (sort_by === 'first_name' || sort_by === 'last_name' || sort_by === 'username' || sort_by === 'cycle' || sort_by === 'proDay' || sort_by === 'plan' || sort_by === 'renewal_number') {
                    executeDataQuery += ` ORDER BY M.${sort_by} ${order_by}`;
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
                    users: users as User[],
                    totalCount: totalCount[0]?.count || 0,
                },
                message: 'Users fetched successfully',
            };
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