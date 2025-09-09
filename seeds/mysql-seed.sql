-- MySQL seed script for testing
-- Drop and recreate test schema and tables
-- Note: This assumes the database already exists and is specified in the connection URL

-- Drop views first (simplified to avoid privilege issues)
-- Skip DROP VIEW IF EXISTS to avoid SYSTEM_USER privilege requirement in some MySQL configs

-- Drop dependent tables first (reverse dependency order)
DROP TABLE IF EXISTS page_views;
DROP TABLE IF EXISTS inventory_logs;
DROP TABLE IF EXISTS product_reviews;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS categories;

-- Create categories table
CREATE TABLE categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create customers table
CREATE TABLE customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    address TEXT,
    city VARCHAR(100),
    country VARCHAR(100),
    postal_code VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create products table
CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
    stock_quantity INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    category_id INT,
    sku VARCHAR(100) UNIQUE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    INDEX idx_category (category_id),
    INDEX idx_active (is_active),
    INDEX idx_sku (sku)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create orders table
CREATE TABLE orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    total_amount DECIMAL(10, 2) NOT NULL CHECK (total_amount >= 0),
    shipping_address TEXT,
    billing_address TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    INDEX idx_customer (customer_id),
    INDEX idx_status (status),
    INDEX idx_order_date (order_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create order_items table (junction table for many-to-many relationship)
CREATE TABLE order_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0),
    discount_percent DECIMAL(5, 2) DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE KEY unique_order_product (order_id, product_id),
    INDEX idx_order (order_id),
    INDEX idx_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample data

-- Categories
INSERT INTO categories (name, description) VALUES
('Electronics', 'Electronic devices and accessories'),
('Books', 'Physical and digital books'),
('Clothing', 'Men and women apparel'),
('Home & Garden', 'Home improvement and gardening supplies'),
('Sports', 'Sports equipment and accessories');

-- Customers
INSERT INTO customers (email, first_name, last_name, phone, address, city, country, postal_code) VALUES
('john.doe@example.com', 'John', 'Doe', '+1234567890', '123 Main St', 'New York', 'USA', '10001'),
('jane.smith@example.com', 'Jane', 'Smith', '+1234567891', '456 Oak Ave', 'Los Angeles', 'USA', '90001'),
('bob.johnson@example.com', 'Bob', 'Johnson', '+1234567892', '789 Pine Rd', 'Chicago', 'USA', '60601'),
('alice.williams@example.com', 'Alice', 'Williams', '+1234567893', '321 Elm St', 'Houston', 'USA', '77001'),
('charlie.brown@example.com', 'Charlie', 'Brown', '+1234567894', '654 Maple Dr', 'Phoenix', 'USA', '85001');

-- Products
INSERT INTO products (name, description, price, stock_quantity, category_id, sku, is_active) VALUES
('Laptop Pro 15', 'High-performance laptop with 15-inch display', 1299.99, 50, 1, 'LPRO15-001', true),
('Wireless Mouse', 'Ergonomic wireless mouse with long battery life', 29.99, 200, 1, 'WM-002', true),
('The Great Novel', 'Bestselling fiction book', 19.99, 100, 2, 'BOOK-001', true),
('Programming Guide', 'Complete guide to modern programming', 49.99, 75, 2, 'BOOK-002', true),
('Cotton T-Shirt', 'Comfortable cotton t-shirt', 24.99, 150, 3, 'SHIRT-001', true),
('Denim Jeans', 'Classic denim jeans', 59.99, 100, 3, 'JEANS-001', true),
('Garden Shovel', 'Durable garden shovel', 34.99, 50, 4, 'TOOL-001', true),
('Plant Seeds Pack', 'Variety pack of vegetable seeds', 9.99, 200, 4, 'SEEDS-001', true),
('Tennis Racket', 'Professional tennis racket', 89.99, 30, 5, 'SPORT-001', true),
('Running Shoes', 'Comfortable running shoes', 79.99, 80, 5, 'SHOES-001', true);

