import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany, UpdateDateColumn, JoinColumn, ManyToOne } from 'typeorm';
import { Chat } from './chat.entity';
//import { User } from 'mercadopago';
import { User } from '../../users/entities/user.entity'; // Asegúrate de que la ruta sea correcta

@Entity()
export class Conversation {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ name: 'user_id', nullable: false })
    userId: string;

    @Column({ name: 'agent_id', nullable: true })
    agentId: string;

    @Column({ name: 'office_id', nullable: true })
    officeId: string;

    // --- NUEVAS RELACIONES A USER ---
    @ManyToOne(() => User) // Relación ManyToOne a User para el usuario que inició/es propietario
    @JoinColumn({ name: 'user_id' }) // Especifica que usa la columna 'user_id' como FK
    initiatingUser: User; // Nombre de la propiedad de relación

    @ManyToOne(() => User, { nullable: true })// Relación ManyToOne a User para el agente asignado
    @JoinColumn({ name: 'agent_id' }) // Especifica que usa la columna 'agent_id' como FK
    assignedAgent: User; // Nombre de la propiedad de relación
    // --- FIN NUEVAS RELACIONES ---

    @Column({ name: 'title', nullable: true })
    title: string;

    @Column({ name: 'status', default: 'active' })
    status: 'active' | 'closed';

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

    @OneToMany(() => Chat, chat => chat.conversation, { cascade: true })
    messages: Chat[];
} 