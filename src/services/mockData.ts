import { Product, RFQ, Quote, User, UserRole, Order, OrderStatus, PaymentStatus } from '../types/types';

export const USERS: User[] = [
  { id: 'u1', name: 'John Client', email: 'client+demo@example.com', role: UserRole.CLIENT, companyName: 'Tech Solutions Ltd', verified: true, publicId: 'Client-8492', status: 'ACTIVE', dateJoined: '2023-01-10' },
  { id: 'u2', name: 'Sarah Supplier', email: 'supplier+demo@example.com', role: UserRole.SUPPLIER, companyName: 'Global Parts Inc', verified: true, publicId: 'Supplier-3921', rating: 4.8, status: 'APPROVED', kycStatus: 'VERIFIED', dateJoined: '2023-01-15' },
  { id: 'u3', name: 'Admin Alice', email: 'admin+demo@example.com', role: UserRole.ADMIN, companyName: 'mwrd HQ', verified: true },
  // Additional Suppliers for Quote comparison
  { id: 'u4', name: 'Indie Parts Co', email: 'indie@mwrd.com', role: UserRole.SUPPLIER, companyName: 'Indie Parts Co', verified: true, publicId: 'Supplier-1102', rating: 4.5, status: 'APPROVED', kycStatus: 'VERIFIED', dateJoined: '2023-05-20' },
  { id: 'u5', name: 'Teal Tech Supplies', email: 'teal@mwrd.com', role: UserRole.SUPPLIER, companyName: 'Teal Tech', verified: true, publicId: 'Supplier-8854', rating: 4.9, status: 'APPROVED', kycStatus: 'VERIFIED', dateJoined: '2023-06-10' },
  // New Suppliers for Product Approval Demo
  { id: 'sup_flexi', name: 'Flexi Rep', email: 'sales@flexistands.com', role: UserRole.SUPPLIER, companyName: 'FlexiStands Inc.', verified: true, publicId: 'Supplier-9012', status: 'APPROVED', kycStatus: 'VERIFIED', dateJoined: '2023-08-05' },
  { id: 'sup_tech', name: 'Tech Rep', email: 'sales@techperipherals.com', role: UserRole.SUPPLIER, companyName: 'Tech Peripherals', verified: true, publicId: 'Supplier-3456', status: 'APPROVED', kycStatus: 'VERIFIED', dateJoined: '2023-09-12' },
  { id: 'sup_vision', name: 'Vision Rep', email: 'sales@vision.com', role: UserRole.SUPPLIER, companyName: 'Vision Electronics', verified: true, publicId: 'Supplier-7890', status: 'APPROVED', kycStatus: 'VERIFIED', dateJoined: '2023-09-30' },
  // New Suppliers for Supplier Management View
  {
    id: 'sup_global_imports',
    name: 'Global Admin',
    email: 'admin@globalimports.com',
    role: UserRole.SUPPLIER,
    companyName: 'Global Imports Inc.',
    verified: true,
    publicId: 'Supplier-5543',
    status: 'APPROVED',
    kycStatus: 'VERIFIED',
    dateJoined: '2023-10-26'
  },
  {
    id: 'sup_creative',
    name: 'Creative Admin',
    email: 'admin@creative.com',
    role: UserRole.SUPPLIER,
    companyName: 'Creative Solutions LLC',
    verified: false,
    publicId: 'Supplier-2211',
    status: 'PENDING',
    kycStatus: 'IN_REVIEW',
    dateJoined: '2023-10-25'
  },
  {
    id: 'sup_tech_inno',
    name: 'Tech Innovator',
    email: 'admin@techinno.com',
    role: UserRole.SUPPLIER,
    companyName: 'Tech Innovators Co.',
    verified: false,
    publicId: 'Supplier-6677',
    status: 'REJECTED',
    kycStatus: 'REJECTED',
    dateJoined: '2023-10-24'
  },
  {
    id: 'sup_national',
    name: 'National Rep',
    email: 'admin@national.com',
    role: UserRole.SUPPLIER,
    companyName: 'National Supplies',
    verified: true,
    publicId: 'Supplier-9988',
    status: 'APPROVED',
    kycStatus: 'VERIFIED',
    dateJoined: '2023-10-23'
  },
  {
    id: 'sup_sunrise',
    name: 'Sunrise Rep',
    email: 'admin@sunrise.com',
    role: UserRole.SUPPLIER,
    companyName: 'Sunrise Goods',
    verified: true,
    publicId: 'Supplier-4433',
    status: 'REQUIRES_ATTENTION',
    kycStatus: 'INCOMPLETE',
    dateJoined: '2023-10-22'
  },
  // New Clients for Client Management View
  {
    id: 'cli_eleanor',
    name: 'Eleanor Vance',
    email: 'eleanor@innovate.com',
    role: UserRole.CLIENT,
    companyName: 'Innovate Inc.',
    verified: true,
    publicId: 'Client-1001',
    status: 'ACTIVE',
    dateJoined: '2023-10-26'
  },
  {
    id: 'cli_marcus',
    name: 'Marcus Thorne',
    email: 'marcus.t@quantum.com',
    role: UserRole.CLIENT,
    companyName: 'Quantum Solutions',
    verified: false,
    publicId: 'Client-1002',
    status: 'PENDING',
    dateJoined: '2023-10-25'
  },
  {
    id: 'cli_isabella',
    name: 'Isabella Rossi',
    email: 'i.rossi@apexlog.co',
    role: UserRole.CLIENT,
    companyName: 'Apex Logistics',
    verified: true,
    publicId: 'Client-1003',
    status: 'ACTIVE',
    dateJoined: '2023-10-24'
  },
  {
    id: 'cli_julian',
    name: 'Julian Croft',
    email: 'j.croft@synergy.org',
    role: UserRole.CLIENT,
    companyName: 'Synergy Corp',
    verified: false,
    publicId: 'Client-1004',
    status: 'DEACTIVATED',
    dateJoined: '2023-10-22'
  },
  {
    id: 'cli_sofia',
    name: 'Sofia Reyes',
    email: 'sofia.reyes@stellar.io',
    role: UserRole.CLIENT,
    companyName: 'Stellar Goods',
    verified: true,
    publicId: 'Client-1005',
    status: 'ACTIVE',
    dateJoined: '2023-10-21'
  }
];

