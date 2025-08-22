# Database Setup Guide

This guide explains how to set up PostgreSQL database connection for the WMN Admin Backend.

## Prerequisites

1. PostgreSQL installed and running
2. Node.js and npm installed

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_NAME=wmn_admin

# Application Configuration
NODE_ENV=development
PORT=3000

# JWT Configuration (if needed for auth)
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=24h
```

## Database Setup

1. Create a PostgreSQL database:
```sql
CREATE DATABASE wmn_admin;
```

2. Make sure your PostgreSQL server is running and accessible with the credentials specified in your `.env` file.

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run start:dev
```

The application will automatically:
- Connect to the PostgreSQL database
- Create tables based on the models (in development mode)
- Log database operations (in development mode)

## Models

The application includes a sample `User` model with the following fields:
- `id` (Primary Key, Auto Increment)
- `email` (Unique, Required)
- `password` (Required)
- `firstName` (Required)
- `lastName` (Required)
- `role` (Enum: 'admin' | 'user', Default: 'user')
- `isActive` (Boolean, Default: false)
- `createdAt` (Auto-generated timestamp)
- `updatedAt` (Auto-generated timestamp)

## Usage

The `UsersService` provides the following methods:
- `findAll()` - Get all users
- `findOne(id)` - Get user by ID
- `findByEmail(email)` - Get user by email
- `create(userData)` - Create a new user
- `update(id, userData)` - Update user
- `delete(id)` - Delete user

## Production Considerations

In production:
- Set `NODE_ENV=production` to disable auto-synchronization
- Set `logging: false` in database config to disable SQL logging
- Use strong passwords and secure database credentials
- Consider using connection pooling for better performance 