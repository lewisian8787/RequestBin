import express from "express";
import { loadConfig } from './config.js';
import { pool, initializeSchema, generateMasterToken } from './db/psql_schema.js'
import { mongoExecutor } from './db/mongo_schema.js';
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import { fileURLToPath } from 'url';
import http from "http";
import { Server } from "socket.io";

const { ObjectId } = mongoose.Types;

await loadConfig();
await mongoose.connect(process.env.MONGODB_URI!);

const app = express();
initializeSchema();

const generateEndpoint = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const len = chars.length;
  let output = "";
  for (let i = 0; i < 7; i++) {
    let char = chars[Math.floor(Math.random() * len)];
    output += char
  }
  return output;
}

app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.text({ type: 'text/*' }));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log("connected to frontend");
  socket.on("disconnect", () => {
    console.log("frontend disconnected");
  })
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/api/web/baskets', async (req, res) => {
  const masterToken = req.headers['master-token'];
  if (!masterToken) return res.status(204).send();
  try {
    const result = await pool.query(
      `SELECT b.*
      FROM baskets b
      JOIN master_tokens mt
      ON b.master_token_id = mt.id
      WHERE mt.token = $1`,
      [masterToken]
    );
    res.status(200).json(result.rows)
  } catch (err) {
    res.status(500).send('Error retrieving baskets.')
}});

app.get('/api/web', async (req, res) => {
  let newEndPoint = generateEndpoint();
  let attempts = 0;
  const MAX_ATTEMPTS = 5;
  try {
    while (attempts < MAX_ATTEMPTS) {
      let result = await pool.query(
        `SELECT * FROM BASKETS WHERE endpoint = $1`, [newEndPoint]
      );
      if (!result.rows.length) { break }
      newEndPoint = generateEndpoint();
      attempts++;
    }
    if (attempts === MAX_ATTEMPTS) { throw new Error }
    res.status(200).json({ newEndPoint })
  } catch (err) {
    return res.status(500).send('Failed to generate unique endpoint');
  }
});

app.post("/api/web/:endpoint", async (req, res) => {
  let masterToken = req.headers['master-token'];
  const newEndPoint = req.params.endpoint;
  let masterTokenId;
  try {
    if (!masterToken) {
      const newMasterTokenRow = await generateMasterToken();
      masterToken = newMasterTokenRow.token;
      masterTokenId = newMasterTokenRow.id;
    } else {
      const result = await pool.query(
        `SELECT id FROM master_tokens WHERE token = $1`, [masterToken]
      );
      masterTokenId = result.rows[0].id;
    }
  } catch (err) {
    return res.status(500).send(`Error resolving master token`);
  }
  try {
    await pool.query(
      `INSERT INTO baskets (endpoint, config_response, master_token_id)
      VALUES ($1, $2, $3);`, [newEndPoint, {}, masterTokenId]
    );
    res.status(200).json({ masterToken, newEndPoint });
  } catch (err) {
    res.status(500).send(`Error creating new basket`);
  }
});

app.get("/api/web/:endpoint", async (req, res) => {
  const endpoint = req.params.endpoint;
  try {
    const result = await pool.query(
      `SELECT r.*
      FROM baskets b
      LEFT JOIN requests r ON r.basket_id = b.id
      WHERE b.endpoint = $1
      ORDER BY r.id DESC;`,
      [endpoint]
    );
    if (!result.rows.length) { return res.status(404).send() }
    await Promise.all(result.rows.map(async (rowObj) => {
      if (rowObj.mongodb_id) {
        const mongoResult = await mongoExecutor.findById(rowObj.mongodb_id).lean();
        rowObj.mongoRequestBody = mongoResult;
      }
      return rowObj;
    }));
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Failed to interface with DB:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/api/web/:endpoint", async (req, res) => {
  const endpoint = req.params.endpoint;
  try {
    const requestsResult = await pool.query(
      `SELECT r.mongodb_id
       FROM requests r
       JOIN baskets b ON r.basket_id = b.id
       WHERE b.endpoint = $1`,
      [endpoint]
    );
    const mongoIds = requestsResult.rows
      .map(row => row.mongodb_id)
      .map(id => new ObjectId(id));
    await pool.query(`DELETE FROM baskets WHERE endpoint = $1`, [endpoint]);
    await mongoExecutor.deleteMany({ _id: { $in: mongoIds } });
    return res.status(204).send();
  } catch (err) {
    console.error('Error deleting basket:', err);
    return res.status(500).send('Error deleting basket');
  }
});

app.delete("/api/web/requests/:id", async (req, res) => {
  const requestId = req.params.id;
  try {
    const result = await pool.query(
      `DELETE FROM requests WHERE id = $1 RETURNING *`,
      [requestId]
    );
    const mongoId = result.rows[0].mongodb_id;
    if (mongoId) {
      await mongoExecutor.findByIdAndDelete(mongoId);
    }
    return res.status(204).send();
  } catch (err) {
    console.log(`either postgres or mongo delete function failed`, err);
    return res.status(500).send(`problem deleting request`);
  }
});

app.put("/api/web/:endpoint", async (req, res) => {
  const endpoint = req.params.endpoint;
  const newConfig = req.body;
  try {
    await pool.query(
      `UPDATE baskets
      SET config_response = $1
      WHERE endpoint = $2;`, [newConfig, endpoint]
    );
    return res.status(200).send();
  } catch (err) {
    console.log("update query failed", err);
    return res.status(500).send("problem updating basket")
  }
});

app.all('/:endpoint', async (req, res) => {
  const endpoint = req.params.endpoint;
  let mongoId;
  if (req.body) {
    try {
      const mongoDoc = await mongoExecutor.create({ requestPayload: req.body });
      mongoId = mongoDoc._id.toString();
    } catch (err) {
      return res.status(500).send('Error saving to Mongo database');
    }
  }
  try {
    const result = await pool.query(
      `INSERT INTO requests (basket_id, method, headers, request_date, request_time, mongodb_id)
      SELECT b.id, $1, $2, NOW(), NOW(), $3
      FROM baskets b
      WHERE endpoint = $4
      RETURNING *`,
      [req.method, req.headers, mongoId, endpoint]
    );
    if (!result.rows[0]) {
      return res.status(404).send('Basket not found');
    }
    io.emit("newRequest", { requestMetadata: result.rows[0], endpoint, body: req.body })
    res.status(200).send(`Request captured and emmited via socket.`)
  } catch (err) {
    console.error('Error sending metadata to PGdb:', err);
    return res.status(500).send('Error sending metadata to PGdb')
  }
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Running on port ${PORT}`)
})