WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "company_id" ORDER BY "layout_order" ASC, "name" ASC) - 1 AS "position"
  FROM "warehouses"
  WHERE "layout_x" = 0 AND "layout_y" = 0
)
UPDATE "warehouses" AS w
SET "layout_x" = (r."position" % 3) * 260,
    "layout_y" = (r."position" / 3) * 220
FROM ranked AS r
WHERE w."id" = r."id" AND r."position" > 0;
