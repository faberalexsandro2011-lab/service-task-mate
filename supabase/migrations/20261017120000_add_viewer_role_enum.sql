-- Add the read-only role in its own migration so PostgreSQL commits the enum value
-- before any later migration references it.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'visualizador';
