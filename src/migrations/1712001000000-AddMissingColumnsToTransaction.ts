import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMissingColumnsToTransaction1712001000000 implements MigrationInterface {
    name = 'AddMissingColumnsToTransaction1712001000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Change ID to be string type
        await queryRunner.query(`
            ALTER TABLE "transaction"
            ALTER COLUMN "id" TYPE character varying
        `);

        // Change ID from auto-increment to regular primary key
        await queryRunner.query(`
            ALTER TABLE "transaction"
            ALTER COLUMN "id" DROP DEFAULT
        `);

        // Add type as enum
        await queryRunner.query(`
            CREATE TYPE "public"."transaction_type_enum" AS ENUM('deposit', 'withdraw')
        `);

        // Update type column to use the enum
        await queryRunner.query(`
            ALTER TABLE "transaction"
            ALTER COLUMN "type" TYPE "public"."transaction_type_enum" USING "type"::"public"."transaction_type_enum"
        `);

        // Add date_created column
        await queryRunner.query(`
            ALTER TABLE "transaction"
            ADD COLUMN "date_created" TIMESTAMP NULL
        `);

        // Add payment_method_id column
        await queryRunner.query(`
            ALTER TABLE "transaction"
            ADD COLUMN "payment_method_id" character varying NULL
        `);

        // Add payer_id column
        await queryRunner.query(`
            ALTER TABLE "transaction"
            ADD COLUMN "payer_id" character varying NULL
        `);

        // Add payer_email column
        await queryRunner.query(`
            ALTER TABLE "transaction"
            ADD COLUMN "payer_email" character varying NULL
        `);

        // Add payer_identification column
        await queryRunner.query(`
            ALTER TABLE "transaction"
            ADD COLUMN "payer_identification" json NULL
        `);

        // Add cbu column
        await queryRunner.query(`
            ALTER TABLE "transaction"
            ADD COLUMN "cbu" character varying NULL
        `);

        // Add wallet_address column
        await queryRunner.query(`
            ALTER TABLE "transaction"
            ADD COLUMN "wallet_address" character varying NULL
        `);

        // Add external_reference column
        await queryRunner.query(`
            ALTER TABLE "transaction"
            ADD COLUMN "external_reference" character varying NULL
        `);

        // Add receiver_id column
        await queryRunner.query(`
            ALTER TABLE "transaction"
            ADD COLUMN "receiver_id" character varying NULL
        `);

        // Add id_cliente column
        await queryRunner.query(`
            ALTER TABLE "transaction"
            ADD COLUMN "id_cliente" character varying NULL
        `);

        // Modify amount column to use higher precision
        await queryRunner.query(`
            ALTER TABLE "transaction"
            ALTER COLUMN "amount" TYPE decimal(15,2)
        `);

        // Make status nullable with default 'Pending'
        await queryRunner.query(`
            ALTER TABLE "transaction"
            ALTER COLUMN "status" DROP NOT NULL,
            ALTER COLUMN "status" SET DEFAULT 'Pending'
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert id_cliente column
        await queryRunner.query(`
            ALTER TABLE "transaction"
            DROP COLUMN "id_cliente"
        `);

        // Revert receiver_id column
        await queryRunner.query(`
            ALTER TABLE "transaction"
            DROP COLUMN "receiver_id"
        `);

        // Revert external_reference column
        await queryRunner.query(`
            ALTER TABLE "transaction"
            DROP COLUMN "external_reference"
        `);

        // Revert wallet_address column
        await queryRunner.query(`
            ALTER TABLE "transaction"
            DROP COLUMN "wallet_address"
        `);

        // Revert cbu column
        await queryRunner.query(`
            ALTER TABLE "transaction"
            DROP COLUMN "cbu"
        `);

        // Revert payer_identification column
        await queryRunner.query(`
            ALTER TABLE "transaction"
            DROP COLUMN "payer_identification"
        `);

        // Revert payer_email column
        await queryRunner.query(`
            ALTER TABLE "transaction"
            DROP COLUMN "payer_email"
        `);

        // Revert payer_id column
        await queryRunner.query(`
            ALTER TABLE "transaction"
            DROP COLUMN "payer_id"
        `);

        // Revert payment_method_id column
        await queryRunner.query(`
            ALTER TABLE "transaction"
            DROP COLUMN "payment_method_id"
        `);

        // Revert date_created column
        await queryRunner.query(`
            ALTER TABLE "transaction"
            DROP COLUMN "date_created"
        `);

        // Revert type column to character varying
        await queryRunner.query(`
            ALTER TABLE "transaction"
            ALTER COLUMN "type" TYPE character varying
        `);

        // Drop the enum type
        await queryRunner.query(`
            DROP TYPE "public"."transaction_type_enum"
        `);

        // Revert amount precision
        await queryRunner.query(`
            ALTER TABLE "transaction"
            ALTER COLUMN "amount" TYPE decimal(10,2)
        `);

        // Revert status not null constraint and default
        await queryRunner.query(`
            ALTER TABLE "transaction"
            ALTER COLUMN "status" SET NOT NULL,
            ALTER COLUMN "status" DROP DEFAULT
        `);

        // Revert ID to be bigint type with auto-increment
        await queryRunner.query(`
            ALTER TABLE "transaction"
            ALTER COLUMN "id" TYPE bigint,
            ALTER COLUMN "id" SET DEFAULT nextval('transaction_id_seq'::regclass)
        `);
    }
} 