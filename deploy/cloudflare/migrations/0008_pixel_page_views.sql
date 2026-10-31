-- No-JavaScript pixel page views.
-- Additive only: one new column with a default on `sources`.
--
-- pixel_enabled lets a website count views of pages that cannot run the script (a README) through a
-- 1x1 image request. An image request carries no origin, so anyone who knows the website key could
-- forge hits: it is off by default and switched on per website. The default keeps every existing
-- website refusing pixel hits.
ALTER TABLE sources ADD COLUMN pixel_enabled INTEGER NOT NULL DEFAULT 0;
