import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('transaction')
export class TransactionEntity {
    @PrimaryColumn()
    id: string;

    @Column({
        type: 'enum',
        enum: ['deposit', 'withdraw']
    })
    type: 'deposit' | 'withdraw';

    @Column('decimal', { precision: 20, scale: 1 })
    amount: number;

    @Column({ nullable: true, default: 'Pending' })
    status: string;

    @Column({ nullable: true })
    description: string;

    @Column({ name: 'date_created', nullable: true })
    dateCreated: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @Column({ name: 'payment_method_id', nullable: true })
    paymentMethodId: string;

    @Column({ name: 'payer_id', nullable: true })
    payerId: string;

    @Column({ name: 'payer_email', nullable: true })
    payerEmail: string;

    @Column({
        name: 'payer_identification',
        type: 'jsonb',
        nullable: true
    })
    payerIdentification: {
        type?: string;
        number?: string;
    } | null;

    @Column({ nullable: true })
    cbu: string;

    @Column({ name: 'wallet_address', nullable: true })
    walletAddress: string;

    @Column({ name: 'external_reference', nullable: true })
    externalReference: string;

    @Column({ name: 'receiver_id', nullable: true })
    receiverId: string;

    @Column({ name: 'id_cliente', nullable: true })
    idCliente: string;

    @Column({ name: 'reference_transaction', nullable: true })
    referenceTransaction: string;

    @Column({ nullable: true })
    relatedUserTransactionId: string;

    @Column({ nullable: true })
    office: string;
}