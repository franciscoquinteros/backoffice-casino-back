import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDescriptionToTransaction1712000001000 implements MigrationInterface {
    name = 'AddDescriptionToTransaction1712000001000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "transaction" 
            ADD COLUMN "description" text NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "transaction" 
            DROP COLUMN "description"
        `);
    }
} 