-- ==========================================================
-- MOZZ Chinese & Pizzateria - PostgreSQL Initial Seed Data
-- Idempotent & Safely Rerunnable Seed Script (Creates or Modifies Existing Records)
-- ==========================================================

-- 1. Insert or Update Default Root Multi-Tenant Restaurant
INSERT INTO restaurants (id, name, slug, phone, email, logo_url, tagline, currency, tax_rate, status)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'MOZZ Chinese & Pizzateria',
    'mozz',
    '+918179620607',
    'contact@mozzpizzateria.com',
    'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=200',
    'Korean-Style Pocket Pizzas & Indo-Chinese Delicacies',
    'INR',
    5.00,
    'active'
) ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    logo_url = EXCLUDED.logo_url,
    tagline = EXCLUDED.tagline,
    currency = EXCLUDED.currency,
    tax_rate = EXCLUDED.tax_rate,
    status = EXCLUDED.status,
    updated_at = NOW();

-- 2. Insert or Update Default Flagship Branch
INSERT INTO restaurant_branches (id, restaurant_id, name, slug, address, latitude, longitude, delivery_radius_km, phone, is_active)
VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'MOZZ Chinese & Pizzateria - Gachibowli',
    'main-outlet',
    'Plot no 31, Vinayak Nagar, Indira Nagar, Gachibowli, Hyderabad, Telangana',
    17.4425090,
    78.3539660,
    12.00,
    '+918179620607',
    TRUE
) ON CONFLICT (restaurant_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    address = EXCLUDED.address,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    delivery_radius_km = EXCLUDED.delivery_radius_km,
    phone = EXCLUDED.phone,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

-- NOTE: Default admin users are initialized and verified dynamically
-- using bcrypt.hash(pin, 12) during backend boot (in server/services/authService.ts).

-- 3. Insert or Update Restaurant Tables (Tables 1 through 20)
INSERT INTO restaurant_tables (restaurant_id, branch_id, table_number, table_name, capacity, is_active)
VALUES
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '1', 'Table 1 (Window Side)', 4, TRUE),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2', 'Table 2 (Window Side)', 4, TRUE),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '3', 'Table 3 (Cozy Booth)', 4, TRUE),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '4', 'Table 4 (Cozy Booth)', 4, TRUE),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '5', 'Table 5 (Center Hall)', 4, TRUE),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '6', 'Table 6 (Center Hall)', 6, TRUE),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '7', 'Table 7 (Center Hall)', 6, TRUE),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '8', 'Table 8 (Family Lounge)', 8, TRUE),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '9', 'Table 9 (Family Lounge)', 8, TRUE),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '10', 'Table 10 (High Table)', 2, TRUE),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '11', 'Table 11 (High Table)', 2, TRUE),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '12', 'Table 12 (High Table)', 2, TRUE),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '13', 'Table 13 (Garden Patio)', 4, TRUE),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '14', 'Table 14 (Garden Patio)', 4, TRUE),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '15', 'Table 15 (Garden Patio)', 4, TRUE),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '16', 'Table 16 (Outdoor Deck)', 4, TRUE),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '17', 'Table 17 (Outdoor Deck)', 4, TRUE),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '18', 'Table 18 (VIP Terrace)', 6, TRUE),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '19', 'Table 19 (VIP Terrace)', 6, TRUE),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '20', 'Table 20 (Party Zone)', 12, TRUE)
ON CONFLICT (restaurant_id, branch_id, table_number) DO UPDATE SET
    table_name = EXCLUDED.table_name,
    capacity = EXCLUDED.capacity,
    is_active = EXCLUDED.is_active;

