import { Table, Column, Model, DataType, PrimaryKey, CreatedAt, UpdatedAt } from 'sequelize-typescript';


@Table({ 
  tableName: 'auth.users', 
  timestamps: true,
  modelName: 'User'
})
export class User extends Model {
  @PrimaryKey
  @Column({
    type: DataType.UUID,
    defaultValue: DataType.UUIDV4,
  })
  declare id: string;

  @Column({ type: DataType.DATE, allowNull: true })
  last_seen: Date;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  disabled: boolean;

  @Column({ type: DataType.TEXT, allowNull: false, defaultValue: "" })
  display_name: string;

  @Column({ type: DataType.TEXT, allowNull: false, defaultValue: "" })
  avatar_url: string;

  @Column({ type: DataType.STRING, allowNull: false })
  locale: string;

  @Column({ type: DataType.STRING, allowNull: false, unique: true })
  email: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  phone_number: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  password_hash: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  email_verified: boolean;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  phone_number_verified: boolean;

  @Column({ type: DataType.TEXT, allowNull: true })
  new_email: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  otp_method_last_used: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  otp_hash: string;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  otp_hash_expires_at: Date;

  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'user' })
  default_role: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  is_anonymous: boolean;

  @Column({ type: DataType.TEXT, allowNull: true })
  totp_secret: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  active_mfa_type: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  ticket: string;

  @Column({ type: DataType.DATE, allowNull: false, defaultValue: DataType.NOW })
  ticket_expires_at: Date;

  @Column({ type: DataType.JSONB, allowNull: true })
  metadata: any;

  @Column({ type: DataType.TEXT, allowNull: true })
  webauthn_current_challenge: string;

  @CreatedAt
  declare created_at: Date;

  @UpdatedAt
  declare updated_at: Date;
}