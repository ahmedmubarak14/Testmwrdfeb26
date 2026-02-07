# Supabase Backend Setup Guide

This guide will help you set up the Supabase backend for the MWRD Marketplace.

## Prerequisites

- A Supabase account (free tier works)
- Your Supabase project URL and anon key

## Quick Start

### 1. Get Your Supabase Credentials

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/your-project-ref
2. Navigate to **Settings** > **API**
3. Copy the following values:
   - **Project URL**: `https://your-project-ref.supabase.co`
   - **anon public key**: (Copy from the dashboard)

### 2. Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.example .env.local
   ```

2. Edit `.env.local` and fill in your values:
   ```
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_key_here
   ```

### 3. Run Database Migrations

Go to the Supabase Dashboard > **SQL Editor** and run the migration files in order:

1. **001_initial_schema.sql** - Creates tables, enums, indexes, and triggers
2. **002_row_level_security.sql** - Enables RLS and creates access policies
3. **003_seed_data.sql** - Adds default margin settings and helper functions
4. **004_auth_trigger.sql** - Sets up auto-profile creation on signup

**Important**: Run each file separately and in order!

### 4. Configure Authentication

1. Go to **Authentication** > **Providers**
2. Ensure **Email** provider is enabled
3. (Optional) Configure additional providers like Google, GitHub, etc.

### 5. Test the Setup

1. Start the development server:
   ```bash
   npm run dev
   ```

2. The app will automatically detect Supabase credentials and switch from mock data to the real backend.

3. Create a test account through the signup flow.

## Database Schema

### Tables

| Table | Description |
|-------|-------------|
| `users` | User profiles linked to Supabase Auth |
| `products` | Product catalog with approval workflow |
| `rfqs` | Request for Quote submissions |
| `rfq_items` | Line items for each RFQ |
| `quotes` | Supplier quotes with margin settings |
| `orders` | Orders created from accepted quotes |
| `margin_settings` | Admin-configurable margin percentages |

### Enums

- `user_role`: GUEST, CLIENT, SUPPLIER, ADMIN
- `user_status`: ACTIVE, PENDING, APPROVED, REJECTED, REQUIRES_ATTENTION, DEACTIVATED
- `kyc_status`: VERIFIED, IN_REVIEW, REJECTED, INCOMPLETE
- `product_status`: PENDING, APPROVED, REJECTED
- `rfq_status`: OPEN, QUOTED, CLOSED
- `quote_status`: PENDING_ADMIN, SENT_TO_CLIENT, ACCEPTED, REJECTED
- `order_status`: In Transit, Delivered, Cancelled

## Row Level Security (RLS)

The database implements comprehensive RLS policies:

### Users
- Users can view/edit their own profile
- Admins can view/edit all users

### Products
- Anyone can view approved products
- Suppliers can manage their own products
- Admins can approve/reject all products

### RFQs
- Clients can create and view their RFQs
- Suppliers can view RFQs containing their products
- Admins can view all RFQs

### Quotes
- Suppliers can create/view their quotes
- Clients can view quotes sent to them
- Admins can manage all quotes

### Orders
- Clients can view their orders
- Suppliers can view/update orders they're fulfilling
- Admins can manage all orders

## Creating Demo Users

After running migrations, create demo users through the Supabase Auth UI or API:

### Using Supabase Dashboard

1. Go to **Authentication** > **Users**
2. Click **Add User** > **Create New User**
3. Fill in email, password, and metadata:
   ```json
   {
     "name": "Admin Alice",
     "companyName": "MWRD HQ",
     "role": "ADMIN"
   }
   ```

### Using SQL (after auth user exists)

```sql
-- Update an existing user's role to ADMIN
UPDATE users
SET role = 'ADMIN', status = 'ACTIVE', verified = true
WHERE email = 'admin+demo@example.com';
```

## Troubleshooting

### "Missing Supabase environment variables"
- Check that `.env.local` exists and contains valid credentials
- Restart the dev server after adding environment variables

### "User profile not found"
- Ensure the `handle_new_user` trigger is set up correctly
- Check the `users` table for the user entry

### RLS Policy Errors
- Verify you're authenticated before making requests
- Check the browser console for specific error messages
- Ensure the user has the correct role for the operation

## Development vs Production

### Development (Mock Data)
- Remove or comment out the Supabase environment variables
- The app will automatically use mock data from `src/services/mockData.ts`

### Production (Supabase)
- Set up environment variables in your hosting platform
- Ensure all migrations are run on the production database
- Configure proper CORS and redirect URLs in Supabase dashboard

## File Structure

```
src/
├── lib/
│   └── supabase.ts          # Supabase client initialization
├── services/
│   ├── api.ts               # API service with Supabase operations
│   ├── authService.ts       # Authentication service
│   └── mockData.ts          # Fallback mock data
├── store/
│   └── useStore.ts          # Zustand store with Supabase/mock toggle
├── types/
│   ├── database.ts          # Supabase database types
│   └── types.ts             # Application types
└── vite-env.d.ts            # Environment variable types

supabase/
└── migrations/
    ├── 001_initial_schema.sql
    ├── 002_row_level_security.sql
    ├── 003_seed_data.sql
    └── 004_auth_trigger.sql
```

## Support

For issues with:
- **Supabase**: Check the [Supabase documentation](https://supabase.com/docs)
- **Application**: Create an issue in the repository
