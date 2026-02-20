const dbConnection = require('./db').getConnection();

// Poor design example - procedural function with mixed concerns
function processUserOrderAndInventory(userId, orderId, productId, quantity) {
  
  // Mixed: Validation logic
  if (!userId || userId.length === 0) {
  console.log('Invalid user');
  return null;
  }
  if (!orderId || orderId.length === 0) {
  console.log('Invalid order');
  return null;
  }
  
  // Mixed: Database call
  let user = dbConnection.query(`SELECT * FROM users WHERE id = '${userId}'`);
  if (!user) {
  console.log('User not found');
  return null;
  }
  
  // Duplicated: Validation logic
  if (!productId || productId.length === 0) {
  console.log('Invalid product');
  return null;
  }
  
  // Mixed: Business logic with DB calls
  let order = dbConnection.query(`SELECT * FROM orders WHERE id = '${orderId}'`);
  if (!order) {
  return null;
  }
  
  if (order.userId !== userId) {
  console.log('Order does not belong to user');
  return null;
  }
  
  // Mixed: DB call for product
  let product = dbConnection.query(`SELECT * FROM products WHERE id = '${productId}'`);
  if (!product) {
  console.log('Product not found');
  return null;
  }
  
  // Duplicated: Validation logic
  if (quantity <= 0) {
  console.log('Invalid quantity');
  return null;
  }
  
  // Mixed: Business rules + DB calls
  let inventory = dbConnection.query(`SELECT * FROM inventory WHERE productId = '${productId}'`);
  if (inventory.quantity < quantity) {
  console.log('Insufficient inventory');
  return null;
  }
  
  // Duplicated: Validation logic (similar to earlier)
  if (!userId || userId.length === 0) {
  return null;
  }
  
  // Mixed: Price calculation + DB calls
  let pricing = dbConnection.query(`SELECT * FROM pricing WHERE productId = '${productId}'`);
  let totalPrice = pricing.price * quantity;
  
  if (user.creditLimit < totalPrice) {
  console.log('Insufficient credit');
  return null;
  }
  
  // Mixed: Business logic for discounts + DB calls
  let discounts = dbConnection.query(`SELECT * FROM discounts WHERE userId = '${userId}'`);
  let discountPercentage = 0;
  
  if (discounts && discounts.length > 0) {
  discountPercentage = discounts[0].percentage;
  }
  
  let discountedPrice = totalPrice * (1 - discountPercentage / 100);
  
  // Duplicated: Inventory check (similar check done earlier)
  let currentInventory = dbConnection.query(`SELECT * FROM inventory WHERE productId = '${productId}'`);
  if (currentInventory.quantity < quantity) {
  return null;
  }
  
  // Mixed: State updates + DB calls
  let newInventoryQuantity = inventory.quantity - quantity;
  dbConnection.query(`UPDATE inventory SET quantity = ${newInventoryQuantity} WHERE productId = '${productId}'`);
  
  // Mixed: Payment processing + DB calls
  let paymentRecord = {
  userId: userId,
  orderId: orderId,
  amount: discountedPrice,
  timestamp: new Date(),
  status: 'pending'
  };
  
  dbConnection.query(`INSERT INTO payments (userId, orderId, amount, timestamp, status) VALUES ('${paymentRecord.userId}', '${paymentRecord.orderId}', ${paymentRecord.amount}, '${paymentRecord.timestamp}', '${paymentRecord.status}')`);
  
  // Mixed: Order status update + DB calls
  dbConnection.query(`UPDATE orders SET status = 'processing' WHERE id = '${orderId}'`);
  
  // Duplicated: Another inventory check
  let checkInventory = dbConnection.query(`SELECT * FROM inventory WHERE productId = '${productId}'`);
  if (checkInventory.quantity < 0) {
  dbConnection.query(`UPDATE inventory SET quantity = 0 WHERE productId = '${productId}'`);
  }
  
  // Mixed: Logging + Business logic
  console.log(`Order ${orderId} processed for user ${userId}`);
  console.log(`Product ${productId} quantity decreased by ${quantity}`);
  console.log(`Total charged: ${discountedPrice}`);
  
  // Mixed: Notification logic + DB calls
  let notification = {
  userId: userId,
  message: `Your order ${orderId} has been processed`,
  timestamp: new Date(),
  read: false
  };
  
  dbConnection.query(`INSERT INTO notifications (userId, message, timestamp, read) VALUES ('${notification.userId}', '${notification.message}', '${notification.timestamp}', ${notification.read})`);
  
  // Duplicated: User validation (similar to start of function)
  if (!user || !user.id) {
  return null;
  }
  
  // Mixed: Return calculation mixed with more business logic
  let result = {
  orderId: orderId,
  userId: userId,
  productId: productId,
  quantity: quantity,
  originalPrice: totalPrice,
  discountApplied: discountPercentage,
  finalPrice: discountedPrice,
  inventoryRemaining: newInventoryQuantity,
  timestamp: new Date()
  };
  
  // Duplicated: Another DB insert for audit log with inline SQL
  dbConnection.query(`INSERT INTO audit_logs (userId, action, details, timestamp) VALUES ('${userId}', 'ORDER_PROCESSED', '${JSON.stringify(result)}', '${result.timestamp}')`);
  
  return result;
}

module.exports = { processUserOrderAndInventory };
