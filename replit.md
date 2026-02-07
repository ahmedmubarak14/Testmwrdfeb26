# MWRD - Managed B2B Marketplace

## Overview

MWRD is a managed B2B marketplace platform that connects clients and suppliers anonymously, with comprehensive admin oversight. The application features a three-portal system (Client, Supplier, Admin) with RFQ workflows, margin management, payment processing, and role-based access control.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 19+ with TypeScript
- **Build Tool**: Vite 6 with hot module replacement
- **Styling**: Tailwind CSS 4 with custom design tokens defined in `index.html` and `tailwind.config.js`
- **State Management**: Zustand with localStorage persistence for client-side state
- **Form Handling**: React Hook Form with Zod validation
- **Routing**: Currently implemented as view-state switching in App.tsx (not React Router despite being installed)
- **Internationalization**: i18next with browser language detection, supporting English and Arabic (RTL)
  - Automatic RTL direction switching on language change
  - Centralized status translation utility in `src/i18n/index.ts`
  - 500+ translation keys covering all user-facing strings
  - Toast messages, error messages, and form validation all translated

### Backend Architecture
- **Database**: Supabase (PostgreSQL) with optional mock data fallback
- **Authentication**: Dual-mode system - Supabase Auth when configured, mock authentication otherwise
- **Mode Detection**: Centralized in `src/config/appConfig.ts` - checks for `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` environment variables
- **Row Level Security**: Supabase RLS policies for multi-tenant data isolation

### Application Structure
```
src/
├── config/appConfig.ts    # Centralized configuration and feature flags
├── lib/supabase.ts        # Supabase client initialization
├── store/useStore.ts      # Zustand store with auth, products, RFQs, quotes, orders
├── services/              # API layer
│   ├── api.ts             # CRUD operations for Supabase
│   ├── authService.ts     # Authentication service
│   ├── mockData.ts        # Fallback mock data
│   ├── paymentService.ts  # Payment processing
│   ├── moyasarService.ts  # Moyasar payment gateway
│   └── bankTransferService.ts  # Bank transfer handling
├── pages/                 # Portal views (Client, Supplier, Admin, Landing, Login, GetStarted, About)
├── components/            # Reusable UI components
├── types/                 # TypeScript type definitions
└── i18n/                  # Internationalization files
    ├── index.ts           # i18n initialization with RTL support and status translation utility
    └── locales/           # Translation files (en.json, ar.json)
```

### Authentication Flow
1. App checks environment variables on startup via `appConfig.ts`
2. If Supabase is configured, uses Supabase Auth with session persistence
3. If not configured, falls back to mock authentication with hardcoded demo users
4. Demo credentials: `client+demo@example.com/CHANGE_ME_CLIENT_PASSWORD`, `supplier+demo@example.com/CHANGE_ME_SUPPLIER_PASSWORD`, `admin+demo@example.com/CHANGE_ME_ADMIN_PASSWORD`

### Data Model
- **Users**: Clients, Suppliers, Admins with role-based permissions
- **Products**: Supplier-submitted with approval workflow, cost/retail pricing with margins
- **RFQs**: Request for Quotes with items, status tracking
- **Quotes**: Supplier responses with margin calculation
- **Orders**: Order fulfillment with payment status tracking

### Payment System
- **Phase One**: Bank transfer payments with manual confirmation workflow
- **Phase Two**: Moyasar payment gateway integration (credit cards, MADA, Apple Pay)
- Automatic VAT calculation (15%)

## External Dependencies

### Core Services
- **Supabase**: PostgreSQL database, authentication, and Row Level Security
  - Project configuration via `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
  - Schema defined in `supabase-schema.sql`

### Payment Gateways
- **Moyasar**: Saudi payment gateway for card processing
  - Configuration via `VITE_MOYASAR_API_KEY` and `VITE_MOYASAR_PUBLISHABLE_KEY`
  - Supports MADA, Visa, Mastercard, Apple Pay, STC Pay

### Frontend Libraries
- `@supabase/supabase-js`: Supabase client SDK
- `zustand`: Lightweight state management
- `react-hook-form` + `zod`: Form handling and validation
- `i18next` + `react-i18next`: Internationalization
- `lucide-react`: Icon library
- `date-fns`: Date formatting
- `gsap` + `@gsap/react`: Professional animations (Ken Burns effect on landing hero)
- `chart.js`: Admin dashboard charts (loaded via CDN in index.html)

### Development Tools
- TypeScript 5.8
- Vite with React plugin
- Tailwind CSS with PostCSS
- Material Symbols (loaded via Google Fonts CDN)