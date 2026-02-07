-- Normalizing User Roles
-- This script updates any user with role 'Vendor' (case-insensitive) to 'SUPPLIER'
-- Run this in your Supabase SQL Editor to fix the blank dashboard issue immediately.

UPDATE users
SET role = 'SUPPLIER'
WHERE lower(role) = 'vendor';

-- Verify the changes
SELECT id, email, role FROM users WHERE role = 'SUPPLIER';
