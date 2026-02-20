// orderService.js
export class OrderService {
  constructor(db, paymentService, emailService, inventoryService) {
    this.db = db;
    this.paymentService = paymentService;
    this.emailService = emailService;
    this.inventoryService = inventoryService;
  }

  processOrdersAndUpdateInventory() {
    const orders = this.db.query(
      'SELECT * FROM orders WHERE status = "pending"',
    );
    const stats = { processedOrders: 0, failedOrders: 0, totalRevenue: 0 };

    for (const order of orders) {
      const customer = this.db.query("SELECT * FROM customers WHERE id = ?", [
        order.customerId,
      ]);
      this.processOrder(order, customer, stats);
    }

    this.logSummary(stats);
    return stats;
  }

  processOrder(order, customer, stats) {
    const orderCalculator = new OrderCalculator(order, customer);
    const orderTotal = orderCalculator.calculateTotal();

    if (!this.inventoryService.checkAvailability(order.items)) {
      this.db.query('UPDATE orders SET status = "failed" WHERE id = ?', [
        order.id,
      ]);
      stats.failedOrders++;
      return;
    }

    this.inventoryService.reserveItems(order.items);

    const paymentResult = this.paymentService.process(
      customer.paymentMethod,
      orderTotal,
    );
    if (!paymentResult.success) {
      this.inventoryService.releaseItems(order.items);
      this.db.query(
        'UPDATE orders SET status = "payment_failed" WHERE id = ?',
        [order.id],
      );
      stats.failedOrders++;
      return;
    }

    this.completeOrder(order, customer, orderTotal, stats);
  }

  completeOrder(order, customer, orderTotal, stats) {
    this.db.query(
      'UPDATE orders SET status = "processed", totalAmount = ? WHERE id = ?',
      [orderTotal, order.id],
    );

    this.emailService.sendConfirmation(
      customer.email,
      order.id,
      orderTotal,
      customer.name,
    );
    this.updateCustomerLoyalty(customer, orderTotal);
    this.logTransaction(order, orderTotal);

    stats.totalRevenue += orderTotal;
    stats.processedOrders++;
  }

  updateCustomerLoyalty(customer, orderTotal) {
    const pointsEarned = Math.floor(orderTotal / 10);
    this.db.query(
      "UPDATE customers SET loyaltyPoints = loyaltyPoints + ? WHERE id = ?",
      [pointsEarned, customer.id],
    );

    if (customer.totalSpent + orderTotal > 1000) {
      this.db.query(
        'UPDATE customers SET membershipLevel = "gold" WHERE id = ?',
        [customer.id],
      );
      this.db.query(
        "INSERT INTO promotions (customerId, promotionCode, discountPercent) VALUES (?, ?, ?)",
        [customer.id, "GOLD" + customer.id, 15],
      );
    }

    this.db.query(
      "UPDATE customers SET totalOrders = totalOrders + 1, totalSpent = totalSpent + ? WHERE id = ?",
      [orderTotal, customer.id],
    );
  }

  logTransaction(order, orderTotal) {
    const invoiceNumber = "INV-" + order.id + "-" + Date.now();
    this.db.query(
      "INSERT INTO transactionLog (orderId, amount, timestamp, status) VALUES (?, ?, ?, ?)",
      [order.id, orderTotal, new Date(), "completed"],
    );
    this.db.query(
      "INSERT INTO invoices (orderId, invoiceNumber, amount, issuedDate) VALUES (?, ?, ?, ?)",
      [order.id, invoiceNumber, orderTotal, new Date()],
    );
  }

  logSummary(stats) {
    console.log(`Processed: ${stats.processedOrders} orders`);
    console.log(`Failed: ${stats.failedOrders} orders`);
    console.log(`Total Revenue: $${stats.totalRevenue}`);
  }
}

// orderCalculator.js
export class OrderCalculator {
  constructor(order, customer) {
    this.order = order;
    this.customer = customer;
    this.taxRate = 0.08;
  }

  calculateTotal() {
    let total = this.calculateItemsTotal();
    total = this.applyMembershipDiscount(total);
    total = this.addTax(total);
    return total;
  }

  calculateItemsTotal() {
    return this.order.items.reduce((sum, item) => {
      const price = item.quantity > 10 ? item.price * 0.9 : item.price;
      return sum + price * item.quantity;
    }, 0);
  }

  applyMembershipDiscount(total) {
    return this.customer.membershipLevel === "gold" ? total * 0.95 : total;
  }

  addTax(total) {
    return total + total * this.taxRate;
  }
}

// inventoryService.js
export class InventoryService {
  constructor(db) {
    this.db = db;
  }

  checkAvailability(items) {
    return items.every((item) => {
      const inventory = this.db.query(
        "SELECT quantity FROM inventory WHERE productId = ?",
        [item.productId],
      );
      return inventory[0].quantity >= item.quantity;
    });
  }

  reserveItems(items) {
    items.forEach((item) => {
      this.db.query(
        "UPDATE inventory SET quantity = quantity - ? WHERE productId = ?",
        [item.quantity, item.productId],
      );
    });
  }

  releaseItems(items) {
    items.forEach((item) => {
      this.db.query(
        "UPDATE inventory SET quantity = quantity + ? WHERE productId = ?",
        [item.quantity, item.productId],
      );
    });
  }
}

// paymentService.js
export class PaymentService {
  process(paymentMethod, amount) {
    return { success: true };
  }
}

// emailService.js
export class EmailService {
  constructor(db) {
    this.db = db;
  }

  sendConfirmation(email, orderId, orderTotal, customerName) {
    const emailTemplate = this.db.query(
      'SELECT template FROM emailTemplates WHERE name = "order_confirmation"',
    );
    let body = emailTemplate[0].template;
    body = body.replace("{{orderId}}", orderId);
    body = body.replace("{{total}}", orderTotal);
    body = body.replace("{{customerName}}", customerName);

    this.sendEmail(email, "Order Confirmation", body);
  }

  sendEmail(to, subject, body) {
    console.log(`Email sent to: ${to}`);
  }
}
