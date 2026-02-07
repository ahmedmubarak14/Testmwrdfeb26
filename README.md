# MWRD - Managed B2B Marketplace MVP

A fully functional and scalable B2B marketplace platform connecting clients and suppliers anonymously, with comprehensive admin oversight.

## Features

### Three-Portal System

#### 1. Client Portal
- Browse and search product catalog
- Create and manage RFQs (Request for Quotes)
- Review and accept quotes from multiple suppliers
- Track orders and delivery status
- Account management

#### 2. Supplier Portal
- Product listing management with approval workflow
- Receive and respond to RFQs
- Submit competitive quotes
- Order fulfillment tracking
- Performance analytics dashboard

#### 3. Admin Portal
- Product approval workflow
- Quote margin management
- User management (clients & suppliers)
- Logistics and order oversight
- Platform analytics and reporting

## Tech Stack

- **Frontend**: React 19+ with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **State Management**: Zustand with persistence
- **Form Handling**: React Hook Form + Zod
- **Routing**: React Router DOM
- **Icons**: Lucide React + Material Symbols

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
# Copy the example environment file
cp .env.example .env.local

# For mock mode (no database required), leave all variables commented out
# For production mode with Supabase, uncomment and fill in your credentials
```

3. Start development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3000/`

4. Build for production:
```bash
npm run build
```

5. Preview production build:
```bash
npm run preview
```

## Dashboard Smoke Tests (E2E)

These tests validate key dashboard navigation buttons in all three portals.

1. Set credentials in your shell:
```bash
export E2E_ADMIN_EMAIL=\"admin+demo@example.com\"
export E2E_ADMIN_PASSWORD=\"your-admin-password\"
export E2E_CLIENT_EMAIL=\"client+demo@example.com\"
export E2E_CLIENT_PASSWORD=\"your-client-password\"
export E2E_SUPPLIER_EMAIL=\"supplier+demo@example.com\"
export E2E_SUPPLIER_PASSWORD=\"your-supplier-password\"
```

2. Run smoke tests:
```bash
npm run e2e:smoke
```

Optional:
```bash
npm run e2e:smoke:headed
```

## Demo / Test Accounts

This repository does not ship production credentials.

- For local development without Supabase, use mock mode (`VITE_FORCE_MOCK_MODE=true`).
- For staging/e2e, create dedicated test users in your Supabase project and provide credentials via environment variables.

## Core Workflows

### RFQ (Request for Quote) Flow
1. **Client** creates RFQ with product requirements
2. **Supplier** receives RFQ and submits quote with pricing
3. **Admin** reviews quote and sets margin
4. **Client** receives final price and can accept/reject
5. **Order** is created upon acceptance

### Product Approval Flow
1. **Supplier** submits product listing
2. **Admin** reviews and approves/rejects
3. **Approved products** appear in client catalog

## Architecture

The application is built with scalability in mind:

- **Component-based architecture** for reusability
- **Centralized state management** with Zustand
- **Type-safe** with full TypeScript coverage
- **API service layer** ready for backend integration
- **Error boundaries** for graceful error handling
- **Toast notifications** for user feedback

## License

Proprietary - All rights reserved
