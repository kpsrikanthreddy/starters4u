-- Migration 005: Order Status & Lifecycle Synchronization
-- Support all real-time order lifecycle statuses and kitchen workflows:
-- placed, pending, confirmed, accepted, baking, preparing, packing, out_for_delivery, ready_for_pickup, ready, delivered, completed, settled, cancelled, rejected

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN (
    'placed', 'pending', 'confirmed', 'accepted',
    'baking', 'preparing', 'packing',
    'out_for_delivery', 'ready_for_pickup', 'ready',
    'delivered', 'completed', 'settled',
    'cancelled', 'rejected'
  )
);
