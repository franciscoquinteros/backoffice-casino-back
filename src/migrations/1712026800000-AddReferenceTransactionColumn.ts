import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReferenceTransactionColumn1712026800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transaction" ADD COLUMN "reference_transaction" VARCHAR(255)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transaction" DROP COLUMN "reference_transaction"`);
  }
}