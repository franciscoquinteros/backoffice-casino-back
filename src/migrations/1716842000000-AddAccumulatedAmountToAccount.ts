import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccumulatedAmountToAccount1716842000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "account" ADD COLUMN "accumulated_amount" DECIMAL(10,2) NOT NULL DEFAULT 0`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "account" DROP COLUMN "accumulated_amount"`);
    }
} 