-- 4. Insert or Update Menu Categories
INSERT INTO menu_categories (restaurant_id, slug, name, display_order, is_active)
VALUES
    ('a0000000-0000-0000-0000-000000000001', 'pocket_pizza_veg', 'Veg Pocket Pizzas', 1, TRUE),
    ('a0000000-0000-0000-0000-000000000001', 'pocket_pizza_nonveg', 'Non-Veg Pocket Pizzas', 2, TRUE),
    ('a0000000-0000-0000-0000-000000000001', 'dessert_pizza', 'Dessert Pocket Pizzas', 3, TRUE),
    ('a0000000-0000-0000-0000-000000000001', 'chinese_starters', 'Chinese Starters', 4, TRUE),
    ('a0000000-0000-0000-0000-000000000001', 'fried_rice', 'Fried Rice Delights', 5, TRUE),
    ('a0000000-0000-0000-0000-000000000001', 'noodles', 'Wok Tossed Noodles', 6, TRUE),
    ('a0000000-0000-0000-0000-000000000001', 'maggie', 'Fusion Maggie Bowls', 7, TRUE),
    ('a0000000-0000-0000-0000-000000000001', 'momos', 'Steamed & Fried Momos', 8, TRUE),
    ('a0000000-0000-0000-0000-000000000001', 'drinks', 'Chilled Beverages', 9, TRUE)
