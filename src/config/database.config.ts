import { SequelizeModuleOptions } from '@nestjs/sequelize';

export const databaseConfig: SequelizeModuleOptions = {
  dialect: 'postgres',
  host: process.env.DB_HOST || 'jdbjalnhxhcqqmzukukt.db.us-east-1.nhost.run',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'Ne!0zx3AkJZgicQB',
  database: process.env.DB_NAME || 'jdbjalnhxhcqqmzukukt',
  dialectOptions: {
    ssl: {
      rejectUnauthorized: false,
    },
  },
  autoLoadModels: true,
  synchronize: process.env.NODE_ENV !== 'production', // Only sync in development
  logging: process.env.NODE_ENV !== 'production', // Only log in development
  define: {
    freezeTableName: true, // This prevents Sequelize from pluralizing table names
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
}; 