export const PRODUCTS: Product[] = [
  {
    id: 'p1',
    supplierId: 'u2',
    name: 'Precision Runner X1',
    description: 'High-performance athletic footwear for professional runners. Features advanced shock absorption and breathable mesh.',
    category: 'Office',
    subcategory: 'Stationery',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBR5ncvprCv9G5oAanb8H-Chh74YQ4-fcEl4WoEg_jnOFdE_ThsFrFykYpYnLvx8Qa7m-nsTp30-rHGlFLCp0kflx2OgUgvJ_tOsS9OnP8PlKzFYAAd4CdOgFHDeDpq4K4pQvZT91BgyX85qB0orpi69cAE4uEl3T_V9KAvYEVV-EtvhYs8s1A2tNagAShhL0YTia-Etomw7GVpKGMB3-vaveJ9dCH3vqVnZF0niPSI9WpMUVDlgcUxV8l14Ylk-sWA2kUW5Bu1SsZE',
    status: 'APPROVED',
    supplierPrice: 5,
    retailPrice: 7,
    sku: 'OFF-STN-001'
  },
  {
    id: 'p2',
    supplierId: 'u2',
    name: 'HP EliteBook 840',
    description: 'High-performance business laptop with Intel Core i7, 16GB RAM, and 512GB SSD.',
    category: 'IT Supplies',
    subcategory: 'Laptops',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCrA45Lx0CmRHDAUu93sfEBmtcinYJjB3t7AkMnbosTvwbfT7Ak636l50EvjvbDB2Q0avBwvJhq-LQNMPQoB47zRV2IZPg58sRKv1WDXh5iJS2MGY0zvGQfwUXffxyriKupL2hkO6fUT96z3zHTFV6gN9SHxM3QtzX7Nkb3AvISda3Mh9vivioVCZ9S_LVsn6REX6KHPMVdhS-wgbxLvdTTas4d3c3Ny19sbxc9IGS-4s3OtbRkQ9j28uX31j-HZXcsLh1O_R86q7_D',
    status: 'APPROVED',
    supplierPrice: 950,
    retailPrice: 1050,
    sku: 'IT-LPT-840'
  },
  {
    id: 'p3',
    supplierId: 'u2',
    name: 'Premium Coffee Beans (1kg)',
    description: 'Rich arabica coffee beans for office machines. Roasted to perfection.',
    category: 'Breakroom',
    subcategory: 'Beverages',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDOfTeazFg55snS3vEmQWRVVSEmCy4JSt3WGEmkhrRfS8yDyv7cYIWVI-8FnFWqGjWmlXfndlXRuC85LArvsGxIjKwwowZZzF9rSHhQZTvx-KfRE3bi1NXo_gh4qboKEdAUayvcTM4qEC7e5lVcS9RkBSjNbgkERg8LDChXVSi1PpppQ6lr5JtgxzyYKK8Mnb075r84-qIJY6RvFrG7vM_W05NdyldAsZOZdxK8ju6cfXZ2J-KTVuQ7UTheW2r7dtRWIbHaVQ0wq2jp',
    status: 'APPROVED',
    supplierPrice: 15,
    retailPrice: 20,
    sku: 'BRK-COF-001'
  },
  {
    id: 'p4',
    supplierId: 'u2',
    name: 'Industrial Cleaner (5L)',
    description: 'Heavy-duty floor cleaner for industrial and office use.',
    category: 'Janitorial',
    subcategory: 'Chemicals',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAAe4WQ7skNch4qNgVx3MtWM0Rh1CnopkG3R-e_7AT5RDslXC73yyxugJQ2cUOAV7pofvS3rS1WCnrjvYtwgUfkf7GHhOtduA9Zn3NiOVZ3oDQa_F_QnFD1SE3P8-rivfh1780gOyL8PbfEIfL1nnvNDwA9CK4sW-f9QNSSZanYlrizrIU2oqdO2QiN0uPd_el6tukc_KZW8XXQWtBQmz2lpWhEfBRokMV_bjDJtiVWKf9OgZh8te1CB51xTi2L_Vc63dVsbctsTnAl',
    status: 'APPROVED',
    supplierPrice: 12,
    retailPrice: 18,
    sku: 'JAN-CLN-005'
  },
  {
    id: 'p5',
    supplierId: 'u2',
    name: 'DeWalt Cordless Drill',
    description: '18V XR Brushless Compact Drill Driver with 2.0Ah XR Li-Ion Battery Technology.',
    category: 'Maintenance',
    subcategory: 'Tools',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB9ONkf_o0OXAtOyBIxE5HoO5v4i4X-V8pRDe1d1CyA1WevscjwWG0m9Mo3ELzUqUfySGT4sygVIONsK5Gbddpf9g-IsPCt4dHosyEDhwuh3rx3q81B4DUI5QZ5Z8d_MGfuxaB0pQQ9v643i2tsEBK1hN5dSgX-EYSubS3vyYH2hoFJlJJ4jmCICRbc6wwJLtvhJfpPCmHNx-0O8N0D32RxdHHIGKHkUPU7XBTQX3s3DCKNo5-1n_o_FrGkWPCvzkOO3kzjVwrlp4GQ',
    status: 'APPROVED',
    supplierPrice: 85,
    retailPrice: 110,
    sku: 'MNT-DRL-018'
  },
  {
    id: 'p6',
    supplierId: 'u2',
    name: 'A4 Copy Paper (Box)',
    description: 'High-quality 80gsm A4 paper for printing and scanning. 5 reams per box.',
    category: 'Office',
    subcategory: 'Paper',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDF-WNYGYS9AHUKD8JQTKEy6W-MzG4E3avCP1IyPdiiN6m-UbqOD4OgxUFN8_z-C62moYDdLNAq5fvhqLqGXB3vf_GuBKXRM8pW88ZVp5hfgN6n7it4kLhq0NhDc0OTlzDjnSO2DKRqx3oWXXyiSYu9LyNl7CSoT0tUqDHxHc3LiBssnQsC6-PcCrlJjrpbNevE4_9lTxZkqNg-Mic3JpvC_DCyssvwFwMlZK-9yETngJ1UV6QMNv4upfpqbRddL7DY7dOLz7Qvvglk',
    status: 'APPROVED',
    supplierPrice: 20,
    retailPrice: 28,
    sku: 'OFF-PPR-0A4'
  },
  // Industrial Items (Rebranded to Maintenance or kept as Industrial for depth)
  {
    id: 'ind1',
    supplierId: 'u2',
    name: 'Centrifugal Pump',
    description: 'High-efficiency industrial pump.',
    category: 'Maintenance',
    subcategory: 'Pumps',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCnEVoc3ZiA4axQ_zAuRs0_hFZKoSwsiSiefBuKzOfvRxXgZovA6kSfZSut1vOEhS_wX7nnfr_aw-AoKEDggwXGiNZRnLYjoP1X11quGKii3ju2MYX4wHEtua6L5pNnm15qXQC14t17_TNCZWeHlZyjE4Up07PonZTb2w7-tMwOGSnx-imXEi8SO-XQOO5fR8AZ_on0Unv_iINHXPNUCWa7elArSZPE1f53crO4xUEXtBnWvevuxQxkEfQbNdRiI_D8xNEOMWUgD6RD',
    status: 'APPROVED',
    supplierPrice: 450,
    retailPrice: 550,
    sku: 'MNT-PMP-001'
  },
  {
    id: 'ind2',
    supplierId: 'u2',
    name: 'Nitrile Safety Gloves',
    description: 'Pack of 100, chemical resistant.',
    category: 'Janitorial',
    subcategory: 'Gloves',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBLq7kjPt_lY9J_WTN0ECS9bQ1O2gda-SHFGz7JxZUBYiPuGvwr33Ig-Pbew4vc97ARpWoUWOwJdlHpInuAiBzI6-JOWGDViIqAB3R0DT8PrJUfEvn5h67szLQRk86GErPVkgKWqFmNkvGYfceRe4Mo6gXALhSevKE1YRmGFcEYvj-c4Idr7DiGFzjZbWloLQm4I2Oj70rUKmcXUXZf3Wpv7mI-A6982lCWuMURaK0JyGUDqPAac0icMCDnPqHE3Vk4yEYw1hu-26Vy',
    status: 'APPROVED',
    supplierPrice: 25,
    retailPrice: 35,
    sku: 'JAN-GLV-100'
  },
  {
    id: 'ind3',
    supplierId: 'u2',
    name: 'Stainless Steel Valve',
    description: 'DN50, PN16 rating.',
    category: 'Maintenance',
    subcategory: 'Valves',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBAzsDOYqk98U4s_0REj1QP4iNj1V4Esg-DRqpFz0YJTYX0q92wc0SbHMU0S2-JtulNJm8gS4YhoBZZ_thHp1oeSgQIvewp1Cav8IQ-PwM1bAJrHErgb1KC-mue-ymgDB6Eu7ju2nZdg4FK74X_7zVuuF3Wl0Q8f-BWS22iy9XAYqwuEDc21dK2W9_Gg5ZbsrX--Chq6fY7WjdQhNRVj14mXmszqk_OHp7Q24NMqCfl9J3qUJW1Ce8y82m9oSOj3N1aDqQ-O600B-uU',
    status: 'APPROVED',
    supplierPrice: 120,
    retailPrice: 160,
    sku: 'MNT-VLV-050'
  },
  {
    id: 'ind4',
    supplierId: 'u2',
    name: 'Ethernet Cable (50m)',
    description: 'Cat6 Ethernet cable for high-speed networking.',
    category: 'IT Supplies',
    subcategory: 'Cables',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDQMd5K3hNmaGZugzGKBaViXJLdbM26ytmd80m6yVE9jaLaHGjlt67YiO70FvkxNtWAd5cG1FUvmFvvQhov52PuaZ4Chqs6Efv-hqN-cudou6vWga8Rb5HTCZHDKXVFRFkNBnfDDDVPmT7CHmFtAJHVS9gBm42izAwi7I8DOEAK8E-qZH9fxoQ8TcqQ0yDusylXJLMiLjpLRPjmhUzrhly31NCx_X9D8H1IT8KAVoRryrWT1FJptLPxcWwmDkRgUMa04x-YW3wXTUVs',
    status: 'APPROVED',
    supplierPrice: 30,
    retailPrice: 45,
    sku: 'IT-CBL-050'
  },
  // Pending Items for Approval Demo
  {
    id: 'pend1',
    supplierId: 'sup_flexi',
    name: 'Ergonomic Mesh Chair',
    description: 'Adjustable ergonomic office chair with breathable mesh back.',
    category: 'Office',
    subcategory: 'Furniture',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA5eBQQZ5-5WsNQRO4I4M9CVO7r92_zBZuTklqz_-dTQxjAvWUw70LajcwE1iQFiTApbsSndzDKNTvW5N2i4HZIDlvU3yrTdYjrJBzQMEcpAtDr6i8RvwugNDPXL3YA_h-r6aHZwsJ4zwJmbx8ARn4XbZVvWIEA6nZcSWHL6FVRT9RlaOA5kG1FCarffkqv1Kwwh82qvFv8xx8-8I3Y_uVH5BY8mdyefmlm1eH2LiObbyBqDs135L5Y1GEwDo9bcr3guMCHsquPbwDF',
    status: 'PENDING',
    supplierPrice: 180.00,
    retailPrice: 220,
    sku: 'OFF-CH-1024'
  },
  {
    id: 'pend2',
    supplierId: 'sup_tech',
    name: 'Wireless Ergo Mouse',
    description: 'Vertical wireless mouse designed to reduce wrist strain.',
    category: 'IT Supplies',
    subcategory: 'Peripherals',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAepAo5uSwYdLgtvVQglDsMVWVI14p30eeabCrMeJiQqpH3YD8NHYVDdY3i01jsoaxylszZV9jO_IHBwa9SS5tXu67wQFJ_YuubZOO7iV_tIzYeljlDRnRu0EmQ_lWHfm35nCEndmYqxumz6I0kuL6c9oeRy2NJNCBB7HZMGtMP7y4QVofp-bjnew6AisfAwcVzkCU6iuKOPo_9XcYzFlNEAokwJqqyAZbuzscgJeJ5VRnIO66ivKfGtCTYU4d3Eb6V9ZIpt3YdTTJ8',
    status: 'PENDING',
    supplierPrice: 75.50,
    retailPrice: 90,
    sku: 'IT-MS-5501'
  },
  {
    id: 'pend3',
    supplierId: 'sup_flexi',
    name: 'Adjustable Standing Desk',
    description: 'Electric standing desk with dual motors and memory presets.',
    category: 'Office',
    subcategory: 'Desks',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC65PrZWYkEYTWeRAncFd-mgpe9RaXunzuZKGQSHuGBRRRGHyEGgNl4WeK6uAiDapXOFIpL3BhYHbbuKP5yvPXbu-zyEs02HZ06SlGN5lyqB7Jjf7CiylFi6vshUZXGH9af4_6d8vqSXoBfDJeiBJwDTpCcYUwT2zlIeCoLszlEBSV7w8GqZmzDqm9xc7njxEXlXrnYNu44miUkOhYhQEvxePRkIlQCUYBb2UmPvwiamTstA-NZmJZggwPTqBOqsvGhZiCnR8DqeECE',
    status: 'PENDING',
    supplierPrice: 320.00,
    retailPrice: 400,
    sku: 'OFF-DK-3080'
  },
  {
    id: 'pend4',
    supplierId: 'sup_vision',
    name: '4K UHD 27" Monitor',
    description: 'Professional grade IPS monitor with 100% sRGB color accuracy.',
    category: 'IT Supplies',
    subcategory: 'Monitors',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBBVmNY_yXqvmJlcDdWhCpu4AD301dyWxrL5KxwKY-Xbz2Cszkcd1SPDcy1nlYM88UKU_l8B_RQaYFrFfLK1Chz1uGT1VSoVuvOOHWNu8MVanAe3h1D7TADsBAlILofF1i23_zn8k60GOuDuGCsPUKRw_uVSqCVAmFlRWSQ-TCI66iV7V4aU3PdXuTZREDZpWo9GKKucl9wDQR2UQWBBTAsulMgtBS8G-XfSbH4VnoQ9E3UAWYoa-iwFU2e0dCh5ZXIqrwO5gOA_fgs',
    status: 'PENDING',
    supplierPrice: 299.99,
    retailPrice: 350,
    sku: 'IT-MN-9001'
  }
];