-- Orders
INSERT INTO orders (customer_id, status, total_amount, shipping_address, billing_address, notes) VALUES
(1, 'completed', 1329.98, '123 Main St, New York, USA 10001', '123 Main St, New York, USA 10001', 'Please deliver to front door'),
(2, 'processing', 89.97, '456 Oak Ave, Los Angeles, USA 90001', '456 Oak Ave, Los Angeles, USA 90001', NULL),
(3, 'pending', 169.97, '789 Pine Rd, Chicago, USA 60601', '789 Pine Rd, Chicago, USA 60601', 'Gift wrapping requested'),
(1, 'completed', 59.99, '123 Main St, New York, USA 10001', '123 Main St, New York, USA 10001', NULL),
(4, 'shipped', 134.97, '321 Elm St, Houston, USA 77001', '321 Elm St, Houston, USA 77001', 'Express delivery');

-- Order Items
INSERT INTO order_items (order_id, product_id, quantity, unit_price, discount_percent) VALUES
(1, 1, 1, 1299.99, 0),
(1, 2, 1, 29.99, 0),
(2, 3, 2, 19.99, 0),
(2, 4, 1, 49.99, 0),
(3, 9, 1, 89.99, 0),
(3, 10, 1, 79.99, 0),
(4, 6, 1, 59.99, 0),
(5, 5, 2, 24.99, 0),
(5, 7, 1, 34.99, 0),
(5, 4, 1, 49.99, 0);

-- Create a view for order summaries
-- Use CREATE OR REPLACE to avoid privilege issues with DROP VIEW IF EXISTS
CREATE OR REPLACE VIEW order_summary AS
SELECT 
    o.id as order_id,
    c.email as customer_email,
    CONCAT(c.first_name, ' ', c.last_name) as customer_name,
    o.order_date,
    o.status,
    o.total_amount,
    COUNT(oi.id) as item_count,
    SUM(oi.quantity) as total_items
FROM orders o
JOIN customers c ON o.customer_id = c.id
LEFT JOIN order_items oi ON o.id = oi.order_id
GROUP BY o.id, c.email, c.first_name, c.last_name, o.order_date, o.status, o.total_amount;

-- Create additional test tables with different data types
CREATE TABLE product_reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    customer_id INT NOT NULL,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(255),
    comment TEXT,
    is_verified_purchase BOOLEAN DEFAULT false,
    helpful_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    INDEX idx_product_rating (product_id, rating)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample reviews
INSERT INTO product_reviews (product_id, customer_id, rating, title, comment, is_verified_purchase) VALUES
(1, 1, 5, 'Excellent laptop!', 'Very fast and reliable. Great for development work.', true),
(1, 2, 4, 'Good but pricey', 'Performance is great but it is a bit expensive.', true),
(2, 3, 5, 'Perfect mouse', 'Comfortable and long battery life as advertised.', true),
(3, 4, 4, 'Engaging story', 'Could not put it down. Highly recommended.', true),
(10, 5, 5, 'Best running shoes', 'Very comfortable for long runs.', true);

-- Create an empty table for testing
CREATE TABLE inventory_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT,
    action VARCHAR(50),
    quantity_change INT,
    new_quantity INT,
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
    INDEX idx_product_action (product_id, action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create additional analytics table in same database
CREATE TABLE page_views (
    id INT AUTO_INCREMENT PRIMARY KEY,
    page_url VARCHAR(500) NOT NULL,
    visitor_id VARCHAR(100),
    session_id VARCHAR(100),
    referrer VARCHAR(500),
    user_agent TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_visitor (visitor_id),
    INDEX idx_session (session_id),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample page views
INSERT INTO page_views (page_url, visitor_id, session_id, referrer, user_agent, ip_address) VALUES
('/products/laptop-pro-15', 'visitor_001', 'session_001', 'https://google.com', 'Mozilla/5.0 Chrome/91.0', '192.168.1.1'),
('/products/wireless-mouse', 'visitor_001', 'session_001', '/products/laptop-pro-15', 'Mozilla/5.0 Chrome/91.0', '192.168.1.1'),
('/checkout', 'visitor_001', 'session_001', '/cart', 'Mozilla/5.0 Chrome/91.0', '192.168.1.1'),
('/products/the-great-novel', 'visitor_002', 'session_002', 'https://facebook.com', 'Mozilla/5.0 Firefox/89.0', '192.168.1.2'),
('/about', 'visitor_003', 'session_003', NULL, 'Mozilla/5.0 Safari/14.0', '192.168.1.3');