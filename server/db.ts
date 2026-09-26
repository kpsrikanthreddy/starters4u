import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { INITIAL_MENU } from '../src/data/menuData.js';

dotenv.config();

const { Pool } = pg;

// Detect database connection URL from environment variables
const DATABASE_URL = process.env.DATABASE_URL;

let pool: pg.Pool | null = null;
let isPostgresActive = false;

// Default admin bcrypt hash (cost 10) for PIN 8888
const DEFAULT_ADMIN_BCRYPT = bcrypt.hashSync('8888', 10);

// Global declarations for serverless / warm invocation reuse
declare global {
  var __pgPool: pg.Pool | undefined;
  var __isPostgresActive: boolean | undefined;
  var __dbInitPromise: Promise<{ success: boolean; mode: string; error?: string }> | undefined;
}

// Reusable Database connection module with global caching for serverless environments
export function getDbPool(): pg.Pool | null {
  if (globalThis.__pgPool) {
    return globalThis.__pgPool;
  }

  if (!DATABASE_URL) {
    console.info('[DB] DATABASE_URL not detected in environment variables. Running with in-memory persistence fallback.');
    return null;
  }

  try {
    const isLocal = DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1');
    const newPool = new Pool({
      connectionString: DATABASE_URL,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: parseInt(process.env.PG_MAX_POOL || '10', 10), // Max clients in pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    newPool.on('error', (err) => {
      console.error('[DB] Unexpected error on idle PostgreSQL client:', err);
    });

    globalThis.__pgPool = newPool;
    return newPool;
  } catch (err) {
    console.error('[DB] Failed to initialize PostgreSQL pool:', err);
    return null;
  }
}

// In-Memory Multi-Tenant Store for Fallback / Local Simulation Mode
export interface InMemoryDbState {
  restaurants: any[];
  restaurant_branches: any[];
  restaurant_users: any[];
  restaurant_tables: any[];
  customers: any[];
  menu_categories: any[];
  menu_items: any[];
  orders: any[];
  order_items: any[];
  order_status_history: any[];
  payments: any[];
  kots: any[];
  qr_codes: any[];
  subscriptions: any[];
  print_devices: any[];
  printer_configurations: any[];
  print_jobs: any[];
  print_job_attempts: any[];
  device_pairing_codes: any[];
  customer_inquiries?: any[];
  distributed_rate_limits?: any[];
  restaurant_settings?: any[];
  restaurant_payment_settings?: any[];
  restaurant_onboarding?: any[];
  payment_transactions?: any[];
  payment_splits?: any[];
  settlements?: any[];
  payment_webhook_events?: any[];
  platform_pricing_config?: any[];
  payment_settings_audit?: any[];
  payment_attempts?: any[];
  inventory_items?: any[];
  inventory_transactions?: any[];
}

