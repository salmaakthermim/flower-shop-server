const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

// ======================
// MongoDB (Serverless Safe)
// ======================

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.z4bua.mongodb.net/FlowerDB?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let cachedDb = null;

async function connectDB() {
  if (cachedDb) return cachedDb;
  await client.connect();
  cachedDb = client.db("FlowerDB");
  return cachedDb;
}

// ======================
// ROOT
// ======================

app.get("/", (req, res) => {
  res.send("Flower Shop Server Running 🚀");
});

// ======================
// AUTH
// ======================

app.post("/register", async (req, res) => {
  const db = await connectDB();
  const usersCollection = db.collection("users");

  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Missing fields" });
  }

  const existing = await usersCollection.findOne({ email });
  if (existing) {
    return res.status(400).json({ message: "User already exists" });
  }

  const user = {
    name,
    email,
    password,
    role: role || "customer",
    createdAt: new Date(),
  };

  const result = await usersCollection.insertOne(user);

  const token = jwt.sign(
    { id: result.insertedId, role: user.role },
    process.env.JWT_SECRET || "secret_key",
    { expiresIn: "7d" }
  );

  res.json({ user, token });
});

// GOOGLE LOGIN
app.post("/google-login", async (req, res) => {
  const db = await connectDB();
  const usersCollection = db.collection("users");

  try {
    const { name, email, avatar } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email required" });
    }

    let user = await usersCollection.findOne({ email });

    if (!user) {
      const newUser = {
        name: name || "Google User",
        email,
        avatar: avatar || "",
        role: "customer",
        createdAt: new Date(),
      };

      const result = await usersCollection.insertOne(newUser);
      user = { ...newUser, _id: result.insertedId };
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET || "secret_key",
      { expiresIn: "30d" }
    );

    res.json({ user, token });

  } catch (err) {
    res.status(500).json({ message: "Google login failed" });
  }
});

app.post("/login", async (req, res) => {
  const db = await connectDB();
  const usersCollection = db.collection("users");

  const { email, password } = req.body;

  const user = await usersCollection.findOne({ email, password });

  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET || "secret_key",
    { expiresIn: "30d" }
  );

  res.json({ user, token });
});

// ======================
// FLOWERS CRUD
// ======================

app.post("/flowers", async (req, res) => {
  const db = await connectDB();
  const flowersCollection = db.collection("flowers");

  const { name, price, image, description, category, occasion } = req.body;

  if (!name || !price || !image) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const flower = {
    name,
    price: Number(price),
    image,
    description: description || "",
    category: category || "",
    occasion: occasion || "",
    createdAt: new Date(),
  };

  const result = await flowersCollection.insertOne(flower);

  res.status(201).json({
    message: "Flower added successfully 🌸",
    flower: { ...flower, _id: result.insertedId },
  });
});

app.get("/flowers", async (req, res) => {
  const db = await connectDB();
  const flowersCollection = db.collection("flowers");

  const flowers = await flowersCollection
    .find({})
    .sort({ createdAt: -1 })
    .toArray();

  res.json(flowers);
});

app.get("/flowers/:id", async (req, res) => {
  const db = await connectDB();
  const flowersCollection = db.collection("flowers");

  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid ID" });
  }

  const flower = await flowersCollection.findOne({
    _id: new ObjectId(id),
  });

  if (!flower) {
    return res.status(404).json({ message: "Flower not found" });
  }

  res.json(flower);
});

app.put("/flowers/:id", async (req, res) => {
  const db = await connectDB();
  const flowersCollection = db.collection("flowers");

  const { id } = req.params;
  const { name, price, image, description } = req.body;

  await flowersCollection.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        name,
        price: Number(price),
        image,
        description,
      },
    }
  );

  res.json({ message: "Flower updated 🌼" });
});

app.delete("/flowers/:id", async (req, res) => {
  const db = await connectDB();
  const flowersCollection = db.collection("flowers");

  const { id } = req.params;

  await flowersCollection.deleteOne({ _id: new ObjectId(id) });

  res.json({ message: "Flower deleted 🗑️" });
});

// ======================
// ORDERS
// ======================

app.post("/orders", async (req, res) => {
  const db = await connectDB();
  const ordersCollection = db.collection("orders");

  const { name, email, phone, items, total, address, note } = req.body;

  if (!name || !email || !phone || !Array.isArray(items)) {
    return res.status(400).json({ message: "Invalid order data" });
  }

  // estimated delivery = 3 days from now
  const estimated = new Date();
  estimated.setDate(estimated.getDate() + 3);

  const order = {
    orderId: "ORD-" + Date.now(),
    customer: { name, email, phone },
    deliveryAddress: address || "",
    deliveryNote: note || "",
    estimatedDelivery: estimated,
    products: items,
    totalPrice: Number(total),
    orderStatus: "pending",
    createdAt: new Date(),
  };

  const result = await ordersCollection.insertOne(order);

  res.json({ message: "Order placed 🎉", order: { ...order, _id: result.insertedId } });
});

