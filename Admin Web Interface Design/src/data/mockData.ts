export type OrderStatus = 'Pending' | 'Confirmed' | 'Processing' | 'Ready to Ship' | 'Shipped' | 'Delivered' | 'Cancelled';
export type PaymentStatus = 'Pending Verification' | 'Paid' | 'Rejected';
export type StockStatus = 'In Stock' | 'Low Stock' | 'Out of Stock';

export interface Product {
  id: string;
  name: string;
  sku: string;
  brand: string;
  category: string;
  description: string;
  price: number;
  discount: number;
  stock: number;
  minStock: number;
  image: string;
  specs: string;
  warranty: string;
  status: StockStatus;
}

export interface Order {
  id: string;
  customer: string;
  customerId: string;
  date: string;
  products: string[];
  total: number;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  address: string;
}

export interface Payment {
  id: string;
  orderId: string;
  customer: string;
  amount: number;
  paymentMethod: string;
  referenceNumber: string;
  paymentProof: string;
  date: string;
  status: PaymentStatus;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  orders: number;
  totalSpent: number;
  status: 'Active' | 'Inactive' | 'Blocked';
  joined: string;
  avatar: string;
}

export interface Notification {
  id: string;
  type: 'order' | 'payment' | 'stock' | 'customer' | 'system';
  title: string;
  message: string;
  time: string;
  read: boolean;
}

export const products: Product[] = [
  {
    id: 'P001', name: 'Apple MacBook Pro 16"', sku: 'MBP16-M3-512', brand: 'Apple', category: 'Laptops',
    description: '16-inch MacBook Pro with M3 Pro chip, 18GB RAM, 512GB SSD. Perfect for professional workflows.',
    price: 2499, discount: 5, stock: 24, minStock: 5,
    image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=80&h=80&fit=crop&auto=format',
    specs: 'M3 Pro, 18GB RAM, 512GB SSD, 16" Liquid Retina XDR', warranty: '1 Year', status: 'In Stock'
  },
  {
    id: 'P002', name: 'ASUS ROG Zephyrus G14', sku: 'ROG-G14-R9-2024', brand: 'ASUS', category: 'Laptops',
    description: 'Gaming laptop with AMD Ryzen 9 8945HS, RTX 4070, 32GB RAM, 1TB SSD.',
    price: 1799, discount: 8, stock: 12, minStock: 5,
    image: 'https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=80&h=80&fit=crop&auto=format',
    specs: 'Ryzen 9 8945HS, RTX 4070, 32GB DDR5, 1TB NVMe', warranty: '2 Years', status: 'In Stock'
  },
  {
    id: 'P003', name: 'Dell UltraSharp 27" 4K', sku: 'U2723D-BK', brand: 'Dell', category: 'Monitors',
    description: '27-inch 4K IPS monitor with USB-C, 100% sRGB, factory calibrated.',
    price: 649, discount: 0, stock: 4, minStock: 5,
    image: 'https://images.unsplash.com/photo-1527443224154-c4a573d5f5a8?w=80&h=80&fit=crop&auto=format',
    specs: '27" IPS 4K UHD, 60Hz, USB-C 90W, HDR400', warranty: '3 Years', status: 'Low Stock'
  },
  {
    id: 'P004', name: 'Sony WH-1000XM5', sku: 'WH1000XM5-BLK', brand: 'Sony', category: 'Headphones',
    description: 'Industry-leading noise cancellation headphones with 30-hour battery life.',
    price: 349, discount: 10, stock: 38, minStock: 10,
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=80&h=80&fit=crop&auto=format',
    specs: '30h battery, Multipoint, LDAC, Speak-to-Chat', warranty: '1 Year', status: 'In Stock'
  },
  {
    id: 'P005', name: 'Logitech MX Master 3S', sku: 'MX-M3S-GRY', brand: 'Logitech', category: 'Peripherals',
    description: 'Advanced wireless mouse with 8000 DPI sensor and MagSpeed scroll wheel.',
    price: 99, discount: 0, stock: 2, minStock: 10,
    image: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=80&h=80&fit=crop&auto=format',
    specs: '8000 DPI, Bluetooth + USB, 70-day battery', warranty: '2 Years', status: 'Low Stock'
  },
  {
    id: 'P006', name: 'Samsung 990 Pro 2TB NVMe', sku: 'MZ-V9P2T0B', brand: 'Samsung', category: 'Storage',
    description: 'PCIe 4.0 NVMe SSD with 7450MB/s sequential read, perfect for gaming and content creation.',
    price: 189, discount: 15, stock: 0, minStock: 10,
    image: 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?w=80&h=80&fit=crop&auto=format',
    specs: '2TB, PCIe 4.0, 7450/6900 MB/s R/W', warranty: '5 Years', status: 'Out of Stock'
  },
  {
    id: 'P007', name: 'iPad Pro 13" M4', sku: 'IPAD-PRO13-M4-256', brand: 'Apple', category: 'Tablets',
    description: 'The most powerful iPad ever with M4 chip, Ultra Retina XDR OLED display.',
    price: 1299, discount: 0, stock: 18, minStock: 5,
    image: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=80&h=80&fit=crop&auto=format',
    specs: 'M4, 11.9" OLED, 256GB, Wi-Fi 6E', warranty: '1 Year', status: 'In Stock'
  },
  {
    id: 'P008', name: 'Keychron Q1 Pro', sku: 'KEY-Q1PRO-BLK', brand: 'Keychron', category: 'Peripherals',
    description: 'Premium QMK/VIA mechanical keyboard with wireless support and aluminum case.',
    price: 199, discount: 0, stock: 7, minStock: 8,
    image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=80&h=80&fit=crop&auto=format',
    specs: 'QMK/VIA, Bluetooth 5.1, Aluminum, Hot-swap', warranty: '1 Year', status: 'Low Stock'
  }
];

export const orders: Order[] = [];

export const payments: Payment[] = [];

export const customers: Customer[] = [];

export const notifications: Notification[] = [];

export const salesData = [];

export const weeklySalesData = [];

export const categoryData = [];

export const bestSellers = [];