export const RFQS: RFQ[] = [
  { id: 'r1', clientId: 'u1', items: [{ productId: 'p1', quantity: 50, notes: 'Urgent delivery required' }], status: 'OPEN', date: '2023-10-25', createdAt: '2023-10-25T10:00:00Z' },
  { id: 'r2', clientId: 'u1', items: [{ productId: 'p2', quantity: 10, notes: '' }], status: 'QUOTED', date: '2023-10-20', createdAt: '2023-10-20T14:30:00Z' },
  { id: 'r3', clientId: 'u1', items: [{ productId: 'p3', quantity: 25, notes: 'Standard packaging' }, { productId: 'p4', quantity: 5, notes: '' }], status: 'CLOSED', date: '2023-09-15', createdAt: '2023-09-15T09:15:00Z' },
];

export const QUOTES: Quote[] = [
  { id: 'q1', rfqId: 'r2', supplierId: 'u2', supplierPrice: 1200, leadTime: '14 Days', marginPercent: 10, finalPrice: 1320, status: 'SENT_TO_CLIENT' },
  // Additional quotes for r2
  { id: 'q3', rfqId: 'r2', supplierId: 'u4', supplierPrice: 1150, leadTime: '10 Days', marginPercent: 12, finalPrice: 1288, status: 'SENT_TO_CLIENT' },
  { id: 'q4', rfqId: 'r2', supplierId: 'u5', supplierPrice: 1250, leadTime: '7 Days', marginPercent: 8, finalPrice: 1350, status: 'SENT_TO_CLIENT' },
  // Other quotes
  { id: 'q2', rfqId: 'r3', supplierId: 'u2', supplierPrice: 5500, leadTime: '5 Days', marginPercent: 15, finalPrice: 6325, status: 'ACCEPTED' },
];

