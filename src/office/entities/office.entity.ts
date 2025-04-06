import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class Office {
    @PrimaryGeneratedColumn({ type: 'bigint' })
    id: number;

    @Column({ name: 'name', nullable: false })
    name: string;

    @Column({ name: 'agent_assigned', nullable: false })
    agentAssigned: string;

    @Column({ name: 'whatsapp', nullable: true })
    whatsapp: string;

    @Column({ name: 'telegram', nullable: true })
    telegram: string;

    @Column({ name: 'first_deposit_bonus', nullable: true })
    firstDepositBonus: string;

    @Column({ name: 'perpetual_bonus', nullable: true })
    perpetualBonus: string;

    @Column({ name: 'min_deposit', nullable: true })
    minDeposit: string;

    @Column({ name: 'min_withdrawal', nullable: true })
    minWithdrawal: string;

    @Column({ name: 'min_withdrawal_wait', nullable: true })
    minWithdrawalWait: string;

    @Column({ name: 'status', nullable: false, default: 'active' })
    status: string;

    @CreateDateColumn({
        type: 'timestamp with time zone',
        default: () => 'CURRENT_TIMESTAMP(6)',
        name: 'created_at'
    })
    createdAt: Date;

    @UpdateDateColumn({
        type: 'timestamp with time zone',
        default: () => 'CURRENT_TIMESTAMP(6)',
        name: 'updated_at'
    })
    updatedAt: Date;
} 