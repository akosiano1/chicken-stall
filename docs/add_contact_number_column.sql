-- Migration: Add contact_number column to profiles table
-- Run this SQL against your Supabase/Postgres database.

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS contact_number TEXT;


