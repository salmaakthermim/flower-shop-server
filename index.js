const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.z4bua.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const db = client.db("FlowerDB");
    const usersCollection = db.collection("users");
    const flowersCollection = db.collection("flowers");
    const ordersCollection = db.collection("orders");
    const cartsCollection = db.collection("carts");


    // ======================
    // AUTH
    // ======================
    app.post("/register", async (req, res) => {
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
        password, // TODO: Hash later
        role: role || "customer",
      };

      const result = await usersCollection.insertOne(user);

      const token = jwt.sign(
        { id: result.insertedId, role: user.role },
        process.env.JWT_SECRET || "secret_key",
        { expiresIn: "7d" }
      );

      res.json({ user, token });
    });

    app.post("/login", async (req, res) => {
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
      const { name, price, image, description } = req.body;

      if (!name || !price || !image) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const flower = {
        name,
        price: Number(price),
        image,
        description: description || "",
        createdAt: new Date(),
      };

      const result = await flowersCollection.insertOne(flower);
      res.status(201).json({
        message: "Flower added successfully 🌸",
        flower: { ...flower, _id: result.insertedId },
      });
    });

    app.get("/flowers", async (req, res) => {
      const flowers = await flowersCollection.find({}).sort({ createdAt: -1 }).toArray();
      res.json(flowers);
    });

    app.get("/flowers/:id", async (req, res) => {
      const { id } = req.params;

      const flower = await flowersCollection.findOne({ _id: new ObjectId(id) });
      if (!flower) return res.status(404).json({ message: "Flower not found" });

      res.json(flower);
    });

    app.put("/flowers/:id", async (req, res) => {
      const { id } = req.params;
      const { name, price, image, description } = req.body;

      const updateDoc = {
        $set: { name, price: Number(price), image, description },
      };

      const result = await flowersCollection.updateOne({ _id: new ObjectId(id) }, updateDoc);
      if (result.modifiedCount === 0) return res.status(400).json({ message: "No changes made" });

      res.json({ message: "Flower updated successfully 🌼" });
    });

    app.delete("/flowers/:id", async (req, res) => {
      const { id } = req.params;

      const result = await flowersCollection.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount === 0) return res.status(404).json({ message: "Flower not found" });

      res.json({ message: "Flower deleted successfully 🗑️" });
    });

    // ======================
    // ORDERS CRUD
    // ======================
    // ======================
    // ORDERS CRUD (FRONTEND COMPATIBLE)
    // ======================
    app.post("/orders", async (req, res) => {
      console.log("ORDER BODY 👉", req.body); // 🔥 DEBUG
    
      const { name, email, comment, phone, items, total } = req.body;
    
      // 🔒 Strong validation
      if (
        !name ||
        !email ||
        !phone ||
        !Array.isArray(items) ||
        items.length === 0
      ) {
        return res.status(400).json({
          message: "Invalid order data (missing fields)",
        });
      }
      
    
      // 🧠 Normalize items (qty fallback)
      const products = items.map((item) => ({
        productId: item._id,
        name: item.name,
        price: Number(item.price),
        quantity: Number(item.qty || 1), // ✅ FIX HERE
        image: item.image,
      }));
    
      const order = {
        orderId: "ORD-" + Date.now(),
        customer: { name, email, phone },
        comment: comment || "",   // ✅ ADD THIS
        products,
        totalPrice: Number(total),
        paymentMethod: "COD",
        paymentStatus: "unpaid",
        orderStatus: "pending",
        createdAt: new Date(),
      };
      
    
      const result = await ordersCollection.insertOne(order);
    
      res.status(201).json({
        message: "Order placed successfully 🌸",
        order: { ...order, _id: result.insertedId },
      });
    });
    
    


    app.get("/orders", async (req, res) => {
      const orders = await ordersCollection.find({}).sort({ createdAt: -1 }).toArray();
      res.json(orders);
    });

    app.get("/orders/:id", async (req, res) => {
      try {
        const { id } = req.params;

        // ✅ Check if id is a valid ObjectId
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid order ID" });
        }

        const order = await ordersCollection.findOne({ _id: new ObjectId(id) });

        if (!order) {
          return res.status(404).json({ message: "Order not found" });
        }

        res.json(order);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
      }
    });


    app.patch("/orders/:id/status", async (req, res) => {
      const { id } = req.params;
      const { orderStatus } = req.body;

      const result = await ordersCollection.updateOne({ _id: new ObjectId(id) }, { $set: { orderStatus } });
      if (result.modifiedCount === 0) return res.status(400).json({ message: "Status not updated" });

      res.json({ message: "Order status updated ✅" });
    });

    app.delete("/orders/:id", async (req, res) => {
      const { id } = req.params;

      const result = await ordersCollection.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount === 0) return res.status(404).json({ message: "Order not found" });

      res.json({ message: "Order deleted 🗑️" });
    });


    // GET: My Orders (Customer)
    app.get("/my-orders", async (req, res) => {
      try {
        const email = req.query.email;

        if (!email) {
          return res.status(400).send({ message: "Email required" });
        }

        const orders = await ordersCollection
          .find({ customerEmail: email })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(orders);
      } catch (error) {
        res.status(500).send({ message: "Failed to load orders" });
      }
    });

    // 📦 GET ORDERS BY CUSTOMER EMAIL
    app.get("/orders/customer/:email", async (req, res) => {
      const email = req.params.email;

      const orders = await ordersCollection
        .find({ "customer.email": email })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(orders);
    });


    app.post("/cart", async (req, res) => {
      console.log("Cart Body:", req.body);
      const { email, productId, name, price, image, quantity } = req.body;
    
      if (!email || !productId) {
        return res.status(400).json({ message: "Missing cart data" });
      }
    
      const existingItem = await cartsCollection.findOne({
        email,
        productId,
      });
    
      if (existingItem) {
        await cartsCollection.updateOne(
          { _id: existingItem._id },
          { $inc: { quantity: 1 } }
        );
        return res.json({ message: "Quantity updated" });
      }
    
      const cartItem = {
        email,
        productId,
        name,
        price: Number(price),
        image,
        quantity: quantity || 1,
        createdAt: new Date(),
      };
    
      await cartsCollection.insertOne(cartItem);
      res.status(201).json({ message: "Added to cart 🛒" });
    });


    app.delete("/cart/clear/:email", async (req, res) => {
      const email = req.params.email;
      await cartsCollection.deleteMany({ email });
      res.send({ message: "Cart cleared" });
    });
    
    
    app.get("/cart/:email", async (req, res) => {
      const email = req.params.email;
    
      const items = await cartsCollection
        .find({ email })
        .sort({ createdAt: -1 })
        .toArray();
    
      res.json(items);
    });

    
    app.patch("/cart/:id", async (req, res) => {
      const { id } = req.params;
      const { quantity } = req.body;
    
      await cartsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { quantity } }
      );
    
      res.json({ message: "Cart updated" });
    });

    
    app.delete("/cart/:id", async (req, res) => {
      const { id } = req.params;
    
      await cartsCollection.deleteOne({ _id: new ObjectId(id) });
    
      res.json({ message: "Item removed from cart" });
    });

    
    app.post("/checkout", async (req, res) => {
      const { email, name, phone } = req.body;
    
      const cartItems = await cartsCollection.find({ email }).toArray();
    
      if (!cartItems.length) {
        return res.status(400).json({ message: "Cart is empty" });
      }
    
      const order = {
        orderId: "ORD-" + Date.now(),
        customer: { email, name, phone },
        products: cartItems,
        totalPrice: cartItems.reduce(
          (acc, item) => acc + item.price * item.quantity,
          0
        ),
        orderStatus: "pending",
        createdAt: new Date(),
      };
    
      await ordersCollection.insertOne(order);
    
      await cartsCollection.deleteMany({ email });
    
      res.json({ message: "Order placed successfully 🎉" });
    });
    



    // ======================
    // USERS (ADMIN)
    // ======================
    app.get("/users", async (req, res) => {
      const users = await usersCollection.find({}).toArray();
      res.json(users);
    });

    app.patch("/users/role/:id", async (req, res) => {
      const { id } = req.params;
      const { role } = req.body;

      await usersCollection.updateOne({ _id: new ObjectId(id) }, { $set: { role } });
      res.json({ message: "Role updated successfully" });
    });

    app.patch("/users/status/:id", async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;

      await usersCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status } });
      res.json({ message: "User status updated" });
    });

    app.delete("/users/:id", async (req, res) => {
      const { id } = req.params;
      await usersCollection.deleteOne({ _id: new ObjectId(id) });
      res.json({ message: "User deleted" });
    });

    // ======================
    // DASHBOARD DEMO ROUTES
    // ======================
    app.get("/dashboard/admin", (req, res) => res.send({ message: "Welcome to Admin Dashboard 👑" }));
    app.get("/dashboard/customer", (req, res) => res.send({ message: "Welcome to Customer Dashboard 🧍" }));
  } finally {
    // keep client open during dev
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Flower Shop Server Running 🚀");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