export const ORDERS: Order[] = [
  {
    id: 'ORD-9876',
    clientId: 'u1',
    supplierId: 'u2',
    amount: 2450.00,
    status: OrderStatus.IN_TRANSIT,
    paymentStatus: PaymentStatus.CONFIRMED,
    paymentReference: 'MWRD-9876-ABC123',
    paymentConfirmedAt: '2023-10-26',
    date: '2023-10-28'
  },
  {
    id: 'ORD-9877',
    clientId: 'u1',
    supplierId: 'u2',
    amount: 3200.00,
    status: OrderStatus.AWAITING_CONFIRMATION,
    paymentStatus: PaymentStatus.AWAITING_CONFIRMATION,
    paymentReference: 'MWRD-9877-DEF456',
    paymentSubmittedAt: '2023-10-27',
    date: '2023-10-27'
  },
  {
    id: 'ORD-9878',
    clientId: 'u1',
    supplierId: 'u4',
    amount: 1850.00,
    status: OrderStatus.PENDING_PAYMENT,
    paymentStatus: PaymentStatus.PENDING,
    date: '2023-10-29'
  },
  {
    id: 'ORD-9875',
    clientId: 'u1',
    supplierId: 'u2',
    amount: 1120.50,
    status: OrderStatus.DELIVERED,
    paymentStatus: PaymentStatus.CONFIRMED,
    paymentReference: 'MWRD-9875-GHI789',
    paymentConfirmedAt: '2023-10-10',
    date: '2023-10-15'
  },
  {
    id: 'ORD-9874',
    clientId: 'u1',
    supplierId: 'u5',
    amount: 5800.00,
    status: OrderStatus.CANCELLED,
    date: '2023-10-01',
    system_po_generated: false,
    client_po_uploaded: false,
    admin_verified: false
  },
  {
    id: 'ORD-9880',
    clientId: 'u1',
    supplierId: 'u2',
    amount: 1500.00,
    status: OrderStatus.READY_FOR_PICKUP,
    paymentStatus: PaymentStatus.CONFIRMED,
    paymentReference: 'MWRD-9880-XYZ789',
    paymentConfirmedAt: '2023-10-30',
    date: '2023-10-30',
    system_po_generated: true,
    client_po_uploaded: true,
    admin_verified: true,
    items: [{ productId: 'p1', quantity: 20 }]
  }
];