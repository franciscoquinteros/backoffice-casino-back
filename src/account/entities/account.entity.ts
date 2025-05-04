import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity({ name: 'account' })
export class Account {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  office: string;

  @Column()
  wallet: string;

  @Column()
  name: string;

  @Column()
  alias: string;

  @Column()
  cbu: string;

  @Column()
  operator: string;

  @Column()
  agent: string;

  @CreateDateColumn()
  created_at: Date;

  @Column()
  status: string;

  @Column({ nullable: true })
  mp_access_token: string;

  @Column({ nullable: true })
  mp_public_key: string;

  @Column({ nullable: true })
  mp_client_id: string;

  @Column({ nullable: true })
  mp_client_secret: string;

  @Column({ nullable: true })
  receiver_id: string;
}