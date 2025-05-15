import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateRefreshTokensTable1716916845123 implements MigrationInterface {
    name = 'CreateRefreshTokensTable1716916845123';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "refresh_token" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "token" character varying NOT NULL,
                "isRevoked" boolean NOT NULL DEFAULT false,
                "expiresAt" TIMESTAMP NOT NULL,
                "userId" bigint NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_b575dd3c21fb0831013c909e7fe" PRIMARY KEY ("id")
            )
        `);

        await queryRunner.query(`
            CREATE INDEX "IDX_refresh_token_token" ON "refresh_token" ("token")
        `);

        await queryRunner.query(`
            ALTER TABLE "refresh_token" 
            ADD CONSTRAINT "FK_refresh_token_user" 
            FOREIGN KEY ("userId") REFERENCES "user"("id") 
            ON DELETE CASCADE
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "refresh_token" DROP CONSTRAINT "FK_refresh_token_user"
        `);

        await queryRunner.query(`
            DROP INDEX "IDX_refresh_token_token"
        `);

        await queryRunner.query(`
            DROP TABLE "refresh_token"
        `);
    }
} 