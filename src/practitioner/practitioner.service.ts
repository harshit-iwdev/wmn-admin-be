import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { User } from '../models';
import { FilterDto } from 'src/users/dto/filter.dto';
import { QueryTypes } from 'sequelize';
import * as XLSX from 'xlsx';
import { UsersService } from 'src/users/users.service';


@Injectable()
export class PractitionerService {

    constructor(
        @InjectModel(User) private readonly userModel: typeof User,
        private readonly userService: UsersService,
    ) { }

    async findAllPractitionersList(pageNumber: number, pageSize: number): Promise<any> {
        try {

            let executeDataQuery = `SELECT to_jsonb(U) as user, to_jsonb(M) as practitionerMetadata
                FROM auth.users as U 
                JOIN public.metadata as M on U.id = M.user_id
                where U.last_seen IS NOT NULL AND M.user_type = 'practitioner'`;

            let executeCountQuery = `SELECT COUNT(*) as count FROM auth.users as U
                JOIN public.metadata as M on U.id = M.user_id
                WHERE U.last_seen IS NOT NULL AND M.user_type = 'practitioner'`;

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

    async fetchPractitionersDataForPdf(filters: FilterDto): Promise<any> {
        try {
            const { searchTerm, sortBy, sortOrder, gift, unsubscribed } = filters;

            let executeDataQuery = `SELECT to_jsonb(U) as user, to_jsonb(M) as practitionerMetadata
                FROM auth.users as U 
                JOIN public.metadata as M on U.id = M.user_id
                where U.last_seen IS NOT NULL AND M.user_type = 'practitioner'`;

            if (searchTerm) {
                executeDataQuery += ` AND (U.email ILIKE '%${searchTerm}%' OR U.display_name ILIKE '%${searchTerm}%' OR M.first_name ILIKE '%${searchTerm}%' OR M.last_name ILIKE '%${searchTerm}%')`;
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

            if (sortBy && sortOrder) {
                if (sortBy === 'last_seen' || sortBy === 'email') {
                    executeDataQuery += ` ORDER BY U.${sortBy} ${sortOrder}`;
                } else if (sortBy === 'first_name' || sortBy === 'last_name' || sortBy === 'username' || sortBy === 'cycle' || sortBy === 'pro_day' || sortBy === 'plan' || sortBy === 'renewalNumber') {
                    executeDataQuery += ` ORDER BY M."${sortBy}" ${sortOrder}`;
                }
            } else {
                executeDataQuery += ` ORDER BY U.last_seen DESC`;
            }

            const practitioners = await this.userModel?.sequelize?.query(
                executeDataQuery,
                {
                    type: QueryTypes.SELECT,
                    raw: true,
                }
            );

            return {
                success: true, data: practitioners,
                message: 'Practitioners fetched successfully',
            };

        } catch (error) {
            console.error(error, "---error---");
            throw new BadRequestException(error.message);
        }
    }


    async importPractitionersFromCsv(file: Express.Multer.File, body: any): Promise<any> {
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
                } else {
                    console.log(`User ${email} does not exist, creating new user`);
                }
                
                try {
                    const newUser = await this.userService.createNewUser(element);
                    if (newUser.success) {
                        console.log(`User ${email} created successfully`);
    
                        let metadataCreateQuery = `INSERT INTO public.metadata (user_id, first_name, last_name, user_type, pro_day, cycle, gift, updated_at) 
                            VALUES (:userId, :first_name, :last_name, :user_type, :pro_day, :cycle, :gift, :updatedAt)`;
                        const metadataCreate: any = await this.userModel?.sequelize?.query(metadataCreateQuery, {
                            type: QueryTypes.INSERT,
                            raw: true,
                            replacements: {
                                userId: newUser.data.id,
                                first_name: element.firstName,
                                last_name: element.lastName,
                                user_type: 'practitioner',
                                pro_day: 0,
                                cycle: 0,
                                gift: body.isGift === 'true' ? true : false,
                                updated_at: new Date()
                            }
                        });
                        console.log(metadataCreate, "---metadataCreate---");
                        console.log(`Metadata for user ${email} created successfully`);
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

}
