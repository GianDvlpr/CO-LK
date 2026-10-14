DROP INDEX "users_company_id_username_key";
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