app.get("/orders/:id", async (req, res) => {
  const db = await connectDB();
  const ordersCollection = db.collection("orders");

  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid order ID" });
  }

  const order = await ordersCollection.findOne({ _id: new ObjectId(id) });

  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }

  res.json(order);
});

app.get("/my-orders", async (req, res) => {
  const db = await connectDB();
  const ordersCollection = db.collection("orders");

  const email = req.query.email;

  const orders = await ordersCollection
    .find({ "customer.email": email })
    .sort({ createdAt: -1 })
    .toArray();

  res.json(orders);
});

// ======================
// CART
// ======================

app.post("/cart", async (req, res) => {
  const db = await connectDB();
  const cartsCollection = db.collection("carts");

  const { email, productId, name, price, image, quantity } = req.body;

  const existing = await cartsCollection.findOne({ email, productId });

  if (existing) {
    await cartsCollection.updateOne(
      { _id: existing._id },
      { $inc: { quantity: 1 } }
    );
    return res.json({ message: "Quantity updated" });
  }

  await cartsCollection.insertOne({
    email,
    productId,
    name,
    price: Number(price),
    image,
    quantity: quantity || 1,
    createdAt: new Date(),
  });

  res.json({ message: "Added to cart 🛒" });
});

app.get("/cart/:email", async (req, res) => {
  const db = await connectDB();
  const cartsCollection = db.collection("carts");

  const items = await cartsCollection
    .find({ email: req.params.email })
    .toArray();

  res.json(items);
});

app.patch("/cart/:id", async (req, res) => {
  const db = await connectDB();
  const cartsCollection = db.collection("carts");

  const { id } = req.params;
  const { quantity } = req.body;

  await cartsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { quantity: Number(quantity) } }
  );

  res.json({ message: "Cart updated" });
});

app.delete("/cart/clear/:email", async (req, res) => {
  const db = await connectDB();
  const cartsCollection = db.collection("carts");

  await cartsCollection.deleteMany({ email: req.params.email });
  res.json({ message: "Cart cleared" });
});

app.delete("/cart/:id", async (req, res) => {
  const db = await connectDB();
  const cartsCollection = db.collection("carts");

  await cartsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
  res.json({ message: "Item removed" });
});

// ======================
// USERS
// ======================

app.get("/users", async (req, res) => {
  const db = await connectDB();
  const usersCollection = db.collection("users");
  const users = await usersCollection.find({}).toArray();
  res.json(users);
});

app.patch("/users/role/:id", async (req, res) => {
  const db = await connectDB();
  const usersCollection = db.collection("users");
  const { role } = req.body;
  await usersCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { role } }
  );
  res.json({ message: "Role updated" });
});

app.patch("/users/status/:id", async (req, res) => {
  const db = await connectDB();
  const usersCollection = db.collection("users");
  const { status } = req.body;
  await usersCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { status } }
  );
  res.json({ message: "Status updated" });
});

app.delete("/users/:id", async (req, res) => {
  const db = await connectDB();
  const usersCollection = db.collection("users");
  await usersCollection.deleteOne({ _id: new ObjectId(req.params.id) });
  res.json({ message: "User deleted" });
});

// ======================
// ORDERS EXTRA ROUTES
// ======================

app.get("/orders", async (req, res) => {
  const db = await connectDB();
  const ordersCollection = db.collection("orders");
  const orders = await ordersCollection.find({}).sort({ createdAt: -1 }).toArray();
  res.json(orders);
});

app.get("/orders/customer/:email", async (req, res) => {
  const db = await connectDB();
  const ordersCollection = db.collection("orders");
  const orders = await ordersCollection
    .find({ "customer.email": req.params.email })
    .sort({ createdAt: -1 })
    .toArray();
  res.json(orders);
});

app.patch("/orders/:id/status", async (req, res) => {
  const db = await connectDB();
  const ordersCollection = db.collection("orders");
  const { orderStatus } = req.body;
  const update = { orderStatus };
  if (orderStatus === "delivered") update.deliveredAt = new Date();
  await ordersCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: update }
  );
  res.json({ message: "Order status updated" });
});

app.patch("/orders/:id/delivery", async (req, res) => {
  const db = await connectDB();
  const ordersCollection = db.collection("orders");
  const { deliveryAddress, deliveryNote, estimatedDelivery } = req.body;
  await ordersCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { deliveryAddress, deliveryNote, estimatedDelivery: new Date(estimatedDelivery) } }
  );
  res.json({ message: "Delivery info updated" });
});

app.delete("/orders/:id", async (req, res) => {
  const db = await connectDB();
  const ordersCollection = db.collection("orders");
  await ordersCollection.deleteOne({ _id: new ObjectId(req.params.id) });
  res.json({ message: "Order deleted" });
});

// ======================
// EXPORT FOR VERCEL / LOCAL
// ======================

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🌸 Flower Shop Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;


