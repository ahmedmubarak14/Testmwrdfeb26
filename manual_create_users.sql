-- Helper script to manually create users if the Admin Portal is having issues
-- Run this in your Supabase Dashboard > SQL Editor

-- 1. Create the Auth Users (Uncomment lines to create specific users)
-- You must handle the password hashing or creation via the GUI first if doing pure SQL is hard.
-- EASIER WAY: Go to Authentication > Users > Add User in the dashboard properly.

-- 2. Insert Public Profiles (Run this if the trigger didn't work)

INSERT INTO public.users (email, name, role, company_name, verified, status, kyc_status, phone, date_joined)
VALUES 
-- Admin User
('admin+manual@example.com', 'Admin User', 'ADMIN', 'MWRD HQ', true, 'ACTIVE', 'VERIFIED', '+966500000000', NOW()),

-- Supplier User
('supplier+manual@example.com', 'Test Supplier', 'SUPPLIER', 'Supplier Co', true, 'PENDING', 'INCOMPLETE', '+966500000001', NOW()),

-- Client User
('client+manual@example.com', 'Test Client', 'CLIENT', 'Client Co', true, 'ACTIVE', 'VERIFIED', '+966500000002', NOW())

ON CONFLICT (email) DO UPDATE 
SET 
  role = EXCLUDED.role,
  status = EXCLUDED.status,
  verified = EXCLUDED.verified;

-- Check the users
SELECT * FROM public.users;
