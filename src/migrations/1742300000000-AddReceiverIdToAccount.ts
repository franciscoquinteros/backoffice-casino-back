import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReceiverIdToAccount1742300000000 implements MigrationInterface {
    name = 'AddReceiverIdToAccount1742300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "account" 
            ADD COLUMN "receiver_id" character varying
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "account" 
            DROP COLUMN "receiver_id"
        `);
    }
} 