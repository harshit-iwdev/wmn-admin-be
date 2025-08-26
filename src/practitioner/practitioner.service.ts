import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { User } from '../models';
import { FilterDto } from 'src/users/dto/filter.dto';
import { QueryTypes } from 'sequelize';


@Injectable()
export class PractitionerService {

    constructor(
        @InjectModel(User) private readonly userModel: typeof User,
    ) { }

    async findAllPractitionersList(pageNumber: number, pageSize: number): Promise<any> {
        try {
            // const { searchTerm, sortBy, sortOrder, selectedRole } = filters;

            let executeDataQuery = `SELECT to_jsonb(U) as user, to_jsonb(M) as practitionerMetadata
                FROM auth.users as U 
                -- JOIN public.practitioner as P on U.email = P.email
                JOIN public.metadata as M on U.id = M.user_id
                where U.last_seen IS NOT NULL AND M.user_type = 'practitioner'`;

            let executeCountQuery = `SELECT COUNT(*) as count FROM auth.users as U
                -- JOIN public.practitioner AS P on U.email = P.email
                JOIN public.metadata as M on U.id = M.user_id
                WHERE U.last_seen IS NOT NULL AND M.user_type = 'practitioner'`;
            // if (searchTerm) {
            //     executeDataQuery += ` AND (U.email ILIKE '%${searchTerm}%' OR U.display_name ILIKE '%${searchTerm}%' OR P.first_name ILIKE '%${searchTerm}%' OR P.last_name ILIKE '%${searchTerm}%')`;
            //     executeCountQuery += ` AND (U.email ILIKE '%${searchTerm}%' OR U.display_name ILIKE '%${searchTerm}%' OR P.first_name ILIKE '%${searchTerm}%' OR P.last_name ILIKE '%${searchTerm}%')`;
            // }

            // if (selectedRole === 'practitioner') {
            //     executeDataQuery += ` AND M.user_type = 'practitioner'`;
            //     executeCountQuery += ` AND M.user_type = 'practitioner'`;
            // }

            // if (sortBy && sortOrder) {
            //     if (sortBy === 'last_seen' || sortBy === 'email') {
            //         executeDataQuery += ` ORDER BY U.${sortBy} ${sortOrder}`;
            //     } else if (sortBy === 'first_name' || sortBy === 'last_name' || sortBy === 'username' || sortBy === 'cycle' || sortBy === 'pro_day' || sortBy === 'plan' || sortBy === 'renewalNumber') {
            //         executeDataQuery += ` ORDER BY M."${sortBy}" ${sortOrder}`;
            //     }
            // } else {
            //     executeDataQuery += ` ORDER BY U.last_seen DESC`;
            // }

            executeDataQuery += ` ORDER BY U.created_at DESC LIMIT :pageSize OFFSET :offset`;

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
            console.error(error, "---error---13");
        }
    }

}
