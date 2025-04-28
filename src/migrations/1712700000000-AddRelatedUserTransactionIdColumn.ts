import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRelatedUserTransactionIdColumn1712700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transaction" ADD COLUMN "relatedUserTransactionId" VARCHAR(255)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transaction" DROP COLUMN "relatedUserTransactionId"`);
  }
} 