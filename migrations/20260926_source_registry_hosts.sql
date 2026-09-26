ALTER TABLE shopping_source_registry
  DROP CONSTRAINT IF EXISTS shopping_source_registry_timeout_ms_check;

ALTER TABLE shopping_source_registry
  ADD CONSTRAINT shopping_source_registry_timeout_ms_check
  CHECK (timeout_ms BETWEEN 1000 AND 30000);

UPDATE shopping_source_registry
SET allowed_hosts = ARRAY['api.mercadolibre.com']
WHERE source = 'mercadolivre';

UPDATE shopping_source_registry
SET allowed_hosts = ARRAY['webservices.amazon.com.br']
WHERE source = 'amazon-br';
