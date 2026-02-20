// validators.js
class UserValidator {
  validate(userId) {
    if (!userId || userId.length === 0) {
      throw new Error("Invalid user");
    }
  }
}

class OrderValidator {
  validate(orderId) {
    if (!orderId || orderId.length === 0) {
      throw new Error("Invalid order");
    }
  }
}

class ProductValidator {
  validate(productId, quantity) {
    if (!productId || productId.length === 0) {
      throw new Error("Invalid product");
    }
    if (quantity <= 0) {
      throw new Error("Invalid quantity");
    }
  }
}

// repositories.js
class UserRepository {
  constructor(dbConnection) {
    this.db = dbConnection;
  }

  findById(userId) {
    const user = this.db.query("SELECT * FROM users WHERE id = ?", [userId]);
    if (!user) throw new Error("User not found");
    return user;
  }
}

class OrderRepository {
  constructor(dbConnection) {
    this.db = dbConnection;
  }

  findById(orderId) {
    const order = this.db.query("SELECT * FROM orders WHERE id = ?", [orderId]);
    if (!order) throw new Error("Order not found");
    return order;
  }

  updateStatus(orderId, status) {
    this.db.query("UPDATE orders SET status = ? WHERE id = ?", [
      status,
      orderId,
    ]);
  }
}

class InventoryRepository {
  constructor(dbConnection) {
    this.db = dbConnection;
  }

  getByProductId(productId) {
    return this.db.query("SELECT * FROM inventory WHERE productId = ?", [
      productId,
    ]);
  }

  updateQuantity(productId, quantity) {
    this.db.query("UPDATE inventory SET quantity = ? WHERE productId = ?", [
      quantity,
      productId,
    ]);
  }
}

class PricingRepository {
  constructor(dbConnection) {
    this.db = dbConnection;
  }

  getByProductId(productId) {
    return this.db.query("SELECT * FROM pricing WHERE productId = ?", [
      productId,
    ]);
  }
}

class DiscountRepository {
  constructor(dbConnection) {
    this.db = dbConnection;
  }

  findByUserId(userId) {
    return this.db.query("SELECT * FROM discounts WHERE userId = ?", [userId]);
  }
}

// services.js
class PricingService {
  constructor(pricingRepo, discountRepo) {
    this.pricingRepo = pricingRepo;
    this.discountRepo = discountRepo;
  }

  calculatePrice(productId, quantity, userId) {
    const pricing = this.pricingRepo.getByProductId(productId);
    const totalPrice = pricing.price * quantity;

    const discounts = this.discountRepo.findByUserId(userId) || [];
    const discountPercentage =
      discounts.length > 0 ? discounts[0].percentage : 0;

    return {
      originalPrice: totalPrice,
      discountPercentage,
      finalPrice: totalPrice * (1 - discountPercentage / 100),
    };
  }
}

class InventoryService {
  constructor(inventoryRepo) {
    this.inventoryRepo = inventoryRepo;
  }

  validateStock(productId, quantity) {
    const inventory = this.inventoryRepo.getByProductId(productId);
    if (inventory.quantity < quantity) {
      throw new Error("Insufficient inventory");
    }
  }

  decreaseStock(productId, quantity) {
    const inventory = this.inventoryRepo.getByProductId(productId);
    const newQuantity = Math.max(0, inventory.quantity - quantity);
    this.inventoryRepo.updateQuantity(productId, newQuantity);
    return newQuantity;
  }
}

class OrderProcessingService {
  constructor(
    userRepo,
    orderRepo,
    inventoryService,
    pricingService,
    auditRepo,
    notificationRepo,
  ) {
    this.userRepo = userRepo;
    this.orderRepo = orderRepo;
    this.inventoryService = inventoryService;
    this.pricingService = pricingService;
    this.auditRepo = auditRepo;
    this.notificationRepo = notificationRepo;
  }

  processOrder(userId, orderId, productId, quantity) {
    const user = this.userRepo.findById(userId);
    const order = this.orderRepo.findById(orderId);

    if (order.userId !== userId) {
      throw new Error("Order does not belong to user");
    }

    this.inventoryService.validateStock(productId, quantity);

    const pricing = this.pricingService.calculatePrice(
      productId,
      quantity,
      userId,
    );

    if (user.creditLimit < pricing.finalPrice) {
      throw new Error("Insufficient credit");
    }

    const inventoryRemaining = this.inventoryService.decreaseStock(
      productId,
      quantity,
    );
    this.orderRepo.updateStatus(orderId, "processing");

    const result = {
      orderId,
      userId,
      productId,
      quantity,
      originalPrice: pricing.originalPrice,
      discountApplied: pricing.discountPercentage,
      finalPrice: pricing.finalPrice,
      inventoryRemaining,
      timestamp: new Date(),
    };

    this.auditRepo.log(userId, "ORDER_PROCESSED", result);
    this.notificationRepo.notify(
      userId,
      `Your order ${orderId} has been processed`,
    );

    return result;
  }
}

// Export services
module.exports = {
  UserValidator,
  OrderValidator,
  ProductValidator,
  UserRepository,
  OrderRepository,
  InventoryRepository,
  PricingRepository,
  DiscountRepository,
  PricingService,
  InventoryService,
  OrderProcessingService,
};
