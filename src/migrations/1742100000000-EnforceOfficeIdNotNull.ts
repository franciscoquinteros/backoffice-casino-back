import { MigrationInterface, QueryRunner } from "typeorm";

export class EnforceOfficeIdNotNull1742100000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Update any null office_id values to '1'
        await queryRunner.query(`
            UPDATE "conversation" 
            SET "office_id" = '1' 
            WHERE "office_id" IS NULL
        `);

        // Make the column NOT NULL
        await queryRunner.query(`
            ALTER TABLE "conversation" 
            ALTER COLUMN "office_id" SET NOT NULL
        `);

        // Create index for performance if it doesn't exist
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_conversation_office_id" ON "conversation" ("office_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Make the column nullable again
        await queryRunner.query(`
            ALTER TABLE "conversation" 
            ALTER COLUMN "office_id" DROP NOT NULL
        `);

        // We don't drop the index in down migration since it's harmless to keep
        // and dropping it could affect performance
    }
} 