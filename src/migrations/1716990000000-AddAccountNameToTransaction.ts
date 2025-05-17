import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAccountNameToTransaction1716990000000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "transaction" 
            ADD COLUMN IF NOT EXISTS "account_name" VARCHAR(255) NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "transaction" 
            DROP COLUMN IF EXISTS "account_name"
        `);
    }

} 