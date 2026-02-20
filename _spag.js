// ==========================
// Repositories
// ==========================

class OrderRepository {
  constructor(db) {
    this.db = db;
  }

  getPendingOrders() {
    return this.db.query('SELECT * FROM orders WHERE status = "pending"');
  }

  markFailed(orderId) {
    this.db.query('UPDATE orders SET status = "failed" WHERE id = ?', [
      orderId,
    ]);
  }

  markPaymentFailed(orderId) {
    this.db.query('UPDATE orders SET status = "payment_failed" WHERE id = ?', [
      orderId,
    ]);
  }

  markProcessed(orderId, total) {
    this.db.query(
      'UPDATE orders SET status = "processed", totalAmount = ? WHERE id = ?',
      [total, orderId],
    );
  }
}

class CustomerRepository {
  constructor(db) {
    this.db = db;
  }

  getById(id) {
    return this.db.query("SELECT * FROM customers WHERE id = ?", [id]);
  }

  updateStats(customerId, total) {
    this.db.query(
      "UPDATE customers SET totalOrders = totalOrders + 1, totalSpent = totalSpent + ? WHERE id = ?",
      [total, customerId],
    );
  }

  addLoyaltyPoints(customerId, points) {
    this.db.query(
      "UPDATE customers SET loyaltyPoints = loyaltyPoints + ? WHERE id = ?",
      [points, customerId],
    );
  }

  upgradeToGold(customerId) {
    this.db.query(
      'UPDATE customers SET membershipLevel = "gold" WHERE id = ?',
      [customerId],
    );
  }
}

class InventoryRepository {
  constructor(db) {
    this.db = db;
  }

  getQuantity(productId) {
    return this.db.query("SELECT quantity FROM inventory WHERE productId = ?", [
      productId,
    ])[0].quantity;
  }

  decrease(productId, qty) {
    this.db.query(
      "UPDATE inventory SET quantity = quantity - ? WHERE productId = ?",
      [qty, productId],
    );
  }

  increase(productId, qty) {
    this.db.query(
      "UPDATE inventory SET quantity = quantity + ? WHERE productId = ?",
      [qty, productId],
    );
  }
}

class TemplateRepository {
  constructor(db) {
    this.db = db;
  }

  getTemplate(name) {
    return this.db.query("SELECT template FROM emailTemplates WHERE name = ?", [
      name,
    ])[0].template;
  }
}

// ==========================
// Domain Services
// ==========================

class OrderCalculator {
  constructor(taxRate = 0.08) {
    this.taxRate = taxRate;
  }

  calculate(order, customer) {
    const subtotal = this.calculateSubtotal(order.items);
    const discounted = this.applyMembershipDiscount(subtotal, customer);
    return this.applyTax(discounted);
  }

  calculateSubtotal(items) {
    return items.reduce((total, item) => {
      const price = item.quantity > 10 ? item.price * 0.9 : item.price;
      return total + price * item.quantity;
    }, 0);
  }

  applyMembershipDiscount(amount, customer) {
    if (customer.membershipLevel === "gold") {
      return amount * 0.95;
    }
    return amount;
  }

  applyTax(amount) {
    return amount + amount * this.taxRate;
  }
}

class InventoryService {
  constructor(inventoryRepo) {
    this.inventoryRepo = inventoryRepo;
  }

  isAvailable(items) {
    return items.every(
      (item) => this.inventoryRepo.getQuantity(item.productId) >= item.quantity,
    );
  }

  decrease(items) {
    items.forEach((item) =>
      this.inventoryRepo.decrease(item.productId, item.quantity),
    );
  }

  restore(items) {
    items.forEach((item) =>
      this.inventoryRepo.increase(item.productId, item.quantity),
    );
  }
}

class PaymentService {
  process(paymentMethod, amount) {
    return { success: true }; // mockable
  }
}

class EmailService {
  send(to, subject, body) {
    console.log(`Email sent to: ${to}`);
  }
}

class PromotionService {
  constructor(db, customerRepo) {
    this.db = db;
    this.customerRepo = customerRepo;
  }

  evaluate(customer, orderTotal) {
    if (customer.totalSpent + orderTotal <= 1000) return;

    this.customerRepo.upgradeToGold(customer.id);

    this.db.query(
      "INSERT INTO promotions (customerId, promotionCode, discountPercent) VALUES (?, ?, ?)",
      [customer.id, "GOLD" + customer.id, 15],
    );
  }
}

class TransactionService {
  constructor(db) {
    this.db = db;
  }

  log(orderId, amount, status, clock) {
    this.db.query(
      "INSERT INTO transactionLog (orderId, amount, timestamp, status) VALUES (?, ?, ?, ?)",
      [orderId, amount, clock.now(), status],
    );
  }
}

class InvoiceService {
  constructor(db) {
    this.db = db;
  }

  generate(orderId, amount, clock) {
    const invoiceNumber = `INV-${orderId}-${clock.now().getTime()}`;

    this.db.query(
      "INSERT INTO invoices (orderId, invoiceNumber, amount, issuedDate) VALUES (?, ?, ?, ?)",
      [orderId, invoiceNumber, amount, clock.now()],
    );
  }
}
// ==========================
// Orchestrator
// ==========================

class OrderProcessingService {
  constructor({
    orderRepo,
    customerRepo,
    inventoryService,
    calculator,
    paymentService,
    emailService,
    templateRepo,
    promotionService,
    transactionService,
    invoiceService,
    clock,
    logger,
  }) {
    Object.assign(this, arguments[0]);
  }

  processAll() {
    const orders = this.orderRepo.getPendingOrders();
    const summary = { processed: 0, failed: 0, revenue: 0 };

    orders.forEach((order) => {
      const result = this.processSingle(order);
      summary[result]++;
      if (result === "processed") {
        summary.revenue += result.total || 0;
      }
    });

    this.logger.info(summary);
    return summary;
  }

  processSingle(order) {
    const customer = this.customerRepo.getById(order.customerId);
    const total = this.calculator.calculate(order, customer);

    if (!this.inventoryService.isAvailable(order.items)) {
      this.orderRepo.markFailed(order.id);
      return "failed";
    }

    this.inventoryService.decrease(order.items);

    const payment = this.paymentService.process(customer.paymentMethod, total);
    if (!payment.success) {
      this.inventoryService.restore(order.items);
      this.orderRepo.markPaymentFailed(order.id);
      return "failed";
    }

    this.completeOrder(order, customer, total);
    return { processed: true, total };
  }

  completeOrder(order, customer, total) {
    this.orderRepo.markProcessed(order.id, total);
    this.customerRepo.updateStats(customer.id, total);

    const points = Math.floor(total / 10);
    this.customerRepo.addLoyaltyPoints(customer.id, points);

    this.promotionService.evaluate(customer, total);
    this.transactionService.log(order.id, total, "completed", this.clock);
    this.invoiceService.generate(order.id, total, this.clock);

    this.sendConfirmation(order, customer, total);
  }

  sendConfirmation(order, customer, total) {
    const template = this.templateRepo.getTemplate("order_confirmation");
    const body = template
      .replace("{{orderId}}", order.id)
      .replace("{{total}}", total)
      .replace("{{customerName}}", customer.name);

    this.emailService.send(customer.email, "Order Confirmation", body);
  }
}