ON CONFLICT (restaurant_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active;

-- 5. Insert or Update Menu Items (With Multi-Tenant item_code and Auto-Generated UUIDs)
INSERT INTO menu_items (
    restaurant_id, branch_id, item_code, category, name, description,
    dietary_type, price, price_r, price_c, price_s,
    is_pocket_pizza, is_popular, is_chef_special, spicy_level, in_stock, badge
)
VALUES
    -- ================= VEG POCKET PIZZAS =================
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'vp-1', 'pocket_pizza_veg', 'Cheesy Margherita', 'Classic in-house mozzarella blend, slow-cooked herb tomato sauce, fresh basil sprinkle in a crisp pocket crust.', 'veg', NULL, 149, 179, 199, TRUE, TRUE, FALSE, 0, TRUE, 'Bestseller'),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'vp-2', 'pocket_pizza_veg', 'Veg Salsa', 'Zesty Mexican salsa sauce, crunchy bell peppers, diced onions, sweet corn & melted cheese.', 'veg', NULL, 149, 179, 199, TRUE, FALSE, FALSE, 1, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'vp-3', 'pocket_pizza_veg', 'Corn Exotica', 'Golden American sweet corn, jalapenos, melted cheese overload with smoky herb seasoning.', 'veg', NULL, 149, 179, 199, TRUE, FALSE, FALSE, 0, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'vp-4', 'pocket_pizza_veg', 'Paneer Tikka', 'Clay-oven marinated tandoori paneer cubes, roasted capsicum, red onions & spiced makhani drizzle.', 'veg', NULL, 179, 199, 249, TRUE, TRUE, FALSE, 2, TRUE, 'Chef Pick'),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'vp-5', 'pocket_pizza_veg', 'Paneer Schezwan', 'Spicy Indo-Chinese wok-tossed Schezwan paneer, spring greens & signature Korean pocket cheese.', 'veg', NULL, 179, 199, 249, TRUE, FALSE, FALSE, 3, TRUE, 'Fiery'),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'vp-6', 'pocket_pizza_veg', 'Mushroom Cheese Mania', 'Herb-sautéed tender button mushrooms, caramelized onions, loaded garlic butter cheese crust.', 'veg', NULL, 179, 199, 249, TRUE, FALSE, FALSE, 1, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'vp-7', 'pocket_pizza_veg', 'BBQ Mushroom', 'Smoky sweet barbecue-glazed button mushrooms, charred onions & creamy mozzarella pocket.', 'veg', NULL, 179, 199, 249, TRUE, FALSE, FALSE, 1, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'vp-8', 'pocket_pizza_veg', 'Paneer Pineapple', 'Sweet caramelized tropical pineapple chunks paired with spicy marinated cottage cheese and cheese burst.', 'veg', NULL, 179, 199, 249, TRUE, FALSE, FALSE, 1, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'vp-9', 'pocket_pizza_veg', 'Paneer Tikka Makhani', 'Rich royal butter makhani gravy base, succulent paneer tikka, kasuri methi & double cheese fold.', 'veg', NULL, 179, 199, 249, TRUE, TRUE, FALSE, 2, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'vp-10', 'pocket_pizza_veg', 'Cilantro Spicy Veg', 'Fresh cilantro herb pesto drizzle, birds-eye green chillies, golden corn, paneer & spicy pepper blend.', 'veg', NULL, 189, 249, 299, TRUE, FALSE, FALSE, 3, TRUE, 'Signature'),

    -- ================= NON-VEG POCKET PIZZAS =================
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'nvp-1', 'pocket_pizza_nonveg', 'Spicy Chicken Mania', 'Juicy spiced chicken chunks, hot paprika, red paprika, jalapenos & molten stringy cheese.', 'non-veg', NULL, 179, 199, 249, TRUE, TRUE, FALSE, 2, TRUE, 'Top Pick'),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'nvp-2', 'pocket_pizza_nonveg', 'Chicken Tikka', 'Tandoori-spiced roasted chicken cubes, crisp red onions, capsicum, tandoori herb sauce & cheese.', 'non-veg', NULL, 189, 249, 299, TRUE, TRUE, FALSE, 2, TRUE, 'Bestseller'),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'nvp-3', 'pocket_pizza_nonveg', 'Schezwan Chicken', 'Wok-tossed hot schezwan chicken, scallions, red peppers and Korean pocket cheese crunch.', 'non-veg', NULL, 189, 249, 299, TRUE, FALSE, FALSE, 3, TRUE, 'Fiery'),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'nvp-4', 'pocket_pizza_nonveg', 'Chicken Pineapple', 'Tender seasoned chicken breast strips combined with sweet juicy grilled pineapple & mozzarella.', 'non-veg', NULL, 189, 249, 299, TRUE, FALSE, FALSE, 1, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'nvp-5', 'pocket_pizza_nonveg', 'BBQ Chicken Supreme', 'Smoky hickory BBQ shredded chicken, smoked sausages, caramelized onions and gooey cheddar.', 'non-veg', NULL, 199, 279, 329, TRUE, TRUE, FALSE, 1, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'nvp-6', 'pocket_pizza_nonveg', 'ABC (Absolute Butter Chicken)', 'Creamy North Indian butter chicken gravy, shredded chicken tikka, butter glaze & fragrant kasuri methi.', 'non-veg', NULL, 199, 279, 329, TRUE, TRUE, TRUE, 1, TRUE, 'Must Try'),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'nvp-7', 'pocket_pizza_nonveg', 'Roast Chicken', 'Slow-roasted garlic herb chicken, thyme infused sauce, black olives and double pocket cheese.', 'non-veg', NULL, 219, 279, 349, TRUE, FALSE, FALSE, 1, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'nvp-8', 'pocket_pizza_nonveg', 'Spicy Chicken Kheema', 'Slow-cooked spiced minced chicken kheema, fresh coriander, green chilies, golden pocket fold.', 'non-veg', NULL, 219, 279, 349, TRUE, FALSE, FALSE, 3, TRUE, 'Desi Spice'),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'nvp-9', 'pocket_pizza_nonveg', 'Chicken Tikka Makhani', 'Creamy velvety makhani sauce base, charred chicken tikka cubes, crunchy onions & molten blend.', 'non-veg', NULL, 219, 279, 349, TRUE, TRUE, FALSE, 2, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'nvp-10', 'pocket_pizza_nonveg', 'Chicken Delight', 'Golden seasoned chicken, sweet corn, sliced button mushrooms, green capsicum & loaded cheese.', 'non-veg', NULL, 219, 279, 349, TRUE, FALSE, FALSE, 1, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'nvp-11', 'pocket_pizza_nonveg', 'Chicken Hot & Shot', 'Spicy chicken tossed in ghost pepper chili drizzle, spicy sausage bits, red paprika & ghost seasoning.', 'non-veg', NULL, 219, 279, 349, TRUE, FALSE, FALSE, 3, TRUE, 'Extra Hot 🔥'),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'nvp-12', 'pocket_pizza_nonveg', 'Chicken Special', 'House-special blend of 3 chicken varieties: tikka, garlic roast, and schezwan with triple cheese.', 'non-veg', NULL, 219, 279, 349, TRUE, TRUE, FALSE, 2, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'nvp-13', 'pocket_pizza_nonveg', 'MOZZ Special', 'The Ultimate Grand Pocket Pizza: loaded with chicken tikka, roast chicken, egg scramble, extra cheese burst & secret MOZZ herbs.', 'non-veg', NULL, 249, 279, 349, TRUE, TRUE, TRUE, 2, TRUE, 'Signature MOZZ'),

    -- ================= DESSERT PIZZAS =================
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'dp-1', 'dessert_pizza', 'Kitkat Nutella Magic', 'Warm crispy pocket baked with hazelnut Nutella spread, crushed crunchy KitKat bars & white chocolate drizzle.', 'dessert', NULL, 149, 199, 249, TRUE, TRUE, FALSE, 0, TRUE, 'Sweet Tooth'),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'dp-2', 'dessert_pizza', 'Snicky Snickers', 'Roasted peanuts, salted caramel drizzle, molten milk chocolate & nougat pocket fold.', 'dessert', NULL, 149, 199, 249, TRUE, FALSE, FALSE, 0, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'dp-3', 'dessert_pizza', 'Crunchy Munchy', 'Dark Belgian chocolate ganache, crunchy cookie crumble, roasted almond flakes & sweet honey glaze.', 'dessert', NULL, 149, 199, 249, TRUE, FALSE, FALSE, 0, TRUE, 'Kids Favourite'),

    -- ================= CHINESE STARTERS =================
    -- Veg Starters
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'cs-v1', 'chinese_starters', 'Veg Manchurian', 'Crispy vegetable dumplings tossed in tangy soy-garlic Manchurian gravy with scallions and bell peppers.', 'veg', 99, NULL, NULL, NULL, FALSE, TRUE, FALSE, 2, TRUE, 'Bestseller ₹99'),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'cs-v2', 'chinese_starters', 'Chilli Mushroom', 'Batter-fried golden button mushrooms tossed in oriental dark soya chilli sauce with crunchy onions.', 'veg', 99, NULL, NULL, NULL, FALSE, FALSE, FALSE, 2, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'cs-v3', 'chinese_starters', 'Paneer 65', 'South-meets-Indo-Chinese spiced paneer cubes tempered with curry leaves, crushed garlic, and red chilies.', 'veg', 129, NULL, NULL, NULL, FALSE, TRUE, FALSE, 2, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'cs-v4', 'chinese_starters', 'Kaju Paneer', 'Crispy fried cottage cheese cubes tossed with premium roasted cashews (Kaju) and spicy wok seasonings.', 'veg', 129, NULL, NULL, NULL, FALSE, FALSE, TRUE, 1, TRUE, 'Chef Special'),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'cs-v5', 'chinese_starters', 'Chilli Paneer', 'All-time favorite wok-tossed crispy paneer cubes with green chilies, capsicum, and oriental sauce.', 'veg', 129, NULL, NULL, NULL, FALSE, TRUE, FALSE, 2, TRUE, NULL),
    -- Non-Veg Starters
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'cs-nv1', 'chinese_starters', 'Garlic Chicken', 'Tender chicken bites tossed with plenty of caramelized garlic, crushed pepper, and Chinese scallions.', 'non-veg', 179, NULL, NULL, NULL, FALSE, TRUE, FALSE, 2, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'cs-nv2', 'chinese_starters', 'Chicken 65', 'Spicy, deep-fried chicken morsels coated in zesty red chili paste, tempered with green chilies and curry leaves.', 'non-veg', 179, NULL, NULL, NULL, FALSE, TRUE, FALSE, 3, TRUE, 'Popular'),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'cs-nv3', 'chinese_starters', 'Devil Chicken', 'Extra fiery wok-tossed chicken chunks with hot Sichuan peppers and red chili flakes.', 'non-veg', 179, NULL, NULL, NULL, FALSE, FALSE, FALSE, 3, TRUE, 'Fiery 🌶️🌶️'),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'cs-nv4', 'chinese_starters', 'Chicken Majestic', 'Hyderabadi style dry fried chicken strips marinated in curd, mint, green chilies, and aromatic spices.', 'non-veg', 179, NULL, NULL, NULL, FALSE, FALSE, TRUE, 2, TRUE, 'Must Try'),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'cs-nv5', 'chinese_starters', 'Chilli Chicken', 'Classic Indo-Chinese diced chicken tossed with spicy green chilies, onions, capsicum, and soya glaze.', 'non-veg', 179, NULL, NULL, NULL, FALSE, TRUE, FALSE, 2, TRUE, NULL),

    -- ================= FRIED RICE =================
    -- Veg Fried Rice
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'fr-v1', 'fried_rice', 'Veg Fried Rice', 'Aromatic long grain basmati rice tossed in a blazing wok with finely chopped carrots, beans, and spring onion.', 'veg', 89, NULL, NULL, NULL, FALSE, FALSE, FALSE, 1, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'fr-v2', 'fried_rice', 'Manchurian Fried Rice', 'Wok-tossed aromatic fried rice blended with delicious crispy veg Manchurian balls and garlic sauce.', 'veg', 99, NULL, NULL, NULL, FALSE, TRUE, FALSE, 2, TRUE, 'Bestseller'),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'fr-v3', 'fried_rice', 'Mushroom Fried Rice', 'Fragrant wok-fried rice loaded with tender sliced button mushrooms, garlic, and fresh peppers.', 'veg', 119, NULL, NULL, NULL, FALSE, FALSE, FALSE, 1, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'fr-v4', 'fried_rice', 'Schezwan Paneer Fried Rice', 'Spicy Schezwan fried rice loaded with golden paneer cubes, wok-charred veggies, and spicy chili sauce.', 'veg', 129, NULL, NULL, NULL, FALSE, TRUE, FALSE, 3, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'fr-v5', 'fried_rice', 'Chilli Paneer Fried Rice', 'Fusion delight of aromatic wok rice topped with juicy chilli paneer and savory dark soya reduction.', 'veg', 129, NULL, NULL, NULL, FALSE, FALSE, FALSE, 2, TRUE, NULL),
    -- Non-Veg Fried Rice
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'fr-nv1', 'fried_rice', 'Egg Fried Rice', 'Classic wok-scrambled egg fried rice with crunchy vegetables, white pepper, and spring onions.', 'egg', 99, NULL, NULL, NULL, FALSE, FALSE, FALSE, 1, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'fr-nv2', 'fried_rice', 'Double Egg Fried Rice', 'Extra egg indulgence! Double scrambled eggs wok-tossed with fragrant basmati and spices.', 'egg', 127, NULL, NULL, NULL, FALSE, FALSE, FALSE, 1, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'fr-nv3', 'fried_rice', 'Chicken Fried Rice', 'Juicy shredded chicken pieces, scrambled egg, and garden veggies wok-tossed to smoky perfection.', 'non-veg', 137, NULL, NULL, NULL, FALSE, TRUE, FALSE, 1, TRUE, 'Popular'),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'fr-nv4', 'fried_rice', 'Chilli Chicken Fried Rice', 'Rich fusion combo of egg fried rice tossed with spicy Indo-Chinese chilli chicken and pepper glaze.', 'non-veg', 137, NULL, NULL, NULL, FALSE, FALSE, FALSE, 2, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'fr-nv5', 'fried_rice', 'Double Egg Chicken Fried Rice', 'Loaded powerhouse: Double scrambled eggs plus hearty tender chicken pieces in fragrant wok rice.', 'non-veg', 137, NULL, NULL, NULL, FALSE, TRUE, FALSE, 1, TRUE, 'Value Pack'),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'fr-nv6', 'fried_rice', 'Schezwan Chicken Fried Rice', 'Fiery wok-tossed rice with hot Schezwan paste, scrambled egg, tender chicken, and scallions.', 'non-veg', 137, NULL, NULL, NULL, FALSE, FALSE, FALSE, 3, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'fr-nv7', 'fried_rice', 'Double Egg Schezwan Chicken Fried Rice', 'Ultimate feast: Double egg, spicy Schezwan chicken, and fresh vegetables wok-fried together.', 'non-veg', 137, NULL, NULL, NULL, FALSE, FALSE, TRUE, 3, TRUE, 'Chef Special'),

    -- ================= NOODLES =================
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'nd-1', 'noodles', 'Egg Noodles', 'Steamed hakka noodles tossed with scrambled egg, shredded cabbage, carrots, and light soya sauce.', 'egg', 99, NULL, NULL, NULL, FALSE, FALSE, FALSE, 1, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'nd-2', 'noodles', 'Double Egg Noodles', 'Double portions of farm egg scrambled into long silky hakka noodles with aromatic wok spices.', 'egg', 127, NULL, NULL, NULL, FALSE, FALSE, FALSE, 1, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'nd-3', 'noodles', 'Chicken Noodles', 'Classic chicken hakka noodles with juicy chicken strips, scrambled egg, and crisp julienned vegetables.', 'non-veg', 137, NULL, NULL, NULL, FALSE, TRUE, FALSE, 1, TRUE, 'Bestseller'),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'nd-4', 'noodles', 'Chilli Chicken Noodles', 'Hakka noodles tossed with spicy chilli chicken bites, capsicum, green chilies, and tangy dark sauce.', 'non-veg', 137, NULL, NULL, NULL, FALSE, FALSE, FALSE, 2, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'nd-5', 'noodles', 'Double Egg Chicken Noodles', 'Hearty noodles wok-fried with double eggs and generous chunks of succulent chicken.', 'non-veg', 137, NULL, NULL, NULL, FALSE, TRUE, FALSE, 1, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'nd-6', 'noodles', 'Schezwan Chicken Noodles', 'Spicy Schezwan tossed hakka noodles with shredded chicken, celery, spring onion, and red chili sauce.', 'non-veg', 137, NULL, NULL, NULL, FALSE, FALSE, FALSE, 3, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'nd-7', 'noodles', 'Double Egg Schezwan Chicken Noodles', 'Loaded spicy noodles with double scrambled eggs, Schezwan marinated chicken, and fresh peppers.', 'non-veg', 137, NULL, NULL, NULL, FALSE, FALSE, TRUE, 3, TRUE, 'Must Try'),

    -- ================= MAGGIE =================
    -- Veg Maggie
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'mg-v1', 'maggie', 'Veg Juicy Maggie', 'Soulful slurpy soupy Maggie cooked with sweet peas, diced carrots, butter, and special masala broth.', 'veg', 69, NULL, NULL, NULL, FALSE, TRUE, FALSE, 1, TRUE, 'Comfort Food ₹69'),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'mg-v2', 'maggie', 'Manchurian Fried Maggie', 'Wok-fried dry Maggie tossed with crunchy veg Manchurian bites, garlic, and scallions.', 'veg', 79, NULL, NULL, NULL, FALSE, FALSE, FALSE, 2, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'mg-v3', 'maggie', 'Paneer Cheese Fried Maggie', 'Tossed Maggie with soft golden paneer cubes and molten in-house cheese blend topping.', 'veg', 79, NULL, NULL, NULL, FALSE, TRUE, FALSE, 1, TRUE, NULL),
    -- Non-Veg Maggie
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'mg-nv1', 'maggie', 'Egg Fried Maggie', 'Stir-fried Maggie noodles with scrambled farm egg, green chili, and roasted masala.', 'egg', 89, NULL, NULL, NULL, FALSE, FALSE, FALSE, 1, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'mg-nv2', 'maggie', 'Chicken Juicy Maggie', 'Rich aromatic Maggie simmered in hot chicken broth with shredded chicken pieces and butter.', 'non-veg', 89, NULL, NULL, NULL, FALSE, TRUE, FALSE, 1, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'mg-nv3', 'maggie', 'Chicken Fried Maggie', 'Dry wok-tossed spicy Maggie with shredded seasoned chicken, garlic, and coriander.', 'non-veg', 99, NULL, NULL, NULL, FALSE, FALSE, FALSE, 2, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'mg-nv4', 'maggie', 'Chicken Fried Cheese Maggie', 'Wok-fried chicken Maggie crowned with a blanket of melted gooey cheese and oregano herbs.', 'non-veg', 99, NULL, NULL, NULL, FALSE, TRUE, TRUE, 2, TRUE, 'Chef Special'),

    -- ================= MOMO''S =================
    -- Veg Momos
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'mo-v1', 'momos', 'Veg Steam Momos', '6 pcs soft steamed Himalayan dumplings filled with seasoned cabbage, carrots, ginger, served with fiery red chutney & mayo.', 'veg', 77, NULL, NULL, NULL, FALSE, TRUE, FALSE, 2, TRUE, 'Popular ₹77'),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'mo-v2', 'momos', 'Paneer Steam Momos', '6 pcs steamed dumplings packed with spiced crumbled paneer and herbs with signature chili dip.', 'veg', 87, NULL, NULL, NULL, FALSE, FALSE, FALSE, 2, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'mo-v3', 'momos', 'Paneer Fried Momos', '6 pcs golden crispy deep-fried paneer momos with crunchy crust and juicy spiced filling.', 'veg', 87, NULL, NULL, NULL, FALSE, TRUE, FALSE, 2, TRUE, NULL),
    -- Non-Veg Momos
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'mo-nv1', 'momos', 'Chicken Steamed Momos', '6 pcs juicy steamed momos stuffed with spiced minced chicken, garlic, spring onions, served with spicy red schezwan sauce.', 'non-veg', 97, NULL, NULL, NULL, FALSE, TRUE, FALSE, 2, TRUE, 'Bestseller ₹97'),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'mo-nv2', 'momos', 'Chicken Fried Momos', '6 pcs extra crispy golden fried chicken dumplings served with spicy garlic momo chutney.', 'non-veg', 97, NULL, NULL, NULL, FALSE, TRUE, FALSE, 2, TRUE, NULL),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'mo-nv3', 'momos', 'Peri Peri Fried Momos', '6 pcs crispy fried chicken momos generously dusted in African Peri Peri hot spice blend.', 'non-veg', 97, NULL, NULL, NULL, FALSE, TRUE, TRUE, 3, TRUE, 'Hot Peri Peri 🔥'),

    -- ================= DRINKS & REFRESHERS =================
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'dr-1', 'drinks', '1 Ltr Water', 'Packaged premium chilled packaged drinking water (1 Litre sealed bottle).', 'veg', 20, NULL, NULL, NULL, FALSE, FALSE, FALSE, 0, TRUE, 'Chilled'),
    ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'dr-2', 'drinks', 'Mojito', 'Refreshing classic mint and lime cooler with crushed ice and sparkling fizz.', 'veg', 99, NULL, NULL, NULL, FALSE, TRUE, TRUE, 0, TRUE, 'Refreshing 🌿')
ON CONFLICT (restaurant_id, item_code) DO UPDATE SET
    branch_id = EXCLUDED.branch_id,
    category = EXCLUDED.category,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    dietary_type = EXCLUDED.dietary_type,
    price = EXCLUDED.price,
    price_r = EXCLUDED.price_r,
    price_c = EXCLUDED.price_c,
    price_s = EXCLUDED.price_s,
    is_pocket_pizza = EXCLUDED.is_pocket_pizza,
    is_popular = EXCLUDED.is_popular,
    is_chef_special = EXCLUDED.is_chef_special,
    spicy_level = EXCLUDED.spicy_level,
    in_stock = EXCLUDED.in_stock,
    badge = EXCLUDED.badge,
    updated_at = NOW();

-- 6. Insert or Update Active Subscription (Idempotent Rerunnable Safe)
INSERT INTO subscriptions (restaurant_id, plan_name, status, billing_cycle, amount)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'enterprise_growth',
    'active',
    'annual',
    14999.00
) ON CONFLICT (restaurant_id) DO UPDATE SET
    plan_name = EXCLUDED.plan_name,
    status = EXCLUDED.status,
    billing_cycle = EXCLUDED.billing_cycle,
    amount = EXCLUDED.amount;