export const inMemoryDb: InMemoryDbState = {
  restaurants: [
    {
      id: 'a0000000-0000-0000-0000-000000000001',
      name: 'MOZZ Chinese & Pizzateria',
      slug: 'mozz',
      phone: '+91 98450 12345',
      email: 'contact@mozzpizzateria.com',
      logo_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=200',
      tagline: 'Korean-Style Pocket Pizzas & Indo-Chinese Delicacies',
      currency: 'INR',
      tax_rate: 5.0,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'a0000000-0000-0000-0000-000000000002',
      name: 'Starters4U Test Kitchen',
      slug: 'test-restaurant',
      phone: '+919876543210',
      email: 'admin@testrestaurant.com',
      logo_url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200',
      tagline: 'Experimental Craft Dishes & Starters',
      currency: 'INR',
      tax_rate: 5.0,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'a0000000-0000-0000-0000-000000000003',
      name: 'Royal Biryani & Kebabs',
      slug: 'royal-biryani',
      phone: '+919988776655',
      email: 'contact@royalbiryani.in',
      logo_url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=200',
      tagline: 'Authentic Hyderabadi Dum Biryani & Charcoal Grilled Kebabs',
      currency: 'INR',
      tax_rate: 5.0,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'a0000000-0000-0000-0000-000000000004',
      name: 'Dakshin Delights Tiffins',
      slug: 'dakshin-delights',
      phone: '+919844112233',
      email: 'hello@dakshindelights.com',
      logo_url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=200',
      tagline: 'Crispy Ghee Dosas, Steamy Idlis & Traditional Filter Coffee',
      currency: 'INR',
      tax_rate: 5.0,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  restaurant_branches: [
    {
      id: 'b0000000-0000-0000-0000-000000000001',
      restaurant_id: 'a0000000-0000-0000-0000-000000000001',
      name: 'MOZZ Chinese & Pizzateria - Gachibowli',
      slug: 'main-outlet',
      address: 'Plot no 31, Vinayak Nagar, Indira Nagar, Gachibowli, Hyderabad, Telangana',
      latitude: 17.442509,
      longitude: 78.353966,
      delivery_radius_km: 12.0,
      phone: '+91 98450 12345',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'b0000000-0000-0000-0000-000000000002',
      restaurant_id: 'a0000000-0000-0000-0000-000000000002',
      name: 'Test Kitchen - Hitec City',
      slug: 'hitec-city',
      address: 'Cyber Towers Rd, Hitec City, Hyderabad, Telangana',
      latitude: 17.4504,
      longitude: 78.3811,
      delivery_radius_km: 8.0,
      phone: '+919876543210',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'b0000000-0000-0000-0000-000000000003',
      restaurant_id: 'a0000000-0000-0000-0000-000000000003',
      name: 'Royal Biryani - Kondapur',
      slug: 'kondapur',
      address: 'RTA Road, Near Botanical Garden, Kondapur, Hyderabad, Telangana',
      latitude: 17.4642,
      longitude: 78.3567,
      delivery_radius_km: 10.0,
      phone: '+919988776655',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'b0000000-0000-0000-0000-000000000004',
      restaurant_id: 'a0000000-0000-0000-0000-000000000004',
      name: 'Dakshin Delights - Madhapur',
      slug: 'madhapur',
      address: 'Near Ayyappa Society Main Rd, Madhapur, Hyderabad, Telangana',
      latitude: 17.4483,
      longitude: 78.3915,
      delivery_radius_km: 9.0,
      phone: '+919844112233',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  restaurant_users: [
    {
      id: 'c0000000-0000-0000-0000-000000000001',
      restaurant_id: 'a0000000-0000-0000-0000-000000000001',
      branch_id: 'b0000000-0000-0000-0000-000000000001',
      name: 'Store Manager (Admin)',
      email: 'admin@mozzpizzateria.com',
      phone: '+91 98450 12345',
      role: 'admin',
      pin_hash: DEFAULT_ADMIN_BCRYPT,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  restaurant_tables: Array.from({ length: 20 }, (_, i) => ({
    id: `00000000-0000-0000-0000-0000000000${String(i + 1).padStart(2, '0')}`,
    restaurant_id: 'a0000000-0000-0000-0000-000000000001',
    branch_id: 'b0000000-0000-0000-0000-000000000001',
    table_number: String(i + 1),
    table_name: `Table ${i + 1}`,
    capacity: i === 19 ? 12 : i >= 7 && i <= 8 ? 8 : 4,
    qr_token_id: `qr-token-tbl-${i + 1}`,
    is_active: true,
    created_at: new Date().toISOString(),
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `test-tbl-${i + 1}`,
    restaurant_id: 'a0000000-0000-0000-0000-000000000002',
    branch_id: 'b0000000-0000-0000-0000-000000000002',
    table_number: String(i + 1),
    table_name: `Table ${i + 1}`,
    capacity: 4,
    qr_token_id: `qr-token-test-tbl-${i + 1}`,
    is_active: true,
    created_at: new Date().toISOString(),
  })),
  customers: [],
  menu_categories: [
    { id: 'cat-1', restaurant_id: 'a0000000-0000-0000-0000-000000000001', slug: 'pocket_pizza_veg', name: 'Veg Pocket Pizzas', display_order: 1 },
    { id: 'cat-2', restaurant_id: 'a0000000-0000-0000-0000-000000000001', slug: 'pocket_pizza_nonveg', name: 'Non-Veg Pocket Pizzas', display_order: 2 },
    { id: 'cat-3', restaurant_id: 'a0000000-0000-0000-0000-000000000001', slug: 'dessert_pizza', name: 'Dessert Pocket Pizzas', display_order: 3 },
    { id: 'cat-4', restaurant_id: 'a0000000-0000-0000-0000-000000000001', slug: 'chinese_starters', name: 'Chinese Starters', display_order: 4 },
    { id: 'cat-5', restaurant_id: 'a0000000-0000-0000-0000-000000000001', slug: 'fried_rice', name: 'Fried Rice Delights', display_order: 5 },
    { id: 'cat-6', restaurant_id: 'a0000000-0000-0000-0000-000000000001', slug: 'noodles', name: 'Wok Tossed Noodles', display_order: 6 },
    { id: 'cat-7', restaurant_id: 'a0000000-0000-0000-0000-000000000001', slug: 'maggie', name: 'Fusion Maggie Bowls', display_order: 7 },
    { id: 'cat-8', restaurant_id: 'a0000000-0000-0000-0000-000000000001', slug: 'momos', name: 'Steamed & Fried Momos', display_order: 8 },
    { id: 'cat-9', restaurant_id: 'a0000000-0000-0000-0000-000000000001', slug: 'drinks', name: 'Chilled Beverages', display_order: 9 },
    { id: 'cat-tst-1', restaurant_id: 'a0000000-0000-0000-0000-000000000002', slug: 'test_specialties', name: 'Test Specialties', display_order: 1 },
    { id: 'cat-rb-1', restaurant_id: 'a0000000-0000-0000-0000-000000000003', slug: 'biryani', name: 'Hyderabadi Dum Biryani', display_order: 1 },
    { id: 'cat-rb-2', restaurant_id: 'a0000000-0000-0000-0000-000000000003', slug: 'kebabs', name: 'Tandoori Kebabs & Starters', display_order: 2 },
    { id: 'cat-dd-1', restaurant_id: 'a0000000-0000-0000-0000-000000000004', slug: 'dosas', name: 'Crispy Dosas & Uttpams', display_order: 1 },
    { id: 'cat-dd-2', restaurant_id: 'a0000000-0000-0000-0000-000000000004', slug: 'tiffin_classics', name: 'South Indian Tiffin Classics', display_order: 2 },
  ],
  menu_items: [
    ...INITIAL_MENU.map((item) => ({
      id: item.id,
      restaurant_id: 'a0000000-0000-0000-0000-000000000001',
      branch_id: 'b0000000-0000-0000-0000-000000000001',
      category: item.category,
      name: item.name,
      description: item.description,
      dietary_type: item.dietary,
      price: item.price ?? null,
      price_r: item.prices?.R ?? null,
      price_c: item.prices?.C ?? null,
      price_s: item.prices?.S ?? null,
      is_pocket_pizza: !!item.isPocketPizza,
      is_popular: !!item.isPopular,
      is_chef_special: !!item.isChefSpecial,
      spicy_level: item.spicyLevel ?? 0,
      in_stock: item.inStock !== false,
      image_url: item.image ?? null,
      badge: item.badge ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
    {
      id: 'rb-01',
      restaurant_id: 'a0000000-0000-0000-0000-000000000003',
      branch_id: 'b0000000-0000-0000-0000-000000000003',
      category: 'biryani',
      name: 'Special Chicken Dum Biryani',
      description: 'Slow-cooked fragrant basmati rice with tender spiced chicken, saffron and caramelised onions.',
      dietary_type: 'nonveg',
      price: 320,
      price_r: null,
      price_c: null,
      price_s: null,
      is_pocket_pizza: false,
      is_popular: true,
      is_chef_special: true,
      spicy_level: 2,
      in_stock: true,
      image_url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=500',
      badge: 'Bestseller',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'rb-02',
      restaurant_id: 'a0000000-0000-0000-0000-000000000003',
      branch_id: 'b0000000-0000-0000-0000-000000000003',
      category: 'kebabs',
      name: 'Charcoal Paneer Tikka Kebab',
      description: 'Char-grilled cottage cheese cubes marinated in Kashmiri red chilli and hung curd.',
      dietary_type: 'veg',
      price: 260,
      price_r: null,
      price_c: null,
      price_s: null,
      is_pocket_pizza: false,
      is_popular: true,
      is_chef_special: false,
      spicy_level: 1,
      in_stock: true,
      image_url: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=500',
      badge: 'Chef Special',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'dd-01',
      restaurant_id: 'a0000000-0000-0000-0000-000000000004',
      branch_id: 'b0000000-0000-0000-0000-000000000004',
      category: 'dosas',
      name: 'Ghee Podi Masala Dosa',
      description: 'Golden crisp crepe roasted in desi ghee, dusted with spicy gun powder and potato filling.',
      dietary_type: 'veg',
      price: 140,
      price_r: null,
      price_c: null,
      price_s: null,
      is_pocket_pizza: false,
      is_popular: true,
      is_chef_special: true,
      spicy_level: 1,
      in_stock: true,
      image_url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=500',
      badge: 'Popular',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'dd-02',
      restaurant_id: 'a0000000-0000-0000-0000-000000000004',
      branch_id: 'b0000000-0000-0000-0000-000000000004',
      category: 'tiffin_classics',
      name: 'Steamed Idli Sambar (2 Pcs)',
      description: 'Melt-in-mouth fluffy rice cakes served with aromatic drumstick sambar and coconut chutney.',
      dietary_type: 'veg',
      price: 80,
      price_r: null,
      price_c: null,
      price_s: null,
      is_pocket_pizza: false,
      is_popular: false,
      is_chef_special: false,
      spicy_level: 0,
      in_stock: true,
      image_url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=500',
      badge: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'tst-01',
      restaurant_id: 'a0000000-0000-0000-0000-000000000002',
      branch_id: 'b0000000-0000-0000-0000-000000000002',
      category: 'test_specialties',
      name: 'Truffle Mushroom Sliders',
      description: 'Gourmet test sliders with wild mushrooms and truffle aioli.',
      dietary_type: 'veg',
      price: 249,
      price_r: null,
      price_c: null,
      price_s: null,
      is_pocket_pizza: false,
      is_popular: true,
      is_chef_special: true,
      spicy_level: 0,
      in_stock: true,
      image_url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=500',
      badge: 'Test Chef Special',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'tst-02',
      restaurant_id: 'a0000000-0000-0000-0000-000000000002',
      branch_id: 'b0000000-0000-0000-0000-000000000002',
      category: 'test_specialties',
      name: 'Crispy Wasabi Prawns',
      description: 'Tempura battered prawns glazed in mild wasabi honey.',
      dietary_type: 'non-veg',
      price: 299,
      price_r: null,
      price_c: null,
      price_s: null,
      is_pocket_pizza: false,
      is_popular: false,
      is_chef_special: true,
      spicy_level: 1,
      in_stock: true,
      image_url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=500',
      badge: 'Test Exclusive',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  orders: [],
  order_items: [],
  order_status_history: [],
  payments: [],
  kots: [],
  qr_codes: [],
  subscriptions: [
    {
      id: '00000000-0000-0000-0000-000000000001',
      restaurant_id: 'a0000000-0000-0000-0000-000000000001',
      plan_name: 'enterprise_growth',
      status: 'active',
      billing_cycle: 'annual',
      amount: 14999,
      starts_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    },
  ],
  print_devices: [],
  device_pairing_codes: [] as Array<{
    id: string;
    code: string;
    restaurant_id: string;
    branch_id: string;
    created_by_user_id: string;
    expires_at: string;
    is_used: boolean;
    used_at?: string | null;
    used_by_device_id?: string | null;
    created_at: string;
  }>,
  printer_configurations: [],
  print_jobs: [],
  print_job_attempts: [],
  customer_inquiries: [] as any[],
  distributed_rate_limits: [] as any[],
  restaurant_settings: [
    {
      id: 'sett-mozz-1',
      restaurant_id: 'a0000000-0000-0000-0000-000000000001',
      default_branch_id: 'b0000000-0000-0000-0000-000000000001',
      display_name: 'MOZZ Chinese & Pizzateria',
      logo_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=200',
      banner_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1200',
      phone: '+918179620607',
      email: 'contact@mozzpizzateria.com',
      address: 'Plot no 31, Vinayak Nagar, Indira Nagar, Gachibowli, Hyderabad, Telangana',
      latitude: 17.442509,
      longitude: 78.353966,
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      taxRate: 5.0,
      business_hours: { open: '11:00', close: '23:00', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
      is_delivery_enabled: true,
      is_takeaway_enabled: true,
      is_dine_in_enabled: true,
      is_counter_enabled: true,
    },
    {
      id: 'sett-test-1',
      restaurant_id: 'a0000000-0000-0000-0000-000000000002',
      default_branch_id: 'b0000000-0000-0000-0000-000000000002',
      display_name: 'Starters4U Test Kitchen',
      logo_url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200',
      banner_url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200',
      phone: '+919876543210',
      email: 'admin@testrestaurant.com',
      address: 'Cyber Towers Rd, Hitec City, Hyderabad, Telangana',
      latitude: 17.4504,
      longitude: 78.3811,
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      taxRate: 5.0,
      business_hours: { open: '12:00', close: '22:00', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
      is_delivery_enabled: true,
      is_takeaway_enabled: true,
      is_dine_in_enabled: true,
      is_counter_enabled: true,
    },
    {
      id: 'sett-rb-1',
      restaurant_id: 'a0000000-0000-0000-0000-000000000003',
      default_branch_id: 'b0000000-0000-0000-0000-000000000003',
      display_name: 'Royal Biryani & Kebabs',
      logo_url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=200',
      banner_url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=1200',
      phone: '+919988776655',
      email: 'contact@royalbiryani.in',
      address: 'RTA Road, Near Botanical Garden, Kondapur, Hyderabad, Telangana',
      latitude: 17.4642,
      longitude: 78.3567,
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      taxRate: 5.0,
      business_hours: { open: '12:00', close: '23:30', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
      is_delivery_enabled: true,
      is_takeaway_enabled: true,
      is_dine_in_enabled: true,
      is_counter_enabled: true,
    },
    {
      id: 'sett-dd-1',
      restaurant_id: 'a0000000-0000-0000-0000-000000000004',
      default_branch_id: 'b0000000-0000-0000-0000-000000000004',
      display_name: 'Dakshin Delights Tiffins',
      logo_url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=200',
      banner_url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=1200',
      phone: '+919844112233',
      email: 'hello@dakshindelights.com',
      address: 'Near Ayyappa Society Main Rd, Madhapur, Hyderabad, Telangana',
      latitude: 17.4483,
      longitude: 78.3915,
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      taxRate: 5.0,
      business_hours: { open: '07:00', close: '22:30', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
      is_delivery_enabled: true,
      is_takeaway_enabled: true,
      is_dine_in_enabled: true,
      is_counter_enabled: true,
    },
  ] as any[],
  restaurant_payment_settings: [
    {
      id: 'pay-mozz-1',
      restaurant_id: 'a0000000-0000-0000-0000-000000000001',
      is_cash_enabled: true,
      is_upi_enabled: true,
      upi_id: '817962067@okbizaxis',
      direct_upi_enabled: true,
      direct_upi_provider: 'GOOGLE_PAY_BUSINESS',
      merchant_upi_id: '817962067@okbizaxis',
      merchant_display_name: 'MOZZ Chinese & Pizzateria',
      is_online_enabled: true,
      is_razorpay_enabled: true,
      active_payment_mode: 'ALL',
      accepted_currencies: ['INR'],
    },
    {
      id: 'pay-test-1',
      restaurant_id: 'a0000000-0000-0000-0000-000000000002',
      is_cash_enabled: true,
      is_upi_enabled: true,
      upi_id: 'testkitchen@upi',
      is_online_enabled: false,
      is_razorpay_enabled: false,
      active_payment_mode: 'CASH_UPI',
      accepted_currencies: ['INR'],
    },
    {
      id: 'pay-rb-1',
      restaurant_id: 'a0000000-0000-0000-0000-000000000003',
      is_cash_enabled: true,
      is_upi_enabled: true,
      upi_id: 'royalbiryani@upi',
      is_online_enabled: true,
      is_razorpay_enabled: false,
      active_payment_mode: 'CASH_UPI',
      accepted_currencies: ['INR'],
    },
    {
      id: 'pay-dd-1',
      restaurant_id: 'a0000000-0000-0000-0000-000000000004',
      is_cash_enabled: true,
      is_upi_enabled: true,
      upi_id: 'dakshin@upi',
      is_online_enabled: true,
      is_razorpay_enabled: false,
      active_payment_mode: 'CASH_UPI',
      accepted_currencies: ['INR'],
    },
  ] as any[],
  payment_transactions: [] as any[],
  payment_splits: [] as any[],
  settlements: [] as any[],
  payment_webhook_events: [] as any[],
  payment_settings_audit: [] as any[],
  payment_attempts: [] as any[],
  platform_pricing_config: [
    {
      id: 'default',
      price_band_size_rupees: 100,
      markup_step_rupees: 10,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
  ] as any[],
};

// Seed sample orders for immediate richness if in memory
export function seedSampleOrdersInMemory() {
  if (inMemoryDb.orders.length > 0) return;

  const sampleCustId = '00000000-0000-0000-0000-000000000101';
  const sampleOrderId = 'd0000000-0000-0000-0000-000000008901';

  const sampleCustomer = {
    id: sampleCustId,
    restaurant_id: 'a0000000-0000-0000-0000-000000000001',
    name: 'Aditi Verma',
    phone: '9845012345',
    email: 'aditi.verma@example.com',
    address: 'Villa 12, Green Park Avenue',
    landmark: 'Next to Central Bank',
    created_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
  };
  inMemoryDb.customers.push(sampleCustomer);

  const sampleOrder = {
    id: sampleOrderId,
    order_number: 'MOZZ-8901',
    restaurant_id: 'a0000000-0000-0000-0000-000000000001',
    branch_id: 'b0000000-0000-0000-0000-000000000001',
    customer_id: sampleCustId,
    order_type: 'delivery',
    entry_source: 'online_web',
    table_id: null,
    table_number: null,
    status: 'out_for_delivery',
    payment_method: 'gpay',
    payment_status: 'paid',
    payment_id: 'pay_MOZZ_sim_8901',
    item_total: 557,
    tax: 27.85,
    delivery_fee: 0,
    discount: 50,
    coupon_code: 'KOREANLOVE',
    grand_total: 534.85,
    estimated_delivery_time_minutes: 12,
    kot_number: 'KOT-8901',
    kot_station: 'All Stations',
    driver_name: 'Suresh Kumar',
    driver_phone: '9876011223',
    driver_vehicle: 'TS 09 EZ 4521 (Electric Bike)',
    customer_snapshot: {
      name: 'Aditi Verma',
      phone: '9845012345',
      address: 'Villa 12, Green Park Avenue',
      landmark: 'Next to Central Bank',
    },
    created_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
  };
  inMemoryDb.orders.push(sampleOrder);

  inMemoryDb.order_items.push(
    {
      id: '00000000-0000-0000-0000-000000000101',
      order_id: sampleOrderId,
      restaurant_id: 'a0000000-0000-0000-0000-000000000001',
      menu_item_id: 'vp-1',
      item_name: 'Cheesy Margherita',
      quantity: 2,
      unit_price: 189,
      selected_shape: 'R',
      selected_crust: 'Korean Pocket Crust',
      spice_level: 'Mild',
      addons: [{ id: 'cheese_burst', name: 'Extra Korean In-House Cheese Blend', price: 40 }],
      special_instructions: '',
      created_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    },
    {
      id: '00000000-0000-0000-0000-000000000102',
      order_id: sampleOrderId,
      restaurant_id: 'a0000000-0000-0000-0000-000000000001',
      menu_item_id: 'cs-1',
      item_name: 'Chilli Chicken Dry (Indo-Chinese)',
      quantity: 1,
      unit_price: 179,
      selected_shape: null,
      selected_crust: null,
      spice_level: 'Medium',
      addons: [],
      special_instructions: '',
      created_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    }
  );

  inMemoryDb.order_status_history.push(
    { id: '00000000-0000-0000-0000-000000000111', order_id: sampleOrderId, restaurant_id: 'a0000000-0000-0000-0000-000000000001', status: 'placed', note: 'Order placed via Razorpay UPI', created_at: new Date(Date.now() - 1000 * 60 * 18).toISOString() },
    { id: '00000000-0000-0000-0000-000000000112', order_id: sampleOrderId, restaurant_id: 'a0000000-0000-0000-0000-000000000001', status: 'confirmed', note: 'Kitchen accepted order', created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString() },
    { id: '00000000-0000-0000-0000-000000000113', order_id: sampleOrderId, restaurant_id: 'a0000000-0000-0000-0000-000000000001', status: 'baking', note: 'Baking Rectangular Pocket Pizzas', created_at: new Date(Date.now() - 1000 * 60 * 12).toISOString() },
    { id: '00000000-0000-0000-0000-000000000114', order_id: sampleOrderId, restaurant_id: 'a0000000-0000-0000-0000-000000000001', status: 'packing', note: 'Quality check and sealed in thermal box', created_at: new Date(Date.now() - 1000 * 60 * 6).toISOString() },
    { id: '00000000-0000-0000-0000-000000000115', order_id: sampleOrderId, restaurant_id: 'a0000000-0000-0000-0000-000000000001', status: 'out_for_delivery', note: 'Delivery rider Suresh picked up the order', created_at: new Date(Date.now() - 1000 * 60 * 2).toISOString() }
  );

  inMemoryDb.kots.push({
    id: '00000000-0000-0000-0000-000000000121',
    restaurant_id: 'a0000000-0000-0000-0000-000000000001',
    branch_id: 'b0000000-0000-0000-0000-000000000001',
    order_id: sampleOrderId,
    kot_number: 'KOT-8901',
    station: 'All Stations',
    print_count: 1,
    status: 'active',
    created_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
  });

  if (!inMemoryDb.customer_inquiries || inMemoryDb.customer_inquiries.length === 0) {
    inMemoryDb.customer_inquiries = [
      {
        id: 'INQ-SAMPLE-01',
        restaurant_id: 'a0000000-0000-0000-0000-000000000001',
        branch_id: 'b0000000-0000-0000-0000-000000000001',
        name: 'Pooja Hegde',
        phone: '+919845098765',
        order_id: 'MOZZ-8901',
        message: 'Can I add extra Korean garlic dip to my active order MOZZ-8901? Called the kitchen earlier.',
        status: 'in_review',
        ip_hash: '9f86d081884c7d659a2feaa0c55ad015',
        user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
        created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
        updated_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      },
      {
        id: 'INQ-SAMPLE-02',
        restaurant_id: 'a0000000-0000-0000-0000-000000000001',
        branch_id: 'b0000000-0000-0000-0000-000000000001',
        name: 'Vikram Mehta',
        phone: '+919811223344',
        order_id: null,
        message: 'Do you offer custom party catering for 30 people on Saturday evening with your rectangular crusts?',
        status: 'new',
        ip_hash: '4b227777d4dd1fc61c6f884f48641d02',
        user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
        updated_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
      },
    ];
  }
}

seedSampleOrdersInMemory();

// Database Query Wrapper
export async function query(text: string, params: any[] = []): Promise<{ rows: any[]; rowCount: number }> {
  const currentPool = getDbPool();
  if (currentPool && isPostgresActive) {
    try {
      const res = await currentPool.query(text, params);
      if (Array.isArray(res)) {
        const lastResult = res[res.length - 1];
        const rows = lastResult?.rows || [];
        const rowCount = lastResult?.rowCount ?? rows.length;
        return { rows, rowCount };
      }
      return { rows: res.rows || [], rowCount: res.rowCount ?? (res.rows ? res.rows.length : 0) };
    } catch (err: any) {
      console.error('[DB Query Error]', { text, error: err.message });
      throw err;
    }
  }

  return executeInMemoryQuery(text, params);
}

// Transaction Client Helper
export async function getClient() {
  const currentPool = getDbPool();
  if (currentPool && isPostgresActive) {
    return await currentPool.connect();
  }
  return null;
}

// In-Memory query simulator for non-SQL fallback
function executeInMemoryQuery(text: string, params: any[] = []): { rows: any[]; rowCount: number } {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (lower.startsWith('select') && lower.includes('from restaurants')) {
    return { rows: inMemoryDb.restaurants, rowCount: inMemoryDb.restaurants.length };
  }
  if (lower.startsWith('select') && lower.includes('from menu_items')) {
    return { rows: inMemoryDb.menu_items, rowCount: inMemoryDb.menu_items.length };
  }
  if (lower.startsWith('select') && lower.includes('from orders')) {
    return { rows: inMemoryDb.orders, rowCount: inMemoryDb.orders.length };
  }
  if (lower.startsWith('select') && lower.includes('from restaurant_tables')) {
    return { rows: inMemoryDb.restaurant_tables, rowCount: inMemoryDb.restaurant_tables.length };
  }
  if (lower.startsWith('select') && lower.includes('from print_jobs')) {
    let rows = inMemoryDb.print_jobs;
    if (lower.includes('where order_id = $1') && params[0]) {
      rows = rows.filter((j) => (j.orderId || j.order_id) === params[0]);
    }
    const mappedRows = rows.map((j) => ({
      ...j,
      order_id: j.order_id || j.orderId,
      job_type: j.job_type || j.jobType,
    }));
    return { rows: mappedRows, rowCount: mappedRows.length };
  }
  if (lower.startsWith('select') && lower.includes('from customers')) {
    return { rows: inMemoryDb.customers, rowCount: inMemoryDb.customers.length };
  }
  if (lower.startsWith('select') && lower.includes('from payments')) {
    return { rows: inMemoryDb.payments, rowCount: inMemoryDb.payments.length };
  }
  if (lower.startsWith('select') && lower.includes('from print_devices')) {
    return { rows: inMemoryDb.print_devices, rowCount: inMemoryDb.print_devices.length };
  }
  if (lower.startsWith('select') && lower.includes('from customer_inquiries')) {
    return { rows: inMemoryDb.customer_inquiries || [], rowCount: (inMemoryDb.customer_inquiries || []).length };
  }
  if (lower.startsWith('select') && lower.includes('from restaurant_settings')) {
    let rows = inMemoryDb.restaurant_settings || [];
    if (params[0]) {
      rows = rows.filter((s: any) => s.restaurant_id === params[0] || s.id === params[0]);
    }
    return { rows, rowCount: rows.length };
  }
  if (lower.startsWith('select') && lower.includes('from restaurant_payment_settings')) {
    let rows = inMemoryDb.restaurant_payment_settings || [];
    if (params[0]) {
      rows = rows.filter((s: any) => s.restaurant_id === params[0] || s.id === params[0]);
    }
    return { rows, rowCount: rows.length };
  }
  if (lower.startsWith('select') && lower.includes('from restaurant_onboarding')) {
    let rows = inMemoryDb.restaurant_onboarding || [];
    if (params[0]) {
      rows = rows.filter((s: any) => s.restaurant_id === params[0] || s.id === params[0]);
    }
    return { rows, rowCount: rows.length };
  }
  if (lower.startsWith('select') && lower.includes('from payment_attempts')) {
    let rows = inMemoryDb.payment_attempts || [];
    if (params[0]) {
      rows = rows.filter((p: any) => p.id === params[0] || p.order_id === params[0] || p.order_number === params[0]);
    }
    return { rows, rowCount: rows.length };
  }

  return { rows: [], rowCount: 0 };
}

// Initialize and auto-migrate PostgreSQL on startup if DATABASE_URL is present
export async function initializeDatabase(): Promise<{ success: boolean; mode: string; error?: string }> {
  if (globalThis.__dbInitPromise) {
    return globalThis.__dbInitPromise;
  }

  globalThis.__dbInitPromise = (async () => {
    const currentPool = getDbPool();
    if (!currentPool) {
      console.info('[DB] Running with in-memory multi-tenant storage.');
      return { success: true, mode: 'in_memory' };
    }

    try {
      const client = await currentPool.connect();
      try {
        console.info('[DB] Successfully connected to PostgreSQL instance.');
        isPostgresActive = true;
        globalThis.__isPostgresActive = true;

        // Run schema initialization (Creates or modifies existing tables, columns, constraints, triggers, indexes)
        const schemaPath = path.join(process.cwd(), 'database', 'schema.sql');
        if (fs.existsSync(schemaPath)) {
          const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
          await client.query(schemaSql);
          console.info('[DB] PostgreSQL multi-tenant schema verified/applied (created or modified objects).');
        }

        // Apply seed script (Idempotently creates or modifies base restaurant, branch, tables, categories & menu items)
        const seedPath = path.join(process.cwd(), 'database', 'seed.sql');
        if (fs.existsSync(seedPath)) {
          const seedSql = fs.readFileSync(seedPath, 'utf-8');
          await client.query(seedSql);
          console.info('[DB] Seed data verified/applied (created or modified existing objects).');
        }

        // Apply contact inquiries & atomic rate limits migration idempotently
        const contactMigPath = path.join(process.cwd(), 'database', 'migration_contact_and_rate_limits.sql');
        if (fs.existsSync(contactMigPath)) {
          const contactMigSql = fs.readFileSync(contactMigPath, 'utf-8');
          await client.query(contactMigSql);
          console.info('[DB] Contact inquiries and rate limits migration verified/applied.');
        }

        // Apply multi-tenant core migration idempotently
        const multiTenantMigPath = path.join(process.cwd(), 'database', 'migrations', '001_multi_tenant_core.sql');
        if (fs.existsSync(multiTenantMigPath)) {
          const migSql = fs.readFileSync(multiTenantMigPath, 'utf-8');
          await client.query(migSql);
          console.info('[DB] Multi-tenant core migration verified/applied.');
        }

        // Apply platform onboarding migration idempotently
        const onboardingMigPath = path.join(process.cwd(), 'database', 'migrations', '002_platform_onboarding.sql');
        if (fs.existsSync(onboardingMigPath)) {
          const migSql = fs.readFileSync(onboardingMigPath, 'utf-8');
          await client.query(migSql);
          console.info('[DB] Platform onboarding migration verified/applied.');
        }

        // Apply multi-restaurant order channels migration idempotently
        const orderChannelsMigPath = path.join(process.cwd(), 'database', 'migrations', '003_order_channels.sql');
        if (fs.existsSync(orderChannelsMigPath)) {
          const migSql = fs.readFileSync(orderChannelsMigPath, 'utf-8');
          await client.query(migSql);
          console.info('[DB] Multi-restaurant order channels migration verified/applied.');
        }

        // Apply payments, delivery pricing & split ledger migration idempotently
        const paymentsMigPath = path.join(process.cwd(), 'database', 'migrations', '004_payments_delivery_pricing_ledger.sql');
        if (fs.existsSync(paymentsMigPath)) {
          const migSql = fs.readFileSync(paymentsMigPath, 'utf-8');
          await client.query(migSql);
          console.info('[DB] Payments, delivery pricing and ledger migration verified/applied.');
        }

        // Apply order status synchronization migration idempotently
        const orderStatusMigPath = path.join(process.cwd(), 'database', 'migrations', '005_order_status_sync.sql');
        if (fs.existsSync(orderStatusMigPath)) {
          const migSql = fs.readFileSync(orderStatusMigPath, 'utf-8');
          await client.query(migSql);
          console.info('[DB] Order status synchronization migration verified/applied.');
        }

        // Apply payment audit and restaurant lifecycle migration idempotently
        const paymentAuditMigPath = path.join(process.cwd(), 'database', 'migrations', '006_payment_audit_and_restaurant_lifecycle.sql');
        if (fs.existsSync(paymentAuditMigPath)) {
          const migSql = fs.readFileSync(paymentAuditMigPath, 'utf-8');
          await client.query(migSql);
          console.info('[DB] Payment audit and restaurant lifecycle migration verified/applied.');
        }

        // Apply direct UPI payment attempts migration idempotently
        const paymentAttemptsMigPath = path.join(process.cwd(), 'database', 'migrations', '007_direct_upi_payment_attempts.sql');
        if (fs.existsSync(paymentAttemptsMigPath)) {
          const migSql = fs.readFileSync(paymentAttemptsMigPath, 'utf-8');
          await client.query(migSql);
          console.info('[DB] Direct UPI payment attempts migration verified/applied.');
        }

        // NOTE: Migration 008 (Multi-Tenant Restaurant Inventory & Stock Management)
        // has already been executed manually in production Supabase.
        // It is treated as APPLIED and is NOT re-executed automatically.
        console.info('[DB] Migration 008 status: APPLIED in production Supabase.');

        return { success: true, mode: 'postgresql' };
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.warn('[DB] Could not connect to PostgreSQL with DATABASE_URL, continuing with in-memory store:', err.message);
      isPostgresActive = false;
      globalThis.__isPostgresActive = false;
      return { success: false, mode: 'in_memory', error: err.message };
    }
  })();

  return globalThis.__dbInitPromise;
}

export function isPostgresRunning(): boolean {
  return globalThis.__isPostgresActive ?? isPostgresActive;
}
