import { PrismaClient } from "@prisma/client";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { WebSocket } from 'ws';
import { WebSocketServer } from 'ws'; 
import axios from "axios";
import bodyParser from "body-parser";
import AiRoute from "./routes/AiRoute.js";
import UserRoute from "./routes/UserRoute.js";


const prisma = new PrismaClient();
dotenv.config();
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Middleware untuk parsing JSON
app.use(express.json());

// WebSocket Server
const wss = new WebSocketServer({ port: 8080 });

// WebSocket connections storage
const clients = new Set();

wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('New WebSocket connection');

    ws.on('message', (message) => {
        console.log('Received:', message);
        // Broadcast the message to all connected clients
        clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(`Broadcast: ${message}`);
            }
        });
    });

    ws.on('close', () => {
        clients.delete(ws);
        console.log('WebSocket connection closed');
    });
});

app.use(cors({ origin: "*", credentials: true }));
app.use(cors({ origin: "*", optionsSuccessStatus: 200 }));
// Izinkan semua domain untuk sementara (debugging)
app.use(cors());
app.use(AiRoute);
app.use(UserRoute);
app.use((req, res, next) => {
    // res.setHeader("Access-Control-Allow-Origin", "http://inventoryfkep-46301.portmap.io:46301");
    res.setHeader("Access-Control-Allow-Origin", "https://frontend-health-helper.vercel.app/");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    next();
  });


// Middleware untuk parsing URL-encoded data
//app.use(express.urlencoded({ extended: true }));


export const PORT = process.env.PORT;

export default app;

app.listen(PORT, () => console.log(`Server up and running ${PORT}`));
