ALTER TABLE "exchange_rates"
ADD COLUMN "buy_rate" DECIMAL(18,6),
ADD COLUMN "source" VARCHAR(20);
